// The engine of tests/gate-matrix.test.mjs (state §0.288): runs the real handlers of netlify/functions with sign-in, the
// database, Clerk and the network faked, and finds each refusal they return. Nothing here touches a database or the
// network. Imported once per process: node --test runs each test file in its own, so these hooks reach no other suite.
//   kept real   every function, _roleGate, _dispatchGate, _lib, _ownership, src/utils/roles.js, drizzle and the schema
//   faked       db/index.js (the import hook's DB), auth.mjs's sign-in (AUTH: the role helpers it hands on are the real
//               ones), @clerk/backend, the file store's client, fetch
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';

export const ROOT = new URL('../../', import.meta.url);
const dataUrl = (code) => 'data:text/javascript,' + encodeURIComponent(code);
const G = globalThis.__gates = { auth: null, ops: [], rows: {} };   // who asks, what was asked of the database, what it answers

// A chain of any drizzle calls, answering the request's rows for the table it names; each statement recorded.
const DB = dataUrl(`
const G = globalThis.__gates;
const nameOf = (t) => t?.[Symbol.for('drizzle:Name')] || '';
// A statement that names its columns is answered those alone, each from the column it names (a SQL expression: its alias).
const keyOf = (c) => (c?.table && c?.name ? Object.keys(c.table).find((k) => c.table[k] === c) : null);
const shaped = (fields, rows) => (!fields ? rows : rows.map((r) => Object.fromEntries(Object.entries(fields).map(([alias, c]) => [alias, r[keyOf(c) || alias]]))));
const chain = (op) => new Proxy(function () {}, { get: (_, k) => {
    const run = () => Promise.resolve().then(() => shaped(op.fields, (typeof G.rows === 'function' ? G.rows(op) : G.rows[op.table]) || []));
    if (k === 'then') return (ok, no) => run().then(ok, no);
    if (k === 'catch') return (no) => run().catch(no);
    if (k === 'finally') return (f) => run().finally(f);
    return (...a) => { if (k === 'from' && !op.table) op.table = nameOf(a[0]); if (k === 'returning' && a[0]) op.fields = a[0]; if (k === 'values' || k === 'set') op.given = a[0]; return chain(op); };
} });
const start = (kind) => (t) => { const op = { kind, table: kind === 'select' ? '' : nameOf(t), fields: kind === 'select' ? t : null }; G.ops.push(op); return chain(op); };
export const db = {
    select: start('select'), selectDistinct: start('select'), insert: start('insert'), update: start('update'), delete: start('delete'),
    execute: async () => { G.ops.push({ kind: 'execute', table: '' }); return { rows: [] }; },
    batch: async (list) => { G.ops.push({ kind: 'batch', table: '' }); return Promise.all(list); },
    transaction: async (f) => { G.ops.push({ kind: 'batch', table: '' }); return f(db); },
    $with: () => ({ as: (x) => x }), with: () => db,
};
`);
const AUTH = dataUrl(`
export { APP_ROLES, isAppRole, isAdmin, isManager, canSeeAll, isReadOnly, isTechnician, isDispatcher } from '${new URL('src/utils/roles.js', ROOT)}';
export { requireWrite, requireRole } from '${new URL('netlify/functions/_roleGate.mjs', ROOT)}';
export const pendingSessionRefusal = () => null;
export const verifyAuth = async () => globalThis.__gates.auth;
`);
const CLERK = dataUrl(`
const G = globalThis.__gates;
const READS = /^(get|list)/;
const call = (path) => new Proxy(function () {}, { get: (_, k) => (k === 'then' ? undefined : call([...path, k])), apply: (_, __, [a]) => {
    const name = String(path.at(-1));
    G.ops.push({ kind: READS.test(name) ? 'clerk-read' : 'clerk', table: name });
    if (name === 'getUser' && G.clerkUser) return Promise.resolve(G.clerkUser);   // who signs in, when a suite names them
    const orgs = name === 'getOrganizationMembershipList' && a?.userId ? (G.clerk || {})[a.userId] || [] : [];
    return Promise.resolve({ data: orgs.map((id) => ({ organization: { id }, role: 'org:member' })), totalCount: orgs.length });
} });
export const createClerkClient = () => call([]);
export const verifyToken = async () => ({});
`);

