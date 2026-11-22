// tests/quote-stale.test.mjs — THE GUARD for state §0.280 (OPEN_ITEMS §4.8, §0.277's found (a); Jeff, 21 Nov: "Refuse if
// changed", "Keep editor open", "Remove the button"). A Quotes screen acted on a quote it never saw: Save draft sent the
// screen's whole copy back — its status a move, so a tab loaded before an approval turned the quote back to Draft; the
// line editor sent the whole quote as it opened over another save's lines; a move went over lines or a status changed
// since. Now every quote the server hands out carries its stamp (its last edit as text); every press names the stamp its
// screen's copy holds (`ifStamp`); a quote changed since is refused 409 'stale' with the quote as it stands, nothing
// written — unless it already holds what the press asks ('already', an earlier press that landed). The line editor sends
// only what changed from the quote as it opened; Save draft is gone. Staged against the database in
// tests/integration/quote-stale.itest.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { quoteTermChanges, quoteTermsChanged, quoteHoldsBody, QUOTE_TERMS_FIELDS, quoteTermsEditable, quoteIsHeld } from '../src/utils/quoteRules.js';
import { failureWords, refusalWords, heardRefusal, landedBefore, maybeSaid } from '../src/utils/refusalWords.js';

const read = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8').split('\r\n').join('\n');
const between = (s, a, b) => { const i = s.indexOf(a); assert.ok(i >= 0, a); const j = s.indexOf(b, i + a.length); assert.ok(j >= 0, b); return s.slice(i, j); };
const order = (s, ...lines) => lines.forEach((l, i) => { assert.ok(s.includes(l), `missing: ${l}`); if (i) assert.ok(s.indexOf(l) > s.indexOf(lines[i - 1]), `in order: ${l}`); });
const count = (s, x) => s.split(x).length - 1;

const STORED = { id: 'qt_1', status: 'Draft', lineItems: [{ productId: 'p1', quantity: 2, listPrice: 100, discountPct: 0 }], dealDiscount: '0.00',
    validUntil: '2026-12-31', paymentTerms: 'Net 30 · Annual', billingContact: 'buyer@x.test', notes: 'as filed', taxRate: '8.25', taxExempt: null, approvalNote: null };

test('quoteTermChanges: which terms differ, by the one comparison quoteTermsChanged reads — the money as numbers, the rate cleaned, the switch on or not, lines by meaning', () => {
    assert.deepEqual(quoteTermChanges(STORED, { ...STORED }), []);
    assert.deepEqual(quoteTermChanges(STORED, { ...STORED, taxRate: 8.25, dealDiscount: 0, taxExempt: false, validUntil: '2026-12-31' }), [], 'as the database answers them, unchanged');
    assert.deepEqual(quoteTermChanges(STORED, { ...STORED, lineItems: [{ discountPct: 0, listPrice: '100', quantity: '2', productId: 'p1', taxable: true }] }), [], 'a line by what it means');
    assert.deepEqual(quoteTermChanges(STORED, { ...STORED, notes: 'new', taxRate: 9 }), ['notes', 'taxRate']);
    assert.deepEqual(quoteTermChanges(STORED, { ...STORED, lineItems: [] }), ['lineItems']);
    assert.deepEqual(quoteTermChanges(STORED, { ...STORED, taxRate: null }), ['taxRate'], 'none is not 0');
    assert.deepEqual(quoteTermChanges(STORED, { ...STORED, status: 'Approved', name: 'other' }), [], 'status and name are no terms');
    for (const k of QUOTE_TERMS_FIELDS) assert.equal(quoteTermsChanged(STORED, { ...STORED, [k]: k === 'lineItems' ? [] : k === 'taxExempt' ? true : '77' }), true, k);
    assert.equal(quoteTermsChanged(STORED, { ...STORED }), false);
});

