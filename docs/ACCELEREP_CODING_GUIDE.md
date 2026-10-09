# Accelerep — Claude Coding Guide

**Updated:** October 9, 2026 · rules current through **§18b87** (the line read §18b38 while §18b39 and §18b40 stood in the body, and §18b62 through §18b63 and §18b64 — the header has lagged three times; the body is the record).
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
- `waitForToken()` in `storage.js` polls until the token getter is ready (up to 8 seconds), then resolves anyway with a console warning — every org-scoped load keys on `activeOrgId` (App.jsx), so that give-up is never reached (§18b38).
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

Clerk is authoritative for identity, email and org membership. **The ROLE is the `users` row's, per org** (§0.163, §18b56) — the role the server enforces; the table also holds the in-app roster and the app-only fields (quota, team, territory, profile prefs). Consequences:
- **Wiping `users` does NOT lose assignments** — ownership fields (`salesRep`, `accountOwner`, `assignedTo`, `repName`, `createdBy`) are name-**strings on each entity row**, not FKs. They survive a roster wipe.
- **Re-adding an existing member via Invite fails** — Clerk rejects an org invitation for someone already in the org. To rebuild roster rows for existing members, use **Sync-from-Clerk**, not Invite.
- **`users-sync.mjs`** (Admin) reconciles roster ← Clerk: creates missing rows (as reps), never changes a role (§0.163), team/territory fill-blanks-only, quota/profile untouched, reports (never deletes) DB-rows-not-in-Clerk and name drift (never applies it). Button in Settings → Users. Reuse this as the canonical "roster out of sync" fix.
- **`GET ?me=true`** links the caller's row — by the invited email, with its role, or by display name alone, as a rep (§0.163) — or, when nothing matches, provisions one (§0.108: a rep, or a fresh org's first Admin). **`PUT ?me=true`** is self-only and keeps the stored role.
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
- On load, settings and users are loaded in parallel; each load is for ONE org and only the latest load's answers apply. The org whose settings are in state (`settingsOrgId`) is recorded only when its load succeeds; `settingsReady.current` and that org gate the save effect — nothing saves before the active org's load succeeds, or while another org is active (§18b55).
- Nothing is cached in localStorage: settings and users always load from the DB, and every load deletes the copies earlier builds kept (§0.162 — the cache was keyed by the first membership, and an unscoped copy seeded the first paint).

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

**Consequence:** a non-admin's settings PUT is a 403 — correct, and why **personal preferences must never live in the settings blob.** (Until §0.170 the `useSettings` autosave PUT on every `setSettings`, so a non-admin's view-state click came back 403 as "Settings not saved"; the autosave is gone — §18b63.) Per-user settings go to `PUT /users?me=true` (see `PersonalNotifications` in `PersonalView.jsx`). When sending a partial update there, **spread the full flattened profile** (`{ ...myProfile, newField: value }`) — the server's `sanitize()` rebuilds `profile` from an explicit whitelist, so a partial payload silently wipes every field you omit.

### Secrets in the settings blob — hard rules

- **A secret lives in exactly one place.** The org Anthropic key belongs only in `extra.anthropicApiKey`, as AES-256-GCM ciphertext (`crypto.mjs`, keyed by `SETTINGS_ENCRYPTION_KEY`). The SVR-2 leak was *not* that field — it was a second plaintext copy the AI panel wrote into `aiSettings.byokProvider`, a general blob GET returns to every member. **When auditing secret handling, grep the UI for where the value is actually bound**, not just the field the audit names.
- **The plaintext never leaves the server.** GET returns `anthropicApiKeySet` (boolean) to all members and `anthropicApiKeyLast4` to Admins only. There is no code path that returns the key.
- **Key inputs are write-only.** Always empty on load; track intent in state (`keyAction`) so an untouched field never clears a stored key. Omit the field from the PUT to preserve, send `null` to clear.
- **`scrubAiSettings()` runs on GET and PUT**, so any stray plaintext self-heals out of the DB on the next admin save. `extractLegacyKey()` migrates a pre-existing plaintext key into the encrypted field once.
- **Never mirror settings containing key material to localStorage** or echo them in a save of the whole object — since §0.162 the hook keeps no localStorage copy at all and deletes the old ones on every load, and since §0.170 it writes nothing (`stripKeyMaterial()` kept the key out of the autosave until the autosave went).
- **Never log the key or put it in error responses, audit rows, or exported config.** Audit records only *that* it changed: `settings.apikey.set|cleared|migrated` (plus `settings.updated`).
- Server-side consumers (`ai-score.mjs`) read the ciphertext from the DB row and decrypt in-process — never via the settings HTTP response.
- **An Anthropic key the app uses is scoped to one workspace** — the site's `ANTHROPIC_API_KEY` and any key an org brings. Our calls send `x-api-key` and `anthropic-version`, never `anthropic-workspace-id`, and a personal or service-account key not scoped to a workspace draws 400 `invalid_request_error` on every call: "This API key is not scoped to a workspace, so this request must include the anthropic-workspace-id header…". A service account's "Workspaces" field is its membership; the key's own workspace is chosen when the key is made. To check a key, send one minimal request straight to Anthropic with the key from `.env`: local `netlify dev` replaces `ANTHROPIC_API_KEY` with Netlify's AI Gateway token, so the local app cannot test it. (Origin: 8 Oct 2026 — two key replacements failed alike, and the app kept only Anthropic's status, never its words.)

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
- ~~`onConflictDoNothing()` in the POST bulk branch~~ — **removed, not replaced**
  (§0.3 of the bulk-insert batch). It could never fire: the only unique constraint
  is the `id` primary key and every id is a fresh `crypto.randomUUID()` from
  `ModalLayer`. Name-based dedupe stays with the smart-merge tooling; nothing
  dedupes by name at insert time, deliberately.
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

The app does **not** use a CSS framework or the `index.css` button classes for new work. Styles are inline, and every file reads the design tokens from the ONE token object, `src/tokens.js` (§18b39):

```js
import { T } from '../tokens.js';   // the only declaration is src/tokens.js:
const T = {
  bg:'#f0ece4', surface:'#fbf8f3', surface2:'#f5efe3',
  border:'#e6ddd0', borderStrong:'#d4c8b4',
  ink:'#2a2622', inkMid:'#5a544c', inkMuted:'#8a8378',
  gold:'#c8b99a', goldInk:'#7a6a48',
  danger:'#9c3a2e', warn:'#b87333', ok:'#4d6b3d', info:'#3a5a7a',
  sans:'"Plus Jakarta Sans", system-ui, sans-serif', r:3,
};
```

(Since 14 Sep 2026 — state §0.130 — `src/tokens.js` is the only token literal in the tree. The Settings panels reach it through `settings/shared/tokens.js` and the Documents surfaces through `documents/atoms.jsx`, both re-exports. `DispatchTab` derives `const T = { ...TOKENS, r: 4 }` — the one recorded divergence. `tests/single-token-file.test.mjs` fails on any new local copy, any read of a key the object lacks, and any second override. **A new file never declares `T`; it imports it.** The object also carries `stages`, `mono`, `tint`, `surfaceInk`/`surfaceInkFg` and the radii `rSm`/`rMd`/`rLg` — the union of what the copies had.)

**Hard rules:**
- **No generic colors.** `#2563eb` and other off-brand blues/grays are forbidden — use `T.info`, `T.ink`, etc. (The old sub-tab style in §15 with `#2563eb` is off-brand; new tabs use `T.*`.) The sweep that moved the six blue-era modal files onto the tokens is `scripts/migrate-blue-era.mjs` (state §0.136): add a file to its list, read the dry run, apply — it decides a blue by ROLE (a background is the ink button, a text or border is `T.info`), keeps data palettes by what the line says, and `tests/blue-era-sweep.test.mjs` keeps a swept file clean.
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

The role is the one on the caller's row in the active org's roster (`users.role`), read by `auth.mjs` on every request (`_callerRole.mjs`, §0.163, §18b56). It flows into the app as `userRole` via context — the client takes it from `users?me=true` for the active org.

```js
const isAdmin = userRole === 'Admin';
const isManager = userRole === 'Manager';
const canSeeAll = isAdmin || isManager; // exposed on context
```

**`APP_ROLES` in `src/utils/roles.js` is the only list of role values** (re-exported
by `auth.mjs`, so every endpoint still imports it from there). Six strings,
`Object.freeze`d, with `isAppRole()` and `ROLE_OPTIONS` — the picker words, where
the stored value `'User'` reads "Sales Rep". Every path that writes a role — admin
create and invite in `users.mjs` (Admin-only above a rep, §0.163), `user-role.mjs`, the first-load link — validates
against it; the pickers (`UsersDetail`, `UserModal`), field-level security and
`scripts/check-clerk-roles.mjs` import it. There were **eight** lists before 26 Aug
(§18b24) and **five** again by 30 Sep (§0.151); each one that is not this one will
drift. (`invite-user.mjs`, which wrote a role WITHOUT `isAppRole` and which nothing
called, is deleted — §0.163.)

**Clerk carries a second vocabulary and it is not this one.** `org:admin` /
`org:member` are *organization membership* roles: they govern who administers the
Clerk org, not what anyone may do in Accelerep. `users-sync.mjs` used to fall
back to them, stripped of the `org:` prefix, which is where the `member` and
`admin` badges in the Users list came from. Since §0.163 the sync reads no role at
all — the role is the roster row's, per org — and a new row is a **rep**; the one
use of `org:admin` is a fresh org's first Admin (§18b56).

### Server-side enforcement (shipped — client-side `canEdit` is UX only, never security)

| Action | Admin | Manager | Sales Rep | ReadOnly | Dispatcher |
|---|---|---|---|---|---|
| GET (read) | whole org | whole org | own + unassigned | own + unassigned | whole org |
| POST (create) | ✅ | ✅ | ✅ | ❌ 403 | ❌ 403 |
| PUT (edit) | ✅ any | ✅ any | own + unassigned | ❌ 403 | ❌ 403 |
| DELETE by id | ✅ any | ✅ any | own + unassigned | ❌ 403 | ❌ 403 |
| DELETE `?clear=true` | ✅ | ❌ | ❌ | ❌ | ❌ |

The GET row is `crmReadScope(role)` (§18b45); a Technician reads nothing (`'none'`).

### Technician (fifth role)

A **Technician** is a field/mobile user, not a general write role, and reads no CRM row (`crmReadScope` `'none'`, §0.151 — they used to receive the unassigned ones). Role values are `Admin | Manager | User | ReadOnly | Technician | Dispatcher` — `'User'` is the stored value for a sales rep; "Sales Rep" is a display label only.

- **`requireWrite` denies Technician by default.** Exactly one caller opts in:
  ```js
  requireWrite(auth, event, headers, { allowTechnician: true })   // dispatch-jobs.mjs only
  ```
  A new role must never gain write access simply by not being ReadOnly. When the role set changes, **grep every gate** — adding Technician revealed nine endpoints that checked `isReadOnly` directly (the six core CRM handlers) or through a local shadowing const (`quotes.mjs`).
- **Scope by the technician row, not the user.** `dispatch_jobs.assignedTechId` FKs `dispatch_technicians.id`, so resolve `userId → technicianId` first. A Technician with no linked technician row **fails closed** (403) — never fall back to showing everything.
- **Per-field whitelist, not a role check:** `status`, `techNotes`, `completionNotes`, `photosCount`, `customerSignature`, on their own jobs only; status limited to `en_route | on_site | paused | completed`. Reject illegal fields **by name** rather than dropping them silently.
- Return **404, not 403**, for a job they are not on, so job ids cannot be enumerated.

### Dispatcher (sixth role)

A **Dispatcher** runs field-service scheduling and reads the CRM to see what was sold; they change no CRM record (§0.151, Jeff: a read-only CRM).

- **Reads the whole org** on the six CRM GETs through `crmReadScope(role)` — `'all'` for Admin, Manager and Dispatcher, `'none'` for a Technician, `'own'` for everyone else. **Never through `canSeeAll`**, which stays the write authority (§18b45).
- **Writes no CRM record.** `requireWrite` (`_roleGate.mjs`) refuses a Dispatcher by name — "a Dispatcher can view CRM records but not change them" — and there is no opt-in; the Technician's `allowTechnician` does not open it. The CRM tabs' `canEdit` is `canEditCrm(role)`, the same list as the gate.
- **The directory** (`GET /users` for anyone but Admin / Manager) carries `role`, `team` and `territory` for a whole-org reader — the Reports rosters count reps by role and slice by team and territory — and still no email, quota or profile. A rep's directory is names alone.
- **Reports** covers the whole org for a Dispatcher (`readsWholeOrg`), with the rep / team / territory slices; the rosters (`NON_REP_ROLES`) never count a Dispatcher or a Technician as a rep.
- **Runs Dispatch** — the one Dispatch gate (§0.152, §18b46) gives a Dispatcher full access: every `dispatch-*` endpoint, invoices (create, issue, mark paid, void — delete stays Admin-only), and quote → job. The quote card's "Create dispatch job" is theirs; "Customer accepted" is not (a CRM write). A Dispatcher lands on the Dispatch tab once per load, from Home.

### Roles live in Clerk, not the database

**`role` must never be taken from a request body into the `users` table.** It was, via `sanitize()`, on every write — so a self-service profile save that omitted `userType` silently demoted the caller to `'User'`, and admin role edits updated the roster while authorization kept reading the old Clerk value.

- `users.mjs` passes role explicitly through `withRole(clean, known)`; `roleOf(id)` preserves the stored value on update.
- The paths that set one: an Admin's **invite** or **create** (a Manager adds reps only), the **first-load link** (an invited row's role, by email), a **first sign-in's new row** (a rep, or a fresh org's first Admin), and **`user-role.mjs`** — the one path that changes an existing row's role. Clerk is not written (§0.163).
- **`users-sync?check=true`** is a dry run — same reconciliation, no writes, no audit row — used to show an out-of-sync banner on Settings → Users. Reconciling silently is not enough; drift needs to be *visible*, or it accumulates unnoticed.
- Deleting a roster row does **not** remove the Clerk account, so Sync — or the person's next sign-in — recreates it, as a rep. **Removing access is DEACTIVATE** (§0.164, §18b56.8): the row and its history stay, and every request in that org is refused; or remove the person from the organization in Clerk. An invitation not yet accepted is REVOKED, not deleted (§0.165, §18b58): DELETE refuses its row, because the Clerk invitation would stay live.

`auth.mjs` reads the role from the caller's row in the active org's roster on every request (`_callerRole.mjs`, §0.163) — the `users` table IS the role, per org. **Changing a role means changing that one row** — `user-role.mjs` (Admin-only) does it, counts the row it wrote, and audits `user.role.changed`; it confirms a linked person is still a member of the org first, and refuses self-demotion from Admin. It used to write Clerk's user-level `publicMetadata.role` — one value for every org — so a change in one org changed the person in every org (§0.153).

Before this existed, the Settings role selector wrote only the mirror and changed nothing the server enforced.

| `PUT /settings` (org config) | ✅ | ❌ 403 | ❌ 403 | ❌ 403 |

- Enforced in all six core entity endpoints (+ `users.mjs` clear is Admin-only; `quotes.mjs` had its own gates already).
- **`requireWrite(auth, event, headers)` (`auth.mjs`) is the shared write gate, and it is an ALLOWLIST.** `Admin | Manager | User` may write; `Technician` only through the single `allowTechnician` opt-in; **everything else is refused, loudly, including a value nobody recognises.** It read the other way until 26 Aug — denying exactly two strings and permitting all others — so `readonly`, `Read Only`, `technician`, `Sales Rep` or any typo carried full write access to ~28 endpoints (§18b24). Non-mutating methods pass through, so call it **once at the top of a handler**, not per branch — that also covers sub-resource branches (e.g. `dispatch-jobs?resource=lineitems`) that a per-branch gate would miss:
  ```js
  const forbidden = requireWrite(auth, event, headers);
  if (forbidden) return forbidden;
  ```
