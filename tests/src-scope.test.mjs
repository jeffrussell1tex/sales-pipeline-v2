// §0.175 — every name the browser code reads is bound somewhere it can see.
//
// check:fnscope (scripts/fnscope.mjs, state §0.107) walks the function files; the
// browser code had no such walk, and two lines under src read a name that did not
// exist: the undo's "did not take" path in useContacts.js and useActivities.js
// called `prev.filter(c.id !== contact.id)` — `c` bound nowhere — so a refused
// restore threw, since 13 Aug (93315f0). §0.175's own first cut left an upload
// helper calling a `never()` it had renamed. Each parsed, bundled and passed
// every gate, and would have thrown the first time its line ran.
//
// The same lexical-scope walk, over every file under src, with the browser's own
// globals added to the standard ones it knows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { undeclaredIn } from '../scripts/fnscope.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');

const srcFiles = () => {
    const out = [];
    const walk = (dir) => {
        for (const e of readdirSync(new URL(dir, ROOT), { withFileTypes: true })) {
            const p = dir + e.name;
            if (e.isDirectory()) walk(p + '/');
            else if (/\.(jsx?|mjs)$/.test(e.name)) out.push(p);
        }
    };
    walk('src/');
    return out;
};

// What a page has that a function does not.
const BROWSER = new Set(['window', 'document', 'localStorage', 'sessionStorage', 'navigator', 'location', 'history',
    'alert', 'confirm', 'prompt', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'matchMedia',
    'XMLHttpRequest', 'FileReader', 'Blob', 'File', 'FormData', 'Image', 'Audio', 'AudioContext', 'Notification',
    'ResizeObserver', 'IntersectionObserver', 'MutationObserver', 'DOMParser', 'CustomEvent', 'KeyboardEvent',
    'MouseEvent', 'Event', 'HTMLElement', 'Element', 'Node', 'screen', 'open', 'print', 'atob', 'btoa', 'indexedDB']);

test('every name read under src is bound — a page has its globals, and nothing else is free', () => {
    const unbound = [];
    for (const file of srcFiles()) {
        for (const f of undeclaredIn(read(file), { file })) {
            if (!BROWSER.has(f.name)) unbound.push(`${file}:${f.line} "${f.name}" in ${f.enclosing}`);
        }
    }
    assert.deepEqual(unbound, [], 'a name nothing binds throws ReferenceError the first time its line runs');
});

test('the walk sees what it is for: a free name in a callback, and not a bound one', () => {
    const found = undeclaredIn('const f = (prev, contact) => prev.filter(c.id !== contact.id);', { file: 'fixture.js' }).map((x) => x.name);
    assert.deepEqual(found, ['c']);
    assert.deepEqual(undeclaredIn('const f = (prev, contact) => prev.filter((c) => c.id !== contact.id);', { file: 'fixture.js' }), []);
});
