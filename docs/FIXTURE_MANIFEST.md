# ZZFX Fixture Org — Manifest & Delete-Gate Procedure

> **STATUS — 24 Aug 2026: the gate has been run in full and PASSED.**
> Six 403s split correctly across the two checks, three 200s, the Admin half
> clean, and step 15 confirmed the child-promotion defect with before/after
> evidence. Six further defects surfaced during the run, all on the rep path —
> see §0.23–§0.26 in ACCELEREP_CURRENT_STATE.md.
>
> **This fixture is now spent.** Step 15 is one-way (the Ashgrove children are
> orphaned) and steps 12–16 deleted their own subjects. Regenerate into a clean
> org before re-running:
> `node scripts/make-fixtures.mjs --rep="<exact users.name>"`
>
> Corrections made to this document after the run are marked
> **CORRECTED 24 Aug** — three claims here were written from reading one side of
> a call chain and were wrong.

Companion to `make-fixtures.mjs`. Generated CSVs: `ZZFX-accounts.csv`,
`ZZFX-contacts.csv`, `ZZFX-opportunities.csv`, `ZZFX-leads.csv`.

Every claim below was verified against `dev` @ `361fee4` by reading the endpoint,
not by reading the docs. Line references are to that commit.

---

## Why this fixture exists

`SESSION_HANDOFF.md` §3a: the delete gate cannot run because the rep account owns
no opportunities. This builds ownership coverage **by construction** instead of
hoping the ad-hoc ZZTest rows happen to provide it.

### The thing the gate actually has to distinguish

For opportunities, accounts and leads the DELETE branch runs **two** checks, in
this order (`opportunities.mjs:428–441`, `accounts.mjs:222–240`, `leads.mjs:196–209`):

1. **Ownership** — skipped entirely for Admin/Manager. For a rep, a record owned
   by someone else returns
   `403 {"error":"Forbidden: you can only modify your own or unassigned records"}`
2. **Admin role gate** — `requireRole(auth, ['Admin'])`, returns
   `403 {"error":"Forbidden: insufficient role"}`

**Both are 403.** A status code alone cannot tell them apart, and only the second
one is the gate under test. A rep hitting someone else's record gets refused at
step 1 and never reaches step 2 — which is exactly the false pass this fixture is
built to prevent. **Read the error string on every refusal, not just the status.**

That is why the rep must own her subjects: ownership has to *pass* so the Admin
gate is the thing doing the refusing.

---

## Step 0 — Preconditions

Nothing downstream means anything until all three pass.

### 0.1 Read the rep's exact `users.name`

Ownership compares `salesRep` / `accountOwner` / `assignedTo` against
`getCallerName(userId)`, which reads exactly one column — `users.name` for the
caller's Clerk user id (`_lib.mjs:65–79`). Not the Clerk display name, not the
email. Signed in as **Admin**, in the DevTools console:

```js
const auth = async () => ({ Authorization: `Bearer ${await window.Clerk.session.getToken()}` });
const r = await fetch('/.netlify/functions/users', { headers: await auth() });
const { users } = await r.json();
console.table(users.map(u => ({ id: u.id, name: u.name, email: u.email, role: u.role })));
```

Read-only. Copy the `name` value for the rep account **verbatim** — trailing
spaces, middle initials, accents and all.

**PASS:** you have an exact string. **FAIL:** the row is missing → the rep has
never synced into the mirror; run `users-sync?check=true` (dry run, no writes)
before going further.

### 0.2 Confirm the rep's role is `User`, not `Technician`

This is the trap that would waste the whole session. `requireWrite`
(`auth.mjs:129–147`) denies **Technician on every mutating method, for every CRM
endpoint**, before any handler logic. A Technician gets
`403 {"error":"Forbidden: technicians may only update their own assigned jobs"}`
on all six entities — so the 403-half would "pass" for the wrong reason and the
200-half could not pass at all.

The value that governs this is **Clerk `publicMetadata.role`** (`auth.mjs:71`),
**not** the `users.role` column — handoff §4 records those two disagreeing on
your own account. Check it in the Clerk dashboard, on the rep's user, under
public metadata.

