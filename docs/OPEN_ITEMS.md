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

1. **The account search's silent cut at 8** (§4.8, seen on PROD 9 Oct;
   Jeff, 9 Oct: "Account search fix first", i.e. before batch B). One shared
   matcher for every typed list that cuts. A duplicate account is one click
   away while it stands. Planned and reviewed 9 Oct (workflow: four readers,
   two designs, a judge, three critics). The class sweep found 16 live silent
   cuts. Jeff's answers, 9 Oct:
   - New Deal → Account: "List matching sites below". Only sites whose own
     name matches are listed, after the accounts, labelled "site of …".
     Picking one fills Account with its parent and Site Name with the site.
   - "50, then 'N more'" in lists that scroll, the contact pickers that open
     on a click included. The quick log keeps 6, because its box does not
     scroll.
   - Claude first said the header search does not scroll. It does, and Jeff
     was told so. His answer: "Keep 5 per group". Dispatch's New Job customer
     field: "Keep 6 per group". Both are grouped boxes with more than one
     list in view.
   - A sub-account is also found by its parent's name: "Yes, listed below
     own-name matches". In the deal window a site still appears only by its
     own name.
   - The parent label on the four other account lists (New Task → Account,
     an account's Parent field, the header search, Dispatch): "Next batch",
     with the save fix below.
   - A save keeping the record picked, not the first of its name: "After
     batch B" (item 3).
2. **One name per member of an org — batch B of the PROD Closed Lost fix**
   (§0.193; Jeff, 9 Oct: "Split: prod fix first", "Number it", "Yes, Full name
   wins"). Batch A (§0.193) stopped the harm: a save that reassigns nothing
   keeps its owner, and the dialog says why a save was refused. Two members of
   one name can still be made, and a NEW assignment by that name is refused.
   Designed, not built (the design: every writer of `users.name` decides it
   through one pure module):
   - users.mjs self PUT, Admin/Manager PUT, POST create, invite: refuse a name
     another member of the org holds (whitespace-collapsed, any case), with a
     409 the screen shows; trim on write; an Admin's Full name wins over the
     stored first/last.
   - ensureRosterRow (first sign-in), users-sync (new member), a no-name
     invite, backup restore: number a taken name, "Pat Smith (2)".
   - the profile panel's save shows a refusal (it only logged it) and sends
     only what changed; the team CSV import's duplicate check uses the same key.
   - Jeff's prod pair is fixed by hand already (the UKG row is "Jeff Russell
     (UKG)", 9 Oct). Read-only first: any other org with two members of one
     name, and any member whose next save would rebuild a taken name from
     their First/Last. Any such pair is renamed by hand in Settings → Users,
     never by a script.
   - Re-validated against the tree 9 Oct (after batch A). The plan is exact
     to the line and builds on batch A, so batch A is committed first.
     Jeff's answers, 9 Oct:
     - Team CSV import, a no-name row whose address's front part a member
       already has: "Refuse at Review".
     - The database unique index on (org, name key): "Record now, decide
       later", after the read-only check shows no pairs (§2.4).
     - The "+ New Rep" window painting Work Email red for a taken name:
       "Record it for later" (§4.6).
     - The plan's three other questions take its recommendations:
       - First sign-in with no Clerk name keeps the full email as the name.
         The front part is its own later item (§4.6).
       - "Full name wins" is enforced on the Settings → Users screen only.
       - Pairs found are renamed by hand.
3. **A pick is saved as the record picked** (Jeff, 9 Oct: "After batch
   B"). Every Company, Account, Deal and Parent save resolves the TYPED NAME
   to the first record of that name, not the row picked. The parent label
   goes on the four account lists that lack it in the same batch.
   - Seen in the UKG data (SELECT 9 Oct): two "Shell - Port Allen" records
     under Shell. One is a business unit with no sub-accounts, deals or
     contacts; the other is a site with 2 contacts. Jeff: it is one
     sub-account of Shell, so the empty one is a stray copy (§2.4).
   - Also seen: "Evonik - Lafayette", two sites, one of them merge-archived.
     It still lists, because the accounts GET does not filter archived rows.
4. **AI scoring batch 1, the model choice** (§3.1), once Jeff has made the
   four decisions.
5. **Escape in the tabs** (§4.1): the in-tab layers join the order, as every
   app layer did in §0.189. Designed 9 Oct (three batches and a fourth; ten
   questions for Jeff first — §4.1).
6. **Deal data** (§4.2):
   - the deal endpoint saving `accountId`;
   - notes appended on the server;
   - an Undo keeping the row's owner.
7. **Email links** (§4.5): the `?deal=` reader, and the footer's preferences
   link.

---

## 2. Waiting on Jeff

### 2.1 Checks and setup only Jeff can do

- **The Anthropic keys: what is left** (Jeff, 8 Oct: "add updating the
  anthropic keys to the to-do list"). The keys work on both sites — dev
  since 8 Oct, prod since the twenty-ninth ship (9 Oct: Jeff's screenshot of
  an AI score of "EDF Energy – HPC Project", 35, Critical); the workspace
  rule is in the guide's secrets rules.
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

- Nothing open. The thirtieth ship (10 Oct: §0.191, §0.192 and §0.193, the
  PROD Closed Lost fix among them) is recorded in the state header, as are the
  twenty-ninth (9 Oct) and the Clerk cleanup after it.

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
  - A unique index on `users`, on the org plus the name with whitespace
    collapsed, trimmed and lowercased. It closes the race batch B leaves:
    two writes at one moment can still make a pair. It cannot be built while
    any pair exists, and Postgres's whitespace class differs slightly from
    JS's. Jeff, 9 Oct: "Record now, decide later", after batch B's
    read-only check shows no pairs (§1 item 2).
- **Data changes, by Jeff's hand:**
  - The job editor's jsonb lists are stored as strings. The app reads them as
    arrays; SQL over the column does not. Rewrite the stored strings.
    §0.169 (a), corrected 5 Oct.
  - Any legacy `dispatch_jobs.priority` values. A read-only
    `SELECT DISTINCT priority` comes first. §0.109.
  - The legacy `job_heartbeats` DROP, both databases. Handoff, carried since
    the eleventh session.
  - The Accelerep Test org's 32 unowned demo deals: keep or clear. §0.151.
  - PROD, UKG: the empty "Shell - Port Allen" copy. It is a business unit
    under Shell with no sub-accounts, deals or contacts, beside the real
    site of that name, which has 2 contacts (SELECT 9 Oct). Jeff, 9 Oct: it
    is one sub-account of Shell. Merge the empty copy into the real one in
    the app.
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
  - The close-date history column (below): without it, the slip count cannot
    be learned.
  - (Per-contact engagement, done 9 Oct: §0.192. The prompt now names who was
    engaged, with last touch and count; `dealEngagement.js` is the input.)

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
  - **Designed 9 Oct** (a read-only inventory of src/Tabs, about 74 layers;
    nothing built): a registry of in-tab layers in App, a `useLocalLayer`
    hook, a guard that finds every fixed layer; three batches — the CRM tabs
    and the mechanism, Dispatch, Settings — and a fourth for inline-input
    Escapes and nested popovers. Questions for Jeff first: what Escape does to
    typed work (ask "Discard?", or discard); the show-once secrets (API key,
    webhook secret); portal the document picker above the rail it opens from;
    AdminView's unsaved-changes guard inside or outside the Settings tab; the
    letter and number shortcuts while a tab layer is open (typing "837" in a
    report's time picker sends "3" to Tasks); one Escape in an inline edit
    under a menu; Accounts' Filters panel drawn twice; TaskViewRail (never
    opens); Pipelines' ⋯ menus never closing on an outside click; the
    shortcuts list above the rails now or later.
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

- **What the AI score's prompt may name, within an org** (§0.192's review,
  9 Oct). ai-score looks up the deal's and its activities' contacts in the
  org, so for a rep it can name a contact owned by another rep — as it
  already sent the deal's whole contacts text and every rep's activity notes
  on the deal. Never another org's. Jeff decides: org-wide (as now), or the
  caller's read scope (`crmReadScope` 'own': their contacts and the
  unassigned, and their activities).
- **One person shown twice** when a deal's names and ids are out of step and
  the caller's list lacks that contact: once unnamed with their touches, once
  by name without. dealEngagement.js never pairs an unheld id with a name by
  position, so a wrong name is never shown; Jeff decides whether to pair the
  newest names with the ids (suffix alignment) instead. §0.192.
- **The deal's contacts after a merge, a rename, a Reports edit** (§0.192's
  read, as recorded):
  - merge.mjs rewrites `activities.contactId` and `opportunities.contactIds`,
    not `activities.contactIds`, `tasks.contacts` or the deal's text; the
    readers fold a duplicate into its survivor (mergedIntoId), the rows stay.
  - A contact rename does not reach a deal's text (an account rename does).
  - ReportsTab's add/remove on "Contacts on this deal" rebuilds the text from
    the names the viewer's list resolves ("First Last", no title), never
    updates the app's copy, and KanbanView's stage drag resends the stale
    row.
  - The activities and deal endpoints take contact ids without checking they
    are this org's; every reader looks them up in the org.
- **Other single-contact and by-name readers of the same class** (§0.192, as
  recorded): quote-email's fallback recipient matches the deal text's first
  name in exact case; MeetingPrepPanel lists the account's contacts by
  company name, not the deal's own; TaskRail's related activities and
  ContactMergeReviewModal's counts read `contactId` only; QuickLog and a task
  completion log one contact; ActivityDetailDialog shows the first; the
  public API gives `contact_id`, not `contact_ids`; an inbound email's
  activity has no deal, so it counts for no deal's engagement.
- **Accounts matched by name where an id exists** (§0.192's sweep, as
  recorded): AccountsTab's warmth and the Contacts tab's company "Last touch"
  read `a.company` (no such column) and deals by account name; App's
  getAccountRollup and Reports' account timeline match by name.
- **Activity fields no column holds** (as recorded): `a.company`,
  `activity.companyName`, `a.salesRep` are read in places; QuickLogFab writes
  `salesRep`, `companyName`, `opportunityName`. A guard like
  tests/deal-fields.test.mjs's, for activities, would hold the class.
- **The deal form's "+ New Contact" does nothing** (sets a state nothing
  draws; ModalLayer passes no handler). §0.192, as recorded.
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
- **A retried new deal whose first save landed** (§0.193's review, low). The
  Closed Lost dialog retries a new deal with the same id; if the first POST
  stored the row but answered a failure (a throw after the insert, a timeout),
  the retry fails on the primary key ("Internal server error") and the deal
  shows only after a reload. An idempotent POST (insert on conflict do
  nothing, then answer the stored row) must first check the caller may READ
  that row — answering it to anyone who names its id would let a rep read
  another rep's deal. Recorded, not changed.
- **An import's owner report is not shown.** The bulk POST (create) and, since
  §0.193, the bulk PUT (overwrite) answer `ambiguousOwners` and
  `unmatchedOwners`; bulkClient and the results tile read neither, so a row
  whose rep was not set (an ambiguous or unknown name) is not named to the
  user. §0.193's review.
- **A lost reason cannot be edited after the save** (Jeff's OxyChem, 9 Oct: the
  note was not stored and there is no way to add it after). The deal window
  shows `lostReason` read-only. §0.193.
- **Records named by an old roster name.** The 5 contacts the UKG org's
  "Jeff Russell (UKG)" owns name their rep "jeffrussell1" (its name before
  7 Oct). Since §0.193 a save keeps their owner; a reassignment by name needs
  the current name. A rename does not cascade to records' name text (§0.192's
  list). §0.193, read 9 Oct.
