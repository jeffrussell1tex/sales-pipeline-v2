// THE GUARD for the unknown-save rule (state §0.261, docs/design/unknown-save — Jeff, 16 Nov: "A"; 18 Nov: Q1-Q4
// "Recommended"). Only a 4xx whose body says why in the server's own words proves a write wrote nothing (heardRefusal):
// every function's 500 says "Internal server error" and about 40 write paths can answer it after they committed
// (census-D §2C), and a page, a wordless answer or a request that threw prove nothing either. Such an answer keeps the
// change on screen and says it may have been saved (maybeSaid, writeRefusal); a create keeps one id across its presses,
// and a 409 saying that id is already stored in this org (code 'idInUse', ownIdTaken) — or an action already done
// ('already') — is read as landed (landedBefore).
//
// RUN: the one test, its words, dbWrite's answer, the bulk importer's and the receipt's maybe. WIRING: every create the
// server answers 'idInUse' for asks THIS org only; every file under src/ that sends a write is swept, or named with the
// Part that sweeps it (Parts 3-5, the next batches) or with why it is exempt — a new file that writes fails until named.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { heardRefusal, landedBefore, maybeSaid, alreadySaid, writeRefusal } from '../src/utils/refusalWords.js';
import { emptyReceipt, receiptFromInsert, receiptFromUpdate, isClean, describeReceipt, mergeReceipts } from '../src/utils/importReceipt.js';
import { makeBulkClient } from '../src/utils/bulkClient.js';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8').replace(/\r\n/g, '\n');
const answerOf = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => { if (body instanceof Error) throw body; return body; } });

test('RUN: heardRefusal — only a 4xx with the server\'s own words proves nothing was written', () => {
    assert.equal(heardRefusal(400, { error: 'Name is required' }), true);
    assert.equal(heardRefusal(403, { error: 'Forbidden' }), true);
    assert.equal(heardRefusal(409, { error: 'That deal id is already in use.' }), true);
    assert.equal(heardRefusal(499, { error: 'x' }), true);
    for (const [status, body, why] of [
        [500, { error: 'Internal server error', requestId: 'r1' }, 'REGRESSION: a 500 in words read as nothing written — it can follow a commit'],
        [502, null, 'a page'], [400, {}, 'a wordless 4xx'], [400, { error: '   ' }, 'blank words'], [422, { error: 42 }, 'words that are no text'],
        [399, { error: 'x' }, 'not a 4xx'], [0, { error: 'x' }, 'no answer'], [undefined, { error: 'x' }, 'no status'], [404, null, 'no body'],
    ]) assert.equal(heardRefusal(status, body), false, why);
});

test('RUN: landedBefore — a 409 saying the record is already stored here (idInUse) or the act already done (already)', () => {
    assert.equal(landedBefore(409, { error: 'That account id is already in use.', code: 'idInUse' }), true);
    assert.equal(landedBefore(409, { error: 'This request was already approved.', code: 'already' }), true);
    assert.equal(landedBefore(409, { error: 'That account id is already in use.' }), false, 'another org\'s id: refused, never landed');
    assert.equal(landedBefore(400, { code: 'idInUse' }), false, 'only a 409');
    assert.equal(landedBefore(409, null), false);
});

test('RUN: the words — maybeSaid, writeRefusal, alreadySaid', () => {
    assert.equal(maybeSaid('The deal', 'saved', 'The server returned 502.'), 'The deal may have been saved — reload the page to see whether it was: The server returned 502.');
    assert.equal(maybeSaid('3 of 5 deals', 'deleted', 'x', true), '3 of 5 deals may have been deleted — reload the page to see whether they were: x');
    assert.equal(maybeSaid('It', 'moved to Proposal', ''), 'It may have been moved to Proposal — reload the page to see whether it was.');
    assert.deepEqual(writeRefusal(answerOf(400, null), { error: 'Name is required', requestId: 'r9' }, '"Acme"'), { words: 'Name is required (ref r9)', unknown: false });
    assert.deepEqual(writeRefusal(answerOf(500, null), { error: 'Internal server error', requestId: 'r1' }, '"Acme"'),
        { words: '"Acme" may have been saved — reload the page to see whether it was: Internal server error (ref r1)', unknown: true });
    assert.deepEqual(writeRefusal(answerOf(502, null), null, 'The calendar', 'disconnected'),
        { words: 'The calendar may have been disconnected — reload the page to see whether it was: The server returned 502.', unknown: true });
    assert.equal(alreadySaid('The note', 'saved'), 'The note was already saved by an earlier press — shown as stored.');
});

