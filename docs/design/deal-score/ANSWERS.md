# AI deal scoring, batch 2 — Jeff's answers (17 Nov 2026)

The design: DESIGN.md beside this file (OPEN_ITEMS §3.1, batch 2, "a deal score that learns"; the plan's decision 1 answered 9 Nov — docs/design/ai-scoring/ANSWERS.md: the learned model makes the number, Claude explains it). Shown to Jeff in the chat, each question with its recommendation; he answered "All recommended".

The fact the questions stood on (a SELECT-only census of the shared database, counts only, 17 Nov): no org has the 20 closed deals the model needs — the most is 17 (a demo org); UKG 0 won, 6 lost; Accelerep QA 3 won, 1 lost; no closed deal has a close-date history yet; four closed deals in all have an activity.

| Q | Asked | Answer |
|---|---|---|
| Q1 | Scope, while no org can train yet | **Two batches (Recommended)** — 2A: the number, the learner (idle until an org reaches 20 teaching deals) and the Settings standing; 2B: Claude explains the number |
| Q2 | What the number means | **The chance of winning, 0–100% (Recommended)** — it starts from the stage's funnel weight moved down by the health rules, later learned; rules and model measure the same thing, and it can be checked against what closed |
| Q3 | What happens to today's two numbers | **It takes the health score's place (Recommended)** — on every screen that shows the health score, behind the same "Deal scoring" switch, its factors replacing the reasons; Claude's AI score unchanged until 2B |
| Q4 | Where it is worked out | **On the server, kept on the deal (Recommended)** — a new nullable jsonb column, `opportunities.deal_score`, the server's alone, additive and nullable, applied to the test and app databases on Jeff's go when built; refreshed when the deal or an activity on it is saved, nightly and by Train now; every viewer sees the same number |
| Q5 | The threshold | **Fixed (Recommended)** — the model starts at 20 teaching deals, its share by the plan's curve; no Admin threshold; Train now re-runs it |

Also stand, unless Jeff says otherwise (DESIGN.md §6): one example per closed deal, measured on its last open day; only a closed deal with something known before its close teaches; the model in a server-only settings key; accuracy measured on deals held out (5-fold).

Next: batch 2A's code map (DESIGN.md §8), then the build.
