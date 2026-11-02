# Batch 4b-3, step D — service plans: the build plan

**Status:** mapped 2 Nov 2026 over `9611848`, read only, by one workflow: three
mappers (the server, the screens and readers, the proof), a designer, two
critics (tenancy and correctness; proof and scope). Nothing was edited, run
against a database or served. Claude re-read dispatch-service-plans.mjs (the
GET's normalise, the POST, the PUT, the DELETE) and DispatchServicePlansDetail.jsx
(the pickers, the covered-types chips, `seedFromLegacy`, the legacy card).
Line numbers are `9611848`'s. The DESIGN (§2 Step D, Q11, Q12) is the scope.

## 0. What the code does today

- The endpoint asks no link: a plan's `visitTemplateId` and `coveredJobTypes`
  are stored as sent — another org's, or ids naming nothing.
- The POST is a full-row upsert on a GLOBAL id that reads nothing first; the
  PUT copies whitelisted keys (no full-row wipe) and reads the row only for a
  cadence change.
- Both write `coveredJobTypes` as `JSON.stringify(...)` into a jsonb column —
  a jsonb STRING (census C10); drizzle parses it back to a list on read.
- The job templates and job types an org may name are ITS stored lists
  (`settings.extra.dispatchJobTemplates` / `dispatchJobTypes`): no server
  default exists for either key; the job types screen's seed (`jt_*`, the same
  ids in every org) counts only once that org saves it.
- The restore never holds plans (backup.mjs names none).
- "Create N plans" from legacy tiers POSTs `plan_legacy_<tier>` ids: a re-press
  OVERWRITES every seeded plan (its template, types, price, terms cleared) and
  still says "Created N"; another org that seeded the same label first makes
  this org's press a 409 shown as "HTTP 409" (one org's data blocking
  another's); "Gold" and "gold" overwrite each other.

## 1. D1 — a plan's links name this org's entries (Q11)

- `linkIds.js NOUNS` gains `jobTemplate: 'job template', jobType: 'job type'`
  (a new line in Dispatch's group): "That job template is not in your
  organization — pick one from the list.", and the job type's likewise.
- `_links.mjs LISTS` gains `jobTemplate: 'dispatchJobTemplates', jobType:
  'dispatchJobTypes'` — read apart from this org's settings row, as a SPIFF
  and a team are; an entry counts by its own text id (`listEntryIds`).
- dispatch-service-plans.mjs: `PLAN_LINKS = [visitTemplateId → jobTemplate,
  coveredJobTypes → jobType (many)]`.
  - POST: reads the plan it would overwrite IN THIS ORG first (a foreign id
    reads nothing, so every link is asked), then `checkLinks`, refusing before
    the row is built.
  - PUT: always reads the row first (404 before anything is asked), merged
    with the cadence read, then `checkLinks`.
  - A held value is never asked again — the stored row as drizzle reads it
    (the text form already a list) **(critic: a `planAsHeld` wrapper would do
    nothing on the server — dropped)**.
  - A fresh id naming no entry of this org is 404 naming the field; a value
    that names no record by its id (a string `coveredJobTypes`, a number) is
    400 NOT_AN_ID; a key the body leaves out is not asked; null clears.
  - GET answers `coveredJobTypes` always as its list (`coveredJobTypesOf`, new
    `src/utils/planLinks.js`), so a stored string — or text that is not JSON —
    never reaches the screen as a string (its `.filter` throws).
- The screen: the template picker offers only entries with an id (an entry
  with none sent its text as the value — now a 404); a held covered type the
  list no longer holds draws as itself, "Deleted job type (<id>)", as the
  template does — invisible today, resent forever **(critic)**.

## 2. D2 — "Create N plans" skips plans that exist (Q12)

- `planLinks.js legacyPlansToCreate(tiers, plans)` → `{ create, existing }`: a
  label already has a plan when one of THIS org's plans (an inactive one too)
  has its name (`nameKey`, case and spaces aside) or the old button's id;
  labels of one name make one plan. `labelise` moves into planLinks.js, so
  the name and the skip key cannot drift **(critic)**.
- The press re-reads plans first (the org checked after the answer), creates
  only the missing labels, each with a random id as "+ New plan" does (no
  overwrite, no cross-org 409), reads each refusal's words, and says "Created
  N plans. M already had one — left as they were." The card counts only the
  labels still needing a plan; its "cannot create duplicates" copy corrected.
  No server change.

## 3. Proof

- **Unit** — tests/plan-links.test.mjs (new, in SUITES): the words; the spec
  run (create asks both; held not asked; fresh asked; malformed 400; 404's
  field); `coveredJobTypesOf`, `coveredToStore`, `legacyPlansToCreate`; the
  screen's pins. Pins in dispatch-links.test.mjs THE GUARD (the POST's prior
  select whole, the PUT's read-first order, both refusals, both
  `coveredToStore` lines, the GET's normalise line) **(critic: each harness
  mutant needs a unit pin — the itest is not in SUITES)**; sales-links (LISTS,
  a made-up DB with object entries, a plain-text and an id-less entry that
  count none); link-ids (NOUNS).
