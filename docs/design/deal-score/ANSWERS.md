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

## Batch 2A's own questions (asked 17 Nov from the code map, each standing on its own; DESIGN.md §8)

| Q | Asked | Answer |
|---|---|---|
| Q6 | The "Deal scoring" switch does nothing (the screens ask an `isFeatureEnabled` the app never provides — PipelineTab.jsx:362-363 — so it answers on) | **"Make it work (Recommended)"** — off hides the deal score on every screen that shows it (Kanban, list, Pipeline, meeting prep, the CSV); the server keeps scoring; on by default |
| Q7 | Settings → Funnel stages saves `prob`, every reader reads `weight` (FunnelStagesDetail.jsx; all six orgs hold `weight`, none has saved the panel) | **"Fix it in 2A (Recommended)"** — the panel shows and saves `weight`; its fallback list the app's own stages; an edit moves the deal score's start from the next nightly pass or Train now |
| Q8 | What the screens call the number | **"Win chance" (Recommended)** — the list's column "Win %", the number "42%"; tooltips and meeting prep "Win chance 42% — At Risk for Proposal"; the bands Healthy / At Risk / Critical stay, read against the stage's usual |
| Q9 | The column's go: `opportunities.deal_score` (jsonb, nullable, no default) on the test and app databases | **"Yes, both now (Recommended)"** — db/apply-deal-score.mjs, `--test --apply`, then `--apply` on the app database (shared by dev and prod), each read back and verified |

Next: the build. **Built 17 Nov (state §0.256; guide §18b130); committed `3bf18c9`.**

## Batch 2B — Claude explains the number (DESIGN-2B.md §4; asked 17 Nov, each standing on its own)

| Q | Asked | Answer |
|---|---|---|
| Q1 | When Claude's own 0-100 AI score retires (decided 9 Nov: once an org has enough history; since 2A every deal also shows a win chance) | **"Now, every org (Recommended)"** — the deal window shows the win chance and Claude explains it (a headline, 3-5 signals tied to its factors, one next action); Claude's earlier scores stay stored, labelled as its own |
| Q2 | Which other readers of Claude's number move | **"Screens and reports (Recommended)"** — Kanban's ✦, the list's AI column and the CSV's AI Score go; reports gain "Win chance"; the score-drop alert and the public API in a batch 2C, designed then |
| Q3 | An explanation of a number that has since moved | **"Say so, Refresh asks (Recommended)"** — "Explained at 42% — now 50%"; Refresh asks again; no call to Claude by itself |
| Q4 | The Pipeline's "Score all deals" | **"Take it out (Recommended)"** — the server scores every deal; explanations asked deal by deal |

Next: the build.
