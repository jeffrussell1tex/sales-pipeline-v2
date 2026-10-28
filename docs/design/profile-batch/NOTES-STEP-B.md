# The member profile batch — step B's build notes (§0.212, 27 Oct 2026)

Built to DESIGN.md (beside this file, §2 Step B and the "(B)" items) on Jeff's answers (ANSWERS.md) and his word of 27 Oct ("Start step B (§0.212): the manager stored by id, checked as a member of this org, picked by a type-ahead."), over e1caaf5. Every line the design cites was re-read on that tree first by a read-only sweep (six mappers, a skeptic each). What differs from the design, what the review changed, and what the browser check adds.

## Departures from the design

- **The harness anchors the design said would hold did not.** `'managerId'` after `'manager'` in `PAGE_FIELDS` splits the text two §0.211 entries anchor (`'teamId', 'manager', 'territory']);`), so both are re-anchored on `'manager', 'managerId', 'territory']);`; the "(not linked …)" words change heldManager's name line, so its §0.211 entry is re-anchored on `if (blank(name)) return null;`. None retired.
- **A restored member named as their own manager is cleared too** (the design's restore line tested membership alone); the member's own id is handed to `memberLinksCleared`.
- **The type-ahead** is a module-scope `MemberTypeahead` in UsersDetail.jsx, not a reuse: no existing picker is a single pick stored by app id (PeopleChooser is multi-pick and not portaled). It keeps PeopleChooser's matcher and words' shape, shows the chosen manager as a chip with an × or, with none, the search (TaskRail's Assigned To pattern), and portals its list (the house popover rule).
- **The harness block is 32 entries, not 13**, and the total 3,305, not 3,275 (step A landed 44 entries, not 33) — and 3,333 since the docs check gave the scoped harness 28 of its own (below), and 3,342 since the browser check's resize close gave 9 more (below).
- **The tests** also re-point member-links T9 and T11 (the clean-up's order and its run), the link-spec guard in link-ids.test.mjs, and users-self.itest.mjs's every-administrative-key body; I5 is seven tests (I5a-I5g), one per rule, each shown failing on step A's server.

## What the review changed (27 Oct — four lenses, a skeptic each)

- **The create's self check** read the body's id (linkIds.js `linksAsked` falls back to it); it now hands in the minted id. The design's "notSelf cannot meet it" was wrong.
- **The server keeps a manager's name and id paired**: a save naming the name alone, changed, clears the id — a page loaded before §0.212 sends the name alone, and every reader would have named the old manager — and the id alone, changed, clears the old name.
- **The words:** "(not linked — remove, then pick them again)" (the chip's only control is ×), and "Former member" (the house word) for an id no member holds with no name stored.
- **The box's exclusion of the chosen member could never act** (the search shows only when none is chosen): removed, with its harness entry.
- **The focus** goes to the chip's × after a pick (it dropped to the page).
- **Ten harness entries** — for its fixes, the scroll close it pinned, and rules the suites held but no entry broke (named in the §0.212 manager block's header comment, scripts/mutate-import.mjs; state §0.212).

## The harness rule (Jeff, 27 Oct)

"Change the rule: each batch gets the stale check, its own entries, every older entry on the files it changed and every entry caught by a test file it edited; the full run before each prod ship." Step B is the first batch graded so: `node scripts/mutate-scope.mjs`, 1,488 of the 3,333 entries (guide §18b23 part 4). The docs check (27 Oct) found the tool reading too little of a test — a stray quote hid the paths after it, a command line was read whole, a subprocess's script was not followed — so the first run's scope was 923; and the tool's own suite outside SUITES. Both fixed: the suite is in SUITES with 28 entries, and a second run graded the rest of the scope, with the 127 entries on users.mjs and _selfProfile.mjs again (their comments changed after the first): 692/692, and the scoped harness's 28 again on the final tree after the last comment fixes, 28/28 (state §0.212). After the browser check, the resize close: a fourth run, 369/369 (02:47-03:18 UTC) — its first 8 entries, every entry on UsersDetail.jsx and IndustriesDetail.jsx, every entry the edited S16 suite reaches, and the two older entries on DocumentsTab.jsx, which the added suite reads — and a fifth, 3/3, its ninth (the TDZ gate's `Node`) and check-tdz.mjs's two older entries; the suite it added walks src, and what it reaches keeps its last grade (a suite added can only turn a run red — guide §18b23 part 4).

## The browser check — DESIGN.md §7 Pass B, with what the build adds

Before the pass: stop `netlify dev`; `rm -rf dist node_modules/.vite .netlify/functions-serve` (step B is a functions deploy); restart; poll; hard refresh. Accelerep QA only.

- **Make "TEST Profile Manager"** (a Manager with no login, through the deal window's + New Rep with the Role & Access tab's role set to Manager), on Jeff's go.
- **TEST Profile Rep first reads its stored name:** it holds "Bob Russell" by name with no id (§0.211's step 6), so the chip reads "Bob Russell (not linked — remove, then pick them again)", greyed; the band "reports to Bob Russell".
- **12.** × the chip (the search takes the focus), type "TEST", pick "TEST Profile Manager" (Enter or a click; the focus goes to the new chip's ×). Save: the body is `{ id, manager: 'TEST Profile Manager', managerId: <its id> }`. The band and the Users list's Manager column read it.
- **13.** Rename TEST Profile Manager on its own page; TEST Profile Rep's band and the Users list read the new name. Rename it back.
- **14.** Held, made up: answer a phone save of TEST Profile Rep with `managerId: 'usr_TEST_gone'`, manager "TEST Profile Manager" — the chip reads "TEST Profile Manager (no longer a member)", greyed. Guard off; reload.
- **The list:** it opens under the field, shows "No Admin or Manager matches." for no match, closes on Escape without closing anything else on the page, and on a scroll.
- **15. As Karen:** nothing in step B is on her screen.

## The browser check (27 Oct; from 02:03 UTC 28 Oct) — passed, steps 12-15 (state §0.212 holds the record)

- **TEST Profile Manager** was made through the deal window's "+ New Rep" (one `POST /users`, 201); the deal window closed unsaved. The deal window's own Create sits behind the New User window's, so the click went by the element's reference.
- **The list's scroll close** needed a page that scrolls: at the pane's full height the profile page does not, so its viewport was set to 1280×690 — and that resize showed the bug: the list stayed open, the console naming `contains` ("parameter 1 is not of type 'Node'") in its close, once per resize.
- **The resize close** (Jeff: "Fix all three here in step B, with a scan test and harness entries; re-run the checks, then the short pane recheck with me signed back in."): the Manager box's list and the Users and Industries row menus — one handler shape, the last two shipped — ask for a node before they read the target; tests/resize-targets.test.mjs scans every such handler, fail closed; 9 harness entries. And check:tdz, whose list of browser globals lacked `Node`, failed all three handlers — `Node` joins it.
- **Its review** (four lenses, each lens's findings put to a skeptic — the harness block's had none) made the scan fail closed, and found the list closing on its own field's scroll: a text box scrolls its text as a query outgrows it and fires `scroll` at itself (seen in the pane on a page-only test box) — the list now leaves that alone.
- **The recheck** (28 Oct, 15:12-15:16 UTC, after the resize close; Jeff signed in himself — `jeffrussell1@yahoo.com`, Accelerep QA, four orgs, the URL bar `localhost:8888`; the local server, restarted, serving the fixed handlers — read from the modules it served; a recorder logging every write and every uncaught error): on TEST Profile Manager's own page (no manager, so the search shows, and typing in it saves nothing) "Russell" opened the list, and a resize (the viewport set to 1280×700) closed it — one `resize`, no error; with the field in view, a query of 120 characters scrolled the field's text (scrollLeft 271) while the list stayed open on "No Admin or Manager matches." — no close (typing in a field below the fold scrolls the page, which closes the list, as meant); TEST Profile Rep's row ⋯ menu on the Users list and the Technology row's on Settings → Industries each opened, and closed on a resize; no `contains` error in the console; no write but Settings' two `users-sync?check=true` dry runs. PASSED
