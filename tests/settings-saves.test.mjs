// The stale settings save, the screens' half (state §0.225 — batch 4b-3, step B-2; Jeff, 2 Nov: "Take all
// Recommended", JB2-7 and JB2-8 fixed here). One sender (src/Tabs/settings/shared/saveSettings.js) sends every people
// screen's settings save with the token its draft was read with; a stale refusal takes the latest (takeLatestSettings,
// J-B4); a save that lands merges the tokens it answered (revsAfter) — before any member row goes out. B-3 converts the
// other panels: until then they name no tokens and are accepted unchecked (Q6).
//
//   S1  the URL: only the sender, the app's load, Connected apps' two GETs and the direct sends B-3 moves hold it
//   S2  every send names its tokens, read from its draft's binding (the render's settings.revs, a window's snapshot) —
//       never `prev`, never a ref; the panels B-3 converts name none, each still listed
//   S3  the sender, run with fetch stubbed: putSettings, writeSettings, takeLatestSettings, addToSettingsList, the rules
//   S4  every stale refusal takes the latest, through the one helper; the invite and the import read `twice`
//   S5  every save that lands merges the tokens it answered, by revsAfter — the Deletes and Assign before the members
//   S6  TerritoryModal's save, run as written
//   S7  Teams' Assign (assignTo), run as written
//   S8  the scanners' own reading on made-up sources; the suites list holds this file
//
// Every import of saveSettings.js, settingsRevs.js or settingsDefaults.js is an `await import()` inside its test: a
// static import of a name the sender lacked would kill the file before the scans ran.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { parse } from '@babel/parser';
import { teamsWithMembers, teamsWithMemberOn } from '../src/utils/teamMembership.js';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8').replace(/\r\n/g, '\n');
const count = (s, sub) => s.split(sub).length - 1;
const astOf = (src) => parse(src, { sourceType: 'module', plugins: ['jsx'] });

const SKIP = new Set(['loc', 'start', 'end', 'extra', 'comments', 'leadingComments', 'trailingComments', 'innerComments']);
const walk = (node, visit, anc = []) => {
    if (!node || typeof node.type !== 'string') return;
    visit(node, anc);
    const here = [...anc, node];
    for (const k of Object.keys(node)) {
        if (SKIP.has(k)) continue;
        const v = node[k];
        if (Array.isArray(v)) v.forEach((c) => walk(c, visit, here));
        else if (v && typeof v.type === 'string') walk(v, visit, here);
    }
};
const isFn = (n) => n && /^(ArrowFunctionExpression|FunctionExpression|FunctionDeclaration|ObjectMethod|ClassMethod)$/.test(n.type);
const isCall = (n) => n && (n.type === 'CallExpression' || n.type === 'OptionalCallExpression');
const isMember = (n) => n && (n.type === 'MemberExpression' || n.type === 'OptionalMemberExpression');
const calleeName = (n) => (n.callee && n.callee.type === 'Identifier' ? n.callee.name : null);
const propName = (n) => (!n.computed && n.property.type === 'Identifier' ? n.property.name : n.property.type === 'StringLiteral' ? n.property.value : null);
const keyName = (p) => (p.type === 'ObjectProperty' && !p.computed ? (p.key.type === 'Identifier' ? p.key.name : p.key.type === 'StringLiteral' ? p.key.value : null) : null);
// A member chain's names from its root — settings.revs?.teams is ['settings', 'revs', 'teams']; null when it is none.
const chainOf = (n) => {
    const names = [];
    while (isMember(n)) {
        const p = propName(n);
        if (p === null) return null;
        names.unshift(p);
        n = n.object;
    }
    return n && n.type === 'Identifier' ? [n.name, ...names] : null;
};
const has = (node, pred) => { let found = false; walk(node, (n) => { if (!found && pred(n)) found = true; }); return found; };
const readsMember = (name) => (n) => isMember(n) && propName(n) === name;
const callsNamed = (name) => (n) => isCall(n) && calleeName(n) === name;

const srcFiles = () => {
    const out = [];
    const walkDir = (dir) => {
        for (const e of readdirSync(new URL(dir, ROOT), { withFileTypes: true })) {
            const p = dir + e.name;
            if (e.isDirectory()) walkDir(p + '/');
            else if (/\.(jsx?|mjs)$/.test(e.name)) out.push(p);
        }
    };
    walkDir('src/');
    return out;
};

// A source with its comments taken out — a line's, a block's, a JSX one's — by the parse, so a URL in a string stays.
const withoutComments = (src) => {
    let out = '', at = 0;
    for (const c of astOf(src).comments) { out += src.slice(at, c.start); at = c.end; }
    return out + src.slice(at);
};

// A component's handler, as written: the `const <handler> = …` among the statements of `const <component> = (…) => {`.
const handlerIn = (src, component, handler) => {
    let out = null;
    walk(astOf(src).program, (n) => {
        if (n.type !== 'VariableDeclarator' || n.id.name !== component || !isFn(n.init)) return;
        for (const st of n.init.body.body || []) {
            if (st.type !== 'VariableDeclaration') continue;
            for (const d of st.declarations) if (d.id.name === handler) out = src.slice(d.init.start, d.init.end);
        }
    });
    assert.ok(out, `${component}'s ${handler} not found`);
    return out;
};

// ── The files ────────────────────────────────────────────────────────────────

const SENDER = 'src/Tabs/settings/shared/saveSettings.js';
// B-2's sends, file by file: the people screens, converted (state §0.225).
const SITES = {
    'src/Tabs/settings/people/TeamsDetail.jsx': { putSettings: 1, writeSettings: 2 },          // Delete; the window, Assign
    'src/Tabs/settings/people/TerritoriesDetail.jsx': { putSettings: 1, writeSettings: 2 },    // Delete; the window, the CSV
    'src/Tabs/settings/people/UsersDetail.jsx': { writeSettings: 1, addToSettingsList: 1 },    // the profile's move; Invite
    'src/components/layout/ModalLayer.jsx': { addToSettingsList: 1 },                          // the member import
};
const B2_FILES = Object.keys(SITES);
// The panels B-3 converts, with their putSettings calls: each still names no tokens — one argument — and is accepted
// unchecked (Q6). A panel converted comes off this list; B-3 empties it.
const B3_PENDING = {
    'src/Tabs/settings/company/CompanyCalendarDetail.jsx': 2,
    'src/Tabs/settings/company/CompanyProfileDetail.jsx': 1,
    'src/Tabs/settings/company/FiscalYearDetail.jsx': 1,
    'src/Tabs/settings/dispatch/DispatchCrewsDetail.jsx': 1,
    'src/Tabs/settings/dispatch/DispatchCustomerNotificationsDetail.jsx': 1,
    'src/Tabs/settings/dispatch/DispatchJobTemplatesDetail.jsx': 1,
    'src/Tabs/settings/dispatch/DispatchPropertyTypesDetail.jsx': 1,
    'src/Tabs/settings/dispatch/DispatchSkillsDetail.jsx': 1,
    'src/Tabs/settings/integrations/ConnectedAppsDetail.jsx': 3,
    'src/Tabs/settings/quoting/ApprovalTiersDetail.jsx': 1,
    'src/Tabs/settings/quoting/ProductTypesDetail.jsx': 1,
    'src/Tabs/settings/quoting/QuoteTemplatesDetail.jsx': 1,
    'src/Tabs/settings/salesProcess/AccountSegmentsDetail.jsx': 1,
    'src/Tabs/settings/salesProcess/BuyerPersonasDetail.jsx': 1,
    'src/Tabs/settings/salesProcess/CustomerTypesDetail.jsx': 1,
    'src/Tabs/settings/salesProcess/CustomFieldsDetail.jsx': 1,
    'src/Tabs/settings/salesProcess/EmailTemplatesDetail.jsx': 1,
    'src/Tabs/settings/salesProcess/FlatListDetail.jsx': 1,
    'src/Tabs/settings/salesProcess/FunnelStagesDetail.jsx': 1,
    'src/Tabs/settings/salesProcess/IndustriesDetail.jsx': 1,
    'src/Tabs/settings/salesProcess/KPIThresholdsDetail.jsx': 1,
    'src/Tabs/settings/salesProcess/LeadConversionDetail.jsx': 1,
    'src/Tabs/settings/salesProcess/LeadScoringDetail.jsx': 1,
    'src/Tabs/settings/salesProcess/LeadVisibilityDetail.jsx': 1,
    'src/Tabs/settings/salesProcess/PainPointsDetail.jsx': 1,
    'src/Tabs/settings/salesProcess/PipelinesDetail.jsx': 1,
};
// The direct sends B-3 moves into the sender: the URL once each, until then.
const B3_DIRECT = [
    'src/Tabs/SalesManagerTab.jsx',
    'src/Tabs/settings/data/FeaturesDetail.jsx',
    'src/Tabs/settings/dispatch/DispatchBlockTypesDetail.jsx',
    'src/Tabs/settings/dispatch/DispatchJobTypesDetail.jsx',
    'src/Tabs/settings/quoting/EditBrandModal.jsx',
];
// The named GETs: the app's load, and the Connected apps panel's own load and re-read (B-3's).
const NAMED_GETS = { 'src/hooks/useSettings.js': 1, 'src/Tabs/settings/integrations/ConnectedAppsDetail.jsx': 2 };
const URL_HOLDERS = { [SENDER]: 1, ...NAMED_GETS, ...Object.fromEntries(B3_DIRECT.map((f) => [f, 1])) };

