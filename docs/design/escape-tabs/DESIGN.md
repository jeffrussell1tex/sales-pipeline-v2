<!-- Escape in the tabs (OPEN_ITEMS §1 item 3; §4.1 "In-tab layers without Escape", "The shortcuts list opens under an open rail"): the design, revised after two critiques (§9), with Jeff's ten answers (ANSWERS.md). Written 4 Nov 2026 in the twenty-fifth session, read only, over f885df4 — file:line references are as of f885df4 and may move; verify each one before building. Batch 1 (the mechanism and the CRM tabs) built 4 Nov — state §0.230; batch 2 (Dispatch) built 5 Nov — state §0.231; batch 3 (Settings, with every inline Escape in Settings) built 5 Nov — state §0.232; batch 4 (the document picker, the people chooser, the last inline Escapes), the last, built 5 Nov — state §0.233; each harness deferred; all four graded green in the one scoped run (5 Nov: 3,428/3,428 caught) and pushed to dev 5 Nov (`2942d6c..e1eb8bf`); graded green in the full run (5–6 Nov: 4,301/4,301 caught) and SHIPPED 9 Nov, the forty-fifth ship (`d43c16f..6d8fecb`). -->

# Design: every in-tab layer closes on Escape, the one on top only, and no shortcut fires under one

## 1. What it is

