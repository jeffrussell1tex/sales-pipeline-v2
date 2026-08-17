# ACCELEREP — Current State
**Updated:** August 17, 2026  
**Batch:** **the CSV overwrite was still destroying data — server-side** (`sanitize()` is a builder, not a filter; the previous fix was caller-side and 18b13 said so) · **the importer now reports what the server said** — counts stopped travelling as prose · `saveBulk` threw from inside its own loop · **the opportunities overwrite bypassed chunking entirely and discarded every count the server returned** · overwrite state applied from `appliedIds` on **three** paths, not the two recorded · silent row drops surfaced at Preview · 89 → 140 tests, 14 mutations
**Prior batch:** **bulk INSERT chunked with per-row isolation (3 endpoints)** · `check:dbfetch` was blind to aliases AND concise arrow bodies · **opportunities CSV overwrite had never worked** · **an overwrite wiped stage history, comments and contact links** · contacts import was ~500 round-trips · undated deals invisible in the Pipeline list · 69 → 89 tests · **confirmed on dev, not just in CI**
**Prior batch:** **`dbFetch` remediation 78 → 0, `check:dbfetch` promoted to the fifth gate** · **Clerk advisories cleared — Production migration unblocked** · three of four gates had false-negative classes, all now fixture-tested · `users.mjs` PUT was replacing rows · 4 `settings.extra` keys never whitelisted · settings autosave cached rejected writes forever · build guard · 19 → 69 tests
**Prior batch:** SalesManagerTab hoist, SPIFF persistence & claim plumbing
**Prior batch:** inline-component audit — **the backlog named the wrong three files**; 81 raw findings triaged to 5 user-visible, 3 fixed · new `check:inline` scanner
**Prior batch:** calendar disconnect (endpoint already existed — client wiring only) · personal email signature, escaped server-side · record-number generators moved from full-table scan to indexed `MAX` · **`mobile` was being wiped on every profile save**
**Prior batch:** `planWeek` crew + equipment constraints · settings navigation guard · **14 panel saves fixed (4 were silently discarding failed saves)** · PersonalView mocks deleted · calendar visibility (avatar tab + Home strip) · `check-tdz.mjs` widened to function declarations, finding 4 pre-existing crash bugs
**Prior batch:** Dispatch customers redesign · property types org-configurable · Won→Dispatch bridge template-driven · quote numbers server-side · quote versioning fixes · record-number unique indexes + retry · template "Applies when" two-axis matching · unsaved-changes prompt · **two production incidents (§0PB.20, §0PB.21)**  
**Prior session:** service plans (B) · plan recurrence & Service Due (C) · production TDZ incident · `preferredTechId` circular-score fix · job template picker · two uneditable template inputs · **Vehicles & Equipment converged onto the DB tables (blobs retired as source of truth)** · equipment as a scheduling constraint (unit-level) · **vehicle-class requirement (`required_vehicle_type`, schema change)** · template Edit action · dispatch customer segmentation  
**Prior session:** SVR-2 actually shipped (`a9ed408`) — BYOK plaintext-key exposure + settings authorization · **audit-record correction** · **SVR-3 uniform role-gate sweep (11 files)** · **Dispatch module: job create rebuilt, Customers + Technicians views** · **technician consolidation, licence levels, crew scheduling persisted + audited, board date ranges** · **job editing, job categories/types, mass-schedule, technician availability (shift patterns + time off)** · **Technician role + scoping, role management (roles never reached Clerk)** · **technician frontend, settings save errors surfaced, job numbers** · **user/Clerk drift root-caused, drift detection, user delete fixed** · **settings duplicate-row fix + unique index**  
**Prior session:** UI features · task-completion bug · users-wipe incident + recovery · branch-drift reconciliation

---

## 0. Latest Batch — The Importer Reports What Landed

> Four backlog items turned out to be one defect with four faces. The importer's
> Results screen reported numbers that were never derived from what the server
> said: some were parsed back out of an error sentence, some were the count the
> CLIENT decided to send, and one path threw the server's answer away without
> reading it. Every one of them failed in the reassuring direction.

### 0.1 Counts travelled as prose

`CsvImportModal` recovered its Results figures by regex-parsing the thrown error
message:

```js
const isPartial = msg.includes('of') && msg.includes('failed to save');
const m = msg.match(/(\d+)\s+of\s+(\d+)/);
```

So the numbers a user saw depended on the wording of a string thrown in another
module. The accounts phase of a contacts import throws about **companies** — "2
of 3 new companies failed to save" on a 5-contact file rendered **"1 of 5 records
saved"**: a number describing companies, presented as contacts, against a total it
did not come from. Both figures wrong, both reassuring.

Replaced by a **receipt** — `src/utils/importReceipt.js`. Numbers come off the
response, travel as fields, and prose is generated FROM them at the very end by
`describeReceipt()`. Nothing parses a sentence back into a number. `ImportError`
carries the receipt; `receiptFromError()` returns `null` for anything else, so a
`TypeError` in a handler is no longer rendered as a counted partial failure.

The invariant `attempted === created + updated + failed` is asserted directly.
`skipped` and `dropped` sit deliberately outside it — neither was ever sent, and
folding them into `failed` is how "6 rows in, 0 out" came to render as success.

### 0.2 `saveBulk` threw from inside its own loop

§18b15 states the rule and names `postNew` as the compliant example — an early
chunk that succeeded has to reach state before the failure is reported. `saveBulk`
sat twenty lines above `postNew` in the same file and violated it: a failure on
chunk 3 discarded the accumulated `updated` / `notFound` / `forbidden` from chunks
1 and 2, rows already written server-side.

It was inert only because the overwrite paths wrote state optimistically **before**
the request — §0.5 masked it. Fixing §0.5 alone would have made it live. Same shape
as §0A0000.1: a correctness fix turning a latent defect reachable. The rule that
predicted it was committed in the same commit as the code that broke it.

### 0.3 The opportunities overwrite bypassed chunking entirely

`ModalLayer.jsx:664` called `dbFetch` directly with the whole array and read the
body **only when the response was not ok**. Contacts and accounts both went
through `saveBulk`. Consequences, in order of severity:

- `updated`, `notFound` and `forbidden` were **discarded**. An overwrite matching
  zero ids returns `200 {updated: 0}`, and the Results tile rendered
  "3 overwritten" — `overwriteCount`, the number the client chose to send.
- No client-side chunking, so one request body for the entire file. `bulkUpsert`
  chunks server-side, so this was a payload/timeout risk rather than a bind-param
  crash — but it is the one path §18b8 did not reach.

**§0A0000.10 recorded this check as passing, and it did** — on the refresh, not on
the tile. The tile would have read "3 overwritten" if the server had matched
nothing. Checking the write landed rather than that the call returned is the only
reason that row was evidence.

### 0.4 Both transport helpers extracted and made testable

`postNew` and `saveBulk` lived at module scope in `ModalLayer.jsx`, which imports
React — so neither was reachable by `node --test`, and chunk size, cross-chunk
accumulation and the never-throw contract are all invisible in the return value.
Same argument as `_bulk.mjs`, `quarters.js` and `csvAutoMap.js`.

They are now `src/utils/bulkClient.js`, behind `makeBulkClient(fetchFn)`. The
injected fetch is the same seam `bulkInsert` uses for its db client: the recording
stub goes in through the front door, no module mocks, no `--experimental` flag, no
`window`.

### 0.5 Overwrite state applies from what the server accepted — three paths

`putBulk` returns **`appliedIds`**: `(sent − notFound − forbidden)`, derived per
chunk. `bulkUpsert` partitions each chunk into exactly those three groups, so this
is exact rather than inferred. A chunk whose derivation disagrees with the
server's own `updated` count contributes **no** ids and is counted as a
`discrepancy` — applying an ambiguous set is precisely how the UI came to show
records that were never written, and the honest answer is that a refresh will
settle it.

The handoff and §0A0000.6 both said two paths. It was **three**: contacts at
`ModalLayer.jsx:519` had the identical shape.

### 0.6 The importer no longer congratulates you on importing nothing

`getMappedData()` ended in a silent `.filter()`. An accounts CSV run through the
Contacts importer maps neither required field, so every row failed it: six rows
in, zero out, green tick, *"Import Complete!"*.

Now `src/utils/csvMapping.js`. The drop **rule** is preserved exactly — `.some`,
not `.every`, so a mononym still imports and the required marks mean "at least one
of these". The **silence** is not. `mapCsvRows` returns `dropped[]` with row
numbers counted as the user sees them in Excel (header is row 1), and
`unmappedRequired` names the cause rather than the symptom: *"No column is mapped
to First Name or Last Name."*

Surfaced at **Preview**, the last step where the mapping can still be fixed, and
the primary button is disabled when nothing is importable. Results is too late.

Also fixed there: the tile labelled **"imported"** rendered `total`
(`newRecords.length + overwriteCount`), so an overwrite-only run read
"3 imported · 3 overwritten" when nothing was created. Tiles are now `created`,
`overwritten`, `skipped`, `not sent` and `failed`, each a receipt field, each
hidden at zero.

### 0.7 Tests 89 → 140, and 14 mutations

| Suite | Pins |
|---|---|
| `bulk-client.test.mjs` (18) | chunk size, never-throw, cross-chunk accumulation, `appliedIds` derivation, discrepancy exclusion, progress offsets, POST/PUT methods |
| `import-receipt.test.mjs` (18) | the `attempted` invariant, unsent-chunk accounting, merge precedence, `isClean`/`isPartial`, receipt-not-message |
| `csv-mapping.test.mjs` (15) | the `.some` rule, drop numbering, cause diagnosis, the accounts-in-contacts regression and its control |

`scripts/mutate-import.mjs` breaks each rule in turn and asserts the suites go
red — **14/14 caught**, including both original defects (`putBulk` throwing
in-loop; drops going silent) and the `.some` → `.every` tightening. Files are saved
and restored in memory, never via `git checkout`, which has reverted unrelated
fixes mid-session before.

### 0.8 Confirmed on dev — and check 1 failed

Run against `accelerep.netlify.app` with `ZZTest` opportunities. §18b8 is explicit
that generation proving out is not execution proving out, and this is what that
buys you.

| Check | Result |
|---|---|
| A comment survives a CSV overwrite | **FAILED** — Team Notes, the linked contact and the stage history were all erased. Root-caused to the endpoint; see §0.9 |
| Deals themselves survive | Pass — the three deals persisted, reverted to their seeded field values |
| Accounts CSV into the Contacts importer blocks at Preview | not yet run |
| An overwrite of deleted records reports failure, not success | not yet run — same path as §0.9, retest after that ships |
| Overwrite counts survive a hard refresh and match the tiles | not yet run |
| Avatar timezone PUT fires once (carried from §0A0000.10) | not yet run |

**No production exposure.** Nobody is running Accelerep in production; every
affected row was dev `ZZTest` data. This is a bug, not an incident.

### 0.9 The overwrite was still destructive, and the fix was in the wrong file

`sanitize()` in all three endpoints is a **full-row builder, not a filter**. It
does not narrow a payload; it expands one, emitting every column with a default:

```js
stageHistory:     data.stageHistory     || [],
comments:         data.comments         || [],
contactIds:       data.contactIds       || [],
pipelineId:       data.pipelineId       || 'default',
createdBy:        data.createdBy        || null,
```

That is correct for POST, where the row does not exist. The bulk PUT branches ran
`rows: data.map(d => sanitize(d))`, and `bulkUpsert` derives its `SET` clause from
the keys supplied — which after `sanitize()` is **every** key. A seven-column CSV
overwrite wrote roughly forty columns.

**§0A0000.1 fixed this in the caller.** `buildOpp` stopped sending `stageHistory`
/ `comments` / `contactIds`; `sanitize()` put them straight back. The client-side
fix was correct and completely ineffective — and §18b13 already said, in as many
words, that a partial PUT fix belongs in the endpoint and not the caller. The rule
was right, committed, and not applied to the file it was about.

It is also why §0A0000.10 recorded the opportunities overwrite as passing. It did
pass, on stage and ARR — both CSV columns, both genuinely written. Every field the
CSV did *not* carry was being destroyed in the same request, and no check looked
at one until now.

**Fix:** `netlify/functions/_sanitize.mjs`. `partialRows(rows, sanitize)` narrows
each sanitized row to the columns the payload actually supplied, as a union across
the batch so the multi-row INSERT keeps one shape. Wired into the bulk PUT branch
of `opportunities.mjs`, `contacts.mjs` and `accounts.mjs` — accounts and contacts
had the identical shape and had been destructive a session longer.

The distinction the old code could not make: **a column not mapped in the CSV
never appears and is never written; a column mapped and left empty appears in
every row and is written empty.** `sanitize()` made both look supplied.

Pure and dependency-free for the usual reason — all three endpoints import
`db/index.js`, which is TypeScript, so anything defined in them loads only under
`tsx` and never runs in the gates.

**Tests 140 → 151, mutations 14 → 17.** `tests/partial-sanitize.test.mjs` pins the
narrowing, the batch union in both directions, the coercion surviving on kept
columns, and the exact regression — the CSV overwrite shape asserted not to carry
`stageHistory`, `comments`, `contactIds`, `createdBy`, `createdDate`,
`stageChangedDate` or `pipelineId`.

One clause was written and then deleted: an `ALWAYS_KEEP = ['id']` guard. The
mutation harness survived its removal, because every bulk branch 400s on a row
without an id, so it could never fire. Removed rather than given a contrived test
— §0A0000.3, a clause that cannot fire is worse than none.

**Not yet confirmed on dev.** Retest check 1 in full after deploy, then check 4,
which exercises the same path.

### 0.10 The fix in §0.9 then 500'd, for the reason §0.9 exists

Retested on dev. The overwrite no longer destroyed anything — it failed outright:
*"Nothing was saved. 3 did not save. Internal server error."*

`opportunities.pipelineId` is `.notNull()` with no database default.
`INSERT ... ON CONFLICT DO UPDATE` **is an INSERT first**: Postgres forms the
candidate tuple and checks its constraints BEFORE resolving the conflict and
switching to the update. So every NOT NULL column without a default must be
present in the values — even for a row that already exists and will only ever be
updated.

`partialRows` correctly stopped sending `pipelineId`, because a CSV does not
describe which pipeline a deal is in. Correct narrowing, incompatible upsert.

**Fix:** `bulkUpsert` now backfills NOT NULL-without-default columns **from the
row that already exists**, and keeps them out of the SET clause. The tuple can
form; the update still writes only what the caller supplied. The backfilled value
is never invented — the old `sanitize()` default of `'default'` would have moved
every overwritten deal into another pipeline.

Required columns are detected generically off Drizzle's own `notNull` /
`hasDefault`, so a future NOT NULL column is covered without anyone remembering.

**`bulkUpsert` moved from `_lib.mjs` to `_bulk.mjs`,** injected client, same as
`bulkInsert`. It shipped a 500 that a test would have caught in one line, and it
could not be tested at all where it lived. `tests/bulk-upsert.test.mjs` (14) pins
both properties that are in tension — omitted columns are never written (18b13),
NOT NULL columns still reach the INSERT arm — because fixing either alone
reintroduces the other bug.

**Tests 151 → 165, mutations 17 → 21.** One mutation initially survived: the
fixture omitted `updatedAt`, so "does not backfill defaulted columns" had nothing
to catch. A fixture that omits a column cannot prove the code declined to copy it;
it proves only there was nothing to copy.

**Worth recording:** the Results screen behaved exactly as designed. It said
*"Nothing Was Imported"*, showed `3 failed`, and printed the requestId. The
previous UI would have shown a green tick and "3 overwritten". §0.1–§0.6 are what
turned an opaque 500 into a diagnosis.

**Still not confirmed.** Retest check 1 in full after deploy.

### 0.11 The deploy failed on a tree where all five gates were green

```
✘ No matching export in "netlify/functions/_lib.mjs" for import "bulkUpsert"
✘ No matching export in "netlify/functions/_lib.mjs" for import "bulkInsert"
```

Moving `bulkUpsert` out of `_lib.mjs` deleted the span between two anchors, and
`export const bulkInsert` sat inside it. The follow-up replace that was meant to
re-add the binding matched text that no longer existed, so it was a silent no-op.

**Every gate passed. Every one of 165 tests passed.** The unit tests import from
`_bulk.mjs` directly, so nothing exercised the edge that broke.

The reason is structural, not a slip: **`npm run build` runs vite, and vite bundles
`src/`. The Netlify functions are bundled separately by esbuild at deploy time.**
No gate had ever resolved an import edge between two function files. An entire
class of error — the one esbuild exists to catch — was invisible to CI and visible
only in a deploy log. That is a gate gap by §18b11's own definition.

**Closed:** `tests/function-imports.test.mjs`. Parses every `netlify/functions/*.mjs`,
resolves each relative import against the target's actual exports, and fails with
esbuild's own wording. A file that will not parse is its own failure rather than a
quiet skip (§18b6).

Proven both directions before being trusted: with the two export lines removed it
names `accounts.mjs:5`, `contacts.mjs:5` and `opportunities.mjs:8` — the same file
and line Netlify reported — while `check:tdz`, `check:dbfetch` and the build guard
all stay green on that same tree.

Also run directly now as a belt-and-braces check: `esbuild --bundle` over the three
changed functions, which is what Netlify actually does.

**Tests 165 → 167, mutations 21 → 23.**

**The pattern, for the third time in one session.** A correct fix broke something
downstream that nothing was watching: the client fix was undone by the server
(§0.9), the server fix was rejected by the upsert (§0.10), and the extraction that
made the upsert testable broke the import graph (§0.11). Each was caught one layer
later than the last — unit test, dev check, deploy log. The gate added here pulls
the last of those three back into CI.

### 0.12 Check 1 run: three of four probes survived, and the fourth found the other half

| Probe | Result |
|---|---|
| 💬 Team Notes (`comments`) | **survived** |
| Linked contacts (`contactIds`) | **survived** — all three |
| Stage history (`stageHistory`) | **survived** |
| Description / Background (`notes`) — positive control | **changed** to the OVERWRITTEN text, so the overwrite genuinely ran |
| **Next Steps (`nextSteps`)** | **BLANKED** |

The three that survived are not in the importer's field list at all. Next Steps
is. That is the entire difference, and it is the tell.

`mapCsvRows` wrote `''` for **unmapped** fields as well as empty ones:

```js
record[field.key] = isMapped(colIdx) ? (row[colIdx] || '') : '';
```

So a CSV with no Next Steps column still sent `nextSteps: ''`. `partialRows` saw a
supplied column, `sanitize()` coerced it to null, and the overwrite blanked it.
**Server-side narrowing is necessary and not sufficient** — it can only omit what
the client did not send, and the client was sending everything.

`_sanitize.mjs` carried the claim *"a column NOT MAPPED in the CSV never appears in
any row"*. It was never verified, and it was false. Both files now carry the
contract explicitly and each points at the other: **unmapped is omitted; mapped is
present even when the cell is empty.**

New records are unaffected — `buildOpp` and the account/contact mappers all
coalesce with `|| ''`, so an absent key still lands as empty. Every downstream
consumer of a mapped record was already undefined-safe (`?.`, `|| ''`,
`filter(Boolean)`, `norm()`), checked one by one.

**A test asserted the wrong behaviour, confidently.** `an unmapped field is present
and empty, never undefined` had a plausible rationale about `undefined` vs `''` and
was exactly backwards. It is inverted now, with the reasoning recorded, plus a
regression pinning an overwrite payload to the file's columns only. Mutation
testing does not catch a test that encodes the wrong rule — only running the thing
does.

**Tests 167 → 169, mutations 23 → 25.** Both directions of the contract are
mutation-covered: emitting `''` for unmapped fields again, and dropping
mapped-but-empty columns.

**Still not confirmed.** Re-run check 1 with all four probes.

### 0.13 Next Steps was still blanked — `buildOpp` re-materialised every column

Re-ran check 1 with §0.12 deployed. Same result: three probes survived, Next Steps
blanked, control fired.

`mapCsvRows` was omitting unmapped fields correctly. `buildOpp` put them all back:

```js
salesRep:           o.salesRep           || currentUser,
implementationCost: parseFloat(o.implementationCost) || 0,
nextSteps:          o.nextSteps          || '',
```

Thirteen columns, built unconditionally, whatever the file contained. Narrowing at
the mapper and narrowing at the endpoint were both defeated by the step between
them.

**And Next Steps was the least of it.** Every overwrite also:
- **reassigned the deal** — `salesRep || currentUser` took ownership for whoever
  ran the import
- **zeroed `implementationCost`** — `parseFloat(undefined) || 0`
- blanked `products`, `territory`, `vertical`

Nobody noticed because Next Steps was the field being watched. The other three
probes survived only because Team Notes, contacts and stage history are **not in
the importer's field list at all**, so nothing existed to re-materialise them.

**The comment directly above the code said the opposite:** *"an overwrite now
sends only the columns the CSV actually describes and the server merges the
rest."* Written in §0A0000.1, describing an intent the code beneath it never
implemented. Third false comment of this shape in one session — §0.9's
`sanitize()`, §0.12's `_sanitize.mjs`, and this.

**Fix:** `src/utils/importRows.js`. `buildOpportunityRow` coerces only keys the
record actually carries (`hasOwnProperty`, so a mapped-but-empty column still
asserts empty), and the create and overwrite paths are now structurally distinct
rather than one shape with a branch. `createdDate` is dropped from an overwrite
entirely — provenance is not content, and a file carrying a Created Date column
must not rewrite when the deal was created.

Contacts and accounts were already correct once §0.12 landed — both overwrite
mappers are pure spreads of the mapped record. Only opportunities had a builder.

**Tests 169 → 185, mutations 25 → 29.**

**Three narrowing points, and all three had to be right.** `mapCsvRows` decides
what the file described; `buildOpportunityRow` must not add to it;
`partialRows` narrows the sanitized row back down to it. Each was fixed in turn
and each time the next one downstream undid it.

**Still not confirmed.** Re-run check 1.

---

## 0A0000. Prior Batch — Bulk Insert, and Three Paths That Had Never Run

> This started as two handoff items and turned into six, because each fix exposed
> the next. Last session the pattern was code that *looked* finished. This session
> it was **code that had never run at all**: a PUT branch that 400'd on every call
> ever made, a dedupe clause that could not fire, a territory rule with no UI to
> author it, and a scanner walking past the one line it existed to catch.

### 0.1 The one that matters most: fixing a 400 created a data-loss path

`opportunities.mjs` PUT had **no array branch**. `ModalLayer` sends an array, so
`!data.id` on an Array returned 400 — **CSV overwrite of opportunities had never
once worked.** Adding the branch was three lines.

Then `buildOpp` turned out to build ONE shape for both new deals and overwrites,
ending in `stageHistory: []`, `comments: []`, `contactIds: []`. `bulkUpsert`
derives its `SET` clause from the keys supplied, so an overwrite wrote those empty
arrays over real data — **erasing the deal's stage history, every comment on it,
and its contact links.**

That was inert only while the branch 400'd. **Fixing the 400 converted a dead path
into a destructive one, in the same commit that made it reachable.** Guide §18b15
carries the rule: when you make a broken write path work, re-read what it writes —
it has never been exercised, so nothing about it has been proven.

### 0.2 Bulk INSERT — three endpoints, not the two the handoff named

`accounts.mjs`, `contacts.mjs` **and `opportunities.mjs`** each did
`db.insert(t).values(allRows)` — one statement for the entire import. Above ~1,872
accounts that breaks the 65,535 bind-parameter ceiling, and being one statement it
is atomic: one over-length field rolled back the whole file with nothing saved and
no indication which row was at fault.

`bulkInsert` chunks at 400 and **isolates by bisection**, not row by row. One bad
row in 400 costs ~9 extra statements instead of 400 — and 400 round-trips at ~30ms
is 12s against a 10s function timeout, so the obvious "safe" fallback would itself
have been the outage. A 7.5s wall-clock budget bounds every path; whatever landed
is reported and the rest comes back as failed-not-attempted.

It lives in **`netlify/functions/_bulk.mjs`, not `_lib.mjs`**, and takes an injected
client. `_lib.mjs` imports `db/index.js`, which is TypeScript, so anything there
loads only under `tsx` — outside the gates job. Chunk size, bisection depth and the
deadline are invisible in the return value, so if they cannot be asserted in CI they
are not enforced.

### 0.3 `onConflictDoNothing()` could never fire — removed, not replaced

All three carried it with a comment claiming it "skips duplicates instead of
erroring". The only unique constraint is the `id` primary key and every id is a
fresh `crypto.randomUUID()`, so it never triggered once. Name-based dedupe at insert
time would fight the smart-merge tooling that already owns that decision. A clause
that cannot fire is worse than none — it reads as protection that was never there.

### 0.4 `check:dbfetch` had TWO blind spots on one line

`AppHeader.jsx:444` discarded a Response into an empty catch, and the gate reported
0 across the whole tree:

```js
import('../../utils/storage').then(({ dbFetch: df }) =>
    df('/.netlify/functions/users?me=true', { … }).catch(() => {}));
```

The alias is the obvious one — the scanner matched the callee name `dbFetch`. The
second is structural: `x => df(…)` is a **concise arrow body**, so there is no
`ExpressionStatement` anywhere for `findStatements` to find. Alias resolution alone
would still have missed it. Same shape as the concise-arrow bug that hit
`check-tdz` (§0A000.1).

Both fixed, with a catch fixture and an aliased-but-checked false-positive guard.
Mutation-tested independently: disabling alias resolution drops the fixture 3 → 0;
disabling concise bodies drops it 3 → 2.

The call site now routes through the existing `saveProfile`, which also fixes a bug
nobody had noticed — it never updated `myProfile`, so the PUT **re-fired on every
avatar click** for the rest of the session. The pointless dynamic import went with
it (~80 modules import `storage.js` statically; rollup inlined it and warned on
every build).

### 0.5 Contacts import never used the bulk endpoint at all

One POST per record at concurrency 3, with per-record retries and a 100ms pause
every 50 rows — ~500 round-trips for a 1,500-row file, against the same array
endpoint the accounts importer had been using all along. Now 4 requests. ~40 lines
of `saveOne`/`saveAll` deleted.

### 0.6 State applied from what landed (§18b15)

Every import handler wrote `setX(prev => [...prev, ...rows])` **before** the request
and never rolled back. Rolling back is the wrong fix — on a partial failure the
client cannot know which rows to remove. The server now returns `insertedIds`, so
state is applied from the server's answer after the write.

**Still outstanding:** the accounts and opportunities OVERWRITE paths keep the old
optimistic shape. Only the new-record paths were converted.

> **Correction (§0.5 below).** That is an undercount, and the same undercount
> §0.2 above is named after: it was **three** paths. `ModalLayer.jsx:519` did it for
> contacts too. Whatever produced the original two-of-three miss produced it again
> four sections later, in the same document. All three are converted now.

### 0.7 Bulk accounts POST skipped territory assignment

`resolveTerritory()` ran on the single-record path only, so every CSV-imported
account landed unassigned while an identical account created through the UI got a
territory — which reads as the rules being broken rather than as an import gap.
Split into `loadTerritoryRules` + `applyTerritoryRules` so the batch reads settings
once rather than per row. **Cannot be verified by clicking** — see §0.10.

### 0.8 Deals with no close date were invisible in the Pipeline list

`groupByQuarter` dropped them with a bare `if (!qk) continue`, so the header read
"3 open deals · $73K" directly above a table saying "No deals closing this quarter",
while Funnel, Kanban and Forecast showed the same deals because they group by stage.
A rep who saved a deal without a close date would reasonably conclude it had not
saved. They now get an explicit bucket, sorted last, labelled *No close date ·
Not scheduled*.

Also `NaNd` in the funnel: `days` was computed from `stageChangedDate` with no guard
at **two** sites, while the stage-summary calculation in the same file guarded it.
The display was the visible half — the real problem is `stale = NaN > 14` being
permanently false, so such a deal **could never flag as stalled**. Imported deals now
get `stageChangedDate` set on create.

Quarter helpers extracted to `src/utils/quarters.js`: `ListView.jsx` imports React
and `useApp`, so nothing inside it is reachable by `node --test`. Same reasoning as
`csvAutoMap.js`. A fix for a silent drop should not itself be untestable.

### 0.9 Tests 69 → 89, every new rule mutation-tested

| Suite | Pins |
|---|---|
| `bulk-insert.test.mjs` (9) | chunk size, bind ceiling, bisection cost, per-row isolation, deadline, orgId stamping |
| `quarters.test.mjs` (10) | undated bucket, deal-count conservation, sort order, fiscal-year offsets |
| `scanners.test.mjs` (+1) | aliased + concise-body dbFetch |

`bulk-insert` asserts on the **shape of the traffic** — statement count, chunk size,
which rows were isolated — because none of that is visible in the return value: a
single statement and four chunked ones respond identically.

