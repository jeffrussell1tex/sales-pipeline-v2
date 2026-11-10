<!-- Close-date history (OPEN_ITEMS §3.1 decision 3, §2.4; Jeff, 9 Nov: "3 recommended"; 10 Nov: "lets do close date history columns"): the design, 10 Nov 2026, over b749607. Read by a five-reader map (writers, schema and apply, readers, a SELECT-only census, rules and precedent) and a critic who re-read the twelve claims that carry it (all confirmed; three overstatements corrected below). Questions: §5 — answered 10 Nov, each the Recommended (Q4 all three; ANSWERS.md). Built 10 Nov (state §0.239; guide §18b122), the column applied on Jeff's go, an undated deal opening empty (the review — Jeff: "Open with the date empty"); its browser check PASSED as Jeff and as Karen; NOT committed; harness deferred. -->

# Design: a deal keeps the history of its close date — every move, appended by the server in the write

## 1. What it is

OPEN_ITEMS §3.1, decision 3 (Jeff, 9 Nov, the Recommended): "a new deal column, additive and nullable, both databases, with Jeff's go." Its consumer is AI scoring batch 2: "close-date moves" is one of the learned model's inputs, and "without it, the slip count cannot be learned" (§3.1, "Before batch 2"). The model's leakage rule — "Inputs describe the deal as it was before the close" — means each move needs its own day.

## 2. What is there today (read 10 Nov over b749607)

**Nothing records a close-date change.**
- The single deal save writes no server audit row; the client's `update` audit carries the account name only (useOpportunities.js:161). The census: of 5,519 audit rows, none records a close-date change — the only close dates in the log are four delete snapshots (_audit.mjs:20). **Nothing can be backfilled**: every deal's history starts empty, the day the column lands.
- Two screens already have empty slots for slips: Reports → Opportunity history defines a "Close slip" event that nothing produces (ReportsTab.jsx:5966, :5907-5926), and the Forecast view's "slipped" count is a stand-in built from the stage history (PipelineTab.jsx:976-980).

**The writers are few** (critic: confirmed by grep — the only write of the column is `sanitize`, opportunities.mjs:123):
- **W1 — the single PUT** (opportunities.mjs:502-697): the deal window's Save and the Closed Lost dialog (useOpportunities.js:155, :236). It reads the stored row whole (:507), merges `sanitize({ ...existing, ...data })` (:597), and upserts (:617-623). The window always sends the close date: its whole form (OpportunityModal.jsx:1220), the close date included.
- **W2 — the import's Overwrite, the bulk PUT** (:410-500): only the cells the file fills (`filledCells`, csvMapping.js:146-153 — a blank cell never clears a date); the stored rows read whole (:442-446); `partialRows` → `bulkUpsert`, one shared `excluded.*` SET for the batch (_bulk.mjs:231-233).
- **Creates** — the single POST and the import's new rows (:326-398): a new row, no stored date to move from.
- **A restore** (backup.mjs:358, :365): inserts a file's rows whole, `onConflictDoNothing`, **without `sanitize`** — a new id lands with whatever the file holds.
- **Never a writer:** the board's drag (`{ id, stage, stageChangedDate }`, KanbanView.jsx:232), the Reports contact PUTs (`{ id, contactIds, contacts }`, ReportsTab.jsx:6310, :6369), merges and their Undo (account, accountId, site, contactIds only — merge.mjs), automations (`UPDATABLE_OPPORTUNITY_FIELDS` leaves the close date out — automationEvents.js:258-265), quotes (`arr` only — quotes.mjs:190-195), the public API (GET only), the alerts (read only).

**The data** (census, SELECT only, 10 Nov): 98 deals in four orgs; 91 with a close date, **every one `YYYY-MM-DD`** (none M/D/YYYY, none blank); 7 with none (all in Accelerep QA). UKG: 20 deals, all dated. 57 of 98 have been edited since created; 36 open deals are past their close date — their earlier slips are lost.

**Two hazards the stage history's pattern would pass on** (the critic, confirmed):
- **H1 — the window writes back a close date it did not change.** It sends its whole form; a stored null opens as *today* (OpportunityModal.jsx:1040), so saving any field of an undated deal writes today's date — a "move" nobody made; and a window opened before someone else moved the date writes the old one back.
- **H2 — a move's "from" read before the write.** The stage history appends in SQL (§18b119 rule 3), but its "from" and "is it a move" come from the read at :507. Two saves at once can record a move from a date that was already gone. The import's stage history is worse: it writes each moved batch's whole lists as read at :442 (_stage.mjs:194-203), so a single save's append landing between the read and the write is lost.

## 3. The design

