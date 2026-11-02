// The stale settings save (state §0.224 — batch 4b-3, step B; Jeff, 2 Nov: "Revision per key", "Three commits",
// "Re-read settings once", "Retry, then refuse", "Take all Recommended"). B-1, the server: a save writes only its own
// keys, each with a revision token compared in the write itself; a stale one is refused, nothing written; every other
// writer of the row merges only its own keys and sets their tokens.
//
//   R1  the pure rules, run: tokens read, what a save says it loaded, its keys, the stale ones, what it writes
//   R2  every key a token covers is a key the PUT stores (but the server's own), plus the columns
//   R3  the PUT: the order — the early refusal straight after the read, the write's own compare, refused before the audit
//   R4  the PUT's write: the patch alone, merged in SQL, its tokens; the renames only by this save; the answers
//   R5  the SQL merge: the row as an object, tokens nested and last, the dropped keys parenthesised, no jsonb_set
//   R6  the other writers: the removal, the restore's clean-up, the restore, Train now, integration requests, the seed
//   R7  THE GUARD: every write of the settings row, in any function file, script or db script, is one named here
//   R8  the suites list holds this file
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import {
    COLUMN_KEYS, REV_KEYS, STALE_ERROR, revsOf, ifRevsOf, bodyKeys, revKeysOf, staleKeys, writtenKeys, columnsSent,
    revsMinted, keysDropped, pick,
} from '../src/utils/settingsRevs.js';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8').replace(/\r\n/g, '\n');
const code = (src) => src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
const inOrder = (s, ...texts) => { let at = 0; for (const x of texts) { const i = s.indexOf(x, at); if (i < 0) return x; at = i + x.length; } return true; };
const count = (s, sub) => s.split(sub).length - 1;

// ── R1 — the pure rules ───────────────────────────────────────────────────────

test('R1 — the rules, run: a stored token is text; a save names a token or null per key, or nothing (Q6); its keys; the stale ones; what it writes', () => {
    // revsOf: only text tokens, only from an object.
    assert.deepEqual(revsOf({ revs: { teams: 'a', spiffs: 7, territories: null, pipelines: 'b' } }), { teams: 'a', pipelines: 'b' });
    assert.deepEqual(revsOf({ revs: ['a'] }), {});
    assert.deepEqual(revsOf(null), {});
    assert.deepEqual(revsOf({}), {});
    // ifRevsOf: absent → unchecked (Q6); an object of tokens or nulls → checked; anything else → a 400.
    assert.deepEqual(ifRevsOf({ teams: [] }), { checked: false });
    assert.deepEqual(ifRevsOf(null), { checked: false });
    assert.deepEqual(ifRevsOf({ teams: [], ifRevs: { teams: 'a', territories: null } }), { checked: true, revs: { teams: 'a', territories: null } });
    for (const bad of [null, 'a', ['a'], { teams: 7 }, { teams: {} }, { teams: undefined }]) {
        assert.equal(ifRevsOf({ ifRevs: bad }).error, 'ifRevs must name a revision or null for each key.', JSON.stringify(bad));
    }
    // bodyKeys: a copy, without ifRevs or revs — a body never writes tokens.
    const body = { teams: [1], ifRevs: { teams: 'a' }, revs: { teams: 'forged' } };
    const data = bodyKeys(body);
    assert.deepEqual(data, { teams: [1] });
    data.approvalTiers = [];
    assert.ok(!('approvalTiers' in body), 'a copy: the approvals block never touches the caller\'s body');
    // revKeysOf: only the keys a token covers.
    assert.deepEqual(revKeysOf({ teams: [], companyName: 'x', integrationRequests: {}, junk: 1, revs: {} }), ['teams', 'companyName']);
    // staleKeys: a key the save names no token for reads as "none" — fails closed when one is stored.
    assert.deepEqual(staleKeys({ teams: 'a' }, { teams: 'a' }, ['teams']), []);
    assert.deepEqual(staleKeys({ teams: 'a' }, { teams: 'b' }, ['teams']), ['teams']);
    assert.deepEqual(staleKeys({ teams: null }, {}, ['teams']), [], 'expected none, none stored');
    assert.deepEqual(staleKeys({ teams: null }, { teams: 'b' }, ['teams']), ['teams'], 'expected none, one stored since');
    assert.deepEqual(staleKeys({}, { territories: 'b' }, ['territories']), ['territories'], 'a key left out of ifRevs is "none"');
    assert.deepEqual(staleKeys({ teams: 'a' }, { teams: 'a', spiffs: 'z' }, ['teams']), [], 'only the keys sent');
});

