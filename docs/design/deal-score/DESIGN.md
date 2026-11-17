<!-- AI deal scoring, batch 2 — "a deal score that learns" (OPEN_ITEMS §3.1; Jeff, 17 Nov: "lets start the advanced deal scoriung project"): the plan-level design, 17 Nov 2026, over 814e309. Its five questions (§6) answered 17 Nov, each the Recommended (Jeff: "All recommended"; ANSWERS.md beside this file). The build's code map and any question it raises follow in §8 when read. -->

# Advanced deal scoring: what is built, what remains, and the next batch (17 Nov 2026)

Read over `814e309` (dev == origin/dev). Written before any code; the answers in ANSWERS.md.

## 0. Session-start ritual

- `docs/SESSION_HANDOFF.md` read. All six fingerprints match the repo:
  - state line 4 opens "**Verified at:** **§0.252–§0.255 PUSHED to dev 17 Nov**";
  - the state's Batch line ends as quoted;
  - §0.255's "**The dev check as Karen** (17 Nov" appears once;
  - the guide says "rules current through **§18b129**";
  - OPEN_ITEMS §4.5 and §4.2 have their quoted lines;
  - CLAUDE.md says "about 4 h estimated since".
- `npm run check:handoff`: "Handoff copies identical (789599 bytes)."
- `git status`: the tree holds `deno.lock` (+2 aws-sdk lines) and the untracked `src/utils/dispatchCustomer.js.bak`. The handoff records both, and both stay out of every commit.
  - The handoff's "two docs commits NOT pushed" is out of date. `origin/dev` is now `814e309`, so they were pushed after it was written.
- `docs/OPEN_ITEMS.md` read: §1, §3.1, and every line that mentions scoring.

## 1. What "advanced deal scoring" means

OPEN_ITEMS §3.1, **batch 2: "a deal score that learns"**. Its plan page is the "Deal Scoring Roadmap" artifact, read in full. Every other candidate in the docs is either finished or depends on batch 2:

| Candidate | Status |
|---|---|
| Batch 1, the Admin's model choice (state §0.238, guide §18b121) | SHIPPED 16 Nov |
| Close-date history, which batch 2 needs for the slip count (state §0.239) | SHIPPED 16 Nov |
| Per-contact engagement (§0.192) | Done 9 Oct |
| Batch 3, next-step suggestions from past wins | Depends on batch 2 |

Jeff already answered decision 1 on 9 Nov (docs/design/ai-scoring/ANSWERS.md): **the learned model makes the number, and Claude explains it.** Claude's own 0–100 judgment retires once an org has enough history.

## 2. What is already built (read in code)

- **The health score.** A set of rules that runs in the browser: `calculateDealHealth` (src/App.jsx:1320, with parts in src/utils/dealHealth.js).
  - It starts at 100 and subtracts points for:
    - activity silence: 10, 25 or 40 points, or 30 when the deal has no activities at all;
    - days in the current stage: 15 points past 30 days, 30 past 60;
    - a close date already passed: 35;
    - a close under 7 days away with no activities: 20.
  - Bands: Healthy at 75 or more, At Risk at 50 or more, Critical below that.
  - It sits behind the "Deal scoring" feature switch (FeaturesDetail.jsx:15).
  - It shows on Kanban, the list, the Pipeline and its CSV, meeting prep and Home.
  - It reads the activities list the screen holds.
- **The AI score.** Claude, through `ai-score.mjs`.
  - Since batch 1 it uses the Admin's model and fallback, enforces "Available to", writes one audit row each way and names the cause when it fails.
  - It is kept on `opportunities.ai_score` with four earlier scores, and answers from that copy for 24 hours.
  - Where it is read: Kanban and the list (below 50 marks the deal at risk), the report engine's "AI score" metric, the hourly score-drop alert (below 40, and below 25 to the manager), and the public API.
- **Stage win probability.** Each stage's weight in `settings.funnelStages`: one list per org, shared by all its pipelines. The defaults run from 10 (Qualification) to 90 (Contracts). `getWinProbability` is at App.jsx:1373.
- **Close-date history** (`close_date_history`, which only the server writes) and **stage history** (`stage_history`), both appended by the server.
- **The lead model, the pattern batch 2 copies.**
  - Logistic regression over five features (`score-lead.mjs`), one model per org.
  - It runs nightly at 06:00 UTC (`score-leads-batch.mjs`) on prod only (`JOBS_ENABLED`), or when an Admin presses Train now (`train-lead-model.mjs`).
  - It needs at least 20 decided leads, and the threshold defaults to 150.
  - The model is stored in `settings.extra.leadScoring.predictive.model`, written under a guard (§0.224).
  - **Two things the deal model must not copy:**
    - the lead model reports *training* accuracy (score-lead.mjs:192-197);
    - it measures a decided lead's features as of today rather than as of the decision (score-leads-batch.mjs:132 passes `now`).

