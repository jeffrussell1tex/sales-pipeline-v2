<!-- The unknown-save rule (OPEN_ITEMS §4.8; decided 16 Nov, Jeff: "A"; chosen 18 Nov: "Unknown-save rule"): the design, 18 Nov 2026, over 92d1bc8. Read by four read-only mappers — census-A.md (App.jsx, hooks, components, utils: 70 rows), census-B.md (the top-level tabs: 46), census-C.md (Settings: ~92 call sites through 3 shared senders and 51 direct writes), census-D.md (every endpoint the app writes: what can answer an error after it has written; how each create meets a taken id). Their load-bearing claims re-read by Claude from disk (marked below). Questions: ANSWERS.md, once asked. -->

# Design: a write whose answer proves nothing says it may have been saved

## What was decided 16 Nov, and what the census changed

Decided (OPEN_ITEMS §4.8, Jeff: "A"):
1. A write that got no answer of the server's own — a throw, a gateway's page, a wordless answer — says it **may have been saved and to reload to see**, on every screen, the screen marking the state not known rather than rolling back.
2. A refusal in the server's own words keeps "Not saved" / "Not …".
3. A create keeps one id across its presses, so a second press after a create that landed is refused "already in use" and read as landed.

**The census changes (2).** Every function's outer catch answers `serverErrorBody` — `{ error: 'Internal server error', requestId }` (netlify/functions/_lib.mjs:36-40, re-read) — so a 500 always carries an `error` string, and about 40 write paths can answer that 500 **after** they committed (census-D §2C): e.g. the quotes PUT to Accepted writes the deal's `arr` (`syncToOpportunity`, quotes.mjs:517, re-read) before the quote's own update (:531); every dispatch POST and PUT writes, then re-reads; documents create, new version, restore and delete are separate statements; the users invite, revoke and delete; the account and contact merge. The 16 Nov re-read held for settings.mjs (one `db.batch`) and for users.mjs's PUTs and single POST, but not for the invite, revoke and delete (census-D, "16 Nov claims").

So "the server's own words" cannot include a 5xx. **The one test: only a 4xx with an `error` string of the server's proves nothing was written** — the test the Sales Manager (`ownRefusal`), the Audit log (`destRefusedOwn`) and the documents (`recordRefusal`) already use. Everything else — a throw, a 5xx with or without words, a page, a 4xx with no words — says it may have been saved. (Q1.)

Two narrow 4xx-after-commit cases remain (census-D §2A): ai-score's 502 (not a save screen — 5xx anyway) and race-only re-reads (a row deleted by another request between this one's write and its re-read). Filed, not designed around.