test('R1b — what a save writes: its keys the PUT stores, never integrationRequests; the key only when set, cleared or moved; the AI blob when it needs its scrub; the columns sent', () => {
    const stored = ['teams', 'spiffs', 'aiSettings', 'anthropicApiKey', 'integrationRequests', 'approvalTiers', 'approvalRouting'];
    assert.deepEqual(writtenKeys({ teams: [], junk: 1 }, stored), ['teams']);
    assert.deepEqual(writtenKeys({ integrationRequests: {} }, stored), [], 'the server\'s own (Q15)');
    assert.deepEqual(writtenKeys({ anthropicApiKey: null }, stored, { keyAction: null }), [], 'a clear of no key writes nothing');
    assert.deepEqual(writtenKeys({ anthropicApiKey: 'sk-x' }, stored, { keyAction: 'set' }), ['anthropicApiKey']);
    assert.deepEqual(writtenKeys({ spiffs: [] }, stored, { keyAction: 'migrated', aiScrubbed: true }), ['spiffs', 'anthropicApiKey', 'aiSettings']);
    assert.deepEqual(writtenKeys({ aiSettings: {} }, stored, { aiScrubbed: true }), ['aiSettings'], 'once');
    assert.deepEqual(writtenKeys({ approvalTiers: [], approvalRouting: 'role' }, stored), ['approvalTiers', 'approvalRouting'], 'the pair the approvals block fills');
    const row = { companyName: 'Acme', companyLogo: null, fiscalYearStart: '4', taskTypes: ['Call'], verticalMarkets: [], stages: ['A'], painPoints: ['P'] };
    assert.deepEqual(columnsSent({ teams: [] }, row), {}, 'a column not sent is not written');
    assert.deepEqual(columnsSent({ companyName: 'x', funnelStages: [], painPoints: [] }, row), { companyName: 'Acme', stages: ['A'], painPoints: ['P'] }, 'as the row builds them');
    assert.deepEqual(columnsSent({ fiscalYearStart: 4, taskTypes: [], verticalMarkets: [], companyLogo: '' }, row), { fiscalYearStart: '4', taskTypes: ['Call'], verticalMarkets: [], companyLogo: null });
    let n = 0;
    assert.deepEqual(revsMinted(['teams', 'teams', 'spiffs'], () => 't' + (++n)), { teams: 't1', spiffs: 't2' }, 'one each');
    assert.deepEqual(keysDropped({ teams: [], roles: {}, revs: {} }, new Set(['teams', 'revs'])), ['roles'], 'a retired key (§0.171)');
    assert.deepEqual(keysDropped(null, new Set()), []);
    assert.deepEqual(pick({ a: 1, b: 2 }, ['a', 'c']), { a: 1 });
    assert.equal(STALE_ERROR, 'These settings changed since this page loaded. Reload the page to see the latest, then make your change again.');
});

// ── R2 — the keys ─────────────────────────────────────────────────────────────

test('R2 — every key a token covers is a key the settings PUT stores (but integrationRequests, the server\'s), and the PUT\'s own columns', () => {
    const s = code(read('netlify/functions/settings.mjs'));
    const block = s.slice(s.indexOf('const extra = {'), s.indexOf('anthropicApiKey:  encryptedApiKey,') + 'anthropicApiKey:'.length);
    const keys = [...block.matchAll(/^\s{16}([A-Za-z]+):/gm)].map((m) => m[1]);
    assert.ok(keys.length >= 80, `the PUT's keys read: ${keys.length}`);
    assert.deepEqual([...REV_KEYS].sort(), [...keys.filter((k) => k !== 'integrationRequests'), ...COLUMN_KEYS].sort());
    assert.deepEqual(COLUMN_KEYS, ['companyName', 'companyLogo', 'fiscalYearStart', 'taskTypes', 'verticalMarkets']);
    for (const k of COLUMN_KEYS) assert.match(s, new RegExp(`'${k}'\\s+in data\\s*\\?`), `${k} is a column the PUT writes when sent`);
});