Mutations run: kill chunking → 3 fail · kill bisection → 4 · kill the deadline → 1 ·
make `orgId` overridable → 1 · restore the silent `continue` → 5 · sort undated
first → 1 · fiscal year off by one → 2.

### 0.10 Confirmed on dev, which is the part that counts

§18b8 is explicit that generation proving out is not execution proving out. Run
against `accelerep.netlify.app` with throwaway `ZZTest` data:

| Check | Result |
|---|---|
| 6-row accounts import, one 64-char ZIP against `varchar(20)` | **5 saved, 1 failed, named.** Search confirms 8 ZZTest accounts and **no Row03** — isolated, not merely uncounted |
| Count survives a hard refresh | **133 before and after** — §18b15 holds |
| Contacts import, 3 new companies | 1519 → 1524, companies auto-created |
| Opportunities overwrite | **3 overwritten, Proposal at 25/31/17K, persisted through refresh** — a path that had never once succeeded |
| Territory rules on bulk import | **BLOCKED** — nothing writes territory-shaped rules, so the rule cannot be authored. Verify by test instead |
| Avatar timezone PUT fires once | **not yet run** |
| Comment survives a CSV overwrite | **not yet run** — covers §0.1, the one thing a commit made worse before it was fixed |

**Two false alarms worth recording**, both instructive:

- An accounts CSV run through the CONTACTS importer reported *"Import Complete!"*
  with a green tick and **0 imported**. `getMappedData()` drops every row lacking a
  required field, silently — six rows in, zero out, and the UI congratulates you.
- The first runbook named files but never named the tab. Instructions that assume
  context are how a correct fix gets reported as a failure.

---

## 0A000. Prior Batch — Gate Audit, Build Guard, CSV Import Hardening, Hooks Remediation

> Every real bug this session was code that *looked* finished. **So were three of the four gates** — `check-tdz`, `check-inline` and `scan-dbfetch` each had a false-negative class, each reported clean over a live defect, and every one was found by a bug reaching production first rather than by reviewing the scanner. All four now have fixture suites proving they catch what they claim.

### 0.1 The gates had blind spots — this is the headline

| Gate | Blind spot | What shipped behind it |
|---|---|---|
| `check-tdz` | `/^[A-Z_]+$/` treated `T` as an imported SCREAMING_CASE constant, so the single most-used styling identifier was never checked | `EntitySelector` in `ReportsTab` read `T` from a scope it lost on hoist. **Whole Reports tab down** behind the error boundary. Gate printed "No render-time TDZ issues in 135 file(s)". |
| `check-inline` | `riskOf()` inspects only a component's own body, so a wrapper rendering `{children}` scored harmless | `FL` in `AddDestinationModal` remounted the caller's `<input>`. Focus lost after one character; the escaped keypress hit App.jsx's global hotkey and opened the New Task rail. Gate reported **0 user-visible**. |
| `scan-dbfetch` | peels `.then(r => { if (!r.ok) … })` off to find the `dbFetch` underneath | **59% false positives in the hooks — 10 of 17**, well above the 17% already documented. Acting on the list unreviewed would have rewritten a working data layer. |

Fixed, and **`tests/scanners.test.mjs` + `tests/fixtures/scanners/` now pin all four.** Each fixture is a real bug that shipped and says which; each scanner also gets a `-safe`/`-clean` fixture it must stay quiet on. The suite fails if a `check:` script exists in `package.json` with no fixture. Mutation-tested: restoring each original blind spot fails the suite. See coding guide §18b11.

**`check-inline`'s fix resolves risk from call sites, not guesswork.** Flagging every children-wrapper took the codebase 0 → 13 user-visible, but 12 were presentational `<Panel>`s in `ReportsTab` wrapping charts — failing CI on those is how a gate stops being trusted. It now checks what the call sites actually pass.

### 0.2 Build guard — a hollow bundle can no longer deploy

`scripts/check-bundle.mjs`, chained into `npm run build`. Two findings beyond the backlog's description: **the CSS asset is byte-identical between a real and a hollow build** (same content hash), so any "were assets emitted" check passes; and `index.html` ships static crawler-readable copy inside `#root`, so a hollow deploy renders a plausible landing page rather than a white screen.

Proven both directions on Jeff's machine. **The documented gate command changed** — `npx vite build` bypasses the guard; use `npm run build`. See §18b4.

### 0.3 `check:dupes` gate + 9 duplicate keys/attributes fixed

Nine findings, matching esbuild's nine warnings exactly. Four were duplicate `style` attributes in `CsvImportModal` where React discarded the base button style entirely — **both primary CTAs and both bulk actions in the CSV flow rendered as raw browser buttons**. The rest were dead values in `DispatchTab:5080`, `TasksTab:1295`, `DispatchSkillsDetail` ×3. See §18b9.

### 0.4 CSV import: auto-mapping, conflicts, bulk PUT

**Auto-mapping rewritten** — `src/utils/csvAutoMap.js`, 13 tests. Order-dependent `findIndex` substring matching replaced with weighted aliases, deny rules and global one-to-one assignment. Against a real Outlook export the old matcher put a phone number in Company, an email in Address, the home phone in Business Phone, and the honorific in Job Title — and scored all four 0.85, rendering **green**. Confirmed in practice; Jeff had corrected "a lot" of dropdowns by hand.

**Conflicts step** — paged at 100 (a same-file re-import rendered 1,504 `<select>`s and froze the tab). "Skip all" appeared dead because every conflict is born `action: 'skip'`; it is now a segmented toggle reporting `mixed` once any row is set by hand.

**Bulk PUT** — `bulkUpsert` in `_lib.mjs`, array branch on `contacts.mjs` and `accounts.mjs`. Overwrites went from **~500 sequential round-trips to 4**. SQL generation verified via `.toSQL()` before building on it, then verified against the real database. No schema change. See §18b8.

**CRLF damage repaired** in `CsvImportModal.jsx` — 848 lone CRs (`\r\r\n`), the signature of a patch script written without `newline=''`. Proven content-neutral: emitted bundle byte-identical, same md5.

### 0.5 Audit-log streaming persisted nothing

`streamingDestinations` and `streamingGlobals` appeared **only in `AuditDetail.jsx`** — in neither the GET nor the PUT of `settings.mjs`. The PUT rebuilds `extra` from an explicit whitelist, so both keys were dropped **and the endpoint still returned 200**. Add, remove, pause, globals: all appeared to work and reverted on reload.

**No amount of `res.ok` checking would have caught this** — the response was 200. Both keys added to both halves. Verified working.

### 0.6 Hooks remediation — 6 real sites of 17 flagged

Ten were false positives (§0.1). The six real ones:

- **`useOpportunities` Closed Lost, both branches — the worst.** `.catch(console.error)` never sees a 403/500, and `addAudit()` was called unconditionally. A rejected save left the pipeline showing Closed Lost, **the audit log asserting it**, and the row still open. Closed Lost feeds revenue reporting. Now awaited, checked, rolled back, and **no audit entry is written for a save that did not land**. `completeLostSave` became async; all three call sites ignore the return value.
- **Three undo-restores** (`useActivities`, `useTasks`, `useContacts`) — a failed restore left the row visible but gone from the database. Now removed again and reported.
- Two `fireMentionSms` sites are deliberate fire-and-forget; left alone.

**New `dbWrite()` in `src/utils/storage.js`** — returns `{ ok, status, error }`, never throws, surfaces the `requestId`. 9 tests, mutation-tested. See §18b1.

### 0.7 Housekeeping

- **`drizzle-orm` 0.45.1 → 0.45.2** — SQL identifier injection. Zero `sql.raw` call sites, so exposure was nil.
- **CI now runs the gates.** New `gates` job: check:tdz, check:inline, check:dupes, and a build with a dummy key. **Previously none ran in CI.**
- Test count **66 passing**, up from 19 at session start.

### 0.8 `dbFetch` remediation — 78 → 0, and `check:dbfetch` is now a gate

Hand-triaged and fixed across nine passes. **The original handoff's blocked item is
closed.**

| Cluster | Sites | Real |
|---|---|---|
| Hooks (4 files) | 17 | 6 |
| `PipelinesDetail` | 9 | 9 |
| `settings/people` | 8 | 8 |
| `CompanyCalendarDetail` | 4 | 4 |
| Remaining `settings/` | 12 | 12 |
| `ContactsTab` + `AccountsTab` | 6 | 6 |
| `App.jsx` | 4 | 0 |
| Final sweep (9 files) | 12 | 9 |

**The pattern was strongly categorical.** Settings panels ran **33/33 real** — they
are fire-and-forget writes to an Admin-only endpoint, so every one silently 403s for
a non-admin. Hooks ran 6/17 — mostly loads and deletes that were already correct.
*Where* a site is predicted whether it was real far better than the scanner did.

**The worst single find was `useSettings`'s global autosave.** It wrote localStorage
**before** the PUT and then discarded the Response, so a non-admin's 403 left the
change cached locally forever: the UI showed it, a reload re-read it from cache, and
nothing ever reached the database. A failure that masked itself indefinitely on one
machine while nobody else saw the change. Now DB-first, cache only on success, error
surfaced through the toast.

**The scanner itself was the blocker.** It reported a 59% false-positive rate on the
hooks because it unwrapped `.then()` chains without reading the callbacks, and it
could not even be pointed at a file — it ignored its arguments and always walked
`src/`, which is why the error rate went unmeasured for two sessions. Both fixed,
behaviour pinned by fixtures, then promoted: **`npm run check:dbfetch`**, exit
non-zero on any finding, in CI. Deliberate fire-and-forget opts out with a
`dbfetch-ignore:` comment at the call site — three sites qualify.

It also gained a second finding class, **Response read as if it were JSON** (§18b3),
which immediately found `ReportsTab`'s saved-reports list calling
`.then(data => data?.reports)` on a Response with no `.json()` in the chain. Always
undefined — the list had never loaded.

New shared helper **`dbWrite()`** in `src/utils/storage.js` — `{ ok, status, error }`,
never throws, surfaces the `requestId`. 9 tests, mutation-tested. `putSettings()`
remains the template for settings panels.

**Five gates now, all in CI, all fixture-tested** — up from two that ran only by hand
at session start. 69 tests, up from 19.

### 0.9 Two failures no client-side handling could ever catch

**`settings.extra` keys missing from the whitelist — four keys, three features.**
`streamingDestinations`/`streamingGlobals` (audit streaming), `connectedApps`/`slackConfig`
(Connected Apps), `importPresets` (import presets). The PUT rebuilds `extra` from an
explicit list, so unknown keys are dropped **and the endpoint still returns 200**.
Connected Apps even read its keys back on mount — a complete round-trip persisting
nothing. All now whitelisted in both halves. See guide §18b12.

**`users.mjs` PUT was replacing rows, not updating them.** `sanitize()` rebuilds
every column and the whole `profile` jsonb from the body; `upsertUser` writes it
with `set: { ...updateData }`. Five cascade sites sent
`{ id, team, territory, vertical, teamId }`, which produced `name: "Unnamed User"`,
`email: "<id>@placeholder.local"`, `quota: null` and **31 of 35 profile fields
null** — wiping names, emails, phones, signatures and quotas. Every one sat in
`catch(e) {}`. Fixed with `mergeForUpdate()` **in the endpoint**, so every caller
inherits it. Test data only; no production damage. See §18b13.

### 0.10 Clerk advisories cleared — Production migration unblocked

Patched with **`npm audit fix`** (never `--force`): `@clerk/backend` 3.0.1 →
3.16.5, `@clerk/clerk-react` 5.61.3 → 5.61.9. **`package.json` did not change** —
the existing carets already permitted both, so only `package-lock.json` moved.

`@clerk/shared` resolves to two nested copies, which is correct and not a conflict:
`3.47.8` under clerk-react and `4.29.0` under backend. Both are above their patched
thresholds (3.47.4 / 4.8.1).

**Three advisories, not the two the handoff listed. None applied — and the reason
matters more than the verdict:**

| Advisory | Severity | Why not affected |
|---|---|---|
| `GHSA-vqx2-fgx2-5wq9` (CVE-2026-41248) | Critical, 9.1 | The flaw is `createRouteMatcher` in `@clerk/nextjs`/`nuxt`/`astro`. None installed, zero references. `@clerk/shared` is flagged only because it hosts the code. |
| `GHSA-w24r-5266-9c3c` (CVE-2026-42349) | High, 7.6 | Bypass in Clerk's `has()` / `auth.protect()` when combining reverification with role, permission, plan or feature checks. Neither is used. The only `has()` in the codebase is a local `(v) => String(v ?? '').trim() !== ''` in the two merge modals. |
| `GHSA-gjxx-92w9-8v8f` | High | SSRF in the opt-in `clerkFrontendApiProxy`. Not enabled; no `proxyUrl` anywhere. |

**The handoff missed `GHSA-w24r`, and it was the one most worth checking** — it is
specifically about *organization* checks, and this app is org-scoped throughout. It
does not apply only because authorization is the homegrown `requireRole()` over
`verifyToken`, never Clerk's `has()`. That is the load-bearing fact; "not affected"
without it is an assertion, not a finding.

Also checked and not applicable: `GHSA-9mp4-77wg-rwx9` (Clerk webhook
verification). The only webhook verification here is Resend/Svix HMAC in
`email-inbound.mjs`.

**`payload.o.id` is unaffected by the SDK bump.** `verifyToken` calls `decodeJwt`
and returns claims unmodified, so the claim shape is set by Clerk's *server-side*
token format, not the SDK version. `auth.mjs` also falls back through `org_id` and
`active_organization_id`.

Verified: 69 tests, all five gates, build clean, and the Clerk APIs the app calls
(`verifyToken`, `createClerkClient`, `users.getUser`, `users.getUserList`,
`organizations.getOrganization`) all still resolve. Manually tested on dev — sign
in, org switch, org scoping, and a non-admin still receiving 403s.

---

### Open — found this session, not fixed

**Accounts/contacts bulk POST is unbatched.** One statement for every row; breaks above ~1,872 rows (35 columns against the 65,535 bind-parameter ceiling), and one bad row kills the whole batch. The overwrite path was fixed; the insert path was not. **Do this before the CSV Import + Export rollout**, which multiplies the files pushed through it.

**`onConflictDoNothing()` is decorative.** POST bulk branch of `accounts.mjs` and `contacts.mjs`. The only unique constraint is the `id` primary key and every id is a fresh `crypto.randomUUID()`, so it can never fire. The comment claims it "skips duplicates instead of erroring". **Nothing dedupes by name at insert time.**

**Optimistic local write before the request.** `ModalLayer` calls `setAccounts`/`setContacts` *before* the POST, so a failure leaves the UI showing records never saved. The `res.ok` check is correct — this is a write applied optimistically and never rolled back. (The equivalent in `ContactsTab`/`AccountsTab` delete paths **is** fixed; the CSV import path is not.)

**`importPresets` is written but never read.** Whitelisted now so the write lands, but nothing loads a saved preset, and the write replaces the array rather than appending because `SavePresetModal` cannot see existing settings. Needs a load path and a merge before it is a usable feature.

**An unexplained 500 on accounts bulk POST.** Reproduced once with a wrong-shaped payload. The POST path still discards the `requestId`; `saveBulk` surfaces it on the overwrite path only. Log entry never pulled.

**`anyModalOpen` in `App.jsx` does not know about settings-level modals.** They hold local state in their own components, so any settings modal that drops focus is exposed to the global-hotkey escape. `FL` is fixed; the structural gap is not.

**`storage.js` dynamic import buys nothing.** Dynamically imported by `AppHeader.jsx` but statically imported by ~80 modules, so rollup inlines it and warns every build. Dead intent; one-line fix.

### Doc drift found this session

- Handoff referenced `scripts/triage-dbfetch.mjs`; the file is `scripts/scan-dbfetch.mjs`.
- Handoff's gate command bypassed the bundle guard (`npx vite build`).
- Handoff claimed **24** blind `PUT settings` in `AuditDetail.jsx`; there are **4**. It also said 65 sites; the committed scanner reports 78 raw (65 = 78 minus 13 hand-triaged false positives).
- Project-knowledge copies of both docs were behind the live ones — no §18b3–§18b7. **Worth moving both docs into `sales-pipeline-v2/docs/`** so they travel with the code and appear in diffs; this has now cost time twice.

---

## 0A00. Prior Batch — SalesManagerTab Hoist, SPIFF Persistence & Claim Plumbing

> The SPIFF module looked finished and was not connected to anything. Admin config never persisted, the claim modal could not be opened by any code path, and its submit reported success on a 403. Also found: `vite build` was emitting a bundle **with no application in it**, exit 0.

### 0.1 The two inline components are gone — `check:inline` reports 0 user-visible

`ForecastTab` (9 props) and `AdminTab` (18 props) hoisted to module scope in `src/Tabs/SalesManagerTab.jsx`. The prop lists were derived by AST scope analysis rather than by eye, then cross-checked against the backlog entry — they matched exactly.

Two corrections to what the backlog said:
- `ForecastTab` is **~152 lines** (241–392), not 548. The 548 figure was the distance from `ForecastTab` to `AdminTab`, spanning `TeamTab` and `AuditTab`.
- `SalesManagerTab.jsx` is **LF**, not CRLF. The CRLF rule is about `App.jsx`; applying it here would have rewritten all 1,091 lines.

Two provably dead declarations removed from `AdminTab`: `calcCommission` and `inputStAdmin` (one occurrence each — their own declaration).

`SubTabs`, `TeamTab`, `AuditTab` remain inline. Churn-only, deliberately left.

### 0.2 The SPIFF Board never persisted anything

Three independent failures stacked:

- The editor called `setSettings` only — **no `dbFetch` at all**
- `spiffs` appeared **nowhere** in `settings.mjs` — not in GET, not in PUT
- There is **no global settings autosave** in `App.jsx`; every persisted panel PUTs explicitly

So every SPIFF an admin defined vanished on refresh. Commission tiers had the same shape but milder: `quotaData` *is* in both halves, only the save call was missing.

Fixed: `spiffs` added to both halves of `settings.mjs` (`extra` is `jsonb`, so **no schema change and no `drizzle-kit push`**), and every control now persists — text fields on blur, structural changes immediately.

`settings` PUT is `requireRole(['Admin'])` but `SalesManagerTab` renders for Admin **or** Manager, so a Manager editing these panels would have 403'd forever. Mutating controls are now gated to `isAdmin` with a read-only notice.

### 0.3 The claim modal was unreachable, and its submit faked success

`setSpiffClaimContext` was **never called anywhere**. The only two `setShowSpiffClaimModal` calls were both `(false)`. The state was fully plumbed — `useModalState` → `App.jsx` → `appContextValue` → destructured by `PipelineTab`, `ViewingContactPanel`, `ViewingAccountPanel` — and then never used. Wiring complete up to the button that was never built.

The submit was worse than unreachable:

```js
const result = await dbFetch(...POST...);
setSpiffClaims(prev => [...prev, result.spiffClaim || newClaim]);
} catch { setSpiffClaims(prev => [...prev, newClaim]); }  // "optimistic fallback"
```

`dbFetch` returns a `Response`, so `result.spiffClaim` was **always** undefined and the fallback ran on success too. No `res.ok`. The catch added the claim anyway. A 403 looked identical to a success.

Fixed: real `res.ok` check, real JSON parse, server error surfaced, submitting state to prevent double-fire. Error state lives on `ModalLayer` because the modal is an **IIFE, not a component**, and cannot own hooks.

### 0.4 Trigger design — not gated on the stage having just changed

The prompt fires when **stage is Closed Won AND an active SPIFF is still unclaimed for that deal**. Deliberately *not* `stageChanged`, because there is no row menu to hang a manual "Claim" button on (the `⋯` at `PipelineTab.jsx:613` is another unwired stub), so gating on the transition would leave every already-closed deal permanently unclaimable. Re-saving a Closed Won deal re-prompts; the prompt stops once everything is claimed.

Trade-off accepted: a rep who deliberately skips a claim is re-prompted on each save of that deal. Revisit with a dismissal flag only if it actually annoys someone.

Both write paths trigger it. The Kanban drag is a **separate PUT** and would otherwise have skipped the prompt silently; it also had a bare `.catch(console.error)`, so a failed stage change looked successful.

### 0.5 `vite build` was shipping a bundle with no app in it

`npx vite build` without `VITE_CLERK_PUBLISHABLE_KEY` produced a **212 kB bundle containing no application** — no tabs, no `SalesManagerTab`, nothing. Exit 0, green log, `✓ built in 8s`.

`main.jsx` does `if (!PUBLISHABLE_KEY) throw new Error(...)`. Vite inlines the missing env var as statically false, Rollup marks everything after the `throw` unreachable, and tree-shakes `createRoot(...).render(<App/>)` away. The bundle literally ends on that `throw`.

With the var set: **2,498 kB**. Confirmed pre-existing by stashing all changes and rebuilding at `c44e7e3` — byte-identical hollow bundle.

**Netlify sets the var, so production was never affected.** But a local "build passes" proved nothing, and if that var is ever renamed or dropped in Netlify's UI the build stays green and deploys a blank site.

### 0.6 `@babel/parser` was never a declared dependency

Both scanners import it; it resolved only transitively via `@vitejs/plugin-react → @babel/core`. A plugin bump that restructured deps would have silently broken both gates. Now an explicit devDependency.

npm installed **8.0.4** while `@babel/core` pins `^7.29.0`. Tested: both scanners produce **byte-identical** output under 7 and 8, including the full 76-entry churn listing. Both also fail loudly on a parse error (`check-tdz` prints `PARSE FAIL`; `check-inline` throws), so neither silently drops a file.

### 0.7 `dbFetch` triage — 65 sites, not 78

A first-pass scanner reported 78 discarded-`Response` call sites. **13 were false positives**: `.then(r => { if (!r.ok) … })` handles the Response, but the scanner peeled the `.then` off to find the `dbFetch` underneath and called it discarded. Verified against `useAccounts.js:12` and `App.jsx:349`. Acting on that list would have meant rewriting the entire data-loading layer.

Corrected triage — **65 sites**:

| Class | Count | Meaning |
|---|---|---|
| READ-DISCARD | 3 | a GET whose Response goes nowhere |
| BLIND-WRITE | 37 | mutation, no `res.ok`, no `.catch` |
| SWALLOWED | 25 | has `.catch`, so it *looks* handled — still cannot see a 403 |

62 of 65 are writes. **24 of the 37 blind writes are `PUT settings` in `AuditDetail.jsx`**; 5 more are `PUT users` across `TeamsDetail` / `TerritoriesDetail`. Not 65 scattered fixes — a handful of files with repeated patterns.

### 0.8 SPIFF home panel + modal restyle

`SpiffPanel` added at module scope in `HomeTab.jsx`, right column under `QuotaBar`. Shows active SPIFFs (name, rate, description) and the signed-in user's own claims with status. Gated to `User` / `Manager` / `Admin`; returns `null` when there is nothing to show.

Status values are `pending` / `approved` / **`rejected`** / `paid` — the label is "Rejected", matching the data, not "Denied".

The claim modal was restyled from its slate/purple palette to the warm stone/ink language per `accelerep-style-guide.md` §2/§5/§8/§9. The ⚡ emoji was replaced with the gold-tan left bar used on tab headers.

`condition` is now editable in the SPIFF Board as "Description" — it was already in the object shape and already rendered by the claim modal, but had no input anywhere.

---

## 0A0. Prior Batch — Inline-Component Audit

> The backlog item named three files. **All three were already clean.** The problem was real but lived elsewhere, and 81 raw hits triaged down to 5 that actually mattered.

### 0.33 The audit item was wrong about where the problem was

`TasksTab`, `LeadsTab` and `PipelineTab` — the three files the backlog named — have **zero** inline components between them. That entry had been describing a problem that was not there, and would have consumed a session confirming nothing.

Scanning all of `src/` instead: **81 components declared inside another component and used as a JSX element type.** Concentrated in `ReportsTab` (55) and `AccountsTab` (7).

### 0.34 Most of the 81 do not matter — the triage that made this tractable

A remount is only USER-VISIBLE when the component owns something lost on unmount: focus in a form control, its own hook state, or a DOM ref. A stateless `<HBar>` or `<SecHdr>` wrapper remounts too, but nothing observable changes — that is churn, not a bug.

**On that basis: 5 of 81 were user-visible.** Without the distinction this reads as an 81-item rewrite of two enormous files; with it, it is five targeted fixes.

Three fixed:

| Component | Symptom |
|---|---|
| `ContactSearchField` (ContactModal) | Text input setting **parent** state — focus lost after every character. The textbook case. |
| `EntitySelector` (ReportsTab) | Search input; `autoFocus` masked outright focus loss, but the caret jumped to the end mid-word. |
| `SSelect` (AuditDetail) | Changing one setting remounted every `<select>` in the popover, closing open dropdowns mid-choice. |

`check-tdz.mjs` was run after each hoist and confirmed no dangling closure reads — which is exactly what it exists for, given hoisting-without-re-parenting caused six crashes in earlier batches. `ContactSearchField` needed three props threaded (`allContacts`, `handleChange`, `openNestedNewContact`); the other two were already fully prop-driven.

**Two deliberately left**, both in `SalesManagerTab`: `ForecastTab` (548 lines, 9 props to thread, **owns `useState` that is discarded on every parent render**) and `AdminTab` (~300 lines, 18 props). Large moves where a mistake is expensive; they want a dedicated pass, not the tail of a long session.

### 0.35 New tool — `scripts/check-inline-components.mjs`

`npm run check:inline`. Reports only components declared inline **and** used as a JSX element type — a capitalised helper that is merely CALLED is correctly ignored. Each finding is tagged `USER-VISIBLE` or `churn only`.

Validated against a fixture with a known answer before its output was trusted, including the merely-called case and a nested two-deep declaration.

**Output design matters more than it sounds.** The first version printed a line for every one of ~120 files, burying the two real findings under 410 lines of "no inline components". Now:

| Command | Lines |
|---|---|
| `npm run check:inline` | user-visible only — **5** |
| `-- --churn` | plus stateless wrappers — 98 |
| `-- --all` | plus clean files — 410 |
| `-- --help` | what the two severities mean |

Exit code is `1` only for the user-visible class. Churn is worth fixing eventually but must not fail a check that might one day gate a commit.

**Two bugs in the tool itself, both caught by running it rather than reasoning about it:** every argument was treated as a file path, so `--all` was opened as a filename and died with `ENOENT`; and the default output was too noisy to be useful. A checker whose signal is hard to find stops being run.

---

## 0A. Prior Batch — Calendar Disconnect, Email Signatures, Record-Number Query Performance

> Three contained features, and three incidental bugs found while building them — a wiped profile field, a TDZ in my own first draft, and a lexicographic-`MAX` trap that would have reissued live record numbers. Details in 0.31.

### 0A.29 Calendar disconnect — the endpoint already existed

`calendar-connections.mjs` had a working `DELETE` all along, correctly authorised (a user can only delete their own; org connections are Admin-only). **This was purely client wiring** — no new function. Worth checking before building; the assumption going in was that an endpoint would be needed.

The avatar Calendar tab now shows **which** account is connected (`calendarEmail`) and since when (`connectedAt`), not just that one is. The connection record loads **lazily, only when the tab is opened** — this panel renders on every screen, so an eager fetch would cost a request per page load for a tab most users never touch.

After a successful delete it **re-fetches rather than assuming**: `fetchCalendarEvents` sees `connected: false`, which clears app-wide state so the tab, Home's status strip and the plate all revert together without a reload. Five paths tested; the failure ones matter most — a 403, 404 or unparseable 500 all leave `connected` untouched and surface the server's own message.

**Deliberate wording:** *"Disconnecting removes the stored connection and stops syncing. To revoke Accelerep's access on Google's side as well, remove it from your Google account permissions."* Deleting the row stops us reading the calendar but does **not** revoke the OAuth grant; claiming otherwise would overstate what the button does.

### 0A.30 Personal email signature

**No schema change** — `users.profile` is already a jsonb blob holding `firstName`/`phone`/`title`, so `emailSignature` lives alongside them.

**Plain text, escaped server-side.** A signature is user-authored content that lands in a *customer's* inbox, so a rich-text field would be an injection path into every recipient's mail client. Escaping happens before newline conversion — doing it the other way round would turn the `<br>` tags into literal text. Tested against `<script>`, `<img onerror>`, attribute-breaking quotes and bare ampersands; line breaks survive via `white-space: pre-line`.

**Read server-side from the sender's own row, never accepted from the request body** — otherwise a client could put arbitrary text out under someone else's name.

It replaces the quote email's *"This quote was prepared for you by your account representative"*, a line that carried no sender identity at all. With no signature set, that generic line still shows, so nothing degrades for users who skip it. A failed lookup is caught and logged; it never blocks the quote going out.

### 0A.31 Record-number generators — full scan → indexed MAX

All three (`nextCustomerNumber`, `nextJobNumber`, `nextQuoteNumber`) selected **every row in the org** and found the maximum in JS, on every single create.

