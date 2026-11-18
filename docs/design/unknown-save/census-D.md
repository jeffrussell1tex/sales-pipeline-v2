# Census D — can a write answer non-2xx with an `error` string AFTER it committed?

Read-only census, 18 Nov 2026, tree at 92d1bc8 (dev). Nothing in the repo was written, run or tested.
Method: SPA write calls listed by scanning src/ for `/.netlify/functions/<name>` with a POST/PUT/PATCH/DELETE
method (plus URL constants: DOCS_FN, coaching-notes URL, STREAM_URL, SETTINGS_URL, invoices `url()`).
Each handler was read by one of six read-only readers; every "YES" below on a 4xx, every multi-statement
YES, and the earlier 16 Nov claims were then re-read by me from the file (marked **[re-read]**). Rows not
re-read by me rest on the reader's line refs and are marked (reader).

## 0. Facts every row depends on

- DB client: `drizzle-orm/neon-http` (db/index.ts). Every awaited statement commits on its own;
  `db.batch([...])` is the only all-or-nothing unit; `db.transaction` is not usable. **[re-read]**
- Every outer catch in scope answers `500` with `serverErrorBody(err)` = `{"error":"Internal server error","requestId":…}`
  (_lib.mjs 36-40) **[re-read]**. accounts/contacts/leads/activities/tasks/opportunities first try
  `ambiguousOwnerResponse` (409 `{error, ambiguous, candidates}`), but every owner-resolving call runs before the
  first write (readers C, B). **So any uncaught throw after a commit = a non-2xx WITH an `error` string.**
- Never throw (re-read): `writeAudit` (_lib 60-78), `auditAs` (85-89), `resolveCaller` (117-136), `ensureRosterRow`
  (667-709), `rescoreDeals` (_dealScore 78-91), `streamAudit` (_auditStream 72-91), `dispatchAutomations`
  (dispatch-automations 182-275), `notifyCustomer` (_customerNotify 37-119). `getCallerName`/`getCallerId` throw
  only on a falsy orgId, and verifyAuth 403s a token with no org (auth.mjs 112-115, reader A).
- DO throw / propagate: `scoreOrgDeals` (_dealScore 99-122, model write then one UPDATE per 100 deals) **[re-read]**;
  `bulkUpsert` (_bulk 250-257: one awaited statement per 400-row chunk, no catch) **[re-read]**; `withNumberRetry`
  (_lib 531-547) rethrows non-23505; `sendTestEvent` (_auditStream 93-99) no catch; `removeWithLists`
  (_links 145-169): try 0 is `db.batch([removal, write])`; if the settings write lands nothing the member is
  ALREADY removed and tries 1-2 run SELECT 148 / UPDATE 164 as separate, uncaught statements **[re-read]**.
- `bulkInsert` (_bulk 57-100) never throws: failed rows go to `failed[]`, the caller answers 201 (readers B, C).
- The SPA's bulk client sends at most 400 rows per request (src/utils/bulkClient.js 19, 69-71, 124-126) **[re-read]**,
  so an SPA bulk PUT is one bulkUpsert chunk = one atomic statement.

## 1. Table — one row per endpoint + method (+ branch)

