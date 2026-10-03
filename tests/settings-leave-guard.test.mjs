// The leave guard's "Save changes and continue" saves what is on screen (state
// §0.164 — Jeff: "settings save: do the fix"). Panels handed the guard their
// save in an effect keyed on [dirty], so it held the save from the FIRST edit —
// observed in Accelerep QA: "AB" typed, "A" saved. Three panels set it during
// render and never took it back, so a later panel with no save of its own could
// have the guard run the earlier panel's.
//
// The helper is the REAL file, run against a minimal React stand-in (the repo
// has no React test renderer); the panels are scanned for using it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const code = (src) => src.split(/\r?\n/).filter((l) => !l.trim().startsWith('//')).join('\n');

// ── the helper, run ────────────────────────────────────────────────────────
// useEffect alone: an effect runs after a render when it has no dependency list
// or a dependency changed, its last cleanup first; unmount runs every cleanup.
const dataUrl = (src) => 'data:text/javascript,' + encodeURIComponent(src);
const hookSrc = read('src/Tabs/settings/shared/useRegisterSave.js');
const IMPORT = "import { useEffect } from 'react';";
assert.equal(hookSrc.split(IMPORT).length - 1, 1, 'the helper imports useEffect from react exactly once');
const REACT = dataUrl('export const useEffect = (...a) => globalThis.__leaveGuard.useEffect(...a);');
const { useRegisterSave } = await import(dataUrl(hookSrc.replace(IMPORT, () => `import { useEffect } from "${REACT}";`)));

function createHost(component) {
    const slots = [];
    let cursor = 0;
    const effects = [];
    globalThis.__leaveGuard = {
        useEffect(fn, deps) {
            const k = cursor++;
            const slot = slots[k] || (slots[k] = { ran: false, deps: null, cleanup: null });
            if (slot.ran && deps && deps.every((d, j) => Object.is(d, slot.deps[j]))) return;
            effects.push(() => {
                if (typeof slot.cleanup === 'function') slot.cleanup();
                slot.cleanup = fn();
                slot.deps = deps;
                slot.ran = true;
            });
        },
    };
    return {
        render(props) {
            cursor = 0;
            effects.length = 0;
            component(props);
            for (const f of effects.splice(0)) f();
        },
        unmount() { for (const s of slots) if (typeof s.cleanup === 'function') s.cleanup(); },
    };
}

test('the guard holds the save of the LATEST render, none while clean, and none once the panel is gone', () => {
    const ref = { current: null };
    const host = createHost(({ dirty, save }) => useRegisterSave(ref, dirty, save));
    const first = () => 'saves "A"', second = () => 'saves "AB"';
    host.render({ dirty: false, save: () => 'nothing typed' });
    assert.equal(ref.current, null, 'a clean panel offers no save');
    host.render({ dirty: true, save: first });
    assert.equal(ref.current, first, 'the first edit');
    host.render({ dirty: true, save: second });
    assert.equal(ref.current, second, 'REGRESSION: the guard still holds the save from the first edit — "AB" typed, "A" saved');
    host.render({ dirty: false, save: second });
    assert.equal(ref.current, null, 'saved: clean again');
    host.render({ dirty: true, save: second });
    host.unmount();
    assert.equal(ref.current, null, 'REGRESSION: a closed panel leaves its save for the guard to run from the next panel');
});

test('a panel without a save slot is left alone', () => {
    const host = createHost(({ dirty, save }) => useRegisterSave(null, dirty, save));
    host.render({ dirty: true, save: () => 1 });
    host.unmount();
});

// ── the panels, scanned ────────────────────────────────────────────────────
const walk = (dir, out = []) => {
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p, out);
        else if (/\.(js|jsx)$/.test(name)) out.push(p);
    }
    return out;
};
const SETTINGS = fileURLToPath(new URL('src/Tabs/settings/', ROOT));

test('every panel that takes a save slot hands its save over through useRegisterSave — and nothing else assigns the slot', () => {
    const panels = walk(SETTINGS).filter((f) => /settingsSaveRef/.test(readFileSync(f, 'utf8')) && !f.endsWith('useRegisterSave.js'));
    assert.ok(panels.length >= 18, `the scan found the panels (${panels.length})`);
    for (const f of panels) {
        const s = code(readFileSync(f, 'utf8'));
        assert.ok(/useRegisterSave\(settingsSaveRef, dirty, handleSave(Ai)?\);/.test(s), `${f} does not hand over its save through useRegisterSave`);
        assert.ok(!/settingsSaveRef\.current\s*=/.test(s), `REGRESSION: ${f} assigns the save slot itself again`);
        assert.ok(s.includes("import { useRegisterSave } from '../shared/useRegisterSave.js';"), `${f} imports the helper`);
    }
    const hook = code(read('src/Tabs/settings/shared/useRegisterSave.js'));
    assert.ok(/settingsSaveRef\.current = dirty \? save : null;\s*return \(\) => \{ if \(settingsSaveRef\) settingsSaveRef\.current = null; \};\s*\}\);/.test(hook),
        'REGRESSION: the helper has a dependency list again (it froze the save at the first edit), or no cleanup');
});

test('Property types hands over its save, and a refused or failed save throws — the guard must not move on', () => {
    const p = code(read('src/Tabs/settings/dispatch/DispatchPropertyTypesDetail.jsx'));
    assert.ok(p.includes('export const DispatchPropertyTypesDetail = ({ settings, setSettings, onBack, setSettingsDirty, settingsSaveRef }) => {'));
    assert.ok(p.includes("        if (!clean.length) { const e = new Error('Keep at least one property type.'); setError(e.message); throw e; }"));
    assert.ok(/setError\(err\.message \|\| 'Save failed\.'\);\s*throw err;\s*\} finally \{\s*setSaving\(false\);/.test(p), 'rethrown, with the spinner cleared in finally');
    const av = code(read('src/Tabs/AdminView.jsx'));
    assert.ok(av.includes("if (id === 'dsp-proptypes') return <DispatchPropertyTypesDetail settings={settings} setSettings={setSettings} onBack={onBack} setSettingsDirty={setSettingsDirty} settingsSaveRef={settingsSaveRef}/>;"));
});