**The obvious fix is wrong.** `MAX(customer_number)` is one indexed lookup, and it would reissue numbers already in use — zero-padding only preserves ordering while the digit count is constant:

```
rows: CUST-9999, CUST-10000, CUST-10001
MAX(text)    -> CUST-9999    <- collides with live numbers
MAX(numeric) -> CUST-10001   <- correct
```

The unique indexes from the prior batch would *catch* that collision, but only as something to retry — and every retry would propose the same losing number. **Quote numbers pad to three digits**, so that fuse is shortest: the bug appears at 1000 quotes in a year, not 10000.

So the numeric part is extracted and `MAX`'d as an integer, with the year prefix narrowing the scan further on jobs and quotes.

**Verified rather than assumed:**
- SQL validity, by parsing both query shapes with `pglast` (a real PostgreSQL parser) rather than trusting that Drizzle's `sql` template emitted something valid.
- Behavioural equivalence, by running the old JS against the new SQL semantics over ten row sets — gaps, nulls, hand-edited garbage, only-garbage, past-4-digits, lowercase prefix.

**One genuine divergence found and fixed.** The old customer code called `.trim()`; the SQL regex did not. A stored `"  CUST-0007  "` would have been ignored and its number reissued. `TRIM()` is now applied in both the filter and the extraction, on **all three** — jobs and quotes never trimmed, but erring toward *counting* a number is the safe direction for a generator.

### 0A.32 Incidental bugs found

- **`mobile` was wiped on every profile save.** The Save Profile button sent it, but the load only seeded firstName/lastName/email/phone/title — so the field rendered blank and each save overwrote a stored mobile number with `''`. Nobody would report this: it looks like the field was simply never filled in. Found because the signature field would have hit the identical trap.
- **A TDZ in my own first draft of the signature work** — the lookup was placed after the template literal that consumed it (`emailHtml` at line 141, `signatureHtml` at 204). Caught by reading the line numbers back before delivery, not by a tool: `check-tdz.mjs` covers component scope, not the inside of a Netlify handler.

---

## 0B. Prior Batch — planWeek Constraints, Settings Save Integrity, Personal-Preferences Consolidation, Calendar Visibility

> **The scanner earned its keep three more times.** `scripts/check-tdz.mjs` was widened twice in this batch, and each widening immediately found real crash bugs in code it had previously been blind to — including four in files it had never inspected at all. Full history in §0B.28.

### 0B.24 `planWeek` — crew size and equipment

Mass-scheduling ignored three things, each producing proposals the single-job scheduler would have refused:

1. **`crewSize`** — one technician assigned regardless, so a job needing three was silently under-crewed.
2. **`equipCategories`** — availability never checked, so two jobs in one run could both claim the last unit.
3. **Placements made EARLIER IN THE SAME RUN were invisible** to equipment checks. Technician load already had a running `busy` ledger; equipment needed the same, or the first two proposals each looked fine in isolation.

**Ordering decision that matters:** a crew must work the SAME hour, so the slot is chosen first and the crew assembled from whoever is free then — not the reverse. Picking the three best-scoring techs and then hunting for a common slot succeeds far less often, because top scorers are exactly the people most likely to be busy.

**Partial crews are skipped, not proposed.** A job that looks scheduled but is two techs short is worse than one still visibly in the queue. Skip reasons distinguish causes that need different fixes: *"only 2 available"* (hire / reduce crew) vs *"no common slot"* (scheduling) vs *"equipment not free"*.

Also found while wiring it: the apply loop hardcoded `coTechIds: []` and the optimistic update used `[pr.tech.id]` — so even a correctly computed crew would have been **written and displayed as a one-tech job**.

### 0B.25 Settings navigation guard + save integrity

**The dirty flag was not dead** — `App.jsx` has a working nav guard for top-level tab clicks, and 13 panels report dirty correctly. But it covered the *least likely* exit. **`onBack` cleared the flag and left with no prompt**, and "← Back to settings" is how people actually leave a panel. Opening a different panel while dirty was equally unguarded.

`settingsSaveRef` was populated by every dirty panel and **called by nothing**, so "Save changes and continue" is now a real option rather than a manual round trip.

**Then the panel saves themselves turned out to be worse than "doesn't rethrow".** Four of them — Company Profile, Fiscal Year, Buyer Personas, and the generic FlatListDetail — did this:

```js
} catch(e) { console.error('save fiscal year', e); }
setDirty(false);        // OUTSIDE the try
```

Two failures compounding: `dbFetch` never throws on 4xx (§18b1) so a 403 never reached the catch, and `setDirty(false)` ran regardless. **Those four have been discarding failed saves silently**, and FlatListDetail is generic so the bug applied to every settings key rendered through it. None had any error surface at all.

All 14 registered saves now use the existing `putSettings` helper (written for exactly this and never adopted), surface errors, and rethrow. `DetailPageChrome` gained an `error` prop to match `CategoryDetailChrome`. The timing-based workaround in the nav guard — polling `settingsSaveRef` after a delay — was deleted.

**Self-inflicted bug caught before delivery:** the first pass put `throw e` in the catch, which skips the `setSaving(false)` after the try — the panel would have sat on "Saving…" for the rest of the session.

### 0B.26 Personal preferences consolidated to the avatar menu

Settings is Admin-only (`App.jsx` gates it at both the nav button and the render), which made two things in `SettingsTab` unreachable: the `canAdmin` Manager path, and the entire `PersonalView` fallback. Personal preferences were therefore inaccessible to non-admins while Admins had two routes to them.

**Investigating what to migrate found there was nothing to migrate.** All three Personal-scope panels were mockups:

| Panel | Reality |
|---|---|
| Calendar sync | Connect/Disconnect button had **no `onClick`**. Four sync toggles in local state, saved nowhere, read by nothing. |
| Email signature | **Hardcoded fake signature** — invented job title, made-up `@accelerep.com` address, invented quote. Three templates with **fabricated stats** (42 uses, 38% open rate). Every button dead. |
| My API tokens | "+ Generate token" did nothing. Permanently empty. |

Fabricated metrics presented as the user's own data are worse than an empty state. `PersonalView.jsx` (262 lines), the Workspace/Personal scope toggle, and the four `scope:'personal'` catalogue entries are deleted.

### 0B.27 Calendar visibility — connected was indistinguishable from absent

The only calendar control in the app was the Home prompt, gated on `!calendarConnected`. **The moment a user connected, every trace of the calendar vanished** — and because meetings are folded into "ON YOUR PLATE" rather than shown as a calendar, a connected calendar with no events produced nothing anywhere. No confirmation, no way to reconnect after revoking access in Google.

Two fixes:
- **Calendar tab in the avatar panel** (Profile · Notifications · Calendar): status, event count, Connect/Reconnect, Refresh. Reuses the same `calendar-oauth-start` flow HomeTab calls — one flow, not a second implementation that can drift.
- **Home strip always states which it is**: the connect prompt when disconnected, or *"N meetings today"* / *"Calendar connected — no meetings today"* with the next upcoming event.

Deliberately **no sync-option toggles** — that was the mock being deleted. **Disconnect deferred**: it needs an endpoint to revoke the token and clear the credential; the tab says to revoke via Google account permissions meanwhile.

### 0B.28 ⚠️ `check-tdz.mjs` was blind to whole files

Adding the Home strip needed `calendarLoading`, which was not destructured — and **the scanner did not catch it**. `checkUndefined` only inspected `const X = () => …` arrow components. `HomeTab` is `export default function HomeTab()`, so **the entire file had never been scanned**.

Widened to cover function declarations and default exports. It immediately found **four pre-existing crash bugs** in files it had never inspected:

| Component | Reads | Effect |
|---|---|---|
| `RecommendationReport` | `isMobile` | throws on render |
| `ActivityHistoryTab` | `setViewingAccount` | throws when opening an account |
| `PipelinesSettingsPanel` | `showConfirm` | **deleting a pipeline with opportunities threw instead of confirming** |
| `ViewingContactPanel` | `setContacts` | throws on that path |

All four are the §0PB.21 shape — a component reading a value from a scope it does not have — and all four were fixed by pulling from `useApp`, which already exposed each one.

**Scanner history, worth keeping because the pattern is consistent.** Five corrections, each one a false positive that would have sent us rewriting working code:

1. Counted **object property keys** as references (`{ equipCategories: [] }`).
2. Missed `OptionalMemberExpression` — `settings?.industries` is a different AST node type.
3. Ignored **nested scope** — an IIFE's own `const now` read as an outer reference.
4. Crashed on **concise arrow bodies** (`() => expr` has no `body.body`).
5. Missing **browser globals** — `Blob`, `FileReader`, `prompt`, `catch` params.

Each widening found real bugs immediately, and each needed verification against a known-good case first. Current state: **134 files, 0 issues.**

---

## 0PB. Earlier Batch — Customers Redesign, Won→Dispatch Bridge, Quotes Hardening, Record-Number Integrity, Template Axes

> **Two production incidents this session, both mine, both invisible to every existing gate.** A quote-save regression from an allowlist change, and a Dispatch crash from hoisting a component out of its parent. Babel passed and `vite build` passed on both. The tooling response — `scripts/check-tdz.mjs` extended to catch undefined references — then found a *third* instance I had not been looking for. §0PB.20 and §0PB.21.

### 0PB.13 Dispatch customers — three-column redesign

Rebuilt `CustomersView` from a Claude Design handoff: facet rail · list · service-customer record. Every design token mapped 1:1 onto the existing `T`, including `serif`, so nothing new was introduced.

**The design assumed four fixed contract tiers with hardcoded rank, colour, SLA and PM text.** Accelerep has arbitrary `dispatch_service_plans` rows, so all of that is **derived** instead: plans ordered by annualised value, coloured from a fixed palette by rank, "No plan" always last. Adding a fifth plan needs no code change.

- **Contract value is annualised** — `price` × billing period, `per_visit` multiplied by `visitsPerYear`. That is what makes the rail's ledger column and the header total summable across plans on different billing cycles.
- **Facet counts exclude their own group**, so a chip's number answers "what would I get if I clicked this" rather than collapsing to zero once two filters combine.
- **Multi-select within a group (OR), AND across groups.**
- The edit form was preserved verbatim and hoisted to module scope behind an "Edit details" button — the design's record pane is read-only, and replacing the form outright would have lost every field.

**Equipment count deliberately not built.** The design's "14 assets" implies customer-site serviceable equipment (rooftop units, chillers). `dispatch_equipment` is the org's own tool inventory with serial numbers, calibration and checkout. Different entities that share a word. Substituted **Overdue PM** and visit counts rather than render a number with nothing behind it. Jeff reviewed and agreed: **no `dispatch_customer_assets` table** — adding `customerId` to `dispatch_equipment` would collapse "cart checked out to Morgan today" and "chiller #3 on the roof" into one table with half the columns null in each case.

### 0PB.14 Property types are now org-configurable

Was `CUSTOMER_TYPES`, a hardcoded four-value array. Now `settings.dispatchPropertyTypes`, seeded with the same four, edited at **Settings → Dispatch → Property types**.

**Ids are load-bearing.** `dispatch_customers.customer_type` stores the id, so the seeded ids must stay `commercial | residential | industrial | government`. Labels are freely editable; the id is shown read-only with a tooltip. New types get a slug from the label, previewed before adding.

- A type **in use cannot be deleted** — live "N in use" count, × disabled until zero.
- A type that disappears anyway is **merged back in as `(unlisted)`** from the values still on customer records, so its customers stay filterable.
- The edit select emits an explicit `Unlisted type (x)` option rather than falling through to the first entry and silently reassigning the customer.

Note this is a **third** customer-type vocabulary and deliberately so: CRM account tier (`customerTypeTiers`), premises segment (`dispatchPropertyTypes`), coverage tier (`dispatch_service_plans`).

### 0PB.15 Closed Won → Dispatch bridge, template-driven

The synthetic `auto_`-prefixed rows for won opportunities were built **inside the mount-only loader effect** (`[]` deps). Templates come from `settings`, so resolving them there froze against whatever settings held at mount. Moved to a `useMemo`; creating the real job now makes the placeholder vanish on the same render.

**Fabricated defaults removed.** Was hardcoded `crewSize: 1, durationHrs: 4, minLicense: 'Journeyman'` — numbers that looked like decisions. Now template-derived, and **null when nothing matches**, so the UI says "unset" instead of inventing.

**Two dead ends closed.** The placeholders were reachable but not actionable: scheduling one PUTs to `dispatch-jobs?id=auto_…` which 404s. The crew builder now refuses with a reason, `planWeek` excludes placeholders entirely, and a banner offers **Create job** — pre-filled, carrying `opportunityId` so the placeholder self-retires on save.

**On the module-toggle question.** Because the bridge computes rather than writes, a CRM-only org (`settings.dispatchEnabled` false) needs no special handling: the tab does not render, the memo never runs, no rows exist, and toggling the flag either way cannot strand data. **If auto-create is ever moved server-side — a webhook or scheduled function that WRITES on stage change — it must check the flag first.** That is the one place it becomes load-bearing rather than cosmetic, and it is recorded in the file.

### 0PB.16 Quote numbers moved server-side

`quotes.quote_number` was generated **in the browser** (`useQuotes.js`) from whatever quotes that user had loaded, and sat in the PUT allowlist — so it was both collision-prone and editable, on the one document customers actually see.

Now issued in `quotes.mjs` and immutable. The wrinkle: **v2 of Q-2026-004 must stay Q-2026-004**, so a blind "new number per POST" would have broken versioning. `resolveQuoteNumber` treats a client-supplied number as a **reference to verify, never a value to store** — the row must already exist in this org on that opportunity. A client cannot set or steal a number by any route.

### 0PB.17 Quote versioning — three latent bugs

Found while investigating why a new version came back empty (the real cause was §0PB.20). All three were real:

1. **It cloned the quote being VIEWED, not the latest.** The new version is numbered `maxV + 1`, so sitting on v1 with a v2 present produced a "v3" carrying v1's contents — silently discarding v2's work.
2. **`dealDiscount` was never copied**, so a deal-level discount reset to 0% on every version.
3. **Shallow copy shared item objects** — editing a quantity on the new version mutated the old one in local state until reload.

Also: the **3-version cap was removed** (hardcoded in two places, nothing server-side enforced it), and **empty states added** to both read paths — `lines.map()` over an empty array rendered a void under the column headers, making "no products" visually identical to "save silently failed".

### 0PB.18 Record-number integrity

Unique indexes plus retry, closing the read-max-then-add-one race on all three generators.

**The catch: quote versions SHARE a number by design.** A `(org_id, quote_number)` index would have made versioning impossible. Scoped `(org_id, quote_number, version)` instead. The dispatch columns are nullable and Postgres treats NULLs as distinct, so pre-numbering rows are unaffected.

**An index alone converts a silent duplicate into a 500 the user sees**, so `withNumberRetry` in `_lib.mjs` is the other half. Two details that matter: the number is issued **inside** the retry (reissuing outside would retry with the same losing number forever), and **only 23505 is retried** — a NOT NULL violation must surface at once, not be retried into a timeout.

`db/check-duplicate-numbers.sql` is the pre-flight: a unique index cannot be created over data that already violates it. Read-only, run per environment before `drizzle-kit push`. Came back clean on dev.

### 0PB.19 Template "Applies when" — the ctype axis, decided

The template tied to ONE value from `settings.customerTypes`. Two problems: one value could not express "applies to prospect AND customer AND partner"; and the axis was arguably wrong, since a new install needs the same crew, hours and licence whatever the relationship — what varies it is the **premises**.

**Resolved as both axes, both optional multi-selects, empty meaning "any".** Field relabelled **Applies when**.

Matching uses **specificity**: both axes beats one axis beats catch-all, so a general "Install" template coexists with a "Residential install" override without fighting. **Ambiguity is refused, not guessed** — two equally specific matches yield no template, because a wrong template silently supplies wrong crew, hours and licence, which is worse than supplying none. **Missing data is a miss**: an account with no type set does not match a tier-restricted template.

Legacy `ctype: 'X'` migrates to `ctypes: ['X']` and matches exactly as before. The old "Customer type linked" sanity check was decorative (`ok: true` unconditionally); it now flags a real hazard — more than one catch-all template makes matching arbitrary.

### 0PB.20 ⚠️ INCIDENT — every quote save failed in production

Removing `quoteNumber` from `ALLOWED_FIELDS` (§0PB.16) was right in intent. **But PUT is implemented as an upsert:**

```js
.insert(quotes).values({ ...payload, createdAt })
.onConflictDoUpdate({ ... })
```

`quote_number` is `NOT NULL`. **Postgres validates NOT NULL while building the tuple — BEFORE `ON CONFLICT` can divert to the update** — so the statement failed even though the row existed. Every quote PUT errored: line-item saves, status changes, everything.

**It presented as a display bug.** `handleSaveQuote` returns `null` on failure rather than throwing, so `handleSaveLineItems` awaited it, ignored the result, and the editor closed as though saved. A rejected write with no error anywhere — the "controls that appear to work" pattern, from this project's own rules.

Fix: supply the existing `quoteNumber` to the insert half while keeping it out of `set` so it stays immutable; and convert the null return into a throw so the editor stays open and says why.

**Lesson: removing a field from an allowlist is a WRITE-PATH change.** Every write path that touches the column must be traced, and an upsert counts as an insert. Tracing only the readers is what caused this.

### 0PB.21 ⚠️ INCIDENT — Dispatch tab crashed, `linkedAccount is not defined`

Hoisting the customer edit form to module scope was correct — it was remounting on every keystroke — but it still read **three** things from the parent's closure: `linkedAccount`, `save`, and `copyFromAccount`, the last of which **never existed anywhere in the codebase**.

`check-tdz.mjs` could not catch this: it checked *ordering*, not whether a binding exists at all. Extended to detect undefined references, and it immediately found a **pre-existing instance of the same bug**: `ActionEditor` in `AutomationsDetail.jsx` was hoisted without its `sel`/`inp` style objects, so Settings → Automations would crash on adding an action.

**The scanner needed two corrections before it could be trusted** — it crashed on concise arrow bodies, and produced 19 false positives from missing browser globals and unrecognised `catch` params. Final state: **135 files, 2 real bugs, 0 false positives.** It then caught a *third* real case later the same session, when a signature edit of mine was rolled back and `confirmDiscard` was passed but never destructured.

### 0PB.22 State-machine audit — CustomersView and TechniciansView

After three bugs from one rebuild, audited the view's state by transcribing it into an executable model — **including the real dependency arrays**, which turned out to decide the answer.

Two of the first three "failures" were harness artifacts: the model ran effects on every transition, where React runs them only when deps change. Same trap as the scanner — a checker that reports wrongly is worse than none.

**Real bug found (CustomersView): `list` is the FILTERED list.** Editing a customer and then clicking a facet that excludes them dropped them from the list, re-pointed `selectedId` at someone else, and loaded that customer over the in-progress edit. Fixed: the auto-select effect no longer re-points while the form is open.

**Real bug found (TechniciansView), worse:** it has no `editing` flag and one effect on `[selectedId]`. `startNew` clears `selectedId` first, so with a technician selected, **"+ New" produced no form at all**. Guarded on `draft._isNew`.

### 0PB.23 Unsaved-changes prompt

Reuses the app-wide `showConfirm` — already in context, DispatchTab simply was not consuming it. **Every path that abandons a draft routes through one `guarded()` function** rather than a confirm bolted onto each call site, which is how one path ends up missing it. Covers switching rows, "+ New", and Cancel in both Dispatch views.

`draftIsDirty` compares **field-by-field, not by JSON string**: drafts carry UI keys (`_isNew`) and records carry server keys (`updatedAt`), so a whole-object compare would report every open form as dirty. Defaults like `commercial`/`active` do not count as edits; typing a name or picking a plan does.

**Not extended to Settings panels** — they use a different mechanism (`setSettingsDirty` + `CategoryDetailChrome`), and whether that flag actually blocks navigation anywhere is unaudited. See §9.

---

## 0X. Historical — Service Plans, Recurrence, Fleet Convergence, Customer Segmentation

> **Theme of the session.** Every item below started as "add a small feature" and turned out to be a correctness problem wearing a feature's clothes. Four separate cases of a value that was *displayed* but never *set*, *scored* but never *reached*, or *edited* in one place and *read* from another. The pattern from the prior session held: **when something looks fine, check that the write actually landed and the gate actually gates.**

### 0X.1 `preferredTechId` — a circular score, not a missing field

The horizon entry said the field was unsettable and the backend needed building. **Both halves were wrong.** The column existed on `dispatch_customers`, and `dispatch-customers.mjs` already normalised it on read, accepted it on POST, and listed it in the PUT allowlist. Only a `<select>` was missing.

The real defect was in the client normaliser:

```js
preferredTechId: j.assignedTechId || null,   // WRONG
```

`dispatch_jobs` has no `preferredTechId` column, so the job's "preferred tech" was synthesised from whoever was **already assigned**. The crew-builder rule was therefore circular:

- On an **unassigned** job — the only case the crew builder runs on — it was always `null`, so the +7 preference bonus **never fired**.
- On an **assigned** job it awarded the bonus to the tech already on it, and the detail panel rendered that back as "Preferred", which is why it always looked correct.

Fixed to resolve from the customer record (`cust?.preferredTechId`).

**Roster vs. filtered pool.** `CrewBuilderView` receives `techs={filteredTechs}` — filtered by the dispatcher's skill/vehicle/licence/team controls. Resolving a preference against that pool would report a *filtered-out* tech as "no longer on the roster". It now takes `allTechs` separately: candidates respect the filter, preference resolution uses the full roster.

**The preference note distinguishes five states** rather than collapsing them: not on roster · hidden by the current filter · blocked (names the blockers) · below the shortlist cutoff (`score >= 50`, top 5) · simply out-scored. The score stays soft at +7 and never blocks — a customer preference must not be able to strand a job.

### 0X.2 Job template picker in New Job

`applyJobTemplate(form, tmpl, cfg)` at module scope — pure, testable, returns `{ next, applied, skipped }`.

**Values that no longer exist in the org's vocabulary are reported as skipped, never written.** A `minLicense` the org has since renamed would otherwise fall through to the first `<option>` and silently downgrade the job's requirement from Master to Apprentice — the same silent-fallthrough class as the dangling-select bug in 0.1.

**Fill-empty would have been a no-op.** Every template-owned field already has a non-empty default (`crewSize:1`, `durationHrs:2`, `minLicense:'Journeyman'`, `priority:'normal'`), so the modal's existing "only fill where empty" convention would have applied nothing. Applying a template has to overwrite.

**Compounding guard.** `appliedTemplate.prevForm` holds the form as it stood before the template was applied. Switching from template A to B re-applies from that baseline rather than stacking; Undo restores the same baseline. Without it, applying two templates leaves a form matching neither.

### 0X.3 Two uneditable inputs in the templates panel

Both coerced inside `onChange`, which fights the keystroke:

- **Crew size** — `value={selected.crew||1}` with `parseInt(e.target.value)||1`. Backspace → `''` → `NaN` → `|| 1`, so the field rewrote itself to `1` before the next keystroke landed. It could never be empty, so it could never be replaced.
- **Default duration** — worse. Its value was the *derived string* `hrs + ' hours'`. Every keystroke was parsed back to a number and re-rendered as `"2 hours"`, pinning the caret. Completely locked.

Fixed by holding raw text while typing and coercing on blur (`commitNumber`), with the same guard in `handleSave` so a field left mid-edit can't reach the blob. Duration is now a real number input and the label carries the unit.

### 0X.4 ⚠️ Vehicles & Equipment — two sources of truth, wrong one being edited

The largest piece of the session, and the one worth remembering.

| Consumer | Was reading |
|---|---|
| Settings → Vehicles & equipment | `settings.dispatchVehicles` (blob) |
| Settings → Crews | `settings.dispatchVehicles` (blob) |
| **Dispatch board vehicle filter** | `dispatch_vehicles` **table** |
| **Technician "Assigned vehicle"** | `dispatch_vehicles` **table** |

Adding a van in Settings made it appear **nowhere** a dispatcher would look. Equipment had the same split with the table having no UI at all.

**Resolved onto the tables.** Both blob keys are **retained, not deleted** — they are the only way to translate legacy template ids during migration, and deleting live data to tidy up is not worth the risk. Nothing reads them for decisions any more.

**The modelling decision that drove everything: one equipment row = one physical unit.** "Two pressure testers" is two rows sharing a `category`, not a `qty` field. That forces requirements to name a **category** — a job needs *a* pressure tester, not asset #A-1042.

A quantity cannot express "one of the two is in the shop". Rows can:

| Scenario | Blob (`qty: 2`) | Table (2 rows) |
|---|---|---|
| Two units, one rival job | clear | clear |
| Two units, two rivals | blocked | blocked |
| **One unit in maintenance, one rival** | **clear — wrong** | **blocked** |
| Both units out of service | clear — wrong | blocked, names why |
| Category with no units | — | reported, not silent |

`checked_out` units still count as capacity; the overlap test decides whether they are free at that hour. Only `maintenance` and `out_of_service` remove capacity.

**`dispatch_jobs.equipment_ids` was free to repurpose.** No client had ever written it (every POST sent `[]`), and checkout is tracked the other way round on `dispatch_equipment.checkedOutJobId`. So it now stores required **categories** with no migration and no schema change.

**New panel is table-backed with no "Save changes" button** — each record writes on its own save, because a whole-blob PUT clobbers concurrent edits and equipment state changes when a tech checks something out.

**Idempotent import.** A card appears only while un-migrated blob entries exist, states exactly what it will create, deletes nothing, and derives row ids from the blob ids. Because the POST upserts on `id`, **re-running cannot duplicate**. `qty: 3` becomes three units sharing one category.

### 0X.5 Equipment as a scheduling constraint

`equipmentConflicts(job, allJobs, units, dateStr, probe)` — a job is blocked when every usable unit of a required category is committed to an **overlapping** job that day.

Overlap uses the same hour-window test as technician double-booking, so there is one notion of "at the same time" in the file. **A rival job with no start time is treated as holding the item all day** — it cannot be overlap-tested, and assuming no clash would be a fabrication.

**Two surfaces, deliberately.** A crew-builder banner while the dispatcher is still choosing a date, and a hard gate in `handleSchedule` once the start time that defines the window exists. Equipment is job-level: putting it in `scoreTech` would stamp an identical blocker on all five candidates.

### 0X.6 Vehicle class requirement — the opposite placement

**Schema change:** `dispatch_jobs.required_vehicle_type varchar(50)`, nullable, additive only. Ran `drizzle-kit push` per environment **before** deploying code (§18c).

A vehicle attaches to a **technician** (`dispatch_vehicles.assignedTechId`), so "needs a bucket truck" filters *who can serve the job* — a per-technician blocker in `scoreTech`. This is the mirror image of equipment, and the distinction is the point:

- **Equipment** → job-level shortage → gates in `handleSchedule`
- **Vehicle** → per-technician capability → blocks in `scoreTech`

Replaces `if (tech.vehicle) score += 3`, which rewarded owning *any* vehicle and never told a bucket truck from a hatchback. Now blocks with a named reason: wrong class, no vehicle assigned, or their vehicle in maintenance. Threaded through all four `scoreTech` call sites, including both inside `planWeek`.

Requirable classes are **derived from the fleet**, so a class nobody owns cannot be required.

### 0X.7 Job templates — Edit action was missing

The ⋯ menu offered Duplicate / auto-create toggle / Delete and **no Edit**. The row *was* clickable but nothing said so. Added Edit as the first menu item, and the template name now renders as a dotted-underline link.

### 0X.8 Dispatch customer segmentation (plan step "A")

No schema change. `CustomersView` now receives `jobs` and derives service history — **a denormalised `jobCount` would need maintaining on every job write and would be wrong the moment one was deleted.**

- Four filter axes: service plan · customer type · service history (`never` / `once` / `repeat` / `active`) · agreement expiry (`expired` / `renewing within 60 days`)
- Chip counts are computed against the search but **independent of the other filters**, so a chip's number tells you what you would actually get by clicking it
- Grouping by plan, type, or history with sticky headers and per-group counts
- Service summary strip in the detail pane: jobs completed, last served with day gap, upcoming with next date, plan, renewal warning

Cancelled jobs are excluded from service history — a cancelled job is not service rendered.

**Bug found while building it:** `agreementExpiry` has existed on the table since creation **with no control anywhere to set it**, so every renewal warning was unreachable and the field could only ever be null. Added a date input, disabled unless a plan is selected. The endpoint already accepted it on POST and PUT.

### 0X.10 Service plans as a first-class entity (plan step "B")

`serviceAgreement` was a varchar label with nothing behind it: no definition, no covered scope, no cadence, no price, no link to work performed. Now a `dispatch_service_plans` row.

**Schema:** new table + `dispatch_customers.service_plan_id` and `.plan_start_date`.

