# OPEN_ITEMS.md — the one list of what is still to do

Every open item in AcceleRep lives here and nowhere else: bugs found and not
fixed, decisions waiting on Jeff, planned features, checks owed. Started
7 Oct 2026 (Jeff: "can you make one central master open items/to-do list. It
is not smart to try and manage multiple lists across multiple conversations").
CLAUDE.md's session start names this file; guide §22 holds its rules.

**How it works**

1. **Added when found.** A batch's "found, not changed" items are written here
   in the batch's own commit. The state doc's entry may name them, but this
   file is the list.
2. **Removed when done**, in the commit that closes the item. The state doc's
   batch entry records the work. This file holds only what is open.
3. **Each item says** what it is, what it waits on, the recommendation where
   one is recorded, and where it came from. **§** means
   `docs/ACCELEREP_CURRENT_STATE.md`. The date is when the item was recorded,
   or "re-read" when it was last checked against the code.
4. **"As recorded"** means not re-read since it was written. Read the code
   before acting on it (guide §22: verify the repo, not the doc).
5. **State §9 ("On the Horizon") is frozen history** as of 7 Oct 2026. This
   list was built from §9 and the handoff's §5. Items found already closed
   while building it are named in §9's freeze note.

**Sections:** 1. Next up · 2. Waiting on Jeff · 3. Plans · 4. Found, not
fixed · 5. Design questions · 6. Tooling and housekeeping

---

## 1. Next up — Claude's recommended order (Jeff sets it)

1. **Small security closes** (§4.6):
   - the audit log's allowlist for client events;
   - role scoping on the recommendation log's GET;
   - the Leads tab's `canEdit`.
2. **Per-contact engagement on `contactIds`** (§4.2). These counts are wrong
   everywhere, and they are an input to AI scoring's next batch.
3. **AI scoring batch 1, the model choice** (§3.1), once Jeff has made the
   four decisions.
4. **Escape in the tabs** (§4.1): the in-tab layers join the order, as every
   app layer did in §0.189.
5. **Deal data** (§4.2):
   - the deal endpoint saving `accountId`;
   - notes appended on the server;
   - an Undo keeping the row's owner.
6. **Email links** (§4.5): the `?deal=` reader, and the footer's preferences
   link.

---

## 2. Waiting on Jeff

### 2.1 Checks and setup only Jeff can do

- **The Anthropic keys: what is left** (Jeff, 8 Oct: "add updating the
  anthropic keys to the to-do list"). The keys work on the dev site since
  8 Oct; the workspace rule is in the guide's secrets rules.
  - **Resolved, 8 Oct:** `ANTHROPIC_API_KEY` on both sites (dev "accelerep",
    prod "sales-pipeline-v2") is "Accelerep Key2": linked to the service
    account `accelerep-server`, scoped to the Default workspace, no expiry,
    created by Jeff on 8 Oct, the account's only key (Jeff's Console
    screenshot, 8 Oct). Its `.env` copy (Jeff: "new key added to env and
    netlify") resolved to workspace `wrkspc_01R7so…` and answered 200 on
    both models. The keys before it were refused:
    the old site key with 401 (15 Sep); a personal key with 400, its words
    never read (deleted 8 Oct); and an unscoped key, made after the
    service-account dialog (its account not read), with 400, whose words,
    read by one minimal request
    with the key from `.env`, were "This API key is not scoped to a
    workspace, so this request must include the anthropic-workspace-id
    header…". Our calls send no such header.
  - **Proved on the dev site** (deploy `6ac80d25…` on `5458da1`, published
    21:38:35 UTC, every function rebuilt), in Accelerep QA: the report
    reader read "Open deals by stage" (`readBy: "claude"`, `claude-opus-5`,
    the site key), and an AI score of "Ironwood Manufacturing — Safety
    Compliance Module" answered 200 (28, Critical, 21:41:10 UTC), kept on
    that QA deal. "Claude reads report prompts" switched off again; "Claude
    scores deals" left on, as Jeff asked.
  - **The unscoped key is deleted** (Jeff, 8 Oct: "i deleted the extra claude key").
  - **Left (Jeff):**
    - prod (shipped 9 Oct, deploy `6ac8541b…`, the new key in its
      environment) has run no AI call yet: one AI score there proves its key;
    - whether the Accelerep Test org's own key (BYOK, Settings → Features &
      AI, installed 15 Sep) still works: not checked. A key an org brings
      must be scoped to a workspace too.
  - Source: §0.141; handoff §5 (16 Sep); 8 Oct.
- **QuickBooks setup, before the export can be built (§3.2).**
  - In the Intuit developer portal: an app with two redirect URIs, and a
    sandbox company:
    - `https://accelerep.netlify.app/.netlify/functions/quickbooks-oauth-callback`
    - the same path on `https://salespipelinetracker.com`
  - On BOTH Netlify sites: the app's Client ID and Secret as environment
    variables (suggested: `INTUIT_CLIENT_ID` / `INTUIT_CLIENT_SECRET`).
  - Then tell Claude the variable **names**, never the values.
  - Source: §0.149; handoff §5 (16 Sep).
- **Netlify variable hygiene** (3 Oct, from Jeff's screenshots):
  - (a) On the dev project these are not marked secret: `CLERK_SECRET_KEY`,
    `DATABASE_URL`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`,
    `INTERNAL_API_SECRET`, `SETTINGS_ENCRYPTION_KEY`, and the empty
    `MICROSOFT_CLIENT_SECRET`. Prod's flags were not seen.
  - (b) No code reads `GOOGLE_REFRESH_TOKEN`. Delete it from both projects.
  - Source: §9.
- **Twilio SMS.** It works with no code change the day a site has three
  things: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_FROM_NUMBER`,
  and an A2P campaign that reads Approved (Twilio: Trust Hub → Registrations →
  A2P 10DLC Campaigns; the brand is already Approved; 972-526-0638).
  - Until then each text attempt is recorded on the job as "SMS not
    configured on this site".
  - Source: §9; handoff (10 Sep). As recorded.
- **Karen's 8:00 AM task emails do not add up.**
  - They were sent near 08:00 UTC, though her rows ask for 08:00 Chicago
    (13:00 UTC).
  - Next read: one email's own headers (Date / Received), or Resend's log.
  - Source: §0.158 (2 Oct), as recorded.
- **Prod's Jobs tile.** Settings → Jobs → Report delivery "ok" has not been
  observed on prod; the delivery itself is proven. Handoff §5 (16 Sep).

### 2.2 Around the next ship to prod

- **Now that prod has shipped (the twenty-ninth ship, 9 Oct): clear prod
  Clerk's leftover user-level roles.**
  - Run `scripts/clear-clerk-roles.mjs --apply --live` with Jeff's key.
  - Prod's roles are its roster rows since the ship (§0.163), accepted as
    read before it (Jeff: "yes, accept the rows and ship"): the first org
    Jeff Admin, Travis Shipley Manager, four Sales Reps (one a second
    "Jeff Russell" row); the second org Jeff Admin. Dev was cleared on 4 Oct.
  - Source: §0.164.
- **The ship closed two items:** prod's "Sync from Clerk" no longer writes
  `'User'` over a role it does not know (§0.153), and prod's AI Score tab
  asks with the deal's id (§0.188).

### 2.3 Before selling

- **Clerk's membership cap.**
  - Production's default limit has not been read; only the dev key is on
    this machine. At 5, a customer's sixth invite fails.
  - The Seat usage card says 50 seats. Clerk allows up to 20 without the B2B
    add-on, unlimited with it ($100/mo).
  - A pricing decision. Source: §0.153.
- **Clerk Production instance migration** (on hold: a dedicated block, not a
  mid-session task).
  - Both sites run the Development instance's keys.
  - A Production instance means new org ids. Every org-scoped row is orphaned
    unless an `org_id` sweep is planned before the cutover.
  - Jeff, 30 Sep: "there are no live users". Whether any existing data is
    kept, or the start is clean, is his to confirm.
  - Second question: should dev and prod keep sharing one Neon branch?
  - Source: §9, as recorded.
- **New customer onboarding flow; billing integration.** §9, as recorded.

### 2.4 Decisions

- **AI scoring's four decisions:** see §3.1.
- **QuickLog's "📅 Add to Google Calendar"** promises an event and makes
  none. Wire it to `fireActivityCalendarEvent`, or remove the box.
  §0.169 (f).
- **Field-level security, made real:** design questions before any code.
  See §3.3.
- **"Send to customer"** marks a quote Sent and emails nothing. Decided: a
  later feature. Wiring `quote-email.mjs` needs the Resend setup checked on
  each site. §0.155.
- **Schema changes, each additive and nullable, both databases, Jeff's go:**
  - an owner id on `spiff_claims` (§0.169 (d));
  - `org_id` in `document_links_unique_idx` (§0.166 (2));
  - a close-date history column on deals (§3.1).
- **Data changes, by Jeff's hand:**
  - The job editor's jsonb lists are stored as strings. The app reads them as
    arrays; SQL over the column does not. Rewrite the stored strings.
    §0.169 (a), corrected 5 Oct.
  - Any legacy `dispatch_jobs.priority` values. A read-only
    `SELECT DISTINCT priority` comes first. §0.109.
  - The legacy `job_heartbeats` DROP, both databases. Handoff, carried since
    the eleventh session.
  - The Accelerep Test org's 32 unowned demo deals: keep or clear. §0.151.
- **The signal migration: ON HOLD.**
  - Jeff, 14 Sep: "leave things as are for now. I am not sure that is the
    direction I want to go". Build nothing from it unless he resumes.
  - If he does, the five questions in `docs/design/SPINE_COLLISION.md` §7 come
    first, then `docs/design/color-audit.md` §7.
  - Source: handoff §5.
- **Smaller calls recorded as his:**
  - the Price book panel's monospace money (match it, or leave it);
  - the stage pill and avatar palettes;
  - the header's "0 open deals" beside a won-only list, and a Closed Lost
    column on Funnel and Kanban (§0.119);
  - editing a job in the Queue panel (the Jobs editor is the one place
    today, §0.118);
  - whether `email` stays self-editable on the profile;
  - a Slack summary line for a bulk stage move;
  - who may own a deal (§4.6, the owner pickers);
  - whether the assignee of a teammate's task may complete it (a 403 when
    recorded, Sep);
  - whether the QA seed writes a history (§0.156).
- **Web leads and email** (§0.121 / §0.122):
  - email to Admins and Managers on a new web lead;
  - a thank-you URL field on the web-form card (the key is honoured; there is
    no UI);
  - custom form fields;
  - personal (per-rep) email templates;
  - templates on a lead;
  - sending from the app (a per-org sending domain, a project of its own).

---

## 3. Plans

### 3.1 AI deal scoring — the plan and its recommended implementation (7 Oct)

The page: **https://claude.ai/artifact/78C6dQQPC6mLSJCrjREBoE** ("Deal Scoring
Roadmap"). Each batch is its own commit, verified and documented the usual
way.

**Where it stands (after §0.188).**

- A deal has two scores:
  - the health score: rules in the browser (`calculateDealHealth`, App.jsx);
  - the AI score: Claude, through `ai-score.mjs`.
- The AI score:
  - sends Claude the deal, its last ten activities and a fixed guide;
  - keeps the answer on the deal with its four earlier scores;
  - answers from that copy for 24 hours;
  - writes each score to the audit log;
  - is behind "Claude scores deals", off by default.
- Claude judges from general sales knowledge. It knows nothing about what
  wins in this org.
- Leads already learn: a per-org model trained nightly, or by Train now, on
  converted and dead leads. Its threshold is 150 by default and never fewer
  than 20.

**Batch 1: the Admin's model choice (small; recommended first).**

- The AI score uses the model the Admin chose, from a list the server
  accepts.
- If that model errors or is overloaded, the score retries once with the
  fallback.
- Each score keeps the model it used, and the audit log names it.
- The model list is brought up to date and checked against what the
  workspace's key can call. Today the panel offers Sonnet 4.6, Opus 4.6 and
  Haiku 4.5; scoring always uses Haiku 4.5.
- The panel gets Admin text on the cost and speed of each choice. The draft
  wording is on the page.
- This closes §0.188's found (a): the AI settings are saved and read by
  nothing.

**Batch 2: a deal score that learns (the main piece).** It applies the lead
model's pattern to deals.

- **Start:** the health score's rules, plus each stage's win probability
  from the org's funnel.
- **Learn:** each Closed Won and Closed Lost deal is a training example. The
  model is per org, retrained nightly and by Train now.
- **Blend:** the learned share grows with the org's closed deals. It is
  (n − 20) ÷ ((n − 20) + 30), and zero below 20. The constants are to be
  tuned.
- **Inputs:**
  - days in stage against the org's usual;
  - activity by type over 14 and 30 days;
  - contacts engaged, not just listed;
  - revenue against the org's typical deal;
  - close-date moves;
  - the stage reached, and the pace of earlier stages.
- **Guardrails:**
  - Each org's model trains on that org's deals alone, never other tenants'
    (the isolation rule).
  - Inputs describe the deal as it was before the close.
  - Settings shows the org's standing ("learning from 37 closed deals") and
    the accuracy on deals held out of training.
- **Recommended:** the learned model makes the number, and Claude explains it
  from the model's strongest factors. The number is consistent, explainable
  and free to compute. Claude's own 0–100 judgment retires once an org has
  enough history.
- **Before batch 2:**
  - Per-contact engagement (§4.2): `ai-score.mjs` counts engaged contacts from
    `activity.contactName`, a field no activity has.
  - The close-date history column (below): without it, the slip count cannot
    be learned.

**Batch 3: next-step suggestions from past wins (built on batch 2).**

- Compare an open deal with the org's won deals at the same stage, and find
  where it falls furthest short.
- Find activity patterns that came before wins (e.g. a demo, then a proposal
  within a week).
- Claude writes a plain suggestion naming this deal's people and dates.
- Log each suggestion shown, acted on or dismissed, and whether the deal
  moved. The recommendation log already does this for alerts.
- Rank by what preceded progress, saying it is correlation, not cause.
- Shown in the deal window's AI read, on Home and in meeting prep.

**Decisions for Jeff, with the recommendations:**

1. **Where the number comes from.** Recommended: the learned model, with
   Claude explaining it. The alternative keeps Claude's score and adds the
   org's patterns to its prompt.
2. **"Available to" and the token budget.** Recommended: enforce "Available
   to" (a role check when scoring, small). Remove the budget until a per-org
   usage counter backs it.
3. **A history of close-date changes.** Recommended: yes. A new deal column,
   additive and nullable, both databases, with Jeff's go.
4. **Which models to offer.** Recommended: the current Haiku, Sonnet and Opus,
   checked against what the workspace's key can call before they are listed.

### 3.2 Quote → job → invoice: what remains (from §0.149 / §0.150)

- **The QuickBooks export.** It waits on §2.1's setup. The `invoices.quickbooks_*`
  columns are waiting. The build is one endpoint pair (start / callback, the
  calendar-oauth shape) and a per-invoice "Send to QuickBooks".
- **An invoice PDF** (Jeff, 30 Sep: "we should also be able to generate a pdf
  of an invoice"; `quote-pdf.mjs` is the pattern), and an invoice email.
- **A deep link** from the quote card to its job.
- **Per-org defaults** for tax rate and terms.
- **The dead `priceBookProducts` key.** Drop it from both settings.mjs halves.
- **The quote Activity list** is derived from the current status, so earlier
  steps vanish. The audit log is the real history. §0.150, as recorded.
- **The Invoices table's fixed grid** clips Total and Status at narrow widths.
  §0.150, as recorded.
- **Quote templates** (§0.142; re-read 7 Oct, still so). A template carries
  no line items, and `DEFAULT_QUOTE_TEMPLATES` invents four ("SMB Starter —
  Annual · used 47 times · Bea Chen") that an Admin's Save persists.
  - Two jobs: a line-items editor, and an empty state instead of the
    defaults.
- **The Quotes tab's own default tiers** (§0.158; re-read 7 Oct, still so).
  `DEFAULT_APPROVAL_TIERS` should be drawn from `DEFAULT_QUOTE_APPROVAL_TIERS`.

### 3.3 Field-level security, made real (5 Oct; Jeff chose the honest page first, §0.171)

- Per-field rules, enforced on the server, for the fields that exist. 14 of
  the old panel's 42 keys are columns.
- Every answer leaves a hidden field out: the six CRM reads, quotes, reports,
  exports, the public API, search and the email notifications.
- "Masked" needs a definition per field type. "Read" needs every PUT to keep
  the stored value.
- A batch with design questions before any code.

### 3.4 Manager-scoped settings permissions (design, §9)

- `PUT /settings` is Admin-only. If Managers should make limited changes,
  gate the save per key, not per request: tier the keys, and filter the
  existing read-then-merge per key.
- The audit row records which keys were accepted. AdminView's gating changes
  to match.
- The old sketch reused `rolePermissions`, which §0.171 removed, so the split
  needs a home of its own.

### 3.5 Larger features, each a session of its own (as recorded)

- **The tech mobile experience:** one dedicated mobile pass (Jeff deferred
  it). The SPIFF panel, desktop-only today, belongs in it.
- **E2E tests (Playwright):** a thin happy path. The hurdle is automating
  Clerk's sign-in.
- **Microsoft (Azure) OAuth and Yahoo Calendar:** deferred.
- **`dispatchJobTypes` and `dispatchTrades` settings panels.** `jobType` and
  `trade` are hard-coded and nothing branches on them.
- **A dispatch job create in one transaction.** Today the New Job flow is three
  client writes (customer, location, job). It needs one server endpoint.
- **The dispatch board** (§0.134):
  - the day and month boards do not drag;
  - a drop cannot change the time;
  - a crewed job dropped on Needs-a-crew is refused, not unassigned;
  - `hoursThisWeek` is a load-time figure;
  - `onScheduled` and `onHeld` leave `jobsRaw` stale;
  - no touch.
- **Automations** (§0.124–§0.132):
  - Slack as an action posts text only;
  - momentum and score-drop triggers;
  - a rule fires only when the job raises the signal;
  - the webhooks vocabulary lists `task.overdue` and nothing fires it;
  - `days_overdue` counts UTC days, like every deal signal;
  - Update field and Send email keep typed inputs;
  - the Assign-to picker offers Technicians.
- **Reports** (§0.135–§0.140):
  - the prompt interpreter's gaps: no "top N", no team or territory filter,
    no compare-to, and a quarter grouping reads as months;
  - schedule recipients are roster members only;
  - one hour slot per schedule;
  - the email is a table, not the chart, and names the cadence, not the time;
  - no "next send" time on the card;
  - the library's four hard-coded "Pinned" tiles;
  - a pinned report on Home uses the app's visibility, the tab its own scope.

---

## 4. Found, not fixed

### 4.1 Layers, Escape and the screen

- **In-tab layers without Escape.**
  - Fifteen files under src/Tabs draw fixed layers and handle no Escape:
    DispatchTab (9), DispatchSkillsDetail (6), TasksTab (5) and twelve more.
  - Eleven others handle an Escape somewhere; each layer is still to be
    checked.
  - None is in `ESCAPE_ORDER` yet. The document picker (inside the deal window
    and the two record rails) joins it with them: it holds by its own list, the
    app's confirm and prompt (§0.189 (c)).
  - Source: §0.186 (a), 7 Oct.
- **The shortcuts list opens under an open rail or the deal window.** Its z
  is 9998, under every rail and the draggable windows; "?" opened it with a
  contact rail and with a new-task rail open. A z above them, with its place
  in the order, is the fix. §0.189 (b), 8 Oct.
- **Layers drawn that nothing opens** (tests/open-states.test.mjs records each
  in KNOWN; giving one a way in, or retiring it, updates KNOWN):
  - nothing sets `showOutlookImportModal` (§0.186 (b));
  - ContactModal is rendered nowhere: the contact rail replaced it
    (§0.186 (b));
  - TaskViewRail draws on `viewingTask`, which nothing opens: the context's
    `setViewingTask` opens the task rail (§0.190 (a), 8 Oct);
  - the notes popover: ModalLayer draws it, App's Escape and the order name
    it, and nothing has set `notesPopover` since c3842cf (12 Mar 2026), when
    the side detail panel replaced the pipeline table's notes and comments
    cells (§0.190 (b), 8 Oct, found by the guard's parse).
- **Home's meetings.** "Open prep" needs a deal no calendar event carries.
  The line under a meeting reads `ev.attendees`, which `calendar-events.mjs`
  does not return (it returns a count). §0.186 (c)'s remainder, 7 Oct.
- **The deal modal is wider than a 1024-px window.** The History rows' ×
  goes off-screen. §0.177 (c).
- **A selection outlives the view that made it.** A filter, the scope, a
  search or a smart view leaves rows ticked, and Delete (N) counts them.
  §0.179 (a).
- **The number-key shortcuts act behind "Unsaved changes":** pressing "1"
  re-aims "Discard and continue" at Home. §0.170 (i).
- **The leave guard learns of an edit a render late.** Only an automated
  click is that fast. §0.170 (h).
- **Popovers** (§0.127 / §0.128, as recorded):
  - the three integration row menus are fixed but not portaled;
  - `menuPlacement` should fold into `popoverPlacement`;
  - the menu card's height allowance is a constant (300);
  - RepPickerPopover and the status picker are not audited.
- **Home's calendar strip keeps the previous org's events** while the new
  org's fetch runs. §0.125, as recorded. §0.173's per-org clearing may have
  closed it; re-read it.
- **Three dialogs on the legacy `.modal` class** (confirm, prompt, blocked
  delete). The guide wants inline chrome. §0.136, as recorded.
- **Log from calendar is dead code.** Its state and two handlers have no
  caller. Wire it or remove it. §0.175 (a).

### 4.2 Deals, activities and pipeline

- **Per-contact engagement is always zero** (§0.154; re-read 7 Oct).
  - The deal's Contacts tab, the buying-committee last touch, Home's "no
    economic buyer" insight and `ai-score.mjs` all count from
    `activity.contactName`, which nothing writes.
  - A deal's contacts are matched by name, though the ids ride beside them.
  - Recommended: key both on `contactIds`. Decided 1 Oct: after (C), which is
    done.
- **The deal endpoint never saves `accountId`.** Its sanitize has none, though
  the form sends one. Accepting it needs a check that the account is this
  org's. §0.176 (e).
- **A deal's notes are saved as the whole list.** Two people saving at once
  keep the last list, so a note is dropped. Recommended: a server-side
  append, or a version check. §0.177 (a).
- **An Undo can change a row's owner.** A re-POST with no owner is stamped
  with whoever pressed Undo, and an account meets the territory rules again.
  §0.178 (b).
- **The deal PUT's "opportunity updated" email compares the rep's name to
  the caller's Clerk id**, so a rep with that email on is emailed about their
  own edits. §0.176 (c).
- **Deals on a pipeline that does not exist vanish.** 31 of the Test org's
  51 deals are on `new-biz`. Decided 1 Oct (Jeff: "Leave the data; fix the
  product"): such a deal falls to the default pipeline, or is flagged.
  §0.152.
- **A deal has no competitor.** The Reports competitor table reads
  `o.competitor`. §0.187 (c).
- **Reports' account and contact timelines** date a won or lost deal by its
  last edit, where the deal has `wonDate` / `lostDate`. §0.187 (e).
- **A save from the activity rail closes QuickLog and empties its draft.**
  `handleSaveActivity`'s tail resets QuickLog's form, though QuickLog saves on
  its own. §0.176 (d).
- **Kanban:** check that closed deals leave the board now that closing is
  reachable. As recorded (Sep).
- **The AI score's refusal says nothing of why.** ai-score answers every
  refusal from Anthropic with 502 "AI scoring service unavailable", and the
  status goes to a console Netlify does not keep. The report reader returns
  the status, and the page names a rejected key (§0.141). Recommended: the
  same — Anthropic's status in the answer, and the AI Score tab naming the
  cause (a rejected key, the account, the model, busy). Found 8 Oct. The
  same day showed the status alone is not enough: both calls keep only the
  status, and Anthropic's error message, which names the cause (for one,
  "This API key is not scoped to a workspace…", 8 Oct), reaches only the
  console. Keep its error type and message (never the key) in the answer
  and the audit row: an org's own key (BYOK) can be unscoped too, and its
  Admin should read that.
  While there: Anthropic's docs call `x-api-key` legacy, still supported;
  `Authorization: Bearer` is the current header.
- **The AI score's text is cut mid-sentence.** ai-score keeps the first 150
  characters of the recommendation, 120 of the headline and 100 of each
  signal (`slice`, ai-score.mjs:195-200). On 8 Oct the deal window showed
  "…escalate to Sofia Rossi. Verify close date" for "Ironwood Manufacturing
  — Safety Compliance Module" (Accelerep QA). Recommended: cut at the last
  full sentence or word, or ask for shorter text and keep a longer cap.
  Found 8 Oct.

### 4.3 Settings

- **Sixteen settings keys no screen sets by name** (an unverified scan; read
  each before saying anything of it). §0.188 (b), 7 Oct.
- **Funnel stages keeps its own default stages,** in another shape.
  §0.170 (b).
- **A workspace created by integration requests keeps `[]` vertical
  markets,** which reads like a list an Admin cleared. §0.170 (c).
- **Connected Apps keeps its own copy.** Reports' delivery dialog reads Slack
  as unconfigured until a reload. §0.170 (d).
- **Pipelines, Company calendar and the quote brand editor** set the app's
  copy first and put back a whole snapshot on failure. §0.170 (e).
- **A panel's own Save leaves a refused save's throw unhandled.**
  §0.170 (f).
- **The SPIFF claims filter keeps its view state in the settings object.**
  §0.170 (g).
- **The Settings cards before settings load** read "0 personas" / "No data"
  for a second. They want a loading state. §0.148.
- **The QA seed's full-row guard would refuse a new org.** §0.171.
- **Thirteen panels not on `putSettings`.** §9, as recorded.
- **Add-vs-commit across settings panels.** Since §0.170 the leave guard asks
  before unsaved edits are lost. Whether Add should save at once is still
  open. As recorded.
- **KPIThresholdsDetail's "Color palette" card** prints hex text labels
  beside the token swatches. §0.130, as recorded.
- **The legacy LeadConvBenchmarks panel** could retire if Reports does not
  use it. As recorded.
- **The nightly lead-model batch's whole-blob settings write** could lose a
  concurrent Admin save. §0.123, as recorded.

### 4.4 Dispatch

- **Technician mode loads four lists TechnicianView never shows.**
  §0.172 (c).
- **DispatchTab's job-template note** calls `equipmentIds` FK ids; they are
  kinds. §0.172 (b).
- **The accounts on-create duplicate probe has no caller.** §0.172 (d).
- **A user's Google calendar refresh token is refused** (`invalid_grant`) in
  the dev log. §0.173 (c).
- **Dispatch load errors show only the status code,** not the server's
  message. As recorded.
- **CrewBuilderView's `unscheduledJobs` / `scheduledJobs`** are computed and
  never read. §0.118, as recorded.

### 4.5 Notifications, email and digests

- **"View Deal →" in seven older email templates opens Home.** Nothing reads
  `?deal=`. It wants App's `?quote=` pattern, surviving sign-in. §0.158;
  re-read 7 Oct.
- **The email footer's "Manage notification preferences" opens Home.** The
  switches live in the profile panel's Notifications tab. §0.158; re-read
  7 Oct.
- **The Notifications tab files "Maintenance agreement expiring (Dispatch)"
  under "Quote alerts".** §0.158.
- **The Monday team digest's Attainment reads "—" for every rep.**
  - It reads quota fields from the row's top level; they live in `profile`.
  - The jobs also read `profile.managedReps` and `profile.alertTime`, which
    nothing writes.
  - Source: §0.159; re-read 7 Oct.
- **The Slack digest template has no caller.** §0.187 (d).
- **The Tasks tab's mention dot never clears.** `feedLastRead` has no writer.
  §0.174 (d).
- **Imported leads fire no `lead.created` webhook or automation.** If that
  matters, it needs a batched dispatch. As recorded.

### 4.6 Security, roles and audit (all within one org unless stated)

- **The audit log takes any other invented event from a member** (§0.156;
  re-read 7 Oct). Only quote events are refused. Recommended: an allowlist of
  the client's own entries (`create`, `update`, `delete`, `merge`,
  `dispatch.*`).
- **The audit log after §0.143:**
  - (1) Thirteen files audit only their mass paths. A plain PUT on a deal,
    account, contact, lead, task or activity writes no server row; the
    client's bare `update` rows stand in.
  - (2) Rows carry no caller role.
  - (3) The panel reads the last 500 rows and wants paging.
  - Source: §0.143.
- **`recommendation-log.mjs`'s GET has no role scoping.** A rep reads another
  rep's log through `?rep=`. §0.151.
- **The Leads tab has no `canEdit`.** ReadOnly users and Dispatchers see edit
  controls and meet a 403. §0.151.
- **Ten owner pickers use three role rules,** so a Technician or Dispatcher
  can own a deal. A sweep, with a decision: may an Admin own a deal?
  §0.151.
- **The Accounts tab defaults to Mine** for a Dispatcher who owns nothing.
  §0.151.
- **Nothing writes `profile.managedReps`.** A Manager is narrowed only where a
  row holds it, and none does; `managedReps` lives in Clerk's publicMetadata.
  Who a Manager manages needs a home that is written. §0.159 / §0.163.
- **The users PUT lets a Manager write any org user's profile,** forecast
  calls included. This is the existing quota behaviour, not widened, and was
  noted only. §0.84, as recorded.
- **A SPIFF claim's amount is the client's figure.** §0.169 (c).
- **`spiff_claims` has no owner id;** claims match by roster name. A schema
  change, Jeff's go (§2.4). §0.169 (d).
- **Stored ids and identity** (§0.166):
  - (1) Ids stored on records are taken as given, though every reader stays
    in its org.
  - (3) A backup restore keeps the ids in its file.
  - (4) A job delete leaves its status history.
  - (5) A document's `ownerId` is the Clerk id; the Tier 1 tables hold
    `users.id`.
  - (2), the schema part, is in §2.4.
- **auth.mjs's fallback to `payload.org_id`** when a token has no `o` claim.
  Take the org from `o.id` alone once prod's tokens are known to be v2 (dev's
  are, read 3 Oct). The 2 Oct audit's (2), not exploitable as configured;
  §0.163.
- **An action cut by an org switch stays part-done in its own org.**
  §0.175 (c).
- **A one-time secret made just before a switch is never shown.**
  §0.175 (d).
- **A role-gate uniformity pass** (style, all Admin-gated):
  - automations, webhooks, export-schedules, export-dsr, api-keys, backup and
    export-runs onto the shared helpers;
  - rename the local `isAdmin` / `isManager` / `isReadOnly` that shadow the
    imports.
  - As recorded.
- **Older security follow-ups** (9 Sep, as recorded):
  - a role and ownership sweep of the `dispatch-*` endpoints and
    products / saved-reports;
  - a Netlify env-var and source-map audit;
  - the Security-health page's mock events feed and score, onto the real
    audit log;
  - Manager team-scoped writes (Phase 2);
  - delete-confirm copy matching the soft-delete undo.
- **`waitForToken` resolves rather than rejects on give-up.** §0.125, as
  recorded.
- **CLAUDE.md is out of date on two lines** (Jeff's file, flagged 5 Oct):
  - The persistent-data line's order: for a screen's save it is the save,
    then the app's copy (guide §18b63.3).
  - "Client `managedReps` narrowing is the only Manager scoping": the server
    narrows a Manager's deals too (`dealVisibleTo`, §0.155).

### 4.7 Imports

- **Restyle LeadImportModal onto CsvImportModal's chrome,** retiring its old
  first-match column matcher. As recorded.
- **An end-to-end importer test:** a fixture CSV through all six modules.
  As recorded.
- **The accounts / contacts bulk POST is unbatched.** It breaks above ~1,872
  rows, and one bad row kills the batch. As recorded.
- **`onConflictDoNothing()` in the bulk POST can never fire,** so a repeated
  import inserts a new set. Decide where name dedupe belongs. As recorded.

### 4.8 Other UI

- **Five native time inputs:** AppHeader's digest time, and four in
  DispatchTab. They become the house TimeDropdown. Re-read 7 Oct: five
  sites.
- **The reminder modal takes the first click on the Reports tab.** §0.140,
  as recorded.
- **AccountsTab layout polish.** As recorded.
- **70 churn-only inline components** (`npm run check:inline -- --churn`;
  counted 7 Oct, §9 said 76). SalesManagerTab's SubTabs, TeamTab and AuditTab
  are among them, per §0.84. Opportunistic.

---

## 5. Design questions (no action until decided)

- **Quote versions:** Build compares only current against previous.
- **CRM entity numbering:** accounts are the best candidate. It pays only if
  searchable, on documents and surviving export.
- **Equipment's `share`** (shared vs per-van) is shown, not modelled.
- **`planWeek`** is greedy, not globally optimal.
- **Email signatures** appear on quote emails only.
- **The SPIFF panel on mobile:** where it goes in the mobile stack.

---

## 6. Tooling, tests and housekeeping

- **Local `netlify dev` cannot run the app's AI calls on our key** (found
  8 Oct, read in netlify-cli 27.6.0: `commands/dev/dev.js` and
  `@netlify/ai/dist/bootstrap/main.js`). For a linked site with a deploy, it
  sets `ANTHROPIC_API_KEY` to a Netlify AI Gateway token (and
  `ANTHROPIC_BASE_URL` to the site's `/.netlify/ai`), marked "internal": no
  `.env` or Netlify value overrides it, and its log names neither. Our
  functions send that token to `api.anthropic.com`, which answers 401. The
  repo's link to the dev site is `C:\Users\jeffr\.netlify\state.json` in the
  home folder (`netlify status`). Recommended (Jeff decides): the functions
  read a name the gateway does not set (e.g. `ACCELEREP_ANTHROPIC_API_KEY`,
  on both sites and in `.env`). Until then, a key is checked by one minimal
  request with the key from `.env` (the guide's secrets rules).
- **The stray fixture** `tests/fixtures/scanners/dupes-jsx-attribute - Copy.jsx`
  is still tracked (re-read 7 Oct). A one-line delete.
- **Never `npm audit fix --force`:** it installs vite@8. The remaining
  advisories are dev tooling. A standing note.
- **What the scanners cannot see:**
  - inside Netlify handlers;
  - the "renders and does nothing" class;
  - a field sent on save but missing from the load;
  - a prop from the wrong place;
  - lowercase helpers in function files (check-tdz).
  - A standing note.
- **`docs/design/color-audit.md` §5** predates §0.130. Regenerate it if the
  audit resumes.
- **Error boundaries, "broader coverage outstanding"** (old). Since §0.184 /
  §0.185 every layer App renders sits in a LayerBoundary, and the root in a
  RootBoundary. Name what is left, or close it.
- **The old hardening backlog** (as recorded):
  - public-API pagination in the database;
  - date-typed columns (several dates are `varchar`);
  - a CORS allow-list (parked).
- **Connected Apps' non-Admin dead branches; `INTEGRATION_REQUESTS_TO`
  unset.** As recorded (Sep).
- **Fifteen integration suites test a stand-in role gate** (counted 7 Oct).
  - They mock `auth.mjs` with their own `requireWrite` / `canSeeAll`, so their
    role checks test a copy, not the gate.
  - The in-org pattern (`src/utils/roles.js` and the real gate, as in
    in-org.itest.mjs) is the fix.
  - The fifteen: accounts, audit-stream, coaching-notes, contacts,
    customer-notify, dispatch-plan-visits, email-inbound,
    integration-requests, invoices, lead-requests, leads, opportunities,
    saved-reports, tasks and users-self.
  - Source: §0.151.
- **App.jsx's `canEdit` is declared and never read** (re-read 7 Oct). §0.151.
- **The integration suite flaked once** (1 Oct): two roster-resolving tests
  at 10–12 s. If it recurs, capture the failure text before rerunning.
  §0.152.
- **A large org's Train now** runs the nightly lead engine inside one
  function invocation. §0.132, as recorded.
- **Read Resend's webhook targets before any email work.** There are two
  inbound webhooks, prod's and dev's, and a row proves only that a row was
  written. A standing note.
- **App.jsx's stray blank lines** left by §0.187. Cosmetic.
