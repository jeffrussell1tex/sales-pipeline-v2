# The unknown-save rule — Jeff's answers (18 November 2026)

The design: DESIGN.md beside this file (over `92d1bc8`). Asked 18 Nov in the dialog, each question standing on its own, after Jeff chose the item ("Unknown-save rule") from OPEN_ITEMS §4.8.

| # | Asked | Answer |
|---|---|---|
| Q1 | Which answers say "Not saved" — every 500 carries words ("Internal server error") and about 40 save paths can answer it after writing | **"Only a 4xx in words (Recommended)"** — a 4xx with the server's `error` says Not saved; every 5xx, page, wordless answer or dropped connection says it may have been saved and to reload to see. One test on every screen (`heardRefusal`). |
| Q2 | What a screen that moved something before the answer shows when the answer proves nothing | **"Keep it, say may-have (Recommended)"** — the change stays as made, with a notice kept until closed ("… may have been moved — reload the page to see whether it was: …"); forms stay open with the typing. |
| Q3 | How much in this batch (about 208 sites in ~60 files, six Parts) | **"Parts 1, 2 and 6 (Recommended)"** — the shared test, words and guard; the CRM core; a create keeping one id (the server's `idInUse` / `already` code and every create). Parts 3 (Leads, Tasks, Quotes, Reports, Sales Manager), 4 (Dispatch) and 5 (Settings) the next batches. |
| Q4 | The member invite answers a failed invite's raw error text (users.mjs:899) | **"Fix in this batch (Recommended)"** — Clerk's own refusal words still pass; any other failure says the server could not finish, with the log's ref, never the database text. |
