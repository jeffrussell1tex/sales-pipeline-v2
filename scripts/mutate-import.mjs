// One-shot mutation harness for the import-receipt batch (guide 18b10).
//
// Each entry breaks exactly one rule the new suites claim to enforce and asserts
// the suites go red. A test that has never failed is not evidence. Files are
// saved and restored in memory — never via `git checkout`, which has reverted
// unrelated fixes mid-session before.
//
// Run: node scripts/mutate-import.mjs
import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';

const SUITES = 'tests/bulk-client.test.mjs tests/import-receipt.test.mjs tests/csv-mapping.test.mjs tests/partial-sanitize.test.mjs tests/bulk-upsert.test.mjs tests/function-imports.test.mjs tests/import-rows.test.mjs tests/delete-and-stage.test.mjs tests/stage-batch.test.mjs tests/date-local.test.mjs tests/user-identity-schema.test.mjs tests/ownership-registry.test.mjs tests/role-vocabulary.test.mjs tests/leads-scope.test.mjs tests/lead-requests.test.mjs tests/settings-hygiene.test.mjs tests/api-surface.test.mjs tests/session-status.test.mjs tests/loss-analysis.test.mjs tests/report-scope.test.mjs tests/report-period.test.mjs tests/opp-text.test.mjs';

// LINE ENDINGS. The anchors below are written with \n, and most of the tree is
// checked out CRLF. A single-line anchor is unaffected; a MULTI-LINE anchor never
// matches, is reported stale, and its mutation never runs.
//
// That was not hypothetical. Eight anchors -- every multi-line one in this file --
// silently failed to match while every single-line one caught. The suite had been
// recorded as 37/37 and was really 29/37, because eight mutations had never been
// applied on any CRLF checkout. A harness that reports coverage it does not have
// is worse than no harness, so anchors are matched EOL-agnostically and the
// replacement is rewritten to whatever the target file actually uses.
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const anchorRe = (from) => new RegExp(escapeRe(from).replace(/\r?\n/g, '\\r?\\n'));
const toFileEol = (text, src) =>
    src.includes('\r\n') ? text.replace(/\r?\n/g, '\r\n') : text.replace(/\r\n/g, '\n');