**Scope decision — plan per CUSTOMER**, not per location. `dispatch_service_locations` exists and per-site coverage is a real case (a property manager with different terms per building); if it is ever needed the migration is a nullable `location_id` on the join, not a reshape. That is recorded in the table comment.

**A plan carries no staffing.** No crew size, duration, skills or licence — it references a job template via `visitTemplateId`. Plan = *what is covered, how often, on what terms*. Template = *how a visit gets staffed*. Duplicating crew rules onto the plan would give two places to change them and one to forget.

**One field is authoritative, the other derived.** The first version let `visitsPerYear` be overridden independently; testing showed `quarterly` + an override of 6 kept `intervalDays: 91`, so recurrence would schedule 4 while the plan promised 6. Now:

| Cadence | Authoritative | Derived |
|---|---|---|
| annual / semiannual / quarterly / monthly | the cadence | interval **and** visits |
| custom | `intervalDays` | `visits = round(365 / interval)` |

A supplied visit count is **ignored, not merged**, and the form shows the derived value read-only rather than offering an input the server discards. A cadence change on PUT recomputes both.

**`coverageOf()` resolves four states** so the two eras coexist honestly: on a plan · on a *deleted* plan (`plan deleted` badge, not silently "no plan") · legacy label only (`Premium · unmapped`) · uncovered. `serviceAgreement` is **retained** — it is the only record of pre-plan coverage.

**Deleting a plan in use returns 409** with the customer count, since `service_plan_id` has no cascade; `active: false` is the retire path. Seeding from legacy labels creates one plan per label with ids derived from the label, so re-running cannot duplicate — and it deliberately does **not** reassign customers.

### 0X.11 Plan recurrence and the Service Due queue (plan step "C")

**Visits are COMPUTED, not generated.** Nothing is written until a dispatcher acts. A plan running five years costs one pass over that customer's plan jobs rather than a table of speculative future rows. This was the open design question, and `leadDays` settled it: if the admin controls when work becomes visible, there is no reason to materialise it early.

**Schema:** `dispatch_service_plans.lead_days` (default 14) + `.anchor_mode`; `dispatch_jobs.service_plan_id` + `.plan_due_date`.

**`planDueDate` is the load-bearing idea.** It records WHICH occurrence a job satisfies, separately from when the job actually runs. A visit due 16 July but performed 20 August still retires the July occurrence. Inferring that from proximity breaks the moment anything runs late.

**Only a COMPLETED job retires an occurrence.** The first version treated any non-cancelled job as retiring one, so a visit already *scheduled* advanced the pointer and the queue showed the occurrence after it — hiding the visit about to happen. Caught by the test table, not by inspection.

**`anchorMode` — the difference only appears once a visit runs late, then compounds:**
- `fixed` (default) — occurrences sit on `planStartDate + n x intervalDays` whatever happened. Contract compliance: four visits a year stay four, and missed ones are **counted and reported**, not skipped.
- `rolling` — next visit is `intervalDays` after the last **completed** one. Equipment intervals, where elapsed time since actual service is what matters.

**Coverage end stops the sequence** (`customer.agreementExpiry`) — a plan that ended in June does not keep producing due visits in September.

**`planStartDate` is now load-bearing and fails silently.** Without it a customer is simply absent from Service Due — no error, just nothing. The field shows a warn border and an explicit "no visit will ever come due" message when a plan is assigned without one.

### 0X.12 ⚠️ INCIDENT — production TDZ crash, whole Dispatch tab failed to mount

`0914b14` shipped C and the Dispatch tab died on load: `ReferenceError: Cannot access 'Ve' before initialization`, caught by the ErrorBoundary.

**Cause.** The recurrence block was placed immediately after `appliedTemplate` at line 3768. `visitQueue` is a `useMemo`, so it **evaluates during render**, and it read `jobs` (3805), `servicePlans` (3818) and `customers` (3819) — all in their temporal dead zone. `'Ve'` was one of them, minified.

**Why every existing gate missed it:**
- **Babel validation proves a file PARSES, not that it RUNS.** TDZ is legal syntax.
- **`vite build` succeeded.** Rollup emits TDZ violations happily; it is a runtime error.
- Dev tolerates it entirely — Vite's unminified dev bundle does not reorder, so the tab worked locally.

This is the *second* time this exact trap has been hit (see §8, "Temporal dead zone in production"), which is why it is now a scripted check rather than a written rule.

**Fix.** The block moved below `vehicleTypes`, the last of its dependencies, with a comment explaining why it must stay there.

**New tool: `scripts/check-tdz.mjs`** — walks each function body, finds initializers that evaluate during render (`useMemo` / `useCallback` dependency arrays, plain expressions; deferred arrow bodies are skipped) and flags any identifier declared later in the same scope. Also scans module scope. Run it before delivering any file with new hooks.

**Worth recording: the scanner needed three rounds before it could be trusted.** Each version confidently reported violations that were not violations:

1. Counted **object property keys** as references — `{ equipCategories: [] }` inside `EMPTY_JOB` read as a use of a variable of that name, pointing at innocent code in the previous commit.
2. Missed `OptionalMemberExpression` — `settings?.industries` is a *different AST node type* from `settings.industries`, so the property name fell through to the generic walk and was reported as a variable read. Two files flagged, both fine.
3. Ignored **nested scope**. An IIFE declaring `const now = new Date()` was treated as reading an outer `now` declared 250 lines later. Four hits in `ReportsTab`, all fine.

Final state: catches the real production bug (3 hits, exit 1), catches a synthetic violation, and reports **zero** across all 134 files in `src/`. Verifying a new diagnostic against a case whose answer you already know is not optional — the first two versions would each have sent us rewriting working code.

### 0X.9 Findings raised, not yet actioned

- **`autojob` / template auto-create does not exist.** It appears nowhere outside the settings panel. The "Tied to customer type" selector feeds a mechanism that was never built, and the panel's subtitle describes behaviour that does not happen.
- **The `ctype` axis is probably wrong.** The template ties to `settings.customerTypeTiers` (CRM tier: SMB / Mid-Market / Enterprise / Strategic / Partner) while `dispatch_customers.customerType` is a premises segment (commercial / residential / industrial / government). These are different *concepts*, not two copies of one list. A new HVAC install needs the same crew, hours, licence and equipment whether the account is a prospect or a partner; what varies it is the premises segment. Multi-select is requested and correct as a mechanic — the open question is which axis (or both).
- **`share` (shared vs per-van)** is displayed in tooltips but not modelled; per-van items are counted against total units like shared ones.
- **Two stale vocabulary mismatches** — see §9.

---

## 0PP. Earlier Session — SVR-2 Actually Shipped (BYOK key exposure + settings authorization)

> **Record correction.** The previous state doc recorded Critical 2 / SVR-2 as FIXED.
> **It was not in the repo.** At the start of this session `settings.mjs` was verified
> unpatched and **byte-identical on `dev` and `master`** — no role gate on PUT, plaintext
> key in the GET body. A full-history search across all four branches confirms no commit
> ever introduced `anthropicApiKeySet` before this session's `a9ed408`, and the audit
> actions the old entry described (`settings.apiKeySet` / `settings.apiKeyCleared`) appear
> in **no commit, on any branch, ever**. The most likely cause is the `dev` →
> `reset --hard origin/master` branch-drift reconcile in §0b, but no commit survives to
> confirm it. SVR-1 by contrast was verified genuinely live (`requireRole`, `writeAudit`,
> `getCallerName` all present).
>
> **Process rule: verify the live repo, not the state doc, before marking an audit item closed.**

**Shipped as `a9ed408` "sev fix set 2"** — 4 files, 322 insertions / 65 deletions, on **both `dev` and `master`**.

### The real leak was wider than the audit described
The audit flagged `extra.anthropicApiKey` (the encrypted field), and the old doc entry
claimed "no client code ever read or wrote the field — the BYOK entry UI was never built."
**Both were wrong.** The BYOK UI existed in `FeaturesDetail.jsx` and bound its key input to
**`aiSettings.byokProvider`** — a plain field in the `aiSettings` blob. Consequences:

- Key stored **unencrypted** as JSONB. The `encrypt()` path keys off `data.anthropicApiKey`, which the UI never sent.
- `aiSettings` is returned to **every org member** on GET — gating `anthropicApiKey` alone would have fixed nothing.
- Key rendered in **plaintext** in the BYOK card description (`Active · ${byokProvider}`).
- `useSettings.js` mirrored it into **localStorage** on every settings change.
- "Export config" wrote it to a **downloadable JSON file**.
- `ai-score.mjs` reads `extra.anthropicApiKey`, so a key entered via that UI was **never used** — BYOK was functionally dead while leaking the secret.
- The panel's own copy claimed "encrypted with AES-256-GCM", false for that path.

### What shipped

**`netlify/functions/settings.mjs`**
- **PUT is Admin-only** — `requireRole(auth, ['Admin'], headers)` on the whole branch. See the design note below.
- **GET never returns plaintext.** All members get `anthropicApiKeySet` (boolean); Admins additionally get `anthropicApiKeyLast4`. Non-admins never trigger a decrypt at all.
- `scrubAiSettings()` strips key material from `aiSettings` on **both read and write** — plaintext self-heals out of the DB on the first admin save.
- `extractLegacyKey()` does a **one-time migration** of an existing plaintext key into the encrypted field — which also makes BYOK functional for the first time.
- Corrupt ciphertext degrades the last-4 hint instead of 500-ing settings load for the whole org.
- `writeAudit()` on every successful PUT — records *that* the key changed, never the value.
- Catch block switched to `serverErrorBody(err, 'settings')` (it still returned raw `err.message`).

**`src/Tabs/settings/data/FeaturesDetail.jsx`** — key input is **write-only** (always empty on load; `keyAction` state so an untouched box never clears a stored key), shows `✓ Key installed · ••••1234`, adds **Remove key** with undo, `byokProvider` reverted to a provider **label**, export config scrubs key-shaped values, 403 surfaces as a readable "you need Admin" message.

**`src/hooks/useSettings.js`** — `stripKeyMaterial()` removes key material from the localStorage bootstrap **and** from both the cache write and the auto-save PUT body. Bootstrap **self-heals** a pre-fix plaintext cache immediately.

**`src/Tabs/PersonalView.jsx`** — "Save preferences" was PUTting `{...settings}` to `/settings` **from a non-admin view** (the SVR-2 integrity vector verbatim), and `notificationPreferences` was in neither the GET nor PUT of `settings.mjs`, so it silently did nothing. Rerouted to `/users?me=true` → `profile.notificationPrefs` (already in the sanitize whitelist — **no schema change**), spreading the full flattened profile so the server's `sanitize()` rebuild doesn't wipe other profile fields.

### ⚠️ Design change vs. what the old doc described
The superseded entry described non-admin PUTs having the secret field **silently stripped, not 403'd**, reasoning that the settings auto-save round-trips the whole object. **Shipped behaviour is the opposite: the entire PUT is Admin-gated.**

Rationale: SVR-2's stated impact is *"(b) Integrity/DoS — any user rewrites shared config that every other user depends on"*, and its prescribed fix is "Require isAdmin for PUT." Field-stripping closes the secret leak but leaves any member able to rewrite `stages` / `fieldVisibility` org-wide.

**Consequence to watch:** any legitimate non-admin write through the settings auto-save now 403s. One existed (`PersonalView` notification prefs) and was rerouted; every other settings writer sits under `AdminView`. Believed zero blast radius — confirm as reps exercise dev. If the strip-don't-403 behaviour is ever preferred, the Admin gate must stay on non-secret fields too or SVR-2(b) reopens.

### Audit actions emitted
`settings.updated`, `settings.apikey.set`, `settings.apikey.cleared`, `settings.apikey.migrated`. **No schema change.**

### Open item raised
- **`PUT /users?me=true` accepts a self-supplied `role`** — `sanitize()` takes `data.userType || data.role`, and the `me` branch only checks id match. Server authorization reads Clerk `publicMetadata`, so not real privilege escalation, but it flips client-side gates and pollutes the roster. Needs its own audit item.

---


---

## 0PP-a. Prior Session (cont.) — SVR-3: Uniform Role Enforcement Sweep

### SVR-3 as written was already CLOSED
All six core entity endpoints already had the gates (ReadOnly block on POST/PUT/DELETE before the try, ownership checks on PUT and DELETE-by-id, Admin gate on `?clear=true`) — shipped in the SVR-1 Highs batch. The audit's own line numbers give it away: it cites `opportunities.mjs:154/202/315`, but POST/PUT/DELETE now sit at **160/208/333**, shifted by exactly the inserted gate code. The finding was written against a pre-remediation snapshot.

**But its fix instruction — "define the role→capability matrix once and apply it uniformly" — was only half applied.** Six endpoints had it; nine did not. A full sweep of all 29 mutating functions found the following, all now fixed.

### CRITICAL — `audit-log.mjs` forgeable audit trail (higher severity than SVR-3 itself)
POST had **no role check** and wrote client-supplied `action`, `userId`, `userName`, and `timestamp` straight to the table. `App.jsx` sends `userId: currentUser` — a *display name*, fully attacker-controlled. Any authenticated member could forge entries attributing arbitrary actions to any user at any timestamp, or flood the log. **This undermined the audit trails shipped for SVR-1 and SVR-2** — a log anyone can write to is not evidence.
- Actor and time are now **derived server-side** (`auth.userId` + `getCallerName()`); client values are ignored.
- POST gated with `requireWrite`; **GET gated to Admin/Manager** (reading the org activity trail is privileged; both callers are admin-only UI).
- Display is unaffected — `AdminView` renders `e.userName || e.userId`, and `userName` is still a real display name.

### Other real gaps closed
- **Dispatch x 5** (`jobs`, `customers`, `equipment`, `technicians`, `vehicles`) — **20 mutating branches, zero role references.** Any authenticated user including ReadOnly had full CRUD over the entire field-service module. Now `requireWrite` at handler top (placed before the sub-resource branches in `dispatch-jobs`, so `?resource=lineitems|history` is covered too). **Policy: any non-ReadOnly may write Dispatch** (Admin/Manager/Sales Rep) — Jeff's call.
- **`saved-reports.mjs`** — DELETE was scoped to `orgId` only, so any member could delete anyone's report. Create already stamped `ownerId`; it was simply unused. Added `requireWrite` + an `assertOwner()` helper gating PUT and DELETE to **owner-or-Admin** (unknown ids still fall through to existing upsert/no-op behaviour).
- **`documents.mjs`** — `userRole` was referenced but only for read visibility, and `canSee()` has the role param commented out of its own signature. Mutations were ungated. Added `requireWrite`.
- **`recommendation-log.mjs`** — POST/PUT ungated. Added `requireWrite`.
- **`spiff-claims.mjs`** — approve/reject and delete were gated, but **POST (claim submission) had no check at all**. Added `requireWrite`.

### New shared helper — `requireWrite(auth, event, headers)` in `auth.mjs`
The "define once" piece SVR-3 asks for. ReadOnly is the only role with no write capability at all, so this encodes that half of the matrix in one place. Non-mutating methods pass straight through, so it is safe to call **once at the top of a handler** rather than per branch. Returns a ready-to-return 403 or `null`.

### Verified-correct, no change needed
- **`dashboard-configs.mjs`** — the only mutating endpoint left without a role gate, **deliberately**. PUT writes to a self-scoped id (`'dash_' + userId + '_' + orgId`), so a user can only ever write their own dashboard layout. Personal preference, same class as `/users?me=true`.
- Already gated with **local** helpers: `automations` (`canWrite`), `webhooks` / `export-schedules` / `export-dsr` / `api-keys` (`requireAdmin`), `backup` / `export-runs` (inline), `products` / `quotes` / `calendar-connections` (local `isAdmin` consts).

### Remaining uniformity work (deferred — not a vulnerability)
Those local helpers all work; they are just not the shared ones. Migrating them to `requireWrite` / `requireRole` is mechanical but was **kept out of this deploy on purpose**: mixing "close a hole" with "rename a working helper" makes rollback harder if something breaks. Note also that `products` / `quotes` / `spiff-claims` / `calendar-connections` declare local `isAdmin` / `isManager` / `isReadOnly` consts that **shadow the imported helpers of the same name** — a real footgun worth cleaning up in that same pass.

**Coverage after this sweep: 29 of 29 mutating functions gated** (28 by role, 1 self-scoped by construction).

## 0PP-b. Prior Session (cont.) — Dispatch Module: Job Create, Customers, Technicians

Triggered by testing SVR-3 as a Sales Rep: creating a dispatch job returned `id, customerId, title required`. That was a **400, not a 403** — the role gate passed and the rep was correctly authorised. The bug was pre-existing and unrelated.

### New Job create had never worked, for any role
`handleSaveNewJob` sent `{ title, jobType, priority, status, durationMinutes, scheduledDate, opportunityId }`. The server requires `id`, `customerId`, **and** `title`. Two of three were never sent, so the feature had never once succeeded. Underneath that:

- **No `id`** — simply missing (codebase rule is client-generated `'<prefix>' + crypto.randomUUID()`).
- **No `customerId`, and no way to produce one.** The Customer field was free text, but `dispatch_jobs.customerId` is `notNull` and an FK to `dispatch_customers`.
- **No Title field existed** — `title` was set to the customer name.
- **Address / crew size / min licence / skills were collected and dropped**, living only in optimistic local state and vanishing on refresh (the no-local-only-state rule).

### Schema additions (4 columns, all nullable, additive only)
| Table | Column | Purpose |
|---|---|---|
| `dispatch_customers` | `customer_number varchar(50)` | `CUST-0001` — human-readable, **server-assigned, immutable** |
| `dispatch_jobs` | `crew_size integer` | techs required on site |
| `dispatch_jobs` | `min_license varchar(50)` | Apprentice / Journeyman / Master |
| `dispatch_jobs` | `need_skills jsonb DEFAULT '[]'` | required skill ids |

Applied via the **Neon SQL editor**, not `drizzle-kit push` (four `ADD COLUMN IF NOT EXISTS` plus a re-runnable backfill). Because dev and production share the Neon `main` branch, one run covered both — production therefore has the columns while `master` still runs code that does not read them. Harmless *because* they are nullable and additive; this is exactly why additive-only matters.

### Customer numbering
`nextCustomerNumber(orgId)` scans existing numbers per org and returns `CUST-` + zero-padded max+1. **Assigned server-side only** — two reps creating customers simultaneously would collide client-side. **Immutable**: POST is an upsert and reuses any existing value; the PUT whitelist deliberately omits `customerNumber`; the client save handler also strips it. Backfilled 8 existing customers in `CUST-0001`–`0008` by `created_at`.

### Create flow — three writes in dependency order
1. **Customer** — only when the typeahead did not resolve to an existing one.
2. **Service location** — only when an address was entered. `dispatch_jobs` has **no address column**; the address lives on `dispatch_service_locations` (whose `address` *and* `city` are `notNull`, which is why City became required) and the job points at it via `locationId`.
3. **Job** — carrying `customerId`, `locationId`, `accountId`, and every collected field.

Not transactional: if step 2 fails, the customer from step 1 already exists. Retrying finds them in the typeahead rather than duplicating, but state is not rolled back.

### Two enum-vocabulary bugs found
- **Priority** — the form offered Low/Medium/High/Urgent and `.toLowerCase()`'d it, producing `medium`/`urgent`. The schema documents `low|normal|high|emergency`; `prioColor`/`prioColor2` were written against a *third* set (`urgent|standard|low`). New jobs now store schema-valid values and both colour maps accept either. **This is a band-aid — see the normalization item in §9.**
- **`jobType: 'service'`** — not in the documented set. Now `'repair'` (the schema default). Safe because create had never succeeded, so no rows carried `'service'` from this path.

### Customer typeahead spans two tables
`dispatch_customers` and CRM `accounts` are separate tables (see §8). The typeahead shows two labelled groups: existing dispatch customers with their `CUST-` numbers, and **CRM accounts not yet in Dispatch**. Picking an account creates the dispatch customer on save with `accountId` set, and prefills address/city/state/zip from the account — but only into fields left empty, never overwriting typed input. Already-linked accounts are filtered out by `accountId` *and* by case-insensitive name, so companies present in both tables but never formally linked are still hidden from group two.

### New: Dispatch → Customers view
Nothing in the app could previously list, create, or edit dispatch customers — `dispatch-customers` was referenced in exactly one file and only by new code. The 8 existing rows had been seeded directly and were invisible.

List + detail: `CUST-` number, linked/unlinked badge, do-not-service badge; editor covers linked CRM account (with a manual **copy address** action), customer type, service agreement, contacts, service address, notes, do-not-service + reason. **Deliberately no delete** — `dispatch_jobs.customerId` is an FK with no cascade, so deleting a customer with jobs would orphan them. "Do not service" is the retirement path.

### New: Dispatch → Technicians view
Three disconnected stores existed for technician data:
1. **`dispatch_technicians` table** — what the board actually reads.
2. **`settings.users[].dispatch*`** — what the Settings → People panel edited, and what `DispatchTechDetail` reads.
3. **`settings.extra.dispatchTechProfiles`** — persisted by `settings.mjs`, **read by nothing**. Dead key.

Store 2 was a **no-op twice over**: it PUT `{ users: [...] }` to `/settings`, but `settings.mjs` has no `users` key in its whitelist (users live in their own table), and the handler never called `setSettings`. So skills, certs, licence, vehicle, hours cap and the active-tech toggle had **never persisted anything, for anyone**.

`dispatch_technicians` is now the source of truth. New view covers names, **linked app user**, contact details, employment type, status, home zip, skills, certifications, labour/overtime rates, assigned vehicle, notes. Skills and certifications render **always**, with an empty-state pointing at Settings → Dispatch, rather than being hidden when the catalogue is empty.

`normaliseTech` was hoisted from inside the load effect to module scope, and a `techsRaw` state added — the board's mapping intentionally drops `userId`, rates and notes, so the editor works off raw rows while the board keeps its expected shape.

**`UsersDetail` dispatch card replaced with a pointer.** It had been gated on the *org-wide* `settings.dispatchEnabled`, so every user in a dispatch-licensed org appeared to be a technician. ~80 lines of dead UI removed.

### `DispatchSkillsDetail` — malformed JSX shipped to production
Both `{addingSkill ? (` and `{addingCert ? (` heads were missing, so the add-forms rendered unconditionally and the orphaned `) : (` / `)}` leaked onto the page as literal text. **Babel rejected the file; Vite shipped it anyway** — esbuild tolerates a stray `}` in JSX text where Babel errors. A swept check of every `.jsx` in `src/` found no others. See §8.

### Dispatch data lives under a different org
Dev session org is `org_3BDQEH7sxrZ43ydOkMGI00Tf0LK`; all 8 dispatch customers and all 11 jobs sit under `org_3Cwnbl…`. Dev and production run **separate Clerk instances against the same Neon database**, so the dev org correctly sees none of it. The jobs visible on the dev board are `auto_<opportunityId>` placeholders synthesized client-side from Closed Won opportunities — not database rows, not editable.

### Also fixed
`DispatchTab`'s load never checked `res.ok`, so a 500 or 403 parsed to `{error}`, fell through `|| []`, and rendered as "no customers yet" — an endpoint failure was indistinguishable from an empty table. Now reports `Dispatch data failed to load: customers (500)…`.

---

## 0PP-c. Prior Session (cont.) — Technician Model Consolidation, Licences, Scheduling & Board Ranges

Follow-on from §0a2. Closes step 3 of the technician plan, makes scheduling actually persist, and adds date-ranged board views.

### Step 3 — the old technician stores retired
No migration was needed: `users.mjs` has **zero** `dispatch*` references, so `settings.users[].dispatch*` was never persisted to the users table at all. Those fields lived only in memory.

- **`DispatchTechDetail` unwired and deleted** — catalogue entry (`dsp-techs`), `AdminView` import, id-map entry and route all removed.
- **`settings.extra.dispatchTechProfiles` removed** from `settings.mjs` GET + PUT and the `useSettings` defaults. Dead key, read by nothing. Note the key now drops out of the stored `extra` blob on the next admin save — intended, and harmless since it held an empty array.
- **`DispatchCrewsDetail` had the same bug** and was not on the list: its crew-member picker read `settings.users.filter(u => u.dispatchEnabled)`, a flag nothing sets any more, so you could create a crew but never add anyone to it. It now fetches `dispatch_technicians` directly, filters out `inactive`, and keeps the existing `u.id || u.name` matching so legacy name-based members still resolve.

### Technician licence level — a fabricated value driving real decisions
`dispatch_technicians` had **no licence column**, yet the board's crew-matching compared `LICENSE_ORDER[tech.license]` against `job.minLicense`. `normaliseTech` invented the value: subcontractor → Journeyman, has-any-skill → Journeyman, else Apprentice. So a tech with one skill was silently promoted and a real Master with none was blocked. The crews panel had its own fallback (`u.dispatchLicense || 'Apprentice'`), which is why every member rendered "Apprentice".

- **New column** `dispatch_technicians.license_level varchar(50)` (nullable, additive) + normaliser, POST row and PUT whitelist.
- **Licence select** in the Technicians editor, sourced from `settings.dispatchLicenses` so it stays admin-configurable. Unset is a real option; technicians without one get a red **no license** badge in the list.
- **Unset blocks.** `if (job.minLicense && !tech.license)` pushes `License not set · job needs X`. Unset now scores `-1` rather than defaulting to `1` — previously it passed as Journeyman-equivalent, which was the dangerous half of the bug. The whole licence check is now conditional on the job actually specifying a minimum.

### Blockers were advisory — the Add button ignored them
`const canAdd = c.score >= 70;` gated eligibility on **score**, not blockers. A tech scoring 70 from cert currency, hours and distance got the normal **+ Add** button while carrying a hard blocker. This applied to `Missing skill`, `Expired cert`, `Over-hours` and `Double-booked` too, not just licence.

- `canAdd = c.blockers.length === 0 && c.score >= 70`.
- **Blocked candidates sort below every clean one** regardless of score.
- **Override now confirms**, listing every blocker by name, with Cancel / "Override and assign".

### `Schedule & notify` was a stub
Its entire handler was `onClick={() => setSaving(true)}` — no persistence, no SMS, and `saving` never reset. `Save draft` and `Notify techs (SMS)` had no `onClick` at all. Nothing anywhere wrote `assignedTechId` / `coTechIds`, so **crew assignment had never persisted**, same class as job create.

- **`handleSchedule`** PUTs `assignedTechId` (lead = first added), `coTechIds`, `status:'scheduled'`, `scheduledDate`, `scheduledStart`, `scheduledEnd` (derived from duration), `timeSlot:'exact'`.
- **Date + Start fields** added to the crew-builder footer; both required. Start uses the shared `TimeDropdown` (`components/ui/`), not a native `<input type="time">`.
- **Audit on schedule** — `dispatch.schedule`, or `dispatch.schedule.override` when a blocked tech was assigned, with every ignored blocker named. Actor/timestamp are server-derived (the `audit-log` fix from §0a).
- **`SMS` deliberately stubbed** and visibly disabled until the Twilio A2P campaign clears.
- **Scope bug caught pre-delivery:** `handleSchedule` lives in `CrewBuilderView` but `setJobs` / `addAudit` / `setSelectedJobId` belong to `DispatchTab`. Babel passes that; it would have been a runtime `ReferenceError`. Now delegated via an `onScheduled` callback.

### Three more hardcoded read mappings
The job normaliser discarded stored columns: `minLicense: 'Journeyman'` (a literal — so the licence blocker was comparing against a **constant**, and only looked right because `EMPTY_JOB` defaults to Journeyman), `needSkills: []`, and `crewSize` derived from assigned techs rather than the stored value. All three now read from the row.

### Board date ranges — Today / This week / This month
The board **never filtered by date**; "Today" was a label, so a job scheduled for next week appeared on today's timeline.

- **Today** — existing hour timeline, now filtered to the anchor date.
- **This week** — technician rows x 7 day columns, with each tech's weekly hours against cap (red when over).
- **This month** — calendar grid; clicking a day drops into that day's Today view.
- Arrow navigation by day/week/month, a **Today** reset button, and the header subtitle follows the range.
- **Unassigned tray stays unfiltered** by design — an unscheduled job has no date to filter on, so filtering would make it unreachable.
- **Week gained a "Needs a crew" row.** Week renders jobs inside technician rows, so a job with a date but no crew was invisible there while still showing in the month grid — the two views disagreed about the same data.
- **Timezone trap avoided:** `new Date('2026-08-12')` parses as UTC and shifts a day in negative-offset zones, which would land jobs on the wrong column. All date construction goes through `fromYmd` (local parts); comparison is on the `'YYYY-MM-DD'` strings directly.

### "Add" reads as a commit — three times in one session
Settings skills (Add vs **Save changes**), and the crew builder twice (**+ Add** builds a draft crew; nothing persists until **Schedule crew**). Two jobs sat dated-but-uncrewed because of it. Mitigated in the crew builder: the footer now says "n/n added — not scheduled yet" whenever anyone is added, and the button reads "Schedule crew (n)". The settings panels still have the same shape — see §9.