- **From §0.193's design read, as recorded:** a Manager can rename any member,
  Admins included (only active/inactive is Admin-gated); a users PUT naming an
  id unknown in the org INSERTS a member with the client's id; the self PUT
  inserts before it updates (a just-deleted member's preference save
  re-creates them); after a self-rename the app keeps the old name until a
  reload; Kanban's drag and Reports' deal-contact PUTs and the Tasks
  complete/snooze paths show a refused save nowhere; SalesManagerTab's user
  save writes its cached name back; users.mjs does not cut a name to 255; a
  SPIFF claim edit is authorized by name; the deal form's "Reason Lost" select
  writes a field nothing reads, and the reason dialog's eight categories are
  hard-coded, not the org's "Reasons lost".
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
  Found 8 Oct. On prod too (9 Oct, "EDF Energy – HPC Project": "…schedule
  specific check-in with legal team. Confir"). The same score's signal read
  "foreclosed in 20 days" for forecast to close: the model's wording, a
  prompt matter for §3.1's batches.

- **The Recommendation report's outcomes never move.** Nothing calls
  `recommendation-log.mjs`'s PUT, the sweep that marks a pending alert
  resolved or ignored (its comment says Home calls it on load; nothing under
  src does), nor its POST. pipeline-alerts writes every row `pending`, so the
  report's resolve rate and "ignored" count stay at zero. Its GET also counts
  task-reminders' `taskReminder` rows (outcome `sent`) in the total, with no
  label. Recommended: the sweep in the nightly alerts job, and the GET
  leaving the reminder rows out as it does the renewal rows. §0.191 (9 Oct).
  Its 'coverage' resolution branch has no writer (Home's Missing stakeholder
  is client-side); its comment is corrected, the branch kept. §0.192.

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

- **Two member-name items around batch B** (§1 item 2; Jeff, 9 Oct: "Record
  it for later"):
  - The "+ New Rep" window (UserModal) paints Work Email red for every
    refusal, a taken name included. The fix carries the 409's `field`
    through useUserHandlers → App.jsx → ModalLayer → UserModal.
  - A first sign-in with no name in Clerk names the row by the FULL email
    (ensureRosterRow; asserted at integration-requests.itest.mjs:186), so
    reps see the address in every picker. The sync and a no-name invite use
    the address's front part. Recommended: switch to the front part, as its
    own small item.
- **The audit log after §0.143:**
  - (1) Thirteen files audit only their mass paths. A plain PUT on a deal,
    account, contact, lead, task or activity writes no server row; the
    client's bare `update` rows stand in.
  - (2) Rows carry no caller role.
  - (3) The panel reads the last 500 rows and wants paging.
  - Source: §0.143.
- **The recommendation log names its rep by display name** (`repName`, the
  deal's `salesRep`; no owner id). §0.191 holds a rep to the rows bearing
  their roster name, so a renamed rep loses sight of their older rows, and
  pipeline-alerts' "already alerted" check, keyed the same way, alerts again.
  An owner id column is a schema change (§2.4). §0.191 (9 Oct).
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

- **The account search hides matches past the eighth, without saying so.**
  Seen on PROD 9 Oct (Jeff: New Contact's Company field, then New Deal's
  Account field; read in the database, SELECT only). `AccountPicker.jsx:68`
  draws `filtered.slice(0, 8)`, where `filtered` is one substring match. The
  list is in the order the GET returns: by name, in the database's
  `C.UTF-8` collation, so every capital "INEOS…" comes before any "Ineos…".
  In the UKG org, 55 accounts contain "ineos". "Ineos Acetyls - Texas City"
  (a site under the business unit "INEOS Acetyls") is 55th of 55. Typing
  "ineos" shows INEOS and seven "INEOS - …" units, with nothing about the
  other 47.
  - The deal window's Account field (`OpportunityModal.jsx:1673`) also
    hides every `site` account, by design. A site goes in Site Name, which
    lists the chosen account's sites with no cap. There, "INEOS Acetyls" is
    14th of 15.
  - One substring means "Ineos - Acetyls" matches nothing, because the
    stored name has its dash after "Acetyls". The list then offers "Create …
    as a new account": a duplicate account is one click away.
  - Workaround until fixed: type a later word, such as "acetyl" (2 matches)
    or "texas city" (7).
  - The same silent cut is in five more search lists: `ContactModal.jsx:47`
    (contacts, 8), the Typeaheads at `ActivityRail.jsx:43` and
    `TaskRail.jsx:76` (8), and `AccountRail.jsx:110` and
    `ContactRail.jsx:104` (20).
  - Recommended fix, the class at once: one shared matcher.
    - Every typed word must appear, ignoring punctuation.
    - Ranking is exact, then starts-with, then a word start, then anywhere,
      then A–Z ignoring case.
    - The list scrolls, as it already has a max height. It keeps a higher
      cap with a "N more — keep typing" line.
    - Units and sites show their parent.
    - A parse-scan test proves no search list slices without that line.
  - Also found: `allAccountOptions` (`OpportunityModal.jsx:1149`) is built
    on every render and never read.
- **Five native time inputs:** AppHeader's digest time, and four in
  DispatchTab. They become the house TimeDropdown. Re-read 7 Oct: five
  sites.
- **The Leads Cockpit's "···" button does nothing** (no handler). Give it a
  menu or remove it. §0.191 (9 Oct).
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
- **Local `netlify dev` can serve a function older than the file** (9 Oct,
  §0.191). Edited while the server ran, audit-log.mjs was reloaded twice
  (the log: "Reloaded function audit-log") and then served the code before
  the last edit: an invented event answered 201 (the row it wrote is
  deleted). A restart with
  `.netlify/functions-serve` cleared served the file. A standing note: after
  editing a function, restart before a pane check of it.
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
