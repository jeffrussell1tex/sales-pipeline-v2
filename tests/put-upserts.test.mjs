// tests/put-upserts.test.mjs — THE GUARD: a save writes only what it names (state §0.242, guide §18b125 rule 1;
// docs/design/save-cleanup Part 2d).
//
// A PUT reads the stored row in the org and updates it; an id the org does not hold is a 404 and nothing is written.
// An upsert in a PUT (insert ... onConflictDoUpdate) can write columns the body left out — the insert's values, or a
// set built from the body alone — and can CREATE a row on an unknown id. Three did (products, export-schedules,
// export-dsr) and became updates in this batch. This guard parses every function file (netlify/functions/*.mjs) and
// finds every `.insert(` and `.onConflictDoUpdate(` call, by the method block that holds it:
//   - in a PUT or PATCH block: each must be NAMED below (PUT_WRITES), with its reason and its count;
//   - in a POST block: an `.onConflictDoUpdate(` must be named (POST_UPSERTS) — the designed create-upserts (§0.201),
//     filed (a re-POST overwrites with defaults; OUT in the design); a plain insert is a create, never asked;
//   - outside any method block (a helper): an `.onConflictDoUpdate(` must be named (HELPER_UPSERTS).
// A new one fails until it is named, with its reason; a named one that is gone fails until its name goes (no stale
// names). A method block is an `if` whose test compares to 'PUT', 'PATCH', 'POST', 'GET' or 'DELETE' (`===`), or the
// rest of a body after `if (… !== 'PUT') return` (user-role.mjs's shape). Lexical: a write a block reaches through a
// helper is the helper's entry (users.mjs upsertUser, _bulk.mjs bulkUpsert). Not proved here (the design's open
// question): whether each merged PUT upsert still CREATES on an id the org does not hold — named, not settled.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { parse } from '@babel/parser';

const ROOT = new URL('../', import.meta.url);
const FN_DIR = new URL('netlify/functions/', ROOT);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8').replace(/\r\n/g, '\n');
const code = (src) => src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
const between = (s, a, b) => { const i = s.indexOf(a); assert.ok(i >= 0, a); const j = s.indexOf(b, i + a.length); assert.ok(j > i, b); return s.slice(i, j); };
const order = (s, ...needles) => {
    let at = -1;
    for (const n of needles) { const i = s.indexOf(n, at + 1); assert.ok(i > at, `in order: ${n}`); at = i; }
};

const METHODS = /^(PUT|PATCH|POST|GET|DELETE)$/;
const WRITES = ['insert', 'onConflictDoUpdate'];
const kids = (n) => Object.keys(n).filter((k) => !['loc', 'start', 'end', 'extra', 'leadingComments', 'trailingComments', 'innerComments'].includes(k))
    .flatMap((k) => (Array.isArray(n[k]) ? n[k] : [n[k]])).filter((v) => v && typeof v === 'object' && typeof v.type === 'string');
// The methods an `if` test compares to, with === / == (eq) or !== / != (ne).
const methodsOf = (testNode) => {
    const eq = new Set(), ne = new Set();
    const walk = (n) => {
        if (n.type === 'BinaryExpression' && ['===', '==', '!==', '!='].includes(n.operator)) {
            for (const side of [n.left, n.right]) {
                if (side.type === 'StringLiteral' && METHODS.test(side.value)) (n.operator.startsWith('!') ? ne : eq).add(side.value);
            }
        }
        kids(n).forEach(walk);
    };
    walk(testNode);
    return { eq: [...eq], ne: [...ne] };
};
const returns = (n) => n.type === 'ReturnStatement' || (n.type === 'BlockStatement' && n.body.some((x) => x.type === 'ReturnStatement'));

