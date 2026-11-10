<!-- Five findings of 10 Nov (OPEN_ITEMS §4.2, §4.5 — found in §0.238's dev checks): the design, 10 Nov 2026, over 8d0a055. Read by five read-only mappers (one per finding, each mapping its class) and a critic who re-read each map's load-bearing claims (all confirmed; one symptom corrected, two instances added). Jeff's order, 10 Nov: "lets do close date history columns, then todays five findings, then sales tax on quotes, then ship to prod". Questions: §6 — answered 10 Nov, each the Recommended (ANSWERS.md). Built 10 Nov (state §0.240; guide §18b123); a five-lens review confirmed four, all fixed; its browser check PASSED as Karen; NOT committed; harness deferred. -->

# Design: today's five findings, as one batch

## 1. A blank AI recommendation

**Found** (dev, `opp_qa_12`): the score answered `recommendation: ""`; the AI Score tab shows "Recommended next action" over nothing. The model's — 13 requests of the same body each answered one.

**The code.** The schema requires the field but cannot require its length (string `minLength` is not supported in structured outputs — the bundled API reference; not relied on). `attemptOutcome` (aiCall.js:86-89) passes any JSON object; ai-score.mjs:249-254 cuts each text (`cutAtWord`, which turns anything not a string into `''`). The recommendation shows in one place (OpportunityModal.jsx:753-754, the heading unconditional). The headline shows on no screen (the score-drop email falls back already, pipeline-alerts.mjs:460). A signal with blank text renders an empty chip (the tab :759, the rail :931) — the same class.

**Recommended (B + C):** a blank recommendation is "unreadable" and goes once to the fallback (the AI rule's retry, §18b121 rule 2 widened in the same commit); when the fallback is blank too, or no time is left, the score is kept with no next action — never worse than today; signals with blank text are dropped on the server and in both renders; the heading shows only over a recommendation (stored blanks look clean too). A blank headline or an empty signals list does not retry. Cached scores are served as today.

## 2. A link refusal wears the undo toast's ✓

**Found:** "✓ That link is for an organization you're not a member of." — gone after five seconds.

**The code.** The undo toast picks its glyph error → ⚠, notice → ✓, merged, deleted (ModalLayer.jsx:341-347); `offerUndo` alone sets the five-second timer (App.jsx:459). The link reader's four refusals and its failed read all go through `offerUndo({ notice })` (App.jsx:1010, :1024, :1031, :1038, :1042), and a read that failed (`!res.ok`, :998) reads as a refusal. The same class: a partial bulk delete's error is overwritten at once by the Undo toast (useContacts.js:84→90, useAccounts.js:112→117).

**Recommended (A):** a link refusal is an `{ error }` — ⚠, no timer, kept until closed; a read that failed says it could not be read, apart from "isn't available to you", and keeps the link so a reload retries it (a refusal drops it); a partial bulk delete keeps its error rather than the Undo toast over it. A guard: no `notice` carries a refusal.

## 3. Deal emails name who acted by their Clerk id

**Found:** "Hi Jeff RussellAdmin, user_3ASC6O… updated the stage on one of your deals."

**The code — the class, complete by a wide grep:** opportunities.mjs hands the deal emails the Clerk id where a name belongs — `createdBy` (:394), `closedBy` (:705), `changedBy` (:716), `updatedBy` (:731), and a note's `commentBy` falls back to it (:588); `rep !== userId` (:724) compares a name to a Clerk id, so a rep is emailed about their own edits. The caller's member name is already resolved there (`me`, :613; `creatorName`, :386). The templates print these raw.

**Recommended (A):** the caller's member name in every slot, "Someone" when the caller has no member row (as the texts and Slack say); the self-check by owner id (`!!upserted.ownerId && upserted.ownerId === me.id`). Filed, not folded: escaping names in the email HTML (OPEN_ITEMS §4.5, its own item), stored `createdBy` Clerk ids no screen shows.

## 4. Day counts read -1 before noon

**Found:** "DEAL AGE -1d · IN STAGE -1d", "-1 days in Evaluation (Demo)".

**The code — the class:** a stored day read at noon, subtracted from now and floored (OpportunityModal.jsx:312-313, :1309-1310, :1629; PipelineTab.jsx:609, the export; Kanban clamps, :51). The bell's close-day count reads -1 until about 6 pm Chicago and -2 after (App.jsx:1327-1328; the critic's correction). Reports' timeline buckets (ReportsTab.jsx:5931-5932) put a Sunday event out of "This week" every afternoon. Four copies of a `daysBetween` exist. The server's counts (ai-score.mjs, pipeline-alerts.mjs, digest.mjs) count from UTC.

**Recommended (option 2):** one helper in `src/utils/dateLocal.js` — `calendarDays(from, to)` (signed, by calendar day, DST-proof) and `daysSince(day)` (never below 0) — and every client count on it, with a guard that scans for the noon-floor pattern. A close date of today reads "today"; overdue from the next morning. The server's counts filed (a day off in some zones; they need the member's zone).

## 5. A deal with no created date takes the day of its first edit

**Found:** QA's "TEST3c Deal" reads created 2026-11-10 against `created_at` 30 Oct.

**The code.** The save sends `createdDate: prevOpp?.createdDate || today` (useOpportunities.js:127); the server takes any body's date (`sanitize`, :162). Census (SELECT only): in QA one deal still has none and two moved to their first edit; none elsewhere, none in UKG. The same pattern (critic): a won date written on a later edit when the deal went Closed Won without one (useOpportunities.js:140-141).

**Recommended (B + C):** the created date is the server's once the deal exists — both PUTs ignore a body's, `dealBody` stops sending it; a create without one is filled with the creator's day (`moveDayOf`'s rule: the member's day within a day of the server's); QA's one undated deal filled from its `created_at` day (an UPDATE on Jeff's go, by id and org); the won date kept as stored unless the save closes the deal Won.

## 6. Questions

Asked in the dialog, each with its Recommended first. The rest of each finding takes the recommendation above.
