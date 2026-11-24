// tests/own-key.test.mjs (state §0.293 — Jeff, 23 Nov, three answers)
// (1) An org's requests to Claude go out on its OWN key or not at all ("I'm building this where a customer uses their own
//     AI key. So no key provided stop"): an org with no key, or one the server could not read, sent its deals to Claude on
//     the site's key and account.
// (2) A quote is not emailed by a sender with no address ("give an alert that an email address must be added"): it went
//     out with none, and the customer's reply reached no one.
// (3) An alert not known to have gone goes again ("Send alert again") — held here, so a change of it is a choice.
// The handlers run on the gate matrix's engine (no database, no network). The real database's half:
// tests/integration/ai-score.itest.mjs, quote-branding.itest.mjs and failed-reads.itest.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { ROOT, ask, load, sourceOf } from './gates/engine.mjs';
import { parse } from '@babel/parser';
import { AI_MODELS, AI_KEY_WORDS, aiSettingsToSave, aiKeyState, aiKeyLine, aiKeyCheckWords, aiPromptsWords, aiScoringWords } from '../src/utils/aiModels.js';
import { emailOrNull, isPlaceholderEmail } from '../src/utils/orgIdentity.js';
import { reachable } from '../src/utils/approvalNotices.js';

const G = globalThis.__gates;
const SECRET = { SETTINGS_ENCRYPTION_KEY: 'own-key-tests' };
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8').replace(/\r\n/g, '\n');
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/([;,{}()])\s*\/\/.*$/gm, '$1');
const fn = (f) => import(new URL(`netlify/functions/${f}.mjs`, ROOT).href);
const WRITES = new Set(['insert', 'update', 'delete', 'batch', 'execute', 'store', 'clerk', 'fetch']);
const written = () => G.ops.filter((o) => WRITES.has(o.kind)).map((o) => `${o.kind} ${o.table}`).join(', ');
const under = async (secret, run) => { const was = process.env.SETTINGS_ENCRYPTION_KEY; process.env.SETTINGS_ENCRYPTION_KEY = secret; try { return await run(); } finally { if (was === undefined) delete process.env.SETTINGS_ENCRYPTION_KEY; else process.env.SETTINGS_ENCRYPTION_KEY = was; } };
const { encrypt } = await fn('crypto');
const sealed = (key, secret = SECRET.SETTINGS_ENCRYPTION_KEY) => under(secret, () => encrypt(key));

// Each stored value an org can hold, and what it comes to.
const NONE = [undefined, null, ''];
const UNREADABLE = ['aa:bb:cc', 'not-a-ciphertext', { sealed: true }, 7, await sealed('sk-own', 'another-secret')];

test("_aiKey.mjs: the org's own key, or none and why — never the site's, whatever the site holds; no key is not a key that could not be read", async () => {
    const { resolveAnthropicKey } = await fn('_aiKey');
    process.env.ANTHROPIC_API_KEY = 'sk-site';
    try {
        await under(SECRET.SETTINGS_ENCRYPTION_KEY, async () => {
            const own = encrypt('sk-own');
            assert.deepEqual(resolveAnthropicKey({ anthropicApiKey: own }), { apiKey: 'sk-own', keyProblem: null });
            for (const extra of [null, undefined, {}, ...NONE.map((anthropicApiKey) => ({ anthropicApiKey }))]) assert.deepEqual(resolveAnthropicKey(extra), { apiKey: null, keyProblem: 'no_key' }, JSON.stringify(extra));
            for (const anthropicApiKey of UNREADABLE) assert.deepEqual(resolveAnthropicKey({ anthropicApiKey }), { apiKey: null, keyProblem: 'key_unreadable' }, JSON.stringify(anthropicApiKey));
        });
        // The server's own secret unset: no key can be read, and none is sent.
        assert.deepEqual(resolveAnthropicKey({ anthropicApiKey: await sealed('sk-own') }), { apiKey: null, keyProblem: 'key_unreadable' });
    } finally { delete process.env.ANTHROPIC_API_KEY; }
    assert.deepEqual(AI_KEY_WORDS, {
        no_key: 'No AI key is installed for this workspace — an Admin adds one in Settings → Features & AI.',
        key_unreadable: "This workspace's AI key could not be read — an Admin enters it again in Settings → Features & AI.",
    });
});

