# Census B: write requests in the top-level src/Tabs/*.jsx files (not settings/**)

Read-only census, 18 Nov 2026, tree at 92d1bc8 (dev). Every site below was read in full. Anything I did not read is marked "not read".

## How the sites were found

- I grepped `dbWrite(`, `dbFetch(`, `fetch(` and every `method:` in src/Tabs/*.jsx. There is no bare `fetch(` in any top-level Tab file.
- **Files with no write request:**
  - AccountsTab.jsx and ContactsTab.jsx import `dbFetch, dbWrite` but never call them (one match each, the import).
  - PipelineTab.jsx imports `dbFetch` and never calls it. Its saved views are localStorage only (`persistSavedViews`, line 436).
  - HomeTab.jsx (183) and AdminView.jsx (323-329, 352) only GET.
  - SettingsTab.jsx, DocumentsTab.jsx, DuplicateScanView.jsx, ContactDuplicateScanView.jsx and PastMerges.jsx make no request of their own. Their writes go through useApp/hook handlers, which are out of scope (see the end).
- **Helper words used below:**
  - `dbWrite` (storage.js:110) never throws.
    - A throw becomes `{ status: 0, error: NETWORK_ERROR }`, which reads "The server could not be reached."
    - A non-ok answer gets `refusalOf` words: a 403 is ALWAYS "You do not have permission to make this change.", whatever the body. Otherwise the body's `error` (+ " (ref X)"), else "The server returned N.".
    - **dbWrite's caller cannot tell server words from the status fallback** except by string-matching "The server returned N." (SalesManagerTab's `saidOf` does that).
  - `readRefusal` / `refusalWords` (refusalWords.js) give the body's `error` + ref, else "The server returned N.". A 403 keeps the server's words.
  - `failureWords(e)`:
    - a fetch TypeError gives "The server could not be reached."
    - a plain `Error` gives its message (so a `throw new Error(await readRefusal(res))` passes the refusal words through)
    - anything else, including a SyntaxError from an uncaught `res.json()`, gives "Its answer could not be read."
- "Throw" below means `dbFetch` rejected. dbFetch rethrows the original error (storage.js:71), so failureWords sees the TypeError.

---

## SalesManagerTab.jsx

The maybe rule is already implemented here. `ownRefusal(status, d)` (line 216) means a 4xx whose JSON body has a non-empty `error` string.

**S1. 494 `updateClaimStatus` (489): PUT /spiff-claims**
- **Writes:** `{id, status, approvedAt, approvedBy}` (a claim's Approve or Reject).
- **Optimistic:** no. The list changes only after `res.ok`.
- **Throw:** `claimUnanswered('saved')` gives "No answer from the server — reload the page to see whether the claim was saved." Nothing is rolled back; there was nothing to roll back.
- **Non-ok, no server words:** `claimRefused` gives `The claim may have been saved — reload the page to see whether it was: ${refusalWords(...)}`.
- **Non-ok, with server words:**
  - 4xx with words: `Not saved — ${refusalWords}`. A worded 404 also drops the row.
  - 5xx with words: the "may have been" wording.
- **4xx vs 5xx:** yes (ownRefusal).
- **Drawn:** `saveState` banner (rendered in AdminTab, per the comment at line 940).
- Follows the maybe rule.

**S2. 529 `deleteClaim` (525): DELETE /spiff-claims?id=**
- **Optimistic:** no. The row's buttons are held (`deletingIds`).
- **Throw:** "No answer from the server — reload the page to see whether the claim was deleted."
- **Non-ok, no words:** "The claim may have been deleted — reload the page to see whether it was: …"
- **Non-ok, with words:** a worded 4xx gives `Not deleted — …`.
- **4xx vs 5xx:** yes.
- **Drawn:** `saveState` banner.
- Follows the maybe rule.

**S3. 953 `saveUser` (949): PUT /users**
- **Writes:** `{id, forecastCalls}` (via `updateRepField`, 991; the only caller, from the forecast-call cells at 389/396).
- **Optimistic:** no. `setSettings` runs only after the save returns true.
- **Throw:** `` `Not saved — ${failureWords(err)}` `` gives "Not saved — The server could not be reached." **This is "Not saved" on a throw.**
- **Non-ok, no words:**
  - a 403 gives `Not saved — only Admins can change ${label}.`
  - anything else gives `` `${who}'s ${label} may have been saved — reload the page to see whether it was: ${refusalWords}` ``
- **Non-ok, with words:** a worded 4xx gives `` `Not saved — ${who}: ${refusalWords}` ``. A worded 5xx gets the "may have been" wording.
- **4xx vs 5xx:** yes.
- **Drawn:** `saveState` banner.
- Follows the maybe rule except on a throw.

**S4. 1048 `saveExtra` (1040) via `writeSettings` (saveSettings.js:89): PUT /settings with ifRevs**
- **Writes:** the commission tiers (`quotaData`) or the `spiffs` board, each from a draft.
- **Optimistic:** no. The draft is kept on failure.
- **Throw:** writeSettings returns status 0, which gives `` `Not saved — ${NETWORK_ERROR}` ``, i.e. "Not saved — The server could not be reached." **This is "Not saved" on a throw.**
- **Non-ok, no words:**
  - a 403 gives "Not saved — only Admins can change …"
  - otherwise `` `The ${label} may have been saved — reload the page to see whether they were: …` ``
- **Non-ok, with words:**
  - a worded 4xx gives `Not saved — …`
  - a 409 `stale` takes the latest settings and gives `listChanged(...)`
- **4xx vs 5xx:** yes (ownRefusal on `saidOf`).
- **Drawn:** `saveState` banner.
- Follows the maybe rule except on a throw.

**S5. 1112 `sendQuotas` (1091): PUT /users?quotas=true**
- **Writes:** `{fiscalYear, breakdown, members}` (the year's quota plans).
- **Optimistic:** no. Drafts are kept until the answer.
- **Throw:** `unsure('No answer from the server — reload the page to see whether the quotas were saved.')`. The drafts are kept.
- **Non-ok, no words:** `` `The quotas may have been saved — reload the page to see whether they were: ${refusalWords}` ``
- **Non-ok, with words:** a worded 4xx gives `` `Not saved — ${refusalWords}` `` (via `refuse`).
- **4xx vs 5xx:** yes.
- **Drawn:** `saveState` banner.
- Follows the maybe rule.

**S6. 1512 coaching note Delete: `deleteCoachingNote` (hooks/useCoachingNotes.js:98) DELETE /coaching-notes?id=**
- The request is in the hook; only the words are in the tab.
- **Optimistic:** no. The hook removes the note after ok.
- **Throw:** the hook's `answered` gives `{ok:false, error: failureWords(e)}` with no status. `noteNotDeleted` matches `r.error === NETWORK_ERROR`, giving `Not deleted — The server could not be reached.` **This is "Not deleted" on a throw.**
- **Non-ok, no words:** "The coaching note may have been deleted — reload the page to see whether it was: …"
- **Non-ok, with words:** a worded 4xx gives `Not deleted — …`.
- **4xx vs 5xx:** yes.
- **Drawn:** `saveState` banner.

---

## LeadsTab.jsx

**L1. 1166 `saveLead` (1160): PUT /leads?id= via dbWrite**
- **Writes:** a lead patch: assignee, status or clear. Callers: Triage assign/bulk at 582/586/598/601/812, DistributePanel 805, Cockpit 1005/1008.
- **Optimistic:** YES. `setLeads` merges the patch before the request; `snapshot` is the whole previous list.
- **Throw (status 0):** `` `Lead not saved — ${r.error}` `` gives "Lead not saved — The server could not be reached." It ROLLS BACK with `setLeads(snapshot)`.
- **Non-ok, no words:** "Lead not saved — The server returned N." (a 403 gives the permission sentence) + rollback.
- **Non-ok, with words:** "Lead not saved — <words>" + rollback.
- **4xx vs 5xx:** no.
- **Drawn:** `setUndoToast({ error })`.
- **FINDING:** the rollback restores the WHOLE list as it stood before this press. The bulk callers (598, 812) fire `forEach(id => saveLead(...))` concurrently. When one fails, its snapshot (taken after the earlier saves' optimistic merges but before the later ones) also undoes the LATER rows' optimistic changes, which may have landed.

**L2. 1218 `deleteLead` (1216): DELETE /leads?id= via dbWrite**
- **Optimistic:** no. The row is removed only on ok.
- **Throw:** "Lead not deleted — The server could not be reached."
- **Non-ok, no words:** "Lead not deleted — The server returned N." (a 403 gives the permission sentence).
- **Non-ok, with words:** "Lead not deleted — <words>".
- **4xx vs 5xx:** no.
- **Drawn:** undo toast error.

**L3. 1238 `requestLead` (1233): POST /lead-requests (a CREATE)**
- **Writes:** `{id, leadId, note}`.
- **Optimistic:** no.
- **Throw:** `` `Request not sent: ${failureWords(e)}` `` gives "Request not sent: The server could not be reached."
- **Non-ok, no words:** "Request not sent: The server returned N."
- **Non-ok, with words:** "Request not sent: <words>".
- **Landed, unreadable:** "Requested — Its answer could not be read. Reload the page to see the request."
- **4xx vs 5xx:** no.
- **Id:** `'lcr_' + crypto.randomUUID()` **per press**. There is no in-flight guard in the function.
  - Server: lead-requests.mjs:85 answers 409 "You have already requested this lead." I read only that line, not the condition around it.
  - So a retry after a lost-but-landed answer is likely refused with "Request not sent: You have already requested this lead." The condition is not verified.
- **Drawn:** a press notice via `sayClaim` (kept until its ✕).

**L4. 1261 `cancelRequest` (1256): DELETE /lead-requests?id=**
- **Optimistic:** no.
- **Throw:** "Request not cancelled: The server could not be reached."
- **Non-ok, no words:** "Request not cancelled: The server returned N."
- **Non-ok, with words:** "Request not cancelled: <words>".
- **4xx vs 5xx:** no.
- **Drawn:** press notice.

**L5. 1278 `resolveRequest` (1272): PUT /lead-requests**
- **Writes:** `{id, action}` (approve or deny).
- **Optimistic:** no.
- **Throw:** `` `Request not ${verb}: …` `` gives "Request not approved: The server could not be reached." (or "denied").
- **Non-ok, no words:** "Request not approved: The server returned N."
- **Non-ok, with words:** the same template with the words.
- **Landed, unreadable:** "Request approved — Its answer could not be read. Reload the page…"
- **4xx vs 5xx:** no.
- **Drawn:** press notice.

---

## TasksTab.jsx

**T1. 199 `handleSnooze` (190): PUT /tasks via `taskWriteAnswer` (utils/taskWrite.js)**
- **Writes:** the whole task row with a new dueDate, status Open.
- **Optimistic:** YES. The row is set to `updated` first.
- **Throw:** `{ok:false, error: failureWords(e)}` gives `` `Not snoozed: ${answer.error}` ``, i.e. "Not snoozed: The server could not be reached." It ROLLS BACK this press's copy by identity.
- **Non-ok, no words:** "Not snoozed: The server returned N." + rollback.
- **Non-ok, with words:** "Not snoozed: <words>" + rollback.
- **Landed, non-JSON:** kept as landed.
- **4xx vs 5xx:** no.
- **Drawn:** press notice (`sayRefused`, 628).

**T2. 186 `handleComplete` (178): via the hook `useTasks.handleCompleteTask` (hooks/useTasks.js:143) PUT /tasks**
- The request is in the hook.
- **Optimistic:** YES (hook line 160). The hook comment says it rolls back only this press's copy on failure; I read the comment, not the rollback lines.
- **Words:** `` `Not completed: ${done.error}` ``. The error comes from taskWriteAnswer, so a throw gives "Not completed: The server could not be reached."
- **4xx vs 5xx:** no.
- **Drawn:** press notice.

---

## QuotesTab.jsx

**Q1. 1854 `handleCreateJob` (1849): POST /quote-to-job (a CREATE)**
- **Writes:** `{quoteId}`.
- **Optimistic:** no.
- **Throw:** `` `The job was not created — ${failureWords(e)}` `` gives "The job was not created — The server could not be reached."
- **Non-ok, no words:** "The job was not created — The server returned N."
- **Non-ok, with words:**
  - a 409 with `refused.job` adopts the existing job, with no words
  - otherwise "The job was not created — <words>"
- **Landed, unreadable:** "The job was created. Its answer could not be read — reload the page to see it." (`jobUnread`)
- **4xx vs 5xx:** no.
- **Id:** server-assigned. A retry is idempotent by quote: quote-to-job.mjs:111 answers 409 with `job: existing`, which the screen adopts.
- **Drawn:** `jobError` on the card.

**Q2. 1910 `handleExportPDF` (1903): POST /quote-pdf via `quotePdfOf` (utils/quotePdfAnswer.js)**
- Not a data save. It makes a file; the server writes one audit row (`auditAs`, quote-pdf.mjs:122).
- **Throw:** "The PDF was not made — The server could not be reached."
- **Non-ok:** "The PDF was not made — <readRefusal words>".
- **Drawn:** `pdfError` under Download PDF.
- Likely outside the maybe rule.

All other QuotesTab writes go through hook handlers (`handleSaveQuote`, `handleSaveProduct`, `handleDeleteProduct`, `handleDeleteQuote`) and are out of scope.

---

## ReportsTab.jsx

**R1. 2441 `applyPrompt` (2427): POST /report-prompt**
- An AI read, not a stored write. The local interpreter runs either way.
- **Throw:** "Claude could not be reached — read by the built-in interpreter instead."
- **Non-ok:** `` `Claude could not read this one (${await readRefusal(res)}) — read by the built-in interpreter instead.` ``
- Not a save; outside the rule.

**R2. 2539 `patchReport` (2537): PUT /saved-reports `{id, ...patch}`**
- A shared helper with no `stillOrg` check.
- **Non-ok:** throws `res.status === 403 ? 'Only the report’s owner or an Admin can change it.' : await readRefusal(res)`.
- **Throw:** propagates.
- **Landed, unreadable:** returns null.
- **Callers:**
  - **R2a. `toggleShare` (2545):** isShared.
    - **Optimistic:** no.
    - **Throw:** `` `Sharing not changed — ${failureWords(e)}` `` gives "Sharing not changed — The server could not be reached."
    - **Non-ok, no words:** "Sharing not changed — The server returned N."
    - **Non-ok, with words:** "Sharing not changed — <words>" (a 403 gives the owner sentence).
    - **Landed, unreadable:** "Shared — Its answer could not be read. Reload the page…"
    - **Drawn:** `libError`.
  - **R2b. `saveDelivery` (2593):** the schedule.
    - **Throw:** `` `Schedule not saved — ${failureWords(e)}` ``
    - **Non-ok:** the same template with refusal words.
    - **Drawn:** `deliveryNote` `{ok:false}` in the schedule dialog.
  - **R2c. `sendNow` (2600), part 1:** the delivery patch first.
    - Its throw or refusal falls to the outer catch: `` `Not sent — ${failureWords(e)}` ``. So a refused SAVE of the schedule reads "Not sent — …".
- **4xx vs 5xx:** no, except the 403 sentence.

**R3. 2568 / 2582 `togglePin` (2555): PUT /users?me=true `{id, pinnedReports}`**
- There is a re-read and resend at 2576-2582 when the refusal names `field: 'pinnedReports'`.
- **Optimistic:** no. The profile is set after ok.
- **Throw (`.catch(() => null)`):** `` `No answer from the server — reload the page to see whether the report was ${unpin ? 'unpinned' : 'pinned'}.` ``
- **Non-ok, no words:** `` `Pin not saved — ${refusalWords(res, data)}` `` gives "Pin not saved — The server returned N.", **including a 5xx or a gateway page**.
- **Non-ok, with words:** "Pin not saved — <words>".
- **4xx vs 5xx:** no.
- **Drawn:** `libError`.
- Follows the maybe rule on a throw only; a wordless 5xx still says "not saved".

**R4. 2606 `sendNow` (2600), part 2: POST /saved-reports?action=deliver&id=**
- An action: it sends email/Slack. A retry re-sends.
- **Throw:** `` `Not sent — ${failureWords(e)}` ``
- **Non-ok:**
  - a 400 with an `errors` array is said as its result
  - otherwise `` `Not sent — ${refusalWords(res, data)}` ``, including a wordless 5xx
- **Landed, unreadable:** "Sent — Its answer could not be read, so where it went is not shown."
- **4xx vs 5xx:** no.
- **Drawn:** `deliveryNote`.

**R5. 2634 `confirmDelete` (2633): DELETE /saved-reports via dbWrite**
- **Optimistic:** no.
- **Throw:** `` `Report not deleted — ${rd.error}` `` gives "Report not deleted — The server could not be reached."
- **Non-ok, no words:** "Report not deleted — The server returned N." (a 403 gives "You do not have permission to make this change.")
- **Non-ok, with words:** "Report not deleted — <words>".
- **4xx vs 5xx:** no.
- **Drawn:** `libError`.

**R6. 2674 `handleSaveReport` (2660): POST (new) or PUT (existing) /saved-reports (a CREATE when new)**
- **Optimistic:** no.
- **Throw:** `` `The report was not saved — ${failureWords(err)}` `` gives "The report was not saved — The server could not be reached."
- **Non-ok, no words:** `throw new Error(await readRefusal(res))` gives "The report was not saved — The server returned N."
- **Non-ok, with words:** the same template with the words.
- **FINDING:** `const data = await res.json();` (2681) is UNCAUGHT. A landed 2xx whose body is not JSON lands in the catch and says "The report was not saved — Its answer could not be read." for a save that landed.
- **4xx vs 5xx:** no.
- **Id:** `existingId || ('rpt_' + crypto.randomUUID())` is a **fresh id per press**.
  - saved-reports.mjs:157-159 is insert-on-conflict-do-nothing, answering 409 "That report id is already in use."
  - So a retry after a lost answer creates a DUPLICATE report.
  - Keeping one id would instead meet the server's 409, which the screen would say as "not saved".
- **Drawn:** `saveError` via SaveRefusalNote / BuilderHeader at the pressing screen (`saveErrorAt`).

**R7. 5741 `handleSaveAsReport` (5725): POST /saved-reports (a CREATE)**
- **Optimistic:** no.
- **Throw:** `` `The history report was not saved — ${failureWords(e)}` ``
- **Non-ok, no words:** "The history report was not saved — The server returned N."
- **Non-ok, with words:** the same template with the words.
- **FINDING:** the same uncaught `res.json()` (5747), so a landed non-JSON answer says "not saved — Its answer could not be read."
- **Id:** `'rpt_' + crypto.randomUUID()` **per press**, so a retry duplicates.
- **4xx vs 5xx:** no.
- **Drawn:** the `saveReportError` banner at the top of Activity history.

**R8. 6423 Add contact to deal (`onSave`, 6409): PUT /opportunities?id= via dbWrite**
- **Writes:** `{id, contactIds, contacts}`.
- **Optimistic:** no. `localContactIds` changes after ok.
- **Throw:** `` `${n === 1 ? 'The contact was' : `${n} contacts were`} not added to this deal — ${added.error}` `` gives "… not added to this deal — The server could not be reached."
- **Non-ok:** the same template with refusalOf words (a 403 gives the permission sentence; no words gives "The server returned N.").
- **4xx vs 5xx:** no.
- **Drawn:** `dealContactsError` banner. The panel stays open.
- The outer `catch (e) { console.error('Add contact to opp failed:', e) }` is console-only, but dbWrite never throws, so it catches only local errors.

**R9. 6485 `handleRemove` (6475): PUT /opportunities?id= via dbWrite**
- **Optimistic:** no.
- **Throw:** `` `${name || 'The contact'} was not taken off this deal — ${removed.error}` ``
- **Non-ok:** the same template.
- **4xx vs 5xx:** no.
- **Drawn:** `dealContactsError`.

**R10. 6511 `handleSetPersona` (6495): PUT /contacts?id= via dbWrite**
- **Writes:** `{id, buyerPersona}`.
- **Optimistic:** YES. `localPersonaMap` is set first.
- **Throw:** `` `${name || 'The contact'}'s buyer persona was not saved — ${rp.error}` `` and a ROLLBACK to the shown value (only while this pick is still shown).
- **Non-ok:** the same template + rollback.
- **4xx vs 5xx:** no.
- **Drawn:** `dealContactsError`.

---

## DispatchTab.jsx

There are 20 request sites; D5 is one request site that serves five invoice actions. None distinguishes 4xx from 5xx except the 403 role sentences. Every non-ok answer is said in readRefusal words ("The server returned N." when there are none).

**D1. 1189 `CrewBuilderView.handleSchedule` (1125): PUT /dispatch-jobs?id=**
- **Writes:** status scheduled, crew, date/time, `assignedEquipmentIds`.
- **Optimistic:** no. `onScheduled` runs after ok.
- **Throw:** `setScheduleError(failureWords(e))` gives a bare "The server could not be reached." The crew picks are kept. There is no stillOrg check in the catch.
- **Non-ok, no words:** "The server returned N."
- **Non-ok, with words:** the words. A 403 always gives "Your role cannot schedule jobs."
- **Drawn:** `scheduleError` in the crew builder.

**D2. 1262 `writeHeldCrew` (1250): PUT /dispatch-jobs?id=**
- **Writes:** status unscheduled, crew held.
- **Optimistic:** no.
- **Throw:** bare "The server could not be reached."
- **Non-ok:** words / "The server returned N.". A 403 gives "Your role cannot schedule jobs."
- **Drawn:** `scheduleError`.

**D3. 3137 `CustomersView.save` (3127): POST (new) or PUT /dispatch-customers (a CREATE when new)**
- **Optimistic:** no.
- **Throw:** `setStatus({kind:'err', msg: failureWords(err)})` gives a bare "The server could not be reached." The form is kept.
- **Non-ok:** words / status. A 403 gives "Your role cannot change customers."
- **Landed, unreadable:** keeps the body sent and says "Saved."
- **Id:** `'cust_' + crypto.randomUUID()` set at `startNew` (3110), i.e. **per dialog open**. A retry press reuses it. The server upsert is in the org (dispatch-customers.mjs:316).
- **Drawn:** the form `status` line.

**D4. 3590 `TechniciansView.save` (3571): POST (new) or PUT /dispatch-technicians (a CREATE when new)**
- **Optimistic:** no.
- **Throw:** bare failureWords in the form status.
- **Non-ok:** words / status. A 403 gives "Your role cannot change technicians."
- **Landed, unreadable:** `saved` is undefined, so nothing is adopted, yet it says "Technician created" or "Saved". The draft stays `_isNew`, so a second press POSTs again with the same id, which is an upsert and harmless.
- **Id:** `'dtech_' + crypto.randomUUID()` at `startNew` (3566), **per dialog open**. Reused.
- **Drawn:** the form `status`.

**D5. 3976 `JobInvoicePanel.write` (3973), shared by five actions on /invoices**
- **Actions:**
  - `create` (3995): POST `{jobId, issueDate}`, a CREATE
  - `issue` (3996): PUT `{status:'issued'}`
  - `voidIt` (3997): PUT `{status:'void'}`
  - `markPaid` (4002): PUT `{status:'paid', paidAt, amountPaid}`
  - `saveDraft` (4011): PUT lines and fields
- **Optimistic:** no.
- **Throw:** `` `The invoice was not ${done} — ${failureWords(e)}` `` gives "The invoice was not created — The server could not be reached." The editor or paying form is kept (returns null).
- **Non-ok:** `` `The invoice was not ${done} — ${await readRefusal(res)}` ``
- **Landed, unreadable:** `` `The invoice was ${done} — Its answer could not be read. Reload to see it.` `` and `unread` is set.
- **4xx vs 5xx:** no.
- **Id for create:** server-assigned. invoices.mjs:132 refuses a second live invoice per job (409 with `invoice` in the body). A retry after a lost answer is therefore said as "The invoice was not created — INV-x is already open on this job. Void it to start another." The 409's invoice is NOT adopted (`write` reads the 409 only for words).
- **Drawn:** `err` alert in the panel.

**D6. 4278 `JobsView.save` (4264), step 1: POST (no loc.id) or PUT /dispatch-customers?resource=locations (a CREATE when new)**
- **Optimistic:** no.
- **Throw:** propagates to the catch, which gives a bare failureWords in `status`.
- **Non-ok:** `` `The address was not saved — ${why}` ``
- **Id:** `loc.id || ('dloc_' + crypto.randomUUID())` is **per press**.
- **FINDING:** `loc` is never updated with the new id.
  - After a landed location POST, a refused or lost job PUT means the next press POSTs another new location.
  - Even after full success, `setSelectedId(data.job.id)` sets the same id, so the effect (deps `[selectedId]`) does not reload `loc`. I read it this way; I did not test it.
  - So a second Save would create another location.
- **Drawn:** `status`.

**D7. 4303 `JobsView.save`, step 2: PUT /dispatch-jobs?id=**
- **Writes:** the job's fields and locationId.
- **Optimistic:** no.
- **Throw:** bare failureWords.
- **Non-ok:** words / status. A 403 gives "Your role cannot edit jobs."
- **Landed, unreadable:** says "Saved" and adopts nothing.
- **Drawn:** `status`.

**D8. 5664 `recordVisit` (5660): POST /dispatch-plan-visits (a CREATE: skip or defer)**
- **Optimistic:** no.
- **Throw:** `` `The visit was not ${action} — ${failureWords(e)}` ``. Returns false, so the editor stays open.
- **Non-ok:** `` `The visit was not ${action} — ${why}` ``
- **Landed, unreadable:** "The visit was skipped — Its answer could not be read. Reload to see it."
- **Id:** server-assigned. The upsert is on (org, customer, plan, dueDate) (dispatch-plan-visits.mjs:115), so a retry is idempotent.
- **Drawn:** `visitActionError` banner over Service Due.

**D9. 5696 `undoVisit` (5692): DELETE /dispatch-plan-visits?id= via dbWrite**
- **Optimistic:** no.
- **Throw:** `` `Not undone — ${r.error}` `` gives "Not undone — The server could not be reached."
- **Non-ok:** "Not undone — <refusalOf words>" (a 403 gives the permission sentence).
- No stillOrg check.
- **Drawn:** `visitActionError`.

**D10. 5709 `renewAgreement.go` (5705): PUT /dispatch-customers?id= `{agreementExpiry}`**
- **Optimistic:** no.
- **Throw:** `` `The agreement was not renewed — ${failureWords(e)}` ``
- **Non-ok:** the same template with the words.
- **Landed, unreadable:** "The agreement was renewed — Its answer could not be read. Reload to see it."
- **Drawn:** `visitActionError`.

**D11. 6051 `handleSaveNewJob` (6009), step 1: POST /dispatch-customers via `saveDroppingRefused` (a CREATE)**
- **Optimistic:** no. `setCustomers` runs after landed.
- **Throw:** the send callback does not catch, so the error propagates to the outer catch: `setNewJobError(failureWords(err))` gives a bare "The server could not be reached." The form is kept.
- **Non-ok:** `` `The customer was not created — ${cwhy}` `` (refusalWords). A 404 on accountId is dropped and resent.
- **Id:** `'dcust_' + crypto.randomUUID()` **per press**.
  - It is kept on the form (`customerId`, `madeCustomerId`) only after a LANDED ok answer.
  - A throw on a customer POST that landed means the retry makes a NEW id, and a DUPLICATE customer.
- **Drawn:** `newJobError` in the New Job form.

**D12. 6081 `handleSaveNewJob`, step 2: POST /dispatch-customers?resource=locations (a CREATE)**
- **Throw:** bare failureWords.
- **Non-ok:** `` `The job address was not saved — ${await readRefusal(lres)}` ``
- **Id:** `'dloc_' + crypto.randomUUID()` **per press**, kept (`madeLocation`) only after a landed answer. A throw means a retry makes a NEW location.
- **Drawn:** `newJobError`.

**D13. 6134 `handleSaveNewJob`, step 3: POST /dispatch-jobs via `saveDroppingRefused` (a CREATE)**
- **Optimistic:** no. `setJobs` runs after landed.
- **Throw:** bare failureWords.
- **Non-ok:** `throw new Error(why)` gives the refusalWords alone (no "not created" prefix). A 404 on accountId/opportunityId is dropped and resent.
- **Id:** `'djob_' + crypto.randomUUID()` **per press, never kept**. A lost answer then a retry gives a DUPLICATE job. The customer and location are reused only if they landed with an answer.
- **Drawn:** `newJobError`.

**D14. 6273 `confirmMassSchedule` (6253): PUT /dispatch-jobs?id=, one per proposal**
- **Optimistic:** no. The applied jobs are set after the loop.
- **Throw:** counted as failed, `` firstError = `${title}: ${failureWords(e)}` `` (bare "The server could not be reached."). The failed proposals stay in the panel for a re-press, which re-sends the PUT (idempotent).
- **Non-ok:** the same, with readRefusal words.
- **Drawn:** `massProg.error` in MassSchedulePanel.
- **Audit:** `addAudit` counts the failures as "N failed".

**D15. 6342 `saveBlock` (6337): POST (new) or PUT /dispatch-schedule-blocks (a CREATE when new)**
- **Optimistic:** no.
- **Throw:** propagates. ScheduleView `submit` and `confirmWithUnassign` (4976/4984) give `setErr(failureWords(e))`, a bare "The server could not be reached." The dialog is kept.
- **Non-ok:** throws a 403 as "Your role cannot change availability.", else readRefusal.
- **Landed, unreadable:** "The time off was saved, but its answer couldn't be read. Refresh to see it."
- **Id:** `'dblk_' + crypto.randomUUID()` at `blank()` (4957), **per dialog open**. Reused. The server upsert is in the org.
- No stillOrg check before the throw.
- **Drawn:** the block dialog's `err`.

**D16. 6369 `saveBlock`, unassign loop: PUT /dispatch-jobs?id= `{status:'unscheduled', crew cleared}`**
- **Optimistic:** no.
- **Throw:** pushed to `notFreed` with `failureWords(e)`.
- **Non-ok:** readRefusal words.
- Said by `notFreedWords(...)` in the `unassignError` banner across the top of Dispatch.

**D17. 6406 `deleteBlock` (6405): DELETE /dispatch-schedule-blocks?id=**
- **Optimistic:** no.
- **Throw:** propagates. The ScheduleView Delete button (5210) gives `setErr(failureWords(e))`, a bare message.
- **Non-ok:** `throw new Error(await readRefusal(res))`.
- No stillOrg check.
- **Drawn:** the block dialog's `err`.

**D18. 6412 `saveWorkingHours` (6411): PUT /dispatch-technicians?id= `{workingHours}`**
- **Optimistic:** no.
- **Throw:** propagates. ShiftPatternDialog (5308) gives `` `Not saved — ${failureWords(e)}` ``, i.e. "Not saved — The server could not be reached."
- **Non-ok:** "Not saved — <words>".
- **Landed, unreadable:** changes nothing, says nothing, and the dialog closes.
- **Drawn:** ShiftPatternDialog `err` under its Save.

**D19. 6427 `updateMyJob` (6424): PUT /dispatch-jobs?id= (the technician's own status change)**
- **Optimistic:** no.
- **Throw:** propagates. TechJobCard `run` (5348) gives `setErr(failureWords(e))`, a bare message.
- **Non-ok:** readRefusal words.
- **Landed, unreadable:** changes nothing, says nothing.
- **Drawn:** TechJobCard `err`.

**D20. 6510 `handleWeekMove.commit` (6506): PUT /dispatch-jobs?id= (drag reschedule)**
- **Optimistic:** no.
- **Throw:** `setWeekMove({error: failureWords(e)})`, a bare message.
- **Non-ok:** words / status. A 403 gives "Your role cannot reschedule jobs."
- **Landed, unreadable:** moves the row as sent.
- **Drawn:** `weekMove.error` strip above the week grid.

---

## Writes whose failure is only console-logged

None of the request failures is console-only. Two places come close:

- **ReportsTab 6457:** `catch (e) { console.error('Add contact to opp failed:', e) }`. It is reachable only by a local exception, because dbWrite never throws.
- **dbFetch itself (storage.js:68/71)** also console-logs every non-ok answer and every throw, alongside the screen's words.

## Totals

- 46 request call sites in scope (6 + 5 + 2 + 2 + 11 + 20):
  - SalesManagerTab: 4 direct + 1 via writeSettings + 1 via a hook
  - LeadsTab: 5
  - TasksTab: 1 direct + 1 via a hook
  - QuotesTab: 2
  - ReportsTab: 11, plus the patchReport callers
  - DispatchTab: 20, with D5 serving 5 actions
- 3 of those POSTs are not saves: report-prompt, quote-pdf, and the saved-reports deliver action.
- Writes that go through useApp hooks (deal/account/contact/quote/product/delete handlers, merges) are NOT in this census.

**Sites already following the maybe rule:** the SalesManagerTab ones only.
- S1 claim Approve/Reject, S2 claim Delete, S5 quotas: fully, on throw and non-ok.
- S3 forecast call, S4 commission tiers and SPIFFs, S6 coaching note Delete: on non-ok only. On a throw they say "Not saved" / "Not deleted".
- Elsewhere, only ReportsTab `togglePin` (R3) says "No answer … reload to see" on a throw. Its wordless 5xx still says "Pin not saved".
- No other site distinguishes 4xx from 5xx. Every other site says "not …" for a wordless 5xx or a gateway page.

**Optimistic writes that roll back on any failure, including a throw:**
- L1 `saveLead`: the whole-list snapshot, with the bulk hazard described above.
- T1 Snooze.
- T2 Complete (in the hook).
- R10 buyer persona.

**Creates with a fresh id per press (a retry after a lost answer can duplicate):**
- R6 `handleSaveReport` (new report, `rpt_`)
- R7 `handleSaveAsReport` (`rpt_`)
- L3 `requestLead` (`lcr_`). The server's duplicate-request 409 likely blocks the duplicate, but that is not verified.
- D6 JobsView location (`dloc_`). It is also never remembered after success.
- D11 New Job customer (`dcust_`). Reused only after a landed answer.
- D12 New Job location (`dloc_`). Reused only after a landed answer.
- D13 New Job job (`djob_`). Never reused.

Creates with an id per dialog open, reused on retry: D3 customer, D4 technician, D15 schedule block.
Creates with a server-assigned id: Q1 quote-to-job (409 adopts the existing job), D5 invoice create (409 one live invoice per job, not adopted), D8 plan visit (natural-key upsert).

**Sites saying "Not saved" / "Not …" on a throw:**
- SalesManagerTab:
  - S3 "Not saved — The server could not be reached."
  - S4 "Not saved — The server could not be reached."
  - S6 "Not deleted — The server could not be reached."
- LeadsTab:
  - L1 "Lead not saved — …"
  - L2 "Lead not deleted — …"
  - L3 "Request not sent: …"
  - L4 "Request not cancelled: …"
  - L5 "Request not approved/denied: …"
- TasksTab:
  - T1 "Not snoozed: …"
  - T2 "Not completed: …"
- QuotesTab:
  - Q1 "The job was not created — …"
  - Q2 "The PDF was not made — …" (not a save)
- ReportsTab:
  - R2a "Sharing not changed — …"
  - R2b "Schedule not saved — …"
  - R2c / R4 "Not sent — …"
  - R5 "Report not deleted — …"
  - R6 "The report was not saved — …"
  - R7 "The history report was not saved — …"
  - R8 "… not added to this deal — …"
  - R9 "… was not taken off this deal — …"
  - R10 "…'s buyer persona was not saved — …"
- DispatchTab:
  - D5 "The invoice was not created/issued/voided/marked paid/saved — …"
  - D8 "The visit was not skipped/deferred — …"
  - D9 "Not undone — …"
  - D10 "The agreement was not renewed — …"
  - D18 "Not saved — …" (ShiftPatternDialog)

**Sites saying the bare "The server could not be reached." on a throw** (neither "not" nor "may"): D1, D2, D3, D4, D6, D7, D11, D12, D13, D14 (prefixed with the job title), D15, D16, D17, D19, D20.

**Other findings:**
- (a) R6 and R7 call `res.json()` uncaught after ok, so a landed non-JSON answer says "not saved — Its answer could not be read."
- (b) L1's whole-list rollback can undo other concurrent bulk saves.
- (c) D6 never stores the location id it made, so repeated Saves can create extra locations.
- (d) D5 does not adopt the 409's `invoice` on a retried create.
- (e) R2c: a refused or lost schedule PATCH inside "Send now" is said as "Not sent".
- (f) dbWrite's 403 always reads "You do not have permission to make this change." even when the server sent its own words. This affects L1, L2, R5, R8, R9, R10 and D9.
