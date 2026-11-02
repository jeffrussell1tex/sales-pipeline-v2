# Batch 4b-3, step C — teams: the build plan

**Status:** mapped 2 Nov 2026 over `cadb15c`, read only, by one workflow: five
mappers (the name and id pairing; duplicate names; a removed member; TeamModal;
the readers and the proof), a designer, two critics (tenancy and correctness;
proof and scope). Nothing was edited, run against a database, served or
mutated. Claude re-read the code the plan rests on: TeamsDetail.jsx TeamModal
(:22-100), users.mjs sanitize's team line (:121), the PUT from `merged` to the
manager pairing (:1094-1142), the revoke (:653-692), the clear and the DELETE
(:1160-1222), users-sync.mjs :118-162, UsersDetail.jsx `dropRevokedRow`
(:857-871). The critics changed the plan in the places marked **(critic)**.
Line numbers are `cadb15c`'s.

The DESIGN (§2 Step C, Q7-Q9) and OPEN_ITEMS §4.3's first item (TeamModal's
clearing, High) are the scope.

---

## 0. Corrections to the DESIGN

- **C2 counts repeats, not totals.** "More times than the stored list" refuses
  every rename to a free name (one against zero). A name is refused when the
  body holds more REPEATS of it (each copy after its first) than the stored
  list does — step A's id rule (linkIds.js:314-316).
- **The DESIGN's step C browser check cannot be seen.** Pipeline's team filter
  is dead (`setPipelineTeamFilter` is declared at PipelineTab.jsx:412 and
  called nowhere; `<ViewingBar` is rendered nowhere), and a Sales Rep's
  directory is `{ id, name, active }` (users.mjs:514-516), so Reports'
  `myTeamName` is null for Karen. Replaced in §6.
- **The DELETE answers 200 for an id not in this org** (users.mjs:1217 runs a
  no-op delete and an audit row). C3 writes the lists only when the row was
  found.

## 1. C1 — the server pairs a team's name and id (Q7)

Pure rules in `src/utils/teamMembership.js` (appended after its last function,
so no older harness anchor is captured — **(critic)**):

- `teamNamesOf(list)` → `Map(id → name)`: object entries with a non-empty text
  id and name; the first entry for an id wins; a non-list is empty.
- `teamPaired(data, stored, nameOf)` → `null` (nothing to do) or
  `{ team, teamId }`:
  - neither `team` nor `teamId` sent: `null`;
  - `teamId` sent, non-blank: the entry's name when the org has the team (the
    sent name ignored); a held id whose team was deleted since keeps the name
    as sent, else as stored;
  - `teamId` sent blank **with a non-blank name: the name as sent, no id**; a
    blank id with no name (or a blank one) clears both **(critic — the plan
    dropped a sent name; old tabs, the Invite page and the CSV import send a
    name with a null id)**;
  - `team` alone: unchanged → `null`; changed → the name as sent, the id
    cleared (a name alone unlinks the id).
- `teamRenames(sent, stored)` → `[{ id, name }]`: entries of the body whose id
  the stored list holds and whose non-blank name differs; a non-list is `[]`.

Server:

- `_links.mjs teamNamesInOrg(orgId)` reads only `extra->'teams'` of the org's
  settings rows **(critic: never the whole extra)**, in words no older anchor
  shares.
- users.mjs PUT: `before` gains `team: users.team`; the pairing runs right
  after `before` and BEFORE the join-date stamp (:1105-1106), so a name that
  unlinks the team also clears `teamJoinedAt`. Names are read only when a
  non-blank `teamId` is sent; the lookup is wrapped (`nameOf`), never a bare
  `names.get` **(critic — the bare form throws on every save that names no
  team: a 500)**. The team check (:1132) and the manager pairing stay.
- users.mjs create: the same pairing after its team check; the invite stores
  the team's current name for a live team id (the line at :856, not the
  identical :817).
- settings.mjs PUT: after the links check, `renames`; the upsert and one
  `update users set team = <name>` per renamed team go in ONE `db.batch`
  (one transaction). Each update matches `org_id = this org` (team ids are
  minted on the client, `team_<ms>`, and can repeat across orgs), the team id
  in `profile->>'teamId'`, a name that differs — inactive and invited members
  too — and, as a guard **(critic)**, only while the stored list holds that id
  with that name. `invalidateRoster` after it (the house rule, _lib.mjs:243)
  **(critic)**. The audit detail says "N member(s) renamed" — mandatory, so a
  stale tab's revert can be traced **(critic)**.
- TeamModal sends no member PUT for a rename; its screen copy renames every
  holder, inactive too (fixes P26). A rename's part-way failure is gone.

## 2. C2 — no new duplicate team name (Q8)

- `teamNameRefused(sent, stored)` → `null` or 400 `{ error, field: 'teams' }`:
  by repeats, the key `nameKey` (spaces collapsed, trimmed, case aside); a
  plain-string entry counts by its text; blanks skipped; a non-list is `null`.
  Words: `A team named "East" already exists — choose a different name.`
  Also refuses a name over 255 characters — `users.team` is varchar(255), and a
  rename's update failing inside the batch would roll the save back as a 500
  **(critic)**. Words: `A team name can be at most 255 characters.`