test('THE GUARD: no app code reads a key of the site\'s for Claude, and each request to Anthropic takes its key from the one helper, by the caller\'s org', () => {
    const files = ['netlify/functions', 'src', 'db'].flatMap((d) => readdirSync(new URL(d, ROOT), { recursive: true }).map(String).filter((f) => /\.(mjs|js|jsx|ts)$/.test(f)).map((f) => `${d}/${f.replace(/\\/g, '/')}`));
    assert.ok(files.length > 383, `${files.length} sources`);
    const site = [], asks = [];
    for (const f of files) {
        const s = code(read(f));
        if (/ANTHROPIC/.test(s)) site.push(f);
        if (s.includes('api.anthropic.com')) asks.push(f);
    }
    assert.deepEqual(site, [], `REGRESSION: the site's key read in ${site.join(', ')}`);
    assert.deepEqual(asks.sort(), ['netlify/functions/ai-models.mjs', 'netlify/functions/ai-score.mjs', 'netlify/functions/report-prompt.mjs'], 'a new file asks Anthropic: read its key as these do, and name it here');
    for (const f of asks) {
        const s = code(read(f));
        assert.equal((s.match(/'x-api-key': apiKey\b/g) || []).length, (s.match(/'x-api-key'/g) || []).length, `${f}: the key sent is the one resolved`);
        assert.equal((s.match(/\bapiKey\b/g) || []).length, 3, `${f}: resolved, checked, sent — once each`);
        assert.equal((s.match(/const \{ apiKey, keyProblem \} = resolveAnthropicKey\((?:row|orgSettingsRow)\?\.extra\);/g) || []).length, 1, f);
        // The read that feeds it, whole, and the file's only settings read: the caller's org's row.
        assert.equal((s.match(/\.from\(settings(?:Table)?\)/g) || []).length, 1, f);
        assert.match(s, /const \[(?:row|orgSettingsRow)\] = await db\.select\(\{ extra: settings(?:Table)?\.extra[^}]*\}\)\s*\.from\(settings(?:Table)?\)\s*\.where\(eq\(settings(?:Table)?\.orgId, (?:auth\.)?orgId\)\)\s*\.limit\(1\);/, `${f}: the caller's org's row`);
    }
});

const DEAL = { id: 'd1', orgId: 'org_a', ownerId: 'usr_me', salesRep: 'Me Rep', stage: 'Proposal', opportunityName: 'D', arr: '100', dealScore: { score: 62, status: 'Healthy' },
    aiScore: { headline: 'Kept', signals: [], recommendation: 'Call', model: 'claude-haiku-5-5', scoredAt: new Date().toISOString(), explains: { score: 62, status: 'Healthy' } } };
const rowsOf = (anthropicApiKey) => ({ opportunities: [DEAL], users: [{ id: 'usr_me', name: 'Me Rep' }], activities: [], settings: [{ orgId: 'org_a', extra: { aiScoringEnabled: true, aiReportPromptsEnabled: true, anthropicApiKey } }] });
const request = async (f, r, rows) => {
    const handler = await load(f);
    let res;
    G.ops = [];
    const x = await ask(async (e, c) => (res = await handler(e, c)), f, { ...r, env: { ...SECRET, ANTHROPIC_API_KEY: 'sk-site' }, rows: (op) => (typeof rows === 'function' ? rows(op) : rows[op.table] || []) }, 'Admin');
    return { status: x.status, body: JSON.parse(res.body), wrote: written() };
};

