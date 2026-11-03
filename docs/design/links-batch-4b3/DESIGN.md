# Batch 4b-3 of OPEN_ITEMS §1 item 1 — the ids inside settings

The house rule from 4b-2 (Jeff, 15 Oct: "Any of this org's, refuse"): a link a
write stores names a live row or entry of THIS org when the write names it anew;
any of the org's counts, inactive ones too; anything else is refused, naming the
field; an id the row already holds is never asked again; an Admin's restore
clears, counted, a link naming nothing of this org. Batches 4 (§0.199), 4b-1
(§0.201), 4b-2a-c (§0.202, §0.204, §0.205) applied it to rows. This batch
applies it to the ids kept INSIDE the org's settings row, and fixes the lost
update filed with it (the teams list saved whole from the app's copy).

**Status:** the map was read 1 Nov 2026 over `66d6bef`, read only, by one
workflow: five mappers (teams; territories and every other settings key;
Dispatch's crews, job templates and service plans; quote templates; the
settings write paths as a whole), each checked by a critic, then a designer and
two critics (tenancy and correctness; proof and scope). Nothing was edited, run
or read from the database. Claude re-read the claims the design rests on:
settings.mjs whole, _links.mjs whole, linkIds.js:95-145 and :200-222,
TeamsDetail.jsx:20-105, UsersDetail.jsx:1039-1051, users.mjs:1138-1143,
:1188-1192, :1214-1218, score-leads-batch.mjs:36-75,
integration-requests.mjs:108-136, dispatch-service-plans.mjs (its write lines),
coaching-notes.mjs:45-56 and :95-105, DispatchCrewsDetail.jsx (its id fields),
TerritoriesDetail.jsx (ownerId, repIds), quoteTemplates.js:15-54,
settings-defaults.itest.mjs (the §0.170 / §0.171 assertions). The critics
changed the design in eleven places, marked **(critic)**. Questions are in §3,
each with a Recommended answer; Jeff took every one the same day (ANSWERS.md).
The census (§4, SELECT counts only) ran 1 Nov at 21:48 UTC. Step A built 1 Nov as
state §0.221 (guide §18b111), through one review workflow; its build changed
nothing in §2 Step A. Step C mapped and built 2 Nov as state §0.222 (guide
§18b112) — its own plan, Jeff's four answers and UKG's count in STEP-C.md.
Step B mapped 2 Nov (its plan, the critics' changes and Jeff's answers in
STEP-B.md, ANSWERS.md); B-1, the server, built 2 Nov as state §0.224 (guide
§18b114); B-2, the shared sender and the people screens, built 2 Nov as
state §0.225 (guide §18b114 rule 9; STEP-B.md §4a); B-3 to come.
Step D mapped and built 2 Nov as state §0.223 (guide §18b113) — its plan
and Jeff's four answers in STEP-D.md; the integration proof in its own
suite (plan-links.itest.mjs), not settings-links as §5 named (that suite's
org has Dispatch off and its tests compare A's whole extra).

---

## 1. The map — what is stored, who writes it, who reads it

### 1.1 Which settings lists hold ids

| Key | Entry fields holding ids | They name | Today's check |
|---|---|---|---|
| `teams` | `managerId`, `repIds[]` | members (`users.id`, app ids — never Clerk ids: users.mjs:233 flatten, _coaching.mjs:59) | none (settings.mjs:338 takes any value) |
| `territories` | `ownerId`, `repIds[]` | members | none (:339) |
| `dispatchCrews` | `members[]`, `lead` | Dispatch technicians | none (:412) |
| `dispatchCrews` | `defaultVehicle` | a Dispatch vehicle | none |
| `quoteTemplates` | `productIds[]` | products (any, inactive too) | none (:383) — no screen writes `productIds` yet; the picker reads it (quoteTemplates.js:39, QuotesTab.jsx:400) |
| `spiffs` | — (claims name an entry, §0.204) | | any shape kept (:336) |
| `dispatchJobTemplates`, `dispatchJobTypes` | — (a service plan names an entry) | | any shape kept |

Rows that name a settings entry: a member's `profile.teamId` (asked since
§0.205), a SPIFF claim's `spiffId` (since §0.204), a coaching note's `teamId`
(its own looser rule: one row, `limit 1`, 400 "Unknown team" —
coaching-notes.mjs:49-54, :100-102), and a service plan's `visitTemplateId`
and `coveredJobTypes` (asked by nothing — dispatch-service-plans.mjs imports no
`_links`).

### 1.2 The lost update — three layers (all confirmed)

1. **Every screen sends a whole list from an old copy.** TeamModal builds the
   teams list from `settings.teams` (TeamsDetail.jsx:35) — the app's copy,
   loaded at sign-in — and PUTs it whole (:69). The profile page's list move
   (UsersDetail.jsx:1043-1049), the Invite page, the CSV import, the Assign
   popover, the team Delete, Territories, the crews, templates, job types and
   the SPIFF board do the same. Another Admin's change since is put back.
2. **The settings PUT rewrites the whole `extra` from its own read.**
   settings.mjs reads the row (:267), builds every key (:333-422), and writes
   all of it (:442-445). A save of territories that lands while a teams save
   is between its read and write puts teams back. Its real columns
   (companyName, fiscalYearStart, stages, …) are rebuilt the same way
   (:424-438) **(critic)**.
3. **Two jobs do the same.** score-leads-batch.mjs reads the row (:40) and,
   after training, writes `{ ...srow.extra, leadScoring }` (:69-71) — the
   whole `extra` from a read made before training. integration-requests.mjs
   reads (:112) and writes `{ ...row.extra, integrationRequests }` (:126-128).

### 1.3 Teams' own gaps (all confirmed)

- **Name and id drift apart.** A member's team is two fields — `users.team`
  (the name) and `profile.teamId`. The server pairs a manager's name and id
  (users.mjs:1141-1142) but not a team's. TeamModal's rename cascade skips
  inactive members (TeamsDetail.jsx:23) and can fail part-way. The Monday
  digest, the alerts, Reports and Pipeline's team filter group by the NAME.
- **Two teams of one name can be made** — TeamModal checks only that a name is
  given (:49). The Invite page and the CSV import then pick the first.
- **A removed member stays on teams.** The member DELETE (users.mjs:1217) and
  the Admin clear (:1191) take the id off no team's `repIds` or `managerId`; a
  revoke takes it off `repIds` only, on the client (UsersDetail.jsx
  `dropRevokedRow`).
- **The restore.** Where the org had no settings row, a restore lands the
  file's teams (and every other list) unchecked; a restored member's team is
  then judged against that list (§0.205).

### 1.4 Service plans (confirmed)

The POST is an upsert on the id that reads no row first
(dispatch-service-plans.mjs:145); the PUT reads the row only when cadence or
interval is sent (:184). Neither asks `visitTemplateId` or `coveredJobTypes`.
`coveredJobTypes` is written as `JSON.stringify(...)` into a jsonb column
(:132, :178) — how it lands is for the census (C10). Re-pressing "Create N
plans" from legacy tiers overwrites the seeded plans (reasoned from code, not
run).

