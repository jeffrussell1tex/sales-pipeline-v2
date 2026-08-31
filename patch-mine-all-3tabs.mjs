#!/usr/bin/env node
/**
 * Mine/All scope on AccountsTab, ContactsTab and PipelineTab — the §0.51
 * TasksTab pattern applied to the remaining three tabs, one aliased
 * destructure + one memoised derivation each, so every downstream reference
 * (warmth chips, presets, exports) follows the scope untouched. State doc
 * §0.52 rides in the same commit (§22).
 *
 *   node patch-mine-all-3tabs.mjs           # dry run
 *   node patch-mine-all-3tabs.mjs --apply   # writes
 *
 * Anchors stored \n-normalised, re-normalised to each file's DETECTED EOL at
 * runtime; mixed-EOL files refused; every anchor must match exactly once; a
 * miss writes nothing (18b2). After writing, files are re-read FROM DISK and
 * checked, including EOL preservation.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const APPLY = process.argv.includes('--apply');

const edits = [
  {
    "file": "src/Tabs/AccountsTab.jsx",
    "changes": [
      {
        "old": "        currentUser, userRole, canSeeAll,\n",
        "new": "        currentUser, currentUserId, userRole, canSeeAll,\n"
      },
      {
        "old": "        visibleAccounts,\n",
        "new": "        visibleAccounts: allVisibleAccounts,\n"
      },
      {
        "old": "    const canEdit    = !isReadOnly;\n",
        "new": "    const canEdit    = !isReadOnly;\n\n    // ── Mine/All scope (§0.52) ─────────────────────────────\n    // Persisted PREFERENCE only — never data. An unrecognised stored value\n    // renders as Mine (§16's unmatched-select rule). The filter keys on\n    // ownerId, never the display name (§18b22); a null currentUserId during\n    // the ?me=true load window fails closed, matching getCallerId. Unassigned\n    // rows stay visible under Mine, matching the server's read policy.\n    const [scope, setScope] = useState(() => localStorage.getItem('tab:accounts:scope') === 'all' ? 'all' : 'mine');\n    const setScopePersist   = v => { setScope(v); localStorage.setItem('tab:accounts:scope', v); };\n    const visibleAccounts = useMemo(() => scope === 'mine'\n        ? allVisibleAccounts.filter(r => !r.ownerId || r.ownerId === currentUserId)\n        : allVisibleAccounts, [scope, allVisibleAccounts, currentUserId]);\n"
      },
      {
        "old": "            {/* Divider */}\n            <div style={{ width: 1, height: 16, background: T.border, margin: '0 10px', flexShrink: 0 }}/>\n\n            {/* Warmth chips — compact, no border on All */}\n",
        "new": "            {/* Divider */}\n            <div style={{ width: 1, height: 16, background: T.border, margin: '0 10px', flexShrink: 0 }}/>\n\n            {/* Scope segmented control — §0.52 */}\n            <div style={{ display: 'inline-flex', border: `1px solid ${T.borderStrong}`, borderRadius: T.r, overflow: 'hidden', flexShrink: 0, marginBottom: -1 }}>\n                {[{ k: 'mine', l: 'Mine' }, { k: 'all', l: 'All' }].map(s => {\n                    const active = scope === s.k;\n                    return (\n                        <button key={s.k} onClick={() => setScopePersist(s.k)} style={{ padding: '4px 10px', fontSize: 12, fontWeight: active ? 600 : 400, background: active ? T.ink : 'transparent', color: active ? T.surface : T.inkMid, border: 'none', cursor: 'pointer', fontFamily: T.sans, transition: 'all 100ms' }}>\n                            {s.l}\n                        </button>\n                    );\n                })}\n            </div>\n            <div style={{ width: 1, height: 16, background: T.border, margin: '0 10px', flexShrink: 0 }}/>\n\n            {/* Warmth chips — compact, no border on All */}\n"
      }
    ],
    "expectPresent": [
      "localStorage.getItem('tab:accounts:scope')",
      "allVisibleAccounts.filter(r => !r.ownerId",
      "{ k: 'all', l: 'All' }",
      "visibleAccounts: allVisibleAccounts"
    ],
    "expectAbsent": []
  },
  {
    "file": "src/Tabs/ContactsTab.jsx",
    "changes": [
      {
        "old": "        currentUser, userRole, canSeeAll,\n",
        "new": "        currentUser, currentUserId, userRole, canSeeAll,\n"
      },
      {
        "old": "        visibleContacts,\n",
        "new": "        visibleContacts: allVisibleContacts,\n"
      },
      {
        "old": "    const canEdit    = !isReadOnly;\n",
        "new": "    const canEdit    = !isReadOnly;\n\n    // ── Mine/All scope (§0.52) ─────────────────────────────\n    // Persisted PREFERENCE only — never data. An unrecognised stored value\n    // renders as Mine (§16's unmatched-select rule). The filter keys on\n    // ownerId, never the display name (§18b22); a null currentUserId during\n    // the ?me=true load window fails closed, matching getCallerId. Unassigned\n    // rows stay visible under Mine, matching the server's read policy.\n    const [scope, setScope] = useState(() => localStorage.getItem('tab:contacts:scope') === 'all' ? 'all' : 'mine');\n    const setScopePersist   = v => { setScope(v); localStorage.setItem('tab:contacts:scope', v); };\n    const visibleContacts = useMemo(() => scope === 'mine'\n        ? allVisibleContacts.filter(r => !r.ownerId || r.ownerId === currentUserId)\n        : allVisibleContacts, [scope, allVisibleContacts, currentUserId]);\n"
      },
      {
        "old": "                {/* Right buttons */}\n                <div style={{ display: 'flex', gap: 8 }}>\n",
        "new": "                {/* Right buttons */}\n                <div style={{ display: 'flex', gap: 8 }}>\n                    {/* Scope segmented control — §0.52 */}\n                    <div style={{ display: 'inline-flex', border: `1px solid ${T.borderStrong}`, borderRadius: T.r, overflow: 'hidden', flexShrink: 0, alignSelf: 'center' }}>\n                        {[{ k: 'mine', l: 'Mine' }, { k: 'all', l: 'All' }].map(s => {\n                            const active = scope === s.k;\n                            return (\n                                <button key={s.k} onClick={() => setScopePersist(s.k)} style={{ padding: '5px 12px', fontSize: 12, fontWeight: active ? 600 : 400, background: active ? T.ink : 'transparent', color: active ? T.surface : T.inkMid, border: 'none', cursor: 'pointer', fontFamily: T.sans, transition: 'all 100ms' }}>\n                                    {s.l}\n                                </button>\n                            );\n                        })}\n                    </div>\n"
      }
    ],
    "expectPresent": [
      "localStorage.getItem('tab:contacts:scope')",
      "allVisibleContacts.filter(r => !r.ownerId",
      "visibleContacts: allVisibleContacts"
    ],
    "expectAbsent": []
  },
  {
    "file": "src/Tabs/PipelineTab.jsx",
    "changes": [
      {
        "old": "        currentUser, userRole, canSeeAll,\n",
        "new": "        currentUser, currentUserId, userRole, canSeeAll,\n"
      },
      {
        "old": "        visibleOpportunities, getKpiColor,\n",
        "new": "        visibleOpportunities: allVisibleOpportunities, getKpiColor,\n"
      },
      {
        "old": "    const canEdit    = !isReadOnly;\n",
        "new": "    const canEdit    = !isReadOnly;\n\n    // ── Mine/All scope (§0.52) ─────────────────────────────\n    // Persisted PREFERENCE only — never data. An unrecognised stored value\n    // renders as Mine (§16's unmatched-select rule). The filter keys on\n    // ownerId, never the display name (§18b22); a null currentUserId during\n    // the ?me=true load window fails closed, matching getCallerId. Unassigned\n    // rows stay visible under Mine, matching the server's read policy.\n    const [scope, setScope] = useState(() => localStorage.getItem('tab:pipeline:scope') === 'all' ? 'all' : 'mine');\n    const setScopePersist   = v => { setScope(v); localStorage.setItem('tab:pipeline:scope', v); };\n    const visibleOpportunities = React.useMemo(() => scope === 'mine'\n        ? allVisibleOpportunities.filter(r => !r.ownerId || r.ownerId === currentUserId)\n        : allVisibleOpportunities, [scope, allVisibleOpportunities, currentUserId]);\n"
      },
      {
        "old": "                })}\n                <div style={{ flex: 1 }} />\n                <div style={{ fontSize: 11, color: T.inkMuted, fontFamily: T.sans, paddingBottom: 4 }}>\n",
        "new": "                })}\n                <div style={{ width: 1, height: 16, background: T.border, margin: '0 10px', flexShrink: 0 }}/>\n                {/* Scope segmented control — §0.52 */}\n                <div style={{ display: 'inline-flex', border: `1px solid ${T.borderStrong}`, borderRadius: T.rMd, overflow: 'hidden', flexShrink: 0 }}>\n                    {[{ k: 'mine', l: 'Mine' }, { k: 'all', l: 'All' }].map(s => {\n                        const active = scope === s.k;\n                        return (\n                            <button key={s.k} onClick={() => setScopePersist(s.k)} style={{ padding: '4px 10px', fontSize: 12, fontWeight: active ? 600 : 400, background: active ? T.ink : 'transparent', color: active ? T.surface : T.inkMid, border: 'none', cursor: 'pointer', fontFamily: T.sans, transition: 'all 100ms' }}>\n                                {s.l}\n                            </button>\n                        );\n                    })}\n                </div>\n                <div style={{ flex: 1 }} />\n                <div style={{ fontSize: 11, color: T.inkMuted, fontFamily: T.sans, paddingBottom: 4 }}>\n"
      }
    ],
    "expectPresent": [
      "localStorage.getItem('tab:pipeline:scope')",
      "allVisibleOpportunities.filter(r => !r.ownerId",
      "visibleOpportunities: allVisibleOpportunities"
    ],
    "expectAbsent": []
  },
  {
    "file": "docs/ACCELEREP_CURRENT_STATE.md",
    "changes": [
      {
        "old": "**the client stops re-implementing the boundary** (§0.51)\n",
        "new": "**the client stops re-implementing the boundary** (§0.51) · **Mine/All on Accounts, Contacts and Pipeline** (§0.52)\n"
      },
      {
        "old": "---\n\n## 0P0. Prior Batch — One Role Vocabulary, And A Gate That Allows Instead Of Denies\n",
        "new": "### 0.52 Mine/All on Accounts, Contacts and Pipeline (same session)\n\nThe §0.51 pattern, applied to the remaining three tabs. Each tab takes\n`currentUserId` from context, aliases its context list at the destructure\n(`visibleAccounts` / `visibleContacts` / `visibleOpportunities` →\n`allVisible…`) and re-derives the original name scoped:\n\n```js\nconst visibleAccounts = useMemo(() => scope === 'mine'\n    ? allVisibleAccounts.filter(r => !r.ownerId || r.ownerId === currentUserId)\n    : allVisibleAccounts, [scope, allVisibleAccounts, currentUserId]);\n```\n\nOne edit at the source; every downstream reference — warmth chips and their\ncounts, smart presets, saved views, exports, KPI strips — follows the scope\nautomatically. The derivation is memoised so the `mine` branch does not mint a\nnew array identity per render and defeat every downstream memo. Each tab\npersists to its own key (`tab:accounts:scope`, `tab:contacts:scope`,\n`tab:pipeline:scope`), validated on read like §0.51. Placement: Accounts — the\nchip row, between the view tabs and the warmth chips; Contacts — the header\nbutton row, before search; Pipeline — the view-switcher row, after the view\ntabs. Unassigned rows remain visible under Mine. Default is Mine everywhere\n(the handoff's recorded design) — note this is the first scoping an Admin sees\non these tabs, so an Admin’s first load shows own + unassigned until they\nclick All once; the choice then persists. No new tests — the six gates plus a\nbrowser pass per tab are the verification.\n\n---\n\n## 0P0. Prior Batch — One Role Vocabulary, And A Gate That Allows Instead Of Denies\n"
      }
    ],
    "expectPresent": [
      "### 0.52 Mine/All on Accounts, Contacts and Pipeline",
      "Mine/All on Accounts, Contacts and Pipeline** (§0.52)"
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
        console.error('FAIL ' + edit.file + ' — MIXED line endings. Refusing.');
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

for (const { file, src } of staged) writeFileSync(file, src, 'utf8');

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
    const eolAfter = (onDisk.match(/\r\n/g) || []).length > 0 ? '\r\n' : '\n';
    if (eolAfter !== eol) { console.error('  EOL CONVENTION CHANGED in ' + file); verifyFailed = true; }
    console.log('  verified ' + file + ' (' + (eol === '\r\n' ? 'CRLF' : 'LF') + ' preserved)');
}

if (verifyFailed) {
    console.error('\nVERIFICATION FAILED — the files on disk are not what was intended.');
    process.exit(1);
}

console.log('\nDone. Run the six gates, then stage the three tabs + state doc as ONE commit.');