## 3. What the plan says remains

- **Batch 2: a deal score that learns.**
  - It starts from the health rules plus each stage's win probability.
  - It learns from each Closed Won and Closed Lost deal, one model per org, retrained nightly and by Train now.
  - The blend: the learned share is (n − 20) ÷ ((n − 20) + 30), and zero below 20 closed deals.
  - Inputs:
    - days in stage against the org's usual;
    - activity by type over the last 14 and 30 days;
    - contacts engaged, not just listed;
    - revenue against the org's typical deal;
    - how often the close date moved;
    - the stage reached, and how fast earlier stages went.
  - Guardrails:
    - each org's model trains on that org's deals only;
    - inputs describe the deal as it was before the close;
    - Settings shows "learning from N closed deals" and the accuracy on deals held out of training.
  - Claude explains the number.
- **Batch 3:** next-step suggestions drawn from the org's wins, with an outcome log. This needs batch 2.

## 4. The fact that shapes the next batch: a read-only census (SELECT, counts only, the shared Neon main, 17 Nov)

| Org | Won | Lost | Open | Closed with stage history | Closed with close-date history | Closed with any activity |
|---|---|---|---|---|---|---|
| Demo org `org_3BDQEH7s…` | 10 | 7 | 34 | 12 | 0 | 0 |
| **UKG (real)** `org_3Cwnblo…` | 0 | 6 | 14 | 6 | 0 | 2 |
| Accelerep QA `org_3K6LqEB6…` | 3 | 1 | 21 | 0 | 0 | 2 |
| `org_3B8Tg9Ot…` | 0 | 0 | 3 | 0 | 0 | 0 |

- **No org has the 20 closed deals the model needs.** The most is 17, in a demo org.
- UKG has no wins, so it has nothing to learn from yet.
- No closed deal has close-date history, because the column only started recording on 10 Nov.
- Only four closed deals in the whole database have an activity logged.

So a learned model would train for nobody today, and on day one the score every org sees would come from the rules. The learner matters once an org builds up history, or imports it. A new customer's import could bring hundreds of closed deals, but an imported deal carries no activities and no stage history from before its close.

## 5. The next batch, proposed: "batch 2A, the deal score and its learner"

Claude's explanation, and the retirement of Claude's own number, follow in batch 2B (Q1).

- **R1. One pure module, `src/utils/dealScore.js`, run by the server, the tests and the screens.**
  - `dealFeatures(deal, activities, asOf, orgStats)`: every input measured **as of a day**, using only activities, stage moves and close-date moves dated before it:
    - days in the current stage ÷ the org's median for that stage;
    - activities by type in the 14 and 30 days before;
    - distinct contacts engaged in the last 30 days, and how many are listed;
    - revenue ÷ the org's median closed deal;
    - close-date moves so far;
    - the stage's position in the funnel;
    - the pace of earlier stages against the org's medians.
  - Never an input: the stage name Closed Won or Closed Lost, `wonDate`, `lostDate`, `lostReason` or `lostCategory`. Each of these gives away the outcome.
  - `rulesScore(deal, …)`: the start. The stage's funnel weight, moved down by the health rules' penalties (Q2), giving 0–100.
  - `trainDealModel(examples)`: logistic regression, the lead engine's method. It reports **held-out** accuracy by 5-fold cross-validation ("right on 31 of 40 closed deals it did not train on"), never training accuracy.
  - `learnedShare(n)` = 0 below 20, else (n − 20) ÷ ((n − 20) + 30). The score is (1 − share) × rules + share × learned. It carries its factors: the rules' reasons, plus the model's largest contributions once it has a share.
- **R2. What a closed deal teaches.** Each closed deal gives one example, measured on the last day it was open: the day its final stage move took it to Closed, or its won or lost date.
  - A closed deal teaches only if something about it is known from before the close: at least one activity or one stage move. The standing names how many deals were left out and why.
  - n counts the deals that teach.
