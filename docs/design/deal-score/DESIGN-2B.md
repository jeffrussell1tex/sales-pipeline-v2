<!-- AI deal scoring, batch 2B — Claude explains the number (OPEN_ITEMS §3.1; Jeff, 17 Nov: "lets keep working"). The design, 17 Nov 2026, over 3bf18c9 (§0.256, batch 2A). Its questions (§4) answered 17 Nov, each the Recommended (ANSWERS.md, "Batch 2B"). -->

# Design: Claude explains the deal's win chance

## 1. What it is

The plan's decision 1 (Jeff, 9 Nov, docs/design/ai-scoring/ANSWERS.md): **the learned model makes the number, and Claude explains it from the model's strongest factors; Claude's own 0–100 judgment retires once an org has enough history.** Batch 2A (§0.256) built the number: every open deal's win chance, kept on the deal by the server, the same for every member. 2B is the words.

## 2. What stands today (read in code over 3bf18c9)

- **Two numbers on one deal, on different scales.**
  - The win chance (2A) is a probability: Qualification's best is 10%.
  - Claude's AI score (ai-score.mjs) is a 0–100 health judgment, with verdicts Strong, On Track, At Risk and Critical.
  - Both show side by side: the list's "AI" and "Win %" columns, and Kanban's ✦ number and dot.
- **Claude's number is read by:**
  - the deal window's AI read and AI Score tab (OpportunityModal.jsx: the big number, verdict, signals, next action and four earlier scores);
  - Kanban's ✦ number and the list's AI column (marked at risk below 50);
  - the Pipeline CSV's "AI Score";
  - the report engine's "AI score" metric (reportQuery.js:92; reportPrompt.js:176 maps "health score" and "deal health" to it);
  - the hourly score-drop alert (pipeline-alerts.mjs:452: below 40 emails the rep, Slack and automations `opportunity.score_drop` — "AI score dropped below 40"; below 25 the manager);
  - the public API's `ai_score` (public-api.mjs:186).
- **Who has Claude scores** (a SELECT, 17 Nov): 27 deals in the demo org, 3 in QA and 1 in UKG.
- **"Score all deals"** (PipelineTab.jsx:575) asks Claude once per deal.

## 3. The design (recommended)

- **R1. Claude explains the win chance; it no longer sets a number.**
  - The prompt gets the deal as today, plus its win chance: the number, its band against the stage's weight, the rules part, the learned part and its share, and every factor with its effect in points.
  - Claude is told the number is fixed, and asked for three things, in a schema with no score:
    - a headline, saying why the deal stands where it does;
    - three to five signals, each tied to a factor, in plain words naming this deal's people and dates, each positive, warning or negative;
    - one next action that would move the factor costing the most.
  - The same model choice, fallback, "Available to", audit rows, causes and 24-hour cache as batch 1. The kept answer is `aiScore` with `explains: { score, scoredAt }`, the win chance it explained.
- **R2. The AI read and the AI tab** show the win chance (the server's number, its band) with Claude's words under it.
  - When the deal's win chance has moved since it was explained, the tab says "Explained at 42% — now 50%", and Refresh asks again.
  - Earlier Claude scores stay stored and still show under "Earlier AI scores", labelled as Claude's own (Q1).
- **R3. One number on the lists.** Kanban's ✦ and the list's "AI" column go; "Win %" is the number (Q2).
- **R4. Reports.** A "Win chance" metric reading `dealScore`. "AI score" stays for the stored scores, and "health score" in a question maps to the win chance (Q2).
- **R5. "Score all deals"** goes (Q4). The server scores every deal free; an explanation is asked deal by deal, when a member wants one.

## 4. Questions for Jeff

- **Q1. When Claude's own number retires.**
  - (a) **Recommended: now, for every org.** The AI read shows the win chance and Claude explains it. With 2A every deal has the win chance; two numbers on two scales on one screen (Qualification's healthy 10% beside Claude's 70) reads as a contradiction. The rules part is consistent, free and the same for every member.
  - (b) As decided 9 Nov: Claude keeps its own 0–100 until the org's model has a share, then explains the win chance. No org has a share today, so every org keeps two numbers for now.
- **Q2. The other places that read Claude's number.**
  - (a) **Recommended: in 2B, the screens and reports.**
    - Kanban's ✦, the list's "AI" column and the CSV's "AI Score" leave.
    - Reports gain "Win chance", and "health score" maps to it.
    - The score-drop alert and the public API move in a batch 2C, designed then: an alert on a probability needs a band, not a fixed 40, and the API's shape is for outside callers.
  - (b) All of it in 2B, the alert and API included.
  - (c) Leave every reader on Claude's number.
- **Q3. An explanation of a number that has since moved.**
  - (a) **Recommended:** keep the explanation, say "Explained at 42% — now 50%", and Refresh asks again. No call to Claude is made by itself, so there is no cost a member did not ask for.
  - (b) Ask Claude again automatically when the tab opens on a moved number.
- **Q4. "Score all deals."**
  - (a) **Recommended: take it out.** The server scores every deal; explanations are asked deal by deal.
  - (b) Keep it as "Explain all deals", a call to Claude per deal.

## 5. Tests and checks (planned)

- Unit tests:
  - the prompt carries the win chance and its factors, and the schema has no score;
  - the kept answer names the number it explained;
  - the moved-number words;
  - THE GUARD: no screen reads `aiScore.score` as the deal's number once retired (Q1).
- Integration: an explanation asked for org A's deal reads A's win chance; a role "Available to" leaves out is refused; org B is untouched.
- Real requests: one explanation on each of the three models with the site key, from the scratchpad, about a cent. This checks the reply's shape and that the words cite the factors.
- Browser check as Karen and an Admin.
- Harness deferred.
