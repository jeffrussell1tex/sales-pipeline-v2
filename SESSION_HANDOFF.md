# SESSION_HANDOFF.md

**Session of 19 August 2026.** Repo root. Read this first, then verify every claim
in it against the live repo before acting -- including the claims in this file.

**Fast staleness check:** does `docs/ACCELEREP_CODING_GUIDE.md` have §18b18, and
does `docs/ACCELEREP_CURRENT_STATE.md` have §0.22? If not, you are looking at a
copy that predates this session. Check section numbers, never dates.

**State at close:** 232 tests, 50/50 mutations, six gates green.

---

## 1. What was verified on dev

| Check | Result |
|---|---|
| Check 3 — accounts CSV blocked in the contacts importer | **PASS** |
| Check 5 — timezone PUT fires once, not per interaction | **PASS** |
| Stage clock row 1 — stage changed + days mapped | **PASS** |
| Stage clock row 2 — stage changed + days unmapped | **PASS** |
| Stage clock row 3 — stage unchanged + days mapped | **PASS** |
| Stage clock row 4 — stage unchanged + days unmapped | **FAILED** → fixed → re-verified |
| Fiscal quarter on Home | **FAILED** → fixed → verified (reads Q4) |

Check 4 (`notFound` during a held Conflicts step) was not attempted. It races
against the delete tests and the previous handoff already called it fair to defer.

---

## 2. What shipped

**Stage-clock batch wipe** — `_stage.mjs`, `opportunities.mjs`,
`tests/stage-batch.test.mjs`. `applyStageChanges` derives `stageChangedDate` and
`stageHistory` per row; `partialRows` keeps the union across the batch. One deal
moving stage put both keys in the union for the whole batch, `sanitize()` supplied
`null` and `[]` for rows with no patch, and `bulkUpsert` wrote them. Two-pass
backfill from the stored row. Full write-up in §0.22.

**Fiscal quarter + local dates** — `HomeTab.jsx`, `quarters.js`, new
`src/utils/dateLocal.js`, new `tests/date-local.test.mjs`. HomeTab computed a
calendar quarter and never read `fiscalYearStart`. `isoLocal` replaces
`toISOString().split('T')[0]` at four sites.

**Mutation harness** — `scripts/mutate-import.mjs`. Anchors are now matched
EOL-agnostically; `SKIP` became `STALE ... DID NOT RUN`. 37 → 50 mutations.

---

## 3. Do this first

### 3a. The delete gate — STILL UNRUN

Third session in a row it has been carried. It is the sharpest untested thing in
the codebase and it now has a **blocker that must be solved first**:

**Karen can read zero opportunities.** Admin sees 42; Karen sees `0 total`. Every
deal's `owner` and `ownerId` are `undefined` and `salesRep` holds a display NAME
("Priya Nair", "Dana Holloway"). No deal is hers, so a DELETE against one returns
404 and proves nothing about the Admin gate. Accounts (135) and leads (6) are
readable and remain valid subjects.

The clean fix is the fixture org in §3b. Do not run the gate against the current
org's ad-hoc ZZTest data.

**When it runs, both halves are required.** Three 403s on
opportunities/accounts/leads look identical to delete being broken for everyone.
Three 200s on contacts/tasks/activities is what makes them mean something.

**Trap, hit twice this session:** Clerk session tokens expire in about a minute.
A stale token returns **401**, not 403. Three 401s look like three refusals. Fetch
the token inside every call:

```js
const auth = async () => ({ Authorization: `Bearer ${await window.Clerk.session.getToken()}` });
```

Only 403 counts as the gate refusing.

### 3b. Build the fixture org (agreed, not started)

A dedicated test organization with generated data, replacing the accumulated
ZZTest records. Jeff creates the org; Claude delivers CSVs for accounts, contacts,
opportunities, leads and tasks plus a manifest saying which record serves which
test.

Two requirements agreed:
- Opportunities must be assigned to Karen via the importer's **Sales Rep** field,
  so the ownership coverage that blocks §3a exists by construction.
- Jeff supplies the org name and the exact display name for Karen's records
  (`salesRep` matches on name, not id).

Worth doing early for a second reason: a brand-new org has no settings row, so it
exercises the empty-org defaults path nothing has tested — including the
`fiscalStart` disagreement in §4.

---

## 4. Findings recorded, not fixed

**Role is stored in three places and they disagree.** For Jeff's own account:

| Source | Value |
|---|---|
| Clerk `publicMetadata.role` | `Admin` — what `auth.mjs:71` gates on |
| Clerk org claim `o.rol` | `admin` |
| `users.role` column | `Technician` — what the Users panel displays |

Authorization is correct; the roster display is not. Two consequences worth
resolving: the Users panel shows a value that does not govern access, and
`publicMetadata` is USER-level rather than org-level, so a role may not be scoped
to the organization. Unconfirmed — `auth.mjs` 55–110 and 140–170 were never read
this session. Read them before designing anything here.