// ── R3 — the PUT's order ──────────────────────────────────────────────────────

test('R3 — the settings PUT: what the save loaded read off the body, the read, the early refusal, the checks, the write and its compare, a refusal before the roster and the audit', () => {
    const s = code(read('netlify/functions/settings.mjs'));
    const put = s.slice(s.indexOf("if (event.httpMethod === 'PUT') {"));
    assert.equal(inOrder(put,
        'const sent = ifRevsOf(body);',
        'if (sent.error) return { statusCode: 400, headers, body: JSON.stringify({ error: sent.error }) };',
        'const data = bodyKeys(body);',
        'const sentKeys = revKeysOf(data);',
        "const existingExtra = existing.length > 0 ? (existing[0].extra || {}) : {};",
        'const readRevs = revsOf(existingExtra);',
        'const stale = sent.checked ? staleKeys(sent.revs, readRevs, sentKeys) : [];',
        "if (stale.length) return { statusCode: 409, headers, body: JSON.stringify({ error: STALE_ERROR, code: 'stale', stale }) };",
        'data.approvalRouting = mode;',
        'for (const key of SETTINGS_LISTS) {',
        'const teamNamed =',
        'const linked = await checkSettingsLinks(data, existingExtra, orgId);',
        'const extra = {',
        'const written = writtenKeys(data, Object.keys(extra), { keyAction, aiScrubbed });',
        'const upsert = db.insert(settings)',
        'const renaming = renames.map(',
        'if (putSeam.beforeWrite) await putSeam.beforeWrite();',
        'try { [landed, ...renamedRows] = await db.batch([upsert, ...renaming]); }',
        'catch (err) { if (!lostFirstInsert(err)) throw err; }',
        'if (!landed.length) {',
        'const moved = compared.filter((k) => (revsOf(now?.extra)[k] ?? null) !== (readRevs[k] ?? null));',
        'if ((!sent.checked || !moved.some((k) => sentKeys.includes(k))) && retry < 2) return handle(event, retry + 1);',
        "return { statusCode: 409, headers, body: JSON.stringify({ error: STALE_ERROR, code: 'stale', stale: moved }) };",
        'const membersRenamed = renamedRows.reduce(',
        'if (membersRenamed) invalidateRoster(orgId);',
        'await writeAudit(orgId, {',
    ), true, 'REGRESSION: the PUT\'s order — a stale list asked about, or a refused write renamed, uncached or audited');
    // The retry is counted inside, never in the runtime's arguments: it calls handler(event, context, callback) (the review).
    assert.ok(s.includes('const handle = async (event, retry) => {'), 'a retry is counted');
    assert.ok(s.includes('export const handler = (event) => handle(event, 0);'), "REGRESSION: the retry count is the runtime's callback — no save is ever tried again");
    assert.doesNotMatch(s, /export const handler = async \(event, context/, "never a third parameter on the runtime's function");
    // An org's first two saves at once: the second's insert meets the row the first made — a lost race, tried again.
    assert.ok(s.includes("const ROW_KEYS = ['settings_pkey', 'settings_org_id_uniq'];"));
    assert.ok(s.includes("const lostFirstInsert = (err) => [err, err?.cause].some((e) => e?.code === '23505'"), 'only a unique violation');
    assert.ok(s.includes("&& (ROW_KEYS.includes(e?.constraint) || ROW_KEYS.some((c) => String(e?.message || '').includes(`\"${c}\"`))));"), "only on the row's own keys — never the web form's token");
    assert.ok(s.includes('export const putSeam = { beforeWrite: null };'), 'the seam, set by no caller');
    assert.equal(count(s, 'putSeam.beforeWrite'), 2, 'read once, awaited once — nowhere set');
    // Refused in the write: the keys that moved since this read, from a fresh read — never the row's values (J-B4).
    assert.ok(s.includes("const [now] = await db.select({ extra: settings.extra }).from(settings).where(eq(settings.orgId, orgId));"), 'in this org');
    assert.doesNotMatch(put, /code: 'stale'[^}]*current/, 'a refusal carries no values (J-B4: the screen reads settings again)');
});