const SETTINGS_URL_ALL = /functions\/settings(?![\w/-])/g;
const SETTINGS_URL_ONE = /functions\/settings(?![\w/-])/;
const urlCount = (src) => (withoutComments(src).match(SETTINGS_URL_ALL) || []).length;

// ── The scanners ─────────────────────────────────────────────────────────────

const SENDS = new Set(['putSettings', 'writeSettings', 'addToSettingsList']);
// Inside a setSettings updater: in a function handed to setSettings.
const inUpdater = (anc) => anc.some((a, i) => i > 0 && isFn(a) && isCall(anc[i - 1]) && /^_?setSettings$/.test(calleeName(anc[i - 1]) || '') && anc[i - 1].arguments.includes(a));
// The const a name is set by, in a function around a node (the innermost first), outside any function inside it.
const constNamed = (name, anc) => {
    for (const fn of [...anc].reverse().filter(isFn)) {
        let found = null;
        const look = (node) => {
            if (!node || typeof node.type !== 'string' || found) return;
            if (node !== fn.body && isFn(node)) return;
            if (node.type === 'VariableDeclaration' && node.kind === 'const') {
                for (const d of node.declarations) if (d.id.type === 'Identifier' && d.id.name === name) found = d;
            }
            for (const k of Object.keys(node)) {
                if (SKIP.has(k)) continue;
                const v = node[k];
                if (Array.isArray(v)) v.forEach(look);
                else if (v && typeof v.type === 'string') look(v);
            }
        };
        look(fn.body);
        if (found) return found;
    }
    return null;
};
// Why a token is not read from its draft's binding (null when it is): the render's settings.revs.<key>, a window's
// snapshot's `.rev`, or a const set from one of those in a function around the send — with `?? null` or without. Never
// a ref's `.current`, never an updater's `prev`, never an answer's tokens (the token goes with its draft, state §0.225).
const tokenFault = (expr, key, anc, depth = 0) => {
    if (expr.type === 'LogicalExpression' && expr.operator === '??') {
        if (expr.right.type !== 'NullLiteral') return 'falls back to something other than null';
        return tokenFault(expr.left, key, anc, depth);
    }
    const chain = chainOf(expr);
    if (chain) {
        if (chain.includes('current')) return 'is read from a ref (.current) — at send time, not with its draft';
        if (chain[0] === 'prev') return 'is read from an updater\'s prev';
        if (chain[0] === 'settings' && chain[1] === 'revs') return chain.length === 3 && chain[2] === key ? null : `is settings.revs.${chain.slice(2).join('.') || '(whole)'}, not ${key}'s`;
        if (chain.length === 2 && chain[1] === 'rev') return null;
        if (chain.length === 1 && depth === 0) {
            const decl = constNamed(chain[0], anc);
            if (!decl || !decl.init) return `${chain[0]} is no const set in a function around the send`;
            return tokenFault(decl.init, key, anc, 1);
        }
    }
    return 'is not read from settings.revs or a window\'s snapshot';
};
// One file's sends: each names a token for every key it sends, read from its draft's binding; an addition to a list
// (addToSettingsList) takes the list and its token from one binding. Answers the faults, and the sends by name.
const sendFaults = (file, src) => {
    const out = [], counts = {};
    walk(astOf(src).program, (n, anc) => {
        if (!isCall(n) || !SENDS.has(calleeName(n))) return;
        const name = calleeName(n), at = `${file}:${n.loc.start.line} ${name}`;
        counts[name] = (counts[name] || 0) + 1;
        if (inUpdater(anc)) out.push(`${at}: sent from inside a setSettings updater`);
        if (name === 'addToSettingsList') {
            const [key, , opts] = n.arguments;
            const p = opts && opts.type === 'ObjectExpression' ? Object.fromEntries(opts.properties.map((q) => [keyName(q), q.value])) : {};
            const list = p.list ? chainOf(p.list) : null;
            if (!key || key.type !== 'StringLiteral' || !list || list.length !== 2 || list[1] !== key.value) {
                out.push(`${at}: the list is not a render's <settings>.${key?.value}`);
                return;
            }
            const rev = p.rev && p.rev.type === 'LogicalExpression' && p.rev.operator === '??' && p.rev.right.type === 'NullLiteral' ? p.rev.left : p.rev;
            const revChain = rev ? chainOf(rev) : null;
            if (!revChain || revChain.join('.') !== `${list[0]}.revs.${key.value}`) out.push(`${at}: the token is not ${list[0]}.revs.${key.value} — the list and its token from one binding`);
            if (!('setSettings' in p)) out.push(`${at}: no setSettings — the landed list and its token never reach the copy`);
            return;
        }
        const [payload, revs] = n.arguments;
        if (n.arguments.length !== 2 || !revs || revs.type !== 'ObjectExpression') { out.push(`${at}: no tokens — a second argument naming each key's`); return; }
        if (!payload || payload.type !== 'ObjectExpression') { out.push(`${at}: the payload is not an object literal`); return; }
        const sent = payload.properties.map(keyName), named = revs.properties.map(keyName);
        if (sent.includes(null) || named.includes(null) || [...sent].sort().join() !== [...named].sort().join()) {
            out.push(`${at}: tokens for ${named.join(', ') || 'no key'}, keys sent ${sent.join(', ')}`);
        }
        for (const q of revs.properties) {
            const k = keyName(q);
            if (k === null) continue;
            const why = tokenFault(q.value, k, anc);
            if (why) out.push(`${at}: ${k}'s token ${why}`);
        }
    });
    return { out, counts };
};
// One file's refusals: a putSettings' catch, and the function around a writeSettings, reads `.stale` and takes the
// latest (takeLatestSettings); the function around an addToSettingsList reads `.twice` and takes no latest itself —
// the helper has.
const refusalFaults = (file, src) => {
    const out = [];
    walk(astOf(src).program, (n, anc) => {
        if (!isCall(n) || !SENDS.has(calleeName(n))) return;
        const name = calleeName(n), at = `${file}:${n.loc.start.line} ${name}`;
        const fnAt = anc.findLastIndex(isFn), fn = anc[fnAt];
        if (!fn) { out.push(`${at}: outside a function`); return; }
        if (name === 'addToSettingsList') {
            if (!has(fn, readsMember('twice'))) out.push(`${at}: a second refusal (.twice) is never read — J-B6's words never said`);
            if (has(fn, callsNamed('takeLatestSettings'))) out.push(`${at}: takes the latest itself — the helper already has`);
            return;
        }
        let where = fn;
        if (name === 'putSettings') {
            let tryAt = -1;
            for (let k = anc.length - 2; k > fnAt; k--) if (anc[k].type === 'TryStatement' && anc[k + 1] === anc[k].block) { tryAt = k; break; }
            where = tryAt >= 0 ? anc[tryAt].handler : null;
            if (!where) { out.push(`${at}: its refusal is thrown with no catch around it`); return; }
        }
        if (!has(where, readsMember('stale')) || !has(where, callsNamed('takeLatestSettings'))) {
            out.push(`${at}: a stale refusal does not take the latest (.stale, takeLatestSettings) — the screen keeps a list the server refuses`);
        }
    });
    return out;
};
// One file's setSettings updaters: an object writing a list (teams, territories, or a key computed) writes `revs` too,
// and `revs` is only ever revsAfter(<prev>.revs, …) — the held tokens kept key by key, the answered ones set over them.
const updaterFaults = (file, src) => {
    const out = [];
    walk(astOf(src).program, (n) => {
        if (!isCall(n) || !/^_?setSettings$/.test(calleeName(n) || '') || !isFn(n.arguments[0])) return;
        const fn = n.arguments[0], prev = fn.params[0]?.type === 'Identifier' ? fn.params[0].name : null;
        walk(fn.body, (o) => {
            if (o.type !== 'ObjectExpression') return;
            const at = `${file}:${o.loc.start.line}`;
            const keys = o.properties.map((p) => (p.type === 'ObjectProperty' ? (p.computed ? '[computed]' : keyName(p)) : null));
            const revs = o.properties.find((p) => keyName(p) === 'revs');
            if (keys.some((k) => k === 'teams' || k === 'territories' || k === '[computed]') && !revs) out.push(`${at}: a list set without its token — the next save sends the old one and is refused`);
            if (revs) {
                const v = revs.value;
                const ok = isCall(v) && calleeName(v) === 'revsAfter' && v.arguments.length === 2 && (chainOf(v.arguments[0]) || []).join('.') === `${prev}.revs`;
                if (!ok) out.push(`${at}: revs set other than revsAfter(${prev}.revs, …)`);
            }
        });
    });
    return out;
};