// The file store: a command sent is a write; a presigned address is made without one.
const S3 = dataUrl(`
const G = globalThis.__gates;
export class S3Client { async send() { G.ops.push({ kind: 'store', table: '' }); return {}; } }
export class PutObjectCommand {} export class GetObjectCommand {} export class DeleteObjectCommand {} export class DeleteObjectsCommand {} export class HeadObjectCommand {} export class CopyObjectCommand {} export class ListObjectsV2Command {}
`);
const SIGNED = dataUrl("export const getSignedUrl = async () => 'https://store.test/signed';");
const cuts = new Map();   // the URL of a copy → the range of its source left out
registerHooks({
    resolve(spec, context, next) {
        if (/(^|\/)db\/index\.js$/.test(spec)) return { url: DB, shortCircuit: true };
        if (/(^|\/)db\/schema\.js$/.test(spec)) return { url: new URL('db/schema.ts', ROOT).href, shortCircuit: true };
        if (spec === './auth.mjs') return { url: AUTH, shortCircuit: true };
        if (spec === '@clerk/backend') return { url: CLERK, shortCircuit: true };
        if (spec === '@aws-sdk/client-s3') return { url: S3, shortCircuit: true };
        if (spec === '@aws-sdk/s3-request-presigner') return { url: SIGNED, shortCircuit: true };
        return next(spec, context);
    },
    load(url, context, next) {
        if (url.endsWith('/db/schema.ts')) return { format: 'module', source: stripTypeScriptTypes(readFileSync(new URL(url), 'utf8')), shortCircuit: true };
        const cut = cuts.get(url);
        if (!cut) return next(url, context);
        const s = readFileSync(fileURLToPath(url.split('?')[0]), 'utf8');
        return { format: 'module', source: s.slice(0, cut[0]) + ';' + s.slice(cut[1]), shortCircuit: true };
    },
});
// No secret or key of the machine's own, and no job switched on: a request names what it needs (`env`).
for (const k of Object.keys(process.env)) if (/SECRET|_KEY|TOKEN|DATABASE|JOBS_|^R2_|GOOGLE|MICROSOFT|RESEND|TWILIO|INBOUND|^URL$|CLERK|ANTHROPIC/.test(k)) delete process.env[k];
process.env.CLERK_SECRET_KEY = 'sk_test_gates';
globalThis.fetch = async () => { G.ops.push({ kind: 'fetch', table: '' }); throw new Error('no network in this test'); };
for (const k of ['log', 'info', 'warn', 'error']) console[k] = () => {};   // each refusal logs its own line

export const TURNED_OFF = 'turned off';
export const ROLES = ['Admin', 'Manager', 'User', 'Dispatcher', 'Technician', 'ReadOnly', 'Nonsense'];
const FN = (f) => new URL(`netlify/functions/${f}.mjs`, ROOT);
export const sourceOf = (f) => readFileSync(FN(f), 'utf8');
export const functionFiles = () => readdirSync(new URL('netlify/functions/', ROOT)).filter((n) => n.endsWith('.mjs') && !n.startsWith('_')).map((n) => n.slice(0, -4)).sort();
export const load = async (f) => (await import(FN(f).href)).handler;
// The function with one statement left out. Everything it imports is the one real copy.
export const loadCut = async (f, range) => {
    const url = `${FN(f).href}?cut=${cuts.size + 1}`;
    cuts.set(url, range);
    return (await import(url)).handler;
};
// _lib.mjs keeps who a caller is, and the org's roster, for 30 s: cleared before each ask, so no request answers another.
const { invalidateRoster } = await import(new URL('netlify/functions/_lib.mjs', ROOT).href);

