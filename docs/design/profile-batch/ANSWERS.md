# The member profile batch — Jeff's answers (26 Oct 2026, in chat)

Asked after the read-only map and the design (DESIGN.md §9, beside this file). Every answer is the option marked Recommended. The quoted words are the option labels Jeff chose.

| # | The question, in short | Jeff's answer | What it means for the build |
|---|---|---|---|
| Q1 | Someone changed the same box after the page opened — what should Save do? | **"Your change wins"** | No server check and no fresh read on open. A save sends only what changed, so everything else changed meanwhile is kept; where both changed the same box, the later save wins. |
| Q2 | The Manager box also changes the team's manager, on every save, and lists anyone | **"Only who they report to"** | The box sets who this member reports to and nothing else; no team's manager is rewritten. It offers Admins and Managers with access. |
| Q3 | How much in this batch | **"Steps A and B"** | Step A (§0.211): the page sends only what changed — screens only. Step B (§0.212): the manager stored by id, checked as a member of this org, picked by a type-ahead. The forecast call's one-figure save is filed as its own small batch. |
| Q4 | The team list is saved whole from the copy loaded at sign-in | **"Fix the move, file the rest"** | The member is moved between teams' lists by id, only on a team change. The list's age (the app's copy) is filed with batch 4b-3, which owns the teams list. |
| Q5 | Leaving the page with unsaved changes drops them without asking | **"File it"** | The page's leave guard is filed as its own small item. |
| — | Run a read-only count of the data first? | **"Yes, run it"** | Run 26 Oct (SELECTs and counts only); its results are in DESIGN.md's header. |
| D19 | The rep-path leg: Karen's own title kept through an Admin's save, with Karen in a second browser | **"Yes, on my go"** | It runs in the browser check only on Jeff's go, writing Karen's QA row with TEST values and putting them back. |
| D1-D19 | The defaults decided without asking (DESIGN.md §9.2) | **"Take them all"** | Each built as written. |
| P34 | The doc drift §9.2 lists apart from D1-D19 ("Flagged, not picked … on your nod") | **"The doc corrections are fine"** (27 Oct, once each was named to him) | Corrected to match the code in this step's docs, as the design says (state §0.211 names each), and put to Jeff for his veto before the commit; he kept them all. |

**The browser check (27 Oct, in chat)** — "Yes, start the browser check. I'm at the machine and will sign in. The doc corrections are fine." Then, asked before each write it needed: the TEST records (TEST Profile Rep and the three TEST teams, each team save writing QA's whole teams list) **"Yes, make them"**; the read-back **"Yes, SELECTs only"**; step 11 (D19) **"Yes, run it"**; step 10 in the pane **"Yes, in the pane"**; the two sign-ins **"Me in the pane, Karen in Chrome"**; Karen's title, re-typed with other punctuation, **"You fix it here"** (set to its exact old words from the page). Each the option marked Recommended.

The chat questions gave each option a short label; each label above is the option marked (A), Recommended, in DESIGN.md §9 (Q2's "Only who they report to" is §9's "(A) Stop it"; Q3's "Steps A and B" its "(A) Two steps …"; Q4's "Fix the move, file the rest" its "(A) Move the member by id …"; Q5's "File it" its "(A) File it as its own small item").
