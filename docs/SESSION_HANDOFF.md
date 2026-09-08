# SESSION_HANDOFF.md

**Session of 7–8 September 2026, eighth session (Jeff: "Hello Claude, lets pick
up our work on Accelerep" — an observation session first: §0.91 proven on
deployed dev BOTH ways by Karen's real emails, the org address then her
personal one, both rows read back owned by her; §0.90's Request click and
§0.89's Slack proven end to end against a Slack workspace Jeff created for it,
the config read back; the "Karen path" struck — Settings is Admin-only by
design; then **item 25 "and the endpoint gate"** — `send-slack` Admin-only
and pinned to `hooks.slack.com/services`, `settings` refusing any other
webhook, `integration-requests` Admin-only — state §0.92, guide §18b30,
deploy-verified from Netlify's record, NOT observed (the 403 needs a session);
then Jeff, at Karen's two emails on the contact: "these are fairly useless
because I can't see any content" → **item 26, option 2** — every activity row
opens a read-only viewer, email rows show the subject bold over a two-line
preview — state §0.93, deploy-verified, **OBSERVED by Jeff ("works")**, then
his fourteen-step report: three findings, two fixed the same hour (Escape
closed the rail too; the stored email body had lost its newlines and never
named an attachment — `f17e835`), one opened as item 28 (a contact owned by
its creator displays as unassigned); **then a day of "same result"** — seven
real emails still stored flat with the fix live — until a diagnostic written
onto the row itself came back WITHOUT it: **the Resend webhook had delivered
to PROD all along**, whose pre-fix function wrote every row into the shared
database (guide §18b31); the webhook repointed at dev (Jeff), and the fix
**PROVEN 8 Sep 19:26 UTC** — "#14 Test Email" stored with its ten line breaks
and "Attachments: Lumen.pdf", the diagnostic removed in `173948a`;
**NOTHING SHIPPED this session** — `master` stays at `cf72f99`; dev is ahead
by 26 commits: §0.92, §0.93 and its follow-up, the 8 Sep diagnostics and
their removal, and the docs), FINAL.** Repo
root. Read this first, then verify every claim in it against the live repo
before acting — **including the claims in this file**.

**Ninth session (8 September 2026, Jeff: "claude, lets continue the effort on
Accelrep") — CLOSE.** The ritual passed (26 commits after `cf72f99`, both
fingerprints, copies identical, tree clean). Found: the state header still
carried the FIRST close's counts — refreshed, the per-batch lines rewritten
for §0.89–§0.93, five stale "not yet shipped" claims corrected (`8666737`);
**the pre-ship Slack-webhook read DONE** (five settings rows in the shared
database, ONE webhook, the dev org's, on `hooks.slack.com`; end of state
§0.92). Jeff: "1. confirmed" — Resend: dev Enabled, prod Disabled. Then, at
"what is the point of this test", his screenshot: `hooks.slack.com/services/`
(no scheme) refused on Save, the card behind still Connected — **§0.92
OBSERVED** — with the refusal rendered in the panel banner BEHIND the open
modal → **`0163cd1`**: the modal shows "Not saved — <reason>" under the
field, a scheme-less paste is told to start with https:// (guide §18b32);
landed `index-BRrOppU7.js`; **OBSERVED by his second screenshot** (the
message inside the dialog, no banner). Then Jeff: "make sure the error codes
will show in the correct place for the rest of the connected apps — both
currently connected apps and the request ones" → **`e77d841`, state §0.94**:
every card and row action reports on its own surface, a failed fetch is
reported as a failed fetch, the page banner is for the settings load alone;
landed `index-DhQ2fFJ5.js`; NOT observed (a refusal needs a failing server).
Then Jeff: "How do I choose what gets posted to slack (or other connected
apps)? Can we add an option that enables me to select what actions get
posted" — and reading `pipeline-alerts.mjs` to answer found **the hourly
alert job had thrown on its first deal since 7 April**: `bf4a3c5` renamed a
parameter of `wantsAlert` and `wantsSms` and left both bodies reading the
old name, bound only inside the deal loop — ReferenceError, 500 from the
outer catch, every hour, every site; no email, SMS or Slack alert has gone
out for five months → **`b5da1a7`, state §0.95, guide §18b33**: two lines
fixed, the helpers lifted out of the source and RUN by a new suite (3
mutants; the harness's first run let all three SURVIVE because the suite was
not in its `SUITES` list — registered, 309/309); landed from Netlify's deploy
record (`6aa078b6…` = `b5da1a7`, ready 21:06:26 UTC, `pipeline-alerts`
rebuilt). The answer to his question is **item 29** — there is no org-level
selection today; the proposal is five checkboxes in the Slack modal. Then
Jeff: **"lets do 29, 30 and 32 while I reset the webhook"** — three batches,
each verified, landed and recorded before the next: **§0.96 `adc5780`** —
five checkboxes in Configure Slack saved as `slackConfig.alerts`, asked by
`sendSlackToOrg` before every post (a config saved before the key posts
everything), the card reading "n of 5 alerts"; **§0.97 `282c16c`** — the
calendar OAuth round trip carries where Connect was clicked and how it went
(allowlists only), App.jsx lands the user back on that surface with one
line; **§0.98 `5bca4fd`** — a site-wide `job_heartbeats` table (both
databases first), every scheduled handler wrapped in `withHeartbeat`, an
Admin-only `job-status`, a "Scheduled jobs running" health check and an
"Alerts job" line on the Slack card — **PROVEN by the first heartbeat row
ever recorded** (task-reminders, ok, 22:02:03 UTC, `ok_count` 2, read back
from the app database). Along the way: the harness once died mid-mutant and
left a mutant on disk (`git status` caught it — §0.96), the TDZ gate caught
an unimported `useEffect` (§0.97), the org-scoping scan flagged the
site-wide table and got its exemption with the reason beside it (§0.98).
Then Jeff, the Slack card seen working: **"i changed an opportunities status
and it did not show up in slack"** — nothing posted on a status change, and
the five signals asked the REP's preference before the company's selection;
after two options and a change of mind: **"actually move it all to an event
post. I don't want to have to rely on users to pick the correct items by
themselves to enable alerts the company wants to post to slack."** →
**§0.99 `fbaf8ae`, item 33**: stage changed and closed won post from the deal
save the moment they happen (who moved it, the rep, the ARR); the five
hourly signals post on the org's checkboxes alone, the rep's preference
gating only that rep's email and SMS; seven checkboxes in two groups with
honest labels; a 4-second cap on the Slack fetch inside the save; proven
against the real rows in the integration suite. Landed `index-B-DxPVK_.js`;
**OBSERVED four minutes later — Jeff's screenshot of #sales-alerts: "🏆
Closed Won — ZZFX Cinder New Logo — $210K ARR · from Negotiation/Review ·
Rep: Karen Russell · Closed by Jeff Russell", 22:33 UTC — the first real
post the app has ever made to Slack.** Then **Jeff: "ship prod" — the TENTH
SHIP, §0.92 through §0.99: `master` `cf72f99` → `5a306e3` (49 commits),
salespipelinetracker.com serving `index-JJdhJmyd.js` 50 seconds after the
push, 76 functions, prod's wrapper stamping the shared heartbeat row within
two minutes (state §0.99, last paragraphs).** Found at the ship: the
heartbeat row is per job, not per site — item 34. `master` == `dev` ==
`5a306e3` at the ship; dev is ahead only by the ship-record docs commits.
**The Resend webhook is back on prod — Jeff's screenshot after the ship:
prod Enabled, dev Disabled.** **The Resend webhook after Jeff's reset — his screenshot
of resend.com/webhooks at the close: the dev endpoint
(`accelerep.netlify.app/…/email-inbound`, created 4h ago) Enabled, the prod
endpoint (`salespipelinetracker.com/…`, 3mo ago) Disabled — unchanged from
his "confirmed" at the open.**

**Previous session — 3 and 7 September 2026, seventh session (Jeff: "claude, lets
continue" — the Connected Apps panel had rendered a component bound nowhere
since 11 May, `<SlackConfigModal/>`; restored, the `check:tdz` gate taught
that a JSX name is a read — state §0.89, OBSERVED by Jeff ("verified";
eighth session: configured against a real Slack workspace, the test message
seen in the channel); then
Jeff: "can we create a list of common apps … they all show morgan reyes" — he
chose **option A**: the panel is what exists, Slack, Google and Microsoft 365
calendars, an Email-logging card, and a catalogue whose rows are REQUESTS —
state §0.90, OBSERVED by Jeff's screenshot (and, eighth session, a Request
that persists a hard refresh); then Jeff: "is there a way to
allow individual accelerepo users to generate a unique address for
themselves" — option 1 plus From attribution: a personal `me-<user id>-<sig>`
address whose email is OWNED by that user and shown to no other rep, the org
address attributed to the roster member who sent it, a profile-panel tab,
the first integration suite the inbound function ever had — state §0.91, on
dev, deploy-verified, OBSERVED in the eighth session (7 Sep — the two
personal addresses differ, then Karen's real email through the ORG address
logged OWNED by her — From attribution — then through her PERSONAL address,
both rows read back; no second rep in the org for the negative check); then
**Jeff: "ship prod" — ALL of it
SHIPPED as the ninth ship, `master` `ad76a38` → `cf72f99`,
salespipelinetracker.com serving `index-DIeZb8qh.js`**).**

**Fast staleness check:** does `docs/ACCELEREP_CURRENT_STATE.md` contain
`### 0.99` with a paragraph beginning **"Landed on dev (`fbaf8ae`"** and
`### 0.98` with a paragraph beginning **"Landed on dev (`5bca4fd`"**, and does
`docs/ACCELEREP_CODING_GUIDE.md` under `## 18b33` carry the words **"every
scheduled handler is `withHeartbeat('<job>', run)`"**? If not, you are
looking at a copy that predates this handoff. Check section
content, never dates.

**On dates:** §0.58, §0.59 and the previous handoff say "2 Sep". Git carries
every one of their commits at 1 Sep -0500, the same day as §0.56/§0.57 and
as this session. §0.60 uses the day git records and flags theirs; renaming
their headers is Jeff's call, not done. **The seventh session spans two
days:** §0.89 and §0.90 and their docs are 3 Sep -0500 in git; the §0.90
screenshot observation (`6fbf821`) and §0.91 (`eb24dea`) are 7 Sep — the
session resumed after four days. Headers say which.

---

## 1. What shipped — the tenth ship put §0.92 through §0.99 on `master` (8 Sep 22:36 UTC); nothing is on `dev` only but the ship-record docs

**PROD SHIPPED (Jeff: "ship prod") — the tenth ship (8 Sep, ninth session).**
Ancestor check (tree clean, `dev` == `origin/dev`, `origin/master` an ancestor
of `dev`), then `git push origin dev:master`: `master` `cf72f99` → `5a306e3`
(49 commits — §0.92 through §0.99 and their docs), pushed 22:36:01 UTC.
salespipelinetracker.com served `index-JJdhJmyd.js` at 22:36:51 UTC (50
seconds), dev's byte size, `pk_live_` inlined, every new string present, the
old banner string absent; Netlify's record: deploy `6aa08dd3…` = `5a306e3`,
branch `master`, 76 functions, secret scan clean; `send-slack`, `job-status`,
`email-inbound`, `calendar-connections` answer 401 unauthenticated; prod's
`task-reminders` stamped the heartbeat row within two minutes (state §0.99,
"PROD SHIPPED"). Prod's `pipeline-alerts` runs the fixed code for the first
time at 23:00 UTC. **The Resend webhook is back on prod — Jeff's screenshot
minutes after the ship: prod Enabled, dev Disabled.** The paragraphs below
are the batches as they were recorded
before the ship; each is now on `master`.

**Eighth session, day two (8 Sep) — the root cause, and the proof. ON DEV
ONLY, NOT shipped.** Jeff re-ran steps 3, 7 and 9: Escape fixed; the body
still flat, no attachment line — and again, and again, seven emails over a
day, every one stored with zero newlines while Netlify's deploy record said
the fixed function was live. Three diagnostics went out (`d1fcf44` a console
line on the fetched path; `c4ccdbb` both paths; `696b85b` the shape written
onto the row's `outcome`, because the function log showed request rows and no
console output at all). The third came back EMPTY on "#13 Test email" — a row
the dev function cannot write — and prod's copy (`cf72f99`, the pre-fix code)
fit every symptom. **Jeff's Resend dashboard: one webhook,
`https://salespipelinetracker.com/.netlify/functions/email-…`, created three
months ago.** Dev and prod share one Neon `main`, the dropbox secret is the
same on both, the roster row is shared — prod's old function validated the
address, matched the contact and wrote every row, and dev's screen showed
it. §0.91's 7 Sep proofs were prod's function too (same code both sites that
day; the observation stands, the site was prod). Jeff: "1" — a NEW Resend
endpoint at `https://accelerep.netlify.app/.netlify/functions/email-inbound`,
its signing secret set as `RESEND_INBOUND_SECRET` on the dev site, the prod
endpoint DISABLED; `f44a8db` redeployed dev so the function reads the new
secret (every function rebuilt, 17:52:36 UTC). **"#14 Test Email", 19:26:45
UTC: ten newlines, "Attachments: Lumen.pdf", and the diagnostic — Resend's
Received emails API hands over `text` WITH line breaks, `html`, and
`attachments` as `[{ id, filename, content_type, content_id,
content_disposition, size }]`.** The fix needed no change. `173948a` removed
the diagnostic (`outcome: null` again; the shape lives in the fetch comment)
and let the viewer's outcome line wrap; dev served `index-Bz_vDa_T.js` 38
seconds after the push. Jeff's screenshot of #14 in the viewer: every line,
the blank ones, the attachment line. **The webhook stays on dev until the
ship** (§5). Guide §18b31 carries the rule: a shared database does not say
which site wrote the row; read the provider's target first.

**Eighth session, third batch (7 Sep) — ON DEV ONLY, deploy-verified, PROVEN
on 8 Sep (above), NOT shipped:** `f17e835` (the §0.93 follow-up) and its landing
docs commit. accelerep.netlify.app served `index-CkYvyiY8.js` — the local gate
build's hash — 32 seconds after the push (18:39:16 UTC). What it is: Jeff's
report on the fourteen steps — 3 "when i hit escape the dialog closes but so
does the rail"; 7 and 9 "All lines are truncated into one long running
paragraph … it does not indicate that I included an attachment"; 6 "the jeff
russelltest contact is not showing up … formally unassigned". Read against
the code and the row: each rail had its own Escape listener beside App.jsx's
(now it yields while the viewer is open); `email-inbound.mjs` had collapsed
every newline to a space before storing — the stored "Test email #4" holds
zero newlines — so the body now goes through `_inboundText.mjs`
(newlines kept, HTML blocks become breaks, "Attachments: …" appended from
whatever names the payload carries; the files are not stored; Resend's
receiving API carries `attachments` as `[{ id, filename, content_type,
content_id, content_disposition, size }]` — verified 8 Sep); and the contact
is owned by Karen underneath
(`stampOwnerId` at creation) with a blank "Assigned Rep" on screen, hidden
by the Contacts tab's remembered "Mine" scope — not a viewer bug, item 28.
`tests/inbound-text.test.mjs` (5), `email-inbound.itest.mjs` +2 against the
real database, 5 mutants. `master` stays at `cf72f99`.