test('no key, or one that cannot be read: a deal is not explained, no prompt read, no models asked — nothing sent, written or logged, no cached answer, and why is said', async () => {
    for (const [reason, stored] of [...NONE.map((v) => ['no_key', v]), ...UNREADABLE.map((v) => ['key_unreadable', v])]) {
        const rows = rowsOf(stored), what = `${reason} ${JSON.stringify(stored)}`;
        for (const forceRefresh of [true, false]) {
            const a = await request('ai-score', { method: 'POST', body: { opportunityId: 'd1', forceRefresh } }, rows);
            assert.deepEqual(a, { status: 503, body: { error: AI_KEY_WORDS[reason], code: reason }, wrote: '' }, what);
        }
        assert.deepEqual(await request('report-prompt', { method: 'POST', body: { prompt: 'deals by stage' } }, rows), { status: 200, body: { unavailable: true, reason }, wrote: '' }, what);
        assert.deepEqual(await request('ai-models', { method: 'GET' }, rows), { status: 200, body: { checked: false, reason }, wrote: '' }, what);
    }
    // The switch off is the answer whatever the key: a missing key is not why (the review).
    for (const stored of [null, 'aa:bb:cc', await sealed('sk-own')]) {
        const rows = rowsOf(stored);
        rows.settings[0].extra.aiScoringEnabled = false; rows.settings[0].extra.aiReportPromptsEnabled = false;
        assert.deepEqual(await request('ai-score', { method: 'POST', body: { opportunityId: 'd1' } }, rows), { status: 200, body: { disabled: true }, wrote: '' });
        assert.deepEqual((await request('report-prompt', { method: 'POST', body: { prompt: 'deals' } }, rows)).body, { unavailable: true, reason: 'off' });
    }
    assert.ok(code(sourceOf('ai-score')).includes("const keyWords = 'the workspace’s key';"), 'the log names the one key there is');
    // Its own key, sent; what Anthropic answered is what is said — never "no key" for a key that is there, never a reading
    // with no definition (the second review).
    const asked = [], realFetch = globalThis.fetch;
    const answering = async (f, r, reply) => { asked.length = 0; globalThis.fetch = async (url, init) => { asked.push(init.headers['x-api-key']); return reply(); }; try { return (await request(f, r, rowsOf(await sealed('sk-own')))).body; } finally { globalThis.fetch = realFetch; } };
    const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    const list = { method: 'GET' }, ask1 = { method: 'POST', body: { prompt: 'deals by stage' } };
    for (const [reply, want] of [
        [() => { throw new TypeError('fetch failed'); }, { checked: false, reason: 'unreachable' }],
        [() => json(401, {}), { checked: false, reason: 'refused', status: 401 }], [() => json(403, {}), { checked: false, reason: 'refused', status: 403 }],
        [() => json(500, {}), { checked: false, reason: 'unreachable', status: 500 }],
        [() => json(200, { data: [{ id: 'claude-opus-5-5' }, { id: 'other' }] }), { checked: true, callable: ['claude-opus-5-5'] }],
    ]) { assert.deepEqual(await answering('ai-models', list, reply), want); assert.deepEqual(asked, ['sk-own']); }
    const reading = await answering('report-prompt', ask1, () => json(200, { stop_reason: 'tool_use', content: [{ type: 'tool_use', name: 'set_report', input: { source: 'Opportunities', name: 'Deals by stage', dims: ['stage'], metrics: ['count'] } }] }));
    assert.deepEqual([asked, Object.keys(reading).sort(), reading.readBy, reading.name, reading.definition?.source], [['sk-own'], ['definition', 'model', 'name', 'notes', 'readBy'], 'claude', 'Deals by stage', 'Opportunities'], JSON.stringify(reading));
    assert.deepEqual(await answering('report-prompt', ask1, () => json(401, {})), { unavailable: true, reason: 'error', status: 401 });
    // Its own key: Ask AI and the key check each ask (the explanation: ai-score.itest.mjs).
    const rows = rowsOf(await sealed('sk-own'));
    for (const [f, r] of [['report-prompt', { method: 'POST', body: { prompt: 'deals by stage' } }], ['ai-models', { method: 'GET' }]]) assert.match((await request(f, r, rows)).wrote, /fetch/, `${f}: asked`);
});

// ── the Features panel ───────────────────────────────────────────────────────