test('RUN: dbWrite answers unknown and landed — a throw, a 5xx, a page and a wordless 4xx are unknown; the server\'s own 4xx is not; idInUse is landed', async () => {
    const hadWindow = globalThis.window, hadFetch = globalThis.fetch;
    globalThis.window = { __getClerkToken: async () => 'tok' };
    const { dbWrite } = await import('../src/utils/storage.js');
    const quiet = console.error;
    console.error = () => {};
    try {
        const run = async (answer) => { globalThis.fetch = async () => { if (answer instanceof Error) throw answer; return answer; }; return dbWrite('/x', { method: 'PUT' }); };
        assert.deepEqual(await run(answerOf(400, { error: 'Bad' })), { ok: false, status: 400, error: 'Bad', unknown: false, landed: false });
        assert.deepEqual(await run(answerOf(403, { error: 'Forbidden' })), { ok: false, status: 403, error: 'You do not have permission to make this change.', unknown: false, landed: false });
        assert.deepEqual(await run(answerOf(409, { error: 'That id is already in use.', code: 'idInUse' })), { ok: false, status: 409, error: 'That id is already in use.', unknown: false, landed: true });
        assert.deepEqual(await run(answerOf(500, { error: 'Internal server error', requestId: 'r1' })), { ok: false, status: 500, error: 'Internal server error (ref r1)', unknown: true, landed: false });
        assert.deepEqual(await run(answerOf(502, new SyntaxError('<html>'))), { ok: false, status: 502, error: 'The server returned 502.', unknown: true, landed: false });
        assert.deepEqual(await run(answerOf(400, {})), { ok: false, status: 400, error: 'The server returned 400.', unknown: true, landed: false });
        assert.deepEqual(await run(new TypeError('Failed to fetch')), { ok: false, status: 0, error: 'The server could not be reached.', unknown: true, landed: false });
        assert.equal((await run(answerOf(200, { ok: true }))).ok, true);
    } finally {
        console.error = quiet;
        globalThis.fetch = hadFetch;
        if (hadWindow === undefined) delete globalThis.window; else globalThis.window = hadWindow;
    }
});

test('RUN: the bulk importer — a chunk whose answer proves nothing counts its rows maybe, never "did not save"; the server\'s own refusal still fails them', async () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({ id: `r${i}` }));
    const post = async (answer) => makeBulkClient(async () => { if (answer instanceof Error) throw answer; return answer; }).postNew('/x', rows);
    for (const answer of [answerOf(502, new SyntaxError('<html>')), answerOf(500, { error: 'Internal server error' }), new TypeError('Failed to fetch'), answerOf(400, {})]) {
        const r = receiptFromInsert(await post(answer));
        assert.deepEqual([r.created, r.failed, r.maybe, isClean(r)], [0, 0, 5, false], 'REGRESSION: rows that may have saved counted as "did not save"');
        assert.ok(describeReceipt(r, 'contact').includes('5 may have saved — reload the page to see whether they did.'));
    }
    const refused = receiptFromInsert(await post(answerOf(400, { error: 'Bad rows' })));
    assert.deepEqual([refused.failed, refused.maybe], [5, 0], 'the server\'s own refusal wrote nothing');
    const put = await makeBulkClient(async () => answerOf(503, null)).putBulk('/x', rows);
    const up = receiptFromUpdate(put);
    assert.deepEqual([up.updated, up.failed, up.maybe], [0, 0, 5]);
    const both = mergeReceipts(receiptFromInsert({ attempted: 3, landed: [{}, {}], unsure: 1 }), { ...emptyReceipt(), attempted: 2, failed: 2 });
    assert.equal(both.attempted, both.created + both.updated + both.failed + both.unread + both.maybe, 'the receipt\'s invariant, maybe counted');
});

