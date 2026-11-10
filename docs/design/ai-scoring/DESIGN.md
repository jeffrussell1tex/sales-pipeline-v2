<!-- AI deal scoring, batch 1 — the Admin's model choice (OPEN_ITEMS §1 item 2, §3.1): the design, 9 Nov 2026, over 194a1a7. Jeff's four plan decisions: ANSWERS.md beside this file. This batch's own questions: §4 below — answered 9 Nov, each the Recommended (Q4 all three; ANSWERS.md). Built 9 Nov (state §0.238; guide §18b121), its browser check PASSED as Karen and as an Admin; NOT committed; harness deferred. -->

# Design: the AI score uses the model the Admin chose, falls back once, names what it used, and is open only to the roles "Available to" names

## 1. What it is

OPEN_ITEMS §3.1, batch 1, with Jeff's answers to decisions 2 and 4 (9 Nov, each the Recommended):

- the AI score uses the Admin's model, from a list the server accepts, and retries once on the fallback when that model errors or is overloaded;
- each score keeps the model it used, and the audit log names it;
- "Available to" is enforced (a role check when scoring); the token budget comes out;
- the list offers the current Haiku, Sonnet and Opus, checked against what the key in use can call;
- the panel says what each choice costs in time and money.

It closes §0.188's found (a) for the model card (state §9). The residency and retention card and the report reader's model, which found (a) also names, are §4's Q1 and Q4.

## 2. The map (read in code over `194a1a7`, 9 Nov; a read-only map of six readers and a critic that re-read their load-bearing claims)

### 2.1 The scorer (`netlify/functions/ai-score.mjs`)

- **Gates, in order:**
  1. `requireWrite` (:56): Admin, Manager and User pass; ReadOnly, Technician and Dispatcher get 403.
  2. The deal is loaded by id and org (:66, a 404 otherwise).
  3. `assertOwnership` (:71).
  4. The key (:79-81, a 503 with no key).
  5. The switch `aiScoringEnabled` (:84-85, `{ disabled: true }` when off).
  6. The 24-hour cache (:88-94).

  tests/in-org-gates.test.mjs:212-224 pins this order and ai-score's two import lines, word for word.
- **The request** (:182-194): a raw fetch, `anthropic-version: 2023-06-01`, `x-api-key`. The body is `{ model: 'claude-haiku-4-5-20251001', max_tokens: 600, messages }` and nothing else: no thinking, no effort, no sampling parameters.
- **The reply** (:196-213):
  - Any non-OK status, whether 400, 401, 404, 429 or 529, becomes 502 "AI scoring service unavailable". The cause goes only to the console.
  - The text is read as `content[0].text`, and `stop_reason` is never read.
  - A reply that does not parse is a 500.
  - No retry, no fallback.
- **What is kept** (:216-239):
  - `opportunities.ai_score`, jsonb: `{ score, verdict, headline, signals, recommendation, scoredAt, history }`.
  - `history` holds four earlier scores, each rebuilt as exactly `{ score, verdict, scoredAt }` (src/utils/aiScore.js:18-20 `earlierOf`). A model on an earlier score would be dropped.
- **The audit row** (:242-245): `ai.deal_scored`, with the detail naming `claude-haiku-4-5` as a literal, whatever ran.
  - A failed call writes no row, though the deal's data was sent (guide §18b42 rule 1: a function that hands data to a model writes an audit row in the same request).
  - `audit_log` has no model column; `detail` is text (db/schema.ts:338-350).
- **The key** (`_aiKey.mjs:19-24`): the org's BYOK key, else the site key. A stored org key that fails to decrypt silently becomes the site key.

### 2.2 The panel and the stored settings (`src/Tabs/settings/data/FeaturesDetail.jsx`, `settings.mjs`)

- Model, Fallback, "Available to", "Daily token budget" and "On budget exceed" are fields of one settings key, `extra.aiSettings`.
  - That key is in the GET (:250), the PUT's `const extra` (:473) and `REV_KEYS` (settingsRevs.js:27). One token covers the blob.
  - Removing fields from it adds or removes no settings key.
  - The PUT stores the blob as sent, scrubbing only key material (`scrubAiSettings`, :54-61). Any model string is accepted.
- **The options** (:376-407):
  - Model: claude-sonnet-4-6, claude-opus-4-6, claude-haiku-4-5-20251001.
  - Fallback: haiku-4-5 or sonnet-4-6.
  - "Available to": the stored value is the option's label, `All roles` | `Admin + Manager only` | `Admin only`.