// Every write call in a source, with the method block that holds it ('' outside any).
function writesOf(src) {
    const ast = parse(src, { sourceType: 'module', plugins: ['jsx'] });
    const out = [];
    const walk = (n, method) => {
        if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && n.callee.property.type === 'Identifier' && WRITES.includes(n.callee.property.name)) {
            out.push({ method, kind: n.callee.property.name, line: n.loc.start.line, at: n.callee.property.start });
        }
        if (n.type === 'IfStatement') {
            const { eq } = methodsOf(n.test);
            walk(n.test, method);
            walk(n.consequent, eq.length ? eq.join('|') : method);
            if (n.alternate) walk(n.alternate, method);
            return;
        }
        if (n.type === 'BlockStatement' || n.type === 'Program') {
            let at = method;
            for (const st of n.body) {
                walk(st, at);
                // `if (event.httpMethod !== 'PUT') return …;` — what follows in this body is that method's.
                if (st.type === 'IfStatement' && !st.alternate && returns(st.consequent)) {
                    const { eq, ne } = methodsOf(st.test);
                    if (ne.length && !eq.length) at = ne.join('|');
                }
            }
            return;
        }
        kids(n).forEach((k) => walk(k, method));
    };
    walk(ast.program, '');
    return out.sort((a, b) => a.at - b.at);   // in source order: an insert before the onConflictDoUpdate chained on it
}

// What the guard counts, per file: "file METHOD kind" → n.
function tally(file, src) {
    const counts = new Map();
    for (const w of writesOf(src)) {
        const put = /PUT|PATCH/.test(w.method);
        const key = put ? `${file} ${w.method} ${w.kind}`
            : w.kind === 'onConflictDoUpdate' && w.method === 'POST' ? `${file} POST upsert`
            : w.kind === 'onConflictDoUpdate' && !w.method ? `${file} helper upsert`
            : null;
        if (key) counts.set(key, (counts.get(key) || 0) + 1);
    }
    return counts;
}

const MERGED = 'merged over the stored row read in the org (an upsert by id, setWhere on the org)';
// Every insert and upsert a PUT or PATCH block holds, with its count and its reason.
const PUT_WRITES = {
    'accounts.mjs PUT insert': [1, MERGED],
    'accounts.mjs PUT onConflictDoUpdate': [1, MERGED],
    'activities.mjs PUT insert': [1, MERGED],
    'activities.mjs PUT onConflictDoUpdate': [1, MERGED],
    'contacts.mjs PUT insert': [1, MERGED],
    'contacts.mjs PUT onConflictDoUpdate': [1, MERGED],
    'leads.mjs PUT insert': [1, MERGED],
    'leads.mjs PUT onConflictDoUpdate': [1, MERGED],
    'opportunities.mjs PUT insert': [1, MERGED],
    'opportunities.mjs PUT onConflictDoUpdate': [1, MERGED],
    'tasks.mjs PUT insert': [1, MERGED],
    'tasks.mjs PUT onConflictDoUpdate': [1, MERGED],
    'settings.mjs PUT insert': [1, "the org's one settings row: each key the save names merged in SQL over the stored, with its revision token (state §0.224)"],
    'settings.mjs PUT onConflictDoUpdate': [1, "the org's one settings row: each key the save names merged in SQL over the stored, with its revision token (state §0.224)"],
    'backup.mjs PUT insert': [1, "the org's one backup schedule (sched_<org>): each field the body's, else the stored, else the default (state §0.242)"],
    'backup.mjs PUT onConflictDoUpdate': [1, "the org's one backup schedule (sched_<org>): each field the body's, else the stored, else the default (state §0.242)"],
    'dashboard-configs.mjs PUT insert': [1, "a member's own dashboard (one row per member per org): the widgets list is the whole of what it stores"],
    'dashboard-configs.mjs PUT onConflictDoUpdate': [1, "a member's own dashboard (one row per member per org): the widgets list is the whole of what it stores"],
    'backup.mjs PATCH insert': [3, "the restore: a row already here is kept (onConflictDoNothing), never written over; and the import's snapshot row"],
    'users.mjs PUT insert': [1, "the quota writer's audit rows (audit_log) — a member's save is update-only (upsertUser's updateOnly, state §0.202)"],
};
// The designed create-upserts (§0.201: "The create is an upsert") — a re-POST overwrites with defaults; filed (OUT).
const POST_UPSERTS = {
    'dispatch-customers.mjs POST upsert': 2,
    'dispatch-equipment.mjs POST upsert': 1,
    'dispatch-jobs.mjs POST upsert': 2,
    'dispatch-plan-visits.mjs POST upsert': 1,
    'dispatch-schedule-blocks.mjs POST upsert': 1,
    'dispatch-service-plans.mjs POST upsert': 1,
    'dispatch-technicians.mjs POST upsert': 1,
    'dispatch-vehicles.mjs POST upsert': 1,
};
// Upserts outside any method block, each with its reason.
const HELPER_UPSERTS = {
    '_bulk.mjs helper upsert': [1, "bulkUpsert: the bulk PUTs' rows, each over its stored row read whole in the org (partialRows, guide §18b106 rule 8)"],
    '_heartbeat.mjs helper upsert': [1, "a scheduled job's heartbeat, one row per site and job — no member's save"],
    'users.mjs helper upsert': [1, "upsertUser: the create's path; a PUT passes updateOnly — an update (state §0.202)"],
};