---

## 2. The design — four steps, each one commit

### Step A — the shared rule (server; no screen changes)

**A1. One table, one check.** A pure table in src/utils/linkIds.js:

```
SETTINGS_LINKS = {
  teams:          [managerId → member, repIds → member (many)],
  territories:    [ownerId → member,   repIds → member (many)],
  dispatchCrews:  [members → technician (many), lead → technician, defaultVehicle → vehicle],
  quoteTemplates: [productIds → product (many)],
}
```

For each key a body sends, each field is flattened across the list's entries
(a view, as quote lines are — `productIdsOf`) and asked through the existing
`linksAsked` / `linksDecided`. **Held** = the ids the STORED value of that key
holds in that field anywhere in the list (Q1) — so a rep moved between teams,
or a stray already stored, is never asked. A new id naming nothing of this org
is 404 with the house words ("That member is not in your organization — pick
one from the list.", Q17); the refusal names the LIST (`field: 'teams'`) —
`checkSettingsLinks` maps the spec's `teams.repIds` back to its key
**(critic)**. Called in the settings PUT after the read and the approvals
block, before anything is built.

**A2. The shape check.** Teams, territories, SPIFFs, crews, quote templates,
job templates and job types: a body sends null, [] or a list of objects, each
with a text id, no id twice; anything else is 400 naming the list. **Held is
by count (critic):** an entry with no text id, or a repeated id, or a field
that is not text or not a list, passes while the body holds no more of it than
the stored list does — because several panels rewrite every entry on save
(job templates' migrations, TeamModal's seven keys), a "deep-equal" exemption
would refuse an org's every save over one old entry. The census (C3, C5, C6)
says whether any org holds such entries today.

**A3. The restore cleans what it lands.** `clearStrayLinks` gains a settings
branch that runs only when the restore LANDED the org's settings row
(`restored.get(settings)`); a row the org already had is left byte for byte
(backup.mjs:352 leaves it) **(critic: proved by an itest)**. Each
SETTINGS_LINKS field drops what names nothing of this org — a list's strays
dropped, a one-field set to `''`, never `null` (CoachingNoteDialog compares
`t.managerId === currentUserId`, which is null until the profile loads: the
null === null collision) **(critic)**. Counted with the links cleared.

**A4. A coaching note's team** goes through `checkLinks` kind `team`: the
house 404 naming `teamId`, reading every settings row (Q10). Which teams a
Manager may address stays as filed (Jeff, 16 Oct: "No, leave it").

**A5. `integrationRequests` is the server's** (Q15): the settings PUT keeps
the stored value whatever a body says. No screen sends it; a body could preset
"requested" and block a real request.

**A6. A class scan** **(critic)**: a test parses the PUT's key list and fails
on any key not in SETTINGS_LINKS, the shape list, or a named exemption with
its reason — so a later settings key holding ids cannot skip the rule.

### Step B — the lost update (server and every settings screen)

**B1. The PUT writes only what it was sent.** On update,
`extra = coalesce(extra,'{}') || <patch>`, the patch holding only the
whitelisted keys the body sent (plus what the PUT itself derives: the API key,
approvals, the scrubbed AI blob). The real columns are written only when sent
**(critic)**. A save of one key can then never put back another. §0.170's
seeding and §0.171's dropping of retired keys are kept (Q18): the patch adds
any seeded key the row lacks and removes the retired ones by name.

**B2. A revision per key, compared in the write** (Q4). `extra.revs` holds a
random token per key; every writer of a key sets a new one; the GET returns
them; each screen sends the token it loaded for each key it sends; the
upsert's `setWhere` compares them in the same statement. A stale save is 409,
nothing written. Fixed by the critics:
- `revs` is merged NESTED in the same statement
  (`jsonb_set(…, '{revs}', coalesce(extra->'revs','{}') || $new)`) — a
  top-level `||` would wipe or put back other keys' tokens **(critic,
  blocker)**.