**PASS:** `publicMetadata.role === "User"`. **FAIL:** anything else — fix it in
Clerk before proceeding, and allow ~30s for the `verifyAuth` cache to expire.

### 0.3 Generate the CSVs

```bash
node make-fixtures.mjs --rep="<exact users.name from 0.1>"
```

The script refuses to run without `--rep`. **PASS:** four CSVs written, and the
summary line echoes the rep name you expect.

---

## Step 1–4 — Import, in this order

Import as **Admin**, into the new org. Order matters: opportunities reference
accounts by name, and contacts reference companies by name.

| Step | File | Importer | Expected result |
|---|---|---|---|
| 1 | `ZZFX-accounts.csv` | Settings → Data → Import, type **Accounts** | 10 rows in, **10 created**, 0 skipped |
| 2 | `ZZFX-contacts.csv` | type **Contacts** | 9 rows in, **8 created**; Preview shows *"1 of 9 rows will be skipped — required fields are empty (rows 10)"* |
| 3 | `ZZFX-opportunities.csv` | type **Opportunities** | 10 rows in, **10 created** |
| 4 | `ZZFX-leads.csv` | Leads tab → **↗ Import** | **6 added**, 0 skipped |

Notes on each:

- **Step 1** — every header auto-maps at confidence ≥ 0.9, so no mapping bar
  should render a warning. `ZZFX Ashgrove North` and `ZZFX Ashgrove South` must
  come out as **sub-accounts** of `ZZFX Ashgrove Holdings`: `ModalLayer.jsx:489–507`
  imports parents first and resolves `parentAccountId` by name within the file.
  `ZZFX Fenwick Group` carries a markdown-wrapped URL to exercise `cleanWebsite`
  — it should land as a bare `https://…`, brackets stripped.
- **Step 2** — the dropped row is deliberate. Row 10 has no first or last name.
  **If the Preview does not name it, §0.6 has regressed** (silent drop). Row 8
  (`Sunniva`, no last name) must **survive**: `mapCsvRows` uses `.some`, not
  `.every`.
- **Step 3** — `daysInStage` is transport-only, never a column. `ZZFX Beacon
  Trial` leaves it blank on purpose (the fourth stage-clock case).
- **Step 4** — CORRECTED 24 Aug. This originally said the leads importer sends
  one request per row. It does not: `ModalLayer.jsx` sends the whole array in a
  single POST, and `leads.mjs` had no `Array.isArray` branch, so **every leads
  import returned 400 before touching the database** — the feature had never
  worked. Fixed in §0.23; the endpoint now has the same bulk branch as accounts
  and contacts. The original claim was inferred from the endpoint without
  reading the caller. Left visible here as a reminder that half a chain read is
  not a reading. Formerly: one request
  per row. Fine at 6; do not scale this file up.

**PASS:** all four counts match, and each receipt reports the server's numbers.
**FAIL:** any count differs → stop and diagnose before touching the gate.

---

## Step 5 — The visibility check that unblocks §3a

**Sign in as the rep.** In the console:

```js
const auth = async () => ({ Authorization: `Bearer ${await window.Clerk.session.getToken()}` });
const opps  = await (await fetch('/.netlify/functions/opportunities', { headers: await auth() })).json();
const leads = await (await fetch('/.netlify/functions/leads',         { headers: await auth() })).json();
const accts = await (await fetch('/.netlify/functions/accounts',      { headers: await auth() })).json();
console.log('opps', opps.opportunities.length, 'leads', leads.leads.length, 'accounts', accts.accounts.length);
```

| Entity | Expected | Why |
|---|---|---|
| opportunities | **8** of 10 | `opportunities.mjs:147–157` filters to `!salesRep \|\| salesRep === callerName`. Dovetail and Granite are the other rep's. |
| leads | **5** of 6 | `leads.mjs:68–77`, same rule. 3 rep-owned + 2 unassigned; Yuki Tanabe is the other rep's. |
| accounts | **10** of 10 | Accounts GET has **no rep scoping at all** (`accounts.mjs`, GET branch). |