// ── S1 ───────────────────────────────────────────────────────────────────────

test('S1 — the URL: the sender, the app\'s load, Connected apps\' two GETs and the direct sends B-3 moves hold it — no other file, none of the people screens', () => {
    const got = {};
    for (const f of srcFiles()) {
        const n = urlCount(read(f));
        if (n) got[f] = n;
    }
    for (const f of B2_FILES) assert.equal(got[f], undefined, `${f}: a people screen sends through the sender (state §0.225)`);
    assert.deepEqual(got, URL_HOLDERS, 'a settings request outside the sender names no token and takes no latest — send it through saveSettings.js');
    assert.ok(read(SENDER).includes("const SETTINGS_URL = '/.netlify/functions/settings';"), 'the sender\'s one spelling');
    // The named GETs read: one argument, no method.
    for (const f of Object.keys(NAMED_GETS)) {
        let gets = 0;
        walk(astOf(read(f)).program, (n) => {
            if (!isCall(n) || !n.arguments[0] || n.arguments[0].type !== 'StringLiteral' || !SETTINGS_URL_ONE.test(n.arguments[0].value)) return;
            gets += 1;
            assert.equal(n.arguments.length, 1, `${f}:${n.loc.start.line}: a named GET — a write here names no token`);
        });
        assert.equal(gets, NAMED_GETS[f], `${f}: every GET named`);
    }
});

// ── S2 ───────────────────────────────────────────────────────────────────────

