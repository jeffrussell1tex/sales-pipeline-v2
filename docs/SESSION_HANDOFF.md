# SESSION_HANDOFF.md

**Session of 27 August 2026.** Repo root. Read this first, then verify every claim
in it against the live repo before acting — **including the claims in this file**.

**Fast staleness check:** does `docs/ACCELEREP_CODING_GUIDE.md` have **§18b24**, and
does `docs/ACCELEREP_CURRENT_STATE.md` have **§0.47**? If not, you are looking at a
copy that predates the previous session. Check section numbers, never dates.

**State at close:** SUPERSEDED MID-SESSION, 28 Aug — the §2 patch is applied,
gated (six gates · 276 tests · 26 integration · 80/80 mutations on a green
baseline) and committed together with the §4 doc edits. After-counts and the §4
follow-ons are the live work — see state doc §0.48. Full rewrite at session close.

---

## 1. What shipped — commit `77e119c`, on `dev`

**`currentUser` now comes from the roster row, not from Clerk.**

`App.jsx:95` derived `currentUser` from Clerk's `firstName + lastName`, falling
through to the **email address** when both were blank. Every ownership column
stores `users.name`. §0.26 recorded the consequence: a rep with no Clerk profile
name was called by her email in the browser and by her name on the server, so
`isRepVisible` showed her only unowned records and `useActivities.js:123` stamped
an email into `activities.author`.

Four lines of actual change, in `src/App.jsx` only:

- `:95` — the Clerk derivation is renamed `clerkName` and demoted to a fallback.
- `:104` — `window.clerkCurrentUser` removed from the role effect.
- After `} = uiState;` — `currentUser = myProfile?.name || clerkName` and
  `currentUserId = myProfile?.id || null`, declared there because `myProfile` is
  destructured from `uiState` immediately above (§18b0), plus a separate effect
  for the identity globals keyed on the values they mirror.
- `appContextValue` — `currentUserId` added. **Nothing consumes it yet.**

**Verified, not predicted.** Six gates green, 276 tests, build 2,459 kB. In the
browser on `accelerep.netlify.app`, signed in as Karen (the §0.26 rep):
`window.clerkCurrentUser` → `'Karen Russell'`, `window.clerkCurrentUserId` →
`'usr_e7e09733-2646-4aef-a1d3-3f636cebc667'`.

**What it does NOT fix.** Duplicate names. §0.37 found two `Jeff Russell` roster
rows in one org. `currentUser` is now the right name; if two people share it, it
is still the wrong identifier. Only ids close that.

---

## 2. Prepared but NOT applied — rep scoping on four GETs

`patch-get-scoping.mjs` (delivered to Jeff, not in the repo). Dry-run by default,
`--apply` to write, asserts every anchor and re-reads from disk afterward.

**The gap it closes.** `accounts.mjs:122`, `contacts.mjs:65`, `tasks.mjs:51` and
`activities.mjs:76` were each `db.select().from(t).where(eq(t.orgId, orgId))` and
nothing else — **every row in the org, to every caller.** `opportunities.mjs:188`
and `leads.mjs` filter; these four were the remainder. The client filter in
`App.jsx` was the only thing narrowing them, and a client filter is not a
boundary: a rep calling the endpoint directly received the whole company.

The patch adds the identical predicate `opportunities.mjs` uses:

```js
if (!canSeeAll(userRole)) {
    const callerId = await getCallerId(userId, orgId);
    results = results.filter(r => !r.ownerId || r.ownerId === callerId);
}
```

**Unassigned stays visible to everyone** — Jeff's explicit call, and it matches
the existing write policy (`mayMutate`: unowned records are mutable by any
writer). Admin and Manager return before the filter, so **only the rep path
changes**.

Also touched: two import lines gain a word — `canSeeAll` in `tasks.mjs`,
`getCallerId` in `tasks.mjs` and `activities.mjs`. **`npm test` is load-bearing
for that**: the function-import graph check lives there and nowhere else, and a
broken import edge passes the other five gates and fails the Netlify build
(§0.11).