test("the panel's reading of the key: the server's answer first, then the settings; the draft's own key over both — RUN", () => {
    const of = (action, set, check) => { const k = aiKeyState({ action, set, check }); return [k.isSet, k.unread, k.notReady]; };
    const NO = [false, false, 'no AI key is installed'], YES = [true, false, ''], BAD = [true, true, 'the AI key could not be read'];
    const said = (reason) => ({ checked: false, reason });
    for (const [action, set, check, want] of [
        [null, false, null, NO], [null, undefined, null, NO], [null, true, null, YES],
        // the server's answer, whatever the settings say (another Admin's install or removal)
        [null, false, { checked: true, callable: [] }, YES], [null, true, said('no_key'), NO], [null, false, said('refused'), YES], [null, true, said('unreachable'), YES],
        [null, true, said('key_unreadable'), BAD], [null, false, said('key_unreadable'), BAD],
        // not asked: no answer — the settings'
        [null, true, said('unasked'), YES], [null, false, said('unasked'), NO],
        // the draft
        ['clear', true, { checked: true, callable: [] }, NO], ['clear', true, said('key_unreadable'), NO], ['set', false, said('no_key'), YES], ['set', true, said('key_unreadable'), YES],
    ]) assert.deepEqual(of(action, set, check), want, JSON.stringify([action, set, check]));
    const line = (k, last4) => { const l = aiKeyLine(k, last4); return [l.tone, l.text]; };
    assert.deepEqual(line({ isSet: true, unread: false }, '1234'), ['ok', '✓ Key installed · ••••1234']);
    assert.deepEqual(line({ isSet: true, unread: false }, null), ['ok', '✓ Key installed']);
    assert.deepEqual(line({ isSet: true, unread: true }, '1234'), ['danger', 'The installed key could not be read — enter it again']);
    assert.deepEqual(line({ isSet: false, unread: false }, '1234'), ['inkMuted', 'No key installed · nothing is sent to Claude']);
    assert.deepEqual([null, said('no_key'), said('key_unreadable'), said('refused'), said('unreachable'), said('unasked')].map((c) => aiKeyCheckWords(c)),
        ['', AI_KEY_WORDS.no_key, AI_KEY_WORDS.key_unreadable, 'Your AI key was refused when checked — an Admin can replace it under "AI · Your own key".', "Couldn't check which models the key can call.", "Couldn't check which models the key can call."]);
    assert.deepEqual([[], ['Opus 5.5'], ['Opus 5.5', 'Sonnet 5.5']].map((n) => aiKeyCheckWords({ checked: true, callable: [] }, n)),
        ['Checked against your key: every model here is available to it.', 'Checked against your key: Opus 5.5 is not available to it.', 'Checked against your key: Opus 5.5 and Sonnet 5.5 are not available to it.']);
});

test('the two switches: off says off; on with no key to use says nothing is sent; on with one says what is sent, on your own key — RUN', () => {
    for (const problem of ['no AI key is installed', 'the AI key could not be read', '']) for (const words of [aiPromptsWords, aiScoringWords]) {
        assert.match(words(false, problem, 'Haiku 5.5'), /^Off · /);
        const on = words(true, problem, 'Haiku 5.5');
        if (problem) { assert.ok(on.startsWith(`On, but ${problem} — nothing is sent to Claude, and `), on); assert.ok(!/with your own key/.test(on)); }
        else { assert.match(on, /^On · .* with your own key; /); assert.ok(!/nothing is sent/.test(on)); }
    }
    assert.equal(aiPromptsWords(true, 'x'), 'On, but x — nothing is sent to Claude, and the built-in interpreter reads every prompt.');
    assert.equal(aiScoringWords(true, 'x', 'L'), 'On, but x — nothing is sent to Claude, and no deal is explained.');
    assert.match(aiPromptsWords(true, ''), /sends the prompt sentence \(never your records\) to Claude with your own key; the built-in reader takes over/);
    assert.match(aiScoringWords(true, '', 'Opus 5.5'), /"Explain this deal" sends the deal — its fields, notes and last ten activities — to Claude Opus 5\.5 with your own key;/);
});

