#!/usr/bin/env node
/**
 * Doc edits riding with the GET-scoping commit: the six owed since 77e119c
 * (handoff §4), the §22 back-record of that commit, the tasks-GET horizon
 * closure, the NETLIFY_DATABASE_URL correction, and the new §0.48–§0.50 batch
 * entry carrying this batch's verified numbers.
 *
 *   node patch-docs.mjs           # dry run
 *   node patch-docs.mjs --apply   # writes
 *
 * The guide is CRLF on disk; the state doc and handoff are LF. Every anchor was
 * EXTRACTED from the repo copies, not typed, and carries its file's own EOL.
 * Each must match exactly once; a miss writes nothing (18b2). After writing,
 * every file is re-read FROM DISK and checked, including that its EOL
 * convention survived.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const APPLY = process.argv.includes('--apply');

const edits = [
  {
    "file": "docs/ACCELEREP_CODING_GUIDE.md",
    "eol": "CRLF",
    "changes": [
      {
        "old": "**Updated:** August 26, 2026 · rules current through **§18b24**.\r\n",
        "new": "**Updated:** August 28, 2026 · rules current through **§18b24**.\r\n"
      },
      {
        "old": "- **Ownership is name-based** (display names in `salesRep` / `accountOwner` / `createdBy` / `assignedTo` / `repName`), compared against `getCallerName(userId, orgId)` — which **fails closed** (null → caller owns nothing assigned). `orgId` is REQUIRED and throws when absent (§18b20.3); this line read `getCallerName(userId)` until 26 Aug, having been written before the identity split added the parameter. Known limitation: renames/duplicate names. The fix is `ownerId` columns and it is **in progress**, not post-launch — Phase 2, sequenced in SESSION_HANDOFF.md. **No endpoint calls this directly for object-level authorization any more**; they all go through `assertOwnership()` (§18b21).\r\n",
        "new": "- **Ownership keys on `ownerId`** — a `usr_<uuid>` app user id on all six Tier 1 tables (accounts, contacts, opportunities, tasks, leads, activities), stamped server-side on create from the caller's JWT and compared against `getCallerId(userId, orgId)` — which **fails closed** (null → the caller owns nothing assigned; unassigned records stay mutable by any writer). `orgId` is REQUIRED and throws when absent (§18b20.3). The display-name columns (`salesRep` / `accountOwner` / `assignedRep` / `assignedTo` / `author`) are retained for RENDERING AND RESOLUTION ONLY (`OWNER_NAME_COLUMNS` in `_ownership.mjs`); a name can no longer confer ownership, and there is deliberately no name-based policy function. **No endpoint performs object-level authorization directly** — writes go through `assertOwnership()` / `mayMutate()` (§18b21), which assert the identity space and refuse a wrong-space value loudly (§18b22).\r\n- **Read-side policy (GET scoping):** all six entity GETs are rep-scoped on `ownerId` — a rep receives their own rows plus unassigned ones (`!r.ownerId || r.ownerId === callerId`); Admin and Manager bypass via `canSeeAll` and receive the whole org. `opportunities.mjs` and `leads.mjs` filtered first; `accounts`, `contacts`, `tasks` and `activities` gained the identical predicate on 28 Aug — they previously returned EVERY row in the org to every caller, with only the client filter in `App.jsx` narrowing them, and a client filter is not a boundary. The manager `managedReps` branch exists only in `opportunities.mjs` and is still name-based (state doc §0.39) — deliberately not copied to the other five until that list moves to ids.\r\n"
      },
      {
        "old": "- `onConflictDoNothing()` in the POST bulk branch is **decorative**. The only unique\r\n  constraint is the `id` primary key and every id is a fresh `crypto.randomUUID()`\r\n  from `ModalLayer`, so it can never fire. The comment claims it \"skips duplicates\r\n  instead of erroring\"; nothing dedupes by name at insert time.\r\n",
        "new": "- ~~`onConflictDoNothing()` in the POST bulk branch~~ — **removed, not replaced**\r\n  (§0.3 of the bulk-insert batch). It could never fire: the only unique constraint\r\n  is the `id` primary key and every id is a fresh `crypto.randomUUID()` from\r\n  `ModalLayer`. Name-based dedupe stays with the smart-merge tooling; nothing\r\n  dedupes by name at insert time, deliberately.\r\n"
      },
      {
        "old": "All five, plus `node --test`, run in CI on every push and PR via the `gates` job in\r\n",
        "new": "All six run in CI on every push and PR via the `gates` job in\r\n"
      },
      {
        "old": "- **Deploy:** Git push to `main` branch → Netlify auto-deploys\r\n",
        "new": "- **Deploy:** Git push to `dev` → `accelerep.netlify.app`; smoke test, then merge `dev` → `master` → `salespipelinetracker.com` (production). Netlify auto-deploys both. There is no `main` branch.\r\n"
      },
      {
        "old": "  - `NEON_DATABASE_URL` (auto-injected by Netlify Neon integration)\r\n",
        "new": "  - `NETLIFY_DATABASE_URL` (auto-injected by Netlify Neon integration; the local `.env` uses the same name — this line said `NEON_DATABASE_URL` until 28 Aug, which was wrong)\r\n"
      }
    ],
    "expectPresent": [
      "Ownership keys on `ownerId`",
      "Read-side policy (GET scoping)",
      "removed, not replaced",
      "All six run in CI",
      "Git push to `dev`",
      "NETLIFY_DATABASE_URL",
      "**Updated:** August 28, 2026"
    ],
    "expectAbsent": [
      "Ownership is name-based",
      "is **decorative**. The only unique",
      "All five, plus",
      "Git push to `main` branch",
      "`NEON_DATABASE_URL` (auto-injected"
    ]
  },
  {
    "file": "docs/ACCELEREP_CURRENT_STATE.md",
    "eol": "LF",
    "changes": [
      {
        "old": "**Updated:** August 26, 2026 (third batch)  \n",
        "new": "**Updated:** August 28, 2026\n"
      },
      {
        "old": "**Verified at:** all six gates green · **276 tests** · **26 integration tests** · **80/80 mutations caught, ON A VERIFIED GREEN BASELINE** · **rep path verified in the browser as a rep, not an Admin** · all 66 functions bundle under esbuild  \n**Batch:** ",
        "new": "**Verified at:** all six gates green · **276 tests** · **26 integration tests** · **80/80 mutations caught, ON A VERIFIED GREEN BASELINE** · build 2,459 kB · before-counts captured on dev for BOTH roles · **after-counts pending deploy** — the browser check in §0.50 is the only runtime evidence for this batch\n**Batch:** **the server is now the boundary on reads** — `accounts`, `contacts`, `tasks` and `activities` GETs were `db.select().where(eq(orgId))` and nothing else, EVERY row in the org to every caller, with only the client filter narrowing them · all four now rep-scoped on `ownerId` (own + unassigned; Admin/Manager bypass), the identical predicate `opportunities.mjs` and `leads.mjs` already used · **commit `77e119c` recorded: `currentUser` comes from the roster row, not Clerk** (§0.26 closed — recorded only in the handoff until now) · the doc corrections owed since that commit · guide §17 rewritten for id-based ownership + the read-side policy · guide §19 branches/env-var corrected\n**Prior batch:** "
      },
      {
        "old": "## 0. Latest Batch — One Role Vocabulary, And A Gate That Allows Instead Of Denies\n",
        "new": "## 0. Latest Batch — The Server Becomes The Boundary On Reads\n\n> Four GETs sent every row in the org to every caller, and the browser hid them.\n> That is not the same as protecting them. This batch gives accounts, contacts,\n> tasks and activities the same rep scoping opportunities and leads already had,\n> and back-records the commit that made the client's identity real.\n\n### 0.48 What shipped\n\n- **Rep scoping on the four unscoped GETs.** `accounts.mjs`, `contacts.mjs`,\n  `tasks.mjs` and `activities.mjs` each ran\n  `db.select().from(t).where(eq(t.orgId, orgId))` and nothing else. Each now\n  applies the identical predicate `opportunities.mjs` uses:\n  `!r.ownerId || r.ownerId === callerId`, with `canSeeAll(userRole)` returning\n  before the filter — Admin and Manager are untouched; only the rep path changes.\n- **Unassigned stays visible to everyone** — Jeff's explicit call, matching the\n  write policy (`mayMutate`: unowned records are mutable by any writer). Note the\n  `ZZFX Other Rep` fixture rows carry `ownerId: null` (the name matched no roster\n  row at backfill, §0.38), so they are unassigned-and-visible by policy — an\n  after-count that does not drop as far as intuition expects is not a failure.\n- **A caller that cannot be resolved sees only unassigned rows** — a null\n  `getCallerId` fails closed, the same direction `mayMutate()` takes on writes.\n- **No manager branch, deliberately.** The `managedReps` filter in\n  `opportunities.mjs` is name-based (§0.39); copying it here would need\n  `ownerNameKeyFor(entity)`, and `_ownership.mjs` maps `account → accountOwner`\n  alone while the Edit Account modal writes `assignedRep` — a manager would\n  silently lose those accounts. It moves with the name-based migration, not here.\n- Two import lines gained a word: `canSeeAll` into `tasks.mjs`, `getCallerId`\n  into `tasks.mjs` and `activities.mjs`. The function-import graph check inside\n  `npm test` is the only gate that proves those edges resolve (§0.11).\n\n### 0.49 Commit `77e119c`, recorded — `currentUser` comes from the roster row\n\nShipped 26 Aug and recorded only in `SESSION_HANDOFF.md` until now — a §22\nviolation, owed and paid here. `App.jsx:95` derived `currentUser` from Clerk's\n`firstName + lastName`, falling through to the EMAIL ADDRESS when both were\nblank, while every ownership column stores `users.name` — §0.26's split\nidentity. Now: `currentUser = myProfile?.name || clerkName` and\n`currentUserId = myProfile?.id || null`, from the `?me=true` roster row that\nalready self-heals drift; the Clerk derivation survives only as the fallback for\na user with no roster row. `currentUserId` rides `appContextValue` and nothing\nconsumes it yet. Verified in the browser as Karen: `window.clerkCurrentUser` →\n`'Karen Russell'`, `window.clerkCurrentUserId` → `'usr_e7e09733-…'`. Does NOT\nfix duplicate names (§0.37) — only ids close that.\n\n### 0.50 Verified — and what still is not\n\nAll six gates green · 276 tests · 26 integration tests · **80/80 mutations\ncaught on a printed green baseline** · build 2,459 kB. Two greens carry the\nbatch: the §18b23 class guard (`callerId` is only ever compared against\n`.ownerId`) passes over the four new filter lines, and the function-import test\nproves the three new edges — the one failure mode that passes every other gate\nand dies at the Netlify deploy.\n\nBefore-counts captured on dev, BOTH roles, before deploy — Karen AND Admin each\nreceived the full org: **accounts 144 · contacts 1534 · tasks 28 ·\nactivities 23**. Identical numbers for a rep and an Admin is what \"no scoping\"\nlooks like, and is the baseline the after-check compares against.\n\n**NOT yet verified: the after-counts.** Post-deploy, Karen's four counts must\nfall to her own rows plus unassigned ones, and Admin's must stay EXACTLY at the\nnumbers above — the control proving `canSeeAll` still bypasses. The GET scoping\nlands with no automated rep-role coverage for these four endpoints (the §0.33\ntest debt stands), so the browser check is the only runtime evidence there is.\n\n---\n\n## 0P0. Prior Batch — One Role Vocabulary, And A Gate That Allows Instead Of Denies\n"
      },
      {
        "old": "**Centralise the nine remaining ownership checks** on `assertOwnership`. Not\nbroken, but each is an independent chance to name the wrong column.\n",
        "new": "~~**Centralise the nine remaining ownership checks**~~ **DONE** — closed by\n§0.29/§0.34, which also corrected the count: it was ten, verified by reading.\n"
      },
      {
        "old": "**`tasks.mjs` GET has no rep scoping** — it selects by `orgId` alone, unlike\nleads and opportunities, so every rep sees every task in the org (13 distinct\nowners were visible to one rep). Mutation is still gated, so this is visibility,\nnot a write hole. Contacts GET is likewise unscoped, plausibly deliberately.\nDecide whether either is intended.\n",
        "new": "~~**`tasks.mjs` GET has no rep scoping**~~ **DONE** — decided and closed by the\nGET-scoping batch (§0.48): accounts, contacts, tasks and activities are all\nrep-scoped on `ownerId` now, the same predicate as leads and opportunities.\nUnassigned rows stay visible to everyone — the policy, not a gap.\n"
      },
      {
        "old": "- All modified files delivered together at session end, not piecemeal\n",
        "new": "- Files are delivered as they are generated, not batched at session end (Jeff's standing directive, 26 Aug 2026)\n"
      }
    ],
    "expectPresent": [
      "### 0.48 What shipped",
      "### 0.49 Commit `77e119c`, recorded",
      "### 0.50 Verified — and what still is not",
      "## 0P0. Prior Batch — One Role Vocabulary",
      "the server is now the boundary on reads",
      "accounts 144 · contacts 1534",
      "delivered as they are generated",
      "~~**Centralise the nine remaining ownership checks**~~ **DONE**",
      "~~**`tasks.mjs` GET has no rep scoping**~~ **DONE**",
      "### 0.47 Also found, not fixed here"
    ],
    "expectAbsent": [
      "## 0. Latest Batch — One Role Vocabulary",
      "delivered together at session end",
      "August 26, 2026 (third batch)"
    ]
  },
  {
    "file": "docs/SESSION_HANDOFF.md",
    "eol": "LF",
    "changes": [
      {
        "old": "**State at close:** one commit shipped and verified. One patch written, tested\nagainst uploaded copies, **not applied and not committed**. Doc edits outstanding.\n",
        "new": "**State at close:** SUPERSEDED MID-SESSION, 28 Aug — the §2 patch is applied,\ngated (six gates · 276 tests · 26 integration · 80/80 mutations on a green\nbaseline) and committed together with the §4 doc edits. After-counts and the §4\nfollow-ons are the live work — see state doc §0.48. Full rewrite at session close.\n"
      }
    ],
    "expectPresent": [
      "SUPERSEDED MID-SESSION, 28 Aug"
    ],
    "expectAbsent": [
      "**not applied and not committed**"
    ]
  }
];

let failed = false;
const staged = [];

for (const edit of edits) {
    if (!existsSync(edit.file)) {
        console.error('FAIL ' + edit.file + ' — not found. Run from the repo root.');
        failed = true;
        continue;
    }
    let src = readFileSync(edit.file, 'utf8');
    const hadCRLF = src.includes('\r\n');
    if ((edit.eol === 'CRLF') !== hadCRLF) {
        console.error('FAIL ' + edit.file + ' — expected ' + edit.eol + ' on disk and found the opposite. Anchors cannot match; nothing written.');
        failed = true;
        continue;
    }
    let ok = true;
    for (const [i, ch] of edit.changes.entries()) {
        const n = src.split(ch.old).length - 1;
        if (n !== 1) {
            console.error('FAIL ' + edit.file + ' — anchor ' + (i + 1) + ' matched ' + n + ' times, expected 1.');
            ok = false;
            failed = true;
            break;
        }
        src = src.replace(ch.old, ch.new);
    }
    if (!ok) continue;
    staged.push({ file: edit.file, src, edit });
    console.log('  ok   ' + edit.file + ' — ' + edit.changes.length + ' anchor(s) matched');
}

if (failed) {
    console.error('\nNothing written. Fix the anchors and re-run.');
    process.exit(1);
}

if (!APPLY) {
    console.log('\nDry run. All anchors matched. Re-run with --apply to write.');
    process.exit(0);
}

// Write once, at the end.
for (const { file, src } of staged) writeFileSync(file, src, 'utf8');

// Then re-read FROM DISK and prove it (18b2).
console.log('\nVerifying on disk:');
let verifyFailed = false;
for (const { file, edit } of staged) {
    const onDisk = readFileSync(file, 'utf8');
    for (const s of edit.expectPresent) {
        if (!onDisk.includes(s)) { console.error('  MISSING in ' + file + ': ' + s); verifyFailed = true; }
    }
    for (const s of edit.expectAbsent) {
        if (onDisk.includes(s)) { console.error('  STILL PRESENT in ' + file + ': ' + s); verifyFailed = true; }
    }
    const hasCRLF = onDisk.includes('\r\n');
    if ((edit.eol === 'CRLF') !== hasCRLF) { console.error('  EOL CONVENTION LOST in ' + file + ' (expected ' + edit.eol + ')'); verifyFailed = true; }
    console.log('  verified ' + file + ' (' + edit.eol + ' preserved)');
}

if (verifyFailed) {
    console.error('\nVERIFICATION FAILED — the files on disk are not what was intended.');
    process.exit(1);
}

console.log('\nDone. Review with: git --no-pager diff --stat — then stage the four endpoints + three docs as ONE commit.');