test("quoteHoldsBody: a press sent again over a quote that already holds what it asks — its move, a send-back's note, every term it names; a body asking nothing holds nothing", () => {
    assert.equal(quoteHoldsBody(STORED, { id: 'qt_1', status: 'Draft' }), true);
    assert.equal(quoteHoldsBody({ ...STORED, status: 'Approved' }, { id: 'qt_1', status: 'Draft' }), false, 'a stale Withdraw over an approval');
    assert.equal(quoteHoldsBody({ ...STORED, status: 'Approved' }, { id: 'qt_1', status: 'Approved' }), true, 'an Approve that landed');
    assert.equal(quoteHoldsBody(STORED, { id: 'qt_1', notes: 'as filed', taxRate: 8.25 }), true, 'terms as stored');
    assert.equal(quoteHoldsBody(STORED, { id: 'qt_1', notes: 'as filed', taxRate: 9 }), false, 'one term short');
    assert.equal(quoteHoldsBody(STORED, { id: 'qt_1', status: 'Draft', notes: 'other' }), false);
    assert.equal(quoteHoldsBody(STORED, { id: 'qt_1' }), false, 'a body asking nothing');
    assert.equal(quoteHoldsBody(STORED, { id: 'qt_1', ifStamp: 'x', name: 'n' }), false, 'nor one naming no move or term');
    assert.equal(quoteHoldsBody({ ...STORED, approvalNote: 'fix the price' }, { id: 'qt_1', status: 'Draft', sendBack: true, sendBackNote: ' fix the price ' }), true, 'a send-back that landed');
    assert.equal(quoteHoldsBody({ ...STORED, approvalNote: 'other' }, { id: 'qt_1', status: 'Draft', sendBack: true, sendBackNote: 'fix the price' }), false);
    assert.equal(quoteHoldsBody({ ...STORED, status: 'Pending Approval', approvalNote: 'fix the price' }, { id: 'qt_1', status: 'Draft', sendBack: true, sendBackNote: 'fix the price' }), false, 'still waiting');
    assert.equal(quoteHoldsBody(null, { status: 'Draft' }), false);
});

