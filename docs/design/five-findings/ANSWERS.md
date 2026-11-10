# Five findings — Jeff's answers (10 Nov 2026)

The design: DESIGN.md beside this file (over 8d0a055). Asked 10 Nov in the dialog, each question standing on its own; the rest of each finding takes the design's recommendation.

| # | Asked | Answer |
|---|---|---|
| 1 | A blank AI recommendation: when the fallback is blank too, or no time is left | **"Keep score, no action (Recommended)"** — the score, verdict and signals kept; the "Recommended next action" heading not shown |
| 2 | How a link refusal shows | **"⚠ until closed (Recommended)"** — as an error, kept until closed; a failed read says it couldn't be read, apart from a refusal |
| 3 | Should a rep stop getting stage and closed emails about their own moves | **"Skip own moves (Recommended)"** — as the new-deal and note emails already do; the emails name the member, never a Clerk id |
| 4 | The day counts' scope | **"App now, file server (Recommended)"** — one helper for every count a member sees; the server's (UTC) counts filed |
| 5 | Who owns a deal's created date | **"Server-owned (Recommended)"** — set once at create, the creator's day; no save changes it; QA's one undated deal filled from its `created_at` day |