- settings.mjs: after the shape loop, before the links check — a refused name
  writes nothing and renames nobody. TeamModal checks first with the same
  rule and words (its build moved above `setSaving`).
- Accelerep QA's stored "East"/"East" pair stands; a third "east" is refused.

## 3. C3 — a removed member leaves the lists (Q9)

- `linkIds.js membersOffLists(extra, ids)` → `{ patch, removed }`: for teams'
  `managerId`/`repIds` and territories' `ownerId`/`repIds`, a removed id off
  every list (order kept), a single id set to `''` (never null — §18b111 rule
  5); a cleared territory owner also sets `owner: 'Unassigned', ownerInit:
  null, status: 'Unassigned'` as the screen does (the `reps` count is dead —
  dropped **(critic)**); other strays stay (Q3); null ids filtered out first.
- `_links.mjs removeWithLists(orgId, ids, removeStmt)`: reads the org's
  settings row; nothing to change (no row, extra no object, an empty patch) →
  the delete alone **(critic — else every ordinary delete reports a false
  "lists left")**; else the delete and a guarded update in one `db.batch` —
  the update lands only while teams and territories are as read, so a save
  landing between is never put back; on a miss it re-reads and retries (at
  most twice), then answers `listsLeft`. It returns the delete's own result
  (the clear's count).
- The DELETE (only when the row was found, its `deletedRow.id`), the revoke
  (when it removes the row) and the Admin clear (the deleted rows' ids) go
  through it. Each answers the lists as written. Deactivation is untouched.
- Screens: `dropRevokedRow` and `teamsWithout` go; every removal caller
  applies the answer's lists to the app copy — required, or the same tab's
  next teams save re-sends the removed id and step A refuses it. Each caller
  takes `requestOrg()` before its request and applies nothing after an org
  switch **(critic — three row-menu and Pending callers have no org check
  today; an answer landing after a switch would put org A's lists into org
  B's copy)**.

## 4. TeamModal's clearing (OPEN_ITEMS §4.3, High)

- `holdsMember(ids, u)`: the list holds the member's app id, or — reading a
  held stray only — their Clerk id (guarded: a member with no Clerk id never
  matches a stored null). `namesMember` the same for a single id;
  `withoutMember` drops both forms.
- `teamSaveMembers({ opened, saved, users })` → the member PUTs: a member on
  the list (by either id) whose team id is not this team joins; a member who
  WAS on the list when the window opened and is not now, and whose team id is
  this team, leaves (team, territory and vertical cleared); nobody else is
  touched — a holder of the team id the list does not name is drawn off and
  NOT cleared (UKG's case).
- The window draws ticks and the manager through the matcher; a tick adds the
  app id; an untick removes both forms; a held Clerk id is sent back as held,
  byte for byte (no write of UKG's list beyond what the Admin changed).
- Proof reaches `handleSave` itself: it is sliced and run (as S10 does for
  the profile page), with an OLD control — today's code on UKG-shaped rows
  clears the 3 holders **(critic)**.

## 5. Decided in the build (implementation, not Jeff's)

The guarded write with bounded retries (over one jsonb_agg statement);
`useUserHandlers.handleDeleteUser` (unused) updated too; 400 for a duplicate
(409 is step B's); a new suite `tests/integration/teams.itest.mjs` (its own
orgs `itest_teams_A/B/C`, the test-database guard before its first import,
each settings row seeded with `id = orgId`, the revoke through invitations'
switchable Clerk stand-in, audit rows cleaned); the clear's pre-read leaves a
member created between it and the delete on the lists (no screen calls the
clear; filed); a DELETE of an id not in this org stays a 200 that writes
nothing (its audit row filed).

## 6. Proof

- **Unit** — tests/team-membership.test.mjs: every branch of the pairing, the
  renames, the duplicate rule, the matchers (a null never matches), the save's
  member PUTs on UKG-shaped rows, handleSave sliced and run with the OLD
  control, the removal callers' org check and lists applied (a scan);
  tests/settings-links.test.mjs: `membersOffLists`, the PUT's new order, the
  users.mjs pins. Updated pins: invitations.test.mjs (the delete lines,
  `dropRevokedRow`), team-membership.test.mjs's `teamsWithout` import and
  tests, S9's last needle.
- **Integration** — tests/integration/teams.itest.mjs: the pairing on the PUT,
  create and invite; a rename renames every A holder (inactive, invited) and
  no B member holding the same id string, nor the holders of A's second team
  of the same name, never the join date; a refused rename renames nobody;
  duplicates; the DELETE, revoke and clear each taking both ids off, a member
  on no list, an org with no settings row; each refusal leaving the lists
  byte for byte; deactivation leaving them; a save landing between the
  removal's read and write survives (an async seam); org B as seeded in every
  test.
- **Harness** — each new rule's entries, each its file's only match, proven
  caught by hand; H4526, H4546 and H4550 (the removed code) retired; H10253
  (an anchor matching twice in _links.mjs) repointed; the scoped run with a
  printed green baseline.
- **Browser** (Accelerep QA, Jeff signs in; the orgs counted, the URL read;
  `dist` removed first; never the harness while netlify dev is up) — as Admin:
  a team renamed and, after a reload, the Users list shows the new name on
  each holder's row, an inactive one too (deactivating a test member for it is
  Jeff's call, reactivated after); a colour-only save sends no users PUT
  (a regression check); unticking a rep sends one PUT, for that rep; a new
  "east" shows the words and sends no settings PUT; the second "East" still
  saves. As Karen (`Clerk.user` read first): her `GET users?me=true` before
  and after a rename of her own team (renamed back after), and the app,
  Pipeline and Reports load. Never a delete or a revoke in the browser.

## 7. Risks (filed with the batch)

- The stale-tab 404 widens: a removal now takes ids off the server's lists, so
  another tab's next teams save is refused until step B.
- A stale tab's whole-list save can put an old team name back AND rename the
  holders back (the audit line traces it); step B's tokens must cover the
  rename batch and the removal's write.
- A users PUT whose merge read lands before a rename and whose write lands
  after puts the old name back on that member (step B / §18b102 rule 10).

## 8. Questions for Jeff

**J1 — Recognising a member listed by their Clerk id (a conflict with
CLAUDE.md, flagged).** CLAUDE.md: "Separate identity spaces — never mix";
guide §18b111 rule 1: "A member is `users.id`, never a Clerk id." UKG's one
team lists its members by Clerk id (the census). To stop the Teams page
clearing them, the window must recognise those entries as the members they
name. Recommended: allow it, confined to READING a held entry — never writing
a Clerk id where none was held, never into a manager — written into guide
§18b112 and CLAUDE.md as the one exception. Alternatives: (2) no matcher —
the window clears only members the Admin unticked, but draws UKG's two as off
the team; (3) repair UKG's lists to app ids — a write to real data.

**J2 — users-sync stops writing a member's team from Clerk.** users-sync.mjs
:124 reads `team` from the Clerk USER's metadata — one value across every org
a person is in — and stores it with no team id (:140 on create, :159 filling
a blank). Recommended: stop it (create and fill), and file the same hazard for
`territory`.

**J3 — A read-only count on UKG before the ship.** The census did not say
whether UKG's two Clerk-listed members are among its three team-id holders,
nor how its team's manager is stored; under §4 a listed member with no team
id would be sent a join on any save of that team (a write to real rows).
Recommended: run SELECT counts only (no names), before step C ships; keep
"do not save UKG's team on the Teams page" until then.

**J4 — The rest, each Recommended:**
- N1: a teams save renames members only for a team whose name changed against
  the stored list (no repair of stored drift).
- N2: a rename sends no member PUT; when the team's territory or vertical
  changed, `{ id, territory, vertical }` goes to every listed member (today's
  behaviour kept; closes P27) **(critic)**.
- (a): a removal drops the member's app id AND Clerk id (a returning member's
  new row has the same Clerk id and would be drawn back on).
- N4: the restore's member team stays as filed (§0.205), its pairing filed.
- N5: a name sent with no id is kept as sent, everywhere; settings keyed by
  team NAME (assignment rules, pipelines' teams) are not renamed — filed.
- N6: deactivation is not removal.
- N12: a member whose team id names the team but whom the list does not hold
  is drawn off, not cleared, not added.
- N13: the profile page's list move (by app id) is left as is — filed (a
  member held by Clerk id there gets their app id beside it; drawn as one).
- N14: the Teams page's count, org chart and "In:" use the same matcher.
- N16: team pickers number a same-name pair case aside ("east (2)").
- N17: the batch writes or repairs no stored data; UKG's rows change only by
  an Admin's action after the ship.

## 9. UKG's count (J3 — Jeff, 2 Nov: "Run it")

Ran 2 Nov 2026, 04:34:16 UTC, on `ep-soft-morning-ajrwm5a4-pooler` (the
shared `main`), UKG (`org_3Cwnblo…`) only, SELECT counts only — never a name,
an email or an id's value; the script held no write. Found:

- 4 members, all active, all linked to Clerk; 3 hold a team id; 1 settings row.
- Its one team's manager is stored EMPTY (`''`) — no Clerk-shaped manager.
- Its 4 `repIds` are all Clerk-shaped: 2 name its members by Clerk id, 2 no
  one; none by app id. Both members so listed hold this team's id; neither is
  also listed by app id.
- Of the 3 holders of the team's id: 2 listed by Clerk id, 1 not listed;
  none deactivated, every name matching the team's.
- Its 2 territories: no owner; one lists 4 rep ids naming no member, the
  other none.

So under §4 a save of UKG's team — a colour change, say — sends NO member
PUT: the 2 Clerk-listed members already hold the team (no join), the third
holder is drawn off and left as is (N12), the manager is empty. Today's code
would clear all 3. A rename would rename the 3 holders by id (the server's,
§1). "Do not save UKG's team on the Teams page" stands until step C ships.
