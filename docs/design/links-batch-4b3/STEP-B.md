# Batch 4b-3, step B — the stale settings save: the build plan

**Status:** mapped 2 Nov 2026 over `2fd2f99`, read only, by one workflow: five
mappers (the settings PUT; every other server writer; every client writer;
the refusals and the half-made additions; the proof), a designer, two critics
(tenancy and correctness; proof and scope). Nothing was edited, run against a
database or served. Claude re-read settings.mjs whole, `_links.mjs`
removeWithLists, `storage.js` dbWrite, `saveSettings.js`, `useSettings.js`'s
load, `scripts/seed-qa-org.mjs`'s write, `_heartbeat.mjs`'s `JOBS_ENABLED`
gate, App.jsx's and AdminView.jsx's leave guards and LeaveGuardModal's words.
The DESIGN (§1.2, §2 Step B, Q4-Q6, Q18) is the scope; Jeff's answers stand.
The critics changed the plan in about twenty places, marked **(critic)**.
Jeff took every Recommended answer the same day (ANSWERS.md, step B).
**B-1 (the server) built 2 Nov** as state §0.224 (guide §18b114), through one
review workflow, which changed it in three places: the retry count moved out
of the runtime's arguments (a third parameter met its callback); a save
refused only by a key it never sent (a derived key, an org's first insert) is
tried again, not refused; and its seams, pins and the old-code proof
tightened. B-2 and B-3 to come.
**B-2 mapped 2 Nov** (with B-1's harness running in its copy), read only, by
one workflow: five mappers (the sender; Teams; Territories; the people
screens; the scan and the harness), a designer, two critics (correctness and
tenancy; proof and scope) and a synthesis; Claude re-read saveSettings.js,
useSettings.js's load and the profile move. Its build plan is §4a; its
questions (JB2-1 to JB2-13) Jeff answered the same day: every
Recommended, JB2-7 and JB2-8 fixed in B-2 (ANSWERS.md, B-2).
**B-2 built 2 Nov** as state §0.225 (guide §18b114 rule 9), committed `438d974`.
**B-3 mapped 2 Nov**, read only, by one workflow: five mappers (the shell and
the leave guards; two of the sales-process panels; dispatch, Features and
Connected apps; the proof), a designer, two critics (correctness and tenancy;
proof and scope) and a synthesis; Claude re-read Features' key path, Train
now's answer, AdminView's guard and Discard, LeaveGuardModal, Connected apps'
load and the Sales Manager's saveExtra. Its build plan is §4b; its questions
JB3-1 to JB3-10.
**B-3a built 2-3 Nov** as state §0.226 (guide §18b114 rule 10): nine edit
scripts in a staged copy first, one review workflow, the browser check as
Jeff and Karen; its departures from §4b are written in state §0.226.
**B-3b built 3 Nov** as state §0.228 (guide §18b114 rule 11): one build
workflow and two fix rounds in a staged copy, one revert, the browser
check as Jeff and Karen; its departures from §4b are written in state
§0.228.

## 0. What the code does today

- **Layer 1 — every screen sends a whole list from an old copy.** 43 settings
  PUTs: 31 `putSettings` calls in 28 panels, and 12 direct `dbFetch` /
  `dbWrite` sites (TeamsDetail :73 and :442, TerritoriesDetail :59 and :217,
  UsersDetail :197 and :1039, ModalLayer :763, SalesManagerTab :971,
  FeaturesDetail :178, DispatchBlockTypes :42, DispatchJobTypes :97,
  EditBrandModal :261). Three more name the URL and are GETs (useSettings
  :82, ConnectedAppsDetail :388 and :511).
- **Layer 2 — the PUT rewrites the whole `extra` from its own read**
  (settings.mjs :274 read, :359-450 every key, :470-473 the upsert): a save of
  one key landing while another save is between its read and write puts the
  other key back. The real columns are rebuilt the same way (:457-469).
- **Layer 3 — the writers outside the PUT:** `score-leads-batch.mjs` writes
  `{ ...srow.extra, leadScoring }` from a read made before training;
  `integration-requests.mjs` writes `{ ...row.extra, integrationRequests }`;
  `_links.mjs` clearSettingsLinks (:414) and removeWithLists (:151) merge in
  SQL (removeWithLists guarded on the lists as read); backup.mjs `ownSettings`
  lands a file's extra whole; `scripts/seed-qa-org.mjs` (:105, :121) writes a
  whole extra when a key is missing **(critic)**.
- **Step C's two writes** (OPEN_ITEMS §4.3): a stale tab's whole teams list
  renames every holder back (the renames run in the PUT's own `db.batch`);
  after a member is removed, a stale tab's teams save is a 404 naming the
  member, because the link check runs before any write.

## 1. Corrections to the DESIGN (flagged, not silently picked)

- **C-1. Retired keys.** Nothing removes them "by name" today: the full
  rewrite drops every stored key the PUT's key list does not hold, and tests
  forbid the retired names in settings.mjs. The patch write keeps that by the
  list — every stored key outside it is dropped, no name written (Q18 kept).
- **C-2. dbWrite.** db-write.test.mjs pins that a refusal hands back no body.
  dbWrite stays; every settings save moves onto one sender in
  saveSettings.js, which reads the refusal itself.
- **C-3. Writers DESIGN B2 left out:** clearSettingsLinks, the restore's
  `ownSettings`, and the QA seed script **(critic)**.
- **C-4. The compare must come first.** The shape, name and link checks run
  before the write, so a compare only in the write leaves a stale tab's 404.
  The PUT compares straight after its read, and again in the write.
- **C-5. The write compares the tokens the server read** for every key it
  writes — the derived ones too (the approvals pair's other half, a migrated
  API key, the scrubbed AI blob) — so its own read-to-write gap is guarded.
- **C-6.** settings.mjs carries 40 harness entries, not DESIGN's 28.

## 2. The split — three commits, each fully verified (J-B1)

- **B-1, the server.** The patch write; a token per key minted by every
  writer; the GET answers them; the early and in-write refusal; the renames
  tied to the write; the jobs, the restore and the seed script. Screens
  unchanged — they send no tokens, so Q6 applies. Closes layers 2 and 3;
  closes neither OPEN_ITEMS §4.3 item yet **(critic)**.
- **B-2, the shared sender and the people screens:** putSettings,
  `writeSettings`, `addToSettingsList`; Teams (window, Delete, Assign),
  Territories (window, CSV, Delete), the Invite page, the profile page's move,
  the member import; the removal answers' tokens. Closes both §4.3 items. The
  client scan lands with a named list of the screens B-3 converts.
- **B-3, every other settings screen** (about 30 files) and both leave guards
  (AdminView's and App.jsx's **(critic)**). The scan's list empties. May split
  in two after `mutate-scope --list` sizes it **(critic)**.

## 3. B-1 — the server

**The patch write (B1).** settings.mjs keeps its read, its checks and its
`const extra = {` literal as text (J-B2): the literal becomes "the value each
key takes if this save writes it", and only the keys this save writes are
picked from it — what the body sent, plus what the PUT derives (the approvals
pair's other half; the API key when set, cleared or migrated; aiSettings when
the stored blob needs its scrub **(critic: by `scrubAiSettings` changing it,
not by a key-shaped value)**). Never `integrationRequests` (Q15). The real
columns are written only when sent. One statement:

```
extra = seeds || (stored, minus every key outside the PUT's list) || patch || revs merged
```

right side wins, so a stored key (even null) beats its seed and the patch
beats both — §0.170 kept. `funnelStages` and `painPoints` seed from the row's
own columns when they hold values (J-B3 — today an old row's column stages are
hidden after its first unrelated save: GET :110 against PUT :416). A fresh
org's first save stores the seeds, the patch and the tokens, not all 81 keys —
proven by a GET equal key for key **(critic)**.

**Tokens (B2).** `extra.revs` holds a random token per key. A key with none
reads as null ("expected absent"). Every writer sets a new one for each key it
writes, merged NESTED — `jsonb_build_object('revs', <the row's revs, or {}> ||
<new>)` — never `jsonb_set` on a path whose parent may be missing. The GET
answers `revs` to every member (random tokens; only an Admin may PUT).

**The PUT's order.** Parse; the Admin gate; `ifRevs` read off the body (absent
→ unchecked, Q6; not an object of strings or nulls → 400); the 400s; the read;
**the early compare** — a key the body sent whose token moved is a 409 before
anything else is checked; the existing checks; the patch; the upsert with
`setWhere` comparing the tokens as read for every key written or sent, and
`.returning`; the renames; the batch; **nothing landed → 409** — before the
roster cache is dropped and before the audit. The renames' `exists()` also
requires `extra->'revs'->>'teams'` to equal this save's new token, so a
refused write renames no one. A token is minted only for a key actually
written **(critic)**. The audit lists the keys written — never `ifRevs`,
`revs` or `integrationRequests`. The 200 answers the tokens of the keys the
body SENT only — a derived key is bumped but not answered, so the tab's next
save of it is refused once and shown the latest **(critic)**.

**A save with no tokens that loses its own race (J-B15, critic).** Q6 accepts
it unchecked; the write still compares what the server read, so another save
landing in its gap would refuse it. Recommended: the PUT tries again on a
fresh read, twice at most, as removeWithLists does — still "accepted
unchecked" — and only then answers 409.

**The refusal (J-B4).** Recommended **(critic)**: the 409 carries `code:
'stale'`, the keys that moved since the read (`stale`) and the server's words,
and nothing of the row; the screen takes the latest with one GET of settings,
which answers values and tokens as one matched set through the GET as it
stands. No copy of the GET's projection, no Slack webhook question (the GET
already gives an Admin what an Admin may read), no re-anchored GET pins. A
refusal whose moved keys share none with what was sent (a derived key moved)
is resent once unchanged **(critic)**. `code: 'stale'` keeps it apart from the
users endpoint's `code: 'invitation'` 409.

**The other writers.**
- removeWithLists keeps its content-as-read guards, mints a token per try for
  the lists it writes, and answers them; the member DELETE, the revoke and the
  clear pass `revs` on. A stale tab after a removal then gets the 409 and the
  latest list, not the 404 (with B-2's screens).
- clearSettingsLinks: guarded on each key as read (distinct text — harness
  uniqueness **(critic)**), a token per key, `.returning` — and counts only
  what landed **(critic)**.
- The restore's `ownSettings` drops a file's `revs` and mints every key's
  token (J-B13): every open tab of that org is refused once, shown the latest.
- `scoreOrg` (Train now and the nightly run): a guarded merge of
  `leadScoring` alone, keyed by org, guarded on `leadScoring` as read; refused
  when the rules changed while training — nothing trained, leads scored on the
  stored rules, "The lead scoring rules changed while training — nothing was
  trained. Train again." (J-B9); answers its token.
- integration-requests: a guarded merge of the one app's request (written
  only while none is stored), `updatedAt` kept **(critic)**; the insert
  `onConflictDoNothing`; a write that lands nothing answers "already". No
  token (Q15 — no screen sends the key).
- The QA seed script: a SQL merge of only the keys it adds, guarded on their
  absence, tokens minted **(critic)**.
- A server writer scan (netlify/functions and scripts) names every
  `update`/`insert` of settings with its rule.

## 4. B-2 and B-3 — the screens

- **Where tokens live:** in the app copy, `settings.revs` (the GET's answer
  is spread in already). A screen takes its token **with its draft** — a
  window or panel at open, a click-built save from the same render that read
  the list — never at send time.
- **One sender** (saveSettings.js): `putSettings(payload, revs)` sends each
  key's token (`?? null`, never undefined); on a stale refusal it throws an
  Error carrying `.stale`. `writeSettings` (never throws) replaces the direct
  sites. `addToSettingsList` re-applies a half-made addition once on the
  latest list (Q5) and says the words only on a second refusal.
- **Every success merges the answered tokens**; `settingsAfterRemoval` merges
  the removal's. The Assign popover merges the landed teams list and its token
  before the member's PUT **(critic)**.
- **A refusal takes the latest (Q5).** The people screens: Invite and the
  member import re-apply once (J-B6 words on a second refusal); the profile
  page keeps its owed move and "Save changes tries the list again" (J-B7);
  Teams' and Territories' windows close on an edit, stay open on a new entry
  (J-B8); Assign, Delete and the CSV say "The team list changed since this
  page loaded — it now shows the latest. Make your change again." Every other
  panel: AdminView remounts the open panel on the latest copy and draws the
  words above it, setting the copy and the remount in one handler (J-B5).
- **Optimistic panels** (Pipelines, Calendar, Edit brand): one save in flight
  at a time, and a failure rolls back only the keys sent — never `revs`
  (J-B10, now required: a whole-snapshot rollback brings old tokens back)
  **(critic)**.
- **Both leave guards** (AdminView's and App.jsx's): on a stale refusal,
  "Another change landed first — the page now shows the latest. Your changes
  were not saved." — not "Your changes are still here." (J-B11).
- Features: a typed API key is cleared on a stale refusal with "enter the key
  again" (J-B12), and its missing org check on the failure path added.
- **The client scan** (tests/settings-saves.test.mjs): the settings URL appears
  nowhere outside saveSettings.js but the three named GETs; every send passes
  tokens; every catch calls the one named take-the-latest helper. Its
  late-answers twin learns the new senders **(critic)**.

## 4a. B-2 — the build plan (the shared sender and the people screens)

Designed 2 Nov 2026 from five read-only maps, one plan and two critics (correctness/tenancy, proof/scope). Every claim below was re-read today in the working tree. B-1 is built but not committed: `settings.mjs`, `_settingsRevs.mjs`, `_links.mjs`, `users.mjs` and `settingsRevs.js` are modified or new, per `git status`.

- Nothing was edited, served or run against a database.
- The one thing run was the proof critic's read-only scratch copy of late-answers' scan (`…/scratchpad/la.mjs`). It ran from the repo root with `putSettings|writeSettings|addToSettingsList` added as write points, and printed `0`.
- Changes that came from a critic point I verified are marked **(critic)**.

### 0. Corrections the build must know

1. **The sender lives at `src/Tabs/settings/shared/saveSettings.js`.** Today it holds only `putSettings` (:26-44), and it is CRLF (44 CRLF lines). There is no `src/utils/saveSettings.js`. `writeSettings`, `addToSettingsList` and `takeLatestSettings` do not exist yet.
2. **The profile page's teams move is written inline** at `UsersDetail.jsx:1035-1044`, not in `src/utils/memberSave.js`, which sends nothing.
3. **Line endings** (counted with node; Git Bash's grep for `\r` misreports):
   - CRLF: `saveSettings.js`, `TeamsDetail.jsx` (620), `TerritoriesDetail.jsx` (401), `UsersDetail.jsx` (1983), `ModalLayer.jsx` (1294), `useSettings.js` (142), `scripts/mutate-import.mjs`.
   - LF: `teamMembership.js`, `settingsRevs.js`, `settingsDefaults.js`, and every test file.
4. **`UsersDetail.jsx` holds the text `\u2014` (the escape, not the dash)** at :1042, :1067, :1071 and :1075. Harness entry 14397's anchor ends at :1042's `${clause(rt.error)}`, before the escape. Any harness entry that quotes the move block (14369/14371) quotes the escape as written.
   - Edit near those lines with a node script, never with Write/Edit (memory: Write tool unicode escapes).
5. **Settings is Admin-only** (`SettingsTab.jsx:57-63`). Karen cannot reach any B-2 screen.
6. **The two removal answers already carry `revs` at the top level of the body:**
   - `users.mjs:705` (revoke), `:1224` (clear), `:1255` (DELETE);
   - `_links.mjs:154`, `:166`, `:168`.
   - No client calls the users clear (grep `clear=true` in `src`: only `useContacts.js:66`, which clears contacts).
7. **Coloured boxes** (critic 14 on tenancy): every refusal box on these screens is `T.danger` today:
   - TeamModal `err` :190;
   - TerritoryModal `err` :153;
   - Assign `assignErr` :422-426;
   - `deleteErr` :509-510.
   
   "Red only for delete" is the house rule for *buttons*. The "list changed" words follow the box they appear in (JB2-1).

### 1. The sender: `src/Tabs/settings/shared/saveSettings.js` (CRLF)

**Imports (:24).**
- `dbFetch, requestOrg, stillOrg, stopped, refusalOf, NETWORK_ERROR` from `'../../../utils/storage.js'`. Verified at storage.js :38, :43, :47, :51, :89, :100.
- `withIfRevs, staleOf, revsAfter` from `'../../../utils/settingsRevs.js'`.
- `settingsAsLoaded` from `'../../../utils/settingsDefaults.js'`.
- All three modules are pure. `teamMembership.js` imports only `memberName.js`, and `settingsDefaults.js` and `settingsRevs.js` import nothing. So `late-answers.test.mjs:229` can still import the sender under node.
- One `const SETTINGS_URL = '/.netlify/functions/settings';` replaces the literal at :28.

**`putSettings(payload, revs)`.** It keeps today's contract:
- the 200 body is returned unchanged (`late-answers.test.mjs:244`);
- a refusal throws;
- after an org switch it never settles.

Changes:
- :31 becomes `body: JSON.stringify(withIfRevs(payload, revs))`.
- :36 becomes `let msg = 'HTTP ' + res.status, stale = null;` **(critic)**.
- :37 becomes `try { const d = await res.json(); if (d?.error) msg = d.error; stale = staleOf(res.status, d); } catch (_) {}`.
- Insert before :38: `if (stale && stillOrg(askedOrg)) throw Object.assign(new Error(msg), { stale });`.
- :38-39 and :41-43 stay byte for byte, so harness 5403 and 5407 survive. A stale refusal after a switch falls through to `stopped()`.
- **Called with one argument (`revs === undefined`), it sends no `ifRevs`** (Q6). B-3's 29 unconverted calls stay "accepted unchecked". If it always sent `?? null`, every B-3 panel with a stored token would get a 409 at `settings.mjs:302-304`. See Disagreement 2.

**`writeSettings(payload, revs)`.** New, and it never throws. It replaces the 7 direct sends (TeamsDetail :73, :442; TerritoriesDetail :59, :217; UsersDetail :197, :1039; ModalLayer :763).

```
export async function writeSettings(payload, revs) {
    const askedOrg = requestOrg();
    let res;
    try { res = await dbFetch(SETTINGS_URL, { method: 'PUT', headers: {...}, body: JSON.stringify(withIfRevs(payload, revs)) }); }
    catch { return stillOrg(askedOrg) ? { ok: false, status: 0, error: NETWORK_ERROR } : stopped(); }
    const answer = await res.json().catch(() => null);
    if (!stillOrg(askedOrg)) return stopped();
    if (res.ok) return { ok: true, status: res.status, error: null, data: answer, revs: revsAfter(null, answer?.revs) };
    const stale = staleOf(res.status, answer);                        // (critic: `stale` bound)
    return { ok: false, status: res.status, error: await refusalOf({ status: res.status, json: async () => answer }), ...(stale ? { stale } : {}) };
}
```

- The refusal words are dbWrite's own, through `refusalOf`, so `member-profile-save` R6/R16/R16b hold.
- `storage.js` and `db-write.test.mjs` are untouched (C-2).
- **Build rule (critic 9 on tenancy, 18 on proof):**
  - Neither new function contains `if (!stillOrg(askedOrg)) return stopped();\n    return body;` (harness 5403), nor `…\n        throw new Error(msg);` (5407).
  - Both are placed after `putSettings`.
  - Every new harness entry on this file quotes text that is unique there (`.catch(() => null)`, `return stillOrg(askedOrg) ? {`).
  - Parse-check every anchor on the file for exactly one match before the run. The harness mutates only the first match (`mutate-import.mjs:29`, `:17371`), and the scope runner reports NOT UNIQUE.

**`takeLatestSettings(setSettings)`.** New: the one take-the-latest helper (J-B4, one GET).

```
export async function takeLatestSettings(setSettings) {
    const askedOrg = requestOrg();
    let data = null;
    try { const r = await dbFetch(SETTINGS_URL); data = r.ok ? await r.json() : null; } catch { data = null; }
    if (!stillOrg(askedOrg)) return stopped();
    if (!data || !data.settings) return null;
    setSettings((prev) => settingsAsLoaded(prev, data.settings));
    return data.settings;
}
```

It uses `await`, never `.then`, so `deal-modal-saves`' handler pick (:139-140) sees `dbFetch(` in the same function.

**`addToSettingsList(key, apply, { list, rev, setSettings })`.** New, for Q5. It re-applies once, never throws, and never settles after a switch.
- `apply(list)` returns `{ [key]: next, changed }`, the shape `teamsWithMembers` returns.
- Start with `held = list`, `token = rev ?? null`. Loop with `tries < 2`:
  1. `made = apply(held)`. If `!made?.changed`, return `{ ok: true, already: tries > 0 }`.
  2. `w = await writeSettings({ [key]: made[key] }, { [key]: token })`. (`writeSettings` itself never settles after a switch.)
  3. If `w.ok`: `setSettings(prev => ({ ...prev, [key]: made[key], revs: revsAfter(prev?.revs, w.revs) }))`, then return `{ ok: true }`.
  4. If `!w.stale`: return `w` (a 404, 403 or network failure is never retried).
  5. `latest = await takeLatestSettings(setSettings)`. If `!latest`: return `{ ok: false, status: 409, error: w.error, stale: w.stale }`.
  6. Set `held = latest[key]` and `token = latest.revs?.[key] ?? null`.
- After the loop: return `{ ok: false, status: 409, stale: true, twice: true }`. The second take-latest has already put the latest on screen.
- **Known limit, filed (JB2-13):** when another tab deleted the team, `teamsWithMembers` skips it (`teamMembership.js:37`), so the helper answers `already` and says nothing.

**Pure additions to `src/utils/settingsRevs.js` (LF), beside `STALE_ERROR` (:35).**
- **`withIfRevs(payload, revs)`.**
  - `revs === undefined` returns `payload` unchanged.
  - Otherwise it returns `{ ...payload, ifRevs: Object.fromEntries(revKeysOf(payload).map(k => [k, typeof revs?.[k] === 'string' ? revs[k] : null])) }`.
  - `null` or `{}` means "checked, every token null".
- **`staleOf(status, body)`.** `status === 409 && body?.code === 'stale'` returns the string entries of `body.stale` (or `[]`); anything else returns `null`. This keeps it apart from users' `code: 'invitation'`.
- **`revsAfter(held, answered)`** returns `{ ...revsOf({ revs: held }), ...revsOf({ revs: answered }) }`. It merges key by key and never replaces the whole object.
- **`listChanged(noun)`** returns `` `The ${noun} list changed since this page loaded — it now shows the latest. Make your change again.` `` (DESIGN B3's ‹The list›; STEP-B §4 has the team instance).
- **`TEAMS_CHANGED_TWICE`** = "The invitations went out, but the team list changed twice while saving and does not list them yet — reload; their team is set on their row." (J-B6, verbatim).
- **`TEAM_MOVE_CHANGED`** = "Saved, but the team list changed since this page loaded — it now shows the latest. Save changes tries the list again." **(new, JB2-3)**.
- **`TEAM_MOVE_CHANGED_UNREAD`** = "Saved, but the team list changed since this page loaded. Save changes tries the list again." **(critic 4 tenancy / 21 proof; new, JB2-3)**. Used when the latest could not be read. It never says Reload (R16b, `member-profile-save.test.mjs:576-583`).

**Pure addition to `src/utils/settingsDefaults.js` (LF).**
- `settingsAsLoaded(prev, fromDb)` is lifted verbatim from `useSettings.js:86-97`.
  - `!fromDb` returns `{ ...DEFAULT_SETTINGS, users: prev?.users }`.
  - Otherwise: strip `users`, then return `{ ...DEFAULT_SETTINGS, ...rest, users: prev?.users, taskTypes, funnelStages }` with the existing fallbacks.
  - The GET answers `revs` inside `settings` (`settings.mjs:256`), so values and tokens arrive as one matched set and `revs` is replaced whole.
- `useSettings.js:86-97` becomes `setSettings(prev => settingsAsLoaded(prev, data.settings ?? null));`.
- `useSettings.js:3` becomes `import { DEFAULT_SETTINGS, settingsAsLoaded } from '../utils/settingsDefaults.js';`.
  - That specifier still appears exactly once, so the `settings-org-load.test.mjs:31-56` swap holds.
  - `save-buttons.test.mjs:69` pins the old line and moves.
- **Verified:** `useSettings.js:87-94` spreads the GET into the copy (`...settingsFromDb`). With no row (:96), or after a switch (:60), `settings.revs` is undefined. Every screen therefore reads `settings.revs?.<key> ?? null`.
- **Known effect, filed (critic 19 on proof):** take-latest keeps `prev.users`, so a tab's member team names stay as loaded until a reload.

### 2. The token rule, and each site

**The rule (STEP-B §4, restated, critic 6 on tenancy).** A save's token comes from the same binding as the list it builds from:
- the click's closure `settings` (`settings.teams` together with `settings.revs?.teams`), or
- the window's snapshot (`base.list` together with `base.rev`).

It never comes from a ref, from a `setSettings` updater, or from a value read again after an await. The Invite page (`UsersDetail.jsx:180`→`:194`), the import (`ModalLayer.jsx:727`→`:761`) and the profile (`:1024`→`:1036`) read both after an await. They are correct because both come from the same render-bound `settings`.

| Site | List and token | Send | 200 | Stale refusal | Other refusal |
|---|---|---|---|---|---|
| **TeamModal** (`TeamsDetail.jsx:26-102`) | Replace :38 with `const [base, setBase] = useState(() => ({ list: settings.teams \|\| [], rev: settings.revs?.teams ?? null })); const teams = base.list;`. :58, :60, :61 are unchanged. | Replace :72-74 with `const askedOrg = requestOrg(); const w = await writeSettings({ teams: updatedTeams }, { teams: base.rev });`. Keep :75 `stillOrg`. | `setBase({ list: updatedTeams, rev: w.revs.teams ?? null })`. :90 adds `revs: revsAfter(prev.revs, w.revs)`. | `const latest = await takeLatestSettings(setSettings); const words = latest ? listChanged('team') : w.error;` Edit: `onStale(words); onClose(); return;`. New: `if (latest) setBase({ list: latest.teams \|\| [], rev: latest.revs?.teams ?? null }); setErr(words); return;` (J-B8). No member PUT. | `throw new Error(w.error \|\| 'Save failed')`; the :97 catch shows it. |
| **Teams Delete** (:361-391) | `const teamsRev = settings.revs?.teams ?? null;` beside :365. | `let answer; try { answer = await putSettings({ teams: updatedTeams }, { teams: teamsRev }); } catch (e) { if (e.stale) { const latest = await takeLatestSettings(setSettings); if (latest) { setDeleteErr(listChanged('team')); return; } } setDeleteErr(\`Team not deleted — ${e.message}\`); return; }` **(critic 3 tenancy, 22 proof)**. :371 stays byte for byte and unique (harness 1865). | Straight after the `try`: `setSettings(prev => ({ ...prev, teams: updatedTeams, revs: revsAfter(prev.revs, answer?.revs) }))`, before the member loop. :384-388 then set `users` only. | (in the catch) | :371 unchanged. |
| **Assign** (:433-449), **lifted into `const assignTo = async (t) => {…}` inside `TeamsDetail`** **(critic 14 proof)** | `const teamsRev = settings.revs?.teams ?? null;` in the handler, in the same render as `teams`. | `const { teams: updatedTeams, changed } = teamsWithMemberOn(teams, assigningUser.id, t.id);` **(critic 1 tenancy)**, then `if (changed) { const rt = await writeSettings({ teams: updatedTeams }, { teams: teamsRev }); …}`. When `!changed`, only the member PUT is sent. | Straight after `rt.ok`, before the member PUT: `setSettings(prev => ({ ...prev, teams: updatedTeams, revs: revsAfter(prev.revs, rt.revs) }))`. After `ru.ok`: `setSettings(prev => ({ ...prev, users: (prev.users \|\| []).map(u => u.id === assigningUser.id ? { ...u, ...(ru.data?.user \|\| { team: t.name, teamId: t.id, territory: t.territory \|\| '', vertical: t.vertical \|\| '' }) } : u) }))`. This ends :448's filtered-copy replace (JB2-7 for Assign). | `if (rt.stale) { const latest = await takeLatestSettings(setSettings); if (latest) { setAssignErr(listChanged('team')); return; } }`, then falls through to :444. The popover stays open and redraws from the latest (JB2-5). | :444 `` `Not assigned — ${rt.error}` `` kept. |
| (Assign guard) | `const [assigning, setAssigning] = useState(false)`. The team buttons are disabled while a send is out; set in `try`, cleared in `finally` **(critic 12 tenancy)**. | | | | |
| **TerritoryModal** (`TerritoriesDetail.jsx:9-84`) | Replace :12 with `const [base, setBase] = useState(() => ({ list: settings.territories \|\| [], rev: settings.revs?.territories ?? null })); const territories = base.list;`. | Replace :59-60 with `writeSettings({ territories: updatedTerritories }, { territories: base.rev })`. Keep :61. | `setBase(…)`. **Both** :76 and :79 add `revs: revsAfter(prev.revs, w.revs)`; the PUT landed at :76 too. | As TeamModal with `listChanged('territory')`. Only mode `'new'` stays open; `edit`, `rule`, `owner` and `reps` close through `onStale`. No member PUT (the :62-before-:66 order is kept). | Throw, as today. |
| **Territories CSV** (:187-224) | `const listRev = settings.revs?.territories ?? null;` beside :190 `askedOrg`, in the same closure as :207 `territories`. | Replace :217 with `const w = await writeSettings({ territories: updated }, { territories: listRev });`. Keep :216 and :218 `stillOrg` (:216 matters: the file is read across an await). | `setSettings(prev => ({ ...prev, territories: updated, revs: revsAfter(prev.revs, w.revs) }))` and the "Imported…" alert. | `const latest = await takeLatestSettings(setSettings); window.alert(latest ? listChanged('territory') : \`Import failed to save — ${w.error}\`);`. Not re-applied (STEP-B §4). | `` `Import failed to save — ${w.error}` `` (JB2-10). |
| **Territories Delete** (:226-255) | `const terrRev = settings.revs?.territories ?? null;` beside :230. | The same shape as Teams Delete; :236 stays byte for byte and unique (harness 1870). | Merge straight after the `try`; :248-252 then set `users` only. | Fallback as in Teams Delete. | :236 unchanged. |
| **Invite** (`UsersDetail.jsx:194-201`) | `settings.teams` and `settings.revs?.teams ?? null` from `handleSend`'s closure. | `const added = await addToSettingsList('teams', (l) => teamsWithMembers(l, sent), { list: settings.teams, rev: settings.revs?.teams ?? null, setSettings }); if (!stillOrg(askedOrg)) return;` | Inside the helper. | `teamNote = added.twice ? \` ${TEAMS_CHANGED_TWICE}\` : …` (JB2-4). | `` ` The team list was not updated — ${added.error}` ``. :205-207 unchanged (harness 4537). |
| **Member import** (`ModalLayer.jsx:760-767`) | `settings` from the closure that ran `onImportUsers`. | The same call with `landed`, then `if (!stillOrg(askedOrg)) return stopped();`. Keep `let warning = null;` and `return { receipt, refusals, warning };` (`user-import.test.mjs:161`). | Inside the helper. | `warning = TEAMS_CHANGED_TWICE`. | `` `The invitations went out, but the team list was not updated — ${added.error}` ``. |
| **Profile move** (`UsersDetail.jsx:1035-1044`) | `settings.teams` (:1036) and `settings.revs?.teams ?? null`, in the click's closure. | Replace :1039 with `const rt = await writeSettings({ teams: moved }, { teams: settings.revs?.teams ?? null });`. **Keep the name `rt`** (harness 14341, 14397). | `teamsNow = moved; teamsRevs = rt.revs; owedNext = null;` (declare `teamsRevs = null` at :1020). :1088 adds `...(teamsNow ? { teams: teamsNow, revs: revsAfter(prev.revs, teamsRevs) } : {})` inside the one existing `setSettings` (R15: one call). | New line between :1041 and :1042: `else if (rt.stale) { owedNext = move; const latest = await takeLatestSettings(setSettings); missed.push(latest ? TEAM_MOVE_CHANGED : TEAM_MOVE_CHANGED_UNREAD); }` **(critic 4 tenancy / 21 proof)**. The next Save recomputes the move on the latest list with its token (J-B7). | :1042 byte for byte, `\u2014` escape included. |

**Supporting edits.**
- **Page note (J-B8).**
  - Both pages get `const [listNote, setListNote] = useState('')`.
  - It is drawn beside `deleteErr` (Teams :509, Territories :318) in the same box style. It is passed as `onStale={setListNote}` (Teams :400-405, Territories :275-281).
  - Opening a window, a Delete or the CSV clears it.
- **TeamsDetail imports.**
  - :4 becomes `dbWrite, requestOrg, stillOrg` (`dbFetch`'s only use is :73).
  - :5 becomes `import { putSettings, writeSettings, takeLatestSettings } from '../shared/saveSettings.js';`.
  - Add `revsAfter, listChanged` from `settingsRevs.js`, and `teamsWithMemberOn` from `teamMembership.js`.
  - TerritoriesDetail takes the same minus `teamsWithMemberOn` (its `dbFetch` uses are :59 and :217).
- **UsersDetail.** :5 drops `dbWrite` (only :197 and :1039). Add `writeSettings, takeLatestSettings, addToSettingsList` and `revsAfter, TEAMS_CHANGED_TWICE, TEAM_MOVE_CHANGED, TEAM_MOVE_CHANGED_UNREAD`. The comment at :1033 ("dbWrite never throws") becomes "writeSettings never throws" **(critic 22 proof)**; no anchor quotes it.
- **ModalLayer.** :3 drops `dbWrite` (only :763). It imports `addToSettingsList` from `'../../Tabs/settings/shared/saveSettings.js'` and `TEAMS_CHANGED_TWICE`. This is the first `components/`→`Tabs/settings` import. `layers.test` and `layer-boundary.test` are z-index and error-boundary tests, not import rules (read).
- **`settingsAfterRemoval`** (`teamMembership.js:208-213`).
  - :211 stays byte for byte (harness 16774, 16778).
  - Before :212, add `const tokens = Object.fromEntries(Object.keys(written).filter((k) => typeof answer?.revs?.[k] === 'string').map((k) => [k, answer.revs[k]]));`.
  - :212's return gains `...(Object.keys(tokens).length ? { revs: { ...(prev?.revs || {}), ...tokens } } : {})`.
  - All 6 callers pass the whole body after their org check: UsersDetail :493, :1141, :1155, :1817, :1836; useUserHandlers :33.

**OPEN_ITEMS §4.3 (critic 2 on tenancy, verified).** A converted tab's teams and territories saves now meet the early compare (`settings.mjs:302-304`) before the name, link and rename checks. The renames need this save's token (:521-522).
- **Q6 is still in force:** an unchecked save is accepted (:303) and retried (:537). A tab still running the old bundle, and prod until B ships, can still rename the holders back.
- Mark `OPEN_ITEMS.md:1972-1981` and `:2032-2040` as: "DONE on dev in §0.225 for every converted screen; an old tab until it reloads, and prod until shipped, still can".
- P19 (`:2002-2006`) stays open by design.

### 3. Tests

**New: `tests/settings-saves.test.mjs`** (LF; appended to SUITES at `mutate-import.mjs:16`; B-2 and B-3 files named as literal paths).
- **Every import of `saveSettings.js`, `settingsRevs.js` or `settingsDefaults.js` is `await import()` inside its test** **(critic 3 proof)**. A static import of names today's sender lacks would kill the file before S1/S2 run.

**S1: the URL.** Over `src`, comments stripped, count `/functions\/settings(?![\w/-])/`:

| File | Count |
|---|---|
| `shared/saveSettings.js` | 1 (`SETTINGS_URL`) |
| `hooks/useSettings.js` | 1 |
| `integrations/ConnectedAppsDetail.jsx` | 2 (GETs) |
| Each `B3_DIRECT` file | 1 |
| Every other file | 0 |

- `B3_DIRECT` = `SalesManagerTab.jsx`, `data/FeaturesDetail.jsx`, `dispatch/DispatchBlockTypesDetail.jsx`, `dispatch/DispatchJobTypesDetail.jsx`, `quoting/EditBrandModal.jsx`.
- Today's counts (verified): Teams 2, Territories 2, Users 2, ModalLayer 1, saveSettings 2 (one is the comment at :5).

**S2: every send carries tokens.** By AST, outside `B3_PENDING` and outside `saveSettings.js` itself **(critic 2 proof)**:
- Every `putSettings` and `writeSettings` call has a second argument that is an `ObjectExpression` whose keys are keys of the first argument's literal.
- Each token expression is rooted in `settings.revs`, in a window snapshot's `.rev`, or in a local `const` initialised from one of those. It is never `prev`, never `.current`, and never inside a `setSettings` updater **(critic 6 tenancy, partly; see "not taken")**.
- Every `addToSettingsList` third argument has `list` and `rev` rooted in the same identifier.
- Inside `B3_PENDING`, every `putSettings` has exactly one argument.
- `B3_PENDING` = the 26 files with 29 calls (grep today: 31 calls in 28 files, less the two Deletes):
  - Calendar ×2, Profile, FiscalYear;
  - Crews, CustomerNotifications, JobTemplates, PropertyTypes, Skills;
  - ConnectedApps ×3;
  - ApprovalTiers, ProductTypes, QuoteTemplates;
  - AccountSegments, BuyerPersonas, CustomerTypes, CustomFields, EmailTemplates, FlatList, FunnelStages, Industries, KPIThresholds, LeadConversion, LeadScoring, LeadVisibility, PainPoints, Pipelines.
- A stale-allowance check ("every listed file still has a one-argument call") follows `late-answers:207`.

**S3: the sender, run with `fetch` stubbed** (late-answers' pattern, :229-275: `globalThis.window`, `globalThis.fetch`, `setRequestOrg`).
- `putSettings(p)` sends no `ifRevs`.
- `putSettings({ teams: [], integrationRequests: {} }, { teams: 'x' })` sends exactly `ifRevs: { teams: 'x' }` **(critic 8 tenancy / 8 proof)**.
- `putSettings(p, null)` and `putSettings(p, {})` each send `ifRevs: { teams: null }` **(critic 9 proof)**.
- A 409 `code: 'stale'` throws with `.stale` and the message unchanged. A 409 `code: 'invitation'` has no `.stale`. A stale refusal after a switch stays PENDING.
- `writeSettings`:
  - lands with `revs`;
  - stale gives `{ ok: false, stale }`;
  - a 500 gives `'The server returned 500.'`;
  - a fetch that throws gives `NETWORK_ERROR` with no throw;
  - a switch at the send, or at the body read, stays PENDING.
- `takeLatestSettings`:
  - one GET;
  - `prev.revs` holds a key the GET lacks, and afterwards that key is gone **(critic 10 proof)**;
  - `users` kept;
  - a switch leaves it PENDING with nothing set;
  - a failed GET returns `null` with nothing set.
- `addToSettingsList` (STEP-B §5):
  - lands;
  - stale then re-applied: the second body holds the other tab's entry and ours, with the latest token;
  - stale then already there: one send, `already`;
  - stale twice: two sends, `twice`, latest on screen;
  - a 404 is not retried;
  - a switch at each await never settles.
- Pure functions: `withIfRevs`, `staleOf`, `revsAfter` (another key's token kept), `settingsAsLoaded` (null case; `revs` exactly the GET's; `users` from `prev`).

**S4: every refusal takes the latest** (split, **critic 1 proof**).
- Every function that calls `putSettings` or `writeSettings` in a B-2 file reads `.stale` and calls `takeLatestSettings(`. For `putSettings`, that happens in the catch of its `try`.
- The Invite handler and the import handler call `addToSettingsList`, read `.twice`, and do not call `takeLatestSettings` themselves.
- The helper's body: one `dbFetch(SETTINGS_URL)`, and `stillOrg` before `setSettings`.

**S5: every success merges the answered tokens.**
- Every `setSettings` updater in a B-2 file that writes `teams:` or `territories:` also writes `revs: revsAfter(prev.revs, …)`, or is `settingsAfterRemoval` or `settingsAsLoaded`. No updater writes `revs:` any other way.
- In both Deletes and in `assignTo`, the `revsAfter(` updater comes before the member loop or PUT.

**S6: TerritoryModal.save runs as written** (handler pick as `team-membership:388`). The scope keeps a `dbFetch` stub, so today's code fails on the assertion, not on a ReferenceError **(critic 12 proof)**. The scope gives `settings: { territories, users, revs: { territories: 'NEWER' } }` and `base.rev = 'OPENED'`.
- The sent token is `'OPENED'`.
- An edit that is stale closes with `onStale(words)` and sends no member PUT.
- A new entry that is stale stays open, and its next Save carries the latest token.
- Success merges `revs`.
- A 404 sends no member PUT.
- **A member PUT fails after the list landed (:74-77):** `revs` is merged and the window is re-based **(critic 11 proof)**.
- **JB2-7:** a member with no name survives :79; the answered row is kept (`r.data?.user`) **(critic 10 tenancy / 15 proof)**.

**S7: `assignTo` runs as written** **(critic 14 proof)**, through `handlerIn(…'TeamsDetail', 'assignTo')`.
- Stale: take-latest, the words, no member PUT.
- The merge happens before the member PUT.
- A member PUT that fails keeps the merged token.
- **Critic 1:** member PUT refused, then a second click on the same team, then on another team. The member is listed once, on one team.
- `!changed`: no teams PUT.
- The roster keeps an unnamed member, and the server's row is used.
- A self-test of S1/S2 on made-up sources, and R8-style membership in SUITES.

**Existing pins that move (in this commit).**
- **`tests/late-answers.test.mjs`**
  - :71: `WRITING_HELPERS` gains `putSettings|writeSettings|addToSettingsList`. JB2-11 is resolved: the scan copy with those names flags 0 sites on today's `src`.
  - :146: `settles` exempts `/^(putSettings|writeSettings|addToSettingsList|takeLatestSettings)$/`.
  - :221: new made-up cases with the expected list updated:
    - `await x(); await writeSettings({}, {})` is flagged;
    - `await writeSettings({}, {}); setSettings(s => s)` is not;
    - `await takeLatestSettings(f); setSettings(s => s)` is not.
- **`tests/deal-modal-saves.test.mjs:108`**: `SERVER` gains `writeSettings|addToSettingsList|takeLatestSettings`. Otherwise the CSV's `onchange` and the helper's own `setSettings` are flagged.
- **`tests/settings-cascade-errors.test.mjs:33`**: the exact import line becomes ``/import \{[^}]*\bputSettings\b[^}]*\} from '\.\.\/shared\/saveSettings\.js';/``. :35-41 still hold: `await putSettings({` stays inside `blockOf('handleDelete')`, and the `` `${noun} not deleted — ${e.message}` `` line is kept.
- **`tests/team-membership.test.mjs`**
  - :87-88 and :96-97 become the `addToSettingsList('teams', (l) => teamsWithMembers(l, sent|landed), { list: settings.teams, rev: settings.revs?.teams ?? null, setSettings })` text.
  - **Pin the use itself** **(critic 7 proof)**: `` added.twice ? ` ${TEAMS_CHANGED_TWICE}` `` in `between(…UsersInvitePage…)`, and `warning = TEAMS_CHANGED_TWICE` in `between(l, 'onImportUsers={async (invites) => {', 'return { receipt, refusals, warning };')`.
  - C3 (:352-361) stays green.
  - New C3b: tokens are merged for the written lists only; `spiffs`' answered token is ignored; another key's held token is kept; `listsLeft` keeps `revs`.
  - `runTeamSave` (:389-411) scope gains:
    - `base: { list: teams, rev: 'OPENED' }`, `setBase`;
    - `settings: { teams, users, revs: { teams: 'NEWER' } }` **(critic 7 tenancy / 5 proof)**;
    - `writeSettings`: a stub that records `{ ...payload, ifRevs: revs }` and answers `{ ok, status, error: a.error ?? a.data?.error ?? null, data: a.data, revs: a.revs ?? { teams: 'T2' }, ...(a.stale ? { stale: a.stale } : {}) }`. This keeps the :502-503 refused case's words **(critic 6 proof)**;
    - `takeLatestSettings`, `onStale`, `revsAfter`, `listChanged`.
  - New C5 cases:
    - the sent `ifRevs.teams === 'OPENED'`;
    - success merges `revs` and re-bases;
    - an edit that is stale closes, sends no member PUT, and calls `onStale`;
    - a new entry that is stale stays open and re-bases, and Save again lands with the latest token.
- **`tests/member-profile-save.test.mjs`** **(critic 4 proof)**
  - `SAVE_NAMES` (:342-344): drop `dbWrite`; add `TEAM_MOVE_CHANGED`, `TEAM_MOVE_CHANGED_UNREAD`, `revsAfter`, `takeLatestSettings`, `writeSettings`. The assertion is at :403.
  - `runSave` (:355) gains a `revs` option, so `settings = { teams, users, revs }`.
  - `DEFAULT.settings` (:363) answers `revs: { teams: 'T_NEW' }`.
  - The scope gains:
    - a `writeSettings` stub routed through `ask('writeSettings', '/settings', …)`;
    - `takeLatestSettings` (records its call; sets a latest list with token `'T_LATEST'`; returns it, or `null` when `latestFails`);
    - the real `revsAfter` and the words.
  - `dbWrite` stays in the scope for S10 OLD (:678).
  - R15 also asserts `state.settings.revs.teams === 'T_NEW'`.
  - New R19: a stale move takes the latest once, says `TEAM_MOVE_CHANGED`, and calls `setListOwed({ teamId: 'team_west' })` **(critic 5 tenancy)**.
  - R19b: the next Save, run on R19's state, sends the move on the latest list with `ifRevs.teams === 'T_LATEST'`.
  - R19c: when the latest fails, it says `TEAM_MOVE_CHANGED_UNREAD` and no Reload.
- **`tests/save-buttons.test.mjs:69`**: the hook's import line names `settingsAsLoaded`.

**Integration** (JB2-9, recommended): one case in `tests/integration/settings-revs.itest.mjs` (B-1's file, own orgs `itest_setrevs_A/B`).
- After the guard: `await import()` `saveSettings.js` and `storage.js`.
- Set `globalThis.window = {}` first **(critic, tenancy "Missing")**. Without it, `dbFetch`'s `typeof window.__getClerkToken` throws inside its try and only warns.
- Route `globalThis.fetch` to `call(A, …)` (:73-81), then `setRequestOrg(A)`.
- It proves:
  - `putSettings` with a stale token throws `.stale`;
  - `addToSettingsList` re-applies after another save landed, and the stored list holds both;
  - the answered `revs` equal the next GET's;
  - org B is unchanged byte for byte.
- **Old-code proof by hand** **(critic, proof "Missing")**: today's `putSettings` ignores a second argument, sends no `ifRevs`, and gets a 200. So "throws `.stale`" fails on the old sender.

### 4. Harness (`scripts/mutate-import.mjs`, CRLF; anchors written with `\n`)

**Re-point in this commit (made STALE by B-2):**
- **5427** (Territories CSV): re-point to `if (!stillOrg(askedOrg)) return;\n                const w = await writeSettings({ territories: updated }, { territories: listRev });`. It drops the check, and late-answers catches that once `writeSettings` is a write point.
- **14369/14371** (the move block that quotes `const rt = await dbWrite(`): re-quote with the `\\u2014` escapes kept.
- **4533**: becomes `(l) => teamsWithMembers(l, sent)` → `(l) => ({ teams: l, changed: false })`.
- **4561**: becomes `(l) => teamsWithMembers(l, landed)` → `(l) => teamsWithMembers(l, [])`.
- **14365**: re-point its injected call to `writeSettings(…)`, so R13's `calls` catches it for its stated reason rather than `SAVE_NAMES`.

**Survive if built exactly as §1-§2 say:**
- 5403, 5407;
- 1865, 1870 (each line kept and unique);
- 14341 (`else { owedNext = move; missed.push(` stays unique; the new branch reads `else if (rt.stale) {`);
- 14397, 14405, 14409;
- 4537, 5423;
- 16774, 16778;
- 16895-16920 (TeamModal :50, :61, :69, :85, :89);
- 14833-14855 (layout).
- No entry quotes the Assign block (grep), so lifting it into `assignTo` stales nothing.
- Parse every anchor on a changed file for exactly one match before the run.

**New entries.** Each is proven caught by hand. Format: mutant → the test that catches it.

`saveSettings.js` / `settingsRevs.js`:
1. `withIfRevs` sends `ifRevs` when `revs` is undefined → S3.
2. `withIfRevs` covers every payload key → S3's `integrationRequests` case. Near-equivalent at the server (`settingsRevs.js:68-69`); kept as a contract pin.
3. `revs === undefined` → `revs == null` → S3 null/`{}` **(critic 9 proof)**.
4. The stale throw loses `.stale` → S3.
5. `staleOf` reads any 409 as stale → S3.
6. `if (stale && stillOrg(askedOrg))` → `if (stale)` → S3 PENDING.
7. `writeSettings` answers `revs: {}` → S3, C5.
8. `writeSettings` drops `stale` → S3, R19.
9. `writeSettings` loses its try → S3.
10. `writeSettings` loses the `stillOrg` after its `.catch(() => null)` → S3 PENDING.
11. `takeLatestSettings` sets before its org check → S3, late-answers.
12. `settingsAsLoaded` merges the old `revs` → S3 (the key-gone fixture).
13. `settingsAsLoaded` takes `users` from the GET → S3, settings-org-load.
14. `addToSettingsList` never re-applies → S3.
15. It re-applies on the old list → S3.
16. It re-applies with the old token → S3.
17. It retries a 404 → S3.
18. `twice` is lost → S3.
19. Its success drops `revs` → S3.
20. `revsAfter` replaces whole → S3.

`teamMembership.js`:

21. No tokens merged → C3b.
22. Every answered key merged → C3b.
23. `revs` replaced whole → C3b.

`TeamsDetail.jsx`:

24. The window sends `{ teams: null }` as the token → C5.
25. The window's token is taken from `settings.revs` → C5 (`'NEWER'` ≠ `'OPENED'`).
26. An edit that is stale does not close → C5.
27. A new entry that is stale does not re-base → C5.
28. The window's stale branch skips take-latest → C5, S4 **(critic 13 proof)**.
29. A stale refusal goes on to the member PUTs → C5.
30. Success drops `revs` → S5, C5 **(credit, critic 11 proof)**.
31. Delete's stale branch is removed → S4.
32. Delete's merge moves after the loop → S5 order.
33. Assign: the stale branch skips take-latest or its `return` → S7.
34. Assign merges after the member PUT → S5, S7.
35. Assign builds with the old append (critic 1) → S7.
36. Assign's `assigning` guard is dropped → S7.

`TerritoriesDetail.jsx`:

37. An edit that is stale stays open → S6.
38. A new entry that is stale does not re-base → S6 **(critic 13 proof)**.
39. :76 drops `revs` → S5, S6 (the member-failure case).
40. The CSV's stale branch skips take-latest → S4.
41. Delete's stale branch is removed, or its merge moves after the loop → S4, S5.
42. :79 replaces the roster from the filtered copy (JB2-7) → S6.

`UsersDetail.jsx` / `ModalLayer.jsx`:

43. The profile's stale words become `clause(rt.error)` → R19.
44. The profile forgets the owed move → R19.
45. The profile's stale branch skips take-latest → R19, R19b.
46. The profile's success drops `revs` → S5, R15.
47. The profile always says `TEAM_MOVE_CHANGED` → R19c.
48. The Invite's `twice` words are dropped → the use pin **(critic 7 proof)**.
49. The Invite's `rev` is dropped → S2 **(critic 13 proof)**.
50. The import's `rev` is dropped → S2.

`late-answers.test.mjs` itself is not mutated.

**Scope and order** **(critic 17, 18 proof)**:
- The edited suites are late-answers, deal-modal-saves, settings-cascade-errors, team-membership, member-profile-save, save-buttons and settings-saves.
- late-answers, save-buttons and deal-modal-saves build paths at run time (`OPEN_ITEMS.md:4337-4341`). Add settings-saves to that list.
- The sender's new imports pull `settingsDefaults.js` and `settingsRevs.js` entries into every suite that imports it.
- No estimate: size it with `node scripts/mutate-scope.mjs --base <base> --list`.
- Run order:
  1. `netlify dev` is stopped.
  2. `rm -rf dist node_modules/.vite` after the gate build.
  3. The scoped run must print `Baseline: green.` first.

### 5. Browser check

Setup: Accelerep QA; Jeff signs in and drives; local `netlify dev` after `rm -rf dist node_modules/.vite`.

0. **Before you start.**
   - Read the URL bar, count the orgs, and confirm Accelerep QA (`org_3K6LqEB6kPE9p4t96GBfsX9VNyb`). Read `Clerk.user`.
   - Read which Netlify site has `JOBS_ENABLED` (J-B14) before the check **(critic, tenancy "Missing")**.
   - Read QA's team names first. `seed-qa-org.mjs` names no teams, so "QA East" is unverified **(critic 20 proof)**.
   - Saves are TEST saves under the standing go. **Every Delete needs Jeff's explicit word, per click** **(critic 11 tenancy / 20 proof)**.
   - Never delete a member, send an email, or make a hand-made settings PUT.
   - Request bodies may not be readable in the pane (an open question). Prove `ifRevs` from the 200's `revs` and from the 409.
1. **Teams, two tabs** (hard-refresh both after the build). Tab A edits a team's colour and saves: 200 with `revs.teams`. Tab B saves an edit of the same team: 409 `code: 'stale'`, the window closes, the page note shows the words, and the table shows A's colour. B reopens and saves, and it lands.
2. **Rename against a stale save.** A renames the team. B, loaded before the rename, saves a colour on another team. It is refused. Read the holders in A or in a freshly loaded tab, never in B **(critic 19 proof)**. Rename back.
3. **New team in stale B.** The window stays open with the words; Save again lands. Delete it only on Jeff's word.
4. **Stale Delete.** Only on a team made for the test, with no members, and only after the network rows show B's token differs from A's last `revs.teams`. On Jeff's word. The refusal words appear, and the latest is shown.
5. **Assign in stale B** (only if QA has an unassigned member). Refused with the words; pick again and it lands. Restore through the member's profile.
6. **Territories.** A stale edit window closes; a new one stays open; a stale Delete (rules as in step 4) is refused; the CSV in the stale tab is refused by an alert, an upload Jeff drives. No cleanup: a refused import writes nothing **(critic 20 proof)**.
7. **The profile move.** B is open on a member's profile; A saves a teams change. B changes the member's team and saves: the member is saved and the page shows `TEAM_MOVE_CHANGED`. Save changes: the move lands, and the Teams page in a fresh tab shows it. Restore.
8. **Invite and the member import:** not run in the pane (both send Clerk email). Covered by S3 and the integration case.
9. **Karen:** sign in, read `Clerk.user`. The app loads; Settings is not offered; the settings GET returns 200 with `revs`; no PUT; no console error.
10. **Removal then a stale save:** covered only by `settings-revs.itest.mjs:242`.

### 6. Docs (same commit)

- State §0.225.
- Guide §18b114 rule 9 (the screens): a save takes its token from the binding of its draft; one sender; a stale refusal takes the latest; a success merges the answered tokens; the removal merges its own.
- OPEN_ITEMS:
  - mark `:1972-1981` and `:2032-2040` done on dev with the old-tab and prod caveat;
  - file JB2-8 (N13 only), JB2-10's CSV defects, JB2-13, and the stale member team names after a take-latest;
  - add settings-saves to `:4337`.
- CLAUDE.md "the screens send tokens from B-2 and B-3": mark B-2 done.
- `SESSION_HANDOFF.md` last.

### Critic points not taken

- **Tenancy 6, partly:** the rule is restated, but S2 does not match the token's root to the list argument's root. At the Deletes, the profile and Assign, the list argument is a derived local (`updatedTeams`, `moved`), so a static root match would need data-flow analysis. S2 instead requires the token to be rooted in `settings.revs`, a snapshot `.rev`, or a const initialised from one, and never `prev`, `.current` or an updater.
- **Tenancy 14, resolved the other way:** no amber note. Every refusal box on these screens is `T.danger` today (§0, item 7), and "red only for delete" is the button rule. The page note uses the `deleteErr` box style (JB2-1).
- **Tenancy 13:** not fixed in B-2. A team deleted elsewhere while an invite is out is a cross-tab case that needs `apply` to report missing teams, plus new words. Filed beside P19 (JB2-13).
- None of the rest were rejected. Tenancy 8 and proof 8 are taken by keeping entry 2 with a non-REV key in S3, labelled near-equivalent.

### Questions for Jeff

- **JB2-1. Where "the list changed" shows.** Recommended:
  - after an edit window closes, a note above the table in the house refusal style;
  - for a new entry, inside the window;
  - Delete keeps its banner;
  - Assign uses its popover box.
- **JB2-2. Territories' words.** Recommended: "The territory list changed since this page loaded — it now shows the latest. Make your change again."
- **JB2-3. The profile's stale words.** Recommended: `TEAM_MOVE_CHANGED`, plus `TEAM_MOVE_CHANGED_UNREAD` when the latest could not be read. Neither says Reload (R16b).
- **JB2-4. J-B6 on the Invite page.** Recommended: verbatim after "N sent.", accepting the repeat "The invitations went out". The import uses it as its whole warning.
- **JB2-5. Assign after a stale refusal.** Recommended: it stays open with the words, redrawn from the latest, and its buttons are disabled while a send is out.
- **JB2-6. How take-latest builds the copy.** Recommended: the load's own projection (`settingsAsLoaded`), extracted once. It resets the Sales Manager's two screen filters (`SalesManagerTab.jsx:432`, `:767`), as a reload does. It keeps the roster, whose team names stay as loaded (filed).
- **JB2-7. The roster replaced from a filtered copy** (Assign :437/:448; TerritoryModal :11/:31/:79). Recommended: fix both in B-2, with proof (S6, S7, entries 42 and 35). Assign's line is rewritten anyway.
- **JB2-8. Assign's repeated id.** Recommended: fixed in B-2 by `teamsWithMemberOn`, because B-2's merge-before-member-PUT would otherwise create a double listing. This also takes the member off any other team list that holds them by app id. N13 (Clerk ids) stays filed.
- **JB2-9. The integration case.** Recommended: add it.
- **JB2-10. The CSV's non-stale refusal.** Recommended: "Import failed to save — ‹server words›". File its pre-existing defects (`TerritoriesDetail.jsx:207-213`): names that differ only by case collapse into one; legacy string entries collapse; a missing Parent or Rule column clears them.
- **JB2-11. `putSettings` as a late-write point.** Recommended: yes. Settled: the scan copy flags 0 on today's `src`.
- **JB2-12. Settled by Jeff, 2 Nov** ("Commit each, harness last"), written into CLAUDE.md's chain and guide §18b23 part 4: B-2 is committed after gates, unit, integration, the stale check (`--list`), its own entries proven by hand and the browser check, marked "harness deferred"; one scoped run, `--base` the last commit whose scope printed green (B-1's, if the run now in the copy comes back green), before any push; a survivor gets a fix commit of its own.
- **JB2-13. An invite whose team was deleted elsewhere mid-save says nothing.** Recommended: file it beside P19.

### Disagreements with STEP-B.md

1. **§5 puts the sender's run cases in `tests/settings-revs.test.mjs`.** B-1 built none there (0 `putSettings`/`writeSettings` mentions). This plan puts them in `settings-saves.test.mjs`, which §4 names.
2. **§4: "`putSettings(payload, revs)` sends each key's token (`?? null`, never undefined)."** This plan sends no `ifRevs` when `revs` is omitted, or B-3's 29 one-argument calls would be refused at `settings.mjs:302-304` between B-2 and B-3 **(critic)**.
3. **§4: "every catch calls the one named take-the-latest helper."** The Invite and the import do not. Their helper does, and they read `.twice` **(critic 1 proof)**.
4. **§4: "Assign, Delete and the CSV say 'The team list…'".** The CSV there can only be Territories' (the member import re-applies, J-B6), so it says "territory" (JB2-2).
5. **§5: "the profile move re-applied".** Under J-B7 it is read as "through Save changes", the owed move.
6. **§2: "Closes both §4.3 items."** Overstated. It closes them on dev for converted tabs; an old tab and prod still rename back until they reload or the change ships (Q6, `settings.mjs:303`, `:537`) **(critic 2 tenancy)**.
7. **§4's token "at open" for windows.** Kept, with the snapshot re-based from the take-latest answer and from the window's own landed save, so a new entry's retry carries a live token.
8. **Not STEP-B, the task text:** it named `src/utils/saveSettings.js` and a move in `memberSave.js`. Both are wrong (§0, items 1-2).
9. **Not STEP-B, CLAUDE.md:** the verification chain ran the harness before any commit; Jeff's "Commit each, harness last" (JB2-12) is now written into the chain and guide §18b23 part 4.

## 4b. B-3 — the build plan (every other settings screen)

I put this together on 2 Nov 2026 from the designer's plan, the five maps and two critiques: correctness/tenancy (cited as **A1–A10**) and proof/scope (**B1–B15**). Before taking or rejecting any critic point, I re-read the cited lines in the working tree. Points I took are marked **(critic)**. I edited nothing, served nothing, ran nothing against a database and ran no test. The only scripts were read-only `awk`/`grep`/`sed` reads. The line-ending table in §0.1 is the designer's count (`…/scratchpad/eol.mjs`); I did not re-run it.

### The design in one paragraph

**One new shared hook does most of the work: `src/Tabs/settings/shared/usePanelRevs.js`.**
- It holds the panel's tokens from when it opened (`opened`).
- `landed(answer)` merges a landed save's tokens into the app copy and into `opened`.
- `reopen()` re-takes `opened` for the three panels that re-seed their draft from an effect.
- `panelStale(e, words)` hands a stale refusal to AdminView through a context.
- `once(fn)` makes a second save while one is out share the first one's outcome (JB3-10).

**AdminView handles J-B5 in one place.** It reads the latest, clears App's dirty flag and save slot, remounts the open panel by bumping a key on one wrapper around `{panelEl}`, and draws the words above it. It does none of this if the panel that asked has since unmounted **(critic A2/B5)**. None of the ~40 pinned mount lines change.

**Each guarded panel changes in six small places:**
1. an import line;
2. a hook line;
3. `handleSave` wrapped in `once(...)`;
4. the send gains `, opened`;
5. `landed(answer)` after the mirror;
6. one first line in the catch: `if (e.stale && await panelStale(e)) throw e;`.

**Everything else:**
- Pipelines and Calendar get one save in flight and roll back only the keys they sent.
- Edit brand handles its stale refusal inside its window.
- Sales Manager gets its own stale branch in `saveExtra`.
- Both leave guards show J-B11's words when the thrown error carries `tookLatest`.

**Recommended: three commits (JB3-9, critic B14).**
- **B-3a:** the shell and every draft panel.
- **B-3b:** the optimistic and odd-shaped screens.
- **B-3c:** Connected apps.

The harness stays deferred, with one scoped run over B-2 and all of B-3 before any push.

### §0. Corrections the build must know

**1. Line endings** (designer's node count; not re-run).
- **LF:** `DispatchCustomerNotificationsDetail.jsx`, `ProductTypesDetail.jsx`, `EmailTemplatesDetail.jsx`, `LeaveGuardModal.jsx`, `src/utils/settingsRevs.js`, every test file. The new `usePanelRevs.js` is LF.
- **CRLF:** every other B-3 panel, plus `SalesManagerTab.jsx`, `AdminView.jsx`, `App.jsx`, `saveSettings.js`, `CategoryDetailChrome.jsx` and `scripts/mutate-import.mjs`.
- Edit the CRLF files by node script with asserted counts.

**2. Backslash-u escape text.**
- `SalesManagerTab.jsx` holds the escape written as six characters at :202-204, :901, :903-904 and :910.
- The same file has a literal `—` in `saveExtra` at :975-977 **(critic B10)**.
- So no harness anchor may quote a 403/status word from `saveExtra` alone. Quote it together with the new `const w = await writeSettings(patch, opened);` line.
- Edit this file by node script only.

**3. J-B12 lives in `data/FeaturesDetail.jsx`, not Connected apps.**
- The typed key is state at :97-98 and is sent at :174-175.
- The refusal path :182-187 and the network throw both run before the only `stillOrg` at :189.
- :174 sends no key when `keyAction === 'set'` and the box is empty **(critic B2)**. So the J-B12 words key on `'anthropicApiKey' in payload`, not on `keyAction`.

**4. `putSettings` does not check the org on a network failure.**
- `await dbFetch` at `saveSettings.js:51-55` is outside any try.
- `writeSettings` already handles this case (:78-79).
- Fixed in §1 (JB3-7c).

**5. The guards read `canSave` from a ref at render** (`AdminView.jsx:498`, `:800`; `App.jsx:2209`).
- The slot is assigned and cleared in a passive effect, `useRegisterSave.js:19-20`. The plan cited ":83", but the file has 22 lines **(critic B13)**.
- So AdminView's stale handler nulls the slot itself before the guard re-renders. App.jsx:1528 already does the same on an org switch.

**6. Pre-existing: AdminView's Discard never resets `guardFailed`** (`:501`, `:803`). App resets it on open (`App.jsx:1566`). Fixed (JB3-7b).

**7. The PUT answers tokens only for the keys sent** (`settings.mjs:564-566`).
- A key the server derives (the AI scrub, the key migration) moves without telling the screen.
- Features' next save of that key is refused once and shows the latest. That is B-1's rule; filed.

**8. Train now drops the token.**
- `LeadScoringDetail.jsx:134` takes `data.leadScoring` but not the `revs` that `train-lead-model.mjs:52` answers.
- Without a fix, the first rules save after Train now is refused against itself. B-3 merges the token.

**9. `handlerIn` (`settings-saves.test.mjs:84-95`) finds only `const X = (…) =>` components.**
- `SalesManagerTab` (`export default function`, :818) and `FlatListDetail` (`function`, :10) need a FunctionDeclaration-aware pick.

**10. `deal-modal-saves`' `screenOnly`** (`:132-145`) will flag the hook's `landed`. Its handler is `fns[1]` and has no `SERVER` call, so it needs an `ALLOWED` row.

**11. `late-answers` will flag the optimistic rollbacks unless `panelStale` is learned (critic B1).**
- Its `settles` list (:148-149) names only the four senders.
- `setSettings` is a tracked shared setter (:26-28).
- Pipelines' and Calendar's `setSettings(prev => …held)` after `await panelStale(e)` would be flagged.

**12. S5 cannot see a spread, and its list rule will flag FlatList (critic B7).**
- `updaterFaults` (`:272-291`) reads only named keys.
- It flags any `[computed]` key written without `revs` (:282). FlatList's mirror `setSettings(prev => ({ ...prev, [settingsKey]: items }))` (:27) will fail it once the file joins `SITES`, even though `landed` merges right after.

**13. Connected apps cannot simply drop its load (critic A1/B11).**
- `loading` starts `true` (`ConnectedAppsDetail.jsx:371`) and only the settings load clears it (:399). The render returns early on it (:530).
- `error` (:372, :545) is set only by that load.
- An org with no row gets `{ settings: null }` (`settings.mjs:97`). The copy then has no `connectedApps` (`settingsDefaults.js` defines none; grep 0), and bare `connectedApps.slack` (:473) would throw.

**14. Mount lines are pinned whole:**
- tests: `email-templates.test.mjs:72`, `invoices.test.mjs:332`, `settings-leave-guard.test.mjs:112`, `honest-panels.test.mjs:157`;
- harness: `mutate-import.mjs:4047`, `:4831`, `:4835`, `:4928`.

Only `:433` (Connected apps, unpinned) changes, in B-3c.

### §1. The sender and the new shared pieces (B-3a)

**`src/utils/settingsRevs.js` (LF): new words after :46.**

| Constant | Words | Decision |
|---|---|---|
| `PANEL_CHANGED` | "These settings changed since this page loaded — it now shows the latest. Make your change again." | JB3-1 |
| `PANEL_CHANGED_KEY` | `PANEL_CHANGED` + " Enter the API key again." | J-B12 |
| `PANEL_CHANGED_WEBHOOK` | `PANEL_CHANGED` + " Enter the webhook URL again." | JB3-3, B-3c |
| `BRAND_CHANGED` | "The brand changed since this window opened — it now shows the latest. Make your change again." | JB3-4, B-3b |
| `LEAVE_STALE` | "Another change landed first — the page now shows the latest. Your changes were not saved." | J-B11, verbatim |
| `LEAVE_STALE_PART` | "Another change landed first — the page now shows the latest. That change was not saved; the ones saved before it stay saved." | JB3-5, B-3b **(critic A4/B4)** |
| `STILL_SAVING` | "The last change is still saving — try again in a moment." | JB3-8, B-3b |

**`src/Tabs/settings/shared/saveSettings.js` (CRLF), `putSettings` :51-55.**
- New shape: `let res; try { res = await dbFetch(…unchanged…); } catch { if (!stillOrg(askedOrg)) return stopped(); throw new Error(NETWORK_ERROR); }`.
- `NETWORK_ERROR` is already imported (:43). The words now match `writeSettings` (:79) **(critic B13)**.
- :56-67 stay byte for byte, so harness 5403 and 5407 survive.
- The new try line must not repeat `writeSettings`' two-line anchor at `mutate-import.mjs:17364`. Its `catch` line differs, so that anchor stays unique; parse-check it.
- Keep the one-argument (Q6) path. Old tabs use it, and S3 :421 and late-answers :237 pin it.

**New: `src/Tabs/settings/shared/usePanelRevs.js` (LF), all module scope.**

```
import React from 'react';
import { revsAfter } from '../../../utils/settingsRevs.js';
// AdminView provides { took, landed } around the open panel (J-B5); null elsewhere.
export const PanelStaleContext = React.createContext(null);
export function usePanelRevs(settings, setSettings) {
    // The tokens as this panel opened — its draft was seeded from the same render.
    const [opened, setOpened] = React.useState(() => ({ ...(settings?.revs || {}) }));
    const shell = React.useContext(PanelStaleContext);
    // Mounted? A refusal or a landing answered after Back/Discard must touch no other panel (critic A2).
    const alive = React.useRef(true);
    React.useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
    const flight = React.useRef(null);
    const landed = (answer) => {
        setSettings((prev) => ({ ...prev, revs: revsAfter(prev?.revs, answer?.revs) }));
        setOpened((held) => revsAfter(held, answer?.revs));
        if (shell && alive.current) shell.landed();
    };
    const reopen = (revs = settings?.revs) => setOpened({ ...(revs || {}) });
    const panelStale = async (e, words) => (shell ? shell.took(e, words, () => alive.current) : false);
    // A second save while one is out shares its outcome (SalesManagerTab.jsx:1040-1052 precedent; JB3-10).
    const once = (fn) => (...args) => {
        if (flight.current) return flight.current;
        const p = fn(...args); flight.current = p;
        const clear = () => { if (flight.current === p) flight.current = null; };
        p.then(clear, clear);
        return p;
    };
    return { opened, landed, reopen, panelStale, once };
}
```

**Why `opened` and not the render's `settings.revs`.**
- The copy changes under an open panel only through a take-latest (which remounts) or through App's `loadData`, which re-runs on `[clerkUser, organization]` (`App.jsx:555`). Whether Clerk reissues those objects mid-session is an open question.
- `opened` is never newer than the draft. So a moved copy can cause a false refusal, never a lost update.
- Cancel does not re-take `opened`. The draft re-seeds from the render, so a refusal after Cancel means a change really did land.

### §2. The token rule, and each site

**The rule.** A send's second argument is one of:
- the panel's `opened`, bound by `const { opened, … } = usePanelRevs(settings, setSettings)`. `withIfRevs` picks only the payload's keys (`settingsRevs.js:121-124`).
- `{ quoteBrand: base.rev }` in Edit brand.
- Sales Manager's draft-start `opened` (its `useState` form, Sales Manager only).

A landed save calls `landed(answer)`, or merges with `revsAfter` in its own updater. A stale refusal goes to `panelStale`, or to `takeLatestSettings` where there is no AdminView (Edit brand, Sales Manager).

Org checks come from the sender: `putSettings`, `writeSettings` and `takeLatestSettings` never settle after a switch (`saveSettings.js:56`, :61-62, :66, :79-81, :97), and AdminView is keyed by org (`SettingsTab.jsx:63`).

**Shape A (B-3a): a standard draft panel, seeded at mount and registered with the guard.**
1. A new line `import { usePanelRevs } from '../shared/usePanelRevs.js';` (never an edit of an import line a test quotes).
2. `const { opened, landed, panelStale, once } = usePanelRevs(settings, setSettings);` after the draft states.
3. `const handleSave = once(async () => { … });`. The body is unchanged apart from items 4-6, and every caller (own buttons, both guards) shares it (JB3-10, critic A3/B3).
4. `const answer = await putSettings(<payload as today>, opened);`.
5. `landed(answer);` straight after the existing mirror, which stays byte for byte.
6. The catch's first line: `if (e.stale && await panelStale(e)) throw e;`. Use `err` where the catch binds `err`.

If the latest could not be read, the catch falls through to today's words (the server's `STALE_ERROR`) and keeps the draft.

| Site (send line) | Keys | Notes beyond the six edits |
|---|---|---|
| FlatListDetail.jsx:25 | `[settingsKey]` | JB3-6: Save :73 `disabled={!dirty \|\| saving}`. |
| CustomerTypesDetail.jsx:34 | customerTypeTiers | Harness 4815 re-pointed. Keep `setSaving(false);\n            throw e;\n        }` unique (4839). |
| AccountSegmentsDetail.jsx:44 | accountSegmentTiers | none |
| BuyerPersonasDetail.jsx:118 | buyerPersonas | none |
| CustomFieldsDetail.jsx:60 | customFieldsByObject | JB3-6: `disablePrimary={!dirty \|\| saving}` (`CategoryDetailChrome.jsx:39`). |
| EmailTemplatesDetail.jsx:84 (LF) | emailTemplates | New catch line above `setSaveError(e.message);`. email-templates :78 moves; :79 holds. |
| FunnelStagesDetail.jsx:42 | funnelStages | JB3-6, as CustomFields. |
| IndustriesDetail.jsx:55 | industries | connected-apps :131-139 Cancel substrings untouched. |
| KPIThresholdsDetail.jsx:67 | kpiThresholds | The `hasErrors` throw has no `.stale` and falls through. |
| LeadConversionDetail.jsx:62 (`LeadConvBenchmarks`) | leadConvBenchmarks | Hook in `LeadConvBenchmarks`. No new `setDirty(true)` (save-buttons :173 counts 4). |
| PainPointsDetail.jsx:68 | painPoints | none |
| CompanyProfileDetail.jsx:48 | the 11 company keys | `patch` stays a const. |
| FiscalYearDetail.jsx:91 | fiscalYearStart and/or quotaPeriods (:81-84) | The conditional payload stays. quota-plan :480 (the `between` start line) and :484 re-pinned. Harness 4823 re-pointed; 11982 and 12097 survive. |
| DispatchCrewsDetail.jsx:75 | dispatchCrews | Link 404s and 400s are not stale; unchanged. |
| DispatchCustomerNotificationsDetail.jsx:49 (LF) | customerNotifications | customer-notifications :168 re-pinned. |
| DispatchJobTemplatesDetail.jsx:186 | dispatchJobTemplates | none |
| DispatchPropertyTypesDetail.jsx:150 | dispatchPropertyTypes | `useCallback(once(async () => {…}), [types, setSettings, opened, landed, panelStale])`. Signature :108, the catch regex :110 and harness 4042 are kept. |
| DispatchSkillsDetail.jsx:36 | dispatchSkills, dispatchCerts, dispatchLicenses | Harness 4819 re-pointed. |
| ApprovalTiersDetail.jsx:145 | approvalTiers, approvalRouting | approval-routing :142 re-pinned. Harness 4843 survives. |
| ProductTypesDetail.jsx:53 (LF) | productTypes | invoices :336 re-pinned. JB3-7a: Cancel :77 also calls `setSettingsDirty && setSettingsDirty(false)`. |
| QuoteTemplatesDetail.jsx:1066 | quoteTemplates, quoteDefaults, quoteBoilerplate | :1276 changes in B-3b (§4). |
| DispatchBlockTypesDetail.jsx:42 (direct) | dispatchBlockTypes | Replace :41-51 with the A-shape send. The 403 words become the sender's (no pin). JB3-7a: Cancel :77-80 clears App's flag. Harness 4037 survives. |
| DispatchJobTypesDetail.jsx:97 (direct) | dispatchTrades, dispatchJobTypes | As BlockTypes; Cancel :134-137. |

**Shape A′ (B-3a): re-seeded by an effect.** The same six edits, plus `reopen()` where the draft re-seeds.

- **FeaturesDetail.jsx `handleSaveAi` :157-219.**
  - Replace :177-189 with `const result = await putSettings(payload, opened);`.
  - The payload literal :164-175 and the mirror :191-207 stay, so harness 1421, ai-score :177-179, dispatch-gate :164 and report-prompt :357 hold. Then `landed(result);`.
  - `reopen();` inside the effect's `if (!dirty)` (:128-139).
  - The catch:
    ```
    const sentKey = 'anthropicApiKey' in payload;          // hoist `payload` above the try
    if (e.stale && await panelStale(e, sentKey ? PANEL_CHANGED_KEY : PANEL_CHANGED)) throw e;
    if (e.stale && sentKey) { setApiKeyInput(''); setKeyAction(null); setError('Failed to save: ' + e.message + ' Enter the API key again.'); throw e; }
    ```
    Then today's :213-215 **(critic B2)**.
  - Drop `requestOrg`, `stillOrg` and `dbFetch` if they become unused.
- **LeadScoringDetail.jsx:152.**
  - `reopen();` in the :101 effect.
  - Train now :134 becomes `setSettings(prev => ({ ...prev, leadScoring: data.leadScoring, revs: revsAfter(prev.revs, data.revs) }))` (train-now :81 re-pinned).
- **LeadVisibilityDetail.jsx:67.** `reopen();` in the :54 effect.

**Shape B (B-3b): optimistic, built on click** (J-B10, JB3-8). Same hook, no guard registration.

- **`PipelinesDetail.jsx` `persist` :59-71.** All 9 callers stay as they are.
  1. A new `const inFlight = useRef(false)`. If a save is out, `setSaveError(\`${label} not saved — ${STILL_SAVING}\`)` and return false.
  2. Set `inFlight.current = true`.
  3. `held = Object.fromEntries(Object.keys(patch).map(k => [k, settings?.[k]]))`.
  4. Optimistic `setSettings(prev => ({ ...prev, ...patch }))`.
  5. `const answer = await putSettings(patch, opened); landed(answer); return true;`.
  6. Catch: `inFlight.current = false;`, then `if (e.stale && await panelStale(e)) return false;`, then `setSettings(prev => ({ ...prev, ...held }))` (never `revs`) and today's words.
  7. The gate is released on success by `useEffect(() => { inFlight.current = false; }, [opened])`. It opens only once the merged token is in this render **(critic A8)**.
  8. The `let snapshot` lines :60-61 and :67 go.
- **`CompanyCalendarDetail.jsx` `persistHolidays` :71-83.** Same shape. One gate covers Add, the unguarded Delete :350, and Sync.
- **`CompanyCalendarDetail.jsx` `handleSync` :120-157.**
  - Take the gate before the holidays GET (if it is taken, say `STILL_SAVING` in `syncMsg`).
  - Release it in the catch paths and in the `:127` org-switch return. On success it is released by the `[opened]` effect.
  - :141-148 becomes `held` for both keys, the optimistic set, `const answer = await putSettings({ customHolidays: preserved, federalHolidays: fresh }, opened); landed(answer);`.
  - Catch: stale goes to `panelStale` then `return`; otherwise the keys-only rollback and a rethrow to :151.

**Shape C, Edit brand (B-3b)** and **shape D, Sales Manager (B-3b)** are in §4. **Shape E, Connected apps (B-3c)** is in §4.

### §3. The shell (B-3a)

**AdminView.jsx (CRLF).** New import lines for `takeLatestSettings`, `PanelStaleContext` and `PANEL_CHANGED`.

- **New state** beside :112-114: `panelEpoch` (`useState(0)`) and `panelNote` (`useState(null)`, holding `{ id, words }`).
- **The J-B5 handler**, at AdminView's top level after `guardSave` (:154), so S11 can pick it:

  ```
  const panelStale = async (e, words = PANEL_CHANGED, isAlive = () => true) => {
      const latest = await takeLatestSettings(setSettings);   // never settles after a switch
      if (!latest) return false;                               // keep the draft; the panel says the server's words
      if (e) e.tookLatest = true;
      if (!isAlive()) return true;                             // the asker left: the copy is the latest, nothing else touched (critic A2)
      if (settingsSaveRef) settingsSaveRef.current = null;     // the guard reads canSave at render (§0.5)
      if (typeof setSettingsDirty === 'function') setSettingsDirty(false);   // BlockTypes/JobTypes/ProductTypes never clear it
      setPanelNote({ id: activeItem?.id, words });
      setPanelEpoch((n) => n + 1);                             // remount on the latest (J-B5)
      return true;
  };
  ```

  The alive check (critic A2) beats B5's id/epoch check. Reopening the same card sets the same `SETTINGS_ITEMS` object, so the id and epoch would not move, and a late refusal would still wipe the new mount.
- **Render (:494-504).**
  - Before the panel: `{panelNote && panelNote.id === activeItem.id && <div …>{panelNote.words}</div>}`, in the chrome's error-box style (`CategoryDetailChrome.jsx:50-56`, the JB2-1 precedent).
  - Then `<PanelStaleContext.Provider value={{ took: panelStale, landed: () => setPanelNote(null) }}><React.Fragment key={panelEpoch}>{panelEl}</React.Fragment></PanelStaleContext.Provider>`.
- **`onBack` (:397-401).** `setPanelNote(null)` in both paths. Also in `openItem`'s two paths (:125-128).
- **`guardSave`'s catch :140-144.** `setGuardFailed(e?.tookLatest ? (e.partial ? 'stale-partial' : 'stale') : true);` (unpinned).
- **Both `onDiscard`s (:501, :803).** Add `setGuardFailed(false);` before `go && go()` (JB3-7b).

**App.jsx (CRLF).** Only `navGuardSave`'s catch :1604-1608 changes: `} catch (e) {` … `setNavGuardFailed(e?.tookLatest ? (e.partial ? 'stale-partial' : 'stale') : true);`.
- The dialog JSX :2206-2213 is unchanged, so harness 6294-6297 and save-buttons :191 survive.
- save-buttons :212 and harness 4871 move.
- App.jsx's 133 harness entries join the scoped run.

**LeaveGuardModal.jsx (LF).**
- Import `LEAVE_STALE` and `LEAVE_STALE_PART`.
- `const stale = failed === 'stale' || failed === 'stale-partial';`.
- The :29-33 line shows `failed === 'stale-partial' ? LEAVE_STALE_PART : stale ? LEAVE_STALE : today's words`.
- :35 shows `{stale && !canSave ? null : message}`. "Save them, or discard" is false when nothing is left **(critic A6)**. It is changed inside the modal only, so App's JSX and harness 6294 are untouched.
- Save stays offered on `canSave` alone, not hidden on `stale`. A4's formula `canSave && !(stale && !canSave)` reduces to `canSave` **(critic A4)**. In AdminView, `panelStale` nulls the slot first, so Save is hidden. On Sales Manager, a SPIFF draft left unsent keeps Save.
- Discard :53-58 is labelled `stale && !canSave ? 'Continue' : 'Discard changes and continue'`, in the neutral style when it reads Continue (JB3-2).
- The Escape line :21 is untouched (harness 6359, escape-order :489).

### §4. Optimistic panels, Edit brand, Sales Manager, Connected apps, J-B12

**J-B10 (B-3b).** As shape B. The `let snapshot` / `setSettings(snapshot)` lines go:
- `PipelinesDetail.jsx:60-61`, `:67`;
- `CompanyCalendarDetail.jsx:72-73`, `:79`, `:141`, `:146`.

**Edit brand (B-3b, JB3-4; this replaces J-B10 for Edit brand on Jeff's word, critic B15).** In `EditBrandModal.jsx`:
- Props become `({ initial = BRAND_PRESET, initialRev = null, onClose })`.
- New state: `const [base, setBase] = React.useState(() => ({ rev: initialRev }))` and `const [saving, setSaving] = React.useState(false)`.
- `handleSave` :253-269:
  1. `setSaving(true); setSaveError('');`
  2. `const w = await writeSettings({ quoteBrand: brand }, { quoteBrand: base.rev });`
  3. If `w.ok`: `setSettings(prev => ({ ...prev, quoteBrand: brand, revs: revsAfter(prev.revs, w.revs) })); onClose(); return;`
  4. If `w.stale`: `const latest = await takeLatestSettings(setSettings); if (latest) { setBrand(latest.quoteBrand || BRAND_PRESET); setBase({ rev: latest.revs?.quoteBrand ?? null }); setSaveError(BRAND_CHANGED); setSaving(false); return; }`
  5. Otherwise: `` setSaveError(`Brand not saved — ${w.error}`); setSaving(false); ``.
- While saving, the window cannot be closed **(critic A5)**:
  - `close` (:251) returns at once while `saving`.
  - The Escape handler (:271) also requires `!saving`.
  - Cancel :460 and Save :465 get `disabled={saving}`.
  - This is LeaveGuardModal's rule (`LeaveGuardModal.jsx:7`).
- Imports: `dbWrite`, `requestOrg` and `stillOrg` go. Add `writeSettings`, `takeLatestSettings`, `revsAfter` and `BRAND_CHANGED`.
- `QuoteTemplatesDetail.jsx:1276` passes `initialRev={settings.revs?.quoteBrand ?? null}`.
- house-dialogs :48 is untouched.

**Sales Manager (B-3b, JB3-5).** In `SalesManagerTab.jsx`:
- **Draft-start tokens.**
  - After :938: `const [opened, setOpened] = useState({});`.
  - `const draftTiers = (next) => { if (tiersDraft === null) setOpened(o => ({ ...o, quotaData: settings.revs?.quotaData ?? null })); setTiersDraft(next); };`.
  - `draftSpiffs` is the same for `spiffs`.
  - :1577 passes `setTiersDraft={draftTiers} … setSpiffsDraft={draftSpiffs}`. Every SPIFF edit, the delayed Remove at :738 included, goes through `editSpiffs` (:530).
  - The :941 org reset stays byte for byte; the next draft re-takes its token.
- **`saveExtra` :964-987.** Its signature and the `if (!settingsLoaded) {` block stay (settings-org-load :358-363, harness 3858). After `setSaveState(saving)`:
  1. `const w = await writeSettings(patch, opened);`
  2. If `w.ok`: `setSettings(prev => ({ ...prev, revs: revsAfter(prev.revs, w.revs) })); setSaveState(saved); return true;`
  3. If `w.stale`: `const latest = await takeLatestSettings(setSettings); if (latest) { if ('quotaData' in patch) setTiersDraft(null); if ('spiffs' in patch) setSpiffsDraft(null); const msg = listChanged('quotaData' in patch ? 'commission tier' : 'SPIFF'); setSaveState({ status: 'error', msg }); throw Object.assign(new Error(msg), { stale: w.stale, tookLatest: true }); }`
  4. Otherwise today's words: 403 at :976, `w.status === 0` at :984, and `` `Not saved — ${w.error}` `` for anything else.
- The callers :1058 and :1070 are unchanged (save-buttons :243, harness 4889). The throw passes through them.
- **`saveAdminDrafts` :1076-1080 (critic A4/B4).**
  ```
  let landedOne = false;
  try {
      if (Object.keys(quotaDrafts).length) { await saveQuotas(); landedOne = true; }
      if (tiersDraft !== null) { await saveCommission(); landedOne = true; }
      if (spiffsDraft !== null) await saveSpiffBoard();
  } catch (e) { if (e.tookLatest && landedOne) e.partial = true; throw e; }
  ```
  save-buttons :241-242 still finds the three awaits. "Landed" counts `saveQuotas` returning with nothing sent, so it is approximate (open question 5).

**Connected apps (B-3c, JB3-3, Recommended: convert).**
- `AdminView.jsx:433` becomes `<ConnectedAppsDetail settings={settings} setSettings={setSettings} onBack={onBack}/>`.
- Read from the prop **(critic A1/B11)**:
  - `const connectedApps = settings?.connectedApps || {}`;
  - `slackConfig = settings?.slackConfig || {}`;
  - `requests = settings?.integrationRequests || {}`;
  - `webForm = cleanWebToLead(settings?.webToLead)`.
- Delete the matching states (:364-366, :369) and the settings load (:386-400).
- Delete `loading` (:371) and its early return (:530-535), or start it `false`. Delete `error` (:372) and its banner (:545). The calendar, BCC and jobs loads stay.
- Add the hook line.
- **Slack Save :446-459.** No longer optimistic:
  - `const answer = await putSettings({ slackConfig: config, connectedApps: nextApps }, opened); setSettings(prev => ({ ...prev, slackConfig: config, connectedApps: nextApps })); landed(answer);` then the :453 line and its comment byte for byte.
  - Catch: `if (e.stale) await panelStale(e, PANEL_CHANGED_WEBHOOK);`, then the :457 throw line byte for byte (harness 1523).
- **Disconnect :460-472.** The same shape. Stale remounts; otherwise the :469 note (harness 1540).
- **`saveWebForm` :507-520.**
  - After `landed(answer)`: `const latest = await takeLatestSettings(setSettings); if (latest) reopen(latest.revs); else note('webform', 'Saved — the new link could not be read; reload the page to see it.');` **(critic A7)**. This replaces the :511 GET.
  - Catch: stale goes to `panelStale` then `return`; otherwise the :516 note.
- **`requestApp` :487-501.** `requestOrg`/`stillOrg` around the POST answer, then `setSettings(prev => ({ ...prev, integrationRequests: { ...(prev.integrationRequests || {}), [app.id]: data.request } }))`.
- **Result:** both named GETs go, and the app copy stops being stale after a Slack save (`ReportsTab.jsx:4557` reads it).

**J-B12 (B-3a).** Features clears the typed key by the remount, or by hand when the latest is unread, with the key words in both branches. Its failure path is org-checked by the sender, the network throw included (§1).

### §5. Tests

**`tests/settings-saves.test.mjs` (LF).**

- **The lists.**
  - Each commit moves its files from `B3_PENDING` / `B3_DIRECT` (:110-145) into `SITES` (:101-106), by literal path with counts:
    - Calendar `putSettings: 2`;
    - ConnectedApps `putSettings: 3`;
    - EditBrandModal `writeSettings: 1`;
    - SalesManagerTab `writeSettings: 1`;
    - every other file `putSettings: 1`.
  - After B-3c, S2's pending branch (:324-330, :338) goes, `NAMED_GETS` (:147) is `{ 'src/hooks/useSettings.js': 1 }`, and S1 (:301) asserts every `SITES` file holds 0.
- **S2 (`sendFaults` :205-241) learns three accepted forms, resolved by a scope walk like `constNamed` (:160-180), not by name (critic B6):**
  - a second argument that is the Identifier `opened`, with any payload, where the enclosing component destructures it from `usePanelRevs(settings, setSettings)`;
  - in `src/Tabs/SalesManagerTab.jsx` only, `opened` from `const [opened, setOpened] = useState(`, with `setOpened` called only inside `draftTiers` / `draftSpiffs` under a `=== null` test **(critic A10)**;
  - a token `<snapshot>.rev` (already accepted).
  - S8 made-up cases. Accepted: each form above. Refused:
    - `opened` bound only in another component of the file;
    - a stray `const [opened] = useState({})` outside SalesManagerTab;
    - `setOpened` inside `saveExtra`;
    - `putSettings(p, settings.revs)`;
    - `{ teams: opened.territories }`.
- **S4 (`refusalFaults` :245-269) over every `SITES` file (today `B2_FILES`, :605).**
  - A putSettings catch, or the function around a writeSettings, may call `panelStale(` in place of `takeLatestSettings(`. The `panelStale` must resolve to the hook's destructure, not a local function (critic B6).
  - In any file that calls `useRegisterSave`, the putSettings catch's first statement must be `if (<x>.stale && await panelStale(<x>…)) throw <x>;` (critic B6).
  - S8 cases for both.
- **S4b, AdminView `panelStale` via a pick.** In order: `takeLatestSettings(setSettings)`, `if (!latest) return false;`, `tookLatest = true`, `if (!isAlive()) return true;`, `settingsSaveRef.current = null`, `setSettingsDirty(false)`, `setPanelEpoch(`. Also the Provider around `<React.Fragment key={panelEpoch}>{panelEl}</React.Fragment>`.
- **S5 (`updaterFaults`) over `[SITES files, SENDER, usePanelRevs.js]` (critic B7).**
  - The list rule (:282) passes where the enclosing function calls `landed(<the send's bound result>)` after the send.
  - New: in every `SITES` file every `setSettings(` call takes a function.
  - New: `landed`'s argument must be the identifier bound to the send's result.
  - New: no `let snapshot`.
- **S9, `usePanelRevs` run as written** (imports stripped; `useState`/`useRef`/`useContext`/`useEffect` stubbed with a call-indexed state array that persists across two renders, critic B8). Cases:
  - `opened` is the first render's `revs` after a second render with newer `revs`;
  - `landed` merges key by key into the copy and into `opened`;
  - `reopen()` and `reopen(revs)` replace;
  - `landed` clears the note only while alive;
  - `panelStale` is false with no provider and passes an `isAlive` that turns false after the unmount cleanup;
  - `once` hands a second caller the first promise (resolve and reject) and clears after it settles.
- **S10, one handler of each shape run as written** (S6/S7's pattern, with a FunctionDeclaration-aware pick):
  - **CustomerTypes** `handleSave`:
    - sends `opened`;
    - `landed` gets the answer;
    - stale with `panelStale` true rethrows with no `setSaveError`;
    - stale with false shows `e.message` and rethrows;
    - a 404 shows its words.
  - **Pipelines** `persist`:
    - a second call while pending sends nothing and says `STILL_SAVING`;
    - the gate stays shut after landing until `opened` changes;
    - a refusal rolls back the sent key only, with `revs` untouched;
    - stale goes to `panelStale` with no rollback.
  - **Calendar Sync:** a refusal restores both keys only (critic B7 re-attributes mutant #32 here).
  - **Features:** stale with the key sent passes `PANEL_CHANGED_KEY`. Unread: the key is cleared and the words end "Enter the API key again." (critic B2). Stale with `keyAction 'set'` and an empty box passes `PANEL_CHANGED`.
  - **Sales Manager** `saveExtra`:
    - sends `opened`;
    - stale: take, draft dropped, `listChanged`, throws with `tookLatest` and `stale`;
    - landed merges;
    - 403, network and not-loaded words.
  - **Sales Manager** `saveAdminDrafts`: quotas land then commission is stale gives `partial`.
  - **`draftTiers` and `draftSpiffs`** each take the token only when their draft begins (critic B9).
  - **EditBrand:**
    - sends `base.rev`;
    - stale re-seeds the brand and `base` and stays open;
    - landed merges and closes;
    - `close` and Escape do nothing while saving (critic A5).
- **S11, AdminView `panelStale` and `guardSave` run as written.**
  - Latest read and alive: dirty cleared, slot nulled, note set, epoch+1, `tookLatest`.
  - Latest read, not alive: only `tookLatest`, returns true.
  - Null: nothing set, false.
  - After an org switch it never settles (critic B1).
  - `guardSave` sets 'stale', 'stale-partial' or `true`.
  - Static: `onBack`/`openItem` clear the note; both `onDiscard`s reset `guardFailed`.
- **S12, static pins:**
  - App's catch;
  - LeaveGuardModal's three word states, `{stale && !canSave ? null : message}`, the Continue label;
  - the `reopen()` calls;
  - PropertyTypes' deps;
  - the JB3-6 disables and JB3-7a Cancel lines;
  - every guarded panel's `const handleSave = once(` / `handleSaveAi = once(`;
  - EditBrand's `disabled={saving}` on Save and Cancel.
- **S3 adds:** `putSettings` with a throwing fetch rejects with `NETWORK_ERROR` in the asking org and stays PENDING after a switch.
- **ConnectedApps (B-3c):** a render-shape case with `settings = DEFAULT_SETTINGS` (the panel reads no bare `connectedApps.slack`), statically **(critic A1)**.

**`tests/late-answers.test.mjs` (critic B1).**
- Add `panelStale` to the `settles` list (:149).
- Add the fixture `async function o() { await panelStale(e); setSettings(s => s); }` with no miss, beside :224-227.
- B-3c: `requestApp`'s new `stillOrg`.

**Pins that move**

| File | Line(s) | Change |
|---|---|---|
| save-buttons | :106-127 | Column 2 of all 20 `AFTER_SAVE` rows gains `, opened`; the mirrors stay. |
| save-buttons | :212 | `catch \(e\) \{\s*setNavGuardSaving\(false\);\s*setNavGuardFailed\(e\?\.tookLatest \? \(e\.partial \? 'stale-partial' : 'stale'\) : true\);\s*return;` |
| save-buttons | :146-153, :167-170, :185-191, :241-243 | Unchanged. |
| settings-leave-guard | :97 | Unchanged: the registration line is kept. |
| quota-plan | :480, :484 | Moves (JB3-10 and the send). |
| email-templates | :78 | Moves. |
| invoices | :336 | Moves. |
| customer-notifications | :168 | Moves. |
| approval-routing | :142 | Moves. |
| train-now | :81 | Moves. |
| connected-apps (B-3c) | :62, :73, :87 (count 0), :88, :153 | Move. :63 and :72 are kept byte for byte. |
| lead-intake (B-3c) | :158, :159, :160 | Move. :161, :163, :164 hold. |
| deal-modal-saves | `ALLOWED` (:112-117) | Gains `['src/Tabs/settings/shared/usePanelRevs.js', 'setSettings((prev) => ({ ...prev, revs: revsAfter(prev?.revs, answer?.revs) }))', 'merges the tokens a send answered; called only straight after one']`. |

**Integration** (`tests/integration/settings-revs.itest.mjs`, orgs `itest_setrevs_A/B`, org B byte for byte). These cases pass on today's server and sender. They are labelled **B-1/B-2 coverage of B-3's keys, not proof of B-3** **(critic B12)**:
1. a three-key Skills save with one key moved (`.stale` names only it, nothing written);
2. `putSettings(p, opened)` holding other keys' tokens;
3. `anthropicApiKey` with a stale `aiSettings` token: refused, the stored key unchanged;
4. `webToLead`'s answered token equals the next GET's;
5. `spiffs` stale and landed through `writeSettings`.

### §6. Harness (`scripts/mutate-import.mjs`, CRLF; anchors written with `\n`)

**Re-point:**
- 4815, 4819, 4823: re-quote with `const answer = await putSettings(…, opened);` and the same mirror-first mutant.
- 4871: anchor on the new catch's `setNavGuardFailed(…);\n            return;\n        }`; the mutant drops `return;`.
- B-3c: re-check 1523, 1527, 1540.

**Survive if built as written** (parse each for exactly one match before the run):
- 5403, 5407, 17344-17364, 3858, 4885, 4889, 4839, 4843, 4042, 4037, 4827, 4047, 4831, 4835, 4928, 1875, 6294-6297, 6359, 1421-1423, 11982, 12097, 14138-14174, 1388, 1392;
- every other anchor on a changed file.

**Anchor uniqueness (critic B10).**
- Calendar's pairs (gate, `held`, optimistic set, `landed(answer);`, the stale line, the rollback) appear twice. Anchor Sync's with its two-key `held` line, and persistHolidays' with `setCalError`.
- ConnectedApps' `landed(answer)` appears up to 3 times. Anchor each with its neighbouring unique line.
- SalesManagerTab: anchor with `const w = await writeSettings(patch, opened);`.

**New entries (mutant → the test that catches it), each proven caught by hand.**

B-3a:

| # | File | Mutant | Caught by |
|---|---|---|---|
| 1 | usePanelRevs.js | `opened` read from `settings.revs` at render | S9 |
| 2 | usePanelRevs.js | `landed` replaces `revs` whole | S9 |
| 3 | usePanelRevs.js | no rebase of `opened` | S9 |
| 4 | usePanelRevs.js | no merge into the copy | S9 |
| 5 | usePanelRevs.js | `panelStale` true with no provider | S9 |
| 6 | usePanelRevs.js | `reopen` ignores its argument | S9 |
| 7 | usePanelRevs.js | `landed` clears the note when not alive | S9 |
| 8 | usePanelRevs.js | `isAlive` always true | S9 |
| 9 | usePanelRevs.js | `once` sends twice | S9 |
| 10 | usePanelRevs.js | `once` never clears | S9 |
| 11 | AdminView | the take is skipped | S4b, S11 |
| 12 | AdminView | remounts when the latest is unread | S11 |
| 13 | AdminView | ignores `isAlive` | S11 |
| 14 | AdminView | the dirty flag is left set | S11 |
| 15 | AdminView | the slot is kept | S11 |
| 16 | AdminView | `tookLatest` is not set | S11 |
| 17 | AdminView | the key is dropped from the wrapper | S4b |
| 18 | AdminView | `guardSave` says 'stale' for any failure | S11 |
| 19 | AdminView | `onBack` keeps the note | S12 |
| 20 | AdminView | `onDiscard` keeps `guardFailed` | S12 |
| 21 | App | never 'stale' | S12, save-buttons :212 |
| 22 | LeaveGuardModal | the old words when stale | S12 |
| 23 | LeaveGuardModal | the message kept when nothing is left | S12 |
| 24 | saveSettings.js | the network throw is unchecked | S3 |
| 25 | late-answers | `panelStale` dropped from its `settles` list | the :224-style fixture |
| 26 | CustomerTypes | the stale line removed | S4, S10 |
| 27 | CustomerTypes | `landed` removed | S5, S10 |
| 28 | CustomerTypes | `once` removed | S12 |
| 29 | FlatList | `, opened` dropped | S2 |
| 30 | BlockTypes | `, opened` dropped | S2 |
| 31 | PropertyTypes | deps lose `opened` | S12 |
| 32 | Features | the key words become `PANEL_CHANGED` | S10 |
| 33 | Features | the key is kept when the latest is unread | S10 |
| 34 | Features | the unread words lack "Enter the API key again." | S10 |
| 35 | Train now | drops `revs` | train-now :81 |
| 36 | LeadScoring | `reopen()` dropped | S12 |
| 37 | — | a JB3-6 disable dropped | S12 |
| 38 | — | a JB3-7a Cancel line dropped | S12 |

B-3b:

| # | File | Mutant | Caught by |
|---|---|---|---|
| 39 | Pipelines | the gate removed | S10 |
| 40 | Pipelines | the gate released in `finally` | S10 |
| 41 | Pipelines | rolls back `revs` too | S10 |
| 42 | Pipelines | rolls back on stale | S10 |
| 43 | Calendar | Sync rolls back with `setSettings(settings)` | S5 (function rule), S10 |
| 44 | EditBrand | sends `{ quoteBrand: null }` | S10 |
| 45 | EditBrand | stale does not re-seed | S10 |
| 46 | EditBrand | `close` while saving | S10 |
| 47 | EditBrand | Save not disabled | S12 |
| 48 | Sales Manager | the token read at save (`settings.revs`) | S2 |
| 49 | Sales Manager | `draftTiers` takes no token | S10 |
| 50 | Sales Manager | `draftSpiffs` takes no token | S10 |
| 51 | Sales Manager | the stale draft is kept | S10 |
| 52 | Sales Manager | stale returns false | S10 |
| 53 | Sales Manager | no success merge | S5 |
| 54 | Sales Manager | `partial` never set | S10 |
| 55 | LeaveGuardModal | 'stale-partial' shows `LEAVE_STALE` | S12 |

B-3c:

| # | File | Mutant | Caught by |
|---|---|---|---|
| 56 | ConnectedApps | the webForm take dropped | S10-style case, lead-intake |
| 57 | ConnectedApps | `reopen(latest.revs)` dropped | S12 |
| 58 | ConnectedApps | `requestApp`'s `stillOrg` dropped | late-answers |
| 59 | ConnectedApps | `|| {}` on `connectedApps` dropped | the default-settings case |

**Scope and order.**
- Edited suites that build paths at run time (`OPEN_ITEMS` §6 list): save-buttons, settings-leave-guard, late-answers, deal-modal-saves, quota-plan, connected-apps, house-dialogs. Trace each before trusting the scope.
- One scoped run over B-2 and all of B-3, `--base` the last green scope (B-1's `a03b958`), sized with `--list`, before any push.
- `netlify dev` stopped; `rm -rf dist node_modules/.vite` after the gate build; the run must print `Baseline: green.` first.

### §7. Browser check (one per commit, Accelerep QA `org_3K6LqEB6kPE9p4t96GBfsX9VNyb`)

**Setup and rules.**
- Jeff drives every save under the standing go.
- Before each step: read the URL bar, count the orgs, read `Clerk.user`.
- Never: a member delete, an email, a hand-made settings PUT, or a typed key or webhook.
- Every Delete click needs Jeff's word.
- Prove `ifRevs` from the 200's `revs` and from the 409.
- An own-button stale save rethrows into `CategoryDetailChrome.jsx:39`'s bare `onClick`. Expect one unhandled-rejection console line per refused own-button save (filed) **(critic B12)**.

**B-3a**
1. **Competitors, two tabs.**
   - A adds "QA-B3-a" and saves: 200.
   - A then removes it and saves again: 200, the second in-tab save, proving `landed` rebases **(critic B12)**.
   - B, opened before, adds "QA-B3-b" and saves: 409. B redraws with A's list and the note, and its addition is gone.
   - B clicks Back: the note clears **(critic B12)**.
   - B adds again: 200, and the note does not return.
   - Remove the test items.
2. **Company profile: two saves in a row in one tab**, both 200 (11 keys).
3. **AdminView guard.** A saves Customer types. B edits Customer types, clicks Back, then "Save changes and continue". The dialog shows `LEAVE_STALE`, no Save, no "Save them…" line, Stay and Continue. The panel behind shows the latest and the note. Continue leaves.
4. **App guard.** As step 3, on Funnel stages, leaving by the top nav.
5. **Lead visibility, two tabs:** refused, remounted, words **(critic B12)**. Restore.
6. **Save, then Back at once (JB3-10).** The guard's Save shares the save already out: 200 once, no 409.
7. **Features.** A toggles a live flag; stale B toggles another: remount and `PANEL_CHANGED`. Restore. The key path is proven by S10 only.
8. **Train now (optional, on Jeff's word: it writes the model):** then a rules save without reload: 200.

**B-3b**
1. **Pipelines.** A renames a stage; stale B reorders: refused and remounted. A fast second change says `STILL_SAVING`. Restore.
2. **Calendar.** A adds a holiday; stale B adds one: refused. Deletes only on Jeff's word.
3. **Edit brand.** A saves an accent colour; stale B saves another: the window stays open with `BRAND_CHANGED`. Escape during a save does nothing. Restore.
4. **Sales Manager.**
   - A edits a SPIFF name; stale B edits a SPIFF and saves: the `listChanged('SPIFF')` banner, the draft dropped.
   - B with a tier draft and a SPIFF draft, tiers stale, by the nav: `LEAVE_STALE` with Save still offered for the SPIFFs.
   - Restore.

**B-3c**
1. Open Connected apps: no settings GET in the network rows. Slack and the web form are drawn from the copy, with no "Loading…" stuck.
2. A web-form toggle in a stale tab only on Jeff's word (it changes the public link).

**Every commit: Karen.** Sign in and read `Clerk.user`. The app loads; Settings is not offered (Admin-only, `App.jsx:2084`, `:2175`); the settings GET returns 200 with `revs`; no PUT; no console error. This proves the rep path loads; it cannot reach any B-3 save **(critic B12)**.

### §8. Docs (same commit as each part)

- **State §0.226 (a/b/c).** Shapes A-E, the hook, J-B5's remount with its words and the alive check, J-B11, J-B10, J-B12, the Train now merge, `once`. Committed hash, "harness deferred", NOT pushed.
- **Guide §18b114 rule 10.**
  - Panel tokens come from `usePanelRevs` as the panel opened.
  - A landed save calls `landed`.
  - A stale refusal goes to AdminView's one handler, which touches only a mounted asker.
  - The guards say J-B11's words on `tookLatest`.
  - A guarded save is `once`.
  - Optimistic panels: one save in flight, released on the merged render, a keys-only rollback, never `revs`.
  - No settings URL outside the sender and the app's load.
- **OPEN_ITEMS.**
  - Mark CLAUDE.md's "the screens send tokens from B-2 and B-3" done on dev.
  - File:
    - the one-time false refusal after a key the server derived;
    - Train now's `config-changed` not taking the latest;
    - own-button rethrows as unhandled rejections (`CategoryDetailChrome.jsx:39`, Features' `DataBtn` :279);
    - edits typed during a panel's own save (dirty cleared on landing; pre-existing);
    - PainPoints' string default and :135 (unverified in the browser);
    - FunnelStages' default shape;
    - Pipelines' demo defaults (:16-38);
    - the inert "Import preset" buttons (Crews :133, Skills :69);
    - App's `loadData` identity question;
    - `saveAdminDrafts`' approximate "landed".
  - Add settings-saves to `OPEN_ITEMS.md`'s run-time-paths list.
- **CLAUDE.md** "Endpoint and data invariants": B-3 done, and the panel token rule in one line.
- **`SESSION_HANDOFF.md`** last.

### Critic points not taken

- **A9 (a take-latest resets Sales Manager's `__qbTerrFilter` and `_spiffClaimFilter`):** already decided. JB2-6, which Jeff took as Recommended, says the take "resets the Sales Manager's two screen filters … as a reload does". `settingsAsLoaded` (`settingsDefaults.js:111-121`) is unchanged. It stays filed.
- **B5's fix as written (`activeItemRef` / `epochRef` compared after the GET):** replaced by A2's alive ref. Reopening the same card sets the same `SETTINGS_ITEMS` object (`AdminView.jsx:127`), so neither the id nor the epoch moves, and the id/epoch check would still wipe the new mount. The problem B5 found is fixed.
- **A4's formula and B4's words, as written:** A4's `canSave && !(stale && !canSave)` reduces to `canSave` and is used in that form. B4's suggested words are replaced by `LEAVE_STALE_PART` (JB3-5), which says what landed without promising "nothing else was lost".
- **A3's registration-site fix (`useRegisterSave(…, once(handleSave))`):** taken in a different place. Wrapping the declaration (`const handleSave = once(async () => …)`) covers the own buttons and both guards. It also keeps the registration lines that `settings-leave-guard.test.mjs:97`, save-buttons :162 and harness 4037/4827 pin. Its cost is quota-plan :480.

All other points (A1-A8, A10, B1-B3, B6-B15) were verified against the lines cited above and taken.

### Questions for Jeff

- **JB3-1. J-B5's words above a remounted panel.**
  - Recommended: "These settings changed since this page loaded — it now shows the latest. Make your change again." Features adds "Enter the API key again." and Slack adds "Enter the webhook URL again."
  - The words are cleared by Back, by another card, or by that panel's next save that lands.
  - Alternative: the server's `STALE_ERROR`, which says "Reload the page".
- **JB3-2. The leave guard after a stale refusal.**
  - Recommended: J-B11's words, the "Save them" line hidden, Save shown only while something is still unsaved, Stay, and a neutral "Continue".
  - Alternative: keep the red "Discard changes and continue" label.
- **JB3-3. Connected apps.**
  - Recommended: read the settings prop like every other panel. Its two settings GETs go, and its own loading and error states go with the load.
  - Alternative: keep the self-fetch, with tokens from its own load. That needs a third token shape in S2 and S4.
- **JB3-4. Edit brand. This replaces J-B10's "optimistic" for Edit brand (STEP-B.md:192-195), which you already answered (critic B15).**
  - Recommended: handle the refusal inside the window. It takes the latest, re-seeds, says "The brand changed…" and stays open. The save is no longer optimistic, and the window cannot be closed while saving.
  - Alternative: keep J-B10 as answered (optimistic, keys-only rollback). Then a stale refusal remounts Quote templates, which also drops that panel's own unsaved templates.
- **JB3-5. Sales Manager's stale refusal.**
  - Recommended: take the latest, drop the refused draft, and show the banner `listChanged('commission tier' | 'SPIFF')`.
  - Leaving by the nav says J-B11's words. When something earlier in the same save landed, it says "Another change landed first — the page now shows the latest. That change was not saved; the ones saved before it stay saved.", and Save stays while a draft is left.
  - Alternative: J-B11's words always.
- **JB3-6. Save enabled while saving or clean** (CustomFields, FunnelStages chrome; FlatList :73).
  - Recommended: disable it (three one-line props).
  - Alternative: leave as is; JB3-10 already stops the double send.
- **JB3-7. Older defects in the lines B-3 rewrites.**
  - Recommended: fix all three:
    - (a) BlockTypes', JobTypes' and ProductTypes' Cancel leaves App's unsaved flag set;
    - (b) AdminView's Discard keeps the failure line into the next guard;
    - (c) `putSettings`' network failure is unchecked after a switch.
  - Alternative: file them.
- **JB3-8. Pipelines and Calendar, one save in flight.**
  - Recommended: a second change while one is out is refused with "The last change is still saving — try again in a moment."
  - Alternative: disable every control (9 callers in Pipelines, 3 in Calendar).
- **JB3-9. Split B-3 into three commits (critic B14). J-B1 (ANSWERS.md:77-79) set B-3 as one.**
  - Recommended: B-3a, the shell and every draft panel (~33 source files); B-3b, Pipelines, Calendar, Edit brand and Sales Manager (6); B-3c, Connected apps (2). Each has its own gates and browser check; the harness stays deferred to one run before any push.
  - Alternative: one commit (~37 source files, ~13 tests, 59 hand-proven entries).
- **JB3-10. "Save and continue" pressed while the panel's own save is still out (critic A3/B3).**
  - Today the second send would be refused by the first save, and J-B11 would falsely say "Your changes were not saved."
  - Recommended: every guarded save is `once(...)`, so a second save shares the first one's outcome (`SalesManagerTab.jsx:1040-1052` precedent). Cost: 24 declaration lines, quota-plan :480 re-pinned.
  - Alternative: file it, and accept that the words can be false in that case.

### Disagreements with STEP-B.md

1. **§4 "every catch calls the one named take-the-latest helper."** B-3's panels call `panelStale`, AdminView's one J-B5 handler, which calls `takeLatestSettings`. S4 learns that delegate by binding, and S4b proves the handler.
2. **§4 "a click-built save from the same render that read the list."** Pipelines and Calendar send `opened`, rebased by each landed save, with the gate held until the rebase renders. It is never newer than the render.
3. **§4 "Optimistic panels (Pipelines, Calendar, Edit brand)."** Edit brand stops being optimistic, which needs your word (JB3-4).
4. **§4 "Every other panel: AdminView remounts."** Sales Manager is not an AdminView panel (JB3-5), and Edit brand is handled in its window (JB3-4).
5. **§4 Features' org check "added".** It comes from moving onto the sender. The one gap left, the network throw, is the sender's own and is fixed there for every caller.
6. **§4/§5 leave out Train now's token** (`LeadScoringDetail.jsx:134`). It is added.
7. **§4 "nowhere outside saveSettings.js but the three named GETs."** One remains, `useSettings.js`, once B-3c lands.
8. **§2/J-B1 "B-3 every other screen" as one commit.** Three are proposed (JB3-9).

### Open questions (unverified; the design holds either way)

1. Whether React batches `takeLatestSettings`' copy update with the key bump. The copy is set first in either order.
2. Whether Clerk reissues `clerkUser` or `organization` mid-session (`App.jsx:555`). `opened` is safe either way.
3. Whether an org switch can happen while a guard dialog is open (z-index 99999).
4. Whether a click can land between a promise continuation's state updates and the next render. The `[opened]` release makes this moot for Pipelines and Calendar.
5. `saveAdminDrafts`' "landed" counts a `saveQuotas` that returned with nothing sent (`SalesManagerTab.jsx:1011-1014`).
6. PainPoints' crash on the seeded string default, not run in the browser.

---

**Summary for Jeff.** Right now, if you or another Admin change the same setting in two tabs, the last save quietly overwrites the first. B-2 fixed that for the Teams, Territories and Users screens. B-3 does it for every other settings screen, about 30 panels plus the Sales Manager's commission plan and SPIFF list.

When your save loses to a change that landed first:
- the screen reloads that panel with the latest values and says "These settings changed since this page loaded — it now shows the latest. Make your change again.";
- the "Unsaved changes" dialog says "Another change landed first… Your changes were not saved." instead of claiming your changes are still there;
- Pipelines and the Holidays calendar allow one change at a time while a save is out;
- the Brand window stays open and shows the latest brand;
- a typed API key is cleared, with a request to enter it again.

It also fixes a few older problems in the same lines: Cancel leaving a false "unsaved" warning, the dialog keeping an old error, the Train now button's next save being refused, and Connected apps fetching settings on its own.

About 37 source files and 13 test files change. I recommend three commits, each with its own browser check: the main panels first (~33 files), then Pipelines, Calendar, Brand and Sales Manager (6), then Connected apps (2). The long harness run stays deferred until all of them are in, as you decided.

## 5. Proof

- **Unit:** tests/settings-revs.test.mjs (new, SUITES) — every pure helper
  run; the PUT's order, compare, `.returning`, rename token, audit and answer
  pinned; each SQL guard pinned (the harness runs no integration test); the
  server writer scan; run cases of the sender with fetch stubbed (lands; stale
  then re-applied; stale then already there; stale twice; a 404 not retried;
  an org switch never settles) **(critic)**. Existing pins moved in the commit
  whose screens move them (team-membership :88, :97, member-profile-save
  r15-r17, settings-cascade-errors in B-2) **(critic)**.
- **Integration:** tests/integration/settings-revs.itest.mjs, its own orgs
  `itest_setrevs_A/B`; the test-database guard first and every repo module
  loaded by `await import()` after it — never a static import **(critic: a
  static import runs before the guard)**; org B byte for byte in every test.
  Cases: tokens answered; expected-absent; a stale token 409 with nothing
  written; three tabs; the put-back through a seam (proven to fail on the old
  code by hand); a stale teams save renaming no one; a removal then a stale
  save (409, not 404); the no-token retry; a first-save race; retired keys and
  seeds; the jobs; a real concurrent pair of PUTs (never two 200s) **(critic)**.
  The seam's in-between saves go through the real handler, so they bump tokens
  — a direct write would copy the old ones and prove nothing **(critic)**.
- **Harness:** each sub-step's entries proven caught by hand; anchors parsed
  against the tree before the scoped run; the scope sized with `--list`.
- **Browser** (Accelerep QA; Jeff signs in; Karen in every sub-step): B-1 —
  saves land as today, the GET shows tokens; B-2 — two tabs on Teams, the
  second refused and shown the latest; a rename in one tab, a stale save in
  the other refused with the holders keeping the new name **(critic)**; the
  profile move re-applied; B-3 — two tabs on a draft panel; the leave guard's
  words. Never a member deleted; never a hand-made settings PUT from the pane.
  The removal-then-stale case is proven by the integration suite only (a
  revoke sends email).

## 6. Questions for Jeff

**J-B1 — the split.** Recommended: three commits (B-1 server; B-2 the sender
and the people screens; B-3 every other screen), each with its own gates,
harness and browser check.

**J-B4 — what a refusal carries.** Recommended: the keys that moved and the
words; the screen re-reads settings once for the latest values and tokens
together. Alternative: the 409 carries the current values itself — a copy of
the GET's projection, which hands an Admin's screen the Slack webhook (DESIGN
said never) and re-pins four tests and nine harness entries.

**J-B15 — a save with no tokens that loses its own race** (an old tab, before
B-2/B-3 convert the screens). Recommended: retried on a fresh read, twice at
most, then 409 — keeps Q6's "accepted unchecked". Alternative: refused at once.

**The rest, each Recommended:** J-B2 keep the literal as text — its pins and
entries on not-sent halves still pass but prove nothing, said plainly, and the
Q15 pins re-pointed at the written-keys rule; J-B3 the old-row seed defect
fixed in the write; J-B5 AdminView remounts the open panel (its selection
resets); J-B6 Invite's second refusal "The invitations went out, but the team
list changed twice while saving and does not list them yet — reload; their
team is set on their row." and "no screen can put an invited member on a
team's list" filed; J-B7 the profile page keeps its owed move; J-B8 a window
closes on an edit, stays open on a new entry; J-B9 Train now's refusal words;
J-B10 rollbacks of the sent keys only; J-B11 the leave guard's words; J-B12 a
typed key cleared; J-B13 the restore mints every token; J-B14 ship B to prod
soon after dev — until then prod's old nightly job and integration requests
write the whole extra back, tokens included, so a token can go backwards
(where `JOBS_ENABLED` is on — read before the ship); a stale "already listed"
that sends nothing filed **(critic)**.