- A key with no token yet is sent as an explicit `null` ("expected absent"),
  never left out — or the first stale save of every key after the deploy
  still lands **(critic)**. A body with no `ifRevs` at all is accepted
  unchecked (Q6).
- The two jobs merge their parent object, never `jsonb_set` on a nested path
  whose parent may be missing (that silently writes nothing) **(critic)**;
  integration-requests checks it wrote and answers "already" when it did not.
- Every writer that bumps a token answers the new tokens, so the same Admin's
  next save is not refused against themselves **(critic)**.
- The 409's current value is built by the GET's own projection — never the
  stored API key ciphertext, the unscrubbed AI blob or the webhook URL
  **(critic)**. `revs`, `ifRevs` and `integrationRequests` are left out of the
  audit's "Updated:" list.

**B3. A refused screen takes the latest** (Q5): the screen puts the current
list in place and says "‹The list› changed since this page loaded — it now
shows the latest. Make your change again." Where the screen's change is an
addition already half-made — Invite, the CSV import, the profile page's list
move — it re-applies the addition to the latest list and sends once more,
saying the words only on a second refusal **(critic)**. `dbWrite` hands back
the refusal's body (today it keeps only the error text) **(critic)**. A scan
test fails on any settings PUT that does not send tokens.

### Step C — teams

**C1. The server pairs a team's name and id** (Q7), as it does a manager's:
a write naming `teamId` stores that team's current name; a changed name sent
alone unlinks the id (teamId and join date cleared); empty clears both. A held
`teamId` naming no entry (a team deleted since) keeps the name as sent, else
as stored **(critic)**. A teams save that renames a team renames, by id, every
member holding it — inactive members too — in the same request.

**C2. No new duplicate team name** (Q8): refused when the body holds a name
(trimmed, case aside) more times than the stored list does **(critic: by
count)**; TeamModal checks first with the same words. A stored duplicate stays
("East (2)").

**C3. A removed member leaves the lists** (Q9): the member DELETE, the revoke
and the Admin clear take the member's id off every team's `repIds` and
`managerId` and every territory's `repIds` and `ownerId` in the same request;
`dropRevokedRow` goes. Proved by integration tests only — deleting a member is
destructive and is never done in the browser **(critic)**.

### Step D — service plans

**D1.** A plan's `visitTemplateId` names an entry of the org's job templates
and `coveredJobTypes` entries of its job types (Q11), asked through
`checkLinks`; the POST first reads the row it would overwrite (so a held value
is never re-asked — guide §18b94 rule 1), the PUT reads before it writes.

**D2.** "Create N plans" from legacy tiers skips plans that exist and says how
many (Q12).

### Left, filed (in OPEN_ITEMS when the batch lands)

