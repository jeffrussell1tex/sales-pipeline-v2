# Close-date history — Jeff's answers (10 Nov 2026)

The design: DESIGN.md beside this file (over b749607). Asked 10 Nov in the dialog, each question standing on its own, after Jeff's "lets do close date history columns, then todays five findings, then sales tax on quotes, then ship to prod".

| Q | Asked | Answer |
|---|---|---|
| Q1 | What counts as a change of the close date | **"Any change (Recommended)"** — date to date, a date set where there was none, and a date cleared: each is an entry |
| Q2 | The deal window's untouched close date | **"Leave untouched out (Recommended)"** — the window sends the close date only when it was changed in that window, as it does the account, site and contacts; an undated deal stays undated until someone picks a date |
| Q3 | Where the history shows now | **"History tab (Recommended)"** — the deal window's History tab lists each change: from → to, who, when |
| Q4 | Which nearby fixes ride along (multi-select) | **All three:** "Stage history gaps (Recommended)" — stage entries gain the member's id and a source, and the import's stage moves append in the write; "Audit row per move (Recommended)" — `opportunity.close_date_moved`, from → to, one row per import batch; "Restore checks lists (Recommended)" — a restore keeps a file's close-date and stage history entry by entry, only entries that read as entries |

Still Jeff's: the migration's apply (`db/apply-close-date-history.mjs`, the app database — shared by dev and prod), put to him when the script is built.
