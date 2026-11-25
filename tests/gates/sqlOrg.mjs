// What a statement says of the caller's org (state §0.298; guide §18b141) — read from the SQL drizzle writes and its
// parameters (engine.mjs op.sql), never from the source: `and(eq(id), eq(orgId))` losing its second half, a filter gone
// from a join, a subquery that reads every org's rows, all read the same way here. Pure.
//   orgGaps(text, params, tenants, org) → the tenant tables the statement reads, changes or deletes without holding each row to `org`
// A small reading of SQL, strict where it does not understand: a table is held only by a condition every one of its rows must
// meet, that is exactly `"t"."org_id" = $n` with the caller's org in its parameter (or a bare "org_id", where the statement names one
// table), or exactly an equality of its org_id with that of a table already held. Every row must meet a part of a where's
// `and` — never of an `or`, inside a function, after a `not`, or made a value of (`(…) is not true`, a case) — and a part of
// an inner join's `on`; a left join's holds its own right side alone. A statement inside another (a subquery, a with) is read by
// itself: it holds nothing outside it; an equality with an outer table's org holds it while that table is held. An insert
// is held by the org it stores (its caller reads the rows given); its update half as an update. An update's set, or an
// upsert's, that writes org_id writes the caller's, or the inserted row's ('… (moved)'). What it cannot follow — a verb,
// something after a from's tables, a join in parentheses, a schema's name — is a gap of its own: '(not read)'.

// Tokens: words, "names", $n, 'texts', punctuation.
const tokensOf = (text) => [...text.matchAll(/"((?:[^"]|"")*)"|\$(\d+)|'((?:[^']|'')*)'|([A-Za-z_][\w]*)|(\d+(?:\.\d+)?)|(::|->>|->|<>|<=|>=|!=|\|\||[().,;=<>*+\-/@#?&%[\]:])/g)].map((m) => (m[1] !== undefined ? { t: 'name', v: m[1] }
    : m[2] !== undefined ? { t: 'param', v: Number(m[2]) } : m[3] !== undefined ? { t: 'text', v: m[3] } : m[4] !== undefined ? { t: 'word', v: m[4].toLowerCase() } : m[5] !== undefined ? { t: 'num', v: m[5] } : { t: 'p', v: m[6] }));
const is = (k, v) => !!k && (k.t === 'word' || k.t === 'p') && k.v === v;
const STARTS = new Set(['select', 'update', 'delete', 'insert', 'with']);

// The tokens as a tree: each pair of parentheses a group.
function treeOf(tokens) {
    const root = { t: 'group', kids: [] }, stack = [root];
    for (const k of tokens) {   // a case is a group too: its ands are its own
        if (is(k, 'case')) { const g = { t: 'group', case: true, kids: [k] }; stack.at(-1).kids.push(g); stack.push(g); }
        else if (is(k, 'end') && stack.at(-1).case) stack.pop();
        else if (is(k, '(')) { const g = { t: 'group', kids: [] }; stack.at(-1).kids.push(g); stack.push(g); }
        else if (is(k, ')')) { if (stack.length > 1) stack.pop(); }
        else stack.at(-1).kids.push(k);
    }
    return root;
}
const isStatement = (g) => g?.t === 'group' && STARTS.has(g.kids[0]?.v) && g.kids[0].t === 'word';
// A run of tokens cut where `word` stands at its own level.
const cutAt = (kids, word) => { const out = [[]]; for (const k of kids) { if (is(k, word)) out.push([]); else out.at(-1).push(k); } return out; };
// Parentheses that hold the whole: their inside.
const open = (kids) => (kids.length === 1 && kids[0].t === 'group' && !kids[0].case && !isStatement(kids[0]) ? open(kids[0].kids) : kids);
// The parts of a condition every row must meet. `between a and b` is one part's, and it is no part that holds an org.
function mustMeet(kids) {
    const k = open(kids);
    if (k.some((x) => is(x, 'or'))) return [];
    const parts = [[]]; let between = false;   // `between a and b`: that and cuts nothing
    for (const x of k) { if (is(x, 'between')) between = true; if (is(x, 'and') && !between) parts.push([]); else { if (is(x, 'and')) between = false; parts.at(-1).push(x); } }
    return parts.length > 1 ? parts.flatMap(mustMeet) : [k];
}
// `"t"."org_id"`, `s.org_id` or a bare `org_id`, from tokens[i]: [table or null, where it ends], else null.
function orgAt(kids, i) {
    const name = (x) => x && (x.t === 'name' || x.t === 'word') ? x.v : null;
    if (name(kids[i]) && is(kids[i + 1], '.') && name(kids[i + 2]) === 'org_id') return [name(kids[i]), i + 3];
    return name(kids[i]) === 'org_id' ? [null, i + 1] : null;
}
// One part as a condition on orgs: { table, param } or { table, other }.
function orgCondition(part) {
    const a = orgAt(part, 0);
    if (a && is(part[a[1]], '=')) {
        const i = a[1] + 1;
        if (part[i]?.t === 'param' && part.length === i + 1) return { table: a[0], param: part[i].v };
        const b = orgAt(part, i);
        if (b && part.length === b[1]) return { table: a[0], other: b[0] };
    }
    if (part[0]?.t === 'param' && is(part[1], '=')) { const b = orgAt(part, 2); if (b && part.length === b[1]) return { table: b[0], param: part[0].v }; }
    return null;
}
// What a set writes over org_id: the caller's org, or the inserted row's; anything else moves the row.
const moves = (kids, params, org) => cutAt(kids, ',').some((a) => { const at = orgAt(a, 0); if (!at || !is(a[at[1]], '=')) return false; const v = a.slice(at[1] + 1); return !((v.length === 1 && v[0].t === 'param' && params[v[0].v - 1] === org) || (is(v[0], 'excluded') && orgAt(v, 0)?.[1] === v.length)); });
const JOIN = new Set(['left', 'right', 'full', 'inner', 'cross', 'join', 'lateral', 'outer']);
const CLAUSE = new Set(['where', 'group', 'order', 'limit', 'offset', 'returning', 'having', 'for', 'union', 'except', 'intersect', 'window', 'on', 'set', 'values', 'using']);