// ── WIRING: the server ──
const CREATES = [
    ['accounts', 'accounts', 'newRow.id'], ['activities', 'activities', 'newRow.id'], ['contacts', 'contacts', 'newRow.id'], ['tasks', 'tasks', 'newRow.id'],
    ['opportunities', 'opportunities', 'newRow.id'], ['saved-reports', 'savedReports', 'payload.id'], ['quotes', 'quotes', 'basePayload.id'],
    ['products', 'products', 'payload.id'], ['spiff-claims', 'spiffClaims', 'claim.id'], ['documents', 'documents', 'row.id'], ['export-runs', 'exportRuns', 'data.id'],
    ['leads', 'leads', 'newRow.id'], ['coaching-notes', 'coachingNotes', 'values.id'], ['export-dsr', 'dsrQueue', 'data.id'], ['export-schedules', 'exportSchedules', 'data.id'],
    ['lead-requests', 'leadClaimRequests', 'data.id'],
];
test('WIRING: each create answers a taken id 409 in words, and says idInUse only for an id THIS org holds (ownIdTaken by id and org)', () => {
    const lib = read('netlify/functions/_lib.mjs');
    const own = lib.slice(lib.indexOf('export async function ownIdTaken('), lib.indexOf('\n}\n', lib.indexOf('export async function ownIdTaken(')));
    assert.ok(own.includes('.where(and(eq(table.id, id), eq(table.orgId, orgId)))'), 'REGRESSION: the taken id asked of every org — another org\'s row read as this org\'s landed create');
    assert.ok(own.includes("if (typeof id !== 'string' || !id || !orgId) return false;"), 'no id or org: never landed');
    assert.ok(!/\.select\(\)|returning/.test(own), 'a yes or no — no row answered');
    for (const [file, table, idExpr] of CREATES) {
        const s = read(`netlify/functions/${file}.mjs`);
        assert.ok(s.includes(`.onConflictDoNothing({ target: ${table}.id })`), `${file}: a taken id writes nothing`);
        assert.ok(s.includes(`await ownIdTaken(${table}, ${idExpr}, orgId)`), `${file}: idInUse asked of this org's ${table}`);
        assert.ok(/import \{[^}]*\bownIdTaken\b[^}]*\} from '\.\/_lib\.mjs';/.test(s), `${file}: imports it`);
    }
    const lr = read('netlify/functions/lead-requests.mjs');
    assert.ok(lr.includes("...(existing.some(r => r.id === data.id) ? { code: 'already' } : {})"), 'a request sent again: already');
    assert.ok(lr.includes("const again = (data.action === 'approve' && request.status === 'approved') || (data.action === 'deny' && request.status === 'denied');"), 'the same answer again: already — never a deny over an approve');
    assert.ok(read('netlify/functions/quote-to-job.mjs').includes("already exists for this quote.`, code: 'already', job: existing });"));
    // Q4: a failed invitation never hands the member a raw error's text.
    const u = read('netlify/functions/users.mjs');
    assert.ok(!u.includes("err?.errors?.[0]?.message || err.message || 'Invite failed'"), 'REGRESSION: a database error\'s text said to the member');
    assert.ok(u.includes('said = `The server could not finish this invitation (ref ${ref}).`;'));
    assert.ok(u.includes("let said = typeof clerkMsg === 'string' && clerkMsg.trim() ? clerkMsg : '';"), 'REGRESSION: an error\'s own message falls through to the member');
    assert.ok(!/said = [^;\n]*err\.message/.test(u), 'REGRESSION: a raw err.message said');
});

test('RUN: a merge or its Undo answered by a wordless 4xx may have landed — said so, and the lists read again', async () => {
    const { mergeWords, undoWords } = await import('../src/utils/mergeUndo.js');
    const wordless = { ok: false, status: 404, error: 'The server returned 404.', unknown: true };
    assert.equal(mergeWords(wordless), 'The server returned 404. The merge may have been made — close this window and look under Past merges on this page.',
        'REGRESSION: a wordless 4xx said as refused');
    assert.equal(undoWords(wordless), 'The server returned 404. Reload the page to see whether the merge was undone.');
    assert.equal(mergeWords({ ok: false, status: 409, error: 'Already merged', unknown: false }), 'Already merged', 'the server\'s own refusal: its words');
    assert.equal(undoWords({ ok: false, status: 409, error: 'Already undone', unknown: false }), 'Merge not undone — Already undone');
    const hook = read('src/hooks/useMerge.js');
    assert.ok(hook.includes('if (r.ok || r.status === 0 || r.status >= 500 || r.unknown) refreshAfter(entityType);'), 'REGRESSION: an Undo that may have landed leaves the lists unread');
    assert.ok(hook.includes("if (r.status === 0 || r.status >= 500 || r.unknown) refreshAfter('account');") && hook.includes("if (r.status === 0 || r.status >= 500 || r.unknown) refreshAfter('contact');"));
});

