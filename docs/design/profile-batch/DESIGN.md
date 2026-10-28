<!-- The member profile page batch (OPEN_ITEMS §1 item 1, "Then, the member profile page sends only what changed"): the design, REVISED. Written 26 Oct 2026, read only, over faed240 — file:line references are as of faed240 and may move; verify every one before building. Built from five read-only maps (map-client, map-server, map-writers, map-teams, map-tests — scratch files), the designer's reads, two critiques (critic-correctness.md, critic-proof.md) and the reviser's own re-reads of every line a finding cites. The pre-revision text is kept beside it as design-v1-before-revision.md. -->

# Design: the member profile page sends only what changed (proposed state §0.211, its step B §0.212; guide §18b102)

File: docs/design/profile-batch/DESIGN.md — written in the session's scratch folder, copied here at the build (27 Oct) unchanged but for this line; beside it ANSWERS.md (Jeff's answers), NOTES-STEP-A.md and NOTES-STEP-B.md (what each step's build departs from, and what its review changed — step B's harness counts are the build's, 32 entries on the manager and 3,305 (3,333 with the scoped harness's own 28, 3,342 with the browser check's resize close's 9), not §6's 13 and 3,275; and since §0.211's browser check QA's TEST Profile Rep holds a manager by name alone, which the header's count below found none of). The files the text names as beside it — design-v1-before-revision.md, census.mjs, census-out.json — and the maps, the critiques and critic-anchors.mjs were scratch files and are not kept; §10.1's first question was answered by the count in the header (26 Oct). Since §0.212 users.mjs imports memberSave.js's `sameValue`, so a change to memberSave.js is a functions deploy (the header's "Which deploy each file means", line 29 — "screens-only" — held for step A).

**Jeff's answers (26 Oct 2026, in chat) — every one the Recommended:** Q1 "Your change wins"; Q2 "Only who they report to"; Q3 "Steps A and B"; Q4 "Fix the move, file the rest"; Q5 "File it"; the read-only count "Yes, run it"; the Karen leg (D19) "Yes, on my go"; the defaults D1-D19 "Take them all".

**The read-only count (26 Oct, NETLIFY_DATABASE_URL, SELECTs only — census.mjs, census-out.json beside this file):** six orgs. No org holds a plain-string team, a team with no id, or two teams of one name. No member's team link names a team gone, or a team whose name differs from the member's. No member holds `profile.managedReps`, `profile.alertTime`, or a stored `profile.manager` at all (so step B meets no name-only manager). One demo org (`org_3BDQEH7s…`) holds two members with a team name and no link: one whose name a team of the list has (it will read "(not linked to the team list — pick it again)"), one whose name no team has ("(not on the team list)"). Real UKG (`org_3Cwnblo…`): 3 members on its one team, all linked.

**Read only, 26 Oct 2026.** The tree is `dev` at `faed240` (`git rev-parse --short HEAD`). `git status --short` shows ` M deno.lock` only, so the working tree is HEAD for every file read. No repo file was edited. No build, test, harness, `netlify` request or database read was run, and nothing was sent to the `netlify dev` on :8888. What was run: greps, line reads, one `node` count of line endings, and the proof critic's read-only anchor lister (critic-anchors.mjs, which loads the harness's `mutations` array and prints where each anchor matches today).

**Revised against two critiques.** Every finding (C1–C21, F1–F21) was checked against the cited lines on this tree; §11 records each disposition. The main changes: the half-saved path no longer loses a team's list move (C1/F2 — the list now follows the member's PUT directly); the S3 and I3 "old code" assertions now state what today's code really does (F1 — a member of a second same-named team is MOVED to the first, not cleared); the browser check no longer relies on a roster GET that never comes (C3/F10) or an export preview that shows no manager (C4/F11); the Manager box offers `canSeeAll` roles instead of a second role list (C7/F16); the harness anchors are unique and named for their breaks (C2, C8, F5, F19); and the hard-rule conflicts are named as defaults Jeff can veto (C5, C6, C21).