// ── R4 — the PUT's write ──────────────────────────────────────────────────────

test('R4 — the PUT writes the patch alone, merged in SQL, compared on the tokens it read; the renames only by this save; the answers', () => {
    const s = code(read('netlify/functions/settings.mjs'));
    assert.ok(s.includes("import { COLUMN_KEYS, STALE_ERROR, revsOf, ifRevsOf, bodyKeys, revKeysOf, staleKeys, writtenKeys, columnsSent, revsMinted, keysDropped, pick } from '../../src/utils/settingsRevs.js';"));
    assert.ok(s.includes("import { mintRev, revUnchanged, extraMerged } from './_settingsRevs.mjs';"));
    // What it writes: the scrub's own test, the keys written, a token for each, the compare over written and sent.
    assert.ok(s.includes("const aiScrubbed = !('aiSettings' in data) && JSON.stringify(scrubAiSettings(existingExtra.aiSettings) ?? null) !== JSON.stringify(existingExtra.aiSettings ?? null);"), 'REGRESSION: a stored blob\'s junk no longer scrubbed on a save (the scrub\'s own test)');
    assert.ok(s.includes('const patch = pick(extra, written);'));
    assert.ok(s.includes('const newRevs = revsMinted([...written, ...COLUMN_KEYS.filter((k) => k in data)], mintRev);'), 'a token only for what is written');
    assert.ok(s.includes('const compared = [...new Set([...Object.keys(newRevs), ...sentKeys])];'));
    assert.ok(s.includes("const dropped = keysDropped(existingExtra, new Set([...Object.keys(extra), 'revs']));"), 'a retired key dropped by the list (§0.171), never revs');
    // The write: the insert's whole new row; the update's SQL merge, compared in the same statement.
    assert.ok(s.includes('const upsert = db.insert(settings).values({ ...dbRow, extra: { ...settingsSeeds(), ...patch, revs: newRevs } }).onConflictDoUpdate({'));
    assert.ok(s.includes('setWhere: and(eq(settings.orgId, orgId), ...compared.map((k) => revUnchanged(k, readRevs[k] ?? null))),'), 'REGRESSION: a stale write lands — the compare not in the write');
    assert.ok(s.includes('set: { orgId, ...columnsSent(data, dbRow), extra: extraMerged(patch, dropped, newRevs), updatedAt: dbRow.updatedAt },'), 'REGRESSION: the whole row written from the read');
    assert.ok(s.includes('}).returning({ id: settings.id });'), 'it says whether it wrote');
    assert.doesNotMatch(s, /excluded/, 'never the insert\'s values over the row');
    assert.doesNotMatch(s, /extra:\s*dbRow\.extra/, 'REGRESSION: the whole literal written');
    // The renames: only while the list as written by THIS save names the team — its own random token.
    assert.ok(s.includes("jsonb_build_object('id', ${id}::text, 'name', ${name}::text))\n                        and ${settings.extra}->'revs'->>'teams' = ${newRevs.teams}::text)`))"), 'REGRESSION: a save refused in its write still renames its members');
    // The audit: the keys sent and written — never ifRevs, revs or integrationRequests.
    assert.ok(s.includes("const changedKeys = Object.keys(data).filter(k => k !== 'anthropicApiKey' && (written.includes(k) || COLUMN_KEYS.includes(k)));"));
    // The answers: the GET every token; the 200 those of the keys sent, never a derived key's.
    assert.ok(s.includes('                revs: revsOf(row.extra),'), 'the GET answers the tokens');
    assert.ok(s.includes("body: JSON.stringify({ success: true, anthropicApiKeySet: !!encryptedApiKey, revs: pick(newRevs, sentKeys) }) };"), 'REGRESSION: a token answered for a value the screen does not hold');
});

// ── R5 — the SQL ──────────────────────────────────────────────────────────────

