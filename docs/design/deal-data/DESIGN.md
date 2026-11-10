<!-- Deal data (OPEN_ITEMS §1 item 4, §4.2): the design, 9 Nov 2026, over b1e328c. Answered 9 Nov — each of Q1-Q4 the Recommended (ANSWERS.md beside this file). Built 9 Nov (state §0.236; guide §18b119); its browser check PASSED as Karen; committed `1905c5d`; pushed to dev 10 Nov after the one scoped run (3,262/3,262). -->

# Design: a deal's notes and stage history are added to, never written back whole; a contact's Undo keeps its owner

## 1. What it is

OPEN_ITEMS §1 item 4 names two items from §4.2:

- **A deal's notes are saved as the whole list.** Two people saving at once keep the last list, so a note is dropped (§0.177 found (a)).
- **A contact's Undo can change its owner.** A re-POST with no owner is stamped with whoever pressed Undo (§0.178 found (b)).

Both were re-read in the code on 9 Nov over `b1e328c` (§2). Reading the first found its wider class: the deal's stage history is written the same way.

## 2. The map (read in code)

### 2.1 Team notes: `opportunities.comments`, a jsonb list

- **The server** writes whatever list a PUT carries. `opportunities.mjs:528` `sanitize({ ...existing, ...data })` replaces the stored list whenever a body names `comments` (`:139`). Nothing checks who wrote a note, or that the list sent is the one stored.
- **The writers.** Each sends a whole list built from the browser's copy of the deal:
  - Post, edit and delete a note go through `ModalLayer.jsx:144-152` `saveNotes`, which builds the next list from `opportunities.find(...)` and sends it alone (`useOpportunities.js:266-271` `saveDealComments`).
  - The deal window's Save sends `comments: prevOpp?.comments` (`useOpportunities.js:128`).
  - The Closed Lost dialog sends `comments: prevOppRef?.comments || formData.comments` (`:219`).
- **The browser's copy** is the deal list loaded when the page opened or the org switched (`App.jsx:502`). It is read again only after an import or a merge (`ModalLayer.jsx:679-705`, `useMerge.js:37`).
- **So a note is lost two ways:**
  - **(a) A stale tab.** A tab opened in the morning saves any field of a deal (its close date, its stage, the Closed Lost dialog). Its old list goes back with the save and erases every note a colleague posted since.
  - **(b) Two posts at once.** Each sends its own list plus its note, and the later write drops the earlier note.
  - (a) is the common one: it needs no timing, only a tab left open.
- **A note** is `{ id: 'c_' + Date.now(), text, author, timestamp, mentions, edited, editedAt }` (`OpportunityModal.jsx:1309`, `ModalLayer.jsx:209-210`). The author is the poster's name and the time the browser's clock, both set by the browser.
- **Edit and delete** are offered only on notes whose author name is the viewer's (`OpportunityModal.jsx:2142`, `:2170`). The server enforces nothing, so anyone who may save the deal can rewrite or remove any note on it, another member's included, by sending a list.
- **The server's "new note" email** (`opportunities.mjs:585-600`) finds new notes by diffing the stored list against the written one, and mails the deal's rep for each note by someone else.

### 2.2 Stage history: `opportunities.stage_history`, a jsonb list

- **The same shape.** Three writers send a whole list built in the browser, an entry appended on a stage change:
  - the deal window's Save (`useOpportunities.js:125-127`);
  - the Closed Lost dialog (`:220`, `formData.stageHistory || prevOppRef?.stageHistory`);
  - the Pipeline board's drag (`KanbanView.jsx:213-228`).
- **The loss.** A stale tab's save of a deal writes back its old history, dropping a stage move made elsewhere since, and with it that move's dates. Stage history feeds pipeline alerts' days-per-stage (`pipeline-alerts.mjs:141-148`), the AI score's prompt (`ai-score.mjs:115`) and the mention reader (`_mentions.mjs:23`).
- **The CSV path already does it right.** `_stage.mjs` `applyStageChanges` appends the entry on the server, from the stored row, when a row moves stage. The single PUT does not.

### 2.3 A contact's Undo

- **The Undo** re-POSTs each deleted contact as the browser held it (`useContacts.js:99-109`). The POST stamps its owner by `stampOwnerId` (`contacts.mjs:142`, `_lib.mjs:342-356`):
  - an `assignedRep` name is looked up again **by name** (`resolveOwnerId`, which refuses with a 409 when two members share the name);
  - **no name means the person pressing Undo owns it**.
- **What goes wrong.**
  - A rep who deletes an unassigned contact (reps may delete their own or unassigned ones, `contacts.mjs:249-255`) and presses Undo takes it from every other rep's list. A rep reads only their own and unassigned contacts (`contacts.mjs:83-96`).
  - An Admin's or Manager's Undo of an unassigned contact makes it theirs.
  - A contact whose owner shares a name with another member cannot be restored.
- **The account's Undo** is the pattern, since §0.198 (`accounts.mjs:292-302`): it marks its POST a restore (`restore: true`), honoured for an Admin alone, because only an Admin deletes accounts. It keeps the stored owner id where that is a member of this org, else none and the name with it; never the caller; and no territory rule.

## 3. The census (SELECT only, 9 Nov, host `ep-soft-morning-…us-east-2.aws.neon.tech`, the shared `main`)