// What a request that names no rows finds: an org with Dispatch on, and nothing else.
const PLAIN_ROWS = { settings: [{ orgId: 'org_a', extra: { dispatchEnabled: true } }] };
const WRITES = new Set(['insert', 'update', 'delete', 'batch', 'execute', 'store', 'clerk', 'fetch']);   // a file, a send and a Clerk write too
// What a request gives as a function is made as it is asked (a signature's time).
const made = (v) => (typeof v === 'function' ? v() : v);
// One request as one role (null: signed out; TURNED_OFF: refused by sign-in as a deactivated member is): { refused, status, said, wrote, asked } — asked: the statements it made.
export async function ask(handler, f, r, role) {
    invalidateRoster();
    G.ops = [];
    G.rows = r.rows || PLAIN_ROWS;
    G.clerk = r.clerk || {};
    G.auth = role === null ? { error: 'Unauthorized: no token', status: 401 }
        : role === TURNED_OFF ? { error: 'Your access to this organization has been turned off.', status: 403, code: 'deactivated' }
        : { userId: r.userId || 'user_me', orgId: 'org_a', userRole: role, managedReps: [], orgRole: null, error: null };
    const event = { httpMethod: r.method, headers: made(r.headers) || {}, queryStringParameters: made(r.qs) || { id: 'x1' }, path: `/.netlify/functions/${f}`,
        body: r.method === 'GET' ? null : typeof r.body === 'string' ? r.body : JSON.stringify(r.body || { id: 'x1' }) };
    const env = Object.entries(r.env || {}), before = env.map(([k]) => [k, process.env[k]]);
    for (const [k, v] of env) process.env[k] = v;
    let res;
    try { res = await handler(event, {}); } catch (e) { res = { statusCode: 'threw', body: JSON.stringify({ error: e.message }) }; }
    await new Promise((done) => setImmediate(done));   // what a handler leaves running ends before the next ask
    for (const [k, v] of before) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    let body = {};
    try { body = JSON.parse(res.body); } catch { /* a page */ }
    const refused = res?.statusCode === 401 || res?.statusCode === 403;
    // A redirect says why in its Location, some answers in their reason.
    const why = new URL(res?.headers?.Location || 'x:/', 'x:/').searchParams.get('reason') || body?.reason || '';
    return { refused, status: res?.statusCode, said: refused ? body?.error || '' : why, wrote: G.ops.some((o) => WRITES.has(o.kind)), asked: G.ops.length };
}

