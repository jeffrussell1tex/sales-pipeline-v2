#!/usr/bin/env node
/**
 * Mine/All scoping cleanup — the client stops re-implementing the server's
 * read boundary. TasksTab: Mine/Team → Mine/All, ownerId comparison,
 * persisted scope, inline activities filter removed. App.jsx: isRepVisible's
 * rep branch passes through (Manager branch kept — load-bearing). Docs ride
 * in the same commit (§22): guide §17 sentence + state doc §0.51.
 *
 *   node patch-mine-all.mjs           # dry run
 *   node patch-mine-all.mjs --apply   # writes
 *
 * Anchors are stored \n-normalised and re-normalised to each file's DETECTED
 * EOL at runtime (git autocrlf may flip the state doc; the JSX files are CRLF
 * today). Mixed-EOL files are refused. Each anchor must match exactly once; a
 * miss writes nothing (18b2). After writing, every file is re-read FROM DISK
 * and checked, including that its EOL convention survived.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const APPLY = process.argv.includes('--apply');

const edits = [
  {
    "file": "src/Tabs/TasksTab.jsx",
    "changes": [
      {
        "old": "        currentUser, userRole, canSeeAll,\n",
        "new": "        currentUser, currentUserId, userRole,\n"
      },
      {
        "old": "function applyFilters(feed, { source, type, range, account, scope, search, currentUser, opportunities, accounts }) {\n",
        "new": "function applyFilters(feed, { source, type, range, account, scope, search, currentUserId, opportunities, accounts }) {\n"
      },
      {
        "old": "        if (scope === 'mine' && it.source === 'task-open') {\n            if (it.assignedTo && it.assignedTo !== currentUser) return false;\n        }\n",
        "new": "        if (scope === 'mine' && it.source === 'task-open') {\n            // Keys on the OWNER ID, never the display name (18b22) — a stale\n            // name-string must not hide a row the server granted. Unassigned\n            // (null `ownerId`) stays visible under Mine, matching the server's\n            // read policy. currentUserId is null until `?me=true` resolves and\n            // fails CLOSED for that window, the same direction as getCallerId.\n            if (it.ownerId && it.ownerId !== currentUserId) return false;\n        }\n"
      },
      {
        "old": "    const [scope,  setScope]  = useState('mine');\n",
        "new": "    // Persisted PREFERENCE only — never data (the localStorage hazards in §18\n    // and §0A000.8 were cached DATA). An unrecognised stored value renders as\n    // Mine rather than leaving the segmented control with no active state\n    // (§16's unmatched-select rule).\n    const [scope,  setScope]  = useState(() => localStorage.getItem('tab:tasks:scope') === 'all' ? 'all' : 'mine');\n    const setScopePersist     = v => { setScope(v); localStorage.setItem('tab:tasks:scope', v); };\n"
      },
      {
        "old": "        const visibleActivities = canSeeAll ? (activities || []) : (activities || []).filter(a => !a.author || a.author === currentUser);\n",
        "new": "        // No client-side author filter: the server scopes activities per role\n        // (own + unassigned for a rep) since the 28 Aug GET-scoping batch, and\n        // a name-based filter here could only HIDE rows the server granted\n        // when a stale name-string mismatches (18b22).\n        const visibleActivities = activities || [];\n"
      },
      {
        "old": "    }, [visibleTasks, activities, canSeeAll, currentUser, opportunities, accounts, contacts]);\n",
        "new": "    }, [visibleTasks, activities, opportunities, accounts, contacts]);\n"
      },
      {
        "old": "        source: 'all', type: 'all', range, account: 'all', scope, search, currentUser, opportunities, accounts,\n    }), [allFeedItems, range, scope, search, currentUser, opportunities, accounts]);\n",
        "new": "        source: 'all', type: 'all', range, account: 'all', scope, search, currentUserId, opportunities, accounts,\n    }), [allFeedItems, range, scope, search, currentUserId, opportunities, accounts]);\n"
      },
      {
        "old": "                        {[{ k: 'mine', l: 'Mine' }, { k: 'team', l: 'Team' }].map(s => {\n",
        "new": "                        {[{ k: 'mine', l: 'Mine' }, { k: 'all', l: 'All' }].map(s => {\n"
      },
      {
        "old": "                                <button key={s.k} onClick={() => setScope(s.k)} style={{ padding: '5px 12px', fontSize: 12, fontWeight: active ? 700 : 500, background: active ? T.ink : 'transparent', color: active ? T.surface : T.inkMid, border: 'none', cursor: 'pointer', fontFamily: T.sans, transition: 'all 120ms' }}>\n",
        "new": "                                <button key={s.k} onClick={() => setScopePersist(s.k)} style={{ padding: '5px 12px', fontSize: 12, fontWeight: active ? 700 : 500, background: active ? T.ink : 'transparent', color: active ? T.surface : T.inkMid, border: 'none', cursor: 'pointer', fontFamily: T.sans, transition: 'all 120ms' }}>\n"
      }
    ],
    "expectPresent": [
      "currentUser, currentUserId, userRole,",
      "it.ownerId && it.ownerId !== currentUserId",
      "localStorage.getItem('tab:tasks:scope')",
      "setScopePersist(s.k)",
      "{ k: 'all', l: 'All' }",
      "const visibleActivities = activities || [];"
    ],
    "expectAbsent": [
      "it.assignedTo && it.assignedTo !== currentUser",
      "{ k: 'team', l: 'Team' }",
      "a.author === currentUser",
      "search, currentUser, opportunities",
      "canSeeAll"
    ]
  },
  {
    "file": "src/App.jsx",
    "changes": [
      {
        "old": "    const isRepVisible = (repName) => {\n        if (isAdmin) return true;\n        if (isManager) return managedReps.size === 0 || managedReps.has(repName);\n        return !repName || repName === currentUser;\n    };\n",
        "new": "    const isRepVisible = (repName) => {\n        if (isAdmin) return true;\n        if (isManager) return managedReps.size === 0 || managedReps.has(repName);\n        // Rep path: the SERVER is the boundary since the 28 Aug GET-scoping\n        // batch — every entity GET already returns a rep only their own rows\n        // plus unassigned ones, keyed on ownerId. Re-filtering by display name\n        // here could only HIDE rows the server granted (a stale name-string\n        // after a rename, §18b22), so the client passes everything through.\n        // The Manager branch above stays and is LOAD-BEARING: server-side\n        // canSeeAll hands Managers the whole org on five of six entities, so\n        // this managedReps narrowing is the only Manager scoping that exists\n        // (§0.39). Do not delete it with the rep branch.\n        return true;\n    };\n"
      }
    ],
    "expectPresent": [
      "this managedReps narrowing is the only Manager scoping",
      "Do not delete it with the rep branch"
    ],
    "expectAbsent": [
      "return !repName || repName === currentUser;"
    ]
  },
  {
    "file": "docs/ACCELEREP_CODING_GUIDE.md",
    "changes": [
      {
        "old": "deliberately not copied to the other five until that list moves to ids.\n",
        "new": "deliberately not copied to the other five until that list moves to ids. The client passes reads through for reps (`isRepVisible`'s rep branch returns `true` since 28 Aug — a name-based re-filter could only hide rows the server granted); Manager narrowing to `managedReps` remains client-side and load-bearing.\n"
      }
    ],
    "expectPresent": [
      "isRepVisible"
    ],
    "expectAbsent": []
  },
  {
    "file": "docs/ACCELEREP_CURRENT_STATE.md",
    "changes": [
      {
        "old": "§19 branches/env-var corrected\n",
        "new": "§19 branches/env-var corrected · **the client stops re-implementing the boundary** (§0.51)\n"
      },
      {
        "old": "---\n\n## 0P0. Prior Batch — One Role Vocabulary, And A Gate That Allows Instead Of Denies\n",
        "new": "### 0.51 The client stops re-implementing the boundary (same session)\n\nWith the server scoping reads, the client's name-based visibility filters\nchanged from redundant to hazardous: a row whose `ownerId` is the rep's but\nwhose stale name-string no longer matches would be SENT by the server and\nHIDDEN by the client — §18b22's shape, on the read path. Shipped:\n\n- **`isRepVisible`'s rep branch returns `true`.** The server is the boundary.\n  The Manager branch stays untouched and is LOAD-BEARING: server-side\n  `canSeeAll` hands Managers the whole org on five of six entities, so the\n  client's `managedReps` narrowing is the only Manager scoping that exists\n  (§0.39). Deleting the function wholesale — as the handoff proposed — would\n  have silently widened every Manager's view to org-wide.\n- **TasksTab's Mine/Team control is now Mine/All**, honest at every role: for\n  a rep, All is everything the server grants (own + unassigned). “Team” could\n  never show a rep their teammates' tasks again and read as if it would.\n- **The scope filter keys on `it.ownerId === currentUserId`**, not the display\n  name — the first consumer of `currentUserId` (§0.49 said “consumed in the\n  next commit”; this is that commit). A null `currentUserId` during the\n  `?me=true` load window fails closed, matching `getCallerId`.\n- **Scope persists** to `localStorage` (`tab:tasks:scope`), the sub-tab\n  precedent. Preference only, never data; an unrecognised stored value renders\n  as Mine rather than leaving the control stateless (§16's unmatched-select\n  rule).\n- **The inline activities author filter died** (`TasksTab:1147`) — the same\n  class as the rep branch, able only to hide server-granted rows.\n\nAccounts, Contacts and Pipeline chip rows get the same toggle in follow-up\nbatches, one file-read at a time. No new tests — client-only; the six gates\nplus a browser pass as Karen (Mine/All toggles and persists across reload;\nnothing she owns missing on Tasks) are the verification.\n\n---\n\n## 0P0. Prior Batch — One Role Vocabulary, And A Gate That Allows Instead Of Denies\n"
      }
    ],
    "expectPresent": [
      "### 0.51 The client stops re-implementing the boundary",
      "the client stops re-implementing the boundary** (§0.51)"
    ],
    "expectAbsent": []
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
    const crlf = (src.match(/\r\n/g) || []).length;
    const lf = (src.match(/\n/g) || []).length;
    if (crlf !== 0 && crlf !== lf) {
        console.error('FAIL ' + edit.file + ' — MIXED line endings (' + crlf + ' CRLF of ' + lf + ' newlines). Refusing.');
        failed = true;
        continue;
    }
    const eol = crlf > 0 ? '\r\n' : '\n';
    const norm = (s) => s.split('\n').join(eol);
    let ok = true;
    for (const [i, ch] of edit.changes.entries()) {
        const oldN = norm(ch.old);
        const n = src.split(oldN).length - 1;
        if (n !== 1) {
            console.error('FAIL ' + edit.file + ' — anchor ' + (i + 1) + ' matched ' + n + ' times, expected 1.');
            ok = false;
            failed = true;
            break;
        }
        src = src.replace(oldN, norm(ch.new));
    }
    if (!ok) continue;
    staged.push({ file: edit.file, src, edit, eol });
    console.log('  ok   ' + edit.file + ' — ' + edit.changes.length + ' anchor(s) matched (' + (eol === '\r\n' ? 'CRLF' : 'LF') + ')');
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
for (const { file, edit, eol } of staged) {
    const onDisk = readFileSync(file, 'utf8');
    const norm = (s) => s.split('\n').join(eol);
    for (const s of edit.expectPresent) {
        if (!onDisk.includes(norm(s))) { console.error('  MISSING in ' + file + ': ' + s); verifyFailed = true; }
    }
    for (const s of edit.expectAbsent) {
        if (onDisk.includes(norm(s))) { console.error('  STILL PRESENT in ' + file + ': ' + s); verifyFailed = true; }
    }
    const crlfAfter = (onDisk.match(/\r\n/g) || []).length;
    const eolAfter = crlfAfter > 0 ? '\r\n' : '\n';
    if (eolAfter !== eol) { console.error('  EOL CONVENTION CHANGED in ' + file); verifyFailed = true; }
    console.log('  verified ' + file + ' (' + (eol === '\r\n' ? 'CRLF' : 'LF') + ' preserved)');
}

if (verifyFailed) {
    console.error('\nVERIFICATION FAILED — the files on disk are not what was intended.');
    process.exit(1);
}

console.log('\nDone. Run the six gates, then stage the two JSX + two docs as ONE commit.');
