# Deal data — Jeff's answers (9 Nov 2026)

Asked over DESIGN.md (this folder), each question standing on its own in the dialog; every answer the Recommended.

| Q | Asked | Answer |
|---|---|---|
| Q1 | How a deal's team note is saved | **"Server applies each (Recommended)"** — each post, edit and delete is one operation the server applies to the stored list; nothing is written back whole; the deal's Save and the Closed Lost dialog stop sending notes |
| Q2 | Who writes a note's author, and who may change a note | **"Server, author only (Recommended)"** — the server stamps the author (name and member id) and the time; only the author may edit or delete a note (the four older notes by their author name) |
| Q3 | Stage history, the same flaw | **"Fold it in (Recommended)"** — the server appends the entry on a stage change from the stored row, as the CSV import does, and ignores a body's history |
| Q4 | A contact's Undo | **"Any role, by id (Recommended)"** — the Undo marks a restore; the server keeps the stored owner by id (a member of this org, else unassigned), never the caller, for any role that may delete the contact |