**Eighth session, second batch (7 Sep) — ON DEV ONLY, deploy-verified,
OBSERVED by Jeff ("works"; then the fourteen-step report — the third batch
above), NOT shipped:** `92b6ecc` (item 26 option 2, state
§0.93) and its landing docs commit `5c0c94c`. accelerep.netlify.app served
`index-C1VD4DfX.js` — the local gate build's hash — 27 seconds after the push
(18:15:17 UTC); `setViewingActivity`, `WebkitLineClamp` and `title:"Open"` in
the served bundle. What it is: **Jeff: "Is there anyway that we can have these
emails clickable and a person can read the full content?"** — three options,
he chose option 2 ("do option 2 now … we can make the call on option 3 with
emails"). Every activity row — the contact, account and task rails, the deal
modal's recent-activity list and its History tab — opens a read-only viewer
(type, date, author, subject bold, contact · account · deal, the whole body
with line breaks, Close, and Edit only where the server would let the caller
write, `canEditActivity` mirroring `mayMutate`); rails show the subject bold
over the body clamped to two lines instead of the unclamped dump. Jeff's
first look was a screenshot 15 seconds before the landing ("it does not");
after a hard refresh, "works" — which of the fourteen steps in §5 he ran is
not stated. `master` stays at `cf72f99`.

**Eighth session, first batch (7 Sep) — ON DEV ONLY, deploy-verified, NOT
observed, NOT shipped:** `bac7387` (item 25 + the endpoint gate, state §0.92,
guide §18b30) and its landing docs commit `de94064`. No `src/` changed, so
the bundle hash could not show it; Netlify's deploy record did: deploy
`6a9efbfd…`, commit `bac7387`, branch `dev`, ready 18:02:06 UTC, 73 functions
deployed including the new `_slackWebhook`. Unauthenticated the two functions
answer GET 405 / POST 401 before and after — the gate sits behind the session.
What it is: `send-slack` is `requireRole(['Admin'])` before the body is read; a
typed test URL that is not `https://hooks.slack.com/services/…` answers 400
with the reason (the modal already shows `data.error`); `sendSlack()` itself
refuses any other destination, so a stored non-Slack webhook posts nowhere on
any of the five alerts; `settings.mjs` PUT refuses saving one; and
`integration-requests` is Admin-only, because Settings is. First suite
`send-slack` ever had (6, real handler, `fetch` mocked for every host but the
Neon regional API host). GitHub's push protection refused the first push — a
well-formed fake webhook literal in the unit test read as a leaked secret — so
both suites assemble their samples at run time; the commit was amended before
it left the machine. **Jeff's eyeball (§5).** `master` stays at `cf72f99`.

**Observed this session (7 Sep), all on deployed dev, all recorded in state
as they were seen:** §0.91 — "karen and my cc addresses are different", then
Karen's email through the ORG address logged owned by her ("karen used the
org address"), then through her PERSONAL address in CC ("Test email #2"), both
rows read back, Karen seeing both on the contact; the negative check ("I did
not see if anyone else can see the email") cannot run — the dev org has no
second rep. §0.90 — the Gmail Request persists a hard refresh, the settings
record and the `integration.requested` audit row read back. §0.89 — Slack
configured against a workspace Jeff created ("worked"), the test message in
#sales-alerts, the config read back; four paired `settings.updated` rows read
against the code and a controlled repeat (Send test message alone: 4 before, 4
after) closed the question. The "Karen path" on Connected apps was a wrong
claim — Settings is Admin-only (`App.jsx`), "nor should they" — struck in
state §0.90 and §5. A read-side trap: `@netlify/neon` on this machine parses
a `timestamp without time zone` as local time — cast `::text` (state §0.91).

**PROD SHIPPED (Jeff: "ship prod") — the ninth ship (7 Sep).** Ancestor
check (`origin/master` an ancestor of `dev`, tree clean, `dev` ==
`origin/dev`), then `git push origin dev:master`: `master` `ad76a38` →
`cf72f99` (12 commits — item 22, §0.89, §0.90, §0.91 and their docs), pushed
11:21:58 local. salespipelinetracker.com observed serving `index-DIeZb8qh.js` at 11:29:23
local, 2,489,558 bytes (dev's size), `pk_live_` inlined — a different hash
from dev's `index-ABUwIA60.js` because the live key is inlined, as on every
ship; "Configure Slack", "Request an integration", "Microsoft 365 Calendar"
and "Treat this address like a password" present, "Morgan Reyes" and
"n:118" absent; the one `pk_test_` string in the bundle is Clerk's SDK prefix check (`pk_test_` appears nowhere in `src/`), not a key; the poll was watching for dev's hash, so the landing minute was not captured — observed serving by 11:29:23. `email-inbound` and `calendar-connections`
answer 401 unauthenticated; `integration-requests` and `send-slack` are
POST-only (405 on GET, 401 on an unauthenticated POST). `master` == `dev`
== `cf72f99` at the ship; dev is ahead only by this ship-record docs commit.
Prod no longer carries the Slack crash it had carried since 11 May.

**Seventh session, third batch (7 Sep — the session resumed) — ON DEV ONLY,
deploy-verified, OBSERVED by Jeff (eighth session, 7 Sep — §5),
SHIPPED in the ninth ship:** `eb24dea` (personal email-logging
addresses, state §0.91) and the docs commit this handoff rides in.
accelerep.netlify.app served `index-ABUwIA60.js` — the local gate build's hash —
32 seconds after the push (10:58:38 local), `pk_test_` inlined; "Treat this
address like a password" and "personal address under their avatar" in the
served bundle; the deployed `email-inbound` GET answers 401 unauthenticated.
What it is: **Jeff: "I like option 1. I also like the from address
attribution."** Every roster member has a personal BCC address,
`me-<users.id>-<sig>@…` (its own HMAC namespace; requires `users.active`),
shown under avatar → Email logging with Copy; an email through it is logged
OWNED by that user with their roster name as author, on any contact in the
org, so the existing rep visibility rule shows it to them, their managers
and admins and to no other rep. The org address stays as the fallback and is
now attributed to the roster member whose email matches the From address
(org-scoped), unowned otherwise. Before: every logged email was unowned and
visible to every rep, with the raw sender in `author`. **Not observed** — no
pane session, and the real proof is a real email. `master` stays at
`ad76a38`.

**Seventh session, second batch (3 Sep) — ON DEV ONLY, deploy-verified,
OBSERVED by Jeff's screenshot (the panel rendered; eighth session: a
Request click persists a hard refresh, and Slack configured against a real
workspace; the "Karen path" was a wrong claim — Settings is Admin-only),
NOT shipped:** `e3d15f2` (item 24 option A, state §0.90,
guide §18b7's new paragraph) and the docs commit this handoff rides in.
accelerep.netlify.app served `index-UiFDxZrS.js` — the local gate build's hash —
42 seconds after the push (15:29:53 local), `pk_test_` inlined; "Request an
integration", "Microsoft 365 Calendar", "Email logging" and "Not available on
this site" in the served bundle, "Morgan Reyes", "Browse marketplace" and
"Authorize" absent; the deployed `integration-requests` function answers 401
unauthenticated. What it is: **Jeff: "option a."** The Connected Apps panel
renders the integrations that exist and nothing else — Slack (as §0.89 left
it); Google Calendar and **Microsoft 365 Calendar** (offered in the UI for the
first time; the backend always took it) from `calendar-connections`, company
and personal, with the real connected email, Connect through the existing
OAuth start, Disconnect through the existing DELETE, and "Not available on
this site" when `calendar-connections` GET's new `providers` map (env-var
NAME presence, never a value) says the site has no credentials for that
provider; **Email logging**, a card for the org's BCC address from
`email-inbound` (a complete feature that had no UI); and **Request an
integration** — ten apps from one shared module (`src/utils/integrationCatalog.js`,
imported by the panel AND by the new `integration-requests.mjs`) whose rows
are requests: POST → recorded at `settings.extra.integrationRequests` (both
halves of `settings.mjs`), org-scoped, idempotent, audited as
`integration.requested`, mailed to `INTEGRATION_REQUESTS_TO` when set. Gone:
the "Morgan Reyes" connect modal, `INT_APPS`, "Browse marketplace", "+
Request integration", the `gcal` flag. **OBSERVED — Jeff's screenshot of deployed dev (7 Sep, as Admin), read
against the code:** the panel as designed — "2 live"; Slack "Not connected"
with only "Configure Slack"; Google Calendar "Live", "Mine ·
jeffrussell1@gmail.com · 8/12/2026" with Disconnect, "Connected", and
"Connect company calendar" (Admin, no org connection); Microsoft 365
Calendar "Not available on this site" with the one-line reason and no
button — so the dev site has no Microsoft credentials, which the Company
Calendar panel could never have said; Email logging "Live" with the org's
BCC address and Copy; "Request an integration · None requested yet" and the
ten rows, each ending in Request. Eighth session (7 Sep): Gmail Request
clicked → "Requested · 9/7/2026", persists a hard refresh; the settings
record and the `integration.requested` audit row read back (state §0.90,
last paragraph); Slack configured, the test message seen in #sales-alerts
(state §0.89, last paragraph). The "Karen path" never existed — Settings
is Admin-only by design (state §0.90, struck sentence). `master`
stays at `ad76a38`.

**Seventh session, first batch (3 Sep) — ON DEV ONLY, deploy-verified,
OBSERVED by Jeff ("verified"), NOT shipped:** `95141cb` (state §0.89, guide
§18b29) and its docs commit `7bb3e70`. accelerep.netlify.app served
`index-CEn91emU.js` — the local gate build's hash — 32 seconds after the push
(14:57:35 local), 2,486,255 bytes in `dist/`, `pk_test_` inlined; "Configure
Slack", "Send test message" and "Incoming Webhook URL" in the served bundle,
"n:118" absent. What it is: **the Slack configuration modal is back.**
`ConnectedAppsDetail.jsx` had rendered `<SlackConfigModal/>` with the name
bound nowhere in `src/` since `5772f63` (11 May 2026) deleted it from
SettingsTab.jsx in a cleanup; Vite bundles an unbound JSX name as a global
read, so every build passed and every "Configure Slack" / "Configure" /
"Configure →" click threw `SlackConfigModal is not defined` into the Settings
error boundary — no org could enter the webhook `send-slack.mjs` and the five
`pipeline-alerts.mjs` Slack posts read, on prod, for four months. Restored at
module scope from the pre-deletion source (`FL` hoisted as `SlackField`).
**The gate that exists for this had a blind spot:** `check-tdz`'s undefined
pass walked `Identifier` nodes and a JSX element name is a `JSXIdentifier`;
it also never collected `export default function X()` as module scope (46 in
`src/`). Both fixed; fixtures at both sites; the whole tree scans clean and
the scan found exactly one. Alongside: `IntBtn` honours `disabled` (four
callers passed it into the void); the Industries defaults drop the typed
`n:118…` that nothing rendered but every Save persisted; the Account rail's
Industry typeahead reads the taxonomy's `k` (an org that had saved its
industries got no suggestions at all) and skips hidden rows. **Reasoned from
code and proven by fixture, not observed** — no pane session. `master` stays
at `ad76a38`.

**PROD SHIPPED (Jeff: "ship prod") — the eighth ship, state §0.87 last
paragraph.** Ancestor check, then `git push origin dev:master`: `master`
`eec3948` → `ad76a38` (17 commits — items 18, 19, 20 and 21 with their
docs). salespipelinetracker.com served `index-BYLyFXw4.js` 53 seconds after
the push (13:48:22 local), 2,482,786 bytes (dev's size), `pk_live_` inlined,
every new string present and the fakes absent; `audit-stream` and `users`
answer 401 unauthenticated. `master` == `dev` == `ad76a38` at the ship; dev
is ahead only by this ship-record docs commit. Nothing was unshipped at the
ship; item 22 (next paragraph) came after it.

**Sixth session, fifth batch (3 Sep) — ON DEV ONLY, deploy-verified,
OBSERVED by Jeff ("confirmed that settings cards are correct and all badges
are gone"), NOT shipped:** `539eaa1` (item 22, state §0.88) and its landing
docs commit `9cb2d2a`. accelerep.netlify.app served `index-WThsNanc.js` —
the local gate build's hash — 42 seconds after the push (14:02:19 local),
2,483,334 bytes, `pk_test_` inlined, "App defaults" / "recent event" / "FY
starts " in the served bundle, "12 KPIs configured" / "14 industries" / "Q1
starts Feb 1" absent. What it is: the catalogue's 30 hand-typed card details
are gone and every count is computed from the key its own panel saves, or
is null, or says "App defaults" where the panel supplies one; two guards had
named keys no panel writes (`customFields`, `holidays`), so "18 custom
fields" and "12 holidays" had shown for every org always; the audit card no
longer says "last 30d" over a 500-row cap; all 16 never-expiring NEW badges
and two dead `moved` flags are gone. **OBSERVED by Jeff on deployed dev (3
Sep): "confirmed that settings cards are correct and all badges are gone."**
`master` stays at `ad76a38`.

**Sixth session, fourth batch (3 Sep) — ON DEV ONLY, deploy-verified,
OBSERVED by Jeff ("Looks correct"), NOT shipped:** `2e7a219` (audit streaming, state §0.87 — the
design committed first as `1ac3d64`, then the build) and its landing docs
commit `3541d8a`. accelerep.netlify.app served `index-BJ1VcE9y.js` —
the local gate build's hash — 52 seconds after the push (13:26:26 local),
2,482,786 bytes, `pk_test_` inlined, "Send test event" / "Rotate secret"
/ "the last 500 events are loaded" in the served bundle, "Streaming to
Splunk" and "Manage alerts" absent; the deployed `audit-stream` function
answers 401 unauthenticated. **The table `audit_stream_destinations` is in
BOTH databases** (`db/apply-audit-stream.mjs`, read back and counted, test
then app, before the code was committed — §18c). What it is: every audit
row (four write sites) is POSTed to each of the org's destinations as it is
written, HMAC-SHA256-signed over the exact body, in parallel with a 4 s
timeout each, every attempt recorded on the row, a destination pausing
itself after ten consecutive failures; an Admin-only endpoint creates one
(secret shown once), sends a real test event, pauses / resumes / rotates /
removes; the panel keeps the real stream, filters and export and drops the
alerts modal, the typed badge, the retention claims, the inert menus and the
IP column. The integration suite runs a local receiver and verifies real
signatures against the real database. **OBSERVED by Jeff on deployed dev
(3 Sep): "Looks correct"** — his words cover the panel as seen; a
destination walked through to a delivered row he did not report. `master`
stays at `eec3948`.

**Sixth session, third batch (3 Sep) — ON DEV ONLY, deploy-verified,
OBSERVED by Jeff ("Looks correct"), NOT shipped:** `6ec3c05` (item 21, three of four panels, state
§0.86) and its landing docs commit `49783ef`. accelerep.netlify.app served
`index-Wjd4yjDA.js` — the local gate build's hash — 42 seconds after the
push (13:03:13 local), 2,500,619 bytes, `pk_test_` inlined, "Managed in
Clerk" / "Sessions, passwords and lockout are set in Clerk" / "Nothing is
imported from this page itself." in the served bundle, "acme-corp.com" and
"Policy saved" absent, `/.netlify/functions/import` falling through to the
SPA catch-all (the function is deleted). What it is: **Jeff decided item
21 per panel** — SSO reduce, Session reduce, Import launcher, **Audit
streaming BUILD** — and this batch is the three reductions: SSO and
Session & password are Managed-in-Clerk panels (what Clerk does, what the
app does, what it does not do — no IP allowlist, no re-auth), Import is a
launcher for the real CSV and lead importers, `import.mjs` (its only
caller was the fake wizard) is deleted, `ssoConfig` and `importPresets`
are out of both halves of settings.mjs. **Found reading: SessionDetail's
Save PUT `sessionPolicy`, a key in NEITHER half of settings.mjs — the
previous handoff's "the policy it saves is real" was wrong; it toasted
"Policy saved." and saved nothing.** **OBSERVED by Jeff on deployed dev
(3 Sep): "Looks correct."** `master` stays at `eec3948`.

**Sixth session, second batch (3 Sep) — ON DEV ONLY, deploy-verified,
OBSERVED by Jeff ("confirmed on karen under performance"), NOT shipped:** `6db6ea8` (item 20, state §0.85) and its landing
docs commit `be5e91b`. accelerep.netlify.app served `index-DmjjOHZE.js` —
the local gate build's hash — 32 seconds after the push (12:08:54 local),
2,559,307 bytes, `pk_test_` inlined, "Won deals —" / "Lost deals —" / "no
closed deals" in the served bundle. What it is: Reports → Performance with
the Rep slicer set showed one leaderboard row and hid the Rep metrics table
(gated `repRows.length > 1`), so a manager saw an attainment bar and no
deals behind it; now two panels below the leaderboard — Won deals (Deal ·
Closed · Cycle · ARR, Total, win rate) and Lost deals (the stage each left
and why, Total) — from the SAME period-filtered sets the leaderboard sums,
pure in `src/utils/repDeals.js`. **OBSERVED by Jeff on deployed dev (3 Sep):
"confirmed on karen under performance."** `master` stays at `eec3948`.

**Sixth session (3 Sep) — ON DEV ONLY, deploy-verified, OBSERVED by Jeff
("verified changes. they are working"), NOT shipped:** `9782e97` (items 18 + 19, state §0.84) and its landing docs
commit `3b2aba3`. accelerep.netlify.app served `index-C9mGhBOf.js` — the
local gate build's hash — 56 seconds after the push (11:08:11 local),
2,553,081 bytes, `pk_test_` inlined, "Forecast ledger" / "Export CSV" /
`forecastCalls` / the estimate title / "1:1 with " all in the served
bundle; the deployed `users` function answers 401 unauthenticated. What
it is: a Manager's typed Commit on the Forecast ledger PUT a key that
`users.mjs`'s `sanitize()` never carried (0 on refresh — §0.80's
finding); now `profile.forecastCalls` keyed by fiscal quarter
(`{ '2026-Q4': { commit, bestCase } }`) through one pure validator on both
sides (`src/utils/forecastCall.js`), so a call never resets by accident,
only when the quarter turns; Best case is editable in the same cell and an
untyped one reads muted/italic "est." (60% of open pipeline); "Coach →",
the Team card's "Coach" and Today's "Open coaching" open the note dialog
with the rep pre-addressed (a Manager's preset is filtered to their teams'
reps); "Pipeline" / "Their pipeline" set the Viewing bar's rep slicer and
open the Pipeline tab; "Schedule 1:1" opens a new task in the rail; the
ledger card has a header and **Export CSV**; Home's quota card is the
quarter's own quota (`userQuotaFor`), wins by close day inside the fiscal
quarter, commit by the org's last two open stages, labelled "Q4 FY2026".
**OBSERVED by Jeff on deployed dev (3 Sep): "verified changes. they are
working."** `master` stays at
`eec3948`; `git log --oneline origin/master..dev` now lists this
session's commits plus the previous ship-record docs commit — that is
expected, not a finding.

**Fifth session (3 Sep) — SHIPPED TO PROD as the sixth ship (Jeff: "ship to
production"): `master` fast-forwarded `d513b0e` → `bdb0f3c`,
salespipelinetracker.com serves `index-CIR6aj2A.js` (20 seconds after the
push, `pk_live_` inlined, all four new strings present, the coaching-notes
function 401 unauthenticated); state §0.82 last paragraph. Jeff ran the
Admin "Import N legacy notes" button on prod: done.** **Fourth batch —
SHIPPED TO PROD as the seventh ship (Jeff: "ship to prod and update the
docs"):** `6bf1e6e` (the coachingNotes settings key and the legacy import
path retired, state §0.83); dev served `index-DzhyaR_f.js` 40 seconds
after its push; `master` fast-forwarded `bdb0f3c` → `eec3948`,
salespipelinetracker.com serves `index-Bsn2ZlRv.js` (`pk_live_` inlined, the
coaching-notes function 401 unauthenticated). Third batch:
`aef4b4b` (coaching notes addressed to people or a team, their own table),
state §0.82; docs `38b7d55`. Deploy-verified: accelerep.netlify.app served
`index-Kg6gw2rZ.js` 41 seconds after the push; the deployed
`coaching-notes` function answers 401 unauthenticated. **The DDL is in both
databases already.** **OBSERVED by Jeff as Admin and as Karen (3 Sep):
"all cleared and worked as planned"** — dialog, listing, legacy import,
Home block, bell, Mark read (state §0.82, last paragraph). Second batch:
`59212ec` (the Settings catalogue and its panel headers carry no invented
text; Workspace Health counts only what it can read), state §0.81; docs
`6bb4d49`. Deploy-verified: accelerep.netlify.app served
`index-CsUn53YS.js` (the local gate build's hash) 20 seconds after the
push. **OBSERVED by Jeff as Admin (3 Sep): footers empty except MFA,
Workspace Health accurate, Webhooks accurate, Pipelines header without
"Last edited"** (state §0.81, last paragraph). First batch: `1e15e45`
(Sales Manager header on the org's fiscal quarter, weeks remaining never
0) and `327ce8f` (totals quarter-to-date, Administration bar FY-to-date,
three inert header buttons removed), state §0.80; docs `b673aa2`,
`49ca620`. Deploy-verified: accelerep.netlify.app served
`index-ByAdikgx.js` (the local gate build's hash) 21 seconds after the
push. **OBSERVED by Jeff as Admin (3 Sep): header, Forecast and
Administration all good** (state §0.80, last paragraph). Not yet shipped
to prod; prod stays at `d513b0e` — the ship is Jeff's call.

**Fourth session, on top of everything below:** `410095e` (the owed guide
bullet, docs only); `7f14eb3` (nine unused default imports removed from
App.jsx, state §0.63; deploy-verified, accelerep.netlify.app served
`index-wHucaxGK.js`); `aa82d21` (the 9/15/2026 CSV check observed live);
and the commit this handoff rides in — **unreadable date cells refused at
Preview and the engine's year-2001 default gated** (state §0.64, guide
§18b26's last bullet) — `51202b4`, **deploy-verified:** accelerep.netlify.app
serves `index-Bpb-wphy.js`, the local gate build's hash. **PROD SHIPPED
(Jeff):** `master` fast-forwarded `13f9ffe` → `d078c8f`;
salespipelinetracker.com serves `index-DvbBtbWW.js`, `pk_live_` inlined,
refusal string and year gate present, same byte size as dev's bundle (state
§0.64). The session began the evening of 1 Sep and finished 2 Sep.

**After the prod ship — the pending-session bypass, FIXED on dev (state
§0.65, guide §18b27), the commit this handoff rides in.** Jeff turned on
Clerk's "Require multi-factor authentication" for the Development instance
and a fresh Karen sign-in loaded straight through: `App.jsx` gated on
`useUser().user` (populated while pending) and `verifyAuth` never read the
token's `sts`. Now the app trusts the user only while `useAuth().isSignedIn`,
and `pendingSessionRefusal` 401s any non-active `sts` before the user lookup
and the cache. Observed on the same pending session: Clerk's "Set up two-step
verification" card where the app used to render, and 401 from three endpoints
where one had answered 200. MfaDetail rewritten honest. `ded3271`,
**deploy-verified:** accelerep.netlify.app serves `index-Cy6ZeOFD.js`, the local
gate build's hash, refusal string present. **PROD SHIPPED (Jeff: "lets ship
dev to prod"):** `master` fast-forwarded `d078c8f` → `abb239a`,
salespipelinetracker.com serves `index-kU7R9Yoq.js`, `pk_live_` inlined, panel
copy present, same byte size as dev (state §0.65). The server refusal was
not probed on prod (needs a pending prod token). **Require multi-factor
authentication is now ON for Production too** (Jeff: "worked in
production"). Every prod user without a second factor is held at Clerk's
setup card on their next sign-in — expected, and the point.

**After the second ship — the Win / loss report (state §0.66), the commit
this handoff rides in.** Jeff marked four deals Closed Lost with a category
and the report said "Other · 5 · 100%" and "No stage history data": it read
the free-text notes instead of `lostCategory`, and the closing history
entry's own stage instead of its `prevStage`. Eight readers in ReportsTab now
go through `src/utils/lossAnalysis.js`; 15 tests on the five real rows, six
mutants. `7c6a432`, **deploy-verified:** accelerep.netlify.app serves
`index-CzGO2ggA.js`, the local gate build's hash. `master` does NOT have
it — ship dev to prod when Jeff has eyeballed the report.

**Then the Activity report (state §0.67), the commit this handoff rides in:**
the Rep / Team / Territory slice was applied to opportunities and never to
activities, so "Total activities" read 23 for every rep. `reportsActivities`
now comes from `sliceActivities` in `src/utils/reportScope.js`; ten tests,
four mutants. `e39c57d`, **deploy-verified:** accelerep.netlify.app serves
`index-Dv_RGDzl.js`, the local gate build's hash. `master` has neither
report fix — ship dev to prod once Jeff has eyeballed both.

**Then the audit, top down (Jeff: "please proceed top down") — batch 1, the
commit this handoff rides in (state §0.69):** the four hand-rolled fiscal
builders replaced by `src/utils/reportPeriod.js` on top of `quarters.js`;
FY/Q1–Q4 now the right year under a January start, the comparison baseline
the right year AND the sliced set, "All time" with no fake baseline, instants
read on the local clock. 13 tests under two fiscal starts, 7 mutants.
`939f7a2`, **deploy-verified:** accelerep.netlify.app serves
`index-CprJulHE.js`, the local gate build's hash.

**Batch 2, the commit this handoff rides in (state §0.70):** the
`products.map` crash, the toolbar above the null guard, the contacts array
written into a text column (both paths), the phantom `nextStep(Date)`
reads, and the Actions report storing a Response as data. `src/utils/
oppText.js`, 9 tests, 5 mutants. `d79b888`, **deploy-verified:**
accelerep.netlify.app serves `index-D3lRwa5m.js`, the local gate build's
hash.

**Batch 3, the commit this handoff rides in (state §0.71):** scoping — the
Leads tab sliced, deals-at-risk on the sliced activities, `SavedReportsTab`
and `ActivityHistoryTab` handed the gated sets instead of the raw context
arrays, rep lists in the scorecard / Actions report / history picker
narrowed to the viewer's scope. 5 tests, 5 mutants. `f40b2c1`,
**deploy-verified:** accelerep.netlify.app serves `index-D0ibE8V3.js`, the
local gate build's hash. Open for Jeff: the report's leads gate
drops unassigned leads for non-Admins while the server can serve them.

**Batch 4a, the commit this handoff rides in (state §0.72):** the Pipeline &
Forecast tab's constants — the $175,000 quota replaced by the reps'
configured quotas for the period and slice (and the Performance
leaderboard's quota basis made period-scoped), the fabricated
forecast-accuracy chart replaced by closed-won by completed fiscal quarter,
the 7-day movement built from real won / lost / added / slipped flows, and
the "No next step" flag reading the real column. `src/utils/
pipelineReport.js`, 14 tests, 8 mutants. `d25b894`, **deploy-verified:**
accelerep.netlify.app serves `index-CLXLmsDb.js`, the local gate build's
hash.

**Batch 4b, the commit this handoff rides in (state §0.73):** the last
constants — the Activity tab's 0.91 prior period replaced by real
prior-period activities, "Per rep" and the rhythm grid on the roster in
scope with a five-zero-weekday flag, the win/loss "+3%" and two orphan
"vs previous period" captions removed, the builder preview and the pinned
cards on real numbers. 3 tests, 5 mutants. `33e521b`, **deploy-verified:**
accelerep.netlify.app serves `index-BtwmtTXu.js`, the local gate build's
hash.

**Batch 5a, the commit this handoff rides in (state §0.74):** every
hardcoded stage list on a live path replaced by the org's funnel settings
(else the app defaults) through `src/utils/stageOrder.js`; both funnels
rank a lost deal by the stage it left; the history track reads a won deal
as all stages visited. 5 tests, 5 mutants. `090da10`, **deploy-verified:**
accelerep.netlify.app serves `index-BBGjcEEV.js`, the local gate build's
hash.

**Batch 5b (state §0.75):** cycle time,
recent wins / losses and quarter buckets on closed deals read the real
close day (`closeDayOf` — `wonDate` / `lostDate`, else the stage-change
day), quarters are inclusive day ranges from quarters.js, the scorecard's
attainment history uses each quarter's own quota, and Closed Won now
writes `wonDate`. 6 tests, 6 mutants. `7dbfd6e`, **deploy-verified:**
accelerep.netlify.app serves `index-DZcl2imu.js`, the local gate build's
hash.

**Batch 6 (state §0.76):** the
unreachable print path and its feeders, the hardcoded stage list, the
dead `getRepQuarterQuota` and every inert control removed (356 lines);
the six "Save as my report" buttons save a real report carrying its
`templateId`, a saved card opens its template, Duplicate copies a real
report, Email to owner mails the roster address, the Actions sub-tab has
a nav entry. 5 tests, 5 mutants. Observed locally as Karen (Save → 201,
card opens, Duplicate → 201); two test saved reports left in her dev
library. `9be3fe8`, **deploy-verified:** accelerep.netlify.app serves
`index-BorndMdE.js`, the local gate build's hash.

**Batch 7, the commit this handoff rides in (state §0.77):** the History
tab reads the columns that exist (`completedDate`, `description`,
`author`, `accountId` / `contactId` / `contactIds` / task `contacts`)
and links rows by id, contacts get a derived last touch and recency tier,
"/ mo avg" divides by the real span, "Showing N of N" is the filtered
count, the account glance shows Segment instead of an invented status,
both PDF writers escape user text, territory coverage honours a deal's own
territory and reads industry from the accounts prop, forecast-vs-actual
says quota, the AI builder banner is honest, dead state gone. New
`src/utils/historyFeed.js`, 7 tests, 8 mutants. Observed locally as
Karen on the Beacon Metals account. `e2adc83`, **deploy-verified:**
accelerep.netlify.app serves `index-AW6mOo3m.js`, the local gate build's
hash.

**PROD SHIPPED (Jeff: "looks great - please ship to production"):**
`master` fast-forwarded `abb239a` → `1163eec`, 27 commits (§0.66–§0.77);
salespipelinetracker.com serves `index-Ki3OVxo2.js`, `pk_live_` inlined,
batch 6 and 7 strings present (state §0.77). `master` == `1163eec`; dev
is ahead only by the docs commits. **Jeff eyeballed the Reports tab on
prod: "eyeball work is all confirmed correct."**

**After the ship, the commit this handoff rides in (state §0.78; Jeff:
"fix them both please"):** a 401/403 is no longer reported as a database
outage — `dbStatusOf` in new `src/utils/fetchStatus.js` maps it to an
amber "sign in again" banner, all eight loaders report through it — and
the Settings → Security "Multi-factor auth" tile reads live Clerk
enrolment through AdminView's live-counts fetch instead of hand-typed
"Optional · not all enrolled · 3 months ago". 5 tests, 6 mutants. Not
browser-observed (Admin-only list; the pane is Karen). `71d68e3`,
**deploy-verified:** accelerep.netlify.app serves `index-CSnSB6MZ.js`, the
local gate build's hash. **PROD SHIPPED (Jeff: "ship to prod"):** `master`
fast-forwarded `1163eec` → `d63644f`; salespipelinetracker.com serves
`index-DrRd6S0A.js`, `pk_live_` inlined, the banner copy and "Managed in"
present (state §0.78). `master` == `dev` == `d63644f` at the time of this
commit; dev is ahead only by this docs commit. **Then (state §0.78, last
paragraph; Jeff: "please reword the policy settings dialogue"):** the MFA
panel's callout no longer tells the Admin to turn on Require MFA (on since
§0.65, unreadable by the app); 1 scan, 1 mutant. `b26c74c`,
**deploy-verified:** accelerep.netlify.app serves `index-ylwf4HZI.js`.

**Items 13 + 14, the commit this handoff rides in (state §0.79; Jeff: "do
13 and 14 together as well"):** every native `confirm()` / `prompt()`
under src/ replaced by the house `showConfirm` and a new `showPrompt`
dialog (promptModal in useModalState → App.jsx → ModalLayer); coaching
notes persisted — `coachingNotes` in both halves of settings.mjs and a
Manager may write that key alone. 6 tests, 6 mutants (+1 repointed),
79/79 integration. **Observed afterwards in the pane as Jeff/Admin:** the
house prompt saves a coaching note that survives a reload (PUT 200); the
saved-report × opens the Confirm dialog and Delete removes the card
(DELETE 200) — state §0.79's observed paragraph, which also records the
test note left in the dev org (Jeff: leave it) and the Enter key as
unobserved; Jeff then saved a second note through the house prompt on
the deployed dev site as Admin (a stale tab had shown the old browser
dialog first — hard refresh). CLAUDE.md gained a "Stale local FUNCTION" bullet for the
`.netlify/functions-serve` cache (Jeff: "update the md with the notes").
`147e5f4`, **deploy-verified:** accelerep.netlify.app serves
`index-B0b_2Pd3.js`, the local gate build's hash. **PROD SHIPPED (Jeff:
"ship to prod"):** `master` fast-forwarded `d63644f` → `d513b0e`, eight
commits; salespipelinetracker.com serves `index-C61hseh3.js`, `pk_live_`
inlined, the notice, prompt and confirm strings present (state §0.79).
`master` == `dev` == `d513b0e` at the time of this commit; dev is ahead
only by this docs commit.

**Three pushes, all CI green, all served bundles byte-matched to the local
gate build.** (1) `c435ee4`→`35c4f12`: the read side of the date contract
(`parseLocalDate` / `toLocalDay`), the CSV importer normalising Close and
Created Date, the isoLocal sweep (37 sites, pinned by a `src/` scan).
(2) `0b31842`→`80db3bf`: the ten unmounted components DELETED (4,160 lines),
the `documents` re-probe closed at 401, the Karen pass recorded, the
OpportunityModal date LABELS fixed (§3), and the Tasks list's **"No due
date" section** (Jeff: "do option 1"). (3) `d60fa10`: the profile panel
header wraps instead of overflowing. accelerep.netlify.app serves
`index-Bo6oAQ7_.js`; Jeff's own screenshots of `80db3bf` on dev: "landed
perfect" — the dateless tasks listed, the History label a real date.

**`master`/prod SHIPPED after the handoff was first written** (Jeff: "Lets
push these"): fast-forwarded `d5254b8` → `13f9ffe`, CI SUCCESS,
salespipelinetracker.com serving `index-NO9RJhjS.js` — `pk_live_` inlined,
every marker present, byte-size identical to dev's bundle.

## 2. The lesson: the hash said what reading did not

After two panel edits the build carried the same hash and byte-identical
content with the edit stashed and applied. A content hash cannot do that
unless the edited code is not in the bundle — and it was not: `TaskItem`,
"fixed as live" an hour earlier, rendered nowhere. Ten components were in
that state; all deleted. Guide §18b26: a bug is live only in a component that
is MOUNTED — grep for `<Name` outside its own file before writing "live".
Smaller: the scan written to pin the sweep found two sites the hand count
missed (45, not 43); "~20 other call sites" in a queue item was ~140.

## 3. The lesson Jeff's verification taught

Check (a) — a task with no due date on a deal, then the History tab — showed
the timeline SORTED and the label beside it reading **"Invalid Date"**. Batch
1 fixed the sort at the bottom of the timeline builder and not the `fmtDate`
helper twenty lines above it. Now every date-label helper in the modal reads
through `parseLocalDate`. Not yet in the guide, worth a bullet: when a fix
names a fallback chain, grep the FILE for every other reader of the same
value before calling it fixed. The same check found the dateless task
invisible on the Tasks tab (three buckets keyed on `dueDate`, no home for
none) — now the "No due date" section, oldest first.

## 4. Verified state at close (8 Sep, ninth session — after items 29, 30, 32 and 33)

Five gates green on 154 files · **606/606 unit** (36 new this session;
`slack-alerts.test.mjs` rewritten for seven types) · **330/330 mutations,
printed green baseline** (31 added this session) · build **2,438 kB JS**,
`index-B-DxPVK_.js`, guard OK, `dist/` cleared · **123/123 integration** (7
new this session) · **no pane browser pass** — the pane holds no session;
§0.92's follow-up OBSERVED by Jeff (second screenshot); §0.96's card OBSERVED
("slack card working as stated"); §0.99's Closed Won post OBSERVED (Jeff's
screenshot, 22:33 UTC); §0.94, §0.95, §0.97 NOT observed;
§0.98 PROVEN by the first heartbeat row · dev deploys observed serving
`index-BRrOppU7.js`, `index-DhQ2fFJ5.js`, `index-Dz4BAypy.js`,
`index-lFOC0BmK.js`, `index-LNt1yblV.js`, `index-B-DxPVK_.js`, and Netlify's
deploy records for §0.95 and §0.98 · **`master` == `5a306e3`, prod serving
`index-JJdhJmyd.js` (the TENTH ship, 22:36 UTC)**; before the ship dev was
ahead of master by 49 commits: the
eighth session's 26, then `8666737`, `08de43d`, `0163cd1`, `2b28a24`,
`b1c4769`, `e77d841`, `1c8ce78`, `b5da1a7`, `2049a4a`, `9fc662f`, `adc5780`,
`b5a9f5c`, `282c16c`, `7d4b406`, `5bca4fd`, `1e47b13`, `7979fde`, `e852d58`,
`fbaf8ae`, `ed41796`, `13815d9`, `4d22ba5` and `5a306e3` — all now on
`master`; after the ship dev is ahead only by the ship-record docs commit
(`0603ad5`) and this close · **one schema change:
`job_heartbeats`, additive, in BOTH databases** · **the Resend inbound
webhook targets PROD again; dev's endpoint is Disabled — Jeff's screenshot
after the ship** ·
**prod's `pipeline-alerts` is the fixed code since 22:36 UTC — its first run
is 23:00** · the working tree was clean at close.

## 5. Next — start here

**Ninth-session prep (read at the tenth), in order:**
- **Ritual first** (item 1), then `git log --oneline origin/master..dev` —
  expect forty-seven commits after `cf72f99` (§4 lists them). Anything else
  is unshipped code and a finding. **Then read Resend → Webhooks** — at the
  ninth session's close Jeff's screenshot showed the dev endpoint Enabled and
  the prod one Disabled; after the tenth ship Jeff flipped it back — his
  screenshot: prod Enabled, dev Disabled. Every email observation is now
  prod's, running the same code as dev; if that has changed, say so before
  trusting one (§18b31).
- **Look at #sales-alerts.** The first hourly `pipeline-alerts` run that can
  get past its first deal on dev was 22:00 UTC 8 Sep (state §0.95). A post
  there is the first alert in five months; none is not a finding by itself —
  it needs a qualifying deal (14 days silent, stuck past the stage average,
  a lapsed close date…) and the rep's preference on. To prove it on purpose:
  a deal of Karen's with no activity for 14 days, then the next top of the
  hour.
- **Jeff eyeballs §0.94 on deployed dev, as Admin:** Connected apps looks as
  before — no banner; Request on a row still records "Requested · <today>"
  (persists a refresh); Copy address still copies. Nothing new is visible
  unless a server refuses: the observable is the ABSENCE of a banner. Karen
  cannot reach Settings; the negatives are the source scan and four mutants.
- **DONE — the tenth ship (§1), and the Resend webhook flipped back to prod
  by Jeff (his screenshot). On prod, his to observe: the same eyeball lists as dev (§0.92–§0.99); the
  first prod alert since April can post at 23:00 UTC if a deal qualifies;
  prod's Workspace Health reads the shared heartbeat row (item 34).**
- **Item 34 — one batch, Jeff's call on timing:** `job_heartbeats` is keyed
  by job alone and the database is shared, so dev and prod write the SAME
  row; it says the job ran somewhere, not where. A prod job stalled while
  dev's runs would read ok on both tiles. Fix: a site column
  (`process.env.URL` or the site id) in the key, `job-status` filtering to
  its own site, the apply script additive (a new column plus a new primary
  key needs care — read §18c first). Found at the ship: `ok_count` 40 where
  dev alone had ticked 38 times.
- **Before shipping (kept for the next ship): nothing new to read** — the pre-ship Slack-webhook read
  is done (one webhook, dev's). **Ship §0.92–§0.99 when Jeff says so:**
  ancestor check, `git push origin dev:master`, poll salespipelinetracker.com
  for a NEW hash (not `index-B-DxPVK_.js` — the live key is inlined); the
  `job_heartbeats` table is already in the shared database (§18c), so prod's
  functions may land in any order and prod's first heartbeat (task-reminders)
  appears within a minute of the ship — a read-only SELECT proves it;
  `pk_live_` inlined, "Not saved — " / "Not requested — " / `title:"Open"`
  present, `send-slack` 401 unauthenticated; prod's `pipeline-alerts` needs
  Netlify's deploy record (functions-only proof: the deploy id from
  `get-projects`, then `get-deploy-for-site`), and its first run after the
  ship is the first prod alert since April. **At the same time flip the
  Resend webhook back** — enable prod, disable dev (§18b31). Until then prod
  logs no email and sends no alert.
- **DONE — item 33 is §0.99 (`fbaf8ae`), landed `index-B-DxPVK_.js`; the
  Closed Won post OBSERVED (Jeff's screenshot, 22:33 UTC: ZZFX Cinder New
  Logo, $210K, from Negotiation/Review, rep Karen, closed by Jeff — the
  first real Slack post ever). Still to see: a plain stage change, the
  unticked-box negative, any hourly signal. Jeff eyeballs, as Admin, with
  #sales-alerts open: move a deal's
  stage → a "➡️ Stage changed" post within seconds naming him as the mover,
  the rep and the ARR; move one to Closed Won → "🏆 Closed Won" with the
  ARR; Configure Slack → two groups, seven boxes, "7 of 7 alerts" on the
  card → untick "Deal stage changed" → Save → move another deal → nothing
  posts; tick it back. The five hourly signals now post on the org's
  selection regardless of any rep's own preferences — the 23:00 UTC run is
  the first on that rule. Not done: the bulk stage-move endpoint does not
  post (one post per deal would flood a channel; Jeff's call whether it
  should post one summary line).**
- **DONE — item 29 is §0.96 (`adc5780`; superseded in part by §0.99 — the
  rep's preference no longer gates the company's post), card OBSERVED by
  Jeff ("slack card working as stated"). The checkbox round trip is covered
  by the item 33 eyeball above.** Was:
  **Item 29 — Jeff's call (his question, 8 Sep: "How do I choose what gets
  posted to slack … Can we add an option that enables me to select what
  actions get posted"):** today the choice is per REP — each signal fires
  when that rep's own preference is on (avatar → Notifications, the "Pipeline
  health alerts" rows) — and every fired signal goes to the one webhook,
  gated only by `slackConfig.enabled`. Proposal: five checkboxes in the
  Configure Slack modal (deal silent, stuck, close lapsed, momentum, score
  drop) saved as `slackConfig.alerts` (default all on; the existing `settings`
  PUT stores `slackConfig` whole and validates the URL), read by
  `sendSlackToOrg(orgId, msg, alertType)`. One batch, org-scoped. No other
  connected app posts anything (calendars read, email logging is inbound, the
  audit stream chooses per destination already).
- **DONE — item 30 is §0.97 (`282c16c`), landed `index-lFOC0BmK.js`; NOT
  observed. Jeff eyeballs, as Admin: Connected apps → Google Calendar →
  "Connect my calendar" → cancel at Google's consent screen → the browser
  lands back on Connected apps with the Google card reading "Google Calendar
  was not connected — you cancelled at the provider's consent screen, or the
  provider refused."; connect for real → the same card reads "Google
  Calendar connected — your calendar is live." and Live; a refresh shows
  neither line. As Karen, from Home's Connect: the same two outcomes, landing
  in her profile panel's Calendar tab.** Was: **Item 30 — Jeff's call:** a
  failed calendar OAuth Connect lands on Home
  with no message — `calendar-oauth-callback.mjs` redirects to
  `?calconnect=error`, which nothing reads; `useCalendarState.calConnectResult`
  is set and read by nothing (state §0.94, last paragraph). Decide where the
  browser should land (Connected apps, with the provider in the redirect),
  then one batch across the callback, App.jsx and the panel.
- **Item 31 — one line per call site, Jeff's call:** the four manager copies
  in `pipeline-alerts.mjs` read `manager.profile || {}`, not the top-level
  prefs the profile panel saves flat on the row (state §0.95); a manager who
  turned "Manager escalation alerts" off may still get them.
- **DONE — item 32 is §0.98 (`5bca4fd`), landed `index-LNt1yblV.js`, PROVEN
  by the first heartbeat row (task-reminders, ok, 22:02 UTC, read back).
  Jeff eyeballs after 23:00 UTC, as Admin: Settings → Workspace Health has
  one more check, "Scheduled jobs running" — until 06:00 UTC it will instead
  read "Scheduled jobs: Lead scoring has not run" (its first daily tick), which
  is correct; Connected apps → Slack reads "Alerts job: Last ran Nm ago · ok".
  If "Pipeline alerts error" appears there, the row's `last_error` is the
  first thing to read (a read-only SELECT of `job_heartbeats`).** Was:
  **Item 32 — design first:** a last-success stamp per scheduled job
  (`pipeline-alerts`, `digest`, `task-reminders`, `score-leads-batch`) that
  the Settings health tile can read — five months of hourly 500s were
  visible nowhere the app shows (guide §18b33). Table or `settings.extra`
  key, Jeff's call; org-neutral (the jobs are site-wide).
- **Carried, unchanged:** item 27 (From/To/Cc + Message-ID on email rows),
  item 28 (a creator-owned contact shows a blank Assigned Rep), the Connected
  apps non-Admin dead branches, `INTEGRATION_REQUESTS_TO` unset, the
  `check-tdz` blind spot for lowercase helpers in function files (§18b33 —
  a test per helper for now).

**Eighth-session prep, in order:**
- **Ritual first** (item 1), then `git log --oneline origin/master..dev` —
  expect twenty-six commits after `cf72f99` (§4 lists them). Anything else is
  unshipped code and a finding. **Then read Resend → Webhooks:** the dev
  endpoint should be Enabled and the prod one Disabled (8 Sep, Jeff); if that
  has changed, say so before trusting any email observation (§18b31).
  **Ninth session, Jeff: "confirmed."**
- **DONE by screenshot (ninth session, 8 Sep) — §0.92 OBSERVED: a scheme-less
  URL refused on Save, the card still Connected. It found the refusal in the
  panel banner BEHIND the modal — fixed in `0163cd1` (guide §18b32), landed
  `index-BRrOppU7.js`. Jeff re-runs the same Save and reads "Not saved —
  Webhook URL must start with https:// (…)" INSIDE the dialog; with
  `https://example.com/hook` the message is the "must be a Slack Incoming
  Webhook" one. DONE — his second screenshot: the message inside the dialog,
  no banner (state §0.92).** Was:
  **Jeff eyeballs §0.92 on deployed dev** (NOT yet observed — the observable
  is a 403/400 behind a session): as Karen there is no Settings tab (by
  design); as Admin, Settings → Integrations → Connected apps → Configure →
  paste `https://example.com/hook` → Send test message → the modal reads
  "Webhook URL must be a Slack Incoming Webhook
  (https://hooks.slack.com/services/…)"; Save configuration with it → the same
  message, nothing saved (reopen: the real URL is still there); the real
  webhook still tests (a post in #sales-alerts) and saves.
- **DONE — steps 3, 7 and 9 PROVEN on dev (8 Sep):** Escape leaves the rail
  open; "#14 Test Email" stored with its line breaks and "Attachments:
  Lumen.pdf", seen in the viewer. It took a day because the Resend webhook
  was delivering to prod (§1, day two). Rows stored before 8 Sep 19:26 UTC
  stay flat — nothing rewrites old rows.
- **DONE — §0.93 OBSERVED ("works"), then reported step by step: 1, 2, 4, 5,
  8, 10, 12–14 Pass; 3, 7, 9 fixed above; 6 is item 28; 11 not applicable.**
  The fourteen steps, kept as the record
  of what a full check covers: (A, as Karen) Contacts → Jeff Russelltest →
  Activity — rows read "Test email" bold over "Test email for logging"; click
  → the viewer (Email · Sun, Sep 7, 2026 · Karen Russell, the subject, "Jeff
  Russelltest", the body, Close, Edit); Escape closes; click outside closes;
  Edit opens the editor filled in. (B, as Admin) the same, Edit present. (C) a
  real multi-line email through her personal address → the row shows the
  subject bold and two lines only; the viewer shows every line and the blank
  one. (D) an account's and a task's Activity History; a deal's Activity list
  and History tab; the × on a History row deletes without opening. (E) + Log
  Activity, + Add Task and the Reports timelines unchanged.
- **DONE (ninth session, 8 Sep, `8666737`): five settings rows in the shared
  app database, ONE stored webhook — the dev org's, `hooks.slack.com`,
  `valid=true`, `#sales-alerts`, enabled — the other four orgs store none;
  nothing to raise (state §0.92, last paragraph).** Was: **Before shipping:
  read prod's stored Slack webhook.** After §0.92 a stored
  non-Slack webhook fails silently on every alert while the card says Live.
  Dev's is Slack (read back). Prod: one read-only SELECT of
  `extra->'slackConfig'->>'webhookUrl'` per org on the app database; anything
  not `https://hooks.slack.com/services/…` is a finding to raise with Jeff
  before `git push origin dev:master`.
- **Then ship §0.92 + §0.93 + the follow-up when Jeff says so** — ancestor
  check, `git push origin dev:master`, poll salespipelinetracker.com for a NEW
  hash (not `index-Bz_vDa_T.js` — the live key is inlined), `pk_live_` inlined,
  `setViewingActivity` and `title:"Open"` present; `send-slack` 401
  unauthenticated. Prod has not had a functions-only landing before: the
  Netlify deploy record is the proof for §0.92 (site `099ef621…`, the
  `netlify-deploy-services-reader` MCP with the deploy id from
  `get-projects`). **At the same time, flip the Resend webhook back:** enable
  the prod endpoint, disable the dev one — one target (§18b31). Until then
  prod logs no email. Prod's `RESEND_INBOUND_SECRET` is unchanged (its
  endpoint keeps its own secret).
- **Option 3 — item 27, Jeff's call after he has read a real email in the
  viewer:** store From/To/Cc and the Message-ID on the row (an additive
  nullable jsonb column on `activities`, both databases first, §18c), raise or
  drop the 4,000-character cap, and decide on HTML (sanitised) vs the plain
  text stored now. Not started.
- **Item 28 — Jeff's call before code (his step 6):** a contact created
  without naming a rep is OWNED by its creator (`stampOwnerId`) but its
  "Assigned Rep" reads blank, so the Contacts tab's remembered "Mine" scope
  hides it from an Admin who reads it as unassigned. Either show the owner's
  roster name when `assignedRep` is blank, or fill `assignedRep` with the
  caller at creation; the same question exists on every Tier 1 table. A
  product call, then one batch.
- **The five pipeline alerts have not fired against dev's webhook.**
  `pipeline-alerts` runs hourly (`0 * * * *`, Netlify's schedule list); the
  first qualifying deal will post to #sales-alerts on its own. Worth one look
  at the channel next session.
- **§0.91's negative visibility check** needs a second User in the dev org;
  add a throwaway one if Jeff wants it seen in the browser (the row-level
  rule is covered by `email-inbound.itest.mjs`).
- **Small, Jeff's call:** the Connected apps panel's non-Admin branches ("An
  Admin configures Slack", a personal-only calendar Connect) are unreachable
  — dead code to drop in a cleanup batch. `INTEGRATION_REQUESTS_TO` is still
  unset as far as can be seen from here (a request is recorded and audited
  but not mailed).
- **DONE (ninth session, 8 Sep, `8666737`) — and the header itself had NOT
  been refreshed at the third close: it carried the first close's counts.**
  Was: **The state doc's per-batch summary lines under its header** (lines 4–8)
  still describe §0.84–§0.88; the header itself was refreshed at this close.
  Rewriting the five lines is a docs-only chore.

**Previous session's prep (seventh session), kept as it stood:**
- **Ritual first** (item 1), then `git log --oneline origin/master..dev` —
  expect ONLY the ninth-ship record docs commit after `cf72f99`. Anything
  else is unshipped code and a finding. (§0.89 OBSERVED — Jeff: "verified";
  §0.90 OBSERVED by screenshot; §0.91 OBSERVED in the eighth session — all
  three shipped.)
- **DONE — Jeff (eighth session, 7 Sep, deployed dev): "karen and my cc
  addresses are different", then "email sent from karen was logged against
  the contact"** — and the row read back from the database is owned by
  Karen with author "Karen Russell" on the contact Jeff Russelltest (state
  §0.91, landing paragraph). Jeff: "karen used the org address" — the
  From attribution is proven; then "sent a new one as Karen and used cc" —
  her PERSONAL address, "Test email #2" at 17:08 UTC, owned by Karen, the
  row read back: **both paths proven.** Karen sees her own two on the
  contact (screenshot as Karen, taken between the sends). Not seen: the
  activity as Jeff. The negative check ("I did not see if anyone else can
  see the email") cannot run as the dev org is rostered — Admin, Karen,
  two Technicians, no second rep; add a throwaway User if Jeff wants it
  proven in the browser. CC works
  the same as BCC — `email-inbound` unions `to`, `cc` and `bcc` before
  looking for a dropbox address. Was: avatar → the new "Email logging"
  tab → a `me-usr_…@inbound.salespipelinetracker.com` address with Copy, as
  Jeff and as Karen (two different addresses). **The real proof is a real
  email:** as Karen, send one to a contact of hers with her personal address
  in BCC → the Email activity appears on that contact for Karen and for Jeff,
  owned by Karen, author "Karen Russell"; another rep does not see it. Then
  the ORG address (Settings → Integrations → Connected apps → Email logging)
  from Karen's roster email → owned by Karen too (From attribution); from an
  address not on the roster → unowned, visible to everyone. If the address
  tab reads "Email logging is not available on this site", the site lacks
  `BCC_SECRET` / `INBOUND_DOMAIN` — the same variables the org card needs,
  which the screenshot showed configured on dev.
- **PARTLY DONE — Jeff's screenshot (7 Sep, per git and state §0.90 — this
  bullet had said 3 Sep) shows the panel on deployed dev as designed (state
  §0.90's OBSERVED paragraph); eighth session (7 Sep): Gmail Request →
  "Requested · 9/7/2026", persists a hard refresh (Jeff: "request to link
  app persists after hard refresh"), "1 requested by this workspace"; the
  settings record and the `integration.requested` audit row read back,
  16:47:55 UTC, Jeff Russell; whether it was mailed depends on
  `INTEGRATION_REQUESTS_TO`, Jeff's; Configure Slack → Send test message →
  Save DONE against a Slack workspace Jeff created for it — the test
  message in #sales-alerts, the config read back (state §0.89, last
  paragraph); the "Karen path" struck — Jeff: "a user does not have access
  to settings", "nor should they", and `App.jsx` renders the Settings tab
  and content only when `isAdmin`. NOTHING of §0.90 remains unseen; this
  bullet is DONE. Was: click
  Request on a row → "Requested · <today>", refresh — it stays; Configure
  Slack → Send test message → Save; the Karen path. Was the full list:
  Settings → Integrations → Connected apps. Four cards under
  Integrations — Slack, Google Calendar, Microsoft 365 Calendar, Email
  logging — and ten rows under Request an integration; no Morgan Reyes
  anywhere, nothing says Connect except the calendars' own "Connect my
  calendar" / "Connect company calendar". Google Calendar: those two links
  if the site has Google credentials, or "Not available on this site" (the
  Company Calendar panel's existing Connect would 503 in that case too — same
  truth, now said). Microsoft 365 Calendar: the same, per the Microsoft
  credentials. Email logging: the BCC address with Copy, or "Not available
  on this site" if the inbound domain is unset. Click Request on any row →
  "Requested · <today>", refresh — it stays, the button is gone for that
  app; Settings → Security → Audit log shows `integration.requested`. ~~**As
  Karen:** same panel, no Slack Configure (Admin only), her own calendar
  Connect, no company Connect, Request works.~~ (Wrong — a User cannot open
  Settings at all. Left struck so the next reader does not re-plan it.)
- **Two env vars are Jeff's, not verifiable from here:** set
  `INTEGRATION_REQUESTS_TO` in Netlify (dev and prod) to the address that
  should receive requests — until then a request is recorded and audited but
  not mailed (`notified:false`); and whether `GOOGLE_CLIENT_ID/SECRET` and
  `MICROSOFT_CLIENT_ID/SECRET` are set on each site decides what the two
  calendar cards offer (the Netlify reader exposes no env).
- **DONE — shipped (Jeff: "ship prod"), the ninth ship, §1.** Was: ship item
  22 + all three seventh-session batches when Jeff says so. Prod carried the
  Slack crash from 11 May to 7 Sep; `cf72f99` is the first prod build
  without it. **On prod now, Jeff's to observe:** the same three eyeball
  lists as dev (§0.89 Slack modal, §0.90 panel, §0.91 personal address) —
  prod's own env decides what the calendar and email-logging cards offer.
- **Item 24 is DONE (§0.90, option A).** What it did NOT do, by Jeff's
  choice: build any third-party integration. Option B — naming the first
  real one — is open; Zapier or a generic signed webhook-out reaches the
  most customers for the least work (the audit stream already proved the
  signed-delivery pattern). It needs Jeff's developer account with the
  provider before code.
- **Item 25 (Jeff's call):** `send-slack`'s handler posts a test to ANY
  `webhookUrl` in the body behind `verifyAuth` alone — no role gate, no host
  check; the audit-stream endpoint refuses literal private hosts and is
  Admin-only. One line each.
- **Ritual first** (item 1), then `git log --oneline origin/master..dev` —
  expect `9782e97`, `6db6ea8` and the docs commits around them, plus
  `6af58fb` (the seventh ship's record). **Items 18 + 19 are OBSERVED (Jeff:
  "verified changes. they are working") and UNSHIPPED; item 20 is OBSERVED
  (Jeff: "confirmed on karen under performance") and UNSHIPPED; item 21's
  three reductions (`6ec3c05`) and audit streaming (`2e7a219`) are
  OBSERVED (Jeff: "Looks correct")** — and ALL of it is SHIPPED (the
  eighth ship, `ad76a38`). **Item 22 (`539eaa1`) is OBSERVED (Jeff: "confirmed
  that settings cards are correct and all badges are gone") and UNSHIPPED**
  — that is the state, not a finding. **Everything on dev has been seen.** Expect `git log --oneline
  origin/master..dev` to list the ship-record docs commit, `539eaa1` and its
  two docs commits; anything else is unshipped code and a finding.
- **DONE — Jeff confirmed item 22 on deployed dev.** Was the eyeball list,
  kept as the record of what "correct" covers: Settings → All. No
  card wears NEW. Custom fields and Company calendar no longer assert "18"
  and "12" for an org that set neither; KPI thresholds, Customer types,
  Account segments and Industries read "App defaults" until the org saves
  its own; Fiscal year reads "FY starts October 1" (UKG) — or nothing for
  an org that never set it; Audit log reads "N recent events" (or "500+");
  Company profile shows the company's name. A count that appears is one
  the org's own panel saved.
- **Then ship item 22 when Jeff says so** — `git push origin dev:master`
  after the ancestor check, then poll salespipelinetracker.com for the
  bundle hash; `pk_live_` inlined.
- **DONE — Jeff: "Looks correct."** Was the walkthrough, kept as the
  record of what a full check covers (his words do not say he walked a
  destination through to a delivered row): Settings →
  Security → Audit log. The badge is absent until a destination exists;
  the subtitle says the last 500 events are loaded; no Manage alerts, no IP
  column. "+ Add destination" → a receiver he controls (a request-bin
  service with an https URL works; http:// and private hosts are refused
  with the reason) → the secret appears ONCE with Copy. "Send test event"
  → the row shows "Test delivered · 200" (or the receiver's real status)
  and Last delivered fills in. Then do anything audited (save a user, add
  a coaching note) and the receiver gets a signed `type:"audit"` POST —
  `X-Accelerep-Signature` is HMAC-SHA256 of the body with the secret.
  Pause → nothing arrives; Resume → the resume's own audit row arrives
  first. Rotate secret → a new secret once; Remove → confirm dialog.
  **If Add answers "Key encryption is not available"**, the site has no
  `SETTINGS_ENCRYPTION_KEY` — the same variable the BYOK save needs; set it
  in Netlify → Site → Environment variables (the crypto.mjs header says how
  to generate one). Not verifiable from here.
- **DONE — Jeff: "Looks correct."** Was the eyeball list, kept as the record
  of what "correct" covers: Settings →
  Security → Single sign-on (a Managed in Clerk chip, an info callout with
  two links, one card, no form); → Session & password (the chip, the
  callout, "What Accelerep adds on top", "Not available in Accelerep");
  Settings → Data → Import → each of the four cards opens the real
  importer over the Settings page (Leads only while leads are on). The
  Security list's Session card reads "Session & password · Managed in
  Clerk".
- **DONE — audit streaming is built (§0.87, `1ac3d64` design then
  `2e7a219`).** One deviation from the queued sketch, decided while
  designing and recorded in §0.87: destinations live in their own table,
  not `settings.extra` — a secret and delivery state must not round-trip
  through the client's settings save. Carried from the build: **the site's
  `SETTINGS_ENCRYPTION_KEY` is unverified from here** (the endpoint answers
  503 without it); **an audited write now waits for the slowest destination,
  at most 4 s** — if that ever hurts, a Netlify background function is the
  next step, not a queue; a destination whose hostname RESOLVES to a private
  address is not refused (only literal private hosts are); and
  `src/Tabs/settings/integrations/ConnectedAppsDetail.jsx` still carries a `morgan@accelerep.com` mock (seen in the
  served bundle after §0.87 — item 22 territory).
- **DONE — item 22 (§0.88).** Was: Jeff's call before code (the hand-typed
  card counts and the 14 remaining NEW badges; the audit card's "Last 30
  days · 2,418 events" is typed too). Jeff: "lets do 22" — and the fix
  needed no design call: a count comes from the panel's key or is nothing.
- **(Superseded — see the corrected item 24 above and state §0.89.)** Was:
  item 24 as the sixth session recorded it — six apps "marked connected and
  typed traffic" (never rendered) and Industries' "typed account counts"
  (never rendered; the card computes them). The typed counts are gone; the
  Slack half turned out to be a crash, now fixed.
- **DONE — Jeff confirmed item 20 on deployed dev with Karen sliced.** Was
  the eyeball list, kept as the record of what "confirmed" covers: Reports → Performance,
  Grouped by → Rep, pick Karen: below the one-row leaderboard, "Won deals —
  Karen Russell" and "Lost deals — Karen Russell" for the selected Period,
  each with a Total row and the win rate in the won header; change Period
  and the lists and the leaderboard's Closed move together; clear the slice
  and the panels are gone.
- **DONE — Jeff verified on deployed dev.** Was the eyeball list, kept as
  the record of what "working" covers: **as Admin, Sales Manager → Forecast:**
  type a Commit, refresh — it stays; the Team card / Today tab read the
  same number; click a Best case — type one, or leave it and see "est.";
  **Export CSV** downloads `forecast-2026-Q4.csv` with a Team total row;
  "Coach →" opens the note dialog with that rep ticked; Team → "Pipeline"
  opens the Pipeline tab with the Viewing bar reading "Rep: <name>" and a
  "✕ Clear"; Today → "Schedule 1:1" opens the task rail on "1:1 with
  <name>". **As Karen, Home:** the quota card is labelled "Q4 FY2026 Quota"
  with her Q4 figure ($350K on her quarterly plan), closed = this quarter's
  wins, the gold bar = commit deals forecast to close this quarter.
  Escape in a call cell keeps the old value (a ref flag skips the blur's
  save) — worth one press. The Enter key in the cell: not observed.
- **DONE — shipped (Jeff: "ship prod"), §1.** Was: ship to prod when Jeff
  says so — `git push origin dev:master` after the ancestor check, then
  poll salespipelinetracker.com for the bundle hash; `pk_live_` inlined.
- **Then items 21 and 22** — Jeff's calls before code (the four mockup
  Security / Data panels; the hand-typed card counts and the NEW badges).
- **Carried from this session's read (state §0.84, last paragraph):**
  `SubTabs`, `TeamTab` and `AuditTab` are defined inside
  `SalesManagerTab` and rendered as JSX — churn-only today per
  `check:inline` (no input, hook or ref inside them), the forbidden
  pattern nonetheless; hoisting them is a mechanical batch (data as props:
  `repStats`, `teamQuota`…, the setters). And users PUT lets a Manager
  write any org user's profile, forecast calls included — the existing
  quota behaviour, not widened, noted.
- **Karen is a User**; the dev org's coaching notes are all in the table.
- **(Historic, fourth session):** `git log --oneline origin/master..dev` —
  expect only docs commits after `d513b0e`; anything else is unshipped code
  and a finding.
- **Karen's role: back to User** (Jeff, 2 Sep close: "already done"). She
  was a Manager only to observe the coaching-note Manager path.
- **Item 16 DONE (3 Sep, `1e15e45` + `327ce8f`, state §0.80):** header on
  the fiscal quarter; totals quarter-to-date; Administration board
  FY-to-date; three inert header buttons gone. **OBSERVED by Jeff as
  Admin on deployed dev** — header "Q4 FY2026 · 4 weeks remaining",
  Forecast good, Administration "FY attainment" 9.5% for Karen against
  $1,000,000 while Today reads 27% of her $350K Q4 — the same wins, two
  windows, consistent. Unshipped; prod at `d513b0e`.
- **Item 15 DONE (3 Sep, `59212ec`, state §0.81):** footers gone, statuses
  and attention computed, health tile counts only readable checks, 16
  panel headers' typed "Last edited" removed. **OBSERVED by Jeff as Admin
  on deployed dev:** all four checks good. Unshipped; prod at `d513b0e`.
- **Items 21 and 22 are new** (found reading for 15): four Security / Data
  panels are mockups in depth; the remaining hand-typed card counts and the
  16 never-expiring NEW badges. Both are Jeff's calls before code.
- **Item 17 DONE (3 Sep, `aef4b4b`, state §0.82)** — coaching notes in
  their own table, addressed to people or a team. **The DDL is already in
  BOTH databases** (test and the shared app database), so the code may
  deploy in any order (§18c satisfied). **Jeff eyeballs on deployed dev:**
  as Admin, Sales Manager → Team → "+ Add coaching note" opens the dialog
  and a note to Karen lists with her name; as Karen, Home shows "Notes from
  your manager" unread, the bell counts it, "Mark read" clears both; the
  "Import 2 legacy notes" button moves the two test notes and disappears.
  **OBSERVED by Jeff (3 Sep): "all cleared and worked as planned."**
  **SHIPPED TO PROD (`bdb0f3c`, `index-CIR6aj2A.js`); the prod legacy
  import is DONE (Jeff, 3 Sep).**
- **Items 18 and 19 are new** (found reading for 16): the Forecast ledger's
  Commit is never stored; "Coach →" is inert; Home's quota card is annual
  ÷ 4; the tab has no export at all.
- **Then item 15** (catalogue footers, Workspace Health constants): the
  same honesty class as §0.78; `liveCounts` already carries the MFA
  numbers.
- **Item 17 is a design first**, not code: its own table (guide §18c
  ordering), the two visibility decisions recorded in the item, and the
  team-join date question, answered by Jeff before the schema is written.
- Two test coaching notes sit in the dev org's list by Jeff's choice; the
  saved-reports library is empty.

1. **Ritual:** this file, `check:handoff`, `git status`. Expect `dev` and
   `origin/dev` to agree at the handoff commit.
2. **DONE — prod ran `13f9ffe` from the morning ship (now `abb239a`, §1),
   and Jeff observed the profile panel fit on
   the Dispatch Demo Group account** ("the dispatch demo fits"). User-visible on prod: Tasks calendar keys, quarter tabs and report
   cutoffs follow the user's clock; imported US-format close dates become
   real dates; dateless tasks appear in "No due date"; the deal timeline
   labels never read "Invalid Date"; the profile panel fits a two-org
   account with a long org name (Jeff's original prod report).
3. **OBSERVED (2 Sep, after 7pm Central):** coaching notes saved through
   the house prompt by Jeff and by Karen both carried Sep 2 while UTC was
   3 Sep (state §0.79). Was: **Still unobserved:** as Admin after 7pm Central, a coaching note carries
   today's date (Jeff: "I will have to check the time tonight"). **Half
   observed after 7pm on 2 Sep:** Jeff's Home header read "Good evening,
   Jeff. Wednesday, Sep 2 · Q4 · Week 10" while UTC was already 3 Sep —
   the header's day is local. The note itself is the Sales Manager tab's
   "+ Add coaching note" button, which stamps `date: todayLocal()`
   (SalesManagerTab.jsx ~line 838) — the same local-day helper, so the
   same result is expected; not yet observed. **Found reading that code,
   carried as item 14:** the note is added through the browser's native
   `prompt()` and kept only in `setSettings` — no `dbFetch` follows and
   `settings.mjs` has no `coachingNotes` key in GET or PUT, so a coaching
   note vanishes on refresh (persistent-data rule; guide §18b1). **The CSV
   half is OBSERVED:** Jeff imported `zztest-close-dates.csv`; a read-only
   SELECT shows `9/15/2026` stored as `2026-09-15` and the ISO and
   Excel-datetime rows as expected (state §0.63). The three ZZTest Close
   deals sit in the Development instance's org named "UKG" (not the prod
   UKG — two orgs share the name, one per instance; state §0.65) and are
   still open, Jeff's to delete. The four older ZZTest deals he marked
   Closed Lost are in "Accelerep Test" and saved correctly.
4. **DONE (fourth session, 1 Sep evening):** the guide bullet owed from §3 — "grep
   the FILE for every other reader of the value" — is now the closing bullet
   of §18b26; state doc §0.62 no longer says "not yet written".
5. **DONE (fourth session, Jeff: "refuse option"):** an unrecognisable date
   cell now refuses its row at Preview with the cell named; and the engine's
   year-2001 default for a yearless cell is gated (state §0.64).
6. **DONE (fourth session):** the nine stale App.jsx default imports are
   removed (state §0.63).
7. **DONE — the pending-session bypass is FIXED (state §0.65, guide
   §18b27)** and observed on Development with Require ON. Left for Jeff:
   (a) DONE while committing — Jeff enrolled Karen's authenticator; her MFA
   dot is green ● (1/4), **the known-ON state sighted at last**; the pane
   needs a fresh Karen sign-in (with her second factor) to be useful again.
   (b) DONE — Jeff enrolled SMS MFA through Clerk's task card on the
   deployed dev site and eyeballed the rewritten panel as Admin: 2/4
   enrolled, real per-role rows, no Enforce modal, no Send reminders, no
   factor tiles (state §0.65). The stale `#/tasks/setup-mfa` hash Clerk
   leaves in the URL is inert; noted. (c) DONE — state §0.78: the
   `catalogue.js` MFA entry's hand-typed "Optional · not all enrolled" /
   "3 months ago" is gone; the card reads live Clerk enrolment. (d) DONE — shipped, and Require is ON for Production (Jeff: "worked in
   production"). (e) Integration suites
   mock `verifyAuth`, so the `sts` refusal is covered by unit + mutation
   only; the live 401 was observed in the pane AND on the deployed dev site
   (Jeff's un-refreshed Admin tab showed the server message verbatim).
   (f) **Carried:** `checkOk` in App.jsx sets `dbOffline` on any non-ok
   response, so that 401 rendered as "Database connection lost" — an auth
   refusal reported as a database outage (state §0.65, last paragraph).
   **Jeff, after the prod ship: "401 dbase lost is no longer showing."**
   Expected, not fixed: the client gate (§18b27) stops the app calling the
   API while a session is pending, so the 401 that lit the banner no
   longer happens; `checkOk` (App.jsx line ~399) is unchanged and still
   maps ANY non-ok status to `dbOffline`, so an expired session or a
   revoked user would light it again. **DONE (Jeff: "fix them both
   please") — state §0.78:** `dbStatusOf` maps 401/403 to an amber
   sign-in banner; the red outage banner is for everything else.
8. **DONE (Jeff: "why we lost is important…"):** the Win / loss report
   reads `lostCategory` and the exit stage's `prevStage` (state §0.66).
   **Jeff eyeballs after the deploy, as Admin, Reports → Win / loss
   analysis:** expected Timing 4 · 80%, Competitor 1 · 20%, exit-stage rows
   Qualification 4 and Proposal 1. **Carried from it:** the Performance
   tab's hardcoded stage list (ReportsTab line 78) and the funnel's fallback
   list are not the app's stages.
9. **DONE (Jeff: "activities logged stays the same as I use the filter"):**
   the Activity report honours the Rep / Team / Territory slice (state
   §0.67). **Jeff eyeballs after the deploy, as Admin, Reports → Activity:**
   Total activities must change as the rep changes and "All" restore it.
10. **THE REPORTS AUDIT — nothing fixed yet, Jeff's order to set (state
   §0.68, the triage list).** Six read-only passes over ReportsTab found,
   verified from source: fiscal-period math a year off under the default
   January start and a comparison helper on the opposite convention;
   `comparedOpps` unsliced; a literal $175,000 quota; a forecast-accuracy
   chart that is always 100%; fabricated stage lists that bucket real
   stages as "Prospecting"; the leads tab never sliced; two crashes
   (`products.map` on a text column, toolbar buttons above the null
   guard); a contacts array written into a text column; the Actions report
   storing a Response as data; six "Save as my report" buttons with no
   handler; a report-builder preview made of constants. Recommended order
   is in §0.68. Do not start on it without reading §0.68 first. **Batch 1
   (period + comparison, tier 1 items 1–2) is DONE — state §0.69. Batch 2
   (the crashes, the contacts array write, the Actions fetch, tier 1 items
   13–14) is DONE — state §0.70. Batch 3 (scoping) is DONE — state
   §0.71. Batch 4a (the Pipeline & Forecast constants + the Performance
   quota basis, items 3, 4, 7, 8, and item 6's nextStep) is DONE — state
   §0.72. Batch 4b (the last constants, item 9, the "+3%", item 12, the
   orphan captions) is DONE — state §0.73. Batch 5a (stage lists from the
   org's settings, item 5) is DONE — state §0.74. Batch 5b (close day
   for cycle time and quarters; `wonDate` written) is DONE — state
   §0.75. Batch 6 (dead controls wired or removed, the print path gone)
   is DONE — state §0.76. Batch 7 (the History tab on real columns, PDF
   escaping, honest labels) is DONE — state §0.77; §0.77 lists what was
   left by design. SHIPPED to prod as `1163eec` (§1).** The §0.68 list is
   closed; Jeff eyeballed the Reports tab on prod and confirmed it. The
   401 banner (item 7f) and the MFA card (item 7c) are DONE — state §0.78.
   SHIPPED to prod as `d63644f` (§1); Jeff's screenshot of the Security
   list confirms the tile ("2/4 enrolled · 50%", "Needs attention",
   "Managed in Clerk"). Items 13 and 14 are DONE and observed as Admin —
   state §0.79. SHIPPED to prod as `d513b0e` (§1). The Manager path of
   the coaching note is OBSERVED: Jeff promoted Karen to Manager, signed
   in as her, saved a note, hard-refreshed — "it all works" (state §0.79).
   Karen was set back to User at the session close (Jeff: "already done"). Next: items 15 and 16;
   the coaching-note half of item 3 is now observed too (a note saved
   after 7pm Central carried Sep 2).
11. Smaller carried: the
   opportunities Manager `managedReps` branch stays name-based by intent;
   picker-format replication as surfaces get touched.
12. Session quirks: `netlify dev` caches compiled functions under
   `.netlify/functions-serve`; after many reloads one served a stale
   CommonJS copy ("module is not defined in ES module scope", 500 on every
   call) — stop the server, `rm -rf .netlify/functions-serve`, restart
   (state §0.79). Inline `node -e` and Bash heredocs mangled `\\` in
   regexes — write scripts with the Write tool and run the file; a
   scratchpad script cannot resolve the repo's packages — copy into the repo
   root, run, delete (tree checked clean after); `mutate-import` runs alone
   and never while the Browser pane is being read (it rewrites source under
   HMR); the pane is ~620px wide and the deal modal's tab row is off-canvas
   there — Jeff verifies modal tabs on his own screen. Line endings: the
   worktree is CRLF only because `core.autocrlf=true` — every index blob is
   LF (`git ls-files --eol`), App.jsx included. An edit script must match
   the worktree's CRLF and git normalises on commit; MSYS grep strips CR on
   output, so count endings with Node. Two traps cost this session three
   round trips: a replacement string holding dollar-quote made
   String.replace splice the rest of the file in after the match (use a
   function replacer), and a heredoc turned a doubled backslash into a bare
   CR byte that made git treat the handoff as `-text` and diff it whole.
13. **DONE — state §0.79 (Jeff: "do 13 and 14 together as well"), the
   whole sweep.** Was: **Carried (Jeff, after the prod eyeball): the saved-report delete asks
   through the browser's native `confirm('Delete this report?')`**
   (`ReportsTab.jsx`, the saved-card ✕ handler) — "just gives the windows
   confirmation, not an application look and feel process". The app has a
   house confirmation modal already: `confirmModal` / `setConfirmModal` in
   `useModalState.js`, rendered by `ModalLayer.jsx` with the ⚠ tile and
   `danger` styling, reached through `showConfirm` in the app context.
   Route the report delete through it; ReportsTab reads the context
   already. The same native `confirm()` survives in DocumentRail.jsx,
   DocumentsTab.jsx, EditBrandModal.jsx and PriceBookDetail.jsx (three) —
   same fix, same batch, if Jeff wants the sweep. Jeff deleted the ZZTest
   deals and the two test saved reports himself after the prod eyeball.
14. **DONE — state §0.79.** Was: **Carried (found during item 3): coaching notes do not persist.**
   SalesManagerTab's "+ Add coaching note" takes the text through a native
   `prompt()` and writes `settings.coachingNotes` with `setSettings` only;
   no `dbFetch` follows, and `settings.mjs` neither returns nor merges a
   `coachingNotes` key, so the note is gone on refresh and never reaches
   another Manager. Fix: a house modal for the text (the same
   `confirmModal`-class dialog as item 13, or a small form), then save
   through `settings` PUT with `coachingNotes` added to BOTH the GET
   response and the read-then-merge (CLAUDE.md's `settings.extra` rule),
   org-scoped like every other settings key.
15. **DONE — state §0.81, commit `59212ec` (3 Sep; Jeff: "lets proceed
   with item 15").** `src/utils/settingsCards.js` (pure): `cardStateOf`
   (the card component's enrichment block moved out verbatim + three
   rules: webhooks status/attention from live counts; sso and apps claim
   nothing; ok-with-null-detail → 'none'), `healthChecksOf` (only what
   can be read: MFA fully enrolled / Webhooks / Backups once their fetch
   answered, plus pipeline, team assignment, quote branding — SSO and
   Session policy dropped), `healthSummaryOf` (a sentence naming what
   failed). Catalogue: 48 footer pairs and two `attention:true` removed,
   six no-data cards `status:'none'`. Two shared headers render "Last
   edited" only when both values are real; 16 panels' typed values and
   SsoDetail's "Morgan" removed. 13 tests + 8 mutations (212/212).
   **OBSERVED by Jeff as Admin on deployed dev (3 Sep): footers, health
   tile, Webhooks chip, Pipelines header — all good.** Was: **Carried (Jeff's Security-list screenshot, state §0.78 last
   paragraph): the rest of the Settings catalogue's invented text.** 46
   cards carry hand-typed footers — `updatedAt:'2 months ago'` / `'just
   now'` / `'3 weeks ago'` and an `updatedBy` that never changes — and
   the Workspace Health tile's "N of 8 checks passing" is built from
   `healthChecks` in AdminView.jsx (~line 673) with four constants: "MFA
   enforced" always false (enrolment is live one card over —
   `liveCounts.mfa`), "Backups running" / "Session policy set" / "Quote
   branding configured" always true; its sentence "Set up SSO and enforce
   MFA to reach 90%+" is static. Honest minimum: footers show "Managed in
   X" or nothing (the audit log knows real edit times per entity if a
   footer is wanted), health checks that cannot be read are dropped from
   the denominator, "MFA enforced" becomes "MFA fully enrolled" from
   `liveCounts.mfa`, and the sentence names only the checks that failed.
16. **Header DONE — state §0.80, commit `1e15e45` (3 Sep; Jeff: "All
   quarters showing should run off the fiscal year set in the settings
   area … UKG … fiscal ends on 9/30 so they are currently in Q4").**
   `currentQuarter(fiscalStart)` in quarters.js; the header reads
   "Q4 FY2026 · 4 weeks remaining" for an October year; weeks count today
   and are never 0 (the Gap tile divided by 0 on a quarter's last day).
   **The audit found the totals on NO quarter:** `closedArr` is every
   Closed Won deal ever, `quota` the annual figure (or four quarterlies
   summed); attainment, health score, "Team to quota", the Team cards'
   bar and the Administration board's bar all divide those two.
   **Jeff's decisions (3 Sep): quarter-to-date** — Closed = won in the
   current fiscal quarter by close day (`closeDayInRange`, §0.75), Quota =
   `userQuotaFor(u, 'Qn')` (a quarterly plan's own figure, else annual ÷
   4); the Administration board keeps the annual quota with a
   fiscal-year-to-date bar; **and the header's three inert buttons (This
   quarter / All reps / Export) are removed.** **DONE — commit `327ce8f`,
   state §0.80 second half:** `buildRepStats(…, period)` with `wonInQ` /
   `closeDayInRange` and `userQuotaFor(rep, 'Qn')`; `fyRange` prop into
   AdminTab, both `rWon` sums FY-windowed, column "FY attainment"; the
   quarter block moved above the memo, deps carry `curQ.key`; 13 tests,
   204/204 mutations. Health labels on Forecast / Team / Today change: a
   rep whose wins were all in earlier quarters now reads 0% / AT RISK
   there (the Team tab's win-rate flag stays all-time by design). Was: **Carried (seen in the pane during the §0.79 check): the Sales Manager
   tab's quarter is the CALENDAR quarter.** Header "Team forecast · Q3
   2026 · 4 weeks remaining" beside Home's "Q4 · Week 10" on 2 Sep.
   SalesManagerTab.jsx ~line 769: `qNum = Math.floor(now.getMonth()/3)+1`,
   `qEnd` the calendar quarter's last day, `weeksLeft` from it; no read of
   `fiscalYearStart` anywhere in the file.
17. **DONE — state §0.82, commit `aef4b4b` (3 Sep; Jeff: "lets do item 17
   and then we will ship to prod").** Two decisions taken by Jeff before the
   schema was written: **first day = the team-join date** (new nullable
   `users.team_joined_at`, stamped by users.mjs on a team change, falling
   back to `created_at`), and **the old blob notes migrate through an
   Admin import button** (idempotent). Built: `coaching_notes` table (DDL
   applied to test and app databases first), `_coaching.mjs` (pure
   visibility: author / recipients / Admins for a people note — never
   another manager; team manager + members from their first day for a team
   note), `coaching-notes.mjs` (GET filtered server-side, POST Admin |
   Manager with author stamped from the caller, PUT read, DELETE
   author-or-Admin, legacy POST Admin-only and upsert-on-id),
   `CoachingNoteDialog` with a rep/team picker, the Team tab on the table,
   Home's "Notes from your manager", unread notes in the bell, the
   settings Manager carve-out retired. 16 unit + 8 integration tests, 9
   mutations (218/218). **OBSERVED by Jeff as Admin and as Karen on
   deployed dev (3 Sep): "all cleared and worked as planned."** Was: **Product (Jeff, 2 Sep, after observing §0.79): coaching notes should
   be ADDRESSED — a manager sends a note to a specific person, several
   people, or the whole team.** What exists today, read from code: a
   note is `{ id, rep, text, date, author }` in the org's
   `settings.coachingNotes` blob; it is rendered only on the Sales
   Manager tab's Team view (Admins and Managers), the "rep" is a free-text
   name parsed from "rep: text", and a rep never sees a note written
   about them — there is no recipient, no team, no read state, no
   delivery. The org-wide settings blob is the wrong home for addressed,
   per-person content: it is one JSON column every Admin PUT rewrites,
   and the §0.79 Manager exception is a stopgap for exactly that. Design
   from the first line as its own org-scoped table (guide §18c, additive:
   `coaching_notes` — id, orgId, authorId, recipients (user ids) or
   team, text, date, createdAt, readAt per recipient) with its own
   function and visibility rules (author, Admins, managers of a
   recipient, the recipient), a picker of reps / teams in the house
   prompt instead of a typed name, a rep-side surface (Home "on your
   plate" or a notes panel) and a notification; then migrate the blob's
   existing notes and retire the settings key and the Manager exception.
   **Two decisions from Jeff (2 Sep):** (a) a rep who joins the team
   later sees team notes only from their first day — so a team note is
   resolved against membership at READ time with a date floor, not
   expanded into per-user rows at write time; the table needs the note's
   date and the rep's join date (users.createdAt, or the date they were
   added to the team, which the users row does not record today — the
   team assignment carries no timestamp; decide which before the schema
   is written). (b) Managers cannot see each other's private notes — a
   note addressed to people is visible to its author, its recipients,
   and Admins; NOT to other managers, not even a recipient's own manager
   unless they wrote it. Team notes are visible to the team's members
   (from their first day) and its managers. Not started.
18. **DONE — state §0.84, commit `9782e97` (3 Sep, sixth session).**
   `src/utils/forecastCall.js` (pure): the call is per fiscal quarter in
   `profile.forecastCalls`, validated by `cleanForecastCalls` in
   `users.mjs`'s `sanitize()` (imported from src/utils the way
   `_stage.mjs` imports stageClock.js), read by `forecastCallOf`,
   written by `withForecastCall` through the same users PUT as quotas;
   Best case editable in the same `CallCell`, an untyped one flagged as the
   60% estimate. 17 tests, 10 mutants. **OBSERVED by Jeff on deployed dev
   ("verified changes. they are working").** Unshipped. Was:
   **Carried (found reading for item 16, state §0.80): the Forecast
   ledger's editable Commit is never stored.** Clicking a rep's Commit
   cell calls `updateRepField(rep.id, 'commit', n)` → `saveUser` → users
   PUT, and `users.mjs` `sanitize()` carries neither `commit` nor
   `bestCase` in a column or in the profile blob — the typed commit is 0
   again on refresh (persistent-data rule, guide §18b1). `bestCase` is
   never editable anywhere and falls back to 60% of open pipeline. Fix:
   add both to the profile blob in `sanitize()` (additive), and decide
   whether a commit is per quarter (it should be — it is a quarter's
   call, so a key per fiscal quarter, not one number that never resets).
19. **DONE — state §0.84, commit `9782e97` (3 Sep, sixth session).** Not
   one inert button but FIVE (Coach →; the Team card's Coach and Pipeline;
   Today's Open coaching / Schedule 1:1 / Their pipeline), all wired —
   the note dialog pre-addressed through `showCoachingNote({ recipientIds })`
   (host filters to addressable reps; dialog takes `initialRecipientIds`),
   the Viewing bar's `setViewingRep` + the Pipeline tab, a new task in the
   rail; the ledger card gained a header and Export CSV (the tab's first
   working export); Home's card: `userQuotaFor(u, 'Qn')`, closed by close
   day in the fiscal quarter, commit by `commitFallbackStages`, labelled
   "Qn FYyyyy" (the old label was the first forecast bucket's). A standing
   scan now refuses any `<button` on the tab without an `onClick`.
   **OBSERVED by Jeff ("verified changes. they are working").** Unshipped.
   Was: **Carried, same read:** the Forecast
   ledger's per-row "Coach →" button has no handler (the batch-6 class; Jeff removed the header's three,
   this one was found after the question was asked). HomeTab's quota card
   is `annualQuota / 4` (HomeTab.jsx ~351) — a quarterly-plan user sees a
   $0 quota there; `userQuotaFor(u, 'Qn')` is the helper — and its
   closed-this-quarter buckets won deals by `forecastedCloseDate`, not
   the close day (§0.75's rule, applied to Reports only so far). **The
   Sales Manager tab has no export:** `exportToCSV` is destructured from
   the context there and never called; the only "Export" was the dead
   header button, now gone (Claude told Jeff the Team/Admin tabs had their
   own working Export when asking about the buttons — that was unverified
   and wrong; corrected the same session).
20. **DONE — state §0.85, commit `6db6ea8` (3 Sep, sixth session).** Two
   panels below the leaderboard while the Rep slicer names one rep, from
   the same period-filtered sets it sums (the list's total IS the
   leaderboard's Closed); `src/utils/repDeals.js` (pure), 6 tests, 5
   mutants. **OBSERVED by Jeff on deployed dev ("confirmed on karen under
   performance").** Unshipped. Was: **Product (Jeff, 3 Sep, while
   eyeballing the Forecast tab): Reports → Performance → the single-rep
   view should have a section listing that rep's won and lost deals, with
   totals.** Not started; not read. What
   exists to build on: the Performance leaderboard already slices by rep
   (`repsForSlice`), `closeDayOf` / `closeDayInRange` give the close day
   and period window, and the History tab (§0.77) lists deals on real
   columns — the list wants the same row shape and the period filter the
   report already carries.
21. **DONE — all four: state §0.86 (`6ec3c05`, the three reductions) and
   §0.87 (`1ac3d64` design, `2e7a219` build — audit streaming for real).**
   **OBSERVED by Jeff on deployed dev ("Looks correct").** Both unshipped. Was: **THREE OF FOUR DONE — state
   §0.86, commit `6ec3c05` (3 Sep, sixth session; Jeff's call per panel:
   SSO reduce, Session reduce, Import launcher, Audit streaming BUILD).** SSO and Session & password are
   Managed-in-Clerk panels; Import launches the real importers;
   `import.mjs` deleted; `ssoConfig` + `importPresets` retired from both
   halves. Found: SessionDetail's `sessionPolicy` was in neither half —
   "Policy saved." saved nothing. 6 tests, 5 mutants. Unobserved;
   unshipped. **The fourth — audit streaming — is NOT started (§5).** Was:
   **Carried (found reading for item 15, state §0.81 last paragraph):
   four Settings panels are design mockups in depth.** SsoDetail's
   `SEC_SSO` (Okta URLs, "Active · 412 logins / 30d", verified domain
   `acme-corp.com`; the panel saves `settings.ssoConfig`, which nothing
   in sign-in reads); SessionDetail's badge "Strong policy · 8h idle ·
   90-day rotation" (typed; the policy it saves is real); AuditDetail's
   "Streaming to Splunk · 2 alerts triggered today · retention 13 months";
   ImportDetail's whole `DATA_IMPORT` constant (a history by
   `morgan@accelerep.com`, a fake Salesforce file) — the real importer is
   the CSV modal, not this panel. Jeff decides per panel: remove, reduce
   to what is real, or build the feature. Not started.
22. **DONE — state §0.88, commit `539eaa1` (3 Sep, sixth session; Jeff:
   "lets do 22 and then call it a day").** Every count from its panel's
   key or null, "App defaults" where the panel supplies one, the two
   wrong-key guards fixed, "last 30d" gone, all 16 badges and both `moved`
   flags gone; 9 tests, 5 mutants. **OBSERVED by Jeff on deployed dev
   ("confirmed that settings cards are correct and all badges are gone").**
   Unshipped. Was: **Carried, same read: the hand-typed card COUNTS and the
   NEW badges.**
   Where no settings key is read the catalogue's typed detail still
   shows: KPI thresholds "12 KPIs configured", Pain points "23", Customer
   types / Account segments "5 tiers", Industries "14 · 47 sub-types",
   Lead conversion "8 sources configured", Price book "15 products · 3
   bundles", Field-level visibility "6 rules", Fiscal year "Q1 starts Feb
   1" (readable from `fiscalYearStart` — the one clear fix), Company
   profile "Complete"; and the `&& settings?.x` guards fall back to a
   typed count when the key is absent ("18 custom fields", "8 stages", "8
   territories", "5 roles", "4 templates", "3 tiers", "12 holidays"). Each
   needs its panel's settings key read first. The 16 `isNew:true` badges
   never expire (dsp-* are months old). Not started.
23. **DONE — state §0.83, commit `6bf1e6e` (3 Sep; Jeff: "do 23").** The
   key is out of both halves of settings.mjs, the legacy POST branch out of
   coaching-notes.mjs, the import button and helpers out of the tab and
   the util; four mutants retired with their targets (214/214). On dev
   only at first; **SHIPPED TO PROD the same day (seventh ship, `eec3948`,
   `index-Bsn2ZlRv.js`)**. Was: **Carried (after the prod import, state §0.82):
   retire the `coachingNotes` settings key.** Both orgs' blobs are empty now; the key
   remains in both halves of settings.mjs and the GET default only so the
   Admin import button can appear for an org that still holds old rows. Once
   every org has imported (dev and prod have), drop the key from settings.mjs
   GET/PUT, from useSettings' defaults, the `legacyNotes` / import code in
   SalesManagerTab, `legacyNotePayload` + `parseCoachingNote` in the util,
   and the scans that pin them (house-dialogs, coaching-notes); mutation
   entries follow. Small, mechanical, its own commit.

24. **DONE — state §0.90, commit `e3d15f2` (3 Sep, seventh session; Jeff:
   "option a").** The panel is what exists: Slack; Google and Microsoft 365
   calendars through the real OAuth (Outlook offered for the first time),
   with "Not available on this site" when the site lacks credentials; an
   Email-logging card for the BCC address; ten catalogue rows that are
   requests (recorded, audited, mailed when `INTEGRATION_REQUESTS_TO` is
   set). The Morgan Reyes modal, `INT_APPS`, the inert header buttons and
   the `gcal` flag are gone. Not observed by Jeff; not shipped. Was:
   **Carried, premise corrected (state §0.89, findings 4–6). Half done.**
   The sixth session recorded six apps "marked connected and typed traffic"
   and Industries' "typed account counts that no query produced". Reading
   both panels: `INT_APPS`'s `connected:true` and `traffic` are never
   rendered (`liveApps` recomputes `connected` from settings; nothing reads
   `traffic`), and the Industries Distribution card computes its counts from
   the org's accounts — the typed `n` was dead data that every Save
   persisted, now gone (`cloneIndustries` strips it). What remains, and is
   Jeff's call: `ConnectAppModal` ("Morgan Reyes · morgan@accelerep.com",
   fixed scopes, "You'll be redirected to Google", Authorize closes), "Browse
   marketplace" and "+ Request integration" with no `onClick`, thirteen
   catalogue apps with no integration behind them, and `connectedApps.gcal`
   which nothing sets — the calendar OAuth callback writes
   `user_calendar_connections` / `org_calendar_connections` — so Google
   Calendar always reads unconnected on this panel. Reduce (Slack, which is
   real and now configurable; a Google Calendar card reading the real
   connection) or build. **Found underneath it and FIXED this session:** the
   Slack modal itself was undefined (§0.89 finding 1).

25. **New (state §0.89, "also noted"):** `send-slack`'s handler posts a test
   message to any `webhookUrl` the body carries, behind `verifyAuth` alone —
   any signed-in user can make the server POST to an arbitrary URL. The
   audit-stream endpoint (§0.87) is Admin-only and refuses literal private
   hosts; the same two lines here. Jeff's call.

26. **New, trivial:** `tests/fixtures/scanners/dupes-jsx-attribute - Copy.jsx`
   is a tracked, byte-identical duplicate of `dupes-jsx-attribute.jsx` from
   `db4ef5b`. Harmless to the fixture-coverage test; not deleted (not mine).

## 6. The thread

A session that began by writing one owed sentence into the guide ended with
multi-factor authentication enforced in production. Between: the importer
stopped passing unreadable dates through, and the probe written to prove it
found the engine turning "Sept 15" into a day in 2001; a screenshot of a
Clerk toggle led to the app walking past a pending session on both the
client and the API; Jeff flipped Require on Development, signed in, watched
the bypass, and an hour later watched the fix hold him at the task card —
then did it again on prod. Five prod ships, each verified by bundle hash. The
handoff was corrupted twice by edit scripts and restored from git both times
before anything was committed. Observed, then written, then committed, and
re-read from disk between every step.

The evening ran on Jeff's screenshots. Each one — the MFA panel, the
Security list, the Home header at 7pm, a grey "accelerep.netlify.app says"
box — was read against the code before anything was written, and each
found something the code had been saying that was not true of the product:
a policy the app could not read, footers typed by hand, a browser dialog
where the app owned a modal, notes that vanished on refresh. Seven batches
closed the Reports audit; three more closed the carried items; every one
was gated, mutated, deployed, hash-checked, and the last two were observed
by Jeff signed in as a Manager he had just made. What is left is written
down with what exists and what was decided, and nothing in this file
describes a state that was not seen.

**Fifth session (3 Sep).** Three carried items and one new one, in the
order the handoff gave them. Item 16 began as a header fix and became a
question put to Jeff with the audit in front of him — the totals under the
header were on no quarter at all — and he chose quarter-to-date. Item 15's
"footers" turned out to be one of three classes of invented text, and the
fix moved the card logic into a pure module where the harness could reach
it; the harness then reported a stale anchor from the day before, which is
what it is for. Item 17 was designed before it was built: two decisions
taken by Jeff before the schema was written, the DDL in both databases
before the code, visibility in a pure module with the two rules as
regression cases, and the old blob migrated by a button that cannot
duplicate on a second click. Everything went to dev, was observed by Jeff
as Admin and as Karen, and shipped to prod as one fast-forward — the first
ship to carry a new table. Then the import ran on prod, and the scaffolding
that made it possible was taken down the same morning, four mutants
retiring with their targets. Two anchors were mis-typed on the way and each
was re-read from disk before anything was written; one claim about a
working Export button was made without reading and corrected in the same
message it would have misled. Observed, then written, then committed.

**Sixth session (3 Sep).** Opened on a clean tree with nothing unshipped,
and took the two items the handoff left that needed no decision from Jeff.
Item 18 was named as one missing key and turned out to be a shape
question: a commit that lives on the rep row is one number forever, and a
quarter's call has to be the quarter's — so the fix was a keyed blob and
a validator that both sides import, not a line in `sanitize()`. Item 19
named one inert button; the read found five, and a scan now stands
guard over the tab so the count cannot drift back. Home's card, read for
its "annual ÷ 4", was also summing every win the rep ever had and
labelling itself with whichever quarter held the first dated deal.
Gated, mutated, deployed, hash-checked — and not observed: the pane has no
session and the tab is a Manager's, so this handoff says "unobserved" in
four places rather than once — and then Jeff looked: "verified changes.
they are working." Recorded, committed, and the ship left as his call.

Then "lets do 20." The read found the single-rep view was a one-row
leaderboard with the metrics table hiding itself below two reps — the ask
was for the deals behind the bar, and the only honest source for them was
the sets the bar already summed, so the list's total is the bar's number
and a mutant that points it elsewhere is caught. Pure module, six tests,
five mutants, gated, deployed, hash-checked; then Jeff sliced Karen under
Performance and confirmed it.

Then "lets do 21" — the item the handoff had marked as his call, so the
four panels were read end to end before a word was written and the choices
went to him with what each really did. One of them was worse than
recorded: the Session panel's Save had been posting a key the server never
knew, and a toast had been calling that saved. He chose to reduce three and
build the fourth. The three are done the MfaDetail way — say where the thing
lives, say what the app does, say what it does not — and a function nothing
called any more went with them. The fourth, audit streaming, was
designed in the state doc and committed as a design before a line of code —
its own table rather than the settings blob, delivery at the write with a
signature and a timeout, a destination that pauses itself — and then built
to that design, with a local receiver in the integration suite verifying
the signatures the customer would verify. Then Jeff looked: "Looks
correct." Five items on dev, all five seen; then "ship prod", and the
eighth ship went as one fast-forward, verified by bundle hash.

"Lets do 22 and then call it a day." The last of the §0.81 read turned out
to need no decision: a count is the panel's key or it is nothing, and two
of the guards had been reading keys no panel ever wrote, so two numbers
had been true of every org and no org. Thirty typed details, sixteen
badges and two dead flags left the catalogue; nine tests and five mutants
hold the rule. Deployed, hash-checked; then Jeff looked — "confirmed that
settings cards are correct and all badges are gone" — and the day was
called. Six items on dev this session, all six seen, five shipped; the
sixth is his call. Observed, then written, then committed.

"Claude, lets continue." The next thing in the queue was a decision that
belonged to Jeff, so the two panels were read end to end to put it in front
of him honestly — and the reading found that the decision's premise was
half wrong and that underneath it sat a crash four months old. A component
deleted in a May cleanup, still rendered; a build that cannot tell; a gate
written for exactly this that walked one node type and never counted a JSX
name as a read. The fix was small and the lesson was in the gate: it now
counts JSX names, collects default exports, and carries a fixture at both
sites; the scan it needed found exactly one in the tree. Two more things
fell out of the same read — a button primitive that dropped `disabled`, and
an account form that offered no industries to any org that had saved its
own. Twelve mutants, all caught. Deployed, hash-checked, not yet seen by
Jeff; the ship, and item 24's real question, are his. Reasoned, then
written, then committed.

Then Jeff looked — "verified" — and asked the real question: could the
catalogue's apps each get a connection modal, since everything but Slack
showed Morgan Reyes. The answer had to be honest before it was useful: three
integrations exist, and a modal is not one. He chose the honest shape. The
panel now shows what is there — Slack; two calendars, one of which the
backend had supported for months without the UI ever offering it; an
email-logging address that had been complete and invisible — and turns the
rest into requests that reach him by mail. One catalogue module serves the
panel and the endpoint, so the list a customer can see is exactly the list
the server will accept. Six integration tests, twelve mutants; the first
harness run let one survive and the test was tightened before the number was
written. Deployed, hash-checked, not yet seen by Jeff.

Then his screenshot came back reading exactly as designed, and a question
that started at the Email logging card: could each user have their own
address, so their email is theirs. Reading the function answered it before
the code did — every logged email had been unowned, visible to every rep,
with the raw sender string for an author. Two designs went to him; he chose
the open one and the attribution with it. The address is the user id
signed in its own namespace, so the org's signature can never pass as a
user's; a deactivated user's address dies with their row; the org address
now names the roster member who sent through it. A tab under the avatar; a
sentence on the Admin card; and the first integration suite that function
has ever had, eight cases against the real database, one of which is the
replay the namespace exists to refuse. Seven mutants, all caught. Deployed,
hash-checked; the proof that matters is a real email, and that is Jeff's.

"Ship prod." Twelve commits went as one fast-forward — the count that had
never been counted, the modal that had been missing since May, the panel
that says only what is there, the address that is a rep's own — verified by
the bundle hash on the live domain, the live key inlined, the old strings
gone. Prod had carried the Slack crash for four months; it does not now.

The eighth session began with nothing to build. Jeff had been looking at what
the seventh had made, and each thing he said was read back from the database
before it was written down: two addresses that differ; an email that came in
through the org address and belonged to Karen; a second through her own
address that belonged to her too; a request that stayed requested; a Slack
channel he made that afternoon, with the app's first message in it. Four audit
rows in two pairs looked like a double write until the code and a controlled
repeat said they were Saves. A claim about Karen reaching Settings was struck
the moment he said a user should not. Then the two items he had left for
himself: the endpoint that would post anywhere for anyone, closed at the one
place that sends and at the place that saves — and refused once by GitHub,
which read a fake webhook as a real one, so the tests now build their samples
at run time. And the emails he could not read: every row a door now, the
whole message behind it, Edit only for whoever the server would let edit. His
first look was fifteen seconds ahead of the deploy; his second was "works".

Then he did what "works" never says: the steps, one by one. Nine passed. One
was a task that has no such thing yet. Three were real, and none of them
was the viewer. A second Escape listener under the first; a body stored
with its newlines pressed out months ago, invisible until something tried
to show them; a contact owned by the person who made it and labelled
nobody's. Two were fixed inside the hour and proven against the real
database; the third is a question about what a row should say about
itself, and that is his to answer.

Day two was a day of the same result. Seven emails, each stored flat, while
every record said the fixed function was live. Three diagnostics printed
nothing, and the fourth — written onto the row, where it could be read back
— came back blank, which was the answer: the row had been written by
something that could not have been the function under test. One webhook,
three months old, pointing at prod. The shared database had been saying yes
to both sites all along. Jeff added an endpoint for dev, disabled the old
one, and the next email came through with every line it was sent with and
the name of the file attached. The fix had been right since the afternoon
before. Nothing had run it.
