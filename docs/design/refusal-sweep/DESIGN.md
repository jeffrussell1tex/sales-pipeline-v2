<!-- The rest of the refusal sweep (OPEN_ITEMS §1 item 6, "The rest of the sweep"): the design, 11 Nov 2026, over f5f0139, revised the same day after the critic. The tree at the time: `M deno.lock` and `?? src/utils/dispatchCustomer.js.bak`. Both were there before this design, and neither was touched. Seven read-only mappers did the reading (kanban, tasks, reports, misc, export, dispatch, bodyfirst; their map is scratchpad/sweep/map.json). A designer then re-read the code behind every claim this design relies on; each is cited file:line, and anything not re-read is labelled. A critic re-checked it, and the reviser re-read every point the critic raised (see ## CRITIC). Nothing was edited and no harness was run. The questions have not been asked yet. -->

# Design: every refusal and every failed request is said, kept until closed, in the house words (the rest of the sweep)

## The rule this finishes

- **Guide §18b125 rule 5** and **§18b123 rule 4** set the rule:
  - A refusal is said in the server's words: `readRefusal` (src/utils/refusalWords.js:22). That is the server's `error` plus ` (ref …)`, or else "The server returned N."
  - A thrown failure is said by `failureWords` (:34). A request that never left says "The server could not be reached." Anything else says "Its answer could not be read." A raw `e.message` is never shown.
  - The `ok` check comes before the body is read.
  - An error is kept until closed, never on a timer.
  - A read that failed is no count.
- **Write paths' words.** `dbWrite` (src/utils/storage.js:108) never throws. It gives these words (refusalOf :89):
  - a 403: "You do not have permission to make this change.";
  - otherwise the server's words with their ref, or else "The server returned N.";
  - a request that never left: `NETWORK_ERROR`, "Network error — the change was not saved." (:100).
- **THE GUARD** is tests/refusals-said.test.mjs, which runs three scans:
  - (i) an error state nothing draws;
  - (ii) `throw new Error(x.error)` with no fallback words;
  - (iii) a body read before its ok check. Scan (iii) runs only over `SWEPT`, which is 8 files (:481-486). It counts an ok check only when it is read off a plain name (`res.ok`), never a member chain (`x.value.ok`), anywhere earlier in the same function (:268-286). A name in `BODY_FIRST` must be a `SWEPT` file (:503), and a name the scan no longer flags fails the guard as stale (:501-502).

## The batch

The design has twelve Parts. Each Part can ship on its own. They are in the recommended order:

- **Tier A (Parts 1-7): what a member is never told today.** A change that silently un-does itself, a page that vanishes, an error that leaves on a timer.
- **Tier B (Part 8): the raw words.** "Failed to fetch", "Unexpected token '<'" and "HTTP N" in the files already swept.
- **Tier C (Parts 9-12): the body read before the ok check, area by area.** Each Part adds the files it cleans to `SWEPT`. Part 12 turns `SWEPT` into all of src/.

Suggested batches, each sized like §0.242/§0.243:

| Batch | Parts | Files changed (about) |
|---|---|---|
| 1 | 1-4 | 14 (16 with 1e) |
| 2 | 5-7 | 20 |
| 3 | 8-9 | 18 |
| 4 | 10-11 | 18 |
| 5 | 12 | 22 |

**What every Part shares:**
- **No server, schema or itest change.** Every fix is in src/. The servers' refusals were read where cited.
- **Where the RUN tests go.** They go in one new suite, **tests/refusal-sweep.test.mjs**, added to the harness's `SUITES` (scripts/mutate-import.mjs:16). They use refusals-said's own pattern: `between()` and `code()` extract the handler, `new Function` builds it over stubs, and it is run. tests/refusals-said.test.mjs stays the guard and gains each Part's `SWEPT` files and scans.
- **Line endings.** Every src file this design touches is CRLF on disk (checked: KanbanView.jsx, useTasks.js, ReportsTab.jsx, DispatchTab.jsx; App.jsx is known CRLF). Every edit script must be EOL-aware, and every extraction in a new test must read through the suites' line-ending-normalising `read()`, so the `'\n    };'` end anchors below match.
- **Named sites that need a pin.** Where a `BODY_FIRST` name covers a read whose ok check the scan cannot see (an ok read through a `.filter`, or `.then(checkOk)`), the entry carries a `check` string that `order()` requires before the read in the same function. Naming alone would let a mutant that drops the real check survive. This field lands with the first Part that needs it, Part 11 (Part 9 no longer needs it: see its AdminView fix).
- **The chain.** Each batch runs the verification chain and commits marked "harness deferred". Every anchor below is **proposed post-fix text**, unless it is marked *(today)*. At build, check that each occurs once (the stale check), prove each by hand in the harness copy, and name every repointed or retired entry in the state section.
- **The pane check.** Answers are stubbed in the page: a fetch wrapper answers 403, a 502 HTML page, or a throw for one URL, so nothing is written. Karen (`User`) does the check where her role reaches the screen. Settings Parts are Admin-only and are checked as Jeff.

---

### Part 1: The Pipeline's stage drag, and the deal window's words

**Today (re-read).**
- KanbanView.jsx:221 shows the move at once.
- :232-243 sends it through `dbFetch`. On a refusal, :238 only does `console.error('Stage change not saved:', res.status)`. A network failure goes to `.catch(console.error)` (:243).
- The card stays in the column it was dropped in, and nothing is said. Every card is `draggable` (:313-319), although PipelineTab has `canEdit = canEditCrm(userRole)` (:368) and does not pass it (:955-966). `CRM_WRITE_ROLES` is Admin, Manager, User (roles.js:47).
- The deal window opens on that list copy and always sends `stage`: OpportunityModal.jsx:1254-1260 leaves out only the account, site, contacts and close date (confirmed by the critic). So the next save of any field can land the refused move later, unasked.
- The deal window reads the body before the ok check:
  - useOpportunities.js:163 and :196 are bare `res.json()`. A 502 page throws there, and the catch says "Failed to save opportunity. Please check your connection and try again." (:188, :207), although the server answered.
  - A JSON refusal with no `error` says "Failed to save opportunity. Please try again." (:165, :198).

**1a. The drag says a refusal and puts the card back** (KanbanView.jsx:201-246).
- Import `dbWrite` (:3).
- Take `setPressNotices` from `useApp` (:199). It is in appContextValue, App.jsx:1997. It is `useOrgBoundState(remembered)` (useModalState.js:100), so only an org switch clears it, and it is drawn with a ✕ at ModalLayer.jsx:369-380.
- Add a new pure helper, `src/utils/pressNotice.js`: `export const pressNoticeOf = (title, words) => ({ id: 'press_' + crypto.randomUUID(), title, words, refused: null });`.

```js
        const askedOrg = requestOrg();
        dbWrite('/.netlify/functions/opportunities', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: newOpp.id, stage: newOpp.stage, stageChangedDate: newOpp.stageChangedDate }),
        }).then(r => {
            if (!stillOrg(askedOrg)) return;
            if (!r.ok) {
                setOpportunities(prev => prev.map(o => (o === newOpp ? updatedOpp : o)));   // this drag's copy only
                setPressNotices(list => [...list, pressNoticeOf(updatedOpp.opportunityName || updatedOpp.account || 'A deal', `Not moved to ${toStage}: ${r.error}`)]);
                return;
            }
            const stored = r.data?.opportunity;
            if (stored) setOpportunities(prev => prev.map(o => (o.id === stored.id ? stored : o)));
            if (toStage === 'Closed Won') promptSpiffClaim?.(stored || newOpp);
        }).catch(console.error);   // a throw in what follows a landed move; dbWrite itself never throws
```

- **Put back by identity.** `o === newOpp` puts back only this drag's own copy. A list read again (an org switch away and back) keeps what it holds, and so does a second drag of the same deal. `setOpportunities` is a plain `useState` setter, so the identity holds.
- **Why `dbWrite`, not `dbFetch` + `failureWords`.** A `.catch(e => putBack(...))` would also catch a throw from the success branch and put back a move that landed.
- **Where it is said: Q1.** A press notice is kept until ✕ and cleared by an org switch. The ⚠ toast is one shared slot: a later toast (a delete's Undo) replaces it. TaskRail.jsx:362-364 records that it moved off the toast for exactly this reason (§0.199's fifth re-check).
- **The lines pinned today are kept:**
  - the body line, deal-account.test.mjs H4 (:638);
  - `if (stored) setOpportunities(prev => prev.map(o => (o.id === stored.id ? stored : o)));` (H4);
  - deal-data.test.mjs:140-165, which still sees a `dbWrite` PUT.
- **What a member sees:** "⚠ **Acme renewal** — Not moved to Proposal: You do not have permission to make this change." Offline: "… Not moved to Proposal: Network error — the change was not saved." (Q4).

**1b. Only a member who may change deals is offered the drag (Q2).**
- PipelineTab passes `canEdit={canEdit}` (:955-966).
- KanbanView's card gets `draggable={canEdit}`, and `onDragStart`/`onTouchStart` start only when `canEdit` (:313-319).

**1c. The deal window: the ok check first, the house words (Q3)** (useOpportunities.js:162-166, :195-198).
- The new shape is `if (!res.ok) { const why = await readRefusal(res); if (!stillOrg(askedOrg)) return; setOppModalError(why); return; }`, then `const data = await res.json().catch(() => ({}));`, then the existing stillOrg and list lines.
- Each catch becomes `setOppModalError(failureWords(err))`, keeping its console.error line.
- Import `{ readRefusal, failureWords }` from '../utils/refusalWords.js'.
- Keep the line tests/leave-out.test.mjs:61 pins (`setOpportunities(prev => prev.map(opp => opp.id === editingOpp.id ? (data.opportunity || shownRow(updatedOpp)) : opp));`).

**1d. Proactive, in the same function (optional).**
- `if (!updatedOpp) return;` (:211) leaves the drag state set. Clear it first.
- :205-209 builds today's date by hand, but `todayLocal` is already imported (:5). Use it.

**1e. Optional, LOW: Closed Lost's rollback is by id** (useOpportunities.js:242-246).
- Use the same identity rule: `const shown = shownRow(updatedOpp);`, the optimistic line `opp.id === editingOppRef.id ? shown : opp`, then the rollback `o === shown && before ? before : o`.
- This closes the org-away-and-back edge the map found.
- **What it moves (found by the critic, re-read):**
  - the harness entry "lost dialog: a refused edit is not rolled back" (mutate-import.mjs:7030-7033) quotes :246 word for word, comment included: repoint onto the new rollback line;
  - tests/owner-kept.test.mjs:144 (the optimistic line) and :145 (the rollback) pin both lines: move them to the new text, same order assertions;
  - tests/leave-out.test.mjs:75 pins the optimistic line: move it.
  - "lost dialog: the rollback restores the optimistic deal" (:7034-7037) anchors the `before` line, which is unchanged.

**Tests.**
- **RUN `handleKanbanDrop`.** Extract `between(code(read('src/components/KanbanView.jsx')), '    const handleKanbanDrop = (toStage) => {', '\n    };')`. The stubs are a list state that applies updaters, `dbWrite`, `requestOrg`/`stillOrg`, `setPressNotices` and `promptSpiffClaim`. Cases:
  - (a) a 403 refusal: the same before-row object is back, the notice reads "Not moved to Proposal: You do not have permission to make this change.", and a drag to Closed Won offers no SPIFF;
  - (b) `NETWORK_ERROR`: put back and said;
  - (c) landed: the list holds `stored`, nothing is said, and Closed Won prompts with `stored`;
  - (d) `stillOrg` false: nothing put back, nothing said;
  - (e) the list replaced by a fresh copy before the answer: the fresh copy stands, and the words are still said.