// ── WIRING: the screens ──
const srcFiles = (dir = 'src') => readdirSync(new URL(`${dir}/`, ROOT)).flatMap((n) => {
    const p = `${dir}/${n}`;
    return statSync(new URL(p, ROOT)).isDirectory() ? srcFiles(p) : (/\.(jsx?|mjs)$/.test(n) ? [p] : []);
});
const WRITES = /dbWrite\(|method: ?['"](POST|PUT|PATCH|DELETE)['"]/;
const RULE = /\.unknown\b|heardRefusal|writeRefusal|maybeSaid|recordRefusal|ownRefusal|destRefusedOwn/;
// Swept: each write's failure path reads whether its answer proved nothing (§0.261 Part 2, and the four places that had
// the maybe rule before it).
const SWEPT = ['src/App.jsx', 'src/components/KanbanView.jsx', 'src/components/layout/AppHeader.jsx', 'src/components/layout/ModalLayer.jsx',
    'src/components/layout/QuickLogFab.jsx', 'src/components/modals/LeadModal.jsx', 'src/components/modals/OpportunityModal.jsx', 'src/components/rails/AccountPicker.jsx',
    'src/hooks/useAccounts.js', 'src/hooks/useActivities.js', 'src/hooks/useCoachingNotes.js', 'src/hooks/useContacts.js', 'src/hooks/useDocuments.js',
    'src/hooks/useMerge.js', 'src/hooks/useOpportunities.js', 'src/hooks/useTasks.js', 'src/hooks/useUserHandlers.js', 'src/utils/bulkClient.js',
    'src/utils/documentsStorage.js', 'src/utils/storage.js', 'src/Tabs/TasksTab.jsx', 'src/Tabs/settings/audit/AuditDetail.jsx'];
// The next batches (ANSWERS.md Q3): Part 3 (Leads, Quotes, Reports, the Sales Manager's three throws said "Not"; the quote
// and product creates' ids, useQuotes), Part 4 (Dispatch), Part 5 (Settings and its senders).
const PENDING = {
    'src/Tabs/LeadsTab.jsx': 3, 'src/Tabs/QuotesTab.jsx': 3, 'src/Tabs/ReportsTab.jsx': 3, 'src/Tabs/SalesManagerTab.jsx': 3, 'src/hooks/useQuotes.js': 3,
    'src/Tabs/DispatchTab.jsx': 4,
    'src/Tabs/settings/company/CompanyCalendarDetail.jsx': 5, 'src/Tabs/settings/data/BackupDetail.jsx': 5, 'src/Tabs/settings/data/ExportDetail.jsx': 5,
    'src/Tabs/settings/dispatch/DispatchServicePlansDetail.jsx': 5, 'src/Tabs/settings/dispatch/DispatchVehiclesDetail.jsx': 5,
    'src/Tabs/settings/integrations/ApiKeysDetail.jsx': 5, 'src/Tabs/settings/integrations/AutomationsDetail.jsx': 5,
    'src/Tabs/settings/integrations/ConnectedAppsDetail.jsx': 5, 'src/Tabs/settings/integrations/WebhooksDetail.jsx': 5,
    'src/Tabs/settings/people/TeamsDetail.jsx': 5, 'src/Tabs/settings/people/TerritoriesDetail.jsx': 5, 'src/Tabs/settings/people/UsersDetail.jsx': 5,
    'src/Tabs/settings/salesProcess/DealScoringDetail.jsx': 5, 'src/Tabs/settings/salesProcess/LeadScoringDetail.jsx': 5,
    'src/Tabs/settings/shared/saveSettings.js': 5,
};
const EXEMPT = {
    'src/utils/calendarConnect.js': 'starts the OAuth hand-off: calendar-oauth-start stores no connection (census-A row 66), so "not connected" holds whatever its answer',
};

test('THE GUARD: every file under src/ that sends a write is swept, named with the Part that sweeps it, or exempt with its reason', () => {
    const writers = srcFiles().filter((f) => WRITES.test(read(f))).sort();
    const named = new Set([...SWEPT, ...Object.keys(PENDING), ...Object.keys(EXEMPT)]);
    assert.deepEqual(writers.filter((f) => !named.has(f)), [], 'a file sends a write and is not named — sweep it (heardRefusal / writeRefusal / maybeSaid) or name it here with its Part');
    assert.deepEqual([...named].filter((f) => !writers.includes(f)), [], 'a name here sends no write any more — take it out');
    for (const f of SWEPT) assert.ok(RULE.test(read(f)), `${f}: swept, but reads no answer that proves nothing`);
    for (const f of Object.keys(PENDING)) assert.ok([3, 4, 5].includes(PENDING[f]), f);
    assert.ok(writers.length >= 44, `the census's files (${writers.length})`);
});

test('WIRING: a create keeps its id across presses — the rails, the deal window, the History tab, Quick Log, the coaching note, the SPIFF claim, the lead, the picker, the task notes', () => {
    assert.ok(read('src/components/rails/AccountRail.jsx').includes("setFormData({ ...EMPTY_ACCOUNT, ...src, ...(account ? {} : { id: 'id_' + crypto.randomUUID() }) });"));
    assert.ok(read('src/components/rails/ContactRail.jsx').includes("setFormData({ ...EMPTY_CONTACT, ...src, ...(contact ? {} : { id: 'id_' + crypto.randomUUID() }) });"));
    assert.ok(read('src/components/rails/ActivityRail.jsx').includes("{ ...EMPTY_ACTIVITY, date: today(), id: 'id_' + crypto.randomUUID(), ...ctx }"));
    assert.ok(read('src/components/modals/OpportunityModal.jsx').includes("            id: 'id_' + crypto.randomUUID(),\n            ...seeded,"));
    assert.ok(read('src/hooks/useAccounts.js').split("const newId = formData.id || ('id_' + crypto.randomUUID());").length === 3, 'both account creates');
    assert.ok(read('src/hooks/useContacts.js').includes("const newId = contactData.id || ('id_' + crypto.randomUUID());"));
    assert.ok(read('src/hooks/useActivities.js').includes("const newId = activityData.id || ('id_' + crypto.randomUUID());"));
    assert.ok(read('src/hooks/useOpportunities.js').includes("const newId = enrichedData.id || ('id_' + crypto.randomUUID());"));
    assert.ok(read('src/components/layout/QuickLogFab.jsx').includes("id: draftIdRef.current || (draftIdRef.current = 'id_' + crypto.randomUUID()),"));
    assert.ok(read('src/components/modals/CoachingNoteDialog.jsx').includes('if (!noteIdRef.current) noteIdRef.current = newNoteId();'));
    assert.ok(read('src/components/layout/ModalLayer.jsx').includes("id: spiffClaimIds.current[claimKey] || (spiffClaimIds.current[claimKey] = 'claim_' + crypto.randomUUID()),"));
    assert.ok(read('src/components/modals/LeadModal.jsx').includes("id:          leadIdRef.current || (leadIdRef.current = 'id_' + crypto.randomUUID()),"));
    assert.ok(read('src/components/rails/AccountPicker.jsx').includes("id: madeIds.current[name] || (madeIds.current[name] = 'id_' + crypto.randomUUID())"));
    assert.ok(read('src/components/rails/TaskRail.jsx').includes("id:            notesIdRef.current || (notesIdRef.current = 'id_' + crypto.randomUUID()),"));
    // A post's note id is the server's: an answer that proved nothing holds Post — never a second note.
    const m = read('src/components/modals/OpportunityModal.jsx');
    assert.ok(m.includes('if (r?.unknown) setNotePostHeld(true);') && m.includes('disabled={notePostHeld} onClick={postNote}'));
    // Rows that may have saved offer no second Import (their ids were that run's).
    assert.ok(read('src/components/modals/CsvImportModal.jsx').includes("{!clean && !r.maybe && <button style={secBtn} onClick={() => setStep('preview')}>← Back</button>}"));
});