**PASS:** 8 / 5 / 10.
**FAIL — 0 opportunities:** the name does not match `users.name`. Do not continue;
regenerate from step 0.1. This is the exact failure §3a is about, and it is silent
in every other respect.
**FAIL — 10 opportunities:** the rep is resolving as Admin or Manager
(`canSeeAll`), so the role is wrong. Back to step 0.2.

---

## Step 6–11 — The 403 half (must all refuse)

**The token trap, from the handoff, and it cost two attempts last session:** Clerk
session tokens expire in about a minute. A stale token returns **401**, and three
401s look exactly like three refusals. Fetch the token *inside every call* — the
`auth()` helper above does this. **Only 403 counts, and only with the right
message.**

Use this helper so the message is always printed:

```js
const del = async (fn, id) => {
  const r = await fetch(`/.netlify/functions/${fn}?id=${id}`, { method: 'DELETE', headers: await auth() });
  console.log(fn, r.status, await r.text());
};
```

Run every one of these **as the rep**. Ids for the other-rep records are not
visible to her — read them from an Admin session and paste them in.

| Step | Subject | Owner | Expected |
|---|---|---|---|
| 6 | opportunity `ZZFX Beacon Trial` | rep | **403** · `insufficient role` |
| 7 | opportunity `ZZFX Dovetail Upgrade` | other rep | **403** · `you can only modify your own or unassigned records` |
| 8 | account `ZZFX Beacon Metals` | rep | **403** · `insufficient role` |
| 9 | account `ZZFX Cinder Logistics` | *unassigned* | **403** · `insufficient role` |
| 10 | lead `Ivo Karlsen` | rep | **403** · `insufficient role` |
| 11 | lead `Yuki Tanabe` | other rep | **403** · `you can only modify your own or unassigned records` |

Steps 6, 8, 9 and 10 are the actual gate: ownership passes, so the refusal can
only be coming from `requireRole`. Steps 7 and 11 exist to prove the two refusals
are distinguishable — **if step 7 returns `insufficient role`, the ownership check
is not running and steps 6/8/10 prove less than they appear to.** Step 9 proves
the gate holds on a record nobody owns, which is the case ownership can never
cover.

**PASS:** six 403s, messages exactly as tabulated.
**FAIL — any 200:** the Admin gate is not applied on that entity. Stop; that is a
shipped authorization hole.
**FAIL — any 401:** stale token. Re-run that row; do not record it.
**FAIL — any 404:** the id was wrong or belongs to another org.

---

## Step 12–14 — The 200 half (must all succeed)

Three 403s alone are indistinguishable from delete being broken for everyone.
These are what make them mean something. Still **as the rep**.

**Step 12 — contact `Emeka Obi` → expect 200.**
Owner is null on every imported contact, the ownership check passes, and there is
no Admin gate on contacts. The cleanest positive subject in the fixture.

> CORRECTED 24 Aug. This originally reasoned that `sanitize()` has no `createdBy`
> key so the owner is simply always null. The truth was worse: **`createdBy` is
> not a column on the contacts table at all** — the owner column is
> `assignedRep`. `db.select({ owner: undefined })` threw, so this step returned
> **500**, and the same wrong name in the bulk PUT made that path fail OPEN,
> letting any rep overwrite every contact in the org. See §0.24. Ownership now
> resolves through the registry in `_ownership.mjs`, which throws by name rather
> than degrading to `undefined`.

**Step 13 — task → expect 200.** No CSV importer exists for tasks. As the rep,
create a task in the app assigned to herself (`ZZFX Rep Task`), then DELETE it by
id.

**Step 14 — activity → expect 200.** Same: log an activity as the rep against any
visible record, then DELETE it by id. Ownership is `activities.author`.

> CORRECTED 24 Aug. `activities.mjs` selected `activities.repName`, which is not
> a column either — the ownership registry guard caught it on its first run,
> before this step was reached. It would have produced a 500 identical to step
> 12's and looked like the same bug recurring. See §0.24.