test('R5 — _settingsRevs.mjs: the row as an object; tokens merged nested and last; the dropped keys parenthesised; seeds under the row, an older row\'s columns first; no jsonb_set', () => {
    const s = code(read('netlify/functions/_settingsRevs.mjs'));
    assert.ok(s.includes("export const mintRev = () => randomBytes(16).toString('base64url');"), 'a random token');
    assert.ok(s.includes("const extraObj = sql`(case when jsonb_typeof(${settings.extra}) = 'object' then ${settings.extra} else '{}'::jsonb end)`;"));
    assert.ok(s.includes("sql`jsonb_build_object('revs', (case when jsonb_typeof(${settings.extra}->'revs') = 'object' then ${settings.extra}->'revs' else '{}'::jsonb end) || ${JSON.stringify(newRevs)}::jsonb)`;"), 'REGRESSION: the tokens merged at the top — other keys\' tokens wiped');
    assert.ok(s.includes("export const revUnchanged = (key, read) => sql`(${settings.extra}->'revs'->>${key}::text) is not distinct from ${read}::text`;"), 'none read matches none stored');
    assert.ok(s.includes('const kept = dropped.reduce((acc, k) => sql`(${acc} - ${k}::text)`, extraObj);'), 'each drop in its own parentheses');
    assert.ok(s.includes('return sql`((${seedsUnder()} || ${kept}) || ${JSON.stringify(patch)}::jsonb) || ${revsBumped(newRevs)}`;'), 'REGRESSION: the merge\'s order — seeds over the row, or the row over the save');
    assert.ok(s.includes('sql`(${extraObj} || ${JSON.stringify(patch)}::jsonb) || ${revsBumped(newRevs)}`;'), 'another writer: the row, its keys, their tokens');
    assert.ok(s.includes("(case when jsonb_typeof(${column}) = 'array' and jsonb_array_length(${column}) > 0 then ${column} else ${JSON.stringify(seeds[key])}::jsonb end)"), 'REGRESSION (J-B3): an older row\'s own stages hidden under the default');
    assert.ok(s.includes("${fromColumn(settings.stages, 'funnelStages')} || ${fromColumn(settings.painPoints, 'painPoints')}"));
    assert.doesNotMatch(s, /jsonb_set/, 'never a nested set — it writes nothing where the parent is missing');
});

// ── R6 — the other writers ────────────────────────────────────────────────────

test('R6 — every other writer merges only its keys: the removal and the restore\'s clean-up with tokens, the restore minting every token, Train now and integration requests guarded on what they read', () => {
    const l = code(read('netlify/functions/_links.mjs'));
    assert.ok(l.includes("import { revsMinted } from '../../src/utils/settingsRevs.js';") && l.includes("import { mintRev, extraPatched } from './_settingsRevs.mjs';"));
    assert.equal(count(l, 'extraPatched('), 2, 'the removal and the restore\'s clean-up');
    assert.doesNotMatch(l, /coalesce\(\$\{settings\.extra\}, '\{\}'::jsonb\) \|\|/, 'REGRESSION: a settings write with no token');
    const b = code(read('netlify/functions/backup.mjs'));
    assert.ok(b.includes("import { REV_KEYS, revsMinted } from '../../src/utils/settingsRevs.js';"));
    assert.ok(b.includes("                delete extra.anthropicApiKey;\n                extra.revs = revsMinted(REV_KEYS, mintRev);\n                return { ...r, id: orgId, extra };"), 'REGRESSION (J-B13): a file\'s tokens kept — a tab that loaded before the restore passes');
    const sl = code(read('netlify/functions/score-leads-batch.mjs'));
    assert.ok(sl.includes("import { mintRev, extraPatched } from './_settingsRevs.mjs';"));
    assert.ok(sl.includes("const newRevs = revsMinted(['leadScoring'], mintRev);"));
    const t = code(read('netlify/functions/train-lead-model.mjs'));
    assert.ok(t.includes('revs:         r.revs,'));
});

// ── R7 — THE GUARD ────────────────────────────────────────────────────────────