- **R3. Where the model lives.** A new settings key, `dealModel`, written by the server alone, as `integrationRequests` is:
  - the GET returns it;
  - the PUT keeps the stored value and never takes one from a body;
  - it is in `REV_KEYS`, and written guarded on its revision token (§0.224's shape).
  - It holds the coefficients, the org's medians (per stage, revenue, pace), n, the held-out accuracy and when it was trained.
- **R4. When it runs.**
  - Nightly: a new `score-deals-batch.mjs` on the same schedule, behind `withHeartbeat`, so it runs on prod only. It loops over orgs one at a time and reads everything by org.
  - When an Admin presses Train now: `train-deal-model.mjs`, Admin only, for the caller's org.
  - When the deal, or an activity on it, is saved (Q4).
- **R5. The screens.** The number and its factors take the health score's place (Q3). It stays behind the same "Deal scoring" switch.
- **R6. Settings.** A "Deal scoring" card beside Lead scoring:
  - before 20 deals: "Learning from 4 closed deals; the model starts at 20";
  - after: "Trained on N closed deals · right on X% of deals held out · learned share 46% · last trained …";
  - Train now, for Admins.
- **R7. Isolation, proved.**
  - An itest seeds org A with 40 closed deals and org B with 0, in its own namespace.
  - It proves:
    - B has no model, and its scores are unchanged;
    - A's Train now and the nightly pass write nothing in B;
    - a body naming `dealModel` or `dealScore` is refused or ignored.
- **Tests.**
  - Unit tests of the features, with a deal measured as of a day before an activity it later had; of the blend curve; and of the held-out split.
  - A guard: no outcome field among the inputs.
  - The itests above.
  - Harness deferred, per the standing rule.
- **Not in 2A:**
  - Claude explaining the number, and the AI Score tab's change (2B);
  - the score-drop alert, the public API and the report metric moving to the new number (2B, or follow-ups);
  - batch 3.

## 6. Questions for Jeff, each with a recommended answer

**Q1. Scope, given that no org can train yet.**
- **(a) Recommended:** two batches.
  - 2A: the number, the learner and the Settings standing, with the learner idle until an org reaches 20.
  - 2B: Claude explains the number.
  - Each part is smaller to verify, and the rules half is useful at once.
- (b) All of batch 2 in one batch.
- (c) Hold batch 2 until an org has the history, and do other work meanwhile.

**Q2. What the number means.**
- **(a) Recommended: the chance of winning, 0–100%.**
  - It starts from the stage's funnel weight, is moved down by the health rules, and is later learned.
  - Rules and model then measure the same thing, so the blend mixes like with like.
  - It can be checked against what actually closed ("of the deals it called 70%, how many won").
  - Its colour shows how it compares with the stage's usual weight.
- (b) Keep a health score of 0–100 (how the deal is doing for its stage), with the model's probability converted into health against the stage's base rate. Familiar, but it cannot be checked directly against outcomes.

**Q3. What happens to today's two numbers.**
- **(a) Recommended:** the new score takes the health score's place on every screen that shows the health score, behind the same switch, and its factors replace the reasons. Claude's AI score stays as it is until 2B.
- (b) Show it as a third number beside both.

**Q4. Where the number is worked out.**
- **(a) Recommended: on the server, kept on the deal** in a new nullable jsonb column, `opportunities.deal_score`.
  - The server writes it alone, and no save sends it. The change is additive and nullable, and goes to the test and app databases on your go.
  - It is refreshed when the deal or an activity on it is saved, nightly, and by Train now.
  - Every viewer sees the same number, and the alerts, reports and API can read it later.
- (b) In the browser, as the health score is today: no new column. But a rep's screen holds only their own and unassigned activities (activities.mjs:95-109), so one deal can read differently for the rep and their manager. That is already true of today's health score (finding F1).

**Q5. The threshold.**
- **(a) Recommended: fixed.** The model starts at 20 teaching deals, and its share follows the plan's curve. No Admin threshold; Train now re-runs it.
- (b) An Admin-set threshold, like Lead scoring's "Min. decided leads to train" (which defaults to 150).

These design choices are made above unless Jeff says otherwise:
- one example per closed deal, measured on its last open day (R2);
- only deals with something known from before the close count (R2);
- a server-only settings key for the model (R3);
- 5-fold held-out accuracy (R1).

## 7. Found while reading (not filed; each for Jeff to decide)

- **F1. One deal's health score can read differently for its rep and for an Admin or Manager.**
  - The browser scores from the activities the screen holds: App.jsx:1327 filters the loaded list.
  - A rep's GET holds only their own and unassigned activities (activities.mjs:95-109).
  - So a manager's call logged on the rep's deal counts for the manager and not for the rep.
  - Recommended: Q4 (a) ends it. Low to medium.
- **F2. The lead model's reported accuracy is training accuracy, and its features are measured as of today.**
  - score-lead.mjs:192-197 computes the accuracy on the rows it trained on.
  - score-leads-batch.mjs:132 measures a decided lead's recency with `now`, so a lead decided a year ago is measured as if it were today.
  - The Lead scoring panel says "training accuracy" (LeadScoringDetail.jsx:250), so it does not mislead, but the number flatters the model.
  - Recommended: held-out accuracy and as-of-the-decision features, after 2A builds both. Low.