- **Every mutating function must have a gate.** As of the SVR-3 sweep: 29 of 29 covered — 28 by role check, plus `dashboard-configs.mjs`, which needs none because its PUT writes a self-scoped id (`'dash_' + userId + '_' + orgId`) and so can only ever touch the caller's own row. Self-scoping by construction is an acceptable substitute for a role gate; org-scoping alone is **not** (that was the `saved-reports` DELETE bug — any member could delete anyone's report).
- **Dispatch: ONE gate** (`_dispatchGate.mjs` → the pure `_dispatchDecision.mjs` → `dispatchAccessOf`, §0.152, §18b46) in front of the eight `dispatch-*` endpoints, `invoices.mjs` and `quote-to-job.mjs`'s POST. The module OFF (`settings.extra.dispatchEnabled`, absent = off) refuses everyone, an Admin included; Admin, Manager and Dispatcher run it; a sales rep only where the org turns on `settings.extra.repsCanUseDispatch` (Settings → Features & AI → "Sales reps can use Dispatch", OFF when absent — Jeff: reps "should not have dispatch power"); ReadOnly reads; a Technician reads and writes only through dispatch-jobs' `allowTechnician` opt-in. It replaced `requireWrite` there — under which "any non-ReadOnly role (Admin/Manager/Sales Rep) has full write access to all `dispatch-*` records", and a workspace with Dispatch OFF still answered every endpoint.
  `quote-to-job.mjs`'s GET stays outside the gate on purpose: it is the quote card's READ-ONLY job and invoice status, which a rep keeps on her own quote with Dispatch closed to her (Jeff's answer).
- **Audit rows are server-derived, never client-supplied.** `audit-log.mjs` POST ignores the client's `userId` / `userName` / `timestamp` and derives them from `auth` + `getCallerName()`. Accepting them from the body let any member forge entries attributing actions to another user — which would make the audit trail worthless as evidence for every other control. GET is Admin/Manager only.
- **Ownership keys on `ownerId`** — a `usr_<uuid>` app user id on all six Tier 1 tables (accounts, contacts, opportunities, tasks, leads, activities), stamped server-side on create from the caller's JWT and compared against `getCallerId(userId, orgId)` — which **fails closed** (null → the caller owns nothing assigned; unassigned records stay mutable by any writer). `orgId` is REQUIRED and throws when absent (§18b20.3). The display-name columns (`salesRep` / `accountOwner` / `assignedRep` / `assignedTo` / `author`) are retained for RENDERING AND RESOLUTION ONLY (`OWNER_NAME_COLUMNS` in `_ownership.mjs`); a name can no longer confer ownership, and there is deliberately no name-based policy function. **No endpoint performs object-level authorization directly** — writes go through `assertOwnership()` / `mayMutate()` (§18b21), which assert the identity space and refuse a wrong-space value loudly (§18b22).
- **Read-side policy (GET scoping):** all six entity GETs are rep-scoped on `ownerId` — a rep receives their own rows plus unassigned ones (`!r.ownerId || r.ownerId === callerId`); Admin, Manager and a Dispatcher receive the whole org via `crmReadScope(role) === 'all'` — NOT `canSeeAll`, which stays the write authority (§18b45) — and a Technician receives nothing (`'none'`). `opportunities.mjs` and `leads.mjs` filtered first; `accounts`, `contacts`, `tasks` and `activities` gained the identical predicate on 28 Aug — they previously returned EVERY row in the org to every caller, with only the client filter in `App.jsx` narrowing them, and a client filter is not a boundary. The manager `managedReps` branch exists only in `opportunities.mjs` and is still name-based (state doc §0.39) — deliberately not copied to the other five until that list moves to ids. The client passes reads through for reps (`isRepVisible`'s rep branch returns `true` since 28 Aug — a name-based re-filter could only hide rows the server granted); Manager narrowing to `managedReps` remains client-side and load-bearing.
  Since 31 Aug the UNASSIGNED half of the rep predicate is an org policy on
  `leads.mjs`, and since 30 Sep on `opportunities.mjs` too — the other four keep
  the fixed predicate. DEALS read `settings.extra.unassignedDealsVisibleToReps`
  with the OPPOSITE default, `false` (§0.151, Jeff: "Reps should only see their
  own deals"): absent, a rep receives only the deals she owns; the same `!!`
  guard on the strict branch, the same throw-on-failed-read, the same
  visibility-only scope; both halves of `settings.mjs` and the `?? false` read
  are pinned in tests/ownership-registry.test.mjs. Admin UI: the one card,
  Settings → Sales process → Lead & deal visibility. For LEADS:
  `settings.extra.unassignedLeadsVisibleToReps`, default `true`, where an
  absent key reproduces the standing policy so a deploy changes nothing for
  any unconfigured org. Off, the strict branch is
  `!!l.ownerId && l.ownerId === callerId` — the `!!` guard is load-bearing:
  a bare `=== callerId` matches `null === null` and hands an UNRESOLVABLE
  caller exactly the unassigned rows the toggle hides (18b22); with the
  guard, a null caller under the strict policy receives nothing. The config
  read deliberately does NOT copy `getLeadScoring`'s swallow-and-default
  shape: a failed read throws to the handler's 500 instead of silently
  picking a fail direction, because visibility is a boundary, not scoring.
  This is a VISIBILITY policy only — write policy is deliberately unchanged
  (an unassigned lead stays mutable by any writer who reaches it, recorded
  as a decision, not an oversight). Admin UI: Settings → Sales process →
  Lead visibility, with a live policy badge on the card. Every
  `x.ownerId === callerId` comparison in every endpoint must now decide the
  null-null collision explicitly (`!x.ownerId ||` or `!!x.ownerId &&`) —
  enforced by a shape guard in `tests/ownership-registry.test.mjs` that
  scans all six, so the next entity that grows a strict branch is covered
  before it is written.
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
- **A key change is not additive (§0.100, 8 Sep).** `job_heartbeats` was keyed by `job` alone on a database two sites share, so one row served dev and prod and said the job ran SOMEWHERE; the fix was `site` in the key. Swapping a live table's primary key is neither additive nor nullable: the moment a composite key replaces `(job)`, the OLD code still running on the other site has no `(job)` unique constraint left for its `ON CONFLICT (job)`, and its `UPDATE … WHERE job = x` writes every site's row — wrong data on both tiles until the ship. The additive move is a NEW table with the new key (`site_job_heartbeats`): the old code keeps its old table untouched until the ship, nothing overlaps, and the orphaned table is dropped later by hand — a read of its rows first, then Jeff's DROP, never a script's.

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

### Gates -- run all seven

```bash
npm run check:tdz      # reads before declaration
npm run check:inline   # components declared inline, used as a JSX element type
npm run check:dupes    # duplicate object keys / JSX attributes
npm run check:dbfetch  # discarded Response / Response read as JSON (18b1, 18b3)
npm run check:handoff  # root and docs SESSION_HANDOFF.md byte-identical
npm run build          # vite build + the bundle guard (18b4)
npm test               # unit suites INCLUDING the function-import graph (18b11)
```

**`npm test` is load-bearing for the deploy, not just for correctness.**
`tests/function-imports.test.mjs` resolves the import edges between Netlify
functions, which nothing else in the gates job does — vite bundles `src/`, and
esbuild bundles the functions at deploy time. A broken function import graph
passes the other five and fails the Netlify build.

Then, not in CI but before trusting a change to any guard:

```bash
npm run test:int                       # needs DATABASE_URL_TEST
node scripts/mutate-import.mjs         # must print `Baseline: green.` first (18b23)
```

*(This section said "run all five" and omitted `npm test` entirely for two
sessions after the sixth gate landed — recorded here rather than silently
corrected, per §22.)*

*(Seventh gate added 31 Aug: `check:handoff` asserts the root and `docs/`
copies of `SESSION_HANDOFF.md` are byte-identical. The pair drifted twice
on 31 Aug alone — a FINAL rewrite committed to one copy only, then the
same drift falsely re-diagnosed during cleanup.)*

**Use `npm run build`, not `npx vite build`** -- the latter bypasses the bundle
guard. `check:inline` should report **0 user-visible**.

All seven run in CI on every push and PR via the `gates` job in
`.github/workflows/test.yml`. Before that they ran only by hand, so anything pushed
without remembering them reached Netlify ungated.

**The CI `unit` job needs `npm install`** — it did not have one until 31 Aug
(`bd06bb2`). `node --test` itself needs no dependencies, but
`scanners.test.mjs` SPAWNS the gate scripts, which import `@babel/parser`,
so on a clean runner the job died ERR_MODULE_NOT_FOUND in ~8 seconds —
suspected red since the scanner suite landed (not verified against older
runs). The blind spot survived because the gates and integration jobs stayed
green and the per-job split was never read: an overall-red run whose
relevant job is green looks like noise. When CI is red, read the JOBS, not
the run badge — and when a job "needs no deps," ask what its tests spawn.

**A refused `git add` is one quiet hint in a noisy stream — read the commit
stat** (31 Aug). The four check-handoff fixtures were added, git printed
"ignored by .gitignore" between CRLF warnings, and the commit shipped 3 of
7 files; CI went red on the partial commit. Root cause: `.gitignore`'s
unanchored `fixtures/` (meant for the repo-root `fixtures/` directory,
which exists) also matched `tests/fixtures/`. Anchored to `/fixtures/`.
Two rules from one incident: gitignore patterns for a specific directory
are ANCHORED (`/fixtures/`, not `fixtures/`) — an unanchored directory
pattern matches at every depth; and `git show --stat HEAD` after any
multi-file commit is how you learn what actually shipped, because git
already told you and it scrolled past.

`scan-dbfetch.mjs` was a diagnostic until its accuracy was proven; it is now the
fifth gate (18b6).

### Netlify

- **Deploy:** Git push to `dev` → `accelerep.netlify.app`; smoke test, then merge `dev` → `master` → `salespipelinetracker.com` (production). Netlify auto-deploys both. There is no `main` branch.
- **Environment variables** (set in Netlify UI):
  - `VITE_CLERK_PUBLISHABLE_KEY`
  - `CLERK_SECRET_KEY`
  - `NETLIFY_DATABASE_URL` (auto-injected by Netlify Neon integration; the local `.env` uses the same name — this line said `NEON_DATABASE_URL` until 28 Aug, which was wrong)
  - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (`GOOGLE_REFRESH_TOKEN`, still set on both projects, has been read by nothing since the early calendar work — state §9, 3 Oct)
  - `RESEND_API_KEY`
- **DB migrations:** `drizzle-kit push` (not `migrate`) — schema changes are pushed directly
- The `netlify.toml` configures redirects so all routes serve `index.html` (SPA routing)
- **Under `netlify dev`, a stale `dist/` can hijack serving even with the
  `[dev]` proxy block present** — the 31 Aug symptom: `/src/main.jsx` and
  `/@vite/client` returned 200 with Netlify headers and NO `Content-Type`,
  `nosniff` blocked them, React never mounted, and the static crawler
  landing in `index.html` just stayed on screen. Fix is the documented
  stale-build cleanup (`rm -rf node_modules/.vite dist`, restart). Diagnose
  with `curl -sI` on :8888 vs :5173: the port serving
  `Content-Type: text/javascript` is healthy; typeless on :8888 while :5173
  is fine means the CLI answered instead of proxying. Whether the toml
  catch-all also participates under dev was NOT isolated (the cleanup fixed
  it before a redirect-move experiment ran); if the symptom returns on a
  clean tree, that is the next variable to test.
  SECOND FACE of the same failure (31 Aug, later the same day): a stale
  `dist/` built with the WRONG Clerk key serves a bundle that signs into
  the other Clerk instance — the symptom is the login screen at
  `localhost:8888` REDIRECTING TO `salespipelinetracker.com` after sign-in,
  and an org switcher showing the wrong instance's orgs. Same cleanup
  fixes it. Recognition rule: before ANY browser verification, read the
  URL bar and count the orgs in the switcher — a wrong-surface or
  wrong-instance session produces observations that are internally
  consistent and entirely meaningless.
  THE TRAP IS SELF-ARMING (1 Sep): the verification chain's own
  `npm run build` writes `dist/`, so every gate run re-creates the exact
  condition — "stale" was never the point, POPULATED was. `localhost:8888`
  then serves the static crawler landing (it lives inline in `index.html`)
  instead of the mounted app. Two consequences now standing: `rm -rf dist`
  belongs immediately after any LOCAL gate build (Netlify builds remotely;
  the local `dist/` exists only for the bundle guard to read), and the
  landing's "Customer sign in" link is RELATIVE (`/`) — it was an absolute
  `https://salespipelinetracker.com/`, which teleported a localhost session
  onto prod with one click.
  THE FUNCTIONS-SIDE TWIN (2 Sep, trigger WIDENED same day): under a
  long-running `netlify dev`, individual functions land in a broken
  serve state — the `.netlify/functions-serve/` cache's CJS shim parses
  as ESM under the project's `"type": "module"`
  (`ReferenceError: module is not defined`) — and the client shows only
  its generic failure toast. The trigger is NOT just "function added
  while running": in one session the broken set was a NEW function
  (lead-requests), a MODIFIED one (clerk-mfa-status), and an UNTOUCHED
  one (user-role, which silently ate two role saves), while equally
  modified siblings (users, leads) served fine. Treat it as
  nondeterministic. Deleting a function's cache directory does NOT
  recover it — the running server keeps a dead registration and 500s
  ENOENT. The fix is a dev-server RESTART, full stop. Recognition rule:
  ANY function 500ing under `netlify dev` gets its URL probed FIRST
  (401 JSON = loaded and gated; ESM/ENOENT 500 = stale serve) before a
  single line of its source is read — and after a functions-side editing
  session, probe the endpoints you are about to exercise in the browser,
  because a broken one presents as "my change didn't save".

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

**The mirror image (3 Sep 2026, state §0.90):** a catalogue that promises a
Connect nothing performs. The Connected Apps panel listed fifteen apps with a
modal — an account row, a scope list, an Authorize — behind every one, and
three of them existed. A third-party integration is real only when there is a
developer app under the owner's account, an OAuth flow, token storage and a
feature that reads the data; a modal is none of those. The honest shape for an
app that does not exist yet is a **request**: recorded on the org, audited,
mailed to the owner, never a Connect. One catalogue module
(`src/utils/integrationCatalog.js`) is imported by the panel and by the
endpoint, so what the UI can show is exactly what the server accepts — and a
real integration (Slack, the calendars) is never in it.

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
- Since 31 Aug the manual grep is also a PERMANENT TEST for
  `unassignedLeadsVisibleToReps`: `tests/ownership-registry.test.mjs` asserts
  the key appears ≥2× in `settings.mjs` (GET + PUT) and that `leads.mjs`
  reads it with its `?? true` default pinned, and the mutation harness
  drops each half to prove the guard bites. This key does not get to be the
  fifth shipping of this bug. New `settings.extra` keys with a server-side
  consumer should extend that guard rather than rely on the grep.

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

**That check found its second instance (31 Aug): `leads.mjs` PUT.** `saveLead`
sends `{ id, ...patch }` and the endpoint fed it to a full-row `sanitize()` —
a two-key status change replaced the row. The fix is the same pattern minus
the blob flatten (lead rows are flat): `sanitize({ ...existing, ...data })`,
with `ownerIdForUpdate` still fed the RAW body so 18b13's mentioned-assignedTo
detection survives the merge. Pinned by a source-assertion guard in
`tests/partial-sanitize.test.mjs` because the mutation harness runs unit
suites only — if a refactor moves the merge, move the guard with it.

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

### Doc changes land when they are known — never as end-of-session patch scripts

Established 31 Aug (third session), Jeff's call. The rule:

1. A doc change is **applied, verified from disk, and committed the moment it
   is known** — in the same commit as the code it describes when there is
   code, in its own commit when there is not.
2. **`SESSION_HANDOFF.md` is written LAST**, after everything else is applied
   and committed, so it only ever describes observed, committed state — and
   both copies are written together, `npm run check:handoff` before the
   commit.
3. No queued patch scripts. A script that edits a doc "later" is a claim
   about the future filed as a fact.

Origin: `patch-state-054-shipped.mjs` was delivered at the end of the
previous session and recorded as the §0.54 amendment — but it had never run
with `--apply`. The state doc lacked the very block the FINAL handoff's
staleness fingerprint demanded, and the next session opened by catching the
gap (the fingerprint check working as designed). The failure class is
docs-outran-the-disk with a delay fuse: the queue itself is the defect,
because everything between "known" and "applied" is a window where the
docs lie.

### One list of open items — `docs/OPEN_ITEMS.md` (7 Oct 2026)

Jeff, 7 Oct: "can you make one central master open items/to-do list. It is
not smart to try and manage multiple lists across multiple conversations". The
rule:

1. **Every open item lives in `docs/OPEN_ITEMS.md`** — a bug found and not
   fixed, a decision waiting on Jeff, a planned feature, a check owed — and
   in no other list. A batch's "found, not changed" items are written there
   in the batch's own commit; the state doc's entry may name them, the list
   holds them.
2. **An item leaves the list in the commit that closes it.** The state doc's
   batch entry records the work; the list holds only what is open.
3. **Each item says what it waits on and where it came from** (its §, its
   date), with the recommendation where one is recorded. "As recorded" marks
   an item not re-read since it was written — read the code before acting on
   it (verify the repo, not the doc, above).
4. **The handoff points at the list** for everything past the next session's
   first steps; it keeps no list of its own.
5. **State §9 is frozen history** from 7 Oct 2026 — the list started from it
   and from the handoff's §5. CLAUDE.md's session start names the list.

Origin: by 7 Oct the open items stood in three places — state §9 (192
entries, struck and open together), the handoff's §5 (1,500 lines of session
preps back to the seventh session) and each batch entry's own "found"
paragraph — and one item could be closed in one place and open in another:
§0.169's record of the AI Score tab's missing deal id stood open beside
§0.187's record of the same bug, and "`currentUser` from the roster" stood
open six weeks after `77e119c` fixed it.

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

---

## 18b22. An Id Column Is Not An Identity — Assert The Space (hard rule)

Phase 2 moved ownership from display names onto `users.id`. Adding the columns
nearly recreated the defect it was removing.

**Three different `ownerId` columns already existed in this schema:**

| Column | Holds |
|---|---|
| `documents.ownerId` | a **Clerk** userId (`user_…`) — the schema comment says so |
| `savedReports.ownerId` | notNull, undocumented, unaudited |
| the six Tier 1 columns | our `usr_<uuid>` |

All three are `text`. A Clerk id compared against an app id is a valid expression
between two non-null strings that **can never be equal**, so it does not throw. It
silently refuses everything, or silently matches nothing, depending which side it
lands on.

`documents` and `savedReports` were recorded in §0.28 as *"already correct — leave
alone"* because they were id-first. That was true about the SHAPE and wrong about
the SPACE.

### The rule

**Where a value's identity space is not enforced by the type system, assert it at
the point of use, and make a wrong space refuse LOUDLY.**

```js
export const isAppUserId = (v) =>
    typeof v === 'string' && v.startsWith('usr_') && v.length > 4;
```

`mayMutate()` refuses and `console.warn`s on a wrong-space value. Quiet refusal is
indistinguishable from the gate working correctly, and gets debugged for an hour
at the wrong layer.

`tests/ownership-registry.test.mjs` carries a tripwire asserting `document` and
`savedReport` are NOT in the ownership registry. If either is ever brought under
this policy its column must be migrated to `users.id` first.

### Assert the OUTCOME THAT DIFFERS, not the outcome you expect

The first version of that test asserted:

```js
assert.equal(mayMutate({ ownerId: 'user_X', callerId: 'usr_Y' }), false);
```

**Deleting the guard SURVIVED it.** Two unequal strings return `false` whether the
guard exists or not. The behaviour only diverges when the two sides MATCH:

```
without the guard   'user_X' === 'user_X'  ->  TRUE, authorized
with it             wrong space            ->  refused
```

A test that passes for the same reason with and without the code under test is not
a test. Ask what would be DIFFERENT, and assert that.

### `undefined` and `null` are not the same absence

`bulkUpsert` read `prior.ownerId` from its own projection:

- `undefined` — the SELECT never returned the column
- `null` — the row is genuinely unowned

They resolved identically and the permissive one won, so a stale fixture
projecting the OLD key made **every owned row in every batch writable by anyone**.
It now throws when an `ownerColumn` was requested and the projection came back
without it. §18b20, inside the function §18b20 was written about.

### The display name rides with the owner (§0.104, 9 Sep — item 28)

Ownership keys on `ownerId`; the display-name column is "for rendering and
export only". True, and it produced a row that was owned by one person and
displayed as nobody's: a contact created without naming a rep was stamped
`ownerId` = the creator and `assignedRep` = null, so the rail's "Assigned
Rep" was blank, and a Manager — whose only scoping is a set of rep NAMES
(`isRepVisible`) — could not see a row the server had granted. Two columns
that mean the same thing must be written together or not at all:
`stampOwnerId` now fills the display name from the SAME roster row it took
the id from whenever the caller becomes owner by default. A supplied name is
still resolved and kept; an unresolvable caller stamps null for both. The
rows from before are filled by `db/backfill-owner-names.mjs` (dry run by
default, Jeff's hand), and the contact rail names the owner from the roster
or the caller's own profile until then. The check: a rep-created record in
the integration suite has BOTH columns equal to the rep; the harness has a
mutant that drops the name half.

---

## 18b23. A Guard Guards A SHAPE; A Score Needs A BASELINE (hard rule)

### 1. The harness cannot grade a red suite

`scripts/mutate-import.mjs` judges a mutation CAUGHT when the suite exits
non-zero. If the suite is ALREADY red, **every** mutation exits non-zero and the
harness prints a perfect score over code it never tested.

It reported **73/73 twice** while `tests/bulk-upsert.test.mjs` had three RED
tests — including all three security assertions about ownership on the bulk path.
The number meant to prove the guards worked was proving only that node exits 1.

The harness now runs the suites unmutated first and refuses to grade anything
otherwise:

```
Baseline: running the suites unmutated...
Baseline: green.
```

**Never trust a mutation score that did not print a green baseline.**

### 2. Guard the shape, not the instance you happened to find

Five source-level guards were written for the name-vs-id defects found in one
batch: `!== callerName`, a projected owner, a literal `ownerColumn:`,
`eq(users.id, userId)`, an unscoped users lookup.

A sixth instance of the SAME defect class then survived the harness:

```js
results.filter(l => !l.ownerId    || l.ownerId    === callerId)   // correct
results.filter(l => !l.assignedTo || l.assignedTo === callerId)   // SURVIVED
```

A display name compared against a `usr_<uuid>`. Every guard was written against
the instances already discovered, and none described the CLASS. The sixth guard
does: **anything compared against `callerId` must end in `.ownerId`.**

Note also why the write-path policy did not save it — visibility filters do their
comparison in the endpoint and never reach `mayMutate()`. **Reads need their own
guards.** A policy function protects only the callers that call it.

### 3. The harness's own death must not leave a mutant on disk (§0.102, 9 Sep)

Twice (§0.96, §0.100) the harness died mid-mutant — the second time
`writeFileSync` threw `UNKNOWN errno -4094`, a transient Windows file lock —
and left a mutated source file on disk. `git status` at the next step caught
it both times; nothing else would have, and a mutant that reaches a commit is
a bug shipped by the tool meant to prove bugs are caught. The loop had been
write-mutant / run / write-original: three statements with nothing between a
throw and a dirty tree.

Now every mutant goes through `scripts/_mutant.mjs`: the original is
registered BEFORE the mutant write, restored in a `finally`, and restored
again by a process-level hook on exit, on SIGINT/SIGTERM/SIGHUP and on an
uncaught exception — so `process.exit()` from inside a run, which skips every
`finally`, still restores (`tests/mutant-restore.test.mjs` proves it with a
child process). A restore that fails stays registered for the hook and is
rethrown, because a harness that keeps grading over a stuck mutant misgrades
every mutant after it. The rules:

- **A tool that edits the tree registers its undo before its edit**, not after
  the thing it wanted to do — the crash comes between.
- **The harness has no `writeFileSync` of its own** (a source scan in the
  suite); a new harness or a new mutation loop uses `withMutant`.
- **`git status` after every harness run stays** — the hook is a second line,
  not a reason to stop looking.

---

## 18b24. A Vocabulary Is A Schema (hard rule)

Every rule from §18b20 through §18b23 is about two things that are not the same
being compared as though they were: a Clerk id and an app id, `undefined` and
`null`, a display name and a user id, a red suite and a caught mutation. This one
is the same defect in a **string enum**, and it had eight instances at once.

### 1. Count the lists before adding one

Five roles. Eight enumerations of them, no two identical:

| Where | Set |
|---|---|
| `auth.mjs` (the only enforced one) | `Admin · Manager · User · ReadOnly · Technician` |
| `user-role.mjs` `VALID_ROLES` | the same five, separately maintained |
| Clerk org membership → `users-sync:105` | `admin · member` |
| `UsersDetail` `RolePill` colour map | `Admin · Sales Manager · Sales Rep · CS · Finance` |
| `UsersDetail` invite seeds | `Sales Rep` |
| `UserModal` `<option>`s | four — **no Technician** |
| `UserProfilePage` `permMap` | four — no Technician |
| `schema.ts` comment | four |

Only the first was enforced. The colour map keyed on labels this app never
stores, so four roles rendered as the same grey badge. `permMap` fell back to the
rep row for a Technician, describing write access they do not have.

**One frozen list, exported, imported by every writer and every renderer.** A
copy that agrees today is edited by someone else tomorrow — the same argument
§18b19 makes for the ownership registry, and `VALID_ROLES` was already a live
counter-example when that rule was written.

### 2. A gate that DENIES named values permits everything you did not name

```js
// WRONG -- a blocklist
if (isReadOnly(role))   return forbidden;
if (isTechnician(role)) return forbidden;
return null;                                  // 'readonly' lands here. So does 'Sales Rep'.

// RIGHT -- an allowlist
if (WRITE_ROLES.includes(role)) return null;
return forbidden;                             // and say WHICH value, in the log
```

This is §18b20.2 ("absence must be an error or a refusal — never a permission")
applied to a string rather than to `null`. The failure is quieter here, because a
role string is never absent — it is merely *unrecognised*, which reads like a
value and behaves like a wildcard.

The invite screen was seeding its rows with `'Sales Rep'` — the display LABEL for
`'User'` — and `users.mjs` wrote it straight into Clerk `publicMetadata`. So the
wildcard was not hypothetical: it was being minted by the UI, on the default path,
and §0PP-e had already recorded this exact `'Sales Rep'` vs `'User'` mismatch as
fixed once.

### 3. A `<select>` with an unmatched value is an input, not a display bug

§16 has said since well before this batch that *a `<select>` with an unmatched
value silently shows the first option*. It was true, it was written down, and it
shipped anyway — in three places — because the rule had no guard.

The reason it is not cosmetic: the first option in every one of these lists is
**Admin**. A user stored as `member` therefore presented as an Admin, and the
control was live, so opening the dropdown and clicking what looked like the
current value submitted a real role change. The display bug and the escalation
are the same line of code.

**Render an unmatched value as itself, disabled.** Never let the browser choose a
value on the user's behalf, and never translate a value you do not recognise —
showing the raw `member` string is what makes the drift findable.

### 4. Two fields answering one question: the column wins

`users.role` (the column) and `profile.userType` (a copy inside the jsonb blob)
both travelled to the client on every response. `flatten()` spread the blob LAST,
so the copy silently won — and **nothing ever updated the copy**: not a role
change, not a Clerk sync. It was frozen at row creation.

The entire Users UI read the frozen copy: badges, both seat counters, the profile
header, the permissions summary, the role select. That is the whole of §0.40's
symptom, and it was a spread order.

**Where two fields hold one fact, the response must resolve them, and the
authoritative one must be last in the object literal.** Better still, do not ship
both — but if an alias must stay for compatibility, make it an alias in code
rather than a second stored value that can disagree.

### 5. What was NOT true

Recorded because a session spent effort on it. §0.40 hypothesised that
`canSeeAll()` being case-sensitive meant *a user the UI calls an admin has rep
access*. `canSeeAll` **is** case-sensitive — but it reads Clerk
`publicMetadata.role`, and nothing wrote `admin`/`member` to Clerk; the sync wrote
them to the **mirror** only. The badge and the authorization were reading
different fields from different stores, which is why they disagreed.

§0.40 labelled itself unverified and was right to. The lesson is not that the note
was wrong — it is that **"these two disagree" almost never means one of them is
miscomparing; it usually means they are not the same field.** Find the two
sources before theorising about the comparison.

---

## 18b25. An Integration Suite Owns Its Org Namespace (hard rule)

The integration files run as CONCURRENT processes against ONE shared test
database (`node --test` spawns one process per file). Any suite that writes
to a table with a uniqueness constraint spanning org-scoped values —
`users_org_clerk_uq` is the live example — must therefore use org ids no
other suite touches (`itest_leads_A`, not the communal `itest_org_A`).

How this was learned: the leads suite began seeding a roster row for
`(itest_org_A, u_itest_org_A)` — the same pair the accounts suite re-seeds
in a per-test hook. Result, nondeterministically interleaved: accounts'
hooks died on duplicate-key for all nine of its tests, and org A's caller
resolved to whichever suite's row was standing when the 30s caller cache
first filled — so the leads rep tests failed on "a rep must receive their
own lead" with no error anywhere near the actual cause.

### Rules

- **One org-id prefix per suite file** (`itest_<entity>_A/B`). A suite that
  starts seeding `users` (or any other constrained shared table) takes its
  own prefix at the same moment.
- **Seed roster rows in `before()`, then call `invalidateRoster()`** — the
  caller cache stores a MISS as `{id: null}` for 30s, so a resolution racing
  the seed leaves the caller owning nothing for the rest of the run, failing
  closed with no error (§0.41 grew the invalidation for production; tests
  need it for the same reason).
- **Exact-count assertions on "sees nothing" tests must state their premise
  in a comment** (the leads null-caller test asserts zero rows and says why
  every org-B row is unassigned by construction). An unstated premise is the
  next suite's mystery failure.
- Cross-file collisions present as HOOK failures in the OTHER suite —
  duplicate keys in a file you did not edit after adding seeding to one you
  did is this rule being violated, not that suite's bug.
- **Namespaces isolate suites WITHIN a run, never runs from each other**
  (1 Sep): a dev push and a master fast-forward seconds apart ran the CI
  integration job CONCURRENTLY against the one shared test database — each
  run's cleanup deleted the other's seeds and the identical `(org,
  clerkUserId)` pairs collided, on a docs-only diff whose code had been
  green an hour earlier when the runs happened to be sequential. Fixed
  structurally, not by re-namespacing: the integration job carries a
  repo-wide `concurrency` group (`integration-shared-test-db`,
  `cancel-in-progress: false`) in `.github/workflows/test.yml`, so
  concurrent runs QUEUE. Recognition rule: an integration-only CI failure
  on a docs-only commit, seconds after another push, is this — check the
  two jobs' start times before reading a single test.

## 18b26. A Date Is Read The Way It Was Written (hard rule)

`dateLocal.js` settled the WRITE side: a wall-calendar day is formatted from
local fields, never via `toISOString`. This is the READ side, and it is the
same distinction. **A `yyyy-mm-dd` string is a day and is read at LOCAL noon; a
string carrying a time is an instant and is read as-is.** Mixing the two fails
silently in both directions: `new Date('2026-09-01')` is UTC midnight and
renders as the previous evening across the Americas (TaskItem's `Due:`), and
`createdAt + 'T12:00:00'` is an Invalid Date whose every derived age is NaN
(LeadsTab's "NaNyr", the deal timeline's sort). Both were live in §0.60.

- Read a date field through `parseLocalDate()`. It returns null, never an
  Invalid Date — branch on it. Do not write `new Date(x + 'T12:00:00')` in new
  code: it is correct only while `x` is guaranteed date-only, and the ~140
  existing sites have that guarantee from the schema, not from the code.
- A fallback chain must not mix kinds. `t.dueDate || t.createdAt` hands an
  instant to a day-reader. Check the schema for every name in the chain:
  `completedAt` was not a tasks column; `changedAt` was never written by
  anything.
- Anything entering a date-only column from OUTSIDE an `<input type="date">` —
  a CSV cell, a pasted value, an API body — goes through `toLocalDay()` first.
  `varchar(20)` accepts `9/15/2026` as readily as `2026-09-15`, and nothing
  on the server validates the shape.
- Count before you queue. "~20 other call sites" was an estimate written into
  a queue item; the audit found ~140. A grep costs nothing, and the number
  decides whether the item is a sweep or a rule.
- A triage list lives in the state doc or a test, never only in the handoff.
  The isoLocal batch's 24-site list was written into a handoff that the next
  session overwrote; the two sites it named as worst stayed live for the
  weeks nobody could see the list.
- A bug is live only in a component that is MOUNTED. Before recording a fix
  as live, grep for `<Name` somewhere other than the component's own file.
  `TaskItem` was fixed as live in §0.60 and renders nowhere; ten components
  imported by App.jsx are in that state, and it was the bundle hash — unchanged
  across an edit to two of them — that said so, not a reading of the code.
- When a fix names a value, grep the FILE for every other reader of that
  value before calling it fixed. §0.62's batch 1 repaired the timeline sort
  at the bottom of the builder and left the `fmtDate` helper twenty lines
  above it still appending noon to the same `dueDate || createdAt` chain;
  Jeff's screenshot showed the timeline sorted and the label beside it
  reading "Invalid Date". The defect follows the value, not the line that
  was reported — a fallback chain has as many readers as the file gives it,
  and each one is a separate bug until it has been checked.
- A written-out date must carry a four-digit year before it may reach
  `new Date(s)`. The engine fills a missing year as 2001: "Sept 15" and
  "9/15" are both 2001-09-15, and both look like dates. `toLocalDay` gates
  its fallback on a four-digit run and decodes the two-digit US shape by hand
  (0.64). A refusal that fires on null cannot catch a confident wrong answer;
  probe the parser with the cells a real file would carry before trusting it.

## 18b27. A Session Is Signed In Only When Clerk Says So (hard rule)

Clerk can authenticate a user and still not admit the session. "Require
multi-factor authentication" (or a required organization choice) parks the
sign-in as status `pending` with a task to finish. Pending is signed OUT:
Clerk's helpers say so (`treatPendingAsSignedOut`), the v2 token says so
(`sts: "pending"`), the docs say so. The app said otherwise on both sides
(0.65, observed as Karen: Require on, "loaded straight through", the
opportunities endpoint 200).

- Client: gate on `useAuth().isSignedIn`, never on `useUser().user`.
  `useUser` returns the user object regardless of session status; only
  `useAuth` runs `resolveAuthState`, where pending becomes `isSignedIn:
  false`. App.jsx derives the user it trusts from `isSignedIn`, so every
  consumer sees a pending session as signed out, and `<SignIn />` stays
  mounted so Clerk renders the task inside it.
- Server: read `sts`. `verifyToken` checks signature, expiry and authorized
  party and nothing else. `pendingSessionRefusal(payload)` runs before the
  user lookup and before the cache, and the gate is "active or nothing" — an
  unrecognised status does not pass by being unrecognised (18b20). A token
  with no `sts` claim is v1 and passes; absence is not pending.
- A security surface may only state what the code enforces. The MFA panel
  told admins that Require in Clerk "locks down sign-in" while the app
  ignored pending: true of Clerk, false of the app. Copy about enforcement is
  a claim about code and is verified like one — toggle on, fresh sign-in,
  read `session.status` and the API's answer.
## 18b28. A Dialog That Asks Is The App's Own (hard rule)

Origin (2 Sep 2026, state §0.79): Jeff's screenshot of the deployed dev
site — a grey system box titled "accelerep.netlify.app says" asking for a
coaching note — and his words, "we need to make this the same look and
feel as the rest of the app". Seven `window.confirm()` and two
`window.prompt()` calls were still live: the saved-report delete, both
document deletes, the quoting discard/archive confirms, Rename role, Add
coaching note. The app had owned a confirmation modal for months.

- Never `window.confirm`, `window.prompt`, or their bare forms. A decision
  goes through `showConfirm(message, onConfirm, danger)`; a value goes
  through `showPrompt({ title, label, help, placeholder, initial,
  submitLabel }, onSubmit)`. Both come from the app context (`useApp()`),
  both render in ModalLayer, both close on Escape and count as an open
  modal for the keyboard shortcuts.
- The pattern for a new dialog: state in `useModalState.js`, the opener in
  App.jsx beside `showConfirm`, the render in ModalLayer at module scope,
  the state name added to the Escape handler, the modal-open guard, and the
  shortcut deps — all four places, or the dialog works and the keyboard
  does not.
- `tests/house-dialogs.test.mjs` sweeps every file under `src/` for
  `confirm(` / `prompt(` and fails the build on one. Comments count — say
  "prompt dialog", not "prompt()".
- A callback-style API changes control flow: `if (!confirm(...)) return;
  doIt();` becomes `showConfirm(..., () => doIt());` — anything after the
  old `return` moves inside the callback, and an `async` handler becomes an
  async callback. The one `window.alert` left (a failed report delete) is a
  notice, not a decision; replace it when that code is next touched.


## 18b29. A JSX Name Is A Reference (hard rule)

Origin (3 Sep 2026, state §0.89): reading `ConnectedAppsDetail.jsx` for
handoff item 24 found `<SlackConfigModal .../>` rendered on the
"Configure Slack" path with no import and no declaration anywhere in
`src/`. Commit `5772f63` (11 May 2026, "tab fixes in settings") had
deleted the component from SettingsTab.jsx in a cleanup while the panel
kept rendering it. Babel validated the file, `vite build` bundled it
(esbuild emits an unbound JSX name as a global read), and `check:tdz`
reported "No render-time TDZ issues in 147 file(s)" — its undefined-reference
walk counted `Identifier` nodes, and a JSX element name is a
`JSXIdentifier`. Every "Configure Slack" click threw `SlackConfigModal is
not defined` into the Settings error boundary for four months on prod, so no
org could enter the webhook that `send-slack.mjs` and five pipeline alerts
read. The check written to find the class found exactly one in the tree.

- **A capitalised JSX element name is a read of that binding.** Every
  `<Name/>` (and the root of `<A.B/>`) must be an import, a module-scope
  declaration, a parameter, or a local. `check:tdz` now has pass (c): a
  name bound nowhere in the file fails the gate as `<file> reads "Name"`,
  and its per-component scope walk reports a name bound elsewhere in the
  file as `<Component> reads "Name"` — the stranded-closure shape of 18b0.
- **Deleting a component means grepping for `<Name` across `src/`
  first.** 18b26 asks for that grep before writing "live"; this is its
  mirror. A definition with no use is dead code; a use with no definition is
  a crash that no build reports.
- **A gate is proven by a fixture that fails it** (18b11).
  `tests/fixtures/scanners/tdz-undefined-jsx.jsx` carries both sites (inside
  a top-level component, and a module-level expression no component loop
  visits); `tdz-clean.jsx` carries every legitimate binding form — an
  import, a module declaration, a prop parameter, a destructured local,
  `<React.Fragment>`, and a default-exported function declaration rendered
  by a sibling export, which the gate had never collected as module scope
  either (46 such declarations in `src/`).
- **The shape of the blind spot:** a scanner that walks one node type and
  treats every other as inert. A gate's header names the node types it
  reads; when a bug "cannot be there because the gate would have caught
  it", read the gate before believing it — the gate's own fixture suite
  (`tests/scanners.test.mjs`) exists because three of the four had a
  false-negative class found only by a bug reaching production.

## 18b30. A URL The Client Hands The Server Is A Destination — Pin It (hard rule)

Origin (7 Sep 2026, state §0.92, handoff item 25): `send-slack.mjs`'s handler
POSTed a test message to any `webhookUrl` in the request body behind
`verifyAuth` alone. No role gate, no host check — any signed-in member of any
org could make the server POST to any URL on the internet, or to whatever sat
beside the function. The same module's `sendSlack()` posted to whatever it
was handed, so the webhook an Admin saved — never validated on save — was hit
on every pipeline alert whatever host it named. The audit-stream endpoint
built five days earlier (§0.87) had refused http, credentials and private
hosts, and was Admin-only; the older endpoint beside it had neither. Listed
while reading for §0.89; seen live the day Jeff's own test went out.

- **A server that fetches a URL a client supplied — in the body, or from a
  setting a client saved — is a proxy.** Gate the role, and validate the
  destination at the ONE place that sends, failing closed (throw; the caller
  that swallows it logs and skips). Validating only at the handler leaves the
  stored path open; validating only on save leaves the typed path open.
  Validate on save AS WELL, so the UI can never say "Live" over a destination
  the sender will refuse.
- **When the provider has one URL shape, that shape is the allowlist.** A
  Slack Incoming Webhook is `https://hooks.slack.com/services/…` and nothing
  else: exact host (not a suffix — `hooks.slack.com.evil.example` ends with
  it), a path prefix, no credentials, no port. When there is no shape (a
  customer's own receiver), the floor is https, no credentials, no literal
  private host (`_auditPayload.mjs`'s `isPrivateHost`).
- **The validator is a pure module; the endpoint is thin over it.**
  `_slackWebhook.mjs` beside `_auditPayload.mjs`: reachable by `node --test`
  with no database, mutated in the harness (host, scheme, path), scanned into
  its three call sites.
- **A refusal test asserts the absence of the side effect, not the status
  code.** 403 and 400 prove the gate ran; "nothing fetched" proves nothing
  left the server. The integration suite mocks `globalThis.fetch`, records
  every call, and asserts zero on every refusal and exactly one on the send.
- **The Neon HTTP driver goes through `fetch` too — to the regional
  `api.<region>….neon.tech/sql` host, not the connection string's endpoint
  host.** A test that mocks `fetch` must pass the database through by that
  suffix, or the schema guard fails with "Could not read the test database
  schema" and the real cause (`we.json is not a function`) is three layers
  down. Recorded so the next mock does not rediscover it.
- **Reachability is not authorization.** `integration-requests` gated on the
  write roles because "any member can ask"; the only panel that asks lives
  under Settings, which `App.jsx` renders for Admins alone. An endpoint's gate
  matches the narrowest UI that reaches it, or a role the UI never offers can
  act by direct POST.

## 18b31. A Shared Database Does Not Say Which Site Wrote The Row (hard rule)

Origin (8 Sep 2026, state §0.93): a fix to how an inbound email's body is
stored was deployed to dev, verified by Netlify's deploy record, and
exercised by seven real emails over a day — every one stored flat, exactly
as before. Three diagnostics went out chasing the function; none printed.
The fourth wrote its diagnostic onto the row itself, and the row came back
without it: the row had been written by a function that could not have
been dev's. Resend's single webhook pointed at prod. Prod and dev share
one Neon `main`, the dropbox secret was the same on both sites, and the
roster row was in the shared table — so prod's old function accepted the
address, matched the contact and wrote the row, and dev's screen showed
it. Seven observations, a whole day, and the code under test had never
run once.

- **A row in the shared database proves a row was written, not who wrote
  it.** Before verifying any function on dev through data that an external
  system delivers — an email webhook, a payment callback, a calendar push,
  a cron the provider runs — read the provider's configured target FIRST
  and say which site it names. If it names prod, dev's function is a
  bystander, whatever the deploy record says.
- **A deploy record proves the code is deployed, not that it is invoked.**
  Netlify's "rebuilt at 18:39:14" answered the question that was asked and
  not the one that mattered. The question that matters is "what invoked
  the function that wrote this row" — and a webhook has exactly one target.
- **Make the write say which deployment made it, when two can.** The
  diagnostic that finally worked wrote a marker into the row; its ABSENCE
  was the finding. Anything two deployments can both write should carry
  something only one of them would write — or the shared database will
  keep answering "yes" to both.
- **Silence in a log is not evidence until the log is known to speak.**
  Two diagnostics stayed on `console.log` while the function's log page
  showed request rows and nothing else; whether Netlify surfaces this
  function's console output was never established, and the silence was
  read as "not fetched" when it meant "not invoked". Put the diagnostic
  where it can be READ BACK (a row, a response body) before drawing
  conclusions from where it might not appear.
- **Shared secrets widen the blast radius of a shared database.** The same
  `BCC_SECRET` on both sites let prod validate dev's addresses. That is by
  design today (one product, two deployments) and is exactly why the
  target check above is a rule and not a habit.

## 18b32. An Error Is Shown Where The User Is Looking (hard rule)

Origin (8 Sep 2026, state §0.92): the Configure Slack modal's Save went
through the panel's handler, which on a refused PUT restored its snapshot
and wrote the reason into the panel's error banner — rendered at the top of
Connected apps, behind the modal that was still open. Jeff's screenshot: the
dialog with his typed URL, and a red banner above the Integrations heading,
saying the settings were not saved. The modal's own message box served only
Send test message. Both paths were "handled"; one was handled where nobody
was looking. The gate itself had worked — the card behind the dialog still
read Connected with the real webhook — and §0.92's own text had said "the
modal already shows `data.error`", which was true of the test button alone.

The rule: **a refusal is rendered in the surface that asked.** A dialog that
submits shows its own outcome under the control that submitted, before
anything behind it may say a word. Concretely:

- A modal's Save handler owns the error path: `try { await onSave(...) }
  catch (e) { setMsg(...) }`. The host's `onSave` restores whatever
  optimistic state it applied and RETHROWS — it does not both swallow and
  banner, because the banner is behind the dialog.
- One message slot per dialog, cleared when the next action starts. A test
  message and a save refusal are the same kind of thing to the reader: the
  outcome of the button they just pressed.
- A card's action reports on the card; a row's on the row (state §0.94: a
  Request refused on the last catalogue row had put its reason a screen and
  a half up, at the top of the page). A page-level banner is for the one
  failure with no surface of its own — the panel's own load, when nothing
  else is on screen to say it.
- A failed fetch is reported as a failed fetch. "Not available on this site"
  and "Not connected" are claims about the world; a 500 or a 401 supports
  neither (§18b7). Keep the error on the state and let the card say "could
  not be loaded — <reason>".
- The message names what to do, not only what went wrong. "Webhook URL is
  not a valid URL." is `new URL()` talking; "must start with https://" is
  the app talking. Where the parser's message is the only one available,
  check the obvious omission (a scheme, a host) first and say it.

The check, whenever a dialog gets a submit path: refuse it on purpose (a bad
value, a non-Admin session) and look at the screen with the dialog still
open. If the reason is anywhere but inside the dialog, it is not shown.
"Deploy-verified" for a refusal means the status code; "observed" means a
person read the reason where they were looking.

## 18b33. A Helper's Body Reads Only Its Own Parameters — And A Function File Has No Scanner (hard rule)

Origin (8 Sep 2026, state §0.95): `bf4a3c5` (7 Apr 2026) renamed the
parameter of two module-scope helpers in `pipeline-alerts.mjs` from
`profile` to `resolvedProfile` and left both bodies reading `profile`. The
name still existed in the file — `const profile` inside the handler's deal
loop — so the eye found it, esbuild bundled it, `function-imports.test.mjs`
imported it, and Netlify ran it: a ReferenceError on the first deal, a 500
from the outer catch, every hour, on every site, for five months. Nothing
told anyone that the alerts had stopped; the previous handoff had noted only
that "the five pipeline alerts have not fired against dev's webhook".

The rule:

- **A rename is applied to the body.** When a parameter or binding is
  renamed, grep the body for the OLD name before the commit. A hit that
  resolves to some OTHER binding in the file is the dangerous one — it
  parses, it bundles, and it throws only when called.
- **A lowercase helper in `netlify/functions` WAS outside every scanner —
  since §0.107 (9 Sep) it is not.** `check-tdz`'s undefined pass inspects
  Capitalised components under `src/`; its whole-file pass is JSX. Now
  `npm run check:fnscope` (`scripts/check-fnscope.mjs` over
  `scripts/fnscope.mjs`, a proper lexical-scope walk) reports every
  identifier a file under `netlify/functions/` or `db/` reads without a
  binding in any enclosing scope — imports, params, destructuring and its
  defaults, hoisted `var` and function declarations, block `let/const/class`,
  catch and for-loop heads, class names, `arguments`, a function's own name
  — unless a standard Node/ES global names it. Run against `bf4a3c5` it
  flags `profile` in both helpers of `pipeline-alerts.mjs`, both of
  `digest.mjs`, and the manager loop's `resolvedProfile` — every line of
  §0.95 and §0.101, on the day. It is in the verification chain and it gates
  a commit like the others; the one false-positive class found on the live
  tree (a re-export with a source) is handled and pinned in its suite. A pure
  helper in a function file STILL gets a unit test that RUNS it: lift it out of the source with a regex and `new
  Function` (the pattern in `tests/pipeline-alerts.test.mjs`) when the
  module's imports make importing it impossible, or move it to a `_name.mjs`
  sidecar (`_slackWebhook.mjs`, `_inboundText.mjs`) so a test imports it
  plain.
- **A scheduled job needs a heartbeat that someone reads.** The 500s were
  visible in Netlify's function log and nowhere else. Done the same day
  (state §0.98): every scheduled handler is `withHeartbeat('<job>', run)`
  (`_heartbeat.mjs`), the row is site-wide by design (`job_heartbeats`,
  exempt from the org-scoping scan with the reason beside it), and the
  Settings health tile carries a "Scheduled jobs running" check whose label
  names the job that is not. A NEW scheduled function is not done until it
  is wrapped and listed in `SCHEDULED_JOBS` (`src/utils/jobHealth.js`) —
  the unit test that pins the four against netlify.toml will say so.
- **One site runs the jobs (§0.103, 9 Sep — item 36).** Dev and prod share
  one database, so with both sites running every scheduled job every digest,
  every task reminder and the lead-scoring batch ran twice — one per site —
  and each digest email would have gone out twice. (The five hourly pipeline
  signals happen not to: `wasRecentlyAlerted` reads `recommendation_log` for
  the same org, rep, deal and signal within seven days, so the second site's
  run finds the first's record — the first hourly alert ever, 13:00 UTC 9 Sep,
  posted once with both sites running. That is a per-signal accident, not a
  design; nothing else has such a record.) The wrapper is the one gate: a job runs
  only where `JOBS_ENABLED` is exactly `"true"` in that site's Netlify env
  (`jobsEnabled(env)` in `jobHealth.js`); anywhere else the handler is not
  called, nothing is stamped, and the run answers 200 `{ skipped: true }`.
  `job-status` carries `enabled`, and the tile reads "Scheduled jobs not
  enabled on this site (JOBS_ENABLED)" as a FAILING check — on dev that is the
  truth, and on prod a forgotten flag must never read as healthy, which would
  be the §0.95 silence again. Unset means OFF: a new site, a branch deploy, a
  preview never double-sends by default. The flag is set on the production
  site alone, by hand in Netlify; a test that needs the jobs on sets
  `process.env.JOBS_ENABLED = 'true'` around the call and puts it back.

- **A rename lands in every file the commit touched (§0.101, 9 Sep).**
  `bf4a3c5` changed TWO files. §0.95 read `pipeline-alerts.mjs`, fixed it,
  wrote this rule — and `digest.mjs`, with the identical rename and the
  identical bodies, threw for another day: at 08:00 and 13:00 UTC (every
  roster member is 08:00 local, in UTC or Chicago), a ReferenceError, a 500,
  two Netlify retries, six `error` stamps a day on each site's heartbeat row
  — visible the morning after §0.100 in `error_count`, with `last_error`
  already cleared by the next ok hour. When a bug is traced to a commit,
  `git show --stat <sha>` and read EVERY file it touched for the same
  defect before the rule is written. The fix is the same two lines, plus a
  suite that runs the helpers (`tests/digest-prefs.test.mjs`).
- **A `db.select()` row has the schema's columns and nothing else (§0.101).**
  The users table has `role`; `userType`, `digestTime`, `timezone`,
  `notificationPrefs` and `smsNotifications` live inside the `profile`
  jsonb, where `users.mjs` `sanitize()` puts them. The GET flattens the
  profile onto the response, so a component sees `user.userType`; a job
  reading rows sees `undefined`. `digest.mjs` selected its Monday managers
  by `u.userType` — no manager had ever matched — and read the rep loop's
  `resolvedProfile` inside the manager loop, out of scope. A job's
  top-level reads (`user.digestTime || profile.digestTime`) are dead on the
  left and real on the right; the comment that said the fields were "flat on
  the row" described the API, not the table. Read `db/schema.ts` before
  trusting a row field, and pin the read with a source scan (`.userType`
  absent from the file).

The check: `node --test` a suite that calls the helper with the shapes the
job passes; and the mutation harness's `SUITES` list must name the suite, or
its mutants survive silently — the first run here printed three SURVIVED
lines for exactly that reason, which is the harness working.

---

## 18b34. A Self-Service Endpoint Takes An Allowlist Of Fields (hard rule)

**Origin (state §0.109):** `PUT /users?me=true` is the one write in
`users.mjs` every role may call. After a self-supplied `role` polluted the
roster, the role column was pinned to the stored value — a denylist of one.
Everything else in the body still reached the merge, and the profile panel
sends the whole roster row it holds (`{ ...myDbUser, ...updates }`), so every
preference toggle rewrote quota, team, territory, `active`, the quarterly
quotas and the forecast calls from the caller's own copy, and a body written
by hand could set any of them. The profile blob's `userType` copy came from
the body too.

**The rule:** an endpoint a member calls about THEMSELVES declares the fields
they may change — a frozen list in a pure module (`_selfProfile.mjs`) — and
builds its write from `{ id, ...pickSelfEditable(data) }`, with the id
checked against the roster first. A column added to the row builder later is
administrative until someone puts it on the list on purpose. Drop, do not
400: the client has always sent the extra keys, and a refusal would break
every save it makes. A key the list drops keeps its stored value through the
read-then-merge (§18b13); a derived copy of a protected column (the blob's
`userType`) is pinned to the stored value, never taken from the body.

**The check, three-sided:** a unit test asserts every administrative key is
ABSENT from the list, so a mutant that adds one fails; an integration test
sends every administrative key in one body and reads the row back unchanged
(and the same identity's row in another org untouched); and a scan of the
client proves every key the panel saves is ON the list — otherwise a save is
dropped silently, which is the same bug seen from the other side
(`tests/self-profile.test.mjs`, `tests/integration/users-self.itest.mjs`).

---

## 18b35. A Public Page Reads By An Unguessable Token, Never By An Id (hard rule)

**Origin (state §0.111):** the customer's job-status link is the first
unauthenticated read of tenant data in the app. Every other read is behind
Clerk and scoped by the caller's org; a public page has no caller, so the
only thing standing between one org's job and the whole internet is what the
URL carries.

**The rule:** the URL carries a per-row random token (`randomBytes(24)`,
base64url, stored on the row under a unique index, issued once when first
needed) and NOTHING else — no org id, no row id, no customer id. The handler
accepts one parameter, checks its shape before touching the database, finds
the row by the token column alone, and then reads every secondary row BY THE
FOUND ROW'S ORG. A malformed token and an unknown token return the same 404
body, so nothing can be probed. Everything rendered is escaped (these are
customer- and company-typed strings, not ours); the response is
`Cache-Control: no-store` and `X-Robots-Tag: noindex`, sends no referrer
and cannot be framed; the page shows only what the customer needs and never
links into the authenticated app. Which fields appear is a design decision
made once, in the handler, not a pass-through of the row.

**And the switch is the company's:** a workspace that never turned customer
notifications on issues no token and sends nothing (`enabled: false` by
default). SMS is not "on" because code exists for it — it is on when the
site has the credentials, and until then the trail says so.

**The check:** an integration test schedules a job and reads the page by its
token, asserting the escaped strings, the customer-facing status, the
technician's first name only, and the ABSENCE of every id and contact
detail; then asserts a short token, an unknown token and a row id are the
same 404 (`tests/integration/customer-notify.itest.mjs`); a scan pins the
token regex, the token-column read, the headers and the netlify.toml rule's
place above the SPA catch-all (`tests/customer-notifications.test.mjs`).

## 18b36. A Public Write Names No Owner And No Org — The Token Finds The Org (hard rule)

**Origin (state §0.121):** the web-to-lead form is the app's first
unauthenticated WRITE. §18b35 settled how a public READ is authorised — one
per-row random token, nothing else in the URL, every secondary read by the
found row's org. A public write raises what a read does not: the payload is
the visitor's, and a visitor may put anything in it.

**The rule:** the token is per ORG here (one form per workspace), minted
server-side in the settings PUT and only there — the GET and the client
normalise with no mint and can therefore never create one; the stored token
survives every save that does not carry it, and is replaced only by an
explicit rotate. The handler reads from the payload ONLY the fields the form
asked for (`INTAKE_FIELDS`, each trimmed and capped to its column) and
nothing else; the row it writes carries `orgId` from the settings row the
token found and `assignedTo: null, ownerId: null` — always unassigned,
never an owner, never an org, from the caller. A turned-off form, an
unknown token and a malformed token are the same 404 on GET and on POST. A
redirect after a form post goes only to a CONFIGURED https URL, never to one
in the payload (an open redirect otherwise). The write is exactly one
`db.insert`; the function has no `db.update` and no `db.delete`, no
`auth.mjs`, no `apiKeys`.

**Cheap defences are not optional:** a honeypot field (a filled one is
thanked and not stored — a bot learns nothing), a per-token rate limit (in
memory per instance is enough to blunt a burst; the limit runs before
validation so a refused submission still counts), a body cap, escaping of
every rendered value, no-store and noindex on every response.

**The embed is the point, so the frame policy is the opposite of §18b35:**
the hosted form sends no `X-Frame-Options` and NO `frame-ancestors`
directive at all. `frame-ancestors *` is not "anywhere": Chrome reads `*`
as network schemes only and refuses a `file:` or `data:` parent — the
local HTML file a customer opens to try the embed (found in the pane, 11
Sep). Whether the site's static header rule reaches a function response is
read from the deployed headers, not assumed (it does not — read on dev).

**The check:** an integration test seeds two orgs' settings rows, posts by
one token and asserts the row lands in THAT org unassigned and unowned with
the org's source, the other org empty, the honeypot thanked with no row, a
payload naming an owner and an org stored unowned in the token's org, and
the three 404s (`tests/integration/lead-intake.itest.mjs`); scans pin the
token-column read, the enabled guard, the `orgId: org.orgId` insert, the
null owner lines, the single insert, the absence of `auth.mjs`, both
settings halves, the mint only in the PUT, and the rewrite's place above the
catch-all (`tests/lead-intake.test.mjs`).

## 18b37. A Rule Engine Is A Write Path — Its Actions Take Allowlists, Its Vocabulary Is One List (hard rule)

**Origin (state §0.124):** the automations engine's `update_field` action
wrote whatever column the rule named — `set({ [p.field]: p.value })` — so an
Admin of org A could save a rule with field `orgId` and value `org_B` and
the next matching event would move A's deal into B's workspace. Nothing in
the gates saw it: the engine was on the org-scoping test's skip list, the
write itself was scoped by `orgId`, and the column name came from
configuration, not from a request. The same batch found the Settings panel
offering two triggers nothing fired, a condition field typed free-text (a
typo is a rule that never matches), and a task action writing two keys the
table has no column for (drizzle drops them silently).

**The rule:** configuration that drives a write is a request. A rule's
action names a column from an ALLOWLIST kept beside the engine (§18b34 for
a self-service endpoint; the same shape here), with the value coerced to
what the column holds — never a column name from the rule, never the org,
the owner, the rep, the stage or the money. A rule's task is stamped like a
rep's task: `orgId` from the event's org, `ownerId` resolved in THAT org's
roster by the assignee's name (no match → unowned and said so; ambiguous →
unowned, reported) — or, since §0.126, by the id the panel's roster picker
stored, when that id is in the event's org (an id from any other org is a
miss; the name path then decides); the payload names no owner. Every write the engine makes
carries the org, so the engine is scanned by the org-scoping test like any
endpoint — a skip-list entry is a debt, not an exemption. The trigger
vocabulary is ONE exported list the engine refuses to fire outside of (fail
closed, the `slackAlertEnabled` precedent), and the panel renders that list:
a trigger offered is a trigger fired, and a field offered in a condition is
a field the event carries. A signal computed for a human channel (email, SMS,
Slack) fires the engine at the same point, under the same dedup — a signal
the product already raises must be able to act.

**The check:** an integration test seeds two orgs with a user of the same
display name in each, a rule in each on the same trigger, and fires ONE
org's event: the task lands in that org owned by that org's user, the other
org has no task and its rule no run; a rule whose `update_field` names
`orgId` leaves the row where it was and the run record says why
(`tests/integration/dispatch-automations.itest.mjs`). Unit scans pin the
allowlist, the trigger check before any read, the roster resolution, the
org-scoped counter, the panel's import of the shared list and its SELECT
(`tests/automation-events.test.mjs`); nine mutants cover them.

## 18b38. A Load That Fires On Mount Keys On An Active Org — Never On A Timeout (hard rule)

**Origin (state §0.125):** three loads — spiff claims, coaching notes, the
calendar strip — fired from mount on `waitForToken()` alone, and
`waitForToken` gave up after eight seconds and resolved anyway, by its own
design ("dbFetch will send without token and get 401"). Whenever no org was
active for that long (the in-app sign-in with its MFA step; the no-organization
page) all three went out unauthenticated, 401'd, and never retried — a `[]`
effect runs once; the 200 seen after it was the next page load. §9 carried it
for four days as "a load-order race, unread as to which hook fires early". The
same read found none of the three reloaded when the header's
OrganizationSwitcher changed the org: the previous org's rows stayed on the
client until a refresh.

**The rule:** a load is gated on the state that makes it valid — a signed-in
ACTIVE session and an active org (`activeOrgId` in App.jsx; the main load's
own gate since 0.65) — never on "the token is probably there by now". A
mount-only effect (`[]`) that fetches org data is wrong twice: it can fire
before the org (unauthenticated) and it cannot fire again for the next org
(stale — another tenant's rows on screen). So every org-scoped load keys on
the org id, clears what it holds when the org changes, and drops a load in
flight. A wait with a timeout may resolve on give-up only if it says so out
loud, and a caller that reaches that line is a bug to fix at the caller, not
by lengthening the wait.

**The check:** `tests/auth-gated-loads.test.mjs` pins the gate, its position
after the active-session user and the token getter's effect, each of the three
effects' gate / clear / deps, and `waitForToken`'s behaviour and loud give-up;
five mutants. Before adding a fetch that runs on mount: does it key on
`activeOrgId`? If it must run signed-out (a public route), it does not go
through `dbFetch`.

## 18b39. One Token Object — Import It, Never Declare It (hard rule)

**Origin (state §0.130, 14 Sep 2026).** Every non-Settings file declared its own copy of the design-token object — 24 files, and `ReportsTab.jsx` eight (`T`, `T2`, `T2b`, `T2c`, `T3`, `T4`, `TS`, `T_ACTIVITY`, plus `const T = TS` aliases per template). The colours never drifted. Everything else did: five spellings of the serif stack (`"Source Serif 4"` and `"Tiempos"` first in some — faces the app never loads, so every screen rendered Georgia regardless), one radius (`r: 4` in Dispatch, 3 everywhere else), four alias keys (`ink2`, `ink3`, `surface3`, `radiusMd`) meaning the same values as `inkMid`, `inkMuted`, `bg`, `rMd`, and **three reads of keys a copy never had** — `T.r` in HomeTab (a box and a button with no radius), `T.info` inside the report templates whose `TS` had no `info` (a Call's colour falling to grey; a chip's `borderLeft: 3px solid undefined`, no border) — each silently `undefined`, no error anywhere. A "design update" against that tree would have had to be applied 32 times.

**The rule.** `src/tokens.js` is the only token literal. A file that needs a token imports it — `import { T } from '<relative>/tokens.js'` (Settings: `settings/shared/tokens.js`; Documents: `documents/atoms.jsx`; both re-exports). A local `const T = { … }`, a second object spread over `T` with a changed value, or a read of a key `T` does not have is a defect, and `tests/single-token-file.test.mjs` fails on each (the harness carries four mutants for it). A deliberate divergence is a one-line derived object with a comment naming it — `DispatchTab`'s `const T = { ...TOKENS, r: 4 }` is the only one — never a copy.

**Why a scripted migration and not a find-and-replace.** The copies were parsed (`@babel/parser`), every `<Name>.<key>` read was resolved to the innermost declaration in scope (the `const T = TS` aliases included), and the value it resolved to was compared with the canonical value before a byte was written; the three undefined reads above were the only differences, each accepted by hand and named in the state doc. The same method is the template for any token-shaped consolidation: prove value identity per read, then rewrite.

---

## 18b40. A Drop Is A Write Path — It Runs The Form’s Gates, Sends Only What Changed, Never Sets Status (hard rule)

**Origin (state §0.134, 14 Sep 2026).** Drag-to-reschedule on the dispatch week board. The gesture is a PUT to the same endpoint the crew builder’s Schedule now and the job record’s Save use — and that endpoint has teeth: `status` drives the status history, the customer confirmation (§0.111) and the release of reserved equipment (§0.116); `assignedTechId`/`coTechIds` are the crew; `scheduledDate` is the appointment. The first temptation was a body of "the whole row as the card knows it" with `status: 'scheduled'` — which would have promoted a held crew (§0.115) to a confirmed appointment with no time, and, on a job dragged with `'unscheduled'`, released its equipment. The Kanban drag had taught the same lesson earlier: "a separate PUT that would otherwise have skipped the prompt silently" (state §0.4 — the Closed Won claim prompt, and a bare `.catch(console.error)` that made a failed stage change look successful).

**The rule.** A drag-and-drop that persists something IS the form that does the same write, and is built as one:

1. **The same gates, in the same words.** Whatever the form refuses before its PUT (rostered, not out, inside the shift, a partial block, double-booked; the equipment gate for a new day), the drop refuses too — and whatever the form only confirms (the soft eligibility blockers behind Override), the drop confirms through the same dialog. A gate that lives in one path and not the other is a way round it.
2. **A partial body: only the fields the gesture changes.** The row is the technician, the column the day: the body is the date and/or the crew. Never `status`, never the time, never "the row as the client holds it". Every dispatcher PUT merges per field (`if (f in data)`), so a partial body is the safe one; on an endpoint whose `sanitize()` is a full-row builder (the users/leads merge-first pattern in CLAUDE.md) the same rule means read-then-merge on the server before anything partial is trusted.
3. **A no-op is nothing.** A drop on the same cell writes nothing, audits nothing, says nothing.
4. **The rules are a pure module with the surface’s reads injected** (`lookup(techId) → { tech, shift, dayBlocks, rivals }`), so they are tested by RUNNING with fixtures — the swap, the no-op, each refusal in its words, the co-tech’s day off on a day move — and mutated (a promoted status, a gate gone, a swap that adds). The board and the handler are source scans.
5. **Adopt the server’s row, both copies.** The client row follows the server’s answer (the date, the notification trail, the token); the raw copy the Jobs view reads follows too. An optimistic move that survived a refused write is how "it didn’t save" starts.
6. **Refuse where the gesture happened.** A strip above the grid, `role="alert"`, dismissable; the result `role="status"`, timed. Never a console line.

## 18b41. A Box That Says "AI" Reads Its Prompt — A Fixed Answer Is A Stub, And A Stub Is Labelled, Not Dressed (hard rule)

**Origin (§0.139, 15 Sep 2026).** The report picker’s "Ask AI" box took a prompt, showed the SAME hard-coded "stuck deals by rep" chart for every sentence, dressed it with seven fixed chips and a "Fields below were inferred by AI" note, and admitted the truth in one small line: "The report builder does not interpret prompts yet". Jeff typed "Quota Performance By Rep", got the stuck-deals chart with his words as its title, and reported the feature as broken — which it was, by the only measure that matters: what the surface promised. Read against the code before building: the engine had no row filters either, so the one report the stub drew could not be built by hand.

1. **A prompt surface interprets, or it does not exist.** A control that reads as intelligent — "Ask AI", "Generate", "inferred" — must turn its input into the definition the feature runs on, or it is removed. A stub that always answers the same thing is not a preview of a feature; it is a wrong answer with a confident face. If the reading is not built yet, the box is not shown.
2. **Read into the feature’s own vocabulary, never beside it.** The interpretation emits only ids the engine already resolves (`fieldsFor`, `filtersFor`), validated by the same allowlists a hand-built definition passes through, and lands in the SAME builder — every part a chip, editable, run by the real engine. A parallel renderer for the "AI" path (the stub had its own computation and its own chart) is how the fake stayed plausible for two months.
3. **What cannot be done is said, in words, where the answer is.** Every phrase the reader recognises but cannot honour (win rate, forecast accuracy, a field the source lacks, a span of quarters) is NAMED in the result and shown under the reading — never silently dropped, never mapped to the nearest thing. A default that stood in for something unread is said too ("Only the data source was recognised").
4. **The examples the surface offers are ones it reads in full.** A starter chip is a promise; a test proves each starter produces a definition with no "cannot do" note. The old starters named fields the builder does not have.
5. **Deterministic first; a model is an enhancer with a fallback, never the only path.** The interpreter is pure, keyless and tested by running it over sentences (the mutation harness pins the source, the filters, the fiscal calendar, the notes). A Claude-backed reading, if added, returns the same shape, is validated by the same allowlists, and falls back to the local reader when no key is configured — a feature a customer paid for does not stop working when an API key lapses.
6. **The org’s own words come from the org, never from a guess.** Stage names and roster names become filters only when the caller hands them in (`opts.stages`, `opts.people`), a first name only when one person carries it. "Karen" in a workspace with two Karens filters nobody.


## 18b42. Every Write Path Writes The Audit Log — Through `auditAs`, Named, With The Word For What Happened (hard rule)

**Origin (§0.143, 15 Sep 2026).** Jeff opened the Audit log with a day’s work behind him and found fourteen rows. Thirteen endpoint files wrote audit rows — mostly for the `*.cleared` mass-deletes — and thirty-one that insert, update, delete, send, or hand data to a model wrote none: saved reports, deliveries, Claude’s readings, quotes, quote emails, webhooks, API keys, documents, exports, backups (a restore!), merges, invites (the UI’s warn-list named `user.invited`; no code ever wrote it), and all of dispatch. A log that records the rare mass-delete and not the daily quote is not an audit log; it is a false comfort — a customer’s compliance officer reads "fourteen rows" as "fourteen things happened".

1. **A function that writes the database, sends something out, or hands data to a model writes an audit row, in the same request, after the write.** `tests/audit-coverage.test.mjs` scans every `netlify/functions/*.mjs` for `.insert(` / `.update(` / `.delete(` and fails the suite by name when the file has no `auditAs(` or `writeAudit(`. The exemptions are an allowlist WITH A REASON each (the log itself; a job whose heartbeat is its record; an inbound webhook whose activity is its record). A new exemption is a documented decision, not a way past the test.
2. **Through `auditAs(orgId, auth.userId, fields)` — never `writeAudit` with a caller.** `auditAs` resolves the display name and writes the Clerk id with it; the name lookup cannot throw into the write path. `writeAudit` is for the two callers with no signed-in user, and they name themselves (`'Report delivery job'`, `'Web form'`). A row whose Actor reads a bare id or "System" for a signed-in caller is a bug.
3. **The action is the word for what happened, a literal in the file, under 50 characters.** `entity.verb`: `quote.submitted`, not `quote.updated` with the status in the detail; `webhook.secret_rotated`, not `webhook.updated`; `dispatch_equipment.checked_out`, not a field list. A status PUT is named by the status it sets (`QUOTE_STATUS_ACTIONS`, `CLAIM_STATUS_ACTIONS`). The test pins every word as a literal so a template string cannot hide one.
4. **The entity is the thing a reader would look for; the detail says what changed, in words, and never a secret.** A line item’s row sits on its job, a location’s on its customer, a merge’s on the survivor (the archived name and the undo id in the detail). A delete reads its name BEFORE the delete (or `.returning()` it) so the row is not "deleted <id>". The detail carries a webhook’s HOST (never the path or query), an API key’s prefix (never the key), an export’s scope and size, a restore’s counts, a status transition as `from → to`. Nothing a customer typed into a secret field, ever.
5. **One send, one row.** A job that delivers what an endpoint also sends audits only its OWN trigger (`trigger === 'schedule'`); the endpoint’s Send now is the endpoint’s row. Two rows for one email is a log that cannot be counted.
6. **The UI knows every entity type.** `mapEntityTypeToCat` in `AuditDetail.jsx` names each type’s category; the test pins the map. An unknown type falling into the default category is a row the filter hides.


## 18b43. An Integration Suite’s First Statement Points The Client At The Test Database — And A Scan Pins It In Every Suite (hard rule)

**Origin (§0.145, 15 Sep 2026).** `db/index.ts` builds the Neon client at import from `NETLIFY_DATABASE_URL`. Eighteen suites reassigned it from `DATABASE_URL_TEST` as their first statement; the nineteenth did not. On CI, with no `.env`, the client threw and the job was red for days. On the developer’s machine, where `.env` names the APPLICATION database, that suite deleted and wrote its rows in live data on every `test:int` — and reported green, because the schema guard checks columns and the app database has them all. Nothing in the run said which database it had touched.

1. **The refusal and the redirect are the first two statements of every `*.itest.mjs`, before any `import`.** `if (!process.env.DATABASE_URL_TEST) throw …` then `process.env.NETLIFY_DATABASE_URL = process.env.DATABASE_URL_TEST;`. An `import` above them has already built the client on whatever the shell held. A dynamic import later in the file does not excuse the order — the next edit adds a static one.
2. **A scan, not a convention.** `tests/itest-targets-test-db.test.mjs` reads every suite and fails by name on a missing refusal, a redirect out of order, or a redirect after the first import; it also checks the `test:int` script names every suite in the directory. A convention held for eighteen files and failed silently on the nineteenth.
3. **"It passed locally" is not evidence the suite touched the test database.** A green local run proves the queries ran somewhere with the columns. When a suite is new, read its target once: the test database should show its rows (or their absence after cleanup) and the app database should show nothing of its names — read-only, both.
4. **The hard rule applies to tests.** A `DELETE` in a `before` hook is a delete; the CLAUDE.md rule against destructive commands on live data does not exempt code that meant to hit a different database.

## 18b44. A Mirror Column Has One Writer — The Endpoint That Owns The Truth It Mirrors (hard rule)

**Origin (§0.149, 16 Sep 2026).** `dispatch_jobs` carried `invoice_amount`, `invoice_status` and `invoice_paid_at` from the day the table was made. Nothing wrote them, the board read the amount as the job’s value, and the dispatcher PUT accepted all three from any client — so the day an invoice record arrived, a job’s figure could have come from two places: the invoice, and whatever a form sent. A number that can be written from two places is two numbers, and the board would have shown whichever wrote last.

1. **Name the truth and the mirror, in the schema comment.** The invoice row is the truth; the three job columns are a convenience for the board. A reader of `schema.ts` learns which is which without opening an endpoint.
2. **The truth’s endpoint is the mirror’s only writer.** `invoices.mjs` re-mirrors the job after EVERY write — create, edit, issue, pay, void, delete. `dispatch-jobs.mjs` drops the three names from its PUT allowlist and leaves them out of its upsert’s `set` (`invoiceAmount: undefined …`), so an existing job re-POSTed keeps them. The same shape as `jobNumber` and `publicToken`: server-owned, client-read.
3. **Mirror from a query, never from the row in hand.** The mirror follows the job’s LIVE invoice (not void), newest first. A void invoice clears the mirror to none; a new invoice fills it; a deleted draft leaves whatever live row remains. Writing "the invoice I just saved" onto the job would have stamped a voided one’s figure as the job’s value.
4. **Return the mirrored row on the same response.** The client adopts the server’s job alongside the invoice. A second fetch "to refresh the value" is a race with the next write.
5. **Pin it, both ways.** A scan that the three names are absent from the allowlist and present as `undefined` in the upsert; a mutant that puts them back; an integration test that reads the job row after each invoice write. tests/invoices.test.mjs and tests/integration/invoices.itest.mjs are the pins.

## 18b45. A Read Scope Is Not A Write Authority — A Role That Reads Everything Gets A Read Predicate, Never The Ownership Bypass (hard rule)

**Origin (§0.151, 30 Sep 2026).** Jeff: a Dispatcher reads the CRM to see what was sold and changes none of it. The six CRM GETs decided who reads the whole org with `canSeeAll(role)` — and `canSeeAll` is also what `mayMutate()` and `assertOwnership()` read to let a caller change a record someone ELSE owns. Adding the Dispatcher to `canSeeAll` would have handed them the reads AND the ownership bypass on every write, leaving `requireWrite` as the only thing between a reader and every record in the org — one gate where there had been two.

1. **Two questions, two functions.** `crmReadScope(role)` answers "what does a GET return" (`'all' | 'own' | 'none'`); `canSeeAll(role)` answers "may this caller change a record another user owns". They sit side by side in `src/utils/roles.js` and neither is defined in terms of the other.
2. **A GET reads the read scope; a write reads the write authority.** No GET branch tests `canSeeAll`; no write branch tests `crmReadScope`. A new whole-org reader (an auditor, a finance role) joins `crmReadScope` alone.
3. **The client mirrors both, separately.** `canEditCrm(role)` — the tabs' `canEdit` — is the write list, the same array `requireWrite` allows; the Reports tab's `readsWholeOrg` is the read scope. A button shown to someone the server refuses is a bug report waiting to happen; rows hidden from someone the server granted are a silent one.
4. **Each absence fails closed in its own direction.** An unrecognised role reads `'own'` (its own rows, and it owns none) and writes nothing (the allowlist). A Technician reads `'none'`: their tabs are My Jobs alone, and the CRM rows they used to receive were the unassigned ones, by accident.
5. **Pin both, and pin them apart.** tests/roles.test.mjs runs the two functions and scans the six GETs for `crmReadScope` with no `canSeeAll` in the read; tests/role-vocabulary.test.mjs asserts `canSeeAll('Dispatcher') === false`; tests/integration/roles-crm.itest.mjs proves a Dispatcher reads all six and every write is refused with the row read back, through the REAL gate (the suite mocks sign-in only). The mutants widen `canSeeAll`, drop the Dispatcher from the read scope, and let the gate pass them.

## 18b46. A Module Has One Gate — Every Endpoint Behind It Calls It, And The Client Asks The Same Function (hard rule)

**Origin (§0.152, 1 Oct 2026).** Jeff: sales reps "should not have dispatch power", and a Dispatcher role runs it. Dispatch had no gate of its own: eight endpoints called `requireWrite` (any non-ReadOnly role writes), one (`quote-to-job`) read the module switch itself, and the client decided whether to show the tab in FOUR places, each reading `settings.dispatchEnabled` directly. A rule spelled out ten times on the server and four on the client is fourteen rules; the first one to drift is a rep scheduling crews.

1. **One function decides, on both sides.** `dispatchAccessOf(role, extra)` (`src/utils/roles.js`, pure) returns `none | full | tech | read`. The server's gate and the client's tab, mobile nav, redirect, mount and quote-card button all read it. A new role or a new switch changes one function.
2. **One gate per module, called by every endpoint behind it.** `_dispatchGate.mjs` reads the org's settings once and hands them to the pure decision (`_dispatchDecision.mjs`); each endpoint calls it where it used to call `requireWrite`, and returns `gate.response` when there is one. An endpoint keeps only what is its own (a Technician's field whitelist, an Admin-only delete).
3. **The module switch is enforced on the server, for everyone.** OFF answers 403 for an Admin too — a CRM-only workspace grows no dispatch rows and reads none. The client hiding the tab was never the boundary.
4. **A failed settings read is a 500, never a default.** The gate returns the 500 instead of throwing, because its callers invoke it before their own try/catch.
5. **Each refusal names its rule** — module off, rep, technician, read-only, unrecognised — five sentences; the body is the only way to tell them apart.
6. **Pin the decision by running it, and the wiring by scan and at run time.** tests/dispatch-gate.test.mjs RUNS the rule and the decision for every role and switch (the gate itself imports db/index.js, so the decision lives apart where `npm test` can load it) and scans the ten endpoints and the four client places; tests/integration/dispatch-access.itest.mjs hits every endpoint as each role in an org with the module on, one with reps allowed, and one with no settings row at all.
7. **A one-time client effect keys on state, never on the `settingsReady` ref.** `useSettings`'s `settingsReady` is a REF — always truthy as an object, flipped inside a `setTimeout`, and it re-runs nothing. The first cut of the Dispatcher's landing waited on it, ran against the client's DEFAULT settings (module off), marked itself done and never landed — caught in the pane. Key such an effect on the condition itself (`canUseDispatch(...)` becoming true) and mark it done only when it acts.

## 18b47. A Mirror Keeps What A Newer Version Wrote — An Unknown Value It Already Holds Is Left Alone; Any Other Unknown Takes The Default That Discloses Least (hard rule)

**Origin (§0.153, 1 Oct 2026).** The dev site — a deploy older than the Dispatcher role, on the same database and the same Clerk as localhost — ran "Sync from Clerk" in Accelerep QA. `users-sync` mirrored Clerk's role through `isAppRole(rawRole) ? rawRole : 'User'`; its list had no Dispatcher, so it wrote `'User'` over Ryan's row. The badge read "Sales Rep", the dev site's picker offered no Dispatcher, and the role was "corrected" to Read only — in Clerk, which holds one role per person: three orgs changed because one stale deploy synced one.

1. **Two versions share one database whenever a change is ahead of a push** — localhost and the dev site every batch, dev and prod between a ship and the next. Code that rewrites a stored value from an authoritative source must expect the source to hold a value a NEWER version introduced.
2. **An unknown value the mirror already holds is left alone.** The mirror is written only by code that validated the value, so a row holding the same unknown value as the source was written by a version that knew it. `mirrorRoleOf` keeps it.
3. **Any other unknown value takes the default that discloses least — chosen by reading who consumes the column.** The roster's role picks the Monday team digest's and the renewal alerts' recipients (`digest.mjs`, `pipeline-alerts.mjs`); keeping an Admin row behind a mistyped demotion would keep emailing the team's numbers, so a typo still mirrors as a rep. "Keep the old value" is not automatically the safe default; read the consumers first.
4. **Never copy the unknown value in.** The vocabulary stays closed (users.mjs: "validated, not copied"); the divergence is reported (`roleDrift`) and shown (the Users screen's sync message).
5. **Do not administer from a deploy behind the code under test.** Until the push, user and role changes and "Sync from Clerk" happen on localhost only.
6. **Pin the rule by running it.** tests/roles.test.mjs RUNS `mirrorRoleOf` for every case (a known role, none, the kept newer value, a typo against an Admin row, a new row); tests/role-vocabulary.test.mjs scans the sync for the call, the row found first and the old coercion gone; four mutants break one case each.

## 18b48. A Record's Children Follow Its Access — A Quote Is Seen And Changed Where Its Deal Is, By The Stored Link (hard rule)

**Origin (§0.155, 2 Oct 2026).** Deals were scoped on the server (§0.151); their quotes were not. `quotes.mjs` sent every member every quote — the Quotes tab filtered a rep's by the creator's NAME — and its PUT checked no owner, so another rep's quotes reached a rep's browser and she could change them. An accept pushed the quote's value to the deal named in the BODY.

1. **A child record's read and write are its parent's.** A quote, the email that sends it and the job it became ask `dealAccess` (`_dealAccess.mjs`): read = `dealVisibleTo`, the deals list's own rule (src/utils/roles.js); write = read AND the write authority or the owner (`mayMutate`). No parallel rule for the child — the deals list and its quotes cannot disagree.
2. **The STORED link decides, never the body's.** A PUT's `opportunityId` is ignored; the access check and every side effect (the accepted value) use the row's own deal. A child cannot be moved to a parent the caller may change by naming it.
3. **What the caller cannot see answers like what does not exist** — 404, for a read, a write, an email and a job card alike. "It exists, but not yours" is a probe's answer.
4. **One rule for the server and the screen needs a "real move" for buttons.** The server must allow a save that keeps a status; a button that reuses that answer offers "Submit" on a quote already submitted (caught in the pane). Buttons ask `quoteMoveAllowed`, the server `quoteTransitionRefusal` — the same rule, asked two questions.
5. **Pin it by running it and by acting as every role.** tests/roles.test.mjs and tests/quote-rules.test.mjs RUN the rules; tests/integration/quotes-access.itest.mjs reads, writes, approves, sends and emails as each role with a second org that must see nothing.

## 18b49. A Number On A Screen Is Read From The Record Of What Happened — Never A Constant, Never The Current State Standing In For History (hard rule)

**Origin (§0.156, 2 Oct 2026).** The Approvals tab printed fixed sub-labels ("0.7× baseline", "5% error bars for my role"), took its approval rate from a slice of a status list, counted a quote sent to the customer as approved and named the VIEWER's role as an approver; a quote's Activity panel invented its history from the current status; the tier panel timed an approval from the row's last update — after it. Jeff: "fix the stat cards to show actual data".

1. **A statistic, a history, a "decided by" is read from the record** — the server's audit events, written as the thing happened — and filtered by the same visibility rule as the records it is about (quotes.mjs `?activity=true` reads only the caller's quotes' events). The current status is not history, a constant is not a measurement, and the viewer is not the actor.
2. **A record a number trusts is written only by the server.** An endpoint that lets a client write to the log refuses the events the server owns (audit-log.mjs refuses `quote.*`, §0.156).
3. **Nothing on record reads as nothing** — "—" and "no decisions in 30 days", never "0%", never an invented baseline.
4. **A window has a start and no end.** The log's time is `timestamp without time zone`, which a machine off UTC reads as its local time — five hours LATE on a Chicago laptop — so a recent event reads as the future, and an end at "now" drops it (the integration suite caught it). Durations are safe: both ends read alike.
5. **A decision names only its status.** A PUT that moves a record carries none of its content: the server merges over the stored row, and a screen's older copy would be written back (an approver's screen loaded before the rep's last change).
6. **The list the server sends is the list.** A screen that re-filters it by a second list hides what the rule grants — the Quotes tab filtered a Manager by settings.users' managedBy, and with none set he had nothing to approve (caught in the pane as Bob). The Manager's narrowing is the deals rule's, applied by the server.

## 18b50. A Setting Is Offered Only Where It Is Enforced — Cleaned Where It Is Saved, Checked Against The Org, Applied Where It Is Read (hard rule)

**Origin (§0.157, 2 Oct 2026).** Settings → Approval tiers named approvers the app routed to none of, and offered an SLA, a fallback, six triggers, "advanced rules", a co-approver and two "view" links that nothing read. An Admin who set them got nothing — and believed otherwise. Jeff: "an admin setting for approvals … by role or by person … the approver and backup".

1. **A control nothing reads is removed, not left.** A setting is offered only once the code that enforces it exists; until then the page does not show it (the triggers went; the SLA stays visibly what it is until (E2) reads it).
2. **One rule cleans it, enforces it and draws it.** `cleanApprovalTiers` (what settings.mjs stores and the page sends), `mayDecideQuote` (what quotes.mjs enforces and the buttons offer) and `tierApproverWords` (what every screen says) live in src/utils/quoteRules.js — a screen never offers a decision the server refuses.
3. **A setting that names people names them by app id, and is checked against THIS org's roster when it is saved.** settings.mjs refuses an id from another org, a user who does not hold the role, a deactivated one (400) — the cleaner cannot read the roster, the save can.
4. **A change of mode never quietly lowers a control.** A save that would stop a tier needing approval is the Admin's explicit choice: by role prefills a Manager; by person refuses the save until each tier names someone or says "No approval needed".
5. **The reader survives the named person's departure.** An Admin always decides; a name the roster cannot resolve reads "a former approver", never a raw id; a refusal names who decides.
6. **The defaults are one list.** A page's starting values are the server's defaults, drawn from the same module — never a copy. Settings → Approval tiers kept its own starting tiers with reminder times the server's defaults did not have, so an org that never saved was shown reminders the job never sent (§0.158; Jeff: "Remind at 8h/24h/48h").

## 18b51. A Link Into The App Survives Sign-In — Held In The Tab, Used Once (hard rule)

**Origin (§0.158, 2 Oct 2026).** The approval email's "Open the quote" — `/?quote=<id>` — opened the quote for someone signed in, and not for someone signed out: Clerk's `<SignIn />` ends with a full page load of its after-sign-in URL — "/" when the app sets none (read in the clerk-js 5.128 the app loads: `RedirectUrls` → `navigate` → `window.location.href`) — and that load drops the query. Jeff: "it takes me to accelerep login but does not navigate all the way to the quote".

1. **What a link carries is taken once, on mount — from the URL, else from the tab** — and the URL's copy is written to the tab's sessionStorage at once, before the sign-in screen can reload it away (`takeQuoteLink`, src/utils/approvalNotices.js).
2. **It is used once the signed-in data has loaded, then dropped** — from the tab, and from the URL (its own parameter only; any other stays) — so a refresh or a later visit does not reopen it (`dropQuoteLink`).
3. **Only an id waits, checked to the shape of one — never data.** Whether anything opens is the server's list's to say: another org's or another rep's record is not in it, and nothing opens.
4. **The tab, not the browser.** sessionStorage, not localStorage: a link belongs to the tab it was opened in, and must not reopen in another tab or after a restart.
5. **Test it signed OUT.** A signed-in check proves nothing about sign-in: sign out, open the link, sign in, and read where the app lands (§0.158 did, as Karen). The older emails' `?deal=` links need a reader and all of this (state §9).

## 18b52. A Job That Reads Every Org Finds A Person Inside The Row's Own Org — By App Id, Never By A Name (hard rule)

**Origin (§0.159, 2 Oct 2026).** Found while verifying §0.158. The three jobs prod runs every hour or minute (`JOBS_ENABLED` is "true" there) read every org's users, deals, tasks and activities in one pass — a scheduled job is the one reader across tenants — and then found people across all of them by DISPLAY NAME. `pipeline-alerts` built `userByName[u.name] = u` (the last row of ANY org won, and the next line skipped the deal when that row was another org's, so the real rep's alerts silently stopped), took a rep's manager from every org's `managedReps` and team names (org B's Manager on a team called "Enterprise" was emailed org A's deal — reproduced in the test database) and pooled every org's stage history into the "stuck" threshold. `digest`'s Monday team digest listed every org's reps to every Admin (19 in the test database). `task-reminders` texted a member every task whose assignee carried their name, in any org (reproduced: org A's Karen Russell texted org B's task). The shared database holds the same names in several orgs — "Jeff Russell" in six. The org-scoping scan covers mutations only; a READ keyed across orgs went unseen.

1. **Group by org first; build every lookup per org.** A job that reads across tenants partitions its rows by `orgId` before it builds one map, and every lookup goes through the row's own org (`rostersByOrg`, `perOrg`, `activitiesByDeal` in `netlify/functions/_jobRoster.mjs`). A row with no org belongs to none.
2. **A record's person is its OWNER, by app user id, in its own org** (`ownerOf`, `ownedBy`). The display-name column (`salesRep`, `assignedTo`, `author`) is never a key — a name is unique in no org (18b20). An unassigned record has no one to notify; that is the ownership model, not a gap.
3. **A manager is an active Manager of THAT org** — not another org's on a team of the same name, not a deactivated one, not another role whose profile carries `managedReps`.
4. **Anything computed over many rows is computed per org** — an average, a threshold, a count. One org's history never moves another org's alert (CLAUDE.md: no org's data may affect another org's behaviour).
5. **A job runs at an instant a test can hand it** — `export const run<Job> = async ({ now = new Date() } = {})`, the scheduled `run` calling it with nothing — and keeps no module-level clock (pipeline-alerts' `today` froze at a warm container's first run).
6. **Pin it three ways.** `tests/job-roster.test.mjs` RUNS the helpers with two orgs that share every name and team (the second org's rows last, so a last-row-wins lookup fails), scans the jobs, and holds a guard over every job in `SCHEDULED_JOBS` for a lookup keyed by a display name — a new job meets it the day it is listed. `tests/integration/scheduled-job-orgs.itest.mjs` runs the three jobs against the test database at a Monday 14:00 UTC with every sender recording, and proves each message reaches the record's owner and that org's manager and that nothing crosses — 0/8 on the old lookups, 8/8 after. Twenty-three mutants each put one cross-org or by-name lookup back.

## 18b53. A Redirect Flow's State Is The Server's — Minted For A Signed-In Caller, Signed, Short-Lived, Bound To The Browser That Asked (hard rule)

**Origin (§0.160, 3 Oct 2026 — the cross-org audit's first CRITICAL).** calendar-oauth-start took `userId`, `orgId` and `userRole` from the query string and sent them through the provider as unsigned base64; the callback — no auth, though the start's comment said it re-validated with verifyAuth — wrote the connection for whatever org the state named. Anyone could put their calendar into any org, and a victim who consented to someone else's link connected theirs into that org.

1. **The start is signed in.** A browser redirect carries no token, so the start is a POST from the app that answers with the provider's URL, and the browser goes there. Who, which org and which role come from verifyAuth — never from the request.
2. **The state is signed by the server and expires.** HMAC with a key derived in its own namespace (never an encryption key reused as is), ten minutes; the callback verifies it BEFORE it exchanges the code or writes anything, and writes only for the org and user the verified state names.
3. **The state is bound to the browser that started it.** Its nonce rides an HttpOnly, SameSite=Lax cookie scoped to the callback's path; a state whose nonce this browser does not hold is refused, so a link someone else started cannot be completed in your browser; the callback clears the cookie at every exit, so a state is used once.
4. **An unverified state may name only what the return page shows** — provider, scope, surface, each allowlisted again — never who and never which org.
5. **The callback logs no query** — it carries the provider's one-time code.
6. **A static guard proves it can see what it guards.** The org-scoping test is handed the shapes it must refuse — a `db` chain split across lines, a raw SQL write — and refuses them; its one-line pattern had hidden three writes by id alone.
7. **Test it as an attacker would**, against the real database: the old unsigned state, a genuine state with its org swapped, a genuine state from another browser, an expired one — each refused, the other org's row unchanged, the code never exchanged (tests/integration/calendar-oauth.itest.mjs).

## 18b54. A Public Token Is The Server's, And One Org Holds It — A Uniqueness The Code Relies On Is Declared In The Schema (hard rule)

**Origin (§0.161, 3 Oct 2026 — the cross-org audit's second CRITICAL).** The settings save took a web form's token from the payload whenever it was well-formed, so an Admin of any org could save another org's public token (it sits in that org's website embed); the public intake then resolved the token with no LIMIT and no exactly-one check, and answered for whichever row came first. §6.0a7 recorded the settings unique index as applied in the Neon SQL editor; on 2 Oct neither database had it, and db/schema.ts had never declared it.

1. **A public token is minted, kept and rotated by the server alone.** A save takes it from the stored config, a fresh mint or an explicit rotate — never from the request, even when the request sends back the value the GET gave it.
2. **The lookup answers only when exactly one row holds the token.** Fetch two: one is the answer, two is no answer — never a coin toss between orgs (lead-intake's `orgForToken`).
3. **The database holds the uniqueness too** — a unique index on the token, and on settings.org_id — so no path (a restore, a hand edit, a future endpoint) can make the second row.
4. **A uniqueness the code relies on is declared in db/schema.ts and applied by a script** that refuses duplicates, adds only, and reads back what the database holds (db/apply-settings-uniqueness.mjs). An index applied by hand and declared nowhere is not there the next time anyone looks.
5. **A restore makes rows the restoring org's** — the org's id where the id is the org's, and no credential a file cannot prove belongs to this org (a form token, a stored key).

## 18b55. State Loaded For One Org Is Used Only While That Org Is Active — A View That Copies It Opens Only On It, Rebuilt For Each Org (hard rule)

**Origin (§0.162, 3 Oct 2026 — two HIGH findings of the cross-org audit).** The header's OrganizationSwitcher changes the org in place, with no reload. `useSettings` started from an unscoped localStorage copy, marked itself ready whether its load succeeded or not, and applied any answer whenever it came back; the Settings view kept one `AdminView` across orgs, its open panel holding the form it had copied from the previous org; the leave guard's flag and save lived in App, above the view, and outlived it. Every save goes out with the ACTIVE org's token — so each of these could write one org's values into another, or the defaults over an org's real settings.

1. **Tag org-scoped state with the org it was loaded for, and record the tag only when the load SUCCEEDS.** A failed load leaves nothing to save: defaults on screen are not the org's settings.
2. **Number the loads; apply only the latest.** An answer that comes back for an older load — the org the user just left — is dropped, the data and the roster alike.
3. **A write uses the state only while its tag is the active org** — the token on the request is the active org's, whatever the state holds.
4. **A view that copies state when it opens opens only on the active org's own state, keyed by the org** (`<AdminView key={activeOrgId}>` behind `settingsOrgId === activeOrgId`), so nothing it copied, opened or typed survives a switch.
5. **Anything above that view that can save — a dirty flag, a registered save — is reset when the active org changes.**
6. **Say when the state did not load** — a toast, and the view says why it will not open; never the defaults dressed as the org's settings.
7. **Test it with the real hook**: tests/settings-org-load.test.mjs runs the file itself against stand-ins for React and the fetch layer — a late answer after a switch, a failed load, a same-org reload, a save that lands after a switch.

## 18b56. A Role Is Per Org: The Roster Row Is The One Source — Nothing Reads Clerk's User-Level Role (hard rule)

**Origin (§0.163, 3 Oct 2026 — the cross-org audit's per-person role, HIGH).** The role the server enforced was Clerk's USER-level `publicMetadata.role`: one value for every org a person belongs to. An Admin anywhere was an Admin everywhere they were a member — and there could mint an API key, point a webhook or the audit stream at their own server, download the backup or wipe the roster; one org could make another org's only Admin read-only; Ryan's mistaken Read only, set in QA, reached two more orgs (§0.153). Half the server already read the per-org `users.role`, so a person had two roles.

1. **The role is the one on the person's row in that org's roster** — `users.role`, one row per (org_id, clerk_user_id) by a unique index. `verifyAuth` reads it for the org the token names (`_callerRole.mjs`); the client takes it from `users?me=true` for the active org, and only while that profile is the active org's (§18b55). A Manager's reps come from the same row.
2. **Nothing reads a role, or a Manager's reps, from Clerk's user-level metadata** — tests/org-roles.test.mjs scans every function and client file for it.
3. **No row is a rep, and "no row" is never cached** — it is the moment before the first-load link or provisioning.
4. **Only an Admin grants a role.** `user-role.mjs` is the one path that changes an existing row's role; an invite or a create above a rep is Admin-only; a create naming an existing row keeps its role. Clerk is not written.
5. **A row's role reaches a person only by the invited EMAIL** — a display-name match links as a rep.
6. **A new row is a rep. The one bootstrap is a fresh org's first Admin:** the org's Clerk admin (`org:admin` in the verified token), while the org has no Admin row at all. Clerk's org role grants nothing else.
7. **Test it with the real `verifyAuth`** against the database — tests/integration/org-roles.itest.mjs, the Clerk SDK a stand-in that records writes (there must be none) — and give the suite its own org namespace: sharing one, two suites delete each other's rows in the full run.
8. **Deactivated means no access** (§0.164 — Jeff: "Deactivated means no access"). `verifyAuth` refuses an inactive row (403, code `deactivated`, never cached) and the app says so for that org; the row keeps its role for a reactivation. Deactivating and reactivating are an Admin's — the row menu or the profile, both through one helper that sends only `{ id, active }` — never one's own deactivation; the row's status says why it is off, so the first-load link never switches a deactivated row back on. **A member's status has one rule** (`memberStatus.js`): an inactive row is an invitation only with status `Invited` and no Clerk link — the invite path stores invitations off — otherwise it is deactivated.

## 18b57. A Save Handed Up Through A Ref Is The Latest One — Re-handed Every Render, Taken Back On Unmount (hard rule)

**Origin (§0.164, 3 Oct 2026).** The Settings leave guard's "Save changes and continue" runs the save the open panel put in `settingsSaveRef`. Panels put it there in an effect keyed on `[dirty]`, so the guard held the save of the FIRST edit — a closure over the form as it was then: "AB" typed, "A" saved (observed in Accelerep QA). Three panels set it during render and never took it back, so the guard could run an earlier panel's save from the next one.

1. **A callback a parent will call later is handed over every render** — an effect with no dependency list (`src/Tabs/settings/shared/useRegisterSave.js`) — because it closes over that render's state. A dependency list freezes it at the render that last changed a dependency.
2. **Taken back on unmount.** A closed panel's save must not be left for the next panel's guard.
3. **One helper, every panel** — tests/settings-leave-guard.test.mjs runs the helper and scans that no panel assigns the slot itself.
4. **A save the guard can run throws when it did not save** (guide §18a10) — a refusal included — or the guard moves on as though it had.

## 18b58. Access Granted Elsewhere Is Taken Back There — A Revoke That Only Hides A Row Is Worse Than None (hard rule)

**Origin (§0.165, 4 Oct 2026).** The Pending invites page's Revoke removed the row from the page's own state and called nothing; Delete user removed an invitation's row and left its Clerk invitation live — so a "revoked" or "deleted" invitee could still accept and join. The page around them was invented — figures, dates, a link, switches — and the invite page sent neither its expiry nor its note.

1. **A control does what it says, or it is not there.** A security action that only looks done — a row hidden, a switch saved nowhere — reports a revocation that never happened (§0.59's sweep, again).
2. **Access granted outside our database is removed where it was granted.** An invitation lives in Clerk: revoke it there, then remove the row — and when Clerk refuses, keep the row (fail closed) and say so.
3. **Every path that removes a row asks what the row stands for.** An invitation's row is revoked, never deleted alone (DELETE answers 409); a member is deactivated (§18b56.8). `isOpenInvitationRow()` is the one predicate.
4. **Removing anyone is an Admin's, and never one's own** — the role lives on the row (§18b56), so a delete demotes as surely as a role change.
5. **Every change to who has access is audited** — invite, revoke, deactivate, delete.
6. **Show the outside system's own facts** — Clerk's sent and expiry dates, the expiry it was actually given (one list, `src/utils/inviteExpiry.js`) — never a placeholder that reads like data.
7. **Test with a stand-in that keeps the outside state per org** and refuses a call into another org (tests/integration/invitations.itest.mjs): an address invited to two orgs, revoked in one, keeps the other.

## 18b59. An Id Another Org Holds Is Refused — Before Anything Else Is Written (hard rule)

**Origin (§0.166, 4 Oct 2026 — the cross-org audit's lower findings).** Ids are global keys and writes upsert org-scoped, so an upsert naming another org's id writes nothing — and the code after it did not ask. The document create wrote version and link rows against another org's document; the job create a status-history row against another org's job; the rest crashed on the missing row, and the 500 told the caller the id existed elsewhere. A member's id was the client's to choose.

1. **An org-scoped upsert that comes back empty has told you the id is another org's.** Check what came back — `.returning()`, or a read by id AND org — before any second write: history, versions, links, notices, audits. Then 409 (a create) or 404 (an update).
2. **A create never takes over an id**, this org's included: `onConflictDoNothing` + `.returning()`, 409 when nothing came back.
3. **A PUT is strictly an update**: look the record up in the org first and 404 (accounts, contacts, tasks, opportunities); where an upsert stands in for one, its empty answer is the 404.
4. **New ids are the server's where an id is identity** (a member's, which signs their inbound address) — a client id is a choice of key the client should not have.
5. **A child names a parent in its own org** — a line item's job, a location's customer — or it is refused (404).
6. **A key or path the server issued is checked for its exact shape**, never a prefix.
7. **Site-wide machinery shows a tenant its health, never cross-org counts or raw errors** (job-status, Jeff: "Nobody in the app").
8. **Test with two orgs in one suite**: org B's rows seeded, A's writes aimed at B's ids, and B's rows unchanged after (tests/integration/foreign-ids.itest.mjs).

## 18b60. An Import Whose Rows Reach People Stops At Review — And A Clear Takes Back Access First (hard rule)

**Origin (§0.167, 4 Oct 2026 — Jeff: "why cant we replace it with the csv importer that is used for leads, contacts, accounts").** Settings → Users → Import CSV was a mockup that read no file. Made real, each row is an invitation: an email to a person, sent by Clerk, that cannot be unsent. Separately, `users?clear=true` deleted an org's rows and left its pending invitations live, so an invitee could still join the emptied org.

1. **An import whose rows send something stops at a Review that lists who gets it, who does not and why** — always, even with nothing to skip — and its button names the act ("Send N invitations"). Nothing is sent from Preview.
2. **A row that cannot go as written is refused at Review, never guessed**: a role the server does not know, a team or territory the workspace does not have, a person already on the team, an address repeated or not one, a name already taken (owners resolve by name — two of one name make every assignment by it a 409). A refused row claims neither its address nor its name.
3. **What the server will store is decided on the client and sent** — the import sends the name it shows, the server's default made visible — so the checks see the stored value; and a value the first sign-in never revisits (the row's name) is taken at invite time.
4. **A value with a column limit is cut before an outside system acts on it**: the invitation goes out before the row is written, so a name the column cannot hold would fail the insert for a person already invited.
5. **The rules for a row live in a pure module beside the shared importer** (`src/utils/userImport.js`); the importer stays one importer, and a new type adds fields, a review and a handler — not a second modal.
6. **A destructive clear takes back what grants access first — pending invitations — and fails closed**: a list or a revoke the outside system refuses stops it before any row goes (tests/integration/invitations.itest.mjs, in an org of the suite's own).

## 18b61. A Fact Held In Several Places Is Written In All Of Them — And A Limit Shown Is The One Enforced (hard rule)

**Origin (§0.168, 4 Oct 2026 — Jeff: "fix all 3").** An invitation stored its team as a name alone, while the Teams page reads the team's list and coaching notes and the digest read the member's teamId — an invited member joined on no team; and a team changed on the profile kept the member's old teamId. Seat usage printed a plan, a price and a 50-seat cap that exist nowhere, while Clerk enforced its own limit (5 by default, 20 on QA). "Change password" pointed at a fixed host that is neither instance's account page.

1. **A fact held in several places is written in all of them in one act**: a team membership is the team's `repIds`, the member's `teamId` and `team` (`src/utils/teamMembership.js`); a write path that sets one leaves a member half on a team. Taking it away takes it from all of them — a revoked invitation's id leaves the team's list.
2. **A limit shown is the limit enforced, read from the system that enforces it** — Clerk's `maxAllowedMemberships` for the organization, `0` none — with loading, unknown and failed each said; never a constant on a screen, and never a plan, a price or a button the product does not have.
3. **An outside system's own screen is reached through its SDK** (`openUserProfile()`), never a hard-coded host — the host differs per instance, and each instance's public config names its own.

## 18b62. A Read Is Gated Like The Write Beside It — And A Value Bound For jsonb Is Never Pre-Stringified (hard rule)

**Origin (§0.169, 5 Oct 2026 — the cross-org audit's within-org findings; Jeff: "go with your recommendation").** Inside one org, every write was gated somewhere, and the reads beside them were not: every role read the export run list and schedules, the automation rules and their runs, and the Slack webhook URL; any member scored — wrote — any deal and read its cached score; a Technician read every customer, location and technician's time off, and any job's line items and history by id. A rep filed a SPIFF claim in any rep's name, approved and paid, and four PUTs built the row from the body alone. And the job editor wrote its co-tech list into a jsonb column through `JSON.stringify`: 22 of 26 rows held a jsonb STRING, so the one scoped job read, `Array.isArray`, matched no co-tech.

1. **A read is gated like the write beside it.** An endpoint's GET is reviewed with its PUT: for the role (export is an Admin's; automations are read by the roles that manage them), for the record (scoring a deal is a write on it — the edit policy, `assertOwnership`, asked before any key, switch or cached answer), and for a credential inside an object everyone reads (the Slack webhook URL reaches an Admin; the rest of the config, everyone).
2. **A field user's reads derive from one rule of "their work"** — `_techJobs.mjs`'s `techOnJob`, the lead or a co-tech. What a Technician reaches comes through their jobs (customers, locations, line items, history) or their own technician row (time off); with no row linked to them, a 403 — nothing, never everything.
3. **A rep's edit of their own record never reaches what a manager decides** — a SPIFF claim's status, approval, payment and rep — and a rep's new claim is filed in their roster name, the server's, as a document's owner is (§0.166). Ownership compares ids; the one exception, a claim (`spiff_claims` holds no owner id), compares the roster name trimmed and in any case, until the table carries one.
4. **A value bound for a jsonb column is passed as the value** — drizzle serializes it. `JSON.stringify` first stores a jsonb STRING, and every reader that asks `Array.isArray` sees nothing. Until the stored rows are rewritten, a reader parses both shapes (`coTechIdsOf`). **Corrected 5 Oct (§0.172):** through drizzle the stored string reads back as an array — its jsonb read parses a string it is handed (drizzle-orm 0.45.2, `mapFromDriverValue`) after the driver has parsed the jsonb once — so the app's readers never saw a string, and the origin's "matched no co-tech" was read from code, not run (read on the test database, and read-only on the app's 22 string rows). The rule stands for what does see the string: SQL over the column (`jsonb_array_length` refuses a scalar, `@>` matches nothing) and any raw-SQL reader.
5. **What a screen writes by its own PUT never rides an echo of a whole object.** The settings autosave sends the app's copy of every key; a key a panel saves on its own (the AI key, the Slack config) is left out of it (`payloadForSave`), or the copy held since sign-in puts an older value back — or, where the read hid part of it from the role, a partial one. The PUT and its no-change baseline are built by one function. **Since §0.170 there is no echo left to keep anything out of: the autosave is gone, and each screen saves what it owns (§18b63).**

## 18b63. Each Screen Saves What It Owns — Nothing Saves A Shared Copy In The Background; The Copy Follows A Save That Landed; A Page With Unsaved Edits Asks Before It Is Left (hard rule)

**Origin (§0.170, 5 Oct 2026 — Jeff: "what are your thoughts on save buttons. modern design just save as you go?"; then "go with your recommendation").** The app's copy of an org's settings was saved by an autosave that PUT every key it held whenever any of them changed. It put newer saves back to their sign-in copies, wrote every screen's save twice, logged every key, turned a Manager's filter click into a refused Admin write — and was the only way a new workspace got its defaults. Around it, twenty screens set the app's copy before their save landed, the Sales Manager's Administration page saved as you typed ("+ Add SPIFF" put a blank SPIFF live), nine panels with a Save button never told the leave guard they had unsaved edits, and App's own guard was called by nothing.

1. **Nothing saves a shared copy in the background.** The app's copy of org settings is loaded and never written back whole. Each screen PUTs the keys it owns (`putSettings`) — by its Save button, or at once when the change is one deliberate act: a toggle, an add, a remove, a forecast call.
2. **A Save button, with Cancel, where a change has consequences** — several fields, validation, money, anything other people see. What is typed is a draft until Save; validation refuses before anything is written; a list item goes live only complete (a SPIFF with a name).
3. **The app's copy follows a save that landed**: `setSettings` after `await putSettings(...)`, inside the try. Never before it — a refused save shows anyway — and never a whole-object snapshot put back on failure: that also puts back whatever changed meanwhile. A value is read from state, never carried out of a state updater: React may run the updater after the line that reads it. (CLAUDE.md's persistent-data line — "saved via `dbFetch` immediately after the local state update" — predates this rule; both say a `setState` alone is never a save, but for a screen's save the order here is the save, then the copy. Flagged to Jeff, 5 Oct.)
4. **A screen with unsaved edits tells the leave guard** — `setSettingsDirty` and `useRegisterSave` — **and every way out asks.** App's `navigateTo` is the one way to change tab: the context hands it out as `setActiveTab`, the nav and the shortcuts call it. A save the guard runs throws when it did not save, a refusal included (§18b57.4).
5. **The defaults live once, and the server keeps them** (`src/utils/settingsDefaults.js`): a key a workspace has never saved reads as its default and the next save writes it; a key saved as null or empty is the workspace's own. A default the server must serve is never left to a client to write.
6. **Test it** against the database with a second org that must stay untouched (tests/integration/settings-defaults.itest.mjs), and pin each screen's rule with a mutant (tests/save-buttons.test.mjs).

## 18b64. A Page That Describes Access Renders The Rules The Server Runs — And A Security Control That Enforces Nothing Comes Out (hard rule)

**Origin (§0.171, 5 Oct 2026 — Jeff: "Honest page now"; on Roles & permissions, "Fold it in").** Settings → Fields & security saved Edit / Read / Masked / Hidden for 42 fields — 28 of them no column of their object — as strings the app's one field check never acted on (it hid a field only for the boolean `false`), and no workspace had ever saved a level. Settings → Roles & permissions showed a hand-typed list of five roles, two of them no role the app has, with invented member counts, and saved a permission grid to a key nothing read. Both looked like security; neither enforced anything.

1. **A security control does what it says, or it is not there** (§18b58.1). One that cannot be made real in the batch is replaced by a statement of what IS enforced and what is not available — never left as a form that saves.
2. **A page that describes access renders the functions the server enforces with** — `roleAccessRows` over roles.js's `crmReadScope`, `canEditCrm`, `canSeeAll` and `dispatchAccessOf` — so a rule changed on the server changes the page. A hand-written permissions table is a second copy, and it drifts.
3. **Anything the page states beyond those functions is read from the endpoint that enforces it, and pinned by a test** — the Admin-only list from settings.mjs, users.mjs, user-role.mjs, the export functions and the Sales Manager's `canEditIncentives`. One line was wrong before it was read: a Manager may invite Sales Reps.
4. **Field-level security, if it is built, is the server's.** A field hidden on screen still arrives in the record; the field must be left out of every answer — records, reports, exports, the API.
5. **The keys only a mockup wrote leave both halves of settings.mjs.** The next save of a workspace leaves them out of its extra; a column is left as stored. Nothing is deleted to clean up.

## 18b65. A Message Sent For A Member Is Built By The Server From The Record — The Browser Names Only The Event And The Record; A Field An Answer Carries Is A Column, And A Column Means What Its Schema Says (hard rule)

**Origin (§0.172, 5 Oct 2026 — Jeff: "go with your recommendation", finishing the 2 Oct audit's list).** mention-sms.mjs took the recipient's NAME and every word of the text from the browser and checked no role: any member, a read-only one included, could have the org's number text any colleague anything under any name; a name two members shared reached whichever row came back first; and the answer carried the recipient's phone number. The public API answered seven fields its tables do not have — undefined every time, so JSON dropped them without a sound — and filtered on an eighth, which failed the request. And this batch's own first cut read a job's `equipmentIds` as unit ids; the schema line says it holds the KINDS a job needs.

1. **A message the server sends on a member's behalf is built by the server.** The browser sends the event and the record's id, nothing else. The server refuses a role that changes no record (`requireWrite`), loads the record in the caller's org, refuses a caller who could not have saved it (`assertOwnership` over the loaded row), finds the recipient by the record's owner id — never by a name — words the message from the stored record and signs it with the caller's roster name (`getCallerName`).
2. **The event must be one the record bears out.** A win is a deal in Closed Won; a stage change is the deal's own last recorded move into the stage it is in. A record that does not bear it out sends nothing and says why (`skipped`).
3. **The answer says nothing about the recipient** — no phone, no address: `{ success, type }`, or the reason nothing was sent.
4. **A field an endpoint answers with is a column — and a test that reads the schema says so**, not a reading of the shaper. An undefined key leaves the JSON silently; a filter on no column fails the request. tests/audit-close.test.mjs parses db/schema.ts and checks every `r.<field>` and every filter of the public API's six resources.
5. **A column means what its schema line says, not what its name suggests.** A job's `equipmentIds` holds the kinds it needs (`dispatch_equipment.category` values); `assignedEquipmentIds` holds the units reserved for it (§0.116). Read the schema line before writing a rule over a column.
6. **A test's data must be able to tell the rule from its mutant.** A namesake inserted after the owner (a name lookup found the owner first), a read-only member whom ownership refused anyway (the role gate was never needed), an open visit changed a moment ago (any rule by last change passed): each let a broken rule pass. Run the server rules' mutants against the integration suite, and seed what separates them.

## 18b66. An Org Switch Shows Only The New Org — A Request Carries The Org On Screen, An Answer For Another Org Is Dropped, And What Loads Once Loads Per Org (hard rule)

**Origin (§0.173, 6 Oct 2026 — Jeff: "go with your recommendation", the 2 Oct audit's last reports).** The header's switcher changes the org without a reload. App installed the token getter in an effect that closed over that render's org, and React runs a child's effects before App's: Home's pinned-reports request went out with the PREVIOUS org's token in the commit of a switch (observed). The lists were never emptied and took any answer. Two surfaces loaded once and kept the last org's data — Reports' saved list and the profile panel, whose email-logging address then filed BCC'd mail into the org the user had left (observed). The Sales Manager tab returned early between its hooks and threw on a switch (observed), and QuotesTab kept an org's tiers in module-level variables.

1. **A request carries the org on screen when it is made.** The token getter reads the request org (`requestOrg()`, storage.js), which App sets as it renders — never an org closed over when the getter was installed.
2. **Every load into shared state takes the org when it starts and checks it (`stillOrg`) at each step that sets state** — the response, its body, its error, its loading flag. A load for an org switched away from sets nothing.
3. **A switch empties the shared lists before the new org's answers arrive.** Nothing of the last org is shown under the new org's name — not for a moment, and not for good when a load fails.
4. **What loads once is keyed by the org.** The tab area remounts on a switch (`key={activeOrgId}`); a component that never unmounts resets its loaded flags on the org (the profile panel); a list kept in the browser is stored under the org's id.
5. **No module-level variable holds an org's data.** A context or props, read in the render that draws it. An effect that copies settings into a module variable is a render behind, and keeps the last org's value across a switch and an unmount.
6. **A component never returns early between its hooks.** A role gate belongs where the component is rendered: in the render of a switch the role reads as a rep, and a gate inside it changes the hook count, so React throws.
7. **A switch is tested at runtime, on more than one surface,** with every request's token org logged against the org on screen. Settings hid the race (it remounts after the new org's settings load); Home showed it.

## 18b67. What Is Open Belongs To The Org On Screen — A Switch Puts It Back, And A Decision On The Role Or The Settings Waits For This Org's (hard rule)

**Origin (§0.174, 6 Oct 2026 — Jeff: "push dev and start the next batch"; §0.173's two findings).** §0.173 emptied the lists and remounted the tabs; the state above them outlived a switch. App's modal hook held 60 values with no reset, and its UI and calendar hooks held the open records, selections, forms and connections the same way: a contact's rail opened in Accelerep QA stayed open in Accelerep Test, showing QA's contact (observed), and an Undo offered for the last org's delete stayed on screen — its restore POSTs the rows into the org of the token (read from code). The Dispatch redirect decided in the render of a switch, on the role's rep fallback and the Dispatch-off defaults: on Dispatch in one org, a switch to another with Dispatch on went to Home (observed).

1. **A value that names the org's data — a record, an id, a selection, a form, a pending action, a connection — is declared with `useOrgBoundState`** in the hook that holds it, and the hook hands App `resetOnOrgSwitch`. In useModalState every value is the org's. In useUIState and useCalendarState a new state chooses: `useOrgBoundState`, or `useState` and a line in its KEPT list in tests/org-switch-reset.test.mjs — the tab, the device, a view preference — with the reason it outlives a switch.
2. **App puts them back on a switch only** — from one org to another, or to none — never on the first load, which keeps what a mount-time effect opened (the calendar return opens a Settings panel).
3. **The reset is App's first effect after the hooks it resets.** App's effects run in declaration order: the reset undoes what an effect above it set for the new org in the same commit (the calendar's fetch sets its loading flag). A child's effects run before App's, so an effect anywhere that sets an org-bound value in the commit of a switch — itself, through a function it calls, or in a component's body — is undone by the reset.
4. **A decision that reads the role or the org's settings waits for this org's** — `roleKnown` (the profile in state is this org's) and `settingsOrgId === activeOrgId` — and runs again when they land. In the render of a switch the role reads as a rep and the settings are the defaults: a redirect or a landing decided then acts for neither org. A gate in the render that only hides may read the fallback — it hides until the role lands.
5. **A reset covers what is open, not what lands later.** The answer to an action begun in the last org lands after the reset; it is checked against the org that asked (§18b66.2) before it opens, fills or appends anything. True everywhere since §0.175 (§18b68).

## 18b68. An Action Answers Only In The Org That Began It — It Checks The Org After Every Await, Before It Sets The Screen Or Sends Its Next Request (hard rule)

**Origin (§0.175, 6 Oct 2026 — Jeff: "push dev and start the next batch").** §0.173 checked every load and §0.174 put back what was open; an action's answer still landed after both, and an action that awaited and then sent again sent with the org on screen by then — dbFetch reads the org when it is called. A parse of every async path in src found 248 such points. Observed: a QuickLog save's answer offered a follow-up task for the last org's deal on the new org's screen, and Dispatch's new job sent its address and job POSTs with the new org's token; read from code, an invitation run's next ten went to the new org, and a team list built from the last org's settings was PUT into the new org's.

1. **An action takes the org it began in** — `const askedOrg = requestOrg();` — at its start, before its first await.
2. **After every await, and at the top of every .then/.catch/.finally or timer callback, it checks the org** — `if (!stillOrg(askedOrg)) return;` — before it sets shared state (the values §18b67 resets, the lists, the settings), sends a write, calls a helper that writes (`addAudit`, the SMS and calendar-event POSTs) or calls a parent back. A loop that awaits checks before each request. When the org has changed the action stops; what it already sent completes in its own org.
3. **A shared helper whose callers a switch remounts may stop by never settling** (`stopped()`, storage.js) — `putSettings`, the document upload. A helper with callers that stay mounted takes their check instead (the bulk client's `stillOrg`).
4. **The tests hold it:** tests/late-answers.test.mjs parses every async path in src and fails a late point with no check before it; tests/src-scope.test.mjs walks every name read under src and fails one nothing binds.
5. **A late answer is tested in the pane by holding it:** a fetch wrapper holds the request and answers it with a made-up response after the switch — nothing is written in any org — and records every further request with its token's org; red with HEAD's file swapped in.

## 18b69. A Count Is The Length Of The List It Counts; A Hook Reads App's Helpers When It Uses Them; A Catch Leaves (hard rule)

**Origin (§0.176, 6 Oct 2026 — Jeff: "All I want showing are active deals - not closed").** Signed in as Karen, Jeff saw "2 opps" on four contacts whose rails listed one deal each, and 2 and 2 on two others: "I am concerned it is randomly correct and not accurately correct". The badge and the rail each had a filter — closed deals in one and not the other, three name matches across the badge, the rail and the delete check. Beside it: the data hooks copied App's helpers at their top, a render before App filled them (the deals load's quarter helper null on a remount; the delete check's deals and softDelete's toast a render old), and an activity save's catch fell through to the follow-up for an activity it had not saved.

1. **A count is the length of the list it counts** — the same function builds both (`activeDealsOf(contact, deals).length` beside `activeDealsOf(contact, deals)`), never a second filter written beside the list. What a contact's deals are lives once: src/utils/contactDeals.js — open deals, by id or by the legacy name in any case, never a prefix.
2. **A data hook reads App's helpers when it uses them** — in the handler, or in the answer — never while it renders: App fills the refs behind its deps after the hooks have run, so a copy taken at a hook's top is the render before's, and null on a mount's first render. A hook copies at its top only a helper that is the same from any render (tests/hook-deps.test.mjs names them, each with its reason).
3. **A timer clears only what it set.** The undo toast's timer compares the toast's id with its own before it clears it, so a softDelete from any render leaves a later toast alone.
4. **A catch leaves.** The code after a try is the success path; a catch that sets an error returns, or the follow-up, the reset and the close run for what was not saved. In src/hooks a test fails a catch that falls through (tests/activity-save.test.mjs).

## 18b70. A Change On Screen Is A Change Sent — Through The Hook That Owns The Record; The App's Dialogs Sit Above Every Layer (hard rule)

**Origin (§0.177, 6 Oct 2026 — §0.176's found (b) and (f)).** A deal's modal logged and deleted activities and posted, edited and deleted team notes through five callbacks that set a list and sent nothing — gone, or back, on reload. The activity delete in its hook had never run (no caller; its hook handed `showConfirm` alone). The app's confirm sat at z-index 1000, under every modal and rail: "Discard this lead?" opened unseen behind the lead form, and the follow-up prompt hid behind a contact's rail.

1. **A callback that changes a record sends the write, through the hook that owns the record** — `handleLogActivity`, `handleDeleteActivity`, `saveDealComments` — and answers `{ ok, error }`. A setter alone is a screen-only change (CLAUDE.md's persistent-data rule). tests/deal-modal-saves.test.mjs parses every handler that sets a shared list and fails one with no server call, outside a named allowance.
2. **The screen waits for the answer it shows.** A form, a draft or an edit resets only after its save; a failure keeps what was typed and says why; the button shows its spinner while the request is out.
3. **A delete that offers Undo waits for its DELETE first,** and a refused one puts the row back and says so — an Undo pressed while the DELETE is out could POST before it lands.
4. **The app's dialogs and toasts sit above every layer** — the confirm and prompt and the blocked-delete dialog at 100100, the follow-up prompt at 100050, the Undo toast at 100200; tests/layers.test.mjs scans every z-index in src and fails a layer that rises above them. Check a dialog in the pane by what is on top at its button.
5. **A handler that deals with an Escape marks it** (`e.preventDefault()`), and App's Escape — on window, after every handler on document — leaves a marked one alone; it closes an open confirm or prompt before anything under it.

## 18b71. One Delete Path Per Record — In Its Hook, Called By Every Screen, Its Rules Held On The Screen And The Server (hard rule)

**Origin (§0.178, 6 Oct 2026 — §0.176's found (a); Jeff: "Block it", "Confirm, no Undo", "add the delete to thee task rail").** The data hooks' delete handlers held the rules and had no callers; the screens deleted with their own code — a contact on an open deal went from the row menu without a confirm, no deal could be deleted at all, and no task from any screen.

1. **A record's DELETE is sent from one function in its hook** — `handleDeleteContacts`, `handleDeleteAccounts`, `handleDeleteDeals`, `handleDeleteActivity`, `handleDeleteTask` — and every screen that deletes calls it. tests/one-delete-path.test.mjs parses every DELETE under src and fails one sent anywhere else, or a delete function nothing calls (outside its named allowance — empty).
2. **The function holds the rules:** a confirm before any request; a record a rule keeps is kept and named; Undo only where a re-create is quiet (contacts, accounts, activities, tasks — never a deal, whose POST emails, fires webhooks and runs automations); Undo once the DELETEs have landed.
3. **A rule the screen checks over what it can see is the server's too** — the server reads the whole org with the same function (contactDeals.js through _openDeals.mjs), after its gates, and refuses with 409; a refusal names nothing the caller may not see.
4. **The button is offered to whom the server allows** — account and deal deletes to an Admin.
5. **A delete follows what the server does with what hangs off the record** — an account's sub-accounts are promoted, not deleted; the confirm says so and Undo puts them back.
6. **A delete's audit line is the server's.** Each DELETE writes `<record>.deleted` with the row, once the row is gone; the screen writes none of its own — a line written before the answer logs a refused delete as one, and a deleted one twice. tests/one-delete-path.test.mjs pins both halves.
7. **A layer's own Escape yields to every layer above it.** A rail's listener is on document and runs before App's on window, so it skips an Escape while the app's confirm or prompt is open — as it does for the activity viewer — and App closes the dialog; without that, one Escape closed the dialog and the rail under it. The test scans every rail's Escape listener.

## 18b72. A Control Is Offered Only Where It Acts — Select Where Rows Can Be Ticked, A Row's Checkbox In Select Mode Alone (hard rule)

**Origin (§0.179, 7 Oct 2026 — §0.178's found (c) and (d); Jeff: "Hide Select there", "Only in Select mode").** The Pipeline's default List view offered Select and ticked nothing, so an Admin's deal delete hid behind a view switch; Select showed in the Forecast view, on a phone and in Contacts' Company layout, none of which tick a row; and a Kanban card ticked on hover outside Select mode. §18b50 is its kin for settings: offered only where enforced.

1. **A control is offered where it does something.** Select and its Delete (N) show only in a view whose rows tick; a view that ticks nothing hides them, and entering it leaves Select mode. tests/select-where-tickable.test.mjs lists every Select toggle under src and fails a new one until it is checked there.
2. **A row's checkbox shows in Select mode alone**, in every view; outside it a click opens the record.
3. **A view's header and rows share one grid** (`listCols`): a column added to one is added to both.

## 18b73. A Changing Border Is Written Side By Side (hard rule)

**Origin (§0.179, 7 Oct 2026).** React re-sets only the style properties whose values changed. A style that set a changing `border` beside one side of its own lost that side whenever the shorthand changed — a ticked Kanban card's stage edge and a hovered lead card's accent (observed), a selected dispatch job's priority edge, a selected crew's colour edge, a chip's divider. React's console warning named it first: "Updating border borderTop".

1. **When a border changes with state, set each side by itself** — the changing edge on the sides that change, the accent on its own — never the `border` shorthand (nor `borderColor`, `borderWidth` or `borderStyle`) beside a side it overlaps.
2. **A part changing under a fixed whole is fine** — `border: 'none'` beside a changing `borderBottom` draws as meant.
3. tests/border-sides.test.mjs parses every style object under src and fails a changing border property that overlaps one it is not a part of. Style objects merged by spreading are not followed: a spread that brings a side under a changing shorthand needs the same care.
4. **A React warning in the console is read, not skipped** — this one named the bug before anyone saw it.

## 18b74. Escape Closes The Layer On Top, And Only That One — A Layer Above The Rails Takes It First And Marks It; Every Listener Leaves A Marked One Alone (hard rule)

**Origin (§0.180, 7 Oct 2026 — §0.178's found (a)).** The document layers open above the record rails and the deal modal and had no Escape of their own: an Escape over a document closed the rail or the modal under it and left the document open. Fourteen other listeners acted on an Escape a layer above had already handled, and the activity viewer opened under the task rail that opens it. §18b70.5 (a handler marks the Escape it deals with) and §18b71.7 (a rail yields to the dialogs) are its first two steps.

1. **A layer that opens above the rails takes its Escape first** — `useEscapeLayer`: on document, in the capture phase, before every rail's listener (document, bubble) and App's (window). It marks the Escape it takes, and lets it pass unmarked while a layer above it is open (the app's confirm or prompt, another document layer).
2. **Every keydown listener that reacts to Escape checks `e.defaultPrevented`.** tests/escape-layers.test.mjs parses every one under src.
3. **A layer closes on Escape as it closes from its backdrop** — the document rail's description saves (the focused field blurred, so its own save runs); the upload rail does not close mid-upload; and every control that closes a layer keeps the same rule (the upload rail's ×).
4. **The z-order is the Escape order.** A layer Escape closes first sits above what it closes after: the activity viewer above every record rail (tests/activity-view.test.mjs reads the rails' z-indexes).

## 18b75. A Request A Screen Sends And Leaves Reports Its Own Refusal; A Record Is Named By Its Own Columns (hard rule)

**Origin (§0.181, 7 Oct 2026 — §0.180's found (a) and (b)).** The documents hook threw on every refusal, and the screens that call it send and move on: a refused description, category, visibility, delete, restore, link, unlink, download or preview was an unhandled rejection with nothing on screen, and two screens acted as if it had worked — the rail closed on Delete before the answer, the link picker closed on Done. And the link picker named tasks, activities and deals by fields they do not have. §18b1 (dbFetch resolves on any status) and §18b71 (a delete's rules in its hook) are its kin.

1. **A handler a screen calls and leaves reports its own refusal** — what was not done and why, in the app's message, in dbWrite's words (`refusalOf`), for the org that asked only — and resolves `{ ok }`; it never throws. A handler that throws (a load, an upload) is caught at every call: tests/document-refusals.test.mjs runs the documents hook and parses every call under src, and places every handler the hook returns.
2. **A screen that waits for the answer acts on it** — it closes on success (the rail when its document leaves the library) and stays on a refusal (the link picker, with the choice).
3. **A record is named by the fields its table has** — a task's `title`, an activity's `subject`, a deal's `arr`; tests/document-link-names.test.mjs reads db/schema.ts. A field no table has reads as undefined and the screen shows its fallback, quietly.
4. **A yyyy-mm-dd day is read at local noon wherever it is shown** (`parseLocalDate`) — the documents' formats with the rest of the app (dateLocal.js).

## 18b76. A Write Asks What Its Read Asks; A Control Is Offered To The Roles That Write (hard rule)

**Origin (§0.182, 7 Oct 2026 — §0.181's found (a)–(d)).** documents.mjs read every document through `canSee` and wrote none through it: a document a user could not see could still be changed, versioned, restored, linked, unlinked or deleted by its id, and an upload URL could be minted for an existing document's version-1 object. And every document screen offered every edit to roles the server refuses. §18b72 (a control is offered only where it acts) is its kin for views, §18b45 (a read scope is not a write authority) for the CRM records.

1. **A write to a record the caller reads through a rule reads it through that rule first** — documents.mjs's `writableDoc`: in this org, and `canSee` — and answers in the read's words (403 Forbidden, 404 Not found). A delete or an unlink of nothing is done, not refused. tests/integration/documents-access.itest.mjs proves it as a rep, an Admin (no bypass, on reads or writes), the owner and a named person; tests/document-access.test.mjs pins each branch.
2. **A key the server signs names nothing that exists** — an upload URL for a new document is refused an id a document holds, this org's or another's.
3. **A screen offers an edit to the roles the server lets write** — `canEditCrm`, requireWrite's list; a reader sees the record read-only (its pill, its text, a disabled control), never a control the server refuses. tests/document-access.test.mjs parses every document screen: each reference in the markup to a write, or to a function that reaches one, sits under `canEdit`.
4. **A view follows what its write moved** — the rail's version history reloads when the version moves, keeping its list while it does.

## 18b77. A Choice Of People Is A Type-Ahead Of This Org's Members, Stored By App Id And Checked By The Server; A Record Named In A Write Is The One The Server Finds (hard rule)

**Origin (§0.183, 7 Oct 2026 — §0.182's found (a)–(d); Jeff: "for number 2 build a picker", "Owner or an Admin", "A type ahead multi select instead of a prebuilt list … it could be very unusable with a larger population of users").** A Specific document had no way to choose anyone, its list unchecked and compared with a Clerk id; anyone who could see a document could change who sees it or delete it; a link stored the record the browser named, under the browser's name. §18b76 (a write asks what its read asks) is its kin; §18b22 (the identity split) is why the id is the roster's.

1. **A choice of people from the org is a type-ahead, never a list of everyone** — the deal Contacts field's kind: the chosen as chips with an ×, a search offering the names that match, a few at a time. A list of the whole org does not scale with the org.
2. **People are stored by their app id (users.id) and checked by the server against this org's roster** — the id a rep's directory carries and an invited member already has; a Clerk id is not a member's id. A list the rule needs filled (Specific) is refused empty.
3. **Who sees a record, and its delete, are named by one server rule that the record carries to the screen** (`mayManage` → `canManage`): the screen offers the control by the flag, the server refuses by the rule.
4. **A record a write names is the one the server finds** — in this org, visible to the caller by its own list's rule, stored under its own name; one that is not there and one the caller cannot see answer alike (§18b71.3).

## 18b78. A Crash In A Layer Keeps The Page; A Crash Nothing Else Catches Shows A Reload, Never A Blank Page (hard rule)

**Origin (§0.184, 7 Oct 2026 — §0.183's found (a); Jeff: "Add the boundary (Recommended)").** Each tab had its own ErrorBoundary and nothing else did: ModalLayer's rails, modals and app dialogs and the quick log sat outside every boundary, and nothing wrapped the root, so a render error in a rail — §0.183's stale module, "useState is not defined" in the document rail's picker — took the whole app with it. §18b70.4 (the app's dialogs above every layer) is its kin.

1. **A layer host sits inside a LayerBoundary** — ModalLayer and QuickLogFab do, and tests/layer-boundary.test.mjs fails either outside one; a new host goes inside one and into the guard's list. Since §0.185 every layer App renders does — the header, the meeting prep panel and the leave guard too — and the guard finds one that does not (§18b79.4).
2. **A crash closes what crashed and says so** — `onCrash` puts back the state that rendered it (ModalLayer's: the org switch's reset, every layer closed; the quick log's: its panel), so it is not rendered again; the message says what was lost and offers Dismiss; the page under it stays as it was.
3. **The boundary's message sits above every rail and modal and under the app's dialogs and toasts** (§18b70.4; tests/layers.test.mjs).
4. **The root has a boundary outside every provider** — a crash nothing else catches shows a page and a Reload, never a blank one.
5. **A boundary is proved by a real crash in the pane** — react-dom/server does not run one, so the tests pin its parts and the pane catches a crash a made-up answer causes, nothing written.

## 18b79. A Crash Closes What Is Open And Keeps What Is Remembered; A Boundary Holds Only What Renders Below It (hard rule)

**Origin (§0.185, 7 Oct 2026 — §0.184's found (a) and (b); Jeff: "fix both a and b when you have the chance").** ModalLayer's boundary closed the layers with the org switch's reset, which also emptied what the reminders remember, so every reminder dismissed or snoozed came back after a crash, with its chime; and the meeting prep panel was markup App worked out in its own render — a boundary put around it could not have caught what threw there. §18b78 (a crash in a layer keeps the page) is its kin.

1. **A crash puts back what is open, not what is remembered** — a list a crash must not empty (the alerts dismissed and snoozed, the reminders fired) is registered apart (`remembered`); an org switch puts back both, a crash the layers alone (`closeLayers`).
2. **What was open at a crash, and would open itself again, counts as seen** — the due-task reminder open then may be what crashed; its checker would reopen it, and it would crash again.
3. **A boundary catches only what renders below it** — markup worked out in the parent's render (an inline function, a list computed in the return) throws in the parent, above the boundary: cut it into a component of its own, and render that inside the boundary.
4. **The guard finds the layers, not a list of them** — tests/layer-boundary.test.mjs parses App's render: a component outside a boundary must be the frame, nothing outside one is drawn fixed, no boundary holds markup App's render works out, and every LayerBoundary closes something (`onCrash`).

## 18b80. Every App Layer Has A Place In The Escape Order, And Takes Its Escape While Nothing Above It Is Open (hard rule)

**Origin (§0.186, 7 Oct 2026 — §0.185's found (a); Jeff: "fix the escape one too when you have the chance", then "App-level 12 now").** Twelve app layers had no Escape at all — the meeting prep panel, the three import windows, the two merge reviews, the SPIFF claim, the blocked-delete notice, both task reminders, the quick log and its follow-up, the leave guard — while the shortcuts list promised "Esc — Close modal or popover". §18b74 (the layer on top takes the Escape and marks it) is the rule this completes.

1. **The app's layers have one order, top first, by the z each draws** — `ESCAPE_ORDER` (src/utils/escapeOrder.js); at one z, the one later in the page. A new layer takes a place in it: tests/escape-order.test.mjs fails a layer without one, a place without a layer, the order out of z order, and a z its file does not draw.
2. **A layer's own Escape passes while one above it is open** — `useEscapeLayer(open, close, escapeBlocked('<its name>'))`, App's `openLayers` saying which are open: one Escape closes the layer on top, and only that one, whatever order the listeners were added in.
3. **Escape does what the layer's own close does** — its ×, Cancel, Skip or backdrop, one function for all of them: a reminder is dismissed and the next shows, the quick log closes with its draft kept, the leave guard is Stay.
4. **Nothing mid-save closes on Escape** — an import running, a merge saving, a claim being submitted, a guard's save out: the Escape is refused.
5. **The draggable windows share one place** — each rises when clicked (useDraggable), so among themselves the order is the order clicked.
6. **In-tab layers are not yet in the order** — docs/OPEN_ITEMS.md (§0.186's found (a), the audit): fifteen files draw fixed layers with no Escape at all, and eleven more are to be checked layer by layer.

## 18b81. A Layer Drawn Over The Page Is Drawn Outside .app-container; A Screen Replaced Keeps Its Ways In (hard rule)

**Origin (§0.187, 7 Oct 2026 — §0.186's found (c); Jeff: "the prep panels were opening underneath and not visible unless you click away from them").** The meeting prep panel opened under the rail its Prep was pressed in: App drew it inside `.app-container` — `position: relative; z-index: 1`, a stacking context — so it sat under every layer drawn outside it, whatever its own z. And it had no way in for months: the Prep the contact and account panels offered went with them when the rails replaced them (27 May), and nothing said so. §16's menu rule (an ancestor's transform traps a fixed box) is its kin.

1. **A layer that must sit over a rail, a modal or the deal window is drawn outside `.app-container`** — beside ModalLayer in App's render, inside its own LayerBoundary (§18b78), or through `createPortal(…, document.body)`.
2. **A z-index orders only inside its stacking context** — every z inside `.app-container` sits under the container's 1. The escape order (§18b80) puts the layers drawn there — the header's panels — last, under every layer drawn outside it: the notes popover at 998 above the search results at 1199.
3. **The guard reads App's render** — tests/escape-order.test.mjs: the container is a stacking context, and the layers drawn inside it are the header's panels and no other, last in the order.
4. **A screen replaced keeps its ways in** — list what the old screen opened, and carry each to the new one or record its removal. tests/meeting-prep.test.mjs pins the meeting prep panel's three: the contact rail, the account rail, the deal window.

## 18b82. A Deal Is Read By The Names A Deal Has (hard rule)

**Origin (§0.187, 7 Oct 2026 — Jeff: "finish it and include the open pipeline fix").** The rails' open-deal rows read each deal's amount from `o.value` — a deal's is `arr` — and showed none, ever. The class, found by a parse: the account rail's close date from `o.closeDate` (a deal's is `forecastedCloseDate`), the Pipeline list's next step from `opp.nextStep` (a deal's is `nextSteps`). A name a deal does not have reads `undefined`; a display that reads only it renders nothing — no error, nothing to see but an absence.

1. **The names are the opportunities table's** (db/schema.ts) — the client keeps them (useOpportunities makes `arr` a number and adds `closeQuarter`).
2. **A fallback is harmless; a missing name read alone is the bug** — `o.arr || o.revenue` reads `arr`; `o.value ? … : ''` reads nothing.
3. **A list built with more says so** — a map returning `{ ...o, flags }` — and the names it adds are read off that list only.
4. **The guard is a parse, not a list** — tests/deal-fields.test.mjs walks src/ and netlify/functions/: every field read off an element of a deal list, or off a variable named for a deal, against the table. The reads left are recorded with their reasons (KNOWN), and a recorded read no longer made fails too.

## 18b83. A Value One Endpoint Computes Is Written By That Endpoint Alone; A Switch The Server Reads Has A Control (hard rule)

**Origin (§0.188, 7 Oct 2026 — §0.187's found (b); Jeff: "fix the AI score one when you have the chance").** A deal save sent the deal the window opened — its AI score too — and the deal PUT, applying every key it is sent, wrote it back over the score ai-score.mjs had just kept. And ai-score.mjs, the deal window and the Pipeline all read `aiScoringEnabled`, which settings.mjs saved and no screen sent: a feature built, and off in every workspace for good.

1. **A value an endpoint computes is not taken from a save** — the deal's sanitize builds no `aiScore`; ai-score.mjs alone writes it (tests/ai-score.test.mjs, a parse of every function file). A form that starts as a copy of the record carries every column back on every save; a column the form does not own must not be read from the body.
2. **A switch the server reads has a control, or is recorded as having none** — a key in both halves of settings.mjs with no screen that sends it is a feature nobody can turn on. The control sits with its kin (Features & AI) and its caption says what it sends.
3. **A score is the user's to ask for** — nothing scores a deal on open: a score sends the deal to Anthropic and writes the audit log.
4. **A detail tab's Save calls the save** — never `requestSubmit` on a form the tab unmounts; a missing field opens the form, where its error shows.

## 18b84. Every App Layer's Escape Decides By The One Order — App Closes The Layer On Top, And Whatever Takes An Escape Marks It (hard rule)

**Origin (§0.189, 8 Oct 2026 — §0.187's found (a) and its class; Jeff: "fix the Escape handler order next").** App's own Escape handler closed from a list of its own, not the order the screen draws: the shortcuts before the rails drawn over them, the notifications before the search results, the coaching note after layers under it. And every listener that decided whether an Escape was its own kept a list of what sat above it — each missing a layer — while the rails took an Escape without marking it, so App closed a layer of its own under the rail on the same keypress. Seen with HEAD's files: one Escape closed a contact rail and the shortcuts list under it; a task being written lost its draft to the second Escape after the shortcuts list had opened and closed. §18b74 (the layer on top takes the Escape and marks it) and §18b80 (one order, by the z each layer draws) are the rules this completes.

1. **App closes the layer on top, and only when it is App's** — `topLayer(openLayers)` names it; a layer that takes its own Escape (a rail, a document, a window) is left to it, and nothing under it closes. The open layers reach the handler through a ref, set every render before the early returns.
2. **A layer's own listener asks the order** — `escapeBlocked('<its name>')`, never a list of what sits above it. A layer that keeps itself open on Escape (a rail keeping its draft) still takes the Escape.
3. **Whatever takes an Escape marks it** — `e.preventDefault()`, so every listener under it leaves it alone.
4. **The guard runs every pair** — tests/escape-order.test.mjs: of any two layers open, one Escape closes the upper, however each takes its Escape and whichever listener was added first; parses tie the model to the code (App's cases, each listener's hold and its mark).

## 18b85. A Control Opens A Screen That Is Drawn — A Replaced Screen's Open-State Goes With It; A Name The Context Gives A Meaning Of Its Own Is Never Handed On Raw (hard rule)

**Origin (§0.190, 8 Oct 2026 — §0.189's found (a) and its class; Jeff: "fix the Add contact one when you have the chance").** The rails replaced the contact, account and task modals and the contact and account panels, and their open-states stayed. The Company view's "Add contact" set `showContactModal`, which nothing drew: it opened nothing and locked the page's scroll. The header's search results set App's own `viewingContact` and `viewingAccount` — the context's setters of those names open the rails, and App handed the header its own — so a contact picked in the search opened nothing and locked the page until a reload.

1. **A replaced screen's open-state goes with it** — every control that set it opens the replacement, and the state, its terms in the scroll lock and the key handler, and its destructures go in the same batch.
2. **One name, one meaning** — when App's context gives a hook's name a value of its own (`setViewingTask`; `setActiveTab`, which is `navigateTo`), App hands a component the context's value, never the hook's setter under that name.
3. **A state drawn and never opened is recorded with its reason** — tests/open-states.test.mjs, KNOWN — until it is given a way in or retired.
4. **The guard parses** — every open-state the two hooks keep is drawn (in JSX, or a render guard) and opened, or recorded; App's context gives no hook name a second meaning but those recorded, and none is handed on raw.

## 18b86. A Record Of Evidence Takes Only The Entries The App Sends, Each Behind The Gate Of The Work It Records; A Read Keyed By Person Holds The Caller To Their Own (hard rule)

**Origin (§0.191, 9 Oct 2026 — OPEN_ITEMS §1's small security closes; Jeff: "start with fixing 1-4 above").** audit-log.mjs's POST wrote any `action` and `entityType` a member sent (only quote events were refused, §0.156), so a rep could post `user.role` under their own name; and its one gate, `requireWrite`, refused a Dispatcher the Dispatch entries their own work makes. recommendation-log.mjs took `?rep=` and the body's `repName` as given: a rep read a teammate's log, and wrote rows in a teammate's name that silence that teammate's alerts. The Leads tab offered every write control to roles the server refuses.

1. **An endpoint a client writes evidence through takes a list, not a deny-list** — the exact pairs the app's own call sites send (`_auditClientEntries.mjs`), refused before anything is written; every other event is the server's to write as the work happens.
2. **Each entry sits behind the gate of the work it records** — a CRM entry the CRM write roles, a Dispatch entry the Dispatch gate — not one gate for the endpoint.
3. **The list and the call sites are one set** — a parse of every call site resolves each pair and finds it listed, and every listed pair has a call site (tests/security-closes.test.mjs); a new call site adds its pair in the same batch.
4. **A read or write keyed by person holds a caller who cannot see the whole org to their own key**, from the server's own lookup of the caller — never the query string's or the body's; no key found reads and writes nothing (18b19).
5. **A CRM screen draws its write controls for `canEditCrm(userRole)` alone**, as the server's `requireWrite` allows; a control the server refuses is not drawn.

## 18b87. A Person On A Record Is Their Id — A Name Is For Display, And Two Lists Are Never Paired By Position (hard rule)

**Origin (§0.192, 9 Oct 2026 — OPEN_ITEMS §4.2; Jeff, 1 Oct: "key both on contactIds").** Five places counted a deal's engagement from `activity.contactName`, a field nothing writes: the Contacts tab read 0 / 0 / 0 for everyone, the rail's dots were all stale, Home warned on every $20k deal, and the AI score was told "Contacts engaged: none" and called an emailed contact unresponsive. The deal form removed a contact by removing the name and the id at one index of two lists that can be out of step.

1. **Who is on a record, and who an activity was with, is read from the ids** (`contactIds`, and the legacy `contactId`), one rule for every screen and the server — `src/utils/dealEngagement.js`. A name is looked up from the id (the caller's list, or an org-scoped query), and a merged duplicate reads as its survivor.
2. **A record's name text is display, and the fallback for a record saved before ids** — matched by whole name in any case, never a prefix, never a guess between two.
3. **Two lists that describe one set are never paired by position** unless they are proved in line; a row records the ids and the places it stands for, and a remove removes those.
4. **A field nothing writes is not read** — tests/deal-engagement.test.mjs's G1 holds `contactName`; a guard per phantom class.