**No manager branch, deliberately.** Copying `opportunities.mjs:197` would need
`ownerNameKeyFor(entity)`, and `_ownership.mjs:84` gives `account → accountOwner`
alone. The Edit Account modal writes `assignedRep`. A manager with `managedReps`
set would silently lose those accounts. That belongs with the rest of the
name-based migration (§0.39), not here.

**Verified only as far as a sandbox allows:** all seven anchors matched exactly
once against the uploaded copies, `node --check` passes on all four, CRLF
preserved. **Not run against the repo. Not gated. Not committed. Not tested in a
browser.**

### The browser check that proves it

Run **before and after** deploying, signed in as Karen:

```js
const t = await window.__getClerkToken();
for (const e of ['accounts','contacts','tasks','activities']) {
  const d = await (await fetch(`/.netlify/functions/${e}`, { headers: { Authorization: 'Bearer ' + t } })).json();
  console.log(e, (d[e] || []).length);
}
```

Measured before, as Karen: **accounts 142, tasks 27**. Contacts and activities
were not counted. Afterwards each should fall to her own rows plus unowned ones.
Then sign in as Admin and confirm the counts are **unchanged** — that is the
control proving `canSeeAll` still bypasses.

---

## 3. Decisions taken this session

- **Unassigned records are visible to everyone**, all entities. An earlier
  per-entity rule (reps hidden from unassigned deals/tasks/activities, shown
  unassigned accounts/contacts) was specified and then reversed. The reversal is
  the current instruction.
- **Security belongs on the server; the client gets a Mine/All toggle.** Agreed
  shape, not yet built — see §4.
- **Multi-role is dropped.** Not backlog, dropped.
- **Leads gets its own session** — the admin toggle for unassigned-lead
  visibility, the `settings.extra` key, both halves of `settings.mjs` and the
  filter change land together or not at all (§18b12: a key written and never read
  is not a feature).
- **No Python on this machine.** Patch scripts are Node from here on.
- **Files are delivered as generated**, not batched at session end. This
  supersedes `ACCELEREP_CURRENT_STATE.md` §10, which still says the opposite.

---

## 4. Next

**Apply and ship the GET scoping.** Run the patch, six gates, `npm test`, deploy,
run the before/after browser check above as a rep AND as Admin.

**Then: Mine/All toggle per tab.** Jeff's design, and it is the right one. It goes
in the existing chip row on each tab — the row that already reads
`All 142 · Hot · Warm · Cool · Needs reach` on Accounts — not a new UI surface.
Default is **Mine**. Once the server filters, "All" means "everything I am allowed
to see", which is correct for a rep and for an Admin, and the toggle is purely
convenience rather than a boundary. Open question: does the choice persist per tab
to `localStorage`, like sub-tabs do (style guide §10)? Note `TasksTab.jsx:370`
already has a `scope === 'mine'` branch — check whether a control exists before
building one.

**Then: delete the client-side visibility filters.** Once the server is the
boundary, `isRepVisible` (`App.jsx:609`) and its five call sites are redundant.
`ReportsTab.jsx:23` destructures it and — on a grep — never calls it. Removing
them ends the two-implementations-of-one-policy problem that produced §0.24,
§0.26, §0.30 and §0.36.

**Doc edits owed, and they should have ridden with commit 1 (§22):**

1. **Guide §17's ownership bullet is wrong.** It still says ownership is
   name-based and the `ownerId` migration is "in progress". It shipped. The same
   bullet lists `createdBy` as a contacts ownership column; `_ownership.mjs:86`
   says explicitly that column does not exist.
2. **Guide §17 needs the read-side policy** the GET patch creates: all six entity
   GETs rep-scoped on `ownerId`, unassigned visible to all, Admin/Manager bypass.
3. **Guide §14** lists `onConflictDoNothing()` in the POST bulk branch as still
   open; §0.3 of the bulk-insert batch says it was removed, not replaced.
4. **Guide §19** says push to `main`; the branches are `dev` and `master`. Same
   section says "run all six" and then "All five, plus `node --test`".
5. **State doc §9 Horizon** still lists "centralise the nine remaining ownership
   checks" — closed by §0.29/§0.34, which also corrected the count to ten.
6. **State doc §10** still says files are delivered at session end.

---

## 5. Found in passing, not fixed

