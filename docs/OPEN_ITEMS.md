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
   - **Batch 2 is DONE (§0.214; guide §18b104)** (Jeff, 28 Oct: "Refuse,
     name both", "Open, ask to pick", "Refuse it"; docs/design/links-batch-2/).
     Dispatch's customer is found by one rule (dispatchCustomer.js): the one
     customer linked to the deal's account, else the one of its name — a
     deal with an account id takes only one linked to no account; two or
     more is refused, naming each by number (quote -> job a 409, New Job
     "pick from the list"). A name typed in New Job saves as the one
     customer or live account of it; two refuse. A refused New Job Save's
     customer and location are reused by the retry. A second customer for
     one CRM account, made or linked by Dispatch's customer save, is refused
     by the server (a merge, a restore or two writes at one instant can
     still make one — §4.4). The header search's account
     rows name their parent, and count each open deal once. What it found
     and left is filed in §4.4.
   - **Batch 3:** CSV import and merge (§4.7) — **designed and answered,
     not built** (docs/design/links-batch-3: the map read 29 Oct over
     `aeafb2d`, the design and its critics, Jeff's twelve answers of
     29 Oct, each the Recommended, and the census). Four steps: 3a the
     account import, screen and server together; 3b the contact and deal
     imports; 3c the merge's links; 3d the merge's placement. **3a built
     (§0.215; guide §18b105), its browser check PASSED, committed `321643e`, pushed to dev 30 Oct (`29e2f44..722ed8d`), NOT shipped**: the
     account import's names each one record or the row refused at Preview,
     sent by depth; the accounts bulk create placed by the parent rule, the
     bulk overwrite moving and renaming nothing. **3b built (§0.216; guide
     §18b106), its browser check PASSED as Jeff and as Karen, NOT committed** (Jeff, 30 Oct:
     "begin"; Q13 "Refuse both", Q14 "Keep what's stored"): the contact
     and deal imports' names each one record or the row refused at
     Preview; a contact linked by id, a new company made once; a deal on
     its account by id; the deals bulk paths linked by the single save's
     rule; a blank Sales Rep the importer's by id; an Overwrite's blank
     cell keeps what is stored. 3c and 3d to come.
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
   - **Batch 4b-2, the sales links, is DONE — in two** (Jeff, 16 Oct:
     "Two batches"; the decisions of 15 and 16 Oct in §4.6). The census
     (SELECT,
     counts only, 16 Oct): no stored link names another org's record or
     nothing — 44 quote lines, every member's team and pin, the one rule
     assignee (blank) — and Accelerep QA's one claim, whose SPIFF was
     removed, is already approved.
     - **4b-2b is DONE (§0.204; guide §18b97):** SPIFF claims' deal and
       SPIFF, export runs (no schedule; 409), quote lines' product (409),
       automations' create-task assignee; a claim save never creates a
       claim or clears its SPIFF or rep; a claim's Approve / Reject sends
       only what it changes; the claim Delete button — a Manager's list
       their own team's ("Narrow to their team") — and the SPIFF Active /
       Inactive control; a claim with no amount reads a dash, not a crash;
       a quote line that is no line, or lines that are no list, refused
       (400); Reject no longer red. What it found and left is filed in
       §4.2, §4.6 and §4.8.
     - **4b-2c is DONE (§0.205; guide §18b98):** members' team and pinned
       reports — a team an entry of this org's teams list, a pin a saved
       report of it, any of either, asked where a write names one anew;
       pins written only by the member's own Pin; the forecast call sends
       only its field, `{ id, forecastCalls }` (the field is the rep's
       whole calls map — §4.6); the restore — every date column, "records
       restored" counting only rows written, the rows refused, not reached
       and already here each said, the audit row naming each table whose
       rows were refused or not reached, with the count — and the clean-up
       of quote lines' products, teams and pins; the import window shows
       the restore's answer ("Fold it in"); a backup snapshot's id is
       unique ("Fix now"). Jeff's other answers of 16 Oct stand: the member
       profile page's whole-row save is its own batch ("File it, own batch
       next" — below); a restored member's login link and role stay filed
       ("Keep it filed, named" — §4.6). What it found and left is filed in
       §2.2, §4.3, §4.6, §4.7 and §4.8.
     - **Then, the member profile page sends only what changed — step A
       DONE (§0.211; guide §18b102), step B DONE (§0.212)** (§4.3's "The Settings → Users profile
       page PUTs a member's whole cached row"; Jeff, 16 Oct: "File it, own
       batch next"; 17 Oct: "Undo, cleanup, profile" — the third; 26 Oct:
       "Your change wins", "Only who they report to", "Steps A and B", "Fix
       the move, file the rest", "File it"). Step A: the page sends the
       fields it edits that changed — a Full name with First and Last
       cleared, a team by its id with its name — moves the member between
       teams' lists by id straight after, sends the role last and alone,
       holds the member as stored after a save, and says what did not land;
       the Manager box sets who the member reports to and nothing else.
       Built 27 Oct; its browser check passed 27 Oct (Accelerep QA, as
       Jeff and as Karen); committed on dev and pushed 27 Oct. Step B
       (§0.212; Jeff, 27 Oct: "Start step B"): a member's manager stored
       by id (`profile.managerId`, a member of this org, never themselves
       — the server asks it where a write names it anew, keeps the name
       and the id paired, and a restore clears a stray one), picked by a
       type-ahead, and read by the band, the Users list and the export.
       Built 27 Oct; its browser check passed 27 Oct and found a popover's
       close throwing on a resize — fixed with it, the Manager box's list
       and the Users and Industries row menus (two of them shipped);
       committed on dev 28 Oct and pushed 28 Oct. Filed
       beside it: the forecast call's one-figure save (§4.6), the page's
       leave guard and the rest the batch found (§4.3, §4.6, §6), and the
       teams list saved from the app's copy (with batch 4b-3, below).
   - **Batch 4b-3:** the ids inside settings (teams, territories, crews,
     quote templates) and a service plan's visit template (§4.6). With it
     (Jeff, 26 Oct: "Fix the move, file the rest" — the profile batch's P6,
     P28, P29): the member profile page and TeamModal save the whole teams
     list from the app's copy, loaded at sign-in, so another Admin's team
     edit made since is put back (UsersDetail.jsx `handleSave`,
     TeamsDetail.jsx TeamModal; settings.mjs replaces `teams` whole); a
     member's team name can differ from the team their id names (the
     rename cascade skips inactive members, and a member's PUT in it can
     fail — the Monday digest matches by the name); and two teams of one
     name can be made (TeamModal checks only that a name is given) — the
     profile page numbers the second, "East (2)" (§0.211).
   - **A merged-away account or contact leaves the tabs' lists — DONE
     (§0.206; guide §18b99)** (Jeff, 16 Oct,
     after merging UKG's "Resinall, Inc." into "Resinall": "It said it did it
     but both still show on the account list" — SELECT from 20:20 UTC: "Resinall,
     Inc." stored merged, `merge_archived` true, archived 20:18:01 UTC, its
     audit "merged in · 0 references repointed"). Also seen: "Evonik -
     Lafayette", two sites, one of them merge-archived (SELECT 9 Oct). Since
     §0.198 the pickers leave the archived one out, and since §0.209 so do
     the four the cleanup batch named (the document link picker,
     Dispatch's two account pickers and Reports' "Select contacts to add
     to this deal" — guide §18b99 rule 5); until §0.206 it was still listed — by the
     Accounts tab if it stands at the top level, else by its parent's
     Sub-Accounts (where it stands was not read), since a merge leaves the
     merged-away row's parent as it was (its archive write, merge.mjs:261,
     sets no parent) — because the accounts GET does not filter
     archived rows (read in code 11 Oct; again 16 Oct: the GET selects every
     account of the org, the tab filtered none). Jeff, 16 Oct: "Hide
     them" — merged-away accounts leave the Accounts tab and Sub-Accounts,
     the record kept (the server's merge reverse — a merge's Undo on
     screen since §0.207 — and the links that resolve through it
     unchanged); "Right after
     4b-2c" — a batch of its own, the Contacts tab
     checked for the same gap with it. Mapped and designed 16 Oct (read
     only: two mappers, a designer, two critics): the hiding belongs in the
     screens, not the accounts GET or the app's loaded lists — those must
     keep merged-away rows, through which links, chips and pickers reach the
     record each was merged into, and an Admin's "delete every listed
     contact" compares against the whole loaded list. The census (SELECT,
     counts only, 21:13 UTC): UKG holds 3 merged-away accounts and 5
     merged-away contacts; no live account stands under a merged-away
     parent, and no live contact or deal names a merged-away account, in
     any org. Jeff, 16 Oct: "Hide contacts too" — merged-away contacts leave
     the Contacts tab, an account's People list and the contact counts, in
     the same batch. Done: a merged-away account or contact leaves the
     Accounts tab, an account's Sub-Accounts, the Contacts tab, an account's
     People list and the contact counts beside them; the record is kept —
     the app's lists, their loads and both GETs still hold it. Jeff, 17 Oct:
     "Export follows the list" — each tab's Export follows its list
     (Settings → Data's export runs and the backups keep every row); App's
     rollup follows the one sub-account rule, built in by default and his
     to veto (§2.4). The census's UKG is `org_3CwnbloUXZQl0e6KtDhXFXRK8UD`,
     the prod instance's. What it found and left is filed in §2.2, §2.4,
     §4.2 and §4.7.
     - **A merge's Undo on screen — DONE (§0.207; guide §18b100)** (Jeff,
       16 Oct: "Undo as its own batch next"; 17 Oct: "Undo, cleanup,
       profile" — the first of the three): every merge screen said merges
       were reversible (the merge windows "Reversible afterward", the scan
       pages and Settings "fully reversible"), but no screen called the
       server's reverse (`reverseMerge`, `reverseContactMerge` in useMerge
       — read in code). Since §0.206 a merged-away record also leaves the
       Accounts and Contacts tabs, an account's Sub-Accounts and People
       list (the header search, Reports and a match by name (§4.7) still
       reach it; a link to a merged-away account opens the account it was
       merged into where the caller's list holds that live, and the
       merged-away row only where it does not), and no screen could undo
       its merge until §0.207. The server's reverse could put a survivor
       back under a parent merged away, deleted or moved under it since
       (§4.7's item, closed by §0.207).
       Mapped and designed 17 Oct (read only: three mappers — the server,
       the client, the app's undo patterns — a designer and two critics).
       Read in code then: no screen kept a merge's `mergeLogId` (the merge
       answers it); nothing read `merge_log` but merge.mjs, and no age
       limit was enforced anywhere (the "30-day" comments were not
       implemented); the reverse checked only that the log was this org's,
       of its kind and not yet reversed — so (reasoned from the code, not
       run) it answered 200 and moved links back to a record deleted since,
       overwrote edits made since, and two at once could both apply (run
       on that code later, I8's second Undo was refused — the race is
       reasoned, not seen; state §0.207). Jeff, 17
       Oct — where the Undo is once the toast is
       gone: "Past merges on each page" (a list on each Find & merge
       page, newest first, each with its Undo or why it has none); how
       long: "No limit, safety checks decide"; edits made since: "Keep
       later edits" (only what still holds what the merge wrote is put
       back, the rest kept and counted; a deal's account and its name
       move together); a merged-away record deleted since: "Undo refuses
       and explains" (deleting stays as it is); the screen's own `merge`
       audit row: "Drop the screen's row" (the server's row names who and
       holds the undo id); four defects in the same hook — a merge answer
       after an org switch auditing into the new org, contacts, tasks and
       activities not re-read after a merge, the scan not re-run after an
       Undo, a lost answer read as "Merge failed": "Fix all four now"; the
       browser check: "Yes, real merge and Undo" (two TEST accounts and
       two TEST contacts in Accelerep QA, his go asked at the merge); the
       words: "Approve as written" (the toast "Merged “X” into “Y” · ↩
       Undo", 5 seconds as the delete toasts — stated, no objection).
       Done: a merge offers its Undo in the toast for five seconds and
       under Past merges at the foot of each Find & merge page, with no
       age limit; an Undo sends its log id alone, puts back only what
       still holds what the merge wrote — a deal's account id and name
       together, a contact's company by name only while it is not linked
       to the survivor by id, a deal moved up by its lift alone — and, of
       accounts (the survivor's place and the sub-accounts the merge
       moved), only where the house parent rule puts them back
       (`restorePlace`, as a delete's Undo meets it), and no deal by its
       id onto a site; it keeps the rest and says how many records it
       left as they are now, and is refused in words, writing nothing,
       when the merge was undone, either record was deleted, the
       survivor was merged into another record since or the record
       merged away is no longer merged into it; its one batch claims the
       log and un-archives the record first, each aborting it unless it
       wrote its row. The merge hook acts only in the org that merged,
       writes no audit row, reads contacts, deals, tasks and activities
       again after a merge and its Undo (and accounts after an
       account's), and says a lost answer may have landed; the five list
       loads, Past merges and the scans drop an answer a later one
       overtook; the copy says what is offered. Jeff's second set (18
       Oct, after the second fix round) is built: "Leave such deals and
       count them", "New words", "Yes, both" (the parent rule keeps and
       counts, never refusing the whole Undo; contacts follow the deals'
       rule) and "Accept the limits" (merges logged before §0.207). His
       third set (18 Oct, after the last fix round) is built too: Past
       merges' confirm in his corrected text ("Use the corrected text"),
       and the deals the Undo leaves where they are — by name alone, or a
       site's own from before the merge — as built ("Ship as is, file the
       edge"; the name-only case filed for batch 3, §4.7). What it found
       and left is filed in §2.2, §2.4, §4.2, §4.7 and §6.
     - **Merged-away records leave every other list — DONE (§0.208,
       §0.209, §0.210; guide §18b99, §18b101)** (Jeff, 16 Oct: "One
       cleanup batch next"; 17 Oct: "Add them to the cleanup batch",
       "Undo, cleanup, profile"; 18 Oct: "Three steps" and his seven other
       answers, docs/design/cleanup-batch/ANSWERS.md; 23 Oct: "File it,
       fix in §0.210"): THE GUARD class-wide (§0.208); every screen
       (§0.209); and the numbers and the server's answers — "# of
       accounts" and the report engine, Reports' industry chart, Settings'
       Segments, Industries and Buyer Personas counts, both "View
       accounts" items ("Not available yet"), the merge windows' counts
       and the delete warning, the public API and the quote email — with
       §0.209's one defect, Dispatch's empty box (§0.210). The browser
       checks of §0.209 and §0.210 passed in Accelerep QA (23 Oct; §0.208
       was tests and CI only). What the batch found and left is filed in
       §2.2, §4.1, §4.2, §4.3, §4.4, §4.5, §4.6, §4.7, §4.8, §5 and §6.
       Next in Jeff's order: the member profile page (above) — step A
       done (§0.211), step B done (§0.212) — committed on dev 28 Oct, not
       pushed.
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

- **The full mutation-harness run on the tree that ships** (guide §18b23
  part 4; Jeff, 27 Oct: "the full run before each prod ship"): since
  §0.212 a batch runs its scope (`node scripts/mutate-scope.mjs`), and
  every entry (`node scripts/mutate-import.mjs`, about 4 h) runs before
  each ship. §0.209-§0.211 were each graded by a full run (§0.208 by
  its 3,139 older entries run on its step G's build in four slices and its
  own seven pre-run on the final tree — no full run on its final tree); §0.212 and §0.213 by their scopes alone.
- **§0.211's TEST records in Accelerep QA, Jeff's to delete if he
  wishes** (its browser check, 27 Oct — state §0.211): the member
  "TEST Profile Rep" (a Sales Rep with no email and no login; title
  "TEST Title B", phone "TEST 555-0102", on "TEST Team West", reporting
  to Bob Russell — since §0.212's check, to TEST Profile Manager) and the
  teams "TEST Team East", a second "TEST Team East" and "TEST Team West",
  no manager (West's list holds TEST Profile Rep). Karen's title and phone
  are back as they were.
- **§0.212's TEST record in Accelerep QA, Jeff's to delete if he wishes**
  (its browser check, 27 Oct — state §0.212): the member "TEST Profile
  Manager" (a Manager with no email and no login); TEST Profile Rep reports
  to it, by id.
- **§0.209's and §0.210's TEST records in Accelerep QA, Jeff's to
  delete if he wishes** (their browser checks, 23 Oct — state §0.209,
  §0.210): "Tara Other", "Tia Linked", the call "TEST §0.209 pane check
  call", "TEST §0.209 deal", the document "Anadarko Tear Sheet" (linked
  to "TEST Undo, Inc." and the TEST deal), "TEST §0.210 won deal"
  ($2,000, Closed Won, on "TEST Undo, Inc."), "TEST Undo, Inc."'s
  segment SMB and vertical market Energy, Tess `id_test_tess_b`'s
  persona Champion, and the four merge logs (`reversed`). Nothing else
  in QA changed: all four merges were undone, and QA holds no
  merged-away row.
- **The census of the merge logs: its two stop counts ran before the
  forty-third ship; its third count, for Jeff and not a stop, was not
  run** (§0.207's design, as amended — the census was its gate order's
  step 4; run 18 Oct, 18:56:02 UTC, SELECT, counts only: UKG holds 10 logs
  still 'merged' and no other org any, and every column of the second
  count is 0, so the ship went ahead — the state header's forty-third ship
  record). The census is two SELECTs — read only, counts only, scoped to
  `merge_log`, each naming its host in its first line of output (the
  ad-hoc DB script): the logs still 'merged', by org; and, among their
  rewrites, by org, the id and name rewrites with no `newValue`, the list
  rewrites holding a row with no `new`, the lift rewrites holding a row
  with no `old`, and any rewrite of another kind. Expected: 0 in every
  column of the second. Any other answer stops the ship and is reported.
  Reasoned from merge.mjs's restores, not run: an id, name or list
  restore compares each row with the value the merge logged, so a value
  missing there would make its restore match nothing and read as kept —
  safe, but the count would be wrong; a lift row with no `old` is not
  safe: its restore still matches a deal standing where the lift put it
  and writes the deal's account id, account name and Site Name empty.
  Such logs would need a design. A third count, for Jeff and not a stop
  (the second re-check's completeness lens, 18 Oct; reasoned, not run):
  of the logs still 'merged', by org, those whose account merged away is
  a site now and whose merge moved a deal off it (a deal id rewrite, a
  lift row, or a deal name rewrite from its name to another); those whose
  survivor a lift made an account (a top-level account merged into its
  own site) that holds a deal by id other than those the merge's deal id
  rewrite moved there from the account merged away (those go back to it
  while it is no site; while it is one, the log is in the first count);
  and those whose survivor, a site at the merge, was sent another tier
  (`resolvedFields.accountTier` — the API's alone; the merge window sends
  none) and holds such a deal — at most the Undos in which the deal rule
  would leave a deal where it is rather than put it on a site (Jeff, 18
  Oct: "Leave such deals and count them"; UKG's 6 deals on sites, §2.4).
- **Reload every app tab opened before the forty-third ship** (Deployed: dev
  20:48 UTC, prod 20:51 UTC, 18 Oct — it covers the forty-second's, 17 Oct
  18:36 UTC, the forty-first's, 17 Oct 13:06 UTC, the fortieth's, 16 Oct
  15:03 UTC, the thirty-ninth's, 16 Oct 03:28 UTC, the thirty-eighth's, 15
  Oct 17:59 UTC, the thirty-seventh's, 15 Oct 01:30 UTC, the thirty-sixth's,
  14 Oct 12:59 UTC, and the thirty-fifth's, 13 Oct 20:25 UTC, too): an older
  tab keeps the screens from before §0.199, §0.200, §0.201, §0.202, §0.203,
  §0.204, §0.205, §0.206 and §0.207 — the task rail's completion, a New
  Job's copied links, the task popups, the Technicians form's login picker,
  the member profile page's save, the Sales Manager tab's quota board,
  claims list, SPIFF board and forecast ledger, a saved report's Pin, the
  backup page's import window, the Fiscal year page, and the Accounts and
  Contacts tabs' lists among them. A tab opened before its site's §0.207
  deploy and not reloaded keeps the old screens: no Undo after a merge and
  no Past merges, the merge screens still saying merges are fully
  reversible, its lists with no overtaken-answer guard, and its merge hook's
  own `merge` audit row refused by the audit-log POST (403; read in code —
  not shown on screen; the server's `account.merged` / `contact.merged` row
  is written as before). A tab opened before its site's §0.206 deploy and
  not reloaded keeps the old lists — merged-away accounts and contacts
  listed — and there a Select all + Delete takes the listed merged-away
  records with the rest. Contacts go by the one-request clear when it is an
  Admin's, the list holds every contact of the org (All, no search) and none
  is kept for an open deal; otherwise one request each. Accounts (an
  Admin's) go one request each. Their merges' Undo is then refused (§0.207:
  "… was deleted after this merge …"), and the delete's Undo brings them
  back as live records — their merges' Undo refused again, "… is no longer
  merged into …" (each re-post carries its merge mark, but neither POST
  stores it — `sanitize` in accounts.mjs and contacts.mjs has no merge
  field; §4.2 files the accounts' half). An older tab's Save quotas answers
  200 and stores no quota (the server keeps the stored figures), and its
  claim Approve still re-sends the whole claim as loaded (a stale copy can
  put back what another save changed — what §0.204's Approve no longer
  does). Its forecast call re-sends the rep's whole cached row — when the
  cached team is no longer the rep's stored team and has been deleted since,
  it now answers 404 "That team is not in your organization — pick one from
  the list.", its call not stored (a deleted team the rep still holds is
  taken, as before), and a team or a name changed since is put back as
  before (never the pins: the server keeps them); its Pin from a window
  whose pin list still holds a report unpinned in another window and deleted
  since is refused, with no re-read, and so is every later Pin and Unpin
  there until a reload — but an Unpin of that report itself, which drops it
  (a stale list that names only live reports is taken, and puts back the
  ones unpinned elsewhere, as before); its import window closes on an
  accepted restore's answer and reads only "Import failed" on a refused one,
  so nothing the restore says is read. Reload, then strike this.
- Nothing else open. The forty-third ship (18 Oct, 20:51 UTC: §0.207, a
  merge's Undo on screen — the merge Undo batch; dev and prod in one
  sitting), the forty-second (17 Oct, 18:36 UTC: §0.206, a
  merged-away account or contact leaves the lists the screens draw — the
  merged-away batch; dev and prod in one sitting; Jeff's read-only look
  at UKG after it is recorded on state §0.206's Verified line — the
  check written here before the ship, "Resinall" listed once, was wrong:
  the survivor is a business unit under "Ergon", which the Accounts tab's
  search, over the top-level list only, does not reach), the
  forty-first (17 Oct, 13:06 UTC: §0.205, a member's team and pinned
  reports name this org's, and the restore says what it did — batch
  4b-2c; dev and prod in one sitting), the fortieth
  (16 Oct, 15:03 UTC: §0.204, a sales record's links name live rows or
  entries of this org — batch 4b-2b; dev and prod in one sitting), the
  thirty-ninth (16 Oct, 03:28 UTC: §0.203, a
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

- **§0.207's defaults — Jeff's to veto** (not asked; each built in by
  the design, its amendment, the review or the fix rounds). What the
  batch's rounds listed back to him is answered, each built or filed
  (state §0.207): his second set (18 Oct, after the second fix round) —
  "Leave such deals and count them", "New words", "Yes, both", "Accept
  the limits" — and his third (18 Oct, after the last fix round): Past
  merges' confirm in his corrected text ("Use the corrected text"), and
  the deals the Undo leaves where they are — by name alone, or a site's
  own from before the merge — as built ("Ship as is, file the edge"; the
  name-only case filed for batch 3, §4.7). The defaults:
  - Past merges' Undo asks first, in the app's confirm, not red; a done
    Undo says so (the toast's in a notice that clears itself, Past
    merges' on its own row); Past merges shows the latest 50 merges of a
    kind ("Showing the latest N merges.", no paging — §4.7); the refusal
    "…already been reversed." reads "…already been undone.";
  - the five list loads' overtaken-answer guard, and the review's same
    guard on Past merges' list and both scans; the merge windows' default
    survivor set when they open, never on a list read again;
  - four sentences the approved tables did not cover: "One of these
    records changed while the merge was being undone. Please try
    again."; "Merged “X” into “Y” — its Undo is under Past merges on this
    page." (a merge whose answer names no log id); "Past merges did not
    load — …"; and the house's "You do not have permission to make this
    change." for a merge refused 403 — with "Merge undone." where a done
    Undo's answer could not be read and no name is known (the two
    screens always pass one);
  - restored link rows stamped `updatedAt`, as the merge stamps them; two
    §0.206 harness names corrected;
  - the lifted survivor's parent and tier go back together or stay
    together — one edited since keeps the other (before the review's fix
    a parent went back beside a tier edited since);
  - the done words for one, "1 record was left as it is now." (his words
    give the plural alone), and the survivor counted in them once,
    whatever of it was kept — its owner with its id, its place, a phone
    and a website one record (the second re-check: a field is no record;
    the survivor once told to him with his third set, not asked);
  - the audit row's detail in the done words' sense — " · M linked
    records were left as they are now · kept: <fields>", M the linked
    records alone (the done words count the survivor too, once, when
    any of its fields was kept) — where it said "changed since, kept"
    of deals the deal rule held and places the parent rule kept, which
    nobody changed (the second re-check; told to him with his third
    set, not asked).
- **§0.206's App rollup default — Jeff's to veto** (the design's flag, 16
  Oct; not asked: nothing is expected to change). App's rollup follows the
  one sub-account rule, so the Contacts tab's company card leaves a
  merged-away sub-account's name out of the names its pipeline sums deals
  by; a merge renames that name on the merge's deals — to the survivor's,
  or to the live account above a site it merged into (D22) — so nothing is
  expected to drop (read in code; the re-check's render read the same
  pipeline as before). The design's other flag is decided: each tab's
  Export follows its list (Jeff, 17 Oct: "Export follows the list").
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
- **Notifications off in every org but the real UKG — planned, NOT applied**
  (Jeff, 29 Oct: "turn off notifications for all users in all environments
  except the UKG one", then "Not now"). A read-only map (a workflow, five
  readers and a critic) found 39 paths and where each is switched; a SELECT
  census (counts only) found 19 members outside the real UKG
  (`org_3CwnbloUXZQl0e6KtDhXFXRK8UD`, kept on; the dev-instance "UKG"
  `org_3B8Tg9…` goes off too — Jeff: "Off too"), 17 of them never having
  saved a setting, so every alert that defaults on is on. The plan, dry-run
  checked (27 writes, one transaction, each guarded on the value read, a
  snapshot of every old value first; it refuses if UKG is in it): each
  member's `profile.notificationPrefs` — the 19 keys the senders read, and
  any other stored — set `enabled: false` (its mode kept), and
  `profile.smsNotifications.enabled` false; Slack `enabled: false` in two
  orgs (the webhook kept); customer notifications, the one sending
  automation and the one outbound webhook in Accelerep Test; four scheduled
  report deliveries. The script was in the twenty-fourth session's scratch
  folder (`notif-off.mjs`); the write was stopped by the permission check,
  and Jeff chose not now. Not reachable by data: the in-app bell and
  popups, a report's Send now, a quote sent by hand, Clerk's own emails and
  texts; and a member added later starts with every default-on alert on (a
  code change — an org-level switch — if wanted). Env switches
  (`JOBS_ENABLED`, `RESEND_API_KEY`, `TWILIO_*`) are per site and would
  stop UKG's too.
- **UKG's accounts and deals that break the house tier rules** (batch 3's
  census, 29 Oct, counts only — docs/design/links-batch-3/ANSWERS.md): 12
  accounts stored as tier `account` under an `account` parent (D3: a
  sub-account ranks below its parent), and 6 deals linked by id to 6
  sites (D22: a deal stands on an account, its site as Site Name) — three
  open, three Closed Lost. Both are likely legacy rows the code already
  names: src/utils/accountParent.js's header counts 13 tier-'account'
  rows under an account at its read of 12 Oct (stored before the rule,
  kept until moved), and accounts.mjs says "UKG's deals on sites stay
  until changed by hand" (from before D22's lift, §0.198). Whether
  today's twelve and six are those rows was not read (a SELECT of their
  ids and created dates would say). Nothing changes them; batch 3d's merge refusal (Jeff, 29 Oct,
  Q8: "Refuse it") would refuse a merge that moves one of the twelve.
  Jeff's data decision: leave them, or fix each by hand (how each screen
  would re-fit them is not read yet — read before advising a fix).

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

- **An open document rail asks for its versions in the org switched to**
  (§0.209's browser check, 23 Oct; observed twice, reproduced once):
  with a document's rail open, an org switch (the app's own, through
  Clerk) sends `GET documents?action=versions&id=<that document>` twice
  under the new org — each 404 (documents.mjs:262-271 finds no such
  document in that org), each logged "DB error 404". Nothing from either
  org is shown, and the server's org filter refused it, so nothing
  crosses — but the rail's load (DocumentRail.jsx:72-85, keyed on the
  document id and version, guarded only by `cancelled`) runs in the org
  switched to before the emptied lists close the rail. Why it runs twice
  is not read. Recommended: the rail closes on an org switch, as the
  lists do, or its load is taken with `requestOrg` / `stillOrg` (guide
  §18b68).
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
- **Three dialogs on the legacy `.modal` class** (confirm, prompt, coaching
  note — the blocked delete is inline-styled; corrected 28 Oct by §0.213's
  docs check). The guide wants inline chrome. Since §0.213 the class clips
  and each use holds a box that scrolls (guide §18b103 rule 5). §0.136, as
  recorded.
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

- **Reports' "Contacts on this deal" keeps its adds and removes to itself**
  (the cleanup batch's design, 18 Oct, P37; re-read 23 Oct; read in code,
  not run). A save that lands sets the tab's own ids
  (`setLocalContactIds`, ReportsTab.jsx:6284 add, :6338 remove), never
  the app's deal: ActivityHistoryTab is handed the app's deals in scope
  (`roleFilteredOpps`, :2093) and no setter, though the app's context
  carries `setOpportunities` (App.jsx:1732), and the PUT's answer — the
  deal as stored (opportunities.mjs:612) — is not read. Picking a deal,
  another or the same one again, sets the ids back to null (:6006), and
  leaving Activity History drops them (:2088); the table then reads the
  app's copy (:5944) — without the contact just added, with the one just
  removed — until the app reads the deals again (a reload, App.jsx:499; a
  merge, useMerge.js:35). The next add or remove sends that copy as the
  deal's whole `contactIds` (:6267, :6327), which the PUT lays over the
  stored row (opportunities.mjs:499): the earlier add or remove undone,
  nothing said. The deal window opened from the Pipeline tab starts from
  the same copy (PipelineTab.jsx:379; OpportunityModal.jsx:1063), and a
  Contacts change there sends its list whole (:1204-1206). A refused
  save says nothing either: `if (res.ok)` only (:6283-6286, :6338), the
  add's panel stays open, the remove's row stays, and dbFetch logs it to
  the console alone (storage.js:68). Two halves are filed in this
  section, older and without a cite: "never updates the app's copy" (the
  deal's contacts after a Reports edit) and §0.193's "Reports'
  deal-contact PUTs … show a refused save nowhere". Recommended: both
  through `dbWrite`, the list taking `data.opportunity` through
  `setOpportunities` (as the Closed Lost save does, useOpportunities.js:243)
  and the local ids retired; the refusal's words beside the panel and the
  table.
- **The report builder says the Rep / Team / Territory slice applies
  first; its Accounts source takes no slice** (the cleanup batch's
  design, 18 Oct, P40; re-read 23 Oct; read in code, not run): the
  Filters tab's note ends "The Rep / Team / Territory slice above the tab
  applies first." (ReportsTab.jsx:4480). It holds for three sources: the
  builder hands `runReport` the sliced deals, activities and leads
  (`builderData`, :2391; `reportsOpps` :192-203, `reportsActivities`
  :225, `reportsLeads` :234; handed at :2110-2118). Its accounts are the
  app's whole list (`accounts: accounts || []`, :2391 — `useApp`'s
  `accounts`, :40, handed at :2109). For an Admin, a Manager or a
  Dispatcher, the only viewers the slice is drawn for
  (`hasReportsSlicing`, :189; `canSeeAll`, :75-76), that is every account
  of the org (accounts.mjs:188-209; `crmReadScope`, roles.js:56-60),
  merged-away ones left out since §0.210. So with a rep picked, the
  Accounts source still reads every account: "# of accounts" and the
  "N of M accounts in the period" line (:4379) count the org's accounts,
  not the rep's, while its Revenue (won), Open pipeline and # of deals
  follow the slice, read from the sliced deals (`oppsByAccount`,
  reportQuery.js:294-325; :107-109). The tab's role gate skips accounts
  too: `myTeamMembers` (:124-135) narrows deals, activities, leads and
  tasks (:172-175), never accounts, so a Manager's Accounts report counts
  the whole org under "Showing your data and your team (…)" (:329-331).
  Recommended: the note says what is true — the slice applies to deals,
  activities and leads; the Accounts source reads every account you can
  see, its money columns from the sliced deals. Whether accounts take the
  slice (by owner, or by the slice's deals) is Jeff's call.
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
- **After a merge or its Undo, the merging session does not read its SPIFF
  claims or Dispatch's lists again** (the pre-ship sweep, older than
  §0.198; narrowed by §0.207, which reads contacts, deals, tasks and
  activities again after a merge and its Undo, and accounts after an
  account's — Jeff, 17 Oct: "Fix all four now"). An account merge
  renames SPIFF claims' account name and moves Dispatch's customers' and
  jobs' account (merge.mjs); the claims are read once per org (an App
  effect) and Dispatch's lists by the tab itself, so the merge hook reads
  neither again (read in code; what a screen then shows or sends was not
  read). Recommended: read them again after a merge and its Undo.
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
  restore re-posts the row as the delete answered it, but the accounts
  POST keeps only what the account form saves (`sanitize`), its parent,
  tier and owner — not `createdAt`, `mergeArchived`, `mergedIntoId` or
  `archivedAt` — so every row posted back is dated the Undo (the column's
  default) and reads
  as last edited then. §0.198's fifth fix round carried the created date
  back; the sixth took it out again: the app's driver (`@netlify/neon`
  loads the CommonJS copy of `@neondatabase/serverless`, which drizzle's
  type-parser override does not reach) reads a `timestamp without time
  zone` in the function process's own time zone (state §0.91), so a date
  read back and written again moves by that zone's offset — on Jeff's
  machine 5 or 6 hours. Since §0.206 the Accounts tab lists, and so its
  delete reaches, a merge-archived account only in a tab opened before
  the §0.206 deploy and not reloaded (§2.2), or in one whose accounts were
  read before another session merged the account and not read again
  since (its list holds the row unmarked). That delete is the only one
  with this Undo, which brings a deleted account back as a live account,
  offered in the pickers again — its merge's Undo then refused, "… is no
  longer merged into …" (§0.207). The accounts DELETE still deletes one
  sent by id, with no Undo, and its merge's Undo is then refused, "… was
  deleted after this merge …" (§0.207; Jeff, 17 Oct: "Undo refuses and
  explains" — deleting stays as it is). The delete's confirm counted
  the sub-accounts the server lifts, merged-away ones too, so it could
  name more than the drawer lists (§0.206) — until §0.210, when it counts
  the live ones (useAccounts.js:77; Jeff, 18 Oct: "Count what you see");
  the server still lifts a merged-away one. Recommended: carry the merge mark on
  a restore (its survivor checked in the org); carry the
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
  write; a merge's Undo (§0.207 — the toast after a merge, and Past
  merges) puts back each one still where the lift put it, by its lift
  alone, and never onto a site: while the account merged away is a site
  the deal stays, counted (Jeff, 18 Oct: "Leave such deals and count
  them"). A merge that lifts its survivor to the top level makes it an
  account, so the deals it takes are not left
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
  - a merge's Undo (§0.207) puts no deal on a site by its id (Jeff, 18
    Oct: "Leave such deals and count them" — the account keeps its
    level, the deal stays, counted), but a deal with no account id can
    still end on a site by its name, not counted: a lifted survivor goes
    back a site with such a deal naming it (its deals are read by id),
    and a merge that gave the survivor the name of the account merged
    away, a site, leaves such a deal naming only that site once the
    survivor's own name goes back — and the Undo has no age limit, so
    unlike a delete's this is no matter of seconds (the second re-check
    and the fifth cross-check, 18 Oct, each run on the test database).
    Jeff, 18 Oct: "Ship as is, file the edge" — filed for batch 3 to
    close (§4.7). Reasoned from the code, not run: a name for the
    survivor that is neither record's, sent through the API (no screen
    sends one), leaves a kept deal by name alone naming no account once
    the survivor's own name goes back;
  - an Admin's marked PUT naming a parent for a top-level account no
    delete lifted is taken as a restore — only a forged body sends one: the
    Undo marks only rows its delete lifted — and is written as sent, so a
    never-deleted top-level account made a site keeps its open deals on the
    site: a restore runs no D22 (§0.198's fifth fix round). The server
    cannot tell such a row from one a delete lifted; a server-side "was
    lifted" marker would, if it is ever seen.
  Recommended: keep (each is rare, or data from before the rule), but the
  merge's Undo's shapes by name, which have no age limit, are batch 3's
  to close (Jeff, 18 Oct: "Ship as is, file the edge" — §4.7).
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
- **An import's owner report is not shown — DONE (§0.216, NOT committed) but
  for one path:** bulkClient keeps each chunk's `ambiguousOwners` and
  `unmatchedOwners`, and the Results say them (`describeOwners`) for the
  contact and deal imports and the account Overwrite. The account import's
  new rows still drop them: `importParents.js sendLevels` builds its own
  answer without them, so `receiptFromInsert(res)` in ModalLayer's account
  handler has none (found by §0.216's docs check; 3a's path, left so the
  scoped harness graded the tree as built). Recommended: sendLevels carries
  each level's names. §0.193's review; §0.216.
- **A contact a CSV import makes has no owner** (found by §0.216's browser
  check, 30 Oct). The contact file has no owner column, and the contacts
  bulk create stamps an owner by name only, so every imported contact is
  unassigned — as before 3b; a deal's blank Sales Rep is the importer's by
  id since Q11. A Sales Rep's list holds unowned contacts, so hers stay in
  her list. Jeff's call: the importer by id, as for deals, or as it is.
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
  a contact's Company text and a deal's Contacts text are not renamed. Since
  §0.209 none of the four pickers offers a merged-away record — Reports'
  "Select contacts to add to this deal" (`allContacts={unarchived(contacts)}`,
  ReportsTab.jsx:6260), Dispatch's customer typeahead
  (`!isMergeArchived(a)`, DispatchTab.jsx:359-360), its Linked CRM account
  select (`unarchived(accounts)`, :2715) and the document link picker
  (DocumentLinkPicker.jsx:84-85) list only live ones — so what sends one
  through them is a screen whose lists were loaded before the merge, or a
  hand-made request (the cleanup batch's design, 18 Oct, P30; re-read 23
  Oct; read in code, not run). The first three are followed to the
  survivor (`checkLinks`, opportunities.mjs:480, dispatch-customers.mjs:266;
  `follow = true` by default, linkIds.js:118): the add panel's PUT names
  the contact in the deal's Contacts text (ReportsTab.jsx:6267-6281), so
  the deal links the survivor under that name; the typeahead gives a new
  job's customer the account's name (DispatchTab.jsx:6811-6815, posted at
  :5858-5869); the select sends an id with no name (:2710). For these
  names: as the merges leave names; with the first item above. The fourth
  is not followed: documents.mjs follows no merge. `resolveLinks`
  (documents.mjs:167-190) reads the record by id in the org (:176) and
  keeps the id asked under that record's own name (:187), which
  `insertLinks` stores (:516-517); it reads neither `mergeArchived` nor
  `mergedIntoId`, and documents.mjs imports nothing from `_links.mjs`,
  whose `liveIdsInOrg` (:66-75) follows a merge. Upload, a dropped file and
  Link existing on a record's Documents tab name the record itself
  (RecordDocuments.jsx:34, :50, :64, :89-93), so on a merged-away
  account's rail — still opened by the Contacts tab's "Open account" (its
  company view) when it is the first account of the company's name
  (ContactsTab.jsx:365-368, :521-523; §4.7, "A record matched by name or
  email can be a merged-away one") — they link the merged-away account
  too. The document rail's "Linked to" chips then draw that link by its
  stored name, with no word of the merge (DocumentRail.jsx:185-187 →
  `LinkChip`, atoms.jsx:132), as the library's rows do (`LinkedToRow`,
  atoms.jsx:226-236, DocumentsTab.jsx:73) — and so for every link made
  before a merge, which no merge moves (merge.mjs:2-5 imports no documents
  table; batch 3). Since §0.209 the survivor's Documents tab lists such a
  document (`standsFor`, RecordDocuments.jsx:36-47), and the picker draws
  the link under "Already linked" by its stored name with "Merged into
  “X”" beneath (DocumentLinkPicker.jsx:22-34, :106-114, :206-211) — both
  seen in §0.209's browser check, 23 Oct (state §0.209). Recommended:
  `resolveLinks` follows an account or contact merged away to its survivor
  (`liveIdsInOrg`), the survivor read in the org, asked the same
  visibility and stored under its own name; the rail's chip and the
  library's row say "Merged into “X”" for a link held to one, as the
  picker's row does. While there: a file uploaded on a merged-away
  account's own rail would then link the survivor and leave that rail's
  Documents tab, which lists the record's own id and those merged into it,
  never its survivor (RecordDocuments.jsx:39-43, `standsFor`) — with §4.7's
  "A merged-away record's rail says nothing of the merge".
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
  Since §0.204, three more where the screen offers no list, or its own:
  the claim modal (its SPIFFs are the session's list), the rule modal (its
  roster the app load's) and New version — a copied line naming no product
  of this org refuses the version, and the banner says "pick one from the
  list" with no list offered (§0.204's review).
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
- **A deal's account by name: the report engine trims the name,
  `accountOfDeal` does not** (§0.210's doc check, 23 Oct; read in code,
  and run by a checker on made-up rows): the engine compares a deal's
  account name trimmed and lower-cased (`str`, reportQuery.js:59, used at
  :303, :309, :314), `accountOfDeal` lower-cased only (pickLink.js:285-288). So
  an id-less deal named "resinall, inc. " (a trailing space) counts on
  Resinall in a report and has no account in Reports' Opportunity
  history and its industry chart ("Other") — as before §0.210 (the old
  `acctByName` and `accountOfDeal` were untrimmed too). Recommended:
  `accountOfDeal` trims as the engine does.

### 4.3 Settings

- **A buyer persona still in use can be deleted — the settings PUT
  stores the list as sent** (the cleanup batch's design, 18 Oct, P38;
  re-read 23 Oct; read in code, not run): Settings → Buyer Personas
  disables Delete while any contact holds the persona
  (BuyerPersonasDetail.jsx:254, its handler :138-142, counted at :99-108
  over the app's loaded `contacts`, :63 — the live ones since §0.210) —
  on the screen only: the PUT
  takes `buyerPersonas` whole, as sent (settings.mjs:397), and reads no
  contact (of the schema it imports only `settings` and `users`, :2).
  The screen's own count let one through three ways until §0.210, which
  closed the first: it counted by name alone (`contactCounts[p.name]`)
  while Reports' "Assign persona" stores the persona's id
  (ReportsTab.jsx:4848 → :6350), so a persona given only from Reports
  read 0 and its Delete was enabled — since §0.210 it counts live
  contacts by name or id (`countOf`, BuyerPersonasDetail.jsx:108; on the
  screen only). It
  counts the list as loaded: the app reads the contacts with the org
  (App.jsx:501) and again only after a merge or its Undo
  (useMerge.js:49-55) or an import's owner overwrite (ModalLayer.jsx:521),
  and Reports keeps its assignment in its own map (`localPersonaMap`,
  ReportsTab.jsx:6343), never in the app's list — so a persona given
  since the list loaded, by another member or by the Admin from Reports,
  is not counted, by name or by id. And a rename keeps the persona's id,
  not its name (BuyerPersonasDetail.jsx:350, :183), while a contact given
  the persona on its rail holds the name (ContactRail.jsx:842-844): after
  a rename that contact counts for no persona. A PUT sent by hand needs
  none of these. The contact keeps the value (contacts.mjs:71 stores it
  as sent): its rail's read view shows the stored text
  (ContactRail.jsx:866) and Reports' "Contacts on this deal" a "—"
  (ReportsTab.jsx:6321, :6389). Admin only (settings.mjs:245) and this
  org's row only (:442-445) — integrity, not a leak. Recommended: the PUT
  refuses (409, nothing written) a save that drops a persona whose id or
  name a contact of this org holds, or renames one a contact holds by
  name — by the screen's rule since §0.210 (live contacts, by name or
  id) — in the screen's words ("N contacts still use this").
- **The API docs page and the API keys panel describe an API no key can
  reach, with the wrong limits and scopes** (the cleanup batch's design,
  18 Oct, P39; re-read 23 Oct). public/api-docs.html says "All endpoints
  require a valid API key" (:324) and documents seven of the app's own
  functions under one base URL (:330): opportunities, accounts, contacts,
  leads, quotes, webhooks and api-keys. Its curls send
  `Bearer spt_live_...` to three of them: opportunities (:351, :432, :476,
  :505, :529), accounts (:633, :647) and api-keys (:1120). Each takes a
  Clerk session token (`verifyAuth`, e.g. opportunities.mjs:250;
  auth.mjs:93 `verifyToken`), so a key is answered 401 "Auth error: ..."
  (auth.mjs:168-170; read in code, not run). The one endpoint a key opens,
  public-api.mjs, is on the page nowhere: GET only (:77-79, "Public API is
  read-only"), `?resource=` of six tables (:450; no quotes or webhooks,
  and activities and tasks undocumented), `page`/`limit` up to 200
  answered as `{ data, meta }` (:51-66). The limits: the page's "1,000
  requests/minute" per key and per organization (api-docs.html:391) and
  the panel's "Rate limit: 1,000 req/min per key" (ApiKeysDetail.jsx:630),
  against `RATE_LIMIT = 300` per `WINDOW_MS = 15 * 60 * 1000`, per key, in
  memory per function instance (public-api.mjs:18, :27-30); and the
  page's "return all records ... Cursor-based pagination is on the
  roadmap" (api-docs.html:387). Read/write: "Keys currently grant
  read/write access to all resources within the workspace"
  (api-docs.html:360), while every key is stored `scopes: ['read']`
  (api-keys.mjs:79): the five write scopes the create dialog offers
  (ApiKeysDetail.jsx:16) are sent when ticked (:33) and dropped, and its
  Live/Test select (:74-80) is never sent (every key is `spt_live_`,
  api-keys.mjs:14). The dialog's "Test with curl" names
  `https://api.accelerep.com/v1/opportunities` (ApiKeysDetail.jsx:159-160),
  which nothing in the repo serves (whether the host resolves was not
  checked), and the "View docs" popover's cURL, JS and Python snippets
  send the key to `/.netlify/functions/opportunities` (:233-246), the
  Clerk endpoint; the popover links the page (:382, :396-405) and lists
  four "Official SDKs" (:189-194; whether those packages exist was not
  checked). Recommended: one page for `public-api` as it is (read only,
  six resources, 300 per 15 minutes, page and limit); the dialog's curl
  and the popover's snippets pointed at
  `/.netlify/functions/public-api?resource=opportunities`; and the panel's
  limit line, scopes, Environment and SDK list made to say what the
  server does, or dropped.
- **Territories' ACCOUNTS column reads a stored 0 that nothing counts**
  (the cleanup batch's design, 18 Oct — DESIGN.md §1 row P40, marked
  FILED there but on no line here; read in code 23 Oct, not run): New
  territory and Import CSV store each new territory with `accounts:0`
  and `pipeline:'—'` (src/Tabs/settings/people/TerritoriesDetail.jsx:34,
  :212), and the table draws them as stored (`{tr.accounts ?? '—'}`,
  :355; `{tr.pipeline || '—'}`, :356). Nothing recomputes either — every
  edit spreads the stored row (:38, :42, :45-47, :49; the import's re-run
  of a name, :211) and settings.mjs:339 keeps the list as sent — so such
  a territory reads 0 accounts however many accounts name it in
  `assignedTerritory` (db/schema.ts:74; set on the account rail,
  AccountRail.jsx:349, or by the assignment rules, accounts.mjs:60-73,
  which read `extra.assignmentRules`, :49, not this panel's rule). Not
  about merges. Recommended: count at render the org's live accounts
  whose `assignedTerritory` is the territory's name, through `unarchived`
  (pickLink.js:50 — the file imports `useApp`, :3, so a new list read
  there must be a shape THE GUARD names), and stop storing `accounts`;
  or drop both columns until they are counted. A count by name meets the
  rename's gap: Edit territory (:37-40) carries a new name onto users
  only, so accounts keep the old one.
- **Industries' "Delete industry" says "Removes tag from all accounts";
  it takes the industry out of the taxonomy only** (the cleanup batch's
  design, 18 Oct, P40, its Industries item; re-read 23 Oct; read in
  code, not run): the menu item's line (IndustriesDetail.jsx:313) sits on
  a button that runs `handleDeleteInd` (:308, :138-141), which only
  filters the panel's own list —
  `setIndustries(prev => prev.filter(ind => ind.k !== indKey))` (:139) —
  and Save sends `putSettings({ industries })` (:55), which settings.mjs
  stores as `extra.industries` (:396; the file never names the accounts
  table). Every account's `verticalMarket` / `industry` keeps its value.
  What changes: the account rail's Industry suggestions stop offering it
  (AccountRail.jsx:246-248, :716), as they already do for a hidden one;
  and the Distribution card stops counting it (its index is built from
  the taxonomy, :158, :164), so the top-level accounts that hold it or
  one of its sub-types fall into the unmatched rest of "N of M accounts
  matched to a primary industry" (:370). The Hide item beside it says
  "Existing accounts keep this tag" (:306), which is what Delete does as
  well. Recommended: say what it does (for example "Accounts keep their
  industry"), text only; a real cascade would be an org-wide write to
  accounts, its own designed item if Jeff wants one.
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
- **The Settings → Users profile page PUTs a member's whole cached row —
  DONE (§0.211; guide §18b102)** (recorded 11 Oct with SalesManagerTab's
  forecast save; the 4b-2c re-map, 16 Oct). It re-sent the member's own
  title, phone, email, signature, preferences and timezone, a Manager's
  forecast calls and the Teams page's team, territory and vertical as the
  page had loaded them, and derived the team by name on every save. Since
  §0.211 a save sends the fields the page edits that changed
  (`memberChanges`, memberSave.js) — a Full name with First and Last
  cleared, a team by its id with its name — and the server keeps the rest
  (Jeff, 26 Oct: "Your change wins"). The server's own read-to-write
  window stays (§4.6, the Pin race).
- **The Settings → Users profile page after a save — DONE (§0.211):** the
  page holds the member as stored, so the band, the crumb and "Save
  changes" follow a save; the Users list takes the stored row; an Admin's
  own rename reaches the header at once (`setMyProfile`) and the profile
  panel when next opened.
- **The Settings → Users profile page has no leave guard** (the profile
  batch's P16; read in code): AdminView hands UsersDetail no save slot (AdminView.jsx:439), so
  the crumb's Users and every other way out drop unsaved edits without a
  word (guide §18b63 rule 4). Jeff, 26 Oct: "File it".
- **Found by the profile batch** (26 Oct, its map and design —
  docs/design/profile-batch/DESIGN.md §1; read in code, not run):
  - The page shows the member as the roster held them at sign-in: only
    Sync reads the roster again (P21; useSettings.js:116 loads it once; Sync, UsersDetail.jsx:1529). Jeff's
    "Your change wins" (Q1) left a fresh read on open undone.
  - Phone shows Mobile when Phone is empty, so clearing Phone shows Mobile
    again (P22; UsersDetail.jsx:1263).
  - The Email box says "Managed via Clerk — contact admin to change.",
    while the member can change it in their own profile panel (P23;
    UsersDetail.jsx:1255; AppHeader.jsx:641's Save Profile sends `email`).
  - "Audit log — Last 5 changes" reads `settings.auditLog`, which nothing
    sets, and "Last login" reads `user.lastLoginAt`, which no function
    writes (P24; UsersDetail.jsx:1367, :1357).
  - TeamModal's save drops deactivated and invited members from the
    roster on screen (P26; TeamsDetail.jsx:24 keeps the `active !== false`
    rows), and its territory- or vertical-only edit reaches no member's
    row though the roster on screen shows it (P27; it PUTs only the rows
    whose team or team id changed, TeamsDetail.jsx:75-78).
  - A team change on the profile page moves no territory or vertical; the
    Teams page's Assign does (P30; TeamsDetail.jsx:439; as before §0.211).
  - The Invite page sends `manager` with each invitation, and the invite
    path stores none (P39; UsersDetail.jsx:177; users.mjs's invite names no `manager`).
  - The profile panel's signature box reads empty after the avatar opens
    the panel: the click refills the panel's form with six keys and no
    `emailSignature` (P40; AppHeader.jsx:552, :628, :641). Save Profile then sends
    `emailSignature: undefined`, which JSON drops, so the stored one is
    kept — but it shows as none.
  - A Manager or Admin moved to a team on the profile page lands on its
    member list (`repIds`), as before §0.211; the Teams page lists only
    non-managers there and counts one who is also the team's manager
    twice (P41, D16; TeamsDetail.jsx:29-32, :354-358).
- **The backup page after §0.205** (its reviews, 16 Oct; read in code):
  - The snapshot list reads an import as "Automated" (it tells only
    'manual' apart) and a partial one as "Failed" (it knows only 'ready'
    and 'running'); a restore that wrote nothing does not reload the page
    on Close, so its own snapshot row is not listed until a reload; and a
    manual backup's record count leaves out settings and pipelines, which
    a restore's count includes. Older.
  - Close reloading the page — once records are restored, or may have
    been — discards an unsaved Backup schedule edit on the same page: no
    leave guard. New in §0.205.
  - The file picker stays clickable while an import runs. Older.
  - What Netlify answers on a timeout or an oversized file is unverified:
    a 413 that is not JSON reads "No answer from the server — the restore
    may have written records" and reloads the page on Close, though
    nothing was written.
  - The refused restore's line keeps a `data.error ||` that no answer of
    the restore's own reaches now (`saidBy` takes any answer in words
    first). Housekeeping.
- **Settings' "View accounts" (a segment's, an industry's) is not
  available yet — making it work is its own feature** (the cleanup
  batch's design, 18 Oct, P8; Jeff, 18 Oct: "Grey it out" — making it
  work "filed as its own feature"; state §0.210): since §0.210 both read
  "Not available yet" and open nothing (AccountSegmentsDetail.jsx:235,
  disabled; IndustriesDetail.jsx:286, muted). They had opened nothing
  since 85cc230 (7 May): their setter, `setAccountsDeepFilter`, is made
  by useUIState.js (:73, returned at :125) but put in neither App.jsx
  nor AppContext.jsx, so `useApp()` hands SettingsTab.jsx undefined
  (:30), which it passes to AdminView (:63; AdminView.jsx:95) and
  AdminView on (:451, :454, :466) to CustomerTypesDetail.jsx (:20),
  AccountSegmentsDetail.jsx (:30) and IndustriesDetail.jsx (:37) — none
  of which reads it since §0.210 — and the Accounts tab is handed no
  deep filter: App.jsx renders `<AccountsTab />` (:2110) without the
  three props it still takes into its filters
  (`initialAccountSegmentFilter`, `initialIndustryFilter`,
  `onDeepFilterConsumed` — AccountsTab.jsx:564, :617-628), which 85cc230
  dropped. To build: the setter and the filter through App.jsx's
  context, App.jsx handing the Accounts tab those props again, and the
  two items enabled, the list they open counting as the cards do — the
  live top-level accounts.
- **Buyer Personas' Delete reads "1 contact still use this"** (§0.210's
  browser check, 23 Oct; read in code): the line under a disabled
  Delete is `${count} contact${count !== 1 ? 's' : ''} still use this`
  (BuyerPersonasDetail.jsx:254) — the noun takes its plural, the verb
  never. Recommended: "1 contact still uses this", with §4.8's
  "Opportunitys" and "Activitys" in one pass over the app's counted
  words.

### 4.4 Dispatch

- **A dispatch customer can stand for an account under the name of one
  merged into it** (the cleanup batch's design, 18 Oct, P35; re-read 28 Oct
  for §0.214): a merge moves a dispatch customer's account to the survivor
  and never renames it (merge.mjs:233), so a customer made from an account
  later merged away names the survivor under the old name. Since §0.214 a
  survivor that then has two customers is no longer resolved to the first
  of an unordered read: quote -> job refuses (409, both named) and a won
  deal's placeholder asks to pick (dispatchCustomer.js customerForDeal), and
  the server refuses a NEW second customer for one account — the merge
  itself still makes one. The census of 28 Oct (SELECT counts only, 20:50
  UTC; docs/design/links-batch-2/ANSWERS.md): no account in any org has two
  customers, and no customer is linked to a merged-away account; customers
  NAMED as a merged-away account and linked to its survivor were not
  counted. Recommended: when a merge leaves a survivor two customers, the
  data decision (rename, combine or leave) with Jeff — and whether the merge
  should say so.
- **Dispatch's escape options for a stale value are enabled where guide
  §18b24.3 says disabled, and the customer type's does not draw** (the
  cleanup batch's design, 18 Oct: DESIGN.md:111, P40's last flag, and
  :1219, completeness F8d; re-read 23 Oct; read in code, not run). The
  customer form draws a stored plan or technician its list no longer holds
  as itself — "Deleted plan (…)" (DispatchTab.jsx:2743-2745), "Unknown
  technician (…)" (:2816) — each a live `<option>`. Guide §18b24.3 says
  "Render an unmatched value as itself, disabled." (:3007); guide §16's
  own example (:802) has no `disabled`, though §18b101 rule 4 (:4358)
  cites both for "a select shows it disabled". The role selects
  (UsersDetail.jsx:41, UserModal.jsx:164) and, since §0.209, the same
  form's Linked CRM account (`heldLink`, DispatchTab.jsx:2714) draw theirs
  disabled. Each is drawn only while the draft holds the stale value, so
  it leaves the list once another is picked, and an untouched Save sends
  the stored value either way (`...draft`, :3063; react-dom 18.3.1's
  `updateOptions` matches the value before it looks at `disabled`): the
  difference is how the open list draws it. The customer type's "Unlisted
  type (…)" (:2732-2734) is another case: `propertyTypesFor` (:2000-2009)
  lists every type still on a customer, the form's own among them, as
  `unlisted: true`, so the `.some(...)` at :2732 finds it and the option
  is not drawn, while `.filter(t => !t.unlisted)` (:2735) leaves it out of
  the options — React then shows the first type listed (guide §16's bug;
  both from 32ef196, 11 Aug; state 0PB.14, :9345, says the select emits
  the option). Its untouched Save still sends the stored type; as read,
  the option draws only if the customer list changes under an open form.
  The same shape, enabled, outside the design's list: the technician
  form's "Unknown login" (DispatchTab.jsx:3622 — pinned word for word by
  tests/dispatch-links.test.mjs:267 and quoted by a harness entry,
  scripts/mutate-import.mjs:11670-11672), a crew's default vehicle
  (DispatchCrewsDetail.jsx:232-234) and a service plan's visit template
  (DispatchServicePlansDetail.jsx:150). Recommended: make the customer
  type's test read only the types its select lists (`!t.unlisted`), so its
  value is drawn as itself; then Jeff picks the rule — disabled is the one
  the role selects and §0.209 follow: `disabled` on all six, §16's example
  made to match, and that pin and harness entry updated, in one batch.
- **One customer for one CRM account is read, then written** (§0.214; read
  in code): dispatch-customers.mjs asks for another customer of the account
  before its insert, with no index under it, so two creates at one instant
  can both pass (quote-to-job.mjs's create is read, then written, the same
  way); merge.mjs (:233) moves a merged-away account's customer onto the
  survivor whether it has one or not; and an Admin's backup restore inserts
  the file's customers by their ids with no such check (backup.mjs's
  `upsertChunked`), so a restored customer can land on an account another
  customer now holds. An index (unique on org and
  account, where an account is set) would close the race but make such a
  merge fail. Jeff decides; quote -> job and the placeholder refuse a deal
  two customers stand for either way.
- **A rep's Dispatch screen may find a deal's account where the server finds
  two** (§0.214's second review; read in code and run on made-up rows): for
  a deal with no account id, the won deal's placeholder reads the screen's
  accounts — for a Sales Rep (where the org opens Dispatch to reps) their own
  and unowned ones — and quote -> job every account of the org. A twin of the
  deal's name owned by another rep is then one account on the screen and two
  on the server. The placeholder takes the customer linked to the visible
  twin, else the one of the deal's name linked to no account, else its Save
  makes a customer linked to the visible twin; quote -> job takes the one
  customer of the deal's name, whichever account it is linked to, and
  refuses when none has the name or two do. So one can refuse where the
  other saves, and with a customer of the name linked to the hidden twin the
  two take different customers. Recommended: resolve a placeholder's customer on the server
  (send the deal, not an account found by name), as quote -> job does.
- **A New Job retry with a changed address leaves the first location** (§0.214's
  second review; read in code): a Save refused after it made the customer's
  location, retried with another address, makes a second location (no longer
  a second default) — the first stays on the customer. Recommended: update
  the made location in place on such a retry.
- **Two live accounts of one name with no parent still read alike** (§0.214's
  docs check; read in code): `parentNote` is '' for an account with no
  parent (accountParent.js), so a customer's Linked CRM account option is the
  bare name (only one another customer holds adds "— in Dispatch as …"), the
  header search's row adds only the owner and the open-deal count, and New
  Job's "CRM accounts — not yet in Dispatch" rows only city and state — yet
  New Job's refusal says "each row names its parent"
  (dispatchCustomer.js `typedCustomerRefusal`). The census's demo org with 3
  live account names held by two or more accounts was not read for parents.
  Recommended: a second distinguishing word (city, owner or number) wherever
  no parent is set, and refusal words that match the rows.
  The same where the parent is outside a Sales Rep's list (§0.214's tenth
  review, run on made-up rows): `parentNote` needs the parent in the
  screen's list, so a rep's twins under another rep's Shell read alike too.
- **The "no new customer" hold is the screen's, from a won deal's placeholder
  alone** (§0.214, Jeff 29 Oct: "No new customer"; its ninth review, read in
  code): New Job holds a deal two customers stand for only when it opened
  from that deal's placeholder (`refusedDeal`). The same deal picked by hand
  in Linked Opportunity (from + New job, a plan visit, or another deal's
  placeholder) is not held, and a typed new name makes a customer for it;
  dispatch-jobs.mjs checks only that the deal is live. quote -> job refuses
  the same deal (409). Recommended: the job save (or New Job on any deal
  picked) asks the deal's customers by `customerForDeal`, as quote -> job does.
- **A deal's account text can differ from its account's name, and rule 2
  then misses the account's own customer** (§0.214's eighth and tenth
  reviews, read in code and run on made-up rows): the bulk deal create
  stored `account` as sent until §0.216 (NOT committed), which gives a row
  naming an account id that account's own name (`bulkDealLinks`), as the
  single create and the edit do (`accountLink`); a deal stored before then
  keeps its text. For a
  deal on an account id, rule 2 reads the deal's text alone (so a rep's
  screen, which may lack another rep's account, and quote -> job agree), so a
  customer linked to no account and of the ACCOUNT's own name is not found:
  the placeholder and quote -> job make a second customer, which New Job's
  list counts as standing for that account beside the first. A deal still on
  a merged-away account id reads the merged-away text the same way.
  Recommended: resolve a placeholder's customer on the server (the item
  above).