export function orgGaps(text, params, tenants, org) {
    const gaps = [];
    // Every statement inside a run of tokens, read by itself with what stands outside it.
    const inside = (kids, outer, ctes) => { for (const k of kids) if (k.t === 'group') { if (isStatement(k)) statement(k.kids, outer, ctes); else inside(k.kids, outer, ctes); } };

    // outer: the tables outside it and whether each is held. ctes: the with's names it can read.
    function statement(all, outer, given) {
        let kids = all, ctes = given;
        // with a as (…), b as (…) <statement> — a name is read by what follows it, and by itself only where recursive
        if (is(kids[0], 'with')) {
            const at = kids.findIndex((k, i) => i > 0 && k.t === 'word' && STARTS.has(k.v));
            let own = [];
            const recursive = is(kids[1], 'recursive');
            for (let i = 1; i < (at < 0 ? kids.length : at); i++) {
                const k = kids[i];
                if (k.t === 'name' || (k.t === 'word' && !['recursive', 'as', 'not', 'materialized'].includes(k.v))) { own = [k.v]; if (recursive) ctes = new Set([...ctes, k.v]); }
                else if (k.t === 'group') { if (isStatement(k)) { statement(k.kids, outer, ctes); ctes = new Set([...ctes, ...own]); own = []; } else inside([k], outer, ctes); }
            }
            if (at < 0) { gaps.push('(not read)'); return; }
            kids = kids.slice(at);
        }
        // a union's halves are statements of their own
        const union = kids.findIndex((k) => k.t === 'word' && ['union', 'except', 'intersect'].includes(k.v));
        const half = (x) => { const y = open(x); statement(y.length === 1 && isStatement(y[0]) ? y[0].kids : y, outer, ctes); };
        if (union > 0) { half(kids.slice(0, union)); half(kids.slice(union + 1).filter((k, i) => !(i === 0 && is(k, 'all')))); return; }
        const verb = kids[0]?.t === 'word' ? kids[0].v : '';
        if (verb === 'insert') return insert(kids, outer, ctes);
        if (!['select', 'update', 'delete'].includes(verb)) { gaps.push('(not read)'); return; }

        const tables = [];   // { name, table, held }
        const parts = [];    // { part, only } — only: the alias a left join's condition holds
        const read = new Set();   // the groups the from's own tables are
        const plain = (k) => k?.t === 'name' || (k?.t === 'word' && !CLAUSE.has(k.v) && !JOIN.has(k.v) && k.v !== 'and' && k.v !== 'or');
        const aliasAt = (j) => { let i = j; if (is(kids[i], 'as')) i++; if (!plain(kids[i])) return [null, j]; const a = kids[i].v; i++; if (kids[i]?.t === 'group') i++; return [a, i]; };   // and its columns' names
        const take = (at, target) => {   // a table at kids[at]: [entry, next]
            let i = at; if (is(kids[i], 'only') || is(kids[i], 'lateral')) i++;
            const k = kids[i];
            if (k?.t === 'group') {   // (select …) alias, (values …) alias; a join in parentheses is not read
                if (isStatement(k)) { read.add(k); statement(k.kids, outer, ctes); } else if (!is(k.kids[0], 'values')) gaps.push('(not read)');
                const [a, n] = aliasAt(i + 1);
                return [{ name: a || '', table: '', held: true }, n];
            }
            if (!k || !plain(k) || is(kids[i + 1], '.')) { gaps.push('(not read)'); return [null, i + 1]; }
            if (kids[i + 1]?.t === 'group') { const [a, n] = aliasAt(i + 2); return [{ name: a || k.v, table: '', held: true }, n]; }   // a function's rows
            const [a, n] = aliasAt(i + 1);
            const table = !target && ctes.has(k.v) ? '' : k.v;
            return [{ name: a || k.v, table, held: !tenants.has(table) }, n];
        };
        const isClause = (i) => kids[i].t === 'word' && (CLAUSE.has(kids[i].v) || JOIN.has(kids[i].v)) && !(['left', 'right'].includes(kids[i].v) && kids[i + 1]?.t === 'group');   // left(…) is a function
        const until = (i) => { let j = i; while (j < kids.length && !isClause(j) && !is(kids[j], ',')) j++; return j; };
        const list = (from, target) => {   // tables, with commas; what follows is a clause, a join, or nothing
            let i = from;
            for (;;) { const [e, n] = take(i, target); if (e) tables.push(e); i = n; if (is(kids[i], ',')) { i++; continue; } break; }
            if (i < kids.length && !isClause(i)) gaps.push('(not read)');
            return i;
        };
        let i = 0;
        if (verb === 'update') {
            const [e, n] = take(1, true); if (e) tables.push(e); i = n;
            if (is(kids[i], 'set')) {
                const z = kids.findIndex((k, j) => j > i && k.t === 'word' && ['from', 'where', 'returning'].includes(k.v) && !is(kids[j - 1], 'distinct'));
                if (e && tenants.has(e.table) && moves(kids.slice(i + 1, z < 0 ? undefined : z), params, org)) gaps.push(`${e.table} (moved)`);
            } else gaps.push('(not read)');
        }
        while (i < kids.length) {
            const k = kids[i];
            if ((is(k, 'from') && !is(kids[i - 1], 'distinct')) || is(k, 'using')) i = list(i + 1, verb === 'delete' && is(k, 'from'));
            else if (is(k, 'join')) {
                const kind = [kids[i - 1], kids[i - 2]].find((x) => x?.t === 'word' && ['left', 'right', 'full'].includes(x.v))?.v;
                const [e, n] = take(i + 1);
                if (e) tables.push(e);
                i = n;
                if (is(kids[i], 'on')) {
                    const j = until(i + 1);
                    for (const part of kind === 'full' || kind === 'right' ? [] : mustMeet(kids.slice(i + 1, j))) parts.push({ part, only: kind === 'left' ? e?.name : null });
                    i = j;
                }
                if (is(kids[i], ',')) i = list(i + 1);
                else if (i < kids.length && !isClause(i)) gaps.push('(not read)');
            } else if (is(k, 'where')) { const j = until(i + 1); for (const part of mustMeet(kids.slice(i + 1, j))) parts.push({ part, only: null }); i = j; }
            else i++;
        }
        // Held, until nothing more is.
        const named = (n) => (n === null ? (tables.filter((t) => t.table).length === 1 ? tables.find((t) => t.table) : null) : tables.find((t) => t.name === n));
        const anyNamed = (n) => named(n) || (n === null ? null : outer.find((t) => t.name === n));
        for (let more = true; more;) {
            more = false;
            for (const { part, only } of parts) {
                const c = orgCondition(part);
                if (!c) continue;
                const hold = (t) => { if (t && !t.held && tables.includes(t) && (!only || t.name === only)) { t.held = true; more = true; } };
                if (c.param !== undefined) { if (params[c.param - 1] === org) hold(named(c.table)); continue; }
                const a = anyNamed(c.table), b = anyNamed(c.other);
                if (a && b && a !== b) { if (a.held && tenants.has(a.table)) hold(b); if (b.held && tenants.has(b.table)) hold(a); }
            }
        }
        for (const t of tables) if (!t.held) gaps.push(t.table);
        // What stands inside it: its subqueries, wherever they stand (a with's and a from's are read above).
        inside(kids.filter((k) => !read.has(k)), [...tables, ...outer], ctes);
    }
    function insert(kids, outer, ctes) {
        const table = kids.find((k, i) => i > 0 && (k.t === 'name' || (k.t === 'word' && k.v !== 'into')))?.v;
        const conflict = kids.findIndex((k, i) => is(k, 'on') && is(kids[i + 1], 'conflict'));
        const at = kids.findIndex((k, i) => is(k, 'do') && is(kids[i + 1], 'update'));
        if (at > 0) {
            const w = kids.findIndex((k, i) => i > at && is(k, 'where'));
            const end = kids.findIndex((k, i) => i > at && is(k, 'returning'));
            const held = w > 0 && mustMeet(kids.slice(w + 1, end < 0 ? undefined : end)).some((p) => { const c = orgCondition(p); return c && c.param !== undefined && (c.table === table || c.table === null) && params[c.param - 1] === org; });
            if (tenants.has(table) && !held) gaps.push(`${table} (update)`);
            if (tenants.has(table) && moves(kids.slice(at + 3, w > 0 ? w : end < 0 ? undefined : end), params, org)) gaps.push(`${table} (moved)`);
        }
        const sel = kids.findIndex((k) => is(k, 'select') || is(k, 'with'));   // insert … select
        if (sel > 0) { statement(kids.slice(sel, conflict < 0 ? undefined : conflict), outer, ctes); inside(conflict < 0 ? [] : kids.slice(conflict), outer, ctes); } else inside(kids, outer, ctes);
    }
    const root = treeOf(tokensOf(text));
    statement(root.kids, [], new Set());
    return gaps;
}