- **RUN `handleSave`.** Extract from `'    const handleSave = (formData, editingOpp, activePipeline, currentUser,'` to `'\n    };\n\n    // The reason dialog'`; `sentBody`, `dealBody` and `shownRow` are imported. Cases:
  - 403 → the server's words;
  - a 500 `{error:'Internal server error', requestId:'r1'}` → "Internal server error (ref r1)";
  - a 502 whose json throws → "The server returned 502.";
  - `TypeError('Failed to fetch')` → "The server could not be reached.";
  - after every refusal the list is unchanged;
  - one create run with the 502 and with the offline answer.
- **WIRING:**
  - no `console.error('Stage change not saved'`;
  - the card's `draggable={canEdit}`;
  - no `setTimeout` near the notice.
- **SWEPT** gains `src/components/KanbanView.jsx`, `src/hooks/useOpportunities.js` and `src/utils/pressNotice.js`.
- **BODY_FIRST** names `saveDealNote` (useOpportunities.js:288). It reads a refusal's comments by design (§0.236).

**Harness candidates.**

| File | Anchor | Replacement | Caught by |
|---|---|---|---|
| KanbanView.jsx | `setOpportunities(prev => prev.map(o => (o === newOpp ? updatedOpp : o)));` | `` | RUN (a) |
| KanbanView.jsx | `(o === newOpp ? updatedOpp : o)` | `(o.id === newOpp.id ? updatedOpp : o)` | RUN (e) |
| KanbanView.jsx | `` `Not moved to ${toStage}: ${r.error}` `` | `` `Not moved to ${toStage}.` `` | RUN (a) |
| KanbanView.jsx | `draggable={canEdit}` | `draggable` | WIRING |
| useOpportunities.js | `console.error('Failed to update opportunity:', err); setOppModalError(failureWords(err));` | `…setOppModalError(err.message);` | RUN offline |
| useOpportunities.js | `console.error('Failed to save opportunity:', err); setOppModalError(failureWords(err));` | `…setOppModalError('Failed to save opportunity. Please check your connection and try again.');` | RUN create offline |

- **REPOINT** "§0.236 the board takes a late answer after an org switch" (mutate-import.mjs:19129-19132). Its anchor `if (!stillOrg(askedOrg)) return;\n            if (stored)` goes. The new anchor is `            if (!stillOrg(askedOrg)) return;\n            if (!r.ok) {`, with replacement `            if (!r.ok) {`. RUN (d) catches it.
- **REPOINT** "late answer: a new deal appends to the new org's list…" (:5380-5383). It anchors the create path's old three lines. The new anchor is the create path's `if (!stillOrg(askedOrg)) return;\n` before `setOpportunities(prev => [...prev, data.opportunity || newOpp]);`, which is deleted. Check the exact indentation at build.
- **If 1e ships:** REPOINT :7030-7033 (above).

**Files:** KanbanView.jsx, PipelineTab.jsx, useOpportunities.js, src/utils/pressNotice.js (new); tests/refusal-sweep.test.mjs (new), tests/refusals-said.test.mjs; with 1e, tests/owner-kept.test.mjs and tests/leave-out.test.mjs.

---

### Part 2: Tasks: the ✓ and Snooze that un-tick without a word

**Today (re-read).**
- **The ✓.** TasksTab.jsx:172-177 `QRow.handleComplete` awaits `handleCompleteTask` and throws its answer away. The hook (useTasks.js:167-210) moves the row at once (:182), reads the body BEFORE the ok check (:198), and on any failure puts the row back (:207) and logs. The row leaves "What's on your plate", then reappears, and nothing is said.
  - A 500's requestId is dropped (:200).
  - A 200 whose body is not JSON landed, but :198 throws, so the screen rolls back a completed task.
- **Snooze** (TasksTab.jsx:179-198) throws `'HTTP ' + status` (:190), then its catch puts the row back silently (:194-197). The feed items carry `source` and `when` (:524-526).
- **Which refusal a member will meet.** A rep completing a teammate's task gets a 403 ('Forbidden: you can only modify your own or unassigned records', `OWNERSHIP_FORBIDDEN`, _ownership.mjs:104). The server's own comment names it (tasks.mjs:115-119).
- **Why QRow cannot hold the words.** QRow unmounts during the await, because the row leaves `nowItems`.
- **The task window (TaskRail)** already says a refusal (:379-382, :362-364). It gets the wrong cause only from the hook's body-first read: a non-JSON answer says "check your connection" (its `said()` fallback, :24).
- **Home's "On your plate" has drawn no Complete since 7ae0608** ('tasks fixes', 5 Jun 2026; confirmed with git log -S). Its handler (HomeTab.jsx:954-966) and the `onComplete` closures (:309, :370) are dead, and so is ModalLayer.jsx:133's `handleCompleteTask` destructure.
- **The reminder and due popups' Snooze and Dismiss** make no request (map; ModalLayer.jsx:994 sets state only, re-read).

**2a. One pure helper,** `src/utils/taskWrite.js`:

```js
export const taskWriteAnswer = async (send) => {
    let res;
    try { res = await send(); } catch (e) { return { ok: false, error: failureWords(e) }; }
    if (!res.ok) return { ok: false, error: await readRefusal(res) };
    const data = await res.json().catch(() => null);
    return { ok: true, task: data && data.task ? data.task : null };
};
```

It checks ok first, never throws, and keeps a landed answer that is not JSON.

**2b. `handleCompleteTask`** (useTasks.js:191-209).
- `const answer = await taskWriteAnswer(() => dbFetch(...same request...));`, then `if (!stillOrg(askedOrg)) return;`.
- On `!answer.ok`: `setTasks(prev => prev.map(t => (t === next ? current : t)));`, then `return { ok: false, error: answer.error };`. This is the identity rule from 1a: a newer row a load brought in stands.
- On ok: keep `answer.task || next`, add the audit row, `return { ok: true }`.
- Optional: `!current` (:172) answers `{ ok: false, error: 'The task could not be found. Reload the page to try again.' }` instead of `undefined`.
- **Effect on the task window (Q3).** It now says "The task was not completed: The server could not be reached." offline, and "…: The server returned 502." for a 502 page. A non-JSON success is no longer rolled back.

**2c. The Tasks tab says it (Q1).**
- In TasksTab, `const sayRefused = (task, words) => setPressNotices(list => [...list, pressNoticeOf(task.title || 'A task', words)]);`, passed as `onRefused` in `qRowProps` (:604).
- In QRow: `const done = await handleCompleteTask(task.id, 'Completed'); if (done && !done.ok) onRefused(task, `Not completed: ${done.error}`);`. An `undefined` answer means an org switch and says nothing.
- **Snooze** uses the same helper:
  - `const { source, when, ...row } = task;` keeps the feed's keys out of the body and out of the rollback;
  - `updated = { ...row, dueDate: newDate, status: 'Open', completed: false }`;
  - on a refusal, `setTasks(prev => prev.map(t => (t === updated ? row : t)));` then `onRefused(task, `Not snoozed: ${answer.error}`);`.
- **What a member sees:** "⚠ **Call Dana** — Not completed: Forbidden: you can only modify your own or unassigned records", kept until ✕.

**2d. Home's dead Complete (Q5).**
- Recommended: remove PlateRow's `completing`/`handleComplete` (HomeTab.jsx:954-966), the two closures (:309, :370), the `onComplete: null` keys (:332, :352), the destructure (:157), and ModalLayer.jsx:133's.
- Correct OPEN_ITEMS §1 item 6 (docs/OPEN_ITEMS.md:533-553): its line naming "HomeTab's PlateRow" (:535), and "67 lines" (:550, see Part 12's count). The item does not mention the reminder popup, so nothing there is dropped (an earlier draft said it did; the popup's mention at :3129 is a different item).

**Tests.**
- **RUN `taskWriteAnswer`:**
  - 403 → the words;
  - 500 with requestId → "… (ref r1)";
  - a 502 HTML page → "The server returned 502.";
  - `send` throwing `TypeError('Failed to fetch')` → "The server could not be reached.";
  - a 200 that is not JSON → `{ ok: true, task: null }`, no throw.
- **RUN `handleCompleteTask`** (extracted; stubs `tasks`, `setTasks`, `dbFetch`, `taskWriteAnswer`, `addAudit`, `requestOrg`, `stillOrg`):
  - refused → put back by identity and `{ ok:false, error }`;
  - a row replaced meanwhile → it stands;
  - landed → `answer.task` and the audit row.
- **RUN QRow's two handlers** (extracted): `onRefused` gets the words; `undefined` says nothing.
- **WIRING:**
  - no `'HTTP '` and no `res.json()` in QRow;
  - HomeTab holds no `onComplete` and no `handleCompleteTask`;
  - the two popups' Snooze/Dismiss handlers make no `dbFetch`/`dbWrite`.