**PASS:** three 200s. **FAIL — a 403 on step 12:** something now writes
`createdBy`; re-read the endpoint before assuming the gate is wrong. **FAIL — a
403 on 13 or 14:** the record was assigned to someone else; check `assignedTo` /
`author` matches `users.name` exactly. Note that anything the rep CREATES is
stamped with the client's `currentUser`, which is derived from Clerk's
first + last name and falls back to the EMAIL when those are blank — while the
server compares against `users.name`. A rep whose Clerk profile has no name will
therefore author records the server refuses to let them delete, and the 403 will
look exactly like the gate working. See §0.26.

---

## Step 15 — Evidence for the known child-promotion defect

Do this **last** among the account refusals: it is one-way for the fixture data.

`accounts.mjs:230–240` runs the child-promotion `UPDATE` **before** the Admin role
gate. A refused delete therefore still detaches the children, permanently, with no
audit record — because the audit is written after the gate the request never
passes.

1. As **Admin**, record the current `parentAccountId` of `ZZFX Ashgrove North` and
   `ZZFX Ashgrove South` (both should be the id of `ZZFX Ashgrove Holdings`).
2. As the **rep**, `DELETE /accounts?id=<ZZFX Ashgrove Holdings>`.
   Expected: **403 · insufficient role** — the parent still exists.
3. As **Admin**, re-read both children.

### RESULT — 24 Aug 2026: DEFECT CONFIRMED

Run against `accelerep.netlify.app`, rep account Karen Russell.

**Before**

```json
[{ "name": "ZZFX Ashgrove Holdings", "id": "995b97c6-…", "parent": null },
 { "name": "ZZFX Ashgrove North",    "parent": "995b97c6-…" },
 { "name": "ZZFX Ashgrove South",    "parent": "995b97c6-…" }]
```

**The refusal**

```
accounts 403 {"error":"Forbidden: insufficient role"}
```

**After**

```json
[{ "name": "ZZFX Ashgrove Holdings", "parent": null },
 { "name": "ZZFX Ashgrove North",    "parent": null },
 { "name": "ZZFX Ashgrove South",    "parent": null }]
```

The delete was refused and both children were detached anyway. No audit record
for the event — `writeAudit` sits after the gate the request never passed.

So a rep who lacks permission to delete an account can still permanently flatten
its entire sub-account hierarchy simply by attempting it. The account survives;
the structure does not; nothing records that it happened; and the parent ids are
gone, so it is not recoverable from the row itself.

**Fix (not yet applied):** move the promotion `UPDATE` below `requireRole` in
`accounts.mjs:230–240`. Two lines, but it wants its own commit and an integration
test asserting the children survive a refused delete —
`tests/integration/contacts.itest.mjs` is the template, and the `x-test-role`
header added to the auth stub makes the rep-role case straightforward to write.

**Re-running this step needs fresh fixture data.** It is one-way: the Ashgrove
children are now orphaned, so a second run would start from a flat hierarchy and
prove nothing. Regenerate with `node scripts/make-fixtures.mjs --rep="…"` into a
clean org before retesting the fix.

---

## Step 16 — Admin half

As **Admin**, confirm the gate refuses *only* non-Admins and that deletion is
audited.

| Step | Action | Expected |
|---|---|---|
| 16a | DELETE opportunity `ZZFX Fenwick Pilot` | 200 |
| 16b | DELETE account `ZZFX Elmwood Foods` | 200 |
| 16c | DELETE lead `Mattias Holm` | 200 |
| 16d | DELETE opportunity with a made-up uuid | **404**, not `success: true` |
| 16e | Settings → Audit | three deletion records, each carrying a **name snapshot**, not just an id |

**Never use `clear=true` at any point in this procedure.** It is Admin-gated and
it works — that is precisely the problem. The wipe incident originated in a
`?clear=true` run described as a test.

---

## Record-by-record index

### Accounts (10)

| Record | Owner | Serves |
|---|---|---|
| ZZFX Ashgrove Holdings | rep | Step 15 parent — child-promotion defect |
| ZZFX Ashgrove North | rep | Step 15 child |
| ZZFX Ashgrove South | rep | Step 15 child |
| ZZFX Beacon Metals | rep | Step 8 — rep-owned refusal |
| ZZFX Cinder Logistics | *none* | Step 9 — unassigned refusal |
| ZZFX Dovetail Systems | other | ownership-403 spare |
| ZZFX Elmwood Foods | rep | Step 16b — Admin 200 + audit |
| ZZFX Fenwick Group | *none* | `cleanWebsite` markdown-unwrap probe |
| ZZFX Granite Partners | other | other-rep opportunity parent |
| ZZFX Harborline Marine | rep | spare |

