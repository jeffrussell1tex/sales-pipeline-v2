// tests/activity-save.test.mjs
//
// An activity save that threw stops (state §0.176). useActivities'
// handleSaveActivity caught a failed request — the network, or an answer that
// was not JSON — set the rail's error, and then fell through to its success
// tail: it offered the follow-up for the activity it had not saved, closed
// QuickLog and emptied QuickLog's draft (state §9, §0.175 found (e)). A refusal
// the server answered returned before them.
//
// A parse of src found 49 catches that can finish with statements after their
// try; the two here were the ones whose tail assumed the try had worked — the
// rest end a loading or busy flag, read an error body before throwing it, or
// fall back from storage. In the data hooks the rule is kept: a catch leaves.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { parse } from '@babel/parser';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');

const leaves = (s) => {
    if (!s) return false;
    if (/^(ReturnStatement|ThrowStatement)$/.test(s.type)) return true;
    if (s.type === 'BlockStatement') return leaves(s.body[s.body.length - 1]);
    if (s.type === 'IfStatement') return leaves(s.consequent) && leaves(s.alternate);
    return false;
};

// Every try in a file whose catch can finish normally with statements after it.
const fallThroughs = (file) => {
    const src = read(file);
    const ast = parse(src, { sourceType: 'module', plugins: ['jsx'] });
    const out = [];
    const visit = (node) => {
        if (!node || typeof node.type !== 'string') return;
        const body = node.type === 'BlockStatement' || node.type === 'Program' ? node.body : null;
        if (body) {
            body.forEach((st, i) => {
                if (st.type === 'TryStatement' && st.handler && i < body.length - 1 && !leaves(st.handler.body)) {
                    out.push(`${file}:${st.handler.loc.start.line}`);
                }
            });
        }
        for (const k of Object.keys(node)) {
            if (k === 'loc') continue;
            const v = node[k];
            if (Array.isArray(v)) v.forEach(visit); else if (v && typeof v.type === 'string') visit(v);
        }
    };
    visit(ast.program);
    return out;
};

test('handleSaveActivity: both catches leave — no follow-up, no QuickLog reset after a failure', () => {
    const src = read('src/hooks/useActivities.js');
    const start = src.indexOf('const handleSaveActivity = async (');
    const fn = src.slice(start, src.indexOf('\n    return {', start));
    const catches = fn.split(/\r?\n/).map((l) => l.trim());
    const at = catches.reduce((a, l, i) => (l.startsWith('} catch (err) {') ? [...a, i] : a), []);
    assert.equal(at.length, 2, 'the update and the create');
    for (const i of at) {
        const block = catches.slice(i, catches.indexOf('} finally { setActivityModalSaving(false); }', i) + 1);
        assert.ok(block.includes("setActivityModalError('Failed to save activity. Please check your connection and try again.');"), 'the error is shown');
        assert.ok(block.some((l) => l.startsWith('return;')), 'and the handler leaves');
    }
    assert.ok(fn.indexOf('setFollowUpPrompt({') > fn.lastIndexOf('} finally { setActivityModalSaving(false); }'), 'the follow-up is the success tail');
});

test('THE GUARD — in the data hooks, a catch leaves (the settings load\'s storage sweep falls back by design)', () => {
    const ALLOWED = { 'src/hooks/useSettings.js': 'clearing stale localStorage keys may fail; the load goes on' };
    const files = readdirSync(new URL('src/hooks/', ROOT)).filter((f) => f.endsWith('.js')).map((f) => `src/hooks/${f}`);
    const hits = files.flatMap(fallThroughs).filter((h) => !(h.split(':')[0] in ALLOWED));
    assert.deepEqual(hits, []);
    // the allowance names one catch, and it is still the storage sweep
    const allowed = fallThroughs('src/hooks/useSettings.js');
    assert.equal(allowed.length, 1);
    const line = Number(allowed[0].split(':')[1]);
    assert.match(read('src/hooks/useSettings.js').split(/\r?\n/)[line - 1], /^\s*\} catch\(e\) \{\}$/);
});