- **Rows nobody chose** (the critic): every Features save sends the whole `aiSettings` draft, and a workspace that never saved one opens on `AI_DEFAULTS` (:118-133, :145). Turning "Claude scores deals" on therefore also stored `model: 'claude-sonnet-4-6'` and a 25,000,000 budget, though no one picked them.
- **A second writer:** a backup restore (`backup.mjs` ownSettings, :394) writes a file's `aiSettings` as it is. A check only in the settings PUT does not cover it.
- **The card** says "Which model powers AI features and which roles can use them" (:376). "Claude reads report prompts" sits inside it (:417).
- **Mock controls with no reader:**
  - The panel's next card, "AI · Data Residency & Training" (region, zero retention, PII redaction, training opt-in, DPA date, audit logging, block list), is saved and read by nothing (state §9, §0.188 found (a); grep found no reader).
  - The "Reset AI training data?" dialog shows invented facts ("Claude Sonnet 4.5", "~84,200 prompts"; :49-53; OPEN_ITEMS §4.3).

### 2.3 Who asks for a score (the client)

- **The deal window's AI Score tab** (OpportunityModal.jsx:665-712):
  - It shows the server's `error` text in a red box, and the off notice for `{ disabled: true }`.
  - It never shows the model.
  - The pill, the rail's AI read and the Score buttons are gated on the switch alone (:884, :900, :1083, :1412).
- **The Pipeline's "Score all deals"** (PipelineTab.jsx:570-590, :898):
  - It is gated on the switch alone.
  - It asks one deal at a time and never reads `res.ok`, so a refusal counts as done, silently.
  - It keeps the raw answer, transport flags included, where the window uses `storedScore`.
- **Readers of a stored score, which ignore "Available to":** Kanban, the list, the forecast card, the CSV export, the report engine's metric, the hourly score-drop alert (pipeline-alerts.mjs:453) and the public API (public-api.mjs:186, score and verdict only).

### 2.4 The other Anthropic caller

`report-prompt.mjs`, the report builder's "Ask AI" (state §0.141):
- It uses its own model, `claude-opus-5` (`_reportPromptShape.mjs:9`, pinned by tests/report-prompt.test.mjs:318), at effort low with one strict tool, on the same key helper and the same API version.
- It has **no role check**: any member reaches it while its switch is on.
- It already does two things the scorer lacks:
  - it reads the reply block by its type (:106);
  - it treats `stop_reason: 'refusal'` as its own outcome (:107).
- It always answers 200, with `unavailable` and a reason, so the client falls back to its built-in reader.

### 2.5 The models (checked 9 Nov)

- **The models list.** Anthropic's models list, asked with the local `.env` site key (read-only, no cost), names claude-haiku-5-5, claude-sonnet-5-5 and claude-opus-5-5. It also names claude-fable-5-2, the 5.0 and 4.x models, and today's claude-haiku-4-5-20251001.
- **Not checked:**
  - A real request on each (part of the build, §5).
  - The dev and prod sites' Netlify keys, which may not be this one (OPEN_ITEMS §2.1 names one site key, "Accelerep Key2", on both).
  - Any org's BYOK key.
