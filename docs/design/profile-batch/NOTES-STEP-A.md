# The member profile batch — step A's build notes (§0.211, 27 Oct 2026)

Built to DESIGN.md (beside this file) on Jeff's answers (ANSWERS.md), over faed240. What differs from the design, and what the review changed.

## Departures from the design, each smaller or equal

- **Comments.** The page's handleSave carries one more line in the lists' comment (the Manager box changes no team's manager — Jeff's "Only who they report to") and a comment over the post-catch copies ("What landed, set once"). teamMembership.js's header says the Monday digest matches a Manager's reps by the team's name (_jobRoster.mjs `teamRepsOf`) — the design's line also named pipeline alerts, which were not re-read, so they are left out. memberPickers.js says the manager options are "the roles the Teams page offers as a team's manager" (TeamModal filters by `userType || role` containing "manager" or "admin", and `active !== false`; the sets agree for the stored roles).
- **S2** runs users.mjs sanitize's name line, read from its file and pinned, on the row a First and Last set since leaves — stronger than the design's difference-only demonstration.
- **S10** hands the slice the names its own parse finds and checks them against the list; faed240's handleSave is a separate test ("S10 OLD"), copied verbatim into the suite as one JSON string per line (checked against `git show faed240:…` when it was written).
- **R13** starts from a member with no manager (the design's Tess already reported to Bob, so the box would not have changed).
- **The harness mutants** use `void 0;` for a removed statement and `null && (` / `return null;` prefixes where the design wrote "→ ''" or "→ return null", so each mutant still parses.
- **The Write tool** turns a typed `\u2014` escape into the character itself; the four JS strings on the page that write the dash as `\u2014` (as their neighbours do) were put back by script, and the kept role-note line is byte-identical.

## What the review changed (27 Oct — four finders, a skeptic per lens)

- **The words.** dbWrite's own refusal words are whole sentences ("You do not have permission to make this change.", "The server returned 500.", "Network error — the change was not saved."), so "— {words}. Save changes tries the list again." read "..". `clause` (memberSave.js) takes the full stop off before the page's sentence goes on; the catch's words likewise.
- **An owed list and no answer.** A refused list followed by a role request with no answer said "Reload to see what was saved." — and a reload drops the owed move (`listOwed` is the page's state). It now says "Save changes tries again." while a move is owed.
- **The proof** (each a rule no test failed on, each with its run and a harness entry): the new team's other members kept on its list; a member joining from no list is a change (the list is written — the demo org's name-with-no-id members are this case); a retried list that landed is the list on screen; a move owed to a team the member has left is owed no more; a field typed while the save is out is kept at the call site (the run types during the PUT); the options sorted (unsorted input); two `PAGE_FIELDS` entries renamed for the break they make.
- **The integration suite.** I3's date checks now require a new date, not merely a different one (`null` passed before); its header no longer says every CONTROL sends faed240's body — I2's sends a name alone.

The harness: 33 entries as designed and the review's 11 (44), six retired — 3,235 → 3,273.

## The browser check (27 Oct) — passed, all eleven steps (state §0.211 holds the record)

- **Step 3.** The avatar's initials read "TP" before and after (both names begin "TEST Profile"), so the crumb, the band and the Users list are what show the rename.
- **Step 7.** The made-up answer was the member's row as `GET /users` gives it (the source the roster is read from at sign-in), with the gone team, territory and manager laid over it.
- **Step 9.** The profile panel was closed by the reload, unsaved.
- **Steps 10 and 11.** Jeff signed Karen in in the pane before the leg, so step 10 ran there first; for step 11 the pane went back to Jeff and Karen signed in on his Chrome, as designed. Her title, re-typed in her panel with other punctuation, was set to its exact old words from the page on Jeff's word ("You fix it here").
- **On the way.** A coordinate click after a pane tab closed left the focus on the page, so the typed name fired the app's keyboard shortcuts and opened an empty New Account window — discarded, nothing sent; every later box was focused by its reference and checked before typing.