- **Integration** — tests/integration/plan-links.itest.mjs (new; not the
  settings-links suite DESIGN named — its org has Dispatch off and its tests
  compare A's whole extra **(critic)**): own orgs `itest_plans_A/B`, plan ids
  `plan_itest_plans_*`, the test-database guard before its first import,
  cleanup of plans, settings and audit rows by org; seeds of OBJECT entries
  **(critic: bare strings name nothing — the isolation would prove nothing)**,
  a seed id both orgs hold, one only B holds; A's held plan seeded with
  `JSON.stringify` (the census's shape). Cases: refusals on create and on a
  PUT (template and types, B's and made-up), malformed 400, A's own (a shared
  seed id) 201, the held text form re-sent 200, a link-only PUT body (no
  cadence) read first, a PUT leaving the links out keeps them, null clears,
  another org's plan (PUT 404; POST of its id with no links 409, with B's
  template 404), invalid stored text read as [], org B byte for byte.
- **Harness** — each new rule's entries, multi-line anchors so each is its
  file's only match **(critic: the two refusal lines are byte-identical)**,
  each proven caught by hand; the two `LISTS` entries re-anchored.
- **Browser** (Accelerep QA, Jeff signs in; `Clerk.user` read before each
  step) — a plan created with a template and two job types, reopened and one
  type unticked; refused values only through the screen's own pickers, never
  a hand-made write unless the server's compiled code was read first; the
  legacy card only if QA has a label with no plan (a SELECT answers it).

## 4. Filed, not built (OPEN_ITEMS with the batch)

R1 a re-POST of an existing id rebuilds the whole plan (the class: every
Dispatch create); R2 `visit_template_id` is varchar(50); R4 a deleted
template or type leaves plans naming it, and Dispatch says "no visit template"
for a deleted one; R5 the plans DELETE counts only customers (jobs and plan
visits hold a plan too); R7 nothing reads `coveredJobTypes` or
`discountPercent` yet ("Anything else bills at the discount below" is
unkept); the other Dispatch jsonb columns still written as strings (jobs,
customers) — the class.

## 5. Questions for Jeff

**JD1 — D2's "a plan exists" and new plans' ids.** Recommended: a plan of the
label's name (case and spaces aside) or the old button's id, in this org,
any plan; new plans get a random id like "+ New plan". The old id is global,
so one org's seeded "Gold" refused every other org's.

**JD2 — store `coveredJobTypes` as a real list.** Guide §18b62.4 rule 4 is a
hard rule; the class (jobs, customers) still stores strings and DESIGN filed
"possibly stored as text" as left. Recommended: yes for plans, since step D
rewrites both lines anyway — every reader is drizzle (a list either way); the
one census row stays text until saved; the class filed. A save also tidies a
stored list (non-text and repeated entries dropped) — a clean on save, not a
sweep.

**JD3 — Karen.** CLAUDE.md's chain asks a Karen pass of every batch; DESIGN's
step D browser check names none — a disagreement, flagged. A Sales Rep can
write plans only where reps may use Dispatch (`repsCanUseDispatch`).
Recommended: read QA's setting (a SELECT); if on, Karen saves a test plan
through the screen with one job type (her save takes the same check); if off,
her app loads and the plans screen is not hers.

**JD4 — the rest, each Recommended:** the stale job-type chip drawn as the
template's stale option is today (live), and added to the pending OPEN_ITEMS
item on whether such options are disabled (guide §18b24.3); R1, R2, R4, R5,
R7 and the jsonb class filed as above; the GET's list always a list.