test('THE GUARD: quotes.mjs hands out every quote with its stamp, and a PUT naming a stamp the quote no longer holds is refused with the quote as it stands — after the access checks, before anything is decided', () => {
    const src = read('netlify/functions/quotes.mjs');
    assert.ok(src.includes('const STAMPED = () => ({ ...getTableColumns(quotes), stamp: sql`${quotes.updatedAt}::text` });'));
    assert.ok(src.includes("const changedSince = (quote) => ({ statusCode: 409, headers, body: JSON.stringify({ error: `This quote changed since it was opened — it is ${quote.status || 'Draft'} now. Nothing was saved.`, code: 'stale', quote }) });"));
    const get = between(src, "if (event.httpMethod === 'GET') {", "if (event.httpMethod === 'POST') {");
    const lists = between(get, 'const oppId = qs.oppportunityId'.slice(0, 0) + 'let rows;', 'return { statusCode: 200, headers, body: JSON.stringify({ quotes: rows }) };');
    assert.equal(count(lists, 'db.select(STAMPED()).from(quotes)'), 2, 'both lists stamped');
    assert.ok(!/db\.select\(\)\.from\(quotes\)/.test(lists), 'REGRESSION: a list handed out without its stamp');
    const post = between(src, "if (event.httpMethod === 'POST') {", "if (event.httpMethod === 'PUT') {");
    assert.ok(post.includes('.onConflictDoNothing({ target: quotes.id }).returning(STAMPED())]);'), 'a create answered with its stamp');
    const put = between(src, "if (event.httpMethod === 'PUT') {", "if (event.httpMethod === 'DELETE') {");
    order(put,
        'const [read] = await db.select(STAMPED()).from(quotes)',
        "if (!access.canWrite) return refuse(403, 'Forbidden: you can only change quotes on your own or unassigned deals');",
        "if ('ifStamp' in data && data.ifStamp !== stamp) {",
        'if (await pressLanded(auth, existing, data)) return heldAlready(existing);',
        'return changedSince(read);',
        'if (linesMalformed(data))',
        'const merged = {',
        'wrote = await db.batch([',
        'db.update(quotes).set(payload).where(and(eq(quotes.id, existing.id), eq(quotes.orgId, orgId))).returning(STAMPED()),');
    // The stale check reads nothing the body can bend: the stamp is the server's own read; the refusal hands back that read.
    assert.equal(count(put, "'ifStamp' in data"), 1);
    assert.ok(!put.includes('data.stamp'), 'REGRESSION: the stamp read from the body');
    const missed = between(src, 'async function missedQuote(auth, id, forbidden, moveTo = null, body = null) {', '\n}\n');
    assert.ok(missed.includes('return changedSince(now);') && missed.includes('const [now] = await db.select(STAMPED()).from(quotes)'), "the save's own claim answers a change in its window the same");
    // The review: 'already' only for the caller's own earlier press — the quote holds what it asks AND its last recorded
    // change (reminders aside) is theirs; another member's same move is a change since. A save sent again inside the
    // save's own window answers the same way.
    const landed = between(src, 'async function pressLanded(auth, quote, body) {', '\n}\n');
    order(landed, 'if (!quoteHoldsBody(quote, body) || !auth.userId) return false;',
        ".where(and(eq(auditLog.orgId, auth.orgId), eq(auditLog.entityType, 'quote'), eq(auditLog.entityId, quote.id), ne(auditLog.action, 'quote.reminded')))",
        '.orderBy(desc(auditLog.timestamp)).limit(1);', 'return !!last && last.userId === auth.userId;');
    order(missed, 'if (body && await pressLanded(auth, now, body)) return heldAlready(now);', 'return changedSince(now);');
    assert.ok(put.includes("return await missedQuote(auth, existing.id, 'Forbidden: you can only change quotes on your own or unassigned deals', moved ? to : null, data);"));
    assert.ok(!put.includes('quoteHoldsBody('), 'REGRESSION: "already" on the holds alone — another member\'s move said as the caller\'s');
    // The public API's page says it.
    assert.ok(read('public/api-docs.html').includes('a PUT that names it back as <code>ifStamp</code> is refused with a <code>409</code> (<code>code: "stale"</code>, the quote as it stands, nothing written)'));
});

