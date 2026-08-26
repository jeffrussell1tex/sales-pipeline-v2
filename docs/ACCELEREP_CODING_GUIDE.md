# Accelerep — Claude Coding Guide

**Updated:** August 26, 2026 · rules current through **§18b21**.
A missing date line here is why a reader once judged this file stale from its
header while the body was current — check the highest §18b number, not the date.

Upload this file at the start of every new conversation to give Claude full context on the Accelerep project architecture, conventions, and known pitfalls.

---

## 1. Project Overview

**Accelerep** is a B2B SaaS CRM web application for managing sales pipelines, leads, opportunities, tasks, activities, accounts, contacts, and team quotas. It is deployed at `salespipelinetracker.com` via Git push to Netlify.

**Owner:** Jeff Russell  
**Workflow:** Jeff uploads relevant files → Claude makes changes → Claude delivers fixed files for download. Claude should always ask Jeff to upload the relevant files rather than asking him to make manual edits.

---

## 2. Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React (JSX), Vite |
| Styling | Plain CSS (`index.css`) + inline styles |
| Auth | Clerk (`@clerk/clerk-react`) |
| Backend | Netlify serverless functions (`.mjs`) |
| Database | Neon (PostgreSQL) via Drizzle ORM |
| Deployment | Netlify (Git push deploys) |
| Email | Resend |
| Calendar | Google Calendar API (OAuth2 with refresh token) |

---

## 3. File Structure

```
/
├── src/
│   ├── App.jsx                          # Root component, wires all hooks into AppContext
│   ├── AppContext.jsx                   # createContext / useApp / AppProvider
│   ├── main.jsx                         # ReactDOM.createRoot, ClerkProvider wrapper
│   ├── index.css                        # Global styles, CSS variables
│   ├── Tabs/                            # One file per main tab
│   │   ├── HomeTab.jsx
│   │   ├── PipelineTab.jsx
│   │   ├── OpportunitiesTab.jsx
│   │   ├── AccountsTab.jsx
│   │   ├── ContactsTab.jsx
│   │   ├── TasksTab.jsx
│   │   ├── LeadsTab.jsx
│   │   ├── ReportsTab.jsx
│   │   ├── SalesManagerTab.jsx
│   │   ├── SettingsTab.jsx               # 43-line role-gating SHELL → AdminView / PersonalView
│   │   ├── AdminView.jsx                 # Settings router + V2Card; imports all ~40 panels
│   │   ├── PersonalView.jsx              # Non-admin settings view + Personal* panels
│   │   └── settings/                     # Decomposed SettingsTab (see Settings Module section)
│   │       ├── catalogue.js              # SETTINGS_ITEMS + WORKSPACE_TABS_BASE
│   │       ├── shared/                   # tokens.js · ui.jsx · form.jsx · CategoryDetailChrome.jsx
│   │       ├── company/  salesProcess/  quoting/  people/
│   │       └── integrations/  security/  audit/  data/  dispatch/
│   ├── hooks/                           # Custom hooks — one per entity/concern
│   │   ├── useAccounts.js
│   │   ├── useActivities.js
│   │   ├── useCalendarState.js
│   │   ├── useContacts.js
│   │   ├── useModalState.js
│   │   ├── useOpportunities.js
│   │   ├── useSettings.js
│   │   ├── useTasks.js
│   │   ├── useUIState.js
│   │   └── useUserHandlers.js
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppHeader.jsx
│   │   │   ├── ModalLayer.jsx           # ALL modal renders live here
│   │   │   └── QuickLogFab.jsx
│   │   ├── modals/
│   │   │   ├── AccountModal.jsx
│   │   │   ├── ActivityModal.jsx
│   │   │   ├── ContactModal.jsx
│   │   │   ├── CsvImportModal.jsx
│   │   │   ├── LeadImportModal.jsx
│   │   │   ├── LostReasonModal.jsx
│   │   │   ├── OpportunityModal.jsx
│   │   │   ├── OutlookImportModal.jsx
│   │   │   ├── PipelinesSettingsPanel.jsx
│   │   │   ├── TaskModal.jsx
│   │   │   └── UserModal.jsx
│   │   ├── panels/
│   │   │   ├── ViewingAccountPanel.jsx
│   │   │   ├── ViewingContactPanel.jsx
│   │   │   └── ViewingTaskPanel.jsx
│   │   ├── ui/
│   │   │   ├── AnalyticsDashboard.jsx
│   │   │   ├── TaskItem.jsx
│   │   │   ├── TimePicker.jsx
│   │   │   └── ViewingBar.jsx
│   │   ├── FunnelView.jsx
│   │   ├── KanbanView.jsx
│   │   ├── LeadForm.jsx
│   │   └── QuotaRepCard.jsx
│   └── utils/
│       ├── storage.js                   # safeStorage, dbFetch, waitForToken
│       └── constants.js                 # initialOpportunities, stages, productOptions
├── netlify/functions/                   # Serverless functions (ESM .mjs)
│   ├── auth.mjs                         # verifyAuth() — used by ALL functions
│   ├── _lib.mjs                         # shared helpers: serverErrorBody(), allowOrigin()
│   ├── accounts.mjs
│   ├── activities.mjs
│   ├── ai-score.mjs
│   ├── audit-log.mjs
│   ├── calendar-add-event.js
│   ├── calendar-events.js
│   ├── contacts.mjs
│   ├── digest.mjs
│   ├── leads.mjs                        # CRUD + write-triggered lead scoring
│   ├── score-lead.mjs                   # PURE lead-scoring engine (Fit/Engagement)
│   ├── score-leads-batch.mjs            # Nightly scheduled re-score (decay + rule changes)
│   ├── _lib.mjs                         # serverErrorBody(), allowOrigin() — shared helpers
│   ├── saved-reports.mjs
│   ├── send-sms.mjs
│   ├── quote-pdf.mjs
│   ├── opportunities.mjs
│   ├── pipeline-alerts.mjs
│   ├── recommendation-log.mjs
│   ├── send-email.mjs
│   ├── settings.mjs
│   ├── spiff-claims.mjs
│   ├── tasks.mjs
│   └── users.mjs
└── db/
    ├── index.ts                         # Drizzle + Neon client
    └── schema.ts                        # All table definitions
```

---

## 4. Data Flow

```
Browser
  └── dbFetch() [src/utils/storage.js]
        ├── Gets Clerk JWT from window.__getClerkToken()
        ├── Always injects: Content-Type: application/json + Authorization: Bearer <token>
        └── Calls /.netlify/functions/<entity>

Netlify Function
  └── verifyAuth(event) [netlify/functions/auth.mjs]
        ├── Extracts JWT from Authorization header
        ├── Verifies with Clerk verifyToken()
        ├── Extracts orgId from payload.o.id
        ├── Calls clerk.users.getUser() for role/metadata
        └── Returns { userId, orgId, userRole, managedReps }

  └── DB operation via Drizzle
        ├── All queries scoped to orgId (multi-tenant)
        └── Returns JSON response
```

**Critical:** `dbFetch` already injects `Content-Type: application/json` by default. Do NOT add it manually unless overriding — it merges headers with `{ 'Content-Type': 'application/json', ...(options?.headers || {}), ...authHeaders }`.

---

## 5. Authentication Architecture

- **Clerk** handles all user auth. Users log in with email/password.
- `window.__getClerkToken` is set by `App.jsx` after `useAuth()` initializes.
- `waitForToken()` in `storage.js` polls until the token getter is ready (up to 8 seconds).
- All Netlify functions call `verifyAuth(event)` first. Auth failures return 401/403, not 500.
- `orgId` is extracted from the JWT payload at `payload.o.id` (Clerk compact format).
- **Every DB query must be scoped to `orgId`** — this is the multi-tenancy boundary.

### Auth rate limit issue (KNOWN BUG, FIXED)
`auth.mjs` originally called `clerk.users.getUser()` on every single request. During bulk imports (97 records × 3 concurrent), this hit Clerk's API rate limits and caused 500 errors. Fixed by adding a 60-second in-memory cache keyed by JWT token. **Note:** Netlify functions are stateless — the cache only helps within a single function instance's lifetime, not across cold starts.

### Authorized parties in auth.mjs
```js
authorizedParties: [
  'https://salespipelinetracker.com',
  'https://sales-pipeline-v2.netlify.app',
  'https://accelerep.netlify.app',
  'http://localhost:5173',
  'http://localhost:8888',
]
```

---

## 5b. Users table ↔ Clerk (source of truth)