---

## 0PP-d. Prior Session (cont.) — Dispatch Operations: Job Editing, Categories, Scheduling & Availability

Follow-on from §0a3. Everything here is frontend plus one new endpoint; **no schema change** — every column and table used already existed and was unreferenced.

### Job editing did not exist
The only job writes in the whole tab were POST (create) and the scheduling PUT. Clicking a job routed to the Queue and showed it read-only, so once created, priority, address, title, duration, crew size, min licence and skills were frozen. The PUT endpoint supported all of them; nothing had ever called it.

**New Jobs sub-tab** — searchable list with status filter, priority colour bar, editable detail. Address editing writes to `dispatch_service_locations` (the job only holds `locationId`), so saving is create-or-update on that row before the job PUT; the panel states that other jobs sharing the location will see the change. **Customer is deliberately read-only** — changing it would orphan the location and invalidate any assigned crew.

### Job categories & types (`trade` / `jobType`)
Both columns existed, were hardcoded (`'hvac'` / `'repair'`), and nothing branched on either. Now admin-configurable via **Settings → Dispatch → Job categories & types**, with `dispatchTrades` and `dispatchJobTypes` in `settings.extra`.

- **Types are scoped to a category**; a type with no `categoryId` shows under every category, so partially-categorised lists degrade gracefully.
- Changing category clears a type that does not belong to the new one.
- Starter list seeds HVAC / Electrical / Plumbing / Solar plus sixteen types.
- Both columns are `notNull` with legacy defaults, so an explicit "none" would have silently stored `'hvac'`/`'repair'`. POST and the normaliser now use `''`.

### Priority vocabulary normalized
Three incompatible vocabularies had coexisted. Now one canonical set — `low | normal | high | emergency` — with `PRIORITY_ALIASES` translating legacy values **at the read boundary only**. The job read mapping had been translating *forward* into the legacy set (`'emergency' → 'urgent'`), which is what kept it alive. `prioColor2` collapsed to an alias of `prioColor`. The board legend showed three levels against four stored values, so **High had a colour with no key**. Migration SQL is optional cleanup, not a prerequisite.

### Crew-builder blockers were advisory
`const canAdd = c.score >= 70;` gated eligibility on **score**, not blockers — a tech scoring 70 from cert currency, hours and distance got the normal **+ Add** button while carrying a hard blocker. Applied to missing skills, expired certs, over-hours and double-booking, not just licence.
- `canAdd = c.blockers.length === 0 && c.score >= 70`.
- Blocked candidates sort below every clean one regardless of score.
- Override opens a confirmation naming every blocker.

### `Schedule & notify` was a stub
Its entire handler was `onClick={() => setSaving(true)}`. Nothing wrote `assignedTechId` / `coTechIds`, so **crew assignment had never persisted**. Now PUTs the crew, status, date, start and derived end; Date and Start fields added (Start uses the shared `TimeDropdown`); audits as `dispatch.schedule` or `dispatch.schedule.override` with the ignored blockers named. SMS left visibly disabled pending Twilio A2P.

**Scope bug caught pre-delivery:** `handleSchedule` lives in `CrewBuilderView` but `setJobs` / `addAudit` / `setSelectedJobId` belong to `DispatchTab`. Babel passes that; it would have been a runtime `ReferenceError`. Delegated via an `onScheduled` callback.

### Board date ranges + Jobs/Schedule sub-tabs
The board **never filtered by date** — "Today" was a label. Added Today / This week / This month with arrow navigation. Week is technician rows x 7 days; Month is a calendar grid that drills into a day. Week gained a **Needs a crew** row because it renders jobs inside technician rows, so a dated-but-uncrewed job was invisible there while showing in the month grid.

Sub-tabs restyled from pill buttons to the underline treatment used by Quotes/Reports/Sales Manager, and now persist to `localStorage` (`tab:dispatch:subView`).

### Mass-schedule: propose, review, confirm
Was unwired. Now reuses `scoreTech`, so bulk assignment ranks and blocks identically to the crew builder. Urgent jobs first; only zero-blocker candidates; running per-tech load so work is not stacked on the best technician; slot search inside each tech's own shift. Nothing is written until confirmed. Jobs with no eligible tech are **skipped and listed with the reason**. One PUT per job so a single failure does not abandon the rest; audits as `dispatch.schedule.bulk`.

**Known limitation:** assigns a single tech per job, ignoring `crewSize`.

### Technician availability (two layers, both previously dead)
`dispatch_technicians.workingHours` (jsonb, recurring weekly pattern) and the entire `dispatch_schedule_blocks` table (dated exceptions) existed in `schema.ts` and were **completely unreferenced** — the table had no endpoint at all.

- **New `dispatch-schedule-blocks.mjs`** — full CRUD, `requireWrite`-gated, `?techId=` / `?from=` / `?to=` filters. Overlap is `start <= to AND end >= from` so a block spanning the window is returned. `createdBy` server-derived.
- **`dispatchBlockTypes`** settings list (admin-managed, colour per type), seeded server-side with PTO / Sick / Holiday / Training / Jury duty / Bereavement / Other.
- **Schedule sub-tab** — tech rows x 7 days, shift hours per day, click a cell to mark someone out (date ranges, partial days), per-tech shift pattern editor.
- **Enforcement** — `scoreTech` gained `Not rostered on {Day}` and `Off · {type}` blockers; the planner's slot search runs inside each tech's shift and avoids partial-day blocks; `handleSchedule` validates the chosen start against shift bounds and partial blocks (the only point a time exists).
- **`hoursCap` derived** from the shift pattern instead of the hardcoded 40 — another fabricated value driving a real blocker.
- **Time off renders on both boards** — badge plus shaded hour cells on the day board, coloured chips on the week grid.
- **Conflict flow:** marking someone out over work they are committed to now lists the affected jobs and offers **Reject** or **Accept & re-crew** — which saves the block, unassigns those jobs back to the queue, audits `dispatch.timeoff.unassign`, and drops the dispatcher into the Queue with the first freed job selected.

### More hardcoded read mappings found
`minLicense: 'Journeyman'` and `needSkills: []` were literals in the job normaliser, so **the licence blocker was comparing against a constant** — it only looked correct because `EMPTY_JOB` also defaults to Journeyman. `crewSize` was derived from assigned techs rather than the stored value. Also the technician licence itself: `normaliseTech` invented one from employment type and skill count.

### Process failure worth recording
A patch script reported two edits applied, then aborted before writing. Both were silently lost: the sub-tab `localStorage` persistence, and the pill-toggle removal. The missing removal was later mis-diagnosed as "a second toggle the earlier patch missed" — it was the only one, never removed. **Verify by grepping the file after every patch, not only after a reported failure.**

---

## 0PP-e. Prior Session (cont.) — Technician Role, Scoping & Role Management

The fifth role, and the last piece before a technician mobile app. **No schema change.**

### Why the role and its scoping had to land together
`requireWrite` denied only ReadOnly. Adding a `Technician` role to Clerk *before* this work would have granted full write access to every dispatch endpoint — and, as the build revealed, to nine others as well.

**`requireWrite` is now deny-by-default for Technician**, with a single explicit opt-in:

```js
requireWrite(auth, event, headers)                          // denies ReadOnly AND Technician
requireWrite(auth, event, headers, { allowTechnician: true }) // dispatch-jobs.mjs ONLY
```

The point is that a new role must never inherit write access simply by not being ReadOnly. One caller opts in and then applies its own ownership check and per-field whitelist.

### Nine endpoints a Technician would have been able to write to
Neither of these was visible from the role definition itself — both were found by sweeping call sites after adding the role.

- **All six core CRM endpoints** (`opportunities`, `accounts`, `contacts`, `tasks`, `activities`, `leads`) gated on `isReadOnly(userRole) && [...].includes(method)` — a bare ReadOnly check, not the shared helper. A Technician passed it. All six migrated to `requireWrite`.
- **`quotes.mjs`** declared a **local** `const isReadOnly = userRole === 'ReadOnly'` that shadowed the imported helper (the footgun already on the horizon list from SVR-3) and gated quote create/update. A Technician passed it. Now routed through `requireWrite`; the shadowing const is gone.