- **A create can silently produce an unowned record.** An Admin-created task came
  back `ownerId: null`; two more created minutes later were stamped correctly.
  Not reproducible. `users.mjs:276–280` documents the mechanism — `callerCache`
  (`_lib.mjs:95`) caches a **miss** for 30 seconds keyed on
  `orgId::clerkUserId`, so a create landing in that window stamps null.
  `invalidateRoster` exists to close it. **First field instance; previously only
  a comment predicting one.**
- **`TasksTab.jsx:564`**: `const assignedTo = task.assignedTo || currentUser`.
  A task with no assignee renders as assigned to **whoever is looking at it**.
- **`App.jsx:639`** filters on `o.assignedTo`; opportunities has no such column
  (38 keys, confirmed from the API). That clause has never matched. Same at `:642`
  and `:646`, and `ModalLayer.jsx:1069`.
- **`App.jsx:657`** filters accounts on `accountOwner` alone. State doc line 3581
  says all owner logic must read `accountOwner || assignedRep`.
- **Two activity visibility rules disagree.** `App.jsx:672` filters on the linked
  opportunity's `salesRep` and shows every activity with no linked deal to
  everyone; `TasksTab.jsx:1147` filters on `a.author`. §16: views over the same
  data must agree.
- **`ReportsTab.jsx:2513` and `:5811`** send `ownerId: currentUser` — a display
  name. Harmless: `saved-reports.mjs:67` and `:78` spread `ownerId: userId` after
  the payload, so the client value is discarded and `assertOwner` compares Clerk
  id to Clerk id. Dead payload, not a bug. **§0.35's note that `savedReports` is
  a separate identity space is correct and the registry tripwire holds.**
- **`addAudit` (`App.jsx:330–332`)** sends `userId`/`userName`/`timestamp` that
  `audit-log.mjs` derives server-side and ignores (§0PP-a). Dead payload.
- **A rep sees a settings toast on unrelated tabs.** Karen, on the Accounts tab:
  *"Settings not saved — You do not have permission to make this change."* The
  `useSettings` auto-save PUTting to an Admin-only endpoint. Already carried
  forward as `useSettings.js:223`; it is no longer silent.
- **Quotes has no `ownerId` column.** `QuotesTab.jsx:1261–1269` filters on
  `q.createdBy` and `opp.salesRep`, both names. Quotes is not one of the six Tier
  1 tables, so it cannot move to ids without a schema change.

**Carried forward, unchanged:** `LeadImportModal.jsx:63–76` superseded matcher;
leads has no overwrite path; no end-to-end test across the six import modules;
bulk-import lead notification; the stray `dupes-jsx-attribute - Copy.jsx` fixture;
`scripts/check-clerk-roles.mjs` still never run against a live Clerk instance.

**Test debt, still the highest-value item:** `opportunities.mjs` and `tasks.mjs`
have **no integration file at all**, and `leads.itest.mjs` has no rep-role
ownership tests. The GET scoping in §2 lands with no automated coverage of any
kind, which makes the browser check the only evidence there is.

---

## 6. The thread

**A client-side filter is not a boundary, and treating one as though it were is
what produced most of this session.**

`tasks.mjs`, `contacts.mjs`, `accounts.mjs` and `activities.mjs` sent every row in
the org to every caller, and the browser hid them. That is not the same as
protecting them. Every disagreement found today — the two activity rules, the
`assignedTo` clause that matches nothing, accounts filtering on one of two owner
fields, §0.24 and §0.26 and §0.30 before them — exists because one policy has two
implementations and only one of them is enforced.

The end state is the one every mature CRM already has: **the server filters, the
client renders what it receives, and the client's only filtering job is
convenience.** Commit 1 gave the client a real identity. §2 makes the server the
boundary. The toggle in §4 is then a view control rather than a security control,
and the filters in §4's third item can be deleted rather than corrected.

**A process note worth keeping.** Four claims were asserted this session from
partial evidence and each was wrong: a Python patching convention that appears
nowhere in these docs, a commit that "didn't include the doc edits" when it did,
an ownership bug in `saved-reports.mjs` inferred from three documents that the
code refutes in two lines, and an unlinked Clerk id that the database shows is
linked. Every one would have been settled by reading one file. **Ask for the
file.** Round trips are cheap; a wrong finding stated confidently is not.
