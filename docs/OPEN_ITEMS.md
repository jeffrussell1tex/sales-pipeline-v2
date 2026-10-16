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

1. **A pick is saved as the record picked: batches 2, 3 and 4b** (Jeff, 11 Oct:
   "Split into batches"). A read-only map of every linking save (11 Oct, over
   7e68f26) found that every save linking an account, deal or contact looked
   the record up again by NAME and took the first of that name, in any case
   and any tier, merge-archived rows included.
   - **Batch 1 is DONE (§0.198; guide §18b91).** The five save screens (the
     contact rail, Log Activity, New Task, the deal window and an account's
     Parent) save the record picked; a name typed and not picked saves only
     when exactly one record has it; a field nobody touched keeps its link;
     a link the user can't open is said, with an × that removes it. The
     deals endpoint keeps and checks `accountId` — a merged-away one links
     the account it was merged into — and a merge moves it; a stale list's
     save never unlinks it. On a single save an account's parent obeys the
     parent rule and keeps its tier wherever it still fits (D21) — a
     merge's re-parenting does not run the rule yet (§4.7); a delete's Undo
     (an Admin's) puts each account it deleted or promoted back as stored —
     its fields, parent, tier and owner, not its created date (§4.2) — and
     moves no deal; a sub-account another session moved since is refused.
     A move or a merge made since §0.198 moves up the
     deals it would leave on a site — by id; by name only where no other
     account has the name — to the account above it, except a merge into a
     site with no live account above it (D22; §4.2's "D22's edges"); deals
     already on a site stay there until changed by hand (UKG's 6, §2.4) — a
     delete's Undo moves none.
     Merge-archived records leave the
     pickers, and a name
     only they have names the record each was merged into. The unreachable
     copies are deleted. What it found and left is filed in §4.2, §4.4,
     §4.6, §4.7, §4.8 and §6.
   - **Batch 4 is DONE (§0.199; guide §18b92).** A link a write names anew
     — a contact's account and org chart; an activity's account, deal, lead
     and contacts; a task's account, deal and contacts; a deal's contacts; a
     bulk account row's parent; a dispatch customer's account; a dispatch
     job's customer, location, account and deal — must be a live row of the
     org (any of its records, E3); one merged away links the record it was
     merged into (E2); an id the row already holds is never asked again. The
     five CRM creates answer 409 for an id another org holds. An Admin's
     backup restore clears, on the rows it restored, every link that names
     no row of the org — a deal's account too — and says how many (E4). A
     screen that copies a link (a task's completion notes, a dispatch job)
     leaves off one the server refuses; the accounts CSV import finds a
     parent among the live accounts. What it found and left is filed in
     §4.2, §4.4, §4.5, §4.6, §4.7, §4.8 and §6.
   - **Batch 4b-1 is DONE (§0.201; guide §18b94)** (Jeff, 14 Oct: "Three
     batches, Dispatch first"). Dispatch's links — a job's crew (one link),
     vehicle, reserved units, service plan, follow-up and parent job (never
     the job itself); a vehicle's technician; a technician's vehicle and
     login; an equipment unit's holders; a customer's plan and preferred
     technician; a plan visit's plan; a time-off block's technician — must
     be a row of the org when a write names them anew (any row, inactive
     too: "Any row of the org"). A technician's login is a member of this
     org, picked on the screen and stored as their Clerk identity — a
     Technician linked on the screen was never matched at sign-in ("Fix it
     in 4b-1"). The restore clears them too. What it found and left is
     filed in §2.3, §4.2 and §4.4.
   - **Jeff's rules (11 Oct), for every batch:**
     - a name typed in full that matches exactly one account by `searchKey`
       saves as that account, under its own spelling. Two or more are
       refused (pick from the list, which names each parent). None is
       refused. A field nobody touched keeps its saved link as stored ("One
       match saves, two refuse");
     - merge-archived accounts and contacts leave the pickers. A record
       already linked to one keeps its link ("Yes, hide them");
     - an account keeps its tier wherever it still fits: account, then
       business unit, then site; a top-level account is an account; a
       sub-account ranks above its parent; nothing sits under a site. Only
       what no longer fits changes, and a move that would put anything below
       a site is refused ("Keep what fits", D21 — decided after a SELECT of
       UKG's tiers, 11 Oct: 416 sites stand straight under a top-level
       account);
     - a move or a merge moves up the deals it would leave on a site — by
       id; by name only where no other account has the name — except a
       merge into a site with no live account above it: a move that makes
       an account holding deals a site, or a merge into a site, moves those
       deals up to the account above it, its Site Name the site, in the
       same write ("Move them up", D22). It moves only what the move or
       merge would leave on a site: deals already on one stay (§2.4); the
       rest it leaves are §4.2's "D22's edges".
   - **Batch 2:** Dispatch and quote -> job (§4.4), the header search (§4.8).
   - **Batch 3:** CSV import and merge (§4.7).
   - **Batch 4b-2a is DONE (§0.202; guide §18b95)** (Jeff, 15 Oct: "Small
     batch first"). A member's save never takes the login link, the status
     or the access from the request — access changes only by the
     Deactivate / Reactivate request; a Manager's save reaches only a Sales
     Rep's row; a save naming no member of this org answers 404 and creates
     nothing; a Manager's invitation to an address a member holds only
     resends a Sales Rep's open invitation; the Annual / Quarterly switch is
     an Admin's. What it found and left is filed in §4.6 and §6.
   - **The quota batch is DONE (§0.203; guide §13, §18b96)** (Jeff, 15
     Oct). A Sales Rep's quota is a plan per fiscal year — a yearly figure
     broken into the company's quarters or months (an Admin's setting on
     Settings → Company → Fiscal year), which may ramp and must add up to
     it; Admins and Managers set it, past years too, on the Sales Manager
     tab's board, one save refused whole when a rep's figures do not add
     up; every other save keeps it; every reader names its year; a rep's
     Home card and Reports read their own; no quota reads "No quota set".
     A company's quarters come from its own fiscal start on every screen
     and job, January when none is saved. The Annual / Quarterly switch is
     gone. What it found and left is filed in §2.2, §4.2, §4.5 and §4.6.
   - **Batch 4b-2, the sales links, after it** (Jeff's decisions, 15 Oct —
     §4.6): SPIFF claims' deal and SPIFF, quote lines' product, automations'
     assignee, members' team and pinned reports; export runs stop taking a
     schedule. With them: a Delete button on each SPIFF claim and a clear
     Active / Inactive control on each SPIFF (Jeff, 15 Oct), and the
     restore's silent row skip.
   - **Batch 4b-3:** the ids inside settings (teams, territories, crews,
     quote templates) and a service plan's visit template (§4.6).
   - Also seen: "Evonik - Lafayette", two sites, one of them merge-archived
     (SELECT 9 Oct). Since §0.198 the pickers leave the archived one out;
     the Accounts tab and an account's Sub-Accounts still list it, because
     the accounts GET does not filter archived rows (read in code 11 Oct).
2. **AI scoring batch 1, the model choice** (§3.1), once Jeff has made the
   four decisions.
3. **Escape in the tabs** (§4.1): the in-tab layers join the order, as every
   app layer did in §0.189. Designed 9 Oct (three batches and a fourth; ten
   questions for Jeff first — §4.1).
4. **Deal data** (§4.2):
   - notes appended on the server;
   - a contact's Undo keeping the row's owner (an account's keeps it since
     §0.198).
5. **Email links** (§4.5): the `?deal=` reader, and the footer's preferences
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
- **How long a Google calendar connection lasts, and whether both sites can
  read it** (read 10 Oct):
  - **Answered 10 Oct (Jeff's screenshot):** Google Auth Platform → Audience
    on project `sales-pipeline-tracker` reads **Testing**, user type
    External, with one test user (jeffrussell1@gmail.com), 1 of 100 counted.
    Per Google's documentation (not tested here), while in Testing:
    - a connection's refresh token ends after 7 days. That likely explains
      the refused connection (§4.4), and the connection made 10 Oct would
      end around 17 Oct;
    - only listed test users may connect, so no rep or customer can connect
      a calendar today.
  - **Jeff's step:** "Publish app" is greyed out until the Branding page has
    an app name, a support email, a home page and a privacy policy link.
    - What to enter: the home page is `https://salespipelinetracker.com`;
      the privacy policy is
      `https://salespipelinetracker.com/privacy-policy.html` (live 10 Oct;
      its §2.3 covers Google Calendar); the terms link, optional, is
      `/terms-and-conditions.html`; `salespipelinetracker.com` goes under
      Authorized domains.
    - Then Audience → Publish app.
    - After publishing, per Google, connections stop ending after 7 days
      and anyone may connect. Until Google verifies the app (calendar
      access is a "sensitive" scope), users see an "unverified app" warning
      and a 100-user limit. Verification is §2.3's.
  - **Done 10 Oct (Jeff's screenshots):** the Branding page saved the
    logo (Claude's 120×120 PNG of the rising-bars icon), the home page,
    privacy and terms links, and two authorized domains
    (`salespipelinetracker.com`, `accelerep.netlify.app`, so dev connects
    through this same project). Google then ran its branding check
    ("Branding verification issues") and found two problems:
    - "The website of your home page URL … is not registered to you."
      **Jeff's step:** Google Search Console, signed in as
      jeffrussell1@gmail.com: add a Domain property for
      `salespipelinetracker.com`, put its TXT record in the registrar's DNS,
      press Verify, then wait 24 hours as Google asks. **Done 11 Oct, about
      20:30 UTC (Jeff's screenshot "Ownership verified"):** a URL-prefix
      property `https://salespipelinetracker.com/`, verified by "Domain name
      provider". The TXT record is in Netlify DNS (the domain's nameservers
      are `dns1–4.p02.nsone.net`, Netlify's). Keep the record: Google
      re-checks it. The 24 hours end about 20:30 UTC on 12 Oct.
      `accelerep.netlify.app` will want the same before verification
      (§2.3).
    - "Your home page does not explain the purpose of your app." It was
      true: a signed-out visitor saw only "Sales Pipeline Tracker — Sign in
      to continue". §0.195 puts the purpose and the privacy and terms links
      on the sign-in page; shipped 11 Oct (the thirty-second ship), live
      on salespipelinetracker.com from 13:36 UTC.
  - **The app name** (Jeff, 10 Oct: "AcceleRep"). Google's App name still
    reads "Sales Pipeline Tracker", and so does Clerk's sign-in box ("Sign
    in to Sales Pipeline Tracker", Clerk's own application name). **Jeff's
    steps:** set "AcceleRep" in both, Google → Branding → App name and Clerk
    → the application's name (both instances). §0.195 renamed the app's own
    screens and emails.
  - **Then:** in the branding panel, choose "I have fixed the issues" →
    Proceed, and on Audience → Publish app.
  - **Branding verified (Jeff's screenshot, 11 Oct):** Google → Branding
    reads "Your branding has been verified and is being shown to users".
    The App name is "Accelerep" (Google's check passed with it; since
    §0.197 the app's own screens and emails spell it the same — Jeff, 11
    Oct: "change it to Accelerep"). Clerk's application name reads "Accelerep" too
    (Jeff's screenshot; both sites' sign-in boxes, read signed out 11 Oct:
    "Sign in to Accelerep"). **Published 11 Oct (Jeff's screenshot):**
    Audience reads "In production", user type External, 1 of the 100-user
    cap; the project's display name is now "Accelerep" (its id is still
    `sales-pipeline-tracker`). Until Google verifies the app (§2.3), people
    who connect see the "unverified app" screen. **Reconnected 11 Oct
    (SELECT only, `user_calendar_connections.updated_at`):** all three of
    Jeff's connections were refreshed after the publish — UKG (prod)
    21:02:20 UTC, `org_3B8Tg9Ot…` 21:03:52, Accelerep Test (`org_3BDQ…`, the
    13 Aug connection) 21:04:51. A token issued in Testing may keep its 7-day
    life (Google's documentation, not tried), so none is left from Testing.
  - Dev and prod share one database, so a calendar connection made on one
    site is read by the other. If the two sites' `GOOGLE_CLIENT_ID` /
    `GOOGLE_CLIENT_SECRET` or `SETTINGS_ENCRYPTION_KEY` differ, the other
    site's reads fail with no message and show an empty calendar (§4.4).

### 2.2 Around the next ship to prod

- **UKG's fiscal year starts in October, but no start is saved** (SELECT,
  15 Oct 22:41 UTC: `fiscal_year_start` null — Jeff's October pick on the
  old Fiscal year page changed nothing, as October was already shown, and
  saved nothing). Since §0.203 — shipped 16 Oct 03:28 UTC — a company with
  no saved start reads January, so UKG's screens and scheduled reports now
  read Q4 FY2026 and a January year. Jeff: open UKG's Settings → Company →
  Fiscal year — it now reads "Not set — January" — pick October, Save;
  then strike this.
- **Reload every app tab opened before the thirty-ninth ship** (Deployed:
  dev 03:26 UTC, prod 03:28 UTC, 16 Oct — it covers the thirty-eighth's,
  15 Oct 17:59 UTC, the thirty-seventh's, 15 Oct 01:30 UTC, the
  thirty-sixth's, 14 Oct 12:59 UTC, and the thirty-fifth's, 13 Oct 20:25
  UTC, too): an older tab keeps the screens from before §0.199, §0.200,
  §0.201, §0.202 and §0.203 — the task rail's completion, a New Job's
  copied links, the task popups, the Technicians form's login picker, the
  member profile page's save, the Sales Manager tab's quota board and the
  Fiscal year page among them; an older tab's Save quotas answers 200 and
  stores no quota (the server keeps the stored figures). Reload, then
  strike this.
- Nothing else open. The thirty-ninth ship (16 Oct, 03:28 UTC: §0.203, a
  Sales Rep's quota is a plan per fiscal year — the quota batch; dev and
  prod in one sitting), the thirty-eighth (15 Oct, 17:59 UTC: §0.202, a
  member's save changes a member this org holds — batch 4b-2a), the
  thirty-seventh (15 Oct, 01:30 UTC: §0.201,
  Dispatch's links name live rows of this org — batch 4b-1), the
  thirty-sixth (14 Oct, 12:59 UTC: §0.200, a
  task alert interrupts only the member it is for), the thirty-fifth (13 Oct,
  20:25 UTC: §0.199, a link names a live row of this org), the thirty-fourth
  (13 Oct, 02:50 UTC:
  §0.198, a pick saved as the record picked, and an edit leaving untouched
  links out), the
  thirty-third (11 Oct, 23:42 UTC: §0.196, one name
  per member of an org, and §0.197, the "Accelerep" spelling), the
  thirty-second (11 Oct, 13:36 UTC: §0.195, the AcceleRep sign-in page), the
  thirty-first (10 Oct, 21:08 UTC: §0.194, the
  account search fix) and the thirtieth (10 Oct, 15:06 UTC: §0.191, §0.192
  and §0.193, the PROD Closed Lost fix among them) are recorded in the state
  header, as are the twenty-ninth (9 Oct) and the Clerk cleanup after it.
- Jeff's own look on PROD: "ineos" and "arkema" in New Contact → Company and
  New Deal → Account (the pane check used made-up rows, not UKG's).

### 2.3 Before selling

- **Google's verification of the calendar app** (10 Oct; from Google's
  documentation, not tried). Calendar access is a "sensitive" scope.
  - A published but unverified app shows customers "Google hasn't verified
    this app" and stops at 100 users.
  - Verification is done in Google Auth Platform → Verification Center. It
    asks for proof the domain is owned (Google Search Console), a short demo
    video of each permission in use, and a written reason for each. It can
    take days to weeks.
  - Recommended: publish now (§2.1), and submit once §3.6's real Google
    meetings are built. That work adds the events permission, and one
    verification then covers both.
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
  - Second question: should dev and prod keep sharing one Neon branch? (Its
    own item below, since 15 Oct.)
  - Source: §9, as recorded.
- **One login, one technician, held by the database** (§0.201's review; Jeff,
  14 Oct: "Do it before selling" — the others offered were "Do it next" and
  "Leave it as is").
  - The rule is a read before the save (`loginOf`,
    dispatch-technicians.mjs): `dispatch_technicians` has no unique index on
    `(org_id, user_id)`, so two saves at the same moment linking one member
    to two technicians both land.
  - An Admin's restore checks only that a login is a member's: a hand-built
    file can land a technician holding a login another technician holds, and
    keeps a restored job naming itself as its follow-up or parent. The app's
    export has no Dispatch section, so only a hand-built file reaches either.
  - Then the member's sign-in resolves to whichever row the database returns
    first (`_techScope.mjs`, no order): their jobs may be another
    technician's, or none — within the org only.
  - Today: one linked technician across every org (the census, 14 Oct), so no
    duplicate.
  - The work, a batch of its own: a read-only SELECT for duplicates; an
    additive partial unique index (`WHERE user_id <> ''`) applied by an apply
    script to the shared database and the test database; its 23505 answered
    as the 409 the read gives; the restore clearing a login another
    technician holds, and a job's link to itself. A schema change on the
    shared database: Jeff confirms the apply step.
- **A scalability check** (Jeff, 15 Oct: "how many users it can support").
  Not measured. The likely limits are the app's design, not its user count:
  - screens that load a whole list into the browser — the list hooks for
    tasks, deals, contacts and accounts read whole lists (whether the server
    pages any of them is not yet checked);
  - the six scheduled jobs, each sweeping every org — a run grows with orgs
    and data against Netlify's time limit for a function;
  - plan limits and cost — Clerk (monthly active users; members per org, the
    item above), Netlify (function calls), Neon (compute, connections),
    Anthropic (AI requests per minute), Resend and Twilio (sending).
  - The work: set targets (orgs, users per org, records per org, peak users at
    once); a read-only scalability map first — every server call's query
    (paged, or a whole table?), every list screen, each scheduled job's work
    per run — ranked by risk; then, on a staging copy (a Neon branch and a
    Netlify branch deploy — never the shared database, never UKG), a
    data-volume test (one org filled to the targets, every screen and call
    timed), a load test (k6 or Artillery), and the scheduled jobs timed
    against many orgs.
  - Moving to AWS or Azure first: not recommended (15 Oct). Netlify's
    functions and Neon already run on AWS, the limits above move with the
    app, and the stack stays portable (Postgres behind Drizzle, plain Node
    handlers, Clerk anywhere). Revisit on a concrete trigger: a customer's
    requirement, cost, or a platform limit no redesign avoids.
- **Separate the dev and prod databases** (Jeff, 15 Oct). Both sites share
  one Neon `main`, so a dev test, a bad migration or a seed reaches
  production data — UKG's included, Jeff's real work data. Recommended: prod
  keeps `main`; dev moves to a Neon branch of its own (a branch copies the
  data as it stands), dev's `NETLIFY_DATABASE_URL` pointed at it; a schema
  change then applies to dev first and prod after. Decide with the Clerk
  Production move above (its new org ids orphan rows either way). Before
  customers, also: confirm a point-in-time restore works (Neon offers it; not
  yet tried), and add error tracking and alerts.
- **New customer onboarding flow; billing integration.** §9, as recorded.

### 2.4 Decisions

- **AI scoring's four decisions:** see §3.1.
- **QuickLog's "📅 Add to Google Calendar"** promises an event and makes
  none. Wire it to `fireActivityCalendarEvent`, or remove the box.
  §0.169 (f).
  - Read 10 Oct: wired, it would add an all-day event dated today, recording
    the activity logged. That is not a meeting. The read-only Google
    permission would most likely refuse it, with only a console warning.
  - With §3.6's real Google meetings (Jeff, 10 Oct), recommended: remove the
    box.
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
    collapsed, trimmed and lowercased. It closes the race §0.196 leaves: every
    check reads, then writes, so two writes at one moment can still make a
    pair. It cannot be built while any pair exists — none did when read 11
    Oct (SELECT only: 6 orgs, 23 members) — and Postgres's whitespace class
    differs slightly from JS's. Jeff, 9 Oct: "Record now, decide later".
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
    **Keep the site as the survivor** (read 11 Oct, merge.mjs): a merge
    re-points tasks, activities, dispatch rows and (since §0.198) deals by
    id, but contacts only by name, and both copies share the name. Archive
    the site and its 2 contacts keep its id and leave the survivor's People
    list. Since §0.198 (D22) a merge into a site also moves the deals of the
    copy merged away — by id, and with no id by the name only these two
    share — up to Shell, Site Name "Shell - Port Allen". This merge moves
    none: the copy holds no deal, and no UKG deal is named "Shell - Port
    Allen" (SELECT 12 Oct).
  - PROD, UKG: "INEOS WL Plastics - Bowie" sits under INEOS Pigments, not
    "INEOS - WL Plastics" (SELECT 9 Oct). UKG's 6 deals whose account is a
    site each want the site's parent as the account and the site as the
    Site Name. SELECT 12 Oct: each holds the site's own id; the sites stand
    straight under BASF (3), DTE Energy, OxyChem and Shell; 3 are open and
    3 closed; 2 have no Site Name. §0.198's D22 does not move them — it
    moves only the deals a move or a merge would leave on a site, and a
    delete's Undo moves no deal — so they
    stay until changed by hand (the deal window: pick the site's row in
    Account, which fills its parent and the Site Name, D5, then Save).
  - DEV (Accelerep Test, org_3BDQ): two names saved twice in two
    spellings, "INEOS"/"Ineos" and "TransMountain"/"Transmountain" (a
    designer's SELECT 9 Oct, not re-read). Merge each pair in the app.
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
- **Microsoft (Azure) OAuth and Yahoo Calendar:** deferred. Read 10 Oct:
  the code that reads Outlook meetings exists, offered only in the
  Admin-only Settings → Connected apps (Home and the profile's Calendar tab
  offer Google only). It passes Outlook's times on with no time zone, and
  Microsoft answers in UTC unless asked otherwise (its documentation; not
  tested), so Outlook meetings would likely show at the wrong hour. Yahoo is
  not read at all.
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

### 3.6 The calendar: a real view, and real Google meetings (Jeff, 10 Oct)

Read 10 Oct (a workflow: three readers and a skeptic; the code at `c9d4b17`;
the database, SELECT only). Jeff asked whether, once the calendar items are
done, he can see his calendar on a day with no meetings, and add meetings to
it. Today the Tasks tab's Calendar view (beside List) draws one day, 8 am to
6 pm: Google meetings in green, timed tasks in blue, booked or not. Home shows
only a status line. No other item on this list adds a calendar view or a way
to add meetings. Nothing in the app adds a meeting to Google:
- the connection asks Google for `calendar.readonly`
  (calendar-oauth-start.mjs);
- the one add-event function (calendar-add-event.mjs) makes all-day events
  only;
- no screen ever sends it a request.

- **The view** (Jeff: "Build up Tasks → Calendar"):
  - it loads its own meetings for the day or week on screen. Today it reads
    what Home fetched: today and the next six days, after Home has been
    opened in that org;
  - a Week view;
  - all-day meetings drawn (today they are counted in "This week", not
    drawn);
  - the real last-synced time ("Synced · Google · 2m ago" is fixed text);
  - Home's meeting line links to it;
  - a block opens what it shows, and an empty hour offers a new meeting
    (nothing on the grid can be clicked today);
  - one clock for Google times: the grid places a meeting at the clock time
    in its own offset, Home in the browser's time, so the two can disagree.
- **Real Google meetings** (Jeff: "Yes, real Google meetings"):
  - a "New meeting" with a start and end time, a place and invitees, put on
    the user's Google calendar with invites sent;
  - editing and deleting follow it (Google's event id kept);
  - a success or failure message;
  - the Google permission widened from read-only to events
    (calendar-oauth-start.mjs), and that permission added on the Google Cloud
    consent screen (Jeff's step);
  - every connected person presses Reconnect once (today: Jeff's three
    connections, one per org);
  - decide who may add to a company calendar: calendar-add-event falls back
    to it with no role check today;
  - recommended: remove QuickLog's "Add to Google Calendar" box rather than
    wire it (§2.4).
- **A question for Jeff:** only the main (primary) Google calendar is read,
  100 events at most. Meetings kept on other Google calendars do not show; a
  calendar picker would fix it.
- Its place in §1's order: not yet set.

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
    under a menu; Accounts' Filters panel drawn twice; Pipelines' ⋯ menus
    never closing on an outside click; the shortcuts list above the rails
    now or later.
- **The shortcuts list opens under an open rail or the deal window.** Its z
  is 9998, under every rail and the draggable windows; "?" opened it with a
  contact rail and with a new-task rail open. A z above them, with its place
  in the order, is the fix. §0.189 (b), 8 Oct.
- **Layers drawn that nothing opens** (tests/open-states.test.mjs records each
  in KNOWN; giving one a way in, or retiring it, updates KNOWN):
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
  closed it. Read 10 Oct: App.jsx empties the events on an org switch,
  before the new org's load. This was read in the code, not seen in the pane.
  Likely closed: confirm in the pane, then remove.
- **Home says "Connect your calendar" while it loads, and when the load
  fails.** HomeTab checks only the connected flag, which is off until the
  answer arrives. A connected user sees the prompt for a moment on every load
  and org switch, and in place of an error. The profile's Calendar tab shows
  the error. Recommended: "Checking…", then an error with Retry. Read 10 Oct.
- **The profile's Calendar tab reads what Home fetched.** After an org switch
  made from another tab, a connected user sees "Not connected", OFF and
  "Connect Google Calendar", with no Refresh. Read 10 Oct.
- **Three dialogs on the legacy `.modal` class** (confirm, prompt, blocked
  delete). The guide wants inline chrome. §0.136, as recorded.
- **Log from calendar is dead code.** Its state and two handlers have no
  caller. Wire it or remove it. §0.175 (a).
- **A popup a checker opens while ModalLayer's crash notice shows is not
  drawn, and takes the Escape of the layers below it** (§0.200's review,
  read in code). After a crash in a layer the due checker starts a new
  round (since §0.185) and the reminder checker shows the next waiting
  (since §0.200), but LayerBoundary draws its notice in ModalLayer's place
  until the notice is dismissed; App's Escape finds the popup on top and
  leaves it to the popup's own Escape, which is not mounted — the
  shortcuts, notes, search, profile and notification panels do not close on
  Escape meanwhile. Recommended: hold both checkers while the boundary shows
  its notice.

### 4.2 Deals, activities and pipeline

- **Quotas — what the quota batch left** (§0.203's design and review, 15
  Oct; read in code):
  - Reports has no fiscal-year picker: each view reads this fiscal year's
    plan; and custom dates carry no quota (a prorated one is not built).
  - A team's quota counts every member the slice names — deactivated,
    invited and non-rep members included — by one rule nowhere.
  - Attainment's numerator differs by screen: close day or forecast date,
    with or without implementation cost.
  - The Sales Manager tab's health score (and the digest's) measures a
    quarter's wins to date against the whole quarter's quota, so early in a
    quarter every rep reads at risk; a months plan would allow pacing.
  - The board on a phone, and Home's card on a phone, are not laid out.
  - A Dispatcher's or Read-only member's Reports read no rep's quota (their
    copy of the member list carries none; only their own row is filled),
    and Home's quota card shows for members no plan can be set for — an
    Admin, Manager, Dispatcher or Technician reads "No quota set".
  - Dead code: `src/components/QuotaRepCard.jsx` (imported nowhere, with
    the whole-row save-as-you-type shape §0.170 removed) and unread locals
    in SalesManagerTab.jsx.
  - The Fiscal year page's side panel counts are invented.
  - The Teams page's "QUOTA Q" column and the member profile page's
    static "—".
  - sanitize still carries the old keys (`annualQuota`, `q1Quota`…,
    `quotaType`), kept as stored; remove them from the code and the pin
    (never from storage).
  - Month-by-month attainment; a quota CSV import; a "Copy last year's
    plans" button and a last-quarter reminder.
- **A screen loaded before another change saves its old copy of the fields
  that are not links** (the pre-ship sweep, 12 Oct — older than §0.198,
  whose pre-ship round leaves only untouched LINKS out). The contact rail
  sends the whole row: a stale owner (and a rep can re-claim a row unassigned
  since) and org-chart lists (managers, direct reports) go back. The account
  rail sends its name — the rename cascade then copies the old name onto the
  account's deals and contacts — and its owner. The deal window sends every
  field but its untouched links. The Tasks tab's snooze and Complete send the
  task row they hold, a merge's moved links with it; Reports' persona edit
  sends the contact row. Since §0.199 a stale row naming a link the stored
  row no longer holds, whose record was deleted since, is refused, and the
  Tasks tab's Complete and snooze, Home's complete toggle and Reports'
  contact and persona edits swallow that refusal — a silent roll-back, or
  nothing (§0.199's review); the task rail's Complete says it (§0.199's
  re-check). Recommended: the same rule as the links (send what
  changed), or a stale-row check on the server (`updatedAt`). Jeff decides.
- **An empty value on a task's chips or an activity's list is stored as
  before batch 4** (§0.199's re-check; read in code): batch 4 asks no link
  for `''`, and each sanitize stores what it did. A task PUT with
  `contacts: ''` stores the empty string in the jsonb chips column (tasks.mjs
  sanitize, `?? null`); an activity PUT with `contactIds: ''` rebuilds the
  list from the stored `contactId` (activities.mjs sanitize), dropping the
  other contacts it held. Which screens can send either was not read.
  Recommended: read `''` as an empty list in both sanitizes.
- **After a merge, the merging session does not read its contacts, tasks or
  activities again** (the pre-ship sweep; older than §0.198): useMerge
  re-reads accounts and deals (contacts after a contact merge). A contact
  merge moves deals' and tasks' contact ids on the server; the session's lists
  keep the old ones. An untouched link is no longer sent back (§0.198's
  pre-ship round); a touched screen still sends its copy of the rest.
  Recommended: re-read contacts, tasks and activities after every merge.
- **A lead's Convert opens the deal window empty** (the fix review of §0.198's
  pre-ship round, 12 Oct — older than §0.198; read in code only, to confirm in
  the pane as Karen before acting). LeadsTab.jsx's convertLead opens the window
  with no deal (`setEditingOpp(null); setShowModal(true)`) and hands it the
  prefill 50 ms later; OpportunityModal takes its fields from `useState`
  initial values, once, and has no key in ModalLayer.jsx, so the prefill never
  reaches it — no name, account, rep or revenue from the lead — while the lead
  is marked Converted at once (`saveLead(…, { status: 'Converted' })`). The rep
  retypes everything, or closes the window and is left with a converted lead
  and no deal. Recommended: hand the window its seed in the same handler that
  opens it (or key the window on its deal), and mark the lead Converted only
  once the deal is saved. §0.198's state entry names this item.
- **A deal with an empty Account text cannot be saved untouched** (the
  sweep; as in prod): the window asks "Account name is required" even when
  the deal holds an account id. Minor.
- **Log Activity from a contact whose account was merged into one the
  caller's list does not hold** (the sweep): a new activity's untouched
  Company is refused, and the picker offers Create, which would make the
  survivor again. Recommended: hold the survivor by id, or say "ask your
  manager" as `siteOutOfReach` does. A rep cannot link anything to a
  merged-away account whose survivor is outside her list either, and the
  "merged" line does not name the survivor (the pre-ship audit).
- **An activity opened before the accounts list holds its account** shows an
  empty Company while holding the link; a deal picked then fills it with the
  deal's account (the sweep; worse in prod, where an untouched Save erased the
  link). Timing only; how often it happens is unverified.
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
    the names the viewer's list resolves ("First Last", no title) and never
    updates the app's copy. Since §0.198 it sends the deal's id and its
    contacts alone — it sent the whole row the report loaded, which
    re-linked a deal another session had moved to another account and
    reset its Site Name — as KanbanView's stage drag sends the stage alone.
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
  draws; ModalLayer passes no handler). §0.192, as recorded. The dead code
  beside it — `NestedNewContactForm`, `showAccountSuggestions`, the props
  `onSaveNewContact`, `onSaveNewAccount`, `onAddContact` and
  `onOpenNestedAccount`, and ModalLayer's handlers for them — was deleted
  in §0.198 (D20, 11 Oct). The button and the `nestedModal` state it sets
  (read nowhere) stay until the button is decided.
- **The deal window's Sales Rep list reads a name with no null guard**
  (`u.name.toLowerCase()`). Whether any `settings.users` entry lacks a name
  was not checked; a row without one would throw while the window draws.
  Read 9 Oct (§0.194's review). The Site Name lookup's
  `a.name.toLowerCase()` went in §0.198: sites are found by id.
- **The account delete guard reads a deal with no `accountId` by name**
  (useAccounts.js and _openDeals.mjs, read 11 Oct). 28 of the 85 deals carry
  none (SELECT 12 Oct: org_3BDQ 23 of 51, UKG 2 of 17, org_3B8T 3 of 3,
  org_3K6L 0 of 14); the other 57 carry an id, each naming an account of the
  deal's own name in its org, and the guard reads those by id. A deal with
  none keeps none until its Account is picked or changed (an untouched Save
  keeps the link as stored), so an open one named after two accounts would
  block deleting either; no UKG deal is named "Shell - Port Allen".
- **A delete's Undo cannot put an account back under a parent deleted or
  merged away since** (§0.198; an Admin's, and rare). Since §0.198's fix
  rounds the Undo is a restore: the delete answers its row and each
  sub-account as stored when its write ran, and the Undo re-sends exactly
  those — each deleted row and each promoted sub-account with its fields,
  its parent, its tier and its owner as stored (not the date it was
  created: below), legacy shapes included (a tier-'account' row under an
  account, a business unit at the top), and no territory rule met —
  checked that the tier is one the rule knows, that the parent is a live
  account of the org, no site, under which no loop forms, and that no
  account under it would not rank below it. The server honours the mark
  for an Admin alone, and on a PUT only for a top-level row the body names
  a parent for (the Undo always names one); one for a row that has a
  parent now, moved by another session since the delete, is refused 409
  ("“K” was moved since the delete — not put back."), never run as a move
  (§0.198's sixth fix round, from the behaviour critic's finding: as a
  move it overrode that session's move, and D22 could move every deal of
  the row up). It moves no deal. So a parent that is gone refuses it, and
  so does a sub-account added under the lifted account since that would
  not rank below it (a business unit under a business unit, anything under
  a site; a site under a business unit stands), and the toast reads "Could
  not restore …", naming the account refused. A row stored before the rule
  under the lifted account that does not rank above it refuses it too —
  the Undo put such a row back exactly before §0.198's fifth fix round;
  none in today's data (SELECT 12 Oct, all 829 accounts: the 13 that do
  not rank above their parent each stand straight under a top-level
  account, so no delete lifts one's parent). A refused re-save leaves the
  Undo taken in part: the deleted row is posted back, the sub-account
  refused stays where it stands, and the list is read again. Before
  §0.198 it restored as it was, under a parent id that named no account.
  Recommended: keep the refusal.
- **A delete's Undo can put a business unit back under a business unit
  when the deleted account's own parent is re-tiered before it** (§0.198;
  the behaviour critic, 12 Oct; rare, an Admin's). The restore checks the
  parent it puts a row back under for being there, itself, a loop, a site
  and a merge — not for its tier now. P a business unit under the account
  G, a site K under P: P deleted, then another session moves G under H (G
  a business unit now); the Undo posts P back under G as a business unit
  and K under P as a site — a unit under a unit, four levels deep (201,
  200). The delete answers no parent's tier, so the restore cannot tell
  this from UKG's 13 tier-'account' rows straight under an account, which
  it must put back as stored — a plain rank check would refuse those too.
  Beside the refusal over a sub-account added since (the item above),
  which covers the child's side. Recommended: have the delete answer each
  parent's tier as it stood and the restore refuse when that tier differs
  now, with an integration test, in its own batch.
- **A delete's Undo does not put back what the delete re-fitted below the
  accounts it lifted** (§0.198; the mechanics critic, 12 Oct). The lift
  re-fits a row stored before the rule under a lifted sub-account (an
  account under an account becomes a business unit), and the Undo re-sends
  only the rows the delete took and the sub-accounts it promoted, so that
  row keeps its new tier. A SELECT of 12 Oct (the critic's): 13 rows stored
  so misfit, none under a row that itself has a parent, so no delete of
  today's data meets it.
  Recommended: keep; or have the delete answer those tiers too and the
  Undo put them back.
- **A delete's Undo does not put back an account's created date, its
  merge mark or its last-edited time** (§0.198; the critics, 12 Oct). The
  restore re-posts what the account form saves, its parent, tier and owner
  — not `createdAt`, `mergeArchived`, `mergedIntoId` or `archivedAt` — so
  every row posted back is dated the Undo (the column's default) and reads
  as last edited then. §0.198's fifth fix round carried the created date
  back; the sixth took it out again: the app's driver (`@netlify/neon`
  loads the CommonJS copy of `@neondatabase/serverless`, which drizzle's
  type-parser override does not reach) reads a `timestamp without time
  zone` in the function process's own time zone (state §0.91), so a date
  read back and written again moves by that zone's offset — on Jeff's
  machine 5 or 6 hours. The Accounts tab lists merge-archived accounts (§1
  item 1, "Also seen"), and an Admin may delete one: its Undo brings it
  back as a live account, offered in the pickers again. Recommended: carry
  the merge mark on a restore (its survivor checked in the org), or leave
  merge-archived accounts out of the Accounts tab's delete; carry the
  created date only as text (the delete answering `created_at::text`, the
  restore writing it back so) or once the driver's parser is fixed for
  every read (a wider change — put to Jeff).
- **A delete's batch can miss a sub-account added inside its own
  transaction** (§0.198; the server critic, 12 Oct). The batch reads the
  sub-accounts it answers, deletes, then lifts whatever still names the
  deleted account — separate statements in one HTTP transaction at the
  server's default isolation (drizzle's neon-http batch names none), so a
  sub-account another session commits between the read and the lift is
  lifted but missing from the answer, and the Undo does not put it back
  under the restored account. Rare: the window is inside one round trip.
  Not closed in §0.198: drizzle 0.45 can write the lift as one statement
  that returns the old parent and tier (`update().from()` over a select of
  the same rows), but how Postgres re-reads that select under a concurrent
  write was not proved — the sandbox had no database. Recommended: that
  one statement, with an integration test, in its own batch.
- **D22's edges** (§0.198; Jeff, 11 Oct: "Move them up"). A move that makes
  an account holding deals a site, and a merge into a site, move those
  deals up to the account above the site, Site Name the site, in the same
  write; the merge's Undo puts them back. A merge that lifts its survivor
  to the top level makes it an account, so the deals it takes are not left
  on a site. A screen loaded before either keeps the lift when it saves.
  Left:
  - deals already on a site before §0.198 are moved by nothing — a
    delete's Undo included: UKG's 6, each on the site's own id (SELECT 12
    Oct; §2.4);
  - a deal with no account id is moved by its name only where no other
    account has the name (UKG's "Shell - Port Allen" twins: neither's by
    name, unless they are the two merged), so such a deal stays named after
    the site;
  - a merge into a site that already stood at the top level (stored before
    the rule) leaves the deals on the site;
  - a merge moves the merged-away account's deals, not the survivor's own
    deals already on the site;
  - an account edit has no Undo: moving the account back does not move its
    deals back;
  - a screen loaded before a merge into a site that has been deleted since
    is refused 404 when it saves the merged-away id: the walk cannot reach
    the account above a site that is gone (one into an account deleted
    since, a site with no account above it, or a site moved since, still
    saves); and one into a site that has since been renamed AND moved is
    refused 400 as a site: the walk knows the site the deal was lifted
    through only by the name the deal's Site Name holds, and an account
    rename does not reach a deal's Site Name (the lens critic's L9, 12 Oct);
  - accepted (the lens critic's L6, 12 Oct): a site's id sent directly whose
    name the deal's Site Name holds, while the account the deal holds is no
    site, is read as the site the deal was lifted through — the link kept as
    stored, 200, the rest of the save standing — where until §0.198's third
    fix round it was refused as a site; the code checks the name, not how
    the deal came to it;
  - a deal linked onto a lifted account in the seconds between a delete
    and its Undo stays on it when the Undo puts the account back as a site:
    the Undo restores exactly and moves no deal — it cannot tell a deal
    linked since from one on the site before the delete (§0.198's fifth fix
    round: placing such a re-save as a move moved every deal of the site
    up, open or closed, its Site Name overwritten) — so it is changed by
    hand (the deal window: pick the site's row in Account, D5);
  - an Admin's marked PUT naming a parent for a top-level account no
    delete lifted is taken as a restore — only a forged body sends one: the
    Undo marks only rows its delete lifted — and is written as sent, so a
    never-deleted top-level account made a site keeps its open deals on the
    site: a restore runs no D22 (§0.198's fifth fix round). The server
    cannot tell such a row from one a delete lifted; a server-side "was
    lifted" marker would, if it is ever seen.
  Recommended: keep (each is rare, or data from before the rule).
- **A deal's notes are saved as the whole list.** Two people saving at once
  keep the last list, so a note is dropped. Recommended: a server-side
  append, or a version check. §0.177 (a).
- **A contact's Undo can change its owner.** A re-POST with no owner is
  stamped with whoever pressed Undo. §0.178 (b). Since §0.198 an account's
  Undo (an Admin's restore) keeps the stored owner — an unassigned account
  stays unassigned, and one whose owner has left the org since comes back
  unassigned with no owner name — and meets no territory rule.
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
- **Notes a save refused while the task rail still shows them are dropped
  by a close** (§0.199's sixth re-check; Jeff: "Fix these, then finish" —
  filed). When the completion's notes save is refused while the press's own
  rail is shown, the prompt keeps the notes and says why; Escape or the
  backdrop then closes the rail ("Let it close") and the next open empties
  the prompt — nothing carries the notes. Had the rail closed a moment
  earlier, while the save was out, they would have gone to a notice with
  "Log these notes". Older in kind: before §0.199 a refused notes save lost
  them with nothing said. Recommended: when the rail closes or moves on with
  refused notes in its prompt, push them as a notice of the same shape (the
  generation effect's cleanup, from a ref the refused branch fills).
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
- **A delete's Undo of a record that links a record deleted since is
  refused, and the record stays deleted** (§0.199; a deal's account since
  §0.198). An Undo re-posts the row as the list read it, and a create asks
  every link it names: a contact, task, activity or deal holding a link to a
  record deleted before its own delete — 2 tasks and 2 deals today (the
  census, 13 Oct) — comes back "That account is not in your organization —
  pick one from the list." and is not restored. Contacts deleted together
  whose org charts name each other refuse each other's Undo, one by one (no
  screen writes an org chart today). Recommended: an Undo marks its re-post
  a restore, as an account's does, and the server clears such a link (as a
  backup restore does) instead of refusing the row; a contacts Undo in one
  bulk request. Jeff decides.
- **A link followed to the record it was merged into keeps the name the
  screen sent** (§0.199, E2): a task's or an org chart's chip keeps its name;
  a contact's Company text and a deal's Contacts text are not renamed. Only a
  stale screen sends a merged-away record (the pickers leave them out since
  §0.198). As the merges leave names; with the first item above.
- **The link refusal's words fit another org's record, not a deleted one**
  (§0.199's review): a deleted record is now its common cause — Log Activity
  from a contact whose account was deleted shows "An account you can't open
  ×" and, on Save, "That account is not in your organization — pick one
  from the list." The × is the way out; the words point elsewhere. No screen
  reads the refusal's `field`, so a banner never names the field.
  Recommended: "That account is no longer in your organization — remove it
  (×), or pick one from the list.", the field named, and the deals
  endpoint's words with them. Jeff decides.
  Since §0.201 Dispatch's too, and for a link the screen chose itself there
  is no list to pick from: the units Schedule now, a drag and mass
  scheduling reserve (mass scheduling now keeps the words on screen); a
  Service Due skip or defer's customer and plan (the visit's words were
  "Customer not found"); a New Job from Service Due's copied plan.
  Recommended with the rest: "… is no longer in your organization — reload
  Dispatch and try again." where the screen picked it.
- **After a backup restore clears an activity's first contact, its
  `contactId` stays empty** (§0.199): the list keeps the rest, and the
  mirror is rebuilt from it only when a save names the contacts. Minor.
- **A task create with no status answers 500** (found by §0.199's
  integration suite; older): `tasks.status` is NOT NULL (default 'Open') and
  the create's sanitize writes `null` when none is sent. Every screen sends
  'Open'; only a hand-made request meets it. Recommended: leave the status
  out of the insert when none is sent, so the column's default stands.
- **Quotes: the server prices from the line's own list price** (the 4b-2
  map, 15 Oct; read in code): every line is priced from the body's
  `listPrice`, type and unit, the approval tier reads only the discount, and
  `products.minPrice` is never enforced — a rep can lower a line's list
  price at 0% discount and never need approval. Whether reps may set a list
  price is Jeff's call; once a line's product is checked (4b-2) the server
  could price from the catalog.
- **Quotes: the server takes two lines of one product** (the editor refuses
  a second; the version compare and the analytics assume one per product).
  No screen makes them; refusing them is quote-shape integrity, not tenancy.

### 4.3 Settings

- **The settings search ignores the org's Dispatch switch.** AdminView's
  search filters every workspace item, skipping the `dispatchEnabled` rule
  the tabs apply, so Dispatch settings are found by search in an org with
  Dispatch off. Read 9 Oct (§0.194's review).
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
- **The Company calendar page's "Connected holiday sources" card does
  nothing.**
  - Its Connect and Disconnect labels have no handler.
  - Its "Google Calendar · holidays@accelerep.com" row reads
    `settings.googleCalendarConnected`, which nothing sets.
  - Read 10 Oct.
- **Two saves PUT a member's whole cached row:** SalesManagerTab's
  forecast save (`saveUser`; quotas are their own request since §0.203,
  and every whole-profile write keeps the stored plans) and the Settings →
  Users profile page. A
  rename made in another session is undone by the next such save (the stale
  First/Last rebuild the old name), or, since §0.196, refused when another
  member holds the old name by then. SalesManagerTab shows "the server
  returned 409" without the server's words. Recommended: partial PUTs, as
  the Teams page and the profile panel send. Read 11 Oct (§0.196).
- **The Settings → Users profile page after a save:** its title band and
  crumb read the member as the page opened, so a rename shows the old name
  until the page is left; "Save changes" stays (the form is compared with that
  first copy); and an Admin renaming their own row there keeps the old name
  in the header until a reload (nothing sets their profile). §0.196.
- **The backup import window says "Existing records with matching IDs will be
  updated."** The restore inserts with `onConflictDoNothing`: a record whose
  id is already there is left as it is. Recommended: reword it ("… are left
  as they are") with the backup page's next pass, not in §0.196. Read 11 Oct
  (§0.196).
- **A restore that drops every member row and imports nothing else reads
  only "Import failed".** Since §0.196 a member row with no usable id or
  email is dropped and reported in `errors`; backup.mjs then answers 500,
  and BackupDetail shows `data.error` only. Before, such a hand-edited file
  imported. Recommended: show `data.errors` when the answer is not OK (one
  line), with the backup page's next pass. Read 11 Oct (§0.196's review).

### 4.4 Dispatch

- **Undo of a template a New Job starter applied keeps the template's
  values** (§0.199's second re-check; older — the base has the same lines;
  read in code and run on made-up forms). startBridgeJob (a won deal's
  placeholder) and startPlanVisit (a plan visit) apply the matched template
  and then store the templated form as `prevForm` (`form = next` before the
  note), so Undo and the template select's "— None —" put back the same
  templated form — crew, hours, licence and skills stay, and Create Job
  saves them — and a switch to a second template builds on the first (the
  first's skills carry over when the second names none). The comment at
  `EMPTY_JOB` and state's "Compounding
  guard" say `prevForm` prevents this; the select's own path stores the
  right baseline. Recommended: `const before = form;` before applying, and
  `prevForm: before`, in both starters.
- **A New Job save refused after it made the customer leaves it, and a
  retry makes another** (§0.199's re-check; read in code). handleSaveNewJob
  creates the customer (when none was picked), then the service location
  (when an address was typed), then the job, and keeps the new ids in
  locals only: the form still names no customer, so the next press makes a
  second customer of the same name (and, with an address, a second
  location). Any failure after the customer is made does it — the
  location's or the job's; since §0.199 a deal the dispatcher picked from a
  stale list (deleted elsewhere since) is one, while a won deal's
  placeholder's copied deal is left off instead. Older than §0.199 for
  every other failure. Recommended: write the made customer (and location,
  with the address it was made for) into the form, so a retry reuses them.
- **Batch 2 of §1 item 1: Dispatch takes the first of a name** (read
  11 Oct over 7e68f26):
  - A won deal's job placeholder finds its account with `a.id ===
    o.accountId || a.name === o.account` in one find (DispatchTab.jsx
    buildWonBridgeJobs), so a same-named account earlier in the list beats
    the deal's own id. The dispatch customer is found the same way. The New
    Job form saves both.
  - Quote -> job takes the first dispatch customer with the deal's account
    name (invoices.js resolveCustomerForOpp, over an unordered org list in
    quote-to-job.mjs) unless a customer is linked to the deal's account id.
    57 of 85 deals carry an `accountId` (SELECT 12 Oct; UKG 15 of 17), so
    the id step runs for most deals, and finds a customer only where one is
    linked by `accountId`.
  - New Job's "CRM accounts — not yet in Dispatch" hides an account
    whenever a customer has its name, so one twin vanishes once the other
    is linked. The customer form's "Linked CRM account" select lists bare
    names (the map; not re-read).
  - What these do with two matches (open New Job with no customer picked,
    or refuse quote -> job and name both) is designed with Jeff in batch 2.
- **A new job's customer is made from typed text** (batch 2). handleSaveNewJob POSTs a
  new dispatch customer whenever none was picked, so "Acme Inc" typed
  beside a saved "Acme, Inc." makes a second; the field's `linkedNames`
  compares raw lower-cased names, so that account still shows under "CRM
  accounts — not yet in Dispatch". §0.194 gave the field's two groups the
  matcher and a count, and left its exact check, Create and save as they
  were. The field lists on focus, so since §0.194 punctuation alone ("-")
  lists the first six of each group, as the empty field does (the old
  filter listed only names holding "-"), and Create “-” is offered as
  before. Read 9 Oct.
- **Technician mode loads four lists TechnicianView never shows.**
  §0.172 (c).
- **DispatchTab's job-template note** calls `equipmentIds` FK ids; they are
  kinds. §0.172 (b).
- **The accounts on-create duplicate probe has no caller.** §0.172 (d).
- **A user's Google calendar refresh token is refused** (`invalid_grant`) in
  the dev log. §0.173 (c). **11 Oct: likely closed by the cause's fix.** The
  consent screen had been in Testing, where Google ends a token after 7
  days. It is published now, and every connection was reconnected after the
  publish (§2.1). Remove this item if no `invalid_grant` shows in a later
  log; the "reads like an empty calendar" gap below stands either way.
  - Read 10 Oct (SELECT only): the three saved connections are all Jeff's
    (13 Aug, 15 Sep, 10 Oct, one per org). The refused one is one of the
    two older ones, or one since disconnected.
  - A refused connection, or one the other site cannot decrypt (§2.1),
    reads exactly like an empty calendar: calendar-events answers
    "connected" with no events, and Home says "Calendar connected — no
    meetings today".
  - Recommended: the server says "reconnect needed" for each refused
    connection, shown on Home, in the profile's Calendar tab and on Tasks →
    Calendar.
  - Filed here under Dispatch by its origin; it is the calendar's.
- **Dispatch load errors show only the status code,** not the server's
  message. As recorded.
- **CrewBuilderView's `unscheduledJobs` / `scheduledJobs`** are computed and
  never read. §0.118, as recorded.
- **Deletes leave Dispatch's links dangling** (§0.201's map, 14 Oct; read in
  code). A technician delete (API only — no screen offers it) leaves its
  jobs' crews, vehicles, units, customers' preferred technician and time
  off naming it — its scheduled jobs then vanish from the day board; a
  vehicle or unit delete clears nothing; a plan delete refuses only while a
  customer holds it, not a job or a plan visit; a job delete leaves units
  checked out to it (no screen checks a unit in). Since §0.201 a link held
  is never asked again (E3), so such strays stay until changed.
  Recommended: refuse a technician delete while jobs or blocks name them,
  and count jobs and visits in the plan delete's refusal. Jeff decides.
- **The app's own job writes store co-tech and reserved-unit lists as jsonb
  strings** (guide §18b62.4 unapplied; dispatch-jobs POST and PUT; the
  restore stores lists since §0.201). Every reader parses both.
- **Backups carry no Dispatch** (§0.201's map): the export writes no
  Dispatch section; the restore takes technicians, vehicles, equipment,
  customers, locations, jobs, line items and history from a hand-built
  file, never plans, plan visits or time off — so a restored job's or
  customer's plan is cleared wherever this org lacks it. Whether backups
  carry Dispatch is its own item.
- **A re-POST of a job with a partial body resets what it leaves out**
  (§0.201's map; latent — New Job always mints an id): the create is a
  full-row upsert.
- **A customer's plan that names no plan still counts as covered for
  renewals** (`renewalState`, planVisits.js): its renewal alert runs on the
  default lead.
- **Smaller, from §0.201's map:** Settings → Service plans' seed from legacy
  tiers derives `plan_legacy_<tier>` ids, so a second org's seed of a tier
  another org seeded is refused ("That plan id is already in use."); a
  re-run of Settings → Vehicles & equipment's legacy import resets an
  imported row's technician, holder and status (a full-row upsert); the
  crew builder prints a technician's vehicle id, not its name; the
  technician↔vehicle pairing is kept twice
  (`dispatch_vehicles.assigned_tech_id` and
  `dispatch_technicians.assigned_vehicle_id`), nothing keeping them in
  step; the restore stores Tier-1 rows' `ownerId` and a merged record's
  `mergedIntoId` as the file has them (decide with the restore's other
  questions).
- **Older, seen by §0.201's third re-check** (read in code): the Dispatch
  sub-tab buttons leave the Technicians form with no unsaved-changes
  prompt, and a save's answer is lost if the user leaves mid-save; a
  working-hours save from the week view, landing after a technician was
  opened in Technicians, leaves that draft stale — its next save sends the
  old week; the discard prompt's confirm button reads "Delete"
  (confirmDiscard passes danger).

### 4.5 Notifications, email and digests

- **Home's "On Your Plate" and greeting counts, and the phone's Tasks badge,
  count the whole org's tasks for an Admin** (§0.200's map, read in code;
  Jeff, 13 Oct: "File them"). Home reads `visibleTasks` — for an Admin every
  task of the org, for a Manager the Viewing bar's scope — and says "N
  overdue · N on your plate today"; the phone's bottom-nav Tasks badge counts
  overdue `visibleTasks` (App.jsx). The desktop header's Tasks and mention
  badges (AppHeader's `overdueTaskCount`, `mentionCount`) are never passed by
  App, so they never draw. Recommended: count the member's own and nobody's
  (`alertsMe`, guide §18b93) where the words say "your", and wire or remove
  the desktop badges.
- **No screen sets a task reminder** (§0.200's review, read in code; Jeff,
  13 Oct: "File it for later"). The reminder popup fires on a task's
  `reminderDate` and `reminderTime`; the window that set them (TaskModal) is
  gone, and no rail, form, import or job writes them — only a direct API
  write or an older row (none open, SELECT 13 Oct). §0.200's reminder rules
  are proven by tests/task-alerts.test.mjs and a pane check on made-up rows.
  Decide: a reminder field on the task rail, or retire the popup. With it:
  the server's task text fires at the due time (`task-reminders.mjs`), the
  popup at the reminder time; and a Technician's own tasks never pop up (the
  tasks GET returns a Technician none) while the text reaches them.
- **The bell's deal entries go to an Admin or Dispatcher for every deal of
  the org** (stale, closing within 7 days, close date passed; a Manager's
  the org's or their reps') — the class §0.200 closed for tasks; and in a
  switch's own commit, when another of the bell's inputs changes with the
  switch (a profile answer landing then), its deal and coaching entries are
  made from the last org's lists for one render: the badge's count only
  (§0.200's review, read in code; its task entries ask each row's org). A
  task entry does nothing when clicked (only a deal entry switches tabs).
  Recommended: decide whose deals alert whom, and ask each deal and note row
  its org.
- **A task popup's dismissal or snooze lives in the page's memory only**: a
  reload pops everything still due again, and an org switch forgets them
  (§0.200 keeps it so — Jeff: "Forget on a switch" for the reminder's
  snooze and queue). Read 13 Oct.
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
  - Since §0.203 a quota is a plan per fiscal year (`profile.quotaPlans`):
    the fix reads `quotaPlanOf` for the quarter's fiscal year, from the
    org's own start (`fiscalStartOf`), and says "No quota set" for none.
  - The jobs also read `profile.managedReps` and `profile.alertTime`, which
    nothing writes.
  - Source: §0.159; re-read 7 Oct.
- **The Slack digest template has no caller.** §0.187 (d).
- **The Tasks tab's mention dot never clears.** `feedLastRead` has no writer.
  §0.174 (d).
- **Imported leads fire no `lead.created` webhook or automation.** If that
  matters, it needs a batched dispatch. As recorded.
- **A quote's email shows every line as 1 × list price** (the 4b-2 map, 15
  Oct; read in code, not run — customers see it). quote-email.mjs reads
  `li.qty` and `li.unitPrice`, which no line stores (a line holds
  `quantity`, `listPrice` and `discountPct` — QuotesTab.jsx), so each
  emailed line reads quantity 1 at list price, its discount ignored, beside
  the quote's real total. The fix reads a line as QuotesTab's calcLineTotals
  does.
- **The `spiff.claimed` webhook is offered and never sent** (webhooks.mjs;
  WebhooksDetail.jsx — the 4b-2 map): spiff-claims.mjs never calls
  dispatchWebhook, as opportunities.mjs does for deals. A subscriber gets
  nothing.

### 4.6 Security, roles and audit (all within one org unless stated)

- **The task rail offers ✓ Complete and Edit to the Dispatcher and
  ReadOnly roles** (§0.199's re-check; read in code): its quick-action bar
  has no role check, while its Delete checks `canEditCrm`; Home opens the
  rail for every role. The server's `requireWrite` refuses the write (403),
  and since §0.199 the rail's Complete says the server's words — ReadOnly:
  "The task was not completed: Forbidden: read-only role"; a Dispatcher:
  "… Forbidden: a Dispatcher can view CRM records but not change them".
  Recommended: hide the bar where `canEditCrm` is false, as the Delete is.
- **Batches 4b-2 and 4b-3: the other linked ids with no org check** (the
  class sweep, 13 Oct; mapped again 15 Oct over 079b2bd — four readers and a
  critic, read in code; Dispatch's done in §0.201). Every reader found looks
  a stored id up in the org, so a stray acts as a dangling link, not a leak.
  The census (SELECT only, counts only, 15 Oct): no field names another
  org's row; 1 of 8 SPIFF claims names a SPIFF removed since — Accelerep
  QA's "Pane check SPIFF §0.169" (Jeff: demo data, "you can dump any non
  matching spiff"; he removes it with the claim Delete button once it ships;
  Claude deletes nothing).
  - 4b-2 (Jeff's decisions, 15 Oct): SPIFF claims' `opportunityId` (a deal)
    and `spiffId` (an entry of the org's SPIFF list); quote lines'
    `productId`; automations' create-task `assignedToId` (a member);
    members' `profile.teamId` (an entry of the org's teams) and pinned
    reports. Any record or entry of this org counts, inactive ones too, and
    anything else is refused, naming the field ("Any of this org's,
    refuse"); a link a row holds is never asked again. Pins are written only
    by the member's own Pin: an Admin's or Manager's member save stops taking
    them, and the Sales Manager tab's saves send only what they change ("Send
    only what changed"). A claim save that clears its SPIFF or rep answers
    400 (a 500 today), and a claim id this org does not hold answers 404 on
    every save (an Admin's or Manager's save created one); the rest of the
    claim rules filed ("(1) and (2) now, file (3)"). SPIFF claims, quotes and
    export runs answer 409 for an id another org holds; export runs store no
    schedule — no screen sends one and nothing runs schedules ("Fix these 3,
    file the rest"). The restore converts every date column of a table it
    restores and says how many rows a table could not restore — today it
    drops them silently (a member who changed team, an approved or sent
    quote, merged accounts and contacts, scored leads) — and clears, counted,
    a quote line's unknown product (the line kept), a member's unknown team
    (with its joined date) and unknown pins ("Fix both in 4b-2"). Added by
    Jeff: a Delete button on each SPIFF claim (Admins and Managers; the
    server already deletes, audited) and a clear Active / Inactive control on
    each SPIFF ("Clear Active / Inactive control"). The browser check may add
    a test SPIFF, product, team and rule in Accelerep QA, file a claim as
    Karen and approve it after its SPIFF goes inactive; Claude deletes
    nothing and writes nothing in UKG ("Yes, in QA only").
  - 4b-3: settings' teams, crews and quote templates' product ids, and a
    service plan's `visitTemplateId` (an entry of the org's job templates —
    found by the 15 Oct critic, in no list).
  - left as they are by design: tasks' `relatedTo` (free text in places),
    the recommendation log's id (a deal, task or customer by action),
    deals' `pipelineId` (a settings id, 'default' a sentinel).
  - a backup restore's other links: its clean-up (§0.199, §0.201) clears
    batch 4's fields, a deal's account and Dispatch's; these fields stay as
    the file has them.
- **Creates that crash on an id another org holds — the rest of the class**
  (the 4b-2 map, 15 Oct; read in code; Jeff: "file the rest" — one class
  batch with a scan test). The products, saved-reports, coaching-notes,
  lead-requests, recommendation-log, audit-log, export-dsr and
  export-schedules creates answer 500 for a client id another org holds,
  where batch 4's creates answer 409 (guide §18b92 rule 5); export-schedules'
  and export-dsr's PUT crash reading the upsert's empty answer. With them,
  the Export page: export-schedules' PUT builds the full row from the body
  (a fourth breach of CLAUDE.md's sanitize rule — every Edit blanks
  `createdBy` and `lastError` and re-enables a paused schedule), and
  nothing runs a scheduled export (netlify.toml has no runner).
- **Two jobs write the whole `settings.extra` back with no lock**
  (score-leads-batch.mjs, integration-requests.mjs; the 4b-2 map): one
  running beside an Admin's settings save can put back an older SPIFF or
  team list. The timing is not verified. A company's quota periods
  (`quotaPeriods`, §0.203) are one of its keys.
- **A restore keeps a restored member's login link and role from the file**
  (restorableMembers, memberName.js; backup.mjs — the 4b-2 map's critic):
  an Admin's restore gives the file's role to any Clerk identity in it that
  is, or later becomes, a member with no row here. Global ids limit it.
  §0.202's rule: no save links a row — a sign-in, an Admin's Clerk sync or
  an Admin's restore does, and the restore's is this item.
- **Automations: a deactivated assignee, and the rule save** (the 4b-2 map):
  the engine assigns a rule's tasks by id to a deactivated member while the
  rule editor shows that assignee as gone; the rule PUT has none of the
  create's checks — `actions: []` is taken, `null` is a 500 (NOT NULL),
  and the trigger is never checked against the list (the engine fails
  closed).
- **The backup restore counts the rows it sent, not those it restored**
  (§0.199's review; older): a row skipped because this org or another already
  holds its id is counted, so a second import of the same file reads "N
  records restored" and restores nothing; the snapshot's record count and
  the audit row say the same. Since §0.199 each insert answers the ids it
  wrote. Recommended: count those, and say "N already here" apart. Jeff
  decides.
- **Member names after §0.196** (the first two, Jeff, 9 Oct: "Record it for
  later"):
  - The "+ New Rep" window (UserModal) paints Work Email red for every
    refusal, a taken name included. The fix carries the 409's `field`
    through useUserHandlers → App.jsx → ModalLayer → UserModal. Since
    §0.196 its button reads "Back to the form" and the words say "name".
  - A first sign-in with no name in Clerk names the row by the FULL email
    (ensureRosterRow; asserted at integration-requests.itest.mjs:186), so
    reps see the address in every picker. The sync and a no-name invite use
    the address's front part. Recommended: switch to the front part, as its
    own small item.
  - A rename — what the name refusal asks for — leaves a rep's
    `profile.manager` on the old display name (the Settings → Users manager
    select stores names, and so would a Manager's `profile.managedReps`,
    which `dealVisibleTo` narrows by). Ids would end it. Read 11 Oct (§0.196).
  - users-sync reports every numbered member as name drift on every sync
    ("Pat Smith" in Clerk, "Pat Smith (2)" here). Nothing on screen reads
    `nameDrift` (the drift banner counts created, updated and dbOnly). §0.196.
  - The restore: a file row whose id another org holds is kept out by the
    insert, but while names are decided it still holds its name, so a later
    file row of that name can be numbered without need. Its note leaves the
    kept-out row out, and then says a member already has the name though
    only the kept-out row held it. A row with no name whose address
    variants are all taken is named by its id while the note says "by their
    address". Neither makes a pair. Recommended: say "already has theirs"
    only when a landed member holds the name, and "by their id" for the
    fallback. §0.196 (its review's fuzz: 5,767 of 300,000 made-up files).
  - The restore renames only the member. The records restored from the same
    file (deals, tasks, leads …) still carry the member's old name, which is
    now another member's: (1) a record with no app owner id (a backup from
    before owner ids) is resolved by that name on its next save
    (`keepsOwner` → `resolveOwnerId`) and moves to the member who has it;
    (2) a record with the restored member's id keeps its owner but shows the
    other member's name, and a Manager narrowed by name (`dealVisibleTo`,
    where `profile.managedReps` is set) follows the name. Before §0.196 the
    same restore made a pair, and every assignment by the name was a 409.
    Recommended: in the same restore, rewrite the owner name to the numbered
    one on this org's restored records whose owner id is a renamed member's
    and whose name is that member's old one; or say it in the note. Read 11
    Oct (§0.196's review).
- **The audit log after §0.143:**
  - (1) Thirteen files audit only their mass paths. A plain PUT on a deal,
    account, contact, lead, task or activity writes no server row; the
    client's bare `update` rows stand in.
  - (2) Rows carry no caller role.
  - (3) The panel reads the last 500 rows and wants paging.
  - (4) An account made by the account picker's Create writes no row at
    all (no server row, no client one), and the accounts POST checks no
    name against the org's: the dev org (Accelerep Test, org_3BDQ) holds
    "INEOS"/"Ineos" (§2.4). Read 9 Oct (§0.194).
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
- **Members' email addresses compare by exact case** (the 4b-2a re-check,
  15 Oct; read in code; older). A create stores the address as typed
  (users.mjs sanitize trims only) and `users_org_email_uq` is
  case-sensitive; the invitation lowercases, and its existing-row lookup,
  the GET ?me link and §0.202's re-invitation check compare exactly — only
  revoke-invite compares by lower(). A row stored with capitals is missed:
  an invitation of the lowercase form makes a second row for the person,
  and the capitalised row is never linked by a sign-in. No role changes
  hands (the missed row is never written). Recommended: a read-only census,
  then store addresses lowercased or compare by lower().
- **A member's save racing a Deactivate can undo it** (the 4b-2a re-check,
  15 Oct; read in code, not run). The users PUT reads the row (the merge),
  reads it again (`before`) and writes: an Admin's Deactivate landing
  between the merge's read and an unrelated save's write is overwritten by
  the merge's copy of `active`; one landing between the two reads takes the
  unrelated save through the access branch as a reactivation. One request's
  window. The lost-update class of the settings.extra item above. The
  quota plans' instance is closed (§0.203: every whole-profile write
  takes the plans the row holds when it lands, `keepQuotaPlans`); the
  same write-time read could keep `active` and the status.
- **A multi-row audited write streams its rows one at a time** (§0.203's
  review, 15 Oct; read in code, not run): the quota save (one insert, then
  each row streamed in turn) and the invitation loop (`users.mjs`, an
  insert and a stream per address). With an org's audit destination
  hanging, each row waits its 4 s timeout until the destination pauses
  itself after 10 failures, so a save of many rows can outlast the
  function — the writes landed, the screen hears no answer (the quota
  board then says to reload and look). In turn on purpose: each delivery
  counts on the last one's state (`nextDeliveryState`). Recommended: one
  delivery of many rows per destination.
- **The users PUT lets a Manager write any org user's profile,** forecast
  calls included. This is the existing quota behaviour, not widened, and was
  noted only. §0.84, as recorded. Since §0.202 a Manager's save reaches
  only a Sales Rep's row, and never its login, status or access.
- **A SPIFF claim's amount is the client's figure.** §0.169 (c). And the
  rest of what a claim trusts (the 4b-2 map, 15 Oct; Jeff: "file (3)"):
  the server takes the body's amount, multiplier, deal name and ARR; it
  does not require the rep's own Closed Won deal, an active SPIFF, or one
  not already claimed on that deal; a rep may re-point their pending
  claim's deal and SPIFF. Also: the claims list throws on a claim with no
  amount, says only Admins approve (Managers can too), keeps its own copy
  after an approve, and lists the whole org's claims to a Manager; an
  account merge renames a same-named twin account's claims' account text.
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
- **A late users?me answer from the last org can set the profile after a
  switch to no org** (across orgs; §0.200's review, read in code; §18b55).
  The answer is checked against `prevOrgIdRef`, which the list effect moves
  only with an org active (it returns first with none) and only after
  `waitForToken`; an answer from org A landing then sets A's row as the
  profile, and a switch from no org to B runs no reset — A's row stands
  until B's answer lands (its role is not read: `myProfileOrgId` names A). The
  alerts stay safe: an id of org A matches no row of another org (`alertsMe`).
  A sign-in ends in a page load (clerk-js, as recorded), so a second member
  never inherits it. Recommended: drop an answer when
  `uiOrgRef.current !== meOrgId`.

### 4.7 Imports and merge

- **A contact merge leaves activities' `contactIds` and tasks' chips on the
  merged-away contact** (the pre-ship sweep; older than §0.198). Its
  `tasks.contactId` and deals' ids move; the arrays do not. An untouched Save
  no longer puts the old contact back (§0.198's pre-ship round); the rows still
  name it, and a Save that does change such an activity's contacts writes
  `contact_id` from the list again — the merged-away contact (the re-check).
  Since §0.199 a held link is never asked again, so such an id is never
  followed to its survivor, and a stale whole-row save (a Tasks tab toggle,
  an activity's contacts re-picked) writes the merged-away id back into the
  scalar the merge had moved — the pair counts as held (§0.199's review). An
  account merge leaves contacts' `accountId` on the merged-away account the
  same way. Belongs with batch 3 (the merge moving contacts' `accountId`).
- **A CSV overwrite batch empties the Account of a row that names none** while
  another row names one (partialRows sets the union of the keys a batch
  sends; the re-check). Every row of a CSV names an Account today, so no screen
  sends that shape.
- **A new activity prefilled from a contact or deal on a merged-away account,
  neither it nor its survivor in a rep's list**, is saved linked to the
  merged-away account (the sweep). Batch 3's move of contacts' `accountId`
  on a merge removes the shape.
- **Batch 3 of §1 item 1: CSV import and merge link by name** (read 11 Oct
  over 7e68f26):
  - The account import gives a sub-account the first account whose name
    matches the Parent Account cell, in any case and any tier, with
    existing accounts searched before the file's own parents, a
    merged-away one's survivor after them (src/utils/importParents.js,
    §0.199). No refusal, and no line on the receipt. The accounts bulk POST
    and PUT refuse a parent that is no live account of the org, a
    merged-away one too (§0.199), but take a site as a parent, and
    `accountTier`, as sent: the rest of the parent rule and the tiers run on
    the single POST and PUT only (§0.198).
  - A conflict is the first existing account of the same name
    (CsvImportModal.jsx), and Overwrite writes onto that one. The row
    shows the name and phone only. A deal's conflict is the first deal with
    the same name and account name.
  - The contact import makes an account for each company not in the
    caller's list (exact spelling within the file), posts contacts with no
    `accountId`, and its Overwrite changes `company` while keeping the stored
    `accountId`. Deals import with the account name only (the map; not
    re-read). Since §0.198 the deals bulk POST and PUT refuse another org's
    account id, and an Overwrite that renames a deal's account, naming no
    id, unlinks it as a single save does; they still take a site, or an
    account merged away, as a deal's account. Recommended: the single save's
    rules on bulk rows (a site refused, a merged-away id followed to the
    account it was merged into).
  - An account merge rewrites contacts' account names by name alone, and
    since §0.198 moves deals' `accountId` to the survivor (D14) — up to the
    account above it, Site Name the site, when the survivor is a site (D22)
    — and renames only its own deals and those with no id: a deal with no
    id is renamed by its name alone, so a same-named twin's id-less deals
    are renamed too (a twin's deals with an id keep their name). It never
    moves contacts' `accountId` (merge.mjs). Its comment says contacts have
    no account link; `contacts.account_id` exists and AccountRail lists by
    it.
  - An account merge re-parents the merged-away account's sub-accounts onto
    the survivor, and lifts the survivor to the merged-away account's parent
    when it stood under it, with no parent rule and no tier re-fit — but a
    survivor lifted to the top level is made an account, the only tier that
    fits there, and the undo puts its tier back (§0.198); its `accountTier`
    field (the modal's field map) is written unchecked, and the log keeps no
    other tiers. Merging an account that has sites into a site puts sites
    under a site; merging a top-level account into a business unit puts its
    units under a unit (the server critic's probes, 11 Oct). Recommended
    (batch 3): run placeAccount for each moved child with the survivor as its
    parent — refusing the merge when anything would sit below a site — re-fit
    the moved branches in the merge's batch, snapshot the old tiers so the
    undo puts them back, and fit `accountTier` or take it out of the field
    map.
- **Restyle LeadImportModal onto CsvImportModal's chrome,** retiring its old
  first-match column matcher. As recorded.
- **An end-to-end importer test:** a fixture CSV through all six modules.
  As recorded.
- **The accounts / contacts bulk POST is unbatched.** It breaks above ~1,872
  rows, and one bad row kills the batch. As recorded.
- **`onConflictDoNothing()` in the bulk POST can never fire,** so a repeated
  import inserts a new set. Decide where name dedupe belongs. As recorded.

### 4.8 Other UI

- **The Leads tab's lead-requests load throws an uncaught rejection on a
  dropped connection** (§0.199's pane check, 13 Oct — the pane's console
  showed "Uncaught (in promise) TypeError: Failed to fetch" during a burst
  of refused connections whose cause it did not keep; read in code). The
  "Lead claim requests" effect (LeadsTab.jsx) awaits `dbFetch` in an async
  block with no catch, and `dbFetch` rethrows a network failure. The panel
  stays empty, as the comment intends for a refused read; nothing else
  breaks. Older than §0.199. Recommended: a catch that leaves the panel
  empty, and a sweep for the same shape (an async block around `dbFetch`
  with no catch).
- **Save on an account rail whose account has left the screen's list creates
  a second account** (the pre-ship sweep; as in prod — which screen can leave
  a rail open on a row gone from the list is unverified).
- **Back from a sub-account's rail to a parent the user can't open** shows an
  empty rail titled "—" (the sweep; as in prod).
- **An activity's chip for a contact outside the caller's list reads
  "Unknown contact"** (the sweep; as in prod) — the task rail says "Contact
  not in your list" (§0.198).
- **A task chip with no id** (none stored today, SELECT 12 Oct) is dropped by a
  Save that changes the task's contacts, as before §0.198 every Save did.
- **QuickLog's kept draft can save a deal its Opportunity list no longer
  shows** (the sweep; as in prod), after a pipeline or view change.
- **The profile panel's Email signature box reads blank once the panel is
  opened.** The avatar's click re-seeds the form without the signature
  (App.jsx seeds it on load). A save then sends none and the stored one is
  kept, so nothing is lost, but the box misleads. The fix is one key in
  AppHeader.jsx's avatar onClick (`emailSignature: myProfile?.emailSignature
  || ''`): its own one-line item, after §0.196. Read 11 Oct (§0.196).
- **The profile panel's automatic timezone save shows "Not saved".** Each
  click on the avatar (open or close) saves the browser's timezone when the
  stored one differs or is empty (`saveProfile({ timezone })`). Since §0.196
  a refused or failed save shows the red "Not saved — …" alert — for a save
  the member never made — and is undone, so the timezone still differs and
  the next click sends it again: while the server refuses it, the alert
  comes back after every open. Before §0.196 it was only logged. (A
  timezone-only self save is refused for real by a 403 — a caller with no
  roster row — or by the name rule's 409 when the stored First/Last spell
  another member's name (none did, read 11 Oct), or fails on a server or
  network error. Found in the pane check's design, where the fixture
  answers every held write 409.) Recommended: the drift save stays
  quiet and keeps the optimistic timezone, or its alert says it is the
  timezone. Read 11 Oct (§0.196).
- **Typed lists still drawn whole, with no cut and no ranking** (§0.194 put
  the matcher on every live typed list that cut, but for the duplicate
  warnings and the @mention below; these never cut):
  - the deal window's Contacts (about 1,500 rows on one letter in UKG, a
    designer's count), "Add to buying committee" (no max height), Site
    Name, Sales Rep (a prefix match);
  - DocumentLinkPicker (every record on an empty query), Reports'
    EntitySelector and AddContactToOppPanel;
  - as recorded by §0.194's review, not re-read one by one: DocumentPicker,
    QuotesTab's two searches, AdminView's settings search, the Leads tab's
    status and rep popovers, CoachingNoteDialog, AuditDetail's actor list,
    AccountsTab's sub-account drawer, ContactsTab's company list, and the
    tab tables' filters.
  - Recommended: the matcher where a list can be long, and G1
    (tests/search-match.test.mjs) taught to fail a typed filter drawn with
    no cut.
- **The search fields' keys** (as recorded by §0.194's readers): no list
  takes arrow keys, Enter or Escape; Enter in the deal window's Account
  field submits the form; Escape with the activity rail's list open closes
  the rail; the four rail Typeahead copies remain. Log Activity's
  Opportunity list closes on blur since the §0.198 fixes, as the account
  picker's and the task rail's do. Recommended: one shared, module-scope,
  portaled field (guide §16), as its own batch.
- **The duplicate warnings cut at three, unranked and silent** (AccountRail's
  and ContactRail's `dupWarning.slice(0, 3)`); "Open existing" opens the
  first. G1 cannot see a list held in React state, so tests/search-match
  names them in G1_BLIND; they are not held. §0.194.
- **The deal notes' @mention matches the start of a name** (the text after
  "@" as typed, which can hold spaces), in the roster's A–Z order, six with
  the count since §0.194. The alternative — any word of the name, ranked
  ("@smi" would find Ann Smith) — is Jeff's to decide: the mention is read
  out of the note as it is typed, so a looser match keeps the list open
  mid-sentence, where Enter inserts a mention. §0.194.
- **The Leads Cockpit's "Search leads…" is a label, not a field** (a
  `<span>` in CockpitView; the Triage view's search is an input). Read
  9 Oct (§0.194's review).
- **Five native time inputs:** AppHeader's digest time, and four in
  DispatchTab. They become the house TimeDropdown. Re-read 7 Oct: five
  sites.
- **The header search's account rows show no parent** (batch 2 of §1 item
  1), and the open-deal count beside each counts deals by name (AppHeader,
  read 11 Oct), so two twins show the same count.
- **Twins are still easy to make** (the map, 11 Oct; not re-read):
  - The account picker's Create checks only the caller's list, so a rep
    can create a second account under the name of one another rep owns.
  - Renaming an account to another account's name runs no duplicate
    check (AccountRail checks only a new account).
- **With Create off, a partly typed name reads as refused beside the row that
  matches it** (§0.198's pane check, 12 Oct). New Task's Account and an
  account's Parent show the matching row AND the foot "“pane shell chem” isn't
  a saved account. Pick one from the list." while the name is only partly
  typed — true of the text, noisy beside a match. Recommended: draw the foot
  only when no row is listed, or word it as "keep typing, or pick one".
- **The Leads Cockpit's "···" button does nothing** (no handler). Give it a
  menu or remove it. §0.191 (9 Oct).
- **The reminder modal takes the first click on the Reports tab.** §0.140,
  as recorded.
- **AccountsTab layout polish.** As recorded.
- **70 churn-only inline components** (`npm run check:inline -- --churn`;
  counted 7 Oct, §9 said 76). SalesManagerTab's SubTabs, TeamTab and AuditTab
  are among them, per §0.84, and AppHeader's search results' `GH` and `RR`,
  beside §0.194's lines. Opportunistic.

---

## 5. Design questions (no action until decided)

- **A tab loaded before a deploy** keeps the old screens, which send their
  saves to the new functions until it reloads (the pre-ship audit, 12 Oct —
  §2.2 for §0.198's ship). Proposed: `dbFetch` sends the bundle's version;
  a function refuses, or answers "reload", to a version older than its own,
  and the page offers the reload. Before paying customers, at the latest.
- **Quote versions:** Build compares only current against previous.
- **CRM entity numbering:** accounts are the best candidate. It pays only if
  searchable, on documents and surviving export.
- **Equipment's `share`** (shared vs per-van) is shown, not modelled.
- **`planWeek`** is greedy, not globally optimal.
- **Email signatures** appear on quote emails only.
- **The SPIFF panel on mobile:** where it goes in the mobile stack.

---

## 6. Tooling, tests and housekeeping

- **A bare pin passes when a later edit repeats its line** (§0.202: the
  re-invitation check's `if (userRole !== 'Admin') {` was the text an older
  pin held for the access branch's refusal, which then passed with the
  refusal removed — a full harness run would have printed it SURVIVED; that
  pin now carries its words). Kin of the harness-anchor item above.
  Recommended: a scan over the unit pins on a file a batch edits that flags
  a pinned literal occurring more than once.
- **The member form's edit path has no caller** (useUserHandlers.js
  `handleEditUser` is exported through App.jsx's context and nothing calls
  it; §0.202 changed what it sends). Remove it, or give it a screen.
- **A harness anchor that a later edit repeats moves its mutant silently**
  (§0.199: "restore: a scalar naming a row of this org is cleared" — the
  fixes put the anchor's text into a new clause above its line, the first
  match moved there, and the entry survived with no STALE). The harness and
  its pre-run tool mutate the first match; 2406 entries today, several by
  design on a text that repeats. Recommended: print AMBIGUOUS for an anchor
  that matches more than once and make each such entry name its line
  uniquely (a fail once none remain).
- **An ordering pin of `indexOf` against `indexOf` passes when its first
  text is gone** (§0.199's pre-run: a mutant deleting the restore's clean-up
  survived on one; that pin is fixed). About 60 such pins stand in some 35
  test files; a probe of the whole unit suite (every `indexOf` of an absent
  code-sized text, logged, 13 Oct) found none vacuous today. Recommended
  (class-wide): one helper that asserts both texts and their order, every
  pin through it, and a scan that fails a new bare one.
- **approval-routing.test.mjs reads "the gauge" to the end of
  QuotesTab.jsx** (the same probe): it slices to `// ─── Activity log`, a
  comment its own `code()` strips first, so the slice runs to the file's
  end — its absence checks read more than the gauge, its presence check
  less sharply. Recommended: end the slice at the gauge's own last line.
- **scripts/migrate-blue-era.mjs's summary still counts the two files §0.198
  deleted** (the pre-ship audit): it skips them, and the line says how many it
  read. A manual codemod nothing runs; cosmetic.
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
- **Unused code left in the files §0.198 edited** (found by its builders;
  not named by D8 or D20): App's `handleAddAccount`, `handleEditAccount`,
  `handleEditContact`, `handleEdit` and others; about 60 context names
  ModalLayer destructures and never reads; TasksTab's `fmtAgo`,
  `groupByDay` and the `useCallback` import; OpportunityModal's `RoleBadge`
  and `STAGE_COLORS`; useAccounts' `handleSaveAccount` branch for
  `editingSubAccount`, which no caller reaches now. Recommended: a
  class-wide pass with an unused-binding guard (a parse, committed as a
  test), rather than more of batch 1.
- **A memory-note amendment for Jeff to approve** (to
  bash-heredoc-backslashes): the Write tool is safe for a backslash before
  `(` or `{`, but turns a backslash, "u" and four hex digits into that
  character. Copy such a file, or build the backslash in a script with
  `String.fromCharCode(92)` — §0.194's test does the latter.
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
