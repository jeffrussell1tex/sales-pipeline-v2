// tests/check-fnscope.test.mjs
//
// State §0.107. bf4a3c5 renamed a helper's parameter and left the body reading
// the old name, bound only inside another function's loop; nothing scanned a
// lowercase helper in a function file, and it threw hourly for five months
// (§0.95, then §0.101). scripts/fnscope.mjs is the scanner — a lexical-scope
// walk that reports an identifier read where no enclosing scope binds it. The
// April shape is the first case; the rest keep the walk honest about every way
// a name CAN be bound, because a scanner that cries wolf is switched off.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { undeclaredIn, GLOBALS } from '../scripts/fnscope.mjs';

const names = (src) => undeclaredIn(src).map(f => `${f.name}@${f.line}:${f.enclosing}`);

test('REGRESSION (§0.95): a body reading a name bound only inside ANOTHER function\'s loop is unbound', () => {
    const src = `
function wantsAlert(resolvedProfile, alertType) {
    const prefs = profile?.notificationPrefs || {};
    return !!prefs[alertType];
}
export const handler = async () => {
    for (const rep of []) {
        const profile = rep.profile || {};
        if (wantsAlert(profile, 'x')) return true;
    }
};`;
    assert.deepEqual(names(src), ['profile@3:wantsAlert']);
});

test('the April commit itself is flagged in both files it touched, and the fixed files are clean', () => {
    const at = (sha, f) => execSync(`git show ${sha}:${f}`, { encoding: 'utf8' });
    const oldAlerts = undeclaredIn(at('bf4a3c5', 'netlify/functions/pipeline-alerts.mjs')).map(f => f.name);
    const oldDigest = undeclaredIn(at('bf4a3c5', 'netlify/functions/digest.mjs')).map(f => f.name);
    assert.ok(oldAlerts.includes('profile'), `bf4a3c5 pipeline-alerts.mjs: ${oldAlerts}`);
    assert.ok(oldDigest.includes('profile'), `bf4a3c5 digest.mjs: ${oldDigest}`);
    for (const f of ['netlify/functions/pipeline-alerts.mjs', 'netlify/functions/digest.mjs']) {
        assert.deepEqual(undeclaredIn(readFileSync(new URL('../' + f, import.meta.url), 'utf8')), [], `${f} today`);
    }
});

test('every way a name is bound is seen: imports, params, destructuring, defaults, hoisted var/function, let/const in blocks, catch, for heads, class names, arguments, the function\'s own name', () => {
    const src = `
import x, { y as z } from 'm';
import * as ns from 'n';
const top = 1; let later;
function outer(a, { b, c: d = a }, [e, ...f], ...rest) {
    var hoistedLater;
    inner();
    function inner() { return a + b + d + e + f.length + rest.length + hoistedLater + x + z + ns.q + top + later + arguments.length + outer.name; }
    try { throw 1; } catch (err) { console.log(err); }
    for (let i = 0; i < 2; i++) { const j = i; console.log(j); }
    for (const k of []) console.log(k);
    for (const key in {}) console.log(key);
    switch (a) { case 1: { const s = 2; console.log(s); } }
    class K extends Object { static m() { return K; } n() { return this; } }
    const arrow = (p = top) => p;
    const fe = function named() { return named; };
    const obj = { top, [z]: 1, later: 2, m() { return top; } };
    return [K, arrow, fe, obj, obj.anything, obj?.deep?.prop, \`\${top}\`];
}
export { outer as somethingElse };
export default outer;`;
    assert.deepEqual(names(src), []);
});

test('reads are reads: a shorthand property, a computed key, a call, a template expression, a default value, a spread — each flagged when unbound; keys and member properties are not', () => {
    assert.deepEqual(names('const o = { a };'), ['a@1:module scope'], 'shorthand reads a');
    assert.deepEqual(names('const o = { a: 1 }; const p = o.a; const q = o?.a;'), [], 'keys and member properties are not reads');
    assert.deepEqual(names('const o = { [k]: 1 };'), ['k@1:module scope'], 'a computed key is a read');
    assert.deepEqual(names('function f(a = missing) { return a; }'), ['missing@1:f'], 'a default value is a read');
    assert.deepEqual(names('const s = `${nope}`;'), ['nope@1:module scope']);
    assert.deepEqual(names('const t = { ...spreadMe };'), ['spreadMe@1:module scope']);
    assert.deepEqual(names('typo();'), ['typo@1:module scope']);
    assert.deepEqual(names('label: for (;;) { break label; }'), [], 'labels are not identifiers being read');
    assert.deepEqual(names('const m = import.meta.url;'), [], 'import.meta is not a read of `import`');
    assert.deepEqual(names("export { a, b as c } from './m';"), [], 'REGRESSION: a re-export with a source binds nothing and reads nothing (the one false positive the live tree showed, _stage.mjs)');
    assert.deepEqual(names("const a = 1; export { a };"), [], 'a plain re-export of a local is fine');
    assert.throws(() => names("export { notLocal };"), /not defined/, 'exporting an unbound local is refused by the parser itself, before the walk');
});

test('the standard globals are known and nothing else is', () => {
    assert.deepEqual(names('console.log(process.env.X, Buffer.from(""), JSON.stringify({}), new URL("x"), fetch, crypto, setTimeout);'), []);
    assert.deepEqual(names('window.alert(1);'), ['window@1:module scope'], 'a browser-only global is not one of Node\'s — a function file that reads it dies on Netlify');
    assert.ok(GLOBALS.has('Promise') && GLOBALS.has('structuredClone') && !GLOBALS.has('window') && !GLOBALS.has('document'));
});

test('the CLI walks netlify/functions and db, exits 1 on a finding, and the gate is wired', () => {
    const cli = readFileSync(new URL('../scripts/check-fnscope.mjs', import.meta.url), 'utf8');
    assert.ok(cli.includes("import { undeclaredIn } from './fnscope.mjs';"));
    assert.ok(cli.includes("[...walk('netlify/functions'), ...walk('db')]"));
    assert.ok(cli.includes('process.exit(1);'), 'a finding fails the gate');
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    assert.equal(pkg.scripts['check:fnscope'], 'node scripts/check-fnscope.mjs');
    const claude = readFileSync(new URL('../CLAUDE.md', import.meta.url), 'utf8');
    assert.ok(claude.includes('npm run check:fnscope'), 'in the verification chain');
});