function walk(n, visit, parents = []) {
    if (!n || typeof n.type !== 'string') return;
    visit(n, parents);
    for (const k of Object.keys(n)) {
        if (k === 'loc' || /Comments$/.test(k)) continue;
        const v = n[k];
        if (Array.isArray(v)) v.forEach((c) => walk(c, visit, [...parents, n]));
        else if (v && typeof v.type === 'string') walk(v, visit, [...parents, n]);
    }
}
// What a refusal looks like where it is returned: a 401 or 403, the answer of a gate held in a name, or sign-in's error.
const REFUSAL = /\b40[13]\b|^(forbidden\w*|denied|adminErr|refusal|refusedNow|notYours|gate\.response)$|auth\.error/;
const GATE_CALL = /\b(require(Role|Write|Admin)|assertOwnership|dispatchGate)\(/;
// Every refusal `src` returns: { line, test, returns, range } — range: the statement whose loss lets the caller by (the
// `if` whose last act is the refusal; else the return itself); null when no `if` stands around it.
export function gatesOf(src) {
    const text = (n) => src.slice(n.start, n.end).replace(/\s+/g, ' ');
    const out = [], held = new Set();   // the names a gate's answer is held in
    const ast = parse(src, { sourceType: 'module' }).program;
    const namesIn = (p) => (!p ? [] : p.type === 'Identifier' ? [p.name] : p.type === 'ObjectPattern' ? p.properties.flatMap((q) => namesIn(q.value || q.argument))
        : p.type === 'ArrayPattern' ? p.elements.flatMap(namesIn) : p.type === 'AssignmentPattern' ? namesIn(p.left) : []);
    const asks = (n) => n && !/Function/.test(n.type) && GATE_CALL.test(text(n));
    walk(ast, (n) => {
        if (n.type === 'VariableDeclarator' && asks(n.init)) for (const name of namesIn(n.id)) held.add(name);
        if (n.type === 'AssignmentExpression' && asks(n.right)) for (const name of namesIn(n.left)) held.add(name);
    });
    const isRefusal = (n) => REFUSAL.test(text(n)) || (n.type === 'Identifier' && held.has(n.name)) || (/Call|Await|Logical/.test(n.type) && GATE_CALL.test(text(n)))
        || (n.type === 'ObjectExpression' && n.properties.some((p) => p.type === 'SpreadElement' && p.argument.type === 'Identifier' && held.has(p.argument.name)))
        || (n.type === 'MemberExpression' && n.object.type === 'Identifier' && held.has(n.object.name));
    walk(ast, (n, parents) => {
        if (n.type !== 'ReturnStatement' || !n.argument || !isRefusal(n.argument)) return;
        const iff = [...parents].reverse().find((p) => p.type === 'IfStatement');
        if (!iff) { out.push({ line: n.loc.start.line, test: '', returns: text(n.argument).slice(0, 160), range: null }); return; }
        const body = iff.consequent.type === 'BlockStatement' ? iff.consequent.body : [iff.consequent];
        const alone = !iff.alternate && body.at(-1) === n && body.every((s) => s === n || s.type === 'ExpressionStatement');
        out.push({ line: n.loc.start.line, test: text(iff.test), returns: text(n.argument).slice(0, 160), range: alone ? [iff.start, iff.end] : [n.start, n.end] });
    });
    return out;
}

// The other shapes a function looks at: a request with no query at all, a body that is a list, each query parameter and
// body field its own source reads, and each value it compares one with. [{ label, method, qs?, body? }]
// Read where the function's own file reads them: by name off the query or the body, destructured, through `||` or `??`,
// compared with a literal, in a switch or a list's includes. A helper handed the event, the raw query, a path, a header,
// and two values that matter only together are not.
const ON_BODY = /^(data|body|payload|input|b|req)$/;
export function shapesOf(src) {
    const ast = parse(src, { sourceType: 'module' }).program;
    const text = (n) => src.slice(n.start, n.end).replace(/\s+/g, ' ');
    const isMember = (n) => n?.type === 'MemberExpression' || n?.type === 'OptionalMemberExpression';
    const isCall = (n) => n?.type === 'CallExpression' || n?.type === 'OptionalCallExpression';
    const bare = (n) => (n?.type === 'LogicalExpression' ? bare(n.left) : n?.type === 'AwaitExpression' ? bare(n.argument) : n);
    const queryNames = new Set(), bodyNames = new Set(), alias = new Map(), qs = new Map(), body = new Map();
    const isQuery = (n) => { const b = bare(n); return (isMember(b) && !b.computed && b.property.name === 'queryStringParameters') || (b?.type === 'Identifier' && queryNames.has(b.name)); };
    const isBody = (n) => { const b = bare(n); return (b?.type === 'Identifier' && (ON_BODY.test(b.name) || bodyNames.has(b.name))) || (isCall(b) && text(b.callee) === 'JSON.parse' && /event\.body|rawBody/.test(text(b))); };
    const put = (m, k, v) => { if (!m.has(k)) m.set(k, new Set()); if (v !== undefined && v !== '') m.get(k).add(v); };
    const keyIn = (n) => {   // the query parameter or body field an expression is: [map, key]
        const b = bare(n);
        if (isCall(b) && isMember(b.callee) && /^(trim|toLowerCase|toUpperCase|toString)$/.test(b.callee.property.name)) return keyIn(b.callee.object);
        if (isMember(b)) {
            const key = !b.computed ? b.property.name : b.property.type === 'StringLiteral' ? b.property.value : null;
            if (!key) return null;
            if (isQuery(b.object)) return [qs, key];
            if (isBody(b.object)) return [body, key];
            return null;
        }
        return b?.type === 'Identifier' && alias.has(b.name) ? alias.get(b.name) : null;
    };
    const bindAll = (pattern, map) => {
        for (const p of pattern.properties) {
            if (p.type !== 'ObjectProperty' || p.key.type !== 'Identifier') continue;
            put(map, p.key.name);
            const to = p.value.type === 'AssignmentPattern' ? p.value.left : p.value;
            if (to.type === 'Identifier') alias.set(to.name, [map, p.key.name]);
        }
    };
    for (let pass = 0; pass < 2; pass++) walk(ast, (n) => {   // twice: a name may stand on one found later
        const [id, init] = n.type === 'VariableDeclarator' ? [n.id, n.init] : n.type === 'AssignmentExpression' && n.operator === '=' ? [n.left, n.right] : [];
        if (!id || !init) return;
        if (id.type === 'Identifier') {
            if (isQuery(init)) queryNames.add(id.name);
            else if (isCall(bare(init)) && isBody(init)) bodyNames.add(id.name);
            else { const k = keyIn(init); if (k) alias.set(id.name, k); }
        }
        if (id.type === 'ObjectPattern') {
            if (isQuery(init)) bindAll(id, qs);
            else if (isBody(init)) bindAll(id, body);
            else if (init.type === 'Identifier' && init.name === 'event') for (const p of id.properties) if (p.key?.name === 'queryStringParameters' && p.value.type === 'Identifier') queryNames.add(p.value.name);
        }
    });
    const value = (n) => (n.type === 'StringLiteral' ? n.value : n.type === 'BooleanLiteral' ? n.value : undefined);
    walk(ast, (n) => {
        const at = keyIn(n);
        if (at) put(at[0], at[1]);
        if (n.type === 'BinaryExpression' && ['===', '==', '!==', '!='].includes(n.operator)) {
            for (const [x, y] of [[n.left, n.right], [n.right, n.left]]) { const k = keyIn(x); if (k && value(y) !== undefined) put(k[0], k[1], value(y)); }
        }
        if (n.type === 'BinaryExpression' && n.operator === 'in' && n.left.type === 'StringLiteral' && isBody(n.right)) put(body, n.left.value);
        if (n.type === 'SwitchStatement') { const k = keyIn(n.discriminant); if (k) for (const c of n.cases) if (c.test && value(c.test) !== undefined) put(k[0], k[1], value(c.test)); }
        if (isCall(n) && isMember(n.callee) && n.callee.property.name === 'includes' && n.callee.object.type === 'ArrayExpression' && n.arguments[0]) {
            const k = keyIn(n.arguments[0]);
            if (k) for (const e of n.callee.object.elements) if (e && value(e) !== undefined) put(k[0], k[1], value(e));
        }
    });
    const NOT_FIELDS = new Set(['id', 'length', 'map', 'filter', 'some', 'every', 'forEach', 'slice', 'find', 'reduce', 'includes', 'replace', 'startsWith', 'toString']);
    const out = [];
    for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) out.push({ label: `${method} no query`, method, qs: {} });
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) out.push({ label: `${method} a list`, method, body: [{ id: 'x1' }] });
    for (const [k, vs] of [...qs].sort()) {
        if (k === 'id') continue;
        for (const v of vs.size ? [...vs].sort() : ['true']) for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) out.push({ label: `${method} ?${k}=${v}`, method, qs: { id: 'x1', [k]: String(v) } });
    }
    for (const [k, vs] of [...body].sort()) {
        if (NOT_FIELDS.has(k)) continue;
        for (const v of new Set(['x', ...vs])) for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) out.push({ label: `${method} { ${k}: ${typeof v === 'string' ? `'${v}'` : v} }`, method, body: { id: 'x1', [k]: v } });
    }
    return out;
}