const fnFiles = () => readdirSync(FN_DIR).filter((f) => f.endsWith('.mjs')).sort();

test('THE GUARD: every insert and upsert in a PUT or PATCH block is named with its reason — none new, none stale', () => {
    const found = new Map();
    for (const f of fnFiles()) for (const [k, n] of tally(f, readFileSync(new URL(f, FN_DIR), 'utf8'))) found.set(k, n);
    const put = [...found].filter(([k]) => / (PUT|PATCH)/.test(k));
    for (const [k, n] of put) {
        assert.ok(PUT_WRITES[k], `NEW: ${k} (${n}) — a PUT writes only what it names (guide §18b125 rule 1): read the stored row in the org and update it, or name it here with its reason`);
        assert.equal(n, PUT_WRITES[k][0], `${k}: ${n} found, ${PUT_WRITES[k][0]} named`);
    }
    for (const k of Object.keys(PUT_WRITES)) assert.ok(found.has(k), `STALE: ${k} is named but no longer found — take its name out`);
    for (const [, [, why]] of Object.entries(PUT_WRITES)) assert.ok(why && why.length > 20, 'each named with its reason');
});

test('THE GUARD: the POST upserts and the helper upserts are the named ones', () => {
    const found = new Map();
    for (const f of fnFiles()) for (const [k, n] of tally(f, readFileSync(new URL(f, FN_DIR), 'utf8'))) found.set(k, n);
    const posts = Object.fromEntries([...found].filter(([k]) => k.endsWith(' POST upsert')));
    assert.deepEqual(posts, POST_UPSERTS, 'a create that upserts is named (POST_UPSERTS) — it overwrites what a re-POST leaves out');
    const helpers = Object.fromEntries([...found].filter(([k]) => k.endsWith(' helper upsert')));
    assert.deepEqual(helpers, Object.fromEntries(Object.entries(HELPER_UPSERTS).map(([k, [n]]) => [k, n])), 'an upsert outside a method block is named (HELPER_UPSERTS)');
});

