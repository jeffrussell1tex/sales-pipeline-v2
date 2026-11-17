<!-- AI deal scoring, batch 3 — next-step suggestions from past wins (OPEN_ITEMS §3.1; Jeff, 17 Nov: "Design batch 3"). The design, 17 Nov 2026, over cac7049 (§0.258). Its questions (§4) answered 17 Nov, each the Recommended (ANSWERS.md, "Batch 3"). -->

# Design: next-step suggestions from past wins

## 1. What the plan says

OPEN_ITEMS §3.1, batch 3 (the Deal Scoring Roadmap, 7 Oct), built on batch 2:

- Compare an open deal with the org's won deals at the same stage, and find where it falls furthest short.
- Find activity patterns that came before wins — a demo, then a proposal within a week.
- Claude writes a plain suggestion naming this deal's people and dates.
- Log each suggestion shown, acted on or dismissed, and whether the deal moved. The recommendation log already does this for alerts.
- Rank by what preceded progress, and say it is correlation, not cause.
- Show it in the deal window's AI read, on Home and in meeting prep.

## 2. What stands today (read over cac7049; a SELECT, 17 Nov)

- **The wins to learn from are not there yet.**
  - The demo org has 10 won deals; none has more than one stage entry, and none has an activity.
  - Accelerep QA has 3 won deals: none with a stage path, two with one activity each.
  - UKG has no won deal.

  So no org has a won deal with a stage path to compare a pace against, or a run of activities to find a pattern in. The comparisons and patterns batch 3 rests on would find nothing anywhere today, and could be tested only on made-up data.
- **What already exists:**
  - Batch 2B's explanation already ends in one next action, tied to the factor costing the deal the most (§0.257).
  - The recommendation log (recommendation-log.mjs) keeps each alert and judges later whether the deal moved — a stale deal by a new activity, a stuck deal by a stage change. It shows the results in Reports (resolve rate, days to resolve).
  - Home's "Worth your attention" cards are worked out in the browser (HomeTab.jsx: stalled, missing stakeholder, velocity win).
- **Found while reading:** Home's "Velocity win" card says "Faster than your avg (14d)". The 14 is fixed in the code, not anyone's average (HomeTab.jsx:529).

## 3. The design (recommended: a first part now, the comparisons when there are wins)

- **R1. Start the evidence now: log Claude's next action and whether the deal moved.**
  - When Claude gives a next action (ai-score.mjs, once per explanation it makes — never a cached one), it is logged as a recommendation-log row of a new type `next_step`, carrying the deal, its stage, the action's words and the win chance at the time. (The design said "when a member views"; Jeff's Q1 answer, "each next action Claude gives", settles it on the server.)
  - The log judges it as it judges a stale deal's alert: **acted on** when an activity is logged on the deal, or its stage moves, within 14 days; **ignored** after 14 days with neither.
  - Reports' recommendation view counts next steps beside the alerts.
- **R2. Show the next action where the rep is about to act:** meeting prep (Q3).
- **R3. The comparisons and patterns wait for wins.**
  - When an org has 10 won deals with a stage path or activities before the close, the comparisons go into Claude's explanation as facts ("your won deals in Proposal had two people engaged; this one has one"), ranked by what the next-step log has seen precede progress.
  - Settings → Deal scoring says how many won deals with a history the org has toward that.

## 4. Questions for Jeff

- **Q1. What to build now.**
  - (a) **Recommended: the first part only** (R1, R2, R3's count in Settings). Log Claude's next actions and whether the deal moved, so the evidence batch 3 ranks by starts building now; the comparisons wait until an org has 10 won deals with history. No org has one such won deal today.
  - (b) All of batch 3 now: the comparisons and pattern-finding built, idle until an org has the wins, and tested on made-up deals only.
  - (c) Nothing yet: ship batch 2 first (the harness run, the dev check, prod), and come back to batch 3.
- **Q2. What counts as acting on a next step.**
  - (a) **Recommended: what happens on the deal** — an activity logged or a stage moved within 14 days, read by the log as it reads the alerts. Nothing for the rep to press.
  - (b) Done and Dismiss buttons under the next action, as well as the automatic check.
- **Q3. Where the next action shows.**
  - (a) **Recommended: the deal window (as now) and meeting prep**, where the rep is about to talk to the customer. Home waits for the comparisons.
  - (b) The deal window, meeting prep and Home's "Worth your attention".
  - (c) The deal window only.
- **Q4. Home's "Velocity win" claims an average it never measured** ("Faster than your avg (14d)").
  - (a) **Recommended: fix it in this batch** — say what is true ("moved two stages in N days") with no average, or measure the org's own pace.
  - (b) File it.

## 5. Tests and checks (planned)

- Unit tests:
  - the next step's log row, once per explanation;
  - the resolution rule (an activity or stage move within 14 days; ignored after);
  - Settings' count of won deals with history.
- Integration:
  - viewing an explanation logs one row in its org, and a second view logs none;
  - the resolution check marks it acted on after an activity;
  - org B is untouched.
- Browser check as Karen: meeting prep's next action; Reports' next-step counts.
- Harness deferred.