test('the Features panel draws those words, and the key box whatever the settings say: no condition around it, never disabled; the check asked anew is no old answer', () => {
    const raw = read('src/Tabs/settings/data/FeaturesDetail.jsx');
    const f = code(raw).replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
    for (const p of ['src/utils/aiModels.js', 'src/Tabs/ReportsTab.jsx']) assert.ok(!/BYOK|site key|Score all deals|Features → AI\b/.test(code(read(p))), `REGRESSION: a switch, key or button that is gone, named in ${p}`);
    assert.deepEqual(AI_MODELS.filter((m) => /score/i.test(m.what)).map((m) => m.id), [], 'Claude explains; it gives no score (§0.257)');
    for (const w of ['Which Claude model explains deals, and which roles', 'so a rep still gets an explanation.', "Who may ask Claude: a deal's explanation and the report builder's Ask AI. An explanation a deal already has shows"]) assert.ok(f.includes(w), w);
    assert.ok(!/\bbyok\b|BYOK|site key|platform key|usingOrgKey|keyWho|Score all deals/.test(f), "REGRESSION: the switch that decided nothing, a key that is not the org's, or a button that is gone");
    for (const once of [
        'const keyState = aiKeyState({ action: keyAction, set: settings?.anthropicApiKeySet, check: keyCheck });',
        'const { isSet: keyIsSet, notReady: keyNotReady } = keyState;',
        'const keyCheckWords = aiKeyCheckWords(keyCheck, notCallable);',
        'const keyLine = aiKeyLine(keyState, keyLast4);',
        '{aiPromptsWords(aiPrompts, keyNotReady)}', '{aiScoringWords(aiScoring, keyNotReady, modelLabel(modelOf(aiSettings)))}',
        "{keyCheckWords ? keyCheckWords + ' ' : ''}Each explanation is one request to Anthropic, billed to your own key — with none installed, nothing is sent. Current prices are on Anthropic's pricing page.",
        "desc=\"This workspace's AI requests run on your own Anthropic key. With none installed, nothing is sent to Claude.\"",
        'color:T[keyLine.tone]', '{keyLine.text}',
        // The box takes a key, Remove removes it, and each says so before the save.
        "onChange={e => { setApiKeyInput(e.target.value); setKeyAction(e.target.value ? 'set' : null); setDirty(true); }}",
        "onClick={() => { setApiKeyInput(''); setKeyAction('clear'); setDirty(true); }}", "{keyIsSet && keyAction !== 'clear' && (", 'onClick={() => setKeyAction(null)}>undo</span>',
        "{keyAction === 'clear' ? (\n", ") : keyAction === 'set' ? (\n", 'const keyLast4 = settings?.anthropicApiKeyLast4 || null;', 'if (keyAction) setKeySaves(n => n + 1);',
        "<div style={{ display:'flex', flexDirection:'column', gap:6 }}>\n                        <div style={{ display:'grid', gridTemplateColumns:'160px 1fr', gap:12, alignItems:'end' }}>",
        'anthropicApiKeySet: result.anthropicApiKeySet ?? (keyAction ? keyAction === \'set\' : prev.anthropicApiKeySet),',
        '...(keyAction ? { anthropicApiKeyLast4: keyAction === \'set\' ? apiKeyInput.trim().slice(-4) : null } : {}),',
    ]) assert.equal(f.split(once).length - 1, 1, once);
    // The key check, run as written: an answer is the one for the key as it stands, in this org; a failure is not "no key".
    const at = f.indexOf('        const askedOrg = requestOrg();'), end = f.indexOf('    }, [settings?.anthropicApiKeySet, settings?.anthropicApiKeyLast4, keySaves]);');
    assert.ok(at > 0 && end > at);
    const effect = new Function('requestOrg', 'stillOrg', 'setKeyCheck', 'dbFetch', f.slice(at, end));
    const run = async (answer, { still = true, gone = false } = {}) => {
        const set = [];
        const stop = effect(() => 'org_a', () => still, (v) => set.push(v), async (u) => { assert.equal(u, '/.netlify/functions/ai-models'); if (answer instanceof Error) throw answer; return answer; });
        if (gone) stop();
        for (let i = 0; i < 5; i++) await new Promise((done) => setImmediate(done));
        return set;
    };
    const ok = (body) => ({ ok: true, json: async () => body });
    return (async () => {
        const good = { checked: true, callable: [] }, unasked = { checked: false, reason: 'unasked' };
        assert.deepEqual(await run(ok(good)), [null, good], 'the answer before it dropped, then its own');
        for (const failed of [new Error('down'), { ok: false, json: async () => ({ error: 'x' }) }, ok(null), { ok: true, json: async () => { throw new Error('a page'); } }]) assert.deepEqual(await run(failed), [null, unasked]);
        assert.deepEqual([await run(ok(good), { still: false }), await run(ok(good), { gone: true }), await run(new Error('down'), { gone: true })], [[null], [null], [null]], 'another org, or a key changed since');
        // The one password box: no condition, list or function between the panel's return and it.
        const around = [];
        const walk = (n, up) => {
            if (!n || typeof n.type !== 'string') return;
            if (n.type === 'JSXOpeningElement' && n.name.name === 'input' && n.attributes.some((x) => x.name?.name === 'type' && x.value?.value === 'password')) around.push([n, up]);
            for (const k of Object.keys(n)) { if (k === 'loc' || /Comments$/.test(k)) continue; for (const c of [].concat(n[k])) if (c && typeof c.type === 'string') walk(c, [...up, n]); }
        };
        walk(parse(raw, { sourceType: 'module', plugins: ['jsx'] }).program, []);
        assert.equal(around.length, 1, 'one key box');
        const [box, up] = around[0];
        const inside = up.slice(up.findLastIndex((n) => n.type === 'ReturnStatement') + 1);
        assert.ok(inside.length > 5 && inside.every((n) => n.type === 'JSXElement' || n.type === 'JSXFragment'), `REGRESSION: the key box behind ${inside.filter((n) => !/^JSX(Element|Fragment)$/.test(n.type)).map((n) => n.type)}`);
        assert.ok(!box.attributes.some((x) => ['disabled', 'readOnly', 'hidden'].includes(x.name?.name)), 'REGRESSION: a key box that takes no key');
        // A save leaves the retired switch out, and the stored key is not its to change.
        assert.deepEqual(aiSettingsToSave({ byok: false, byokProvider: 'Anthropic' }), { byokProvider: 'Anthropic', model: 'claude-haiku-5-5', fallback: 'claude-sonnet-5-5', availableTo: 'All roles' });
    })();
});