- **quote -> job says "linked to no account" for a deal on a merged-away
  account whose merge chain leads nowhere** (§0.214's tenth review): the
  words fit a deleted account; for a broken chain they should say the
  account was merged and its survivor is gone.
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

- **A Sales Rep's emailed report reads only their own rows, not the rows
  their screens ran it over** (the cleanup batch's design, 18 Oct, P40a;
  re-read 23 Oct; read in code, not run): `loadReportData` reads the
  whole org when `canSeeAll(owner?.role)`, else only the rows whose
  `ownerId` is the owner's (`eq(table.ownerId, owner.id)`) — deals,
  accounts, leads and activities alike (report-deliveries.mjs:65-71); the
  scheduled run (:163) and Send now (saved-reports.mjs:118) both come
  through it. A rep's GETs hand them more: their own and every unassigned
  account and activity (`!r.ownerId || r.ownerId === callerId`,
  accounts.mjs:208, activities.mjs:108); unassigned leads while
  `unassignedLeadsVisibleToReps` is on (ON when absent, leads.mjs:36,
  :114-116); unassigned deals while `unassignedDealsVisibleToReps` is on
  (OFF when absent, _dealAccess.mjs:24; `dealVisibleTo`,
  src/utils/roles.js:78-89). Home's pinned report runs over those lists
  (HomeTab.jsx:192). The builder's preview (ReportsTab.jsx:2391) runs
  over the app's accounts (:2109) but over the tab's own scope for the
  rest (:2110-2118): the deals, leads and activities whose rep NAME is
  the rep's (`oppInScope`, `leadInScope`, `actInScope`, :143-175), so an
  unassigned one with no rep name is out of it too — the two screens'
  difference is filed (§3.5, Reports: "a pinned report on Home uses the
  app's visibility, the tab its own scope"). So a rep's email can count
  fewer accounts than both screens, and fewer leads, activities and
  deals than Home. For any role it can also count more deals than
  either: both screens hold only the active pipeline's
  (`visibleOpportunities`, App.jsx:834-838), the email every pipeline's
  (`runReport` filters by no pipeline; no line here names it). Yet
  report-deliveries.mjs:96-97 says "the table sent is the picture the
  builder showed", and state §0.135 (ACCELEREP_CURRENT_STATE.md:5863)
  calls the own-only read "the server's rule". It also asks `canSeeAll`
  (the write authority) where the GETs ask `crmReadScope`
  (roles.js:56-60): an owner who became a Dispatcher is sent their own
  rows, not the org's; one who became a Technician, their own rows where
  the GETs give none (both reached only by a role change — neither role
  can save a report, `requireWrite`, _roleGate.mjs:58-72; not run). And
  a Manager whose reps are named on their row is sent every deal, where
  the deals GET gives those reps' and the ones with no rep
  (roles.js:86-87). Recommended: read each table by its GET's rule for
  the owner (`crmReadScope`; `dealVisibleTo` with the owner's context;
  the leads switch) through one helper the GETs and the job both call;
  ask Jeff whether the email should also follow the tab's name scope and
  the active pipeline; with it, update the pins at
  tests/report-delivery.test.mjs:173-174 and THE GUARD's entry for this
  file (tests/merged-away-lists.test.mjs:1471).
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

- **A Manager's `managedReps` narrows no list but deals in the header
  search, Home's pinned reports and Reports** (the cleanup batch's design,
  18 Oct, P40b; re-read 23 Oct, read in code, not run): the client narrows
  a Manager whose row names reps only through `isRepVisible`
  (App.jsx:790-804), on the app's visible lists (:834-859; the context
  carries it too, :1774, and ReportsTab.jsx:51 takes it and calls it
  nowhere); the server only on deals and what belongs to one
  (`dealVisibleTo`, opportunities.mjs:283, quotes.mjs:247, roles.js:87) —
  the accounts, contacts, activities and tasks handlers take `managedReps`
  and read it nowhere (accounts.mjs:136, contacts.mjs:29,
  activities.mjs:51, tasks.mjs:30), and leads never meet it. The header
  search reads the app's whole lists (`unarchived(accounts)`,
  `unarchived(contacts)`, `opportunities`, AppHeader.jsx:467-469): it would
  list accounts and contacts the Accounts and Contacts tabs hide, and the
  deals naming no rep, which the server sends (roles.js:87) and
  `isRepVisible` hides (App.jsx:793). Home's pinned reports run deals over
  `visibleOpportunities`, but accounts, leads and activities over the whole
  lists (HomeTab.jsx:192), so §3.5's "a pinned report on Home uses the
  app's visibility" holds for deals alone. Reports narrows a Manager by
  their team's names (`myTeamMembers`, ReportsTab.jsx:120-135; one with no
  team, to their own name) — deals on top of `visibleOpportunities`,
  activities, leads and tasks instead (:172-175); its saved reports take
  the whole `accounts` (:2109, :2391), and Activity History lists every
  live account and contact to a Manager (`seesAllRecords`, :5052, :5083,
  :5101). Nothing differs today while no row holds `profile.managedReps`
  (the item above; not re-checked, no database read — users.mjs's sanitize
  builds no such key, :126-177, but a restore inserts a new member's row
  with the file's profile, backup.mjs:443, memberName.js:98-101, and its
  clean-up keeps every key but the team, the pins and, since §0.212, the
  manager id, _links.mjs clearMemberLinks):
  `isRepVisible` passes every row for every Manager. App.jsx's
  `visibleActivities` (:855-859) is read nowhere. Recommended: with the
  item above — once who a Manager manages is written, one rule for every
  list, on the server, as `dealVisibleTo` is for deals.