- **What changes on the 5.5 models** (Anthropic's migration guide, as bundled with Claude Code, 9 Nov). These **break the scorer as written**:
  - they think by default, so a reply can begin with a `thinking` block and `content[0].text` is empty (every score a 500);
  - thinking counts toward `max_tokens`, so 600 can stop the reply before the JSON;
  - Opus 5.5 cannot turn thinking off. The lever on all three is `output_config.effort`, which defaults to `medium` on Haiku and Opus 5.5 and to `high` on Sonnet 5.5;
  - all three can refuse (`stop_reason: 'refusal'`, HTTP 200).

  All three accept JSON outputs (`output_config.format`, a JSON schema), which guarantees a reply that parses, except after a refusal or `max_tokens`. API version 2023-06-01 stays; no sampling parameter is sent.
- **Price per million tokens** (input / output), from the same guide; the panel names no figure:
  - Haiku 5.5: $0.10 / $0.50
  - Sonnet 5.5: $2 / $10
  - Opus 5.5: $4 / $20
  - Haiku 4.5, which runs today: $1 / $5
- **Time.** No `[functions."ai-score"]` timeout is set in netlify.toml, so the platform's default applies; its value on this site is not read. A slow first attempt plus a retry must fit inside it (§3, R3).

## 3. The design (recommended)

**R1: one list, one reader (`src/utils/aiModels.js`, new, pure, shared by the panel, the settings PUT and the scorer).**
- `AI_MODELS`: the three, by id, each with its label and the panel's words on speed and cost:
  - `claude-haiku-5-5`, Haiku 5.5;
  - `claude-sonnet-5-5`, Sonnet 5.5;
  - `claude-opus-5-5`, Opus 5.5.
- **Defaults:**
  - Model: Haiku 5.5, the class that runs today, at a tenth of today's price.
  - Fallback: Sonnet 5.5, another model's capacity when Haiku is busy.
- `modelOf(stored)` and `fallbackOf(stored)`: a stored id on the list is that model; anything else is the default (Q2). The scorer reads only through these, so a restored row or a hand-made PUT can name nothing else.
- `aiRolesOf(availableTo)`: the allowlist.
  - `All roles` → Admin, Manager, User.
  - `Admin + Manager only` → Admin, Manager.
  - `Admin only` → Admin.
  - Absent → All roles, as the panel has always shown it, and as tests/integration/in-org.itest.mjs:403-408 expects.
  - Any other value → Admin only (fail closed, and the Admin can still fix it).
  - ReadOnly, Technician and Dispatcher never score: `requireWrite` refuses them first.

**R2: the panel (Settings → Features & AI → "AI · Model & access").**
- **The choices.**
  - Model and Fallback each offer the three, with the page's draft words on speed and cost (Deal Scoring Roadmap, batch 1) under the select. A stored id off the list shows as what runs (Q2).
  - The Fallback may be the Model ("tries the same model once more").
- **The live check.** As the panel opens, it asks a new Admin-only GET, `ai-models.mjs`, which models the key in use can call: the org's BYOK key, else the site key, through `resolveAnthropicKey`, asking Anthropic's models list, free.
  - A model the key cannot call is shown unavailable and cannot be picked.
  - Nothing is cached across orgs or keys: the answer is this org's key's, at this moment.
  - The key never leaves the server; the answer is ids only.
- **Removed** (decision 2; guide §18b64.5: "Nothing is deleted to clean up"; the next save leaves the old fields as stored):
  - "Daily token budget" and "On budget exceed".
  - `AI_DEFAULTS`' `tokenBudget` and `budgetExceed`.
- **"Available to"** keeps its three options. A line under it says what it governs (Q1, Q3).
- **The scoring switch's words** name the chosen model.
- **The settings PUT** refuses a save that names, anew, a model, fallback or "Available to" value off the list: 400, nothing written, naming the field. A value the row already holds is never asked again (the house rule for held links, `checkLinks`). The existing round-trip tests of model-less blobs stand.

**R3: the scorer.**
- **Who.** After `assertOwnership` and before the key, a role check: `aiRolesOf(aiSettings.availableTo)` must hold the caller's role, else 403 "AI scoring is open to <who> in this workspace". The cached score is refused too (Q3). The pinned import lines stay as they are: the helper comes from src/utils, which the itests' auth mock does not cover.
- **The request**, per attempt:
  - `model`;
  - `max_tokens: 4000` (room for thinking plus the JSON);
  - `output_config: { effort: 'low', format: { type: 'json_schema', schema } }`, where the schema is the score's fields, the verdict and sentiment as enums;
  - the same prompt, the same key for both attempts.

  The reply is read from its first `text` block, by type.
- **Once more, on the fallback** when the first attempt:
  - fails to connect or runs out of its time;
  - answers 404 (this key cannot call the model), 429, 5xx or 529 (overloaded);
  - refuses;
  - stops at `max_tokens`;
  - or answers JSON that does not read.

  There is no retry on 400 (the request itself), 401 or 403 (the key): the second attempt would fail the same way.
- **Time.** Each attempt has its own time limit, sized in the build from the real requests (§5), so both attempts fit the function's limit. A timeout reads as busy.
- **The answer when both fail** (or the first fails where nothing is retried): 502, with the cause in words the tab shows:
  - "The AI key was refused — an Admin can check it in Settings → Features & AI";
  - "Claude is busy — try again in a minute";
  - "This workspace's key can't use <model>";
  - "Claude declined to score this deal";
  - "Claude's answer couldn't be read".

  Anthropic's error type and message go to the audit row, never the key (OPEN_ITEMS §4.2's "refusal says nothing of why", folded in — Q4).
- **What is kept.**
  - The score keeps `model`, the id that answered.
  - History entries keep it too (`earlierOf` carries `model` when present). Older entries without it show as they did.
- **The audit row: one per request, success or failure.**
  - `ai.deal_scored`, whose detail is `<model> · <key> · score N (verdict)`, plus `· after <first model>: <cause>` when it fell back.
  - `ai.deal_score_failed` when no score came back, naming each attempt's model and cause.
- **The 24-hour cache** is unchanged: a score made by the earlier model stays until refreshed, and its tab says which model made it.

**R4: the client.**
- **The AI Score tab:**
  - it shows "Scored by Haiku 5.5" beside the date;
  - it shows the server's cause words in its red box, as today;
  - for a role "Available to" leaves out, the pill, the rail's "Score this deal" and Refresh are not offered. A score the deal already has still shows (Q3).