Clerk is authoritative for identity, email, org membership, and role (`publicMetadata.role`); the `users` table is a **mirror** used for the in-app roster + app-only fields (quota, team, territory, profile prefs). Consequences:
- **Wiping `users` does NOT lose assignments** — ownership fields (`salesRep`, `accountOwner`, `assignedTo`, `repName`, `createdBy`) are name-**strings on each entity row**, not FKs. They survive a roster wipe.
- **Re-adding an existing member via Invite fails** — Clerk rejects an org invitation for someone already in the org. To rebuild roster rows for existing members, use **Sync-from-Clerk**, not Invite.
- **`users-sync.mjs`** (Admin) reconciles roster ← Clerk: creates missing rows, role authoritative-from-Clerk, name refresh, team/territory fill-blanks-only, quota/profile untouched, reports (never deletes) DB-rows-not-in-Clerk. Button in Settings → Users. Reuse this as the canonical "roster out of sync" fix.
- **`GET ?me=true` only reads/promotes** an existing row (email/name match) — it does **not** insert. **`PUT ?me=true` inserts** and is self-only (`data.id` must equal the caller's Clerk id). So a plain refresh won't rebuild a missing row; a profile save (or Sync-from-Clerk) will.
- **Quota is DB-only** (not in Clerk metadata) — the one field Sync can't restore; needs manual re-key or Neon PITR.

## 6. State Management

All state lives in `App.jsx` and is distributed via `AppContext`. Components consume it with `useApp()`.

### Hook breakdown
| Hook | Owns |
|------|------|
| `useSettings` | settings object, loadSettings, saveSettings effect |
| `useOpportunities` | opportunities[], handleSave, handleDelete, completeLostSave |
| `useAccounts` | accounts[], handleSaveAccount, handleDeleteAccount |
| `useContacts` | contacts[], handleSaveContact, handleDeleteContact |
| `useTasks` | tasks[], handleSaveTask, handleDeleteTask, handleCompleteTask |
| `useActivities` | activities[], handleSaveActivity, handleDeleteActivity |
| `useUserHandlers` | handleSaveUser, handleDeleteUser, handleAddUser |
| `useModalState` | all modal show/hide booleans + editing state |
| `useUIState` | activeTab, viewingRep/Team/Territory, sort state, etc. |
| `useCalendarState` | calendar events, cal view state, meeting prep |

### Settings architecture
- Settings are stored in the DB via `/.netlify/functions/settings` (PUT = upsert).
- **Users are NEVER stored in the settings blob** — they have their own `/users` endpoint.
- `useSettings` strips users before saving: `const { users: _stripUsers, ...settingsToSave } = settings`.
- On load, settings and users are loaded in parallel. `settingsReady.current` gates the save effect to prevent writing before the initial load completes.
- Non-user settings are cached in localStorage for instant paint. Users are always loaded fresh from DB.

---

## 7. Modal System

**All modals are rendered in `src/components/layout/ModalLayer.jsx`** — not in `App.jsx` or individual tabs.

When a bug involves a modal, the fix almost always lives in `ModalLayer.jsx`.

State variables that control modals (from `useModalState`):
- `showModal` / `editingOpp` → OpportunityModal
- `showAccountModal` / `editingAccount` → AccountModal
- `showContactModal` / `editingContact` → ContactModal
- `showTaskModal` / `editingTask` → TaskModal
- `showActivityModal` / `editingActivity` → ActivityModal
- `showUserModal` / `editingUser` → UserModal
- `showCsvImportModal` / `csvImportType` → CsvImportModal
- `showLeadImportModal` → LeadImportModal
- `showSpiffClaimModal` / `spiffClaimContext` → SpiffClaimModal
- `confirmModal` → inline confirm dialog
- `lostReasonModal` → LostReasonModal

**When `showCsvImportModal` is triggered, `csvImportType` must be set first** (e.g. `'accounts'`, `'contacts'`, `'opportunities'`). Failure to destructure `csvImportType` from `useApp()` in `ModalLayer` caused a recurring `ReferenceError: csvImportType is not defined` crash.

---

## 8. Netlify Function Conventions

> **🚫 DATA-SAFETY RULE (hard):** Never run — or advise running — a destructive command (`DELETE`, `?clear=true`, drop, truncate, mass-delete) against **live/production data**, including as a "test." To verify a destructive-path gate or authz rule: read-only checks, a throwaway/non-admin test account, staging, or reason from the code. Origin: an Admin "test" of `users?clear=true` wiped the org roster (recovered via Sync-from-Clerk; assignments were unaffected because they're name-strings on each row, not FKs).



Every `.mjs` function follows this pattern:

```js
import { db } from '../../db/index.js';
import { tableName } from '../../db/schema.js';
import { eq, asc } from 'drizzle-orm';
import { verifyAuth } from './auth.mjs';

export const handler = async (event) => {
    const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', ... };
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
    
    const auth = await verifyAuth(event);
    if (auth.error) return { statusCode: auth.status || 401, headers, body: JSON.stringify({ error: auth.error }) };
    const { userId, orgId, userRole, managedReps } = auth;

    try {
        if (event.httpMethod === 'GET') { ... }
        if (event.httpMethod === 'POST') {
            const data = JSON.parse(event.body);
            if (!data.id) return { statusCode: 400, ... }; // id is always required
            const [inserted] = await db.insert(table).values({ ...sanitize(data), orgId }).returning();
            return { statusCode: 201, headers, body: JSON.stringify({ entity: inserted }) };
        }
        if (event.httpMethod === 'PUT') {
            // Uses onConflictDoUpdate for upsert pattern
        }
        if (event.httpMethod === 'DELETE') { ... }
    } catch (err) {
        // serverErrorBody (from _lib.mjs) logs the real error + stack server-side
        // with a correlation id and returns ONLY a generic message to the client —
        // never leak err.message / err.stack in a response.
        return { statusCode: 500, headers, body: serverErrorBody(err, 'entity') };
    }
};
```

Key rules:
- Import shared helpers from `_lib.mjs`: `import { serverErrorBody, allowOrigin } from './_lib.mjs';`
- POST requires `id` in the body — generated client-side as `'<prefix>' + crypto.randomUUID()` (see §10)
- PUT uses `onConflictDoUpdate` for upsert, and **must** be org-scoped: `onConflictDoUpdate({ target: table.id, setWhere: eq(table.orgId, orgId), set: {...} })`. Without `setWhere`, a request carrying another org's id can overwrite that row (cross-tenant write). Conflict on `id` alone is unsafe.
- All queries include `.where(eq(table.orgId, orgId))` for multi-tenant scoping
- The `sanitize()` helper strips unknown fields before DB insert
- **Never return `err.message` / `err.stack` in a response.** Use `serverErrorBody(err, label)`; intentional 4xx messages (validation, conflicts) are fine.
- CORS: `allowOrigin(event)` (in `_lib.mjs`) echoes an allow-listed origin; currently most functions still send `'*'` (safe with bearer-token auth — tighten if moving to cookie auth or a new platform).
- **Role enforcement (core entity endpoints — see §17):** a ReadOnly mutation gate sits immediately after the auth destructure; `clear=true` branches are Admin-only via `requireRole()` + `writeAudit()`; rep-role PUT/DELETE-by-id run a name-based ownership check via `getCallerName()` (Admin/Manager skip it).
- **PUT is strictly an update:** unknown ids return **404** — never create via PUT. Creation is POST-only. Order inside PUT: existence check → ownership check → write. The upsert *write* form (`onConflictDoUpdate` + `setWhere`) is still used, but only after existence is proven.
- Shared security helpers: `requireRole`, `isReadOnly` (in `auth.mjs`); `writeAudit`, `getCallerName` (in `_lib.mjs`).

---

## 9. Database Schema Key Points

All tables have: `id` (text PK), `orgId` (text NOT NULL), `createdAt` (timestamp), `updatedAt` (timestamp).

**Indexes:** every tenant table has an `org_id` index (declared in `schema.ts` via the `(t) => [ index('...').on(t.orgId) ]` form), plus composites where queries filter on more than org (`opportunities (org_id, stage)`, `accounts (org_id, parent_account_id)`, `activities (org_id, opportunity_id)`, dispatch child tables by `job_id`/`customer_id`, calendar/dashboard by `user_id`) and `api_keys (key_hash)` for the public-API lookup. Apply index changes to prod with `CREATE INDEX CONCURRENTLY` in the Neon console — **not** `drizzle-kit push` against production (push diffs the whole schema and can act on unrelated drift).

Key relationships:
- `accounts.parentAccountId` → self-referential for sub-accounts
- `opportunities.pipelineId` → references pipelines (stored in settings.pipelines blob, not a DB table)
- `opportunities.contactIds` → jsonb array of contact IDs
- `users` table is separate from settings — quota fields (`annualQuota`, `q1Quota`–`q4Quota`) are stored on user rows
- `settings.extra` is a jsonb overflow blob for: quotaData, pipelines, teams, territories, verticals, commissionPlan, kpiConfig, logoUrl

---

## 10. ID Generation Patterns

Client-side ID generation (before DB insert) uses a prefix + `crypto.randomUUID()`:
```js
const newId = 'id_'  + crypto.randomUUID();   // standard entities
const newId = 'usr_' + crypto.randomUUID();   // users
const newId = 'q_'   + crypto.randomUUID();   // quotes, etc. — keep the per-entity prefix
```

IDs are always strings; the DB schema uses `text('id').primaryKey()`. `crypto.randomUUID()` is a browser global in secure contexts (prod HTTPS + localhost both qualify).

**Do not** use the old `Date.now() + Math.random().toString(36)` pattern — it is partially predictable and collision-prone under bulk insert / same-millisecond creates. All entity-creation sites were migrated to `crypto.randomUUID()`.

---

## 11. Save Handler Pattern

**Await-before-close rule.** Any handler that persists to the DB is `async` and MUST be awaited by callers that close a modal/rail or trigger a data reload afterward. A non-awaited persist followed by `closeRail()`/modal-close races the reload and silently drops the write — this was the task-completion bug (`TaskRail.handleConfirmComplete` fired `handleCompleteTask` without `await`, then `closeRail()` reloaded tasks over the in-flight PUT). For optimistic toggles (e.g. task complete), use: optimistic `setState` → `await dbFetch` PUT → reconcile from response → **roll back the row on failure** so local state can't drift from the DB.

All entity save handlers follow this async pattern:

```js
const handleSaveEntity = async (formData, context) => {
    setModalError(null);
    setModalSaving(true);
    try {
        const isEdit = !!editingEntity;
        const payload = isEdit
            ? { ...formData, id: editingEntity.id }
            : { ...formData, id: 'id_' + crypto.randomUUID() };
        const method = isEdit ? 'PUT' : 'POST';
        
        const res = await dbFetch('/.netlify/functions/entity', {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        
        if (!res.ok) {
            setModalError(data.error || 'Failed to save. Please try again.');
            return; // Modal stays open — user sees the error
        }
        
        // Optimistic update already done, or update from server response
        setEntities(prev => isEdit
            ? prev.map(e => e.id === payload.id ? (data.entity || payload) : e)
            : [...prev, data.entity || payload]
        );
        setShowModal(false);
        setModalError(null);
    } catch (err) {
        setModalError('Failed to save. Please check your connection and try again.');
    } finally {
        setModalSaving(false);
    }
};
```

Rules:
- Modal stays open on error (never close before confirming server success)
- Error message shown inside the modal, not as a toast
- `finally` always clears the saving spinner
- Always prefer the server's returned object (`data.entity`) over the local payload

---

## 12. Settings Persistence Rules

Settings follow a **read-then-merge** pattern on PUT to avoid overwriting unrelated fields:

```js
// WRONG — overwrites everything
await db.update(settings).set(newData).where(eq(settings.orgId, orgId));

// RIGHT — merge with existing
const [existing] = await db.select().from(settings).where(eq(settings.orgId, orgId));
const merged = { ...existing, ...newData, orgId };
await db.insert(settings).values(merged).onConflictDoUpdate({ target: settings.id, set: merged });
```

This is critical. A bug where `settings.mjs` PUT overwrote unrelated fields (teams/territories/verticals/pipelines) caused data loss for those fields on every save.

### Settings authorization

**`PUT /settings` is Admin-only.** First lines of the PUT branch:

```js
const forbidden = requireRole(auth, ['Admin'], headers);
if (forbidden) return forbidden;
```

Settings are org-wide (stages, field visibility, feature flags, fiscal year, the BYOK key). Gating only the secret field would leave SVR-2(b) open — any member could still rewrite shared config. **`GET /settings` stays open to all members** (the app needs stages/`fieldVisibility` to run) but must never contain a secret.

**Consequence:** the `useSettings` auto-save PUTs on every `setSettings`, so non-admins now get a 403 there. That is correct — it is also why **personal preferences must never live in the settings blob.** Per-user settings go to `PUT /users?me=true` (see `PersonalNotifications` in `PersonalView.jsx`). When sending a partial update there, **spread the full flattened profile** (`{ ...myProfile, newField: value }`) — the server's `sanitize()` rebuilds `profile` from an explicit whitelist, so a partial payload silently wipes every field you omit.

### Secrets in the settings blob — hard rules

- **A secret lives in exactly one place.** The org Anthropic key belongs only in `extra.anthropicApiKey`, as AES-256-GCM ciphertext (`crypto.mjs`, keyed by `SETTINGS_ENCRYPTION_KEY`). The SVR-2 leak was *not* that field — it was a second plaintext copy the AI panel wrote into `aiSettings.byokProvider`, a general blob GET returns to every member. **When auditing secret handling, grep the UI for where the value is actually bound**, not just the field the audit names.
- **The plaintext never leaves the server.** GET returns `anthropicApiKeySet` (boolean) to all members and `anthropicApiKeyLast4` to Admins only. There is no code path that returns the key.
- **Key inputs are write-only.** Always empty on load; track intent in state (`keyAction`) so an untouched field never clears a stored key. Omit the field from the PUT to preserve, send `null` to clear.
- **`scrubAiSettings()` runs on GET and PUT**, so any stray plaintext self-heals out of the DB on the next admin save. `extractLegacyKey()` migrates a pre-existing plaintext key into the encrypted field once.
- **Never mirror settings containing key material to localStorage** or echo them in the `useSettings` auto-save — `stripKeyMaterial()` handles both, and self-heals pre-fix caches.
- **Never log the key or put it in error responses, audit rows, or exported config.** Audit records only *that* it changed: `settings.apikey.set|cleared|migrated` (plus `settings.updated`).
- Server-side consumers (`ai-score.mjs`) read the ciphertext from the DB row and decrypt in-process — never via the settings HTTP response.

Apply this same pattern to any future stored secret.

---

## 12b. Operational Entities vs. CRM Records

Dispatch deliberately keeps its own tables rather than reusing `accounts` and `users`. Follow this pattern for any future operational module.

| Operational entity | CRM/identity record | Link |
|---|---|---|
| `dispatch_customers` | `accounts` | `dispatch_customers.accountId` (nullable FK) |
| `dispatch_technicians` | `users` | `dispatch_technicians.userId` (nullable FK) |

**Why they stay separate:**
- The operational table carries fields that have no business on the CRM record — `serviceAgreement`, `preferredTechId`, `doNotService`, `taxExempt`, `creditLimit`, `paymentMethod`, labour rates, service zones.
- Residential/field volume would wreck account segments, lead scoring, duplicate-merge, and every pipeline report.
- Dispatch is a **licensed module**. Core tables must not carry dispatch-only concepts for orgs that do not have it.

**The nullable FK is load-bearing.** A subcontractor is a technician with `userId = null` — schedulable without consuming a Clerk seat. An employee who needs app/mobile access gets a linked user. **Identity (can log in, has a role) and operational record (schedulable, has skills and rates) are separate concerns; never collapse "technician" into a user role.**

**Rules:**
- Link by FK; surface the linked record read-only with an explicit **copy** action. **No automatic bidirectional sync.**
- **Never gate a per-record feature on an org-wide flag.** `settings.dispatchEnabled` (org licensing) is not `user.dispatchEnabled` (this person).
- **No delete where the FK has no cascade.** `dispatch_jobs.customerId` / `.assignedTechId` would orphan. Ship a retire flag (`doNotService`, `status`) instead.
- One store per concept. Dispatch briefly had three for technicians; two were dead or non-persisting.

---

## 12b1. One Store Per Concept — and How to Tell Which One Wins

Vehicles and equipment each had **two** stores: a `settings.*` blob with a UI, and a DB table with an endpoint. Adding a van in Settings made it appear nowhere a dispatcher would look, because the board filter and the technician record both read the **table**.

**The test is not which list is bigger or older. It is: which store does the operational surface consume?** Whatever the board, the scorer, or the scheduler reads is the source of truth. Everything else is a parallel copy that will disagree.

**Configuration belongs in `settings`; records belong in tables.** The line is whether the thing has per-instance state:

| | Settings blob | DB table |
|---|---|---|
| Shape | Vocabulary, defaults, toggles | One row per real-world thing |
| Write pattern | Whole-object PUT, read-then-merge | Per-record POST/PUT |
| Fails when | Two people edit at once | — |
| Use for | Skills, licence levels, priorities, block types | Vehicles, equipment, technicians, customers, jobs |

A store whose state changes because someone *did* something in the field (checked a tool out, took a van off the road) is a table, not a blob. A whole-blob PUT clobbers concurrent edits.

**Retiring a blob: stop reading it, do not delete it.** Leave the key in place. It is usually the only way to translate legacy ids during migration, and deleting live data to tidy up is not worth the risk.

---

## 12b3. Batch Planners Need a Running Ledger

Anything that proposes multiple placements in one pass must make each placement visible to the ones after it. `planWeek` kept a running `busy` map for technicians but nothing for equipment, so the first two proposals in a run could each claim the last unit and both look valid in isolation.

**Shape the ledger entry like the real record** so the same availability function can consume it:

```js
placedSoFar.push({ id: 'plan_' + job.id, equipCategories, scheduledDate, start, durationHrs, status: 'scheduled' });
const conflicts = equipmentConflicts(job, [...jobs, ...placedSoFar], units, dateStr, probe);
```

Two related rules for crews:

- **Choose the slot first, then assemble the crew from whoever is free at it.** Ranking candidates and then hunting for a common time succeeds far less often — the best-scoring people are the busiest.
- **Never propose a partial crew.** A job that looks scheduled but is short-staffed is worse than one visibly still in the queue. Skip it, and give a reason that distinguishes "not enough people" from "no common slot" from "equipment busy" — they need different fixes.

---

## 12b2. Requirements vs. Assets (capacity modelling)

A job needs **a** pressure tester. Checkout binds **asset #A-1042**. These are different things and must not share a field.

- **Model the unit, not the count.** One equipment row per physical unit, grouped by `category`. A `qty: 2` cannot express "one of the two is in the shop", so any availability check built on a number over-reports the moment a unit goes out of service.
- **Requirements name the category; fulfilment names the row.** `dispatch_jobs.equipment_ids` stores categories. Asset-level checkout lives on `dispatch_equipment.checkedOutJobId`, pointing the other way.
- **Derive the vocabulary from the records.** A category exists exactly when a unit carries it; a requirable vehicle class exists exactly when the fleet contains one. Never keep a separate list to drift.
- **Only some statuses remove capacity.** `maintenance` / `out_of_service` do. `checked_out` does **not** — the overlap test decides whether it is free at that hour.

**Where a constraint is enforced follows what it attaches to:**

| Constraint | Attaches to | Enforced in | Why |
|---|---|---|---|
| Equipment | nothing — org-wide pool | `handleSchedule` (job-level gate) | In `scoreTech` it would stamp the identical blocker on every candidate |
| Vehicle class | the technician (`assignedTechId`) | `scoreTech` (per-tech blocker) | It filters *who can serve*, so it must be able to rank |

**One notion of "at the same time" per module.** Equipment concurrency reuses the same hour-overlap test as technician double-booking. **A job with no start time cannot be overlap-tested, so treat it as holding the resource all day** — assuming no clash is a fabrication.

---

## 12b4. User Content Bound for Someone Else's Inbox

An email signature is authored by one user and rendered in a customer's mail client. Three rules:

- **Plain text, not rich text.** A markup-capable field here is an injection path into every recipient's inbox.
- **Escape, THEN convert newlines.** Reversing the order turns the inserted `<br>` tags into literal text. Escape `&` first, or it double-encodes the entities produced by the later replacements.
- **Read the sender's attributes SERVER-SIDE from their own row.** Never accept them from the request body, or a client can send arbitrary content under another user's name.

The same reasoning applies to anything user-authored that leaves the app — quote notes, shared links, exported files.

---

## 12c. Human-Readable Record Numbers

`CUST-0001`, `JOB-2026-0042`. Rules, using `dispatch_customers.customerNumber` as the reference implementation:

- **Assigned server-side, always.** Two users creating records simultaneously would collide on a client-generated number.
- **Immutable once set.** POST is an upsert and reuses any existing value; the PUT whitelist omits the field; the client save handler strips it too.
- **Sequential per org** — each tenant gets its own clean sequence. Numbers repeating across orgs is expected, not a collision.
- Backfill existing rows with one additive, re-runnable `UPDATE` guarded by `WHERE <col> IS NULL`, ordered by `created_at`.

---

### Generating the next number: extract the integer, never `MAX` the text

The generators originally selected every row in the org and found the maximum in JS. The obvious fix — `MAX(customer_number)` — is one indexed lookup and **is wrong**, because zero-padding only preserves ordering while the digit count is constant:

```
rows: CUST-9999, CUST-10000, CUST-10001
MAX(text)    -> CUST-9999    <- reissues numbers already in use
MAX(numeric) -> CUST-10001   <- correct
```

Extract the numeric part and aggregate that:

```js
const [row] = await db
    .select({ max: sql`MAX(CAST(SUBSTRING(TRIM(${table.col}) FROM '^CUST-([0-9]+)$') AS INTEGER))` })
    .from(table)
    .where(and(eq(table.orgId, orgId), sql`TRIM(${table.col}) ~ '^CUST-[0-9]+$'`));
const max = parseInt(row?.max, 10) || 0;
```

Three details that are not optional:

- **`TRIM` in both the filter and the extraction.** A hand-edited value stored with surrounding whitespace must still COUNT, or its number gets reissued to somebody else.
- **The `WHERE` regex** replaces the old JS pattern test, so malformed and NULL values are ignored exactly as before.
- **A year prefix narrows the scan** to that year's rows — use it where the format has one.

**A unique index does not rescue a bad generator.** It catches the collision, but every retry proposes the same losing number. Constraints protect data; they do not fix logic.

**When replacing an implementation, diff the SEMANTICS.** Running the old JS against the new SQL over a table of edge cases — gaps, NULLs, hand-edited junk, values past the padding width, whitespace — is what surfaced the `TRIM` divergence. Validate the emitted SQL with a real parser (`pglast`) rather than trusting the query builder.

### The three rules, and where they are broken

1. **Generate server-side, never client-side.** Two users creating a record at the same moment will read the same list and produce the same number. `nextCustomerNumber` (`dispatch-customers.mjs`) and `nextJobNumber` (`dispatch-jobs.mjs`) are the reference implementations.
2. **Immutable once assigned.** Keep the column out of the PUT allowlist, and have POST-as-upsert reuse any existing value rather than reissuing one.
3. **Guarantee uniqueness in the DATABASE, not in application code.** Read-max-then-add-one is two statements with a gap between them. Without a unique index on `(org_id, <number>)` plus a retry on conflict, concurrent writes silently produce duplicates. *(Currently outstanding on both dispatch tables — see state doc §9.)*

**Known violation: `quotes.quote_number`.** Generated client-side in `useQuotes.js` from the quotes currently loaded, and present in the quotes PUT allowlist — so it is both collision-prone and editable. Do not copy this pattern; it predates the rule.

**Yearly prefixes are not sortable.** `JOB-2026-0042` restarts each January, so ordering by the number breaks across a year boundary. Sort by `createdAt` when chronology matters.

## 13. Quota / User Fields

Quota data lives on **user rows in the DB**, not in the settings blob.

```js
// updateRepField in SalesManagerTab — persists immediately to /users
dbFetch('/.netlify/functions/users', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updatedUser),
});
```

Fields: `annualQuota`, `q1Quota`, `q2Quota`, `q3Quota`, `q4Quota`, `quotaType` ('annual' | 'quarterly').

The `AnalyticsDashboard` must read quota from per-rep user fields, not from the global `settings.quotaData` blob. Reading from the blob caused $0 remaining quota bugs.

---

## 14. CSV Import Architecture

Import callbacks are defined in `ModalLayer.jsx`; the wizard is
`CsvImportModal.jsx`; header matching is `src/utils/csvAutoMap.js`.

Flow: trigger sets `csvImportType` ('accounts' | 'contacts' | 'opportunities')
and `showCsvImportModal` -> upload -> mapping -> preview -> conflicts (only when
duplicates are found) -> results.

### Two write paths, two different shapes

| Path | Method | Batching |
|---|---|---|
| New records | `POST` array | one statement, **unbatched -- see the ceiling in 18b8** |
| Overwrites | `PUT` array | `bulkUpsert` in `_lib.mjs`, 400 rows per request |

**Overwrites** go through `saveBulk` (module scope in `ModalLayer.jsx`) -> the
array branch of `PUT` -> `bulkUpsert`. This was previously one PUT per record at
CONCURRENCY 3: a 1,504-row re-import meant ~500 sequential round-trips, 75s-2.5min
with the tab unresponsive. Now 4 requests.

**New records** still POST the entire array as a single INSERT, which breaks above
the bind-parameter ceiling. **Not yet fixed.**

### Auto-mapping (`src/utils/csvAutoMap.js`)

Weighted aliases + per-field deny rules + a global one-to-one assignment. Pure and
dependency-free; tested in `tests/csv-automap.test.mjs` against real Outlook and
Google Contacts header rows.

The matcher it replaced was `headers.findIndex()` over a flat `||` chain. Against a
real Outlook export it produced four wrong mappings, from three structural faults:

1. **First match wins.** `"Company Main Phone"` beat `"Company"`; `"E-mail Address"`
   beat `"Business Street"`; `"Home Phone"` beat `"Business Phone"`. Outlook's
   `"Title"` column is the *honorific* (Mr./Dr.) and it beat `"Job Title"`.
2. **No one-to-one constraint.** `"E-mail Address"` was assigned to both `email`
   and `address`.
3. **Dishonest confidence.** The score came from *how* the match was made, not how
   good it was. A buried substring scored 0.85 -- at the warn threshold -- so wrong
   mappings rendered **green**. The one signal that could have caught this reported
   everything as fine. (See 18b7: wiring is not a feature. A confidence bar that
   cannot report low confidence is decoration.)

Rules when editing:
- An exact label/key match must always outrank a substring match.
- An explicit `ALIASES` entry **overrides** the implicit key/label alias. Without
  that precedence the implicit `title` (weight 1) defeats the deliberate
  `['title', 0.7]`, `"Title"` ties with `"Job Title"`, and the winner falls back to
  column order -- reintroducing the exact bug. This was caught by the
  "column ORDER does not change the result" test, not by review.
- `DENY` exists for when the *right* column is absent. No mapping beats a wrong
  one: a blank cell is visible, a phone number in a Company column reads as data.

### Conflicts step

- Every conflict is created with `action: 'skip'`. The bulk control is a segmented
  toggle deriving its state from the conflicts themselves, reporting `mixed` once
  any row is set by hand. It was two plain buttons, and "Skip all" set skip -> skip
  and appeared dead.
- Paged at `CONFLICTS_PER_PAGE = 100`. Each row owns a `<select>`; unpaged, a
  same-file re-import rendered 1,504 of them and froze the tab on every state change.
- A same-file re-import flags every record and defaults them all to Skip, so the
  button reads "Import 0" and the default outcome is nothing. The step says so
  explicitly rather than looking broken.

### Still open in this area

- Accounts/contacts POST is unbatched (18b8).
- `onConflictDoNothing()` in the POST bulk branch is **decorative**. The only unique
  constraint is the `id` primary key and every id is a fresh `crypto.randomUUID()`
  from `ModalLayer`, so it can never fire. The comment claims it "skips duplicates
  instead of erroring"; nothing dedupes by name at insert time.
- `ModalLayer` calls `setAccounts` / `setContacts` **before** the write. On a 500 the
  UI shows records that were never saved. Violates the no-local-only-state rule in
  12. Note the `res.ok` check is correct -- this is not a swallowed write, it is a
  write applied optimistically and never rolled back.

---

## 15. Sub-Tab Pattern

Sub-tabs within a main tab use this consistent pattern (used in SalesManagerTab and ReportsTab):

```jsx
const [subTab, setSubTab] = React.useState('performance');

const subTabStyle = (tab) => ({
    padding: '0.5rem 1.25rem',
    border: 'none',
    borderBottom: subTab === tab ? '2px solid #2563eb' : '2px solid transparent',
    background: 'transparent',
    color: subTab === tab ? '#2563eb' : '#64748b',
    fontWeight: subTab === tab ? '700' : '500',
    fontSize: '0.875rem',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.15s',
    whiteSpace: 'nowrap',
});

// In JSX:
<div style={{ display:'flex', borderBottom:'1px solid #e2e8f0', marginBottom:'1.5rem' }}>
    <button style={subTabStyle('performance')} onClick={() => setSubTab('performance')}>Performance</button>
    <button style={subTabStyle('administration')} onClick={() => setSubTab('administration')}>Administration</button>
</div>
```

---

## 16. Styling Conventions

- **No CSS frameworks** — all styles are inline or in `index.css`
- CSS variables defined in `index.css`: `--bg-primary`, `--bg-secondary`, `--bg-tertiary`, `--text-primary`, `--text-secondary`, `--border-color`, `--accent-primary`, `--accent-danger`
- Inline style objects are defined at the top of component scope (e.g. `smCard`, `smHdr`, `smTitle` in SalesManagerTab)
- Button class names: `btn`, `btn-secondary`, `action-btn`, `action-btn delete`
- Tab pages use `className="tab-page"` wrapper with `className="tab-page-header"` inside
- Mobile-responsive: `isMobile` flag from `useUIState`, 44px tap targets, safe-area insets, full-screen modals on mobile

---



### The actual design system (warm "stone / ink")

The app does **not** use a CSS framework or the `index.css` button classes for new work. Every component file declares its own design-token object and styles inline:

```js
const T = {
  bg:'#f0ece4', surface:'#fbf8f3', surface2:'#f5efe3',
  border:'#e6ddd0', borderStrong:'#d4c8b4',
  ink:'#2a2622', inkMid:'#5a544c', inkMuted:'#8a8378',
  gold:'#c8b99a', goldInk:'#7a6a48',
  danger:'#9c3a2e', warn:'#b87333', ok:'#4d6b3d', info:'#3a5a7a',
  sans:'"Plus Jakarta Sans", system-ui, sans-serif', r:3,
};
```

(Settings panels import a shared `T` from `settings/shared/tokens.js`; other areas define `T` locally.)

**Hard rules:**
- **No generic colors.** `#2563eb` and other off-brand blues/grays are forbidden — use `T.info`, `T.ink`, etc. (The old sub-tab style in §15 with `#2563eb` is off-brand; new tabs use `T.*`.)
- **Inline styles only.** No `btn` / `btn-secondary` / `action-btn` / `modal-actions` classes in new/edited components.
- Pills: `borderRadius: 999`. Dark drag-handle headers: `#1c1917`. Base radius `T.r` (3).

### JSX does not process `\u` escapes

`\u2014` inside JSX **text** or an **attribute value** renders as the literal characters, not an em dash. Only string and template literals interpret it:

```jsx
<span>Completed \u2014 contact dispatch</span>        {/* renders "\u2014" */}
<input placeholder="Notes\u2026"/>                    {/* renders "\u2026" */}
<span>{`Completed \u2014 contact dispatch`}</span>     {/* correct */}
```

Use the actual character in JSX. Babel accepts all three, so this only shows up on screen.

### Derive nothing the user is meant to enter

`normaliseTech` fabricated a technician's licence level from employment type and skill count because the column did not exist. The dispatch board then matched **job eligibility** against that invented value — promoting a tech with one skill and blocking a real Master with none. Store the field, default to unset, and make unset **fail safe** (block, don't pass). A plausible-looking default is worse than a visible gap.

### Check the schema before building — it is ahead of the UI

Repeatedly this session a "new" feature needed **no schema change** because the column or table already existed and nothing referenced it: `dispatch_jobs.trade` / `.jobType`, `dispatch_technicians.workingHours`, and the entire `dispatch_schedule_blocks` table (which had no endpoint at all). Before designing a migration, grep `schema.ts` for the concept and then grep the codebase for the column name — a declared-but-unreferenced field is a feature that was designed and never wired.

### Views over the same data must agree

The week board renders jobs inside technician rows; the month grid renders every job on a date. A job with a date but no crew was therefore invisible in one view and present in the other. When two views read the same dataset through different groupings, work out what each grouping drops and give it somewhere to go (the week board gained a "Needs a crew" row).

### Advisory state is not enforcement

The crew builder computed `blockers` (missing skill, expired cert, licence too low, over-hours, double-booked), rendered them in red, and then gated its Add button on `score >= 70` — so a high-scoring blocked technician was assignable. When a rule is displayed, check that the control which performs the action reads the same rule. Provide an explicit override path (confirmation naming the blockers) rather than leaving the gate open.

### A field in the save payload must also be in the load

`mobile` was sent by Save Profile and never seeded into the form state, so it rendered blank and **every save overwrote the stored value with `''`**. Nobody reports this — it looks like the field was simply never filled in.

**Whenever you add a field to a form, add it to both sides in the same change**: the save payload AND whatever seeds the form from the record. `check-tdz.mjs` does not find this; only reading both halves together does.

### An affordance gated on OFF disappears once it is ON

The only calendar control in the app was a Home prompt gated on `!calendarConnected`. Connecting removed it — and since meetings are folded into another list rather than shown as a calendar, a connected calendar with no events produced nothing anywhere. No confirmation, no way to reconnect.

**Whenever a control is gated on a status, represent the opposite status too.** Either branch of the condition should render something. The user must always be able to tell which state they are in.

Related: **do not ship controls that do not do anything.** A deleted settings panel had a Connect button with no `onClick` and four sync toggles held in local state, saved nowhere and read by nothing. Worse, it displayed invented statistics as if they were the user's own data. An honest empty state beats a convincing mock.

### A `<select>` with an unmatched value silently shows the first option

A stored id that resolves to nothing does not render blank — the browser shows **option one**, which usually reads as "None". The user sees a correct-looking field, and the next save writes that "None" over a real setting.

**Always emit an explicit escape option for an unresolved value:**

```jsx
{isMissing && <option value={draft.fieldId}>Unknown technician ({draft.fieldId})</option>}
```

This bit three separate fields in one session: preferred technician, crew default vehicle, and template vehicle class. Pair it with a visible note saying what happened.

### Never coerce a controlled input inside `onChange`

`parseInt(e.target.value) || 1` rewrites the field to `1` the instant the user backspaces to empty, so it can never be cleared and therefore never be replaced. Worse, a value derived as `` `${hrs} hours` `` re-formats on every keystroke and pins the caret — the field is completely uneditable.

**Hold raw text while typing, coerce on blur, and sanitise again at save** in case the field never blurred:

```jsx
value={draft.crew ?? ''}
onChange={e => update('crew', e.target.value)}
onBlur={e => { const v = commitNumber(e.target.value, BOUNDS); if (v !== draft.crew) update('crew', v); }}
```

### Resolve display names at render, not inside a mount-only effect

A loader `useEffect` with `[]` deps captures `settings` as it was at mount. Names resolved in there are frozen — if settings arrive a tick later, the UI shows "unknown item" permanently. **Store ids on the record; resolve to names where they are displayed.**

### Filter counts must be independent of the other active filters

A count computed against every active filter collapses to zero the moment two are combined, so the number stops answering the only question it is there to answer: *what would I get if I clicked this?* Compute each chip's count against the search plus its own predicate, ignoring the other chips.

### Derive history; never denormalise it

A stored `jobCount` or `lastServed` on a customer needs maintaining on every job write and is wrong the moment one is deleted. Derive at render and memoise on both inputs. Exclude cancelled records — a cancelled job is not service rendered.

### Report what was skipped; never drop it silently

Unmatched legacy values, licence levels no longer in the vocabulary, template fields that could not be applied — all surfaced to the user. **A dropped requirement is invisible; a reported one gets fixed.**

### No inline sub-components (critical)

Never define a component inside another component's render: `const Row = () => …` placed inside `Panel()` makes React see a **new type every render** → full unmount/remount → focus loss, scroll jumps, stale closures. Define sub-components at **module scope** and pass data as props. (Tabs still to audit: `TasksTab`, `LeadsTab`, `PipelineTab`.)

### Popovers / menus must portal out of scroll containers

A kebab/dropdown menu inside a scrollable or `overflow:hidden` container (and any ancestor with a CSS `transform`, which traps `position:fixed`) will clip. Render menus via `ReactDOM.createPortal(…, document.body)` with `position:fixed`, coordinates from the trigger's `getBoundingClientRect()`, flip up/down by available viewport space, and a `maxHeight` + `overflowY:auto`. Close on outside-click / scroll / resize — **but ignore events whose target is inside the menu** (`menuRef.current.contains(e.target)`), or the menu's own scrollbar drag will dismiss it.

### Portaled popovers: clear the host z-index, guard the open-mousedown

Two traps beyond the clipping rule above, both hit by `TimeDropdown` this session:
- **z-index must clear the host surface.** A portal at `zIndex:400` renders *behind* the task rail (`11003`) — opened but invisible. Check the host container's z-index; `TimeDropdown`'s menu sits at **12000**. Highest app z-indexes: create-modals/meeting-prep overlays at `99999` (unrelated).
- **Mousedown-race inside draggable containers.** A trigger opening on `onClick` (mouseup) can be closed by the *same gesture's* `mousedown` reaching the outside-close listener, because the draggable rail attaches its own document `mousedown` handlers. Fix: toggle the trigger on `onMouseDown` + `stopPropagation`, and guard the outside-close `useEffect` with a `justOpenedRef` that swallows the mousedown that opened it.

### Accounts include sub-accounts

`accounts` from `useApp()` contains sub-account rows (`parentAccountId` set). For counts/distributions filter to **top-level** (`!a.parentAccountId`) — counting all rows over-inflates. Account industry = `account.verticalMarket || account.industry`.

---

## 17. Role System

| Role | Access |
|------|--------|
| Admin | Full access, all reps' data, settings, user management |
| Manager | View all data for their team, edit/delete |
| User (Sales Rep) | Own data only, create & edit |
| ReadOnly | View only, no changes |

Role is stored in Clerk `publicMetadata.role` and extracted in `auth.mjs`. It flows into the app as `userRole` via context.

```js
const isAdmin = userRole === 'Admin';
const isManager = userRole === 'Manager';
const canSeeAll = isAdmin || isManager; // exposed on context
```

### Server-side enforcement (shipped — client-side `canEdit` is UX only, never security)

| Action | Admin | Manager | Sales Rep | ReadOnly |
|---|---|---|---|---|
| POST (create) | ✅ | ✅ | ✅ | ❌ 403 |
| PUT (edit) | ✅ any | ✅ any | own + unassigned | ❌ 403 |
| DELETE by id | ✅ any | ✅ any | own + unassigned | ❌ 403 |
| DELETE `?clear=true` | ✅ | ❌ | ❌ | ❌ |

### Technician (fifth role)

A **Technician** is a field/mobile user, not a general write role. Role values are `Admin | Manager | User | ReadOnly | Technician` — `'User'` is the stored value for a sales rep; "Sales Rep" is a display label only.

- **`requireWrite` denies Technician by default.** Exactly one caller opts in:
  ```js
  requireWrite(auth, event, headers, { allowTechnician: true })   // dispatch-jobs.mjs only
  ```
  A new role must never gain write access simply by not being ReadOnly. When the role set changes, **grep every gate** — adding Technician revealed nine endpoints that checked `isReadOnly` directly (the six core CRM handlers) or through a local shadowing const (`quotes.mjs`).
- **Scope by the technician row, not the user.** `dispatch_jobs.assignedTechId` FKs `dispatch_technicians.id`, so resolve `userId → technicianId` first. A Technician with no linked technician row **fails closed** (403) — never fall back to showing everything.
- **Per-field whitelist, not a role check:** `status`, `techNotes`, `completionNotes`, `photosCount`, `customerSignature`, on their own jobs only; status limited to `en_route | on_site | paused | completed`. Reject illegal fields **by name** rather than dropping them silently.
- Return **404, not 403**, for a job they are not on, so job ids cannot be enumerated.

### Roles live in Clerk, not the database

**`role` must never be taken from a request body into the `users` table.** It was, via `sanitize()`, on every write — so a self-service profile save that omitted `userType` silently demoted the caller to `'User'`, and admin role edits updated the roster while authorization kept reading the old Clerk value.

- `users.mjs` passes role explicitly through `withRole(clean, known)`; `roleOf(id)` preserves the stored value on update.
- Only three paths set one: **invite** (same role goes to Clerk with the invitation), **admin create**, and **`user-role.mjs`** (writes Clerk first, mirror second).
- **`users-sync?check=true`** is a dry run — same reconciliation, no writes, no audit row — used to show an out-of-sync banner on Settings → Users. Reconciling silently is not enough; drift needs to be *visible*, or it accumulates unnoticed.
- Deleting a roster row does **not** remove the Clerk account, so Sync will recreate it. Removing access means removing the user from the organization in Clerk.

`auth.mjs` reads `publicMetadata.role` on every request; the `users` table is a mirror. **Changing a role means writing to Clerk** — `user-role.mjs` (Admin-only) does this, then updates the mirror best-effort, and audits `user.role.changed`. It verifies org membership first, because Clerk user ids are global and an Admin of one tenant must not be able to rewrite a role in another. It also refuses self-demotion from Admin.

Before this existed, the Settings role selector wrote only the mirror and changed nothing the server enforced.

| `PUT /settings` (org config) | ✅ | ❌ 403 | ❌ 403 | ❌ 403 |

- Enforced in all six core entity endpoints (+ `users.mjs` clear is Admin-only; `quotes.mjs` had its own gates already).
- **`requireWrite(auth, event, headers)` (`auth.mjs`) is the shared write gate.** ReadOnly is the only role with no write capability at all, so this encodes that half of the matrix once. Non-mutating methods pass through, so call it **once at the top of a handler**, not per branch — that also covers sub-resource branches (e.g. `dispatch-jobs?resource=lineitems`) that a per-branch gate would miss:
  ```js
  const forbidden = requireWrite(auth, event, headers);
  if (forbidden) return forbidden;
  ```
- **Every mutating function must have a gate.** As of the SVR-3 sweep: 29 of 29 covered — 28 by role check, plus `dashboard-configs.mjs`, which needs none because its PUT writes a self-scoped id (`'dash_' + userId + '_' + orgId`) and so can only ever touch the caller's own row. Self-scoping by construction is an acceptable substitute for a role gate; org-scoping alone is **not** (that was the `saved-reports` DELETE bug — any member could delete anyone's report).
- **Dispatch:** any non-ReadOnly role (Admin/Manager/Sales Rep) has full write access to all `dispatch-*` records.
- **Audit rows are server-derived, never client-supplied.** `audit-log.mjs` POST ignores the client's `userId` / `userName` / `timestamp` and derives them from `auth` + `getCallerName()`. Accepting them from the body let any member forge entries attributing actions to another user — which would make the audit trail worthless as evidence for every other control. GET is Admin/Manager only.
- **Ownership is name-based** (display names in `salesRep` / `accountOwner` / `createdBy` / `assignedTo` / `repName`), compared against `getCallerName(userId, orgId)` — which **fails closed** (null → caller owns nothing assigned). `orgId` is REQUIRED and throws when absent (§18b20.3); this line read `getCallerName(userId)` until 26 Aug, having been written before the identity split added the parameter. Known limitation: renames/duplicate names. The fix is `ownerId` columns and it is **in progress**, not post-launch — Phase 2, sequenced in SESSION_HANDOFF.md. **No endpoint calls this directly for object-level authorization any more**; they all go through `assertOwnership()` (§18b21).
- Manager writes are **org-wide in v1** (team-scoped writes = Phase 2).
- The 30s `verifyAuth` role cache means role changes take up to 30s to bite on these gates.
- Not yet swept: `documents.mjs`, `dispatch-*`, `products`, `saved-reports` (backlog).