### Technician capabilities
| | |
|---|---|
| **Read** | Only jobs where they are `assignedTechId` or in `coTechIds`. Only their own `dispatch_technicians` row (the roster carries colleagues' pay rates, phones, home zips). |
| **Write** | `status`, `techNotes`, `completionNotes`, `photosCount`, `customerSignature` — on their own jobs only. |
| **Status transitions** | `en_route`, `on_site`, `paused`, `completed`. **Not** cancel or unschedule — both dispatch decisions. |
| **Denied** | Job create/delete, everything CRM, customers, other technicians, scheduling, vehicles, settings. |

- **Resolution is by technician row, not user.** `dispatch_jobs.assignedTechId` FKs `dispatch_technicians.id`, so `resolveTechnicianId(orgId, userId)` maps the caller's Clerk id to their technician row first.
- **Fails closed.** Technician role but no linked technician row → 403, "No technician record is linked to your account." They own nothing, so there is nothing legitimate to return. The alternative default — falling back to "show everything" — would be a silent data leak.
- **404, not 403, on someone else's job**, so a technician cannot enumerate which job ids exist.
- **Illegal fields are rejected by name**, not silently dropped, so a mis-scoped mobile client fails loudly rather than appearing to succeed.
- Status changes go through the existing `recordStatusChange` helper into `dispatch_job_status_history`.

### Role changes never reached Clerk
`auth.mjs` derives `userRole` from Clerk `publicMetadata` on every request; the `users` table is only a mirror. **Nothing anywhere wrote a role change back to Clerk** — `invite-user.mjs` set it at invite time and that was all. Editing a role in Settings → Users updated the mirror alone, so server-side authorization did not change. Same class as `saveDispatchProfile`: a control that looked like it worked and changed nothing that mattered.

**New `netlify/functions/user-role.mjs`** (Admin-only, `PUT`):
- Writes Clerk `publicMetadata` (merged, not replaced — it also carries `name`), then updates the mirror best-effort. Clerk is authoritative, so a mirror failure is a stale roster row, not a failed permission change.
- **Verifies org membership first.** Clerk user ids are global, so without that check an Admin of one tenant could rewrite a role in another.
- **Refuses self-demotion from Admin** — an admin removing their own rights can lock the org out of its own settings.
- Audits `user.role.changed` with before → after.

### `'Sales Rep'` vs `'User'` — a mismatch that failed open
`UsersDetail` had **two** role lists that disagreed (`'Sales Rep'` at one site, `'User'` at another) plus a third in `FlsDetail`. `'Sales Rep'` worked only because `auth.mjs` treats any unrecognised role as a rep — it failed *open*. Consolidated into one `ROLE_OPTIONS` with a value/label split: stored `'User'`, displayed "Sales Rep". Technician added to all three.

### Still outstanding
- **Frontend gating.** A Technician currently lands on the full dispatcher UI (Board, Queue, Customers, Schedule, "+ New job", "Mass-schedule") and the server refuses most of it. Not a security hole, but it obscures real failures. Settings and Sales Manager already hide correctly, so the mechanism exists — Dispatch simply is not wired into it. This is effectively the start of the mobile surface: my jobs, my schedule, my profile.
- **Dispatch load errors show only the status.** `Dispatch data failed to load: jobs (403)` while the server sent a clear explanation in the body. Surface the message.

---

## 0PP-f. Prior Session (cont.) — Technician Frontend, Settings Save Errors, Job Numbers

Closes out the Technician work and clears the contained items from the backlog. **No schema change.**

### Technician frontend
The server scoped everything, but a Technician still landed on the full dispatcher UI and the tabs simply failed. Not a security hole — the API refused them — but it hid real failures behind expected ones.

- **`AppHeader`** — a Technician gets one tab, **My Jobs**, instead of the ten CRM tabs. Plus a redirect effect: `activeTab` defaults to `'home'`, which a Technician has no tab for, so without it they land on a blank page behind a one-item nav.
- **`TechnicianView`** in `DispatchTab` bypasses the dispatcher chrome entirely — no Board, Queue, Customers, Technicians, Schedule, "+ New job" or "Mass-schedule". Sections: Overdue (only when non-empty), Today, Coming up, their own upcoming time off, last five completed.
- **Status buttons follow the transitions the server permits**, and nothing else: `scheduled → Start travel`, `en_route → Arrived on site`, `on_site → Pause | Complete job`, `paused → Resume`. Completed jobs show "contact dispatch if this needs reopening" rather than a control that would 403.
- `jobsRaw` / `techsRaw` are already server-scoped, so the view renders what the API returned rather than filtering client-side. `myTech = techsRaw[0]` is a deliberate coupling to that scoping.
- **Three `\u` escapes were sitting in JSX text and attribute positions**, where they render literally rather than as characters (JSX does not process them the way string literals do). Same class as the `DispatchSkillsDetail` bug, and Babel passes it.

### Settings panels: the save bug was worse than "swallowed"
Every settings panel used this shape:

```js
try { await dbFetch('/.netlify/functions/settings', {...}); }
catch (e) { console.error('save x', e); }
setSaving(false); setDirty(false);
```

**`dbFetch` resolves for any response**, so a 403 never reached the `catch` — nothing was logged at all, contrary to the assumption that failures were merely going to the console. Then `setDirty(false)` ran unconditionally. Since SVR-2 made `PUT /settings` Admin-only, **a non-admin's settings save has been silently doing nothing while the panel reported success.**

- New **`settings/shared/saveSettings.js`** exporting `putSettings(payload)`, which throws a readable Error on non-2xx (403 → "You need the Admin role to change these settings").
- **`CategoryDetailChrome` gained an `error` prop**, rendered as a banner above the panel body.
- **13 panels converted**; on failure they keep `dirty` true so the change is neither lost nor mistaken for saved.

Not converted (different shapes, no shared chrome, or being retired): `PipelinesDetail`, `AuditDetail`, `CompanyProfileDetail`, `FiscalYearDetail`, `CompanyCalendarDetail`, `PriceBookDetail`, `SsoDetail`, `EditBrandModal`, `TeamsDetail`, `TerritoriesDetail`, `UsersDetail`, `BuyerPersonasDetail`, `FlatListDetail`, `DispatchTechDetail`.

### Human-readable job numbers
`JOB-2026-0001` on `dispatch_jobs.jobNumber` — a column that had always existed and was never populated. Follows the `customerNumber` rules from §12c: **server-assigned only**, immutable (POST is an upsert and reuses any existing value; the PUT whitelist omits it), sequential **per org per year**. The Jobs view already displayed and searched it, so no client change was needed. Backfilled with one re-runnable `UPDATE`.

### Job template `name` split from `ctype`
The "Template name" input and the customer-type select both called `updateTemplate('ctype', ...)` — the same field — so templates had no distinct name and the list rendered customer types as names. Now separate, with existing rows migrated on read (`name = name ?? ctype`), which is lossless since `ctype` held whatever was last typed into either control. **This unblocks making templates selectable in the New Job modal.**

### `export-runs.mjs` — a real Technician gap
Its POST blocked only `userRole === 'ReadOnly'`, so a Technician passed and could **trigger an ad-hoc export of whole tables** — someone scoped to their own jobs everywhere else. Now uses `requireWrite`.

### Deliberately not done: the cosmetic helper renames
`automations` (`canWrite`), `webhooks` / `export-schedules` / `export-dsr` / `api-keys` (`requireAdmin`) and `backup` (inline) all gate to **Admin or Admin+Manager**, so Technician is already denied. Migrating them to the shared helpers is a rename with no behaviour change and non-zero risk. Recorded as tidying, not a fix — the only member of that group that mattered was `export-runs`, which is fixed above.

---

## 0PP-g. Prior Session (cont.) — User/Clerk Drift: Root Cause, Detection & Delete

The persistent disagreement between the Accelerep user list and Clerk had three separate causes, all silent. **No schema change.**

### Cause 1 — a profile save could silently demote you
`sanitize()` in `users.mjs` contained `role: data.userType || data.role || 'User'`, and it ran on **every** write to the users table — including `PUT ?me=true`, the self-service profile endpoint.

So any self-service save that did not happen to include `userType` — a timezone change from the header, notification preferences — rewrote the caller's roster role to `'User'`. It looked random because it depended on which screen someone last saved from. **This is the long-standing drift irritant.**

### Cause 2 — admin role edits never reached Clerk
`PUT /users` wrote `role` to the mirror only. `auth.mjs` reads Clerk `publicMetadata` on every request, so the roster showed the new role while authorization kept using the old one. No error, no warning. (`user-role.mjs`, added in \u00a70a5, is the correct path.)

### Cause 3 — drift was invisible
`users-sync.mjs` could reconcile, but only when someone thought to run it.

### The fix: the mirror can no longer decide a role
- **`role` removed from `sanitize()` entirely.** Every caller now passes it explicitly via a new `withRole(clean, known)` helper, and `roleOf(id)` reads the stored value so an update that carries no role cannot blank it.
- Only three paths set a role: **invite** (which sends the same role to Clerk with the invitation), **admin create** (the row does not exist yet), and **`user-role.mjs`** (writes Clerk first). Both update paths preserve what is stored.
- **`users-sync?check=true`** \u2014 dry run. Same reconciliation, writes nothing, no audit row. Settings \u2192 Users runs it on load and shows an amber **"Out of sync with Clerk"** banner with counts and a **Reconcile** button. Non-admins get a 403 and simply see no banner.

### Found live while testing
The signed-in Admin appeared **absent** from the user list, and the roster read **Admins \u00b7 0** while Settings worked normally. The row was present all along \u2014 it was the gmail account, showing as `Technician` in the mirror and `Admin` in Clerk. Exactly the drift above, caught in the direction the fix prevents. Reconcile corrected it.

Also surfaced: ten `@test.com` rows from earlier seed data exist in the mirror and in no Clerk account. The new banner reports them correctly as "in Accelerep not in Clerk".

### Deleting a user did nothing (and said it worked)
The user-list kebab sent the id in the request **body**; `users.mjs` DELETE reads it from the **query string**. The server returned `400 id is required`, the client never checked `res.ok`, and it removed the row from local state anyway \u2014 so deleted users reappeared on refresh. The profile-page call site sent `?id=` correctly; the two had drifted apart.

Both controls were also **labelled "Deactivate" while performing a permanent delete**, with confirm copy ("lose access") that read as reversible.

- **Deactivate** \u2014 now `PUT active:false`. Reversible, keeps the record; the existing "Deactivated" filter tab finally has content.
- **Delete user** \u2014 permanent, red, honest copy, and states that the Clerk account is unaffected.
- Both check `res.ok` and surface failures in a banner instead of mutating local state on failure.

**No undo toast on user delete, deliberately.** The other deletes are soft (flag + toast + clear); this is a hard `db.delete`, so an "undo" would re-insert a reconstructed row \u2014 new id, new `createdAt` \u2014 not restore one. An undo that cannot undo invites careless deletion. The real safety net is that **Sync from Clerk rebuilds any Clerk-backed user**, which is how the roster was recovered after the wipe incident; phantom rows with no Clerk account are intentionally unrecoverable. Deactivate is the reversible path.

---

## 0PP-h. Prior Session (cont.) — Settings Duplicate Row, Lead Scoring v1.5 (already done), Dispatch Labels

### Lead Scoring v1.5 was already complete — the horizon entry was stale
Investigated to build it; found every piece already shipped:
- `activities.lead_id` exists in the DB **and** `schema.ts`, with index `activities_org_id_lead_idx`.
- `LeadsTab.jsx` sets `leadId` when logging against a lead; `ActivityModal` accepts it via `initialContext`.
- `activities.mjs` persists it and calls `rescoreLead` on **POST, PUT and DELETE**.
- `leads.mjs` and `score-leads-batch.mjs` both pass `events` into `scoreLead`.
- `DEFAULT_LEAD_SCORING` ships five `op:'event'` rules — Demo 35, Meeting 28, Schedule 18, Call 15, Email 6, each with its own decay half-life.
- Verified live: every org with a saved `leadScoring` config has **10** engagement rules (5 status/recency + 5 event); orgs without one fall back to the default, which also has 10.

**The entry had been stale for some time** — completed in a session whose notes never reached these docs. Same class as SVR-2 being recorded as fixed when it was not, in the opposite direction. **Verify against the code before building from a horizon item.**

### Settings had a cross-tenant duplicate row
`SELECT org_id, COUNT(*) FROM settings` showed `org_3Cwn…` twice. The second row was:

```
id     = org_3B8Tg9OtNKHYGXXSRa0mpA9WNwU
org_id = org_3CwnbloUXZQl0e6KtDhXFXRK8UD
```

An `id` belonging to one org carrying another org's `org_id` — **a surviving artifact of the cross-tenant upsert bug fixed in §0e** (`onConflictDoUpdate` keyed on `id` alone, before `setWhere` was added). A save from `org_3Cwn…` landed on `org_3B8Tg9…`'s row and rewrote its `org_id`, leaving that org with no settings row at all. The `setWhere` fix stopped recurrence but never cleaned up the damage.

**Why it mattered:** `settings.id` defaults to `'default'` and nothing enforced one row per org. Both GET and PUT read `WHERE org_id = ?` and took `rows[0]` **with no ORDER BY**, so with a duplicate an org could read one config and write another — settings appearing to revert at random, with nothing in the logs. Current code writes `id: orgId`, so each org owns one row; the duplicate was legacy.

**Fixed:**
- Stale row deleted (all test data — nothing to recover).
- **`CREATE UNIQUE INDEX settings_org_id_uniq ON settings (org_id)`** — a second row per org now fails loudly at insert instead of creating an ambiguous read.
- `settings.mjs` GET and PUT reads gained `.orderBy(desc(settings.updatedAt))` as belt-and-braces. **`desc` had to be added to the drizzle import** — without it every settings request would have crashed, which `node --check` does not catch.

**Follow-up worth doing before production data exists:** the same upsert bug could have touched other tables in that window. A one-off audit for rows whose `id` prefix does not match their `org_id` would confirm.

### Dispatch sub-tab labels
**Board → Job Board**, **Schedule → Work Schedules**. Labels only — the `id` values key the `localStorage` sub-tab persistence (`tab:dispatch:subView`) and every render branch, so renaming those would reset saved tabs and break the switch.

---

## 0b. Prior Session — UI Features, Task-Completion Bug, Users-Wipe Incident & Recovery

### ⚠️ INCIDENT + RECOVERY: users table wiped via a "test" DELETE (resolved)
While verifying the SVR-1 `users?clear=true` Admin gate, Claude suggested running the **live DELETE as a "test"** from the Admin session. As Admin, it succeeded (200 is correct for Admin) and **wiped the org's `users` roster.** Root learning captured as a permanent rule (memory + §below): **never advise a destructive command against live/production data, even to verify a gate** — use read-only checks, a throwaway/non-admin account, or reason from code.

**Recovery — full, no permanent loss:**
- **Record assignments were never at risk.** Ownership fields (`salesRep`, `accountOwner`, `assignedTo`, `repName`, `createdBy`) are name-**strings on each entity row**, not FKs into `users`. Wiping the roster left every deal/account/task assignment intact.
- **Clerk is the source of truth** for identity/email/role/org-membership; the `users` table is a mirror. Invites *failed* to re-add people because they were still Clerk org members (Clerk rejects inviting an existing member) — the missing piece was a roster rebuild, not an invite.
- **Built `users-sync.mjs` + a "⟳ Sync from Clerk" button** (Settings → Users) as the recovery tool AND a permanent admin feature. One click rebuilt the whole roster. See "New feature" below.
- **Quota is the one DB-only field** not mirrored to Clerk — may need manual re-key or a targeted Neon PITR of that column. (Open item.)

### New feature — Sync-from-Clerk roster reconcile (permanent admin tool) — SHIPPED
`netlify/functions/users-sync.mjs` (Admin-gated). Pulls the full Clerk org membership (paginated, mirrors `clerk-mfa-status.mjs`) and reconciles by email with **safe defaults**: creates missing rows; on existing rows role is authoritative-from-Clerk, name refreshes, **team/territory fill blanks only** (never clobbers in-app edits), quota/profile untouched; **reports** DB-rows-not-in-Clerk without deleting; promotes lingering `pending_`/placeholder ids to the real Clerk id. Returns a summary, writes a `users.synced` audit row. Button in `UsersDetail.jsx` shows the result and refreshes `settings.users` live. Regular HTTP function — auto-discovered, no `netlify.toml` entry needed.

### users.mjs clear=true gate — VERIFIED on master, was missing on dev
The SVR-1 follow-up (Manager could wipe all users) is **live and correct on master/production** (Admin-gated + audit + count, `user.cleared`). During doc regen it was found **still ungated on `origin/dev`** — a symptom of branch drift (below). Fix: reset dev to master.

### ⚠️ Branch drift — dev fell behind master (reconcile)
Several late-session commits (`users.mjs` gate `d88eb83`, task-await `86033b8`, Clerk sync `2bb52ef`) are on **master** but dev's tip was stuck at an older commit — dev was missing production-live fixes, including the users.mjs security gate. **Resolution:** `git reset --hard origin/master` on dev + `push --force-with-lease` (master is the correct superset; sole developer; verified `master..dev` had no unique commits first). Going forward keep the dev→smoke→master flow strict and avoid committing on master directly.

---

### Earlier this session — UI features & the task-completion bug (detail)

Four shipped items; the last was a two-part bug that took real debugging.

### Task due-time dropdown (design "Option D") — SHIPPED
Replaced the native `<input type="time">` in the task flow with a custom `TimeDropdown` (`src/components/ui/TimeDropdown.jsx`): compact trigger, 30-min increments, full 24h scrollable/keyboard-navigable listbox, type-to-search (`93`→9:30 AM, `3p`, `noon`, `eod`), clear ×, ARIA listbox. Stores canonical `'HH:mm'` / `''` — unchanged storage, no backend touch. Wired into `TaskRail.jsx` (the live editor) and `TaskModal.jsx` (legacy — was a three-`<select>` blue-era `TimePicker`); removed a dead `TimePicker` import from `App.jsx` and deleted `TimePicker.jsx`.
- **Runtime bug fixed during rollout:** the menu portals to `document.body` at `zIndex: 400`, but the task rail renders at **11003** — the menu opened *behind* the rail, invisible. Raised to **12000**.
- **Second runtime bug:** a mousedown click-race — the trigger opened on `onClick` (mouseup) while the outside-close listener was on `mousedown`; inside the draggable rail's own document handlers the open gesture immediately closed it. Fixed by toggling on `onMouseDown` + `stopPropagation` and a `justOpenedRef` guard that ignores the opening mousedown.

### Closed Won / Closed Lost deal outcome UI ("Option B") — SHIPPED
Closing a deal was **impossible from the OpportunityModal** — `StageRibbon` filters `!s.startsWith('Closed')`, so the two closed stages (already defined in `funnelStages` with weight 100/0) were hidden with no way to reach them. Added outcome buttons beside the ribbon: **✓ Won** (`T.ok`) / **✕ Lost** (`T.danger`). Closing repaints the ribbon as a single outcome band (stage · close date · lost reason · **Reopen**); header chip flips via existing `STATUS_MAP`. Won/Lost force probability (100/0). Reopen restores the prior open stage (3-level fallback: session-tracked → `stageHistory.prevStage` → last open stage). ✕ Lost still routes into the existing `LostReasonModal` via `handleSave`'s untouched interception. Everything downstream (HomeTab ARR, SalesManager win-rate, Reports, "open deals" counts) already keyed on these stage names — lit up for free. Only `OpportunityModal.jsx` changed.

### LostReasonModal — clipped actions fixed + design-system pass — SHIPPED
Modal was a fixed 440px `overflow:hidden` box; content overflowed so **Save/Skip were clipped off-screen** (looked like "no way to close it"). Rewrote as a flex column: fixed header, scrolling body, **pinned footer** → actions always reachable. Added **× and Esc** (both route to `onSkip`, the existing safe exit). Replaced forbidden blue-era palette (`#ef4444`/`#b91c1c`/`#e2e8f0`/16px radius) with warm stone/ink tokens; kept draggable/resizable, raised min-height to 340 so it can't be shrunk back into clipping.

### Task completion not persisting — TWO-PART BUG, FIXED
Reported as "completed tasks reappear on refresh." **This is a textbook case of why the console-truth diagnostic matters** — the fix took two rounds because the first cause masked the second:
1. **`handleCompleteTask` was local-only** (`setTasks` with no `dbFetch`) — the classic no-local-only-state violation. Rewrote to `async`: optimistic update → PUT `/.netlify/functions/tasks` → reconcile from response → **roll back on failure** + audit row.
2. **The rail caller didn't await it.** `TaskRail.handleConfirmComplete` fired `handleCompleteTask(task.id)` **without `await`**, then immediately `closeRail()` — which unmounts + triggers a task reload, racing the in-flight PUT so the write was abandoned. Some tasks (fast requests) stuck; others reverted, which is what made it look intermittent/cache-like. Fixed with `await`. The other two callers (HomeTab plate, TasksTab) already awaited correctly.

**Debugging note for the record:** the breakthrough was a browser-console `fetch` of the live API showing the plate tasks were genuinely `completed:false` in the DB — proving it was a failed *write*, not a display/cache issue (which was the wrong initial theory). When symptom and read-of-code disagree, get ground truth from the running app before changing code.

---

## 0c. Earlier Session — Security Audit Remediation (Criticals + Highs)

All four top findings from the external security audit are fixed, deployed to dev, and (Criticals) verified by re-running the audit's own reproductions.

### Critical 1 — Ungated org-wide mass delete (`?clear=true`) — FIXED & VERIFIED
Any authenticated member could wipe opportunities, accounts, contacts, tasks, activities, and leads in six requests. Now:
- **`requireRole(auth, roles, headers)`** added to `auth.mjs` — returns a ready-made 403 or `null`; the reusable primitive for all branch-level gating.
- **`writeAudit(orgId, {...})`** added to `_lib.mjs` — shared, entity-agnostic, best-effort (never throws) audit logger.
- Every `clear=true` branch across the six endpoints is **Admin-only**, writes an audit row (`<entity>.cleared` + actor + row count via `.returning`), and returns `count`.
- **`users.mjs` tightened too** (audit missed this): its clear branch sat behind `ADMIN_ROLES = ['Admin','Manager']` — a **Manager could wipe all users**. Now full-Admin-only + audit row.
- **`ContactsTab.jsx`**: select-all bulk delete uses the `clear=true` fast path only for Admins; everyone else falls back to per-id deletes (otherwise their delete would silently 403 and rows would reappear on refresh). Confirm-dialog copy corrected to "You'll have a few seconds to undo" (5s undo toast exists; old copy said "cannot be undone").
- **Verified on dev:** the audit's curl repro now returns 403 as a rep; admin clear works and writes `contact.cleared` to the audit log.

### Critical 2 — Decrypted API key returned to every member — ❌ **RECORDED FIXED BUT NEVER SHIPPED**
This entry previously described Critical 2 as complete. **The work was not in the repo.**
It was verified unpatched and byte-identical on `dev` and `master` at the start of the
following session, and no commit on any branch ever contained the implementation described
here (including its `settings.apiKeySet` / `settings.apiKeyCleared` audit actions).
Its factual claims were also wrong — the BYOK entry UI **had** been built, and was itself
the source of a second, unencrypted copy of the key.

**Actually shipped in the next session as `a9ed408` — see §0 for the real implementation,
which is Admin-gated on the whole PUT rather than field-stripping.** Kept here as the
record of what was believed done.

### Highs — Server-side role enforcement + object-level authorization — SHIPPED
Per the signed-off permission matrix (Admin/Manager: full write org-wide; Sales Rep: own + unassigned only; ReadOnly: no mutations):
- **`isReadOnly()`** added to `auth.mjs`; **`getCallerName(userId)`** added to `_lib.mjs` — cached display-name lookup (ownership fields store display names), returns null on miss so ownership checks **fail closed**.
- All six entity endpoints: **ReadOnly 403s on POST/PUT/DELETE before any handler logic**; **rep-role ownership checks on PUT and DELETE-by-id** against the entity's owner field (`salesRep` / `accountOwner` / `createdBy` / `assignedTo` / `repName`). Admin/Manager skip the check (zero added queries); where the handler already fetched the row, the check reuses it.
- **PUT is now strictly an update: unknown ids return 404** instead of silently creating via upsert (closes the audit's PUT-as-upsert design question). Existence → ownership → write, in that order. Client audit confirmed all creates use POST; the import "overwrite duplicates" PUT targets existing ids by definition.

### UsersDetail mock-data removal
Settings → Users was rendering **19 hardcoded fictional users** (`PT_USERS`, left over from the Claude Design mockups) plus mock pending invites whenever `settings.users` was empty — a new customer's first look would show 19 strangers. Removed both fallbacks; real data only; proper empty state ("No users yet — use 'Invite users' to add your team"); title band's fake "1 deactivated · Last edited yesterday by Morgan" replaced with a real computed `deactivatedCount`. **Still mock (deliberate, follow-up):** the Security-health sub-page's "recent events" feed + synthetic score — needs wiring to the real audit log.

---

## 0d. Earlier Session — SettingsTab Decomposition, Cleanup & Lead Scoring v1

### SettingsTab fully decomposed
The 18,409-line `SettingsTab.jsx` monolith is now a **43-line role-gating shell** (imports `AdminView` / `PersonalView`, gates on role). Extracted byte-identically (CRLF-preserved, Babel-validated) into:

- `src/Tabs/AdminView.jsx` (~806 lines) — the settings router + `V2Card`; imports all ~40 detail panels.
- `src/Tabs/PersonalView.jsx` (~188) — the non-admin view + `Personal*` panels.
- `src/Tabs/settings/catalogue.js` — `SETTINGS_ITEMS` + `WORKSPACE_TABS_BASE`.
- `src/Tabs/settings/<category>/` — every panel, grouped under: `shared/` (`tokens.js`, `ui.jsx`, `form.jsx`, `CategoryDetailChrome.jsx`), `company/`, `salesProcess/`, `quoting/`, `people/`, `integrations/`, `security/`, `audit/`, `data/`, `dispatch/`.

`AdminView`/`PersonalView` were intentionally kept at `src/Tabs/` (not moved into `settings/`) so all ~40 panel import paths moved **verbatim** — relocation was evaluated and skipped (cosmetic, with real path-rewrite risk on the router hub).

### Cleanup pass (the old SettingsTab end-of-project list — now closed)
- `SPDetailPageChrome` → renamed **`CategoryDetailChrome`**, moved to `settings/shared/`, all 17 importers updated; it takes a `category` prop. The 5 Dispatch panels now pass `category="Dispatch"` with trimmed crumbs.
- **No-inline-components rule** applied: inline sub-components hoisted to module scope across integrations (consolidated into a shared `MenuRow`), security (`FL`/`MenuRow`/`GL`), and data panels (`ActionEditor`, the `FL`s).
- Dead constants/defs deleted: `CORE_KPI_IDS`, `PT_TEAMS`, `PT_TERRITORIES`, plus ~9 unused Integrations primitives/`INT_*` data.
- Unwired stubs wired: FunnelStages "+ Add stage", **Industries drag-to-reorder**, **PainPoints "Import CSV"**.

### Lead Scoring v1 (rule-based, server-side, predictive-upgradeable)
Scores the **Leads-tab lead** on two independent axes — **Fit** (title seniority, est. ARR, source) and **Engagement** (status progression + time-decayed recency) — each normalized 0–100 and bucketed cold/warm/hot, with a stored breakdown ("why this score").

- `netlify/functions/score-lead.mjs` — pure engine: `computeFit` / `computeEngagement` / `bucketOf` / `evalRule` / `scoreLead` + `DEFAULT_LEAD_SCORING`. Forward-compatible `op:'event'` branch reserved for v1.5 behavioral events.
- **Write-triggered** recompute in `leads.mjs` (POST/PUT, in the same upsert) + **nightly batch** `score-leads-batch.mjs` (toml schedule `0 6 * * *`) to apply recency decay and pick up rule edits.
- `settings.extra.leadScoring` config; admin panel **Settings → Sales process → Lead scoring** (`LeadScoringDetail.jsx`) — editable Fit/Engagement rule tables, bucket thresholds, enabled toggle.
- `LeadsTab` renders a bucket-colored Fit/Eng chip + a click "why this score" breakdown popover (reads the persisted `score_breakdown`).
- **v1 engagement note:** the `activities` table has no `leadId`, so engagement is derived from lead status + recency, not behavioral events. v1.5 adds `leadId` to activities and feeds real events into the existing `computeEngagement`.

### Segment / Customer-type de-conflation
- New **Account Segments** panel (`salesProcess/AccountSegmentsDetail.jsx`, key `accountSegmentTiers`) — admin-managed; real top-level account-count distribution; no system-tier lock.
- **Customer types** reworked to an admin-managed **name + color** list (auto-distribution, auto-classification, and the system-tier lock all removed).
- `AccountRail`: Customer type chip-typeahead re-added under Segment (options from `customerTypeTiers`); the Segment `<select>` now reads `accountSegmentTiers` (previously both shared one list).

### Other fixes / features
- **Roles & SSO persistence** — `RolesDetail` and `SsoDetail` were edit-in-memory-only (silent data loss on reload). Now persist via `settings.extra.rolePermissions` / `ssoConfig` (both added to `settings.mjs` GET + PUT).
- **Industries** — drag-to-reorder (HTML5 DnD on the handle), kebab popover moved to a `createPortal` fixed-position menu (flips up/down, height-capped — no frame clipping), distribution wired to real **top-level** account counts (`!parentAccountId`).
- **PainPoints CSV import** — 2-column (`Category`, `Pain Point`) **merge** with case-insensitive dedupe and header auto-skip.
- **CsvImportModal** — brought onto the design system (removed the forbidden `#2563eb`, inlined CSS classes into `T`-token styles), added auto-map **confidence bars**, converted `rem`→`px`.

---

## 0e. Earlier Session — Security, Performance & Cleanup Hardening

Following a full codebase review, five batches were shipped and deployed:

1. **Cross-tenant write protection** — every `onConflictDoUpdate` is now org-scoped via `setWhere: eq(table.orgId, orgId)` (~20 functions). Conflicting on `id` alone had allowed one org to overwrite another org's row.
2. **ID hardening** — all client-side IDs migrated from `Date.now() + Math.random()` to `'<prefix>' + crypto.randomUUID()` (27 sites). Removes the predictable / collision-prone generator.
3. **DB indexes** — `org_id` (+ targeted composite) indexes declared in `schema.ts` for all tenant tables and applied to Neon via `CREATE INDEX CONCURRENTLY`. Every query filters `org_id`; these were previously full table scans.
4. **Error-leakage fix** — new shared `netlify/functions/_lib.mjs` with `serverErrorBody()`; 42 functions no longer return raw `err.message` / `err.stack` (generic message + correlation id to client, full detail logged server-side).
5. **Cleanup** — removed 6 orphaned files (`TerritoriesSettings`, `VerticalsSettings`, `TeamBuilder`, `CustomDashboard`, `design/primitives`, `design/tokens`), the stray `netlify.tom`, and a broken redirect in `netlify.toml`.

**Verified, no change needed:** scheduled functions (`digest`, `pipeline-alerts`, `task-reminders`) are not publicly invokable — Netlify blocks direct URL invocation in production.

**Deferred:** CORS allow-list (low risk with bearer-token auth; `allowOrigin()` helper is ready in `_lib.mjs`). Plus public-API DB-side pagination, SettingsTab split, PipelineTab inline-component cleanup, date-typed columns, and a baseline test suite.

---

## 1. Project Overview

| Field | Value |
|---|---|
| Product | Accelerep — B2B SaaS CRM & sales pipeline application |
| Developer | Jeff Russell (sole developer & admin) |
| Production | salespipelinetracker.com (master branch) |
| Dev | accelerep.netlify.app (dev branch) |
| Auth | Clerk — Development instance (migration to Production pending) |
| Database | Neon PostgreSQL · branch snow-glitter-10832272 · Drizzle ORM |
| Functions | Netlify Functions (ES modules, .mjs) |
| Frontend | React / Vite · multi-file component architecture |

---

## 2. Tech Stack

| Layer | Detail |
|---|---|
| Frontend | React/Vite, multi-file component architecture |
| Functions | Netlify Functions — ES modules (.mjs) |
| Database | Neon PostgreSQL via Drizzle ORM |
| Auth | Clerk Organizations (multi-tenancy) |
| Email | Resend (send-email.mjs shared mailer) |
| SMS | Twilio — send-sms.mjs · number 972-526-0638 · A2P under carrier review |
| Calendar | Google OAuth fully functional · Microsoft/Yahoo deferred |
| PDF | quote-pdf.mjs using pdfkit |
| Validation | @babel/parser JSX plugin — pre-delivery syntax check on every file |

---

## 3. Architecture Highlights

- **App-wide context:** `AppContext` / `useApp()` — all tabs take zero props, destructure from context
- **Custom hooks:** `useModalState`, `useUIState`, `useCalendarState`, `useUserHandlers`, `useAccounts`, `useContacts`, `useTasks`, `useDraggable`
- **`_deps` ref getter** wires utility functions into data hooks
- **`ModalLayer`** and **`QuickLogFab`** live outside `.app-container` in `App.jsx`
- All modals/panels use draggable/resizable system (`useDraggable` + `ResizeHandles.jsx`); click-outside dismissal disabled app-wide
- Settings stored as JSONB with `settings.extra` blob — new fields require updating both GET and PUT in `settings.mjs` or they silently reset
- Multi-tenancy via Clerk Organizations — all DB queries filter by `orgId`
- **Tenant-write safety:** every upsert is org-scoped via `setWhere: eq(table.orgId, orgId)` — never conflict on `id` alone
- **IDs:** client-generated as `'<prefix>' + crypto.randomUUID()` (not timestamp + random)
- **DB indexes:** `org_id` (+ composites) on all tenant tables, declared in `schema.ts`
- **Shared function helpers** in `netlify/functions/_lib.mjs`: `serverErrorBody()` (no error leakage), `allowOrigin()`
- User preferences stored flat on user row (not nested in `user.profile`) — server-side functions read from top level first

---

## 4. Completed Features — All Tabs

| Tab | Status |
|---|---|
| Home | Dashboard widgets, KPI cards, activity feed |
| Pipeline | Kanban + list view, drag-drop, opportunity modal with forecast category, revenue field (products removed), ARR renamed to Revenue throughout |
| Tasks | Calendar + list, task modal, reminders, overdue detection |
| Accounts | Full list with Subs column (48px, tight to Account 220px fixed), Industry 200px wrapping, all columns fixed/balanced. Filter panel: Industry, Owner (from settings.users + assignedRep + accountOwner, deduped), Open Pipeline + Unassigned option. Owner column reads `effectiveOwner = accountOwner \|\| assignedRep`. ViewingAccountPanel Account Info tab shows Assigned Rep inline with Company Name. Combined toolbar (tabs + warmth chips + sort + filter). AccountsTab layout spacing still needs polish — deferred to next session. |
| Contacts | Contact list, detail panel, activity log |
| Leads | Full lead management; firstTouchDate + convertedAt auto-set in leads.mjs. **Lead Scoring v1** live — Fit/Engagement/bucket chip + breakdown popover, write-triggered + nightly recompute |
| Quotes | Full CPQ system — versioning, approvals, PDF generation, Price Book |
| Reports | See Section 5 |
| Sales Manager | Rep roster, quota management, leaderboard |
| Settings | **Fully decomposed** (43-line shell → `AdminView`/`PersonalView` → ~40 panels under `settings/<category>/`). New panels: **Lead scoring**, **Account segments**. Customer types = admin-managed name+color list. Roles/SSO now persist. `CategoryDetailChrome` shared chrome. |

---

## 5. Reports Tab — Detailed State

### 5.1 Sub-tabs

| Sub-tab | Real | Mocked / Pending |
|---|---|---|
| Pipeline & Forecast | Pipeline value, won revenue, coverage, waterfall bars, stage conversion cohort math, forecast ring | Speed-to-lead / velocity show `—` until firstTouchDate accumulates |
| Performance | All KPIs, leaderboard, rep metrics, delta vs team, activity ratio, loss reasons, activity mix | Nothing — fully real |
| Activity | 3-step real funnel (Activities logged → Opps active 90d → Closed Won). 3 KPI cards (Total, Per rep, Per open opp) | Connect rate removed. Heatmap, account coverage all real. |
| Leads | All KPIs, funnel, by source, score dist, source ROI with benchmark colour coding | Speed-to-lead and velocity show `—` until firstTouchDate/convertedAt accumulate |
| Saved Reports | See 5.2 | — |

### 5.2 Saved Reports Tab

- **Pinned section** — 4 live-data cards (Quota pacing, Pipeline added, Stuck deals, Closing 30d)
- **Your reports section** — loads from `saved_reports` DB table via `GET /saved-reports` on mount. Shows saved reports with delete (×) button.
- "Your reports" and "Shared by team" static seed sections removed — no DB table existed for them
- **Templates section** — 6 cards, always static by design. Clicking "Start →" routes to live template view.
- Search filters Pinned + Your reports + Templates simultaneously
- **`+ Create report`** button launches full Create Report flow (see 5.3)

### 5.3 Six Report Templates — All Live Data

| ID | Template | Data Sources |
|---|---|---|
| t1 | Deal review — weekly | Commits (forecastCategory=commit + late-stage fallback), At risk (14d+ no activity), New since (7d), Stage changes this week (stageChangedDate). All 4 panels show real opps with empty states. |
| t2 | Win / loss analysis | Win rate, cycle median, loss reasons from lostReason field, competitor head-to-head from competitor field, losses by stage exited from stageHistory. |
| t3 | Rep scorecard | Rep selector dropdown (`selectedRepSC` state at SavedReportsTab top level — not conditional). Quota ring SVG, 4 metrics vs team avg, attainment history 6Q, activity mix, recent wins/losses 30d. |
| t4 | Territory coverage | Territory→rep map from settings.users[].territory. Deal-size tier grid (4 tiers). Heatmap 6-step warm→dark. Industry mix from opp vertical field. Auto-flagged coverage gaps. |
| t5 | Stage conversion deep-dive | Cohort funnel from stageHistory max-stage traversal. Avg days per stage from stageHistory timestamps (median). Drop-off reasons from lostReason grouped by exit stage. Auto-flag: worst conversion + slowest stage. |
| t6 | Forecast vs actual | 6 quarters built from fiscalYearStart setting. Actual = Closed Won arr in quarter window. Forecast = team quarterly quota. Bar chart with dashed current-quarter bar. Per-rep accuracy heatmap table. |

### 5.4 Create Report Flow

- Triggered by `+ Create report` button — all builder state declared unconditionally at `SavedReportsTab` top level (no React #310 risk)
- **Picker:** AI composer (full with starter prompts) + 3 on-ramp cards (Blank / Template / Duplicate) + Recent reports strip
- **AI path:** prompt → Generate → interpretation banner with editable chips, refine input, live stuck-deals preview from real data (14d+ no activity), config rail with pre-filled Data/Filters/Chart/Format tabs
- **Template path:** routes to `setActiveTemplate(id)`, closing Create Report flow and opening the existing live template view
- **Duplicate path:** lists Pinned cards as cloneable reports
- **Blank builder:** source selector, unified chip zone (selected + available chips in one container), basic + advanced field sets, chart type grid, filters, format. Advanced toggle reveals 8 more dims + 4 more metrics.
- **Save to library:** POST to `/.netlify/functions/saved-reports`, shows Saving…/Saved confirmation, closes builder on success, adds to Your reports section optimistically

---

## 6. Database Changes

### 6.0-NEW This batch
**No schema change.** The inline-component audit is entirely client-side refactoring.

### 6.0-PRIOR Prior batch
**No schema change.** `emailSignature` lives in the existing `users.profile` jsonb blob. The record-number work changed only the QUERY, not the columns — see §0A.31 for why `MAX(text)` would have been wrong.

### 6.0-PRIOR Prior batch
**No schema change.** Everything in §0B.24–0.28 is client-side or settings-blob. Worth stating because two items looked like they needed one and did not: `planWeek` reads existing columns, and the calendar tab reuses the OAuth flow already in place.

### 6.0-PRIOR Prior batch (record-number integrity)
**3 unique indexes, additive, no columns added or removed:**
- `dispatch_customers_org_number_uq` on `(org_id, customer_number)`
- `dispatch_jobs_org_number_uq` on `(org_id, job_number)`
- `quotes_org_number_version_uq` on `(org_id, quote_number, **version**)`

**The version column in the quotes index is not optional.** v1/v2/v3 deliberately share one `quote_number`; a two-column index would make versioning impossible.

**Run `db/check-duplicate-numbers.sql` first, per environment.** A unique index cannot be created over data that already violates it. Read-only. Came back clean on dev.

**No other schema change this session.** `settings.dispatchPropertyTypes` and the template `ctypes`/`propertyTypes` axes are settings-blob keys, not columns — the blob key needed adding to **both GET and PUT** in `settings.mjs` (§18 rule).

### 6.0-C Prior session (plan recurrence)
**4 columns, all additive** — `dispatch_service_plans.lead_days integer NOT NULL DEFAULT 14` · `.anchor_mode varchar(20) NOT NULL DEFAULT 'fixed'` · `dispatch_jobs.service_plan_id text` · `.plan_due_date varchar(20)`.

No table for visits. Occurrences are computed from `planStartDate + n x intervalDays` (or from the last completed visit in `rolling` mode), and a job's `plan_due_date` records which occurrence it satisfies. **Skipping or deferring a single occurrence is therefore not expressible** — that would need a `dispatch_plan_visits` table.

### 6.0-B This session (service plans)
**New table `dispatch_service_plans`** (org-scoped, `dispatch_service_plans_org_id_idx`) plus **2 columns on `dispatch_customers`** — `service_plan_id text`, `plan_start_date varchar(20)`.

`serviceAgreement` and `agreementExpiry` are **kept**: the former is the only record of pre-plan coverage, the latter now means coverage end for either era. The stale schema comment on `serviceAgreement` was corrected to say what the UI actually writes (`preferred`, not `enterprise`) and marked legacy.

### 6.0-NEW This session (vehicle class requirement)
**1 column added, nullable, additive only** — `dispatch_jobs.required_vehicle_type varchar(50)`, applied via `drizzle-kit push`, **run per environment before the code deployed**. Diff was one insertion with zero deletions, so no `DROP COLUMN` was possible; the plan output was checked anyway (§18c).

**No other schema change this session.** Two things that looked like they needed one did not:
- `dispatch_jobs.equipment_ids` (jsonb) was repurposed from "checked-out equipment IDs" to "required equipment categories". Safe because **no client had ever written it** — every POST sent `[]` — and asset-level checkout is tracked on `dispatch_equipment.checkedOutJobId`, pointing the other way.
- Dispatch customer segmentation derives service history from `jobs` at render time. A stored `jobCount` would need maintaining on every job write and would drift on delete.

**Retired as sources of truth (data left in place, not deleted):** `settings.dispatchVehicles`, `settings.dispatchEquipment`. Still read only to translate legacy template ids during migration.

### 6.0 Prior session (UI + bugfix)
**No schema changes.** New `audit_log` rows: `update`/task on completion (`Completed`/`Reopened`), plus the Closed Won/Lost stage changes flow through the existing opportunity update audit.

### 6.0a This session (Dispatch)
**4 columns added, all nullable, additive only** — applied via the Neon SQL editor, not `drizzle-kit push`:
`dispatch_customers.customer_number varchar(50)` · `dispatch_jobs.crew_size integer` · `dispatch_jobs.min_license varchar(50)` · `dispatch_jobs.need_skills jsonb DEFAULT '[]'`.
Backfill assigned `CUST-0001`–`0008` to existing customers by `created_at`, per org. Re-runnable (`WHERE customer_number IS NULL`). **Dev and production share the Neon `main` branch, so one run covered both.**

### 6.0a2 This session (technician licence)
**1 column added, nullable, additive only** — `dispatch_technicians.license_level varchar(50)`, applied via the Neon SQL editor.
**Deploy order matters:** this one shipped code-first and took every `dispatch-technicians` read down with `column "license_level" does not exist`. See §8.

### 6.0a3 This session (dispatch operations)
**No schema changes.** Every column and table used already existed unreferenced:
`dispatch_jobs.trade` / `.jobType` (hardcoded, now admin-configurable), `dispatch_technicians.workingHours` (jsonb weekly pattern), and the whole `dispatch_schedule_blocks` table (dated time off — previously had **no endpoint at all**).
New `settings.extra` keys: `dispatchTrades`, `dispatchJobTypes`, `dispatchBlockTypes` (all added to `settings.mjs` GET **and** PUT).
New audit actions: `dispatch.schedule`, `dispatch.schedule.override`, `dispatch.schedule.bulk`, `dispatch.timeoff.unassign`.
Optional cleanup SQL: priority vocabulary normalization (`urgent`→`emergency`, `standard`→`normal`) — not a prerequisite, since legacy values are translated on read.

### 6.0a4 This session (Technician role)
**No schema changes.** New function `user-role.mjs`. New audit action `user.role.changed`.
Role values are now fixed: `Admin | Manager | User | ReadOnly | Technician` — `'User'` is the stored value for a sales rep ("Sales Rep" is a display label only).

### 6.0a5 This session (job numbers, save errors)
**No schema changes.** `dispatch_jobs.job_number` already existed and was never populated — backfilled with one re-runnable `UPDATE` (`JOB-YYYY-NNNN`, per org, per year, by `created_at`).
New shared module `src/Tabs/settings/shared/saveSettings.js`.

### 6.0a6 This session (user/Clerk drift)
**No schema changes.** `users-sync.mjs` gained `?check=true` (dry run — no writes, no audit row). `role` removed from `users.mjs` `sanitize()`; new internal helpers `withRole()` / `roleOf()`.

### 6.0a7 This session (settings uniqueness)
**One index added:** `CREATE UNIQUE INDEX CONCURRENTLY settings_org_id_uniq ON settings (org_id)` — applied via the Neon SQL editor after deleting the duplicate row. Prevents more than one settings row per org.

### 6.0b This session (SVR-2)
**No schema changes.** New `audit_log` actions from `settings.mjs`: `settings.updated`, `settings.apikey.set`, `settings.apikey.cleared`, `settings.apikey.migrated`.

### 6.0c Earlier session (SVR-1 remediation)
**No schema changes.** New rows written to the existing `audit_log` table by new actions: `<entity>.cleared` (×6), `user.cleared`. *(The `settings.apiKeySet` / `settings.apiKeyCleared` actions listed here previously were never shipped — see §0.)*

### Prior sessions (reference)

### 6.1 New Table: saved_reports

> Requires `npx drizzle-kit push` after deploying updated `schema.ts`

| Column | Type | Notes |
|---|---|---|
| id | text PRIMARY KEY | client-generated: `rpt_timestamp_random` |
| orgId | text NOT NULL | Clerk org scoping |
| ownerId | text NOT NULL | Clerk userId |
| ownerName | varchar(255) | display name |
| name | varchar(255) NOT NULL | — |
| description | text | — |
| source | varchar(100) | e.g. Opportunities |
| dims | jsonb | array of {id, label, kind} dimension chips |
| metrics | jsonb | array of {id, label, kind} metric chips |
| chartType | varchar(50) | — |
| filters | jsonb | — |
| config | jsonb | future use |
| isShared | boolean DEFAULT false | — |
| createdAt | timestamp DEFAULT now() | — |
| updatedAt | timestamp DEFAULT now() | — |

### 6.2 New Function: saved-reports.mjs

- `GET` — returns all saved reports for org ordered by `updatedAt` desc
- `POST` — creates new report (id required in body)
- `PUT` — upsert via `onConflictDoUpdate` (rename, share toggle)
- `DELETE` — removes by id scoped to orgId

### 6.3 leads table — Lead Scoring columns (this session)

> Requires `drizzle-kit push` after deploying updated `schema.ts`. Columns have defaults, so existing rows are safe.

| Column | Type | Notes |
|---|---|---|
| lead_score_fit | integer DEFAULT 0 | Fit axis 0–100 |
| lead_score_engagement | integer DEFAULT 0 | Engagement axis 0–100 |
| lead_score_bucket | text DEFAULT 'cold' | cold / warm / hot |
| score_breakdown | jsonb DEFAULT '{}' | matched Fit + Engagement rules ("why this score") |
| score_updated_at | timestamptz | last scored |

Plus indexes `leads_org_id_bucket_idx (org_id, lead_score_bucket)` and `leads_org_id_fit_idx (org_id, lead_score_fit)`. The legacy `score` (default 50) is kept and now set to the headline `max(fit, engagement)`.

### 6.4 settings.extra keys (JSONB — each needs GET **and** PUT in `settings.mjs`)

`pipelines`, `teams`, `territories`, `verticals`, `industries`, `customerTypeTiers`, **`accountSegmentTiers`**, `painPoints`, `leadConvBenchmarks`, **`leadScoring`**, **`rolePermissions`**, **`ssoConfig`**, … (bolded = added this session). Omitting a key from either GET or PUT makes it silently reset.

### 6.5 New functions

- `score-lead.mjs` — pure scoring engine (no DB; reusable by write-trigger + batch).
- `score-leads-batch.mjs` — nightly scheduled recompute (`netlify.toml`: `[functions."score-leads-batch"] schedule = "0 6 * * *"`).

### 6.6 Existing: leads table — firstTouchDate

- `firstTouchDate varchar(30)` — added previous session, **preserved** in schema.ts this session. The uploaded schema.ts was missing this column — Drizzle wanted to DROP it with 20 rows of data. Caught before push, fixed immediately.

---

## 7. Files Modified This Batch

| File | What Changed |
|---|---|
| `src/Tabs/SalesManagerTab.jsx` | `ForecastTab` + `AdminTab` hoisted to module scope (9 / 18 props). Dead `calcCommission`, `inputStAdmin` removed. SPIFF + commission saves with `res.ok`, save-status banner, Admin-only gate on mutating controls. Description input bound to `condition`. |
| `netlify/functions/settings.mjs` | `spiffs` added to **both** the GET projection and the PUT `extra` merge. |
| `src/components/layout/ModalLayer.jsx` | Claim submit fixed — `res.ok`, real JSON parse, server error surfaced, submitting state. Claim error state lifted to `ModalLayer` (the modal is an IIFE). Restyled to the house palette. |
| `src/App.jsx` | `promptSpiffClaim` — exposed via `_deps.onDealWon` (ref-getter) and via `AppContext`. |
| `src/hooks/useOpportunities.js` | Fires `deps.onDealWon` on any Closed Won save. |
| `src/components/KanbanView.jsx` | Drag-to-stage now checks `res.ok` and triggers the claim prompt on Closed Won. |
| `src/Tabs/HomeTab.jsx` | `SpiffPanel` at module scope; `spiffClaims` pulled from context; rendered in the right column. |
| `package.json` / `package-lock.json` | `@babel/parser` promoted to an explicit devDependency. |
| `scripts/scan-dbfetch.mjs` | Classifies discarded-`Response` `dbFetch` sites as READ-DISCARD / BLIND-WRITE / SWALLOWED. Not a gate, not wired to npm. (Previously misnamed `triage-dbfetch.mjs` in the docs.) |
| `scripts/check-bundle.mjs` | **New.** Bundle guard — asserts `dist/` contains the application. Runs inside `npm run build`; fails the Netlify deploy on a hollow bundle. |
| `tests/scanners.test.mjs` | **New.** Regression suite for all four gates. Each fixture is a real bug that shipped; each scanner also has a `-safe` fixture it must stay quiet on. Fails if a `check:` script has no fixture. |
| `tests/fixtures/scanners/` | **New.** 9 `.jsx` fixtures. Outside every scanner's `walk('src')` path and outside Node's test-file patterns — neither scanned nor executed. |
| `tests/db-write.test.mjs` | **New.** 9 tests for `dbWrite`. |
| `netlify/functions/_lib.mjs` | `bulkUpsert()` added — chunked multi-row upsert with `excluded.<col>`, org-pinned `setWhere`. |
| `src/utils/storage.js` | `dbWrite()` added alongside `dbFetch`. |
| `scripts/check-dupes.mjs` | **New.** `npm run check:dupes` — duplicate object keys and duplicate JSX attributes, both of which silently discard the earlier value. |
| `src/utils/csvAutoMap.js` | **New.** CSV header → app field matching: weighted aliases, deny rules, global one-to-one assignment. Pure; tested. |

---

## 7Z. Files Modified — Prior Batch (Inline-Component Audit)

| File | What Changed |
|---|---|
| `scripts/check-inline-components.mjs` | **New.** `npm run check:inline`. Flag parsing, quiet-by-default output, `--churn` / `--all` / `--help`, exit 1 only for user-visible findings. |
| `package.json` | `check:inline` script entry. |
| `src/components/modals/ContactModal.jsx` | `ContactSearchField` hoisted to module scope; `allContacts` / `handleChange` / `openNestedNewContact` threaded as props. |
| `src/Tabs/ReportsTab.jsx` | `EntitySelector` hoisted — already fully prop-driven, nothing to re-thread. |
| `src/Tabs/settings/audit/AuditDetail.jsx` | `SSelect` hoisted. |

---

## 7A. Files Modified — Prior Batch

| File | What Changed |
|---|---|
| `src/components/layout/AppHeader.jsx` | Calendar tab: connected account + date, lazy connection fetch, Disconnect wired to the existing endpoint. Profile tab: email-signature textarea. |
| `src/App.jsx` | `profileForm` now seeded with `emailSignature` **and `mobile`** — the latter was being sent on save but never loaded, so every save wiped it. |
| `netlify/functions/users.mjs` | `emailSignature` added to the `profile` jsonb allowlist. |
| `netlify/functions/quote-email.mjs` | Sender signature read server-side from the sender's own row, HTML-escaped, appended in place of the generic "your account representative" line. |
| `netlify/functions/dispatch-customers.mjs` · `dispatch-jobs.mjs` · `quotes.mjs` | Number generators: full-table scan → `MAX(CAST(SUBSTRING(TRIM(col) …) AS INTEGER))`. See §0A.31 for why plain `MAX(text)` is wrong. |

---

## 7B. Files Modified — Prior Batch

| File | What Changed |
|---|---|
| `src/Tabs/DispatchTab.jsx` | `planWeek` rewritten: crew assembled at a shared slot, running equipment ledger, partial crews skipped with a specific reason. Apply loop and optimistic update now persist the whole crew (was `coTechIds: []`). |
| `src/Tabs/AdminView.jsx` | `onBack` and cross-panel navigation guarded; `LeaveGuardModal` at module scope; `settingsSaveRef` wired to "Save changes and continue"; Personal scope toggle removed. |
| `src/Tabs/SettingsTab.jsx` | Unreachable non-admin branch, `canAdmin` split and conditional title removed. 37 lines. |
| `src/Tabs/settings/shared/form.jsx` | `DetailPageChrome` gained an `error` prop. |
| **14 settings panels** | All registered saves use `putSettings`, surface errors, and rethrow. Four were clearing the dirty flag on failure — see §0B.25. |
| `src/Tabs/PersonalView.jsx` | **DELETED** (262 lines of mockups). |
| `src/Tabs/settings/catalogue.js` | Four `scope:'personal'` entries removed. |
| `src/components/layout/AppHeader.jsx` | Calendar tab in the avatar panel; `connectCalendar` reuses the HomeTab OAuth flow. |
| `src/Tabs/HomeTab.jsx` | Calendar status strip — states connected-with-no-events instead of rendering nothing. `calendarLoading` destructured. |
| `src/Tabs/ReportsTab.jsx` · `PipelinesSettingsPanel.jsx` · `ViewingContactPanel.jsx` | Four pre-existing crash bugs fixed (§0B.28). |
| `scripts/check-tdz.mjs` | Covers function declarations and default exports; browser globals widened. |

---

## 7P. Files Modified — Prior Batch

| File | What Changed |
|---|---|
| `db/schema.ts` | 3 unique indexes on the record-number columns. Additive only. |
| `db/check-duplicate-numbers.sql` | **New.** Read-only pre-flight for the above, plus a commented renumber-don't-delete remedy. |
| `netlify/functions/_lib.mjs` | **New** `withNumberRetry` — retries only 23505, jittered backoff, number reissued inside the retry. |
| `netlify/functions/quotes.mjs` | `quoteNumber` server-issued + immutable; `resolveQuoteNumber` verifies a client-sent number as a reference; **NOT NULL upsert fix (§0PB.20)**; both write paths wrapped in the retry. |
| `netlify/functions/dispatch-customers.mjs` · `dispatch-jobs.mjs` | Inserts wrapped in `withNumberRetry`, number issued inside. |
| `netlify/functions/settings.mjs` | `dispatchPropertyTypes` added to GET **and** PUT. |
| `src/Tabs/DispatchTab.jsx` | Customers three-column redesign; property types from settings; Won→Dispatch bridge as a `useMemo` with template-driven defaults + placeholder guards; `matchTemplateForOpp` two-axis specificity matching; `draftIsDirty` + `guarded()` unsaved prompt; CustomersView filter-race fix; TechniciansView `startNew` fix; `linkedAccount`/`save`/`copyFromAccount` passed as props. |
| `src/Tabs/settings/dispatch/DispatchPropertyTypesDetail.jsx` | **New.** Org-configurable premises segments with in-use guards and orphan recovery. |
| `src/Tabs/settings/dispatch/DispatchJobTemplatesDetail.jsx` | "Applies when" — two optional multi-select axes, `migrateAxes`, catch-all ambiguity warning. |
| `src/Tabs/QuotesTab.jsx` | Empty states in both read paths; version clone fixes (source, deep copy, `dealDiscount`); 3-version cap removed; failed line-item save now throws. |
| `src/hooks/useQuotes.js` · `src/App.jsx` | `getNextQuoteNumber` removed entirely — it was threaded through two App.jsx call sites. |
| `src/Tabs/settings/integrations/AutomationsDetail.jsx` | Pre-existing crash fixed — `sel`/`inp` hoisted to module scope for `ActionEditor`. |
| `src/Tabs/AdminView.jsx` · `src/Tabs/settings/catalogue.js` | `dsp-proptypes` registered. |
| `scripts/check-tdz.mjs` | Extended to catch **undefined references**, not just TDZ ordering. |

---

## 7B. Files Modified — Prior Session

| File | What Changed |
|---|---|
| `db/schema.ts` | `dispatch_jobs.required_vehicle_type varchar(50)` — nullable, additive. Ran per environment before deploy. |
| `netlify/functions/dispatch-jobs.mjs` | `requiredVehicleType` added to normalise, POST, and the PUT scalar allowlist. |
| `src/Tabs/DispatchTab.jsx` | `preferredTechId` resolved from the customer (was `assignedTechId`); `allTechs` roster prop; five-state preference note; `applyJobTemplate` + template picker with Undo and compounding guard; `equipmentConflicts` (unit-level, overlap-aware) + crew-builder banner + `handleSchedule` gate; vehicle-class blocker in `scoreTech` threaded through all four call sites incl. `planWeek`; `equipCategories` / `vehicleTypes` derived from the tables; New Job equipment + vehicle controls; customer segmentation (filters, grouping, derived service history, service summary strip, `agreementExpiry` control). |
| `src/Tabs/settings/dispatch/DispatchVehiclesDetail.jsx` | **Rewritten.** Backed by `dispatch_vehicles` + `dispatch_equipment` tables. Per-record saves (no whole-blob PUT). Category summary with available/total. Idempotent import from the retired blobs. All sub-components at module scope. |
| `src/Tabs/settings/dispatch/DispatchJobTemplatesDetail.jsx` | `commitNumber` fix for the two uneditable inputs + save-time sanitise; equipment requirements moved to table **categories** with two-shape migration deferred until the fetch lands; `vehicleType` control with not-in-fleet guard; **Edit** added to the ⋯ menu + row affordance; `labelise` helper. |
| `src/Tabs/settings/dispatch/DispatchCrewsDetail.jsx` | Vehicles fetched from `dispatch_vehicles` instead of the blob; dangling-id guard on the default-vehicle select. |
| `netlify/functions/dispatch-service-plans.mjs` | **New.** Org-scoped CRUD. Upsert-on-id POST (idempotent seeding). Strict interval/visit derivation. DELETE returns **409** with the customer count when the plan is in use. |
| `src/Tabs/settings/dispatch/DispatchServicePlansDetail.jsx` | **New.** Table-backed, per-record saves. Cadence, lead days, anchor mode, visit template, covered job types, SLA, pricing. One-click seeding from legacy agreement labels. |
| `src/Tabs/AdminView.jsx` · `src/Tabs/settings/catalogue.js` | `dsp-plans` registered — import, id map, route, catalogue card. |
| `netlify/functions/dispatch-jobs.mjs` | `servicePlanId` + `planDueDate` through normalise, POST and the PUT allowlist. |
| `scripts/check-tdz.mjs` | **New.** AST scan for render-time temporal-dead-zone reads. Added after the §0X.12 incident. |

---

## 7P. Files Modified — Prior Session

| File | What Changed |
|---|---|
| `src/components/ui/TimeDropdown.jsx` | **New.** Custom 30-min time picker (design Option D); portals at z-index 12000; mousedown-race guarded. |
| `src/components/ui/TimePicker.jsx` | **Deleted** (legacy three-`<select>` picker, fully replaced). |
| `src/components/rails/TaskRail.jsx` | Native time input → `TimeDropdown`; **`await handleCompleteTask` before `closeRail()`** (the completion-race fix). |
| `src/components/modals/TaskModal.jsx` | Legacy `TimePicker` (dueTime + reminderTime) → `TimeDropdown`. |
| `src/App.jsx` | Removed dead `TimePicker` import. |
| `src/components/modals/OpportunityModal.jsx` | Won/Lost outcome buttons + closed-state band + Reopen (Option B). |
| `src/components/modals/LostReasonModal.jsx` | Flex layout (pinned footer, scroll body) so actions never clip; ×/Esc close; warm-token restyle. |
| `src/hooks/useTasks.js` | `handleCompleteTask` now async + persists via PUT with rollback + audit. |

---

## 8. Key Learnings & Principles

### From this batch (inline components)

- **Verify a backlog item before working it.** "Inline-component audit (`TasksTab`, `LeadsTab`, `PipelineTab`)" sat on the list for weeks; all three were already clean, and the real instances were in files the entry never mentioned. A stale item costs a whole session if taken at face value.
- **Triage by observable consequence, not by rule violation.** 81 components technically break the no-inline-components rule; 5 cause anything a user can see. Without that distinction the item reads as an unaffordable rewrite of two enormous files. With it, three targeted fixes.
- **The severity signal is: does it own something lost on unmount?** A form control (focus), its own hook state, or a DOM ref (scroll, measurement). A stateless presentational wrapper remounts harmlessly.
- **`autoFocus` masks the symptom, not the bug.** `EntitySelector` refocused itself on every remount, so it looked fine — but the caret jumped to the end of the field mid-word.
- **Run `check:tdz` after every hoist.** Moving a component to module scope strands its closure reads, which is how six crashes happened in earlier batches. The two scanners are complementary: `check:inline` finds what should be hoisted, `check:tdz` catches what the hoist broke.
- **Output design decides whether a checker gets used.** The first version buried two real findings under 410 lines of "no inline components". Quiet by default, verbose on request, and a non-zero exit only for the class that actually matters.
- **Test the tool by running it, not by reading it.** Both bugs in the scanner — arguments treated as paths so `--all` died with ENOENT, and unusable default output — appeared immediately on first real use and were invisible on inspection.

### From the prior batch (calendar, signatures, query performance)

- **Check whether the endpoint already exists before writing one.** Calendar disconnect was scoped as "needs a new function to revoke and clear the credential"; `calendar-connections.mjs` had a correctly authorised `DELETE` the whole time. The work was client wiring.
- **The obvious index-friendly query can still be wrong.** `MAX(customer_number)` looks like the textbook fix for a full-table scan, and it reissues live numbers: zero-padding only preserves ordering while the digit count is constant. Extract the numeric part and `MAX` that.
- **A constraint does not rescue a bad generator.** The unique index would catch the collision, but every retry proposes the same losing number. Constraints protect data; they do not fix logic.
- **Validate generated SQL with a real parser.** `pglast` parses the emitted query as PostgreSQL would. Trusting that a query builder produced valid SQL is the same class of assumption as trusting that a file which parses will run.
- **When replacing an implementation, diff the SEMANTICS, not just the output shape.** Running old JS against the new SQL semantics over ten row sets found one real divergence: the old code trimmed, the SQL did not, so a whitespace-padded number would have been reissued.
- **A field sent on save but not loaded silently erases data.** `mobile` was in the Save Profile payload and absent from the load, so every save overwrote it with `''`. Nobody reports this — it looks like the field was never filled in. **When adding a field to a form, add it to BOTH the save payload and the load.**
- **Escape before converting newlines, never after.** Reversing the order turns the inserted `<br>` tags into literal text. And user-authored content bound for someone else's inbox stays plain text — a rich-text field there is an injection path into every recipient's mail client.
- **Read the sender's own attributes server-side.** Never take them from the request body, or a client can send arbitrary content under another user's name.
- **Say what the button does, not what the user might assume.** Disconnecting deletes the stored credential; it does not revoke the OAuth grant at Google. The copy says so.

### From the prior batch (scheduling, settings integrity, dead UI)

- **A static checker that skips a syntax form is worse than one you know is partial.** `check-tdz.mjs` only inspected arrow components, so every `export default function X()` file — including `HomeTab` — had never been scanned at all. Widening it found four crash bugs immediately. When adding a check, enumerate the shapes it does NOT cover and write them down.
- **`setDirty(false)` outside the try is a silent data-loss bug.** Combined with `dbFetch` not throwing on 4xx, four settings panels reported success on a failed save. The tell is a `catch` that only calls `console.error` — that is never sufficient for a write.
- **A shared helper nobody adopted is not a fix.** `putSettings` was written specifically to solve this and four panels never used it. When introducing a helper for a known bug class, audit every site of that class rather than converting as you pass through.
- **Guard the exit people actually use.** The settings nav guard covered top-level tab clicks — the rare exit — while "← Back to settings" discarded silently. Enumerate every way out of a state before deciding one is covered.
- **A ref that is populated and never read is a feature half-built.** `settingsSaveRef` was maintained by 13 panels and called by nothing.
- **Assemble a crew at a shared slot, not by ranking.** Picking the best-scoring people and then looking for a common time succeeds far less often than choosing the time first — the top scorers are the busiest.
- **Refuse to under-crew.** A job that looks scheduled but is two techs short is worse than one visibly still in the queue. Skip with a reason that distinguishes "not enough people" from "no common slot".
- **Anything placed earlier in the same batch must be visible to later placements.** Technician load had a running ledger; equipment did not, so two proposals in one run could both claim the last unit.
- **Fabricated data in a mock is worse than an empty state.** A deleted panel showed invented email open rates as if they were the user's own. If a screen cannot show real data yet, show nothing and say why.
- **Check content parity before deleting a duplicate surface — and check whether the content is real.** The first pass here held back on removing a panel that turned out to be entirely non-functional; the caution was right, the conclusion changed once the panels were actually read.
- **A feature that is only reachable while OFF is invisible once ON.** The calendar prompt was gated on `!connected`, so connecting removed the last trace of it. Any status-gated affordance needs the opposite state represented too.

### From the prior batch (customers, quotes, record numbers, template axes)

- **Removing a field from an allowlist is a WRITE-PATH change.** Trace every path that WRITES the column, not only those that read it — and an upsert counts as an insert. Postgres validates NOT NULL while building the tuple, before `ON CONFLICT` can divert to the update, so an omitted NOT NULL column fails the statement even when the row already exists. This broke every quote save in production (§0PB.20).
- **A save helper that returns null instead of throwing turns a failed write into a silent one.** The caller's `catch` never fires and the editor closes as though saved. If a function can fail, make failure impossible to ignore.
- **Hoisting a component to module scope strands its closure reads.** Correct fix for remount-on-keystroke, but every parent-scope identifier must become a prop. Hit twice in one session, including one reference that never existed anywhere. `npm run check:tdz` now catches this class.
- **Model dependency arrays when reasoning about effects.** A state model that runs effects on every transition reports failures React would never produce. Two of three initial "failures" in the state audit were this.
- **Filtered lists make auto-select dangerous.** An effect that re-points a selection when the current item leaves the list will swap the form under a user who merely changed a filter. Never re-point while an editor is open.
- **One guard function, not per-call-site confirms.** Routing every abandon-the-draft path through a single `guarded()` is what stops one of them silently missing the prompt.
- **Compare drafts field-by-field, never by JSON string.** Drafts carry UI-only keys and records carry server keys, so a whole-object compare marks every open form dirty.
- **Derive presentation from data, not from a fixed design.** The customers design assumed four hardcoded tiers; deriving rank, colour and value from the plan rows means adding a fifth plan needs no code change.
- **Refuse ambiguity rather than guessing it.** Two equally specific template matches yield no template. A wrong template silently supplies wrong crew, hours and licence — worse than supplying none, and much harder to notice.
- **Treat missing data as a miss, not a pass.** An account with no type set must not match a type-restricted template; otherwise unconfigured records quietly inherit rules meant for someone else.
- **Two entities that share a word are still two entities.** Tool inventory vs. customer-site assets; CRM account vs. dispatch customer. Merging them leaves half the columns null in each case.
- **A constraint without a retry converts a silent bug into a visible error.** That is an improvement, but only half the fix — the loser of the race should take the next number, not see a 500.

### From the prior session (fleet, templates, segmentation, plans)

- **Babel-validating a JSX file proves it PARSES. It does not prove it RUNS.** `vite build` succeeding does not either — TDZ is a runtime error and rollup emits it happily. Both gates passed on code that killed the Dispatch tab in production (§0X.12). Declaration order is now a scripted check, `scripts/check-tdz.mjs`.
- **A `useMemo` evaluates during render.** Every const it closes over must be declared **above** it in the same scope. Dev tolerates a violation because the unminified bundle does not reorder; production throws `Cannot access 'X' before initialization` and the component never mounts.
- **Compute, do not generate, when the visibility window is configurable.** Once `leadDays` decides when work surfaces, there is no reason to materialise future visits: the queue is a derivation over existing jobs, and a five-year plan costs one pass instead of a table of speculative rows. The cost is that a single occurrence cannot be skipped or deferred — nothing exists to annotate.
- **Record which occurrence a job satisfies, not just when it ran.** `planDueDate` separate from `scheduledDate` is what lets a visit performed five weeks late retire the right occurrence. Inferring it from proximity breaks on the first late visit.
- **Only a terminal state retires an obligation.** A *scheduled* visit is in hand but still outstanding; treating it as done advanced the pointer and hid the visit about to happen.
- **When two fields can contradict, make one authoritative and derive the other.** `intervalDays` and `visitsPerYear` were independently editable, so a plan could read "quarterly, 6 visits a year" — scheduling 4 and promising 6. Ignore the supplied value rather than merging it, and show the derived one read-only so the form does not offer an input the server discards.
- **A checker that cries wolf is worse than none.** The first TDZ scanner counted object property keys as variable references and pointed at innocent code in the previous commit. Verify a new diagnostic against a case you already know the answer to before acting on it.
- **When a required field fails silently, say so loudly at the point of entry.** A plan with no `planStartDate` produces no error and no visits — the customer is just absent from the queue. The field warns inline rather than leaving it to be discovered weeks later.

- **Two stores for one concept means one of them is wrong — find out which is read.** Vehicles were edited in settings and read from the table. The test is not "which list is bigger" but **"which one does the operational surface consume?"** Whatever the board, the scorer, or the scheduler reads is the source of truth; everything else is a parallel copy waiting to disagree.
- **Model the unit, not the count.** One equipment row per physical unit beats a `qty` field, because a quantity cannot express "one of the two is in the shop". Any capacity model built on a number instead of records will silently over-report availability the moment a single unit goes out of service.
- **Separate the requirement from the asset.** A job needs *a* pressure tester (a category); checkout binds *asset #A-1042* (a row). Collapsing the two puts blob ids into an FK column. The same split applies to vehicles: the job requires a **class**, the technician is assigned a **specific** vehicle.
- **Where a constraint is enforced follows what it attaches to.** Equipment attaches to nothing, so a shortage is job-level and gates at `handleSchedule`. A vehicle attaches to a technician, so it is a per-technician blocker in `scoreTech`. Putting a job-level constraint in the per-tech scorer stamps the identical blocker on every candidate; putting a per-tech constraint at the job gate loses the ability to rank.
- **Derive service history; never denormalise it.** A stored `jobCount` needs maintaining on every job write and is wrong the moment one is deleted. Derive at render, memoise on both inputs.
- **Coercing inside `onChange` makes a controlled input uneditable.** `parseInt('') || 1` rewrites the field before the next keystroke lands, and a value derived as `` `${n} hours` `` re-formats on every keypress and pins the caret. **Hold raw text while typing, coerce on blur, and sanitise again at save** in case the field never blurred.
- **A `<select>` whose value matches no option silently renders the first one.** That reads as "None" and clears a real setting on the next save. Always emit an explicit `Unknown (id)` / `Not in fleet (x)` option for an unresolved value. This bit three separate fields this session (preferred tech, crew default vehicle, template vehicle class).
- **Do not migrate against an async vocabulary before it arrives.** Template equipment migration gated on the fetch completing — running it against an empty category list would have filed every requirement as unmatched and then persisted that on the next save.
- **Resolve display names at render, not inside a `[]`-deps effect.** Names resolved inside the mount-only loader are frozen against whatever `settings` held at mount. Store ids; resolve where they are shown.
- **Filter counts should be independent of the other active filters.** A count computed against every filter collapses to zero as soon as two are combined, so the number stops telling you what clicking it would give you.
- **Reported-and-kept beats silently-dropped.** Unmatched legacy equipment fragments, licence levels no longer in the vocabulary, and skipped template fields are all surfaced rather than discarded. A dropped requirement is invisible; a reported one gets fixed.
- **An idempotent import is worth designing for.** Deriving imported row ids from the source ids means the upsert-on-id POST makes re-running harmless — which in turn means the import can be a visible button the admin clicks rather than a script run against live data.

### From the Dispatch session
- **Verify a horizon item against the code before building it.** Lead Scoring v1.5 was fully shipped while the docs still listed it as outstanding. Stale entries cut both ways — SVR-2 was recorded done when it was not.
- **A fixed vulnerability can leave live damage behind.** The cross-tenant upsert bug was closed in §0e by adding `setWhere`, but the rows it had already corrupted stayed. Closing a hole and cleaning up after it are two separate jobs.
- **"One row per X" needs a constraint, not a convention.** `settings` had no unique index on `org_id`, and reads took `rows[0]` unordered — so a duplicate produced non-deterministic config, not an error. If the code assumes one row, make the database enforce it.
- **A mirror must never be able to decide the value it mirrors.** `sanitize()` took `role` from the request body on every write, so a self-service profile save that omitted `userType` silently demoted the user to `'User'`. Mirrors should copy from the authority (Clerk) or preserve what is stored — never accept the field from a client.
- **Divergence between two systems needs a detector, not just a reconciler.** `users-sync` could fix the drift for months before anyone ran it. A cheap dry-run check on page load turns an invisible problem into a visible one.
- **Two call sites for one operation will drift.** User delete sent the id in the body from the list and in the query string from the profile page; the server only read the query string. Combined with no `res.ok` check, the row vanished from the screen and came back on refresh.
- **A destructive action must be labelled as one.** Both delete controls said "Deactivate" with confirm copy about "losing access". Reversible and irreversible actions need different names, different colours, and honest copy about what is and is not recoverable.
- **`dbFetch` resolves for ANY response — a `catch` block does not see a 403.** Every settings panel wrapped its save in `try/catch` and cleared the dirty flag afterwards, so a failed PUT was indistinguishable from a success *and produced no console output at all*. Always check `res.ok`; never clear dirty state outside the success path.
- **A permission change can silently break an unrelated feature.** Making `PUT /settings` Admin-only (SVR-2) turned every non-admin settings save into a no-op that reported success, because of the bug above. When a gate is added, walk the callers that were previously succeeding.
- **JSX does not process `\u` escapes in text or attribute positions.** They render literally. Only string and template literals interpret them — an easy mistake when generating JSX programmatically, and Babel passes it.
- **Not every inconsistency is worth fixing.** Six endpoints use local role helpers rather than the shared ones. All gate to Admin, so the new role was already denied; renaming them is churn with real regression risk. Fix what changes behaviour, record the rest as tidying.
- **A new role must never inherit capability by default.** `requireWrite` denied only ReadOnly, so adding `Technician` would have granted write access everywhere. Deny the new role in the shared helper and add one explicit opt-in; anything else means auditing every call site by hand and hoping.
- **Adding a role is a security audit of every gate.** Nine endpoints would have accepted Technician writes — six core CRM handlers checking `isReadOnly` directly instead of the shared helper, and `quotes.mjs` with a local const shadowing the imported one. Neither was visible from the role definition. **Grep every gate when the role set changes.**
- **Clerk is the source of truth for roles; the `users` table is a mirror.** Nothing wrote role changes back to Clerk, so the Settings role selector changed nothing the server enforced. When a control drives authorization, verify it writes to the system that authorization actually reads.
- **A mismatch that fails open is invisible.** Two role lists disagreed (`'Sales Rep'` vs `'User'`) and nobody noticed, because `auth.mjs` treats any unrecognised role as a rep. Prefer explicit value/label pairs over strings that happen to work.
- **Compute-and-display is not gate-and-block.** The crew builder rendered blockers in red then gated its Add button on `score >= 70`, so a blocked technician was assignable. When a rule is shown, check that the control performing the action reads the same rule — and give an explicit override path rather than leaving the gate open.
- **A plausible default is worse than a visible gap.** Licence level, `hoursCap`, `minLicense` and `needSkills` were all fabricated or hardcoded while real decisions were made against them. Store the value, default to unset, make unset fail safe.
- **Views over the same data must agree.** The week board rendered jobs inside technician rows, so a dated-but-uncrewed job vanished there while showing in the month grid. When two views read one dataset, check the intersection each one drops.
- **Verify every patch by re-reading the file.** A patch script reported two edits applied and then aborted before writing; both were lost, and the missing one was later mis-diagnosed as a different bug. Grep after every patch, not only after a reported failure.
- **Additive columns are only safe in one direction.** DB-then-code is harmless — nothing reads the new column yet. **Code-then-DB is an outage** on every read of that table, because Drizzle's `db.select()` with no projection expands to the full column list declared in `schema.ts`. The four job/customer columns went DB-first and were fine; `license_level` went code-first and 500'd every `dispatch-technicians` request.
- **A fabricated value will quietly drive real decisions.** `normaliseTech` invented a licence level from employment type and skill count, and the board matched job eligibility against it. Derive nothing that a user is supposed to enter — store it, default to unset, and make unset fail safe.
- **Advisory warnings are not enforcement.** The crew builder computed and displayed blockers, then gated the Add button on `score >= 70`. Compute-and-display is not the same as gate-and-block; check the thing that actually guards the action.
- **"Add" reads as a commit.** Three separate surfaces this session had an Add button that only mutates local draft state, with the real persist behind a second button. If a click looks like it saved, users will treat it as saved.
- **A CRM account and an operational entity are different things.** `dispatch_customers` stays separate from `accounts` because it carries ten fields that have no business on a sales account (`serviceAgreement`, `preferredTechId`, `doNotService`, `taxExempt`, `creditLimit`, `paymentMethod`…), because residential customers would wreck account segments / lead scoring / pipeline reporting, and because Dispatch is a licensed module that not every org has. Same reasoning for `dispatch_technicians` vs `users`. **Link by nullable FK; never merge the tables.**
- **Nullable `userId` on `dispatch_technicians` is load-bearing.** It lets a subcontractor be schedulable without consuming a Clerk seat, while an employee tech who needs the (future) mobile app gets one. Identity (can log in, has a role) and operational record (schedulable, skills, rates) are separate concerns — collapsing "technician" into a user role breaks the subcontractor case.
- **No delete where an FK has no cascade.** `dispatch_jobs.customerId` and `.assignedTechId` would orphan. Provide a retire/deactivate flag (`doNotService`, `status`) instead.
- **Never gate a per-record feature on an org-wide flag.** The `UsersDetail` tech profile used `settings.dispatchEnabled` (org) where `user.dispatchEnabled` (per user) was meant, so every user looked like a technician.
- **A write to a key the server does not whitelist fails silently.** `PUT /settings { users: [...] }` was discarded because `settings.mjs` has no `users` key — users live in their own table. Combined with a missing `setSettings`, the panel had never persisted anything. **Check the server whitelist before assuming a save works.**
- **Always check `res.ok` before parsing.** A 500 that parses to `{error}` and falls through `|| []` renders as "no data yet" — endpoint failure and empty table become indistinguishable. This bit both the dispatch load and the settings save (`catch(e) { console.error(...) }` swallows a 403 and still clears the dirty flag).
- **Babel is stricter than the build.** `DispatchSkillsDetail.jsx` had malformed JSX that Babel rejected and Vite/esbuild shipped anyway (esbuild tolerates a stray `}` in JSX text). **Run the Babel parse across all of `src/` in CI**, not just on files under edit.
- **Enum vocabularies drift when they are not enforced.** Priority existed in three incompatible forms across schema, UI colour maps, and form options. Every new consumer picks one at random — which is how the bug arose.
- **Dev and production share one Neon database but separate Clerk instances.** Data seeded under one org is correctly invisible to the other. Before concluding a feature is broken, confirm the caller's org: `JSON.parse(atob(t.split('.')[1])).o.id` (Clerk puts the org at `payload.o.id`).

### Earlier

### React Rules
- **React error #310** = `useState` called conditionally. ALL `useState` must be at component top level, never inside `if (activeTemplate === ...)` blocks.
- **Context chain rule:** when a feature silently does nothing, trace `useModalState` → `App.jsx` (appContextValue) → consuming component destructure.
- `waitForToken()` pattern required for any on-mount DB call.

### Data / DB Rules
- **Settings JSONB read-then-merge:** PUT must read existing and merge, never rebuild from payload alone.
- **Undo restore must write to DB** — local-only restores cause data loss on refresh.
- `dbFetch` returns parsed JSON directly — no `.json()` call needed.
- **Netlify fire-and-forget kills async:** all email/SMS calls must use `await`, not `.then()` chains.
- **ACCELEREP RULE — No local-only state for persistent data:** any data that should survive refresh MUST be saved to DB via `dbFetch` immediately after state update.
- **Schema safety:** always verify `schema.ts` has ALL current DB columns before running `drizzle-kit push` — an outdated upload can cause DROP COLUMN warnings with live data.

### Security / Hardening Rules
- **Org-scope every upsert:** `onConflictDoUpdate({ target: table.id, setWhere: eq(table.orgId, orgId), set })`. Conflict on `id` alone allows cross-tenant overwrite.
- **IDs use `crypto.randomUUID()`** with a per-entity prefix — never `Date.now() + Math.random()`.
- **Never leak errors:** 500 responses use `serverErrorBody(err, label)` from `_lib.mjs` (generic message + correlation id); full detail logged server-side only. Intentional 4xx messages are fine.
- **Index changes to prod:** apply via `CREATE INDEX CONCURRENTLY` in the Neon console — never `drizzle-kit push` against production (push diffs the whole schema and can act on unrelated drift).

### CSS / Layout Rules
- `transform: translate` conflicts with modal CSS animations — use `position: relative` + `left/top` for drag positioning.
- Fractional (`fr`) grid columns scale with viewport — use fixed `px` widths when columns must stay close together. Use `1fr` on one column to absorb remaining space.
- `whiteSpace: nowrap` + `textOverflow: ellipsis` prevents wrapping — remove both when a column should wrap within a fixed width.
- CRLF/LF mismatch can cause git to report "nothing to commit" even after real changes.
- Clerk JWT org ID lives at `payload.o.id`, not `payload.org_id`.

### Settings Module / Decomposition Conventions
- **Settings panels** live under `src/Tabs/settings/<category>/`; the shell (`SettingsTab.jsx`) → `AdminView`/`PersonalView` (at `src/Tabs/`) → panels. To add a panel: (1) `catalogue.js` `SETTINGS_ITEMS` entry, (2) `AdminView.jsx` import + id-map + route, (3) a `settings.extra` key in `settings.mjs` GET **and** PUT, (4) `dbFetch` save in the panel.
- **Shared chrome** = `CategoryDetailChrome` (`settings/shared/`, was `SPDetailPageChrome`) with a `category` prop. Tokens/`ui`/`form` primitives live in `settings/shared/`. Import paths from a panel: `../shared/...`, `../../../AppContext`, `../../../utils/storage`, sibling panels via `./`.
- **No inline sub-components** — never `const Foo = () => …` inside a parent component; React sees a new type each render → unmount/remount → focus loss / scroll jumps / stale closures. Define at module scope, pass data as props. (Tabs still to audit: `TasksTab`, `LeadsTab`, `PipelineTab`.)
- **Cross-section dependency check** — when extracting/moving code, grep its identifiers against **all still-resident code**, not just the section's own panels. A missed reuse (e.g. Audit using Security's `SecCrumb`/dropdowns) becomes a runtime `ReferenceError`.

### CSS / Design-System Rules (the warm "stone/ink" system)
- Each file declares its own `const T = { bg:'#f0ece4', surface:'#fbf8f3', surface2:'#f5efe3', border:'#e6ddd0', borderStrong:'#d4c8b4', ink:'#2a2622', inkMid:'#5a544c', inkMuted:'#8a8378', gold:'#c8b99a', goldInk:'#7a6a48', danger:'#9c3a2e', warn:'#b87333', ok:'#4d6b3d', info:'#3a5a7a', sans:'"Plus Jakarta Sans", system-ui, sans-serif', r:3 }`.
- **No generic Tailwind-style colors** — `#2563eb` and other off-brand blues/grays are forbidden; use `T.*`. Pills use `borderRadius: 999`; dark drag-handle headers use `#1c1917`.
- **Inline styles only** — no CSS classes like `btn`/`btn-secondary`/`modal-actions`; define inline style objects.
- **Popovers/menus inside scroll/overflow containers must use `ReactDOM.createPortal` to `document.body`** with `position:fixed` (compute coords from the trigger's `getBoundingClientRect()`, flip up/down by viewport space, cap `maxHeight`). Close on outside-click / scroll / resize — but **ignore events whose target is inside the menu** (`menuRef.current.contains(e.target)`), or the menu's own scrollbar closes it.
- A `transform` on a panel container traps `position:fixed` children in a new stacking context — portal out to escape.

### Account / Data Rules
- **Accounts include sub-accounts as rows** (`parentAccountId` set). For "account counts" (distributions, totals) filter to **top-level** (`!a.parentAccountId`) — counting all rows over-inflates (e.g. 661 rows for ~83 accounts).
- **Account industry** = `account.verticalMarket || account.industry` (two fields; verticalMarket first).

### Lead Scoring Rules
- Engine is `score-lead.mjs` (pure). Compute **server-side and persist** (write-trigger in `leads.mjs` + nightly batch); the frontend reads the stored columns.
- `scoredEntity` is the **lead**, not accounts/opportunities. Fit reads lead fields (`title`/`estimatedARR`/`source`/`status`); Engagement (v1) = status + recency decay (no `leadId` on activities yet).
- Rule ops: `equals` / `notEquals` / `in` / `gte` / `lte` / `contains` / `matchesAny` / `exists` (+ `recency` and reserved `event`).

### Field Naming
- Accounts have TWO owner fields: `accountOwner` (older) and `assignedRep` (what Edit Account modal saves to). All owner logic must check both: `effectiveOwner = accountOwner || assignedRep`.

---

### Async persistence & the await-before-close rule (this session)
- **Any handler that persists to the DB must be `async` and awaited by callers that close a modal/rail or trigger a reload afterward.** `TaskRail` fired an async completion without `await` then called `closeRail()` (which reloads tasks) — the reload raced and abandoned the in-flight PUT, silently dropping the write. Sibling of the no-local-only-state rule: it's not enough to *have* a save; the caller must not race it.
- **Persist-with-rollback for optimistic toggles:** optimistic `setTasks` → `await dbFetch` PUT → reconcile from response; on failure, restore the pre-change row so local state can't drift from the DB.
- **Debugging discipline:** when a symptom in the browser contradicts what the code says should happen, get ground truth from the running app (console `fetch` of the live API) *before* editing code. Twice this session the real cause was invisible from reading the repo (stale branch, uncommitted file, then a genuine race); the console `fetch` showing `completed:false` in the DB is what finally located the write failure vs. a cache red-herring.

### Portal z-index & mousedown-race (this session — for any new portaled popover)
- Portaled menus/popovers must clear the **z-index of their host surface**: the task rail is `11003`, so the `TimeDropdown` menu sits at **12000**. `400` rendered it invisibly behind the rail. Check the host's z-index, don't assume a low value clears it.
- Inside a **draggable** container (which attaches its own document `mousedown` handlers), a trigger that opens on `onClick` can be closed by the same gesture's `mousedown` reaching the outside-close listener. Toggle on `onMouseDown` + `stopPropagation`, and guard the close listener with a `justOpenedRef` that swallows the opening mousedown.

### Security enforcement patterns (this session — use these, don't reinvent)
- **Branch-level role gate:** `const forbidden = requireRole(auth, ['Admin'], headers); if (forbidden) return forbidden;`
- **Audit destructive/privileged actions:** `await writeAudit(orgId, { action, entityType, entityId, entityName, detail, userId });` — best-effort, never let it fail the operation.
- **ReadOnly mutation gate** goes immediately after the auth destructure, before any handler logic.
- **Object-level checks fail closed:** `getCallerName()` returning null means the caller matches no assigned record; unassigned (null-owner) records remain rep-editable by design.
- **PUT is strictly an update** — unknown ids 404; creation is POST-only. Check existence → ownership → write, in that order.
- **Secrets are write-only:** GET returns presence booleans (`anthropicApiKeySet`), never values — a masked hint (last-4) is Admin-only. Client key inputs are write-only: always empty on load, with explicit intent state so an untouched field never clears a stored key.
- **A secret must live in exactly one place.** The SVR-2 leak was not the encrypted field — it was a *second, plaintext copy* the UI wrote into a general-purpose blob (`aiSettings.byokProvider`) that GET returns to every member. When auditing secret handling, grep the UI for where the value is actually bound, not just the field the audit names.
- **`PUT /settings` is Admin-only (whole branch, not per-field).** Settings are org-wide; letting members write non-secret fields leaves SVR-2(b) integrity/DoS open. Consequence: non-admin settings auto-saves 403 — personal preferences must therefore go to `/users?me=true`, never the settings blob.
- **Verify the live repo, not the state doc, before marking an audit item closed.** SVR-2 was recorded as fixed for a full session while the vulnerable code was live on production.
- **Auth cache caveat:** `verifyAuth` caches role ~30s — a just-demoted admin can act for up to 30s. Accepted; documented in `auth.mjs`.

---

## 9. On the Horizon

### Next up

> Build guard and the `drizzle-orm` bump both **shipped** — see §0.1 and §0.7.

~~**The remaining `dbFetch` sites.**~~ **DONE.** 78 → 0. `check:dbfetch` is the
fifth gate, exits non-zero on any finding, and runs in CI. Deliberate
fire-and-forget opts out with a `dbfetch-ignore:` comment at the call site — three
sites qualify (`addAudit`, two `fireMentionSms`). See guide §18b6.

**Accounts / contacts bulk POST is unbatched.** One statement for every row; breaks above ~1,872 rows against the 65,535 bind-parameter ceiling, and one bad row kills the whole batch. The overwrite path was fixed this session (`bulkUpsert`); the insert path was not. Do this **before** the CSV Import + Export rollout below, since that multiplies the number of files pushed through it.

**`onConflictDoNothing()` in the POST bulk branch can never fire.** Fresh `crypto.randomUUID()` ids against an `id`-only unique constraint. Nothing dedupes by name at insert, so a repeated import inserts a complete new set. Decide whether insert-time name dedupe belongs here or stays with the smart-merge tooling.

~~**Clerk advisories.**~~ **DONE — the Production migration is unblocked.** See §0.10.

**Never `npm audit fix --force`** — it installs `vite@8`, a breaking change, to fix
a dev-server-only issue. Five advisories remain after the Clerk fix, all in
`vite`/`esbuild`/`drizzle-kit` dev tooling. The one high among them is
Windows-specific (`server.fs.deny` bypass on alternate paths, NTLMv2 hash
disclosure via UNC handling) and dev-server only — relevant to this machine, but
it requires something reaching a localhost-bound dev server.

**SPIFF panel on mobile.** The entire HomeTab right column is `{!isMobile && …}`, so the panel is desktop-only. Pre-existing pattern; reps are often on phones. Needs a deliberate decision about placement in the mobile stack.

### Then

**CSV Import + Export** for Pipeline, Contacts, Accounts. Reuse the `Settings → Data` approach; per-tab columns differ.

**Layer 3 E2E (Playwright).** Thin happy-path suite. Main hurdle remains automating Clerk login.

**Skip / defer a single plan occurrence.** Not expressible in the computed recurrence model — nothing to annotate. Needs a `dispatch_plan_visits` table. Worth doing when real use demands it.

**76 churn-only inline components** (`npm run check:inline -- --churn`). Stateless wrappers, mostly in `ReportsTab` (55) and `AccountsTab` (7). They remount harmlessly. Worth cleaning opportunistically when already editing those files; not worth a dedicated pass.

### Open design questions

- **Version sprawl in quotes** — the 3-version cap is gone, but Build still compares only *current vs immediately previous*.
- **CRM entity numbering** — accounts are the strongest candidate; only pays off if searchable, on documents, and surviving export.
- **`share` (shared vs per-van)** on equipment is displayed in tooltips but not modelled.
- **`planWeek` is greedy, not globally optimal.**
- **Email signatures appear on quote emails only.** `send-email.mjs` is the shared choke point if other outbound mail should carry them, but each caller has a different notion of "who is sending".

### Resolved this batch

- ~~Inline-component audit (`TasksTab`, `LeadsTab`, `PipelineTab`)~~ — §0.33. **Those three were already clean.** Replaced by the two real items above.

### Unwired stubs (buttons that render and do nothing)

- **"Test auto-create"** — `DispatchJobTemplatesDetail`.
- **"Manual pick"** — `DispatchTab` / `CrewBuilderView`.
- FunnelStages "+ Add stage" · LeadConversion "Recompute from history" (needs a new Netlify function) + "Save changes" · PainPoints "Import CSV" · CustomerTypes auto-classification "Edit" · Industries drag handles.

### Tooling — what the two scanners cover

| | Finds | Command |
|---|---|---|
| `check-tdz.mjs` | Reads before declaration, and references defined in NO scope | `npm run check:tdz` |
| `check-inline-components.mjs` | Components declared inline and used as a JSX element type | `npm run check:inline` |

**Neither covers:** the inside of Netlify handlers (a TDZ was caught there by reading, §0A.32); the *"renders and silently does nothing"* class; a field sent on save but missing from the load (§0A.32); or a prop threaded from the wrong place. Those are still found by reading, or by a user reporting them.

### Each a session on its own — do not batch

- **13 settings panels not on `putSettings`** — a DIFFERENT list from the 14 save handlers fixed in §0B.25; these are panels whose whole persistence shape differs.

- **Twilio SMS activation** after A2P carrier approval (972-526-0638)
- **Clerk Production instance migration** (ON HOLD — needs a dedicated block of time, not a mid-session task). Currently running Development instance keys on **both** sites.
  - **The user export/import is the easy half.** The trap is that a Clerk **Production instance is a separate instance**: new users, new organizations, and therefore **new organization IDs**. All **40 org-scoped tables** derive `org_id` from the JWT (`payload.o.id`), so the moment production switches to Production keys you sign in to a new org id and **every existing row becomes invisible** — not deleted, orphaned. Accounts, opportunities, contacts, quotes, dispatch, settings, all of it.
  - Recoverable via an `UPDATE ... SET org_id = <new>` sweep across all 40 tables, but that must be **planned before the cutover**, not discovered during it.
  - **Decide first: does the existing production data matter?** Evidence so far says most of it is seed/demo (the 8 dispatch customers and 11 jobs were seeded directly; the `@test.com` users exist in no Clerk account; the dispatch board was rendering synthesized `auto_` placeholders). If none of it is real, the migration is far simpler — switch keys and start clean, no `org_id` rewrite.
  - **Second open question: should dev and production keep sharing one Neon branch?** They do today, which is why `org_3BDQ…` (dev) and `org_3Cwn…` (prod) sit in the same database. Post-migration both Clerk instances would still write to the same tables. Separating them is a bigger change but much cheaper now than later.
  - No code change needed for the keys themselves: only `VITE_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` are referenced, and `authorizedParties` in `auth.mjs` is domain-based, not instance-based. Add the `clerk.salespipelinetracker.com` CNAME, swap env vars on both Netlify sites, redeploy, verify.
  - Sequence the cutover with a rollback at each step and an explicit check that you cannot lock yourself out of Admin.
- **Microsoft Azure OAuth** and Yahoo Calendar (both deferred)
- **New customer onboarding flow**
- **Billing integration**
- **Error boundaries** — added to tab components, broader coverage outstanding
- **Saved reports:** sharing, scheduling (email/Slack cadence), pin-to-dashboard
- **Report builder:** actual query execution against live DB (currently preview is illustrative)
- **AccountsTab layout** — column balance and toolbar spacing polish (deferred from this session)
- ~~**Lead Scoring v1.5**~~ **DONE** (verified live, §0a8) — `activities.lead_id`, lead-touch logging, rescore on activity write, and five `op:'event'` rules are all shipped.
- **Lead Scoring Phase 2** — per-org predictive scoring (logistic regression, license-gated like Dispatch) once an org crosses a closed-deal threshold; source-disposition learning (won-conversion rate per source feeds the score). `predictive` block already stubbed in `leadScoring` config.
- **Hardening backlog (from codebase review):** public-API DB-side pagination; date-typed columns (several dates are `varchar`); baseline test suite; CORS allow-list (parked — low risk with bearer-token auth). *(SettingsTab split — DONE this session.)*
- **Inline-component audit** — `TasksTab`, `LeadsTab`, `PipelineTab` still contain inline sub-components to hoist.
- **This session's follow-ups:** Kanban view (PipelineTab) — verify closed deals leave the board correctly now that closing is reachable; sweep other modals (`components/modals/`) still on blue-era palette / missing Esc + overflow handling (LostReasonModal was one of a likely cohort); consider exempting task completion from the rep ownership gate, or allowing the assignee specifically (a rep completing a teammate's task currently 403s → rollback reverts the checkbox — correct per matrix, maybe wrong for workflow); align other tabs' delete-confirm copy with the soft-delete undo reality (done for ContactsTab).
- **Dispatch — technician model.** Step 3 **DONE** (old stores retired, crews repointed). Remaining — Step 4: migrate any real `settings.users[].dispatch*` data into `dispatch_technicians`, then retire those fields, the dead `settings.extra.dispatchTechProfiles` key, and `DispatchTechDetail` (it filters on `u.dispatchEnabled`, which nothing sets any more, so it now always renders empty). Step 4: **`Technician` role + scoping** for mobile — add `isTechnician()`, resolve `userId → dispatch_technicians.id` server-side (jobs FK the technician row, *not* the user), filter to `assignedTechId` or membership in `coTechIds`, and apply a **per-field write whitelist**: job status transitions, `techNotes`, `completionNotes`, `photosCount`, `customerSignature` — and nothing else (no reassignment, scheduling, or customer edits). Note `requireWrite` currently treats every non-ReadOnly role as fully write-capable, so the role and its scoping must land together.
- **Priority vocabulary normalization** to `low|normal|high|emergency` everywhere. Surface is small: the `priority:'standard'` literal in the "New template" button, the `autoJobs` synthesiser in `DispatchTab`, a settings-blob pass over `dispatchJobTemplates`, and one additive `UPDATE` on `dispatch_jobs`. Then collapse the dual-accept `prioColor`/`prioColor2` maps back to one. **Do as its own commit** — not bundled with feature work. Store `emergency`, label it "Emergency".
- **`DispatchJobTemplatesDetail` bug:** the "Template name" input and the customer-type select both write `updateTemplate('ctype', ...)` — the same field — so templates have no distinct name and the list renders customer types as names. Split `name` from `ctype` (migrate by copying `ctype` → `name`). **Blocks** making templates selectable in the New Job modal.
- **`dispatchJobTypes` + `dispatchTrades` settings panels** — `jobType` and `trade` are hardcoded; nothing branches on either, so admin-configurable lists are safe. Seed from the schema's documented set.
- **Add-vs-commit across settings panels.** Every settings panel has an "Add" that only mutates local state, with the real persist behind "Save changes". This caused three separate false "it didn't save" reports in one session. Consider auto-saving on Add, or making the dirty state unmissable.
- **Role-gate helper tidying (cosmetic, no behaviour change).** `automations`, `webhooks`, `export-schedules`, `export-dsr`, `api-keys`, `backup` use local `canWrite`/`requireAdmin`/inline checks. All Admin-gated, so Technician is denied — migrating them to the shared helpers is style only. Also rename the local `isAdmin`/`isManager` consts in `products` / `spiff-claims` / `calendar-connections` that shadow the imported helpers.
- **Settings panels not yet converted to `putSettings`** (different shapes / no shared chrome): `PipelinesDetail`, `AuditDetail`, `CompanyProfileDetail`, `FiscalYearDetail`, `CompanyCalendarDetail`, `PriceBookDetail`, `SsoDetail`, `EditBrandModal`, `TeamsDetail`, `TerritoriesDetail`, `UsersDetail`, `BuyerPersonasDetail`, `FlatListDetail`.
- **Job templates selectable in New Job** — now unblocked by the `name`/`ctype` split.
- ~~Technician frontend gating~~ **DONE**. Remaining from that item: surface the server's message on dispatch load errors instead of only the status code.
- **Dispatch smaller gaps:** `jobNumber` is never assigned (the `nextCustomerNumber` pattern would drop straight in as `JOB-2026-0042`); `preferredTechId` is scored and displayed but cannot be set anywhere; `dispatch_equipment` has an endpoint and no UI; mass-schedule assigns a single tech per job, ignoring `crewSize`.
- **Dispatch board follow-ups:** drag-to-reschedule on the week grid; `Save draft` in the crew builder is still inert; SMS notify is stubbed pending Twilio A2P approval.
- **Settings panels swallow save errors** — `catch(e) { console.error(...) }` clears the dirty flag whether or not the PUT succeeded. Surface failures (a 403 from the SVR-2 Admin gate currently looks like success). Also consider making Add-then-Save clearer across settings panels; "Add" reads as a commit.
- **Non-transactional dispatch job create** — if the service-location write fails, the customer from step 1 already exists. Retry finds them rather than duplicating, but state is not rolled back.
- **Role-gate uniformity pass (deferred from SVR-3):** migrate the local `requireAdmin` / `canWrite` / inline role checks in `automations`, `webhooks`, `export-schedules`, `export-dsr`, `api-keys`, `backup`, `export-runs` to the shared `requireWrite` / `requireRole`; and rename the local `isAdmin`/`isManager`/`isReadOnly` consts in `products`, `quotes`, `spiff-claims`, `calendar-connections` that shadow the imported helpers of the same name.
- **Seed data cleanup:** ten `@test.com` users exist in the `users` mirror and in no Clerk account. Harmless but they inflate seat usage, appear in owner dropdowns, and will keep triggering the drift banner. Delete before production.
- **Security follow-ups:** **`PUT /users?me=true` accepts a self-supplied `role`** (`sanitize()` takes `data.userType || data.role`; the `me` branch only checks id match — not real escalation since server gates read Clerk `publicMetadata`, but it flips client gates and pollutes the roster); non-admin settings auto-save now 403s (harmless, already `.catch`-ed — silencing needs `userRole` threaded into `useSettings()`, which touches `App.jsx`); role/ownership sweep of `documents.mjs` (DELETE has `ownerId` but no gate) + all `dispatch-*` endpoints + `products`/`saved-reports`; Netlify env-var & source-map audit item (dashboard config); Security-health sub-page — wire mock events feed + score to the real audit log; migrate name-based ownership to `ownerId` userId columns (post-launch); Manager **team-scoped** writes (Phase 2 — full org-wide write in v1 by design); align delete-confirm copy on other tabs with the soft-delete undo reality; client skips `GET /users` for non-admin roles (currently eats an expected 403 with console noise each load).
- **Manager-scoped settings permissions (design question, not a bug).** `PUT /settings` is currently a blanket Admin-only role check (SVR-2). If Managers should ever make *limited* settings changes, a wider role check is the wrong tool — it would hand back the whole org config, reopening SVR-2(b). The right shape is **per-section permissions**: classify each `settings.extra` key by sensitivity, and gate the PUT per key rather than per request. Sketch:
  - Tier the keys — e.g. **Admin-only** (`anthropicApiKey`, `rolePermissions`, `ssoConfig`, `featureFlags`, `fieldVisibility`, `dispatchEnabled`/licensing) vs **Manager-allowed** (candidates: `painPoints`, `competitors`, `reasonsWon`/`reasonsLost`, `industries`, `buyerPersonas`, `kpiTargets`/`kpiThresholds`, `leadScoring` rules — Jeff to decide the actual split).
  - PUT keeps the auth gate but moves it per-field: build `extra` from only the keys the caller's role may write, and either drop or 403 the rest. The read-then-merge pattern already isolates each key, so this is a filter over the existing merge block, not a rewrite.
  - Reuse the existing `settings.extra.rolePermissions` blob (already persisted by `RolesDetail`) as the source of truth so the split is configurable per org rather than hard-coded.
  - Audit rows should record the caller's role and which keys were accepted vs rejected.
  - `AdminView` gating needs a matching change or Managers still won't see the panels.
  - Related: the `useSettings` auto-save PUTs the whole settings object, so per-key filtering (drop, don't 403) is likely the friendlier server behaviour once more than one role can write — revisit the drop-vs-403 call at that point.
- **Legacy `LeadConvBenchmarks` panel** — kept (feeds Reports color-coding) with dead header stubs removed; could be retired if confirmed unused by Reports.

---

## 10. Session Workflow

- Jeff uploads current file batches (including state doc, coding guide, style guide) at session start
- Claude reads state doc before making any changes — impact analysis before implementation for large features
- All modified files delivered together at session end, not piecemeal
- Updated `ACCELEREP_CURRENT_STATE.md` delivered for manual replacement
- Jeff never makes manual code edits — deploys complete output files via git
- Iterative deploy: dev branch → smoke test → merge to master → production
- UI decisions: Jeff prefers mockup options before implementation to avoid wasted effort
- All files Babel-validated with `@babel/parser` JSX plugin before delivery