- **"Score all deals":**
  - it is not offered to a role "Available to" leaves out;
  - it keeps each answer through `storedScore`;
  - when it ends, it says how many deals were scored and how many were not, with the first cause (today it counts a refusal as done).
- **The report builder's "Ask AI"** follows Q1.

## 4. Questions for Jeff

- **Q1: The report builder's "Ask AI"** (report-prompt.mjs; it uses its own model, Opus 5, and has no role check).
  - (a) **Recommended.** "Available to" covers both AI features. The Model and Fallback choice covers deal scoring only, and the card says so. Report prompts keep their model, which is tested at effort low with a strict tool; a member left out gets the built-in reader, as when the switch is off.
  - (b) Both settings cover both features.
  - (c) Both cover deal scoring only; report prompts stay open to every member.
- **Q2: A stored model that is not on the new list.** This covers every org that turned scoring on, whose panel stored claude-sonnet-4-6 without anyone choosing it, and any restored row.
  - (a) **Recommended.** It runs as the default, Haiku 5.5: the same class as today, and a tenth of today's price. The panel shows Haiku 5.5 selected until an Admin picks.
  - (b) Each old id runs as its 5.5 sibling, so Sonnet 4.6 becomes Sonnet 5.5. This moves orgs that never chose onto Sonnet, about 20 times Haiku 5.5's price.
- **Q3: What "Available to" governs.**
  - (a) **Recommended.** Asking Claude: the Score and Refresh buttons, "Score all deals", and the scorer itself, including the 24-hour cached answer. A score a deal already has stays wherever the deal shows (Kanban, list, reports, alerts, the public API), like any other field of the deal.
  - (b) Also hide stored scores from roles left out, on every screen, report, alert and export.
- **Q4: While there** (pick any).
  - (a) **Recommended.** Name the cause when Claude can't score: OPEN_ITEMS §4.2's "refusal says nothing of why". The retry must sort the causes anyway.
  - (b) **Recommended.** Cut the score's text at a word, not mid-word (§4.2's "text is cut mid-sentence"): the caps stay, and a cut ends at the last whole word.
  - (c) **Recommended.** Take out the panel's mock AI controls: the "Data Residency & Training" card, which saves zero retention, PII redaction and region and enforces none of them, and the "Reset AI training data?" dialog's invented facts. Guide §18b64.1: "A security control does what it says, or it is not there"; the stored values stay as stored.

## 5. Tests and checks (planned)

- **Unit:**
  - tests/ai-models.test.mjs (new):
    - the list, `modelOf` and `fallbackOf`: an id on the list, an old id, junk, absent;
    - `aiRolesOf`: each label, absent, unknown fail-closed;
    - the PUT's refusal rule;
    - THE GUARD: no model id is written in netlify/functions or src outside `aiModels.js`, report-prompt's own constant named with its reason.
  - The scorer's request and reply rules, as pure helpers run in the suite: the body built, the reply read by type, the retry rule over every status and stop reason, the cause words.
  - The pins that move:
    - in-org-gates (the role check's place);
    - ai-score.test (history keeps the model);
    - audit-coverage (the new action);
    - settings-saves S10 (the save handler's scope);
    - deal-engagement (the prompt lines, unchanged).
- **Integration:**
  - tests/integration/ai-score.itest.mjs, stub modes: a status per call, a thinking block first, a refusal, `max_tokens`. Each asserts:
    - the model asked;
    - the fallback after a 529, a 404 and a refusal;
    - none after a 400 or 401;
    - the model kept on the score and in history;
    - one audit row each way.
  - Roles under each "Available to", the cached score included, and org B untouched.
  - The settings PUT's refusal of a new off-list value, a held one kept.
  - ai-models.mjs: Admin only, ids only, the org's own key.
- **Real requests, before the browser check:**
  - What: one scoring request on each of the three models with the site key, from a script in the scratchpad (guide: "check a key with one minimal request").
  - Cost: about a cent in all.
  - What they settle: the reply's shape (a thinking block first, the JSON valid), the time each takes at effort low, which sizes R3's limits, and the tokens used.
  - Not possible in the local pane: `netlify dev` swaps the site key for the AI Gateway token (OPEN_ITEMS §6).
- **Harness (deferred):**
  - Twelve entries anchor ai-score.mjs, six FeaturesDetail.jsx, two settings.mjs's AI lines, five aiScore.js and seventeen settingsRevs.js. The stale check comes first.
  - The batch's own entries are proven by hand.
- **Browser check as Karen** (`User`), in Accelerep QA, local:
  - with "Available to" at Admin + Manager only (a TEST change in QA, put back after), she is offered no Score, Refresh or "Score all deals", and her deal's stored score still shows;
  - at All roles, she is offered them;
  - an Admin sees the three models, each marked by what the key can call, and no budget fields.

  The score itself is checked on dev after the push, where the site key answers.