---

## 18. Known Bugs Fixed (Reference)

| Bug | Root Cause | Fix |
|-----|-----------|-----|
| `csvImportType is not defined` crash | Not destructured from `useApp()` in `ModalLayer.jsx` | Add `csvImportType` to destructure in ModalLayer |
| CSV import 500 errors | `auth.mjs` calling `clerk.users.getUser()` per request → Clerk rate limit | Token cache in `auth.mjs` |
| Settings data loss (teams/territories/pipelines) | PUT handler overwrote entire settings row | Read-then-merge pattern in `settings.mjs` |
| Quota data loss on logout | `updateRepField` not writing to `/users` DB endpoint | Always persist quota changes to `/users` immediately |
| AnalyticsDashboard showing $0 quota | Reading from stale global `settings.quotaData` | Read from per-rep user fields instead |
| Users loading stale data | Users cached in localStorage | Always purge `salesUsers` localStorage key on load; users are authoritative from DB only |
| "Failed" shown on successful CSV import | `onImportAccounts` throws on partial save; catch block showed error even when all records saved | Distinguish total failure vs partial in catch block |
| Contacts importing using account importer | `appFields` captured via stale closure in `parseCSV` | Use `getAppFields()` helper that reads live `importType` at call time |
| Kebab popover clipped by panel frame | `position:absolute` inside an `overflow`/`transform` container | Portal the menu to `document.body`, `position:fixed`, viewport-aware flip + `maxHeight` |
| Popover closes when you scroll its own list | capture `scroll` close-handler fired on the menu's internal scrollbar | Ignore events where `menuRef.current.contains(e.target)` |
| `importCSV is not defined` (PainPoints) | handler inserted one line early — landed *inside* `removeItem`, not component scope | Define handlers at component scope (Babel won't catch wrong-scope-but-valid) |
| Distribution counts wildly inflated (482 of "661" for ~83 accounts) | counted all account rows incl. sub-accounts | Count top-level only (`!a.parentAccountId`) |
| Roles/SSO edits lost on reload | `RolesDetail`/`SsoDetail` edited in-memory, no `dbFetch`, no settings key | Persist to `settings.extra.rolePermissions` / `ssoConfig` (added to GET+PUT) |
| Settings panel renders but a sub-component is undefined | extracting a section left a cross-section reuse behind (e.g. Audit used Security's `SecCrumb`) | Grep identifiers against ALL resident code before moving, not just the section |
| Cross-tenant write via upserts | `onConflictDoUpdate` keyed on `id` only — another org's id could overwrite a row | Added `setWhere: eq(table.orgId, orgId)` to every upsert (see §8) |
| Weak / collision-prone record IDs | `Date.now() + Math.random()` — predictable + collisions under bulk import | Migrated all client-side ID generation to `crypto.randomUUID()` (see §10) |
| Full table scans on every query | 37 tables, no indexes; all reads filter `org_id` | Declared `org_id` (+ composite) indexes in `schema.ts`; applied via `CREATE INDEX CONCURRENTLY` |
| Error responses leaked internals | 42 functions returned raw `err.message` / `err.stack` | `serverErrorBody()` in `_lib.mjs` — generic message + correlation id to client, full detail logged server-side |
| Any member could wipe org data (`?clear=true`) | Six entity DELETEs ran org-wide delete with only membership auth | Admin-only via `requireRole()` + `writeAudit` row + count; `users.mjs` tightened Manager→Admin; ContactsTab per-id fallback for non-admins |
| Plaintext API key sent to every member | `settings.mjs` GET decrypted and returned `anthropicApiKey`; localStorage cached it | GET returns presence boolean only (last-4 for Admins); whole PUT Admin-gated + audited; `useSettings` scrubs cache |
| Second, *unencrypted* copy of the API key | AI panel bound its key input to `aiSettings.byokProvider` — stored as plaintext JSONB in a blob GET returns to every member, rendered in card text, and written to exported config. BYOK was also non-functional: `ai-score.mjs` reads `extra.anthropicApiKey`, which that UI never set | Write-only key input → encrypted field; `scrubAiSettings()` on GET+PUT; `extractLegacyKey()` one-time migration; export scrubs key-shaped values |
| Personal prefs written to org-wide settings | `PersonalView` "Save preferences" PUT `{...settings}` to `/settings` from a non-admin view; the key wasn't in `settings.mjs` GET/PUT so it silently did nothing | Rerouted to `PUT /users?me=true` → `profile.notificationPrefs` |
| No server-side role enforcement on mutations | Client-side `canEdit` was the only gate — console-armed ReadOnly/reps could mutate anything | ReadOnly mutation gate + rep ownership checks (name-based, fail-closed) on all six entity endpoints |
| PUT silently created records on unknown ids | PUT used upsert — a probe with a fabricated id inserted a row | PUT strictly updates: unknown ids 404; creation is POST-only |
| Task completion lost on refresh (part 1) | `handleCompleteTask` was local-only (`setTasks`, no `dbFetch`) | Rewrote async: optimistic → PUT → reconcile → roll back on failure + audit |
| Task completion lost on refresh (part 2) | Rail fired the async completion without `await`, then `closeRail()` reloaded tasks and raced the in-flight PUT | `await handleCompleteTask` before `closeRail()`; see await-before-close rule in §11 |
| Deal couldn't be closed from the modal | `StageRibbon` hides `Closed*` stages; no other control existed | Won/Lost outcome buttons + closed band + Reopen in `OpportunityModal` (downstream already keyed on the stage names) |
| LostReasonModal actions unreachable | Fixed-height `overflow:hidden` clipped Save/Skip off-screen | Flex column: pinned footer + scroll body; added ×/Esc close |
| TimeDropdown opened invisibly / flashed shut | Portal z-index below the rail (400 vs 11003); mousedown-race in draggable rail | z-index 12000; toggle on mousedown + `justOpenedRef` guard (see §16) |
| Manager could wipe all users (`users?clear=true`) | Method-level gate was `ADMIN_ROLES=['Admin','Manager']`; no branch gate/audit | `requireRole(auth,['Admin'])` + `writeAudit('user.cleared')` + count on the clear branch |
| Branch drift: dev behind master | Late-session commits landed via master merges; dev tip stale, missing the users.mjs gate | Reset dev to master (`reset --hard origin/master` + `--force-with-lease`); keep strict dev→master flow |

---

## 18b. Validation Before Delivery

**Babel is stricter than the build.** `DispatchSkillsDetail.jsx` shipped to production with malformed JSX — two missing ternary heads — that `@babel/parser` rejects but Vite/esbuild happily builds (esbuild tolerates a stray `}` in JSX text where Babel errors). The only symptom was `) : (` and `)}` rendering as literal text on the page.

- Run `@babel/parser` with the `jsx` plugin over **every** file before delivery, and ideally across all of `src/` in CI — not just files under edit.
- A green `npm run build` does **not** mean the JSX is well-formed.

**Always check `res.ok` before parsing a response.** A 500 or 403 that parses to `{ error }` and falls through `|| []` renders as "no data yet" — making an endpoint failure indistinguishable from an empty table. This bit the dispatch load, and the settings panels still swallow save failures in a bare `catch(e) { console.error(...) }` that clears the dirty flag either way.

**A write to a key the server does not whitelist fails silently.** `PUT /settings { users: [...] }` was discarded for a full release because `settings.mjs` has no `users` key — users live in their own table. Confirm the field is in the server's whitelist before assuming a save works.

---

## 18b0. Hook Declaration Order (hard rule)

**Babel-validating a file proves it PARSES. It does not prove it RUNS. `vite build` succeeding does not either.** A temporal-dead-zone read is legal syntax and a runtime error, so rollup emits it happily. Both gates passed on code that killed the whole Dispatch tab in production.

**A `useMemo` / `useCallback` dependency array, and any plain expression initializer, evaluates during render.** Every `const` it closes over must be declared **above** it in the same scope:

```jsx
// WRONG — visitQueue evaluates now; servicePlans is declared 50 lines below
const visitQueue = useMemo(() => build(customers, servicePlans, jobs), [customers, servicePlans, jobs]);
...
const [servicePlans, setServicePlans] = useState([]);
```

Symptom in production: `ReferenceError: Cannot access 'Ve' before initialization`, where `Ve` is the minified name of the state variable, and the component never mounts. **Dev does not reproduce it** — Vite's unminified dev bundle does not reorder, so the tab works locally and dies on deploy.

The safe placement is immediately after the last dependency. When adding a block of derived state, put it below every `useState` and derived `const` it touches, and leave a comment saying so — the next edit will otherwise move it back up next to related code.

### Hoisting a component strands its closure reads

Moving a sub-component to module scope is the CORRECT fix for remount-on-keystroke (§16). But everything it read from the parent's scope must become a **prop**. Twice in one session a hoisted component kept reading parent variables — `linkedAccount`, `save`, `copyFromAccount` (which existed nowhere at all), and `sel`/`inp` in `AutomationsDetail` — and each threw `X is not defined` the moment it rendered. Babel parses it. `vite build` succeeds. Only the render fails.

`scripts/check-tdz.mjs` now detects this class as well as ordering. **Run it after every hoist.**

**Run the check before delivering any file with new hooks:**

```bash
node scripts/check-tdz.mjs src/Tabs/DispatchTab.jsx
```

It walks each function body plus module scope, finds initializers that evaluate at render time (deferred arrow bodies are skipped) and flags identifiers declared later in the same scope. This has now been hit twice; it is a script rather than a rule for that reason.

Related: `Cannot access 'X' before initialization` is *equally often* a **circular import** in the bundle. If the scan comes back clean, check the import graph before assuming the error is elsewhere.

---

## 18a9. Changing a Field Allowlist Is a Write-Path Change (hard rule)

Removing a field from `ALLOWED_FIELDS` (or `sanitize`) looks like a read concern. It is not. **Trace every path that WRITES the column** before removing it — and remember that **an upsert counts as an insert**:

```js
.insert(quotes).values({ ...payload, createdAt })   // <- NOT NULL checked HERE
.onConflictDoUpdate({ target: quotes.id, set: payload })
```

Postgres validates NOT NULL while building the tuple, **before `ON CONFLICT` can divert to the update**. So omitting a NOT NULL column fails the statement *even when the row already exists*. This broke every quote save in production — line items, status changes, everything — while Babel and `vite build` both passed.

The pattern for a server-assigned immutable field:

```js
const [existing] = await db.select({ n: quotes.quoteNumber })
    .from(quotes).where(and(eq(quotes.id, id), eq(quotes.orgId, orgId))).limit(1);
const quoteNumber = existing?.n || await issueNew(orgId);

await db.insert(quotes)
    .values({ ...payload, quoteNumber })            // insert half NEEDS it
    .onConflictDoUpdate({ target: quotes.id, set: payload });  // update half must NOT
```

**A client-supplied value for such a field is a REFERENCE TO VERIFY, never a value to store.** Look the row up and reuse what is there; anything unverifiable gets a freshly issued value.

---

## 18a10. A Failing Save Must Not Return Null

`handleSaveQuote` returned `null` on failure instead of throwing. The caller awaited it, ignored the result, and the editor closed as though the save had succeeded — a rejected write with no error visible anywhere.

**If a function can fail, make failure impossible to ignore**: throw, or have every caller check. A silent failure is worse than a loud one, and this codebase's own rule already says so — *controls that appear to work but are doing nothing*.

---

## 18a11. `setDirty(false)` Belongs INSIDE the `try` (hard rule)

The worst save shape in this codebase, found in four settings panels:

```js
try { await dbFetch('/.netlify/functions/settings', {...}); }
catch (e) { console.error('save x', e); }      // dbFetch never throws on 4xx anyway
setDirty(false);                                // runs regardless — reports success
```

Two failures compounding. `dbFetch` resolves for any status (§18b1), so a 403 never reaches the catch; and the flag clears whether or not the write landed. The user sees a saved panel and loses the change.

**The rule:** clear the dirty flag only on the success path, and only after a checked response.

```js
try {
    await putSettings(payload);   // throws on non-2xx
    setSaveError('');
    setDirty(false);              // success path ONLY
} catch (e) {
    setSaveError(e.message);
    setSaving(false);             // BEFORE the rethrow — the setSaving after the
    throw e;                      // try/catch is skipped by it
}
setSaving(false);
```

**A `catch` whose only body is `console.error` is never sufficient for a write.** If it can fail, the user must be able to see that it failed.

**Use `putSettings` (`settings/shared/saveSettings.js`), never a bare `dbFetch` PUT.** It exists specifically to check the response and throw a readable error. It was written for this bug class and four panels still had not adopted it a year later — when you introduce a helper for a known bug, audit every site of that class in the same change.

---

## 18b1. `dbFetch` Does Not Throw (hard rule)

**`dbFetch` resolves its promise for every response, including 4xx and 5xx.** A `try/catch` around it therefore catches network failures only — a 403 lands in the success path.

```js
// WRONG — a 403 never reaches the catch, and dirty is cleared regardless
try { await dbFetch('/.netlify/functions/settings', {...}); }
catch (e) { console.error('save', e); }
setSaving(false); setDirty(false);

// RIGHT — check res.ok, surface the message, keep the panel dirty on failure
try {
    await putSettings({ industries });   // throws on non-2xx
    setSaveError(''); setDirty(false);
} catch (e) {
    setSaveError(e.message);             // change is NOT saved — stay dirty
}
setSaving(false);
```

- Settings panels use **`putSettings()`** from `settings/shared/saveSettings.js`, and surface the message through `CategoryDetailChrome`'s `error` prop.
- Everywhere else use **`dbWrite()`** from `src/utils/storage.js`. It returns
  `{ ok, status, error }` and **never throws**, so a caller can roll back optimistic
  state in one place without a try/catch around every call. It also surfaces the
  `requestId` from `serverErrorBody`, which is what makes the Netlify function log
  line findable — the CSV import modal used to receive that id and discard it,
  leaving "Internal server error" with no way to trace it.
- **`.catch(console.error)` on a `dbFetch` write is always wrong.** It fires only on
  a network failure. Five such sites were live in the hooks; the worst wrote a deal
  to Closed Lost, called `addAudit()` unconditionally, and on a rejected save left
  the pipeline showing Closed Lost, **the audit log asserting it**, and the row in
  the database still open.
- Never clear a dirty flag outside the success path. A panel that clears it on failure tells the user the change was saved when it was not.
- This is the same failure as rendering a 500 as "no data yet" (§18b): an error path that looks identical to the happy path.

---

## 18b2. Patch Verification (hard rule)

**Re-read the file after every edit — not only after a reported failure.**

A patch script printed `ok` for two edits and then aborted on a third *before writing the file*. Both "successful" edits were silently lost. One of them (removing a duplicated view toggle) was later mis-diagnosed as a different bug entirely — "a second toggle the earlier patch missed" — when in fact the only toggle had never been removed.

- Scripts that apply several edits must write once at the end **and** be followed by a `grep` confirming the expected strings are present or absent in the file on disk.
- A tool reporting success is not evidence the file changed. The file is.
- The same applies to delivery: Babel-validating a file proves it parses, not that the intended edit is in it.

---

## 18c. Schema Change Ordering (hard rule)

**Additive columns are only safe in one direction: database first, then code.**

Drizzle's `db.select()` with no projection expands to an explicit column list built from `schema.ts`. So a column declared in `schema.ts` but missing from the database makes **every read of that table** fail with `column "x" does not exist` — a 500 on every GET, not a graceful degradation.

| Order | Result |
|---|---|
| DB column added, code not yet deployed | **Safe.** Nothing reads it. |
| `schema.ts` deployed, DB column missing | **Outage.** Every read of that table 500s. |

- Run the `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` first, verify, then deploy.
- This is also why dev and production sharing one Neon branch is tolerable: production gets nullable columns before production code reads them.
- Symptom to recognise: a single endpoint 500ing immediately after a deploy that added a column. Check the DB before debugging the code.

---

### Auto-select must never re-point while an editor is open

An effect that keeps a detail pane populated — "if nothing valid is selected, select the first row" — becomes destructive once the list it reads is **filtered**. Changing a facet drops the row being edited out of the list, the effect re-points the selection, and a second effect loads the new row over the in-progress edit. The user changed a filter and their form silently became someone else's record.

Guard on both *creating* and *editing*. Related: a `startNew` that clears the selected id will trip any effect keyed on that id — guard those on `draft._isNew` too, or "+ New" renders nothing at all.

### Model dependency arrays when reasoning about effects

A state model that runs effects after every transition will report failures React would never produce, because real effects only re-run when their deps change. When auditing a component by transcribing its state, transcribe the dep arrays too — otherwise the audit sends you rewriting correct code.

### Comparing a draft to its record

Compare **field-by-field, never by JSON string**. Drafts carry UI-only keys (`_isNew`) and records carry server keys (`updatedAt`), so a whole-object compare marks every open form as dirty. Treat `null` and `''` as equal, compare arrays by value, and let a brand-new form with only defaults filled count as clean.

### One guard function, not per-call-site confirms

Route every path that abandons a draft — switching rows, "+ New", Cancel — through a single `guarded(action)`. A confirm bolted onto each call site is how one path ends up missing it.

### Enumerate what a checker does NOT cover

`check-tdz.mjs` inspected only `const X = () => …` arrow components, so every file whose component is `export default function X()` — `HomeTab` among them — had **never been scanned**. The output said "0 issues" and meant "0 issues in the subset I look at". Widening it to function declarations found four crash bugs immediately.

When adding or extending a static check, write down the syntax forms it skips. A partial checker is useful; a partial checker believed to be complete is a liability.

Corollary from repeated experience: **every widening of this scanner has found real bugs, and every widening has also needed a correction first** — property keys, optional member expressions, nested scope, concise arrow bodies, missing browser globals. Verify against a known-good file before acting on new output.

### A new diagnostic is guilty until proven innocent

The first version of the TDZ scanner counted object property keys as variable references — `{ equipCategories: [] }` inside a form-state object read as a use of `equipCategories` — and confidently pointed at innocent code in the previous commit. **Before acting on a new checker's output, run it against a case where you already know the answer.** A tool that cries wolf sends you rewriting working code.

### Migrations an admin can run: make them idempotent

When data has to move between stores, prefer a **visible button in the UI** over a script run against live data. That is only safe if re-running is harmless, so **derive the new row ids from the source ids** and rely on the upsert-on-id POST. The import then states what it will create, deletes nothing, and cannot duplicate on a second click.

**Do not migrate against an asynchronously-loaded vocabulary before it arrives.** Gate the migration on the fetch completing — running it against an empty list files every value as unmatched and then persists that on the next save.

---

## 18d. Multi-Environment Gotchas

- **One database, two Clerk instances.** Dev and production share the Neon `main` branch but run **separate Clerk instances**, so org IDs differ. Data seeded under one org is correctly invisible to the other. Before concluding a feature is broken, confirm the caller's org — Clerk puts it at `payload.o.id`:
  ```js
  window.__getClerkToken().then(t => console.log(JSON.parse(atob(t.split('.')[1])).o.id));
  ```
- **Additive-only schema changes are what make the shared DB safe.** Adding nullable columns via the Neon SQL editor covers both environments at once, so production gets columns before production code reads them. That is fine *only* because they are nullable and additive. Never run a destructive or non-null migration this way.
- Some dispatch board cards are `auto_<opportunityId>` placeholders synthesised client-side from Closed Won opportunities — not database rows, and not editable. An empty table can still look populated.

---

## 19. Deployment

### Gates -- run all five

```bash
npm run check:tdz      # reads before declaration
npm run check:inline   # components declared inline, used as a JSX element type
npm run check:dupes    # duplicate object keys / JSX attributes
npm run check:dbfetch  # discarded Response / Response read as JSON (18b1, 18b3)
npm run build          # vite build + the bundle guard (18b4)
```

**Use `npm run build`, not `npx vite build`** -- the latter bypasses the bundle
guard. `check:inline` should report **0 user-visible**.

All five, plus `node --test`, run in CI on every push and PR via the `gates` job in
`.github/workflows/test.yml`. Before that they ran only by hand, so anything pushed
without remembering them reached Netlify ungated.

`scan-dbfetch.mjs` was a diagnostic until its accuracy was proven; it is now the
fifth gate (18b6).

### Netlify

- **Deploy:** Git push to `main` branch → Netlify auto-deploys
- **Environment variables** (set in Netlify UI):
  - `VITE_CLERK_PUBLISHABLE_KEY`
  - `CLERK_SECRET_KEY`
  - `NEON_DATABASE_URL` (auto-injected by Netlify Neon integration)
  - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`
  - `RESEND_API_KEY`
- **DB migrations:** `drizzle-kit push` (not `migrate`) — schema changes are pushed directly
- The `netlify.toml` configures redirects so all routes serve `index.html` (SPA routing)

---

## 20. Settings Module Architecture

`SettingsTab.jsx` is a **43-line shell** that gates on role and renders `AdminView` (admins) or `PersonalView`. Both live at `src/Tabs/`; all panels live under `src/Tabs/settings/<category>/`.

```
SettingsTab.jsx  (shell, role gate)
   ├── AdminView.jsx       — router: id → panel; imports ~40 panels; V2Card grid
   └── PersonalView.jsx    — Personal* panels
settings/
   ├── catalogue.js        — SETTINGS_ITEMS (cards) + WORKSPACE_TABS_BASE
   ├── shared/             — tokens.js (T), ui.jsx, form.jsx (CSectionCard…), CategoryDetailChrome.jsx
   └── company/ salesProcess/ quoting/ people/ integrations/ security/ audit/ data/ dispatch/
```

**Shared detail chrome:** every detail panel wraps its body in `CategoryDetailChrome` (`settings/shared/`, formerly `SPDetailPageChrome`) with props `crumb`, `category`, `title`, `subtitle`, `onBack`, `dirty`, `onCancel`, `primaryAction`, `primaryLabel`, and optional `rightActions`.

**Import paths from inside a panel** (`settings/<category>/Panel.jsx`):
- shared: `../shared/tokens.js`, `../shared/form.jsx`, `../shared/CategoryDetailChrome.jsx`
- context/util: `../../../AppContext`, `../../../utils/storage`
- sibling panel: `./OtherPanel.jsx`

### Adding a new settings panel (the full wiring chain)

1. **Panel file** under the right `settings/<category>/` folder. Read settings from the `settings` prop (or `useApp()`), edit local state, and **save via `dbFetch` PUT `/.netlify/functions/settings`** + `setSettings` (no local-only state).
2. **`catalogue.js`** — add a `SETTINGS_ITEMS` entry (`id`, `scope`, `category`, `name`, `desc`, …).
3. **`AdminView.jsx`** — `import` the panel, add it to the id-map, and add a route line (`if (id === 'my-panel') return <MyPanel settings=… setSettings=… onBack=… />`).
4. **`settings.mjs`** — add the new `settings.extra` key to **both** the GET defaults and the PUT read-then-merge block, or it silently resets.

`setSettings` is available from `useApp()`, so panels can pull it directly rather than threading it through `AdminView` (e.g. `RolesDetail`/`SsoDetail` do this).

---

## 21. Lead Scoring Architecture

Rule-based, **server-side, persisted**, predictive-upgradeable. Scores the **Leads-tab lead** (`scoredEntity: 'lead'`) on two independent axes, each 0–100, bucketed cold/warm/hot.

- **`netlify/functions/score-lead.mjs`** — pure engine, no DB: `computeFit(lead, cfg)`, `computeEngagement(lead, cfg, now, events?)`, `bucketOf(fit, eng, buckets)`, `evalRule(actual, op, expected)`, `scoreLead(lead, cfg)` → `{ leadScoreFit, leadScoreEngagement, leadScoreBucket, scoreBreakdown, score }`, plus `DEFAULT_LEAD_SCORING`.
  - **Fit** reads lead fields: `title` (seniority via `matchesAny`), `estimatedARR` (`gte` tiers), `source` (`in`).
  - **Engagement (v1)** = `status` rules + a `recency` rule that decays on `firstTouchDate || createdAt` (half-life). The `activities` table has **no `leadId`**, so there are no behavioral events yet — v1.5 adds `leadId` and feeds events through the reserved `op:'event'` branch.
  - Rule ops: `equals`, `notEquals`, `in`, `gte`, `lte`, `contains`, `matchesAny`, `exists` (+ `recency`, `event`).
- **Persistence:** `leads` table has `lead_score_fit`, `lead_score_engagement`, `lead_score_bucket`, `score_breakdown (jsonb)`, `score_updated_at`, plus indexes on `(org_id, bucket)` and `(org_id, fit)`. Legacy `score` is kept and set to `max(fit, engagement)`.
- **Compute paths:** write-triggered in `leads.mjs` POST/PUT (same upsert, no extra round-trip) **and** nightly batch `score-leads-batch.mjs` (`netlify.toml`: `schedule = "0 6 * * *"`) for recency decay + rule-change pickup.
- **Config:** `settings.extra.leadScoring` (enabled, fit.rules, engagement.rules, buckets, predictive). Edited in **Settings → Sales process → Lead scoring** (`LeadScoringDetail.jsx`).
- **Display:** `LeadsTab` reads the stored columns and renders a bucket-colored Fit/Eng chip + a click "why this score" breakdown popover. Falls back to legacy `score` if unscored.
- **Phase 2 (future, license-gated):** per-org logistic regression once closed-deal volume is sufficient; source-disposition learning (won-conversion rate per source). `predictive` block already stubbed in the config.

---

---

## 18b3. A `Response` Is Not JSON (hard rule)

Distinct from 18b1, and **not caught by any scanner**. 18b1 is about a discarded
Response. This is about a Response that IS captured and then read as if it were
the parsed body:

```js
// WRONG — shipped in the SPIFF claim submit
const result = await dbFetch(url, { method: 'POST', body });
setClaims(prev => [...prev, result.spiffClaim || newClaim]);
```

`result` is a `Response`. `result.spiffClaim` is **always** `undefined`, so the
fallback ran on success too — and with no `res.ok` check, a 403 was
indistinguishable from a save.

```js
// RIGHT
const res = await dbFetch(url, { method: 'POST', body });
let payload = null;
try { payload = await res.json(); } catch { /* empty body */ }
if (!res.ok) { setError(payload?.error || `Failed (${res.status}).`); return; }
setClaims(prev => [...prev, payload?.spiffClaim || newClaim]);
```

**Never write an "optimistic fallback" in a catch block that applies the change
anyway.** That converts a failure into a silent lie.

---

## 18b4. A Green Build Can Contain No Application (hard rule)

`npx vite build` without `VITE_CLERK_PUBLISHABLE_KEY` exits 0, logs
`OK built in Ns`, and emits a bundle **with no app in it**.

`main.jsx` throws when the key is missing. Vite inlines the absent env var as
statically false, so Rollup marks everything after the `throw` unreachable and
tree-shakes `createRoot(...).render(<App/>)` away.

Measured on `dev` @ 63058cb:

| | JS emitted | Exit code |
|---|---|---|
| with the key | 2,505,905 B | 0 |
| without | 212,639 B | 0 |

**Nothing incidental catches it:**
- exit code is 0 either way
- `index.html` differs only by the entry chunk's content hash
- **the CSS asset is byte-identical** -- same content hash -- because
  `import './index.css'` sits above the `throw`. So "assets were emitted" and
  "CSS is present" both pass on a hollow build.
- `index.html` ships static crawler-readable marketing copy inside `#root`, so a
  hollow deploy renders a plausible landing page rather than a white screen.

### There is now a guard. Use `npm run build`.

```bash
npm run build     # vite build && node scripts/check-bundle.mjs
```

**`npx vite build` bypasses the guard entirely.** The guard is chained into the
npm script, and `netlify.toml` runs `npm run build`, so a hollow bundle now fails
the deploy and Netlify keeps the last good one.

`scripts/check-bundle.mjs` asserts markers first, size last. String literals
survive minification, so a needle from deep in the graph (`/.netlify/functions/`,
`Bearer `) is present iff that graph was bundled. Size is only a backstop and it
churns the moment anyone code-splits. It also asserts the bootstrap-abort string
is *absent*, which names the root cause instead of reporting "bundle too small".

### This is unreproducible locally by construction

The local `.env` guarantees a real build on this machine. Netlify has no `.env`,
only the site's environment-variable UI. The failure can therefore only occur in
the one environment nobody was watching -- which is why the guard belongs in
`npm run build` rather than staying a manual step.

To see it fail on demand:

```bash
mv .env .env.bak && rm -rf dist && npm run build ; mv .env.bak .env
```

The `;` before the restore matters -- it runs even though the build fails. Expect
`BUILD GUARD FAILED - 5 problem(s)` with the abort marker listed first. Clean up
with `rm -rf dist` so `netlify dev` is never handed a hollow bundle.

Corollary, unchanged: **"the build passed" is not evidence a file compiles**
unless you have confirmed the file is actually in the bundle.

---

## 18b5. Scanner Dependencies Must Be Declared

`check:tdz`, `check:inline` and `check:dupes` all import `@babel/parser`. It was in **neither**
`dependencies` nor `devDependencies` and resolved only transitively through
`@vitejs/plugin-react → @babel/core`. A plugin bump could have broken both gates
silently, mid-deploy. It is now explicit.

Note the majors diverge: the gates parse with `@babel/parser` 8.x while Vite
compiles with `@babel/core` 7.x. Verified byte-identical scanner output across
both. Pin to `^7.29.0` if you want the gate reading exactly what the build
compiles.

---

## 18b6. A Diagnostic Must Fail Loudly on a File It Cannot Read

`check-tdz` prints `PARSE FAIL <file>`; `check-inline` throws outright. Neither
silently skips. **Any new scanner must match that bar** — a `catch { continue; }`
means a file quietly drops out of coverage, which is exactly how four crashes
stayed hidden in files "the scanner had not been covering".

And verify a new diagnostic against a case whose answer you already know before
acting on its output. The first `dbFetch` scanner reported 78 findings, and its
false-positive rate turned out to be far worse than first recorded: **59% on the
hooks — 10 of 17**. It peeled `.then(r => { if (!r.ok) … })` off to find the
`dbFetch` underneath and called the Response discarded. Acting on that list
unreviewed would have meant rewriting the working data-loading layer.

**RESOLVED.** `scan-dbfetch.mjs` now reads the callbacks instead of unwrapping
past them, all 78 original sites are closed, and its behaviour is pinned by
fixtures in `tests/scanners.test.mjs`. It is a gate: **`npm run check:dbfetch`**,
exit non-zero on any finding, wired into CI.

Deliberate fire-and-forget opts out at the call site, so exceptions are explicit
and reviewable rather than permanent noise in the report:

```js
// dbfetch-ignore: an SMS notification must never block or fail the save
dbFetch('/.netlify/functions/mention-sms', { … });
```

Three sites qualify and no more should without discussion: `addAudit` (mirrors the
server's `writeAudit`, best-effort by design so an audit failure cannot roll back
the operation it records) and the two `fireMentionSms` calls.

The scanner also reports a second class now — **a Response read as if it were
JSON** (18b3). That found `ReportsTab`'s saved-reports list, which called
`.then(data => data?.reports)` on a Response with no `.json()` in the chain: always
undefined, so the list had never loaded.

The general lesson stands even though this instance is closed: a diagnostic's
accuracy is a claim to be tested, not assumed. The original scanner could not even
be pointed at a file — it ignored its arguments and always walked `src/` — which is
why a 59% error rate went unmeasured for two sessions.

---

## 18b7. Wiring Is Not a Feature

The SPIFF claim modal had complete state plumbing — `useModalState` → `App.jsx` →
`appContextValue` → destructured by three components — and **no code path that
opened it**. `setSpiffClaimContext` was never called; both `setShowSpiffClaimModal`
calls passed `false`.

Before building on top of an existing feature, grep for the call site that
*starts* it, not just the state that supports it:

```bash
grep -rn "setShowSomeModal(" src/ --include=*.jsx   # any call with `true`?
```

A comment describing UI (e.g. the `[⋯]` column in `PipelineTab.jsx:613`) is not
evidence the UI exists.

---

## 18b8. Bulk Writes Must Chunk (hard rule)

Both extremes are wrong, and this codebase shipped both at once.

**One statement per row** overruns Netlify's 10s function timeout. At ~30ms per
Neon HTTP round-trip, 200 rows is ~6s server-side before any client overhead.

**One statement for all rows** breaks the Postgres ceiling of **65,535 bind
parameters per statement**. Drizzle binds one per column per row, and it projects
the full column list (see 18c):

| Table | Columns | Max rows per INSERT |
|---|---|---|
| `accounts` | 35 | 1,872 |
| `contacts` | 37 | 1,771 |
| `opportunities` | 37 | 1,771 |

Above that the statement fails outright -- and because it is one statement, one bad
row kills the whole batch with no per-row isolation.

**Use `bulkUpsert` for updates and `bulkInsert` for inserts.** Both chunk at 400
rows: 400 x ~37 = ~14,800 parameters, leaving room for the schema to roughly
quadruple before it needs revisiting.

### The INSERT half was fixed a session later than the UPDATE half

`bulkUpsert` landed for PUT while POST stayed a single statement for every row --
in **three** endpoints, not the two the handoff named (`opportunities.mjs` was
missed by the audit). Fix both halves at once, or the one left behind reads as
covered.

`bulkInsert` lives in `netlify/functions/_bulk.mjs`, NOT `_lib.mjs`, and takes an
injected `client`. `_lib.mjs` imports `../../db/index.js`, which is TypeScript, so
anything defined there loads only under `tsx` -- `npm run test:int`, which needs a
real database and does not run in the gates job. **Chunk size, bisection depth and
the deadline are all properties of the traffic, invisible in the return value:** a
single statement and four chunked ones produce an identical response. If they
cannot be asserted in CI they are not enforced.

### Isolate by bisection, never row by row

A failed chunk is split in half and each half retried, recursing to a single row.
One bad row in 400 costs ~9 extra statements instead of 400 -- and 400 round-trips
at ~30ms is 12s against a 10s function timeout, so the "safe" fallback would itself
have been the outage.

Every path is bounded by a wall-clock budget (7.5s, leaving headroom under the 10s
kill). Whatever landed is reported, and the remainder comes back as
failed-not-attempted. **A truthful partial result beats a 502 that says nothing
about what was written.**

### `onConflictDoNothing()` on a fresh UUID is decoration

All three endpoints carried it with a comment claiming it "skips duplicates instead
of erroring". The only unique constraint is the `id` primary key and every id is a
fresh `crypto.randomUUID()` from the client, so it **could never fire**. It was
removed rather than replaced: name-based dedupe at insert time would fight the
smart-merge tooling that already owns that decision, and a clause that cannot fire
is worse than none -- it reads as protection that was never there.

### Return `insertedIds`, not just a count

The client needs to know WHICH rows landed, not how many. With ids it applies state
from the server's answer after the write; with a count it can only guess, and on a
partial failure it cannot know what to roll back. See 18b15.

### A multi-row upsert needs `excluded.<col>`

```js
// WRONG -- every row in the chunk gets the FIRST row's values
.onConflictDoUpdate({ target: t.id, set: { ...row } })

// RIGHT -- each row updates with its own values
const set = Object.fromEntries(
    cols.map(k => [k, sql`excluded.${sql.identifier(t[k].name)}`])
);
set.updatedAt = sql`now()`;
```

### Safety properties, all of which must hold

- ids are filtered against rows that already exist **in this org**, so the insert
  half can never create a record. PUT stays strictly an update, matching the
  single-record 404-on-unknown-id contract.
- `setWhere` pins `org_id`, so another tenant's id is not updated even if guessed.
- ownership is resolved once for the batch, not per row.
- `id`, `orgId` and `createdAt` are never in the `set` clause.

Verify SQL generation with `.toSQL()` before trusting a new bulk path -- it proves
the `excluded` refs and the org guard without touching a database:

```js
const { sql: text, params } = q.toSQL();
// assert: excluded refs not literals, org guard present, id/orgId not overwritten
```

That proves generation, **not execution**. Run it against dev with five rows and
confirm the values actually changed after a hard refresh before pointing it at
1,500.

---

## 18b9. A Key Written Twice Renders as Nothing (hard rule)

```jsx
// the first value is DEAD -- the last wins
<div style={{ fontWeight: 700, fontStyle: 'italic', fontWeight: 300 }}>

// React does NOT merge style objects -- priBtn is discarded ENTIRELY
<button style={priBtn} style={{ display: 'flex' }}>
```

Nine of these were live. Four were duplicate `style` attributes on buttons in
`CsvImportModal`, which therefore rendered as raw unstyled browser buttons -- both
primary CTAs and both bulk actions in the CSV import flow.

esbuild warns on every one of these on every build. Nobody saw them: they scroll
past above a 2,500 kB build summary and the build exits 0.

**`npm run check:dupes`** (`scripts/check-dupes.mjs`) is now a gate. Unlike the
`dbFetch` scanner (18b6), this class has no judgement call in it -- a key written
twice is either a bug or dead code, with no third reading -- so it gates
immediately rather than needing hand-triage first. Computed keys, spreads and
ternaries are excluded, so conditional-styling patterns do not collide with it.

**When fixing, delete the dead value and keep the winner.** The winner is what has
actually been rendering and has been visually accepted; switching to the dead value
smuggles a visual change into a cleanup commit. Verify the winner independently
against the convention elsewhere in the codebase before assuming it.

Exception: when the discarded half is a base style object (the `priBtn` case), the
current behaviour *is* the bug -- merge with a spread instead.

---

## 18b10. Mutation-Test Every New Test (hard rule)

A test that has never failed is not evidence. Break the thing it is supposed to
catch and confirm it fails, before believing a passing result.

This caught two real defects in one session:

- **In the implementation.** The auto-mapper's implicit key alias overrode a
  deliberate weighted alias, so `"Title"` and `"Job Title"` tied and the winner
  fell back to column order -- reintroducing the exact bug being fixed.
- **In the test.** The "one header is never claimed by two fields" assertion passed
  with the one-to-one constraint *deleted*, because no two fields competed for a
  header in that fixture. It was replaced with a case that creates a real collision.

The second is the important one. A toothless test is worse than no test, because it
reports safety that does not exist.

```
one-to-one removed        -> 1 fail
deny rules removed        -> 2 fails
alias precedence removed  -> 4 fails
score ranking removed     -> 3 fails
restored                  -> 13 pass
```

---

## 18b11. A Gate Is Not Infrastructure (hard rule)

The scanners are ordinary code with ordinary bugs. **A green result from a scanner
with a blind spot is worse than no scanner** — it converts "unknown" into
"verified", and the thing it failed to see stops being looked for.

Three of the four had a false-negative class, and every one was found by a bug
reaching production first. Never by reading the scanner.

| Gate | Blind spot | What shipped |
|---|---|---|
| `check-tdz` | `/^[A-Z_]+$/` treated `T` as an imported SCREAMING_CASE constant | `EntitySelector` read `T` from a scope it lost on hoist; whole Reports tab down. Gate printed "No render-time TDZ issues in 135 file(s)". |
| `check-inline` | `riskOf()` inspects only a component's own body, so a wrapper rendering `{children}` scored harmless | `FL` remounted the caller's `<input>`; focus lost per keystroke, and the escaped keypress opened the New Task rail. Gate reported 0 user-visible. |
| `scan-dbfetch` | peels `.then(r => { if (!r.ok) … })` off to find the `dbFetch` underneath | 59% false positives in the hooks — 10 of 17. Acting on it unreviewed would have rewritten a working data layer. **Fixed and promoted to a gate; see 18b6.** |

### The rules

**Every gate needs a fixture it must catch and a fixture it must ignore.**
`tests/scanners.test.mjs` runs each scanner against `tests/fixtures/scanners/`.
Each fixture is a real bug that shipped, and carries a comment saying which. A
`-safe` / `-clean` fixture is the false-POSITIVE guard: the scanner must stay
quiet on it, because a gate that cries wolf stops being run (18b6).

The suite fails if a `check:` script exists in `package.json` with no fixture —
a new scanner without one is a gate nobody has proven.

**Mutation-test the scanner when you change it.** Break the rule you just added
and confirm the fixture suite fails. This is not optional and it is not the same
as running the scanner on real code: real code may simply not contain the case.
Both defects below were caught this way and neither would have been caught by
review:

- an implementation defect — an implicit alias overrode a deliberate weighted one,
  so two candidates tied and the winner fell back to source order, reintroducing
  the exact bug being fixed;
- a **test** defect — a uniqueness assertion passed with the constraint it tested
  deleted, because no two fields competed in that fixture. A toothless test is
  worse than no test: it reports safety that does not exist.

**Fixtures live under `tests/`, never `src/`.** They contain deliberate bugs. All
three source scanners default to `walk('src')`, so fixtures are outside their path
— keep it that way, or the gates will fail on their own test data.

**A passing scan is not evidence a component runs.** `check-tdz` passed on the
ReportsTab crash. What proved the fix was mounting `EntitySelector` under jsdom and
rendering it — reverted, it threw `ReferenceError: T is not defined`; applied, it
rendered. For anything involving a write, mount with the real `AppProvider` and
confirm a 403 surfaces instead of reporting success.

---

## 18b12. A `settings.extra` Key Must Exist in BOTH Halves (hard rule)

`settings.mjs` PUT rebuilds `extra` from an explicit whitelist. **A key that is not
in that list is dropped and the endpoint still returns 200.** The GET has its own
separate list, so a key can also be stored and never read back.

This has now shipped **four times**, in three separate features:

| Keys | Panel | Symptom |
|---|---|---|
| `streamingDestinations`, `streamingGlobals` | Audit log streaming | add / remove / pause / globals all appeared to work, reverted on reload |
| `connectedApps`, `slackConfig` | Connected Apps | full round-trip — written AND read back — persisting nothing |
| `importPresets` | Import presets | "✓ Saved", stored nowhere, and nothing reads it even now |

**No client-side error handling can detect this.** The response is 200. `res.ok` is
true. `dbWrite` reports success. Every mitigation elsewhere in this guide is blind
to it, which is why it survived three separate code reviews and two remediation
passes over the same files.

### Rules

- Adding a `settings.extra` key means editing **both** the GET projection and the
  PUT whitelist in `netlify/functions/settings.mjs`. One without the other is a
  silent failure in one direction.
- The PUT uses `'key' in data ? … : existingExtra.key` semantics. Preserve that: a
  key sent is applied (including an explicit `''`, `[]` or `null`), a key omitted
  keeps its stored value. Never rebuild the whole object from a partial body.
- **Send only the key the panel owns.** `LeadConversionDetail` used to PUT the
  entire settings object, rewriting every unrelated key from its own possibly-stale
  copy — a lost update for anything changed elsewhere since load.
- Before trusting any settings panel, check the key both ways:

```bash
grep -n "yourKey:" netlify/functions/settings.mjs   # expect TWO hits, GET and PUT
```

- A key that is written but **never read** is not a feature. `importPresets` is
  whitelisted so the write lands, but nothing loads it and the write replaces the
  array rather than appending. Recorded as incomplete rather than treated as done.

---

## 18b13. A Partial PUT Must Not Replace the Row (hard rule)

`users.mjs` `sanitize()` rebuilds every top-level column and the entire `profile`
jsonb from the request body, and `upsertUser` writes it with `set: { ...updateData }`.
With no merge, **a partial payload does not update fields, it replaces the row.**

Five call sites were sending five fields to cascade a team or territory change:

```js
{ id, team, territory, vertical, teamId }
```

Running the real `sanitize()` on that payload produced `name: "Unnamed User"`,
`email: "<id>@placeholder.local"`, `quota: null`, and **31 of 35 profile fields
null** — wiping the user's real name, email, phone, email signature, notification
preferences and every quota figure. All five sat in `catch(e) {}` or a bare
`console.error`, so it had never reported anything. Same mechanism as the
`mobile`-wiped-on-save bug in §0A, with a far wider blast radius.

`mergeForUpdate()` now reads the stored row, flattens it with the existing
`flatten()`, and overlays the incoming body — exact field-present semantics, and
an explicit `''` still clears.

**The fix belongs in the endpoint, not the callers.** Fixing the five would have
left the next partial PUT doing the same thing. When an endpoint rebuilds a row
from its body, every caller inherits the hazard, so the merge goes once at the
bottom.

Check any endpoint that sanitizes-then-upserts for this shape before sending it a
partial payload.

---

### The gates do not bundle the Netlify functions

`npm run build` runs vite over `src/`. `netlify/functions/` is bundled separately
by esbuild AT DEPLOY TIME, so until `tests/function-imports.test.mjs` existed, no
gate ever resolved an import edge between two function files. A tree with all five
gates green and 165 passing tests failed its deploy on a missing re-export.

Anything that edits imports or exports under `netlify/functions/` must run
`npm test` — the graph check lives there, not in a `check:` script, because it
needs the parser and belongs with the other static guards.

For a larger change, bundle the affected functions the way Netlify will:

```bash
npx esbuild netlify/functions/<changed>.mjs --bundle --platform=node --format=esm \
  --external:drizzle-orm --external:@neondatabase/* --outdir=/tmp/fnbundle
```

**Deleting a span between two anchors is how this happened.** `export const
bulkInsert` sat between `BULK_IMMUTABLE` and `bulkUpsert` and went with the cut;
the replace meant to restore it matched text that had already been removed and
silently did nothing. A string replace that finds no match must be treated as a
failure, not a no-op — the patch scripts assert an exact occurrence count for
this reason (§18b2).

---

### An upsert's INSERT arm must satisfy every NOT NULL column

Narrowing a payload is only half the job. `INSERT ... ON CONFLICT DO UPDATE` is an
INSERT first -- Postgres forms the candidate tuple and checks its constraints
BEFORE resolving the conflict -- so a NOT NULL column with no database default
must be present even for a row that exists and will only be updated.

Omit one and the whole batch 500s with nothing written. `opportunities.pipelineId`
is exactly that column, and the first correct partial PUT killed every bulk
overwrite.

**Backfill from the stored row, never from a default.** `bulkUpsert` reads the
required columns in the same query that establishes existence and ownership, adds
them to the VALUES only, and keeps them out of the SET clause. Inventing a value
instead -- `pipelineId: data.pipelineId || 'default'` -- silently moves records.

Detection is generic, off Drizzle's `notNull` / `hasDefault`, so a NOT NULL column
added later is covered without anyone remembering this rule exists.

---

### Count the narrowing points before declaring a partial PUT fixed

A CSV overwrite passes through three places that each decide what "supplied"
means. All three must agree, and fixing one moves the bug rather than removing it:

| Step | File | Must |
|---|---|---|
| 1. map | `src/utils/csvMapping.js` | omit unmapped columns |
| 2. build | `src/utils/importRows.js` | add nothing the record does not carry |
| 3. narrow | `netlify/functions/_sanitize.mjs` | keep only supplied keys |

Step 2 is the one that hides. `buildOpp` built all thirteen columns
unconditionally while carrying a comment saying it sent only what the CSV
described, so steps 1 and 3 were both correct and both irrelevant.

**A builder with one shape for create and overwrite is the smell.** They are not
the same record: a create fills every column because the row does not exist; an
overwrite fills only what the file described because every other column already
holds a real value. `|| currentUser` and `parseFloat(x) || 0` are reasonable
defaults on a create and silent destruction on an overwrite.

---

### Unmapped is not empty

A partial PUT is only partial if the CLIENT sends a partial payload. Narrowing on
the server can omit what was never sent; it cannot un-send an empty string.

```js
// WRONG -- every field in the importer's list arrives looking supplied
record[field.key] = isMapped(colIdx) ? (row[colIdx] || '') : '';

// RIGHT -- unmapped says nothing; mapped says what it says, including empty
if (isMapped(colIdx)) record[field.key] = row[colIdx] || '';
```

A CSV with no Next Steps column sent `nextSteps: ''`, and the overwrite blanked
the field. The fields that survived the same import -- stage history, Team Notes,
linked contacts -- survived only because they are not in the importer's field list
at all.

**Two halves, and neither works alone.** `src/utils/csvMapping.js` decides what is
supplied; `netlify/functions/_sanitize.mjs` narrows to it. Each file's comment
points at the other, because fixing one and calling it done is precisely what
happened twice.

---

### `sanitize()` is a builder, not a filter

This rule was committed and then not applied to the file it was about, so it is
worth being blunt: every endpoint's `sanitize()` EXPANDS a payload into a full
row. It emits every column with a default -- `comments: data.comments || []`,
`pipelineId: data.pipelineId || 'default'`. Feeding it to `bulkUpsert`, which
derives its SET clause from the keys supplied, writes all of them.

```js
// WRONG -- a seven-column CSV overwrite writes forty columns
rows: data.map(d => sanitize(d)),

// RIGHT -- keep only what the payload actually supplied
rows: partialRows(data, sanitize),
```

`netlify/functions/_sanitize.mjs`. The narrowing is a UNION across the batch, so
every row in a chunk has the same shape and the multi-row INSERT has no
reconciliation question in it.

**A caller-side version of this fix does not work.** §0A0000.1 stopped `buildOpp`
sending the three array columns and `sanitize()` put them back; the overwrite went
on erasing stage history, Team Notes and linked contacts for another session, and
the dev check that would have caught it was the one deferred. If a payload is
partial, the endpoint is the only place that knows which columns were absent.

---

## 18b14. Assess an Advisory Against the Code, Not the Version Range

`npm audit` matches version ranges. It cannot tell whether the vulnerable *code
path* is reachable, so its severity is an upper bound, not an assessment.

The Clerk round makes the point in both directions.

**A critical that did not apply.** `GHSA-vqx2-fgx2-5wq9`, CVSS 9.1, flagged against
`@clerk/shared`. The actual flaw is `createRouteMatcher` in `@clerk/nextjs`,
`@clerk/nuxt` and `@clerk/astro` — none of which are installed. `@clerk/shared` is
flagged only because it hosts the code. Reachability: nil.

**A high the previous handoff missed.** `GHSA-w24r-5266-9c3c` is an authorization
bypass in Clerk's `has()` / `auth.protect()` when combining reverification with
role, permission, plan or feature checks. It was the one most worth checking here,
because it is specifically about *organization* checks and this app is org-scoped
throughout. It does not apply — but only because authorization is the homegrown
`requireRole()` over `verifyToken`, never Clerk's `has()`.

### The procedure

1. **Read the advisory, not the audit line.** `npm audit` gives you a package and a
   range. The advisory names the vulnerable *function*.
2. **Grep for that function.** Not for the package — for `createRouteMatcher`,
   `has(`, `auth.protect(`, `clerkFrontendApiProxy`. Confirm each hit is really the
   library's: the only `has()` here is a local
   `(v) => String(v ?? '').trim() !== ''` in two merge modals, which an
   assessment-by-name would have flagged as a false hit.
3. **Record WHY it does not apply, not that it does not.** "Not affected" ages into
   an unverifiable claim. "Not affected because authorization is `requireRole()`
   over `verifyToken`, never `has()`" stays checkable, and tells the next person
   what change would make it apply.
4. **Patch anyway when the patch is cheap.** Reachability today is not reachability
   after the next refactor.
5. **Never `npm audit fix --force`.** It resolves dev-tooling advisories by
   installing major versions — `vite@8` here. Plain `npm audit fix` cleared all
   three Clerk advisories with no `package.json` change at all; the existing carets
   already permitted the patched versions.

### After any auth-layer bump

Version ranges say nothing about runtime behaviour. Confirm the APIs the app
actually calls still resolve, and that the claim the tenant boundary depends on is
unchanged:

```js
// payload.o.id is how every org boundary is drawn.
// verifyToken calls decodeJwt and returns claims UNMODIFIED, so the shape comes
// from Clerk's server-side token format, not the SDK version — an SDK bump cannot
// change it. auth.mjs also falls back through org_id / active_organization_id.
```

Then test it by hand: sign in, switch orgs, confirm scoping holds, and confirm a
non-admin still receives 403s. No automated test covers the auth layer (Layer 3 E2E
is still blocked on automating Clerk login), so a manual pass is the only evidence
that exists.

---

## 18b15. Apply Local State From What Landed, Not Before the Write (hard rule)

```js
// WRONG -- the UI shows records that were never saved
setAccounts(prev => [...prev, ...rows]);
const r = await dbFetch(url, { method: 'POST', body: JSON.stringify(rows) });

// RIGHT -- the server says which ids landed; apply exactly those
const { landed, failed, error } = await postNew(url, rows);
if (landed.length > 0) setAccounts(prev => [...prev, ...landed]);
if (error) throw new Error(error);
if (failed.length > 0) throw new Error(`${failed.length} of ${rows.length} failed...`);
```

Every CSV import handler wrote state before the request and never rolled back, so
on a failure the on-screen count was wrong until a hard refresh.

**Rolling back is the obvious fix and the wrong one.** On a partial failure the
client cannot know which rows to remove. Have the server return `insertedIds` and
there is nothing to guess and nothing to undo.

The helper must **not throw from inside its own loop** -- an early chunk that
succeeded has to reach state before the failure is reported. `postNew` in
`ModalLayer.jsx` returns `{ landed, failed, error }` and never throws; the caller
commits `landed` first and raises second.

### Counts must not travel as prose

`CsvImportModal` recovers its Results figures by **regex-parsing the thrown error
message**:

```js
const isPartial = msg.includes('of') && msg.includes('failed to save');
const m = msg.match(/(\d+)\s+of\s+(\d+)/);
```

So the numbers a user sees depend on the wording of an error string in another
module. A message reading "2 of 3 new companies failed to save" on a 5-contact
import renders "1 of 5 records saved" -- both numbers wrong, in the reassuring
direction.

**Fixed.** `src/utils/importReceipt.js` is the structured value; handlers throw
`ImportError`, which carries a receipt, and `receiptFromError()` returns null for
anything else so a `TypeError` is never rendered as a counted partial failure.
Prose is generated FROM the numbers by `describeReceipt()` and never parsed back.

The never-throw rule above applies to the PUT half too. `saveBulk` threw from
inside its own loop and discarded the counts from chunks already written
server-side; `putBulk` in `src/utils/bulkClient.js` returns instead.

### Apply overwrite state from the ids the server accepted

`insertedIds` answers this for POST. For PUT the answer is `bulkUpsert`'s own
partition: the ids that took are `(sent - notFound - forbidden)`, and `putBulk`
returns them as `appliedIds`. A chunk whose derivation disagrees with the
server's `updated` count contributes NO ids and is reported as a discrepancy --
applying an ambiguous set is how the UI came to show records that were never
written, and a refresh is the honest answer.

### An overwrite is not a create

`buildOpp` produced one shape for both, ending in:

```js
stageHistory: [], comments: [], contactIds: [],
```

`bulkUpsert` derives its `SET` clause from the keys supplied, so an overwrite wrote
those empty arrays over real data -- **erasing stage history, comments and contact
links** that no CSV could ever carry.

It was inert only because the array PUT branch did not exist and every overwrite
400'd. Fixing the 400 turned a dead path into a destructive one. **When you make a
broken write path work, re-read what it writes** -- it has never been exercised, so
nothing about it has been proven.

Send only the columns the source actually describes and let the endpoint merge the
rest (18b13).

---

## 18b17. A Comment Is Not Evidence (hard rule)

Three comments were found in one session, each describing behaviour the code
beneath it did not have, each written by an earlier session, each claiming the
thing a reader would want to be true:

| Comment | Reality |
|---|---|
| `sanitize()` — read as a filter | a full-row BUILDER; expanded every payload |
| `_sanitize.mjs` — "a column not mapped never appears in any row" | false; `mapCsvRows` emitted `''` for unmapped |
| `buildOpp` — "sends only the columns the CSV actually describes" | built all thirteen unconditionally, ten lines below |

Each was believed, each shaped a fix, and each fix was correct where it was
written and useless where it mattered.

**Read the adjacent code. Do not assert its behaviour.** If a fix depends on what
another module does with the payload, open that module. A comment describing a
neighbour is a claim about something that can change without it.

And when you write one, write what the code does, not what the change was for.
The three above were all accurate as statements of INTENT.

### A test can encode the wrong rule, and mutation testing will not tell you

```js
// This shipped, passed, and was mutation-tested:
test('an unmapped field is present and empty, never undefined', () => {
    // "undefined and '' are not the same thing to a PUT that merges by
    //  supplied keys (18b13)."
    assert.equal(records[0].email, '');
});
```

Correct rule cited, opposite conclusion drawn. The importer then blanked every
field the file did not mention, and the test certified it.

Mutation testing proves a test NOTICES when the code stops matching it. It cannot
prove the test asserts the right thing. **Only running the feature does that** —
which is why every dev check in §0 is written as a user action with an expected
screen, and why a positive control belongs in every one of them.

---

## 18b16. A Row You Discard Must Be Reported (hard rule)

A filter that removes records before a write is a decision made on the user's
behalf. If nothing in the UI says it happened, the absence of the data is the only
evidence -- and the success screen actively argues against it.

```js
// WRONG -- returns records, discards the rest, says nothing
return rows.map(toRecord)
    .filter(r => required.some(f => r[f.key]?.trim()));

// RIGHT -- the discards come back too, and the caller must decide what to say
const { records, dropped, unmappedRequired } = mapCsvRows(rows, fields, mapping);
```

`getMappedData()` in `CsvImportModal` dropped every row missing all of its
required fields. An accounts CSV run through the CONTACTS importer maps neither
`firstName` nor `lastName`, so every row failed the filter: **six rows in, zero
out, a green tick and "Import Complete!"**. The count rendered was `total`, which
was `newRecords.length + overwriteCount` -- both zero, and zero renders quietly.

Three requirements, all of them learned from that screen:

1. **Report the cause, not the symptom.** A file where EVERY row drops is almost
   never 500 bad rows; it is a required field mapped to no column. Name the field.
2. **Report it at the step where it can still be fixed.** Preview, not Results.
   By Results the request has been sent and the mapping screen is two steps back.
3. **Do not change the rule while you are fixing the silence.** The filter is
   `.some`, not `.every`, so a mononym imports and the required marks mean "at
   least one of these". Tightening it is a product decision with an
   import-breaking blast radius. It is pinned by test, not quietly corrected.

The general form: **an empty result and a discarded result must not render the
same.** A count of zero is what both a clean no-op and a total failure look like.

## 18b18. Mutate Under The Condition That Could Hide It

§18b10 requires every new suite to be mutation-tested. This narrows it.

**A mutation must be run under at least two settings of any ambient value the
behaviour depends on** — clock, timezone, locale, batch size, row count, role.
Where no setting of that value can distinguish correct from incorrect output,
assert on SOURCE instead.

Three defects on 19 August 2026 shared one shape, and this rule is what would have
caught each of them earlier.

**Batch size.** `applyStageChanges` was correct per row and proven so. The defect
only existed when a batch contained both a row that moved stage and a row that did
not: the mover's derived keys entered the union and `sanitize()` supplied `null`
and `[]` for the others. Every existing fixture was single-row. The same deal
imported alone passed. *A single-row fixture cannot express a batch bug.*

**Timezone.** `isoLocal` replaces `toISOString().split('T')[0]`. At UTC those two
functions return identical strings — they are the same function there. A suite of
ten output assertions was green in five timezones and the reverting mutation
SURVIVED at UTC. A CI container on UTC would have run it green forever.

**Clock.** A second mutation, `todayLocal` bypassing `isoLocal`, survived when the
suite ran at midday and was caught in the evening. A test whose result depends on
the hour it runs is not a test.

**Line endings — the same rule applied to the harness itself.** Anchors in
`scripts/mutate-import.mjs` used `\n` against a CRLF tree. All eight multi-line
anchors silently never matched and their mutations never ran, while the docs
recorded 37/37. The harness reported coverage it did not have.

### What to do

1. Name the ambient values the behaviour depends on. Clock and timezone for
   anything date-shaped; batch size for anything that goes through `partialRows` or
   `bulkUpsert`; role for anything behind `requireRole`.
2. Run the mutation under at least two settings of each. For timezone, spawn a
   child with `TZ` set — Node fixes its zone at process start, so in-process
   manipulation does not work. Have the child report the zone it actually adopted
   and skip with a reason if the platform ignored `TZ`, rather than passing
   vacuously.
3. Where two implementations are provably identical under some setting, no output
   assertion can separate them there. Assert on source: "this module contains no
   `toISOString`" holds in every zone.
4. Cross-file dependencies get a source assertion too. `_stage.mjs` reads
   `prior.stageChangedDate`; no unit test of `_stage.mjs` can see whether
   `opportunities.mjs` selects that column. `tests/stage-batch.test.mjs` asserts it
   against the endpoint's source.

### The general form

A green suite is a claim about the conditions it ran under, not about the code. If
the suite has only ever run under one clock, one zone, one batch size or one role,
say so — an unstated condition is how "37/37 mutations caught" stayed in the docs
for a fortnight while eight of them had never executed.

---

## 18b19. Authorization Belongs In One Place, Resolved Against The Real Schema (hard rule)

Object-level authorization was hand-copied into every mutating branch:

```js
if (!canSeeAll(userRole)) {
    const [target] = await db.select({ owner: <table>.<someColumn> })…
    const callerName = await getCallerName(userId, orgId);   // orgId added 25 Aug, §18b20.3
    if (target?.owner && target.owner !== callerName) return 403;
}
```

Eleven copies across six endpoints. Eleven independent chances to name the wrong
column, and no single place to read to find out what the policy is.

> **Status, 26 Aug: zero copies remain.** Two were retired with this rule; the
> other nine (eight single-record checks plus two bulk `ownerColumn:` literals —
> the "nine" recorded in earlier docs was an undercount, verified by reading) went
> onto `assertOwnership()` / `ownerColumnOf()` in one pass. §18b21 is the guard
> that keeps them gone, because this rule on its own could not tell whether an
> endpoint was obeying it.

**Two of the eleven named a column that does not exist.** `contacts.createdBy` —
the contacts owner column is `assignedRep`. `activities.repName` — that table's is
`author`. Both are perfectly valid JavaScript. Drizzle resolves a missing property
to `undefined` rather than throwing, and **`undefined` then means two opposite
things depending on where it lands**:

| Caller | Effect |
|---|---|
| `db.select({ owner: undefined })` | throws → **500** |
| `bulkUpsert({ ownerColumn: undefined })` | `if (ownerColumn)` is false → the owner is never projected → `prior.owner` is undefined → **no row can be forbidden** |

So one typo produced hard errors on two paths and a **silent org-wide write
bypass** on a third. The failing-open one is the one that would have shipped.

### The rules

**1. One registry, one predicate.** Entity → owner column lives in
`netlify/functions/_ownership.mjs` and nowhere else. No endpoint names an owner
column directly. `assertOwnership()` in `_lib.mjs` is the only thing that queries
for one.

**2. Fail closed on the unknown.** An unregistered entity **throws**. It must
never fall through to "no rule, therefore allowed" — that is how a new entity
silently ships unprotected.

**3. A registered column is checked against the real table by `npm test`.**
`tests/ownership-registry.test.mjs` reads `db/schema.ts` and asserts every
registered property exists on its table. Source-level deliberately: the schema is
TypeScript and loads only under `tsx`, which would strand this check in
`test:int` — a suite that needs a database, is not in `npm test`, and had itself
been broken at import for long enough that nobody noticed. **The guard found the
second bad column on its first run, before the manual test that would have hit
it.**

**4. A resolver that can return `undefined` must throw instead.**
`ownerColumnOf(table, entity)` throws by name. The general rule: where a lookup
feeds an authorization decision, absence must be an error, never a value — because
a falsy value will be read as "no restriction" by the first caller that guards
with `if (x)`.

### The generalisation

**Any string that names a schema element — a column, an index, a JSON key in
`settings.extra` — is unchecked until something asserts it exists.** The type
system does not help; a wrong name is a valid expression. If the string decides
who may write, the assertion is not optional.

### How this class stayed invisible

Every unit test, every integration stub and every manual session authenticated as
**Admin**, which returns early from `canSeeAll` and skips the ownership branch
entirely. The rep path had never been executed by anything. **A role matrix over
the mutating endpoints is worth more than another gate** — see §0.24 and §0.26 in
ACCELEREP_CURRENT_STATE.md.

---

## 22. How to Work on This Codebase

### Where these docs live

**`sales-pipeline-v2/docs/` is authoritative.** Both `ACCELEREP_CODING_GUIDE.md`
and `ACCELEREP_CURRENT_STATE.md` are in the repo and are **updated in the same
commit as the work they describe** — not afterwards, not in a separate pass.

They used to live only in project knowledge, where no commit carried them and
nothing forced them forward with the code. That is structurally why they drifted,
and it cost time in two consecutive sessions: a handoff pointed at
`scripts/triage-dbfetch.mjs` (the file is `scan-dbfetch.mjs`), gave a gate command
that bypasses the bundle guard, claimed 24 blind writes in a file that has 4, and
the project-knowledge copies were missing five sections the live ones had.

Consequences to keep:

- **One copy.** If project knowledge also holds a copy, there are two sources of
  truth again — the exact problem this move fixed. Mirror from `docs/` or hold a
  pointer, never an independent edit.
- **Verify the repo, not the doc, before marking an item closed** (§0PP). A doc
  entry is a record of intent; the repo is the record of fact. SVR-2 was recorded
  fixed for a full session while the vulnerable code was live.
- `git add .` now sweeps doc edits into whatever commit is open. Stage them
  deliberately.

### Starting a new conversation

1. Upload this guide file first
2. Upload the specific file(s) related to the issue
3. Describe the bug or feature request

Claude should:
- **Always ask Jeff to upload the relevant files** rather than guessing at the code
- **Never ask Jeff to make manual edits** — always produce a complete updated file
- **Always view the file structure** before making changes to understand what exists
- **Deliver files for download** via the file output system
- When fixing bugs, search for the actual root cause rather than patching symptoms
- When adding features, follow the existing patterns exactly (sub-tab style, save handler pattern, etc.)
- When touching `ModalLayer.jsx`, be aware it is the single source of truth for all modal renders and import handlers
- When touching `useSettings.js`, never let users bleed into the settings save — always strip them
- When touching any Netlify function, always include `verifyAuth` and scope all DB queries to `orgId`


---

## 18b20. Identity Is A Value You Own, And Absence Is Never A Permission (hard rule)

Two defects this session were the same defect. Both were invisible for as long as
they existed, and both became reachable — not created — by a change elsewhere.

### 1. A primary key must never change

`users.id` held the Clerk userId, and an invited row carried a `pending_...`
placeholder that was **overwritten with the real Clerk id at acceptance**. So the
identity of a roster row changed at the exact moment that person started being
assigned work.

Worse: ownership columns across the CRM store the display NAME, and
`users-sync.mjs` refreshed that name from Clerk on every sync. An Admin pressing
"Sync from Clerk" renamed every row whose Clerk name differed by so much as a
middle initial — detaching every record those users owned, with no audit entry.
Their deals vanished from their own pipeline and the server refused their deletes
with a 403 that reads exactly like the gate working.

**The rule.** An identifier must be something the user cannot change and cannot
share. A display name is both. So:

- `users.id` is generated by us (`usr_<uuid>`), permanent, never reassigned.
- Clerk's id lives in `clerkUserId` — an attribute, like a phone number. Login
  providers get migrated and replaced; the database must not feel it.
- Uniqueness that scopes a tenant belongs on `(orgId, x)`, never on `x` alone.
  `users.email` carried a GLOBAL unique, so one address could exist in exactly
  one organization across every customer: the second org to invite a consultant
  was refused, and the message confirmed to them that the address existed
  somewhere else. A cross-tenant leak and a hard blocker from one keyword.
- Name sync is suspended while ownership is name-based. Drift is REPORTED
  (`nameDrift` in the sync response), never applied.

Ownership itself still keys on names. That migration is Phase 2+; until it lands,
**renaming a user detaches their records** and nothing in the code prevents it.

### 2. Absence must be an error or a refusal — never a permission

`bulkUpsert` encoded "Admin, skip the check" as `callerName === null`:

```js
// WRONG
if (callerName !== null && prior.owner && prior.owner !== callerName) { refuse }
```

But null is also what the caller lookup returns when it **cannot identify the
caller**. One value, two opposite meanings, and the permissive one won: an
unidentifiable caller skipped the branch and could overwrite every owned row in
the org.

Meanwhile `_ownership.mjs` asserted the opposite for the same input, and both
suites were green:

```
✔ a null callerName may edit everything            ← bulk-upsert.test.mjs
✔ policy — FAIL CLOSED when the caller has no resolvable name   ← ownership.test.mjs
```

Nothing compared them, because the rule lived in two files and neither knew the
other existed.

**This is §18b19 generalised.** That rule was written about `ownerColumn:
undefined` being read as "no restriction" by `if (ownerColumn)`. The shape is not
about that parameter. It is about **any** value feeding an authorization decision:

1. Never overload a falsy value to mean "trusted". Pass an explicit flag.
2. Default the flag to the SAFE direction. `canSeeAll = false` refuses Admins if a
   caller forgets it — visible and annoying. The other default authorizes
   everyone — silent and unbounded.
3. One policy function, imported by every path. `mayMutate()` is now called by
   both `assertOwnership` and `bulkUpsert`; they cannot disagree.
4. Distinguish "the OWNER is unknown" (unassigned → anyone may take it) from
   "the CALLER is unknown" (owns nothing → refused). Conflating them is how this
   happened.

### 3. A caller lookup is scoped to the org, always

`getCallerName` looked up by id with no `orgId` filter. Survivable only while a
person could belong to exactly one org — which was true *because* of the global
email unique. Removing that constraint made an unscoped lookup able to resolve a
name from a different tenant and authorize a write with it. `getCallerName` now
requires `orgId` and throws without it rather than running unscoped.

### 4. Assert the constructor, not the name

`uniqueIndex('users_org_email_uq')` and `index('users_org_email_uq')` differ by
one keyword. The second enforces nothing and keeps a name that says it does. In
`pg_indexes` they look identical until you read `indisunique`.

A test asserting the NAME appeared in the schema passed under both. It read like
coverage and checked nothing. **The mutation harness reported SURVIVED, which is
the only reason it was found** — and it was written by someone who had flagged
that exact trap in the migration an hour earlier.

Adding a test does not add a mutation. `scripts/mutate-import.mjs` carries its own
list; a new suite must be added to `SUITES` and given a mutation, or the count
keeps reading green while the guard is scenery.

---

## 18b21. A Centralised Gate Needs A Guard That Notices Its Absence (hard rule)

§18b19 put the ownership policy in one place. It did not, and could not, stop an
endpoint from ignoring that place and hand-rolling the check anyway — which is
what all six of them were still doing for nine of the eleven copies, for a full
session after the rule was written.

The registry test proved a *registered* column existed. Nothing proved an
endpoint *used the registry*. Those are different claims, and only the first one
had a test.

### 1. Guard the call site, not just the definition

Five source-level assertions now run in the default suite
(`tests/ownership-registry.test.mjs`). They read the six endpoint files as text
and fail if any of these reappears:

| Guard | Catches |
|---|---|
| no `!== callerName`, no `db.select({ owner:` | an endpoint re-rolling the comparison |
| every `ownerColumn:` starts `ownerColumnOf(` | a column named at the call site, unchecked against the schema |
| every `assertOwnership` result is `return`ed | **a gate computed and then discarded** |
| no `eq(users.id, userId)` | a display-name lookup keyed on the Clerk id |
| every `.from(users)` filters `users.orgId` | an unscoped cross-tenant resolve |

Source-level for the reason given throughout this file: the endpoints import
`db/index.js`, which is TypeScript, so importing them would strand these checks in
`test:int` — a suite that needs a database, is not in `npm test`, and had itself
been dead at import for a fortnight.

**The third guard is the one to keep.** `const forbidden = await assertOwnership(…)`
with no `if (forbidden) return forbidden;` beneath it reads as protection in
review, passes every other gate, and enforces nothing.

### 2. Comparing a name to an id is a defect class, not an incident

Three separate live instances were found in one pass, all of the same shape and
none caught by any gate:

- Two GET filters matched `users.id` against the Clerk id. After the identity
  split that resolves nothing, the rep's name fell to `null`, and the visibility
  predicate collapsed to *only unassigned records*. **Every rep lost sight of
  their own pipeline and their own leads.** Silent: the query succeeded and
  returned no row, so the surrounding `try/catch` never fired.
- `getRepUser()` matched a display name with no `orgId`. It returns an **email
  address** that deal names, ARR and stage changes are then sent to — so one
  tenant's pipeline activity could be delivered to another tenant's employee.
- `inserted.salesRep !== userId` — a name against a Clerk id, **never equal**, so
  the guard reading "don't notify the rep about a deal they created" had never
  suppressed a single email.

**Why the Phase 1 sweep missed all three:** it rewrote call sites of
`getCallerName`. These are *inline queries that duplicate it*. A textual sweep
finds callers; it cannot find code that reimplements the callee. **After any
sweep, search for the BEHAVIOUR, not the function name.**

### 3. Adding a suite to `SUITES` is a separate act from writing it

`tests/ownership-registry.test.mjs` existed for a session and was **absent from
`SUITES` in `scripts/mutate-import.mjs`**. Every guard in it — the registry, the
policy predicate, both fail-closed throws — carried every object-level
authorization decision in the app with **zero mutation coverage**. The count read
55/55 the whole time, because the one ownership mutation targeted `_bulk.mjs` and
was caught by a different suite.

This is §18b20's closing paragraph recurring three weeks later, in the file that
paragraph is about. The count is now 65/65, and **ten of those ten new mutations
cover guards that already existed** — that is not new coverage, it is coverage
that was being counted without being tested.

**Checklist when centralising anything:**

1. Move the logic.
2. Assert no caller re-rolls it — at the call site, in the default suite.
3. Assert the result is actually *used*, not merely computed.
4. Add the suite to `SUITES` and give each guard a mutation.
5. Confirm each mutation reports CAUGHT before believing any of it.
