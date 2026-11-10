# AI deal scoring — Jeff's answers (9 Nov 2026)

The plan: OPEN_ITEMS §3.1 ("AI deal scoring — the plan and its recommended implementation (7 Oct)") and its page, "Deal Scoring Roadmap" (https://claude.ai/artifact/78C6dQQPC6mLSJCrjREBoE). Shown to Jeff in the chat, each decision with its recommendation; he answered "1 recommended", "2 recommended", "3 recommended", "4 recommended".

| # | Decision | Answer |
|---|---|---|
| 1 | Where the number comes from | **The Recommended** — the learned model makes the number (per org, trained on that org's Closed Won and Closed Lost deals, blended with the rules by the org's closed-deal count), and Claude explains it from the model's strongest factors; Claude's own 0–100 judgment retires once an org has enough history. Batch 2. |
| 2 | "Available to" and the token budget | **The Recommended** — enforce "Available to" (a role check when scoring); remove the token budget until a per-org usage counter backs it. Batch 1. |
| 3 | A history of close-date changes | **The Recommended** — yes: a new deal column, additive and nullable (dev and prod share the database). Needed before batch 2 (the slip count). The migration's apply is put to Jeff when it is built. |
| 4 | Which models to offer | **The Recommended** — the current Haiku, Sonnet and Opus, each checked against what the workspace's key can call before it is listed. Batch 1. |

Next, per the plan: batch 1, the Admin's model choice (decisions 2 and 4) — designed from the code first.

## Batch 1's own questions (DESIGN.md §4, asked 9 Nov in the dialog, each standing on its own)

| Q | Asked | Answer |
|---|---|---|
| Q1 | Should "Available to" and the model choice also govern the report builder's "Ask AI"? | **"Roles both, model scoring (Recommended)"** — "Available to" covers deal scoring and Ask AI; the model choice covers deal scoring only, and the card says so; a member left out gets the built-in report reader |
| Q2 | What a stored model off the new list runs as | **"Default, Haiku 5.5 (Recommended)"** — the panel shows Haiku 5.5 selected until an Admin picks |
| Q3 | What "Available to" governs for a role it leaves out | **"Asking Claude only (Recommended)"** — no Score, Refresh or "Score all deals", the server refusing them, the cached score included; a score a deal already has still shows wherever the deal shows |
| Q4 | Which nearby fixes ride along (multi-select) | **All three:** "Name the cause (Recommended)", "Cut text at a word (Recommended)", "Remove mock AI controls (Recommended)" |
