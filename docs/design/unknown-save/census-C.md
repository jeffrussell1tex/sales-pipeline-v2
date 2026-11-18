# Census C — write requests under src/Tabs/settings/** (read-only, HEAD 92d1bc8, 18 Nov 2026)

Method: grep of every `dbWrite(`, `dbFetch(` (every call's options read — 13 GET-only calls excluded), direct `fetch(`
(none in code: the one hit, ApiKeysDetail.jsx:244, is a code sample string), and every call of `putSettings`,
`writeSettings`, `addToSettingsList`, `takeLatestSettings` (GET), `startCalendarConnect`. 65 files; files with no
write: ImportDetail, RolesDetail, FlsDetail, SessionDetail, SsoDetail, MfaDetail (GET only), the `shared.jsx`
files, catalogue.js, constants.js, memberPickers.js, memberStatus.js. No settings file takes a write function from
`useApp()` (all destructures read).

Abbreviations: NE = `NETWORK_ERROR` = `'The server could not be reached.'`; RW = `refusalWords`/`readRefusal`
words (server `error` + ` (ref …)`, else `'The server returned N.'`); RO = `refusalOf` words (403 → `'You do not have
permission to make this change.'`; else server `error` + ref; else `'The server returned N.'`); FW = `failureWords(e)`
(a plain Error's message passes through; fetch TypeError → NE; anything else → `'Its answer could not be read.'`).
"No words" = gateway page / non-JSON / JSON without `error`. Note `dbFetch` itself `console.error`s every non-ok and
every throw (storage.js:66-69) — that is in addition to whatever the screen says.

---------------------------------------------------------------------------------------------------------------
## 1. Shared senders (src/Tabs/settings/shared/)

| site | function | endpoint+method | throw / status 0 | non-ok, no server words | non-ok, server words | 4xx/5xx |
|---|---|---|---|---|---|---|
| saveSettings.js:53-82 | `putSettings(payload, revs)` (throws) | `/.netlify/functions/settings` PUT, body `withIfRevs(payload, revs)` | `catch { … throw new Error(NETWORK_ERROR); }` → Error('The server could not be reached.'); after org switch never settles | `refusalWords(res, d)` → `'The server returned N.'` thrown | thrown `refusalWords` (server words + ref); **403 always** `'You need the Admin role to change these settings.'` (server words dropped); 409 `code:'stale'` → Error with `.stale` | Only 403 and stale-409 special; 4xx vs 5xx not distinguished. A 2xx with non-JSON body → `{}` taken as landed (`res.json().catch(() => ({}))`) |
| saveSettings.js:89-100 | `writeSettings(payload, revs)` (never throws) | settings PUT | `{ ok:false, status:0, error: NETWORK_ERROR }` | `refusalOf` → `'The server returned N.'` | `refusalOf` → server words+ref; **403** `'You do not have permission to make this change.'`; stale → `stale` key | not distinguished beyond 403/stale; 2xx non-JSON → `ok:true, data:null` |
| saveSettings.js:127-144 | `addToSettingsList(key, apply, {list,rev,setSettings})` | writeSettings (≤2 tries, retry only on stale) | returns writeSettings' `{ok:false,status:0,error:NE}` — never retried | returns refusal | returns refusal; second stale → `{twice:true}` | — |
| saveSettings.js:107-115 | `takeLatestSettings` | settings **GET** (read, not a write) | returns null | null | null | — |
| usePanelRevs.js:18-42 | `usePanelRevs` — no request of its own: `opened` tokens, `landed`, `reopen`, `panelStale` (→ AdminView `shell.took`, not read), `once` (a second save shares the first's promise) | — | — | — | — | — |
| useRegisterSave.js:16 | hands the panel's save to AdminView's leave guard | — | the guard (LeaveGuardModal.jsx:44-48) on any non-stale throw says `'The save did not go through — the page behind this dialog shows why. Your changes are still here.'` (how AdminView sets `failed` not read) | same | same | — |
| src/utils/calendarConnect.js:14-30 (outside dir; called by CompanyCalendarDetail.jsx:132, ConnectedAppsDetail.jsx:490) | `startCalendarConnect` | `calendar-oauth-start` POST (sets an OAuth nonce cookie; returns consent URL) | `res=null` → navigates to return URL with `reason:'server_error'` → words (calendarReturn.js:28,86) `"<name> was not connected — the server could not store the connection. Try again; …"` | same `server_error` | 403 → `not_admin` (`'only an Admin can connect a company calendar.'`); any other → `server_error` (server words never shown) | 403 only |

### Panels sending through `putSettings` (34 call sites; none writes settings by hand)
All are NON-optimistic unless marked (app copy set only after landing; draft kept dirty; error re-thrown for the leave
guard). Stale 409 → `panelStale` (AdminView redraws on latest). No creates of rows (settings lists; ids of list items
are in the draft, which a retry resends unchanged — no save handler mints an id).

| file:line | function | keys | words on throw (status 0) and on no-words non-ok — same template both, NE or `'The server returned N.'` substituted | rollback |
|---|---|---|---|---|
| company/CompanyCalendarDetail.jsx:93 | `persistHolidays` (Add holiday :231 label 'Holiday'; Delete :238 'Holiday deletion') | customHolidays | `` `${label} not saved — ${failureWords(e)}` `` | **OPTIMISTIC**: `setSettings(prev => ({ ...prev, ...held }))` rolls back on any non-stale failure, incl. throw |
| company/CompanyCalendarDetail.jsx:189 | `handleSync` (after holidays GET) | customHolidays, federalHolidays | outer catch `` `Failed to sync — ${failureWords(err)}` `` | **OPTIMISTIC**: held restored then rethrown |
| company/CompanyProfileDetail.jsx:52 | `handleSave` | company* , quoteHeader | `setSaveError(e.message)` → bare NE | none needed (draft kept) |
| company/FiscalYearDetail.jsx:95 | `handleSave` | fiscalYearStart, quotaPeriods | `setSaveError(e.message)` bare | draft kept |
| data/FeaturesDetail.jsx:139 | `handleSaveAi` | aiSettings, featureFlags, tab flags, anthropicApiKey | `'Failed to save: ' + e.message` | draft kept (stale+key: key cleared, `' Enter the API key again.'`) |
| dispatch/DispatchBlockTypesDetail.jsx:47 | `handleSave` | dispatchBlockTypes | `'Could not save: ' + e.message` | draft kept |
| dispatch/DispatchCrewsDetail.jsx:96 | `handleSave` | dispatchCrews | `setSaveError(failureWords(e))` bare | draft kept |
| dispatch/DispatchCustomerNotificationsDetail.jsx:53 | `handleSave` | customerNotifications | `e.message` bare | draft kept |
| dispatch/DispatchJobTemplatesDetail.jsx:230 | `handleSave` | dispatchJobTemplates | `failureWords(e)` bare | draft kept (draft normalised by setTemplates(clean) before send) |
| dispatch/DispatchJobTypesDetail.jsx:102 | `handleSave` | dispatchTrades, dispatchJobTypes | `'Could not save: ' + e.message` | draft kept |
| dispatch/DispatchPropertyTypesDetail.jsx:179 | `handleSave` | dispatchPropertyTypes | `failureWords(err)` bare | draft kept |
| dispatch/DispatchSkillsDetail.jsx:45 | `handleSave` | dispatchSkills/Certs/Licenses | `e.message` bare | draft kept |
| integrations/ConnectedAppsDetail.jsx:463 | `handleSaveSlack` (via SlackConfigModal :145) | slackConfig, connectedApps | modal: `'Not saved — ' + failureWords(e)` | modal stays open; not optimistic |
| integrations/ConnectedAppsDetail.jsx:476 | `handleDisconnectSlack` | connectedApps, slackConfig:{} | `` `Not disconnected — ${failureWords(e)}` `` | not optimistic |
| integrations/ConnectedAppsDetail.jsx:542 | `saveWebForm` | webToLead | `` `Not saved — ${failureWords(e)}` `` | not optimistic |
| people/TeamsDetail.jsx:406 | `handleDelete` (team) | teams | `` `Team not deleted — ${e.message}` `` | not optimistic; member rows not sent |
| people/TerritoriesDetail.jsx:277 | `handleDelete` (territory) | territories | `` `Territory not deleted — ${e.message}` `` | not optimistic |
| quoting/ApprovalTiersDetail.jsx:151 | `handleSave` | approvalTiers, approvalRouting | `failureWords(e)` bare | draft kept |
| quoting/ProductTypesDetail.jsx:57 | `handleSave` | productTypes | `'Could not save: ' + e.message` | draft kept |
| quoting/QuoteTemplatesDetail.jsx:1092 | `handleSave` | quoteTemplates, quoteDefaults, quoteBoilerplate | `e.message` bare | draft kept |
| salesProcess/AccountSegmentsDetail.jsx:49 | `handleSave` | accountSegmentTiers | `e.message` bare | draft kept |
| salesProcess/BuyerPersonasDetail.jsx:130 | `handleSave` | buyerPersonas | `e.message` bare | draft kept |
| salesProcess/CustomerTypesDetail.jsx:39 | `handleSave` | customerTypeTiers | `e.message` bare | draft kept |
| salesProcess/CustomFieldsDetail.jsx:65 | `handleSave` | customFieldsByObject | `e.message` bare | draft kept |
| salesProcess/EmailTemplatesDetail.jsx:88 | `handleSave` | emailTemplates | `e.message` bare | draft kept |
| salesProcess/FlatListDetail.jsx:29 (Competitors, Reasons won, Reasons lost — :140-144) | `handleSave` | competitors / reasonsWon / reasonsLost | `e.message` bare | draft kept |
| salesProcess/FunnelStagesDetail.jsx:43 | `handleSave` | funnelStages | `e.message` bare | draft kept |
| salesProcess/IndustriesDetail.jsx:60 | `handleSave` | industries | `e.message` bare | draft kept |
| salesProcess/KPIThresholdsDetail.jsx:81 | `handleSave` | kpiThresholds | `e.message` bare | draft kept |
| salesProcess/LeadConversionDetail.jsx:66 | `handleSave` | leadConvBenchmarks | `e.message \|\| 'Save failed.'` | draft kept |
| salesProcess/LeadScoringDetail.jsx:167 | `handleSave` | leadScoring | `` `Lead scoring not saved — ${failureWords(e)}` `` | draft kept |
| salesProcess/LeadVisibilityDetail.jsx:73 | `handleSave` | unassigned*VisibleToReps | `` `Visibility not saved — ${e.message}` `` | draft kept |
| salesProcess/PainPointsDetail.jsx:76 | `handleSave` | painPoints | `e.message` bare | draft kept |
| salesProcess/PipelinesDetail.jsx:85 | `persist(patch,label)` — callers :163 'Pipeline', :178 'Assignment rule', :200 'Stage', :211 'Pipeline order', :239 'Pipeline deletion', :273 'Stage order', :284 'Stage rename', :294 'Stage deletion', :429 'Default pipeline' | pipelines / assignmentRules | `` `${label} not saved — ${e.message}` `` | **OPTIMISTIC**: held keys restored on any non-stale failure, incl. throw. New pipeline id derived from its name (:151) — stable across retry |

Words with server words: same templates with the server's words (+ref) substituted; 403 is always the Admin-role
sentence. 4xx vs 5xx: not distinguished anywhere in this group. Leave guard, on a throw from any of the 30 panels
registered via `useRegisterSave`: `'The save did not go through — …'`.

### Panels sending through `writeSettings` (6 sites) / `addToSettingsList` (1)
| file:line | function | keys | throw / status 0 | no-words non-ok | with words | rollback |
|---|---|---|---|---|---|---|
| people/TeamsDetail.jsx:86 | TeamModal `handleSave` | teams | `throw new Error(w.error \|\| 'Save failed')` → `setErr(e.message \|\| 'Save failed.')` → bare NE in the window | bare `'The server returned N.'` | RO words (403 permission sentence) | not optimistic; window stays open. **Create id `team_${Date.now()}` minted per press (:68)** — a retry sends a new id (after an unknown landing the old token makes the retry a stale refusal → `listChanged('team')`; whether teamNameRefused then blocks a third press not traced) |
| people/TeamsDetail.jsx:453 | `assignTo` | teams | `` `Not assigned — ${rt.error}` `` | same | same | not optimistic |
| people/TerritoriesDetail.jsx:69 | TerritoryModal `save` | territories | `throw new Error(w.error \|\| 'Save failed')` → `setErr(e.message \|\| 'Save failed.')` bare | bare | RO | not optimistic. **New id `terr_${Date.now()}` per press (:44)** |
| people/TerritoriesDetail.jsx:253 | `handleImportCSV` | territories | `window.alert(\`Import failed to save — ${w.error}\`)` | same | same | not optimistic. New rows `'terr_'+crypto.randomUUID()` per import run (:247), merged by name |
| people/UsersDetail.jsx:1143 | profile `handleSave` team-list move | teams | `` `Saved, but the team list was not updated — ${clause(rt.error)}. Save changes tries the list again.` `` (move kept owed) | same | same | — |
| quoting/EditBrandModal.jsx:266 | `handleSave` | quoteBrand | `` `Brand not saved — ${w.error}` `` | same | same | not optimistic; modal stays |
| people/UsersDetail.jsx:246 | invite `handleSend` → `addToSettingsList('teams', …)` | teams | teamNote `` ` The team list was not updated — ${added.error}` `` then thrown → `failureWords` | same | same | — |

---------------------------------------------------------------------------------------------------------------
## 2. Direct write sites (dbFetch / dbWrite)

Columns: site | function | endpoint+method | writes | optimistic? | THROW (status 0) words + rollback | non-ok NO words | non-ok WITH words | 4xx/5xx? | create id

### audit/AuditDetail.jsx — ON THE MAYBE RULE
`destRefusedOwn = (res, body) => res.status >= 400 && res.status < 500 && typeof body?.error === 'string' && !!body.error.trim()` (:363); `destGone` = 404 + own (:367).
| site | fn | req | writes | opt | throw | no words | with words | 4xx/5xx | id |
|---|---|---|---|---|---|---|---|---|---|
| :492 | `createDest` (via AddDestinationModal :228) | audit-stream POST | destination row + secret | no | `maybeAdded(failureWords(e))`: window closes, list marked unread, `` `The destination may have been added — reload the page to see whether it was: ${words}` `` | maybeAdded(`'The server returned N.'`) | 4xx own → modal `r.error` (refusalWords) = Not saved, window open; **5xx with words → maybe** | yes (4xx own vs rest) | server-minted; window closes on maybe so no retry from it |
| :526 | `putDest` (Pause/Resume :782, Rotate :579) | audit-stream PUT | paused / rotateSecret | no | `maybeSaved`: `` `${label} may have been saved — reload the page to see whether it was: ${words}` `` / rotate: `` `The secret may have been rotated — reload…, and rotate again to see a new one: ${words}` ``; row status marked unknown | maybe | 4xx own: `` `${label} not saved — ${refusalWords(res, refused)}` ``; 5xx → maybe | yes | — |
| :559 | `sendTest` | audit-stream?test= POST | delivery + status | no | `` `The test may have been sent — reload the page to see whether it was: ${words}` `` | maybe | 4xx own: `` `Test not sent — …` `` | yes | — |
| :592 | `remove` | audit-stream?id= DELETE | delete | no | `` `The destination may have been removed — reload the page to see whether it was: ${words}` ``, row kept, status unknown | maybe | 404 own → removed, `'The destination was already removed.'`; other 4xx own `` `Remove destination failed — …` `` | yes | — |

### company/CompanyCalendarDetail.jsx
| :139 | `disconnectCorporateCalendar` | calendar-connections?id&scope=org DELETE (dbWrite) | connection | no | `` `Calendar not disconnected — ${r.error}` `` → "…— The server could not be reached." | same, `'The server returned N.'` | RO (403 permission sentence) | no | — |

### data/BackupDetail.jsx
| :109 | `ImportBackupModal.handleImport` | backup PATCH | restore rows | no | **partial maybe**: `NO_ANSWER` = `'No answer from the server — the restore may have written records. Run the file again: a record already here is left as it is, never written twice.'`; `mayHaveWritten` → close reloads page | NO_ANSWER (no `imported`, no words) | words: 5xx+requestId → `` `${said} — the restore may have written records. …` `` (crashedWords); else `setError(said)` (wrote nothing) | yes (≥500 with requestId) | records from file (stable; server skips existing per NO_ANSWER) |
| :447 | `handleRunBackup` | backup POST | snapshot row | no | `setBackupError(failureWords(e))` → `✕ The server could not be reached.` (:562) | `'The server returned N.'` | RW | no | server-minted; a retry makes another snapshot |
| :492 | `handleSaveSchedule` | backup PUT (changed fields only) | schedule | no | `setSchedError(failureWords(e))` bare; edit kept dirty | bare | RW | no | — |

### data/ExportDetail.jsx
| :162 | `handleToggle` | export-schedules PUT {id, enabled} | enabled flag | **yes** | flag rolled back; `` `"${sched.name}" was not ${sched.enabled ? 'paused' : 'enabled'} — ${failureWords(e)}` `` | same, rollback | RW | no | — |
| :192 | `handleDeleteSched` | export-schedules?id DELETE (dbWrite) | delete | **yes** (removed) | row put back; `` `"${sched.name}" was not deleted — ${r.error}` `` | same | RO | no | — |
| :210 | `saveSchedule` (modal onSave, :33) | export-schedules POST/PUT | schedule | no | returns `` `The schedule was not saved — ${failureWords(e)}` ``, modal open | same | RW | no | **create: `payload.id = 'sch_' + crypto.randomUUID()` on each call; modal builds a new payload object per press (:33) → fresh id per press** |
| :222 | `saveDsr` (modal :511) | export-dsr POST | GDPR request | no | `` `The request was not saved — ${failureWords(e)}` ``, modal open | same | RW | no | **`'dsr_' + crypto.randomUUID()` every call → fresh id per press** |
| :240 | `handleAdHoc` | export-runs POST | run row + download | no | `setAdhocError(failureWords(e))` bare | bare | RW | no | **`'run_' + crypto.randomUUID()` per press** |
| :277 | `handleDsrStatus` | export-dsr PUT (whole row) | status | **yes** | rolled back; `` `Request ${dsr.id} was not ${newStatus === 'completed' ? 'marked complete' : 'updated'} — ${failureWords(e)}` `` | same | RW | no | — |

### dispatch/DispatchServicePlansDetail.jsx
| :319 | `save` | dispatch-service-plans POST (new) / PUT ?id | plan | no | `setError(failureWords(err))` bare in the editor; draft kept | bare | 403 → `'Your role cannot change service plans.'` (server words dropped); else RW | 403 only | **create id `'plan_' + crypto.randomUUID()` minted at "+ New plan" (:477), held in draft → a retry REUSES it (server dedupe on that id not read)** |
| :336 | `remove` | ?id DELETE | delete | no | bare FW | bare | 403 → `'Your role cannot delete service plans.'`; else RW | 403 only | — |
| :385 | `seedFromLegacy` loop | POST per legacy label | plans | no | per-row `` `${tier}: ${failureWords(err)}` `` collected → `` `Created ${ok}.${had} ${failed.length} failed — ${failed.join('; ')}` `` | same | RW | no | **`'plan_' + crypto.randomUUID()` per row per press**; a re-press re-reads the list first and skips labels a plan already stands for by name (`legacyPlansToCreate`) |

### dispatch/DispatchVehiclesDetail.jsx
| :318 | `saveVehicle` | dispatch-vehicles POST/PUT | vehicle | no | `setVError(failureWords(err))` bare | bare | 403 `'Your role cannot change vehicles.'`; else RW | 403 only | **`'veh_' + randomUUID()` at "+ New" (:530), in draft → retry reuses** (POST upserts per comment :391) |
| :338 | `deleteVehicle` | ?id DELETE | delete | no | bare FW | bare | 403 `'Your role cannot delete vehicles.'` | 403 only | — |
| :362 | `saveEquipment` | dispatch-equipment POST/PUT | unit | no | `setEError(failureWords(err))` | bare | 403 `'Your role cannot change equipment.'` | 403 only | **`'eq_' + randomUUID()` at "+ New" (:586) → retry reuses** |
| :382 | `deleteEquipment` | ?id DELETE | delete | no | bare FW | bare | 403 `'Your role cannot delete equipment.'` | 403 only | — |
| :416 / :425 | `runImport` loops | vehicles / equipment POST | legacy rows | no | per-row `` `${row.name}: the server could not be reached` `` → `` `Imported ${ok} of ${plan.count}. ${failed.length} not imported — …` `` | per-row `unstopped(readRefusal)` | same | no | ids derived from legacy ids (`imp_<id>`, legacyDispatchImport.js:23,39) — stable |

### integrations/ApiKeysDetail.jsx
| :37 | `handleCreate` | api-keys POST | key | no | `setError(failureWords(e)); setStep('form')` — form re-armed | bare `'The server returned N.'` | RW | no | server-minted; **a 2xx whose JSON fails to parse throws → `'Its answer could not be read.'` and re-arms Create (a second key possible)** |
| :432 | `handleRevoke` | api-keys?id DELETE | revoke | no | `setError(failureWords(e))` bare, modal open | bare | RW | no | — |

### integrations/AutomationsDetail.jsx
| :175 | modal `handleSave` | automations POST/PUT | rule | no | `setError(failureWords(e))` bare, modal open | bare | RW | no | server-minted; 2xx unparseable → throws 'Its answer could not be read.', modal open (retry → second rule) |
| :394 | `handleToggle` | automations PUT {id, active} | flag | **yes** | rolled back; `` `"${rule.name}" was not ${rule.active ? 'paused' : 'resumed'} — ${failureWords(e)}` `` | same | RW | no | — |
| :421 | `handleDelete` | ?id DELETE | delete | **yes** | row put back; `` `"${rule.name}" was not deleted — ${failureWords(e)}` `` | same | RW | no | — |

### integrations/ConnectedAppsDetail.jsx
| :123 | SlackConfigModal `handleTest` | send-slack POST | posts a Slack message | no | `` `Test not sent — ${failureWords(e)}` `` | same | RW | no | — |
| :496 | `disconnectCalendar` | calendar-connections?id&scope DELETE (dbWrite) | connection | no | `` `Not disconnected — ${r.error}` `` | same | RO | no | — |
| :512 | `requestApp` | integration-requests POST {appId} | request | no | `` `Not requested — ${failureWords(e)}` `` | same | RW | no | keyed by appId (server dedupe not read) |

### integrations/WebhooksDetail.jsx
| :51 | modal `handleCreate` | webhooks POST | endpoint + secret | no | `setError(failureWords(e))` bare, form re-armed | bare | RW | no | server-minted; 2xx unreadable taken as landed (:62) but a THROW/gateway leaves Create armed → second endpoint possible |
| :208 | `handleToggle` | webhooks PUT {id, active} | flag | no (set after ok) | `setError(failureWords(e))` bare | bare | RW | no | — |
| :229 | `handleDelete` | ?id DELETE | delete | no | bare FW | bare | RW | no | — |

### people/TeamsDetail.jsx, TerritoriesDetail.jsx (member rows after a list save)
| Teams :107 | TeamModal member loop | users PUT (dbWrite) | team/territory fields per member | no | collected `` `${u.name \|\| u.id}: ${r.error}` `` → `` `Team saved, but ${failed.length} member record(s) did not update: ${failed.join('; ')}` `` | same | RO | no | — |
| Teams :426 | delete member loop | users PUT clear | — | no | `` `Team deleted, but ${n} member record(s) did not update: …` `` | same | RO | no | — |
| Teams :462 | `assignTo` member | users PUT | team fields | no | `` `Team updated, but ${assigningUser.name \|\| 'the user'} was not — ${ru.error}` `` | same | RO | no | — |
| Territories :92 | modal member loop | users PUT {territory} | — | no | `` `Territory saved, but ${n} user record(s) did not update: …` `` | same | RO | no | — |
| Territories :290 | delete loop | users PUT {territory:''} | — | no | `` `Territory deleted, but ${n} user record(s) did not update: …` `` | same | RO | no | — |

### people/UsersDetail.jsx
| :204 | invite `handleSend` | users POST {action:'invite'} | Clerk invitations + rows | no | `setError(failureWords(err))` → bare NE; **rows kept, Send re-armed (a re-press re-emails)** | thrown `refusalWords(resp, d)` → bare `'The server returned N.'`, rows kept | `failed` list or RW | no | no client id (server/Clerk-minted); a 2xx with no `invited` list is taken as landed (rows cleared, roster re-read) |
| :914 | `setMemberActive` (callers :1216 Deactivate, :1228 Reactivate on profile; :1939, :1951 row menu) | users PUT {id, active} | active | no | `'Could not deactivate: ' + failureWords(err)` / `'Could not reactivate: …'`; row menu `` `Could not deactivate ${u.name}: ${failureWords(err)}` `` | bare RW inside same | RW | no | — |
| :928 | `revokeInvite` (callers :547 Pending page, :1260 profile, :1964 row menu) | users POST {action:'revoke-invite'} | revoke + row removal | no | `` `Could not revoke the invitation to ${e.email}: ${failureWords(err)}` `` / `'Could not revoke the invitation: ' + …` / row: `` `Could not revoke the invitation to ${u.email \|\| u.name}: …` `` | same | RW | no | — |
| :940 | `resendInvite` (caller :537) | users POST {action:'invite'} single | new invitation | no | `` `Could not resend to ${e.email}: ${failureWords(err)}` `` | `refusalWords(res, d)` | `d.errors[0].error` or RW | no | — |
| :1122 | profile `handleSave` member PUT | users PUT {id, ...changes} | member fields | no | nothing landed → bare `failureWords(err)`; after a part landed → `` `Saved, but not everything — ${clause(failureWords(err))}. ${owedNext ? 'Save changes tries again.' : 'Reload to see what was saved.'}` `` | same path via thrown readRefusal | RW | no | — |
| :1163 | profile role change | user-role PUT | role | no | (throw → same catch as :1122) | `'Saved, but the role was not changed — ' + why` if something else landed, else bare | RW | no | — |
| :1241 | profile `handleDeleteUser` | users?id DELETE | delete row | no | `'Could not delete: ' + failureWords(err)` | same | RW | no | — |
| :1981 | row menu Delete user | users?id DELETE | delete row | no | `` `Could not delete ${u.name}: ${failureWords(err)}` `` | same | RW | no | — |
| :1628 | drift check effect | users-sync?check=true POST (comment: "writes nothing") | none (read via POST) | — | **silent**: `catch (e) { /* drift banner is advisory */ }`; non-ok `return` | silent | silent | — | — |
| :1647 | `runClerkSync` | users-sync POST | roster rows from Clerk | no | `'Sync failed: ' + failureWords(err)` | same (thrown readRefusal) | RW | no | — |

### salesProcess (model training)
| DealScoringDetail.jsx:41 | `handleTrainNow` | train-deal-model POST | dealModel + deal scores | no | `` `Not trained — ${failureWords(e)}` `` | same | RW | no | — |
| LeadScoringDetail.jsx:141 | `handleTrainNow` | train-lead-model POST | leadScoring model | no | `` `Not trained — ${failureWords(e)}` `` | same | RW | no | — |
(Both: a 2xx with unreadable body → `'Its answer could not be read. Reload the page to see whether a model was trained.'`.)

---------------------------------------------------------------------------------------------------------------
## 3. Failures only console-logged
- None of the settings write paths is console-only. Nearest: UsersDetail.jsx:1628 drift check (POST, read-only per its comment) swallows every failure silently (not even a panel log; dbFetch's global `console.error` only).
- TerritoriesDetail.jsx:262 CSV import's outer catch logs AND alerts: `console.error('territory CSV import', e); window.alert('Could not import the CSV. Please check the format.')` — a network failure of its writeSettings never reaches it (writeSettings never throws), but a thrown setSettings/parse error would be called a format problem.
- CompanyCalendarDetail.jsx:206 sync logs and also says `Failed to sync — …`.

## 4. Totals
- Shared senders: 3 settings senders (putSettings, writeSettings, addToSettingsList) + 1 util (startCalendarConnect, 2 callers); usePanelRevs/useRegisterSave send nothing.
- putSettings call sites: 34 (31 panels/handlers incl. 3 FlatList panels; Pipelines' persist has 9 callers, Calendar's persistHolidays 2).
- writeSettings call sites: 6; addToSettingsList: 1.
- Direct dbFetch/dbWrite write call sites: 51 (Audit 4, Calendar 1, Backup 3, Export 6, Service plans 3, Vehicles 6, ApiKeys 2, Automations 3, ConnectedApps 3, Webhooks 3, Teams 3, Territories 2, Users 10, Deal/Lead training 2). Total call sites ≈ 92.
- Optimistic writes (all roll back on a throw too): Calendar persistHolidays + sync put, Pipelines persist, Export toggle / delete / DSR status, Automations toggle / delete — 8 sites.

## 5. Already on the maybe rule
- AuditDetail.jsx createDest (:478-501), putDest (:517-545), sendTest (:550-575), remove (:582-604) — full rule: 4xx in the server's own words = not saved; 5xx / gateway / no words / throw = "may have…— reload the page to see whether it was".
- Partial: BackupDetail.jsx:102-133 restore (PATCH) — throw, no-words and 5xx-with-ref say "the restore may have written records" (NO_ANSWER / crashedWords) and closing reloads; a 4xx without words falls into NO_ANSWER too.
- Not the maybe rule but related ("landed is landed" for a 2xx with an unreadable body): putSettings/writeSettings, Webhooks create/toggle, Export toggle, Automations toggle, Users invite/sync/delete/revoke, ConnectedApps request, training — none treats a THROW or a no-words 5xx as maybe.

## 6. Creates with a fresh id per press (a retry after an unknown landing can duplicate)
- ExportDetail.jsx:209 schedule `'sch_' + crypto.randomUUID()` (payload rebuilt per press at :33).
- ExportDetail.jsx:221 DSR `'dsr_' + crypto.randomUUID()`.
- ExportDetail.jsx:239 ad-hoc run `'run_' + crypto.randomUUID()`.
- TeamsDetail.jsx:68 new team `team_${Date.now()}` (settings list; the unchanged old token makes a retry after a landing a stale refusal).
- TerritoriesDetail.jsx:44 new territory `terr_${Date.now()}` (same token caveat); :247 CSV new rows `'terr_' + crypto.randomUUID()`.
- DispatchServicePlansDetail.jsx:378 legacy seed `'plan_' + crypto.randomUUID()` per row per press (re-press de-dupes by a fresh read by name).
- Server-minted ids with the form re-armed after a throw / no-words failure (no client id at all): api-keys POST (ApiKeysDetail:37), automations POST (:175), webhooks POST (:51), backup POST (BackupDetail:447), invites (UsersDetail:204 — re-press re-emails).
- Ids that ARE reused on retry: service plan (:477), vehicle (:530), equipment (:586) — minted at "+ New", kept in the draft; legacy import ids derived (`imp_…`); pipeline id derived from name; audit destination create closes its window on maybe (no retry path).

## 7. Sites saying "Not saved" / "Not …" / "not …" / "Could not …" on a throw (status 0)
- CompanyCalendarDetail: `Holiday not saved — …`, `Holiday deletion not saved — …`, `Calendar not disconnected — …`, `Failed to sync — …`.
- PipelinesDetail: `` `${label} not saved — The server could not be reached.` `` (9 labels).
- ConnectedAppsDetail: Slack modal `Not saved — …`; `Not disconnected — …` (Slack and calendar); `Not requested — …`; webform `Not saved — …`; `Test not sent — …`.
- LeadScoringDetail `Lead scoring not saved — …`; LeadVisibilityDetail `Visibility not saved — …`; Deal/Lead training `Not trained — …`.
- FeaturesDetail `Failed to save: …`; BlockTypes / JobTypes / ProductTypes `Could not save: …`; LeadConversion falls back to `'Save failed.'` only for an empty message.
- TeamsDetail `Team not deleted — …`, `Not assigned — …`, `Team updated, but X was not — …`, `Team saved/deleted, but N member record(s) did not update: …`; TerritoriesDetail `Territory not deleted — …`, `Territory saved/deleted, but N user record(s) did not update: …`, alert `Import failed to save — …`.
- EditBrandModal `Brand not saved — …`.
- ExportDetail `"X" was not paused/enabled — …`, `"X" was not deleted — …`, `The schedule was not saved — …`, `The request was not saved — …`, `Request X was not marked complete/updated — …`.
- AutomationsDetail `"X" was not paused/resumed — …`, `"X" was not deleted — …`.
- UsersDetail `Could not deactivate / reactivate / delete / revoke the invitation / resend to …`, `Sync failed: …`, `Saved, but the team list was not updated — …`.
- Leave guard (all useRegisterSave panels): `The save did not go through — the page behind this dialog shows why. Your changes are still here.`
- Bare words only (no "not" prefix; the error banner alone implies failure): CompanyProfile, FiscalYear, Crews, CustomerNotifications, JobTemplates, PropertyTypes, Skills, ApprovalTiers, QuoteTemplates, AccountSegments, BuyerPersonas, CustomerTypes, CustomFields, EmailTemplates, FlatList×3, FunnelStages, Industries, KPIThresholds, LeadConversion; Backup run/schedule; ServicePlans save/delete; Vehicles/Equipment save/delete; ApiKeys create/revoke; Automation modal; Webhooks create/toggle/delete; Users invite and profile save (nothing landed); Team/Territory modals.

## Not read / open
- AdminView's `shell.took` / `failed` classification for the leave guard (outside scope).
- Server-side dedupe for a repeated create id (service plans POST, integration-requests by appId).
- Whether `teamNameRefused` blocks a third Team-create press after a stale refusal.
