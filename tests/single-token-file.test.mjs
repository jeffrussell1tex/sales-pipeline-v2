// tests/single-token-file.test.mjs
//
// ONE design-token object (state §0.130, 14 Sep). Until then every non-Settings
// file declared its own copy of `T` (24 files; ReportsTab eight) — a value
// changed in the shared file reached none of them, and the copies had drifted
// (five serif spellings, one radius, four alias keys, and three reads of keys a
// copy never had, silently `undefined`). Now src/tokens.js is the only literal,
// every reader imports it, and this file pins that so the class cannot return
// one "just for this file" copy at a time. Source assertions (§18b23): the
// values are a runtime import of the module; the shape of the tree is the parser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';
import { T } from '../src/tokens.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(ROOT, 'src');
const files = [];
const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.jsx?$/.test(e.name)) files.push(p); } };
walk(SRC);
const rel = (p) => relative(ROOT, p).replace(/\\/g, '/');
const read = (p) => readFileSync(p, 'utf8');

const litValue = (node) => {
    if (node.type === 'StringLiteral' || node.type === 'NumericLiteral') return node.value;
    if (node.type === 'ObjectExpression') { const o = {}; for (const p of node.properties) { if (p.type !== 'ObjectProperty') return undefined; const k = p.key.type === 'Identifier' ? p.key.name : p.key.value; const v = litValue(p.value); if (v === undefined) return undefined; o[k] = v; } return o; }
    return undefined;
};
// A "token object literal": `const <T-ish name> = { … surface: '#…', ink: '#…' … }` anywhere in a file.
const tokenLiterals = (src) => {
    const ast = parse(src, { sourceType: 'module', plugins: ['jsx'] });
    const hits = [];
    const visit = (node) => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) { node.forEach(visit); return; }
        if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier' && /^T[0-9A-Za-z_]*$/.test(node.id.name) && node.init && node.init.type === 'ObjectExpression') {
            const v = litValue(node.init);
            if (v && v.surface !== undefined && v.ink !== undefined) hits.push({ name: node.id.name, line: node.loc.start.line });
        }
        for (const k of Object.keys(node)) if (!['loc', 'start', 'end', 'extra'].includes(k)) visit(node[k]);
    };
    visit(ast.program.body);
    return hits;
};

const EXPECTED_KEYS = ['bg', 'surface', 'surface2', 'border', 'borderStrong', 'ink', 'inkMid', 'inkMuted', 'gold', 'goldInk', 'tint', 'surfaceInk', 'surfaceInkFg', 'danger', 'warn', 'ok', 'info', 'stages', 'sans', 'serif', 'mono', 'r', 'rSm', 'rMd', 'rLg'];

test('src/tokens.js carries the warm-stone palette the guide (§16) names, and exactly these keys', () => {
    assert.deepEqual(Object.keys(T).sort(), [...EXPECTED_KEYS].sort(), 'a key added or removed here is a deliberate design-system change — update this list in the same commit');
    assert.deepEqual(
        { bg: T.bg, surface: T.surface, surface2: T.surface2, border: T.border, borderStrong: T.borderStrong, ink: T.ink, inkMid: T.inkMid, inkMuted: T.inkMuted, gold: T.gold, goldInk: T.goldInk, danger: T.danger, warn: T.warn, ok: T.ok, info: T.info },
        { bg: '#f0ece4', surface: '#fbf8f3', surface2: '#f5efe3', border: '#e6ddd0', borderStrong: '#d4c8b4', ink: '#2a2622', inkMid: '#5a544c', inkMuted: '#8a8378', gold: '#c8b99a', goldInk: '#7a6a48', danger: '#9c3a2e', warn: '#b87333', ok: '#4d6b3d', info: '#3a5a7a' },
    );
    assert.equal(T.serif, 'Georgia, serif', 'the app loads no serif face; Georgia is what every screen rendered before the copies were unified');
    assert.equal(T.sans, '"Plus Jakarta Sans", system-ui, sans-serif');
    assert.deepEqual({ r: T.r, rSm: T.rSm, rMd: T.rMd, rLg: T.rLg }, { r: 3, rSm: 3, rMd: 4, rLg: 6 });
    assert.equal(T.stages['Closed Won'], '#3a5530');
});

test('exactly one token object literal exists under src/, and it is src/tokens.js', () => {
    const where = [];
    for (const f of files) for (const h of tokenLiterals(read(f))) where.push(`${rel(f)}:${h.line} (${h.name})`);
    assert.deepEqual(where, ['src/tokens.js:13 (T)'], 'a local copy of the token object is the drift this test exists to stop — import { T } from src/tokens.js instead');
});

// `import { T } from '…/tokens.js'`, `import { T as TOKENS } from …`, or T among
// other names, from src/tokens.js or one of its two re-export points
// (documents/atoms, settings/shared/tokens.js).
const IMPORT_RE = /import \{[^}]*\bT\b[^}]*\} from '[^']*(?:tokens\.js|atoms)'/;

test('every file that reads T.<key> imports T from src/tokens.js (directly, via documents/atoms, or via settings/shared/tokens.js)', () => {
    const readers = files.filter(f => rel(f) !== 'src/tokens.js' && /\bT\.[A-Za-z_]/.test(read(f).split(/\r?\n/).filter(l => !l.trim().startsWith('//')).join('\n')));
    const missing = readers.filter(f => !IMPORT_RE.test(read(f))).map(rel);
    assert.deepEqual(missing, [], 'a T-reader with no import of T either crashes or reads a local copy');
    assert.ok(readers.length >= 60, `sanity: expected the whole app to read T (found ${readers.length} files)`);
});

test('every T.<key> read in src/ names a key src/tokens.js has (no alias keys, nothing silently undefined)', () => {
    const allowed = new Set(EXPECTED_KEYS);
    const unknown = {};
    for (const f of files) for (const m of read(f).matchAll(/\bT\.([A-Za-z_][A-Za-z0-9_]*)\b/g)) if (!allowed.has(m[1])) (unknown[m[1]] = unknown[m[1]] || new Set()).add(rel(f));
    assert.deepEqual(Object.fromEntries(Object.entries(unknown).map(([k, v]) => [k, [...v]])), {},
        'a read of a key T does not have renders as undefined — no colour, no radius — with no error anywhere');
});

test('Dispatch is the one file with a deliberate divergence: radius 4 over the shared object', () => {
    const dispatch = read(join(SRC, 'Tabs', 'DispatchTab.jsx'));
    assert.ok(dispatch.includes("import { T as TOKENS } from '../tokens.js';"), 'DispatchTab imports the shared object under the TOKENS name');
    assert.ok(dispatch.includes('const T = { ...TOKENS, r: 4 };'), 'and derives its own T with radius 4 — the only override in the tree');
    const codeOnly = (src) => src.split(/\r?\n/).filter((l) => !l.trim().startsWith('//')).join('\n');
    const others = files.filter(f => !['src/Tabs/DispatchTab.jsx', 'src/tokens.js'].includes(rel(f)) && /\.\.\.TOKENS/.test(codeOnly(read(f)))).map(rel);
    assert.deepEqual(others, [], 'a second override is a second token file by another name — change src/tokens.js instead, or record the divergence here');
});