// Every write of the settings row, by file, and why it is safe: each merges only its keys and sets their tokens.
const WRITERS = {
    'netlify/functions/settings.mjs': { insert: 1, update: 0, why: 'the PUT: the patch, compared on its tokens in the write (R3, R4)' },
    'netlify/functions/_links.mjs': { insert: 0, update: 2, why: 'removeWithLists and clearSettingsLinks: extraPatched, guarded on what they read (R6)' },
    'netlify/functions/score-leads-batch.mjs': { insert: 0, update: 1, why: 'scoreOrg: the rules alone, guarded on them as read (train-now.test.mjs)' },
    'netlify/functions/integration-requests.mjs': { insert: 1, update: 1, why: 'one request merged while none is stored; no token — no screen saves the key, Q15 (connected-apps.test.mjs)' },
    'scripts/seed-qa-org.mjs': { insert: 0, update: 1, why: 'the keys it adds, while missing, with tokens (qa-seed.test.mjs)' },
};
// The restore writes the row through upsertChunked, named here: its ownSettings mints every token (R6).
const BY_HAND = { 'netlify/functions/backup.mjs': 'ownSettings: every key a new token, never the file\'s' };

const filesIn = (dir, keep) => readdirSync(new URL(dir, ROOT)).filter(keep).map((f) => dir + f);
// The local names a file gives the settings table: an import from the schema (aliased or not), or the schema module's.
function settingsNames(src) {
    const names = new Set();
    for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*'[./]*db\/schema\.js'/g)) {
        for (const part of m[1].split(',')) {
            const [orig, alias] = part.trim().split(/\s+as\s+/);
            if (orig === 'settings') names.add(alias || orig);
        }
    }
    for (const m of src.matchAll(/const\s+(\w+)\s*=\s*await import\('[./]*db\/schema\.js'\)/g)) names.add(m[1] + '.settings');
    return names;
}
const writesOf = (src, names, verb) => [...names].reduce((n, name) => n + count(src, `.${verb}(${name})`), 0);

test('R7 — THE GUARD: every write of the settings row — in any function file, script or db script — is one named, merging only its keys with their tokens', () => {
    const files = [
        ...filesIn('netlify/functions/', (f) => f.endsWith('.mjs')),
        ...filesIn('scripts/', (f) => f.endsWith('.mjs') && !f.startsWith('mutate-')),
        ...filesIn('db/', (f) => f.endsWith('.mjs')),
    ];
    let seen = 0;
    for (const f of files) {
        const src = code(read(f));
        const names = settingsNames(src);
        const got = { insert: writesOf(src, names, 'insert'), update: writesOf(src, names, 'update') };
        if (!got.insert && !got.update) continue;
        seen += 1;
        assert.ok(f in WRITERS, `${f} writes the settings row (${JSON.stringify(got)}) — merge only its keys, set their tokens, and name it here (state §0.224)`);
        assert.deepEqual(got, { insert: WRITERS[f].insert, update: WRITERS[f].update }, `${f}: ${WRITERS[f].why}`);
    }
    assert.equal(seen, Object.keys(WRITERS).length, 'every named writer still writes');
    for (const f of Object.keys(BY_HAND)) assert.ok(read(f).includes('extra.revs = revsMinted(REV_KEYS, mintRev);'), `${f}: ${BY_HAND[f]}`);
    // The guard's own reading, on made-up files.
    assert.deepEqual([...settingsNames("import { users, settings as settingsTable } from '../../db/schema.js';")], ['settingsTable']);
    assert.deepEqual([...settingsNames("import { settings } from '../../db/schema.js';")], ['settings']);
    assert.deepEqual([...settingsNames("const S = await import('../db/schema.js');")], ['S.settings']);
    assert.equal(writesOf('db.update(settingsTable).set({})', new Set(['settingsTable']), 'update'), 1);
    assert.equal(writesOf('db.update(users).set({})', new Set(['settings']), 'update'), 0);
});

// ── R8 ────────────────────────────────────────────────────────────────────────

test('R8 — the suites: this file is graded by the harness; the integration suite runs in test:int', () => {
    const suites = read('scripts/mutate-import.mjs').match(/^const SUITES = '([^'\n]*)';$/m)?.[1].split(' ') ?? [];
    assert.ok(suites.includes('tests/settings-revs.test.mjs'), 'SUITES runs this file');
    assert.ok(JSON.parse(read('package.json')).scripts['test:int'].includes('tests/integration/settings-revs.itest.mjs'), 'test:int runs the integration suite');
});