**R1 — The column.** `close_date_history jsonb`, nullable, **no default** (the add-column scripts' "nullable, no default rewrite"); a reader takes anything not an array as `[]` (as `historyWith` does, opportunities.mjs:40). One line in db/schema.ts, in the guarded shape (`tests/deal-fields.test.mjs:37`).

**R2 — An entry.** `{ from, to, date, timestamp, author, authorId, source }`:
- `from`, `to`: the close date as stored before and after (`YYYY-MM-DD`, or null);
- `date`: the day it moved — the member's day within a day of the server's (`moveDayOf`, _stage.mjs:105-111), else the server's;
- `timestamp`: the server's time; `author`, `authorId`: the caller's member name and app id (`usr_…`, `resolveCaller` — §18b119 rule 5, §18b22; never Clerk's);
- `source`: `'deal'` (the single save) or `'import'` (the Overwrite).

**R3 — Decided in the write, from what is stored (closes H2 for it).** The entry is built **in the upsert's own SQL**: `CASE WHEN opportunities.forecasted_close_date IS DISTINCT FROM excluded.forecasted_close_date THEN <history as stored> || jsonb_build_object('from', opportunities.forecasted_close_date, 'to', excluded.forecasted_close_date, …) ELSE <history as stored> END`. In `ON CONFLICT DO UPDATE`, a column names the row as stored at that moment and `excluded` the new one, so "from" and "is it a move" can never be stale. The single PUT adds it to its `set` (:621) when the body names the close date; `bulkUpsert` gains one optional per-batch SQL entry for its SET (_bulk.mjs:233), used by the Overwrite when the batch names the close date. Rows the file leaves alone carry their stored date (`partialRows`), so they make no entry.

**R4 — Only the server writes it** (§18b119 rules 2 and 4; §18b49 rule 2 — "a record a number trusts is written only by the server"; batch 2's slip count is that number). The key is not in `sanitize` (the `aiScore` model, :152-154), so no POST, PUT, import or create can write it. A PUT naming it is refused (400), single and bulk, as `comments` is; `dealBody` strips it (dealNotes.js:96-100), and THE GUARD (tests/deal-data.test.mjs) fails any deal PUT that names it.

**R5 — A create makes no entry.** The first forecast is already on the row (`forecastedCloseDate` with `createdDate`); the history starts at the first move.

**R6 — The screen** (§5 Q3): the deal window's History tab lists the moves — from → to, who, when.

**R7 — The apply (Jeff's go).** `db/apply-close-date-history.mjs`: checks only by default; `--apply` runs `ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS close_date_history jsonb` and reads the column back (nullable, jsonb); `--test` the test database, with the host guard drizzle.test.config.ts has (the add-column scripts' `--test` path has none — fixed here). Order (§18c): the test database, then the app database, **before** any code that names it is deployed. Dev and prod share the database: prod's code names no such column, so prod reads and writes are unchanged until it ships; no history is kept for prod's orgs until then. The test guard (tests/integration/_schema-guard.mjs) and a pin test (as tests/inbound-text.test.mjs:116-125 — no DROP, no ALTER COLUMN, `sanitize` never names it).

**R8 — Proven** (§18b119 rule 8): an integration suite in its own org namespace — a move appended; no entry when the date is sent unchanged; clear and set-from-empty per §5 Q1; two saves at once each record a true "from"; the import appends per row, none for rows it leaves; a body naming the list refused; a create makes none; org B's deal untouched by org A's writes.

## 4. What is out

Batch 2 (the slip count, the model). A Reports slip metric, the "Close slip" event, the Forecast view's real "slipped" count, an alert's "moved N times", an automation trigger on a move — each reads this column later, filed when wanted. The public API does not expose it (it exposes no stage history either).

## 5. Questions

**Q1 — What counts as a move?**
- **(a) Any change of the stored date, setting one where there was none and clearing it included (Recommended).** The history is then the whole truth; batch 2 can still choose to count only date-to-date moves.
- (b) Only a change from one date to another.

**Q2 — The window's untouched close date (H1).**
- **(a) Left out of the save when unchanged from what the window opened with (Recommended).** As the window already leaves out an untouched account, site and contacts (`leaveOut`, OpportunityModal.jsx:1215-1219): no write-back of a stale date, and an undated deal stays undated until someone picks a date (today it is silently set to the day of its first save).
- (b) Leave the window as it is — every save of an undated deal records "none → today".

**Q3 — Where it shows now.**
- **(a) The deal window's History tab lists the moves: from → to, who, when (Recommended).** Visible, and checkable in the pane.
- (b) Nowhere yet — the column only, for batch 2.

**Q4 — Which nearby fixes ride along? (several)**
- **The stage history's two gaps (Recommended):** its entries gain the author's id and a source (§18b119 rule 5), and the import's stage moves append in the write as R3 does (H2: the import writes each moved batch's lists as read).
- **A server audit row per close-date move (Recommended):** `opportunity.close_date_moved`, "from → to" (§18b42 rules 1, 4); one row per Overwrite batch, as the stage moves' `opportunity.stage_changed_bulk`.
- **A restore keeps only a well-formed history (Recommended):** a file's lists are kept entry by entry when each reads as an entry (dates, a member id), else dropped (§18b49 rule 2 — a hand-edited file could otherwise invent slips); the same for the stage history.
- **Neither** — the column alone.