### Contacts (9 rows → 8 records)

| Record | Serves |
|---|---|
| Marisol Trent … Noor Haddad (6) | general coverage, account linkage by company name |
| Sunniva *(no last name)* | `.some` required-field rule — **must survive** |
| Emeka Obi | Step 12 — rep-level delete, expect 200 |
| *(unnamed row 10)* | **must be dropped and reported** at Preview |

### Opportunities (10)

| Record | Owner | Serves |
|---|---|---|
| ZZFX Ashgrove Renewal | rep | close 2026-11-15 — fiscal-quarter probe |
| ZZFX Beacon Expansion | rep | close 2027-01-10 — fiscal-quarter probe |
| ZZFX Cinder New Logo | rep | 21 days in stage — stage-clock |
| ZZFX Dovetail Upgrade | other | Step 7 — ownership-403, invisible to rep |
| ZZFX Elmwood Refresh | rep | Closed Won |
| ZZFX Fenwick Pilot | rep | **no close date** (§0.8) + Step 16a |
| ZZFX Granite Retrofit | other | visibility check — must not appear for rep |
| ZZFX Harborline Service | rep | second 2026-11-15 probe |
| ZZFX Ashgrove Support | rep | second 2027-01-10 probe |
| ZZFX Beacon Trial | rep | **blank Days in Stage** + Step 6 |

### Leads (6)

| Record | Owner | Serves |
|---|---|---|
| Ivo Karlsen | rep | Step 10 — rep-owned refusal |
| Lena Fournier, Kwame Boateng | rep | visibility count |
| Yuki Tanabe | other | Step 11 — ownership-403, invisible to rep |
| Rosa Delacroix | *none* | unassigned-but-visible |
| Mattias Holm | *none* | Step 16c — Admin 200 + audit |

---

## Secondary coverage this fixture also gives you

Not part of the gate; run them while the data is fresh.

**The empty-org defaults path.** A brand-new org has no `settings` row, which
nothing has ever tested. `ZZFX Ashgrove Renewal` and `ZZFX Harborline Service`
both close **2026-11-15**; `ZZFX Beacon Expansion` and `ZZFX Ashgrove Support`
both close **2027-01-10**. With no `fiscalYearStart` saved, `ListView.jsx:349`
falls back to `|| 1` and the other twelve sites fall back to `|| 10`, so the same
deal should carry **different quarter labels in the Pipeline list than on Home and
in Reports**. If you see that, handoff §4's `fiscalStart` item is confirmed in the
field.

**Stage clock.** Days in Stage of 12 / 3 / 21 / 30 / 8 / 14 / 6 / 2 / blank across
the file — the §0.22 two-pass backfill should leave every row's
`stageChangedDate` and `stageHistory` intact, including the untouched ones.

**Undated deals.** `ZZFX Fenwick Pilot` has no close date and must still appear in
the Pipeline list.

---

## Two gaps you should know about before running this

**1. An unassigned *opportunity* cannot be created by import.**
`importRows.js:104` does `merged.salesRep = merged.salesRep || currentUser`, so a
blank Sales Rep column becomes whoever ran the import — an Admin-owned deal, not
an unowned one. The unassigned-owner case is therefore covered by accounts
(Cinder) and leads (Rosa, Mattias) only. Accounts and leads have no equivalent
default, which is why they can.

**2. The leads importer never adopted the fixed matcher.**
`csvAutoMap.js` was written to replace first-match-wins substring matching, and
`CsvImportModal` uses it. `LeadImportModal.jsx:63–76` still runs the old
`headers.findIndex` with bidirectional `includes` — all three faults the module
docblock describes, including dishonest confidence (it renders no confidence at
all). The headers in `ZZFX-leads.csv` were verified against that old matcher
specifically, so this file is safe; an arbitrary leads CSV is not. Worth its own
small commit: point `LeadImportModal` at `autoMapHeaders` and delete the local
matcher.