**And (3) needs a server change.** A retry of a create that landed is answered 409 "That … id is already in use." by 11 endpoints (census-D §4) — but the words differ per endpoint, and six creates (leads single, lead-requests, coaching-notes, export-dsr, export-schedules, audit-log) answer a taken id with a wordless-to-the-member 500 (a plain insert's primary-key violation). Two "already done" answers belong with them: lead-requests approve ("This request was already approved.") and quote-to-job ("JOB-… already exists for this quote.").

## Where the app stands (the census, 18 Nov)

About 208 write call sites in ~60 files.
- **Fully on the maybe rule:** the Sales Manager's claim Approve / Reject / Delete and quotas; the Audit log's destinations; the document record step. Partly: the forecast call, commission tiers / SPIFFs and coaching-note Delete (a throw still "Not …"); merge and its Undo (a wordless 4xx "not"); Backup's restore; Reports' Pin.
- **Roll back and say "not" on a throw:** Closed Lost, the Kanban drag (KanbanView.jsx:223-238, re-read), task Complete and Snooze, the header's profile save, Quick Log, every delete and Undo of accounts, contacts, activities, tasks and deals, LeadsTab's `saveLead` (it restores the whole list — a bulk press's one failure undoes other rows that landed), Reports' persona, Pipelines' `persist`, holidays, Export's toggle / delete / DSR status, Automations' toggle / delete.
- **Say only "The server could not be reached."** — neither "not" nor "may": 15 Dispatch sites.
- **Creates with a fresh id per press** (a retry after a lost answer makes a second record): account, activity, the deal History tab's log, Quick Log, contact, the deal window's create, quote, product, coaching note, SPIFF claim, lead, AccountPicker, saved report (×2), lead request, Dispatch's location (×2), New Job's customer and job, export schedule / DSR / run, team, territory; server-minted with the form left armed: member, invite (re-emails), API key, automation, webhook, backup run, team-note add. Already one id per open: Closed Lost, task create, lead import, service plan, vehicle, equipment, Dispatch's customer / technician / schedule-block forms.

## Parts

### Part 1 — the one test, the words, the shared senders
- `src/utils/storage.js`: `heardRefusal(status, body)` — a 4xx whose body has a non-blank `error` string. `dbWrite` reads the body once and answers `{ ok, status, error, data, unknown }`: `unknown` is `!ok && !heardRefusal`. Its words stay as today (`refusalOf`'s, Q4's `NETWORK_ERROR` for a throw). `ownRefusal`, `destRefusedOwn` and `recordRefusal`'s test become `heardRefusal`.
- `maybeSaid(subject, verb, words)` → "`<subject>` may have been `<verb>` — reload the page to see whether it was: `<words>`" (the house sentence since §0.249; `verb` saved / deleted / moved / sent / restored …).
- `putSettings` throws an error carrying `unknown`; `writeSettings` answers it; the leave guard's "The save did not go through" says may-have for an unknown one.
- THE GUARD (tests/unknown-save.test.mjs): a scan of every write site (dbWrite, a dbFetch with a method, the senders) for a failure path that reads `unknown` — each site not yet swept named with its Part, the list emptied Part by Part; RUN cases for `heardRefusal` and `dbWrite`.

### Part 2 — the CRM core (census-A): hooks, Kanban, header, Quick Log, modals, documents, merge, bulk import
Each site: an unknown answer keeps the change on screen as sent (Q2) and says `maybeSaid` in the place it says "not" today (a press notice, the form's banner, the undo toast); a refusal in words keeps its "Not …" and its put-back. A form stays open with the typed work.

### Part 3 — Leads, Tasks, Quotes, Reports, Sales Manager (census-B, 26 sites)
As Part 2. LeadsTab's `saveLead` puts back only its own row (the bulk presses). Reports' two report saves read an unreadable 2xx as saved (today "not saved — Its answer could not be read.").

### Part 4 — Dispatch (census-B, 20 sites)
As Part 2; the 15 bare "The server could not be reached." sites gain their subject and the may-have words.

### Part 5 — Settings (census-C: the 3 senders' ~41 callers, 51 direct writes)
As Part 2, through the senders where they send.

### Part 6 — a create keeps one id; a retry that lands is read as landed
- **Server:** each create's taken-id 409 carries `code: 'idInUse'` beside its words (the 11 endpoints); the six plain-insert creates refuse a taken id the same way (`onConflictDoNothing` + 409, the accounts §0.199 pattern) — no schema change. lead-requests approve's and quote-to-job's "already" 409s carry `code: 'already'`.
- **Client:** every create in the census mints its id when its form opens (or its press first sends) and keeps it until it lands or the form closes; a press answered 409 `idInUse` / `already` **after an unknown answer for that id** is read as landed — said "Saved", the record read again from the server. The server-minted creates (member, invite, API key, automation, webhook, backup run, team note) keep their button held after an unknown answer, saying reload, rather than offering a second press.

## Not in this batch (filed to OPEN_ITEMS; census-D §5)
- documents create / new version / restore / delete as one `db.batch`; the invoice mirror in one batch; the dispatch writes answering from `.returning()` rather than a separate re-read (the 5xx-after-commit there would close).
- No unique index behind one job per quote, one live invoice per job, or one (document, v).
- automations DELETE of an unknown id answers 200.
- **users invite answers a failed invite's raw `err.message` per email (users.mjs:899, re-read): a database failure's text can reach the member.** (Security-adjacent; recommended its own small fix.)
- Three non-2xx answers after a commit carry no top-level `error` (Reports' Send now 400, Backup restore's 500, an all-failed invite 400) — the rule already says may-have for them.

## Questions
- **Q1** — the boundary (above): only the server's own 4xx says "Not saved" (Recommended), or keep the 5xx as "Not saved" for the endpoints proven safe (a list to keep true).
- **Q2** — what an optimistic screen shows on an unknown answer: the change kept as sent with the kept may-have notice (Recommended); put back with may-have words; or read the record again from the server.
- **Q3** — how much now: Parts 1, 2 and 6 (Recommended), then 3-5 in the next batches; or all six.
- **Q4** — the users invite's raw error text: a small fix in this batch (Recommended), or filed.