- **SWEPT** gains `src/Tabs/TasksTab.jsx` and `src/utils/taskWrite.js`. useTasks.js waits for Parts 7 and 10 (its :109 and :233 calendar reads leave with Part 7; its :125/:148 saves are Part 10's).
- **Moved pins:** tests/link-ids.test.mjs:484-489 (the refused-words line and the `inOrder` of the completion's answer) move to the new text and are replaced by the RUN, not weakened.

**Harness candidates.**

| File | Anchor | Replacement | Caught by |
|---|---|---|---|
| taskWrite.js | `if (!res.ok) return { ok: false, error: await readRefusal(res) };` | `if (!res.ok) return { ok: false, error: 'HTTP ' + res.status };` | RUN |
| taskWrite.js | `const data = await res.json().catch(() => null);` | `const data = await res.json();` | RUN (200 non-JSON) |
| useTasks.js | `return { ok: false, error: answer.error };` | `return { ok: false };` | RUN |
| useTasks.js | `setTasks(prev => prev.map(t => (t === next ? current : t)));` | `` | RUN |
| TasksTab.jsx | `if (done && !done.ok) onRefused(task, \`Not completed: ${done.error}\`);` | `` | RUN |
| TasksTab.jsx | `onRefused(task, \`Not snoozed: ${answer.error}\`);` | `` | RUN |
| ModalLayer.jsx *(today)* | `setSnoozedReminders(prev => ({ ...prev, [task.id]: Date.now() + ms }));` | the same, plus a `dbFetch(...)` PUT | WIRING |

- **STALE, to repoint or retire and name** (§0.199's three: names at mutate-import.mjs:10663, :10667, :10671; anchors at :10665, :10669, :10673):
  - "a landed completion answers nothing": repoint onto `return { ok: true };` after the new `addAudit` line;
  - "a refused completion answers ok": repoint onto `return { ok: false, error: answer.error };` → `return { ok: true };`;
  - "the server's words are lost": retire, because the taskWrite.js first row covers it.

**Files:** useTasks.js, TasksTab.jsx, HomeTab.jsx, ModalLayer.jsx, src/utils/taskWrite.js (new); tests/refusal-sweep.test.mjs, tests/refusals-said.test.mjs, tests/link-ids.test.mjs.

---

### Part 3: Reports, "Contacts on this deal": add, remove, buyer persona

**Today (re-read).**
- **Add** (ReportsTab.jsx:6290-6319): `if (res.ok) {…}` has no else (:6310), and the catch only logs (:6314). The panel stays open with nothing said.
- **Remove** (:6353-6367): the same; the menu closes and the contact stays.
- **Persona** (:6369-6382): it flips the chip, sends the WHOLE loaded contact (`{ ...contact, buyerPersona }`, :6377), and on `!rp.ok` deletes the override (:6380) without reading `rp.error`.
  - The chip shows `localPersonaMap[c.id] ?? c.buyerPersona ?? c.persona ?? ''` (:6347). Deleting the override falls back to the loaded copy, not what was shown. A persona that landed earlier in the session reverts.
  - contacts.mjs merges `{ ...target, ...data }` (:215, re-read), so every stale field of the copy is written. That breaks §18b125 rule 1.
- **Reachable as Karen:** a persona on a contact another rep owns is a 403 (contacts.mjs assertOwnership, from the map).
- **No error state** exists in ActivityHistoryTab (:5054-5065).
- **ReportsTab remounts on an org switch** (App.jsx:2180 keyed Fragment, re-read), so these local setters need no `stillOrg`.

**3a. One banner for the three (Q6).**
- Add `const [dealContactsError, setDealContactsError] = React.useState('');` beside :5065.
- Draw it in Section 3 under its header, as inline JSX (not a component defined inside the parent): `<div role="alert">✕ {dealContactsError} <button onClick={() => setDealContactsError('')}>Close</button></div>`, styled as ExportDetail's actionError (:306-313).
- Clear it in the deal picker's onClick (:6031), which already resets this section.

**3b. Add.** `const added = await dbWrite(...same URL and the same three-key body, indentation kept...)`.
- If `!added.ok`: `setDealContactsError(`${newIds.length === 1 ? 'The contact was' : `${newIds.length} contacts were`} not added to this deal — ${added.error}`); return;`.
- Else clear the banner and keep the existing two lines.
- Keep `contacts:   contactNamesText(mergedNames),` verbatim: harness :898 anchors it.

**3c. Remove.** `const removed = await dbWrite(...same body...)`.
- If `!removed.ok`: `setDealContactsError(`${name || 'The contact'} was not taken off this deal — ${removed.error}`); return;`.
- Else clear the banner and `setLocalContactIds(merged)`.

**3d. Persona.**
- Send only what changes: `body: JSON.stringify({ id: contact.id, buyerPersona: personaId }),`. This is the hard rule, not a choice.
- Before the flip, keep what was shown, with the chip's own fallback: `const shown = localPersonaMap[contact.id] ?? contact.buyerPersona ?? contact.persona ?? '';`. (The handler is defined in the row's render, so `localPersonaMap` is the value the member saw when they picked.)
- On `!rp.ok`, put `shown` back, only while this pick is still the one shown: `setLocalPersonaMap(prev => (prev[contact.id] === personaId ? { ...prev, [contact.id]: shown } : prev));`. (An earlier draft put back `contact.buyerPersona`, the loaded copy, which kept the very bug it named.)
- Say it: `` `${name || 'The contact'}'s buyer persona was not saved — ${rp.error}` ``.

**What a member sees:** "✕ Dana Ruiz's buyer persona was not saved — You do not have permission to make this change. [Close]".

**Tests.**
- **RUN the three handlers** (extracted: `'onSave={async (newIds) => {'`, `'const handleRemove = async (contact) => {'`, `'const handleSetPersona = async (contact, personaId) => {'`), with `localPersonaMap` a stub the case sets:
  - refused, `NETWORK_ERROR` and landed answers;
  - for the persona:
    - A then B, with A refused after B was sent, leaves B shown;
    - a refused pick put back to the map's earlier landed value, not the loaded copy's (the map holds X, the contact's `buyerPersona` is Y: X is back);
    - a prior `''` shown (no map entry, no persona on the contact) is put back as `''`.
- **WIRING:**
  - the banner's `role="alert"` and its Close;
  - `!/setTimeout\([^)]*setDealContactsError/`;
  - REGRESSION: no `JSON.stringify({ ...contact, buyerPersona`.
- **Moved pins:** deal-account.test.mjs J4's end anchors `'if (res.ok) {'` (:648) and `'if (res.ok) setLocalContactIds(merged);'` (:650) become `'if (!added.ok)'` and `'if (!removed.ok)'`. Its body includes and its count of 2 PUTs (:654) hold.
- ReportsTab joins `SWEPT` only in Part 12 (its library reads :2429, :2520, :2545, :2582).

**Harness candidates.**

| File | Anchor | Replacement | Caught by |
|---|---|---|---|
| ReportsTab.jsx | `if (!added.ok) { setDealContactsError(` | `if (!added.ok) { (` | RUN |
| ReportsTab.jsx | `if (!removed.ok) { setDealContactsError(` | `if (!removed.ok) { (` | RUN |
| ReportsTab.jsx | `setLocalPersonaMap(prev => (prev[contact.id] === personaId ? { ...prev, [contact.id]: shown } : prev));` | `setLocalPersonaMap(prev => { const n={...prev}; delete n[contact.id]; return n; });` | RUN (earlier landed value) |
| ReportsTab.jsx | `{ ...prev, [contact.id]: shown } : prev` | `{ ...prev, [contact.id]: shown } : { ...prev, [contact.id]: shown }` | RUN (A then B) |
| ReportsTab.jsx | `body: JSON.stringify({ id: contact.id, buyerPersona: personaId }),` | `body: JSON.stringify({ ...contact, buyerPersona: personaId }),` | WIRING |
| ReportsTab.jsx | `'s buyer persona was not saved — ${rp.error}\`);` | `'s buyer persona was not saved.\`);` | RUN |

**Files:** ReportsTab.jsx; tests/refusal-sweep.test.mjs, tests/deal-account.test.mjs.

---

### Part 4: Export, a refused delete replaces the whole page, and `window.alert`

**Today (re-read).**
- **Delete.** `handleDeleteSched` (ExportDetail.jsx:157-169) sets `error` on a refusal (:167). That is the LOAD's state, and `if (error) return (…)` (:255-260) then draws only the crumb and a red box: the table, the runs and the DSR queue all vanish. The restored row cannot be seen, and the box has no Close. `setError('')` at :163 is a no-op.
  - The rollback `setSchedules(snapshot)` (:166) puts back the whole list as it was at the click, over a Pause or a new schedule that landed meanwhile.
- **Saves.** A refused schedule save or GDPR request is `alert('Save failed: ' + e.message)` (:275, :285). Offline that reads "Save failed: Failed to fetch". It is global, so after an org switch it pops over the new org's screen. The window stays open with nothing in it saying what happened.

**4a. Delete.** It is said on the panel's `actionError` banner (:98, :306-314, which has a Close and no timer). Only its own row is put back:

```js
const handleDeleteSched = async (sched) => {
    const at = Math.max(0, schedules.findIndex(s => s.id === sched.id));
    setSchedules(prev => prev.filter(s => s.id !== sched.id));
    const r = await dbWrite(`/.netlify/functions/export-schedules?id=${encodeURIComponent(sched.id)}`, { method:'DELETE' });
    if (r.ok) { setActionError(prev => (prev.startsWith(`"${sched.name}" was not `) ? '' : prev)); return; }
    setSchedules(prev => (prev.some(s => s.id === sched.id) ? prev : [...prev.slice(0, at), sched, ...prev.slice(at)]));
    setActionError(`"${sched.name}" was not deleted — ${r.error}`);
};
```

The call site becomes `handleDeleteSched(s)` (:382).

**4b. Saves (Q8).**
- Lift the two inline `onSave`s into named consts, `saveSchedule` and `saveDsr`. Each answers `''` on success or words on failure:
  - `` `The schedule was not saved — ${failureWords(e)}` ``
  - `` `The request was not saved — ${failureWords(e)}` ``
- Each modal gets `const [saveError, setSaveError] = React.useState('')`, cleared at each attempt and drawn above `DataModalFoot` as `role="alert"`. The window closes only on success.
- No `alert(` is left in the file.

**Tests.**
- **RUN, extending the Export test** (refusals-said.test.mjs:602-652) or in refusal-sweep:
  - delete refused, offline and landed;
  - a sibling row paused meanwhile keeps its change;
  - `setError` is never called;
  - the two saves' 403, 502, offline and 200.
- **WIRING:** `!/\balert\(/`; each modal draws `{saveError &&`; the call site is `handleDeleteSched(s)`.
- **The pin holds:** the count of 5 `throw new Error(await readRefusal(res));` (refusals-said :575) is unchanged, because the saves keep their throws.

**Harness candidates.**

| File | Anchor | Replacement | Caught by |
|---|---|---|---|
| ExportDetail.jsx | `` setActionError(`"${sched.name}" was not deleted — ${r.error}`); `` | `` setError(`Schedule not deleted — ${r.error}`); `` | RUN |
| ExportDetail.jsx | `setSchedules(prev => (prev.some(s => s.id === sched.id) ? prev : [...prev.slice(0, at), sched, ...prev.slice(at)]));` | `` | RUN |
| ExportDetail.jsx | `onClick={() => handleDeleteSched(s)}` | `onClick={() => handleDeleteSched(s.id)}` | WIRING |
| ExportDetail.jsx | `` } catch(e) { return `The schedule was not saved — ${failureWords(e)}`; } `` | `} catch(e) { alert('Save failed: ' + e.message); }` | RUN, WIRING |
| ExportDetail.jsx | `` } catch(e) { return `The request was not saved — ${failureWords(e)}`; } `` | `` …${e.message}`; } `` | RUN offline |

**Files:** ExportDetail.jsx; tests/refusals-said.test.mjs or tests/refusal-sweep.test.mjs.

---

### Part 5: Errors that leave on a timer: report saves and the holiday Sync

**Today (re-read).**
- **The report builder, templates and Duplicate** (`handleSaveReport`, ReportsTab.jsx:2613-2642).
  - A refusal says "Failed to save. Check your connection and try again." (:2639) whatever the cause, then clears after 4 s (:2640).
  - The six template headers and the Duplicate list draw only "Error — retry" or nothing (:2865, :3086, :3308, :3519, :3729, :4013, :4342). BuilderHeader's error span has no Close (:4182).
  - The success timer (:2634) resets any later error to idle.
  - The 403 is reachable: opening a teammate's shared report and saving it is a PUT the server refuses ('Forbidden: you can only modify your own saved reports', saved-reports.mjs:97, re-read).
- **"Save as report"** (`handleSaveAsReport`, :5630-5662): "Error — retry" for 3 s, never a reason (:5659-5660).
- **The holiday Sync** (CompanyCalendarDetail.jsx:141-189):
  - its body is read before the ok check (:151, then :153);
  - its failure is cleared after 6 s (:185-186), and STILL_SAVING after 6 s (:144);
  - a 502 page says "Failed to sync — Unexpected token '<' …", and offline "Failed to sync — Failed to fetch".

**5a. Report saves.**
- `if (!res.ok) throw new Error(await readRefusal(res));` (:2629, :5651).
- The catches say `` `The report was not saved — ${failureWords(err)}` `` and `` `The history report was not saved — ${failureWords(e)}` ``.
- The two error timers go (:2640, :5660).
- Each success timer clears only a success: `setTimeout(() => setSaveState(s => (s === 'saved' ? 'idle' : s)), 3000)`, and the same for `setSaveReportState` (Q10).
- Add `saveReportError` state. Its catch returns when `!stillOrg(askedOrg)`.
- **Where it is drawn (Q9):**
  - one module-scope `function SaveRefusalNote({ words, onClose })` (`role="alert"`, ✕ words, Close), used under `saveState==='error'` at the six template headers and above the Duplicate list;
  - BuilderHeader's span (:4182) gains a Close;
  - one banner at the top of ActivityHistoryTab's return serves its three "Save as report" buttons.
- Optional: disable Duplicate while saving, because a double press makes two copies.
- Import `{ readRefusal, failureWords }` (ReportsTab imports none today, :21).

**5b. Holiday Sync (Q11).**
- The ok check first, with the org checked after every read; the stillOrg line text is kept for harness :17835:

```js
const why  = res.ok ? '' : await readRefusal(res);
const data = res.ok ? await res.json() : null;
if (!stillOrg(askedOrg)) { inFlight.current = false; return; }
if (why) throw new Error(why);
```

- The catch says `` `Failed to sync — ${failureWords(err)}` `` with no timer. STILL_SAVING drops its timer too.
- The success clears only its own words: `const done = `✓ Synced …`; setSyncMsg(done); setTimeout(() => setSyncMsg(m => (m === done ? '' : m)), 4000);`.
- The :316 line gains a Close when it is not a ✓.
- putSettings' plain Errors pass through `failureWords` unchanged.

**Tests.**
- **RUN `handleSaveReport` and `handleSaveAsReport`** (extracted, the `useCallback` wrapper stripped, a queued `setTimeout` stub):
  - a 403 keeps 'error' after every timer is flushed;
  - a 502 → "… — The server returned 502.";
  - offline → "… — The server could not be reached.";
  - a success, then a refusal, then flushing the first timer leaves 'error';
  - a success alone → 'idle'.
- **The holiday Sync: extend S10** (tests/settings-saves.test.mjs:1857 onward; the rig `optimisticRig`, :1689):
  - the rig's `extra` adds `readRefusal` and `failureWords` (else every S10 case throws a ReferenceError);
  - its sayer (:1704) pushes whatever it is given today, so it must accept updaters (confirmed by the critic);
  - new cases: a 502 SyntaxError, offline, a success-then-failure race, and STILL_SAVING with no timer.
- **WIRING:**
  - `!/setTimeout\([^)]*set(SaveError|SaveReportError)/`;
  - no `setSaveState('idle'), 4000`;
  - `SaveRefusalNote` is defined at module scope and used 7 times, plus BuilderHeader's Close.
- **Pins kept:** reports-controls.test.mjs:43-50 and report-query.test.mjs:227 (the call sites keep their text).

**Harness candidates.**

| File | Anchor | Replacement | Caught by |
|---|---|---|---|
| ReportsTab.jsx | `` setSaveError(`The report was not saved — ${failureWords(err)}`); `` | `setSaveError('Failed to save. Check your connection and try again.');` | RUN |
| ReportsTab.jsx | the same anchor | the same, plus `setTimeout(() => setSaveState('idle'), 4000);` | RUN (flush) |
| ReportsTab.jsx | `setTimeout(() => setSaveState(s => (s === 'saved' ? 'idle' : s)), 3000);` | `setTimeout(() => setSaveState('idle'), 3000);` | RUN (race) |
| ReportsTab.jsx | `` setSaveReportError(`The history report was not saved — ${failureWords(e)}`); `` | `setTimeout(() => setSaveReportState('idle'), 3000);` | RUN |
| CompanyCalendarDetail.jsx | `` setSyncMsg(`Failed to sync — ${failureWords(err)}`); `` | `` setSyncMsg(`Failed to sync — ${err.message}`); `` | S10 |
| CompanyCalendarDetail.jsx | `setTimeout(() => setSyncMsg(m => (m === done ? '' : m)), 4000);` | `setTimeout(() => setSyncMsg(''), 4000);` | S10 (race) |

**REPOINT** "§0.228 Calendar Sync: run while a holiday save is out…" (mutate-import.mjs:17823-17826). It quotes :144 with its `setTimeout(...6000)`. Repoint onto the line without the timer, keeping the replacement `""`.

**Files:** ReportsTab.jsx, CompanyCalendarDetail.jsx; tests/refusal-sweep.test.mjs, tests/settings-saves.test.mjs.

---

### Part 6: Dispatch time off: jobs left on a technician without a word

**Today (re-read).**
- **The unassigns.** `saveBlock` (DispatchTab.jsx:6232-6287) saves the block, then sends one PUT per job.
  - A refused PUT is `if (r.ok) freed.push(jobId);` (:6268), and a network failure is `catch (e) { /* counted below by omission */ }` (:6269). It returns normally, so both dialogs close.
  - If any job was freed, the view jumps to the Queue (:6286) and the dispatcher reasonably assumes all were. Only the audit row says "— N failed" (:6282).
- **Block save words.** The block save reads its body before the ok check (:6242-6245): a 500 drops its ref, and no words reads "HTTP 500". `deleteBlock` always says "HTTP N" (:6291). ScheduleView shows `e.message` raw (:4927, :4936, :5160).
- **The tab remounts on an org switch.** DispatchTab is inside the keyed Fragment (App.jsx:2180-2257, re-read: :2223), so the map's open question is answered.

**6a. The unassigns.**
- In the loop: `if (r.ok) freed.push(jobId); else notFreed.push({ id: jobId, words: await readRefusal(r) });` and `catch (e) { notFreed.push({ id: jobId, words: failureWords(e) }); }`.
- After the :6272 stillOrg check: `if (notFreed.length) setUnassignError(notFreedWords(...))`.
- A new pure helper, `src/utils/dispatchUnassign.js` `notFreedWords(notFreed, jobs, techName, total)`, gives: "The time off was saved, but 2 of 3 jobs were not returned to the queue and are still assigned to Ann Lee — Boiler service: Forbidden: read-only role; Gutter clean: The server could not be reached. Unassign them from the Job Board." The "Job Board" and "Queue" labels were re-read at :6522-6523.
- New DispatchTab state `unassignError`, drawn above `{/* Main content */}` (:6653) so it shows in every view, as ExportDetail's actionError: kept until Close, never on a timer, cleared when a new save with unassigns begins (Q12).
- Keep the jump to the Queue when one job was freed. Do not throw. A throw keeps the dialog open, and a second press re-POSTs the block. **Correction to the map:** that POST is a same-org upsert that overwrites the block and re-runs the unassigns (dispatch-schedule-blocks.mjs:120-126, re-read), not a 409. The 409 is only for an id another org holds (:131-133).

**6b. The block save and delete words.**
- `if (!res.ok) throw new Error(res.status === 403 ? 'Your role cannot change availability.' : await readRefusal(res));` before the body (Q13).
- Then `const data = await res.json().catch(() => null); const saved = data && data.block;`. With no `saved`, throw "The time off was saved, but its answer couldn't be read. Refresh to see it." This replaces the unchecked `saved.id` (:6249).
- `deleteBlock`: `throw new Error(await readRefusal(res))`.
- ScheduleView's three catches say `failureWords(e)`.
- Import `{ readRefusal, failureWords }` (DispatchTab imports neither today, :1-22).

**Tests.**
- **RUN `saveBlock`** (extract `'    const saveBlock = async (blk, unassignJobIds = []) => {'` to `'\n    };'`; stub `dbFetch` per URL):
  - every PUT refused: the words carry each title and the server's words, there is no `setView`, and nothing is freed;
  - one offline and one freed: "The server could not be reached." for one, and the Queue with the freed job selected;
  - all freed: no words;
  - `stillOrg` false after the first PUT: nothing said.
- **RUN `notFreedWords`.**
- **RUN `deleteBlock`, and the block half with `unassignJobIds []`:** a 500 with requestId → "(ref …)"; a 502 → "The server returned 502."; a 403 → the role words; a 200 that is not JSON → the plain words, and `setBlocks` is never called with undefined.
- **WIRING:**
  - the banner's `role="alert"`, Close, and no setTimeout;
  - `/* counted below by omission */` is gone;
  - in `between('const ScheduleView = ', 'const ShiftPatternDialog = ')`, there are 3 `setErr(failureWords(e))` and no `setErr(e.message)`.
- DispatchTab joins `SWEPT` in Part 11.

**Harness candidates.**

| File | Anchor | Replacement | Caught by |
|---|---|---|---|
| DispatchTab.jsx | `else notFreed.push({ id: jobId, words: await readRefusal(r) });` | `else notFreed.push({ id: jobId, words: 'HTTP ' + r.status });` | RUN |
| DispatchTab.jsx | `} catch (e) { notFreed.push({ id: jobId, words: failureWords(e) }); }` | `} catch (e) { /* counted below by omission */ }` | RUN |
| DispatchTab.jsx | `if (notFreed.length) setUnassignError(` | `if (false) setUnassignError(` | RUN |
| DispatchTab.jsx | `if (!res.ok) throw new Error(res.status === 403 ? 'Your role cannot change availability.' : await readRefusal(res));` | `… : 'HTTP ' + res.status);` | RUN |
| DispatchTab.jsx | `try { await onSaveBlock(editing); setEditing(null); }\n        catch (e) { setErr(failureWords(e)); }` | `…catch (e) { setErr(e.message); }` | WIRING |

**Files:** DispatchTab.jsx, src/utils/dispatchUnassign.js (new); tests/refusal-sweep.test.mjs.

---

### Part 7: Three more silent ones: the quote PDF, coaching notes, and the calendar box

**7a. The quote PDF's silent fallback (Q14, Q15).**
- **Today (re-read).** In `handleExportPDF` (QuotesTab.jsx:1849-1869), `if (!res.ok) throw new Error('PDF generation failed')` (:1859) drops the server's words. Then ANY failure opens a print copy in a new tab and calls print 0.4 s later (:1863-1867), with no word.
  - The print copy's rows are whole dollars (`Math.round(li.lineTotal)`, :1866), while its totals are to the cent. That breaks §18b124 rule 2.
  - There is no `stillOrg`: QuotesTab imports only `dbFetch` (:8).
  - This hid a real outage, every PDF a 500 until §0.234 (tests/customer-docs.test.mjs:217-219, from the map).
- **Fix.** A new helper, `src/utils/quotePdfAnswer.js` `quotePdfOf(send)`, returns `{ blob }` or `{ error }` and never throws (readRefusal on `!ok`, failureWords in its catch). The handler:
  - takes `askedOrg`, keeps the request text (harness :20137), then `if (!stillOrg(askedOrg)) return;`;
  - on error, `setPdfError(`The PDF was not made — ${answer.error}`)`;
  - on a blob, downloads it and clears.
- **Where it is drawn.** `pdfError` is drawn under the Download PDF button (:2230-2234) as ⚠ words with a Close. It offers "Print a copy instead", a button whose click opens the copy, so the browser allows it.
- **The print copy moves.** It moves into a module-scope `printQuoteCopy(...)`, with its lines to the cent (`fmtMoney`-style, as the totals). Its pins (tests/quote-tax-screens.test.mjs:232-237, inside `handleExportPDF` today) move to the new function, the same text.

**7b. Coaching notes (Q1, Q17).**
- **Today (re-read).** `addCoachingNote`, `markCoachingNoteRead` and `deleteCoachingNote` (useCoachingNotes.js:54-80) have no try. Offline they reject.
  - The dialog (CoachingNoteDialog.jsx:51-60) awaits `onSave` before `setSaving(false)`, so it stays "Saving…" forever with Send and Cancel disabled.
  - Home's "Mark read" (HomeTab.jsx:681) ignores its answer.
  - TeamTab's delete banner (SalesManagerTab.jsx:1408-1410) has no Close.
  - A failed load reads as "no notes" (:26, :46).
  - `errorOf` (:13-15) drops the ref, and it is a body read the scan flags (:14).
- **Fix in the hook.**
  - Imports gain `.js`.
  - `errorOf` becomes `readRefusal`.
  - Each write goes through one module-scope `answered(send, onOk)` that never throws (`failureWords` in its catch). The existing stillOrg lines are kept verbatim (tests/org-switch.test.mjs:102; harness ~:5221).
  - A load failure keeps `coachingNotesError`, returned by the hook.
- **Wire it through App (found by the critic, re-read).** App takes only four names from the hook today (App.jsx:756: `coachingNotes, addCoachingNote, markCoachingNoteRead, deleteCoachingNote`) and hands the same four to appContextValue (:1863). `coachingNotesError` is added to both. App.jsx is CRLF.
- **Fix in the screens.**
  - Home's Mark read: `askedOrg`, then `if (!r.ok && stillOrg(askedOrg)) setPressNotices(list => [...list, pressNoticeOf('Coaching note', `Not marked read: ${r.error}`)])`.
  - TeamTab's banner gains a Close (as AdminTab's).
  - Sales Manager's "Recent coaching" and Home's "Notes from your manager" read `coachingNotesError` from `useApp` and say "Coaching notes couldn't be loaded (…). Reload the page to try again." instead of hiding.

**7c. Quick Log's "📅 Add to Google Calendar" (Q16).**
- **Today (re-read).** The box (QuickLogFab.jsx:150-154) promises an event. The submit never sends the flag and calls no calendar (:165-201, a direct `dbWrite`). `addToCalendar` is stored nowhere (no column). The three add paths are unreached:
  - `fireActivityCalendarEvent`, useActivities.js:89 (its body read :116);
  - `fireCalendarEvent`, useTasks.js:88 (its body read :109);
  - `handleAddTaskToCalendar`, useTasks.js:212 (its body read :233), handed out at App.jsx:1885 and called by no component.
  - The Google grant is `calendar.readonly` (calendar-oauth-start.mjs:30), so a wired add would most likely be refused. That is not tried live.
- **Recommended: remove them.**
  - the box;
  - `addToCalendar` from the resets (useUIState.js:17; QuickLogFab.jsx:161, :199; useActivities.js:185) and the `false` keys (TaskRail.jsx:395; App.jsx:1284);
  - the two fire functions, `handleAddTaskToCalendar`, `calendarAddingTaskId` and `calendarAddFeedback` (useTasks.js:28-29, :253-254, :259; App.jsx:369, :372, :1885).
  - This also removes three of scan (iii)'s flags (useActivities.js:116, useTasks.js:109, :233). If Q16 says "Wire it" instead, those three reads need the ok-first fix and their silent `console.warn` catches become words.
  - calendar-add-event.mjs stays for §3.6's meetings.

**Tests.**
- **RUN `quotePdfOf`:** 200 → `{ blob }`; 404 → "Quote not found"; 500 with ref; 502 → "The server returned 502."; offline; a 200 whose blob() throws → "Its answer could not be read.".
- **WIRING for `handleExportPDF`:** `quotePdfOf(`; `stillOrg(askedOrg)` before any setter; no `window.open` in the failure path; `pdfError` with a Close.
- **RUN the coaching hook** as tests/document-refusals.test.mjs runs useDocuments (renderToString probe, stubbed fetch). Add, read and delete each give 403 words, a 500 with ref, a 502, offline and a non-JSON 200, and each resolves `{ ok:false, error }`, never rejecting. A failed load sets `coachingNotesError`.
- **WIRING:** Home's Mark read under stillOrg; TeamTab's Close; App.jsx's destructure and appContextValue both name `coachingNotesError`.
- **For the calendar:**
  - a scan that no src file reads `addToCalendar` and QuickLogFab has no "Add to Google Calendar";
  - a class scan that no function calling `calendar-add-event` has a catch whose only statement is console.warn/console.error, with a self-test.
- **SWEPT** gains useCoachingNotes.js, quotePdfAnswer.js and HomeTab.jsx.
- **Retired, named in the state section (not weakened):**
  - tests/in-org-gates.test.mjs §8's calendar counts (:252-253);
  - the names `fireActivityCalendarEvent|fireCalendarEvent` in late-answers.test.mjs's `WRITING_HELPERS` (:72).

**Harness candidates.**

| File | Anchor | Replacement | Caught by |
|---|---|---|---|
| quotePdfAnswer.js | `if (!res.ok) return { error: await readRefusal(res) };` | `if (!res.ok) return { blob: await res.blob() };` | RUN |
| quotePdfAnswer.js | `} catch (e) { return { error: failureWords(e) }; }` | `} catch (e) { return { error: e.message }; }` | RUN |
| QuotesTab.jsx | `if (!stillOrg(askedOrg)) return;\n        if (answer.error) { setPdfError(` | `if (answer.error) { setPdfError(` | WIRING |
| useCoachingNotes.js | `} catch (e) { return { ok: false, error: failureWords(e) }; }` | `} catch (e) { throw e; }` | RUN |
| HomeTab.jsx | `if (!r.ok && stillOrg(askedOrg)) setPressNotices(` | `if (!r.ok) setPressNotices(` | WIRING |
| useUIState.js | `{ type: 'Call', notes: '', opportunityId: '', contactId: '', contactSearch: '' });` | `… contactSearch: '', addToCalendar: false });` | scan |

**RETIRE and name** the three calendar entries (mutate-import.mjs:4757-4768). Check the handleExportPDF entries (:20013, :20137 and any others quoting its lines) for staleness.

**Files:** QuotesTab.jsx, src/utils/quotePdfAnswer.js (new), useCoachingNotes.js, HomeTab.jsx, SalesManagerTab.jsx, QuickLogFab.jsx, useActivities.js, useTasks.js, useUIState.js, TaskRail.jsx, App.jsx; tests/refusal-sweep.test.mjs, tests/in-org-gates.test.mjs, tests/late-answers.test.mjs, tests/quote-tax-screens.test.mjs.

---

### Part 8: Raw "Failed to fetch" and "HTTP N" in the swept files

**Today (re-read by grep).** Raw `e.message` shown to a member:

| File | Lines |
|---|---|
| ExportDetail | :123, :202 |
| ApiKeysDetail | :51, :434, :490 |
| AutomationsDetail | :188, :364, :381, :390, :403 |
| WebhooksDetail | :65, :170, :185, :195 |
| BackupDetail | :466 |
| DispatchVehiclesDetail | :285, :328, :343, :370, :385, :403 |
| useDocuments.js | :56 (a swept file the map missed: a download offline says "Download failed — Failed to fetch") |
| CompanyCalendarDetail | :98 (`` setCalError(`${label} not saved — ${e.message}`) ``; found by the critic, in a file scan (iv) covers) |

- DispatchVehiclesDetail's deletes say "HTTP N" (:339, :381).
- **AutomationsDetail's toggle and delete** are optimistic (:371, :385). Their catch calls `load()`, and a failed reload replaces the refusal's words and leaves the wrong state standing. (`rule.name` exists, confirmed.)
- **putSettings, the shared Settings sender** (saveSettings.js:68-69), falls back to 'HTTP N' and drops the ref. Its read is already inside `if (!res.ok)`, so the order is right; only the words are wrong.
- **Two new org checks.**
  - ExportDetail's ad-hoc export still saves the old org's file after a switch: no `stillOrg` before the download.
  - BackupDetail's Run backup is the same before `saveSnapshotFile` (:463). Its reachability is unverified (it needs a switch in a narrow window).

**Fix.**
- **Every site above says `failureWords(e)`.** Plain Errors (readRefusal's words, a screen's role sentence, putSettings' own words) pass unchanged. Imports become `{ readRefusal, failureWords }`.
- **ExportDetail's load** may say "Export couldn't be opened (…). Reload the page to try again." (§18b123 rule 4, a read said apart). The ad-hoc export takes `askedOrg` and checks it before the download. Import `requestOrg, stillOrg`.
- **BackupDetail:** `if (!stillOrg(askedOrg)) return;` before `saveSnapshotFile`.
- **AutomationsDetail toggle and delete:** put back by row, with no reload:
  - `setAutomationList(prev => prev.map(r => r.id===rule.id ? rule : r))`;
  - the delete re-inserts at the row's index;
  - say `` `"${rule.name}" was not paused — ${failureWords(e)}` ``.
- **DispatchVehiclesDetail deletes:** `res.status === 403 ? '<role words>' : await readRefusal(res)` (Q13).
- **useDocuments.js:56:** `failureWords(e)`. It stays raw only until documentsStorage throws plain words (Part 12). failureWords then passes them through.
- **putSettings :68-69:** `let d = null; try { d = await res.json(); } catch (_) {}`, then `const msg = refusalWords(res, d)` (the ref kept, "The server returned N."), then `stale = staleOf(res.status, d)`. `staleOf` accepts `null` (settingsRevs.js:145 reads `body?.code`; confirmed by the critic). Import `refusalWords` from '../../../utils/refusalWords.js' (check the relative path at build). The 403's Admin sentence (:67) stays.
- **CompanyCalendarDetail:98:** `failureWords(e)`.
- **Optional:** a Close on the ApiKeys, Automations and Webhooks page banners.

**Guard: scan (iv), new in refusals-said.** In the files it lists (`SWEPT` as of this Part, plus CompanyCalendarDetail), no `CatchClause` param's `.message` is read unless named.
- It uses AST, with self-tests for `e.message`, `e?.message`, `(e && e.message)` and a template.
- **An argument of a `console.*` call is exempt** (with its own self-test). Files swept by then read the catch's `err.message` in console lines: useOpportunities.js:20 (`console.warn('mention-sms (non-blocking):', err.message)`) and useCoachingNotes.js:46 (the load's `console.warn`). Without the exemption these fail the scan for a line no member sees.

**Tests.**
- **RUN:**
  - Automations toggle and delete: put back; the words kept when `load` fails; never "Failed to fetch";
  - DispatchVehicles deletes: a 500 with ref, a 502, a 403 with role words, offline (extend tests/legacy-dispatch-import.test.mjs);
  - BackupDetail offline (extend refusals-said :761-787);
  - putSettings: a 500 with ref, a body-less 502, a stale 409 still stale;
  - ExportDetail ad-hoc: switched away → no file saved.
- **Moved pins (not weakened):**
  - refusals-said :574-575 ONE_HELPER → the two-name import;
  - :587, the run-history line → `` } catch(e) { setRunsFor({ rule, runs: [], error: failureWords(e) }); } ``;
  - legacy-dispatch-import.test.mjs:19/:227, the import line, and `loadOf` (:183) gains a `failureWords` parameter.

**Harness candidates.** One per file, each replacing `failureWords(e)` with the old raw read, each caught by scan (iv) and the RUNs, plus:

| File | Anchor | Replacement |
|---|---|---|
| AutomationsDetail.jsx | `setAutomationList(prev => prev.map(r => r.id===rule.id ? rule : r));` | `` |
| DispatchVehiclesDetail.jsx | `if (!res.ok) throw new Error(res.status === 403 ? 'Your role cannot delete vehicles.' : await readRefusal(res));` | `… : 'HTTP ' + res.status);` |
| the equipment twin | the same | the same |
| saveSettings.js | `const msg = refusalWords(res, d);` | `const msg = d?.error \|\| 'HTTP ' + res.status;` |
| ExportDetail.jsx | the ad-hoc `if (!stillOrg(askedOrg)) return;` (once in the file; ExportDetail has no `stillOrg` today) | `` |

**REPOINT** "§0.243 Automations: a refused run history said behind the window…" (mutate-import.mjs:20436-20438), whose anchor quotes :403.

**Files:** ExportDetail, ApiKeysDetail, AutomationsDetail, WebhooksDetail, BackupDetail, DispatchVehiclesDetail, CompanyCalendarDetail, useDocuments.js, saveSettings.js; tests/refusals-said, tests/legacy-dispatch-import, tests/refusal-sweep.

---

### Part 9: A read that failed is shown as none or zero

**Today (re-read).**
- **The Settings overview cards** (src/Tabs/AdminView.jsx). :330, :336, :343 and :349 read the counts with no ok check. A refusal reads "No active keys", "No endpoints", "No rules yet" and "0 recent events". `healthChecksOf` then counts "Webhooks all healthy" as passing (settingsCards.js:239-240), raising the Workspace Health score on a failed read.
  - :353, the backup read, also comes before its ok check (`backupRes.value.ok`, :355). Its count is gated already; its read is not. (An earlier draft left it out.)
  - :366 (MFA) and :372 (jobs) check `x.value.ok` first, but scan (iii) counts only a plain name's `.ok`, so it flags them too.
- **The Recently changed feed** reads `.then(r => r.json())` (:388), so it stays empty, with nothing said.
- **Approval tiers' "Last 90 days"** (ApprovalTiersDetail.jsx:225-228, the read at :226): no ok check, so every tier shows 0 (:433).
- **Company calendar `loadOrgCals`** (CompanyCalendarDetail.jsx:106-114, the read at :110): no ok check, so a failure shows "No corporate calendar connected." (:338).
  - `orgCals` starts as `useState([])` (:63), and the page reads `orgCals.length` at :321 and :343. The empty words show whenever the length is 0.
  - `calError` (:69) is shared with the holiday add/delete (:86, :90, :98) and the disconnect (:122, :126), each of which clears it.
- **The Dispatch Settings reads:**
  - **Job templates** (DispatchJobTemplatesDetail.jsx:123-129): a refused or failed equipment read still sets `equipLoaded` true. `migrateEquipment` (:162-167, :63-86) then runs against no categories and files every legacy requirement as unmatched with `equipCategories: []`. Its own comment (:158-160) says that "persist[s] that on the next save". **This is a data risk, and it is permanent:** the save sends every template (:186-193), and `migrateEquipment` returns early once `equipCategories` is an array (:64), so no later good read repairs it. (Both confirmed by the critic.)
  - **Property types** (DispatchPropertyTypesDetail.jsx:106-117): a failed customers read makes every count 0, so `canRemove` is true (:184) and a type still in use can be removed. The comment's "falls back to safe" is wrong.
  - **Crews' pickers** (DispatchCrewsDetail.jsx:24-31, :42-57; confirmed by the critic): silent, empty.
- **Counts beside a failed load** (from the map; not re-read): ApiKeys, Automations and Webhooks still draw "0 active keys", "0 rules · 0 active" and "0 endpoints".

**Fix.**
- **AdminView: one reader, plain names.** Gating on `<x>Res.value.ok` would leave every site flagged by scan (iii). Instead, a pure helper in settingsCards.js reads every answer, ok first, off a plain name:

  ```js
  export const answerOf = async (settled) => {
      if (settled.status !== 'fulfilled') return null;
      const res = settled.value;
      if (!res.ok) return null;
      return res.json().catch(() => null);
  };
  ```

  - Lift the count block into a pure `liveCountsOf(results)` in settingsCards.js, each count `const d = await answerOf(keysRes); if (d) { … }`. That covers the keys, webhooks, automations, audit, backup (`if (d) counts.backupChecked = true;`, as today's "an answer, even no snapshots"), MFA and jobs. A failed read leaves its count undefined: the card stays blank, and healthChecksOf has no webhooks check.
  - AdminView then has no flagged read and needs no named site. :366/:372 drop out of Part 12's named false positives.
  - The feed becomes `.then(r => (r.ok ? r.json() : null))` and says "The recent changes could not be read." (Q18).
  - **Moved pins:** tests/job-heartbeat.test.mjs:226 (`if (jobsRes.status === 'fulfilled' && jobsRes.value.ok) {`) and tests/settings-cards.test.mjs:120 (`if (backupRes.value.ok) counts.backupChecked = true;`) move to `liveCountsOf`'s text, the same meaning (a 403 or a 500 leaves the check out; a backup answer reaches the checks), backed by the RUN below.
- **Approval tiers.** The ok check first; `statsError` = `` `The approval record could not be read — ${failureWords(e)}` ``, drawn in place of the tier rows (Q19).
- **`loadOrgCals`.** The ok check first. On failure, a separate state `orgCalsError` = `` `Corporate calendars could not be read — ${failureWords(e)}` `` (not `calError`, which the holiday saves and the disconnect clear). `orgCals` stays `[]` (no null, so :321 and :343 stand); the empty words at :338 are drawn only when `!orgCalsError`, and `orgCalsError` is drawn in their place with a Close. A good reload clears it.
- **Job templates.** On a failed equipment read, set `equipError` and do NOT set `equipLoaded`, so no migration runs. Say "The equipment list couldn't be read — requirements are left as they are. Reload the page to try again.", and refuse Save while it is set.
- **Property types.** On a failed read, `customersRead` is false and every Remove is disabled, with "Usage couldn't be read — reload before removing a type."
- **Crews.** Say the pickers' failed reads.
- **ApiKeys, Automations, Webhooks.** After a failed load, draw "—" for the counts and no "No … yet".

**Tests.**
- **RUN `answerOf` and `liveCountsOf`** with `{ ok:false, status:500 }`, a rejected settle, and a 200 whose json throws: the totals are undefined, there is no webhooks check, and no MFA, jobs or backup check; a 200 with no snapshots still sets `backupChecked`.
- **WIRING:**
  - each read's `.ok` before `.json()` (scan iii);
  - ApprovalTiers' zero fallback is used only with no `statsError` (string order);
  - the calendar's empty words sit under `!orgCalsError`, and no `setCalError('')` clears `orgCalsError`;
  - JobTemplates' `setEquipLoaded(true)` never sits in the `!res.ok` branch or the catch;
  - PropertyTypes' `canRemove` names `customersRead`.
- **SWEPT** gains AdminView.jsx, settingsCards.js, ApprovalTiersDetail.jsx, CompanyCalendarDetail.jsx, DispatchJobTemplatesDetail.jsx, DispatchPropertyTypesDetail.jsx and DispatchCrewsDetail.jsx. None needs a named site.

**Harness candidates.**
- settingsCards.js `if (!res.ok) return null;` → ``. Caught by scan (iii) and the RUN.
- settingsCards.js `if (d) counts.backupChecked = true;` → `counts.backupChecked = true;`. Caught by the RUN (a refused backup read).
- JobTemplates `if (!res.ok) { if (!cancelled) setEquipError(` → `if (!res.ok) { if (!cancelled) setEquipLoaded(true);`. Caught by WIRING.
- CompanyCalendarDetail the empty words' `!orgCalsError &&` → ``. Caught by WIRING.
- ApprovalTiers and loadOrgCals: drop the new ok line. Caught by scan (iii).
- **Do not use** the map's `… void 0;` mutant on `setOrgCals(...)`. It is equivalent and always survives.

**Files:** AdminView.jsx, settingsCards.js, ApprovalTiersDetail, CompanyCalendarDetail, DispatchJobTemplatesDetail, DispatchPropertyTypesDetail, DispatchCrewsDetail, ApiKeysDetail, AutomationsDetail, WebhooksDetail; tests/refusal-sweep, tests/refusals-said, tests/job-heartbeat, tests/settings-cards.

---

### Part 10: The record hooks and their windows

**Today.** The guard's own `bodyReadsBeforeOkOf`, re-run read-only over src on 11 Nov (the designer's run, re-run by the critic and by the reviser), flags these bare `res.json()` before the ok check:

| File | Lines |
|---|---|
| useAccounts.js | :235 |
| useActivities.js | :144 (and :161, hidden by the scan's limit); :116 is the calendar add, gone with Part 7 |
| useContacts.js | :137 (and :153, hidden) |
| useQuotes.js | :87, :147 |
| useTasks.js | :125 (and :148, hidden); :198 is Part 2's, :109 and :233 Part 7's |
| useUserHandlers.js | :58 (and :92, hidden) |
| useMerge.js | :105, :151, :194 |
| LeadModal.jsx | :402 |
| AccountPicker.jsx | :77 |
| OpportunityModal.jsx | :699 |

- A 502 page in the hooks says "Failed to save X. Please check your connection and try again." (useAccounts.js:261, useActivities.js:153/:170, useContacts.js:146/:162, useTasks.js:139/:162, useUserHandlers.js:77/:117). That blames the connection when the server answered (Q3).
- In LeadModal and the merge scans it says "Unexpected token '<'".

**Fix (mechanical, per site).**
- `if (!res.ok) { set<X>ModalError(await readRefusal(res)); return; }` (after the existing stillOrg) before `const data = await res.json()`.
- Each catch says `failureWords(err)`.
- The duplicate scan views and PastMerges show `failureWords`.
- AccountPicker's 'HTTP N' becomes readRefusal.
- useQuotes :159's "check your connection" becomes failureWords.

**Tests.**
- **RUN one representative extracted save**, `handleSaveAccount`, with the five answers.
- **SWEPT** gains every file above, which is the WIRING for the rest.
- **The hidden shape.** An `.ok` read anywhere earlier in the function counts today, so a check in an earlier, separate branch hides a later read (the four "hidden" rows above; §0.243's known limit). Tighten `okReadBefore`: the check must sit in a statement that encloses the read, or comes before it in a block that encloses the read. Add a self-test for the hidden shape (`if (a) { if (!res.ok) … } else { res.json() }` is flagged). Note that the tightened rule still counts an enclosing check as a check: ReportsTab.jsx:2560 sits inside `if (!res.ok && data.field …)` (:2549) and stays unflagged. If the tightening is not done, it stays filed and these four are fixed by hand.
- **Pins kept:** tests/leave-out.test.mjs:57-62 (`HOOKS`) pins each hook's list line (`setContacts(… (data.contact || shownRow(payload)) …)` and its siblings): keep `data` as the variable. (An earlier draft named link-ids :483-485; those pin the task completion, which is Part 2's.)

**Harness:** for each hook, its new ok line → removed. Caught by scan (iii). **Do not use** the map's `const data = await res.json(); void data;` mutants: they are equivalent.

**Files:** about 14 (the hooks, LeadModal, AccountPicker, OpportunityModal, DuplicateScanView, ContactDuplicateScanView, PastMerges); tests/refusal-sweep, tests/refusals-said.

---

### Part 11: Dispatch's remaining reads and words

**Today (the map, spot-checked against the scan run and the grep; the new rows re-read).**
- DispatchTab flags :1201, :1261, :3131, :3578, :3924, :3950, :4110, :4252, :4284, :5612, :5644, :5966, :5999, :6039, :6300, :6314, :6396 (and :6242, done in Part 6), plus :5788-5795 (the load-all, below).
- It has 14 raw `.message` reads (`e.message`, `err.message`: :1235, :1274, :3143, :3592, :4293, :5258, :5299, :5898, :6077, :6197, :6425, plus Part 6's three).
- It has 16 lines with an "HTTP N" fallback (14 outside Part 6's :6245 and :6291).
- **No catch.** `recordVisit` (:5606-5621) and `renewAgreement` (:5639-5655) have none, so offline is an unhandled rejection with nothing said. `submitPending` (:2285-2293) awaits `onSkip`/`onDefer` (which are `recordVisit`), so offline it leaves the skip/defer editor open, silent.
- **A 200 that is not JSON reads as success or as an empty list** (found by the critic, re-read): the invoice panel's history (:3922-3929) and its sender (:3948-3955) read `res.json().catch(() => ({}))`, so a landed answer that cannot be read is adopted as `{}`; the Invoices list (:4108-4113) shows no invoices. An ok-first fix alone does not close this.
- **The job record's address read is silent** (:4208-4217): `if (!res.ok) return;` and `catch (e) { /* address panel stays hidden */ }`. A failed read looks like a job with no address.
- **The main load** (:5776-5795) says statuses only ("Dispatch data failed to load: jobs (500)"). Its eight bodies are read after the ok check through a `.filter` the scan cannot see. A 200 whose body is not JSON throws a SyntaxError there, and :5898 shows `err.message` as the whole tab ("Unexpected token '<'…", drawn in place of Dispatch at :6440-6442).
- DispatchServicePlansDetail (:276, :317, :330, :351, :371) is the same class.

**Fix.**
- The ok check first with readRefusal, keeping Dispatch's 403 role sentences (`res.status === 403 ? '…' : await readRefusal(res)`, Q13).
- Every catch says `failureWords`.
- `recordVisit` and `renewAgreement` get a catch that says it on the visit-action banner (`visitActionError`, the map's :2308-2313), and `recordVisit` answers `false`, so `submitPending` keeps the editor open with the banner's words. That banner gains a Close.
- The invoice reads: after the ok check, `const data = await res.json().catch(() => null);`, and with no `data` say "{the action} — Its answer could not be read. Reload to see it." instead of adopting `{}` or showing an empty list.
- The address read says "The address couldn't be read." in the panel's place (Q20).
- The main load: the per-list words keep the server's words where it sent them (`jobs: Forbidden…`), and :5898 says `failureWords(err)` (a plain "Dispatch data failed to load: …" passes through; a SyntaxError says "Its answer could not be read."), with "Reload the page to try again." The whole-tab replacement stays: there is nothing to show without the lists.

**Moved pins:**
- tab-layers.test.mjs:321 (`Not saved — ${e?.message …}`) → failureWords;
- agreement-renewals.test.mjs:79-80 (the two "(HTTP ${res.status})" lines) → readRefusal;
- plan-links.test.mjs:105-116.

**Harness:** REPOINT "§0.231 the shift pattern's refused save is silent again" (mutate-import.mjs:18460-18463) and the ServicePlans seed entry (~:17032, from the map).

**SWEPT** gains DispatchTab.jsx and DispatchServicePlansDetail.jsx. The load-all's ok-through-a-filter reads (:5788-5795) and ServicePlans :276 (flagged twice) are named sites, each with a `check` pin (`.filter(([, r]) => !r.ok)` before the read). This Part adds the `check` field to `BODY_FIRST` (see "What every Part shares").

**Files:** DispatchTab.jsx, DispatchServicePlansDetail.jsx; tests/tab-layers, tests/agreement-renewals, tests/plan-links, tests/refusals-said, tests/refusal-sweep.

---

### Part 12: The rest of src/, and the guard over all of src/

**The sites (scan run of 11 Nov):**

| File | Lines |
|---|---|
| UsersDetail | :186, :466, :847, :861, :873, :1030, :1070, :1537 (with 14 raw `.message` and 6 'HTTP N' by grep) |
| ConnectedAppsDetail | :124, :403, :414, :426, :437, :500 (7 raw `.message`) |
| AuditDetail | :395, :464 (and :32, `errorOf`, named) |
| MfaDetail | :29 |
| LeadScoringDetail | :137 |
| AppHeader | :222, :302, :338 |
| ModalLayer | :737, :1255 |
| PipelineTab | :590 |
| QuotesTab | :1633, :1659, :1680, :1814 |
| ReportsTab | :2429 (the prompt's fallback), :2520, :2545, :2582 (the library: patchReport, togglePin, sendNow; toggleShare and saveDelivery say raw `e.message`, from the map) |
| SalesManagerTab | :476, :504, :1069 |
| ContactRail | :319 |
| App.jsx | :517 (`.then(checkOk)`, named with a pin) |
| calendarConnect | :21 |
| documentsStorage | `asJson` itself (:31) is flagged; what the scan cannot see is the four calls through it. The file never checks `res.ok` (re-read :31, :150) |

- ConnectedAppsDetail's `disconnectCalendar` (:481-487, re-read) leaves its row busy forever when `reloadCal` (:435-439) throws offline: there is no try, so `setBusy(null)` is never reached.
- AuditDetail's `sendTest` (:460-468, re-read) has `try/finally` and no catch: offline it is an unhandled rejection and nothing is said. Its refusal words `data?.error || the server returned N` drop the ref, and its body is read before the ok check (:464).

**Fix.**
- The same mechanical shape everywhere.
- `disconnectCalendar` clears busy in a `finally`.
- `sendTest`: `if (!res.ok) { setDestError(`Test not sent — ${await readRefusal(res)}`); return; }` before the body, and a catch `setDestError(`Test not sent — ${failureWords(e)}`)`.
- documentsStorage checks `res.ok` and throws `readRefusal`'s words. `asJson` is deleted: dbFetch always returns a Response (CLAUDE.md).
- The report prompt says `Claude could not read this one (${await readRefusal(res)}) — read by the built-in interpreter instead.`
- **Optional (Q4):** `NETWORK_ERROR` (storage.js:100) becomes "The server could not be reached." It reaches 31 `dbWrite(` calls; no src code compares against the literal. Moved pins: tests/document-refusals.test.mjs:95, tests/merge-undo.test.mjs:666 and :700 (member-profile-save and settings-saves use the constant and follow it).

**The guard widened.** Scan (iii)'s `SWEPT` becomes `srcFiles()`. The `reads >= 20` floor is raised to the count at build: 202 reads over all of src today (28 of them in today's `SWEPT`), less those earlier Parts delete (Part 7's three calendar reads, `errorOf`; this Part's `asJson`). (An earlier draft said 174, which was the count outside `SWEPT` only.) `BODY_FIRST` names, each with its reason:

| Site | Reason |
|---|---|
| refusalWords.js:24 | readRefusal itself |
| storage.js:94 | refusalOf |
| storage.js:107 | bodyOf, read after ok |
| AuditDetail.jsx:32 | errorOf, called only after `!res.ok` |
| bulkClient.js:47 | readJson, `r.ok` on the next line |
| saveSettings.js:89 | writeSettings, read once, then refusalOf over it |
| useOpportunities.js:288 | saveDealNote (named in Part 1) |
| ReportsTab.jsx:2545 | the pin retry reads `field` (its second read, :2560, sits inside the `!res.ok` check and is not flagged: naming it would be a stale entry) |
| UsersDetail.jsx:186 / :873, ModalLayer.jsx:737 | per-invite `errors` read by design |
| ContactRail.jsx:319 | fail open by design |
| calendarConnect.js:21 | reason only |
| ConnectedAppsDetail.jsx:426 | silent by design |
| BackupDetail.jsx:109 | the restore, as today |

- **Named false positives carry a pin** (the `check` field, from Part 11): DispatchTab.jsx:5788-5795, DispatchServicePlansDetail.jsx:276 and App.jsx:517 (`.then(checkOk)`). AdminView has none since Part 9's `answerOf`.
- **The count.** 109 flags over `.json()` across src; 108 once BackupDetail:109 (already named) is left out. (TerritoriesDetail.jsx:233's `file.text()` is not a response, and this scan does not see it.)
- **Scan (iv) keeps its own explicit list.** Widening it to all of src is filed (OUT): 140 grep hits, including the error boundaries by design and the putSettings panels' always-plain words.

**Harness:** one "drop the ok check" mutant per newly swept file, caught by scan (iii), plus one per named false positive's real check, caught by its pin.

**Files:** about 20 src files; tests/refusals-said, tests/refusal-sweep, tests/document-refusals and tests/merge-undo (if Q4).

---

### What this design re-read, and the corrections to the map

- **DispatchTab is inside the keyed Fragment** (App.jsx:2180-2257; the tab at :2223), so it remounts on an org switch. The map's UNVERIFIED is answered: its org-unchecked writes land on an unmounted tree. A `stillOrg` is still needed wherever an app-level list is written.
- **Re-pressing the time-off dialog overwrites the block; it is not a 409** (dispatch-schedule-blocks.mjs:120-133).
- **useDocuments.js:56** shows a raw `e.message` in a file already in `SWEPT`. The map did not list it.
- **ConnectedAppsDetail's `disconnectCalendar`** is at :481-487, not :474-480.
- **putSettings drops the ref** as well as falling back to 'HTTP N' (saveSettings.js:68-69).
- **Four of the map's mutants are equivalent and must not be used:** `void data` ×2 (bodyfirst-4), `void 0` (bodyfirst-2), and `const bad = [];` while that site is merely named.
- **The ⚠ toast is one shared slot,** replaced by a later toast (TaskRail.jsx:362-364). Hence Q1 recommends press notices where the map recommended the toast.
- **The map's DispatchTab findings now carried** (Part 11): the invoice reads' `{}`, the silent address read, `submitPending`, and the main load's "Unexpected token".
- **Answered since the first draft:** whether the Job templates save sends every template (yes, :186-193); whether `staleOf` accepts null (yes, settingsRevs.js:145); OpportunityModal's leave-out (:1254-1260); the S10 rig's sayer (:1704); DispatchCrews' pickers (:24-31, :42-57).
- **Not re-read, taken from the map:**
  - the server words of holidays.mjs, quote-pdf.mjs, export-schedules.mjs and _dispatchDecision.mjs;
  - the AdminView feed's catch (:413);
  - the counts ApiKeys, Automations and Webhooks draw beside a failed load.

## OUT (each to be filed in the batch's doc patch, with its OPEN_ITEMS home)

- **The Kanban touch drag looks unable to move a card.** onTouchEnd lands on the origin column (KanbanView.jsx:318-319). Not tried in a browser. §4.2.
- **Task writes send the whole screen copy.** The complete sends `next`, and the snooze sends a whole row. tasks.mjs merges it (:142), so a stale link is asked again (§18b125 rule 1). A partial body needs `ownerIdForUpdate` read first. §4.2.
- **Reports' add and remove send the whole `contactIds` list** from the screen's copy (§18b119 class). If Q7 says filed, landed changes are not adopted into the app's lists (re-picking a deal shows the loaded copy until a reload). §4.2.
- **Components defined inside a parent:** ReportsTab's BuilderHeader (:4169), ActionButtons (:5724), SubTabBtn and ContactGlance; SalesManagerTab's TeamTab (:1219) and AuditTab (:1454). New UI in this sweep is module-scope only. §4.8.
- **Coaching notes:**
  - a note whose answer was lost is re-sent with a new id, so it can be made twice;
  - a late success closes whichever coaching dialog is open.
  - §4.5.
- **Export's Delete deletes a schedule with no confirm** (ExportDetail.jsx:382), and so do Vehicles/Equipment Delete (DispatchVehiclesDetail :134, :192, from the map). Is a confirm a house rule? Not checked. §4.3 / §4.4.
- **holidays.mjs:51** calls `raw.filter` without an array check (from the map). §4.3.
- **`jobsDuringBlock` may include completed jobs** in the unassign list. Not read. §4.4.
- **`recordVisit` treats a 200 with no `visit` as a refusal** and says "(HTTP 200)" (DispatchTab.jsx:5612-5614). Part 11 replaces the words; whether such an answer can happen was not read. §4.4.
- **Scan (iv) over all of src/:** 140 `.message` reads by grep. §6.
- **Scan (iii)'s enclosing-check rule** (Part 10) still accepts any `.ok` in an enclosing condition, however it is combined (`!res.ok && …`). §6.
- **The quote PDF fallback's `window.open` after an await** may be popup-blocked. Moot once the copy is a button (Part 7).
- **Wiring real calendar events** is §3.6's meetings, not a revived box.
- **OPEN_ITEMS §1 item 6 needs a correction** in Part 2's doc patch: HomeTab's PlateRow has no Complete (:535); "67 lines" (:550) becomes 108 reads flagged by the guard's own scan (109 with the named BackupDetail read).

## QUESTIONS FOR JEFF (member-visible behaviour only)

**S. How much now?**
- **Parts 1-4 now (Recommended):** the Pipeline drag, Tasks, Reports' deal contacts, and Export's delete and alert.
- Parts 1-7 now: every silent one.
- All twelve, in five batches back to back.
- *Why:* about 14 files, the size of §0.243, and every one is something a member meets today with no word.

**Q1. When a refusal comes back to a screen with no error place of its own** (a Kanban drag, a Tasks-tab ✓ or Snooze, Home's "Mark read"), where is it said?
- **A press notice, bottom-left, "⚠ Acme renewal — Not moved to Proposal: …", kept until ✕ and cleared by an org switch (Recommended).**
- The ⚠ toast at the foot of the page, as a refused deal delete is said.
- *Why:* the toast is one slot, and a later toast (a delete's Undo) replaces it before it is read. The task window moved off it for this reason (§0.199).

**Q2. Should Dispatcher and ReadOnly members be offered the Kanban drag?**
- **Offered only to members who may change deals (Recommended).**
- Offered to all, refused and said every time.
- *Why:* today the server refuses them every time.

**Q3. What should a record window say when its save is refused or never sends** (the deal window, and the account, contact, task, activity, user and quote windows in Part 10)?
- **The house words: the server's words with their ref, else "The server returned N.", or "The server could not be reached." (Recommended).**
- Keep "…Please check your connection and try again."
- *Why:* today that sentence also shows when the server answered with an error page. The task window's offline line becomes "The task was not completed: The server could not be reached."

**Q4. Should every screen use one sentence for a change that never reached the server?**
- **Yes: "The server could not be reached." everywhere, including the 31 paths that say "Network error — the change was not saved." today (Recommended, in Part 12).**
- Keep both sentences.
- *Why:* one wording everywhere. It is one constant in storage.js, and the pins in two test files move.

**Q5. Home's "On your plate" has had no Complete button since 5 June.**
- **Remove the dead code and correct the open item (Recommended).**
- Bring back a ✓ on the plate that says a refusal as the Tasks tab does.
- *Why:* each plate row already opens the task window, which completes and says why.

**Q6. Where should a refused add, remove or persona change on Reports' "Contacts on this deal" be said?**
- **One banner in that section, "✕ … — why" with a Close. A landed change clears it, and so does picking another deal (Recommended).**
- The same banner, kept across a deal switch until closed.
- *Why:* it sits where the change was made, and the section it speaks of is gone once another deal is picked.

**Q7. Should a landed add, remove or persona change still show after picking the deal again?** Today it reverts to the loaded copy until a reload.
- **Yes, as its own small batch, filed (Recommended).**
- Yes, inside Part 3.
- No.
- *Why:* it is real, but it is not a refusal, and it needs the app's lists written under the org check.

**Q8. Where should a refused Export schedule save or GDPR request be said?**
- **Inside the open window, above its buttons. The window stays open until it saves or is closed (Recommended).**
- On the page banner behind the window.
- *Why:* as the Price Book does. A banner behind the window cannot be seen until the window is closed.

**Q9. Where should a refused report save say why?**
- **Beside the control pressed: a "✕ why" note with Close by each template's Save and above the Duplicate list, the builder's line with a Close, and one banner at the top of Activity history for its "Save as report" buttons (Recommended).**
- One banner at the top of the Reports page for all of them.
- *Why:* the words sit by what failed, and today a template or Duplicate gives no reason at all.

**Q10. May a success message keep its short timer ("✓ Saved" 3 s, "✓ Synced N federal holidays" 4 s) while a failure stays until closed?**
- **Yes, and each timer clears only its own success, never a later error (Recommended).**
- No: successes stay until closed too.
- *Why:* the rule binds refusals only, and today a success's timer can wipe a later failure.

**Q11. Where should a failed holiday Sync be said?**
- **On the red line under the Sync button, kept until a Close or the next Sync (Recommended).**
- In the calendar error banner at the top of the page.
- *Why:* it sits beside the control that failed.

**Q12. When time off is saved but some of its jobs could not be unassigned, where is that said?**
- **A banner across the top of Dispatch, above every view, naming each job still assigned and why, kept until closed. The dispatcher still goes to the Queue when one job was freed (Recommended).**
- Keep the "Already scheduled" dialog open listing the failures, without its "Accept & re-crew" button.
- *Why:* the dialog closes and the view changes, while a second press would re-save the block and re-send every unassign.

**Q13. On a 403, should Dispatch screens keep their own role sentence or say the server's words?** Examples of the role sentence: "Your role cannot change availability.", "…delete vehicles."
- **Keep the role sentence (Recommended).**
- The server's words.
- Both: "Your role cannot change availability. (the server's words)".
- *Why:* it matches §0.243's vehicle and equipment saves. Note that a 403 can also mean "Dispatch is not enabled for this workspace", which the role sentence misnames (whether the screens open while Dispatch is off is unverified).

**Q14. When the quote PDF cannot be made, what happens?**
- **Say why under Download PDF, kept until closed, with a "Print a copy instead" button (Recommended).**
- Say why only, and drop the print copy.
- Keep opening the print copy on its own, as today.
- *Why:* today a failure opens a different document with no word, and that hid every PDF failing until 9 Nov.

**Q15. Should the print copy's line totals be shown to the cent?**
- **Yes (Recommended).**
- Keep whole dollars.
- *Why:* today its rows do not add up to its own Subtotal (§18b124 rule 2).

**Q16. What happens to Quick Log's "📅 Add to Google Calendar" box?** Today it makes no event and says nothing.
- **Remove it, with the save-time adds and task button nothing reaches (Recommended).**
- Wire it, saying a failure as "Activity logged, but not added to your calendar — why".
- *Why:* the calendar connection is read-only, so a wired add would most likely be refused every time (not tried live). §3.6's real meetings are the planned way.

**Q17. When coaching notes cannot be loaded, should the screens say so instead of hiding the section as if there were none?**
- **Yes, on Sales Manager's "Recent coaching" and on Home's "Notes from your manager" (Recommended).**
- Sales Manager only.
- Keep hidden.
- *Why:* a rep with unread notes otherwise sees nothing and is not told why.

**Q18. What should the Settings overview show when a count could not be read?**
- **The card stays blank, as MFA and jobs do, and "Recently changed" says "The recent changes could not be read." (Recommended).**
- Each card says "Could not be read".
- *Why:* today a refused read shows "No endpoints" and counts webhooks as healthy in the Workspace Health score.

**Q19. When Approval tiers' "Last 90 days" cannot be read, what should the card show?**
- **One line of words in place of the tier rows (Recommended).**
- The tier rows with "—" counts.
- *Why:* today every tier shows 0, a count over a read that failed.

**Q20. When a Dispatch job's address cannot be read, what should its record show?**
- **"The address couldn't be read." in the address panel's place (Recommended).**
- Keep the panel hidden, as for a job with no address.
- *Why:* today a failed read looks exactly like a job with no address, so a dispatcher may send a technician without one.

## CRITIC

The critic re-checked the design against f5f0139 with read-only reads and a copy of the guard's `bodyReadsBeforeOkOf` (scratchpad/critic/scan.mjs). The reviser re-read every point the critic raised and re-ran that scan read-only from the repo root (202 reads, 109 flags over src; the same per-file lines). No repo file was edited, and scripts/mutate-import.mjs was read as text only. The tree still shows only `M deno.lock` and `?? src/utils/dispatchCustomer.js.bak`.

**What the critic found WRONG, and what changed:**
1. **Part 3d's persona put-back** wrote back `contact.buyerPersona`, the loaded copy, so a persona that landed earlier still reverted. Re-read: the chip shows `localPersonaMap[c.id] ?? c.buyerPersona ?? c.persona ?? ''` (ReportsTab.jsx:6347, not :6335). The fix now keeps `shown` before the flip and puts that back. The test and the harness row now cover it.
2. **Part 9 AdminView** would still fail scan (iii), which counts only a plain name's `.ok` (refusals-said.test.mjs:268-286). The backup read (:353) was missing. Re-read. The fix is now one `answerOf` helper over a plain name for all seven counts, so there are no named sites. It moves two pins the draft had not named (job-heartbeat.test.mjs:226, settings-cards.test.mjs:120).
3. **Part 9 `loadOrgCals`:** "orgCals stays null" was wrong. It starts as `[]` (:63), and :321/:343 read its length. Also `calError` is cleared by the holiday saves and the disconnect. The fix is now a separate `orgCalsError` that gates the empty words.
4. **Part 1e** moves pins it did not name. Re-read: harness :7030-7033, owner-kept.test.mjs:144-145 and leave-out.test.mjs:75. All are now named.
5. **Part 12:** ReportsTab.jsx:2560 is not flagged (an enclosing check at :2549), so naming it would be stale. It is removed. The floor is 202 over src, not 174.
6. **Part 10's pins** are in leave-out.test.mjs:57-62, not link-ids.

**What the critic found MISSING, and what was added:**
7. `coachingNotesError` must be wired through App.jsx :756 and :1863. Added to 7b.
8. Scan (iv) missed CompanyCalendarDetail.jsx:98, and it would flag the console-only `err.message` lines (useOpportunities.js:20, useCoachingNotes.js:46). Added to Part 8, with a `console.*` exemption.
9. The map's Dispatch findings, all re-read and added to Part 11:
   - the invoice reads take a non-JSON 200 as `{}`;
   - the address read is silent (now Q20);
   - `submitPending` is left open;
   - the main load shows "Unexpected token".
   AuditDetail `sendTest` (try/finally, no catch) now has a fix in Part 12.

**Smaller corrections, all applied:**
- DispatchTab has 16 "HTTP N" lines, not 11.
- OPEN_ITEMS §1 item 6 never mentioned the reminder popup.
- §0.199's harness names are at :10663/:10667/:10671 and its anchors at :10665/:10669/:10673.
- H4's body line is :638.
- `SWEPT` is at :481-486.
- Every touched file is CRLF on disk. This is now a shared rule.
- The `check` field for named false positives now lands in Part 11, the first Part that needs it.

**One disagreement, settled by re-reading:** the critic put putSettings at saveSettings.js:67-68. On disk :67 is the 403 sentence and :68-69 are `let msg …` and its `try` read, so the design's :68-69 stands.

**Confirmed by the critic and kept as is:** Parts 1, 2 and 4-7, and the Part 8-12 lines and pins not listed above. The proposed `(today)` anchors are each unique.

**Open questions the critic answered, folded in:**
- `staleOf(status, null)` is safe.
- The Job templates save sends every template, and the damage is permanent (:64).
- OpportunityModal always sends `stage`.
- The S10 sayer pushes whatever it is given.
- Crews' pickers are silent.