- **Reports' Activity History lists a rep's accounts and contacts by
  display name** (the cleanup batch's design, 18 Oct, P40c; re-read 23
  Oct; read in code, not run): for every role but Admin, Manager and
  Dispatcher (`seesAllRecords`, ReportsTab.jsx:5052) the Account history
  and Contact history pickers keep a row only when its owner name is in
  `myTeam` — `myTeam.has(owner)` over `a.accountOwner || a.assignedRep`
  (:5085-5094), and over `c.assignedRep || c.accountOwner` or no owner
  (:5102-5111) — built from `settings.users` by
  `u.name === currentUserName` (`currentUser` is the display name,
  App.jsx:200-209). The server already hands a rep their own rows by
  owner id and the unassigned ones (accounts.mjs:208, contacts.mjs:96),
  and App.jsx's `isRepVisible` stopped re-filtering by name for that
  reason (:794-803: it "could only HIDE rows the server granted"). So a
  rep's own account or contact whose owner name is an older one (a rename
  does not cascade — "Records named by an old roster name", §4.2) is left
  out of its picker, and an unassigned account with no owner name is never
  in Account history while an unassigned contact with none is in Contact
  history (`|| !owner`, :5110). The team half (:5084, "or are on the team
  for"; :5088-5089) never runs: a rep's `settings.users` is the directory,
  `{ id, name, active }` with no team (users.mjs:514-516;
  useSettings.js:116-128), so `myTeam` is the rep alone (:5087) — and the
  server sends a rep no teammate's row anyway. The tab's own gate is by
  name too: a rep's `myTeamMembers` is `new Set([currentUserName])`
  (:119-135), which `oppInScope`, `actInScope` and `taskInScope` test
  (:144-169, applied :172-175); Activity History is handed those lists
  (:2092-2094, the activities through `sliceActivities`, :225), so the
  deals, activities and tasks under a picked record are narrowed by name
  too (not traced further). Recommended: pass a rep's two lists through
  as the server granted them, as `isRepVisible` does — one rule for both
  pickers; C3 (tests/merged-away-cleanup.test.mjs:356-369, run with a
  by-name fixture) and tests/roles.test.mjs:186-187 move with it. Whether
  the tab's gate goes the same way is Jeff's call (§0.71 left its leads
  half, which drops unassigned leads, as his call).
- **A Manager can put a Sales Rep on any team of the org through the API**
  (the 4b-2 re-map, 16 Oct; read in code, not run). Every screen that sets
  a team is in Settings, which only Admins open, but the users PUT, the
  create and the invitation take a Manager's team id — since §0.205 only a
  team of this org's list — and the team's name, which the manager digest
  matches by, as text; the team brings its coaching notes from that day on
  (users.mjs; _coaching.mjs). Jeff, 16 Oct: "No, leave it".
- **A Pin can be undone by a whole-profile save racing it** (the 4b-2
  design, 16 Oct; read in code). Since §0.205 pins are written only by the
  member's own Pin, and every other save keeps the pins the PUT read
  before its write (`before`) — a Pin landing between that read and the
  write is put back. The quota plans take their stored value at write time
  (`keepQuotaPlans`, §0.203); the same would close this. Jeff, 16 Oct:
  "Not now, file it". Wider (the profile batch's P17, 26 Oct): every Admin
  or Manager PUT writes every column and the whole profile from its own
  read (`mergeForUpdate`, users.mjs:288; the write in `upsertUser`, :610), several queries before the write, so any write
  landing in between is put back — §0.211 ended the profile page's
  hours-old copy, not these milliseconds. A field-level write (`set` only
  the columns named, the profile as `coalesce(profile, '{}') || <the keys
  sent>`, as `?quotas=true` does) would close both; it moves
  member-identity's PUT-order pin, member-names' and member-links' pins and
  about 20 harness entries. Jeff's call. Beside it: user-role.mjs writes
  the whole profile from a read made before its Clerk call (P18), and
  `PUT ?me` writes the role from its own earlier read (P19).
- **The member's own Pin reads the member's row again** (§0.205's build;
  read in code): `mergeForUpdate` has read it, and the pin check reads it
  again for the pins it holds — one extra query per Pin. Passing the
  merge's pins through would drop it; it moves member-links T5's order pin
  and two harness entries. Jeff's call.
- **Found by the 4b-2 re-map** (15–16 Oct; read in code, not run; Jeff, 16
  Oct: "file the rest"):
  - Home's coaching block never shows a rep their team's notes — Home reads
    the member list, whose copy for a rep carries no team (HomeTab.jsx; the
    quota batch's `myProfileHere` is the pattern).
  - The Teams page hides a member whose team was deleted: under no team and
    not under Unassigned (TeamsDetail.jsx).
  - The member profile page derives the team by name on every save, which
    can clear a valid team and its joined date (UsersDetail.jsx) — DONE
    (§0.211): it also moved a member of a second team of one name onto
    the first. A team is now picked by its id and sent with its name, only
    when the Team box changes.
  - A forecast call sends the rep's whole calls map, so one manager's call
    can put back another's for a different quarter, or the same quarter's
    other figure — a Commit re-sends the Best case as the tab holds it
    (forecastCall.js). Since §0.205 the call sends only that field,
    `{ id, forecastCalls }`, never the rep's whole row; the field is still
    the whole map. Since §0.211 the profile page no longer re-sends the
    calls. The one-figure save — a server branch that merges one figure,
    as `?quotas=true` merges one year — is its own small batch (Jeff, 26
    Oct: "Steps A and B").
  - A 51st Pin does nothing, and a pin of a deleted report can never be
    unpinned (users.mjs; ReportsTab.jsx).
  - The settings PUT keeps a SPIFF list of any shape (settings.mjs) — for
    4b-3's list.
  - The claims GET answers every role, Technician, Dispatcher and Read-only
    included (spiff-claims.mjs).
  - The restore double-encodes the lists of a hand-made Dispatch file
    (backup.mjs, JSONB_KEYS).
- **Found by the profile batch** (26 Oct, its map — docs/design/
  profile-batch/DESIGN.md §1; read in code, not run):
  - A bare `{ id, name }` over a stored First and Last is stored as the
    old name with a 200 (users.mjs:118 sanitize builds the name from First and
    Last first); a key the PUT does not know is dropped without a word;
    and a PUT that changes nothing still writes a `user.updated` row (P20; users.mjs:1151).
    The profile page always sends the pair, and never an empty PUT.
  - Deleting a member takes their id off no team's `repIds` or
    `managerId` — only a revoked invitation's row is taken off its team's
    list (P31; users.mjs:1162's DELETE; UsersDetail.jsx:860 `dropRevokedRow`).
    Since §0.212 nor off any member's `profile.managerId`: their reports'
    band, Users list and export then read the stored name, and the box
    "(no longer a member)"; a revoked invitation leaves it too (users.mjs's
    DELETE, the revoke).
  - users-sync fills a blank `team` from Clerk's user-level
    `publicMetadata`; whether an organization invitation's metadata lands
    there is unverified (P32; users-sync.mjs:124, :159).
  - The PUT trims an email but does not lowercase it (P33; users.mjs:120
    sanitize) — the profile page no longer sends it. A name over 255
    characters reaches Postgres (reasoned, unverified).
- **Found by the profile batch's step B** (§0.212, 27 Oct — its review, four
  lenses with a skeptic each; read in code, not run):
  - A member a restore's file names as their own manager is cleared and
    counted in "N links that named no record of this organization were
    cleared." — wrong words for that one (it names this org's member), and
    the name kept is their own (linkIds.js memberLinksCleared, backup.mjs's
    notes). Recommended: count them apart, in their own words (Jeff's call).
  - The manager refusal, "That member is not in your organization — pick
    one from the list.", reads like the 404 for the member being edited
    ("… they may have been removed …"), and the page shows the words alone.
    Recommended: a manager noun for the refusal (Jeff's call on words).
  - The Manager box's chip for a row from before §0.212 reads "(not
    linked — remove, then pick them again)": two steps, × and then a
    search. Recommended: × on that chip puts the name into the search, so
    Enter relinks.
  - A pick the server refuses because that manager was removed since the
    page loaded stays on screen as a plain chip, and the search offers them
    again (the roster is read at sign-in); the Team box does the same with
    a team removed since. Recommended: clear the pick on a refusal naming
    its field, or read the roster again.
  - The Manager box's list is placed when it opens and at each keystroke:
    a banner that comes or goes above the form ("✓ Changes saved
    successfully.") moves the field and leaves the list where it was until
    the next keystroke — as the house's fixed popovers do (LeadsTab.jsx).
  - The server keeps a manager's name and id paired (§0.212); a team's it
    does not — a body naming `team` without `teamId`, or the reverse, keeps
    the stored other (the profile page pairs them, memberSave.js).
    Recommended: the same server rule for the team, with batch 4b-3.
  - The user window's edit save (useUserHandlers.js `handleSaveUser` with
    `editingUser` set, reached only through `handleEditUser`, which nothing
    calls — §6, "The member form's edit path has no caller"; the profile
    batch's P36, DESIGN.md §1) would send `manager` and `managerId` as
    loaded (UserModal.jsx starts its form from the loaded member).
    Recommended: strip both beside the team's keys it already strips, if it
    is ever wired.
  - A member's own save (`?me`) writes the whole profile from its own read,
    so an Admin's manager save landing in between is put back — the
    server's read-to-write window (the Pin race, above); only the quota
    plans are kept at write time.
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
  matching spiff"; he removed it himself with the new claim Delete button in
  §0.204's browser check, 16 Oct — `spiff_claim.deleted`, "was approved";
  Claude deleted nothing).
  - **4b-2b is DONE (§0.204; guide §18b97):** claims' deal and SPIFF,
    quote lines' product and automations' assignee asked; the claim rules
    (1) and (2); the 409s of claims, quotes and export runs; export runs
    store no schedule; the claim Delete and the SPIFF control; D2, D3, D5
    and Reject's colour. **4b-2c is DONE (§0.205; guide §18b98):**
    members' team and pinned reports asked (pins written only by the
    member's own Pin; an Admin's or Manager's member save keeps the stored
    ones), the forecast call sending only its field, and the restore — its
    dates, the rows refused, not reached and already here said, "records
    restored" counting only rows written, and the clean-up of quote lines'
    products, teams and pins. A Manager setting a rep's team ("No, leave
    it") and pins kept at write time ("Not now, file it") stay filed
    (above).
  - 4b-2 (Jeff's decisions, 15 Oct): SPIFF claims' `opportunityId` (a deal)
    and `spiffId` (an entry of the org's SPIFF list); quote lines'
    `productId`; automations' create-task `assignedToId` (a member);
    members' `profile.teamId` (an entry of the org's teams) and pinned
    reports. Any record or entry of this org counts, inactive ones too, and
    anything else is refused, naming the field ("Any of this org's,
    refuse"); a link a row holds is never asked again. Pins are written only
    by the member's own Pin: an Admin's or Manager's member save stops taking
    them, and the Sales Manager tab's saves send only what they change ("Send
    only what changed" — since §0.205 the forecast call sends only its field,
    the rep's whole calls map as the tab holds it: filed above). A claim save
    that clears its SPIFF or rep answers
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
  - The re-map (15–16 Oct, read in code over the quota batch: four mappers,
    a designer and two critics) and Jeff's answers (16 Oct): two batches,
    4b-2b then 4b-2c ("Two batches"); a claim's Approve / Reject sends only
    its id, the new status and who approved it and when ("Yes, send only
    the change" — the whole claim as loaded could put a stale copy back); a
    claim with no amount reads a dash instead of taking the Sales Manager
    tab down ("Guard it now"; none stored); a quote line that is no line,
    or lines that are no list, answer 400 — today a 500, or every line of a
    Draft wiped ("Refuse with a 400"; none stored); the restore's "records
    restored" counts only rows it wrote, and the rest are said apart ("Fix
    both" — done in §0.205); the claims list's Reject loses its red fill,
    red being for delete ("Fix Reject's colour, file the rest"). Not done:
    a Manager setting a rep's team ("No, leave it") and pins kept at write
    time ("Not now, file it") — both below. The census found no stray to
    keep (the design's D10), and QA's removed-SPIFF claim is approved
    already, so the held link is proved in the itest (D4).
  - 4b-3: settings' teams, crews and quote templates' product ids, and a
    service plan's `visitTemplateId` (an entry of the org's job templates —
    found by the 15 Oct critic, in no list); and the teams list a restore
    lands where the org had no settings row — its entries' `repIds` and
    `managerId` can name another org's members, and since §0.205 a
    restored member's team is judged against that list (the 4b-2c map,
    16 Oct).
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
  Since §0.204 claims, quotes and export runs answer 409, and a claim id
  that is not text is 400; the quotes and export-runs creates still take
  an id that is not text (`if (!data.id)` only — stored as its text, as a
  claim's was), and export-runs looks its scope up on a plain object, so
  a scope such as 'toString' passes the "Unknown scope" check and the read
  is expected to throw — a 500, Admin only, nothing read (read in code,
  not run).
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
  an Admin's restore does, and the restore's is this item. The 4b-2c
  re-map (16 Oct): from that batch the restore lands rows it dropped
  silently — every member whose row held a team date (stamped when a save
  puts them on a team, cleared when they leave it) among them — so more
  members reach this. Jeff, 16 Oct: "Keep it filed, named". Named in
  §0.205: since it, those rows land.
- **A restored merged-away account or contact lands with its merged-into
  id** (§0.205's amendment, 16 Oct; read in code): the restore's clean-up
  (RESTORE_LINKS, `_links.mjs`) does not list `mergedIntoId`, so one that
  names no record of this org stays. A dangling link, not a leak — every
  reader looks it up in the org (opportunities.mjs, ai-score.mjs,
  linkIds.js). Since §0.205 merged accounts and contacts land (their
  archive date was one the old date list missed).
- **Automations: a deactivated assignee, and the rule save** (the 4b-2 map):
  the engine assigns a rule's tasks by id to a deactivated member while the
  rule editor shows that assignee as gone; the rule PUT has none of the
  create's checks — `actions: []` is taken, `null` is a 500 (NOT NULL),
  and the trigger is never checked against the list (the engine fails
  closed).
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
  - A rename — what the name refusal asks for — would leave a Manager's
    `profile.managedReps` on the old display name, were it written
    (`dealVisibleTo` narrows by it). Read 11 Oct (§0.196). A member's
    manager has been stored by id since §0.212 (`profile.managerId`, §1),
    the readers following the id; `managedReps` could take the same home —
    a Manager's reps the members whose `managerId` names them (P35;
    flagged, not wired: Manager scoping is its own decision). So could the
    deal alerts' manager (_jobRoster.mjs `managerOf`: `managedReps`, then
    the team), today not the one the profile says the member reports to.
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
  Since §0.212 a member's `profile.managerId` is written and checked — a
  natural home (P35; the rename item above).
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
  claim's deal and SPIFF. Also: the claims list keeps its own copy after
  an approve; a Manager's list is the claims named for their own team's
  reps on the screen only (since §0.204, "Narrow to their team") — the
  claims GET, an Approve and a Delete still take any claim of the org
  from a Manager — and by name, as a claim names its rep: a rep renamed
  since leaves her earlier claims out of her Manager's list (an Admin's
  still holds them), and a removed rep's name taken by a new member of
  the team brings the old claims in; an account merge renames a
  same-named twin account's claims' account text. And (§0.204, read in
  code, not run): a claim stored with a SPIFF or
  rep of only spaces, saved with that field cleared, still meets the NOT
  NULL — a 500 — as the cleared 400 refuses only a set value turned
  blank; one stored '' meets it on every save, an Approve included, as
  sanitize stores '' as none (none of either — the census, 16 Oct; no
  write stores one now).
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
- **The public API's `limit` and `page` let a non-number through, and
  `?limit=abc` answers every row** (§0.210's review, 23 Oct; read in
  code, not run): `parsePagination` (public-api.mjs:51-55, since
  5539b4c, 30 Mar) reads `parseInt(params.limit)`, NaN for a
  non-number, and `Math.min(200, Math.max(1, NaN))` is NaN, so `limit`
  and `offset` are NaN; drizzle 0.45.2 writes a LIMIT only for a number
  of 0 or more and an OFFSET only for a truthy one
  (node_modules/drizzle-orm/pg-core/dialect.js:286-287), so the query
  has neither — every row of the resource its filters match, past the
  200 cap, with `meta.limit` and `totalPages` null (`JSON.stringify`
  of NaN) and `hasNextPage` false; `?page=abc` likewise drops the
  OFFSET (page 1's rows, `meta.page` null). Within the key's own org and
  under its rate limit (300 per 15 minutes) — a size cap bypassed, not a
  leak. Recommended: a value that is not a positive whole number reads as
  the default (`limit` 50, `page` 1), or answers 400.
- **The deal window offers "+ New Rep" to every role** (§0.213's browser
  check, 28 Oct — seen as Karen, a Sales Rep, in Accelerep QA; the create
  read in code, not sent): its Sales Rep list ends in "+ New Rep"
  (OpportunityModal.jsx:1720-1724), which opens the New User window
  (ModalLayer.jsx:219-222) for any role, while users.mjs takes a write only
  from an Admin or a Manager (`ADMIN_ROLES` :28; 403 "Forbidden:
  insufficient role", :534-537) — so a Sales Rep fills in a form whose
  Create is refused, and the refusal's dialog opens under the window (§4.8,
  "Failed to Save User"). Against guide §18b76 (a control is offered to the
  roles that write). Recommended: offer "+ New Rep" to the roles that write
  members, and pin it with the role gate's other controls.

### 4.7 Imports and merge

- **A merged-away contact's rail prefills itself into every Log button and
  "+ Add Task"** (the cleanup batch's design, 18 Oct, P29; re-read 23 Oct;
  read in code, not run): ✉ Email, ☎ Call, a template or a blank email
  from the picker, ✎ Log and + Log Activity open Log Activity on the
  contact's own id (`openCommLog`, ContactRail.jsx:436-445 →
  `contactLogContext`, railLinks.js:97-107: `contactId: id`, no
  `survivorOf`), and "+ Add Task" opens a new task with it as the Primary
  chip (ContactRail.jsx:1010 → `taskSeed`, taskLinks.js:94, :100), each
  drawn under the merged-away contact's name (ActivityRail.jsx:84-88;
  `contactChip`, taskLinks.js:58-60). Guide §18b91 rule 5 has a new record
  prefilled with a merged-away account or contact ("a contact's Log
  buttons" among its examples) take the record it was merged into, by id,
  and never show the merged-away name; the prefills do that for the
  account alone (railLinks.js:152-153, taskLinks.js:90-92). The server
  stores the survivor's id (a contact merge is followed, linkIds.js:38,
  :137; activities.mjs:120, tasks.mjs:94), but a task's chip keeps the
  name sent (linkIds.js:69; guide §18b92 rule 3). Latent since §0.209: no
  opener reaches such a rail. The header search lists live contacts and
  opens a merged-away name's survivor (AppHeader.jsx:468, :473, :484); the
  Contacts tab reads `unarchived` (ContactsTab.jsx:672-675; its openers
  :207, :289-290, :562, :614-615); an account's People reads
  `shownContacts` (AccountRail.jsx:281, :954); "Open existing"
  (ContactRail.jsx:632) takes the /duplicates probe, which drops
  merged-away rows (duplicates.mjs:227); and ← Back returns only to a
  contact the rail itself showed (pushed only at ContactRail.jsx:401,
  :632). Not traced: a rail left open while another session merges its
  contact and the lists reload. Recommended: with the merged-away rail
  (the item above; after the profile page, the design's D10, approved by
  Jeff on 18 Oct: "Approve; fix the list"), its Log buttons and "+ Add
  Task" take the survivor by id (`survivorOf`).
- **A merge moves no document's links, and an account merge no invoice's
  account** (the cleanup batch's design, 18 Oct, P31; re-read 23 Oct):
  merge.mjs imports no `documents`, `documentLinks` or `invoices` table
  (:2-5). An account merge moves the `accountId` of tasks, activities,
  Dispatch customers and jobs and deals, and sub-accounts' parent
  (:231-236), and writes the survivor's name into deals' and SPIFF claims'
  `account` and contacts' `company` (:238-240); a contact merge moves
  tasks' and activities' `contactId` (:658-670), deals' `contactIds`
  (:672-683) and colleagues' org charts (:685-711). So a `document_links`
  row naming the record merged away (schema.ts:1330-1343) stays on it, its
  `recordName` too (:1336), and the reverse read `?linkedTo=` matches that
  id alone (documents.mjs:275-281; no caller in src found by grep). Since
  §0.209 the survivor's Documents tab lists such a document (`standsFor`,
  RecordDocuments.jsx:36-46), and its × removes every link of it to the
  survivor and to a record merged into it (`unlinkHere`, :81-85), which an
  Undo does not bring back (Jeff was told, 18 Oct: docs/design/cleanup-batch/ANSWERS.md, Q2). An
  invoice's `accountId` (schema.ts:675), copied from its job when it is
  made (invoices.mjs:160) and written by no other path (its PUT, :188-221,
  writes no link), stays on the account merged away while the job's moves
  (merge.mjs:234); no reader of it found in src or netlify (grep). Moving
  the links must de-duplicate: a document linked to both records would
  break `document_links_unique_idx` (documentId, recordType, recordId;
  schema.ts:1342), the target documents.mjs's own insert skips on
  (:520-521). The rest P31 names is filed: contacts' `accountId` ("Batch 3
  of §1 item 1", below), activities' `contactIds` and tasks' chips
  (`tasks.contacts`, schema.ts:244; "A contact merge leaves…", above).
  Past merges keep what they left. Moving it for them is a backfill, a
  data write: Jeff's decision, after a read-only count of the rows naming
  a merged-away record (the design's §9.1, which leaves out invoices; not
  run). Read in code, not run. Recommended (batch 3, merge.mjs, a
  functions deploy): move the links, with the survivor's name, and the
  invoice's account in the merge's batch, each logged so its Undo puts it
  back only while it still holds what the merge wrote (guide §18b100);
  where the document is already linked to the survivor, keep only the
  survivor's link, the one dropped logged whole so the Undo can make it
  again. Whether an invoice past draft, which takes no edit
  (invoices.mjs:183-186), moves too is Jeff's call.
- **D22's "no other account has the name" counts an account merged
  away** (the cleanup batch's design, 18 Oct, P32; re-read 23 Oct; read
  in code, not run): a deal with no account id is moved up off a site —
  one a move makes, or one a merge puts it on — by its name only where
  no other account has the name (§4.2, "D22's edges"), and both checks
  count every account of the org, merged-away ones included, while a
  merge leaves the record it archives its name (merge.mjs:261 writes the
  mark, not the name). A move: `sitesMade`'s `alone`
  (src/utils/accountParent.js:378, `!list.some((b) => b.id !== a.id &&
  (b.name || '') === storedName)`) reads every row `orgTreeOf` selects
  (accounts.mjs:86-89, handed in at :398-403; `rowsOf`,
  accountParent.js:91, drops only a row with no id). A merge into a
  site: `named` is every account of the archived one's name
  (merge.mjs:217, no `mergeArchived` test), and `byName` (:218) fails on
  any not of the pair. So once two same-named accounts are merged, a
  move that then makes the survivor a site leaves the id-less deals of
  that name on the site; and a merge into a site of an account that
  shares the name of one merged away earlier leaves the id-less deals of
  that name on the site by name (renamed to the survivor's name, :238;
  not lifted, :221-223, :243). UKG held such a namesake at 9 Oct: one of
  its two "Evonik - Lafayette" sites merged away (§1; SELECT 9 Oct, not
  re-read). Its "Shell - Port Allen" twins would be another once merged
  (§2.4), though the survivor §2.4 keeps is a site already, which no move
  makes one (accountParent.js:374), and no UKG deal is named "Shell -
  Port Allen" (SELECT 12 Oct, §2.4). Not counted: whether any deal with
  no account id holds a merged-away account's name today (the census of
  18 Oct counted links by id only, docs/design/cleanup-batch/DESIGN.md:8-10).
  The D22 test pins a live twin only
  (tests/account-parent.test.mjs:532-536). THE GUARD records the
  accounts.mjs half "for batch 3" (tests/merged-away-lists.test.mjs:1459);
  its merge.mjs reason (:1457) says the merge reads both records "by
  id", which :217 does not (nor :173, the sub-accounts by parent, nor
  the Undo's `treeOf`, :352-355, every account of the org). Recommended
  (batch 3): count only live accounts as namesakes in both — in `alone`,
  and in `named` / `byName` — not by narrowing `orgTreeOf`, whose
  merged-away rows the parent rule reads for its "merged into another
  account" refusal (accountParent.js:181; `orgTreeOf` already selects
  `mergeArchived`, accounts.mjs:88; tests/deal-account.test.mjs:549 pins
  :218's text); add a merged-away twin to the D22 test; and correct the
  guard's merge.mjs reason.
- **An inbound email's activity stores its contact's links unchecked**
  (the cleanup batch's design, 18 Oct, P33; re-read 23 Oct; read in
  code, not run): the dropbox writes the matched contact as read —
  `contactId: matched.id`, `contactIds: [matched.id]`
  (email-inbound.mjs:385-386) and `accountId: matched.accountId || null`
  (:387) — through no `checkLinks` (the file imports no `_links.mjs`,
  :1-7), where the activities endpoint's create checks the same fields
  (`ACTIVITY_LINKS`, activities.mjs:17-23, :120) and stores a row merged
  away as the one it was merged into (linkIds.js:18, :24-25). So the
  activity's account is whatever the contact holds: an account merged
  away (an account merge moves the activities that name it then,
  merge.mjs:232, not one the dropbox writes after, and renames contacts'
  `company`, not their `accountId`, :240 — the contact merge item above)
  or one deleted since (the single DELETE's batch, accounts.mjs:527-538,
  writes no contact). Its contact is the first of an unordered read that
  keeps merged-away rows (:332-337 — the matched-by-name item below; a
  merged-away contact keeps its email and personal email, merge.mjs:726
  writes only its merge marks). Since §0.209 the survivor account's
  Activity tab lists one on a merged-away account through its contact
  (`standsFor`, AccountRail.jsx:274-277, :297-302); one on a deleted
  account is on no account's tab — its `accountId` and its contact's
  name no row (:276, :300); what the other readers of an activity's
  `accountId` show is unverified. No test pins the links it stores:
  email-inbound.itest.mjs reads no `accountId`, and THE GUARD's T10
  names only the file's one contacts read, as filed
  (tests/merged-away-lists.test.mjs:1473). Recommended (a functions
  batch, with batch 3): the insert's links go through `checkLinks` with
  `ACTIVITY_LINKS`, as the activities endpoint's create does — a
  merged-away account or contact stored as its survivor — except that
  an account naming no row of the org, which `checkLinks` answers 404
  (`linksDecided`, linkIds.js:136), is stored as none and the email
  still logged, not refused.
- **The account merge window's words leave out Dispatch, SPIFF claims
  and where lifted deals go** (the cleanup batch's design, 18 Oct, P36;
  re-read 23 Oct; read in code, not run): its summary
  (MergeReviewModal.jsx:238 — "Merging re-links N opportunities, N
  contacts, N activities", tasks and sub-accounts when any, "from “X” to
  “Y”, then archives “X”") names only what `countsFor` counts (:63-75).
  The merge also moves Dispatch's customers' and jobs' account to the
  survivor (merge.mjs:233-234) and renames SPIFF claims' account name
  (:239); the summary says neither. And where the survivor is a site
  and a live account stands above it once merged (:210-216), the merge
  moves the merged-away account's deals up to that account, under its
  name, Site Name the survivor (D22, §0.198; :217-224, :243), while the
  summary's opportunities count (:68 — by the deal's account link since
  §0.210) takes those on “X” as re-linked to “Y”, and the window's
  opening line (:171, "its related items are re-linked to the
  survivor") says the same of them. Since 7ee14fe the two files changed
  only in §0.210 — the window's counts (:63-75) and merge.mjs's comment
  (:259-260) — not these words or these moves. Recommended (with
  batch 3's merge.mjs edit): the summary names every kind the merge
  moves — Dispatch customers and jobs, SPIFF claims — and, for a merge
  into a site, both lines say the deals go to the account above it.
  SPIFF claims are in the app's context (App.jsx:1852; the window does
  not take them from `useApp`, :42-47); Dispatch's lists are not (none
  in App.jsx — the tab loads its own, DispatchTab.jsx:5677-5678, and
  §4.2 files that a merge reads neither again), so a Dispatch count
  needs a read, or the words name the kind with no count.
- **UKG holds 10 merge logs still 'merged' but 8 merged-away records,
  and why is not known** (the cleanup batch's design, 18 Oct, P41;
  re-read 23 Oct; read in code, not run against a database): the
  merge-log census (§2.2; 18 Oct 18:56:02 UTC, SELECT, counts only)
  found 10 logs still 'merged', all UKG's; the cleanup batch's census
  (docs/design/cleanup-batch/DESIGN.md:8-10; 18 Oct 21:16 UTC, as on 16
  Oct 21:13 UTC) found 3 accounts and 5
  contacts merged away, all UKG's. Neither has been re-run, and which
  log names which record was never read. Every merge since the first
  (2e21f1a) writes its log in the batch that archives its record
  (merge.mjs:261-282, :726-738); only an Undo moves a log off 'merged'
  (:487-489), in one batch with its record's un-archive (:492-494), as
  every reverse before §0.207 did (61ca21a^, :312/:328, :504/:523); no
  file but merge.mjs writes the table, and nothing purges it
  (db/schema.ts:1276); no save writes `mergeArchived` (neither
  `sanitize` carries it: accounts.mjs:153-184, contacts.mjs:40-72). So,
  as the code reads, the logs outnumber the records only where (a) a
  merged-away record was deleted since its merge (both DELETEs are hard
  and leave its log as it was: accounts.mjs:530, contacts.mjs:260; the
  Admin clears, :448, :232), and perhaps put back live since: by the
  delete's Undo, whose POST stores no merge mark (accounts.mjs:269-270,
  :284; contacts.mjs:136-138; filed in §4.2, "A delete's Undo does not
  put back an account's created date, its merge mark or its last-edited
  time", and §2.2, a tab opened before §0.206's deploy), or by restoring
  a file made before the merge, whose rows `stamp` keeps as filed
  (backup.mjs:305-324, :355; read, not run); or (b) two merges of one
  record, sent together, both committed (merge.mjs:123 and :634 check
  it is not merged away, then :261 and :726 archive it with no such
  condition; §4.7, "Two concurrent merges of one record merged away both
  commit"). Which, for UKG, is unverified. On screen: Past merges offers
  no Undo on a row the Undo's rule refuses and shows why (`undoRefusal`,
  src/utils/mergeUndo.js:26-33; merge.mjs:787-789; PastMerges.jsx:68,
  :85), and the server refuses one sent, writing nothing
  (merge.mjs:596-597): "… was deleted after this merge …" for a record
  gone, "… is no longer merged into …" for one put back live or merged
  into the other survivor. Where both merges named the same survivor,
  both rows offer an Undo (mergeUndo.js:31): the first pressed is taken,
  the other refused after it (reasoned, not run). It matters for batch
  3: past merges' links need a backfill, Jeff's decision (the cleanup
  batch's design, P31), and one would go by these logs (reasoned; no
  backfill is designed). Recommended: before batch 3, with Jeff's go and
  read only, either read the reason on each of UKG's Past merges rows
  (Settings → Data → Find & merge duplicate accounts, and the contacts
  page, as an Admin; no Undo pressed), which tells a record deleted from
  one no longer merged into its survivor, but not which way, and lists
  the latest 50 of a kind (merge.mjs:753); or run one SELECT, counts
  only, of UKG's 'merged' logs whose record is missing, live, or merged
  into another record, of the pairs logged twice, and of its
  merged-away records no 'merged' log names; file the answer here.
- **Reports' "Contacts on this deal" leaves out of a survivor's last touch
  an activity that names a contact merged into it** (the cleanup batch's
  design, 18 Oct, P44; re-read 23 Oct; read in code, not run): Opportunity
  history's "last touch … · N activities" and Engagement tier for each
  contact come from `contactTouch(activities, c.id)` (ReportsTab.jsx:6319,
  drawn :6368 and :6393-6397), which counts an activity only when its
  `contactId` is that one id or its `contactIds` include it
  (historyFeed.js:63-65). A contact merge moves activities' `contactId` and
  deals' `contactIds`, not activities' `contactIds` (merge.mjs:658-683),
  and a save writes an activity's `contactId` as its list's first
  (activities.mjs:78; email-inbound.mjs:385-386) — so an activity that
  names the merged-away contact and not the survivor (further down its
  list, or first where a later save wrote its `contactId` back: the
  contact merge item, above) is not counted on the survivor's row, while
  since §0.209 the survivor's rail (ContactRail.jsx:272-279) and Reports'
  own Contact history (ReportsTab.jsx:5225, :5238) list it through
  `standsFor`. None at the census of 18 Oct 21:16 UTC, which found no
  activity naming a merged-away record by id
  (docs/design/cleanup-batch/DESIGN.md:8-10; not re-run); any contact
  merge since can make one. Batch 3's move of activities' `contactIds`
  (the contact merge item, above) closes it for merges after it; rows an
  earlier merge left would need a backfill, which nothing files yet
  (Jeff's decision). Recommended, only if wanted before batch 3:
  `contactTouch` takes the ids `standsFor(c, contacts)` gives and counts
  an activity once when it names any of them, as the Contact history's
  `cIds.some(…)` does — one call per id, summed, would count twice an
  activity whose `contactId` the merge moved to the survivor while its
  list still names the contact merged away (the call line is pinned
  whole, tests/history-feed.test.mjs:117).
- **Reports' "Contacts on this deal" draws a deal's contact ids raw — a
  merged-away contact as itself** (the cleanup batch's design, 18 Oct,
  P46; re-read 23 Oct; read in code, not run): Opportunity history lists
  each contact of the app's whole list, merged-away rows kept (handed
  whole at ReportsTab.jsx:2091), whose id the deal holds (:5944-5948,
  `oppContactIds.includes(c.id)` over `contacts`), never followed to the
  record it was merged into — the deal window and Home read a deal's
  people through `dealCommittee`, each id as its survivor
  (dealEngagement.js:142, :148-154; OpportunityModal.jsx:860,
  HomeTab.jsx:517). Such a row's ⋮ menu (`ContactRowKebab`, :4762, drawn
  at :6402-6407) offers "Remove from deal" and "Buyer Persona", whose
  save PUTs the merged-away contact's whole row (:6348-6351): the persona
  lands on the merged-away row, not its survivor (contacts.mjs:195-218
  writes the row its id names and reads no merge mark; its sanitize,
  :40-72, builds no merge column, so the mark stays). THE GUARD names the
  read to stay (tests/merged-away-lists.test.mjs:592) because "a stale
  whole-row save writing one back is OPEN_ITEMS §4.7's stale-write edge"
  — but that edge is an activity's or a task's held pair; a deal holds
  none, the merge rewrites the ids of every deal that names the contact
  (merge.mjs:672-683, one batch at :738), and every deal write follows a
  contact id it names anew to its survivor (opportunities.mjs:28, :297,
  :314-316, :415-417, :480-482; linkIds.js:79-99). An id a deal already
  holds is never asked again (linkIds.js:22-25, :121-122), so a
  merged-away id that reaches a deal stays through its later saves. What
  can still hand the panel one: a deal deleted since a backup taken
  before the merge, restored as filed (backup.mjs:352-362) — the
  clean-up keeps a link to any row of the org, merged away or not
  (_links.mjs:123, :212-214, :232-241), as the restore item in this
  section finds for an account's parent; a copy older than another
  session's merge — the app's deal (its lists are read on load and on an
  org switch, App.jsx:487-504), and after the panel's own add or remove
  the ids it sent (`setLocalContactIds`, :6284, :6338), which override
  the deal the app holds (:5944) until a deal is picked again (:6006),
  never the row the PUT answers (opportunities.mjs:612), so they keep
  the merged-away id after the server stored its survivor; and a deal
  save whose link check reads before a merge's batch and whose write
  lands after the merge read the deals (merge.mjs:673) — a race the code
  does not rule out; not run. The filter's other clause,
  `c.opportunityId === selectedOppId` (:5946), reads a column contacts
  lack (db/schema.ts:115-166). Near it, not it: §4.2's "The deal's
  contacts after a merge, a rename, a Reports edit" (the add and remove
  never update the app's copy) and its item on screens that save an old
  copy (Reports' persona edit sends the contact row). Recommended: the
  panel's people through `dealCommittee` (a merged-away id as its
  survivor, once — its rows also hold names with no id, which Remove and
  Buyer Persona cannot act on by id), its add and remove keeping the
  `contactIds` the PUT answers, and THE GUARD's reason at :588
  corrected; whether a restore follows a merged-away contact to its
  survivor, as a deal's create does, is Jeff's call (with the restore
  item's functions batch).
- **The backup restore after §0.205** (its reviews and re-check, 16 Oct;
  read in code, and run where said):
  - A row written whose answer was lost — a chunk's, then counted already
    here in the same run, or a row's, counted not reached — is not among
    the rows restored, so the link clean-up never reads it, and a re-run
    calls it already here: its stray links stay as the file had them (run
    on drizzle's driver with a made-up fetch, the re-check). Older in
    kind: the restore always cleaned only the rows an answer named.
    Recommended: hand the clean-up the id of each row not reached, and of
    each row of a failed chunk that the fallback then finds already here
    (it reads and writes by id within this org; a row of this org that
    held that id before the restore would have its stray links cleared
    too).
  - A member profile the file gives as JSON text is stored as a jsonb
    string; since §0.205 the clean-up counts it right (nothing), but never
    cleans it — its team, pins and (since §0.212) manager id stand as
    filed. Recommended: read a text
    profile that parses to an object back into that object as the restore
    stamps the row.
  - A code the database gives every time, outside classes 22 and 23 —
    54000 (an index row too large: a hand-made file's oversized id) or
    42703 (a column it lacks: the code ahead of the shared schema) — is
    counted not reached and said "Restore the file again", which never
    lands. Whether classes 42 and 54 count as refused is Jeff's call.
  - During an outage the row fallback sends each row of a failed chunk in
    turn, so a large file can outlast the function's time limit; the
    window then hears no answer and says the restore may have written
    records. How long is unverified.
  - A refused row's cause — the driver's words — goes to `console.warn`
    only; whether Netlify's function log shows it is unverified (memory:
    it shows no console output). The answer and the audit row carry the
    table and the count.
  - A row a hand-made file gives the id '' is counted restored but never
    cleaned (keepRestored keeps truthy ids). Older; rare.
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
  Since §0.206 the merged-away contact leaves the Contacts tab. The
  survivor's rail (ContactRail.jsx:268-274) shows an activity whose
  `contactIds` still name it only when the activity also names the
  survivor — as its `contactId`, which the merge moved there where the
  merged-away contact was its first (merge.mjs:661; activities.mjs:78), or
  in its `contactIds` — or is on one of the survivor's open deals. Any
  other such activity was reached per contact only through the
  merged-away contact's own rail, opened from the header search, or
  through Reports' Activity History, whose contact list kept merged-away
  contacts (ReportsTab.jsx:5095 on 7ee14fe) — until §0.209, which closed
  both: the header search lists live records, a name only a merged-away
  contact has drawing one row that opens its survivor
  (AppHeader.jsx:467-473), and Activity History's `visibleContacts` lists
  live contacts only (ReportsTab.jsx:5098-5100). That covered a contact named further down
  the list, and one whose `contactId` a later save wrote back (a Save
  that changed its contacts, or a stale whole-row save). An account's
  Activity tab keeps it (§0.206 kept the rail's whole list for it). Both
  ways were the cleanup batch's to narrow, and it kept a way to such an
  activity — the survivor's own (below). The re-check, 17 Oct; read in
  code.
  One more such read, named to stay by THE GUARD since §0.208 (its build,
  18 Oct; read in code): the Tasks tab's feed shows, for an activity with
  no account of its own and no deal that gives one, its first contact's
  company, by id from `contactIds[0]` (else `contactId`;
  `resolveActivityAccount`, TasksTab.jsx:97-106) — a merged-away
  contact's company where the merge left that contact first.
  Since §0.209 the survivor shows them (Jeff, 18 Oct: "Survivor shows
  them"): its rail's Activity History and Reports' Contact history list an
  activity or task naming a contact merged into it (`standsFor`), an
  account's People list and Activity tab a contact linked by id to an
  account merged into it, and the Documents tab a document linked to
  either. The data move stays batch 3's.
- **A CSV overwrite batch empties the Account of a row that names none — DONE
  (§0.216, NOT committed):** the accounts, contacts and deals bulk PUTs hand
  `partialRows` the stored rows, so a key one row leaves out and another
  sends is written as stored, never empty (guide §18b106 rule 8).
- **A new activity prefilled from a contact or deal on a merged-away account,
  neither it nor its survivor in a rep's list**, is saved linked to the
  merged-away account (the sweep). Batch 3's move of contacts' `accountId`
  on a merge removes the shape.
- **A record matched by name or email can be a merged-away one** (§0.206's
  maps, re-check and docs check, 16-17 Oct; the cleanup batch's design, 18
  Oct, P34; re-read 23 Oct; read in code): the Contacts tab's company card
  and its "Open account" button (`matchedAccount`, ContactsTab.jsx:365-368,
  the first account of the company's name among every account, handed at
  :921; the button :521-530); the meeting prep panel's account
  (`matchedAccount`, MeetingPrepPanel.jsx:48-50, the first account of the
  deal's account name — its contacts are the live ones since §0.209,
  :42-45); the account rail's "Similar account found" when a new account
  is saved (`checkDuplicate`, AccountRail.jsx:316-339, called at :385-388,
  among every account; its Open existing button, :648, opens the first
  match); an inbound email's contact (email-inbound.mjs:332-337 — the
  first contact of the address, no merge test, no order); (the CSV
  imports' conflicts and the contact import's new companies match live
  records only since §0.215 and §0.216 — importLinks.js planAccountImport,
  planContactImport, planDealImport); the lead duplicate
  check (LeadModal.jsx:102-106 — the first contact of the email, over
  every contact, :312). (Dispatch's won-deal jobs read the deal's link
  since §0.214 — `accountForDeal`, DispatchTab.jsx:2092.) Each can take a
  merged-away twin that shares the survivor's, or
  a live twin's, name or email (UKG's two "Evonik - Lafayette" sites, one
  merge-archived — SELECT 9 Oct, not re-checked since). THE GUARD names
  each client read as staying, filed here by this bold line
  (tests/merged-away-lists.test.mjs `BY_NAME`, :572), and T10 names the
  inbound email's as filed here (:1473). Reports' three lookups by name
  were the cleanup batch's, and read the deal's link now: the
  Opportunity history's account since §0.209 (ReportsTab.jsx:5858,
  `accountOfDeal`), the industry chart's (:3949, `accountOfDeal`) and
  the report engine's (`buildContext`, reportQuery.js:294-325) since
  §0.210 — a deal with no link the later live account of its name, or,
  for a name only merged-away accounts have, their one survivor.
  Recommended: each matches live records first.
- **A merged-away account's rail says nothing of the merge, and four
  routes still open one** (the maps, 16 Oct; the cleanup batch's design,
  18 Oct, P28; re-read 23 Oct; read in code, not run): the rail takes its
  account from the app's whole list (AccountRail.jsx:167) and draws it as
  live, with Edit (:607-610) — nothing in the file asks whether the
  account it shows is merged away (no `isMergeArchived`, `mergeArchived`
  or `mergedIntoId`; its `unarchived` and `standsFor` read the lists it
  shows). Since §0.209 the header search opens none itself: a name only a
  merged-away record has is one row naming its survivor, which opens that
  (`mergedInto`, AppHeader.jsx:472, :483), or, when the list holds no one
  survivor, a line that opens nothing (:48-50). Four routes still open
  one: the Contacts tab's company card "Open account" (`matchedAccount`,
  ContactsTab.jsx:365-368, the first account of the company's name among
  every account; the button :521-528); the account rail's "Open
  existing" (`checkDuplicate`, AccountRail.jsx:316-339, among every
  account, called at :385-388; the button opens the first match, :648);
  the contact rail's Company chip, whose fallback opens the merged-away
  account itself when `survivorOf` finds no live survivor in the caller's
  list — a rep's scope, or a chain that loops, runs past five merges or
  names none (`linkedAccount`, railLinks.js:87, `survivorOf(acc,
  accounts) || acc`; pickLink.js:64-75; ContactRail.jsx:398-404); and
  `openAccountRail` (App.jsx:1706; the context's `setViewingAccount`,
  the header search's too — :1806, :1964): it stacks the opened
  account's `parentAccountId` unchecked, so ← Back
  (AccountRail.jsx:455-470) — and ×, Escape or the backdrop
  (`closeRail`, :432-452) — opens a live account's merged-away parent,
  drawn as live where the list holds it, as a restore can land one
  (below). The first two are also matches by name (above). A merged-away
  contact's rail is as silent (ContactRail.jsx:204, the whole list);
  which routes still reach it is not re-read here. After the member
  profile page (the design's D10; Jeff, 18 Oct: "Approve; fix the
  list"). Recommended: as filed — "Merged into X", linking the survivor;
  with it, each route follows a merged-away account to its survivor where
  the caller's list holds it live (`survivorOf`), as the chip does.
- **A restore can land a live account under a merged-away parent**
  (§0.206's review, 16 Oct — read in code, not run against a database;
  the re-check's render of the Accounts tab over such rows listed it
  nowhere; the rail's half: the cleanup batch's design, 18 Oct, P45;
  re-read in code 23 Oct, not run): a file downloaded before a merge
  holds an account P and its sub-account C; P is merged away and C
  deleted, before the merge or after; restoring the file inserts C with
  P as its parent — backup.mjs inserts with `onConflictDoNothing` (:355,
  :362), so P, still stored, is skipped and kept — and the clean-up
  (`clearStrayLinks`, backup.mjs:500; `_links.mjs` RESTORE_LINKS'
  `parentAccountId`, :121) clears a parent only when it names no row of
  this org (:214, no merge test; the clear :226-228); a merged-away
  account is one. A merge moves its own sub-accounts (merge.mjs:236); a
  restore does not. Since §0.206 C, a live account, is listed nowhere on
  the Accounts tab (App's list is the top level, App.jsx:839-841, and its
  parent is hidden, AccountsTab.jsx:600); the header search
  (AppHeader.jsx:467) and links still reach it. Its rail then names P as
  live: the Parent Account row (AccountRail.jsx:773-780) and the edit
  chip (:691-703) draw P's name from `accountsById`, every account
  (:267), with nothing saying it was merged away (`HIDDEN_ACCOUNT` only
  where the list lacks it), and a save that leaves the field untouched
  keeps it (:382, by design — state §0.198's D12, D16, as the rail's
  comment at :357-361 says). Opened from the header search
  (AppHeader.jsx:483; `openAccountRail`, App.jsx:1706, stacks the
  parent), C's rail opens P's own, a merged-away one (the item above),
  on ← Back (`handleBack`, AccountRail.jsx:455-461) and on its close
  (`closeRail`, :432-438: the ×, :576; Escape or a click outside when
  not editing, :485, :532). THE GUARD names the rail's `accountsById` to
  stay because "no row names a merged-away parent"
  (tests/merged-away-lists.test.mjs:595) — untrue after such a restore.
  None at the census (16 Oct 21:13 UTC; not run since). The file must be
  one kept from before the merge: a download is made fresh from current
  data (backup.mjs:166-178, `collectOrgData`). The same restore can land
  a contact on a merged-away account, as an account merge can (batch 3's
  item below). Recommended (a functions batch): the restore's clean-up
  treats a parent naming a merged-away account as stray — re-pointed to
  its survivor where the survivor is live in the org and fits the parent
  rule, else cleared and the account made an account, as for a parent
  that names nothing; with it, the rail's Parent Account row and chip
  say when a parent held already was merged away, and the guard's reason
  at :591 names the restore.
- **What §0.207's merge Undo leaves** (its design, reviews and re-checks,
  17–18 Oct; each read in code, or run where said):
  - **Two concurrent merges of one record merged away both commit** (the
    server map; reasoned from the code, not run): each passes the merge's
    check that the record is live, the second's archive write overwrites
    `mergedIntoId`, and two logs read 'merged' for one record. Since
    §0.207 the first's Undo is refused ("… is no longer merged into …"),
    and the second's puts back only the rows still holding its own
    survivor's id. Recommended: the merge's archive write conditioned on
    the record still live, aborting its batch as the Undo's un-archive
    does.
  - **The merge's own read-then-batch gap** (the server map; reasoned):
    the merge logs the ids it read and its batch moves rows by predicate,
    so a row linked to the record merged away between the two is moved
    but not logged — its Undo leaves it on the survivor; a row unlinked
    between them is logged but not moved — since §0.207 its Undo leaves
    that one too (it does not hold the survivor's id), counted kept. A
    contact merge differs in part: it moves its tasks' or activities'
    contact only when its read found one there (then by predicate, as
    above), and writes a deal's contacts and a colleague's managers or
    reports by id, each as computed from its read. So a task or activity
    linked between the two when the read found none, and a deal or
    colleague linked between them, is not moved (it keeps the record
    merged away); a list edited between them is overwritten by the
    merge, and its Undo puts back the list as read, not the edit (the
    server map; reasoned from merge.mjs, not run).
  - **A delete racing an Undo** (run by the review's server probe, the
    Undo's batch held mid-flight): a delete of the record merged away that
    reaches it after the Undo's un-archive waits for the batch, then
    deletes the record live, with the links the Undo put back — the
    DELETE's own read-then-write gap (its open-deal check and the tree its
    re-fits use are read before its batch, and its sub-accounts by the
    batch's first statement, before its delete waits on the Undo's lock;
    read in code, accounts.mjs). One that lands first leaves the Undo
    writing nothing (409).
  - **The races the Undo does not ask again** (stated in merge.mjs's
    comments, the re-check's notes or 05's fixer's; not proved): an
    account above the record merged away moved while the batch runs; an
    account added under the survivor after `nothingUnder`'s statement
    read, or a deal linked to it after `noDealOn`'s; a PUT moving the
    record merged away under the survivor that waits on the un-archive's
    lock (the accounts PUT's own check-then-write, older). And one it
    asks, counted short: a deal linked to the survivor between the Undo's
    read of its deals (`dealsOn`) and its batch keeps the survivor where
    it stands (`noDealOn`), every field kept and counted, the deal itself
    not (05's cross-check; I21(f) runs it).
  - **Past merges lists the latest 50 merges of a kind**, with no paging;
    "Showing the latest N merges." says so, and an older merge's Undo is
    reached by its log id alone (a default of Jeff's to veto, §2.4). Its
    Undo's busy mark clears before its list is read again, so the Undo is
    offered for a moment; a press then answers a true 409 (the review's
    proof lens).
  - **A Manager may merge and undo by the API, with no screen** (the
    client map, F5): merge.mjs's role gate admits Admins and Managers; the
    Find & merge pages are in Settings, an Admin's.
  - **tests/hook-deps.test.mjs does not see `deps || {}`** (the client
    map, F7): its guard matches `= deps`, and useMerge.js destructures
    `deps || {}`; harmless while App hands the hook a fresh object each
    render.
  - **The app's other loads keep an answer a later load overtook**
    (§0.207's design, as amended): leads, quotes, documents, coaching notes
    and Dispatch's; a merge moves none of their links but Dispatch's
    customers' and jobs' account (§4.2). SPIFF claims, whose account name a
    merge renames, are read once per org by an App effect whose `cancelled`
    flag drops an earlier run's answer, so none is overtaken today; reading
    them again after a merge and its Undo (§4.2's recommendation) would
    need the guard below. Recommended: the generation counter the five list
    loads now have (guide §18b100 rule 6).
  - **An account merge's audit count counts a lifted deal two or three
    times** (the server map): the summary adds every rewrite's ids, and a
    deal moved by id or by name and then lifted (D22) is in both, so "N
    references repointed" reads more than were moved.
- **Deals by name alone that a merge's Undo leaves on a site by their
  name — batch 3's to close** (Jeff, 18 Oct: "Ship as is, file the edge"
  — the Undo leaves such old deals where they are, the rare name-only
  case recorded for the merge batch, batch 3, to close; §0.207's second
  re-check and fifth cross-check, 18 Oct, each run on the test database
  where said, else reasoned from the code). The deal rule (§0.207; §4.2,
  D22's edges) keeps a deal off a site by its id, by its lift and — one
  with no account id that the merge renamed from the name of the account
  merged away — by its name (`toArchivedName`). But it reads the
  survivor's deals by id alone (`dealsOn`, `noDealOn`: the first shape
  below), and it never asks where the merge left a deal's name as it
  was, a restore that moves no deal, while the survivor's own name, put
  back, reaches only its deals by id (the second). So a deal with no
  account id — saved before §0.198, or taken since by the deals POST
  with none, as SK4's was — can still end on a site by its name, not
  counted:
  - **A lifted survivor goes back a site with such a deal naming it**
    (run: the second re-check's completeness skeptic, SK4, through the
    real deals POST, on 05's code — 200 with nothing kept, the Dock back
    under the Plant a site, the deal naming it and no other account).
  - **A merge that gave the survivor the name of the account merged
    away, a site, leaves such a deal naming only that site once the
    survivor's own name goes back** (run: the fifth cross-check's probe
    P1, on 06's code — keptLinks 1: its by-id sibling, the deal the
    account merged away held by id, which the merge moved to the
    survivor, held there by the deal rule and counted; the deal by name
    alone not counted, naming only the site, live; the same before 06).
    Where the merge kept the survivor's own name (its probe P2), such a
    deal stays on the survivor, counted (keptLinks 2): which name the
    merge window picked decides. A fix would need a write the merge
    never made.
  - **Reasoned from the code, not run** (06's fixer): a name for the
    survivor that is neither record's, sent through the API (no screen
    sends one), leaves a kept deal by name alone naming no account once
    the survivor's own name goes back; and where another account shares
    the name of the account merged away, such deals stay on the
    survivor, counted, though a move would not read them as on the site.
  His answer keeps, as built, the deal rule's reach over a site's own
  deals from before the merge (UKG's six are the kind, §2.4): the Undo
  leaves them where they are, off the site (state §0.207). Options
  listed back with the shapes: for the first, read the survivor's deals
  by name too, as a move reads one (accounts.mjs `dealLifts`, D22); the
  second needs a write the merge never made.
- **Batch 3 of §1 item 1: CSV import and merge link by name** (read 11 Oct
  over 7e68f26; re-read 29 Oct over `aeafb2d` — docs/design/links-batch-3;
  its first bullet and the second bullet's account half — the account
  import's parent and conflicts, and the accounts bulk paths' parent rule —
  are §0.215's (3a, committed `321643e`); the second bullet's deal conflict and
  the third bullet — the contact and deal imports and the deals bulk paths
  — are §0.216's (3b, NOT committed); the rest are 3c-3d's —
  docs/design/links-batch-3,
  which holds what still holds, what changed and the design Jeff answered):
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
    shows the name and phone only. A deal's conflict was the first deal with
    the same name and account name — since §0.216 (3b, NOT committed) one
    deal of the name on the deal's account, two refusing the row
    (planDealImport).
  - **Done by §0.216 (3b, NOT committed):** the contact import made an
    account for each company not in the caller's list (exact spelling within
    the file), posted contacts with no `accountId`, and its Overwrite changed
    `company` while keeping the stored `accountId`; deals imported with the
    account name only; the deals bulk POST and PUT took a site, or an account
    merged away, as a deal's account. Now a Company is one account linked by
    id, or a new company made once per `searchKey`, and an Overwrite
    re-links (Q4); a deal's Account is one account the deal window takes,
    sent by id; the deals bulk paths decide each row by the single save's
    rule (`bulkDealLinks` → `dealAccount.js dealLinkDecided`): a site
    refused, a merged-away id stored on its survivor under its name. An
    Overwrite that renames a deal's account naming no id still unlinks it
    (`bulkAccountLinks`). The contacts bulk paths still take any account id
    of the org, a merged-away one followed (`_links.mjs`); no screen sends
    one (guide §18b106).
  - An account merge rewrites contacts' account names by name alone, and
    since §0.198 moves deals' `accountId` to the survivor (D14) — up to the
    account above it, Site Name the site, when the survivor is a site (D22)
    — and renames only its own deals and those with no id: a deal with no
    id is renamed by its name alone, so a same-named twin's id-less deals
    are renamed too (a twin's deals with an id keep their name). It never
    moves contacts' `accountId` (merge.mjs). Its comment says contacts have
    no account link; `contacts.account_id` exists and AccountRail lists by
    it. Since §0.206 the Accounts tab hides a merged-away account, so a
    contact still linked to it by `accountId` is in the People list of no
    account the tab lists: it is reached from the Contacts tab, and its
    chip opens the survivor, whose People list matches by id and so leaves
    it out (the survivor's Accounts-tab row counts it by company name,
    which the merge renamed). None at the census of 16 Oct 21:13 UTC, which
    found no live contact or deal naming a merged-away account, in any
    org; any account merge since can make one.
  - An account merge re-parents the merged-away account's sub-accounts onto
    the survivor, and lifts the survivor to the merged-away account's parent
    when it stood under it, with no parent rule and no tier re-fit — but a
    survivor lifted to the top level is made an account, the only tier that
    fits there, and the undo puts its tier back (§0.198) — since §0.207
    only where the house parent rule lets it and, where the tier it gets
    back is a site's, no deal stands on it by id but those the deal id
    restore moves back to the account merged away (Jeff, 18 Oct: "Leave
    such deals and count them": such a survivor stays an account, its
    deals where they are, each counted — a site's own deals from before
    the merge too, as built (Jeff, 18 Oct: "Ship as is, file the edge");
    any other tier — a business unit's — goes back whatever deals stand on
    it); its `accountTier` field (the modal's field map) is written
    unchecked, and the log keeps no other tiers but each moved
    sub-account's (since §0.207, for the Undo's rule). A merge into a
    deeper descendant of the record merged away —
    its grandchild or below — closes a loop: the record's children go
    under the survivor (merge.mjs:236), and the survivor keeps its own
    parent, lifted only from directly under the record merged away
    (:249); the duplicate scan can offer such a pair, an identical name
    read as a duplicate before any hierarchy test (duplicates.mjs
    `classifyPair`; the merge Undo's server map, 17 Oct; read in code, not
    run). Merging an account that has sites into a site puts sites
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
- **Past merges offers an Undo again until its list is read again**
  (§0.210's browser check, 23 Oct; read in code): after an Undo's
  answer, the row says so ("Merge undone — “Tess Undoer” is its own
  record again.") beside an enabled Undo until the list's reload
  answers — still there four seconds after the Confirm on local `netlify
  dev` (the contact page; on the account page the reload had answered by
  then). `onUndo`
  releases the busy mark (`setBusyId(null)`, PastMerges.jsx:41) before
  `load()` (:43) answers, and the row's Undo reads the row's old status
  (`canUndo`, :69; the button :77-82). A second click asks the confirm
  again and sends a second Undo, which the server refuses, writing
  nothing (409, "This merge has already been undone." — guide §18b100
  rule 3; reasoned, not clicked). Recommended: the busy mark released
  after the list read again answers (`await load()` first).

### 4.8 Other UI

- **Reports' Activity History declares eleven sub-components inside
  itself** (the cleanup batch's design, 18 Oct, §1 row P40's eighth item;
  re-read 23 Oct; read in code, not run): `ActivityHistoryTab`
  (ReportsTab.jsx:5023-6537) holds `EventRow` :5371, `PeriodPill` :5419,
  `KpiCard` :5426, `FilterBar` :5448, `EventFeed` :5460, `AccountGlance`
  :5489, `ContactGlance` :5519, `ActivityMixPanel` :5559, `InsightPanel`
  :5574, `SubTabBtn` :5586 and `ActionButtons` :5688 in its body and draws
  each as an element. Each of its renders (a keystroke in the account or
  contact search, `accSearch`/`conSearch` :5038-5039, or a pill, filter,
  sub-tab or Save click) remounts the ones on screen, the event feed and
  every `EventRow` with them (CLAUDE.md: module scope only; guide §16).
  `check:inline` counts all eleven churn-only, so the gate passes: its
  `riskOf` (scripts/check-inline-components.mjs:72-83) looks only for an
  `input`, `textarea` or `select` or a `use*` call, and none has one. A
  pill, filter, sub-tab or Save `<button>` is remounted by the state its
  own click sets, which would drop keyboard focus (not run). A twelfth,
  `Toolbar` :5435, is drawn nowhere (only `{/* Toolbar */}` comments,
  :5721, :5783, :5970). The design's "eight" (:5357-5688 on 7ee14fe)
  undercounted: twelve were there too. Recommended: hoist the eleven to
  module scope beside `EntitySelector` (:4995), each closure read made a
  prop (`period`/`setPeriod`, `showFilter`/`setShowFilter`,
  `historySubTab`/`setHistorySubTab`, `accountEvents`/`contactEvents`,
  `saveReportState`, `handleSaveAsReport`, `handleExportPDF`) and the
  body's own helpers (`typeConfig` :5362, `typeLabels` :5369, `fmtMoney`
  :5298, `filterEvents` :5317, `groupByDate` :5338 with the `parseLocal`
  :5330 it calls) moved out or passed; then `npm run check:tdz` (guide
  §18b0, "Hoisting a component strands its closure reads"). Delete
  `Toolbar`. Opportunistic; eleven of the churn-only count below.
- **The document link picker says "Opportunitys" and "Activitys"**
  (§0.209's browser check, 23 Oct; read in code): its type pills and its
  group headings append "s" to each entity's label
  (DocumentLinkPicker.jsx, `${ENTITY_META[t].label}s` and
  `{ENTITY_META[type].label}s`). Recommended: a plural per type in
  ENTITY_META (documents/atoms.jsx).
- **The Accounts tab's search finds top-level accounts only** (Jeff's
  look at UKG after the forty-second ship, 17 Oct; read in code; older
  than §0.206): it filters the tab's own list, the app's top-level
  accounts (AccountsTab.jsx:657-668 — name, vertical, owner, rep), so a
  sub-account is never found by its name there — "Resinall", a business
  unit under "Ergon", lists nothing, though the header search finds it.
  Jeff, 17 Oct: "File it as its own item". Recommended: a search that also
  matches sub-accounts and shows each under its parent (merged-away ones
  left out, §0.206).
- **A refused forecast call is said only on the Team and Admin sub-tabs**
  (§0.205's review, 16 Oct; read in code; older): the Forecast sub-tab
  draws no save state, so a call refused there — a rep removed or re-roled
  in another session, 404 or 403 — flips back to the old figure with no
  word, and its "Not saved — {rep}: …" line shows later on another
  sub-tab; a later success never clears it. Recommended: draw the save
  state above the sub-tabs, and clear an error on the next success.
- **A Pin answered with a server error reads as not saved** (§0.205's
  second fix round, 16 Oct; read in code; older): togglePin shows the
  server's words, or "Pin not saved — HTTP 500", and keeps the window's
  pins, though a 5xx may come after the write landed (§0.203's rule).
  Recommended: the no-answer words ("reload the page to see whether the
  report was pinned").
- **The Sales Manager tab has one status line for every save** (§0.204's
  review, 16 Oct; read in code; older for Approve and Reject — one
  handler, `updateClaimStatus` — new for the Delete): a claim's Approve,
  Reject or Delete answering while a SPIFF or commission save is out
  replaces its "Saving…" — which unlocks that card's Save and Cancel
  mid-save — and a claim action's success replaces any save's refusal — a
  SPIFF, commission or quota save's — with "✓ Changes saved" while that
  draft is still unsaved (its "Unsaved changes" label the only sign);
  during a quota save it replaces the line's "Saving…" too, though
  `quotaSending` keeps the quota card locked. Recommended: the SPIFF and
  commission saves their own in-flight flag, as the quota save has
  (`quotaSending`), and a claim's outcome never replacing any save's.
- **A refused quote save's words follow the user to another org**
  (§0.204's review, 16 Oct; read in code; older): `quoteModalError` is
  App-level (useQuotes.js), cleared only when a quote save starts, with no
  org-switch reset and no dismiss — org B's Quotes banner shows org A's
  last refusal until a quote save starts in B. Since §0.204 a refused New
  version is shown only there. Recommended: reset it on an org switch.
  (`productModalError` is App-level too, but no screen reads it.)
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
- **Twins are still easy to make** (the map, 11 Oct; not re-read):
  - The account picker's Create checks only the caller's list, so a rep
    can create a second account under the name of one another rep owns.
  - Renaming an account to another account's name runs no duplicate
    check (AccountRail checks only a new account).
  - The account CSV import, likewise: a Sales Rep's import plans over her
    own list, so a name another rep's account has is a new account (Jeff,
    29 Oct, batch 3's Q2: "Leave it, decide later" — to decide with these).
    So do the contact and deal imports since §0.216: a Company only another
    rep's account has is a new company, an Account only another rep's
    account has refuses a new deal — her own contacts and deals standing on
    such an account are matched and keep their link when the row's Company
    or Account reads as the name they store (guide §18b106 rule 6).
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
- **68 churn-only inline components** (`npm run check:inline -- --churn`;
  28 Oct; 70 on 7 Oct, §9 said 76). SalesManagerTab's SubTabs, TeamTab and
  AuditTab are among them, per §0.84, and AppHeader's `ST` (AppHeader.jsx:705;
  its search results' `GH` and `RR` went with §0.209); and the New User window's
  `Toggle` (UserModal.jsx:207), Reports' `PanelB` (ReportsTab.jsx:1293) and
  its six `PanelD` (:2773, :2959, :3213, :3411, :3596, :3861 — the same
  panel declared six times; §0.213's read). Opportunistic.
- **A quote template's starting blocks are cut off at 260 px and never
  scroll** (§0.213's read, 28 Oct; read in code, not seen in the pane): a
  blank template's "Starting blocks" list (QuoteTemplatesDetail.jsx:355,
  `BlankRequiredBlocks`) sets `maxHeight:260, overflowY:'auto'` and then
  `overflow:'hidden'` in one style; React sets the keys in order, so the
  list clips and never scrolls, and its eight rows — the five required
  (`REQUIRED_BLOCKS` :333) and three optional (:340) — come to about
  416 px by arithmetic. Recommended (Jeff's call — the window grows): drop
  the max height and the scroll, keeping the radius and the clip.
- **The Audit log's filters draw a panel inside a panel** (§0.213's read;
  read in code, not seen in the pane): `PolicySelect`
  (security/shared.jsx:142-144) wraps its children in a `DropdownPanel`
  (:76), and the three filters hand it dropdowns that each draw their own
  (audit/AuditDetail.jsx:35, :58, :77, through :519-521) — a double border
  and shadow, and by CSS rules an inner panel 10 px wider than the outer's
  content box, so a horizontal scrollbar on every filter. And
  `cloneElement` hands each child an `onClick` (:143) the dropdowns do not
  take, so picking a filter may not close the menu. Recommended:
  `PolicySelect` draws its children in its fixed box alone; then try the
  close in the pane.
- **The lead import window's resize handles lie outside it** (§0.213's
  read; read in code, not tried): LeadImportModal.jsx:385 draws
  `<ResizeHandles>` after the window's box has closed (:384), its sibling
  in the fragment, so they are placed against the page, not the window,
  under the click catcher (zIndex 9999, the drag hook's `zIndex - 1`; the
  handles' own is 10) — its corner resize is likely
  dead. Recommended: move them into the window, as the New User window has
  them (guide §18b103 rule 6), and try it in the pane.
- **The New User window's "Failed to Save User" dialog opens under the
  window** (§0.213's second review; read in code, and in headless Chromium
  with the real window bundled from the source — not seen in the pane; as
  before §0.213): the dialog (UserModal.jsx:70) is fixed at zIndex 9999,
  and the window is drawn at the drag hook's 10000 (useDraggable.js:33,
  :216-217), its click catcher at 9999 after the dialog in the page — so
  the window covers the dialog (the probe's `elementFromPoint` at the
  dialog's centre returned a label of the window), and a save's refusal is
  not seen. Recommended: draw the dialog above the window (a zIndex over
  the hook's, or through the hook's own top), then fail a save in the pane.
- **The CSV import window's lower-right handle lies over its body's
  scrollbar** (§0.213's read; seen in §0.213's browser check, 28 Oct; as
  before §0.213): the body (CsvImportModal.jsx:590, `flex: 1, overflowY:
  'auto'`) reaches the window's bottom, and the handles (:1142) are the
  window's children, so the bottom-right one (20 px, zIndex 10) covers the
  foot of the body's scrollbar, where its down arrow is — in the pane, the
  window shrunk to 380 px so its body scrolled, `elementFromPoint` at the
  bar's foot was the handle. Recommended: the handles
  in the scroller, as the New User window's (guide §18b103 rule 6), or a
  footer below the body.
- **A draggable window refuses a sideways swipe** (§0.213's read; read in
  code, not tried on a device): useDraggable.js's touch guard lets a touch
  scroll only a scroller with vertical room — it reads `overflowY` and the
  vertical movement (:61-71) — else it refuses the touch
  (`preventDefault`, :74), so a sideways swipe on a table that scrolls
  sideways in a draggable window (the lead import's preview, the CSV
  import's preview and invite list) is refused. §0.213 let a touch scroll
  the New User window, whose container had been its scroller (guide
  §18b103 rule 6). Recommended: the guard reads the swipe's axis and the
  scroller's room on it; try both on a phone.
- **The Pipeline list view's sticky header never sticks** (§0.213's read;
  read in code): ListView.jsx's header (:73, `position: 'sticky'`) binds to
  the table card, which scrolls (:394) but never down — its parent is auto
  height (PipelineTab.jsx:887, index.css:1014) — so the header scrolls away
  with the page; the Quarters rail's scroll (:216) never engages either.
  Recommended (Jeff's call): bound the list view's height so the table
  scrolls under its header, or make the header stick to the page.
- **The profile panel runs off a short window** (§0.213's read; seen in
  §0.213's browser check, 28 Oct — Jeff's panel in Accelerep QA, a window
  800 × 600): on a desktop the panel (AppHeader.jsx:563,
  `.spt-profile-panel`) is placed at top 56 with no bottom and no max
  height, and its tab body scrolls within 560 px (:605), so the panel was
  775 px tall, its foot at 831 px — 231 px below the window's — and
  nothing brings it up. Recommended: a max height on the panel
  (the window less its top), the panel clipping and its tab body taking
  the flex share (guide §18b103 rules 3 and 7 — the guard names the panel
  for its auto height, and its harness entry pins that).
- **The notices stack shows a light scrollbar beside dark cards**
  (§0.213's read; read in code): the press notices' stack
  (ModalLayer.jsx:369, `maxHeight: '70vh', overflowY: 'auto'`, no radius)
  scrolls once its notices pass 70% of the window, with the native light
  scrollbar beside the dark (`T.ink`) cards. Cosmetic; no corner is lost.
  Recommended: nothing until it is seen.
- **The task rail's status pill has no background** (§0.213's read; read
  in code, not seen in the pane): `STATUS_COLORS` (TaskRail.jsx:107-111)
  holds `{ bg, color }`, spread into the pill's style (:516) — `bg` is no
  CSS property, so the pill draws no background, and Open's
  `color: '#2a2622'` is `T.ink`, the header's own background (:509), so
  "Open" would read ink on ink. Recommended: `background` for `bg`, and
  colours that read on the dark header; look in the pane first.
- **The app's prompt dialog has no caller** (§0.213's browser check, 28
  Oct; read in code): `showPrompt` (App.jsx:410) is handed to the context
  (:1769) and opens `promptModal` (ModalLayer.jsx, a `.modal`), but no
  screen calls it — so §0.213's prompt-dialog change is held by
  tests/rounded-scrollers.test.mjs alone, never seen. Recommended (Jeff's
  call): leave it for the next screen that asks for a name, or remove it
  with its state (useModalState.js:78-79) and its Escape case.
- **Three empty folders under src, left by a brace expansion** (§0.213's
  read; the third found by its docs check): `src/{components` (holding
  `{modals,ui,tabs},hooks,utils}`), `src/{lib,components` (holding
  `{modals,settings,tabs,shared}}`) and `src/components/{modals,settings,tabs,shared}`,
  dated 3 Mar 2026, with no files in any; git tracks none. Recommended:
  delete all three (Jeff's call).

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
- **The public API gives an outside app no sign that a record was
  merged** (§0.210 — the design's P17 trade; Jeff, 18 Oct: "Leave them
  out"): since §0.210 its accounts and contacts leave a merged-away row
  out, so an app that copied "Resinall, Inc." sees it go, with no field
  and no webhook saying it was merged into "Resinall". Settings → Data's
  export runs keep the marks (export-runs.mjs:97-100, every column).
  Proposed, additive: a switch to ask for them (`include_merged=true`,
  each row with its `merged_into_id`), or a merge webhook — when an app
  syncs.

---

## 6. Tooling, tests and housekeeping

- **The harness runs each mutant with no time limit** (§0.215's fourth
  review, run in a scratch copy): scripts/mutate-import.mjs and
  scripts/mutate-scope.mjs run `node --test` through `execSync` with no
  `timeout`, so a mutant that makes the code under test loop forever hangs
  the run — no summary, and its mutant left on disk (stopping a run leaves
  it). §0.215 had one; it was re-pointed. Recommended: a per-mutant timeout
  (minutes), reported as its own outcome, a hang counted as caught but
  said, and the mutant restored.

- **Dead code the cleanup batch's maps found** (the cleanup batch's
  design, 18 Oct, P40g; re-read 23 Oct, read in code): App's
  `getAccountRollup` builds `allContacts` (App.jsx:1104 — every contact
  of the account's names, merged-away included) and returns it (:1106),
  and nothing reads it — its one call, the Contacts tab's company pane
  (ContactsTab.jsx:372, handed the function at :926), reads only
  `rollup.pipeline` (:512); AccountsTab.jsx takes `getAccountRollup` from
  `useApp()` (:571) and never calls it; and useAccounts.js's own
  `getAccountRollup` (:40-42, `return acc;`, returned at :273) is not
  taken by App.jsx (:343-350). Reports' Opportunity history also takes a
  contact whose `c.opportunityId === selectedOppId` (ReportsTab.jsx:5946),
  a field no contact has (no column, db/schema.ts:115-170; contacts.mjs's
  sanitize, :40-72, writes none; no line in src sets one on a contact),
  so only the ids in `oppContactIds` match (:5944, :5947 — the deal's
  `contactIds`, or the add panel's own after an add). ReportsTab takes
  `visibleAccounts` and `visibleContacts` from `useApp()` (:56-57) and
  reads neither in its body (:36-2125 — ActivityHistoryTab's are its own,
  :5080, :5098); PipelineTab takes `accounts`, `contacts` and
  `activities` (:329) and reads none of them (:326-991). App's
  `handleEditContact` (:990) and `handleEditAccount` (:1019) are in
  "Unused code left in the files §0.198 edited" (this section). Removing
  `allContacts` empties THE GUARD's CARRIED: its two entries
  (tests/merged-away-lists.test.mjs:1055, APP_READS; :1095, CARRIED,
  whose text says it is filed) go together (NOTES-STEP-A.md:70-74), and
  with them CARRIED's check (:1203-1205), its self-test (:1423-1430,
  which expects four reads of `allContacts`) and the harness entry that
  names CARRIED as its catcher (scripts/mutate-import.mjs:13936-13939, a
  read of `rollup.allContacts.length` at ContactsTab.jsx:508) — or
  CARRIED keeps a key to guard. The `c.opportunityId` test sits under a
  line THE GUARD names (:588, `const oppContacts =
  (contacts||[]).filter(c =>`), so that line keeps its text or its entry
  changes with it. Recommended: remove them in the class-wide
  unused-binding pass (the §0.198 item), with the AccountsTab and
  useAccounts leftovers.
- **One console 422 in §0.209's browser check was not traced** (23 Oct;
  the pane's console, read after the check): "Failed to load resource:
  the server responded with a status of 422 ()". Its request had left
  the pane's network buffer before it was read, so its URL is unknown.
  Its blank status text is that of the cross-origin HTTP/2 answers
  (Clerk's), not of the local functions, whose errors carry theirs
  ("Not Found", "Internal Server Error") — consistent with a call made
  during one of the check's sign-ins, but unverified. Recommended: the
  next pane check reads the network log as it goes and names any 4xx's
  request.
- **Three things §0.207 left in its tests and comments** (its docs checks
  and its cross-checks, 17–18 Oct; read in code): I17(b)'s count message
  ("…the survivor's own contact counted kept",
  merge-undo.itest.mjs:730) is what fails first under the harness entry
  "§0.207 undo: a contact linked by id to another account than the
  survivor …", where the contacts counted kept are two — the other
  twin's and the record merged away's (keptLinks 2; the docs' fact-check
  ran I17 under that mutant on the test database, on 04's code);
  db/schema.ts:1286's comment on `merge_log.rewrites` lists `{ table,
  column, kind, ids:[], oldValue, newValue }` alone — not §0.207's
  `tiers` and `onSurvivor`, nor the `rows` the lift and the list
  rewrites carried before it; and five of the batch's own comments and
  one test title cite OPEN_ITEMS §4.7 for what it no longer holds —
  useMerge.js:43-48, which says every list a merge or its Undo moves is
  read again, then that SPIFF claims and Dispatch's lists are not, citing
  §4.7 for those (the item is §4.2's); mergeUndo.js:112-113, quoting
  "keep the survivor's current parent when the check fails", the
  recommendation of the §4.7 item §0.207 closed; and mergeUndo.js:21-22,
  merge.mjs:310, merge-undo.itest.mjs's header (:7-8) and I4's title, on
  what the reverse did before, the items §0.207 struck. Recommended: each
  with its file's next edit.
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
  its pre-run tool mutate the first match; 2406 entries then (§0.199), 3,333 on 27 Oct, several by
  design on a text that repeats. Recommended: print AMBIGUOUS for an anchor
  that matches more than once and make each such entry name its line
  uniquely (a fail once none remain).
  On 19 Oct (§0.209's anchor check, every entry against the tree) seven
  match twice, each in a file §0.209 did not touch, each mutating its
  first match: "deal window: an unnamed row on the deal is blank"
  (OpportunityModal.jsx), "§0.199 contacts: a bulk create's refusal is
  not answered" (contacts.mjs), "§0.199 accounts: a bulk create's refusal
  is not answered" (accounts.mjs), "§0.199 dispatch customers: a create
  stores a merged-away account as sent" (dispatch-customers.mjs), "§0.199
  activity save: an update's refusal answers nothing" (useActivities.js),
  "§0.200 popups: the reminder's backdrop leaves those waiting unseen"
  (ModalLayer.jsx) and "§0.201 login: the create's refused login is
  answered nowhere" (dispatch-technicians.mjs). One more, "pick link
  (F9)", matched twice once §0.209's helper repeated its text; the helper
  was reworded. On 23 Oct (§0.210's anchor check) the same seven, and no
  other: the one §0.210 would have made — §0.206's `getSubAccounts`
  entry, whose anchor (` && !isMergeArchived(a));`) the delete warning's
  new line also ends with — was lengthened at its front, to
  `=== accountId && !isMergeArchived(a));`, which only its own line holds.
  On 27 Oct (§0.212, every entry against the tree) the same seven, and no
  other. Since §0.212 the scoped run refuses a batch's own anchor that
  matches more than once (scripts/mutate-scope.mjs: NOT UNIQUE, exit 1,
  before the baseline); an older entry is still checked only for a missing
  anchor, and the full run (scripts/mutate-import.mjs) still mutates its
  first match unwarned.
  On 28 Oct (§0.214) an eighth, and it showed the cost: §0.199's "each job
  send goes out whatever the org" (DispatchTab.jsx) quoted a line New
  Job's new customer send also holds, deeper indented and first; its
  mutant removed that guard, which nothing pinned, and SURVIVED the
  scoped run (2,104/2,106). Re-pointed to an anchor only its line holds;
  after it, the same seven, and no other.
- **The scoped harness reads a test's files from its text, so a test that
  builds its paths at run time is read short** (§0.212's docs check, 27 Oct:
  every SUITES test run alone with a tracer preloaded — every file its
  processes read, list or load — against scripts/_scope.mjs `filesOf`; guide
  §18b23 part 4). 48 of the 152 read files the static read misses, 7,308
  reads in all, 36 of them 50 or more (the files missed in brackets):
  function-imports (101), date-local (212), api-surface (99),
  house-dialogs (205), settings-cards (16), connected-apps (3),
  activity-view (1), automation-events (2), single-token-file (212),
  audit-coverage (28), itest-targets-test-db (51), roles (206),
  dispatch-gate (8), job-roster (3), org-scoping (93), org-roles (308),
  settings-leave-guard (61), save-buttons (18), late-answers (206),
  src-scope (214), contact-deals (210), hook-deps (15), activity-save (15),
  deal-modal-saves (207), layers (209), one-delete-path (202),
  select-where-tickable (209), border-sides (209), escape-layers (208),
  document-link-names (211), document-refusals (207), document-access (2),
  deal-fields (306), ai-score (99), open-states (205), security-closes (213),
  deal-engagement (301), owner-kept (93), search-match (201), app-name (309),
  member-names (96), pick-link (206), rail-links (1), task-alerts (209),
  quota-plan (293), sales-links (364), merged-away-lists (266),
  merge-undo (195).
  A batch that edits one of them runs a scope short of Jeff's rule ("every
  entry caught by a test file it edited"); the full run before the ship
  still grades what it misses. Step B's five edited suites read none the
  static read misses; the suite its resize close added,
  tests/resize-targets.test.mjs, walks src (211 files the static read
  misses — a 49th), and §0.213's, tests/rounded-scrollers.test.mjs, walks
  src and index.css (about 203 files it misses — a 50th); what each reaches
  keeps its last grade (a suite added can only turn a run red; guide §18b23
  part 4). Recommended: mutate-scope.mjs runs each edited test
  once with the tracer and adds what it traced to the scope (Jeff's call).
- **The self-pin scan's floor stays seventeen with twenty pins** (§0.212
  added tests/mutate-scope.test.mjs's and tests/resize-targets.test.mjs's,
  §0.213 tests/rounded-scrollers.test.mjs's; tests/sales-links.test.mjs:783
  `pins.length >= 17`). Every earlier pin raised it; these three did not, so
  three pins lost would go unseen. Raising it edits sales-links.test.mjs, which the
  static read misses 364 files of (above) — Jeff's call.
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
- **The second-role-list scan misses a frozen list** (the profile batch's
  P38; read in code): tests/roles.test.mjs:149's role-list literal needs `[`
  straight after `=` or `new Set(`, so `= Object.freeze([` passes it — and
  src/utils/quoteRules.js:96 already holds `APPROVER_ROLES =
  Object.freeze(['Manager', 'Admin'])` outside roles.js. A class item:
  widen the scan, and move APPROVER_ROLES to roles.js or name it there.
  (The profile page's Manager box reads `canSeeAll`, no list — §0.211.)