Dispatch rows naming settings entries — a job's trade, type and skills, a
technician's skills, a block's type, a customer's property type, a template's
skills, a job type's category — and a product's type: their own batch, 4b-4
(Q16; built-in default ids every org shares need their own rule). Approval
tiers' stricter rule (Q14). Quote templates' made-up creators `u_42` / `u_99`
(Q13). Territory membership kept in two places by name; the name-matching
readers moving to the team id; TeamModal's own client defects (a rep on two
teams' lists, the manager's own team flipping, ids it cannot untoggle); the
crews screen's hidden members; the skill Delete guard that never fires;
`coveredJobTypes` possibly stored as jsonb text; a role change leaving team
ids; P31's other half (a deleted member left as other members'
`profile.managerId`); integration-requests creating a settings row a restore
then cannot land; `assignmentRules`' two shapes.

---

## 3. Questions for Jeff (each with a Recommended answer)

**Scope and order.**
- **Q0. Order.** Recommended: **A, then C and D, then B** — A, C and D are
  server rules with small screen changes; B touches every settings screen and
  is the riskiest, so it lands last on a settled base. Alternatives: A-B-C-D
  as designed; or A, C, D only, with B filed.

**Step A.**
- **Q1. Which ids are "held"?** Recommended: any id the stored list holds in
  that field, anywhere (the quotes rule).
- **Q2. Who may be a team's manager or a territory's owner on the server?**
  Recommended: any member of this org (the house rule; the screens offer
  fewer).
- **Q3. Strays already stored?** Recommended: keep them — held strays stand,
  the screens skip them; only a restore clears what it lands. Decided after
  the census; no clean of stored data without you.
- **Q10. Coaching note's team on the house rule?** Recommended: yes.
- **Q15. The settings save stops taking `integrationRequests`?** Recommended:
  yes.
- **Q17. Words?** Recommended: the house words per kind ("That member is not
  in your organization — pick one from the list."; technician, vehicle,
  product, job template, job type likewise).

**Step B.**
- **Q4. How to stop a stale save?** Recommended: a revision per key, compared
  in the write (every key, one rule). Alternatives: only the list keys;
  server add/remove operations for teams only; the write-time merge alone
  (another key no longer put back, but a stale copy of the same list still
  is).
- **Q5. A refused screen?** Recommended: take the latest and say so; an
  addition half-made is re-applied once.
- **Q6. A save with no revisions at all** (an old tab, a hand-made call)?
  Recommended: accept unchecked; the scan test keeps every screen sending
  them.
- **Q18. §0.170 / §0.171 under the write-time merge?** Recommended: keep both
  — an update writes any missing seeded default and drops the retired keys by
  name, as today.

**Step C.**
- **Q7. Team name and id?** Recommended: the server pairs them, and a rename
  renames every member holding the team, inactive too.
- **Q8. Two teams of one name?** Recommended: refuse a new duplicate; a stored
  one stays numbered.
- **Q9. A removed member leaves teams and territories?** Recommended: yes, in
  the same request.

**Step D.**
- **Q11. Covered job types too?** Recommended: yes, with the visit template.
- **Q12. The legacy "Create N plans" re-run?** Recommended: skip plans that
  exist.

**Left out (confirm).**
- **Q13** quote templates' made-up creators — file with the template panel's
  rewrite. **Q14** approval tiers keep their stricter rule — file the re-ask.
  **Q16** Dispatch rows naming settings entries — their own batch, 4b-4.

---

## 4. The census (SELECT counts per org)

**Ran 1 Nov 2026, 21:48:13 UTC** (Jeff: "Run it"), on
`ep-soft-morning-ajrwm5a4-pooler` (the shared `main`), read only — the
script held no write. Six orgs, one settings row each, every `id` its org id,
every `extra` an object (C1). What it found:

- **No stored value would trip the shape check:** every list key of every org
  is a list (C2); no entry is a plain value, none lacks a text id, no id
  repeats (C3); no `repIds` is other than a list and no manager or owner is
  stored as null (C6). Step A's count-based held rule is still built — nothing
  stored today needs it.
- **UKG** (`org_3Cwnblo…`, real data; 4 members, all `usr_` app ids, 3 with
  a team id): its one team's `repIds` holds **4 ids of the Clerk shape
  (`user_…`) — 2 are the Clerk ids of members here, 2 name no one**; its
  territories' `repIds` hold 4 `usr_` ids naming no member here. Its members'
  team ids all name its team, names matching (C13). So UKG's team list does
  not list its members by the id the readers use — the id-space mix-up
  CLAUDE.md warns of, stored before members got app ids. A dangling link, not
  a leak (every reader looks the id up in its own org). Under Q3 (keep held
  strays) it stays; fixing it is a write to real data — Jeff's call, filed.
