<!-- Email links (OPEN_ITEMS §1 item 5, §4.5): the design, 9 Nov 2026, over 28a9ebf. Answered 9 Nov — each of Q1-Q4 the Recommended (ANSWERS.md beside this file). Built 9 Nov (state §0.237; guide §18b120); its browser check PASSED as Karen; NOT committed; harness deferred. -->

# Design: a link in a message to a member opens what the message is about

## 1. What it is

OPEN_ITEMS §1 item 5 names two items from §4.5:

- **"View Deal →" in seven older email templates opens Home.** Nothing reads `?deal=`. It wants App's `?quote=` pattern, surviving sign-in (§0.158).
- **The email footer's "Manage notification preferences" opens Home.** The switches live in the profile panel's Notifications tab (§0.158).

Reading them (9 Nov, over `28a9ebf`) found the class wider (§2).

## 2. The map: every link into the app a message sends (read in code)

| Link | Sent by | What it opens today |
|---|---|---|
| `?deal=<id>` "View Deal →" | send-email.mjs: dealAssigned :344, stageChanged :368, opportunityCreated :388, opportunityUpdated :408, dealClosed :430, commentAdded :452, activityLogged :523 | Home: nothing reads `?deal=` |
| the bare app, "Open/Update/View Pipeline →" | send-email.mjs: dealSilent :575, dealStuck :598, closeDateLapsed :618, managerDealAlert :643, dealMomentum :666. **Each is about one deal and is handed its `opportunityId`** | Home |
| the bare app, "View:" | send-sms.mjs: dealAssigned :164, stageChanged :172, dealSilent :189, dealStuck :197, closeDateLapsed :205, commentAdded :225, managerDealAlert :235 (the deal texts; dealClosedWon :179 has no link). **None is handed the deal's id**: their callers would pass it | Home |
| `?tab=tasks` | send-email.mjs: taskDigest :478 "View All Tasks", overdueTaskNudge :503 "Resolve Tasks"; send-sms.mjs: taskReminder :148, taskOverdue :156, digestSummary :217; mention-sms.mjs: taskAssigned :124 | Home: nothing reads `?tab=` |
| `?tab=reports` "View Full Pipeline →" | send-email.mjs: weeklyManagerSummary :553 | Home |
| `/settings` "Manage notification preferences" / "Manage preferences" | send-email.mjs: the members' `layout` :135 (every member email); digest.mjs :281, :493; pipeline-alerts.mjs :493 | Home: the site serves the app at any path (netlify.toml `/*` → `/index.html`), and the app reads no path |
| `?quote=<id>` | quotes.mjs, quote-reminders.mjs (`quoteLink`) | **The quote, in the Quotes tab** (App.jsx :975-996), surviving sign-in in the tab's sessionStorage (`takeQuoteLink`, src/utils/approvalNotices.js) |

- **The app's side** (App.jsx): one link is read, `?quote=`. It waits until the quotes load, opens the quote's deal in the Quotes tab, then drops the parameter from the URL.
  - A quote this member cannot see is not in their list, and nothing opens.
  - The calendar's OAuth return (`?calconnect=`, `readCalendarReturn`) opens the profile panel itself, and AppHeader selects its tab (`calConnectResult`).
- **A deal window** opens with `setEditingOpp(deal); setShowModal(true)` (Home's rows, the notes popover).
- **A task** opens in the task rail, with `setTaskRailId(id); setTaskRailMode('view')` (`handleEditTask`).
- **Tabs** change through `navigateTo(tab)`, which honours Settings' leave guard.
- **The org.** No link names the org its record belongs to. A member of two orgs who opens an email about a deal in org X, while their active org is Y, has a list that lacks the deal. The quote link has the same blind spot.

## 3. The design (recommended)

**R1: one link shape, one reader.**
- A message's link is `/?open=<kind>&id=<id>&org=<orgId>`, built by one function on the server (`appLink`), never by hand in a template.
- The kinds are `deal`, `task`, `tasks` (the Tasks tab), `pipeline`, `notifications` (the profile panel's Notifications tab), and `quote` (the approval emails, moved onto the same reader).
- The app reads it once (`takeAppLink`, sessionStorage, as `takeQuoteLink` does, so it survives sign-in), acts when what it needs has loaded, then drops it from the URL.
- Ids are allowlisted by shape, kinds by name. Anything else is ignored.
- Old links already in inboxes (`?deal=`, `?tab=tasks`, `?tab=reports`, `?quote=`) are read as their kind.

**R2: what each opens.**
- **A deal**: its window, from this member's deal list.
- **A task**: its rail.
- **The task digests and the overdue nudge**: the Tasks tab.
- **The pipeline summary**: the Pipeline tab (Q4).
- **The preferences footers**: the profile panel on its Notifications tab.
- **A quote**: as today.
- Each waits for the profile (`roleKnown`) and for its list to load.

**R3: the org (Q2).**
- A link names the org its record lives in.
- Opened in another org the member belongs to, the app switches to it (as the org switcher does), then opens the record.
- In an org they don't belong to, nothing is switched.

**R4: a record the member can't open (Q3).**
- Another rep's deal, a deleted one, or an org they're not in: a notice says so ("That deal isn't available to you — it may have been deleted or reassigned").
- Never a blank Home, never another record.

**R5: every message about one record links that record (Q1).**
- The five deal emails that link the bare app link their deal.
- The deal texts link their deal. Each text's caller hands it the deal's id; the templates take none today, and each caller is to be read when built.
- A task's reminder, overdue text and assignment text link the task. The mention text's `recordId` is the task's id; the reminder's and overdue text's callers are to be read when built.

## 4. Questions for Jeff

- **Q1: Scope.**
  - (a) The whole class: every link in §2 goes through R1, the five deal emails and the deal and task texts link their record, and every preferences footer opens the Notifications tab (Recommended).
  - (b) The two named items only: "View Deal →" and the email footer.
- **Q2: A link to a record in another of the member's orgs.**
  - (a) Switch to that org, then open it (Recommended).
  - (b) Stay in the active org; a notice names the org to switch to.
- **Q3: A record the member can't open.**
  - (a) A notice says it isn't available (Recommended).
  - (b) Nothing opens, as the quote link does today.
- **Q4: The weekly manager summary's "View Full Pipeline →".**
  - (a) The Pipeline tab (Recommended: it is the pipeline the email summarises).
  - (b) Reports, as its link names now.

## 5. Tests and checks (planned)

- **Unit.**
  - `appLink` and `takeAppLink` run: every kind, the old shapes, a bad id or kind dropped, the stored link surviving a sign-in's reload.
  - THE GUARD: no template, text or footer in netlify/functions writes an app link by hand (a parse: every app URL goes through `appLink`).
  - Every message that names a deal or task id links it.
  - The reader's wiring in App.jsx.
- **Browser check as Karen**, in Accelerep QA. Each link typed into the address bar, nothing sent:
  - a deal of hers opens;
  - another rep's says it isn't available;
  - a task opens its rail;
  - the preferences link opens the Notifications tab;
  - an old `?deal=` link opens the deal;
  - signed out, the link survives the sign-in;
  - a deal in her other org (Accelerep Test) switches to it.
- No email is sent. Each template's HTML is checked by test.