// ── the quote email's sender ─────────────────────────────────────────────────

const QUOTE = { id: 'q1', orgId: 'org_a', opportunityId: 'd1', status: 'Approved', quoteNumber: 'Q-1', lineItems: [], billingContact: 'Pat <pat@customer.test>', stamp: 's' };
const SENDER = (op) => op.kind === 'select' && op.table === 'users' && Object.keys(op.fields || {}).sort().join() === 'email,profile';
const emailed = (sender) => request('quote-email', { method: 'POST', body: { quoteId: 'q1' } },
    (op) => (SENDER(op) ? sender() : ({ quotes: [QUOTE], opportunities: [DEAL], users: [{ id: 'usr_me', name: 'Me Rep' }], settings: [{ orgId: 'org_a', extra: {} }] })[op.table] || []));
const MUST_ADD = { error: 'Your profile has no email address, so the customer could not reply to you. An email address must be added to your profile before this quote can be sent. Nothing was sent.', field: 'email' };

test('a quote is not emailed by a sender with no address to reply to — told one must be added, nothing sent or written; a read that failed is no such thing', async () => {
    for (const rows of [[], [{}], [{ email: null, profile: {} }], [{ email: '' }], [{ email: 'not-an-address' }], [{ email: 'usr_me@placeholder.local' }], [{ email: 'user_2abc@no-email.invalid' }], [{ email: 'two@a.test <x>' }]]) {
        assert.deepEqual(await emailed(() => rows), { status: 422, body: MUST_ADD, wrote: '' }, JSON.stringify(rows));
    }
    const failed = await emailed(() => { throw new Error('TEST lookup down'); });
    assert.deepEqual([failed.status, failed.body.error, failed.wrote], [500, 'Internal server error', ''], 'REGRESSION: a failed read sent the quote, or said an address is missing');
    // One with an address: sent, the reply theirs — asked for where no signature is set, else their signature, escaped.
    const sends = [], realFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => { sends.push([String(url), JSON.parse(init.body)]); return new Response('{"id":"m"}', { status: 200, headers: { 'Content-Type': 'application/json' } }); };
    process.env.RESEND_API_KEY = 're_test';
    try {
        for (const profile of [null, {}, { emailSignature: '   ' }, { emailSignature: 'Pat & Co <b>' }]) {
            sends.length = 0;
            await emailed(() => [{ email: 'rep@own.test', profile }]);
            const [, m] = sends.find(([u]) => u.startsWith('https://api.resend.com/')) || [];
            assert.ok(m, `sent: ${JSON.stringify(profile)}`);
            const signed = !!profile?.emailSignature?.trim();
            assert.deepEqual([m.reply_to, m.html.includes('Please reply to this email with any questions.'), m.html.includes('Pat &amp; Co &lt;b&gt;'), m.html.includes('<b>')], ['rep@own.test', !signed, signed, false]);
        }
    } finally { globalThis.fetch = realFetch; delete process.env.RESEND_API_KEY; }
    const s = code(sourceOf('quote-email'));
    assert.ok(s.includes('.from(users).where(and(eq(users.clerkUserId, userId), eq(users.orgId, orgId))).limit(1);'), 'the signed-in sender, in this org');
    assert.ok(s.includes('if (!replyTo) {') && s.indexOf('if (!replyTo) {') < s.indexOf('const claim = ownerClaim('), 'before the quote is claimed');
    assert.equal(s.split('catch (').length - 1, 3, 'no catch of its own over the read: the claim, the send, the handler');
});