The app's own layers (rails, dialogs, windows — ModalLayer, App, the quick log, the meeting prep panel) close on
Escape in one order (`ESCAPE_ORDER`, src/utils/escapeOrder.js; state §0.186, §0.189; guide §18b74, §18b80,
§18b84). The layers drawn **inside the tabs** are not in that order: most have no Escape at all, the few that have
one leave it unmarked (so App's handler acts on the same keypress), and App's letter and number shortcuts fire over
every one of them — `anyModalOpen` (App.jsx:617) names only App's own windows, and the shortcut path ignores a
keystroke another control already handled (only Escape checks `e.defaultPrevented`, App.jsx:585). Typing "837" in
the Reports delivery dialog's time picker (TimeDropdown type-ahead, TimeDropdown.jsx:243-250, marks the key) still
sends "3" to App: Tasks opens and the dialog and its draft are gone. A "1"-"8" over Dispatch's New Job unmounts it
mid-save.

The 9 Oct design (OPEN_ITEMS §4.1, "Designed 9 Oct") kept only a summary; its inventory was not saved. This one
re-did it; its counts replace the 9 Oct ones (TasksTab draws one fixed layer today, :158, not five — D20, 11 Oct,
removed the others; tests/open-states.test.mjs:243).

## 2. The inventory (4 Nov, over f885df4)

Three read-only readers, then a completeness critic who read LeadsTab, PipelineTab and QuotesTab whole and ReportsTab
by extraction plus every layer-bearing component around a hit, and ran a Babel scan of every object literal under
src/Tabs and src/components: **no CRM-tab layer is missing from §2.1**. The Dispatch reader read DispatchTab.jsx
(7,085 lines) and TimeDropdown.jsx whole; the Settings reader read every layer-bearing settings file in full or in its
full layer and state regions and searched the rest. Key claims re-read by the session. THE GUARD (§5) is the backstop.

Where a layer is drawn decides where it stacks: the tabs render inside `.app-container` (App.jsx:1956; index.css:44-46,
`position: relative; z-index: 1`), so a layer drawn in a tab — whatever its own z — sits under every layer drawn
outside it, and beside the header, which is `position: sticky; z-index: 150` (AppHeader.jsx:350) and so its own
stacking context: the header's search, profile and notifications panels stack at 150 inside the container, not at
their 1199/1099/1000 (ESCAPE_ORDER's comment says otherwise — corrected in batch 1). "Portaled" =
`createPortal(…, document.body)`, outside the container, at its own z.

### 2.1 Batch 1 — the CRM tabs (18)

| # | Layer | Where (file:line) | z / drawn | Closes today | Holds / busy |
|---|---|---|---|---|---|
| C1 | Sub-accounts drawer | AccountsTab.jsx:176-306 | 290/300, tab | ×, backdrop, row, Escape (window bubble :187-191, checks dP, **unmarked**) | a search query |
| C2 | Accounts Filter panel — **drawn twice** (:970 and :1120, one `filterOpen`); the second inside `Toolbar`, a component defined inside AccountsTab (:1019, rendered :1137), remounted every render | AccountsTab.jsx:437-561 | 200/201, tab | backdrop, Apply | five draft selects |
| C3 | Contacts row ⋯ menu (list) | ContactsTab.jsx:284-294 (RowActionMenu :158-191); its outside-close in the parent, :760-771 | 12000, portaled | outside mousedown, scroll, resize, item | — |
| C4 | Contacts ⋯ menu (Company view) | ContactsTab.jsx:609-619; outside-close in CompanyTwoPane :341-352 | 12000, portaled | as C3 | — |
| C5 | Lead score "Why this score" | LeadsTab.jsx:98-171 | 60, portaled | outside mousedown, scroll, resize | — |
| C6 | Lead status picker (triage bulk) | LeadsTab.jsx:218-254 | 1000, tab | outside, Escape (document bubble :223-226, **unmarked**) | a typed query; a pick saves fire-and-forget |
| C7 | Lead rep picker (triage) | LeadsTab.jsx:269-315 | 1000, tab | as C6 (:274-277) | as C6 |
| C8 | Lead rep picker (cockpit) | LeadsTab.jsx:933-939 | as C7 | as C7 | as C7 |
| C9 | Pipeline Filter panel | PipelineTab.jsx:36-178 | 200/201, tab | backdrop, Apply | five draft selects |
| C10 | Pipeline "Save current view" | PipelineTab.jsx:181-215 | 300/301, tab | backdrop, Cancel, Escape in its autoFocus input (:195-199, **unmarked, unchecked**) | a typed name |
| C11 | Documents row ⋯ menu | DocumentsTab.jsx:16-47 | 11050, portaled | outside mousedown (window), scroll, resize, item; its button reopens it (:19-20 then :78) | — |
| C12 | Tasks Snooze picker | TasksTab.jsx:131-173 | 9999, tab | outside mousedown, row mouseleave; its button reopens it (:135-136 then :268-271); a pick also opens the task (:163 → :223) | — |
| C13 | Quotes template picker | QuotesTab.jsx:362-420 | 200, tab | ×, backdrop, Cancel | a choice |
| C14 | Reports "Schedule delivery" | ReportsTab.jsx:2276-2357 | 99999, tab | backdrop and Close (both refused while busy) | the schedule draft; `deliveryBusy` |
| C15 | Reports contact ⋮ menu | ReportsTab.jsx:4762-4867 | 9999, tab (not portaled, :4785-4797) | document click (:4781); not on scroll; **two can be open at once** — the toggle's `stopPropagation` (:4770) stops the native click before it reaches the other menu's document listener | — |
| C16 | Reports account / contact pickers | ReportsTab.jsx:4995-5021; outside-close in ActivityHistoryTab :5055-5063 (always installed, serves C16 and C17) | 200, absolute | outside mousedown, pick | search text |
| C17 | Reports opportunity picker | ReportsTab.jsx:5992-6032 | 50, absolute | outside mousedown, pick | search text |
| C18 | TimeDropdown list (in C14; also TaskRail, Dispatch, Audit) | TimeDropdown.jsx:304-347 | 12000, portaled | outside, scroll, resize, pick, Tab, Escape on its trigger (React, marks it, does not check the mark) | — |

HomeTab, SalesManagerTab, DuplicateScanView, ContactDuplicateScanView and PastMerges draw no layer of their own.

### 2.2 Batch 2 — Dispatch (8)

| # | Layer | Where | z | Closes today | Holds / busy |
|---|---|---|---|---|---|
| D1 | New Job customer results | DispatchTab.jsx:447-492 | 40, absolute in D8 | blur, pick | — |
| D2 | "Assign anyway?" | :1569-1604 | 99998 | backdrop, Cancel, confirm | — (Override live while `saving`, :1558) |
| D3 | Proposed schedule (mass) | :4752-4842, drawn :6465-6470 | 99998 | backdrop, Cancel — refused while `massSaving` | `massSaving` |
| D4 | Shift pattern | :5166-5234, drawn :5015-5020 | 99998 | backdrop, Cancel (refused while busy) | `wh` draft; `busy`; a refused save unshown (:5223) |
| D5 | "Already scheduled" conflict, **over D6** | :5022-5072 | 99999 | backdrop, Reject (refused while busy) | `busy` (shared with D6) |
| D6 | Mark unavailable / Edit time off | :5074-5159 | 99998 | backdrop, Cancel (refused while busy) | the block draft; `busy` |
| D7 | Board filter menu | :6570-6601 | 9998/9999 | backdrop, pick | — |
| D8 | New Job | :6789-7082 | 1000/1001 | ×, Cancel, backdrop — `closeNewJob` refuses while `newJobSaving` (:5878) | the job form; `newJobSaving` |

The "No techs configured" notice (:6779-6786) is not interactive: NOT_A_LAYER.

### 2.3 Batch 3 — Settings (45)

AdminView's needs-attention ⋯ menu (AdminView.jsx:674-715, z50; Escape unmarked) and its leave guard
(LeaveGuardModal, AdminView.jsx:538-543 / 840-845 — drawn in the tab at 99999; `escapeBlocked('leaveGuard')` reads
App's guard only, App.jsx:1581); Audit's Export menu, row popover and three PolicySelects (z9999, Escape unmarked),
"Add streaming destination" (z900; its × live mid-save, :235) and the signing-secret reveal (z950, closes only by "I
have stored it"); Backup's restore and import (DataModal z700), Export's two dialogs (z700; mid-save unguarded),
Features' "Reset AI training data?" (z700); API keys' Create (IntModal z700 — **its reveal step closes on backdrop
and ×, losing the key**; the 'creating' step too), Revoke (z700), the quick reference popover (399/400, Escape
unmarked) and its key picker (absolute z10, :331-348); the row ⋯ menus of API keys, Webhooks and Automations
(`useRowMenu`, integrations/shared.jsx:99-127, z100 — the listener is in the hook); Webhooks' New endpoint (z700 —
**its secret lost on backdrop and ×**); Automations' wizard (z700) and run history (z600); Connected apps' Configure
Slack (z700); Teams' team modal and Assign modal (z1000 — the Assign modal's closes not refused while `assigning`)
and ⋯ menu (z400); Territories' modal (z1000) and ⋯ menu (z400); Users' row ⋯ menu (portaled z1000) and the Manager
typeahead (portaled z1000, Escape in its input, marked); Quote templates' card ⋯ menu (z20), New template (z600) and
Edit brand (z100; its own dirty check through showConfirm, Escape unmarked, :288-292); Approval tiers', Account
segments', Customer types', Buyer personas', Custom fields', Industries' (portaled z1000), KPI thresholds' (z300),
Dispatch skills' three and job templates' ⋯ menus; Buyer personas' edit modal (z9000); Pipelines' "Cannot delete"
and "Delete pipeline?" (z500) and its two ⋯ menus — **which never close on an outside click** (PipelinesDetail.jsx
has no listener), as KPI thresholds' (z300) does not. Each with file:line in the Settings reader's report, reproduced
in batch 3's own notes before it builds.

### 2.4 Batch 4 — inline Escapes outside the converted layers

The React `onKeyDown` Escapes in inline edits that are not inside a layer (Settings' list edits: CompanyCalendar,
ApprovalTiers, QuoteTemplates — where Escape commits — AccountSegments, CustomerTypes, CustomFields, FlatList,
Industries, KPI, PainPoints, Pipelines; the search inputs of Accounts :944 and Contacts :847; SalesManager's call cell
:189): none checks `e.defaultPrevented`, none marks the Escape; each becomes a registered inline layer while editing,
or checks the mark — whichever its place needs. The document picker (inside the deal window and the two record
rails), which holds by its own list (§0.189 (c)): portaled above its host and given its place. (A control inside a
layer a batch converts goes with that batch — §3.6.)

## 3. The mechanism

1. **A stack in App, held in a ref.** `useLocalLayer(open, { onEscape, dirty, busy, place })`
   (src/hooks/useLocalLayer.js, new). App holds `tabStackRef` (`[{ id, place }]`, in order of registration) with
   **stable** `registerLayer` / `unregisterLayer` (`useCallback(…, [])`), and a state counter it bumps only when a
   place goes empty or not empty — so opening a menu does not re-render the whole app, and a remount that ends where
   it started bails out. Registration in `useLayoutEffect` (before paint and before any Escape can arrive; a
   passive effect leaves a gap where a new child is not yet on the stack and its parent is — critique M3). A layer
   that stays open is never re-registered (its id is per mount; deps `[open]` only). Unregister removes by id (safe
   under StrictMode's double effects, main.jsx:15). The stack is cleared on an org switch as well as by each
   layer's cleanup (the tabs and ModalLayer are keyed by org, App.jsx:2105, 2192-2193).
2. **Places by where a layer draws** (guide §18b74 rule 4: the z order is the Escape order). Two new places in
   `ESCAPE_ORDER`:
   - **`tabPopover` at 12000** — between `leaveGuard` (99999) and `linkPicker` (11105): every portaled in-tab
     popover (C3, C4, C11 — moved from 11050 to 12000 — C18 wherever it is hosted, Users' and Industries' menus,
     the Manager typeahead). They draw above the rails and windows, so they take the Escape first. C5 (portaled at
     60) is raised to 12000 with them.
   - **`tabLayer`** — inside `.app-container`, first of that section, above the header's panels: every layer drawn
     in a tab, not portaled.
   - A layer may name an existing place (`place: 'leaveGuard'` for AdminView's guard once portaled — batch 3).
   `openLayers[place]` = App's own flag OR a registered entry with that place. **On top within its place** = the
   last entry of the same place (critique M10 — one stack holding several places must not let a `tabLayer` entry
   hold a `leaveGuard` one).
3. **Its Escape.** One capture listener on document per open layer (deps `[open]`), reading `{ onEscape, dirty, busy }`
   from a ref assigned every render, and working out `blocked` **at key time**: `layersAbove(place,
   openLayersRef.current)` or not the last entry of its place in the stack ref. Within one keypress React has
   re-rendered before later listeners run (react-dom 18.3.1: a native listener's setState is flushed in a microtask
   — critique M, preface), so only the mark (`e.defaultPrevented`) is a reliable guard for anything after the hook;
   the hook is first (document capture). When not blocked it marks the Escape (takeEscape) and: if `busy`, nothing;
   else if `dirty`, App's confirm asks "Discard changes?" — **Discard** / **Keep editing** (Q1), and the layer stays;
   else `close()`. App's handler: `case 'tabLayer'` and `case 'tabPopover'` fall to `default: return`.
4. **One close for all four (Q10).** The hook returns `requestClose`, which the layer's ×, Cancel and backdrop call
   too: busy → nothing; dirty → the confirm; clean → the close. Discard calls the layer's **latest** close through
   the ref and re-checks `busy` (the confirm holds the `onConfirm` it was given, ModalLayer.jsx:842 — critique M8).
   When the confirm opens, the focused element is blurred, so Enter in the form under it cannot submit (focus is not
   moved by the confirm, ModalLayer.jsx:823-851). What "dirty" is: §6.
5. **The confirm's words.** `showConfirm(message, onConfirm, danger, labels)` gains an optional fourth argument
   `{ confirm, cancel }`; without it the buttons read as today ("Delete" / "Confirm", "Cancel"). Discard asks with
   `{ confirm: 'Discard', cancel: 'Keep editing' }`, danger styling. Escape on the confirm is Keep editing (App's
   `case 'confirm'`); the next Escape asks again — a dirty layer never closes on Escape alone.
6. **A control inside a layer that owns an Escape registers as a nested layer, in its host's batch** (critique M1 —
   the hook marks first, so a control's own React `onKeyDown` after it would act on the same keypress). Batch 1:
   C18 (TimeDropdown — every host: C14, the task rail, Dispatch, Audit; its Escape moves to the hook, on document
   while open, so a mouse-opened list closes on Escape too, not only with its trigger focused) and C10's name input
   (its Escape handler removed; the dialog's hook takes it). The existing Escape handlers of C1, C6, C7 and C10 are
   removed as each is registered (critique C4). THE GUARD refuses an `onKeyDown` Escape inside a registered layer
   that does not check `e.defaultPrevented`.
7. **Shortcuts off under any layer (Q3).** App's shortcut path returns when `e.defaultPrevented` (a control took the
   key — the time picker's type-ahead), and when `topLayer(openLayersRef.current)` is not null — every app layer,
   the header panels, `tabLayer`, `tabPopover`. "?" keeps toggling the shortcuts list. Newly held, and meant: every
   rail in view mode (TaskRail.jsx:358 names "its T key" — read before building), the four app panels, the shortcuts
   list itself ("n" while reading the list does nothing). AppHeader's Ctrl-K (window listener, AppHeader.jsx:94-103)
   is gated by the same rule, and the search input's Escape (AppHeader.jsx:446) checks the mark (critique M7 — today
   a capture-phase layer's Escape followed by the search's closes two layers).
8. **The two lingering layers close on an outside click (Q9)**: the notifications panel (AppHeader.jsx:509-531) and
   the follow-up card (QuickLogFab.jsx:201-221, as Skip does).
9. **The shortcuts list (Q6)** moves from 9998 to **11015** (11011-11019 is free — critique M6: 11000-11003 the
   rails, 11010 the viewer, 11020/11021 the meeting prep panel), and its place with it, between `meetingPrep` and
   `activityDetail`: drawn over a rail or a window, it takes the first Escape.

## 4. The batches (Q4)

1. **The mechanism + the CRM tabs**: §3 whole; C1-C18 registered (C18 in every host); the shortcuts list (Q6); the
   confirm's words; the two lingering layers (Q9); Ctrl-K and the search's mark; Q7's layer bugs in these files —
   `Toolbar` moved to module scope **before** C2 registers (a component remounted every render would register and
   unregister every App render — critique M2), the Filter panel drawn once, the Snooze and Documents ⋯ buttons
   closing an open menu, a Snooze pick not opening the task, the Reports ⋮ menu closing on scroll and only one open
   at a time; Q8's finds filed in OPEN_ITEMS (§7). THE GUARD (§5) lands here, with batches 2-4's layers in its KNOWN
   list, so a new layer anywhere fails it from batch 1 on.
2. **Dispatch**: D1-D8 (D1 nested in D8, D5 nested over D6); `confirmDiscard`'s words; D2's Override disabled while
   saving; D4's refused save shown.
3. **Settings**: the 45; AdminView's guard portaled (Q5) under `place: 'leaveGuard'`; the three secrets (Q2) — at the
   reveal step Escape, backdrop and × do nothing, and the 'creating' step refuses them too; Pipelines' and KPI
   thresholds' ⋯ menus close on an outside click; the Audit destination's × and Teams' Assign closes refused
   mid-save; the Manager typeahead and the key picker nested in their hosts; EditBrand's own dirty confirm folded into
   the hook's.
4. **Inline Escapes outside layers and the document picker** (§2.4).

Each batch: its tests, the gates, unit, integration, the stale check and its own harness entries proven by hand —
harness deferred (Jeff, 4 Nov: "Do not run the full harness after each change", "Before each push to dev", "Prove them by
hand": one scoped run before each push to dev, the full run before a prod ship), a pane check as Karen
(`accelerep@outlook.com`, role User; Settings as an Admin, since Karen cannot open it), one commit with its doc patch.

## 5. Tests

- **tests/escape-order.test.mjs** — the two new places: `tabPopover` with its z 12000 (read from each portaled
  popover's file), `tabLayer` with a container-section marker and a `DRAWN_BY` entry naming src/Tabs; THE GUARD's
  rows gain a `useLocalLayer` kind (the hook passes no literal `escapeBlocked('…')`); `OPEN_AS` for `leaveGuard`
  (batch 3). The shortcuts list at 11015 flips four assertions — :66 (`layersAbove('duePopup', {shortcuts})` true),
  :80 (`topLayer({shortcuts, taskRail, draggable})` is `'shortcuts'`), :443-450 (the task rail over the list) and :467
  (`press({contactRail, shortcuts})` closes the list first) — each rewritten to the new order and said so.
- **tests/tab-layers.test.mjs** (new) — run: the stack (register, unregister by id, on top within a place, a nested
  pair closes top first on two Escapes, StrictMode's double effect, an org switch clears it, no App re-render while a
  place stays non-empty); the hook's decision at key time (busy → marked, nothing; dirty → the confirm with "Discard" /
  "Keep editing", the layer kept, Discard runs the latest close and re-checks busy; clean → close; a layer above →
  passed on unmarked); one close for ×, Cancel, backdrop and Escape; App's shortcuts — none under any layer, none on a
  marked key, "?" still toggles, Ctrl-K gated.
- **THE GUARD** (in tab-layers): one Babel pass per file (reusing tests/open-states.test.mjs's `walk`, `parseJsx`,
  `srcFiles`, and tests/rounded-scrollers.test.mjs's `values()` / `keyOf()` and its CSS reader extended to `position`
  — not its `ownProps`, which takes only plain object literals). A hit is: any `position` whose values include
  'fixed' (a ternary, a computed style object such as ReportsTab.jsx:4785's `menuStyle = rect ? {…} : null`);
  `createPortal`; a JSX class whose index.css rule sets fixed, media queries included (`.modal-overlay`, `.modal` at
  ≤640 px, `.lead-form-modal`, `.spt-profile-panel`, `.nav-tabs`); an object with `position: 'absolute'` plus a
  `zIndex` and a `boxShadow` (catches Pipelines' and KPI's listener-less menus, D1's blur-closed list, C16, C17);
  a document or window mousedown / click / pointerdown / touchstart listener, or a call to a `use*` hook that installs
  one (`useRowMenu`). Each hit belongs to its nearest enclosing component, which (or a hook it calls) calls
  `useLocalLayer`, or is in **KNOWN** (batch 2, 3 or 4) or **NOT_A_LAYER** (with its reason — DispatchTab's job block
  :727 and notice :6780, QuoteTemplatesDetail's hover button :152; its tooltip :183 to decide) — keyed by file and
  anchor text, never a line number (the stale-anchor lesson). Listener-only components name the layer they serve
  (ContactsTab, CompanyTwoPane, ActivityHistoryTab). The scan follows the tabs' imports (TimeDropdown is in
  src/components/ui). A KNOWN or NOT_A_LAYER entry no longer found fails; a "finds the shape as it was" fixture for
  each detection (fixed literal, ternary, computed style, CSS class, absolute+z+shadow, listener, hook); `useLocalLayer`
  inside a component defined in another component fails; an `onKeyDown` Escape inside a registered layer that does not
  check `e.defaultPrevented` fails. ViewingBar is imported (App.jsx:31, ReportsTab.jsx:19) and never rendered — its
  imports are removed in batch 1, or it is listed.
- Each converted layer pinned: its Escape, what it refuses mid-save, what it asks when dirty.
- Mutants for each (the scoped run grades them).

## 6. Defaults not asked (Jeff may overrule any)

- **What "dirty" is**: the draft differs from what the layer opened with. A search box or a filter draft (C1, C2, C9,
  C16, C17) is not typed work: they close without asking. A layer that writes nothing until a later Save (C2, C9 —
  Apply sets local state only) closes without asking.
- The document picker portaled above the rail it opens from (batch 4); one Escape in an inline edit under a menu
  closes the edit only (§3.6 makes it so wherever the edit is nested).

## 7. To file in OPEN_ITEMS (Q8 — in batch 1's commit, each re-read before it is written)

New entries: the deletes with no confirm — Webhook endpoint (WebhooksDetail.jsx:14 → :297 → :181), Automation
(AutomationsDetail.jsx:546 → :542 → :373, the row removed before the DELETE), Dispatch time off (DispatchTab.jsx:5136
→ :6242); `Section` defined inside Dispatch's Technician view (DispatchTab.jsx:5367 in TechnicianView :5351 — every
re-render remounts each TechJobCard, read from code); the controls that do nothing, grouped with the "Import preset"
buttons already filed (OPEN_ITEMS:2146-2151) — Features' "Request reset" (:78), Webhooks' "Send test event" (:12),
Dispatch skills' license "Rename" (:221), Leads' "See all" (LeadsTab.jsx:510), Quotes' "☰ View bundles"
(QuotesTab.jsx:1126); `window.alert` as a class (ExportDetail.jsx:258, 268; TerritoriesDetail.jsx:228-255, five;
ReportsTab.jsx:452, 6050; security/shared.jsx:85); Teams' Assign modal shows an old error on reopen (:438, rendered
:492); the half-typed add and rename forms of CompanyCalendar (:136), Pipelines (:45, :103, :115) and Connected apps,
which save each action as it happens and are invisible to both leave guards (AdminView.jsx:437-473 passes no
`setSettingsDirty`); the draggable windows' z climbing with every handle click and never reset (useDraggable.js:24-25,
:130, :239 — after about 500 clicks a window draws above the rails; on mobile `MOBILE_Z` 600, :213, under several
layers); components defined inside a parent in batch 1's files beyond `Toolbar` — AccountsTab's six (:781, :820, :836,
:842, :886, :908), QuotesTab's MiniBar (:1047) and BarCell (:1060), ReportsTab's PinnedCardS (:2712), TemplateCardS
(:2734) and five at :4119-4146 — checked against the 68 churn-only list (OPEN_ITEMS:4319-4326) before filing, the
count changed by the `Toolbar` fix; **the quote preview and the quote PDF are not each org's** — the preview prints
"ACCELEREP", "500 Market Street, Suite 800, San Francisco, CA 94103" and "Accelerep signature" for every org
(QuotesTab.jsx:279-280, 344), and the PDF heads every org's quote "ACCELEREP CRM" (quote-pdf.mjs:122) though it prints
the org's own address and phone (`cp`, :112) — a multi-tenant rule finding (nothing tenant-visible global unless a
per-org setting overrides it).

Extend, do not file twice: App's confirm reading "Delete" for any danger confirm (ModalLayer.jsx:846) → the
`confirmDiscard` entry (OPEN_ITEMS:2770-2771); Dispatch's sub-tab switch dropping drafts → the Technicians-form entry
(:2766-2768; JobsView's part not verified). Already filed, not again: the native time inputs (OPEN_ITEMS:4296-4298 —
its wording calls DispatchTab.jsx:5114/5118 "a job's start and end"; they are the time-off dialog's Start and End,
D6 — corrected there); Leads' cockpit "···" (:4318) and "Search leads…" (:4292); Activity History's inner components
(:4122-4170).

OPEN_ITEMS updated in the same commit as this design: §1 item 3 ("Designed 9 Oct … questions first" → designed and
answered 4 Nov, this file); §4.1's "In-tab layers without Escape" rewritten from §2 here; the shortcuts-list entry
pointed at batch 1 (struck when it lands).

## 8. Not verified (to read or see while building)

The header panels drawing under a tab layer with z > 150 — read, not seen. Whether the rails trap focus (a keyboard
path to a portaled tab popover behind a rail's backdrop). Whether any converted form submits on Enter (§3.4's blur
answers it either way). TaskRail.jsx:358's "T key" (§3.7). The React 18 stopPropagation effect on Settings' document-
click closers (reasoned).

## 9. The critiques and their disposition (4 Nov)

**Mechanism** (event order, React timing, the order's model): M1 nested controls act after the hook — blocking, taken
(§3.6, C18 and C10 into batch 1); M2 a render loop through App state and a remounting registrant — blocking, taken
(§3.1 ref stack, `Toolbar` first); M3 the registration gap — taken (`useLayoutEffect`); M4 one place breaks z = order
for portaled popovers — taken (`tabPopover`); M5 escape-order.test.mjs's model and four flipped assertions — taken
(§5); M6 shortcuts killed by lingering layers — asked (Q9); M7 Ctrl-K ungated, the search unmarked — taken (§3.7); M8
a stale Discard and focus under the confirm — taken (§3.4); M9 × and Cancel against rule 3 — asked (Q10); M10 on top
within a place — taken (§3.2); M11 the draggable z climbing — filed (§7); M12 low-z tab layers under the header's
panels — eased by Q9, noted (§8); M13 App-wide renders per menu — taken (§3.1); M14 shared components placed by host —
taken (§3.2, §5).
**Completeness** (inventory, guard, filings): C1 §2.1 complete, row fixes — taken; C2 the Reports ⋮ menus open
together — taken (C15, batch 1); C3 the claims confirmed, six more inner components in AccountsTab — filed (§7); C4
remove the old Escape handlers — taken (§3.6); C5 THE GUARD misses six shapes — blocking, taken (§5); C6 the filings
re-read, four already filed — taken (§7); C7 OPEN_ITEMS entries to update, not duplicate — taken (§7); C8 new finds,
the quote branding among them — filed (§7).
