<!-- AI deal scoring, batch 2C — the score-drop alert and the public API move to the win chance (OPEN_ITEMS §3.1; Jeff, 17 Nov: "Design 2C next"). The design, 17 Nov 2026, over d4638da (§0.257). Its questions (§4) answered 17 Nov, each the Recommended (ANSWERS.md, "Batch 2C"). -->

# Design: the score-drop alert and the public API read the win chance

## 1. What it is

Batch 2B (§0.257) retired Claude's own 0–100 score; the deal's number is its win chance (§0.256). Two readers still read Claude's number, left for this batch by Jeff's Q2 ("the score-drop alert and the public API in a batch 2C").

## 2. What stands today (read in code over d4638da)

- **The hourly score-drop alert** (pipeline-alerts.mjs, "Signal 5"). It fires when `opp.aiScore.score < 40`, once a week per deal (`DEDUP_DAYS = 7`, by the recommendation log). Each time it:
  - emails the rep "⚠️ AI Score Alert: … scored N/100";
  - logs `scoreDrop`;
  - posts to Slack (`slackTemplates.scoreDrop`, "AI score dropped to N/100");
  - fires the automation `opportunity.score_drop` ("AI score dropped below 40", fields `score` and `verdict`);
  - below 25, emails the manager (`managerDealAlert`, `alertType: 'score-critical'`).

  Since 2B an explained deal keeps no number of Claude's, so the alert fires only on deals that still keep an old score, and never on one explained since.
- **It is a level, not a drop.** "Below 40" fires every week for as long as the deal stays there.
- **Found while reading:**
  - The member's profile panel lists no toggle for it (AppHeader.jsx `ALERT_LABELS`), so it is on for every rep, with no way off. The server's default is `scoreDropAlert: { enabled: true }`.
  - The manager email's labels lack `score-critical`, so its subject reads "Pipeline alert: score-critical — …" (send-email.mjs:631).
- **The overlap.** Today the win chance is the health rules on the stage's weight (no org has a model). A deal falls to Critical mostly for silence, a long stay in its stage or a passed close date, and the stale, stuck and lapsed alerts already send each of those.
- **The count** (a SELECT, 17 Nov): 8 of QA's 21 open deals read Critical; the other orgs' deals are scored at their first save or pass.
- **The public API** (public-api.mjs:188) hands `ai_score: { score, verdict }`: Claude's stored own score, else null (§0.257). It has no win chance. No API key is known in use (no customers yet).

## 3. The design (recommended)

- **R1. The alert fires on a fall into Critical, not on a level** (Q1).
  - The server notes a band change when it writes a score (`_dealScore.mjs`): `previousStatus` and `statusChangedAt`, kept on `dealScore` when the band moves.
  - These fields are not part of "the same score" (`sameDealScore` leaves them out, as it leaves out `scoredAt`).
  - The hourly pass alerts a deal whose band went from Healthy or At Risk to Critical since the pass before, once a week at most. Deals already Critical when this ships are not mailed.
  - The manager is copied when the win chance is below a quarter of its stage's weight.
- **R2. The words.**
  - Email: "Win chance fell to Critical: <deal> — 12% (the stage's usual is 60%)".
  - Slack: "*<deal>* win chance fell to 12% — Critical for Proposal".
  - Report label and the manager email: "Win chance critical" (and the subject's missing label fixed).
  - The automation trigger keeps its key (`opportunity.score_drop`, so saved automations keep working) with the label "Win chance fell to Critical". Its fields keep their keys: `score` is now the win chance and `verdict` the band, relabelled.
  - The log keeps `scoreDrop` as its key.
- **R3. A rep can turn it off** (Q3): "Win chance fell to Critical" in the profile panel's alerts, on by default as now.
- **R4. The public API** (Q2): a new field, `win_chance: { score, status, stage_weight, scored_at }`, null for a closed or unscored deal. `ai_score` stays as it is (Claude's stored own score, else null), marked as the older field.

## 4. Questions for Jeff

- **Q1. What fires the alert.**
  - (a) **Recommended: a fall into Critical.** It fires when the band moves from Healthy or At Risk to Critical since the last hourly pass, at most once a week per deal. A deal that was already Critical gets no mail for it, and the rep is not mailed weekly for the same silence the stale alert already sent.
  - (b) A level: every Critical deal, once a week, as "below 40" did. In QA today that is 8 deals a week, mostly the same causes as the stale and stuck alerts.
  - (c) Retire the alert until an org's model has a share. The rules' causes already alert on their own.
- **Q2. The public API.**
  - (a) **Recommended:** add `win_chance` and keep `ai_score` as it is. Additive, nothing an outside caller reads changes meaning.
  - (b) Put the win chance into `ai_score` (the same key, a new meaning). It is silent for callers, and a 12 there means a probability, no longer a health score.
  - (c) Add `win_chance` and remove `ai_score`.
- **Q3. A rep's own switch for it.**
  - (a) **Recommended:** add "Win chance fell to Critical" to the profile panel's alerts, on by default.
  - (b) Leave it as it is: always on, with only the org's Slack switch.

## 5. Tests and checks (planned)

- Unit tests:
  - the band change kept (`previousStatus`, `statusChangedAt`) and left out of "the same score";
  - the fall rule: Healthy or At Risk to Critical fires; Critical to Critical does not; an alert once a week;
  - the words;
  - the API's `win_chance` shape.
- Integration (the hourly pass, in its own org namespace):
  - a deal that falls is alerted once (the email stubbed, the log row, the automation);
  - a deal already Critical is not;
  - org B's deals untouched.
- Browser check as Karen: the profile panel's new switch. The alert itself runs on prod's hourly pass only (JOBS_ENABLED), so it is checked by the integration test, and on prod after the ship by its log row.
- Harness deferred.
