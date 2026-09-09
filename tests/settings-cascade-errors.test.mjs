// tests/settings-cascade-errors.test.mjs
//
// The last three settings writes whose failure went to the console and nowhere
// else (state §0.109 — the "settings panels swallow save errors" backlog item,
// closed): the team delete and the territory delete cascades, and the lead
// conversion benchmark save. Each had an error surface the panel already
// rendered (or a banner added here) and a catch that only console.error'd, so a
// refused PUT — a 403 from the Admin-only settings gate, a 500 — looked like
// success. Guide §18b1 / §18b32: a catch whose only body is console.error is
// never sufficient for a write; the error is shown where the user is looking.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const code = (src) => src.split(/\r?\n/).filter(l => !l.trim().startsWith('//')).join('\n');

// The body of `const <name> = (` … up to the next top-level `const ` at the same
// indent — enough to scope an assertion to one handler.
const blockOf = (src, name) => {
    const at = src.indexOf(`    const ${name} = (`);
    assert.ok(at >= 0, `${name} not found`);
    const next = src.indexOf('\n    const ', at + 1);
    return src.slice(at, next < 0 ? src.length : next);
};

for (const [file, handler, noun] of [
    ['src/Tabs/settings/people/TeamsDetail.jsx',       'handleDelete', 'Team'],
    ['src/Tabs/settings/people/TerritoriesDetail.jsx', 'handleDelete', 'Territory'],
]) {
    test(`${file}: a refused ${noun.toLowerCase()} delete is shown above the table, and a member row that did not update is named`, () => {
        const s = code(read(file));
        assert.ok(s.includes("import { putSettings } from '../shared/saveSettings.js';"), 'uses the shared save, which throws on non-2xx');
        const del = blockOf(s, handler);
        assert.ok(del.includes('await putSettings({'), 'the settings PUT goes through putSettings');
        assert.ok(del.includes(`setDeleteErr(\`${noun} not deleted — \${e.message}\`)`), 'a refused PUT is reported');
        assert.ok(del.includes(`setDeleteErr(\`${noun} deleted, but \${failed.length}`), 'a cascade failure is reported by name');
        assert.ok(!/console\.error/.test(del), 'nothing in the delete handler goes to the console alone');
        assert.ok(!del.includes('if (res.ok) {'), 'the silent-on-failure shape is gone');
        assert.ok(s.includes('{deleteErr && ('), 'the banner renders');
        assert.ok(s.includes("const [deleteErr,"), 'the state exists');
    });
}

test('LeadConversionDetail: a refused benchmark save sets the banner it already rendered', () => {
    const s = code(read('src/Tabs/settings/salesProcess/LeadConversionDetail.jsx'));
    assert.ok(s.includes("setSaveError(e.message || 'Save failed.');"), 'the catch surfaces the message');
    assert.ok(!s.includes("console.error('Failed to save lead conv benchmarks'"), 'the console-only catch is gone');
    assert.ok(s.includes('{saveError && ('), 'the banner is still rendered');
});

test('no settings panel keeps a write whose catch is console.error alone', () => {
    // The shape the guide forbids: `catch (e) { console.error(...); }` with
    // nothing else in the block, on a file that writes. Read-only fetches
    // (stats, calendars) are not writes and are not in this list.
    for (const file of [
        'src/Tabs/settings/people/TeamsDetail.jsx',
        'src/Tabs/settings/people/TerritoriesDetail.jsx',
        'src/Tabs/settings/salesProcess/LeadConversionDetail.jsx',
        'src/Tabs/settings/salesProcess/FlatListDetail.jsx',
    ]) {
        const s = code(read(file));
        const m = s.match(/catch\s*\(\s*\w*\s*\)\s*\{\s*console\.error\([^)]*\);?\s*\}/g) || [];
        assert.deepEqual(m, [], `${file} still has a console-only catch: ${m.join(' | ')}`);
    }
});