test('the three PUTs this batch made updates: the stored row read in the org, a 404 before anything is written, an update by id and org', () => {
    const p = code(read('netlify/functions/products.mjs'));
    const pPut = between(p, "if (event.httpMethod === 'PUT') {", "if (event.httpMethod === 'DELETE') {");
    order(pPut,
        '.where(and(eq(products.id, String(data.id)), eq(products.orgId, orgId))).limit(1);',
        "if (!stored) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Product not found in your organization' }) };",
        'const { id: _id, ...named } = sanitize(data);',
        'db.update(products).set(changes)',
        '.where(and(eq(products.id, stored.id), eq(products.orgId, orgId)))',
        "action: 'product.updated'");
    const allowed = between(p, 'const ALLOWED_FIELDS = [', '];');
    assert.ok(!allowed.includes("'createdBy'"), 'who made a product is never the body\'s');
    assert.ok(allowed.includes("'customPrice',"), 'the custom-price switch is written (Q2)');
    // The rules a product's write keeps (Q1, Q2): a list price none only for a custom-price product, which stores 0; the
    // minimum price written only when named; the maker the caller's name; a taken id a 409.
    assert.ok(p.includes("if ('listPrice' in data && priceText(data.listPrice) === undefined && !(blank(data.listPrice) && customAfter(data, storedCustom))) {"));
    assert.ok(p.includes("if (customAfter(data, storedCustom) && ('listPrice' in data || 'customPrice' in data)) out.listPrice = '0';"));
    assert.ok(p.includes("if ('minPrice' in data) out.minPrice = blank(data.minPrice) ? null : priceText(data.minPrice);"));
    const pPost = between(p, "if (event.httpMethod === 'POST') {", "if (event.httpMethod === 'PUT') {");
    order(pPost,
        "if (data.listPrice == null && data.customPrice !== true) return { statusCode: 400,",
        'const refused = productRefused(data);',
        '...pricesOf(data),',
        'createdBy: (await getCallerName(auth.userId, orgId)) || null,',
        'const [inserted] = await db.insert(products).values(payload).onConflictDoNothing({ target: products.id }).returning();',
        "if (!inserted) return { statusCode: 409, headers, body: JSON.stringify({ error: 'That id is already in use.' }) };");
    assert.ok(!pPost.includes('data.createdBy'), 'the body\'s maker never read');
    assert.ok(!/minPrice:\s*data\.minPrice != null \? String\(data\.minPrice\) : null/.test(pPut), 'REGRESSION: a save that leaves the minimum price out wipes it');

    const s = code(read('netlify/functions/export-schedules.mjs'));
    const sPut = between(s, "if (event.httpMethod === 'PUT') {", "if (event.httpMethod === 'DELETE') {");
    order(sPut,
        '.where(and(eq(exportSchedules.id, String(data.id)), eq(exportSchedules.orgId, orgId))).limit(1);',
        "if (!existing) return { statusCode: 404, headers: HEADERS, body: JSON.stringify({ error: 'Schedule not found' }) };",
        'sanitize({ ...existing, ...data, createdBy: existing.createdBy })',
        'db.update(exportSchedules)',
        '.where(and(eq(exportSchedules.id, existing.id), eq(exportSchedules.orgId, orgId)))');
    assert.ok(s.includes('.values({ ...sanitize(data), orgId, createdBy: userId })'), 'the create stamps its maker');

    const d = code(read('netlify/functions/export-dsr.mjs'));
    const dPut = between(d, "if (event.httpMethod === 'PUT') {", "if (event.httpMethod === 'DELETE') {");
    order(dPut,
        '.where(and(eq(dsrQueue.id, String(data.id)), eq(dsrQueue.orgId, orgId))).limit(1);',
        "if (!existing) return { statusCode: 404, headers: HEADERS, body: JSON.stringify({ error: 'Request not found' }) };",
        'sanitize({ ...existing, ...data, createdBy: existing.createdBy })',
        "const completed = isDone && !wasDone ? { completedAt: new Date() } : wasDone && !isDone ? { completedAt: null } : {};",
        'db.update(dsrQueue)',
        '.where(and(eq(dsrQueue.id, existing.id), eq(dsrQueue.orgId, orgId)))');
    assert.ok(!/slaDeadline:|addDays|SLA_DAYS/.test(dPut), 'the SLA is the create\'s — never counted again on a save');
});

