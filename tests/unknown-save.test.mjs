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
import { heardRefusal, landedBefore, maybeSaid, alreadySaid, writeRefusal, failureWords, refusalWords,
    writeRefusalOf, refusalError, unknownOf, saidError, thrownSaid } from '../src/utils/refusalWords.js';
import { maybeFreedWords, notFreedWords } from '../src/utils/dispatchUnassign.js';
import { pressNoticeOf } from '../src/utils/pressNotice.js';
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
    'src/utils/documentsStorage.js', 'src/utils/storage.js', 'src/Tabs/TasksTab.jsx', 'src/Tabs/settings/audit/AuditDetail.jsx',
    // Part 3 (state §0.262): Leads, Quotes (and its hook), Reports, the Sales Manager's three throws.
    'src/Tabs/LeadsTab.jsx', 'src/Tabs/QuotesTab.jsx', 'src/Tabs/ReportsTab.jsx', 'src/Tabs/SalesManagerTab.jsx', 'src/hooks/useQuotes.js',
    // Part 4 (state §0.263): Dispatch.
    'src/Tabs/DispatchTab.jsx'];
// The next batch (ANSWERS.md Q3): Part 5 (Settings and its senders). Part 3 swept in §0.262, Part 4 in §0.263.
const PENDING = {
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
    for (const f of Object.keys(PENDING)) assert.ok([5].includes(PENDING[f]), f);
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


// ── Part 3 (state §0.262): Leads, Quotes, Reports, the Sales Manager ──
// Each handler extracted as written and run over stubs. The Reports, Leads-request, quote-window, Create-job and Sales
// Manager cases run in tests/refusal-sweep.test.mjs (moved there with their Part); these are the ones no test ran.
const between = (src, start, end) => { const a = src.indexOf(start); assert.ok(a >= 0, start); const b = src.indexOf(end, a + start.length); assert.ok(b > a, end); return src.slice(a, b); };
const stateOf = (v) => { const st = { value: v }; st.set = (x) => { st.value = typeof x === 'function' ? x(st.value) : x; }; return st; };
const LEADS = 'src/Tabs/LeadsTab.jsx';
const leadSave = () => new Function('useCallback', 'requestOrg', 'stillOrg', 'setLeads', 'dbWrite', 'setUndoToast', 'maybeSaid',
    `${between(read(LEADS), '    const saveLead = useCallback(', '\n    }, [setLeads]);')}\n    }, [setLeads]);\nreturn saveLead;`);

test('RUN (Part 3): a lead change refused in the server\'s own words puts back only its own row\'s fields — a bulk press\'s other rows that landed stay; one whose answer proves nothing is kept and said as maybe', async () => {
    const run = (answers, org = { now: 'org_a' }) => {
        const leads = stateOf([{ id: 'l1', status: 'New', assignee: '' }, { id: 'l2', status: 'New', assignee: '' }]);
        const toasts = [];
        const gates = {};
        const dbWrite = (url) => new Promise((resolve) => { const id = url.split('id=')[1]; gates[id] = () => resolve(answers[id]); });
        const save = leadSave()((fn) => fn, () => 'org_a', (o) => o === org.now, leads.set, dbWrite, (t) => toasts.push(t), maybeSaid);
        return { leads, toasts, gates, save, org };
    };
    const HEARD = { ok: false, status: 403, error: 'Only a manager can assign leads.', unknown: false };
    const LOST = { ok: false, status: 0, error: 'The server could not be reached.', unknown: true };
    // A bulk press: l1 and l2 out together; l2 lands, then l1 is refused.
    const bulk = run({ l1: HEARD, l2: { ok: true, status: 200 } });
    const a = bulk.save('l1', { status: 'Working', assignee: 'Karen' });
    const b = bulk.save('l2', { status: 'Working', assignee: 'Karen' });
    bulk.gates.l2(); await b;
    bulk.gates.l1(); await a;
    assert.deepEqual(bulk.leads.value, [{ id: 'l1', status: 'New', assignee: '' }, { id: 'l2', status: 'Working', assignee: 'Karen' }],
        'REGRESSION: the whole list put back as it stood before the press — the other row that landed undone (census-B L1)');
    assert.deepEqual(bulk.toasts, [{ error: 'Lead not saved — Only a manager can assign leads.' }]);
    // No answer: kept, said as maybe.
    const lost = run({ l1: LOST });
    const c = lost.save('l1', { status: 'Working' });
    lost.gates.l1(); await c;
    assert.equal(lost.leads.value[0].status, 'Working', 'REGRESSION: a change that may have landed put back');
    assert.deepEqual(lost.toasts, [{ error: 'The lead may have been saved — reload the page to see whether it was: The server could not be reached.' }]);
    // Changed again since the press: the refusal leaves the newer value.
    const later = run({ l1: HEARD });
    const d = later.save('l1', { status: 'Working' });
    later.leads.set((prev) => prev.map((l) => (l.id === 'l1' ? { ...l, status: 'Lost' } : l)));
    later.gates.l1(); await d;
    assert.equal(later.leads.value[0].status, 'Lost', 'REGRESSION: a refusal put back over a newer change to its row');
    // After an org switch: nothing.
    const sw = run({ l1: HEARD });
    const e = sw.save('l1', { status: 'Working' });
    sw.org.now = 'org_b';
    sw.gates.l1(); await e;
    assert.deepEqual(sw.toasts, []);
});

test('RUN (Part 3): a lead Delete — the server\'s own refusal "Lead not deleted"; any other answer may have deleted it, the row kept', async () => {
    const del = new Function('useCallback', 'requestOrg', 'stillOrg', 'dbWrite', 'setLeads', 'setUndoToast', 'maybeSaid',
        `${between(read(LEADS), '    const deleteLead = useCallback(', '\n    }, [setLeads, setUndoToast]);')}\n    }, [setLeads, setUndoToast]);\nreturn deleteLead;`);
    for (const [answer, toast, rows] of [
        [{ ok: false, status: 403, error: 'Only an Admin can delete leads.', unknown: false }, 'Lead not deleted — Only an Admin can delete leads.', 1],
        [{ ok: false, status: 502, error: 'The server returned 502.', unknown: true }, 'The lead may have been deleted — reload the page to see whether it was: The server returned 502.', 1],
        [{ ok: true, status: 200 }, null, 0],
    ]) {
        const leads = stateOf([{ id: 'l1' }]);
        const toasts = [];
        await del((fn) => fn, () => 'o', () => true, async () => answer, leads.set, (t) => toasts.push(t), maybeSaid)('l1');
        assert.deepEqual([toasts, leads.value.length], [toast ? [{ error: toast }] : [], rows], toast || 'deleted');
    }
});

const QUOTES_HOOK = 'src/hooks/useQuotes.js';
const QUOTES_TAB = 'src/Tabs/QuotesTab.jsx';
test('RUN (Part 3): a product Delete answers what happened, and the Price Book says it — the server\'s own refusal "Not deleted", any other answer or none that it may have been; it said nothing', async () => {
    const hook = new Function('useCallback', 'setProducts', 'requestOrg', 'stillOrg', 'dbFetch', 'failureWords', 'refusalWords', 'heardRefusal',
        `${between(read(QUOTES_HOOK), '    const handleDeleteProduct = useCallback(', '\n    }, []);')}\n    }, []);\nreturn handleDeleteProduct;`);
    const run = async (answer, { switchOrg = false } = {}) => {
        const products = stateOf([{ id: 'p1', name: 'Widget', active: true }]);
        const org = { now: 'org_a' };
        const fetch = async () => { if (switchOrg) org.now = 'org_b'; if (answer instanceof Error) throw answer; return answer; };
        const r = await hook((fn) => fn, products.set, () => 'org_a', (o) => o === org.now, fetch, failureWords, refusalWords, heardRefusal)('p1');
        return { r, products: products.value };
    };
    assert.deepEqual((await run(answerOf(403, { error: 'Only an Admin can change the Price Book.' }))).r, { ok: false, error: 'Only an Admin can change the Price Book.', unknown: false });
    assert.deepEqual((await run(answerOf(502, new SyntaxError('x')))).r, { ok: false, error: 'The server returned 502.', unknown: true });
    assert.deepEqual((await run(new TypeError('Failed to fetch'))).r, { ok: false, error: 'The server could not be reached.', unknown: true });
    const done = await run(answerOf(200, {}));
    assert.deepEqual([done.r, done.products[0].active], [{ ok: true }, false]);
    assert.deepEqual((await run(answerOf(403, { error: 'x' }), { switchOrg: true })).r, { ok: false, quiet: true });
    // The Price Book's press notice, titled by the product.
    const local = new Function('handleDeleteProduct', 'products', 'setPressNotices', 'pressNoticeOf', 'maybeSaid',
        `${between(read(QUOTES_TAB), '    const handleDeleteProductLocal = async (id) => {', '\n    };')}\n    };\nreturn handleDeleteProductLocal;`);
    for (const [answer, words] of [
        [{ ok: false, error: 'Only an Admin can change the Price Book.', unknown: false }, 'Not deleted: Only an Admin can change the Price Book.'],
        [{ ok: false, error: 'The server returned 502.', unknown: true }, 'It may have been deleted — reload the page to see whether it was: The server returned 502.'],
        [{ ok: true }, null], [{ ok: false, quiet: true }, null],
    ]) {
        const notices = stateOf([]);
        await local(async () => answer, [{ id: 'p1', name: 'Widget' }], notices.set, pressNoticeOf, maybeSaid)('p1');
        assert.deepEqual(notices.value.map((n) => [n.title, n.words]), words ? [['Widget', words]] : [], words || 'nothing said');
    }
});

test('RUN (Part 6): a new quote or version keeps its id after an answer that proved nothing — the same body pressed again sends it; saved or refused in the server\'s own words, the id goes', async () => {
    const make = new Function('heldQuoteIds', 'genQuoteId', 'handleSaveQuote',
        `${between(read(QUOTES_TAB), '    const createQuote = async (body) => {', '\n    };')}\n    };\nreturn createQuote;`);
    const held = { current: {} };
    let n = 0;
    const sent = [];
    const answers = [];
    const create = make(held, () => 'q_' + (n++), async (payload, editing, { onFailure }) => {
        sent.push(payload.id);
        const a = answers.shift();
        if (a.saved) return a.saved;
        onFailure(a);
        return null;
    });
    const BODY = { name: 'Acme v1', opportunityId: 'd1', version: 1 };
    answers.push({ words: 'The quote may have been saved — reload the page to see whether it was: The server returned 502.', unknown: true }, { saved: { id: 'q_0' } });
    assert.equal(await create(BODY), null);
    assert.deepEqual(await create({ ...BODY }), { saved: { id: 'q_0' }, id: 'q_0' });
    assert.deepEqual(sent, ['q_0', 'q_0'], 'REGRESSION: a fresh id per press — a lost answer\'s retry makes a second quote');
    assert.deepEqual(held.current, {}, 'saved: the id given up');
    answers.push({ words: 'A copied line names no product of this organization.', unknown: false }, { words: 'x', unknown: true }, { words: 'x', unknown: true });
    await create(BODY);
    await create(BODY);
    await create({ ...BODY, name: 'Acme v2' });
    assert.deepEqual(sent.slice(2), ['q_1', 'q_2', 'q_3'], 'after the server\'s own refusal a fresh id; another body its own');
    // The line editor's words: the hook's — the server's own refusal "Not saved", any other its may-have sentence.
    const lines = new Function('setSaving', 'handleSaveQuote',
        `${between(read(QUOTES_TAB), '    const handleSaveLineItems   = async (payload) => {', '\n    };')}\n    };\nreturn handleSaveLineItems;`);
    for (const [failure, words] of [[{ words: 'Approved quotes are locked.', unknown: false }, 'Not saved — Approved quotes are locked.'],
        [{ words: 'The quote may have been saved — reload the page to see whether it was: x', unknown: true }, 'The quote may have been saved — reload the page to see whether it was: x']]) {
        await assert.rejects(lines(() => {}, async (p, e, { onFailure }) => { onFailure(failure); return null; })({ id: 'q_1' }), { message: words });
    }
});

test('RUN (Part 3): a saved report\'s Delete — the server\'s own refusal "Report not deleted"; any other answer may have deleted it, the card kept', async () => {
    const del = new Function('showConfirm', 'dbWrite', 'setLibError', 'setSavedReportsList', 'maybeSaid',
        `${between(read('src/Tabs/ReportsTab.jsx'), '    const confirmDelete = (r) => showConfirm(', '\n    });')}\n    });\nreturn confirmDelete;`);
    for (const [answer, said, left] of [
        [{ ok: false, status: 403, error: 'You do not have permission to make this change.', unknown: false }, 'Report not deleted — You do not have permission to make this change.', 2],
        [{ ok: false, status: 0, error: 'The server could not be reached.', unknown: true }, 'The report may have been deleted — reload the page to see whether it was: The server could not be reached.', 2],
        [{ ok: true, status: 200 }, null, 1],
    ]) {
        const list = stateOf([{ id: 'rpt_a', name: 'A' }, { id: 'rpt_b', name: 'B' }]);
        const words = [];
        let pressed = null;
        del((msg, fn) => { pressed = fn(); }, async () => answer, (w) => words.push(w), list.set, maybeSaid)({ id: 'rpt_a', name: 'A' });
        await pressed;
        assert.deepEqual([words, list.value.length], [said ? [said] : [], left], said || 'deleted');
    }
});

test('WIRING (Part 3): the Sales Manager\'s three throws say may-have; the quote and product forms send their ids; each Part 3 file names its may-have words', () => {
    const sm = read('src/Tabs/SalesManagerTab.jsx');
    assert.ok(sm.includes("setSaveState({ status: 'error', msg: maybeSaid(`${who || 'A member'}'s ${label}`, 'saved', failureWords(err)) });"), 'a forecast call that never answered');
    assert.ok(sm.includes("? maybeSaid(`The ${label}`, 'saved', NETWORK_ERROR, true)"), 'the tiers and SPIFFs that never answered');
    assert.ok(sm.includes("const noteNotDeleted = (r) => (!r.unknown && ownRefusal(r.status, saidOf(r.status, r.error))"), 'a coaching note Delete that never answered');
    const tab = read(QUOTES_TAB);
    assert.ok(tab.includes("const openNew  = () => { newProductId.current = 'prod_' + crypto.randomUUID(); setForm(EMPTY); setEditing('new'); setError(null); };"));
    assert.ok(tab.includes('await onSave(stored ? { ...changes, id: stored.id } : { ...changes, id: newProductId.current }, stored);'));
    const hook = read(QUOTES_HOOK);
    assert.ok(hook.includes(": { ...formData, id: formData.id || ('qt_' + crypto.randomUUID()) };") && hook.includes(": { ...formData, id: formData.id || ('prod_' + crypto.randomUUID()) };"), 'a create keeps its caller\'s id');
    assert.equal((hook.match(/if \(!isEdit && landedBefore\(res\.status, refused\)\) \{/g) || []).length, 2, 'the quote and the product read an earlier press that landed');
    const reports = read('src/Tabs/ReportsTab.jsx');
    assert.equal((reports.match(/const heldReportIds = React\.useRef\(\{\}\);/g) || []).length, 2, 'the library and Activity history');
    assert.equal((reports.match(/if \(!\(held && landedBefore\(res\.status, refused\)\)\) throw Object\.assign/g) || []).length, 2);
});


// ── Part 4 (state §0.263): Dispatch ──
// The helpers every Dispatch write reads its refusal through (refusalWords.js) and the banner's words for jobs that may
// have been returned to the queue (dispatchUnassign.js) run here. The handlers themselves run extracted in
// tests/refusal-sweep.test.mjs, beside their Part 6 and Part 11 runners: the crew builder, customer, technician, job record
// (and its new address's one id), invoice panel (a create's 409 naming the invoice adopts it), time off (the unassign
// loop's notFreed and maybeFreed), Service due, Renew, Undo, New Job (its held ids), the mass schedule, the shift
// pattern, the job card and the week move (kept as sent) — the tests named "§0.263 Part 4" there, and those moved.
test('RUN (Part 4): writeRefusalOf — the body read once; heard only for a 4xx in words; the role\'s sentence only for the server\'s own 403', async () => {
    let reads = 0;
    const once = (status, body) => ({ ok: false, status, json: async () => { if (reads++) throw new TypeError('Body is unusable'); if (body instanceof Error) throw body; return body; } });
    const run = async (status, body, role) => { reads = 0; const r = await writeRefusalOf(once(status, body), role); assert.equal(reads, 1, 'the body read once'); return r; };
    const ROLE = 'Your role cannot edit jobs.';
    assert.deepEqual(await run(403, { error: 'Forbidden' }, ROLE), { body: { error: 'Forbidden' }, heard: true, words: ROLE });
    assert.deepEqual(await run(403, { error: 'Forbidden', requestId: 'r1' }), { body: { error: 'Forbidden', requestId: 'r1' }, heard: true, words: 'Forbidden (ref r1)' }, 'no role: the server\'s words');
    assert.deepEqual(await run(409, { error: 'Changed since.' }, ROLE), { body: { error: 'Changed since.' }, heard: true, words: 'Changed since.' }, 'a 4xx that is no 403 keeps its words, never the role\'s');
    assert.deepEqual(await run(403, {}, ROLE), { body: {}, heard: false, words: 'The server returned 403.' }, 'REGRESSION: a wordless 403 said as the role\'s — it proves nothing');
    assert.deepEqual(await run(500, { error: 'Internal server error', requestId: 'r2' }, ROLE), { body: { error: 'Internal server error', requestId: 'r2' }, heard: false, words: 'Internal server error (ref r2)' },
        'REGRESSION: a 500 in words read as nothing written');
    assert.deepEqual(await run(502, new SyntaxError('<html>')), { body: null, heard: false, words: 'The server returned 502.' }, 'a page: no body');
    assert.deepEqual(await run(400, { error: '  ' }), { body: { error: '  ' }, heard: false, words: 'The server returned 400.' }, 'blank words: not heard');
});

test('RUN (Part 4): refusalError, unknownOf, saidError, thrownSaid — a catch says the server\'s own refusal and words said in full as they are, anything else as maybe', () => {
    const heard = refusalError('Name is required', true);
    const lost = refusalError('Internal server error (ref r1)', false);
    for (const e of [heard, lost]) assert.ok(e instanceof Error && Object.getPrototypeOf(e) === Error.prototype, 'a plain Error: failureWords says its message');
    assert.deepEqual([heard.message, heard.unknown, unknownOf(heard), failureWords(heard)], ['Name is required', false, false, 'Name is required']);
    assert.deepEqual([lost.unknown, unknownOf(lost)], [true, true]);
    for (const e of [new Error('x'), new TypeError('Failed to fetch'), new SyntaxError('<'), null, undefined, {}, { unknown: undefined }]) {
        assert.equal(unknownOf(e), true, 'REGRESSION: an error that does not say read as nothing written');
    }
    const unread = "The time off was saved, but its answer couldn't be read. Refresh to see it.";
    const said = saidError(unread);
    assert.deepEqual([said.message, said.said, Object.getPrototypeOf(said) === Error.prototype], [unread, true, true]);
    assert.equal(thrownSaid(heard, 'The job', 'saved'), 'Name is required', 'the server\'s own refusal: its words alone');
    assert.equal(thrownSaid(lost, 'The job', 'saved'), 'The job may have been saved — reload the page to see whether it was: Internal server error (ref r1)');
    assert.equal(thrownSaid(new TypeError('Failed to fetch'), 'The time off', 'deleted'),
        'The time off may have been deleted — reload the page to see whether it was: The server could not be reached.', 'REGRESSION: a thrown fetch said as refused');
    assert.equal(thrownSaid(new SyntaxError("Unexpected token '<'"), 'It', 'scheduled'), 'It may have been scheduled — reload the page to see whether it was: Its answer could not be read.');
    assert.equal(thrownSaid(new Error('Forbidden'), 'The job', 'updated'), 'The job may have been updated — reload the page to see whether it was: Forbidden',
        'an error that does not say whether the server refused it: maybe');
    assert.equal(thrownSaid(said, 'The time off', 'saved'), unread, 'said in full: never wrapped again');
    assert.equal(thrownSaid(saidError(maybeSaid('The address', 'saved', 'x')), 'The job', 'saved'), maybeSaid('The address', 'saved', 'x'), 'a may-have sentence built where it was known: as built');
    assert.equal(thrownSaid(lost, 'The working hours', 'saved', true), 'The working hours may have been saved — reload the page to see whether they were: Internal server error (ref r1)');
    assert.equal(thrownSaid(new TypeError('Failed to fetch'), 'The job'), 'The job may have been saved — reload the page to see whether it was: The server could not be reached.', 'the verb: saved');
});

test('RUN (Part 4): maybeFreedWords — each job that may have been returned to the queue, by name and why; one, many, none; never "not returned"', () => {
    const jobs = [{ id: 'job_1', title: 'Boiler service', customer: 'Acme' }, { id: 'job_2', title: '', customer: 'Gutter clean' }];
    const one = maybeFreedWords([{ id: 'job_1', words: 'The server could not be reached.' }], jobs);
    assert.equal(one, 'One job may have been returned to the queue — reload the page to see whether it was: Boiler service: The server could not be reached.');
    const three = maybeFreedWords([{ id: 'job_2', words: 'The server returned 502.' }, { id: 'job_9', words: 'Internal server error (ref r1)..' }, { id: 'job_1', words: '' }], jobs);
    assert.equal(three, '3 jobs may have been returned to the queue — reload the page to see whether they were: '
        + 'Gutter clean: The server returned 502; job_9: Internal server error (ref r1); Boiler service: no answer.', 'a job by its title, its customer, else its id; one full stop');
    assert.equal(maybeFreedWords([{ id: 'job_1', words: 'x' }], null), 'One job may have been returned to the queue — reload the page to see whether it was: job_1: x.');
    assert.equal(maybeFreedWords([], jobs), '');
    assert.equal(maybeFreedWords(undefined, jobs), '');
    for (const w of [one, three]) assert.ok(!/not returned|still assigned/.test(w), 'REGRESSION: a job that may have been returned said as still assigned');
    // The banner says both when both happened: the server's own refusals by notFreedWords, the rest by maybeFreedWords.
    assert.ok(notFreedWords([{ id: 'job_1', words: 'Forbidden' }], jobs, 'Ann Lee', 2).includes('was not returned to the queue'));
});

test('WIRING (Part 4): Dispatch\'s creates keep their ids — New Job\'s customer, address and job, held by what each sends; the job record\'s new address, per job', () => {
    const d = read('src/Tabs/DispatchTab.jsx');
    assert.equal((d.match(/const heldNewJobIds = useRef\(\{\}\);/g) || []).length, 1);
    assert.ok(d.includes("const newCustId = heldNewJobIds.current[custKey] || (heldNewJobIds.current[custKey] = 'dcust_' + crypto.randomUUID());"));
    assert.ok(d.includes("const locId = heldNewJobIds.current[locHeld] || (heldNewJobIds.current[locHeld] = 'dloc_' + crypto.randomUUID());"));
    assert.ok(d.includes('jobId = payload.id = heldNewJobIds.current[jobKey] || (heldNewJobIds.current[jobKey] = jobId);'));
    assert.ok(d.includes('const custKey = `cust|${custLabel}|${custAccountId}`;') && d.includes('const locHeld = `loc|${locKey}`;')
        && d.includes('const jobKey = `job|${JSON.stringify({ ...payload, id: null })}`;'), 'keyed by what each create sends');
    assert.equal((d.match(/const newLocIds = useRef\(\{\}\);/g) || []).length, 1);
    assert.ok(d.includes("const locId = loc.id || newLocIds.current[draft.id] || (newLocIds.current[draft.id] = 'dloc_' + crypto.randomUUID());"));
    assert.ok(d.includes('if (stillOrg(askedOrg)) setLoc(l => (l ? { ...l, id: locationId } : l));'), 'a landed address is the form\'s: a second Save PUTs it');
});