const mutations = [
    // ── Object-level authorization ──────────────────────────────────────────
    // tests/ownership-registry.test.mjs was absent from SUITES until this batch,
    // so NONE of what follows had ever been mutation-tested. The registry, the
    // policy predicate and both fail-closed throws were carrying every
    // object-level authorization decision in the app with the harness reporting
    // a clean run over them. 18b20: adding a test does not add a mutation.

    ['ownership: the id registry reverts to a DISPLAY NAME column',
        'netlify/functions/_ownership.mjs',
        "    opportunity: 'ownerId',",
        "    opportunity: 'salesRep',"],

    ['ownership: contacts reverts to createdBy — the column that never existed',
        'netlify/functions/_ownership.mjs',
        "    contact:     'assignedRep',   // NOT createdBy — that column does not exist",
        "    contact:     'createdBy',"],

    ['ownership: a CLERK id is compared instead of refused (owner side)',
        'netlify/functions/_ownership.mjs',
        '    if (!isAppUserId(owner)) {',
        '    if (false) {'],

    ['ownership: a CLERK id is compared instead of refused (caller side)',
        'netlify/functions/_ownership.mjs',
        '    if (!isAppUserId(callerId)) {',
        '    if (false) {'],

    ['ownership: the usr_ prefix check accepts the bare prefix',
        'netlify/functions/_ownership.mjs',
        "v.startsWith(APP_USER_ID_PREFIX) && v.length > APP_USER_ID_PREFIX.length",
        "v.startsWith(APP_USER_ID_PREFIX)"],

    ['ownership: documents is registered (Clerk id vs app id, silently unequal)',
        'netlify/functions/_ownership.mjs',
        'export const OWNER_ID_COLUMNS = Object.freeze({',
        "export const OWNER_ID_COLUMNS = Object.freeze({\n    document:    'ownerId',"],

    ['schema: an owner_id column is renamed, so push and code diverge',
        'db/schema.ts',
        "    ownerId:                text('owner_id'),",
        "    ownerId:                text('owner'),"],

    ['ownership: the policy FAILS OPEN for a caller who cannot be identified',
        'netlify/functions/_ownership.mjs',
        '    if (!callerId) return false;',
        '    if (!callerId) return true;'],

    ['ownership: an UNASSIGNED record stops being mutable (reps cannot take unowned work)',
        'netlify/functions/_ownership.mjs',
        "    if (owner === null || owner === undefined || owner === '') return true;   // unassigned",
        "    if (owner === null || owner === undefined || owner === '') return false;  // unassigned"],

    ['ownership: Admin/Manager stop bypassing the check',
        'netlify/functions/_ownership.mjs',
        'if (canSeeAll) return true;',
        'if (canSeeAll && false) return true;'],

    ['ownership: an unregistered entity resolves to undefined instead of throwing',
        'netlify/functions/_ownership.mjs',
        '    const key = OWNER_ID_COLUMNS[entity];\n    if (!key) {',
        '    const key = OWNER_ID_COLUMNS[entity];\n    if (false) {'],

    ['ownership: a registered-but-missing property degrades to undefined again',
        'netlify/functions/_ownership.mjs',
        '    if (!column) {',
        '    if (false) {'],

    ['endpoints: a hand-rolled ownership comparison comes back',
        'netlify/functions/tasks.mjs',
        '            const forbiddenOwn = await assertOwnership({',
        "            const callerName = 'x';\n            if (existing && existing.assignedTo !== callerName) return { statusCode: 403 };\n            const forbiddenOwn = await assertOwnership({"],

    ['endpoints: an owner column is named at the call site instead of the registry',
        'netlify/functions/accounts.mjs',
        "ownerColumn: ownerColumnOf(accounts, 'account'),",
        'ownerColumn: accounts.accountOwner,'],

    // Anchor repointed for the unassigned-visibility toggle: the single filter
    // line became a two-branch ternary. Same mutation, same catcher (the
    // callerId-vs-ownerId class guard).
    ['endpoints: the rep GET filter reverts to comparing display names',
        'netlify/functions/leads.mjs',
        '? results.filter(l => !l.ownerId || l.ownerId === callerId)',
        '? results.filter(l => !l.assignedTo || l.assignedTo === callerId)'],

    // ── Unassigned-lead visibility toggle ───────────────────────────────────
    // settings.extra.unassignedLeadsVisibleToReps gates whether a rep's GET
    // includes unassigned rows. Five ways it can silently stop being a rule:

    ['leads toggle: the strict branch drops its null-guard (18b22 — an unresolvable caller receives the hidden unassigned rows)',
        'netlify/functions/leads.mjs',
        ': results.filter(l => !!l.ownerId && l.ownerId === callerId);',
        ': results.filter(l => l.ownerId === callerId);'],

    ['leads toggle: the absent-key default flips to HIDE (a deploy silently narrows every unconfigured org)',
        'netlify/functions/leads.mjs',
        '    return row?.extra?.unassignedLeadsVisibleToReps ?? true;',
        '    return row?.extra?.unassignedLeadsVisibleToReps ?? false;'],

    ['leads toggle: the helper stops reading settings — the admin control becomes decorative (18b7)',
        'netlify/functions/leads.mjs',
        '    return row?.extra?.unassignedLeadsVisibleToReps ?? true;',
        '    return true;'],

    ['settings: the toggle key drops out of the GET projection (stored but never read back — 18b12)',
        'netlify/functions/settings.mjs',
        '                unassignedLeadsVisibleToReps: row.extra?.unassignedLeadsVisibleToReps ?? true,\n',
        ''],

    ['settings: the toggle key drops out of the PUT whitelist (a 200 that persisted nothing — 18b12)',
        'netlify/functions/settings.mjs',
        "                unassignedLeadsVisibleToReps: 'unassignedLeadsVisibleToReps' in data ? !!data.unassignedLeadsVisibleToReps : existingExtra.unassignedLeadsVisibleToReps ?? true,\n",
        ''],

    // The PUT merge (the leads overwrite path). Behaviour is caught by the
    // integration suite, which this harness cannot run; the unit catcher is
    // the source assertion in tests/partial-sanitize.test.mjs.
    ['leads: the PUT reverts to full-row sanitize — a two-key saveLead wipes the row',
        'netlify/functions/leads.mjs',
        'const clean = sanitize({ ...existing, ...data });',
        'const clean = sanitize(data);'],

    // The same merge, same catcher (the source assertions in
    // tests/partial-sanitize.test.mjs), for the other two faces of the wipe.
    ['opportunities: the single-record PUT reverts to full-row sanitize — a partial PUT wipes stageHistory/comments/pipelineId',
        'netlify/functions/opportunities.mjs',
        'const clean = sanitize({ ...existing, ...data });',
        'const clean = sanitize(data);'],

    ['tasks: the PUT reverts to full-row sanitize — a partial PUT un-completes the task',
        'netlify/functions/tasks.mjs',
        'const clean = sanitize({ ...existing, ...data });',
        'const clean = sanitize(data);'],

    // ── Leads Mine scope (client) ───────────────────────────────────────────
    // Caught by the source assertions in tests/leads-scope.test.mjs.
    ['leads scope: Mine folds unassigned back in (the pre-1-Sep shape — Mine equals All in a one-owner org)',
        'src/Tabs/LeadsTab.jsx',
        '.filter(l => !!l.ownerId && l.ownerId === currentUserId)',
        '.filter(l => !l.ownerId || l.ownerId === currentUserId)'],

    ['leads scope: the 18b22 null-guard drops — a null currentUserId claims every unassigned row via null === null',
        'src/Tabs/LeadsTab.jsx',
        '.filter(l => !!l.ownerId && l.ownerId === currentUserId)',
        '.filter(l => l.ownerId === currentUserId)'],

    ['leads: Auto-assign all loses its role gate — a rep scatters the whole unassigned pool in one click',
        'src/Tabs/LeadsTab.jsx',
        '{canDistribute && (',
        '{true && ('],

    ['endpoints: an assertOwnership result is computed and then discarded',
        'netlify/functions/leads.mjs',
        '            if (forbiddenOwn) return forbiddenOwn;',
        '            if (false) return forbiddenOwn;'],

    // ── The §0.58 managed-assignment gate (server) ──────────────────────────
    // Caught by the source assertions in tests/leads-scope.test.mjs.
    ['leads: the managed-assignment gate drops — a rep claims or reassigns by writing assignedTo again',
        'netlify/functions/leads.mjs',
        'if (ownPut.change && !canSeeAll(userRole)) {',
        'if (false) {'],

    ['leads: the gate loses its string half — a name resolving to NOBODY spoofs the label on an unassigned row',
        'netlify/functions/leads.mjs',
        'if (!sameOwner || !sameName) {',
        'if (!sameOwner) {'],

    // ── The §0.58 request flow (lead-requests.mjs) ──────────────────────────
    // Caught by the source assertions in tests/lead-requests.test.mjs.
    ['leads: the CREATE gate drops — a rep POSTs a lead pre-assigned to a colleague again',
        'netlify/functions/leads.mjs',
        'if (!canSeeAll(userRole) && suppliedNamePost) {',
        'if (false) {'],

    ['lead-requests: the approve/deny role gate is computed and discarded — a rep approves their own request',
        'netlify/functions/lead-requests.mjs',
        'if (forbiddenRole) return forbiddenRole;',
        'if (false) return forbiddenRole;'],

    ['lead-requests: the requester comes from the payload — one rep files requests as another',
        'netlify/functions/lead-requests.mjs',
        'requesterId: callerId,',
        'requesterId: data.requesterId || callerId,'],

    // ── The §0.54 settings hygiene pair ─────────────────────────────────────
    // Caught by the source assertions in tests/settings-hygiene.test.mjs.
    ['users: audit actor reverts to the TARGET — every user.updated row reads as the subject acting on themselves',
        'netlify/functions/users.mjs',
        "await writeAudit(orgId, 'user.updated', result.id, result.name, userId, await getCallerName(userId, orgId));",
        "await writeAudit(orgId, 'user.updated', result.id, result.name, userId, result.name);"],

    ['useSettings: the autosave no-change guard drops — every load mirror-back PUTs again',
        'src/hooks/useSettings.js',
        'if (json === lastSavedRef.current) return;',
        'if (false) return;'],

    // ── The §0.56 API-key surface (closed 2 Sep) ────────────────────────────
    // Caught by the source assertions in tests/api-surface.test.mjs.
    ['public-api: the method gate drops — a write with a valid API key reaches the router',
        'netlify/functions/public-api.mjs',
        "if (event.httpMethod !== 'GET') {",
        'if (false) {'],

    ['endpoints: the users.id-vs-Clerk-id filter returns (every rep loses their own records)',
        'netlify/functions/leads.mjs',
        '                const callerId = await getCallerId(userId, orgId);',
        '                const [rr] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId));\n                const callerId = rr?.id || null;'],

    ['endpoints: getRepUser loses its org scope (one tenant emailed another tenant deal data)',
        'netlify/functions/opportunities.mjs',
        '.where(and(eq(users.name, repName), eq(users.orgId, orgId)));',
        '.where(eq(users.name, repName));'],

    // ── Identity split: users.id is app-owned, Clerk's id is an attribute ────
    // These five cover assertions added with that change. Without them the
    // harness still reports a clean run while the guards are decorative --
    // exactly the shape 18b11 warns about, since adding a TEST does not add a
    // MUTATION and the count keeps reading green either way.

    ['_bulk: the fail-open ownership guard returns (a rep overwrites the whole org)',
        'netlify/functions/_bulk.mjs',
        'if (!mayMutate({ ownerId: prior.ownerId, callerId, canSeeAll })) {',
        'if (callerId !== null && prior.ownerId && prior.ownerId !== callerId) {'],

    ['schema: users.email is globally unique again (one email, one org, forever)',
        'db/schema.ts',
        "email:         varchar('email', { length: 255 }).notNull(),",
        "email:         varchar('email', { length: 255 }).notNull().unique(),"],

    ['schema: clerkUserId disappears, so identity collapses back onto the PK',
        'db/schema.ts',
        "clerkUserId:   text('clerk_user_id'),",
        "clerkUserIdGone: text('clerk_user_id_gone'),"],

    ['schema: the per-org email index stops being UNIQUE (enforces nothing)',
        'db/schema.ts',
        "uniqueIndex('users_org_email_uq').on(t.orgId, t.email),",
        "index('users_org_email_uq').on(t.orgId, t.email),"],

    ['users.mjs: acceptance rewrites the PRIMARY KEY again (the orphaning defect)',
        'netlify/functions/users.mjs',
        '                                clerkUserId: userId,\n                                role:        realRole,',
        '                                id: userId,\n                                role:        realRole,'],

    ['bulkClient: chunking disabled',
        'src/utils/bulkClient.js', 'export const BULK_CHUNK = 400;', 'export const BULK_CHUNK = 100000;'],

    ['bulkClient: putBulk throws from inside its loop (the original defect)',
        'src/utils/bulkClient.js',
        "if (!r.ok) { error = errorFrom(r.status, body, 'Bulk update failed'); break; }",
        "if (!r.ok) { throw new Error(errorFrom(r.status, body, 'Bulk update failed')); }"],

    ['bulkClient: appliedIds ignores notFound/forbidden',
        'src/utils/bulkClient.js',
        'const applied  = chunk.map(row => row.id).filter(id => !rejected.has(id));',
        'const applied  = chunk.map(row => row.id);'],

    ['bulkClient: an inconsistent chunk is applied anyway',
        'src/utils/bulkClient.js',
        `if (applied.length === chunkUpdated) {
                appliedIds.push(...applied);
            } else {
                discrepancy += Math.abs(applied.length - chunkUpdated);
            }`,
        'appliedIds.push(...applied);'],

    ['bulkClient: progress ticks for a failed chunk',
        'src/utils/bulkClient.js',
        "if (!r.ok) { error = errorFrom(r.status, body, 'Bulk update failed'); break; }",
        "if (!r.ok) { error = errorFrom(r.status, body, 'Bulk update failed'); report(onProgress, progressOffset, done + chunk.length, progressTotal); break; }"],

    ['bulkClient: postNew partitions by count instead of insertedIds',
        'src/utils/bulkClient.js',
        'const ids = new Set(body.insertedIds);\n                for (const row of chunk) (ids.has(row.id) ? landed : failed).push(row);',
        'landed.push(...chunk.slice(0, body.insertedIds.length));\n                failed.push(...chunk.slice(body.insertedIds.length));'],

    ['importReceipt: unsent rows are not counted as failed',
        'src/utils/importReceipt.js',
        'failed: Math.max(0, attempted - created),',
        'failed: 0,'],

    ['importReceipt: isClean ignores dropped rows (the green-tick bug)',
        'src/utils/importReceipt.js',
        "export const isClean = (r) => !r.error && r.failed === 0 && r.dropped === 0;",
        "export const isClean = (r) => !r.error && r.failed === 0;"],

    ['importReceipt: mergeReceipts lets a later error overwrite the first',
        'src/utils/importReceipt.js',
        'if (!out.error && p.error) out.error = p.error;',
        'if (p.error) out.error = p.error;'],

    ['importReceipt: receiptFromError trusts anything with a .receipt',
        'src/utils/importReceipt.js',
        "(err && err.receipt && typeof err.receipt === 'object') ? err.receipt : null;",
        'err ? err.receipt : null;'],

    ['csvMapping: drop rule tightened to .every',
        'src/utils/csvMapping.js',
        "requiredFields.length === 0 || requiredFields.some(f => (record[f.key] || '').trim() !== '');",
        "requiredFields.length === 0 || requiredFields.every(f => (record[f.key] || '').trim() !== '');"],

    ['csvMapping: drops are silent again (the original defect)',
        'src/utils/csvMapping.js',
        `dropped.push({
                // +2, not +1: row 1 of the file is the header, so this is the
                // number the user will see in Excel when they go to fix it.
                rowNumber: idx + 2,
                sample: (row || []).filter(Boolean).slice(0, 3).join(', ').slice(0, 60),
            });`,
        '/* silently discarded */'],

    ['csvMapping: row numbers are 0-based against the file',
        'src/utils/csvMapping.js', 'rowNumber: idx + 2,', 'rowNumber: idx + 1,'],

    ['csvMapping: the cause is no longer diagnosed',
        'src/utils/csvMapping.js',
        '.filter(f => !isMapped(fieldMapping?.[f.key]))\n        .map(f => f.label);',
        '.filter(() => false)\n        .map(f => f.label);'],

    ['_sanitize: the union is computed per row, breaking INSERT uniformity',
        'netlify/functions/_sanitize.mjs',
        'for (const row of rows) {\n        if (!row || typeof row !== \'object\') continue;\n        for (const key of Object.keys(row)) supplied.add(key);\n    }',
        'const firstRow = rows[0] || {};\n    for (const key of Object.keys(firstRow)) supplied.add(key);'],

    ['_sanitize: narrowing removed entirely (the original defect)',
        'netlify/functions/_sanitize.mjs',
        'if (supplied.has(key)) out[key] = full[key];',
        'out[key] = full[key];'],

    ['_sanitize: a missing sanitize function passes raw rows through',
        'netlify/functions/_sanitize.mjs',
        "throw new TypeError('partialRows requires the endpoint sanitize function');",
        'return rows;'],
    ['bulkUpsert: NOT NULL backfill removed (the 500)',
        'netlify/functions/_bulk.mjs',
        'if (!(k in out) && prior && prior[k] !== undefined) out[k] = prior[k];',
        '/* no backfill */'],

    ['bulkUpsert: backfilled columns leak into the SET clause (data loss)',
        'netlify/functions/_bulk.mjs',
        'const cols = [...new Set(eligible.flatMap(Object.keys))]',
        'const cols = [...new Set(eligible.map(backfill).flatMap(Object.keys))]'],

    ['bulkUpsert: required columns not requested in the projection',
        'netlify/functions/_bulk.mjs',
        'for (const k of required) projection[k] = table[k];',
        '/* projection unchanged */'],

    ['bulkUpsert: hasDefault columns are backfilled too',
        'netlify/functions/_bulk.mjs',
        'return c && c.name && c.notNull && !c.hasDefault && !BULK_IMMUTABLE.has(k);',
        'return c && c.name && c.notNull && !BULK_IMMUTABLE.has(k);'],
    ['deploy graph: _lib.mjs stops re-exporting bulkInsert (the failed deploy)',
        'netlify/functions/_lib.mjs',
        'export const bulkInsert = (args) => coreBulkInsert({ client: db, ...args });', ''],

    ['deploy graph: _lib.mjs stops re-exporting bulkUpsert (the failed deploy)',
        'netlify/functions/_lib.mjs',
        'export const bulkUpsert = (args) => coreBulkUpsert({ client: db, ...args });', ''],
    ['csvMapping: unmapped fields emit \'\' again (the Next Steps wipe)',
        'src/utils/csvMapping.js',
        'if (isMapped(colIdx)) record[field.key] = row[colIdx] || \'\';',
        'record[field.key] = isMapped(colIdx) ? (row[colIdx] || \'\') : \'\';'],

    ['csvMapping: a mapped-but-empty column is dropped too',
        'src/utils/csvMapping.js',
        'if (isMapped(colIdx)) record[field.key] = row[colIdx] || \'\';',
        'if (isMapped(colIdx) && row[colIdx]) record[field.key] = row[colIdx];'],
    ['importRows: an overwrite re-materialises every column (the Next Steps wipe)',
        'src/utils/importRows.js',
        'if (Object.prototype.hasOwnProperty.call(row || {}, key)) out[key] = coerce(row[key]);',
        'out[key] = coerce((row || {})[key]);'],

    ['importRows: an overwrite rewrites createdDate',
        'src/utils/importRows.js',
        'const { createdDate: _drop, ...rest } = fromCsv;\n        return { id: existingId, ...rest };',
        'return { id: existingId, ...fromCsv };'],

    ['importRows: a create no longer fills defaults',
        'src/utils/importRows.js',
        'const merged = { ...CREATE_DEFAULTS, ...csvColumns };',
        'const merged = { ...csvColumns };'],

    ['importRows: stageChangedDate unset on create (the NaNd / never-stale bug)',
        'src/utils/importRows.js',
        'stageChangedDate: backdate(today, parseDaysInStage(daysInStage) || 0),', 'stageChangedDate: undefined,'],
    ['stage: an unchanged stage resets the clock anyway (the re-import trap)',
        'netlify/functions/_stage.mjs',
        '    } else if (changed) {\n        patch.stageChangedDate = importDate;\n    }',
        '    } else {\n        patch.stageChangedDate = importDate;\n    }'],

    ['stage: history is replaced rather than appended (0A0000.1 again)',
        'netlify/functions/_stage.mjs',
        'patch.stageHistory = [...existing, {',
        'patch.stageHistory = [{'],

    ['stage: the history entry uses the import date, not the derived one',
        'netlify/functions/_stage.mjs',
        'date:      patch.stageChangedDate || importDate,',
        'date:      importDate,'],

    ['stage: a negative daysInStage is not clamped (future date, never stale)',
        'src/utils/stageClock.js',
        'if (n < 0) return 0;', 'if (n < 0) return n;'],

    ['stage: daysInStage leaks through as a column',
        'netlify/functions/_stage.mjs',
        'const { daysInStage: _transport, ...rest } = row;\n        return { row: { ...rest, ...patch }, patch, prior };',
        'return { row: { ...row, ...patch }, patch, prior };'],

    // ---- batch uniformity (0.22) -------------------------------------------
    // applyStageChanges derives stageChangedDate and stageHistory PER ROW;
    // partialRows keeps the UNION across the batch. One deal moving stage put both
    // keys into the union for every row, sanitize() supplied null and [], and
    // bulkUpsert wrote them -- an unmoved deal losing its clock and its whole stage
    // history because a DIFFERENT deal in the same file moved. Every fixture in
    // tests/stage-batch.test.mjs is multi-row: a single-row fixture cannot express
    // this, which is why 211 tests and 29 live mutations all passed over it.

    ['stage/batch: the backfill is removed (the shipped defect)',
        'netlify/functions/_stage.mjs',
        `        for (const key of inBatch) {
            if (!Object.prototype.hasOwnProperty.call(row, key)) {
                row[key] = storedValue(key, prior);
            }
        }
`,
        ''],

    ['stage/batch: every derived key is backfilled, not only those in the batch',
        'netlify/functions/_stage.mjs',
        `    const inBatch = DERIVED_KEYS.filter(
        key => staged.some(s => Object.prototype.hasOwnProperty.call(s.patch, key))
    );`,
        '    const inBatch = DERIVED_KEYS;'],

    ['stage/batch: backfill invents null instead of reading the stored row',
        'netlify/functions/_stage.mjs',
        '    return prior?.[key] ?? null;',
        '    return null;'],

    ['stage/batch: the stageHistory backfill discards the stored array',
        'netlify/functions/_stage.mjs',
        '        return Array.isArray(prior?.stageHistory) ? prior.stageHistory : [];',
        '        return [];'],

    ['stage/batch: the backfill overwrites a row\'s own patch',
        'netlify/functions/_stage.mjs',
        `            if (!Object.prototype.hasOwnProperty.call(row, key)) {
                row[key] = storedValue(key, prior);
            }`,
        '            row[key] = storedValue(key, prior);'],

    ['stage/batch: stageChangedDate drops out of DERIVED_KEYS',
        'netlify/functions/_stage.mjs',
        "const DERIVED_KEYS = ['stageChangedDate', 'stageHistory'];",
        "const DERIVED_KEYS = ['stageHistory'];"],

    ['stage/batch: stageHistory drops out of DERIVED_KEYS',
        'netlify/functions/_stage.mjs',
        "const DERIVED_KEYS = ['stageChangedDate', 'stageHistory'];",
        "const DERIVED_KEYS = ['stageChangedDate'];"],

    // ---- local dates (dateLocal.js) ----------------------------------------
    // `toISOString().split('T')[0]` converts to UTC before truncating, so it
    // returns tomorrow's date all evening west of Greenwich and yesterday's all
    // morning east of it. It was in 29 places in src/; the worst STORED a wrong
    // date on a coaching note, and TaskItem turned tasks due today red as overdue
    // from 7pm Central.
    //
    // Note the first entry is caught by a SOURCE assertion, not by output: at UTC
    // isoLocal and toISOString are the same function, so an output-only suite
    // passes with the bug restored on any UTC machine. Verified by running the
    // mutation under TZ=UTC before relying on it.
    ['dateLocal: isoLocal reverts to toISOString (the 29-site defect)',
        'src/utils/dateLocal.js',
        `    const p = (n) => String(n).padStart(2, '0');
    return \`\${d.getFullYear()}-\${p(d.getMonth() + 1)}-\${p(d.getDate())}\`;`,
        "    return d.toISOString().split('T')[0];"],

    ['dateLocal: todayLocal stops going through isoLocal',
        'src/utils/dateLocal.js',
        '    return isoLocal(new Date());',
        "    return new Date().toISOString().split('T')[0];"],

    ['dateLocal: the month is left 0-based',
        'src/utils/dateLocal.js',
        '${p(d.getMonth() + 1)}',
        '${p(d.getMonth())}'],

    ['dateLocal: zero-padding removed, so the strings stop sorting',
        'src/utils/dateLocal.js',
        "    const p = (n) => String(n).padStart(2, '0');",
        '    const p = (n) => String(n);'],

    ['dateLocal: day and month transposed',
        'src/utils/dateLocal.js',
        'return \`\${d.getFullYear()}-\${p(d.getMonth() + 1)}-\${p(d.getDate())}\`;',
        'return \`\${d.getFullYear()}-\${p(d.getDate())}-\${p(d.getMonth() + 1)}\`;'],

    // Cross-file: the backfill reads prior.stageChangedDate, so the endpoint must
    // select it. Drop it there and _stage.mjs backfills null just as confidently --
    // a correct fix undone by the next component along, which is how five sessions
    // went on the Next Steps chain. Pinned by a source assertion because no unit
    // test of _stage.mjs can see the endpoint's query.
    ['stage/batch: opportunities.mjs stops selecting stageChangedDate into priors',
        'netlify/functions/opportunities.mjs',
        '                        stageChangedDate: opportunities.stageChangedDate,\n',
        ''],

    ['audit: values are no longer truncated',
        'netlify/functions/_audit.mjs',
        'parts.push(`${k}=${String(v).slice(0, 60)}`);',
        'parts.push(`${k}=${String(v)}`);'],

    ['audit: empty fields are rendered instead of omitted',
        'netlify/functions/_audit.mjs',
        "if (v === null || v === undefined || String(v).trim() === '') continue;",
        'if (false) continue;'],
    ['receipt: the naive pluraliser is back ("2 opportunitys")',
        'src/utils/importReceipt.js',
        "if (/[^aeiou]y$/i.test(one)) return `${one.slice(0, -1)}ies`;   // opportunity -> opportunities",
        '/* naive */'],
    // ── Role vocabulary ─────────────────────────────────────────────────────
    // The gate here was a BLOCKLIST: it denied 'ReadOnly' and 'Technician' by exact
    // string and permitted everything else, so every unrecognised value carried full
    // write access to ~28 endpoints. The first mutation is the one that matters --
    // it restores that, and the suite must notice.

    ['role: requireWrite reverts to a BLOCKLIST (any unknown role writes)',
        'netlify/functions/auth.mjs',
        '    if (WRITE_ROLES.includes(auth?.userRole)) return null;\n    if (isTechnician(auth?.userRole) && opts.allowTechnician) return null;',
        '    if (isTechnician(auth?.userRole) && opts.allowTechnician) return null;'],

    ['role: isAppRole accepts anything, so no writer validates',
        'netlify/functions/auth.mjs',
        'export const isAppRole = (role) => APP_ROLES.includes(role);',
        'export const isAppRole = (role) => true;'],

    ['role: the unrecognised refusal reuses the read-only message (three problems, one report)',
        'netlify/functions/auth.mjs',
        "body: JSON.stringify({ error: 'Forbidden: unrecognised role. Ask an administrator to reset your role.' }),",
        "body: JSON.stringify({ error: 'Forbidden: read-only role' }),"],

    ['role: users-sync falls back to the Clerk ORG membership role again',
        'netlify/functions/users-sync.mjs',
        "            const rawRole = cu.publicMetadata?.role;\n            const role = isAppRole(rawRole) ? rawRole : 'User';",
        "            const rawRole = cu.publicMetadata?.role;\n            const role = cu.publicMetadata?.role || member.role?.replace('org:', '') || 'User';"],

    ['role: flatten() spreads the profile blob last, so userType overrides the column',
        'netlify/functions/users.mjs',
        '    const flatten = (row) => ({\n        ...(row.profile || {}),\n        id:            row.id,',
        '    const flatten = (row) => ({\n        id:            row.id,'],

    ['role: the invite rows are seeded with the display label again',
        'src/Tabs/settings/people/UsersDetail.jsx',
        "{ id:1, email:'', role:'User', team:'', manager:'', territory:'', valid:true, error:'' },",
        "{ id:1, email:'', role:'Sales Rep', team:'', manager:'', territory:'', valid:true, error:'' },"],

    ['role: the role select drops its unmatched-value option (member displays as Admin)',
        'src/components/modals/UserModal.jsx',
        "                                    {!KNOWN_ROLES.includes(formData.userType || 'User') && (",
        '                                    {false && ('],

    // ── The read side of the date contract (0.60) ────────────────────────────
    ['date: parseLocalDate appends noon to a full timestamp again (the NaNyr bug)',
        'src/utils/dateLocal.js',
        "    const d = /^\\d{4}-\\d{2}-\\d{2}$/.test(s) ? new Date(s + 'T12:00:00') : new Date(s);",
        "    const d = new Date(s + 'T12:00:00');"],
    ['date: parseLocalDate reads a bare day at UTC midnight',
        'src/utils/dateLocal.js',
        "? new Date(s + 'T12:00:00') : new Date(s);",
        '? new Date(s) : new Date(s);'],
    ['date: toLocalDay lets an impossible US date roll into the next month',
        'src/utils/dateLocal.js',
        'return validDay(+m[3], +m[1], +m[2]);',
        'return isoLocal(new Date(+m[3], +m[1] - 1, +m[2], 12));'],
    ['date: toLocalDay hands a bare run of digits to the engine parser (year 46000)',
        'src/utils/dateLocal.js',
        "    if (!s || /^\\d+$/.test(s)) return null;",
        '    if (!s) return null;'],
    ['import: the date cells go back to passing through as written',
        'src/utils/importRows.js',
        '    forecastedCloseDate:csvDay,',
        "    forecastedCloseDate:(v) => v || '',"],
    ['date: the coaching note stores a UTC day again (the sweep scan)',
        'src/Tabs/SalesManagerTab.jsx',
        'date:todayLocal(), author:currentUser }];',
        "date:new Date().toISOString().split('T')[0], author:currentUser }];"],
    // ── Unreadable dates refused at Preview (0.64) ──────────────────────────
    ['csvMapping: an unreadable date cell passes through again (the 0.60 open question, re-opened)',
        'src/utils/csvMapping.js',
        '        && toLocalDay(record[f.key]) === null);',
        '        && false);'],
    ['csvMapping: a BLANK date cell is refused too (silence treated as a bad date)',
        'src/utils/csvMapping.js',
        "        && (record[f.key] || '').trim() !== ''",
        '        && true'],
    ['csvMapping: every field is date-checked, not only type day (Notes "Sept 15" refused)',
        'src/utils/csvMapping.js',
        "    fields.filter(f => f.type === 'day'",
        '    fields.filter(f => true'],
    ['csvMapping: a refused date is reported as an empty required field',
        'src/utils/csvMapping.js',
        "                    reason: 'date',",
        "                    reason: 'required',"],
    ['csvMapping: the refusal names no cell',
        'src/utils/csvMapping.js',
        "                    value:  (record[bad[0].key] || '').trim(),",
        "                    value:  '',"],
    ['csvMapping: refused rows are 0-based against the file',
        'src/utils/csvMapping.js',
        '                    rowNumber: idx + 2',
        '                    rowNumber: idx + 1'],
    ['CsvImportModal: Close Date is no longer a day field (the refusal never runs on the real list)',
        'src/components/modals/CsvImportModal.jsx',
        "        { key: 'forecastedCloseDate', label: 'Close Date', type: 'day' },",
        "        { key: 'forecastedCloseDate', label: 'Close Date' },"],
    ['date: a yearless cell becomes the year 2001 again ("Sept 15" imports as 2001-09-15)',
        'src/utils/dateLocal.js',
        "    if (!/\\d{4}/.test(s)) return null;",
        '    if (false) return null;'],
    ['date: a two-digit US year is refused ("9/15/26" stops importing)',
        'src/utils/dateLocal.js',
        'return validDay(2000 + +m[3], +m[1], +m[2]);',
        'return null;'],

    // ── Pending sessions (0.65) ─────────────────────────────────────────────
    ['auth: a pending session token passes again (the 0.65 bypass, server side)',
        'netlify/functions/auth.mjs',
        "    payload?.sts !== undefined && payload.sts !== 'active'",
        '    false'],
    ['auth: the gate becomes "not pending" instead of "active or nothing"',
        'netlify/functions/auth.mjs',
        "    payload?.sts !== undefined && payload.sts !== 'active'",
        "    payload?.sts === 'pending'"],
    ['auth: a v1 token with no sts claim is refused (every old session locked out)',
        'netlify/functions/auth.mjs',
        "    payload?.sts !== undefined && payload.sts !== 'active'",
        "    payload?.sts !== 'active'"],
    ['auth: verifyAuth no longer refuses (the helper exists, nothing calls it)',
        'netlify/functions/auth.mjs',
        '        const pending = pendingSessionRefusal(payload);\n        if (pending) return pending;',
        '        const pending = null;'],
    ['App: the gate trusts useUser again (the 0.65 bypass, client side)',
        'src/App.jsx',
        '    const clerkUser = isSignedIn ? rawClerkUser : null;',
        '    const clerkUser = rawClerkUser;'],

    // ── Loss analysis reads (0.66) ──────────────────────────────────────────
    ['loss: the bucket ignores the category again (every categorised loss is "Other")',
        'src/utils/lossAnalysis.js',
        "    return clean(o?.lostCategory) || clean(o?.lostReason) || fallback;",
        "    return clean(o?.lostReason) || fallback;"],
    ['loss: the exit stage reads the closing entry\'s own stage ("No stage history data")',
        'src/utils/lossAnalysis.js',
        "        if (CLOSED_STAGES.includes(last.stage)) return clean(last.prevStage) || null;",
        "        if (false) return clean(last.prevStage) || null;"],
    ['loss: a close with no history reports itself as the exit stage',
        'src/utils/lossAnalysis.js',
        "    return cur && !CLOSED_STAGES.includes(cur) ? cur : null;",
        "    return cur || null;"],
    ['loss: previousStageOf draws the move\'s own stage (X -> X)',
        'src/utils/lossAnalysis.js',
        "    return last ? (clean(last.prevStage) || null) : null;",
        "    return last ? (clean(last.stage) || null) : null;"],
    ['loss: a stage outside the funnel order vanishes from the rows',
        'src/utils/lossAnalysis.js',
        "        if (s) counts[s] = (counts[s] || 0) + 1;",
        "        if (s && stageOrder.includes(s)) counts[s] = (counts[s] || 0) + 1;"],
    ['reports: the Win / loss bucket reads the notes first again',
        'src/Tabs/ReportsTab.jsx',
        "            const r = lossBucketOf(o, 'Other');",
        "            const r = o.lostReason || 'Other';"],

    // ── The slice applies to activities (0.67) ─────────────────────────────
    ['scope: the slice is ignored — every rep shows every activity again',
        'src/utils/reportScope.js',
        '    if (!reps) return acts;',
        '    return acts;'],
    ['scope: a team slice selects every named user, not the team',
        'src/utils/reportScope.js',
        "    if (team)      return new Set(list.filter(u => u.name && u.team === team).map(u => u.name));",
        "    if (team)      return new Set(list.filter(u => u.name).map(u => u.name));"],
    ['scope: an activity with no rep passes every slice',
        'src/utils/reportScope.js',
        '    return acts.filter(a => { const r = activityRepOf(a); return r && reps.has(r); });',
        '    return acts.filter(a => { const r = activityRepOf(a); return !r || reps.has(r); });'],
    ['reports: the timed activity set starts from the role-gated list again (the 0.67 bug)',
        'src/Tabs/ReportsTab.jsx',
        '                    ? reportsActivities.filter(a => inRange(dayOf(a.date || a.createdAt), reportRange))',
        '                    ? roleFilteredActivities.filter(a => inRange(dayOf(a.date || a.createdAt), reportRange))'],

    // ── Report period + comparison windows (0.68 tier 1, items 1–2) ─────────
    ['period: the fiscal year is named by its START year again (every quarter a year off)',
        'src/utils/reportPeriod.js',
        "    return quarterOf(isoLocal(today), fiscalStart).fiscalYear;",
        "    return today.getFullYear() - (fiscalStart === 1 ? 1 : 0);"],
    ['period: Q1 previous-quarter stays in the same fiscal year',
        'src/utils/reportPeriod.js',
        "        return q === 1 ? fiscalRange(fy - 1, 'Q4', fiscalStart) : fiscalRange(fy, `Q${q - 1}`, fiscalStart);",
        "        return q === 1 ? fiscalRange(fy, 'Q4', fiscalStart) : fiscalRange(fy, `Q${q - 1}`, fiscalStart);"],
    ['period: All time gets a fake 90-day baseline again',
        'src/utils/reportPeriod.js',
        "    if (!period || period === 'all') return null;\n    const fy = currentFiscalYear(fiscalStart, today);",
        "    const fy = currentFiscalYear(fiscalStart, today);\n    if (!period || period === 'all') { const t = isoLocal(today); return { from: shiftDays(t, -180), to: shiftDays(t, -90) }; }"],
    ['period: dayOf slices the UTC day off an instant',
        'src/utils/reportPeriod.js',
        "    const d = parseLocalDate(s);\n    return d ? isoLocal(d) : '';",
        "    return s.slice(0, 10);"],
    ['period: inRange treats an empty day as inside every range',
        'src/utils/reportPeriod.js',
        "    if (!day || !range) return false;",
        "    if (!range) return false;"],
    ['reports: the comparison baseline starts from the role-gated list again (unsliced)',
        'src/Tabs/ReportsTab.jsx',
        "const comparedOpps = priorRangeR ? reportsOpps.filter(",
        "const comparedOpps = priorRangeR ? roleFilteredOpps.filter("],

    // ── Opportunity History text columns + Actions fetch (0.68 batch 2) ─────
    ['oppText: products text is not split (one "product" named "Shiftboard, AutoCall")',
        'src/utils/oppText.js',
        "    const parts = Array.isArray(value) ? value : String(value).split(',');",
        "    const parts = Array.isArray(value) ? value : [String(value)];"],
    ['oppText: contact names are written with a bare comma (OpportunityModal splits on ", ")',
        'src/utils/oppText.js',
        "    return out.join(', ');",
        "    return out.join(',');"],
    ['oppText: duplicate contact names are kept',
        'src/utils/oppText.js',
        "        if (s && !seen.has(s)) { seen.add(s); out.push(s); }",
        "        if (s) { out.push(s); }"],
    ['reports: the contacts column is written as an array again (the add path)',
        'src/Tabs/ReportsTab.jsx',
        "                                                                contacts:   contactNamesText(mergedNames),",
        "                                                                contacts:   mergedNames,"],
    ['reports: the Actions report stores the Response as data again',
        'src/Tabs/ReportsTab.jsx',
        "            if (!res.ok) throw new Error(`HTTP ${res.status}`);\n            setData(await res.json());",
        "            setData(res);"],
];

