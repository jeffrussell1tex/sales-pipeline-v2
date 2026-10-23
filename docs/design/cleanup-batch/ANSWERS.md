<!-- The cleanup batch (OPEN_ITEMS §1 item 1, "Merged-away records leave every other list — DONE"): Jeff's eight answers to the design's questions (§8). Written 18 Oct 2026 in the twenty-first session, read only, over 7ee14fe — file:line references are as of 7ee14fe and may have moved; verify every one before building. Steps G (§0.208, THE GUARD class-wide), A (§0.209, the screens) and B (§0.210, the public API, the quote email and the numbers) are DONE — kept as the batch's record (state §0.208-§0.210). The read-only maps it cites (map-*.md, critique-*.md) were scratch files and are not kept. -->

# Jeff's answers for the cleanup batch (18 Oct 2026, in chat, AskUserQuestion)

Asked after the read-only maps (b14/map-*.md, eight), the design (design.md), three critiques (critique-*.md) and the
revision (design-final.md, §8). Every answer is the Recommended option.

- Q1 Batches: "Three steps (Recommended)" — 1) the automatic check alone (THE GUARD class-wide; nothing on screen
  changes); 2) every screen; 3) the public API, the quote email and the numbers. All before the member profile page
  ("Undo, cleanup, profile").
- Q2 Old record: "Survivor shows them (Recommended)" — the survivor's Documents tab lists a document linked to the
  record merged into it, its People list a person still linked by id to that record, and the surviving contact's
  activity history (and Reports' Contact history) an activity naming the merged-away contact; nothing in the data
  moves; an Undo takes them off again; told: Unlink there also unlinks it from the old record, and an Undo does not
  bring that link back.
- Q3 Top search: "One row to the survivor (Recommended)" — "Resinall — “Resinall, Inc.” was merged into this account",
  opening Resinall.
- Q4 Outside API: "Leave them out (Recommended)" — the public API's accounts and contacts leave merged-away rows out,
  totals count only what is listed (filter in the SQL, `is not true`).
- Q5 Hidden count: "Count what you see (Recommended)" — the merge windows and the delete warning count live records
  only, deals by their account link (by name only for an old deal with none).
- Q6 View accts: "Grey it out (Recommended)" — "Not available yet", like "Reassign accounts…"; making it work filed as
  its own feature.
- Q7 Deal names: "Fix both now (Recommended)" — the top search's "N open deals" and Reports → Activity History →
  Account history match deals by the account link (by name only for an old deal with none), in the screens step.
- Q8 Defaults: "Approve; fix the list (Recommended)" — D1–D10 as written (design-final.md §8.2); the guide's gate list
  names all eight checks (check:fnscope added) and the GitHub `Tests` run gains check:fnscope, in step 1.

Earlier: Jeff, 16 Oct: "One cleanup batch next"; 17 Oct: "Add them to the cleanup batch", "Undo, cleanup, profile",
"Export follows the list".