test('backup.mjs: the schedule save keeps each field the body leaves out — the failure address above all', () => {
    const s = code(read('netlify/functions/backup.mjs'));
    const put = between(s, "if (event.httpMethod === 'PUT') {", "if (event.httpMethod === 'PATCH') {");
    order(put,
        'const [stored] = await db.select().from(backupSchedule).where(eq(backupSchedule.orgId, orgId)).limit(1);',
        'const pick = (k, clean, dflt) => (k in body ? clean(body[k]) : stored?.[k] ?? dflt);',
        "const notifyOnFailure = pick('notifyOnFailure', (v) => v || '', '');",
        'await db.insert(backupSchedule).values({ id: schedId, orgId, ...schedule }).onConflictDoUpdate({',
        'set: schedule,');
    assert.ok(!/notifyOnFailure:\s*notifyOnFailure \|\| ''/.test(put), 'REGRESSION: a save without the address blanks it');
});

// ── the scan's own shape (self-tests) ────────────────────────────────────────

test('self-test: the scan finds a PUT upsert, a PATCH insert, a POST upsert and a helper upsert where they are — and nothing in an update', () => {
    const fixture = [
        "const h = async () => db.insert(t).values({}).onConflictDoUpdate({ target: t.id, set: {} });",
        "export const handler = async (event) => {",
        "    if (event.httpMethod === 'POST') { await db.insert(t).values({}); await db.insert(u).values({}).onConflictDoUpdate({ target: u.id, set: {} }); }",
        "    if (event.httpMethod === 'PUT') { await db.insert(t).values({}).onConflictDoUpdate({ target: t.id, set: {} }); }",
        "    else if (event.httpMethod === 'PATCH') { await db.insert(t).values({}); }",
        "    if (event.httpMethod === 'GET' && x) { await db.update(t).set({}); }",
        "    if (event.httpMethod === 'DELETE') { await db.update(t).set({}); }",
        "};",
    ].join('\n');
    const w = writesOf(fixture).map((x) => `${x.method || '-'} ${x.kind}`);
    assert.deepEqual(w, ['- insert', '- onConflictDoUpdate', 'POST insert', 'POST insert', 'POST onConflictDoUpdate', 'PUT insert', 'PUT onConflictDoUpdate', 'PATCH insert']);
    assert.deepEqual(Object.fromEntries(tally('fx.mjs', fixture)), {
        'fx.mjs helper upsert': 1, 'fx.mjs POST upsert': 1, 'fx.mjs PUT insert': 1, 'fx.mjs PUT onConflictDoUpdate': 1, 'fx.mjs PATCH insert': 1,
    });
    // An update-only PUT is never counted — the shape this batch moved three PUTs to.
    assert.deepEqual(writesOf("if (event.httpMethod === 'PUT') { const [s] = await db.select().from(t); await db.update(t).set({}).where(x); }"), []);
});

test('self-test: the early-return shape — `if (method !== \'PUT\') return` — makes the rest of the body a PUT block', () => {
    const fixture = [
        "export const handler = async (event) => {",
        "    if (event.httpMethod !== 'PUT') { return { statusCode: 405 }; }",
        "    await db.insert(t).values({}).onConflictDoUpdate({ target: t.id, set: {} });",
        "};",
    ].join('\n');
    assert.deepEqual(writesOf(fixture).map((x) => `${x.method} ${x.kind}`), ['PUT insert', 'PUT onConflictDoUpdate']);
    // A combined test names both methods.
    assert.deepEqual(writesOf("if (m === 'PUT' || m === 'PATCH') { await db.insert(t).values({}); }").map((x) => x.method), ['PUT|PATCH']);
    // The tally treats a PUT|PATCH block as a PUT block.
    assert.deepEqual(Object.fromEntries(tally('fx.mjs', "if (m === 'PUT' || m === 'PATCH') { await db.insert(t).values({}); }")), { 'fx.mjs PUT|PATCH insert': 1 });
});