// ── BASELINE ────────────────────────────────────────────────────────────────
//
// A mutation is judged CAUGHT when the suite exits non-zero. If the suite is
// ALREADY failing, every mutation exits non-zero and the harness reports a
// perfect score over code it never actually tested.
//
// That is not hypothetical. This ran twice reporting 73/73 while
// tests/bulk-upsert.test.mjs had three RED tests -- including the three security
// assertions about ownership on the bulk path. The number that was supposed to
// prove the guards worked was, at that moment, proving only that node exits 1.
//
// So: prove GREEN first, and refuse to grade anything otherwise.
console.log('Baseline: running the suites unmutated...');
try {
    execSync(`node --test ${SUITES}`, { stdio: 'pipe' });
    console.log('Baseline: green.\n');
} catch (e) {
    console.error('\nBASELINE IS RED — refusing to run mutations.\n');
    console.error('Every mutation would report CAUGHT because the suite already fails,');
    console.error('and the score would be meaningless. Fix the failing test(s) first:\n');
    const out = `${e.stdout || ''}${e.stderr || ''}`;
    const fails = out.split(/\r?\n/).filter((l) => /^(not ok|✖|# fail)/.test(l.trim()));
    console.error(fails.length ? fails.join('\n') : out.slice(-2000));
    process.exit(1);
}

let survived = 0;
let stale = 0;
for (const [name, file, from, to] of mutations) {
    const original = readFileSync(file, 'utf8');
    const re = anchorRe(from);
    if (!re.test(original)) {
        // Counts as survived, and says DID NOT RUN rather than the old "SKIP".
        // An unmatched anchor is an absence of evidence being printed in the same
        // column as genuine passes; it must not read like one.
        console.log(`STALE  ${name}\n       anchor not found in ${file} — this mutation DID NOT RUN`);
        survived++;
        stale++;
        continue;
    }
    writeFileSync(file, original.replace(re, () => toFileEol(to, original)));
    let failed = false;
    try {
        execSync(`node --test ${SUITES}`, { stdio: 'pipe' });
    } catch {
        failed = true;
    }
    writeFileSync(file, original);
    console.log(`${failed ? 'CAUGHT' : 'SURVIVED'}  ${name}`);
    if (!failed) survived++;
}

console.log(`\n${mutations.length - survived}/${mutations.length} mutations caught.`);
if (stale) console.log(`${stale} anchor(s) STALE — those mutations never ran. Repoint them before trusting the count.`);
process.exit(survived ? 1 : 0);