test('THE GUARD: no Quotes screen press sends its copy of a quote — a move names its status and stamp; the line editor only what changed from the quote as it opened, with its stamp; Save draft is gone', async () => {
    const tab = read('src/Tabs/QuotesTab.jsx');
    // Every call of the save: a create's body, a move's, and the line editor's — no other.
    const calls = tab.match(/handleSaveQuote\(([^\n]*)/g) || [];
    assert.deepEqual(calls.map((c) => c.slice(0, 60)), [
        'handleSaveQuote({ ...body, id }, null, { onFailure: (f) => { failure = f; } });'.slice(0, 60),
        'handleSaveQuote({ id: q.id, status, ...extra, ifStamp: q.stamp }, q); }'.slice(0, 60),
        'handleSaveQuote(payload, opened, { onFailure: (f) => { failure = f; } });'.slice(0, 60),
    ], 'the save is called from a create, a move and the line editor alone');
    assert.ok(!/handleSaveQuote\(\{ \.\.\.(activeQuote|quote|q)\b/.test(tab), "REGRESSION: a press sends the screen's copy of the quote");
    assert.ok(!tab.includes('handleSaveDraft') && !tab.includes('onSaveDraft') && !tab.includes('>Save draft<'), 'REGRESSION: Save draft is back');
    const editor = between(tab, 'const LineItemEditor = ({ quote, products, onSave, onClose, saving }) => {', '\n};\n');
    assert.ok(editor.includes('const [opened] = useState(quote);'), 'the quote as it opened, held');
    // The review: measured against the form as it opened — the default terms shown over none are no change.
    assert.ok(editor.includes("const [openedForm] = useState(() => ({ lineItems: (quote.lineItems || []).map(({ _key, ...li }) => li), paymentTerms: quote.paymentTerms || 'Net 30 · Annual',"));
    assert.ok(editor.includes("validUntil: quote.validUntil || '', notes: quote.notes || '', taxRate: taxRateFromInput(taxRateInputOf(quote.taxRate)).rate, taxExempt: quote.taxExempt === true }));"));
    // The review: the editor is keyed by its quote — its opened copy never belongs to another.
    assert.ok(tab.includes('<LineItemEditor\n                                                    key={editQ.id}\n                                                    quote={editQ}'));
    const save = between(editor, '    const handleSave = async () => {', '\n    };');
    order(save,
        'if (typedRate.error) { setError(typedRate.error); return; }',
        'if (lineRefusal) { setError(lineRefusal); return; }',
        'const form = { lineItems: lineItems.map(({ _key, ...li }) => li), paymentTerms, validUntil, notes, taxRate: typedRate.rate, taxExempt };',
        'const changed = quoteTermChanges({ ...opened, ...openedForm }, { ...opened, ...form });',
        'if (!changed.length) { onClose(); return; }',
        'const payload = { id: opened.id, ...Object.fromEntries(changed.map(k => [k, form[k]])), ifStamp: opened.stamp };',
        'try { await onSave(payload, opened); onClose(); }');
    assert.ok(!/\.\.\.quote\b/.test(save), "REGRESSION: the editor sends its copy of the quote");
    assert.ok(!/\bstatus\b/.test(save.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')), 'the editor never names a status (its comments aside)');
    // A stale refusal keeps the editor open on what was typed until its Close.
    const lines = between(tab, '    const handleSaveLineItems   = async (payload, opened) => {', '\n    };');
    order(lines, 'if (!saved && failure?.stale) {', 'setEditorHeld(opened.id);', 'throw new Error(`Not saved — ${failure.words} ${next}`);');
    assert.ok(tab.includes('if (!editQ || (!quoteTermsEditable(editQ.status) && editorHeld !== editQ.id)) return null;'));
    // The review: let go whenever the editor leaves its quote, by any path.
    assert.ok(tab.includes('useEffect(() => { setEditorHeld(null); }, [editingQuoteId]);'));
    // RUN: its words by where the quote stands now.
    const run = new Function('setSaving', 'handleSaveQuote', 'setEditorHeld', 'quoteTermsEditable', 'quoteIsHeld', `${lines}\n    };\nreturn handleSaveLineItems;`);
    const W = 'This quote changed since it was opened — it is X now. Nothing was saved.';
    for (const [status, next] of [['Draft', 'Close the editor and open it again to edit the quote as it stands.'], ['Approved', 'Close the editor and open it again to edit the quote as it stands.'],
        ['Pending Approval', 'Close the editor; withdraw the quote to change it.'], ['Sent to Customer', 'Close the editor; use “+ New version” to change it.'], ['Accepted', 'Close the editor; use “+ New version” to change it.']]) {
        const held = [];
        await assert.rejects(run(() => {}, async (p, e, { onFailure }) => { onFailure({ words: W, unknown: false, stale: true, quote: { id: 'q_1', status } }); return null; }, (id) => held.push(id), quoteTermsEditable, quoteIsHeld)({ id: 'q_1' }, { id: 'q_1' }),
            { message: `Not saved — ${W} ${next}` }, status);
        assert.deepEqual(held, ['q_1']);
    }
});

// The hook, RUN from its source with stubs: what a stale refusal and an answer that cannot be read leave in the list.
const hookSrc = between(read('src/hooks/useQuotes.js'), '    const handleSaveQuote = useCallback(', '\n    }, []);');
const hookOf = (deps) => new Function('useCallback', 'setQuotes', 'setQuoteModalError', 'setQuoteModalSaving', 'requestOrg', 'stillOrg', 'dbFetch',
    'failureWords', 'refusalWords', 'heardRefusal', 'landedBefore', 'maybeSaid', 'storedRowOf', `${hookSrc}\n    }, []);\nreturn handleSaveQuote;`)(
    (f) => f, deps.setQuotes, (w) => deps.errors.push(w), () => {}, () => 'org_a', () => true, deps.fetch,
    failureWords, refusalWords, heardRefusal, landedBefore, maybeSaid, async () => null);
const answer = (status, body) => ({ ok: status < 300, status, json: async () => { if (body === undefined) throw new Error('unreadable'); return body; }, headers: { get: () => 'application/json' } });
const runSave = async (res, { editing = { id: 'qt_1', status: 'Draft', notes: 'as loaded', stamp: 's1' }, body = { id: 'qt_1', status: 'Draft', ifStamp: 's1' } } = {}) => {
    let list = [{ id: 'qt_1', status: 'Draft', notes: 'as loaded', stamp: 's1' }, { id: 'qt_2', status: 'Draft', stamp: 'x' }];
    const did = { errors: [], sent: [], failure: null };
    const h = hookOf({ setQuotes: (f) => { list = typeof f === 'function' ? f(list) : f; }, errors: did.errors, fetch: async (url, o) => { did.sent.push(JSON.parse(o.body)); return res; } });
    const saved = await h(body, editing, { onFailure: (f) => { did.failure = f; } });
    return { saved, list, ...did };
};

test('RUN: the hook — a stale refusal puts the quote as stored in the list and says the server\'s words, told as stale; any other refusal leaves the list; an edit answered unreadably lays what it sent over the quote it was made on, its stamp not known', async () => {
    const stored = { id: 'qt_1', status: 'Approved', notes: 'theirs', stamp: 's2' };
    const stale = await runSave(answer(409, { error: 'This quote changed since it was opened — it is Approved now. Nothing was saved.', code: 'stale', quote: stored }));
    assert.equal(stale.saved, null);
    assert.deepEqual(stale.list[0], stored, 'the quote as it stands takes the list\'s place');
    assert.equal(stale.list[1].stamp, 'x', 'no other row touched');
    assert.deepEqual(stale.failure, { words: 'This quote changed since it was opened — it is Approved now. Nothing was saved.', unknown: false, stale: true, quote: stored });
    assert.deepEqual(stale.sent, [{ id: 'qt_1', status: 'Draft', ifStamp: 's1' }], 'the press as made');
    // Another quote's in the answer, or no code: the list as it was, never told stale.
    for (const body of [{ error: 'x', code: 'stale', quote: { id: 'qt_2', status: 'Approved' } }, { error: 'This quote changed since it was opened.' }]) {
        const r = await runSave(answer(409, body));
        assert.equal(r.list[0].notes, 'as loaded'); assert.equal(r.list[1].stamp, 'x');
        assert.equal(r.failure.stale, false);
    }
    // Landed, answered: as stored, its stamp the new one.
    const landed = await runSave(answer(200, { quote: { id: 'qt_1', status: 'Draft', notes: 'mine', stamp: 's3' } }), { body: { id: 'qt_1', notes: 'mine', ifStamp: 's1' } });
    assert.equal(landed.list[0].stamp, 's3');
    // Landed, unreadable: what it sent over the quote it was made on — never the partial body alone — the stamp null, so
    // its next press is refused as stale with the quote as stored.
    const lost = await runSave(answer(200), { body: { id: 'qt_1', notes: 'mine', ifStamp: 's1' } });
    assert.deepEqual(lost.list[0], { id: 'qt_1', status: 'Draft', notes: 'mine', stamp: null });
    assert.ok(!('ifStamp' in lost.list[0]));
    // A create answered unreadably (the review): the copy sent, its stamp null — never no stamp, which the server does not check.
    const made = await runSave(answer(201), { editing: null, body: { id: 'qt_new', name: 'New', status: 'Draft' } });
    assert.deepEqual(made.list.find((q) => q.id === 'qt_new'), { id: 'qt_new', name: 'New', status: 'Draft', stamp: null });
    assert.equal(made.saved.stamp, null);
});