| Org | Deals | With notes | Notes | With stage history | Contacts | Unassigned contacts |
|---|---|---|---|---|---|---|
| Accelerep Test `org_3BDQEH7s…` | 51 | 3 | 3 | 19 | 1,536 | 1,529 |
| Accelerep QA `org_3K6LqEB6…` | 24 | 1 | 1 | 0 | 36 | 10 |
| UKG (real) `org_3CwnbloU…` | 20 | 0 | 0 | **11** | 1,521 | **61** (4 holding a rep's name, no owner id) |
| two others | 3 / 0 | 0 | 0 | 0 | 0 / 1 | — / 1 |

- **Four notes in all.** Their keys are `id`, `text`, `author`, `mentions` and `timestamp`, plus `edited` and `editedAt` on one. Every id is unique, and every author name is exactly one member of the note's org.
- **Nothing to migrate.** No note has been lost that the data shows. UKG's stage history is real and live.

## 4. The design (recommended)

**R1: a note is one operation the server applies to the stored list (Q1).**
- The deal PUT takes `{ id, note: { op: 'add' | 'edit' | 'delete', … } }` and applies it in one statement against the row as stored:
  - add: append;
  - edit: replace the text of the note with that id;
  - delete: remove it.
- Two posts at once both land, and a stale tab adds to what is stored. A note edited or deleted since the screen loaded is a 409 that says so, nothing written. The screen shows the notes the server answers.
- A PUT's whole `comments` list is refused (400) for every caller, so no screen can write notes back whole again.
- The deal window's Save and the Closed Lost dialog stop sending notes.

**R2: the server writes who and when (Q2).**
- An added note's author is the caller's member name and id (`authorId`, new), and its time the server's.
- Its id is the server's, unique by construction.
- Its mentions are read from its text, as the screen reads them today.
- Who may edit or delete a note: its author by `authorId`, or for the four notes written before R2, by `author` matching the caller's member name, as the screen matches today. The ✏️ and ✕ follow the same rule.

**R3: stage history is the server's, as the CSV path's is (Q3).**
- A single PUT that changes the stage appends its entry on the server, from the stored row, through `_stage.mjs` (the author the caller's name, the date the request's day).
- A body's `stageHistory` and `stageChangedDate` are ignored, never written.
- The three writers stop building it.
- The board's drag keeps showing the move at once, then takes the deal as stored from the answer.

**R4: a contact's Undo keeps its owner (Q4).**
- The Undo marks its re-POST a restore, as the account's does. The server then keeps the stored owner id where that is a member of this org; else none, and the name with it.
- Never the caller, and no name lookup.
- Honoured for any role that may delete the contact (reps delete their own and unassigned ones), unlike the account's Admin-only mark.
- A forged mark gains nothing a rep cannot do today: a rep may already create a contact naming any member as its rep, and an unassigned contact is open to every writer.

**R5: the email.** The "new note" email fires from the added note itself (R1), not from a diff of two lists. Its rule is unchanged: the deal's rep, for a note by someone else.

## 5. Questions for Jeff

- **Q1: How a note is saved.**
  - (a) Each post, edit and delete is one operation the server applies to the stored list; nothing is ever written back whole (Recommended: nothing is lost and nobody retries).
  - (b) A version check: a save naming the list it loaded is refused when the list has moved since, and the screen reloads the notes and asks the user to post again.
- **Q2: Who wrote a note, and who may change it.**
  - (a) The server stamps the author (name and member id) and the time, and lets only the author edit or delete a note (older notes by their author name) (Recommended).
  - (b) The same, but an Admin may also delete any note (moderation).
  - (c) Leave the author to the screen, as now.
- **Q3: Stage history, the same flaw.**
  - (a) Fold it in: the server appends the entry on a stage change, as the CSV path does, and ignores a body's history (Recommended: UKG's 11 deals carry live history).
  - (b) File it, its own batch.
- **Q4: A contact's Undo.**
  - (a) A restore mark keeps the stored owner by id (a member of this org, else none), for any role that may delete the contact (Recommended).
  - (b) Honour the mark for an Admin alone, as the account's; a rep's Undo still makes the contact theirs.

## 6. Tests and checks (planned)

- **Unit.**
  - The note operations as pure rules: add, edit, delete, an edit of a gone note, an author check by id and by name.
  - The PUT's refusal of a whole list.
  - THE GUARD: no screen sends `comments` or `stageHistory` in a deal's body (a parse of `src`).
  - The restore's owner rule.
- **Integration** (their own namespace, `itest_dealdata_A/B`):
  - two adds at once both stored;
  - a stale form save keeps a note posted after its copy;
  - an edit by another member refused;
  - org B's deal untouched;
  - a stage change's history from the stored row, a body's history ignored;
  - a contact's restore keeping an unassigned contact unassigned, keeping another member's, and naming no one for an owner who has left.
- **Harness.** A block for each rule, proven by hand. The scoped run before the push.
- **Browser check as Karen** (and as Jeff for a Manager's view), in Accelerep QA:
  - post a note in one tab, save the deal's close date in a second tab opened before it, and the note stands;
  - edit and delete her own note, and neither offered on another's;
  - drag a deal, and its history holds the move;
  - delete and undo an unassigned contact, and it stays unassigned.