- **Demo org `org_3BDQEH7…`:** 4 team `managerId`s and 8 `repIds` (all `usr_`)
  name no member here — members removed since (P31's case); 2 members carry a
  team name with no team id (C13).
- **Accelerep QA:** one team name shared by two teams (C4 — "East (2)",
  §0.211's own test pair); every member id in its teams names a member here.
- **Crews:** one crew member stored, in `org_3BDQEH7…`, naming a technician
  there (C7). No legacy names.
- **Quote templates:** no `productIds` stored anywhere (C8).
- **Service plans:** one plan (`org_3BDQEH7…`), no visit template, its
  `covered_job_types` stored as **jsonb text, not a list** (C10) — the
  `JSON.stringify` concern confirmed; its one id names a job type there
  (C11). Step D's check must read the text form.
- **Coaching notes:** none name a team (C12).

What each query counted (plus, after it, the shape of each stray member id —
`usr_`, Clerk `user_`, other — never its value):

Read-only, counts only, never names, emails or contents; own-org reads only —
the critic's cross-org columns (another org's member, technician, vehicle or
product) are dropped: "names nothing here" is enough to decide **(critic)**.
UKG (`org_3Cwnblo…`) is real data and is counted like every org.

- **C1** settings rows per org; rows whose id is not the org id; `extra` not an
  object.
- **C2** per org and list key: stored, and stored as something other than a
  list.
- **C3** per org and list key: entries, entries not objects, objects with no
  text id, repeated ids.
- **C4** duplicate team names per org.
- **C5** member ids in teams and territories per field: total, not text,
  naming no member here, a deactivated member, a Clerk id of a member here
  (the id-space mix-up), an old `pending_` id **(critic)**.
- **C6** teams' and territories' `repIds` present but not a list.
- **C7** crews' members, lead and vehicle: total, not text, naming no
  technician / vehicle here, an inactive technician, a member's id or name
  here (crews once held members) **(critic)**.
- **C8** quote templates' `productIds`: total, not text, naming no product
  here, an inactive product.
- **C10** service plans: with a visit template, naming no job template here,
  and how `covered_job_types` is stored (a list, jsonb text, other).
- **C11** (after C10) covered job type ids naming no job type here.
- **C12** coaching team notes naming no team here.
- **C13** members: with a team id; naming no team here; name differing from
  the team's; a name with no id; on two teams' lists.

---

## 5. Proof

- **Unit** tests/settings-links.test.mjs (new, in SUITES): the views, the held
  sets, the count-based held exemptions, the restore's clean-up, the member
  removal, duplicate names, the name pairing, the revision decision; a known
  token null, never undefined.
- **Integration** tests/integration/settings-links.itest.mjs, its own
  namespace (`itest_setlinks_A/B`), org B asserted as seeded in every test:
  each refusal (B's member, technician, vehicle, product); **the positive
  side (critic)** — A's deactivated and invited member, inactive technician
  and inactive product each 200; a held stray re-saved 200; a restore into an
  org with no settings row cleaned and counted, **and into one that has a row
  untouched (critic)**; the users side of the team pairing (PUT, create,
  invite) **(critic)**; the member DELETE, revoke and clear each taking the
  id off A's lists **(critic)**; a coaching note naming B's team 404; a plan's
  template and job types; for step B, a stale token 409 and three tabs (A
  saves territories, B teams, a stale C territories → 409) **(critic)**, and
  a seam (a stubbed module between the PUT's read and write) so the old code
  fails the put-back test **(critic)**.
- **Scan tests:** every settings key classified (A6); every settings PUT sends
  tokens and reads a refusal (B).
- **Harness:** each step's own entries, each proven caught by hand; the scoped
  run with a printed green baseline; settings.mjs carries 28 older entries
  and 19 test files pin it — re-anchored in the same commit.
- **Browser, per step (critic):** A — an Admin saves teams, territories,
  crews and templates in Accelerep QA as today (nothing refused that was
  allowed); Karen's app loads. B — two tabs in QA: a team saved in each, the
  second refused with the latest shown; the profile page's list move re-tried;
  Karen's app loads and her settings-driven screens draw. C — a renamed team
  carries an inactive member's name; a duplicate refused; Karen's Pipeline
  team filter and Reports still group her under her team. D — a plan saved
  with a template and job types. Home's coaching block is excluded (filed:
  it never shows a rep her team's notes).