test('S2 — every send names its tokens, read from its draft\'s binding; the panels B-3 converts name none, each still listed', () => {
    const faults = [], sites = {}, pending = {};
    for (const f of srcFiles()) {
        if (f === SENDER) continue;
        const src = read(f);
        if (!/\b(putSettings|writeSettings|addToSettingsList)\(/.test(src)) continue;
        if (f in B3_PENDING) {
            walk(astOf(src).program, (n) => {
                if (!isCall(n) || !SENDS.has(calleeName(n))) return;
                if (calleeName(n) === 'putSettings' && n.arguments.length === 1) pending[f] = (pending[f] || 0) + 1;
                else faults.push(`${f}:${n.loc.start.line}: listed as B-3's, yet names tokens — converted, take it off B3_PENDING`);
            });
            continue;
        }
        const { out, counts } = sendFaults(f, src);
        faults.push(...out);
        if (Object.keys(counts).length) sites[f] = counts;
    }
    assert.deepEqual(faults, []);
    assert.deepEqual(sites, SITES, 'every send outside the B-3 list is one of B-2\'s, each named here');
    assert.deepEqual(pending, B3_PENDING, 'every panel listed as B-3\'s still sends, unchecked — a stale entry hides nothing');
});

// ── S3 — the sender, run ─────────────────────────────────────────────────────

const PENDING = Symbol('pending');
const outcome = (pr) => Promise.race([pr.then((v) => ({ v }), (e) => ({ e })), new Promise((r) => setTimeout(() => r(PENDING), 60))]);
const tick = () => new Promise((r) => setTimeout(r, 0));
const until = async (cond) => { for (let i = 0; i < 100 && !cond(); i++) await tick(); assert.ok(cond(), 'the request never went out'); };
// An answer held open: released after a switch — whole, or its body read across one.
const held = () => {
    const h = {};
    h.answer = () => new Promise((resolve, reject) => {
        h.release = (status, body) => resolve(new Response(JSON.stringify(body), { status }));
        h.slow = (ok, status, body) => resolve({ ok, status, statusText: '', json: () => new Promise((rb) => { h.body = () => rb(body); }) });
        h.fail = () => reject(new Error('offline'));
    });
    return h;
};
// The sender's requests answered from a queue: { status, body } (no body: not JSON), an Error (the network), or a
// function answering what fetch would (a held answer). Every request is recorded with its parsed body.
const withServer = async (run) => {
    const { setRequestOrg } = await import('../src/utils/storage.js');
    const savedWindow = globalThis.window, savedFetch = globalThis.fetch, savedError = console.error;
    const sent = [], queue = [];
    globalThis.window = { __getClerkToken: async () => 'token' };
    globalThis.fetch = async (url, opts = {}) => {
        sent.push({ url, method: opts.method || 'GET', body: opts.body === undefined ? undefined : JSON.parse(opts.body) });
        const a = queue.shift();
        if (a === undefined) throw new Error('no answer queued');
        if (a instanceof Error) throw a;
        if (typeof a === 'function') return a();
        return new Response(a.body === undefined ? 'not json' : JSON.stringify(a.body), { status: a.status });
    };
    console.error = () => {};   // dbFetch logs every refusal; these are made up
    setRequestOrg('org_A');
    try {
        await run({ sent, queue, setRequestOrg });
    } finally {
        globalThis.window = savedWindow; globalThis.fetch = savedFetch; console.error = savedError;
        setRequestOrg(null);
    }
};

test('S3 — the rules, run: withIfRevs (Q6), staleOf, revsAfter, settingsAsLoaded; the words', async () => {
    const { withIfRevs, staleOf, revsAfter, listChanged, TEAMS_CHANGED_TWICE, TEAM_MOVE_CHANGED, TEAM_MOVE_CHANGED_UNREAD } = await import('../src/utils/settingsRevs.js');
    const { settingsAsLoaded, DEFAULT_SETTINGS } = await import('../src/utils/settingsDefaults.js');
    const p = { teams: [] };
    assert.equal(withIfRevs(p, undefined), p, 'REGRESSION (Q6): no tokens named, yet ifRevs sent — every unconverted panel refused');
    assert.deepEqual(withIfRevs(p, null), { teams: [], ifRevs: { teams: null } }, 'REGRESSION: null read as "no tokens" — a converted screen that loaded none sends unchecked');
    assert.deepEqual(withIfRevs(p, {}), { teams: [], ifRevs: { teams: null } });
    assert.deepEqual(withIfRevs({ teams: [], territories: [], integrationRequests: {}, companyName: 'X' }, { teams: 'a', territories: 7, companyName: 'c', spiffs: 's' }),
        { teams: [], territories: [], integrationRequests: {}, companyName: 'X', ifRevs: { teams: 'a', territories: null, companyName: 'c' } },
        'a token for each key sent that a token covers — never the server\'s own, never a key not sent, null for no text');
    assert.deepEqual(staleOf(409, { code: 'stale', stale: ['teams', 7] }), ['teams']);
    assert.deepEqual(staleOf(409, { code: 'stale' }), []);
    assert.equal(staleOf(409, { code: 'invitation', error: 'x' }), null, 'the users function\'s 409 is no stale refusal');
    assert.equal(staleOf(400, { code: 'stale' }), null);
    assert.equal(staleOf(409, null), null);
    assert.deepEqual(revsAfter({ teams: 'a', spiffs: 's' }, { teams: 'b' }), { teams: 'b', spiffs: 's' }, 'REGRESSION: the held tokens replaced whole — another key\'s next save refused');
    assert.deepEqual(revsAfter(undefined, { teams: 'b', junk: 7 }), { teams: 'b' });
    assert.deepEqual(revsAfter({ teams: 'a' }, undefined), { teams: 'a' });
    // The copy as the load builds it: the read's values and its tokens as one set, the roster as loaded.
    const roster = [{ id: 'usr_a' }];
    assert.deepEqual(settingsAsLoaded({ users: roster, revs: { teams: 'a' } }, null), { ...DEFAULT_SETTINGS, users: roster }, 'no row: the defaults, no tokens');
    const loaded = settingsAsLoaded({ users: roster, revs: { teams: 'a', spiffs: 's' }, kept: 1 },
        { teams: [{ id: 't' }], users: [{ id: 'NOT_THE_ROSTER' }], revs: { teams: 'b' }, taskTypes: [], funnelStages: [] });
    assert.deepEqual(loaded.revs, { teams: 'b' }, 'REGRESSION: the tokens merged — a key the read lacks keeps a token for values no longer shown');
    assert.equal(loaded.users, roster, 'REGRESSION: the roster taken from the settings read');
    assert.deepEqual(loaded.teams, [{ id: 't' }]);
    assert.deepEqual(loaded.taskTypes, DEFAULT_SETTINGS.taskTypes);
    assert.deepEqual(loaded.funnelStages, DEFAULT_SETTINGS.funnelStages);
    assert.equal(loaded.kept, undefined, 'the copy is the read, as the load builds it');
    // The words.
    assert.equal(listChanged('territory'), 'The territory list changed since this page loaded — it now shows the latest. Make your change again.');
    assert.equal(TEAMS_CHANGED_TWICE, 'The invitations went out, but the team list changed twice while saving and does not list them yet — reload; their team is set on their row.', 'J-B6, verbatim');
    for (const w of [TEAM_MOVE_CHANGED, TEAM_MOVE_CHANGED_UNREAD]) {
        assert.ok(w.startsWith('Saved, but the team list changed since this page loaded') && w.endsWith('Save changes tries the list again.'), w);
        assert.ok(!/reload/i.test(w), 'the owed move is sent by Save changes — never Reload (R16b)');
    }
    assert.ok(TEAM_MOVE_CHANGED.includes('it now shows the latest') && !TEAM_MOVE_CHANGED_UNREAD.includes('now shows the latest'), 'only what was read is said');
});

test('S3 — putSettings: no tokens named, no ifRevs (Q6); named, one per key; a stale refusal throws .stale with the server\'s words — never after a switch', async () => {
    const { putSettings } = await import('../src/Tabs/settings/shared/saveSettings.js');
    const { STALE_ERROR } = await import('../src/utils/settingsRevs.js');
    const STALE = { error: STALE_ERROR, code: 'stale', stale: ['teams'] };
    await withServer(async ({ sent, queue, setRequestOrg }) => {
        queue.push({ status: 200, body: { success: true, revs: { teams: 'T1' } } });
        assert.deepEqual(await putSettings({ teams: [] }), { success: true, revs: { teams: 'T1' } }, 'the answer whole');
        assert.deepEqual([sent[0].url, sent[0].method], ['/.netlify/functions/settings', 'PUT']);
        assert.deepEqual(sent[0].body, { teams: [] }, 'REGRESSION (Q6): a panel B-3 has not converted names tokens — refused for every key that has one');

        queue.push({ status: 200, body: {} });
        await putSettings({ teams: [], integrationRequests: {} }, { teams: 'x', spiffs: 'y' });
        assert.deepEqual(sent[1].body.ifRevs, { teams: 'x' }, 'one per key a token covers');
        for (const revs of [null, {}, { teams: 7 }]) {
            queue.push({ status: 200, body: {} });
            await putSettings({ teams: [] }, revs);
            assert.deepEqual(sent.at(-1).body.ifRevs, { teams: null }, `${JSON.stringify(revs)}: checked, the token none`);
        }

        queue.push({ status: 409, body: STALE });
        const stale = await outcome(putSettings({ teams: [] }, { teams: 'old' }));
        assert.equal(stale.e?.message, STALE_ERROR, 'the server\'s words, unchanged');
        assert.deepEqual(stale.e?.stale, ['teams'], 'REGRESSION: the refusal lost the keys that moved — the screen cannot know to take the latest');
        queue.push({ status: 409, body: { error: 'Invitation pending.', code: 'invitation' } });
        const other = await outcome(putSettings({ teams: [] }, { teams: 'old' }));
        assert.equal(other.e?.message, 'Invitation pending.');
        assert.equal(other.e?.stale, undefined, 'another 409 is no stale refusal');

        // A stale refusal across a switch — at the send, and while its body is read: it never settles.
        let h = held(); queue.push(h.answer);
        let pr = putSettings({ teams: [] }, { teams: 'old' });
        await until(() => h.release);
        setRequestOrg('org_B'); h.release(409, STALE);
        assert.equal(await outcome(pr), PENDING);
        setRequestOrg('org_A');
        h = held(); queue.push(h.answer);
        pr = putSettings({ teams: [] }, { teams: 'old' });
        await until(() => h.slow);
        h.slow(false, 409, STALE);
        await until(() => h.body);
        setRequestOrg('org_B'); h.body();
        assert.equal(await outcome(pr), PENDING, 'REGRESSION: a stale refusal read across a switch thrown on the new org\'s screen');
    });
});

test('S3 — writeSettings never throws: lands with its tokens; stale with the keys; a refusal in dbWrite\'s words; the network; never settles after a switch', async () => {
    const { writeSettings } = await import('../src/Tabs/settings/shared/saveSettings.js');
    const { STALE_ERROR } = await import('../src/utils/settingsRevs.js');
    const { NETWORK_ERROR } = await import('../src/utils/storage.js');
    await withServer(async ({ sent, queue, setRequestOrg }) => {
        const send = () => writeSettings({ teams: [] }, { teams: 'T1' });
        queue.push({ status: 200, body: { success: true, revs: { teams: 'T2', junk: 7 } } });
        assert.deepEqual(await send(), { ok: true, status: 200, error: null, data: { success: true, revs: { teams: 'T2', junk: 7 } }, revs: { teams: 'T2' } },
            'REGRESSION: a landed save answers no tokens — the screen\'s next save is refused');
        assert.deepEqual(sent[0].body, { teams: [], ifRevs: { teams: 'T1' } });
        queue.push({ status: 409, body: { error: STALE_ERROR, code: 'stale', stale: ['teams'] } });
        assert.deepEqual(await send(), { ok: false, status: 409, error: STALE_ERROR, stale: ['teams'] }, 'REGRESSION: a stale refusal not told apart');
        queue.push({ status: 500 });
        assert.deepEqual(await send(), { ok: false, status: 500, error: 'The server returned 500.' }, 'no stale on another refusal');
        queue.push({ status: 404, body: { error: 'Not in your org.', requestId: 'r1' } });
        assert.deepEqual(await send(), { ok: false, status: 404, error: 'Not in your org. (ref r1)' }, 'dbWrite\'s words');
        queue.push({ status: 403, body: { error: 'Forbidden' } });
        assert.equal((await send()).error, 'You do not have permission to make this change.');
        queue.push(new Error('offline'));
        assert.deepEqual(await send(), { ok: false, status: 0, error: NETWORK_ERROR }, 'REGRESSION: a network failure thrown');
        // A switch at the send, at the body read, or while the network fails: it never settles.
        for (const at of ['send', 'body', 'network']) {
            setRequestOrg('org_A');
            const h = held(); queue.push(h.answer);
            const pr = send();
            await until(() => h.release);
            if (at === 'send') { setRequestOrg('org_B'); h.release(200, { revs: { teams: 'T9' } }); }
            if (at === 'network') { setRequestOrg('org_B'); h.fail(); }
            if (at === 'body') { h.slow(true, 200, { revs: { teams: 'T9' } }); await until(() => h.body); setRequestOrg('org_B'); h.body(); }
            assert.equal(await outcome(pr), PENDING, `${at}: REGRESSION — the last org's answer handed to the new org's screen`);
        }
    });
});

test('S3 — takeLatestSettings: one read; the values and their tokens as one set (a token the read lacks is gone), the roster kept; nothing set when it fails or after a switch', async () => {
    const { takeLatestSettings } = await import('../src/Tabs/settings/shared/saveSettings.js');
    await withServer(async ({ sent, queue, setRequestOrg }) => {
        const roster = [{ id: 'usr_a' }];
        let state = { teams: [{ id: 'old' }], users: roster, revs: { teams: 'T0', spiffs: 'S0' } };
        let sets = 0;
        const setSettings = (f) => { sets += 1; state = f(state); };
        const latest = { teams: [{ id: 'new' }], users: [{ id: 'NOT_THE_ROSTER' }], revs: { teams: 'TL' } };
        queue.push({ status: 200, body: { settings: latest } });
        assert.deepEqual(await takeLatestSettings(setSettings), latest, 'answers the latest settings');
        assert.deepEqual(sent.map((s) => [s.url, s.method]), [['/.netlify/functions/settings', 'GET']], 'one read');
        assert.deepEqual(state.teams, [{ id: 'new' }]);
        assert.deepEqual(state.revs, { teams: 'TL' }, 'REGRESSION: an old token kept beside the latest values — spiffs\' stale draft would pass');
        assert.equal(state.users, roster, 'the roster as loaded, never the read\'s');
        assert.ok(Array.isArray(state.taskTypes) && state.taskTypes.length, 'the defaults under it, as the load builds it');
        for (const a of [{ status: 500, body: { error: 'x' } }, { status: 200, body: { settings: null } }, new Error('offline')]) {
            queue.push(a);
            assert.equal(await takeLatestSettings(setSettings), null, 'unread: null');
        }
        assert.equal(sets, 1, 'a read that failed sets nothing');
        for (const at of ['send', 'body']) {
            setRequestOrg('org_A');
            const h = held(); queue.push(h.answer);
            const pr = takeLatestSettings(setSettings);
            await until(() => h.release);
            if (at === 'send') { setRequestOrg('org_B'); h.release(200, { settings: latest }); }
            else { h.slow(true, 200, { settings: latest }); await until(() => h.body); setRequestOrg('org_B'); h.body(); }
            assert.equal(await outcome(pr), PENDING, at);
            assert.equal(sets, 1, `${at}: REGRESSION — the last org's settings set on the new org's screen`);
        }
    });
});

test('S3 — addToSettingsList (Q5): lands; refused as stale, made again on the latest list with its token; already there; twice; unread; a 404 never again; never settles after a switch', async () => {
    const { addToSettingsList } = await import('../src/Tabs/settings/shared/saveSettings.js');
    const { STALE_ERROR } = await import('../src/utils/settingsRevs.js');
    const EAST = { id: 'team_east', name: 'East', repIds: ['usr_a'] };
    const EAST_WITH = { ...EAST, repIds: ['usr_a', 'usr_n'] };
    const THEIRS = { id: 'team_theirs', name: 'Theirs', repIds: [] };
    const ROSTER = [{ id: 'usr_a' }, { id: 'usr_n' }];
    const STALE = { status: 409, body: { error: STALE_ERROR, code: 'stale', stale: ['teams'] } };
    const latestOf = (teams, token) => ({ status: 200, body: { settings: { teams, revs: { teams: token } } } });
    await withServer(async ({ sent, queue, setRequestOrg }) => {
        let state;
        const setSettings = (f) => { state = f(state); };
        const begin = () => { state = { teams: [EAST], users: ROSTER, revs: { teams: 'T0', spiffs: 'S0' } }; sent.length = 0; };
        const add = () => addToSettingsList('teams', (l) => teamsWithMembers(l, [{ id: 'usr_n', teamId: 'team_east' }]),
            { list: state.teams, rev: state.revs?.teams ?? null, setSettings });

        begin();
        queue.push({ status: 200, body: { success: true, revs: { teams: 'T1' } } });
        assert.deepEqual(await add(), { ok: true });
        assert.deepEqual(sent.map((s) => s.body), [{ teams: [EAST_WITH], ifRevs: { teams: 'T0' } }]);
        assert.deepEqual(state.teams, [EAST_WITH]);
        assert.deepEqual(state.revs, { teams: 'T1', spiffs: 'S0' }, 'REGRESSION: the landed list without its token, or the held tokens replaced whole');

        begin();
        queue.push(STALE, latestOf([EAST, THEIRS], 'TL'), { status: 200, body: { success: true, revs: { teams: 'T2' } } });
        assert.deepEqual(await add(), { ok: true }, 'REGRESSION: a stale refusal not made again (Q5)');
        assert.deepEqual(sent.map((s) => s.method), ['PUT', 'GET', 'PUT'], 'refused, the latest read, made again');
        assert.deepEqual(sent[2].body.teams, [EAST_WITH, THEIRS], 'REGRESSION: made again on the old list — the other tab\'s team taken off');
        assert.deepEqual(sent[2].body.ifRevs, { teams: 'TL' }, 'REGRESSION: made again with the old token — refused again');
        assert.deepEqual(state.teams, [EAST_WITH, THEIRS]);
        assert.deepEqual(state.revs, { teams: 'T2' }, 'the latest\'s tokens, the one this save answered set over them');
        assert.equal(state.users, ROSTER, 'the roster kept');

        begin();
        queue.push(STALE, latestOf([EAST_WITH], 'TL'));
        assert.deepEqual(await add(), { ok: true, already: true }, 'the latest lists them already');
        assert.deepEqual(sent.map((s) => s.method), ['PUT', 'GET'], 'one send');

        begin();
        queue.push(STALE, latestOf([EAST, THEIRS], 'TL'), STALE, latestOf([EAST], 'TL2'));
        assert.deepEqual(await add(), { ok: false, status: 409, stale: true, twice: true }, 'REGRESSION: a second refusal not said (J-B6)');
        assert.deepEqual(sent.map((s) => s.method), ['PUT', 'GET', 'PUT', 'GET']);
        assert.deepEqual([state.teams, state.revs], [[EAST], { teams: 'TL2' }], 'the latest on screen');

        begin();
        queue.push(STALE, { status: 500, body: { error: 'x' } });
        assert.deepEqual(await add(), { ok: false, status: 409, error: STALE_ERROR, stale: ['teams'] }, 'the latest unread: the refusal');

        begin();
        queue.push({ status: 404, body: { error: 'That member is not in your organization.' } });
        assert.deepEqual(await add(), { ok: false, status: 404, error: 'That member is not in your organization.' });
        assert.equal(sent.length, 1, 'REGRESSION: a refusal that is not stale tried again');

        // A switch at each request — the first send, the read of the latest, the second send: it never settles, and
        // sets nothing after the switch.
        for (const at of [0, 1, 2]) {
            setRequestOrg('org_A'); begin();
            const h = held();
            queue.push(...[STALE, latestOf([EAST, THEIRS], 'TL')].slice(0, at), h.answer);
            const pr = add();
            await until(() => h.release);
            const before = state;
            setRequestOrg('org_B'); h.release(200, at === 1 ? { settings: { teams: [THEIRS], revs: { teams: 'TX' } } } : { success: true, revs: { teams: 'TX' } });
            assert.equal(await outcome(pr), PENDING, `request ${at}`);
            assert.equal(state, before, `request ${at}: nothing set after the switch`);
        }
    });
});

// ── S4 ───────────────────────────────────────────────────────────────────────

test('S4 — every stale refusal takes the latest through the one helper; the invite and the import read `twice`; the helper reads once and checks the org first', () => {
    const faults = B2_FILES.flatMap((f) => refusalFaults(f, read(f)));
    assert.deepEqual(faults, []);
    const sender = withoutComments(read(SENDER));
    const fnText = (name) => {
        let out = null;
        walk(astOf(sender).program, (n) => { if (n.type === 'FunctionDeclaration' && n.id?.name === name) out = sender.slice(n.start, n.end); });
        assert.ok(out, `${name} not found in the sender`);
        return out;
    };
    const take = fnText('takeLatestSettings');
    assert.equal(count(take, 'dbFetch('), 1, 'one read');
    assert.ok(take.includes('dbFetch(SETTINGS_URL)'), 'a GET of the settings');
    const check = take.indexOf('if (!stillOrg(askedOrg)) return stopped();');
    assert.ok(check >= 0 && check < take.indexOf('setSettings('), 'REGRESSION: the last org\'s settings set before the org is checked');
    const add = fnText('addToSettingsList');
    assert.equal(count(add, 'takeLatestSettings('), 1, 'the addition takes the latest through the one helper');
    for (const name of ['putSettings', 'writeSettings']) assert.ok(fnText(name).includes('withIfRevs(payload, revs)'), `${name} sends what withIfRevs builds`);
});

// ── S5 ───────────────────────────────────────────────────────────────────────

test('S5 — every save that lands merges the tokens it answered, by revsAfter; the Deletes and Assign merge before any member row goes out', () => {
    const faults = [...B2_FILES, SENDER].flatMap((f) => updaterFaults(f, read(f)));
    assert.deepEqual(faults, []);
    for (const [f, component, handler] of [
        ['src/Tabs/settings/people/TeamsDetail.jsx', 'TeamsDetail', 'handleDelete'],
        ['src/Tabs/settings/people/TerritoriesDetail.jsx', 'TerritoriesDetail', 'handleDelete'],
        ['src/Tabs/settings/people/TeamsDetail.jsx', 'TeamsDetail', 'assignTo'],
    ]) {
        const h = handlerIn(withoutComments(read(f)), component, handler);
        const merge = h.indexOf('revsAfter('), member = h.indexOf("dbWrite('/.netlify/functions/users'");
        assert.ok(merge >= 0 && member > merge, `${component} ${handler}: REGRESSION — the landed list and its token reach the copy only after the members; a member save that fails leaves the old token behind`);
    }
});

// ── S6 / S7 — the handlers, run as written ───────────────────────────────────

// A handler's requests, answered by function name (settings, users) in writeSettings' and dbWrite's shape; today's
// handlers sent their list through dbFetch, kept so old code fails on what it sends, not on a missing name.
const requests = (answers, fallback) => {
    const calls = [];
    const ask = (to, body) => { calls.push({ to, body }); return (answers[to] || fallback[to])(body); };
    return {
        calls,
        dbFetch: async (url, opts) => { const a = ask(url.split('/').pop(), JSON.parse(opts.body)); return { ok: a.ok, status: a.status, json: async () => a.data ?? { error: a.error } }; },
        dbWrite: async (url, opts) => ask(url.split('/').pop(), JSON.parse(opts.body)),
        writeSettings: async (payload, revs) => ask('settings', { ...payload, ifRevs: revs }),
    };
};
const runAs = (fnSrc, scope, ...args) => {
    const names = Object.keys(scope);
    return new Function(...names, `return (${fnSrc});`)(...names.map((n) => scope[n]))(...args);
};
const STALE_ANSWER = async (key) => {
    const { STALE_ERROR } = await import('../src/utils/settingsRevs.js');
    return () => ({ ok: false, status: 409, error: STALE_ERROR, stale: [key] });
};

const NORTH = { id: 'terr_n', name: 'North', parent: '', rule: 'NAM', ownerId: '', repIds: ['usr_a'] };
const SOUTH = { id: 'terr_s', name: 'South', parent: '', rule: '', ownerId: '', repIds: [] };
const THEIRS_T = { id: 'terr_t', name: 'Theirs', parent: '', rule: '', ownerId: '', repIds: [] };
const TERR_USERS = [{ id: 'usr_a', name: 'Ann', territory: 'North' }, { id: 'usr_x', territory: 'North' }, { id: 'usr_b', name: 'Bo', territory: '' }];
const TERR_LATEST = { territories: [NORTH, SOUTH, THEIRS_T], revs: { territories: 'TL' } };

const runTerritorySave = async ({ mode, territory = null, form = {}, base = null, answers = {}, latest = null }) => {
    const { revsAfter, listChanged } = await import('../src/utils/settingsRevs.js');
    const save = handlerIn(read('src/Tabs/settings/people/TerritoriesDetail.jsx'), 'TerritoryModal', 'save');
    const said = [], stale = [];
    const state = { settings: { territories: [NORTH, SOUTH], users: TERR_USERS, revs: { territories: 'NEWER', teams: 'TM' } }, base: null, closed: false, taken: 0 };
    const opened = base || { list: state.settings.territories, rev: 'OPENED' };
    const r = requests(answers, {
        settings: () => ({ ok: true, status: 200, error: null, data: { success: true }, revs: { territories: 'T2' } }),
        users: (body) => ({ ok: true, status: 200, error: null, data: { user: { ...TERR_USERS.find((u) => u.id === body.id), ...body, answered: true } } }),
    });
    await runAs(save, {
        mode, territory,
        name: form.name ?? territory?.name ?? '', parent: form.parent ?? territory?.parent ?? '', rule: form.rule ?? territory?.rule ?? '',
        ownerId: form.ownerId ?? territory?.ownerId ?? '', repIds: form.repIds ?? territory?.repIds ?? [],
        settings: state.settings, allUsers: TERR_USERS.filter((u) => u.name),
        base: opened, territories: opened.list, setBase: (b) => { state.base = b; },
        requestOrg: () => 'org_A', stillOrg: (o) => o === 'org_A',
        dbFetch: r.dbFetch, dbWrite: r.dbWrite, writeSettings: r.writeSettings,
        takeLatestSettings: async (set) => {
            state.taken += 1;
            if (!latest) return null;
            set((prev) => ({ ...prev, territories: latest.territories, revs: latest.revs }));
            return latest;
        },
        revsAfter, listChanged,
        setErr: (v) => said.push(v), setSaving: () => {},
        setSettings: (f) => { state.settings = f(state.settings); },
        onStale: (w) => stale.push(w), onClose: () => { state.closed = true; },
        Date,
    });
    return { calls: r.calls, said: said.filter(Boolean), stale, state };
};

test('S6 — TerritoryModal\'s save, run as written: the token it opened with; lands, merging its tokens, the roster kept whole (JB2-7)', async () => {
    const r = await runTerritorySave({ mode: 'edit', territory: NORTH, form: { name: 'North 2' } });
    assert.deepEqual(r.calls.map((c) => c.to), ['settings', 'users']);
    assert.deepEqual(r.calls[0].body.ifRevs, { territories: 'OPENED' }, 'REGRESSION: the window sends no token, or a newer copy\'s (NEWER)');
    assert.deepEqual(r.calls[1].body, { id: 'usr_a', territory: 'North 2' });
    assert.deepEqual(r.state.base, { list: r.calls[0].body.territories, rev: 'T2' }, 'the window holds the list it landed, with its token');
    assert.deepEqual(r.state.settings.revs, { territories: 'T2', teams: 'TM' }, 'REGRESSION: the landed list without its token');
    assert.deepEqual(r.state.settings.users.map((u) => u.id), ['usr_a', 'usr_x', 'usr_b'], 'REGRESSION (JB2-7): a member with no name dropped from the roster');
    assert.equal(r.state.settings.users[0].answered, true, 'the row as the server answered it');
    assert.equal(r.state.closed, true);
    assert.deepEqual(r.said, []);
});

test('S6 — TerritoryModal\'s save, run as written: stale, an edit closes with the words on the page; a new territory stays open on the latest, its next Save that list\'s', async () => {
    const { listChanged, STALE_ERROR } = await import('../src/utils/settingsRevs.js');
    const answers = { settings: await STALE_ANSWER('territories') };
    for (const [mode, form] of [['edit', { name: 'North 2' }], ['rule', { rule: 'EMEA' }], ['owner', { ownerId: 'usr_b' }], ['reps', { repIds: ['usr_a', 'usr_b'] }]]) {
        const r = await runTerritorySave({ mode, territory: NORTH, form, answers, latest: TERR_LATEST });
        assert.deepEqual(r.calls.map((c) => c.to), ['settings'], `${mode}: REGRESSION — a member row sent after a refused list`);
        assert.equal(r.state.taken, 1, `${mode}: REGRESSION — the latest not taken`);
        assert.deepEqual(r.stale, [listChanged('territory')], `${mode}: the words on the page`);
        assert.equal(r.state.closed, true, `${mode}: REGRESSION (J-B8) — an edit refused as stale stays open on a list that is gone`);
        assert.deepEqual(r.said, []);
        assert.deepEqual(r.state.settings.territories, TERR_LATEST.territories, 'the latest on the page');
    }
    const blind = await runTerritorySave({ mode: 'edit', territory: NORTH, form: { name: 'North 2' }, answers });
    assert.deepEqual([blind.stale, blind.state.closed], [[STALE_ERROR], true], 'the latest unread: the server\'s words');

    const fresh = await runTerritorySave({ mode: 'new', form: { name: 'East' }, answers, latest: TERR_LATEST });
    assert.equal(fresh.state.closed, false, 'REGRESSION (J-B8): a new territory refused as stale is lost with its window');
    assert.deepEqual(fresh.stale, []);
    assert.deepEqual(fresh.said, [listChanged('territory')]);
    assert.deepEqual(fresh.state.base, { list: TERR_LATEST.territories, rev: 'TL' }, 'REGRESSION: the window keeps the old list and token — its next Save refused again');
    const again = await runTerritorySave({ mode: 'new', form: { name: 'East' }, base: fresh.state.base });
    assert.deepEqual(again.calls[0].body.ifRevs, { territories: 'TL' });
    assert.deepEqual(again.calls[0].body.territories.map((t) => t.name), ['North', 'South', 'Theirs', 'East'], 'on the latest list');
    assert.equal(again.state.closed, true);
    const unread = await runTerritorySave({ mode: 'new', form: { name: 'East' }, answers });
    assert.deepEqual([unread.said, unread.state.base, unread.state.closed], [[STALE_ERROR], null, false]);
});

test('S6 — TerritoryModal\'s save, run as written: a refusal sends no member row; a member that fails after the list landed keeps the token and the window', async () => {
    const refused = await runTerritorySave({ mode: 'reps', territory: NORTH, form: { repIds: ['usr_a', 'usr_b'] },
        answers: { settings: () => ({ ok: false, status: 404, error: 'Not in your organization.' }) } });
    assert.deepEqual(refused.calls.map((c) => c.to), ['settings']);
    assert.deepEqual(refused.said, ['Not in your organization.']);
    assert.deepEqual([refused.state.base, refused.state.closed, refused.state.settings.revs.territories], [null, false, 'NEWER']);

    const r = await runTerritorySave({ mode: 'reps', territory: NORTH, form: { repIds: ['usr_a', 'usr_b'] },
        answers: { users: () => ({ ok: false, status: 404, error: 'gone' }) } });
    assert.deepEqual(r.calls.map((c) => [c.to, c.body.id]), [['settings', undefined], ['users', 'usr_b']]);
    assert.deepEqual(r.said, ['Territory saved, but 1 user record(s) did not update: Bo: gone']);
    assert.equal(r.state.settings.revs.territories, 'T2', 'REGRESSION: the landed list without its token — the next save refused');
    assert.equal(r.state.base.rev, 'T2', 'REGRESSION: Save again sends the token the window opened with — refused against its own save');
    assert.deepEqual(r.state.settings.territories[0].repIds, ['usr_a', 'usr_b']);
    assert.equal(r.state.closed, false, 'stays open so the message is read');
});

const EAST_TEAM = { id: 'team_east', name: 'East', territory: 'NAM', vertical: '', repIds: ['usr_b'] };
const WEST_TEAM = { id: 'team_west', name: 'West', territory: '', vertical: 'Health', repIds: [] };
const ANN = { id: 'usr_a', name: 'Ann', team: '', teamId: '' };
const TEAM_USERS = [ANN, { id: 'usr_b', name: 'Bo', team: 'East', teamId: 'team_east' }, { id: 'usr_x', team: '', teamId: '' }];
const TEAMS_START = { teams: [EAST_TEAM, WEST_TEAM], users: TEAM_USERS, revs: { teams: 'T1', spiffs: 'S1' } };

const runAssign = async ({ settings, to, user = ANN, assigning = false, answers = {}, latest = null }) => {
    const { revsAfter, listChanged } = await import('../src/utils/settingsRevs.js');
    const assignTo = handlerIn(read('src/Tabs/settings/people/TeamsDetail.jsx'), 'TeamsDetail', 'assignTo');
    const said = [], state = { settings, taken: 0, open: true, busy: [], heldAtMember: [] };
    const r = requests(answers, {
        settings: () => ({ ok: true, status: 200, error: null, data: { success: true }, revs: { teams: 'T2' } }),
        users: (body) => ({ ok: true, status: 200, error: null, data: { user: { ...TEAM_USERS.find((u) => u.id === body.id), ...body, answered: true } } }),
    });
    await runAs(assignTo, {
        assigning, assigningUser: user, teams: settings.teams || [], settings,
        allUsers: (settings.users || []).filter((u) => u.name),
        requestOrg: () => 'org_A', stillOrg: (o) => o === 'org_A',
        dbFetch: r.dbFetch, writeSettings: r.writeSettings,
        dbWrite: (url, opts) => { state.heldAtMember.push(state.settings.revs?.teams); return r.dbWrite(url, opts); },
        takeLatestSettings: async (set) => {
            state.taken += 1;
            if (!latest) return null;
            set((prev) => ({ ...prev, teams: latest.teams, revs: latest.revs }));
            return latest;
        },
        teamsWithMemberOn, revsAfter, listChanged,
        setAssignErr: (v) => said.push(v), setAssigning: (v) => state.busy.push(v),
        setAssigningUser: (v) => { if (v === null) state.open = false; },
        setSettings: (f) => { state.settings = f(state.settings); },
    }, to);
    return { calls: r.calls, said: said.filter(Boolean), state };
};

test('S7 — Assign, run as written: the render\'s token; the landed list and its token merged before the member\'s save; the roster kept whole, the member as answered', async () => {
    const r = await runAssign({ settings: TEAMS_START, to: WEST_TEAM });
    assert.deepEqual(r.calls.map((c) => c.to), ['settings', 'users']);
    assert.deepEqual(r.calls[0].body.ifRevs, { teams: 'T1' }, 'REGRESSION: the list sent with no token');
    assert.deepEqual(r.calls[0].body.teams.map((t) => [t.id, t.repIds]), [['team_east', ['usr_b']], ['team_west', ['usr_a']]]);
    assert.deepEqual(r.calls[1].body, { id: 'usr_a', team: 'West', teamId: 'team_west', territory: '', vertical: 'Health' });
    assert.deepEqual(r.state.heldAtMember, ['T2'], 'REGRESSION: the member\'s save goes out before the landed list\'s token is held');
    assert.deepEqual(r.state.settings.revs, { teams: 'T2', spiffs: 'S1' });
    assert.deepEqual(r.state.settings.users.map((u) => u.id), ['usr_a', 'usr_b', 'usr_x'], 'REGRESSION (JB2-7): a member with no name dropped from the roster');
    assert.equal(r.state.settings.users[0].answered, true, 'the row as the server answered it');
    assert.equal(r.state.open, false, 'the window closes');
    assert.deepEqual(r.said, []);
    assert.deepEqual(r.state.busy, [true, false], 'the buttons wait for the answer, and are freed');

    const bare = await runAssign({ settings: TEAMS_START, to: WEST_TEAM, answers: { users: () => ({ ok: true, status: 200, error: null, data: {} }) } });
    const ann = bare.state.settings.users[0];
    assert.deepEqual([ann.team, ann.teamId, ann.territory, ann.vertical], ['West', 'team_west', '', 'Health'], 'no row answered: the team as sent');

    const busy = await runAssign({ settings: TEAMS_START, to: WEST_TEAM, assigning: true });
    assert.deepEqual([busy.calls, busy.said, busy.state.busy], [[], [], []], 'REGRESSION: a second click while one is out sends the same token again');
});

test('S7 — Assign, run as written: stale, the latest taken and said, no member save, the window open; a member save that fails keeps the merged token', async () => {
    const { listChanged, STALE_ERROR } = await import('../src/utils/settingsRevs.js');
    const answers = { settings: await STALE_ANSWER('teams') };
    const latest = { teams: [EAST_TEAM, WEST_TEAM, { id: 'team_new', name: 'New', repIds: [] }], revs: { teams: 'TL' } };
    const r = await runAssign({ settings: TEAMS_START, to: WEST_TEAM, answers, latest });
    assert.deepEqual(r.calls.map((c) => c.to), ['settings'], 'REGRESSION: the member saved onto a team the list refused');
    assert.equal(r.state.taken, 1, 'REGRESSION: the latest not taken');
    assert.deepEqual(r.said, [listChanged('team')]);
    assert.equal(r.state.open, true, 'the window stays open, drawn from the latest (JB2-5)');
    assert.deepEqual(r.state.settings.teams, latest.teams);
    assert.deepEqual(r.state.busy, [true, false]);
    const blind = await runAssign({ settings: TEAMS_START, to: WEST_TEAM, answers });
    assert.deepEqual(blind.said, [`Not assigned — ${STALE_ERROR}`], 'the latest unread: the refusal');

    const failed = await runAssign({ settings: TEAMS_START, to: WEST_TEAM, answers: { users: () => ({ ok: false, status: 404, error: 'gone' }) } });
    assert.deepEqual(failed.said, ['Team updated, but Ann was not — gone']);
    assert.equal(failed.state.settings.revs.teams, 'T2', 'REGRESSION: the landed list\'s token lost with the member\'s save — the next teams save refused');
    assert.deepEqual(failed.state.settings.teams[1].repIds, ['usr_a'], 'the list as landed');
    assert.equal(failed.state.open, true);
});

test('S7 — Assign, run as written (JB2-8): the member\'s save refused, the same team again, then another — the member is listed once, on one team', async () => {
    let s = TEAMS_START;
    const one = await runAssign({ settings: s, to: EAST_TEAM, answers: { users: () => ({ ok: false, status: 404, error: 'gone' }) } });
    s = one.state.settings;
    assert.deepEqual(s.teams[0].repIds, ['usr_b', 'usr_a'], 'the list landed');
    const two = await runAssign({ settings: s, to: s.teams[0] });
    s = two.state.settings;
    assert.deepEqual(two.calls.map((c) => c.to), ['users'], 'REGRESSION: the list already holds them — sent again, listing them twice');
    const three = await runAssign({ settings: s, to: s.teams[1], user: s.users.find((u) => u.id === 'usr_a') });
    s = three.state.settings;
    assert.deepEqual(three.calls[0].body.ifRevs, { teams: 'T2' }, 'the token the first click merged');
    const holding = s.teams.flatMap((t) => (t.repIds || []).filter((id) => id === 'usr_a').map(() => t.id));
    assert.deepEqual(holding, ['team_west'], 'REGRESSION (JB2-8): the member listed twice, or on two teams');
});

// ── S8 — the scanners' own reading ───────────────────────────────────────────

test('S8 — the scanners see what they are for, on made-up sources', () => {
    assert.equal(urlCount("// '/.netlify/functions/settings'\nconst a = '/.netlify/functions/settings';\n/* '/.netlify/functions/settings' */\nconst b = '/.netlify/functions/settings-x';\nconst c = <div>{/* '/.netlify/functions/settings' */}</div>;\n"), 1,
        'a string counts; a comment, a JSX comment and another function do not');
    const sends = (body) => sendFaults('src/made.jsx', `const C = ({ settings, setSettings }) => { const base = {}; const ref = {}; ${body} };`).out.length;
    assert.equal(sends('const f = async () => { await writeSettings({ teams: t }, { teams: settings.revs?.teams ?? null }); };'), 0, 'the render\'s token');
    assert.equal(sends('const f = async () => { const tr = settings.revs?.teams ?? null; await putSettings({ teams: t }, { teams: tr }); };'), 0, 'a const set from it');
    assert.equal(sends('const tr = settings.revs?.teams ?? null; const f = () => { x.onchange = async () => { await writeSettings({ teams: t }, { teams: tr }); }; };'), 0, 'in a function further out');
    assert.equal(sends('const f = async () => { await writeSettings({ teams: t }, { teams: base.rev }); };'), 0, 'a window\'s snapshot');
    assert.equal(sends("const f = async () => { await addToSettingsList('teams', g, { list: settings.teams, rev: settings.revs?.teams ?? null, setSettings }); };"), 0);
    for (const bad of [
        'const f = async () => { await putSettings({ teams: t }); };',
        'const f = async () => { await putSettings({ teams: t }, {}); };',
        'const f = async () => { await putSettings({ teams: t }, null); };',
        'const f = async () => { await writeSettings({ teams: t }, { teams: ref.current }); };',
        'const f = async () => { await writeSettings({ teams: t }, { teams: settings.revs?.territories ?? null }); };',
        'const f = async () => { await writeSettings({ teams: t }, { teams: w.revs.teams }); };',
        'const f = async () => { await writeSettings({ teams: t, territories: u }, { teams: base.rev }); };',
        'const f = async () => { let tr = settings.revs.teams; await writeSettings({ teams: t }, { teams: tr }); };',
        'const f = () => setSettings(prev => { writeSettings({ teams: t }, { teams: prev.revs.teams }); return prev; });',
        "const f = async () => { await addToSettingsList('teams', g, { list: settings.teams, rev: latest.revs?.teams ?? null, setSettings }); };",
        "const f = async () => { await addToSettingsList('teams', g, { list: settings.teams, rev: settings.revs?.teams ?? null }); };",
    ]) assert.ok(sends(bad) > 0, `not seen: ${bad}`);

    const refusals = (body) => refusalFaults('src/made.jsx', body).length;
    assert.equal(refusals('const f = async () => { try { await putSettings({}, {}); } catch (e) { if (e.stale) await takeLatestSettings(s); } };'), 0);
    assert.equal(refusals('const f = async () => { const w = await writeSettings({}, {}); if (w.stale) await takeLatestSettings(s); };'), 0);
    assert.equal(refusals("const f = async () => { const a = await addToSettingsList('teams', g, {}); if (a.twice) x(); };"), 0);
    for (const bad of [
        'const f = async () => { try { await putSettings({}, {}); } catch (e) { say(e.message); } };',
        'const f = async () => { await putSettings({}, {}); };',
        'const f = async () => { try { await putSettings({}, {}); } finally { done(); } };',
        'const f = async () => { const w = await writeSettings({}, {}); if (!w.ok) say(w.error); };',
        "const f = async () => { const a = await addToSettingsList('teams', g, {}); if (!a.ok) x(); };",
        "const f = async () => { const a = await addToSettingsList('teams', g, {}); if (a.twice) await takeLatestSettings(s); };",
    ]) assert.ok(refusals(bad) > 0, `not seen: ${bad}`);

    const updaters = (body) => updaterFaults('src/made.jsx', body).length;
    assert.equal(updaters('setSettings(prev => ({ ...prev, teams: t, revs: revsAfter(prev.revs, w.revs) }));'), 0);
    assert.equal(updaters('setSettings(prev => ({ ...prev, ...(x ? { teams: t, revs: revsAfter(prev.revs, r) } : {}) }));'), 0, 'a conditional spread');
    assert.equal(updaters('setSettings(prev => settingsAfterRemoval(prev, id, r));'), 0, 'the removal\'s own');
    assert.equal(updaters('setSettings(prev => ({ ...prev, users: [] }));'), 0);
    for (const bad of [
        'setSettings(prev => ({ ...prev, teams: t }));',
        'setSettings(prev => ({ ...prev, territories: t, revs: w.revs }));',
        'setSettings(prev => ({ ...prev, teams: t, revs: { ...prev.revs, ...w.revs } }));',
        'setSettings(p => ({ ...p, [key]: t }));',
        '_setSettings(prev => ({ ...prev, teams: t, revs: revsAfter(null, w.revs) }));',
    ]) assert.ok(updaters(bad) > 0, `not seen: ${bad}`);
});

test('S8 — the suites list holds this file: the harness grades it', () => {
    const suites = read('scripts/mutate-import.mjs').match(/^const SUITES = '([^'\n]*)';$/m)?.[1].split(' ') ?? [];
    assert.ok(suites.includes('tests/settings-saves.test.mjs'), 'SUITES runs this file');
});