**Jeff's roster row is stale on two fields.** `user_3ASC6OBfOxF6BAIRueq94KunZaN`
stores `jeffrussell1@gmail.com` and role `Technician`; he signs in as
`jeffrussell1@yahoo.com` with `publicMetadata.role = Admin`. Fixing the row is
trivial. The question worth answering first is why `users-sync` stopped
reconciling it — one stale row is a typo, a sync that silently stops is a class.
Relevant to the Clerk production migration.

**Deal ownership is matched by display name.** `salesRep` holds a name string;
`ownerId` is undefined across all 42 deals. Two reps sharing a name collide, and
renaming a rep orphans their deals.

**Expected 403s are logged as errors.** Karen's page load fires `GET /users` and
`PUT /settings`, both correctly refused, both printed as `DB error 403` with a
stack. A rep sees console errors on every load. The refusal is right; the
reporting is not.

**`check:dbfetch` reports files-with-findings, not files-scanned.** It printed
"across 0 file(s)" on a clean run while the other three printed 141/142/113. A
clean run and a collapsed walk are indistinguishable.

**`fiscalStart` defaults disagree.** `ListView.jsx:349` falls back to `|| 1`
(calendar); `App.jsx`, `OpportunityModal`, `AnalyticsDashboard`, `ReportsTab` and
now `HomeTab` fall back to `|| 10`. An org that never set `fiscalYearStart` gets
calendar quarters in the Pipeline list and October quarters everywhere else.
Invisible in Jeff's org because the setting exists there.

**Fiscal quarter maths exists in seven implementations.** `utils/quarters.js` (the
tested one), `App.jsx:640`, `OpportunityModal:1129`, `AnalyticsDashboard:113`,
`ReportsTab` ×4 plus 3145 and 3641, and HomeTab (now fixed). Only `ListView.jsx`
imports the tested helper. Consolidation is a real task, not a tidy-up.

**24 `toISOString().split('T')[0]` sites remain.** Triaged; see §5.

---

## 5. The remaining local-date sites

`isoLocal`/`todayLocal` exist in `src/utils/dateLocal.js` with 12 tests and 5
mutations, so these are mechanical. Take them a batch at a time with gates each
time. Worst first:

**Writes a wrong date to the database** — `SalesManagerTab:837`. A coaching note
written in the evening stores tomorrow's date permanently.

**Wrong on screen every evening** — `TaskItem.jsx:9` (tasks due today turn red as
overdue after 7pm Central), `TasksTab:1129/1131`, `SalesManagerTab:46`,
`ModalLayer:548`, `App.jsx:1128`.

**Quarter-boundary only** — `ListView:360`, `PipelineTab:90/91/95/476/477/481`.
Harmless most days; on the evening of a quarter end the Pipeline jumps early.
`ListView:360` also carries the `fiscalStart` default bug above.

**Wrong only east of Greenwich** — `PipelineTab:935`, `useCalendarState:24`,
`TasksTab:216/1197`. Local midnight survives negative offsets and loses a day at
positive ones.

**Leave alone** — `AuditDetail:121`, `AuditDetail:995`, `UsersDetail:397`. All
three are download filenames.

**Needs reading before judging** — `OutlookImportModal:149` (depends what `parsed`
holds), `QuickLogFab:193` (a +24h follow-up, so the rollover may partly cancel).

A `check:localdate` gate is worth building AFTER the real ones are fixed, not
before — the pattern is mechanically detectable and the three filename sites go in
the baseline.

---

## 6. Carried forward from previous handoffs

Unchanged and still outstanding: bulk POST chunking for accounts/contacts/
opportunities (unbatched insert path, ~1,872-row ceiling); `onConflictDoNothing()`
in the POST bulk branch can never fire; `ModalLayer` optimistic write before POST;
`assignmentRules` mock data persisting to the database; `ReportsTab:6405` products
TypeError; CSV Import/Export rollout; `importPresets` has no load path; `storage.js`
dynamic import; Clerk production migration; E2E/Playwright.

---

## 7. Housekeeping

**ZZTest data in the current dev org**, left in place deliberately:
`ZZTest Alpha` (stageChangedDate null and stageHistory emptied — damage from the
original bug, unrecoverable, kept as evidence), `ZZTest Bravo`, `ZZTest Charlie`,
`ZZTest Delta` (also null/emptied), plus `ZZTest Alpha Renewal`,
`ZZTest Beta Expansion`, `ZZTest Gamma New Logo`, and ~10 ZZTest accounts.

Remove them deliberately once the fixture org exists, one at a time, never with a
mass-delete or a `clear=true`.

**Design decision, settled:** the Home greeting counts ELAPSED weeks from the
fiscal quarter start (Jul 1–7 is Week 1, advancing every 7 days regardless of
weekday), not calendar weeks. Confirmed by Jeff.

**Naming, settled and already documented at `user-role.mjs:15–17`:** `'User'` is
the stored value; "Sales Rep" is a display label only. No change needed. A UI
showing the raw `User` is a display bug in that panel.