test("a usable address: plain and well formed, never either of the roster's placeholders — each as the server stores it", () => {
    assert.ok(read('netlify/functions/users.mjs').includes('`${data.id}@placeholder.local`') && read('netlify/functions/_lib.mjs').includes('`${clerkUserId}@no-email.invalid`'), 'the two, as stored');
    for (const v of ['usr_1@placeholder.local', 'user_2@no-email.invalid', 'USER_2@NO-EMAIL.INVALID']) { assert.equal(isPlaceholderEmail(v), true); assert.equal(reachable({ active: true, email: v }), false, `a notice: ${v}`); }
    for (const v of ['', null, 'rep@own.test', 'a@x.no-email.invalid.example', 'a@notplaceholder.local', 'a@my-no-email.invalid', 'a@placeholderxlocal', 'a@no-emailxinvalid', 'a@placeholder.local.example', 'a@no-email.invalid.example']) assert.equal(isPlaceholderEmail(v), false, String(v));
    assert.equal(reachable({ active: true, email: 'rep@own.test' }), true);
    assert.ok(read('netlify/functions/report-deliveries.mjs').includes('const isPlaceholder = (email) => !email || isPlaceholderEmail(email);') && read('netlify/functions/report-deliveries.mjs').includes('    return rows.filter(u => u.active !== false && !isPlaceholder(u.email));\n'), 'a scheduled report');
    for (const v of ['user_2@no-email.invalid', 'usr_1@placeholder.local', 'USR_1@PLACEHOLDER.LOCAL', ' usr_1@placeholder.local ', 'x', '', null, 'a b@c.d']) assert.equal(emailOrNull(v), null, String(v));
    for (const v of ['rep@own.test', 'a@placeholder.local.example', 'a@notplaceholder.locale']) assert.equal(emailOrNull(v), v);
});

// ── the alerts ───────────────────────────────────────────────────────────────

test('an alert not known to have gone goes again (Jeff, 23 Nov: "Send alert again") — a failed read of what went answers "not sent", in both scans; a row answers "sent" — RUN', async () => {
    for (const [f, name] of [['pipeline-alerts', 'wasRecentlyAlerted'], ['task-reminders', 'wasReminderSent']]) {
        const s = sourceOf(f).replace(/\r\n/g, '\n');
        const at = s.indexOf(`async function ${name}(`);
        const body = s.slice(at, s.indexOf('\n}\n', at) + 2);
        const query = (rows) => ({ select: () => ({ from: () => ({ where: () => ({ limit: async () => { if (rows instanceof Error) throw rows; return rows; } }) }) }) });
        const ran = (rows) => new Function('db', 'recommendationLog', 'and', 'eq', 'gte', 'DEDUP_DAYS', `${body}\nreturn ${name};`)(query(rows), {}, () => 0, () => 0, () => 0, 7)('org_a', 'x', 'y', 'z');
        assert.deepEqual([await ran(new Error('TEST down')), await ran([]), await ran([{ id: 1 }])], [false, false, true], name);
        assert.ok(body.includes('eq(recommendationLog.orgId, orgId),') && body.includes("eq(recommendationLog.actionType, "), `${name}: this org's, this signal's`);
    }
    // What each scan does with it: not sent, it goes; sent, it is skipped — never the other way about.
    const alerts = sourceOf('pipeline-alerts').replace(/\r\n/g, '\n');
    assert.deepEqual([alerts.split('await wasRecentlyAlerted(').length - 1,
        (alerts.match(/const alerted = await wasRecentlyAlerted\(orgId, repName, opp\.id, '\w+'\);\n\s*if \(!alerted\) \{\n/g) || []).length,
        (alerts.match(/if \(await wasRecentlyAlerted\([^)]*\)\) \{ skipped\+\+; continue; \}/g) || []).length,
        (alerts.match(/if \(!\(await wasRecentlyAlerted\([^)]*\)\)\) \{/g) || []).length], [8, 5, 2, 1]);
    assert.ok(sourceOf('task-reminders').replace(/\r\n/g, '\n').includes('                const alreadySent = await wasReminderSent(task.orgId || user.orgId, task.id);\n                if (alreadySent) { skipped++; continue; }\n'));
});

test('the suites: this file is graded by the harness', () => {
    const suites = read('scripts/mutate-import.mjs').match(/^const SUITES = '([^'\n]*)';$/m)?.[1].split(' ') ?? [];
    assert.ok(suites.includes('tests/own-key.test.mjs'), 'SUITES runs this file');
});