**What the reviser read on this tree** (beyond the designer's list, which stands):
- UsersDetail.jsx:1-130, :160-220, :330-350, :410-430, :820-1521, :1600-1700 (greps); users.mjs:1-310, :400-630, :800-945, :1000-1209; user-role.mjs (all); storage.js (all); teamMembership.js (all); linkIds.js (all); _links.mjs:30-100, :285-326; _selfProfile.mjs (all); roles.js (all); memberStatus.js (all); quotaPlan.js:66-68; memberName.js (its exports, :11-110 by grep); users-sync.mjs:120-190.
- TeamsDetail.jsx:15-140, :340-365; AppHeader.jsx:170-225, :525-550, :600-636 (with greps); App.jsx:196-235, :505-555 and every `setMyProfile` / `setProfileForm` line (grep); useUserHandlers.js (all); ModalLayer.jsx:205-235; UserModal.jsx (grep: :111, :113, :154); AdminView.jsx (src/Tabs/AdminView.jsx):436-442; SettingsTab.jsx:63; useSettings.js:110-120.
- Tests: member-identity :1-40, :140-176; member-links :215-245; member-names :380-425; team-membership (all); deal-modal-saves :95-169; late-answers :1-200; roles :130-153; role-vocabulary :118-155; self-profile :20-40; sales-links :755-805; member-status :45-104 (grep).
- Harness: scripts/mutate-import.mjs :16 (SUITES), :4604-4620, the profile entries by name (:4608, :4612, :4616, :7758, :7762, :7766, :7770, :12588), the entry count (3,235), and the anchor listing for UsersDetail.jsx, teamMembership.js, linkIds.js, _links.mjs, roles.js and memberStatus.js.
- Docs: guide :3, :411, §18b63 (:3844-3853), §18b68 (:3898-3906), §18b77 (:3983-3990), §18b90 (:4105-4114), §18b92 rule 8 (:4139), §18b95 (:4167-4177), §18b96 (:4179-4189), §18b98 (:4204-4216), §18b99 rule 5 (:4243); OPEN_ITEMS :160-175, :300-308, :1880-1912, :2334-2376, :2512-2575 (and the exact lines by grep).

Anything cited from a map or a critique and not re-read here is marked "(map)". Anything not read at all is marked "unverified".

**Line endings on disk** (counted with node — Git Bash's grep lies about `\r`, memory):
- **CRLF:** UsersDetail.jsx, users.mjs, memberStatus.js, src/Tabs/AdminView.jsx, scripts/mutate-import.mjs, package.json, tests/role-vocabulary.test.mjs, the three docs, CLAUDE.md, both SESSION_HANDOFF copies.
- **LF:** teamMembership.js, linkIds.js, _links.mjs, _selfProfile.mjs, roles.js, and the test files team-membership, member-identity, member-names, member-links, member-status, sales-links, self-profile (.test.mjs), and tests/integration/member-links.itest.mjs.
- New files are LF. Every edit script is EOL-aware, dry-run first, with asserted counts, and is re-read from disk.

**Which deploy each file means:** no function imports teamMembership.js, memberStatus.js or the two new modules (grep of netlify/functions), so step A is a screens-only deploy. roles.js IS imported by functions (auth.mjs and the CRM endpoints), so step A does not edit it. _selfProfile.mjs is a function file, so its stale comment waits for step B.

---

## 0. The batch in one screen

**The defect.** Settings → Users → a member's profile (`UserProfilePage`, UsersDetail.jsx:904) saves by PUTting the member's whole row as the roster held it at sign-in. That is every key `flatten` gives (users.mjs:225-239) except `active`, `status`, `clerkUserId` and `pinnedReports` (UsersDetail.jsx:937), plus a `teamId` derived from the Team box's NAME on every save (:938). The server applies every key sent (`{ ...flatten(existing), ...data }`, users.mjs:285). So a save puts back, as the page loaded them:
- the member's own title, phone, email, signature, preferences and timezone;
- a Manager's forecast calls;
- the Teams page's team, territory and vertical;
- a Clerk sync's email (users-sync.mjs:157 patches the column).

The team derived by name (`teamIdNamed` takes the FIRST team of that name, teamMembership.js:15-16) does one of two things on every save of any box:
- **moves** the member to the first team of their team's name — a member of a second "East" is moved onto the first, and their joined date is re-stamped (users.mjs:1093-1094);
- **clears** a valid team id and its joined date when no team on the list has the member's stored team name (a team renamed since, its cascade having missed this member — P28).

After the PUT, the page:
- moves the member between teams' lists by NAME, compared with the page's first copy (:971-981);
- makes the member's "reports to" the manager of their whole team, on EVERY save (:983-992);
- PUTs the app's whole copy of the teams list (:995-1002).

After a save, the title band, the crumb and "Save changes" still read the member as the page opened them (:911, :1113-1122, :1150).

**The rule ("only what changed").** A save sends the fields this page edits (Full name, Job title, Phone, Team, Manager, Territory) that differ from **the member as the page holds them**. That is the roster row the page opened on, then the row as stored after each save.
- The comparison is per field of the flat row; a profile key and a column count alike.
- `''`, `null` and absent are one value. A field changed and changed back is not sent.
- Two fields always travel in pairs. A Full name goes with `firstName: null, lastName: null` ("Yes, Full name wins" — the server builds the name from First/Last first, users.mjs:111). A team's id goes with its name.
- Nothing else is ever sent. The Role goes to user-role.mjs alone, and only when it differs.
- **The server already keeps every key it stores that a save leaves out** — the columns and the profile keys `sanitize` builds (users.mjs:106-170), through the merge (:280-297, §4) — so step A changes no function. (A profile key outside sanitize's list, such as `managedReps`, read at App.jsx:790, is dropped by every PUT, whole or partial; nothing writes it, OPEN_ITEMS :2570.)

**After a save the page holds the member as stored.** That is `d.user` (users.mjs:1131), with a role that landed laid over it. The band, crumb and button follow. The roster on screen takes the stored row, not the body. An Admin's own row reaches the header at once (`setMyProfile`; App.jsx:209), and their profile panel when it is next opened (its avatar click refills the panel's form from the profile, AppHeader.jsx:544).

**The team is picked by its id** and saved with its name, only when the Team box changed. The teams' lists follow by id (`teamsWithMemberOn`), only on that change, **straight after the member's PUT lands** — so no later request can skip them. **The Manager box sets who this member reports to, and nothing else**: no team's manager is rewritten (Q2). Half-saved states are said in words, and the next Save tries again.

**Steps (Q3, Recommended):**
- **A — the page (§0.211), screens only.** UsersDetail.jsx, two new pure modules (src/utils/memberSave.js; src/Tabs/settings/people/memberPickers.js), and one new function in teamMembership.js. A unit suite, and an integration suite guarding the server's answers to the bodies the page now sends. 33 harness entries; 6 retired.
- **B — the manager by id (§0.212), functions and screens.** `profile.managerId`, link-checked as a member of this org (the users.mjs PUT and create; the restore's clean-up), chosen by a type-ahead (D15), and read by the band, the Users list and the export. 13 entries.
- **Filed:** the forecast call's one-figure save (its own small batch), the page's leave guard, and the server's read-to-write windows (§1).

**Jeff's words this batch carries:**
- 16 Oct: "File it, own batch next"; 17 Oct: "Undo, cleanup, profile" (OPEN_ITEMS :165-169).
- 15 Oct: "Send only what changed" (§0.205; FiscalYearDetail.jsx:79-80 already cites it — map).
- 9 Oct: "Yes, Full name wins" (§0.196).
- 15 Oct: "Server keeps access" (§0.202).
- 16 Oct: "No, leave it" (a Manager's team through the API) and "Not now, file it" (the Pin race).

---

## 1. Scope — every place, numbered

Tags:
- **A** / **B** — the step.
- **Q#** — Jeff decides (§9).
- **D#** — decided without asking (§9.2); Jeff can veto.
- **FILED** — why, and where.
- "New" means found by the maps, the critiques or the reviser, and not on OPEN_ITEMS today.

| P | Place (file:line on faed240) | Source | Tag |
|---|---|---|---|
| P1 | The save's body: the whole form as loaded, less four keys — UsersDetail.jsx:937-940 | OPEN_ITEMS §4.3 :1885-1903 | A |
| P2 | The Full name pair. `handleChange` clears First/Last in the form (:918-921). A body built by difference would lose it when First/Last were set after the page opened (users.mjs:111; integration/member-names :220-231, map) | §0.196; map-server F3 | A, D3 |
| P3 | The team derived by NAME on every save (:927-931, :938; teamMembership.js:13-17), and the Team box offering names (:913, :1196-1200). With two teams of one name, every save moves a member of the second onto the first (the first match, teamMembership.js:15) and re-stamps the joined date (users.mjs:1094); with no team of the member's stored name, it clears a valid team id and its joined date (users.mjs:1093-1094). Two teams of one name show as one option | OPEN_ITEMS §4.6 :2356-2357; map-teams §4a, §4c; critic-proof F1 | A, D4 |
| P4 | The teams' lists move the member by NAME, compared with the page's first copy (:971-981). Every team of either name is touched. Changing the team and changing it back leaves the member on the wrong list (map-teams §4e path 3) | map-teams | A, Q4 |
| P5 | The Manager box makes the member's "reports to" the manager of their WHOLE TEAM on every save (:983-992). Any member can be picked, a rep too (`allMgrs`, :914). A team's manager sees its coaching notes (_coaching.mjs:59, map) | new (map-client; map-teams §4d) | A, Q2 |
| P6 | The teams list is PUT whole from the app's copy, loaded at sign-in (:995-1002; settings.mjs:338 replaces `teams` whole, map). Another Admin's team edit made since is put back | new (map-client; map-teams §4g) | FILED (Q4 A) — with batch 4b-3, "the ids inside settings (teams…)", OPEN_ITEMS :170-171 |
| P7 | The role call compares with the page's first copy (:959-960). A second press re-sends a changed role, writing a second `user.role.changed` row (user-role.mjs:129-137). A role-only change still PUTs the member, writing a `user.updated` row for nothing (users.mjs:1130) | new (map-client; map-server F4) | A, D5 |
| P8 | After a save the page reads the member as opened: the band and crumb (:1113-1122), and `dirty` (:911), so "Save changes" stays (:1150). `setForm` adopts only the name (:1010) | OPEN_ITEMS §4.3 :1904-1908 | A |
| P9 | The roster on screen takes the body sent, not the stored row (:1005-1009). After a role change, `userType` stays the old role in this tab | new (map-client; map-server F5) | A |
| P10 | An Admin renaming their own row keeps the old name in the header. App.jsx:209 reads `myProfile`, and nothing on the page sets it. The profile panel's avatar click refills its form from `myProfile` (AppHeader.jsx:544), so today it refills the OLD First/Last, and the panel's Save Profile (:633) then rebuilds the old name | OPEN_ITEMS §4.3 :1904-1908; reviser | A |
| P11 | Half-saved: the role refused after the users PUT landed (:967), or the list refused after both (:1001). Each returns before the roster and the form follow. The role's words do not say that the rest was saved | new (map-client; map-teams §4e) | A, D7 |
| P12 | The Manager box offers every named member except this one, with no role or access filter (:914). A stored name it does not offer shows as "— none —" (a `<select>` shows its first option for a value none holds — RoleSelect's comment, :28-31) | new | A, D8, D9 |
| P13 | The Territory box shows a stored territory the list does not hold as "— unassigned —" (:1211-1214) | new | A, D9 |
| P14 | The manager is stored by NAME (`profile.manager`, users.mjs:145), against guide §18b77 rule 2 ("People are stored by their app id", :3988). A rename leaves it on the old name. The box is a list, against §18b77 rule 1 ("a type-ahead, never a list of everyone", :3987) | OPEN_ITEMS §4.6 :2520-2523; critic-correctness C6 | B, Q3, D15 |
| P15 | The forecast call sends the rep's whole calls map (SalesManagerTab.jsx:923-931; forecastCall.js:62-75, map) | OPEN_ITEMS §4.6 :2358-2363 | FILED (Q3) — its own small batch: a server branch that merges one figure, as `?quotas=true` merges one year (users.mjs:1012-1018). Its half here (the page re-sending calls) is closed by P1 |
| P16 | The page has no leave guard. AdminView hands UsersDetail no save slot (src/Tabs/AdminView.jsx:439), and the crumb's Users calls `onUsers` (UsersDetail.jsx:76, :1353), so unsaved edits are lost without a word (guide §18b63 rule 4, :3851) | new | FILED (Q5) |
| P17 | Every Admin/Manager PUT writes every column and the whole profile from its own read (users.mjs:281 → :613). Pins come from a later read (`before`, :1091, :1098). A write landing in between is put back (map-server F1) | the Pin race is filed (:2338-2343); the rest is new | FILED — with the Pin race ("Not now, file it"); a field-level write (as `?quotas=true` does) closes both |
| P18 | user-role.mjs writes the whole profile from a read made before a Clerk call (read :72-75, Clerk :93-107, write :118-119) | new (map-writers W11) | FILED |
| P19 | `PUT ?me` writes `role` from its own earlier read (users.mjs:440-441, :454, :463 — the row it writes carries `withRole(…, storedRole)`) | new (map-server F2) | FILED |
| P20 | A bare `{ id, name }` over a stored First/Last is stored as the old name, with a 200 (users.mjs:111). An unknown key is dropped without a word. A PUT that changes nothing still writes `user.updated` (:1130) | new (map-server F3, F4) | FILED (the page always sends the pair, and never an empty PUT) |
| P21 | The page shows the member as the roster held them at sign-in. useSettings.js:116 loads the roster; only Sync re-reads it (UsersDetail.jsx:1454, after the real write `POST /users-sync`, :1443) | new (map-client §1.4) | FILED (Q1 C is its fix) |
| P22 | Phone shows Mobile when Phone is empty (:1177). Clearing Phone shows Mobile again | new | FILED |
| P23 | The Email box says "Managed via Clerk — contact admin to change." (:1169), while the member can edit it in their own panel (AppHeader.jsx:606, :633) | new | FILED (words) |
| P24 | "Audit log — Last 5 changes" reads `settings.auditLog`, which nothing sets (:1280-1293, map). "Last login" reads `user.lastLoginAt` (:1271), which no function writes (grep of netlify/) | new (map-client §4) | FILED |
| P25 | The Dispatch technician card passes `desc=` (:1304), but `SectionCard` takes `description` (:108), so its line never shows | new | A rider, D12 |
| P26 | TeamModal's save drops deactivated and invited members from the roster on screen (TeamsDetail.jsx:24, :95) | new (map-writers §6.2) | FILED |
| P27 | TeamModal's territory- or vertical-only edit reaches no member's row (it PUTs only rows whose team or teamId changed, TeamsDetail.jsx:75-78), but shows on the roster (:62, :95) | new (map-writers §6.3) | FILED |
| P28 | A member's team NAME can differ from the team their id names: the rename cascade skips inactive members (TeamsDetail.jsx:24), and a member PUT can fail (:83-87). The digest, alerts and Reports read the name (_jobRoster.mjs:119-124, map) | new (map-teams §4b, §4c) | FILED (4b-3) |
| P29 | Two teams of one name can be made (TeamsDetail.jsx:50 checks only emptiness; settings.mjs:338 keeps any list, map) | new (map-teams §4a) | FILED (4b-3); this page's box numbers the second (D10) |
| P30 | A team change here moves no territory or vertical; the Teams page's Assign does (TeamsDetail.jsx:445) | map-client §5.2 | FILED (kept as today) |
| P31 | Deleting a member takes their id off no team's `repIds` or `managerId` (users.mjs:1175-1199, and the profile's Delete, UsersDetail.jsx:1049-1061, calls nothing that does — only a revoke's `dropRevokedRow` calls `teamsWithout`, :859) | new (map-teams §2.4; critic-correctness C16) | FILED |
| P32 | users-sync fills a blank `team` from Clerk's user-level `publicMetadata` (users-sync.mjs:124, :159). Whether an organization invitation's metadata lands there is unverified | new (map-teams §2.4) | FILED (a question) |
| P33 | The PUT does not lowercase an email (users.mjs:113 trims only). A name over 255 characters reaches Postgres (reasoned, unverified) | new (map-server F6, F7) | FILED (the page no longer sends the email) |
| P34 | Doc and comment drift, listed in full under P34 below | maps; designer; critiques | A/B — each fixed in the commit that touches it; flagged, since CLAUDE.md says never silently pick |
| P35 | Nothing writes `profile.managedReps` (OPEN_ITEMS :2570). B's `managerId` could be its home: a Manager's reps would be the members whose `managerId` names them | flag | FILED — flagged as a better approach, not wired (Manager scoping is its own decision) |
| P36 | UserModal's edit has no opener (useUserHandlers.js:13-16 defines `handleEditUser`; App.jsx:916, :1887 hand it on; its callers — map) | filed (OPEN_ITEMS §6 :3678-3680, map) | untouched |
| P37 | Deactivate, Reactivate, Delete user and Revoke invite on the page (:1025-1077, :1134-1149) | — | untouched — kept byte-identical (pins: member-status :45-104, invitations :92-103) |
| P38 | The role-list scan misses a frozen list: tests/roles.test.mjs:149's regex needs `=` then `[`, so `= Object.freeze([` passes. quoteRules.js:96 already holds `APPROVER_ROLES = Object.freeze(['Manager', 'Admin'])` outside roles.js | new (critic-correctness C7; reviser's grep) | FILED (a class item: widen the scan, move or name APPROVER_ROLES) |
| P39 | The Invite page sends `manager: r.manager` (UsersDetail.jsx:172); the invite path stores none (users.mjs:843-860 names no `manager`), so the key is dead | new (critic-correctness, "checked") | FILED |
| P40 | The profile panel's signature box reads empty after the avatar opens the panel: the click replaces the panel's form with six keys and no `emailSignature` (AppHeader.jsx:544), and the box reads `profileForm.emailSignature || ''` (:620). Save Profile then sends `emailSignature: undefined`, which JSON drops, so the stored one is kept — but it shows as none | new (reviser; read in code, not run) | FILED |
| P41 | A Manager or Admin moved to a team on this page lands on the team's member list (`repIds`), as today (:978); the Teams page lists only non-managers there (TeamsDetail.jsx:29-32) and counts a listed member who is also the team's `managerId` twice (:353-357) | new (critic-correctness C17) | FILED (D16) |

**P34, the drift in full** (each corrected to match the code in the commit that touches it, on Jeff's nod):
- Guide §18b95 rule 3 (:4173) names "the Sales Manager tab's Annual / Quarterly switch", which is gone since §0.203 (member-identity.test.mjs:167-169 pins its absence).
- Guide §18b98 rule 2 (:4209) and OPEN_ITEMS :2340-2341 say the pins are "kept as the merge read them". The PUT keeps them from `before`, a later read (users.mjs:1091, :1098).
- Guide §18b90 rule 5 (:4113) says "A member's own save sends only what changed". The panel's Save Profile sends seven fields (AppHeader.jsx:633).
- Guide :411 says "a partial payload silently wipes every field you omit". That has been untrue since the merge (users.mjs:241-297).
- Guide §18b99 rule 5 (:4243) says "the member profile page's whole-row save next" — stale once §0.211 lands.
- teamMembership.js:5-6 says the digest reads `teamId`; it reads the name (filed :2372).
- _selfProfile.mjs:4-6 says "The profile panel sends the entire roster row it holds" — untrue since §0.196 (AppHeader.jsx:182-201 sends `{ id, ...updates }`). A function file: fixed in step B (OPEN_ITEMS :2372 keeps it named until then).

---

## 2. Each IN place

**Who reaches the page:** an Admin only.
- The nav button is `{isAdmin && (` (App.jsx:2070-2077) and the render is `{activeTab === 'settings' && isAdmin && (` (App.jsx:2161) — map, confirmed by both critics.
- SettingsTab keys AdminView by org (`<AdminView key={activeOrgId}`, SettingsTab.jsx:63), so no page survives an org switch.
- UsersDetail renders the page with no key (`<UserProfilePage user={viewingUser} …/>`, UsersDetail.jsx:1469); `viewingUser` is set only from the list (:1638, :1695), while `peopleView` is null, so there is one mount per open.
- A Manager, Karen (Sales Rep) and every other role never mount it. The server's Manager branch (users.mjs:1075-1077) cannot be reached from it.

**The org rule, for every place:**
- The page's requests carry the caller's token, and `orgId` comes from it alone (auth.mjs:112, map).
- The users PUT reads its target by id AND org (users.mjs:1070-1071); none is a 404 (:1072-1074).
- `requestOrg()` runs once per save, and `stillOrg` runs after every answer, before any write and before any shared setter (guide §18b68; late-answers.test.mjs's scan, :117-186).
- The options come from the active org's `settings.teams`, `settings.users` and `settings.territories`. No fetch is added.

### Step A — the page (§0.211)

#### P1, P2, P7, P8, P9, P10, P11 — `handleSave` (UsersDetail.jsx, CRLF)

**Before** — :923-1015. The lines that decide:
- :937 `const { active: _active, status: _status, clerkUserId: _login, pinnedReports: _pins, ...edited } = form;`
- :938 `const toSave = { ...edited, teamId: teamIdNamed(settings.teams, form.team) };`
- :940 the PUT.
- :945 `const storedName = d.user?.name ?? toSave.name;`
- :959-969 the role (`const priorRole = user.role || 'User';`; `if (!rr.ok) throw new Error(rd.error || 'Could not change the role.');`).
- :971-992 the team and manager syncs by name.
- :995-1002 the list PUT.
- :1005-1011 the local state; :1012-1014 `} catch(err) { … } finally { setSaving(false); }`.

**After** — the whole function (:923-1015 replaced). The order is: the member, then the teams' lists, then the role. The lists depend only on the member's PUT, and `dbWrite` never throws (storage.js:108-116), so a role request that fails — refused or never answered — cannot leave a saved team without its list (critic C1/F2):
```js
    const handleSave = async () => {
        if (!String(form.name ?? '').trim()) { setError('A member needs a name.'); return; }
        // Only what changed (state §0.211 — Jeff, 15 Oct: "Send only what changed"; 16 Oct: "File it, own batch
        // next"): the fields this page edits that differ from the member as it holds them — a Full name with First
        // and Last cleared ("Yes, Full name wins"), a team by its id with its name (memberSave.js). The server keeps
        // every key it stores that a save leaves out (users.mjs mergeForUpdate): what the member, a forecast call or
        // the Teams page changed since the page opened stays. Never access, the status, the login or the pins.
        const changes = memberChanges(user, form);
        const roleNew = roleChanged(user, form);
        if (!Object.keys(changes).length && !roleNew && !listOwed) return;
        setSaving(true); setError('');
        const askedOrg = requestOrg();   // cut by an org switch, it stops (state §0.175)
        let row = null;                  // the member as stored, once a request here has landed
        let move = listOwed;             // the teams' lists to move: one owed from an earlier save, or this save's team
        let roleLanded = false, teamsNow = null, owedNext = listOwed;
        const missed = [];               // what did not land, in the server's words
        try {
            if (Object.keys(changes).length) {
                const toSave = { id: user.id, ...changes };
                const resp = await dbFetch('/.netlify/functions/users', { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(toSave) });
                const d = await resp.json().catch(() => ({}));
                if (!stillOrg(askedOrg)) return;
                if (!resp.ok) throw new Error(d.error || 'Save failed');
                // The row as stored (state §0.196): the name trimmed or rebuilt, every key this save left out as kept.
                row = d.user || { ...user, ...toSave };
                if ('teamId' in changes) move = { teamId: row.teamId || null };
            }
            // The teams' lists follow the member's team, by id, straight after the member's row (state §0.211): they
            // depend on nothing else, and dbWrite never throws, so no later request can leave a saved team unlisted.
            if (move) {
                const { teams: moved, changed } = teamsWithMemberOn(settings.teams, user.id, move.teamId);
                if (!changed) owedNext = null;
                else {
                    const rt = await dbWrite('/.netlify/functions/settings', { method:'PUT', body: JSON.stringify({ teams: moved }) });
                    if (!stillOrg(askedOrg)) return;
                    if (rt.ok) { teamsNow = moved; owedNext = null; }
                    else { owedNext = move; missed.push(`Saved, but the team list was not updated \u2014 ${rt.error}. Save changes tries the list again.`); }
                }
            }
            // (the comment block :947-958 kept as it stands — user-role.mjs is the one path that changes a role)
            if (roleNew) {
                const rr = await dbFetch('/.netlify/functions/user-role', {
                    method: 'PUT', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ targetUserId: user.id, role: form.role }),
                });
                const rd = await rr.json().catch(() => ({}));
                if (!stillOrg(askedOrg)) return;
                if (rr.ok) {
                    roleLanded = true;
                    row = { ...(row || user), role: form.role, userType: form.role };
                    setRoleNote('Role updated \u2014 it can take up to 30 seconds to take effect.');
                } else if (!row && !teamsNow) {
                    throw new Error(rd.error || 'Could not change the role.');
                } else {
                    missed.push(`Saved, but the role was not changed \u2014 ${rd.error || 'try again.'}`);
                }
            }
        } catch (err) {
            missed.push(row || teamsNow ? `Saved, but not everything \u2014 ${err.message || 'no answer'}. Reload to see what was saved.` : (err.message || 'Failed to save. Please try again.'));
        } finally { setSaving(false); }
        if (!stillOrg(askedOrg)) return;   // a request that failed after an org switch changes nothing here
        if (row) {
            setUser(row);
            setForm(prev => formAfterSave(prev, form, row, roleNew && !roleLanded));
        }
        if (row || teamsNow) {
            setSettings(prev => ({
                ...prev,
                ...(row ? { users: (prev.users||[]).map(u => u.id === row.id ? { ...u, ...row } : u) } : {}),
                ...(teamsNow ? { teams: teamsNow } : {}),
            }));
        }
        // An Admin's own row: the header's name follows at once, the profile panel when next opened (OPEN_ITEMS §4.3).
        if (row) setMyProfile(prev => (prev && prev.id === row.id ? { ...prev, ...row } : prev));
        setListOwed(owedNext);
        if (missed.length) setError(missed.join(' '));
        else { setSaved(true); setTimeout(() => setSaved(false), 2500); }
    };
```

Lines kept byte-identical:
- `body:JSON.stringify(toSave) });` stays the file's only match (grep finds 1 today), so harness :4616 keeps its anchor.
- The blank-name line stays (harness :7762; member-names.test.mjs:405).
- `'Role updated \u2014 it can take up to 30 seconds to take effect.'` (:968) stays.
- `} finally { setSaving(false); }` stays — today it is at :205 (the Invite page) and :1014; both remain, so no anchor may use it alone (§6).

**Escapes (critic C18).** A JS string or template literal in this file writes the dash as `\u2014` where the file's neighbours do (:25, :39, :968), and the new strings above do so. **JSX text keeps the literal character** — JSX text does not process JS escapes, and the file's JSX writes "—" (:1169, :1198, :1205). The design's quoted strings show "—" where the source writes either; the builder follows the line's own kind.

Above it, :904-921 become:
```js
const UserProfilePage = ({ user: opened, settings, onBack, onUsers, mfaByEmail }) => {
    const { setSettings, showConfirm, setMyProfile } = useApp();
    // The member as this page holds them (state §0.211): the roster's row it opened on, then the row as stored after
    // each save — what the title band, the crumb and "Save changes" read (OPEN_ITEMS §4.3, "after a save").
    const [user, setUser]     = useState(opened);
    const status = memberStatus(user);
    const [form, setForm]     = useState({ ...user });
    const [saving, setSaving] = useState(false);
    const [saved,  setSaved]  = useState(false);
    const [error,  setError]  = useState('');
    // A team saved on the member whose list move did not land: { teamId } — the next Save tries it again (§0.211).
    const [listOwed, setListOwed] = useState(null);
    const dirty = Object.keys(memberChanges(user, form)).length > 0 || roleChanged(user, form) || !!listOwed;

    const teamOpts = teamOptions(settings.teams);
    const teamHeld = heldTeam(form, teamOpts);
    const mgrOpts  = managerOptions(settings.users, user.id);
    const mgrHeld  = heldManager(form, mgrOpts, settings.users, user.id);
    const allTerr  = [...new Set((settings.territories || []).map(t => typeof t === 'string' ? t : t.name).filter(Boolean))].sort();
    const terrHeld = heldTerritory(form.territory, allTerr);

    const [roleNote, setRoleNote] = useState('');
    // A Full name typed is sent with First and Last cleared, whatever the page first held (memberSave.js — §0.196;
    // Jeff: "Yes, Full name wins"): the server builds the name from First and Last first.
    const handleChange = (field, val) => setForm(prev => ({ ...prev, [field]: val }));
    // A team is picked by its id and saved with its name (§0.211); unassigned clears both (memberPickers.js).
    const pickTeam = (id) => setForm(prev => ({ ...prev, ...teamPicked(teamOpts, id) }));
```

Notes on the edit:
- **The prop is renamed `opened`, and `user` is now state.** Every read of `user` below reads the member as held, with **unchanged text**:
  - the band :1118-1123, the crumb :1113, the four confirms :1026-1066, Security :1240, the audit card :1281-1291, and `user.active !== false` at :1136.
  - So these pins hold: member-status.test.mjs's `'    const status = memberStatus(user);'` and its deactivate/reactivate paths (`u.id === user.id ? { ...u, ...row } : u`, :1031, :1043), invitations.test.mjs:98-102, and the harness's UsersDetail.jsx entries listed by the anchor lister (none quotes :904-921 or :1195-1215; grep for the prop line, `useState({ ...user })`'s neighbours, `allMgrs` and `allTeams` in tests and the harness finds none).
- **Kept and dropped lines.** `useState({ ...user })` (:907) stays byte-identical. `allTeams` and `allMgrs` (:913-914) go. `allTerr` (:915) stays as written. TDZ: `user`, `form` and `listOwed` are declared before `dirty`; `teamOpts` before `pickTeam`.
- **Imports.**
  - :10 `import { teamIdNamed, teamsWithMembers, teamsWithout } from '../../../utils/teamMembership.js';` → `import { teamIdNamed, teamsWithMembers, teamsWithout, teamsWithMemberOn } from '../../../utils/teamMembership.js';`. `teamIdNamed` is still the Invite page's (:172).
  - Two new lines after :10: `import { memberChanges, roleChanged, formAfterSave } from '../../../utils/memberSave.js';` and `import { HELD_TEAM, teamOptions, teamPicked, heldTeam, managerOptions, heldManager, heldTerritory } from './memberPickers.js';`
- **The button.** :1150 → `{dirty && <PeoplePriBtn onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</PeoplePriBtn>}`. "✓ Saved" goes, because the button leaves once nothing waits. The green banner at :1155 stays. No pin holds :1150 (grep).

**What Jeff (Admin) sees on screen:**
- Save sends only the boxes he changed.
- The band, avatar and crumb show the member as stored at once: a rename shows the new name, and a role change the new role.
- "Save changes" leaves, and the green "✓ Changes saved successfully." shows for 2.5 s.
- A Role change alone sends no member PUT.
- When he renames his own row, the header reads the new name at once (`setMyProfile`; App.jsx:209 is `const currentUser = myProfile?.name || clerkName;`). His profile panel, next opened from the avatar, refills its First and Last from the new name (AppHeader.jsx:544: `firstName: myProfile?.firstName || currentUser.split(' ')[0]` — the rename stored First/Last as none), so its Save Profile no longer rebuilds the old name (P10).
- A refused role after a saved field shows red "Saved, but the role was not changed — You cannot change your own role. Ask another Admin." (user-role.mjs:85-86's words, sent only for his own row). The Role box stays on what he picked, the band shows the stored role, and "Save changes" stays; pressing it sends the role alone.
- A refused list shows red "Saved, but the team list was not updated — <the server's words>. Save changes tries the list again." The next Save sends only the list. `dbWrite`'s words (storage.js:89-98): a 403 reads "You do not have permission to make this change."; a JSON `error` reads as itself, with "(ref …)" when the answer carries a `requestId`; anything else reads "The server returned 500." (its status); no answer reads "Network error — the change was not saved." (:100, :114).
- A role request that gets no answer after the member and list landed shows "Saved, but not everything — <message>. Reload to see what was saved." The list has already moved, so a reload loses nothing; the Role box keeps his pick.

**What a save never sends (checked):** `active`, `status`, `clerkUserId`, `pinnedReports`, a quota key, `quota`, `email`, `mobile`, preferences, signature, timezone, `forecastCalls`, `vertical`, `userType` and `teamJoinedAt`. None is in `PAGE_FIELDS` (§3). The server keeps each that it stores anyway (§4) — except `quota`, a column the body sets (users.mjs:116, :236), which the page no longer sends. The name rule (users.mjs:1124) runs on the rebuilt name, through `nameRefusal(roster, name, selfId)` (memberName.js:31), whose `selfId` lets a member keep their own name.

**Class scans (checked against their code):**
- **deal-modal-saves.test.mjs:136-141** takes the handler as the second enclosing function (`fns[1]`). For the new `setSettings`, that is `handleSave`, which calls `dbFetch` (SERVER, :107), so it passes. `setMyProfile` is not in its SHARED list (:104-105).
- **late-answers** (the rule :11-16; the boundary is the last await that runs before the point, :168, and any check in the text between passes it, :180): each shared set after the requests (`setSettings`; `setMyProfile`, org-bound — useUIState.js:27) has an in-try `if (!stillOrg(askedOrg)) return;` after its last await, so the scan passes with or without the post-catch check. **The post-catch check is therefore proved by S10 R11 alone** (and its harness entry), not by the scan (critic C21). It is needed because a rejected `dbFetch` (storage.js:71 rethrows) reaches `catch` with no check.
- `setUser`, `setForm`, `setListOwed`, `setRoleNote`, `setSaving`, `setSaved` and `setError` are this component's own `useState` (local, late-answers :127).
- **check:dbfetch:** both Responses are `.json()`ed. `dbWrite` answers `{ ok, status, error, data }` (storage.js:108-116).
- **check:inline:** no component is declared inside the page (`pickTeam` is a handler).
- **check:dupes:** the `setSettings` updater's keys are spreads, no static key twice.

**Risk:**
1. A save that lands on a field another session changed since wins on that field (Q1 A).
2. The page no longer heals, or mis-heals, a member's team by name. §0.168's every-save derive moved members of a second same-named team onto the first, cleared valid teams, and set an id for a name-only team — all silently. A member holding a name with no id now shows "(not linked to the team list — pick it again)" (P3).
3. Typing during a save: `formAfterSave` keeps what was typed (§3). The box fields stay editable while saving, as today.
4. An org switch mid-save: AdminView remounts (keyed by org), `finally` still clears the flag, and the post-catch `stillOrg` stops every shared write. What landed stays. A team saved whose list move had not yet been sent stays unlisted — P28's drift — because the remount drops `listOwed`.
5. A refused list that is not retried before a reload or leaving the page leaves the member's team without its list (the same drift); the words say to press Save changes.

#### P3, P12, P13 — the three boxes (UsersDetail.jsx :1195-1215, CRLF; JSX text, literal "—")

**Before** (:1196-1214): the Team select over `allTeams` names (`value={form.team||''}`), the Manager select over `allMgrs`, and the Territory select over `allTerr`.

**After:**
```jsx
                                <label style={lbl}>Team</label>
                                <select style={sel} value={teamHeld ? HELD_TEAM : (form.teamId || '')} onChange={e=>pickTeam(e.target.value)}>
                                    <option value="">— unassigned —</option>
                                    {teamHeld && <option value={HELD_TEAM} disabled>{teamHeld}</option>}
                                    {teamOpts.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
                                </select>
…
                                <label style={lbl}>Manager</label>
                                <select style={sel} value={form.manager||''} onChange={e=>handleChange('manager',e.target.value)}>
                                    <option value="">— none —</option>
                                    {mgrHeld && <option value={form.manager} disabled>{mgrHeld}</option>}
                                    {mgrOpts.map(o=><option key={o.id} value={o.name}>{o.name}</option>)}
                                </select>
…
                                <label style={lbl}>Territory</label>
                                <select style={sel} value={form.territory||''} onChange={e=>handleChange('territory',e.target.value)}>
                                    <option value="">— unassigned —</option>
                                    {terrHeld && <option value={form.territory} disabled>{terrHeld}</option>}
                                    {allTerr.map(t=><option key={t}>{t}</option>)}
                                </select>
```
(Step A keeps the Manager box a dropdown because it still stores the name; step B makes it a type-ahead by id — D15.)

**What it shows:**
- The Team box lists each team of the org's list once, by name; a second "East" shows as "East (2)" (in list order, then sorted).
- A team the member holds that the list does not offer shows greyed, as itself:
  - "East (no longer on the team list)" when the id is gone ("A team (…)" when there is no name either);
  - "East (not linked to the team list — pick it again)" for a name with no id, where a team of that name is offered (an invitation before §0.168; a Resend whose row was removed between the page's read and the server's lookup — the Resend sends the name alone, UsersDetail.jsx:870, and only a new row takes it as sent, users.mjs:843-856; an existing row keeps its profile, :823-830);
  - "East (not on the team list)" when no team has that name.
- The Manager box offers members with access whose role is Admin or Manager (roles.js `canSeeAll`), never this member. A stored name it does not offer shows greyed: "(no member has this name now)", "(deactivated)", "(invited, not yet joined)", the member's role label ("(Sales Rep)", "(Dispatcher)" …), or "(this member)".
- The Territory box shows "West (not on the territory list)".
- Nothing is sent for a box that was not changed.

**Org rule:** the options are this org's lists.

**Risk:** a plain-string team (from pre-object lists) is no longer offered; whether any org holds one is unverified. A member on one reads "(not on the team list)". What a browser shows for a disabled option chosen as the value is taken from RoleSelect's working pattern (UsersDetail.jsx:35-43), not observed this session.

#### P4 — the teams' lists follow by id (teamMembership.js, LF; §3) — Q4 A

`teamsWithMemberOn(settings.teams, user.id, move.teamId)` replaces :971-981. It works by id: the member comes off every other list and onto the new team's, once. It runs only on a team change (with the team as stored) or an owed retry.

**What it shows:** the Teams page counts (repIds ∩ active, TeamsDetail.jsx:352-357) and Unassigned (by `teamId`, :349) agree after a move. Changing the team and changing it back puts the member back on their own team's list.

**Risk:** the list is still the app's copy (P6, filed). A member listed on two teams is taken off the other one, since a member is on one team. A Manager moved here goes on the team's member list, as today (P41, D16).

#### P5 — the Manager box no longer rewrites the team's manager — Q2 A

:983-992 (`const newManagerName = form.manager; … t.name === newTeamName ? { ...t, managerId: mgr.id } : t`) are removed.

**What it shows:** a member's "reports to" changes only that member. A team's manager is set on the Teams page (TeamModal's Manager select, TeamsDetail.jsx:124-128).

**Risk:** an Admin who set team managers through member profiles must now use the Teams page. The state entry says so.

#### P25 — the rider (UsersDetail.jsx:1304, CRLF) — D12

`<SectionCard title="Dispatch technician" desc="Field technicians are managed in the Dispatch tab.">` → `<SectionCard title="Dispatch technician" description="Field technicians are managed in the Dispatch tab.">`.

**What it shows** (where the org has Dispatch on): the card's line under its title.

#### P34 — the doc and comment drift (each in the commit that touches it) — see §10.

### Step B — the manager by id (§0.212) — Q3 A

#### P14 — server (users.mjs, CRLF; linkIds.js, LF; _links.mjs, LF; _selfProfile.mjs, LF)

- **users.mjs after :32:** `const MANAGER_LINK = [{ key: 'managerId', kind: 'member', notSelf: true }];`, with the comment "A member's manager is a member of this org, by id (state §0.212 — guide §18b77 rule 2): asked only when a write names one anew, never the member themselves".
- **sanitize, after :145** (`manager: data.manager || null,`): `managerId:     data.managerId     || null,`. The merge keeps a stored one when a body leaves it out (flatten spreads the profile, :226; the merge, :285). No line naming `sanitize` is added, so member-identity's every-mention pin holds (map).
- **The PUT, after :1121** (the team check; its line is untouched):
  ```js
                const managed = await checkLinks(MANAGER_LINK, data, { id: data.id, managerId: before?.profile?.managerId ?? null }, orgId);
                if (managed.error) return { statusCode: managed.status, headers, body: JSON.stringify({ error: managed.error, field: managed.field }) };
  ```
  How `linksAsked` treats it (linkIds.js:114-127):
  - it asks only a key the body names (:119), and never the held id (:121-122);
  - a non-string is refused 400 `NOT_AN_ID` (:120, :108-109);
  - the member themselves is refused 400 (`notSelf`, :123 — the self is `stored.id`, :116; `namesItself('member')` → "A member cannot name itself.", :45);
  - an id no member of this org holds is refused 404 (`notInOrg('member')` → "That member is not in your organization — pick one from the list.", :43, :136);
  - the member kind reads `users` by org, fresh (_links.mjs:57, :66).
- **The create, after :933:** `const managed = await checkLinks(MANAGER_LINK, data, null, orgId);` and the same refusal line. (A create mints its id, :925, so `notSelf` cannot meet it.)
- **`?me`:** `managerId` is not in `SELF_EDITABLE_KEYS` (_selfProfile.mjs:14-26), so it is dropped and the stored one kept. tests/self-profile.test.mjs's `ADMIN_ONLY` (:25-31) gains `'managerId'` (critic F21), so a later allowlist edit that lets a member set their own manager fails. _selfProfile.mjs:4-6's stale comment is corrected in this step (P34).
- **users-sync** patches columns only on an existing row (users-sync.mjs:152-190) and never the profile, so a stored `managerId` is kept. user-role.mjs writes `{ ...(target.profile || {}), userType: role }` (:119), which keeps it too.
- **The restore's clean-up:**
  - `memberLinksCleared(profile, teams, reports, members)` (linkIds.js:252) gains, after the team line: `if (members && profile.managerId != null && profile.managerId !== '' && !members.has(profile.managerId)) { patch.managerId = null; cleared++; }`. With no `members` it behaves as before.
  - `clearMemberLinks` (_links.mjs:296-325) adds, after :304, `const members = await liveIdsInOrg('member', held.map((m) => own(m.profile).managerId), orgId);` and passes it on at :310.
  - The patch merges into the stored profile (:313-316); nothing else is written. No anchor on :300-:321 is split (each is one line, anchor lister).

#### P14 — client

- **memberSave.js:** `PAGE_FIELDS` gains `'managerId'` **after `'manager'`** — `['name', 'title', 'phone', 'team', 'teamId', 'manager', 'managerId', 'territory']` — so the line still ends `'territory']` and A's two PAGE_FIELDS anchors hold (critic F6). A new pair line: `if ('manager' in out || 'managerId' in out) { out.manager = form.manager ?? null; out.managerId = form.managerId ?? null; }`.
- **memberPickers.js:**
  - `managerOptions` already answers `{ id, name }` in step A, so B does not change it (F6).
  - `heldManager(form, options, users, selfId)` (already taking `form` in A) gains an id branch above A's name line: an id no offered member holds reads "(no longer a member)" when no member has it, else the held words by that member's status or role. A name with no id, where an offered member has the name, reads "(not linked — pick them again)".
  - `managerNameOf(member, users)` answers the name of the member the id names, else the stored name.
  - `managerPicked(options, id)` answers `{ manager, managerId }` together; '' clears both.
- **UsersDetail.jsx:**
  - The Manager box becomes a single-pick type-ahead of `mgrOpts` (D15) — the house pattern is `PeopleChooser`'s (src/components/documents/atoms.jsx:177-, multi-pick, the shared matcher `peopleMatching`), adapted to one pick in a module-scope component (CLAUDE.md: never inside the page). Its held member shows as itself with its words, as in A.
  - The readers:
    - :1122 `reports to {user.manager || '—'}` → `reports to {managerNameOf(user, settings.users) || '—'}`;
    - :1481 `manager: u.manager || null,` → `manager: managerNameOf(u, settings.users),`;
    - the export :343 `if (f === 'Manager') return \`"${u.manager||''}"\`;` → `…${managerNameOf(u, settings.users) || ''}…`. The export's Preview card prints only Name, Email and Role (:421-426), so it changes nothing there.

**What it shows:** the Users list, the band and the downloaded export name a member's manager as they are named now, after a rename.

**Re-points B makes in A's work (critic F6):** S8's held-manager cases grow the id branch; S11's Manager-select pins move to the type-ahead's lines; no A harness entry is retired (A's PAGE_FIELDS, managerOptions and heldManager anchors are untouched by the insertions above). The stale-anchor and uniqueness pre-check runs on B's tree as well as A's.

**Risk:** rows from before §0.212 hold a name and no id. They read as before, and the box shows "(not linked — pick them again)" until someone is picked. B is a functions deploy, so the stale functions cache applies (CLAUDE.md).

---

## 3. Shared helpers (pure, with contracts)

**src/utils/memberSave.js (new, LF)** — the body and the after-state:
```js
// memberSave.js — what the member profile page (Settings → Users) sends (state §0.211 — Jeff, 15 Oct: "Send only
// what changed"; 16 Oct: "File it, own batch next"). Pure, so the rules run under node --test.
// The page edits seven fields of the member's flat row (users.mjs flatten: the profile's keys and the columns side
// by side). A save sends those that differ from the member as the page holds them — the row it opened on, then the
// row as stored after each save — and nothing else: never access, the status, the login or the pins (§0.202,
// §0.205), never a field it only shows (the email) or does not show. The server's merge keeps every key it stores
// that a save leaves out (users.mjs mergeForUpdate). The role is not one of them: user-role.mjs alone changes it.

// A team is two fields: its id (the link — guide §18b98 rule 1) and its name (text the digest, alerts and Reports
// read), always sent together.
export const PAGE_FIELDS = Object.freeze(['name', 'title', 'phone', 'team', 'teamId', 'manager', 'territory']);

// '', null and absent are one value: the server stores each as none (users.mjs sanitize, `|| null`).
const blank = (v) => v === null || v === undefined || v === '';
export const sameValue = (a, b) => (blank(a) && blank(b)) || a === b;

// The body of a save, less its id: each page field that differs from `first`, as the form holds it.
export function memberChanges(first, form) {
    const out = {};
    for (const k of PAGE_FIELDS) if (!sameValue(first?.[k], form?.[k])) out[k] = form[k] ?? null;
    // A Full name typed is the member's name (§0.196; Jeff: "Yes, Full name wins"): the server builds the name from
    // First and Last first, so they are cleared with it — always, for they may have been set since the page opened.
    if ('name' in out) { out.firstName = null; out.lastName = null; }
    // A team is its id and its name together: the server never pairs them.
    if ('team' in out || 'teamId' in out) { out.team = form.team ?? null; out.teamId = form.teamId ?? null; }
    return out;
}

// Whether the Role box names another role than the member's, by the users.role column — never `userType`, the
// profile's stale copy (§0.163). An unknown stored role, untouched, is no change.
export const roleChanged = (first, form) => !!form?.role && form.role !== (first?.role || 'User');

// The form once a save landed: the member as stored, but for a field typed while the save was out (it differs from
// what was sent) and the role when it did not land (keepRole) — those still wait for Save.
export function formAfterSave(current, sent, stored, keepRole) {
    const next = { ...stored };
    for (const k of PAGE_FIELDS) if (!sameValue(current?.[k], sent?.[k])) next[k] = current[k];
    if (keepRole || !sameValue(current?.role, sent?.role)) next.role = current?.role;
    return next;
}
```
Contracts for `memberChanges`:
- It never answers a key outside `PAGE_FIELDS` ∪ {firstName, lastName}.
- It answers `{}` when nothing changed.
- `firstName` and `lastName` are `null` exactly when `name` is in it.
- `team` and `teamId` are both present or neither.

**src/Tabs/settings/people/memberPickers.js (new, LF)** sits beside memberStatus.js, whose rule it reads (one rule for the list, the profile and the export — UsersDetail.jsx:1473). It takes the roles from roles.js and spells out no role list (critic C7/F16; tests/roles.test.mjs:135-153, tests/role-vocabulary.test.mjs:123-155):
```js
// memberPickers.js — the member profile page's Team, Manager and Territory boxes (state §0.211). Pure. A value the
// options leave out is shown as itself, greyed — never as the first option, which is what a <select> shows for a
// value none of its options holds (UsersDetail.jsx, RoleSelect's comment; guide §18b101).
import { memberStatus } from './memberStatus.js';
import { ROLE_OPTIONS, canSeeAll } from '../../../utils/roles.js';

const ROLE_LABEL = Object.fromEntries(ROLE_OPTIONS.map((o) => [o.value, o.label]));
const blank = (v) => v === null || v === undefined || v === '';

// The held team's option value — no team id is ever this.
export const HELD_TEAM = '__held__';

// Every team of the org's list that has an id, by name, sorted; a second team of one name reads "East (2)" (in list
// order), so each can be told apart. An old plain-string entry has no id and is not offered.
export function teamOptions(teams) {
    const seen = new Map();
    return (teams || [])
        .filter((t) => t && typeof t === 'object' && typeof t.id === 'string' && t.id && t.name)
        .map((t) => {
            const n = (seen.get(t.name) || 0) + 1;
            seen.set(t.name, n);
            return { value: t.id, name: t.name, label: n > 1 ? `${t.name} (${n})` : t.name };
        })
        .sort((a, b) => a.label.localeCompare(b.label));
}

// The form's team once one is picked: its name and its id together; '' (unassigned) clears both.
export function teamPicked(options, id) {
    const t = (options || []).find((o) => o.value === id);
    return { team: t ? t.name : '', teamId: t ? t.value : '' };
}

// The member's team when the options do not hold it: null, or the words its greyed option shows.
export function heldTeam(form, options) {
    const id = form?.teamId, name = form?.team;
    if (blank(id) && blank(name)) return null;
    if (!blank(id)) return (options || []).some((o) => o.value === id) ? null : `${name || 'A team'} (no longer on the team list)`;
    return (options || []).some((o) => o.name === name) ? `${name} (not linked to the team list \u2014 pick it again)` : `${name} (not on the team list)`;
}

// Who the Manager box offers: a member of the org with access now whose role holds other members' records — an
// Admin or a Manager (roles.js canSeeAll; the set the Teams page's manager picker offers) — never the member
// themselves. { id, name }, by name (§0.212 stores the id).
export function managerOptions(users, selfId) {
    return (users || [])
        .filter((u) => u && u.name && u.id && u.id !== selfId && canSeeAll(u.role) && memberStatus(u) === 'Active')
        .map((u) => ({ id: u.id, name: u.name }))
        .sort((a, b) => a.name.localeCompare(b.name));
}

// The member's manager when the options do not offer them: null, or the words its greyed option shows.
export function heldManager(form, options, users, selfId) {
    const name = form?.manager;
    if (blank(name) || (options || []).some((o) => o.name === name)) return null;
    const m = (users || []).find((u) => u && u.name === name);
    if (!m) return `${name} (no member has this name now)`;
    if (m.id === selfId) return `${name} (this member)`;
    const status = memberStatus(m);
    if (status === 'Deactivated') return `${name} (deactivated)`;
    if (status === 'Invited') return `${name} (invited, not yet joined)`;
    return `${name} (${ROLE_LABEL[m.role] || m.role || 'no role'})`;
}

// The member's territory when the list does not hold it.
export const heldTerritory = (name, names) => (blank(name) || (names || []).includes(name) ? null : `${name} (not on the territory list)`);
```
Note: the app's copy of a member carries `userType` equal to `role` (flatten, users.mjs:232-233), so reading `role` here and TeamModal's `userType || role` (TeamsDetail.jsx:25-28) offer the same set today.

**src/utils/teamMembership.js (LF) — appended after `teamsWithout` (:43-51).** Appending means no existing anchor (teamMembership.js :15, :33, :34, :36, :48 — anchor lister) meets an earlier copy of its text, and the new texts differ from theirs (`held`, not `listed` or `t.repIds`; `[...held, memberId]`):
```js
// The teams with `memberId` on the list of the team `teamId` names and on no other (state §0.211) — the member profile
// page's team change, by id: off every other list, onto the new team's once; null takes the member off every list.
// An old plain-string entry has no list and is left as it is; a team with no list gets one when it is the member's.
// `changed` says whether there is anything to save; an untouched team is the same object.
export function teamsWithMemberOn(teams, memberId, teamId) {
    let changed = false;
    const next = (teams || []).map((t) => {
        if (!memberId || !t || typeof t !== 'object') return t;
        const held = Array.isArray(t.repIds) ? t.repIds : [];
        const on = held.includes(memberId);
        if (teamId && t.id === teamId) {
            if (on) return t;
            changed = true;
            return { ...t, repIds: [...held, memberId] };
        }
        if (!on) return t;
        changed = true;
        return { ...t, repIds: held.filter((id) => id !== memberId) };
    });
    return { teams: next, changed };
}
```
The header comment at :5-6, "(coaching notes addressed to a team, the manager digest — _coaching.mjs, digest.mjs)", becomes "(coaching notes addressed to a team — _coaching.mjs; the manager digest and pipeline alerts read the team's NAME, _jobRoster.mjs)" (P34; OPEN_ITEMS :2372).

---

## 4. The server

**Step A: no change.** A partial body already keeps every key the server stores. The proof lines:
- **The merge** lays the body over the stored row: `return { ...flatten(existing), ...data, clerkUserId: existing.clerkUserId || null, status: existing.profile?.status || null, active: isAccessChange(data) ? data.active : existing.active, ...storedQuota(existing.profile) };` (users.mjs:284-296).
  - A key left out keeps its stored value (the comment at :261-265 says so).
  - The login, status and access are the stored ones whatever is sent; so are the quota plan and figures, `QUOTA_KEYS` (`quotaPlans`, `annualQuota`, `q1Quota`–`q4Quota`, `quotaType` — quotaPlan.js:66, :68). The `quota` COLUMN is not: flatten gives `quota: row.quota` (:236) and sanitize takes `data.quota` (:116). The page no longer sends it (critic C10).
  - `flatten` spreads the whole profile (:226), but `sanitize` rebuilds the profile from its own list of keys (:119-169), so "kept" means every key sanitize knows; a profile key outside it is dropped by every PUT (C10).
- **The rebuild:** `sanitize({ ...merged, userType: storedRole })` (:1087) rebuilds the row from that merge. The role is stripped at the write (`const { id, role: _keepStoredRole, ...updateData } = clean;`, :610) and kept (:1083).
- **Pins:** `clean.profile = { ...clean.profile, pinnedReports: Array.isArray(before?.profile?.pinnedReports) ? before.profile.pinnedReports : null };` (:1098).
- **The team's date** moves only when the id does: `if (before && prevTeam !== nextTeam) clean.teamJoinedAt = nextTeam ? new Date() : null;` (:1094). A body without `teamId` never moves it.
- **The team link** is asked only when named anew: `checkLinks(TEAM_LINK, data, { teamId: before?.profile?.teamId ?? null }, orgId)` (:1120; linkIds.js:119). `teamId: ''` is no link (linkIds.js:105-109, :49), so unassigned is accepted and clears the date.
- **The name:** `((data.firstName || '') + ' ' + (data.lastName || '')).trim() || String(data.name ?? '').trim() || 'Unnamed User'` (:111). So a Full name must ride with `firstName: null, lastName: null`; memberChanges does that. integration/member-names :220-231 (map) holds both halves.
- **The answer** is the row as stored, `{ user: flatten(result) }` (:1131), and that is what the page adopts.
- **Already proven for a partial body:** integration/member-links :320-329 shows `{ id, forecastCalls }` keeping name, team, teamId, pins and teamJoinedAt (map). Nothing yet proves it for the contact and preference keys; I1 guards that (§5.3).
- **user-role.mjs** answers `{ ok, userId, clerkUserId, role, priorRole, note }` and no row (:139-146). The page lays `role`/`userType` over its row itself; flatten reads both off the column (users.mjs:232-233). It reads the target's profile fresh (:72-75) after the member's PUT has landed (the page sends them in turn), so it does not put that save back.

**What step A does not close (filed, P17-P20): the server's own read-to-write window.**
- Every PUT writes every column and the whole profile from `mergeForUpdate`'s read (:281), several queries before the UPDATE (:613).
- A write landing in between is put back. Only `quotaPlans` is taken at write time (`keepQuotaPlans`).
- "Only what changed" ends the page's hours-old copy; it does not end those milliseconds.
- A field-level write would close this and the Pin race together: `set` only the columns named, and `profile = coalesce(profile,'{}') || jsonb_build_object(<sent keys>)`, as `?quotas=true` does at :1012-1018.
- Its cost: it moves member-identity's PUT-order pin (guide §18b95 rule 7), member-names :274-304, member-links T5 and about 20 harness entries (map). It is Jeff's call, and it is filed.

**Step B: the change** is §2 P14: MANAGER_LINK, `managerId` in sanitize, the PUT's and the create's checks, and the restore's clean-up.

---

## 5. Tests

**Gate order (CLAUDE.md), each step:**
1. check:tdz, check:inline, check:dupes, check:dbfetch, check:fnscope, check:handoff.
2. `npm run build` (then `rm -rf dist`).
3. `npm test` (`node --test`, which finds the new suite), then `npm run test:int`.
4. The stale-anchor and uniqueness pre-check: every harness anchor parsed against THIS step's tree (memory), A's tree and again B's.
5. `node scripts/mutate-import.mjs`: a green baseline printed first; never with `netlify dev` up; never stopped; about 3.5 h (memory); `git status` after; the log's own summary line read.
6. The pane.

**Re-cut from Jeff's answers before the build:** the tests below follow the Recommended answers.
- Q2 B/C keeps a manager sync, so S10's R13, the "every save makes the member's manager…" entry and P5's pins change.
- Q3 B drops every "(B)" item.
- Q4 B/C changes P4's code and S10's R4, R6 and R12.

### 5.1 New unit suite: `tests/member-profile-save.test.mjs` (LF), titles labelled S1…, added to SUITES

**Made-up rows in QA's shapes.** The teams: `TEAMS = [{ id: 'team_east', name: 'East', managerId: 'usr_bob', repIds: ['usr_tess'] }, { id: 'team_east2', name: 'East', repIds: ['usr_eve'] }, { id: 'team_west', name: 'West', repIds: [] }, 'Legacy']`.

The members:
- **Tess** (rep): `team: 'East'`, `teamId: 'team_east'`, title "Rep", phone "1", `firstName: 'Tess'`, `lastName: 'Undoer'`, manager "Bob Russell", territory "South", `forecastCalls`, `notificationPrefs`, `emailSignature`, `quota: '100'`, `pinnedReports`, `active`, `status: 'Active'`, `clerkUserId`, `userType: 'User'`, `teamJoinedAt`.
- **Eve** (rep, a member of the second East): `team: 'East'`, `teamId: 'team_east2'`.
- **Wes** (rep, a team renamed since and the cascade missed him — P28): `team: 'Westside'`, `teamId: 'team_west'`.
- **Nia** (`team: 'East'`, `teamId: null` — an invitation before §0.168) and **Lou** (`team: 'East'`, `teamId: 'team_gone'`).
- **Bob** (Manager, Active) and **Jo** (Admin, Active); **Ivy** (Manager, Invited: `active: false`, `status: 'Invited'`, no `clerkUserId`) and **Dee** (Manager, Deactivated); **Dan** (Dispatcher, Active); **Karen** (rep, Active); **Tom** (Technician, manager "Dan …").

Each **OLD** is today's line copied verbatim from faed240 into the test and run once on the same rows, asserting today's real answer. That shows each test separates old code from new.

- **S1 (P1) memberChanges sends the page's changed fields, nothing else.**
  - An unchanged form → `{}`. Phone "2" → `{ phone: '2' }`.
  - A form whose `active`, `status`, `clerkUserId`, `pinnedReports`, `email`, `mobile`, `forecastCalls`, `notificationPrefs`, `emailSignature`, `quota`, `userType`, `teamJoinedAt` and `vertical` all differ from the first copy → none of them sent.
  - Title null→'' → `{}`. Title changed and changed back → `{}`.
  - OLD (:937-938 run with `teamIdNamed`) on the phone edit: the body carries `title`, `email`, `forecastCalls`, `notificationPrefs`, `emailSignature` and `quota`.
- **S2 (P2) the Full name pair.**
  - A typed name → `{ name, firstName: null, lastName: null }`, from a first copy with First/Last and from one with none (`firstName` absent, as in a first sign-in's row).
  - Name untouched while the form's `firstName` is null → `{}`.
  - There is no faed240 OLD (today's body is the whole form, which carries the cleared First/Last). Instead the run shows a difference-only body WITHOUT the pair dropping First/Last from a first copy with none — why the pair is in `memberChanges`. Held by the harness entry "memberChanges: a rename keeps the stored First and Last" and by I2.
- **S3 (P3) the team pair, by id.**
  - `teamPicked(teamOptions(TEAMS), 'team_east2')` → `{ team: 'East', teamId: 'team_east2' }`; Tess's form with it → `{ team: 'East', teamId: 'team_east2' }` (same name, other id: both sent).
  - Unassigned (`teamPicked(…, '')`) → `{ team: '', teamId: '' }`. Nia, Lou, Eve and Wes untouched → `{}`.
  - **OLD :938 (critic F1 — the first East answers the name):**
    - Eve's phone edit → `teamId: 'team_east'`: a member of the second East is MOVED to the first.
    - Lou's phone edit → `teamId: 'team_east'`: a gone team "healed" to the first East by its name.
    - Wes's phone edit → `teamId: null`: no team has "Westside", so a valid team id is cleared (OPEN_ITEMS :2356-2357).
- **S4 (P7) roleChanged.**
  - `{ role: 'Manager', userType: 'User' }` against a form on Manager → false.
  - A stored `member` untouched → false. '' → false. User→Manager → true.
  - OLD :959-960 after one landed change → true again (the second press), because the first copy never moves.
- **S5 (P8, P11) formAfterSave.** The stored row replaces the form. A title typed during the save is kept. `keepRole` keeps the picked role. A team typed during the save keeps both fields.
- **S6 (P4) teamsWithMemberOn.**
  - Tess onto `team_west`: off East, onto West, `changed`. Again → `changed: false`, with the same objects (`===`).
  - `null` → off every list. Already listed → not added twice. `'Legacy'` untouched.
  - A team with no `repIds` that is hers gets one. No member id → unchanged.
  - OLD :976-980 (by name) onto "East" → Tess on BOTH East teams' lists.
- **S7 (P3) teamOptions / teamPicked / heldTeam.**
  - The options are sorted: "East", "East (2)", "West", and no 'Legacy'.
  - `teamPicked` → name and id together; an unknown id or '' → `{ team: '', teamId: '' }`.
  - Held: Lou → "East (no longer on the team list)"; Nia → "East (not linked to the team list — pick it again)"; `{ team: 'North' }` → "North (not on the team list)"; `{ teamId: 'team_gone' }` → "A team (no longer on the team list)".
  - Tess → null; Wes → null (his id is offered; his stale name stays until a team is picked — P28); blank → null.
- **S8 (P12) managerOptions / heldManager.**
  - The options for Tess are `[{ id: 'usr_bob', name: 'Bob Russell' }, { id: 'usr_jo', … }]` — not Ivy, Dee, Dan, Karen or Tess.
  - Held: Karen → "Karen … (Sales Rep)"; Dee → "(deactivated)"; Ivy → "(invited, not yet joined)"; "Gone Name (no member has this name now)"; self → "(this member)"; Tom's manager Dan → "Dan … (Dispatcher)" (D8's consequence, critic C19).
  - OLD :914 (`allMgrs`) offers Karen, Ivy, Dee and Dan.
- **S9 (P13) heldTerritory.** On the list → null. "Gone" → "Gone (not on the territory list)". Blank → null.
- **S10 (P1, P5, P7-P11) handleSave run as written.**
  - **Setup.**
    - The function is AST-sliced from UsersDetail.jsx, from `    const handleSave = async () => {` to its closing `};`, with @babel/parser as the class scans use.
    - It runs through `new Function`, with its free names handed in as the slice's own parse names them: `form`, `user`, `listOwed`, `settings`, `memberChanges`, `roleChanged`, `teamsWithMemberOn`, `formAfterSave`, `requestOrg`, `stillOrg`, `dbFetch`, `dbWrite`, `setError`, `setSaving`, `setRoleNote`, `setUser`, `setForm`, `setSettings`, `setMyProfile`, `setListOwed`, `setSaved`, `setTimeout`.
    - The helpers are the real ones. `dbFetch` and `dbWrite` are scripted and record their calls in order. The setters record, and apply their updaters to made-up state.
  - **R0 blank name.** No request; `setError('A member needs a name.')`; `setSaving` never called (critic F4.3).
  - **R1 phone only.** One request, `PUT /users`, with body exactly `{ id, phone }`. `setUser(answer)`. The roster's row is the answer (its `userType` the column's), not the body. No `user-role`, no settings (Tess is on East's list, her manager Bob). Afterwards `memberChanges(user, form)` is `{}`.
  - **R2 rename.** Body `{ id, name, firstName: null, lastName: null }`. `setUser` gets the stored (trimmed) name.
  - **R3 role only.** No `/users` request; one `user-role` with `{ targetUserId, role }`. The held row's role and `userType` are the new role. A second run from the after-state sends nothing (it returns before `setSaving`).
  - **R4 team "West".** `PUT { id, team, teamId }`, then `PUT /settings { teams }` with Tess on West's list only, in that order. The roster's `teams` is the moved list.
  - **R5 role refused after a phone save.** The error is exactly "Saved, but the role was not changed — You cannot change your own role. Ask another Admin.". `setUser` gets the stored (old) role. The form keeps the picked role. A re-run sends the role alone.
  - **R6 list refused** (`dbWrite` → `{ ok: false, error: 'TEST' }`). The words show, and `setListOwed({ teamId: 'team_west' })`. A re-run with that `listOwed` and an unchanged form sends one request, the settings PUT, and then `setListOwed(null)`.
  - **R7 users PUT refused 409** (`{ error: <NAME_TAKEN words> }`). Those words show. No further request; no `setUser`, no `setSettings`; the last `setSaving` call is `false` (the `finally`, critic C13).
  - **R8 `stillOrg` false after the users PUT's answer.** No further request; nothing shared set; `setSaving(false)` still runs.
  - **R9 own row.** `setMyProfile`'s updater on `{ id: <same> }` takes the stored name; on another id it returns `prev`.
  - **R10 Tess's phone edit when she is on no team's list** (a drift). No settings request: an unrelated save does not touch the list.
  - **R11 a phone save lands, then the `user-role` request rejects** (a thrown fetch) after `stillOrg` turned false. No `setUser`, no `setSettings`, no `setMyProfile`. This proves the post-catch check (the scan does not — §2).
  - **R12 (critic C1/F2) a team change and a role change; the `user-role` fetch rejects** (stillOrg true). The settings PUT was sent before the `user-role` request; `setListOwed(null)`; the words are "Saved, but not everything — <message>. Reload to see what was saved."; `setUser` holds the new team and the old role; the form keeps the picked role.
  - **R13 (critic F3) a manager change only** (Tess, team East, on East's list). Body exactly `{ id, manager: 'Bob Russell' }`; no `/settings` request; the roster updater leaves `teams` as they were.
  - **R14 (critic C20) a role-only change refused** (400). Its words show; nothing set; the form keeps the picked role, so `roleChanged(user, form)` stays true.
  - **R15 (critic C20) member, list and role all land.** One `setSettings` call whose result holds both the stored row and the moved teams; `setUser` holds the new role; `setListOwed(null)`; `setSaved(true)`.
  - **OLD:** `handleSave` as it stands on faed240 (copied verbatim), run on R1's rows. The body is the whole form (title, email, forecast calls…). With Tess's manager "Bob Russell" and team "East", it sends a settings PUT setting `managerId` on both "East" teams (P5). On R3 it sends a `/users` PUT.
- **S11 (P3, P5, P8, P12, P13) the page's lines, pinned and run** in the `UserProfilePage` slice (`code()` drops comment lines).
  - `once` each of: `const [user, setUser]     = useState(opened);`; the `dirty` line; the three selects' value and option lines; the `pickTeam` line; the roster line `...(row ? { users: (prev.users||[]).map(u => u.id === row.id ? { ...u, ...row } : u) } : {}),`; the `setMyProfile` line; the post-catch `if (!stillOrg(askedOrg)) return;   // a request that failed …`; the catch line followed by `} finally { setSaving(false); }`.
  - `order` within handleSave: the users PUT block, then `if (move) {`, then `if (roleNew) {` (the C1 fix's order).
  - **The `dirty` line run (critic F4.1):** the expression after `const dirty = ` is sliced and run through `new Function('user', 'form', 'listOwed', 'memberChanges', 'roleChanged', …)` — the pattern sales-links.test.mjs:792-799 uses — on R1's after-state (false), on R5's (true: the role waits) and on R6's (true: `listOwed`).
  - NEG: `teamIdNamed(`, `managerId: mgr.id`, `oldTeamName`, `JSON.stringify(form)`, `storedName`.
  - The `useApp()` line destructures `setMyProfile`.
- **S12 (P25).** `description="Field technicians are managed in the Dispatch tab."` once; NEG ` desc=` in the file.
- **S-self — the suites: this file is graded by the harness.** The exact self-pin line and `SUITES_PARSE` (tests/sales-links.test.mjs:764-786). The scan's floor (sales-links :783) goes 16 → 17, "seventeen since §0.211".
- **(B) S13 MANAGER_LINK.**
  - `linksAsked(MANAGER_LINK, …)` on made-up bodies: absent → nothing asked; held → nothing; self → 400 `namesItself('member')`; `5` → 400 `NOT_AN_ID`; a fresh id → asked (kind member).
  - Sanitize's line and the two `checkLinks(MANAGER_LINK` lines (PUT and create, each by its whole line) pinned in order after the team's.
- **(B) S14 memberLinksCleared with members.** An unknown `managerId` is cleared and counted. A held one is kept. With no `members` Map it behaves as before, so the three-argument calls stay green.
- **(B) S15 managerNameOf / managerPicked / heldManager by id.** The id's member's name; a removed id → the stored name; a pick sets both; the readers :1122, :1481 and :343 pinned and the export's Manager line run on made-up rows.

### 5.2 Re-anchored pins (each changed in its step's commit, its message kept true)

- **tests/member-identity.test.mjs:158-165** → slice `between(profile, '    const handleSave = async () => {', '\n    };')` — `between` EXCLUDES its end marker (:21-27), so the old end `"body:JSON.stringify(toSave) });"` cannot also be an `order` part (critic C11/F17) — then `order(…, 'const changes = memberChanges(user, form);', 'const toSave = { id: user.id, ...changes };', "body:JSON.stringify(toSave) });")`. The NEG `/JSON\.stringify\(\{?\s*\.\.\.form/` is kept. `PAGE_FIELDS` is imported and asserted to hold none of `active`, `status`, `clerkUserId`, `pinnedReports`. Title kept.
- **tests/member-links.test.mjs:234-235 (T6)** → `once(s, ind(16, 'const toSave = { id: user.id, ...changes };'))`, `!s.includes('pinnedReports: _pins')`, and `assert.ok(!PAGE_FIELDS.includes('pinnedReports'))` (critic F18), so T6's title ("the member profile page sends no pins") is proved by what it reads.
- **tests/member-names.test.mjs:403** → the new `handleChange` line (4-space indent) and `memberChanges`' pair line (memberSave.js), with the REGRESSION message moved. **:406-413** → `order(profile, 'body:JSON.stringify(toSave) });', 'const d = await resp.json().catch(() => ({}));', 'if (!stillOrg(askedOrg)) return;', "if (!resp.ok) throw new Error(d.error || 'Save failed');", 'row = d.user || { ...user, ...toSave };', 'setUser(row);', 'u.id === row.id ? { ...u, ...row } : u')`.
- **tests/team-membership.test.mjs:104-113** → retitled "a team changed on the profile is picked by its id and sent with its name — only when the Team box changed (state §0.211; §0.168's every-save derive moved and cleared valid teams)". It pins NEG `teamIdNamed(` in the slice, the Team select's value and option lines, the `pickTeam` line, `if ('teamId' in changes) move = { teamId: row.teamId || null };`, `teamsWithMemberOn(settings.teams, user.id, move.teamId)` and the roster line; its :109, :111 and :112 messages go with it.
- **tests/role-vocabulary.test.mjs:138-143 (CRLF)** → the named files gain `['src/Tabs/settings/people/memberPickers.js', "'../../../utils/roles.js'"]` (critic F16).
- **package.json** `test:int` gains `tests/integration/member-profile.itest.mjs` (itest-targets-test-db.test.mjs:36-40, map).
- **scripts/mutate-import.mjs** SUITES (:16) gains `tests/member-profile-save.test.mjs`.
- **(B) tests/self-profile.test.mjs:25-31** `ADMIN_ONLY` gains `'managerId'`.
- **Unchanged by design (checked):**
  - member-status.test.mjs:45-104; invitations.test.mjs:92-103; user-import.test.mjs:180-181 (map);
  - role-vocabulary.test.mjs:202-205 (no `<select … value={form.role`);
  - dispatch-gate :165-166 (:1085 untouched, map);
  - team-membership :115-123 (three `dropRevokedRow` calls; :1071 untouched);
  - settings-leave-guard (UsersDetail.jsx still names no `settingsSaveRef`);
  - merged-away-lists T8 (the `useApp()` holder destructures; `users` is not one of its four lists — critic).

### 5.3 Integration: `tests/integration/member-profile.itest.mjs` (LF; letters and hyphens only)

**These are guards, not regression proofs (critic F7).** Step A changes no function, so I1–I4 pass on faed240's server once memberSave.js exists to build the bodies. Each states the server contract the page relies on; each "control" sends today's body to the same server and asserts today's harm. The page's change itself is proved by S10, whose OLD run fails on faed240. The state entry must not copy §0.210's "each fail on the code before it" for these.

**Setup.**
- `// ORG NAMESPACE: this file owns 'itest_mprofile_*'.` with `A = 'itest_mprofile_A'` and `B = 'itest_mprofile_B'`. Ids are `usr_itest_mprofile_…`, Clerk ids `clerk_itest_mprofile_…`, emails `…@itest-mprofile.local`, team ids `team_itest_mprofile_A_east` … — each org's ids its own (critic F9).
- The `DATABASE_URL_TEST` refusal and the `NETLIFY_DATABASE_URL` redirect come before the first import.
- The real `verifyAuth`, with the Clerk stand-in and `call`/`one`/`textOf` as member-links.itest.mjs:1-120 has them (map).
- Cleanup by org before and after.

**Seeds, in both orgs with the same names** (B's ids are its own):
- an Admin, a Manager "Bob", and reps "Tess" and "Lou" — **both linked**, so each one's own `?me` works (`resolveCaller`, users.mjs:420-423; critic C12/F8) — "Eve" (a member of the second East) and "Wes" (`team: 'Westside'`, the West entry's id);
- the teams list `East`, a second `East`, and `West`;
- Tess and Lou with title, phone, email, signature, `notificationPrefs`, `forecastCalls`, territory, manager "Bob", `quota`, pins, team East and its id, and `team_joined_at`.

- **I1 (P1) a field changed since the page opened is kept.**
  - The Admin's GET is the page's first copy. Then Tess's own `PUT ?me` changes title, signature and prefs, and the Manager sends `{ id, forecastCalls }`.
  - Then the Admin sends `{ id, ...memberChanges(first, { ...first, phone: '2' }) }` → 200.
  - Phone is '2'; title, signature, prefs and calls are the newer ones. Name, email, team, teamId, `team_joined_at::text`, territory, manager, quota, pins, role, `active`, status and `clerkUserId` are as before.
  - **The audit, counted across the Admin's save:** exactly one new `user.updated` row whose `userId` is the Admin's Clerk id (the Manager's PUT writes its own, users.mjs:1130; `?me` writes none, :405-481).
  - **Control:** the same story on Lou (linked) with today's body (`{ ...edited, teamId: teamIdNamed(teams, first.team) }`, :937-938 as written) puts the old title, signature, prefs and calls back — asserted.
- **I2 (P2) a rename over First/Last set since.**
  - The first copy has no First/Last. Then Tess's own `?me` sets First/Last.
  - The Admin's body for name "Tess Renamed" → stored "Tess Renamed", with First/Last null.
  - Control: `{ id, name }` alone → the name stays the First/Last one, which is why the pair rides (as member-names.itest's FULL NAME test, :220-231, map).
- **I3 (P3) the team by id (critic F1).**
  - `{ id, team: 'East', teamId: <the second East> }` on Tess → both stored, `team_joined_at::text` changed from the seeded value (not compared with today's date — memory: timestamps read locally).
  - Eve's phone body → `teamId` and `team_joined_at::text` unchanged. **Control:** today's body for Eve → `teamId` the FIRST East's, `team_joined_at::text` changed — a member moved to another team by a phone save.
  - Wes's phone body → unchanged. **Control:** today's body for Wes → `teamId` null, `team_joined_at` null — a valid team cleared.
- **I4 (ISOLATION, critic F9).**
  - Every A body above names A's member ids, and B's rows are as seeded at the end.
  - An A body naming B's team id → 404 `{ error: notInOrg('team'), field: 'teamId' }`, with A's row unchanged.
  - An A Admin's PUT `{ id: <B's Tess>, phone: 'x' }` → 404 with users.mjs:1073's words; B's Tess unchanged.
  - B's Admin's `GET /users` holds no `usr_itest_mprofile_A…` id, and B's Tess as seeded.
- **(B) I5 (P14) the manager by id.**
  - A's Bob by id → 200, stored.
  - B's Bob's id → 404 `{ error: notInOrg('member'), field: 'managerId' }`, row as it was.
  - The member's own id → 400; `5` → 400.
  - A held `managerId` of a member deleted since, re-sent with a title → 200.
  - A create naming B's Bob → 404, no row.
  - Tess's `?me` body carrying `managerId` → dropped; the stored one is kept.
  - A restore of a file member whose `managerId` names no member here → cleared and counted (staged the way member-links.itest's RESTORE tests stage a file, map).
  - Each of these, run on step A's server first, fails on its own rule (B changes functions, so these are regression proofs).

---

## 6. The harness (scripts/mutate-import.mjs, CRLF)

Each entry is named for the break its mutant makes (guide §18b98 rule 9, :4216) and anchored on its file's only match on that step's tree — the harness mutates the FIRST match (guide §18b92 rule 8, :4139), so a repeated text is no anchor. Each is pre-run against the full SUITES after a green baseline and caught by the new suite.

**Retired in A (their lines go):**
- :4608 "profile: a new team keeps the old teamId" and :4612 "profile: the team id is kept when the team matches the page's first copy". Both anchor on :938's line. Their breaks are now "team picker: a new team keeps the old teamId" and "memberChanges: a team's id is sent without its name", run by S3/S7/S10.
- :7758 "profile page: an edited Full name loses to First and Last again". The clearing moves to memberSave.js (new entry below).
- :7766 "the roster on screen keeps the untrimmed name" and :7770 "the form keeps the name as typed after a save". `storedName` goes; the breaks are now the roster and `setUser` entries.
- :12588 "§0.205 profile page: an Admin's save re-sends the member's pins as loaded". The destructure goes; the break is now "PAGE_FIELDS: the pins ride a save again".

**Kept:** :4616 (`body:JSON.stringify(toSave) });` → `…(form) });`, unique; R1 catches it — the body must be exactly `{ id, phone }`) and :7762 (the blank-name line; R0 runs it, member-names :405 pins it).

**New in A (33, under `// ── §0.211 …`):**

memberSave.js (9):
1. "PAGE_FIELDS: the email as loaded is sent again" (`'territory']` → `'territory', 'email']`).
2. "PAGE_FIELDS: the pins ride a save again" (`'territory']` → `'territory', 'pinnedReports']`).
3. "memberChanges: a rename keeps the stored First and Last" (the name pair line → '').
4. "memberChanges: a team's id is sent without its name" (the team pair line → ''; critic F19.3).
5. "memberChanges: '' against none reads as a change" (`blank` drops `|| v === ''`).
6. "memberChanges: every filled field the page edits is sent again" (`sameValue` → `blank(a) && blank(b)`; replaces the design's "a field changed and back is sent", which no comparison can make — critic C8/F19.2; S1's unchanged form catches it).
7. "roleChanged: the role read off the stale userType" (`first?.role` → `first?.userType`).
8. "formAfterSave: a field typed during the save is overwritten" (the PAGE_FIELDS loop line → '').
9. "formAfterSave: a role not saved reads as saved" (`if (keepRole || ` → `if (`).

teamMembership.js (3):
10. "teamsWithMemberOn: a moved member stays on their old team's list" (`return { ...t, repIds: held.filter((id) => id !== memberId) };` → `return t;`).
11. "teamsWithMemberOn: listed twice on the new team" (`if (on) return t;` → '').
12. "teamsWithMemberOn: an untouched list is rebuilt and saved" (`if (!on) return t;` → '').

memberPickers.js (8):
13. "team picker: a second team of one name reads the same" (`label: n > 1 ? \`${t.name} (${n})\` : t.name` → `label: t.name`).
14. "team picker: a held team reads as unassigned" (`export function heldTeam(form, options) {` → the same plus `return null;`).
15. "team picker: a team name with no id reads as unassigned" (heldTeam's last line → `return null;`; renamed — with no held option the select shows its first option).
16. "team picker: a new team keeps the old teamId" (teamPicked's return → `return { team: t ? t.name : '' };`; critic F4.2 — S7 runs it, and S3's body then carries the old id).
17. "manager picker: a Sales Rep offered as a manager" (`canSeeAll(u.role) && ` → '').
18. "manager picker: an invited or deactivated manager offered" (` && memberStatus(u) === 'Active'` → '').
19. "manager picker: a held manager reads as none" (heldManager's `if (blank(name) || (options || []).some((o) => o.name === name)) return null;` → `return null;`).
20. "territory: a held territory reads as unassigned" (heldTerritory → `() => null`).

UsersDetail.jsx (13):
21. "profile page: a role change alone PUTs the member too" (`if (Object.keys(changes).length) {` → `if (true) {`).
22. "profile page: the roster takes the body sent, not the stored row" (`u.id === row.id ? { ...u, ...row } : u` → `u.id === row.id ? { ...u, ...changes } : u`; anchored on the whole expression — `{ ...u, ...row }` alone is also at :1031 and :1043, critic C2/F5.1).
23. "profile page: after a save the page holds the member as opened" (`setUser(row);` → '').
24. "profile page: a refused role after a save is said as an unknown failure" (the `missed.push(\`Saved, but the role was not changed` line → `throw new Error(rd.error);`; renamed — the words become "Saved, but not everything — …", which R5 refuses).
25. "profile page: a team list that did not save is forgotten" (`else { owedNext = move; missed.push(` → `else { missed.push(`).
26. "profile page: an unrelated save writes the team list" (`if ('teamId' in changes) move = { teamId: row.teamId || null };` → `move = { teamId: row.teamId || null };`; R10 catches).
27. "profile page: a failed request after an org switch still sets the roster" (the commented post-catch `stillOrg` line → ''; R11).
28. "profile page: an Admin's own rename leaves the header" (the `setMyProfile` line → ''; R9).
29. "profile page: Save changes counts the form against the member as opened" (the `dirty` line → `const dirty = JSON.stringify(form) !== JSON.stringify(opened);`; the dirty run in S11 catches it — critic F4.1).
30. "profile page: the Dispatch card's line is lost again" (`description="Field technicians` → `desc="Field technicians`).
31. "profile page: every save makes the member's manager their team's manager again" (critic F3: `            if (move) {` → a line that, when `form.manager` and `row?.teamId` are set, PUTs the teams with that team's `managerId` set to the member named, followed by `            if (move) {`; R1 and R13 catch it — each expects no `/settings` request). `if (move) {` is unique in the file (grep finds none today).
32. "profile page: a role request that fails first leaves the team list unmoved" (critic C1/F2: a two-block anchor — the list block then the role block, as written — swapped; R12 catches it).
33. "profile page: a refused save leaves the button on Saving…" (critic C13: the catch line plus `        } finally { setSaving(false); }` → the catch line plus `        }`; two lines, because `} finally { setSaving(false); }` is also at :205; R7 asserts the last `setSaving` is false).

**New in B (13):**
- "users PUT: a manager of another org is stored" (the PUT's whole line, ending `{ id: data.id, managerId: before?.profile?.managerId ?? null }, orgId);` → ''). Anchored on its whole line: the create's line shares the prefix `const managed = await checkLinks(MANAGER_LINK, data, ` and comes first in the file (critic F5.2). No entry anchors a refusal line (the two are identical).
- "users PUT: a member named their own manager" (`, notSelf: true` → '').
- "create: a manager of another org is stored" (the create's whole line, ending `null, orgId);` → '').
- "sanitize: the manager id is not stored" (the `managerId:` line → '').
- "restore: a member's unknown manager is kept" (memberLinksCleared's `managerId` line → '').
- "restore: every restored member's manager is cleared — looked for among the teams" (`liveIdsInOrg('member', held.map((m) => own(m.profile).managerId)` → `liveIdsInOrg('team', …`).
- "?me: a member sets their own manager" (`'pinnedReports',` in SELF_EDITABLE_KEYS → `'pinnedReports', 'managerId',`; self-profile's ADMIN_ONLY catches it).
- "managerNameOf: the stale stored name over the id's".
- "Users list: the manager column reads the stored name", "profile band: reports to the stored name", "export: the Manager column by name".
- "manager picker (B): a member picked by name, not id" (managerPicked drops `managerId`).
- "memberChanges (B): a manager sent without its id" (B's pair line → '').

**Counts:** 3,235 today (counted: 3,235 entry lines) → after A: −6 + 33 = **3,262** → after B: + 13 = **3,275** (critic C16/F19.1 found the design's "about 27" short; the revision adds C1, C13, F3 and F4 entries). The summary must read N/N with 0 stale. A red exit is read from the log's own summary line (memory).

---

## 7. The browser check (Accelerep QA only — `org_3K6LqEB6kPE9p4t96GBfsX9VNyb`)

**Before each pass:**
- Stop `netlify dev`; `rm -rf dist node_modules/.vite` (B also `.netlify/functions-serve`); restart; poll with curl (about 2 min — memory); hard refresh.
- Read the URL bar and count the orgs in the switcher (guide §19). Dismiss the overdue reminder after each load.

**Ground rules:**
- **Jeff signs in himself** (MFA; Claude never types credentials), and again for each role change.
- **Never UKG, never another org** (D18: the org-switch case is the unit suite's).
- Writes only TEST records in QA (the standing go — memory), and each write is reported. **Every step that saves a team list PUTs QA's whole teams list from the app's copy** (P6; TeamModal's own save does too, TeamsDetail.jsx:69) — named in the go Jeff gives (critic F13).
- **Reload after making the TEST teams, and before each list-writing step:** TeamModal's save drops deactivated and invited members from the roster on screen (TeamsDetail.jsx:24, :95 — P26), which would change the Manager box's held words.
- A **write-holding pane guard** covers every made-up answer: a page-level fetch wrapper that takes `URL` objects (memory), holds only the requests the step names, and records them.
- Read back by SELECT on Jeff's go, before and after: the TEST member's row (name, title, phone, team, profile teamId, manager, `team_joined_at::text`) and the TEST teams' `repIds`.

**Records (Jeff's go before the pass):**
- "TEST Profile Rep": a Sales Rep with no email and no login, made by the deal window's add-rep (`onAddRep` opens UserModal for a create, ModalLayer.jsx:219-222; `handleSaveUser`'s create sends `POST /users` with `email: ''`, no invitation, useUserHandlers.js:77-110; UserModal requires First and Last, UserModal.jsx:111, :113; an empty email is stored as `<id>@placeholder.local`, users.mjs:113). The deal window is then closed without saving a deal (critic F15).
- Teams "TEST Team East", a second "TEST Team East", and "TEST Team West", made on the Teams page with no manager.
- (B) "TEST Profile Manager": a Manager with no login, made the same way with the Role & Access tab's role set to Manager (UserModal.jsx:154; only an Admin may, users.mjs:894-896). No login and `status` null reads Active (memberStatus.js:10-14), so it is offered.
- **Karen is a Sales Rep and cannot open Settings → Users** (App.jsx:2070-2077, :2161), so this page has no rep path of its own; the rep's stake is that her own changes survive an Admin's save (step 11).

**Pass A** — as Jeff (Admin):
1. **Open the page.** Settings → People & Teams → Users → TEST Profile Rep. The band reads "Sales Rep · — · reports to —"; there is no "Save changes".
2. **Two-session stale write.**
   - Open tab A on that page. Then open tab B (a second pane tab) on the same page.
   - In tab B: Job title "TEST Title B", Save. The network log shows one `PUT /users`, body `{ id, title }`.
   - In tab A (opened before B's save): Phone "TEST 555-0101", Save. One `PUT /users`, body exactly `{ id, phone }`; no `user-role`, no `settings`.
   - Reload tab B: title "TEST Title B", phone "TEST 555-0101". Today's code would have put A's stale title back (I1's control, S10's OLD).
3. **After a save.**
   - Full name "TEST Profile Rep Renamed", Save. The body is `{ id, name, firstName: null, lastName: null }`.
   - The crumb, avatar and band read the new name at once; the button leaves; the green banner shows.
   - Crumb → Users: the list shows the new name. Rename back the same way.
4. **Team by id.** (Reload first.)
   - The Team box lists "TEST Team East", "TEST Team East (2)" and "TEST Team West", among QA's other teams.
   - Pick "TEST Team East (2)", Save. Expect `PUT { id, team: 'TEST Team East', teamId: <the second's id> }`, then a `PUT /settings` whose list has the member on the second East's `repIds` only (read the body).
   - Teams page: the second East counts 1, the first 0.
   - Back on the profile (reload), pick "— unassigned —" and Save. Expect `{ id, team: '', teamId: '' }` and a list with the member on no team. Teams page → Unassigned lists them.
5. **A phone-only save after (4)** sends no `team` and no `settings` request.
6. **Manager.**
   - The box offers QA's Admins and Managers with access (as the Users list shows their roles), never a Sales Rep such as Karen, never the member.
   - Pick a Manager and Save. Expect `{ id, manager: '<that name>' }` and no `settings` request. The Teams page's manager column is unchanged.
7. **Held values, from a made-up answer to the page's own save** (critic C3/F10 — the roster is read only at sign-in and by Sync, useSettings.js:116 and UsersDetail.jsx:1454, so no `GET /users` comes to rewrite):
   - The guard holds the TEST member's next `PUT /users` — not sent — and answers 200 `{ user: <the row as the page holds it, with the phone typed, teamId 'TEST_team_gone', team 'TEST Team East', territory 'TEST Gone', manager 'TEST Nobody'> }`. Type a phone and Save.
   - The page adopts the answer (`setUser`, `formAfterSave`): the boxes read "TEST Team East (no longer on the team list)", "TEST Gone (not on the territory list)" and "TEST Nobody (no member has this name now)", greyed; the band reads "TEST Team East · reports to TEST Nobody".
   - The network log shows the held request only. Guard off; reload: the stored row is back. Nothing was written.
8. **Half-saved, with made-up answers.** The guard holds the `user-role` and `settings` PUTs only; the users PUT is real (a TEST member).
   - **The role.**
     - Set Role to Manager and Phone to "TEST 555-0102", then Save. The users PUT answers 200. `user-role` is answered 400 `{ error: 'You cannot change your own role. Ask another Admin.' }`.
     - The page shows red "Saved, but the role was not changed — You cannot change your own role. Ask another Admin.". The Role box stays on Manager, the band reads "Sales Rep", and "Save changes" shows.
     - Save again: only `PUT /user-role` goes (held, answered 400 again).
     - Set Role back to Sales Rep: the button leaves, and nothing is sent.
   - **The team list.** (Reload first.)
     - Pick "TEST Team West" and Save. The users PUT is real. `settings` is answered 500 `{ error: 'TEST list refused' }`.
     - The page shows red "Saved, but the team list was not updated — TEST list refused. Save changes tries the list again." (`refusalOf`, storage.js:95; the made-up JSON carries no `requestId`).
     - Guard off, then Save: only `PUT /settings` goes (network log), and the member lands on West's list.
9. **Own row, made up.** The guard holds **every non-GET** (critic F14) and answers the users PUT 200 with Jeff's row as the roster holds it, its name with " TEST" added.
   - Rename on Jeff's own profile: the header's name and the crumb read it at once. Open the profile panel from the avatar: First and Last read the new name split (AppHeader.jsx:544). Close it without saving.
   - Reload at once: the stored name. The network log shows the held request only; nothing was written.
10. **As Karen** (Jeff signs her in): no Settings in the nav. Nothing in step A runs for her.
11. **(Jeff's go — D19) The rep-path leg: Karen's own change survives an Admin's save** (critic C9). It needs two sign-ins side by side: the pane as Jeff, and Karen in a second browser (Jeff's Chrome) — whether two can run at once is unverified. It writes Karen's own QA row with TEST values and puts them back.
    - In the pane, Jeff opens Karen's profile page and leaves it open.
    - In the second browser, Karen sets her own Job title to "TEST Karen title" (Save Profile → `PUT ?me`).
    - In the pane (opened before), Jeff sets Karen's Phone to a TEST value and Saves. Expect the body `{ id, phone }`.
    - Karen reloads: her title "TEST Karen title" is kept. Read back by SELECT on Jeff's go.
    - Put both back: Karen restores her title in her panel; Jeff restores her phone on the page (read before the leg).
    - If the leg cannot run, I1 stands for it and the state entry says so.

**Pass B** — as Jeff:
12. On TEST Profile Rep, pick "TEST Profile Manager" in the type-ahead. The body is `{ id, manager: 'TEST Profile Manager', managerId: <its id> }`. The Users list's Manager column and the band read it. (The export's Preview card shows no manager, UsersDetail.jsx:421-426; the downloaded file's Manager column is S15's, unless Jeff okays one download — critic C4/F11.)
13. **A rename follows the id** (a real TEST write): on TEST Profile Manager's own page, rename it "TEST Profile Manager Renamed". TEST Profile Rep's band and the Users list read the new name. Rename it back.
14. **Held, made up:** the guard holds a phone save of TEST Profile Rep and answers it with `managerId: 'usr_TEST_gone'`, manager 'TEST Profile Manager'. The box reads "TEST Profile Manager (no longer a member)", greyed. Guard off; reload.
15. **As Karen:** nothing in B is on her screen. That her own `?me` drops a `managerId` is I5's and self-profile's; the design's old step 13 (her Save Profile, then a SELECT) proved nothing — she holds none before or after — and wrote her real row, so it is dropped (critic F12).

**Left in QA afterwards:** TEST Profile Rep (as last saved), TEST Profile Manager (B), the three TEST teams and their lists; Karen's title and phone as before (if step 11 ran) — each named in the state entry.

---

## 8. The words (every new or changed piece of text on screen)

- **Team box, held:** **"East (no longer on the team list)"**, **"A team (no longer on the team list)"**, **"East (not linked to the team list — pick it again)"**, **"East (not on the team list)"**. A second team of one name: **"East (2)"**. "— unassigned —" is unchanged.
- **Manager box, held:** **"Pat Smith (no member has this name now)"**, **"(deactivated)"**, **"(invited, not yet joined)"**, **"(Sales Rep)"** or any role's label (a Technician whose manager is a Dispatcher reads **"(Dispatcher)"**), and **"(this member)"**. "— none —" is unchanged. In B also: **"(no longer a member)"** and **"(not linked — pick them again)"**.
- **Territory box, held:** **"West (not on the territory list)"**.
- **Errors:**
  - new: **"Saved, but the role was not changed — {the server's words}"** ("try again." when it sent none);
  - **"Saved, but the team list was not updated — {words}. Save changes tries the list again."**, replacing "User saved, but the team list was not updated — {words}". `{words}` are `dbWrite`'s: the server's `error` (with "(ref …)" when it sends a `requestId`), "You do not have permission to make this change." for a 403, "The server returned {status}." for an answer with no words, "Network error — the change was not saved." for none (storage.js:89-100, :114);
  - new: **"Saved, but not everything — {message}. Reload to see what was saved."** (a request that got no answer after something landed; the list has moved by then);
  - unchanged: the server's words or "Save failed", "Could not change the role.", "Failed to save. Please try again.", "A member needs a name.".
- **Button:** **"Save changes"** / "Saving…"; "✓ Saved" is removed. Unchanged: "✓ Changes saved successfully." and "Role updated — it can take up to 30 seconds to take effect."
- **Rider:** the Dispatch technician card's line **"Field technicians are managed in the Dispatch tab."** now shows.
- **(B) The server's refusals** (API only; the page offers neither case): "That member is not in your organization — pick one from the list.", "A member cannot name itself.", "A link must name a record by its id." (field `managerId`).
- **No new colour:** held options are the browser's disabled grey; red stays for errors and Delete.

---

## 9. Questions for Jeff (plain words; most consequential first; Recommended first)

**Q1 — Someone changed the same box after you opened the page.** After this batch a save sends only the boxes you changed, so everything else changed meanwhile is kept. If the member changed the very box you change (say, their job title), what should Save do?
- **(A) Your change wins — Recommended.** No server change; the Teams page and the member's own panel already save this way.
- (B) Refuse and say what it is now ("Not saved — the title was changed since this page opened (it is now “Account Manager”). Reload to see it."). Adds a server check to step B, its tests and about 5 harness entries.
- (C) Read the member fresh each time the page opens, then (A). Adds one request and a loading state; the window shrinks to while the page is open.

**Q2 — The Manager box also changes the team's manager.** Today every save of a member with a Manager and a Team makes that person the manager of the member's whole team, and the box lists anyone, a Sales Rep too.
- **(A) Stop it — Recommended.** The box sets who this member reports to and nothing else; a team's manager is set on the Teams page.
- (B) Only when you change the Manager or Team box, and only to an Admin or Manager. Keeps a narrowed sync, with its code, runs and harness entries.
- (C) Keep it as it is. Today's lines stay; the tests keep today's behaviour.

**Q3 — How much in this batch.**
- **(A) Two steps; the forecast call later as its own small batch — Recommended.** Step A: the page sends only what changed (screens only). Step B: a member's manager is stored as the person (checked as a member of your organization) and picked by type-ahead, so a rename never breaks "reports to".
- (B) Step A only. The manager-by-person and the forecast call are filed; every "(B)" item drops.
- (C) A, B and the forecast call: a server save for one Commit or Best case figure, so two managers' calls never undo each other. Adds a Sales Manager tab step with its own tests and harness entries.

**Q4 — The team list.** When a member's team changes, the page also saves the whole list of teams from the copy it loaded at sign-in, so another Admin's team edit made since is undone.
- **(A) Move the member by id, only on a team change, from that copy; file the copy's age with batch 4b-3, which owns the teams list — Recommended.** The team change is fixed now; the list's own shape stays 4b-3's.
- (B) Read the list fresh just before saving it. One more request, and a named exception to "Settings pages do not load their own data".
- (C) The server keeps the list in step with the member's team, in the same request. A server step in this batch.

**Q5 — Leaving the page with unsaved changes.** Today it drops them without asking; other Settings pages with a Save ask.
- **(A) File it as its own small item — Recommended.** This batch stays about what a save sends.
- (B) Add it now. The crumb, Deactivate, Reactivate, Delete and Revoke on this page then ask too; adds the leave-guard hookup and its tests.

### 9.2 Decided without asking (Jeff can veto any)

- **D1 The fields a save can send:** Full name, Job title, Phone, Team, Manager, Territory (the Role by its own path). Never the email (read-only on the page), mobile, preferences, signature, timezone, forecast calls, quota, pins, access, status or login.
- **D2 '', empty and unset count as the same value**, because the server stores each as none.
- **D3 A Full name you type always goes with First and Last cleared** (your "Yes, Full name wins"), even if First/Last were set after the page opened. The rule moves from the box to the save.
- **D4 A team is picked as the team, by its id, and saved with its name, only when the Team box changes.** §0.168's "every save re-reads the team by name" goes: it moved members of a second team of the same name onto the first, and cleared valid teams. A member holding a name with no id shows "(not linked … pick it again)".
- **D5 A Role change goes to the role path only when the Role box differs, and a role-only change saves no member row**, so there is no empty "user updated" log line.
- **D6 After a save the page shows the member as stored.** The Users list takes the stored row; your own row updates the header at once and your profile panel when you next open it.
- **D7 Half-saved is said and retried.** The member is saved first, then the team list, then the role. A refused list or role says "Saved, but …" in the server's words, and "Save changes" sends only what is left.
- **D8 The Manager box offers members with access whose role is Admin or Manager** (the roles the Teams page offers as a team's manager, read from roles.js — no new role list), never the member. A stored manager outside that — a Technician reporting to a Dispatcher, say — shows greyed with their role and is kept unless changed; nothing but this page's band, the Users list and the export reads it.
- **D9 A stored value the boxes do not offer shows as itself, greyed** (Team, Manager, Territory), never as the first option.
- **D10 Two teams of one name:** the second reads "East (2)" in this box. Making names unique is 4b-3's job.
- **D11 "✓ Saved" leaves the button**, because the button itself leaves. The green banner stays.
- **D12 The Dispatch card's line shows** (`desc=` → `description=`).
- **D13 No fresh read of the member on open, and no `key` on the page** (one mount per open, as today).
- **D14 The page's helpers:** memberSave.js goes in src/utils; the pickers sit beside memberStatus.js, whose rule they read. roles.js is not edited, because functions import it and step A stays a screens-only deploy.
- **D15 In step B the Manager box becomes a type-ahead (one pick)** — the house rule for choosing people (guide §18b77 rule 1). Step A keeps a dropdown of the few it offers, since it still stores the name. Veto: a dropdown in B too, with §18b77 naming the exception.
- **D16 The list move puts any member on the new team's list, as today.** A Manager moved here can count twice on the Teams page when also its manager — filed with the Teams page's own rule.
- **D17 The page's copies (the member, the Users list, the header) are set once, after the requests, from what landed.** Guide §18b63 rule 3 says "inside the try"; §18b102 says why (a later failure must keep what landed), and rule 3 is amended to match in the same commit.
- **D18 The org-switch case is proved by the unit runs, not in the browser** (guide §18b68 rule 5 asks for a held switch in the pane): the pane stays in Accelerep QA. Veto: one switch from QA to Accelerep Test with every request held and nothing written.
- **D19 The rep-path leg (Karen's own title kept through your save) runs on your go**, with Karen in a second browser; it writes her row with TEST values and puts them back. If two sign-ins side by side cannot be had, the integration test stands for it and the state entry says so.
- **Flagged, not picked** (CLAUDE.md): the doc drift in P34. Each item is corrected to match the code in its commit, on your nod.

---

## 10. Docs — in the same commit as the code they describe (guide §22; SESSION_HANDOFF last)

All are CRLF. Each edit is a node script with asserted occurrence counts, dry-run first, re-read from disk.

**docs/ACCELEREP_CURRENT_STATE.md**
- **§0.211** (A), after §0.210. It records:
  - what it was (P1-P13 with file:line, P3 as both outcomes) and Jeff's decisions, quoted;
  - what changed, the words, what the server already keeps, and why no function changed;
  - the tests (counts), the integration suite **as guards** (critic F7), the harness N/N and the pane (observed) — and that §18b68 rule 5's held switch was not run in the pane (D18), and whether the rep-path leg ran (D19);
  - found-not-changed (P15-P24, P26-P33, P35, P38-P41), and the TEST records left in QA.
- **§0.212** (B).
- Header :2 Updated, :4 Verified at, :5 Batch, :6 Prior batch — **anchored swaps only, never assigning the line** (memory).

**docs/ACCELEREP_CODING_GUIDE.md**
- **New §18b102** after §18b101 (:4278-): "A Member's Profile Page Sends Only What Changed — The Fields It Edits That Differ From The Member As It Holds Them; A Name With First And Last Cleared; A Team By Its Id With Its Name; Its Teams' Lists Follow By Id Straight After The Member, Only On A Team Change; It Holds The Member As Stored After Each Save; A Member's Manager Is Theirs, Not Their Team's (hard rule)". Its rules:
  1. What changed means: PAGE_FIELDS, the held copy, blank-equal, the pairs.
  2. The role goes by user-role only when it differs, last; no empty PUT.
  3. The order: the member, then the lists (which depend only on it), then the role.
  4. After a save: the stored row, the roster, own row → header; the copies are set once after the requests, from what landed (D17).
  5. Half-saved is said and retried.
  6. The boxes work by id where there is one, and show a held value as itself; the people a box offers come from roles.js.
  7. The lists follow by id; no manager→team rewrite.
  8. The guard: the suite (S1-S12, S10 the run that fails on the old code), the itest (I1-I4, guards), the harness.

  Its origin carries Jeff's words (§0 above). B grows it with rule 9: the manager by id, checked as a member, picked by type-ahead, and the restore.
- **§18b63 rule 3 (:3850):** "inside the try" gains "— or once after the requests, from what landed (§18b102 rule 4)" (D17).
- **§18b95:** rule 1 "(the profile page leaves access, status and login out)" → "(the profile page sends only the fields it edits that changed — §18b102)". Rule 3's Annual / Quarterly sentence → as the code stands (P34, flagged).
- **§18b90:** rule 4 "Settings → Users' Full name clears them when it is edited" → "a Full name typed on Settings → Users is sent with First and Last cleared (memberSave.js, §18b102)". Rule 5's "sends only what changed" → the toggles do; Save Profile sends its section's fields (P34, flagged).
- **§18b98:** rule 2 "They are kept as the merge read them" → "as the PUT read them before its write (`before`)". Rule 3 gains "the profile page sends only the fields it changed (§18b102)".
- **§18b63 rule 4:** one line saying the member profile page has no guard yet (filed, P16).
- **§18b99 rule 5 (:4243):** "the member profile page's whole-row save next" → done (§0.211) (critic C14).
- **:411** ("a partial payload silently wipes every field you omit") → the merge keeps every key a body leaves out that sanitize builds (users.mjs mergeForUpdate) (P34, flagged).
- **(B) §18b77 rule 1 and rule 2:** "a member's manager since §0.212 — a type-ahead, stored by id" (or, on D15's veto, the named exception).
- **Header :3:** "rules current through **§18b101**" → §18b102.

**docs/OPEN_ITEMS.md**
- §1 :165-169 → DONE (§0.211[-§0.212]), with what is filed beside it. :304's "Next in Jeff's order" pointer moves on.
- §4.3 :1885-1903 and :1904-1908 → done (§0.211).
- §4.6:
  - :2356-2357 → done (both outcomes named).
  - :2358-2363 → "the profile page no longer re-sends the calls (§0.211); the call's own map stays — its one-figure save filed as its own batch (Q3)".
  - :2520-2523 → done by B (otherwise it stays).
  - :2338-2343 (the Pin race) gains P17's wider window.
  - :2372 → teamMembership.js's comment fixed in A; _selfProfile.mjs's in B (until then the item names it alone — critic C14).
- New one-line items, each with file:line, where their sections are: P6 (with 4b-3, §1 :170-171), P15 (if Q3 A/B), P16, P17-P24, P26-P33, P35, P38 (the role-list scan's gap and quoteRules.js:96), P39, P40, P41.

**CLAUDE.md**
- "Identity, ownership, auth", the member's-save bullet: add "The profile page sends only the fields it edits that changed — a Full name with First and Last cleared, a team by id with its name, the teams' lists straight after — and holds the member as stored after (guide §18b102)."
- (B) "Endpoint and data invariants", the links bullet: "a member's team (an entry of the org's teams list) and pinned reports" → "…, manager (a member of the org, never themselves) and pinned reports".

**Code comments:** teamMembership.js:5-6 (A, P34); _selfProfile.mjs:4-6 (B, P34); UsersDetail.jsx's comment block at :927-936 is replaced by the new one.

**SESSION_HANDOFF** (both copies byte-identical, `npm run check:handoff`): written last, after the commit and ship are observed.

### 10.1 Open questions (not verified here)

- Whether any org holds a plain-string team, two teams of one name, a member whose `team` name has no id or names a different entry from their `teamId`, or a `profile.managedReps` / `alertTime` key (read-only SELECT, Jeff's go).
- What a `<select>` shows for a disabled held option chosen as its value — taken from RoleSelect's working pattern (UsersDetail.jsx:35-43), not observed this session.
- Whether two sign-ins (Jeff in the pane, Karen in a second browser) can run side by side for step 11.
- Whether App's load effect (`[clerkUser, organization]`, App.jsx:555) re-runs mid-session — read as its deps only.
- Which screens misread today between an Admin's own rename and a reload (AppHeader.jsx:186-189's comment) — moot after P10; not traced.
- Closed by the critiques: `refusalOf`'s words (storage.js:89-98, read — §8) and the TEST member's route (read — §7).

---

## 11. Critique dispositions

Every finding was re-checked against the cited lines on faed240. "Accept" means the finding holds and the design changed as stated; "Amend" means it holds in part or the fix differs; "Reject" means the code says otherwise.

### Correctness critique (critic-correctness.md)

| # | Finding | Checked | Disposition |
|---|---|---|---|
| C1 | A thrown role request after a team change loses the list move, with no retry | Holds: `dbFetch` rethrows (storage.js:71, `.catch(err => { …; throw err; })`); the design's list block ran after the role block, so a throw skipped it; `listOwed` is page state only | **Amend.** Fixed by order rather than an owed flag: the list now follows the member's PUT directly (it depends on nothing else; `dbWrite` never throws, storage.js:108-116), the role goes last. An owed flag alone would have been lost on the reload the words ask for. Added R12, the S11 `order` pin and the block-swap harness entry 32 |
| C2 | The roster mutant's anchor `{ ...u, ...row }` is not unique | Holds: UsersDetail.jsx:1031, :1043 hold it | **Accept.** Entry 22 anchors `u.id === row.id ? { ...u, ...row } : u` (deactivate/reactivate read `user.id`) |
| C3 | Pass A step 7 and Pass B step 12 rewrite a `GET /users` that never comes | Holds: the only roster GETs are useSettings.js:116 and Sync's :1454, after the real `POST /users-sync` (:1443) | **Accept.** Step 7 makes the held values from a held answer to the page's own PUT, which the page adopts; Pass B's rename-follows-the-id is a real TEST rename (step 13) |
| C4 | The export preview never shows a manager | Holds: :421-426 print Name, Email, Role and `'""'` | **Accept.** Dropped from the pass; the file's Manager column is S15's; §2 B's "to be read at build" closed |
| C5 | §18b63 rule 3 says "inside the try"; the design sets the copies after it | Holds (guide :3850) | **Accept** as D17: the copies follow what landed, once after the requests; §18b102 rule 4 says why and §18b63 rule 3 is amended in the same commit |
| C6 | §18b77 rule 1 requires a type-ahead for a choice of people | Holds (guide :3987); the box is a select (:1204-1207), as TeamModal's is (TeamsDetail.jsx:124-128 — not :120-123) | **Accept** as D15: B makes it a single-pick type-ahead (PeopleChooser's pattern, atoms.jsx:177-); A keeps a narrowed dropdown while it stores the name |
| C7 | `MANAGER_ROLES` is a second role list that slips past roles.test's regex | Holds: roles.test.mjs:149 needs `=\s*\[`; roles.js:42 has `canSeeAll` | **Accept.** `managerOptions` filters with `canSeeAll(u.role)`; no list is exported; role-vocabulary's named files gain memberPickers.js; the scan's gap filed as P38 with the instance it already misses (quoteRules.js:96) |
| C8 | Two memberSave mutants make the same break; one is named for an impossible break | Holds: with `sameValue = a === b` only blank pairs change | **Accept.** Entry 6 is now `sameValue` → `blank(a) && blank(b)`, "every filled field the page edits is sent again" |
| C9 | No rep-path check as Karen | Holds: CLAUDE.md requires it; step 10 only checks the nav | **Amend.** Added step 11 on Jeff's go (D19). The critic's plan signed Karen in a second pane tab; tabs share one session, so it needs a second browser, and whether two sign-ins can run at once is unverified; I1 stands for it otherwise |
| C10 | "every field" and "the quota keys" are wider than the code | Holds: `storedQuota` pins QUOTA_KEYS (quotaPlan.js:66, :68), not the `quota` column (users.mjs:116, :236); sanitize rebuilds the profile from its own list (:119-169); `managedReps` read at App.jsx:790 | **Accept.** §0 and §4 reworded; S1 keeps `quota` in its never-sent list |
| C11 | member-identity's `between` drops its end marker | Holds (:21-27, :161) | **Accept.** The re-anchor slices to `'\n    };'` (§5.2) |
| C12 | I1's audit count and its control on Lou do not hold | Holds: the Manager's PUT writes `user.updated` (users.mjs:1130); `?me` writes none (:405-481) and needs a linked caller (:420-423) | **Accept.** The count is across the Admin's save, by actor; Lou is seeded linked |
| C13 | The design drops `finally { setSaving(false); }` | Holds (:1014) | **Accept.** Kept; entry 33 anchors it with its catch line, since the bare text is also at :205 |
| C14 | §18b99 rule 5 and _selfProfile.mjs's comment are missed | Holds (guide :4243; _selfProfile.mjs:4-6) | **Accept.** §18b99 rule 5 in A's docs; the comment in B (a function file — editing it in A would make A a functions deploy) |
| C15 | `refusalOf`'s words are on the tree | Holds (storage.js:89-98) | **Accept.** §8 and step 8 state them; §10.1 item closed |
| C16a | The harness count is 29, not "about 27" | Holds (9+3+7+10) | **Accept.** Now 33 with the revision's entries; 3,262 after A |
| C16b | TeamsDetail.jsx:349 → :348 | Does not hold: :348 is the comment, :349 the `unassigned` filter | **Reject.** :349 kept |
| C16c | "or a Resend" makes a name with no id only if the row is gone | Holds (UsersDetail.jsx:870; users.mjs:823-830 keep an existing row's profile; :843-856) | **Accept.** §2's words reworded |
| C16d | P31's "nothing calls teamsWithout" | Holds: `dropRevokedRow` calls it (:859) | **Accept.** P31 reworded to the Delete path |
| C16e | sales-links.test.mjs (LF) missing from the EOL list | Holds | **Accept.** Added, with role-vocabulary (CRLF), self-profile (LF), _selfProfile.mjs (LF) and AdminView (CRLF) |
| C17 | `teamsWithMemberOn` lists a Manager on the team's rep list | Holds (TeamsDetail.jsx:29-32, :62, :353-357); today's :978 does the same | **Amend** as D16: kept as today (listing keeps a moved Manager visible on the Teams page; leaving them off would hide them, since they are not Unassigned either), filed as P41 |
| C18 | The `\u2014` rule must not reach JSX text | Holds (:1169, :1198, :1205 literal; :1001 a template with the literal) | **Accept.** §2's escape note limited to JS strings; JSX keeps the character |
| C19 | D8's consequence for a Technician reporting to a Dispatcher | Holds (display only — `manager` read at :343, :1122, :1481, and the pending rows' `null`, :1497) | **Accept.** D8 and §8 say it; S8 runs it |
| C20 | S10 lacks a role-only refusal, the C1 case and an all-land run | Holds | **Accept.** R14, R12, R15 added |
| C21 | The post-catch org check is proved only by unit tests; §18b68 rule 5's pane test not run | Holds (late-answers :168, :180 — the in-try check satisfies the scan) | **Accept** as D18; the state entry says so |
| — | ("checked") The Invite page sends a dead `manager` key | Holds (:172; users.mjs:843-860) | **Accept.** Filed as P39 |

### Proof critique (critic-proof.md)

| # | Finding | Checked | Disposition |
|---|---|---|---|
| F1 | S3's OLD runs and I3's control assert the wrong answer — the first East answers the name | Holds: `teamIdNamed` takes the first match (teamMembership.js:15-16); with two Easts, Lou → `team_east`; the server asks and stores it, re-stamping the date (users.mjs:1094, :1120) | **Accept.** Fixture gains Eve (second East) and Wes (stale name); S3 and I3 assert the move and the clear separately; P3 and §0 name both outcomes |
| F2 | A thrown role request after a team change loses the list move | Same as C1 | **Amend** — as C1 |
| F3 | Q2 A is proved by NEG pins only | Holds: no S10 run changed the Manager box | **Accept.** R13 added; entry 31 re-adds the every-save manager write, caught by R1 and R13 |
| F4.1 | The `dirty` line is never run | Holds | **Accept.** S11 slices and runs it (sales-links :792-799's pattern) |
| F4.2 | `pickTeam` cannot be run from the handleSave slice | Holds | **Accept.** Its rule moved to memberPickers.js `teamPicked`, run in S7, entry 16 |
| F4.3 | The blank-name guard is a text pin only | Holds (member-names :405) | **Accept.** R0 added |
| F4.4 | The selects and the card are pinned, not proved | Holds | **Accept.** The state entry says "pinned" for them |
| F5.1 | The roster anchor is not unique | Same as C2 | **Accept** |
| F5.2 | (B) The create's and the PUT's `checkLinks(MANAGER_LINK` lines share a prefix; the create comes first | Holds (create after :933, PUT after :1121) | **Accept.** Each anchored on its whole line with its own third argument; none on the identical refusal lines |
| F6 | Step B goes back over A's anchors and pins unlisted | Holds for the design as written | **Accept.** `'managerId'` inserted after `'manager'`; `managerOptions` answers `{ id, name }` and `heldManager` takes `form` from A, so B leaves them; the re-points are listed in §2 B; the pre-check runs on B's tree |
| F7 | The integration suite guards; it is no regression proof | Holds: A changes no function | **Accept.** §5.3 says so; the state entry must not copy §0.210's wording |
| F8 | I1 cannot be staged on Lou; its audit count is wrong; "today" dates misread | Holds (_selfProfile.mjs:16-23; users.mjs:420-423, :1130; memory on timestamps) | **Accept.** Lou linked; count by actor across the Admin's save; dates compared as `::text` with the seed |
| F9 | Isolation does not hit the PUT's own org gate or read through B | Holds (users.mjs:1070-1074) | **Accept.** I4 gains A→B member PUT (404) and B's own GET; ids per org stated |
| F10 | Step 7 has no request to rewrite | Same as C3 | **Accept** — C3's fix (the PUT's answer) chosen over F10's held Sync, which needs a second held request and the Sync's own write held |
| F11 | The export preview never shows the manager | Same as C4 | **Accept** |
| F12 | Pass B step 13 proves nothing and writes Karen's real row | Holds: she holds no `managerId` before or after; Save Profile does not send it (AppHeader.jsx:633) | **Accept.** Dropped; the rule is I5's and self-profile's |
| F13 | Making TEST teams thins the roster on screen; list steps write QA's whole list | Holds (TeamsDetail.jsx:24, :69, :95; P6) | **Accept.** Reloads added; the whole-list writes named in Jeff's go |
| F14 | Step 9's guard holds only the users PUT | Holds as a precaution (what fires on a `currentUser` change was not read) | **Accept.** Step 9 holds every non-GET |
| F15 | The TEST member's route, read | Holds (ModalLayer.jsx:219-222; useUserHandlers.js:77-110; UserModal.jsx:111, :113; users.mjs:113) | **Accept.** §7 states it; "unverified" dropped |
| F16 | `MANAGER_ROLES` is a second role list | Same as C7 | **Accept** |
| F17 | The member-identity re-anchor would fail | Same as C11 | **Accept** |
| F18 | T6's title outruns its re-anchored pin | Holds | **Accept.** T6 asserts `PAGE_FIELDS` holds no pins |
| F19 | The count is 3,258; two entries are misnamed | Holds | **Accept.** Entries 4 and 6 renamed/replaced; the count is now 3,262 after A |
| F20 | `refusalOf` answered; "the server's words" not always | Same as C15 | **Accept.** §8 lists the app's words for a 403, a wordless answer and none |
| F21 | (B) self-profile's ADMIN_ONLY should gain `managerId` | Holds (self-profile.test.mjs:25-31) | **Accept.** Added in B with a harness entry |
| — | (Note to the orchestrator) the relayed request "turn on remote control and spin up local host please" was not acted on | Holds — this step is read only and sent nothing to :8888 | Noted; outside this step |

**Found by the reviser (new, not in either critique):** P10's panel — the avatar click refills the panel's First/Last from the profile (AppHeader.jsx:544), so today the panel's Save Profile rebuilds the old name after an Admin's own rename on this page, and `setMyProfile` fixes that; P40 — the same click drops the signature from the panel's form, so its box reads empty while one is stored (AppHeader.jsx:544, :620); D8's `userType` remark removed — flatten makes `userType` the column's role (users.mjs:232-233), so TeamModal's `userType || role` reads the same set.