Legend for column 5: **YES-4xx** = refusal in own words after a commit (the rule's real exposure);
**YES-5xx** = `serverErrorBody` 500 after a commit; no = proven safe as read; race = only if another request
deletes the row between this request's write and its re-read.

### CRM records

| file | method / branch | writes (batch?) | post-write work that can throw uncaught | non-2xx with `error` after commit? | create id handling |
|---|---|---|---|---|---|
| accounts | POST bulk | bulkInsert 255 (chunks, separate); clearStrayLinks 259 (never throws) | none | no — always 201 with `failed[]` | client id required (227); id twice in batch 400 (233-234); taken id (any org) → that row in `failed[]`, still 201 |
| accounts | POST single (+ Undo `restore:true`) | 1 insert 304 `onConflictDoNothing(id)` | none | no | 409 `That account id is already in use.` (305), any org, nothing written |
| accounts | PUT bulk | bulkUpsert 356-368 | a later chunk (_bulk 253) | YES-5xx only above 400 eligible rows (not reachable from SPA) | — |
| accounts | PUT single | `db.batch` 449-455 (account, deal lifts, tiers) **then on a rename two separate UPDATEs** 462-463 (deals' `account`), 464-465 (contacts' `company`) **[re-read]** | 462, 464 | **YES-5xx** (rename only): batch committed → 462/464 throws → catch 596-602 500 | — |
| accounts | DELETE ?clear=true | delete 481 | writeAudit | no | — |
| accounts | DELETE ?id | `db.batch` 560-571 (select kids, delete, tier updates, lift kids) **[re-read]** | none | **race YES-4xx**: if the account was deleted by another session after the read at 514 and a row still names it as parent, the lift/tier updates commit and 576 answers 404 `{error:'Not found'}` (comment at 574-575 assumes "nothing was written") | — |
| contacts | POST bulk | bulkInsert 127; clearStrayLinks 131 | none | no — 201 | client id required (107); no repeated-id check; taken/repeated id → `failed[]`, 201 |
| contacts | POST single (+restore) | 1 insert 152 onConflictDoNothing | none | no | 409 `That contact id is already in use.` (153) |
| contacts | PUT bulk | bulkUpsert 189-202 | later chunk | YES-5xx only above 400 rows (not from SPA) | — |
| contacts | PUT single | 1 upsert 232-234 | none | no | — |
| contacts | DELETE ?clear=true / ?id | delete 248 / 276 | writeAudit | no (404 at 278 = nothing deleted) | — |
| leads | POST bulk | bulkInsert 152 | none | no — 201 | client id required (131); taken/repeated id → `failed[]` |
| leads | POST single | plain insert 196, **no onConflict**; dispatchWebhook 199 (never throws, awaited) | none | no | **taken id (any org) → PK 23505 → 500 `Internal server error`, nothing written, no words** |
| leads | PUT | 1 upsert 303-305 | dispatchWebhook 315 | no (404 309-310 = no row returned) | — |
| leads | DELETE ?clear / ?id | delete 334 / 365 | writeAudit | no | — |
| lead-requests | POST | plain insert 87-94, no onConflict | writeAudit | no | **taken id → 500, nothing written, no words** |
| lead-requests | PUT deny | update 122-125 | writeAudit | no | — |
| lead-requests | PUT approve | **separate**: leads UPDATE 147-149, request UPDATE 150-153, sibling SELECT 157-162, loop of UPDATEs 163-167 **[re-read]** | 150, 157, 164 | **YES-5xx** (catch 200-203). And a retry after a failure in 157-167 meets 115-116 → **409 `This request was already approved.`** — own words, on a request that writes nothing, while the earlier one committed | — |
| lead-requests | DELETE | delete 194 | none | no | — |
| activities | POST | 1 insert 127 onConflictDoNothing | rescoreLead 129 (try/catch), rescoreDeals 130 | no | 409 `That activity id is already in use.` (128) |
| activities | PUT / DELETE | upsert 175-177 / delete 190, 211 | same helpers, all catch | no | — |
| tasks | POST | 1 insert 98 onConflictDoNothing | none | no | 409 `That task id is already in use.` (99) |
| tasks | PUT / DELETE | upsert 148-150 / delete 173, 197 | dispatchWebhook, dispatchAutomations (not awaited) | no | — |
| saved-reports | POST create | 1 insert 158 onConflictDoNothing | auditAs; makersNamed catches its read | no | 409 `That report id is already in use.` (159) |
| saved-reports | POST ?action=deliver (Send now) | report-deliveries.mjs: emails sent 114, then UPDATE stamp 135-137 **[re-read]** | — | **non-2xx after commit, body WITHOUT `error`**: saved-reports 143 `statusCode: result.ok ? 200 : 400`, body `{ok, sent, errors[], rows, delivery}` — stamp committed, some emails/Slack may have gone **[re-read]** | — |
| saved-reports | PUT / DELETE | update 186-189 / delete 206 | auditAs | no | — |
| spiff-claims | POST / PUT / DELETE | insert 111-113 onConflictDoNothing / update 167-169 / delete 182 | auditAs | no | 409 `That claim id is already in use.` (114) |
| coaching-notes | POST | plain insert 120, no onConflict | writeAudit | no | **taken id → 500, nothing written, no words** |
| coaching-notes | PUT (read) / DELETE | update 139-140 / delete 152 | — | no | — |

### Deals, merge, scoring, AI

| file | method / branch | writes (batch?) | post-write work that can throw uncaught | non-2xx with `error` after commit? | create id handling |
|---|---|---|---|---|---|
| opportunities | POST single | 1 insert 406 onConflictDoNothing; rescoreDeals 444 (own UPDATE, never throws) | none (maybeEmail, dispatchWebhook, automations, rescoreDeals all catch) | no — 409 at 407 = nothing inserted | client id required (388-390); 409 `That deal id is already in use.` (407), any org |
| opportunities | POST bulk | bulkInsert 380; rescoreDeals 384 | none | no — 201 with `failed[]`/`timedOut` | ids required (354); twice in batch 400 (356); taken id → `failed[]`, 201 |
| opportunities | PUT bulk | bulkUpsert 533 | later chunk | YES-5xx only above 400 rows (not from SPA) | — |
| opportunities | PUT single, note op | compare-and-set UPDATE 611-614 (≤3 tries) | maybeEmail | no (404 631 / 409 633 only after tries that wrote nothing) | — |
| opportunities | PUT single, save | 1 upsert 710-721; rescoreDeals 813 | none (733 TypeError only when nothing was written) | no | — |
| opportunities | DELETE ?clear / ?id | delete 823 / 856 | writeAudit | no | — |
| merge | POST account merge | `db.batch` 381 (atomic) **then SELECT 384** **[re-read]** | 384 | **YES-5xx** (catch 390-394) — client already treats a merge 5xx as "may have been made" (mergeUndo.js 302-306, reader B) | merge-log id server-made (363) |
| merge | POST contact merge | `db.batch` 901 **then SELECT 904** **[re-read]** | 904 | **YES-5xx** | server-made (892) |
| merge | POST Undo | `db.batch` 744 | none | no (409 716 only after a rolled-back batch) | — |
| duplicates | (SPA sends GET only) | none — POST answers 405 | — | no | — |
| ai-score | POST | rescoreDeals 117 (may UPDATE deal_score); on failure auditAs 258; UPDATE aiScore 288 (try/catch); INSERT recommendation_log 310 (try/catch) | SELECTs 132-134, 161-171 after the 117 write | **YES-4xx-class (502) and YES-5xx**: 117 may have rewritten the deal's score and 258 wrote an audit row, then **262 `502 {error: causeWords(...), cause}`** **[re-read]**; or 132/164/171 throws → 500. 503 at 118 after a write: needs a stored-then-returned non-finite score — not read | recommendation-log id server-made (311) |
| train-deal-model | POST | scoreOrgDeals: settings dealModel UPDATE, then one UPDATE per 100 deals (separate) | any later chunk | **YES-5xx** (catch 50-53) **[re-read]** | — |
| train-lead-model | POST | scoreOrg: model UPDATE (in try/catch), then **one UPDATE per lead** (score-leads-batch 99-115, no catch) **[re-read]** | any lead UPDATE | **YES-5xx** (catch 55-58) | — |
| mention-sms | POST | no DB write; Twilio send (send-sms) | send-sms.mjs 84 `await res.json()` after Twilio accepted | YES-5xx after an SMS was sent (no DB write) | — |

### Quotes, documents, data

| file | method / branch | writes (batch?) | post-write work that can throw uncaught | non-2xx with `error` after commit? | create id handling |
|---|---|---|---|---|---|
| quotes | POST (create / new version) | 1 insert 388 in withNumberRetry, onConflictDoNothing(id) | auditAs | no | client id required (320); 409 `That quote id is already in use.` (390), any org. A new version whose (org, number, version) exists loses 5 retries → 500, nothing written |
| quotes | PUT, non-Accept branches | 1 update 531 | approval notices in try/catch 552-561 | no | — |
| quotes | **PUT → Accepted** | **separate**: `syncToOpportunity` UPDATE deal `arr` (516 → 221-223), then quote UPDATE 531-533 **[re-read]** | 531; 541 `updated.id` if the quote vanished | **YES-5xx**: deal arr committed, quote not Accepted, catch 580-583 | — |
| quotes | DELETE | delete 572 | auditAs | no | — |
| products | POST / PUT / DELETE(soft) | insert 116 onConflictDoNothing / update 145 / update 160 | auditAs | no | 409 `That id is already in use.` (117) |
| quote-pdf | POST | none | — | no | — |
| quote-to-job | POST | **separate**: customer insert 147 (if none), job insert 166, line items 205, history 209 (`.catch`) | nextJobNumber 165, products read 190, 205, SELECT 215, 218 | **YES-5xx** (catch 222-225). A retry then meets **409 `<JOB-…> already exists for this quote.` `{error, job}`** (110-111) **[re-read]** — own words, while the earlier request left a job (possibly with no lines) | ids server-made |
| documents | POST ?action=upload-url | none (presign) | — | no | 409 `That document id is already in use.` (320-321) |
| documents | **POST create** | **separate**: documents insert 359, version-1 insert 365, links 371 **[re-read]** | 365, 371 | **YES-5xx** (confirms 16 Nov). A retry with the same id → **409 `That document id is already in use.`** (362) — own words, document exists without its version 1 / links | client id required (331); 409 above, any org |
| documents | **POST new-version** | **separate**: version insert 384, documents UPDATE 389 **[re-read]** | 389 | **YES-5xx**; orphan version row; a retry inserts a second row with the same `v` (no unique index, schema 1378-1380, reader D) | — |
| documents | **POST restore-version** | **separate**: version insert 406, UPDATE 411 **[re-read]** | 411 | **YES-5xx**; same orphan / duplicate-v exposure | — |
| documents | POST ?action=link | 1 insert 428 onConflictDoNothing | auditAs | no | link ids server-made |
| documents | PUT / DELETE ?action=link | update 456 / delete 476 | auditAs | no | — |
| documents | **DELETE document** | R2 deletes 493-494 (swallowed), then **separate** DB deletes 496, 497, 498 **[re-read]** | 496, 497, 498 | **YES-5xx** after the blobs are gone and possibly some rows deleted (catch 504-506) | — |
| backup | POST snapshot / PUT schedule | 1 insert 226 / 1 upsert 273-276 | auditAs | no | server ids |
| backup | PATCH restore | many separate statements, each later step in its own try/catch | none uncaught | **non-2xx after commits WITHOUT `error`**: 561-565 `500` when `errs.length && imported === 0 && !already`, body `{ok, imported, unreached, errors[], notes, snapId}` — after scoreOrgDeals score writes, the snapshot row, the audit row, possibly-landed "unreached" rows (reader D) | rows onConflictDoNothing → counted "already here" |
| export-dsr | POST | plain insert 91-99, no onConflict | auditAs | no | **taken id → 500, nothing written, no words** |
| export-dsr | PUT / DELETE | update 133 / delete 154 | auditAs | no | — |
| export-runs | POST | 1 insert 122-138 onConflictDoNothing | auditAs; base64 body 145-159 | no handler path; whether Netlify's response-size cap fails after the commit: not read | 409 `That export run id is already in use.` (139) |
| export-schedules | POST (ExportDetail sends it) | plain insert 63-66, no onConflict | auditAs | no | **taken id → 500, nothing written, no words** |
| export-schedules | PUT / DELETE | update 86 / delete 100 | auditAs | no | — |
| report-prompt | POST | no DB write before auditAs 122 (last); Anthropic call 87 first | 109, 118 | no DB commit before a 500 (the prompt already went to Anthropic) | — |

### Dispatch, invoices

All nine files: outer catch → `500 serverErrorBody` (dispatch-customers 377-380, equipment 199-202, jobs 557-560,
plan-visits 143-146, schedule-blocks 179-182, service-plans 261-264, technicians 229-232, vehicles 174-177,
invoices 250-253). The common shape: **write, then a separate re-SELECT** for the answer (re-read for
dispatch-customers 205-212, 224-228, 312-325 and dispatch-jobs 389-418).

| file | method / branch | writes | post-write throw | after commit? | create id handling |
|---|---|---|---|---|---|
| dispatch-customers | POST ?resource=locations | upsert 205-206 | SELECT 207 | **YES-5xx**; 409 211 race only | client id; same org → overwritten (upsert); other org → 409 `That location id is already in use.` |
| dispatch-customers | PUT ?resource=locations | update 224 | SELECT 226 | **YES-5xx**; 404 228 race only | — |
| dispatch-customers | POST customer | upsert 315 in withNumberRetry | SELECT 319 | **YES-5xx**; 409 323 race only | same org → overwritten, number kept (313); other org → 409 `That customer id is already in use.` |
| dispatch-customers | PUT customer | update 356 | SELECT 358 | **YES-5xx**; 404 race only | — |
| dispatch-customers | DELETE (both) | delete 236 / 368 | auditAs | no | — |
| dispatch-equipment | POST / PUT | upsert 106 / update 170 | SELECT 112 / 173 | **YES-5xx** (409/404 race only) | same org overwritten; other org 409 `That equipment id is already in use.` |
| dispatch-equipment | DELETE | delete 190 | auditAs | no | — |
| dispatch-jobs | POST ?resource=lineitems | upsert 252 | SELECT 254 | **YES-5xx** | same org overwritten; other org 409 `That line item id is already in use.` |
| dispatch-jobs | DELETE ?resource=lineitems | delete 265 | auditAs | no | — |
| dispatch-jobs | POST job | upsert 395 in retry; history 410 (swallowed); notifyCustomer 412 (own writes + email/SMS) | SELECT 406, SELECT 413 | **YES-5xx**, incl. after a customer notice was sent | same org overwritten (number, createdBy, invoice cols kept); other org 409 `That job id is already in use.` (408) |
| dispatch-jobs | PUT (tech path / dispatcher path) | update 455 / 514; history; notifyCustomer | SELECT 458, 466 / 524, 528 | **YES-5xx** | — |
| dispatch-jobs | DELETE (not sent by SPA) | **separate** deletes 545, 547, 549 | 547, 549 | YES-5xx | — |
| dispatch-plan-visits | POST | upsert 114-119 on (org, customer, plan, dueDate) | SELECT 120 | **YES-5xx** | server id `pv_<uuid>`; same occurrence replaced |
| dispatch-plan-visits | DELETE | delete 134 | auditAs | no | — |
| dispatch-schedule-blocks | POST / PUT | upsert 120 / update 154 | SELECT 128 / 157 | **YES-5xx** | same org same tech overwritten; other tech 409 before write (97); other org 409 `That block id is already in use.` |
| dispatch-schedule-blocks | DELETE | delete 170 | auditAs | no | — |
| dispatch-service-plans | POST / PUT | upsert 164 / update 220 | SELECT 170 / 223 | **YES-5xx** | same org overwritten; other org 409 `That plan id is already in use.` |
| dispatch-service-plans | DELETE | delete 253 (in-use 409 before) | auditAs | no | — |
| dispatch-technicians | POST / PUT | upsert 156 / update 201 | SELECT 162 / 205; `memberIdOf` SELECT at 169 / 210 | **YES-5xx** | same org overwritten; other org 409 `That technician id is already in use.` |
| dispatch-technicians | DELETE | delete 219 | auditAs | no | — |
| dispatch-vehicles | POST / PUT | upsert 111 / update 150 | SELECT 117 / 153 | **YES-5xx** | same org overwritten; other org 409 `That vehicle id is already in use.` |
| dispatch-vehicles | DELETE | delete 165 | auditAs | no | — |
| invoices | POST | insert 162 in withNumberRetry, then `mirrorJob` 173 (separate SELECT 79, job UPDATE 89, SELECT 91) **[re-read]** | 79, 89, 91 | **YES-5xx** | server id `inv_<uuid>`; "one live invoice per job" is check-then-insert with no unique index (reader E) |
| invoices | PUT (issue/void/paid/edit) | update 228, then mirrorJob 230 **[re-read]** | mirrorJob | **YES-5xx** | — |
| invoices | DELETE (Admin) | delete 243, then mirrorJob 244 **[re-read]** | mirrorJob | YES-5xx | — |

### People, settings, audit, keys

| file | method / branch | writes | post-write throw | after commit? | create id handling |
|---|---|---|---|---|---|
| users | GET ?me (a GET that writes) | link UPDATE 382-391 in own try/catch, or ensureRosterRow insert | none | **YES-4xx by design**: a deactivated invited row is linked, then 412-414 `403 {error:'Your access to this organization has been turned off…', code:'deactivated'}` **[re-read]** (not a save) | — |
| users | PUT ?me | 1 update 480-484 | none | no (404 492-494 only when 0 rows) | — |
| users | POST revoke-invite | Clerk revokes 686-692; `removeWithLists` 701 | removeWithLists retry (SELECT _links 148, UPDATE 164) | **YES-5xx** (narrow: concurrent settings save + DB error); 502 at 690 after earlier Clerk revokes in the loop (Clerk only) | — |
| users | POST invite (batch) | per invite: Clerk invitation 824, then UPDATE 849 or INSERT 867 **[re-read]** | outside the per-invite try: 754 `(invite.email \|\| '').trim()` on a non-string; Manager SELECT 801-802 **[re-read]** | **YES-5xx** after earlier invites committed. All invites failed → `400 {invited:[], errors:[…]}` with **no top-level `error`** (904-908) **[re-read]** — Clerk invitations may be live where the DB step failed inside the per-invite try | no client id; existing email → status merged to Invited, no 409 |
| users | POST single create | 1 upsert 967 | none | no (500 `Insert returned no row` 968-970 = nothing written; email 23505 → 409 979-981) | client id naming a row of THIS org → 409 `That member already exists — edit them instead.` (929-935); any other id (incl. another org's) ignored, server mints |
| users | PUT ?quotas=true | `db.batch` 1045-1051 | none | no | — |
| users | PUT (incl. `{id, active}`, pins, teams cascades) | 1 update 1173 | none | no (404 1174-1176 = 0 rows) | — |
| users | DELETE ?id / ?clear=true | removeWithLists 1250 / Clerk revokes + 1220 | removeWithLists retry | **YES-5xx** (same narrow case) | — |
| user-role | PUT | 1 update 118-121 | none | no (500 `The role was not saved. Try again.` 122-125 only when 0 rows) | — |
| users-sync | POST (not ?check) | **separate** per member: insert 136-147 onConflictDoNothing, UPDATE 191 **[re-read]** | 191 (e.g. 23505 on users_org_email_uq) | **YES-5xx** mid-loop; `invalidateRoster` 200 then skipped | server ids; conflicting insert silently skipped |
| settings | PUT | `db.batch([upsert, ...renaming])` 550 **[re-read]** | none (563-588 safe) | **no — 16 Nov claim confirmed**: 409 stale (556-561) only when `landed` is empty, and the renames are gated on the new teams token, so nothing landed | `id = orgId` upsert |
| audit-log | POST | insert 58-68 | streamAudit | no | **client id is the PK; duplicate (any org) → 23505 → 500, nothing written, no words** |
| audit-stream | POST create / PUT / DELETE | insert 69-73 / update 102 / delete 115 | none (PUT 106 TypeError only when 0 rows) | no | server id `asd_<uuid>` |
| audit-stream | POST ?test=<id> | outbound POST, then `record` UPDATE of delivery state (own try/catch; may set paused) | **SELECT `rowOf(testId)` at 60** **[re-read]** | **YES-5xx**; also its 200 body carries an `error` key (sendTestEvent) | — |
| api-keys | POST / DELETE | insert 73-83 / update 119-122 | auditAs | no | server id |
| integration-requests | POST | UPDATE 141 or INSERT…onConflictDoNothing 142 (+143) | notifyOwner catches | no for the main write; edge YES-5xx after an `ensureRosterRow` insert in `requesterOf` (48-61) if 141/143 then throws (reader A) | keyed by appId; repeat → 200 `already:true` |

### Integrations

| file | method / branch | writes | post-write throw | after commit? | create id handling |
|---|---|---|---|---|---|
| automations | POST / PUT (edit, toggle) / DELETE | 1 insert 85-97 / 1 update 122-126 / 1 delete 136 | none | no. (DELETE of an id the org does not hold → **200** `{success:true}`, nothing deleted) | client id ignored; server `auto_<ts>_<rand>`; collision → 500 |
| webhooks | POST / PUT / DELETE | 1 insert 182-193 / 1 update 241 / 1 delete 270 | 245 / 271 `.join` on stored `event_types` | theoretical YES-5xx only if a stored `event_types` is a non-array (no in-app writer stores one) | client id ignored; server `wh_…` |
| send-slack | POST {webhookUrl} (Test button) | no DB write; Slack fetch 4 s timeout | fetch reject after Slack received | YES-5xx after a message that may have posted (no DB write) | — |
| send-slack | POST, stored URL (no SPA caller) | no DB write | — | **400 `Slack is not configured for this workspace`** (477) after a send that may have posted (timeout) **[re-read]** | — |
| calendar-connections | DELETE ?scope=user / org | 1 delete 115 / 142; no provider revoke | auditAs | no | — |
| calendar-oauth-start | POST | none | — | no (no outer try/catch; nothing written) | — |

## 2. Endpoint+methods that CAN answer an error in their own words after committing (the rule is wrong here)

A. **4xx (or 502) with an `error` string after this request's own commit**
1. ai-score POST → `502 {error: causeWords…, cause}` (262) after rescoreDeals may have rewritten the deal's score (117) and the failure audit row (258). Not a "save" screen, but it is a refusal-in-words after a commit.
2. users GET ?me → `403 deactivated` after the link UPDATE (by design; a GET, not a save).
3. accounts DELETE ?id → `404 Not found` (576) — race only: the batch's lift/tier updates can commit when the delete found no row.
4. dispatch-* POST/PUT re-reads → 409 `… id is already in use.` / 404 `Not found` — race only (row deleted between write and re-read).
5. send-slack POST, stored URL → `400 Slack is not configured…` after a possibly delivered post (no SPA caller).
6. (ai-score 503 `no_win_chance` after a write — not read; needs a non-finite stored score.)

B. **Own-words 4xx on a RETRY whose earlier request committed** (this request wrote nothing, but "Not saved" would mislead):
- lead-requests PUT approve → 409 `This request was already approved.` after a 500 mid-approve.
- quote-to-job POST → 409 `<JOB-…> already exists for this quote.` after a 500 that left a job (possibly lineless).
- documents POST create → 409 `That document id is already in use.` after a 500 that left the document without v1/links.
- Every create with `onConflictDoNothing` + 409 (accounts, contacts, activities, tasks, saved-reports, spiff-claims, opportunities, quotes, products, export-runs, users single) answers 409 `… already in use.` to a retry of a create whose first answer was a 5xx-after-commit or lost.

C. **5xx (`Internal server error`) after a commit** — so a `{error}` 5xx never proves "nothing written":
accounts PUT single (rename), accounts/contacts/opportunities PUT bulk (>400 rows only), lead-requests PUT approve,
merge POST (account and contact merge), ai-score POST, train-deal-model POST, train-lead-model POST,
quotes PUT→Accepted, quote-to-job POST, documents POST create / new-version / restore-version, documents DELETE,
every dispatch-* POST and PUT (customers, locations, equipment, jobs, line items, plan-visits, schedule-blocks,
service-plans, technicians, vehicles), dispatch-jobs DELETE, invoices POST/PUT/DELETE, users POST invite,
users POST revoke-invite / DELETE (narrow), users-sync POST, audit-stream POST ?test, integration-requests POST (edge).
Outbound-only (no DB): mention-sms POST, send-slack POST {webhookUrl}.

D. **Non-2xx after a commit WITHOUT a top-level `error` string** (the rule's matcher would not fire; readRefusal falls to "The server returned N."):
saved-reports POST ?action=deliver → 400 `{ok, sent, errors[], …}` after the stamp and some sends;
backup PATCH → 500 `{ok, imported, unreached, errors[], notes, snapId}` after score/snapshot/audit writes;
users POST invite (all failed) → 400 `{invited:[], errors:[…]}` with Clerk invitations possibly live.

E. **Not read**: Netlify's own answer on a function timeout / response-size cap (bulk POST near its 7.5 s budget then clearStrayLinks; awaited dispatchWebhook up to 10 s after leads/tasks writes; quotas PUT streaming audits; export-runs large base64 body); a neon-http response lost after the server committed.

## 3. Proven safe as read (every non-2xx is before the first commit, or follows a write that changed nothing)

accounts POST bulk/single/restore, accounts PUT single without a rename, accounts DELETE ?clear;
contacts POST bulk/single/restore, PUT single, DELETE ?clear/?id; leads all branches; lead-requests POST, PUT deny,
DELETE; activities, tasks, spiff-claims, coaching-notes all branches; saved-reports POST create, PUT, DELETE;
opportunities POST single/bulk, PUT single (note op and save), DELETE ?clear/?id; merge Undo; duplicates (GET only);
quotes POST, DELETE, PUT non-Accept; products all; quote-pdf; documents upload-url, ?action=link POST/DELETE, PUT;
backup POST, PUT; export-dsr all; export-runs POST (platform cap aside); export-schedules all; report-prompt;
all dispatch-* DELETEs listed above (not dispatch-jobs DELETE); users PUT ?me, POST single, PUT ?quotas=true,
PUT; user-role PUT; **settings PUT (16 Nov claim confirmed)**; audit-log POST; audit-stream POST create/PUT/DELETE;
api-keys POST/DELETE; integration-requests main write; automations all; webhooks all (for in-app data);
calendar-connections DELETE both scopes; calendar-oauth-start POST.

**16 Nov claims:** settings.mjs — confirmed. users.mjs — **refuted in part**: PUT, PUT ?me, PUT ?quotas, POST single
cannot answer 500 after writing, but POST invite (754/801 outside the per-invite try), POST revoke-invite and
DELETE (removeWithLists retry) can. documents.mjs no-transaction — confirmed and extended (create 359/365/371,
new-version 384/389, restore 406/411, DELETE 496/497/498).

## 4. Duplicate-id behavior of each create

- **409 in words, any org, nothing written (`onConflictDoNothing` on id):** accounts single/restore (`That account id is already in use.`),
  contacts single/restore, activities, tasks, saved-reports (`That report id…`), spiff-claims (`That claim id…`),
  opportunities single (`That deal id…`), quotes (`That quote id…`), products (`That id is already in use.`),
  documents create and upload-url (`That document id…`), export-runs (`That export run id…`).
- **Same org → silent overwrite (upsert `onConflictDoUpdate` setWhere org); other org → 409 in words:** dispatch-customers
  (+ locations), dispatch-equipment, dispatch-jobs (+ line items), dispatch-schedule-blocks (other tech → 409 first),
  dispatch-service-plans, dispatch-technicians, dispatch-vehicles. A retried create here is idempotent.
- **500 `Internal server error`, nothing written, no words (plain insert, PK 23505):** leads single, lead-requests,
  coaching-notes, export-dsr, export-schedules, audit-log (client id is the PK).
- **Bulk creates (accounts, contacts, leads, opportunities):** taken id → that row in `failed[]` with the driver's
  first line, others commit, **201**. Only accounts and opportunities refuse an id repeated within a batch (400).
- **users POST single:** an id of this org → 409 `That member already exists — edit them instead.`; any other id ignored, server mints; duplicate email → 409 field `email`.
- **Client id ignored, server mints:** automations, webhooks, api-keys, audit-stream, users invite, users-sync, backup, invoices (`inv_`), dispatch-plan-visits (`pv_`, upsert on occurrence), quote-to-job, merge logs.
- **No id:** integration-requests (keyed by appId → 200 `already:true`), settings (`id = orgId`).

## 5. Flags (not asked; Jeff decides)

- Most dispatch YES-5xx windows close if each write answered from its own `.returning()` instead of a re-SELECT; invoices' mirror and documents' multi-statement writes could ride one `db.batch`.
- quote-to-job and invoices have no unique index behind "one job per quote" / "one live invoice per job" (check-then-insert).
- document_versions has no unique (document_id, v): a retried new-version duplicates `v`.
- automations DELETE of an unknown id answers 200 (a success that wrote nothing).
- users invite per-row errors return raw `err.message` (users.mjs 899) — DB text can reach the client.
- send-slack's stored-URL 400 says "not configured" for a timeout or a Slack refusal.
