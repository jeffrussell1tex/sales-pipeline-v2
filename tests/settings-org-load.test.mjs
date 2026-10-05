// The settings hook holds ONE org's settings (state §0.162) and, since §0.170,
// writes nothing: each settings screen saves the keys it owns. Two cross-org
// audit findings (2 Oct) made this file: the autosave wrote after a failed load
// — the defaults, or an unscoped cached copy, over the org's real pipelines,
// stages and KPIs — and after the header's switcher changed the org, a slow
// answer for the org just left could land in the new one while the open
// Settings panel saved the old org's values with the new org's token. The
// autosave is gone (§0.170); the load's rules stay pinned here, and so does the
// absence of any write.
//
// The hook is the REAL file, read from disk and run with React and the fetch
// layer swapped for stand-ins (the repo has no React test renderer), so the
// mutation harness's edits to useSettings.js reach these tests. The view gate,
// App's wiring and the Sales Manager save are pinned at the source (§18b23).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const codeOnly = (src) =>
    src.split(/\r?\n/).filter((l) => !l.trim().startsWith('//')).join('\n');

// ── The stand-ins ──────────────────────────────────────────────────────────
// Each test gets its own copy of the hook, wired to its own world: React and
// '../utils/storage' become data: URL modules that forward to
// globalThis.__s162[world], so nothing one test leaves pending can reach a
// later test's world. Timers are node:test's mock timers: the hook's zero-delay
// timers (the ready flag, the roster's first-load delay) fire on each flush,
// the 500 ms roster delay after a switch never does, and nothing sleeps.
const dataUrl = (src) => 'data:text/javascript,' + encodeURIComponent(src);
const hookSrc = readFileSync(new URL('../src/hooks/useSettings.js', import.meta.url), 'utf8');
const swap = (src, from, to) => {
    assert.equal(src.split(from).length - 1, 1, `useSettings.js must contain ${from} exactly once`);
    return src.replace(from, to);
};
let worlds = 0;
async function loadHook(world) {
    const w = `globalThis.__s162[${JSON.stringify(world)}]`;
    const react = dataUrl(`
export const useState  = (...a) => ${w}.React.useState(...a);
export const useRef    = (...a) => ${w}.React.useRef(...a);
export const useEffect = (...a) => ${w}.React.useEffect(...a);
`);
    const storage = dataUrl(`
export const safeStorage = {
    getItem:    (k)    => ${w}.store.getItem(k),
    setItem:    (k, v) => ${w}.store.setItem(k, v),
    removeItem: (k)    => ${w}.store.removeItem(k),
};
export const dbFetch      = (...a) => ${w}.dbFetch(...a);
export const dbWrite      = (...a) => ${w}.dbWrite(...a);
export const waitForToken = ()     => ${w}.waitForToken();
`);
    // The defaults module is real (pure) — a data: URL module resolves it by its file URL.
    const defaults = new URL('../src/utils/settingsDefaults.js', import.meta.url).href;
    const wired = swap(swap(swap(hookSrc, "from 'react';", `from "${react}";`), "from '../utils/storage';", `from "${storage}";`),
        "from '../utils/settingsDefaults.js';", `from "${defaults}";`);
    return (await import(dataUrl(wired))).useSettings;
}

// One component, rendered the way React 18 renders it: state set from a
// callback re-renders once, on a microtask; an effect runs after a render in
// which its dependencies changed; a render with new arguments is App passing a
// new activeOrgId.
function createHost(hook) {
    const slots = [];
    let cursor = 0, args = [], api = null, queued = false, effects = [];
    const schedule = () => {
        if (queued) return;
        queued = true;
        queueMicrotask(() => { queued = false; render(); });
    };
    const React = {
        useState(init) {
            const k = cursor++;
            if (!slots[k]) {
                const slot = { value: typeof init === 'function' ? init() : init };
                slot.set = (u) => {
                    const next = typeof u === 'function' ? u(slot.value) : u;
                    if (Object.is(next, slot.value)) return;
                    slot.value = next;
                    schedule();
                };
                slots[k] = slot;
            }
            return [slots[k].value, slots[k].set];
        },
        useRef(init) {
            const k = cursor++;
            if (!slots[k]) slots[k] = { current: init };
            return slots[k];
        },
        useEffect(fn, deps) {
            const k = cursor++;
            const slot = slots[k] || (slots[k] = { deps: null, cleanup: null, ran: false });
            if (slot.ran && deps && deps.every((d, j) => Object.is(d, slot.deps[j]))) return;
            effects.push(() => {
                if (typeof slot.cleanup === 'function') slot.cleanup();
                slot.cleanup = fn();
                slot.deps = deps;
                slot.ran = true;
            });
        },
    };
    function render(...next) {
        if (next.length) args = next;
        cursor = 0;
        effects = [];
        api = hook(...args);
        const run = effects;
        effects = [];
        for (const f of run) f();
        return api;
    }
    return { React, render, get api() { return api; } };
}

const USER = { id: 'user_test' };   // loadSettings only needs a signed-in user
const SETTINGS = '/.netlify/functions/settings';
const USERS = '/.netlify/functions/users';
const A = 'org_A', B = 'org_B';
const pipelinesOf = (org) => [{ id: 'p_' + org, name: org + ' pipeline', color: '#2563eb' }];
const settingsOf = (org) => ({ settings: { pipelines: pipelinesOf(org), companyLegalName: org + ' Ltd' } });

// One test's world: the org the token speaks for (App's getter mints a token
// for the active org), the requests the hook sent that are not yet answered,
// every PUT it made, the keys it read, and a localStorage.
async function setup(t, { stored = {} } = {}) {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const world = 'w' + (++worlds);
    const env = {
        tokenOrg: null,
        pending: [],              // { url, org, resolve }
        writes: [],               // { org, body }
        reads: [],                // keys read from storage
        local: new Map(Object.entries(stored)),
        holdWrites: false,
        held: [],
    };
    env.releaseWrites = () => { env.held.splice(0).forEach((resolve) => resolve({ ok: true, status: 200, error: null })); };
    const store = {
        get length() { return env.local.size; },
        key: (i) => [...env.local.keys()][i] ?? null,
        getItem: (k) => { env.reads.push(k); return env.local.has(k) ? env.local.get(k) : null; },
        setItem: (k, v) => { env.local.set(k, String(v)); },
        removeItem: (k) => { env.local.delete(k); },
    };
    globalThis.localStorage = store;
    const useSettings = await loadHook(world);
    const host = createHost(useSettings);
    globalThis.__s162 = globalThis.__s162 || {};
    globalThis.__s162[world] = {
        React: host.React,
        store,
        dbFetch: (url) => new Promise((resolve) => env.pending.push({ url, org: env.tokenOrg, resolve })),
        dbWrite: (url, opts) => {
            env.writes.push({ org: env.tokenOrg, body: JSON.parse(opts.body) });
            if (env.holdWrites) return new Promise((resolve) => env.held.push(resolve));
            return Promise.resolve({ ok: true, status: 200, error: null });
        },
        waitForToken: async () => {},
    };
    const take = (url, org) => {
        const i = env.pending.findIndex((p) => p.url === url && p.org === org);
        assert.ok(i >= 0, `no unanswered ${url} request with ${org}'s token`);
        return env.pending.splice(i, 1)[0];
    };
    return {
        env,
        get api() { return host.api; },
        // An org becomes active: its token first (App's getter effect runs
        // before its load effect), then the render that hands the hook the org.
        activate(org) { env.tokenOrg = org; return host.render(org); },
        answer(url, org, body) { take(url, org).resolve({ ok: true, status: 200, json: async () => body }); },
        fail(url, org, status) { take(url, org).resolve({ ok: false, status, json: async () => ({}) }); },
        // Promise chains and renders settle, then the timers due by now fire —
        // four rounds, so a chain a timer starts settles too.
        flush: async () => {
            for (let i = 0; i < 4; i++) {
                await new Promise((r) => setImmediate(r));
                t.mock.timers.tick(1);
            }
            await new Promise((r) => setImmediate(r));
        },
    };
}

// ── The hook ───────────────────────────────────────────────────────────────

test('a failed first load records no org, keeps the reason, and saves nothing', async (t) => {
    t.mock.method(console, 'error', () => {});
    const w = await setup(t);
    w.activate(A);
    w.api.loadSettings(USER, false, A);
    await w.flush();
    w.fail(SETTINGS, A, 500);
    w.answer(USERS, A, { users: [{ id: 'u1', name: 'Rep One' }] });
    await w.flush();
    assert.equal(w.api.settingsOrgId, null, 'no org may be recorded for settings that never arrived');
    assert.match(w.api.settingsLoadError, /500/, 'the reason must reach App and the Settings view');
    w.api.setSettings((prev) => ({ ...prev, pipelines: [{ id: 'x', name: 'Typed after the failure' }] }));
    await w.flush();
    assert.deepEqual(w.env.writes, [], "an edit over the defaults must not PUT them over the org's real settings");
});

test("a successful load records its org — and a change to the app's copy writes nothing (state §0.170)", async (t) => {
    const w = await setup(t);
    w.activate(A);
    w.api.loadSettings(USER, false, A);
    await w.flush();
    w.answer(SETTINGS, A, settingsOf(A));
    w.answer(USERS, A, { users: [{ id: 'u1', name: 'Rep One' }] });
    await w.flush();
    assert.equal(w.api.settingsOrgId, A);
    assert.equal(w.api.settingsLoadError, '');
    assert.deepEqual(w.api.settings.pipelines, pipelinesOf(A));
    assert.deepEqual(w.env.writes, [], 'the load and the roster are not changes');
    w.api.setSettings((prev) => ({ ...prev, pipelines: [...prev.pipelines, { id: 'p2', name: 'Renewals' }] }));
    await w.flush();
    assert.deepEqual(w.env.writes, [],
        'the screen that changed it saves its own keys; the hook PUT the whole object, every key as it was at sign-in, over newer saves');
    assert.deepEqual(w.api.settings.pipelines.map((p) => p.name), ['org_A pipeline', 'Renewals'], 'the copy still changes');
    assert.deepEqual(Object.keys(w.api).sort(), ['loadSettings', 'setSettings', 'settings', 'settingsLoadError', 'settingsOrgId'],
        'no save error, ready flag or unused handlers — nothing here saves');
});

test('the defaults the first paint shows are the shared ones the server keeps', async (t) => {
    const w = await setup(t);
    w.activate(A);
    const { DEFAULT_SETTINGS } = await import(new URL('../src/utils/settingsDefaults.js', import.meta.url).href);
    assert.deepEqual(w.api.settings.pipelines, DEFAULT_SETTINGS.pipelines);
    assert.deepEqual(w.api.settings.quotaData, DEFAULT_SETTINGS.quotaData);
});

test("after a switch, the left org's late answers are dropped and nothing saves across orgs", async (t) => {
    const w = await setup(t);
    w.activate(A);
    w.api.loadSettings(USER, false, A);
    await w.flush();                                       // A's settings and roster requests are out
    w.activate(B);                                         // the header's switcher
    w.api.loadSettings(USER, true, B);
    await w.flush();
    assert.equal(w.api.settingsOrgId, null, 'a switch records no org until the new org loads');
    w.answer(SETTINGS, A, settingsOf(A));                  // A's answers arrive late
    w.answer(USERS, A, { users: [{ id: 'ua', name: 'A Rep' }] });
    await w.flush();
    assert.equal(w.api.settingsOrgId, null, "A's late answer must not be recorded as anyone's");
    assert.notDeepEqual(w.api.settings.pipelines, pipelinesOf(A), "A's pipelines must not land in B");
    assert.deepEqual(w.api.settings.users, [], "A's roster must not land in B");
    w.answer(SETTINGS, B, settingsOf(B));
    await w.flush();
    assert.equal(w.api.settingsOrgId, B);
    assert.deepEqual(w.api.settings.pipelines, pipelinesOf(B));
    w.api.setSettings((prev) => ({ ...prev, companyLegalName: 'B Ltd, renamed' }));
    await w.flush();
    assert.deepEqual(w.env.writes, [], 'nothing goes out from the hook, with any org\'s token');
});

test('an edit to the app\'s copy writes nothing, whichever org is active (state §0.170)', async (t) => {
    const w = await setup(t);
    w.activate(A);
    w.api.loadSettings(USER, false, A);
    await w.flush();
    w.answer(SETTINGS, A, settingsOf(A));
    await w.flush();
    w.activate(B);                                         // B is active; its load has not started
    w.api.setSettings((prev) => ({ ...prev, companyLegalName: 'typed during the switch' }));
    await w.flush();
    w.activate(A);
    w.api.setSettings((prev) => ({ ...prev, companyLegalName: 'typed on A' }));
    await w.flush();
    assert.deepEqual(w.env.writes, [], "A's settings once went out with B's token from here (§0.162); now nothing does");
});

test('no settings are read from localStorage, and the copies earlier builds kept are deleted', async (t) => {
    const w = await setup(t, { stored: {
        salesSettings: JSON.stringify({ pipelines: [{ id: 'c', name: 'Cached, unscoped' }] }),
        salesSettings_org_X: JSON.stringify({ pipelines: [{ id: 'x', name: "Another org's cache" }] }),
        salesUsers: '[]',
        accelerep_na_hidden: '[]',
    } });
    w.activate(A);
    assert.deepEqual(w.api.settings.pipelines.map((p) => p.name), ['New Business'],
        'the first paint is the defaults, never an unscoped cache');
    assert.deepEqual(w.env.reads.filter((k) => k.startsWith('salesSettings')), []);
    w.api.loadSettings(USER, false, A);
    assert.deepEqual([...w.env.local.keys()], ['accelerep_na_hidden'],
        'a first load drops the dead settings and users copies and keeps the rest');
    await w.flush();
    w.answer(SETTINGS, A, settingsOf(A));
    await w.flush();
    w.activate(B);
    w.api.loadSettings(USER, true, B);
    assert.deepEqual([...w.env.local.keys()], [], 'a switch starts clean');
});

test('a reload of the same org that fails keeps the loaded copy', async (t) => {
    t.mock.method(console, 'error', () => {});
    const w = await setup(t);
    w.activate(A);
    w.api.loadSettings(USER, false, A);
    await w.flush();
    w.answer(SETTINGS, A, settingsOf(A));
    await w.flush();
    w.api.loadSettings(USER, false, A);                    // App's load runs again for the same org
    await w.flush();
    assert.equal(w.api.settingsOrgId, A, 'a reload must not close the Settings view mid-edit');
    w.fail(SETTINGS, A, 503);
    await w.flush();
    assert.equal(w.api.settingsOrgId, A, "the copy in state is still this org's own");
    assert.equal(w.api.settingsLoadError, '');
    assert.deepEqual(w.api.settings.pipelines, pipelinesOf(A), 'the copy stays — Settings stays open');
});

test('switching away and back, a failed load is reported even for an org loaded before', async (t) => {
    t.mock.method(console, 'error', () => {});
    const w = await setup(t);
    w.activate(A);
    w.api.loadSettings(USER, false, A);
    await w.flush();
    w.answer(SETTINGS, A, settingsOf(A));
    await w.flush();
    w.activate(B);
    w.api.loadSettings(USER, true, B);
    w.activate(A);
    w.api.loadSettings(USER, true, A);
    await w.flush();
    w.answer(SETTINGS, B, settingsOf(B));                  // B's answer is late: dropped
    w.fail(SETTINGS, A, 500);
    await w.flush();
    assert.equal(w.api.settingsOrgId, null);
    assert.match(w.api.settingsLoadError, /500/, 'Settings must say the load failed, not wait forever');
    assert.notDeepEqual(w.api.settings.pipelines, pipelinesOf(B));
});

// ── The view, the wiring, the other writer ─────────────────────────────────

const tabSrc = codeOnly(readFileSync(new URL('../src/Tabs/SettingsTab.jsx', import.meta.url), 'utf8'));
const appSrc = codeOnly(readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8'));
const mgrSrc = codeOnly(readFileSync(new URL('../src/Tabs/SalesManagerTab.jsx', import.meta.url), 'utf8'));

test("Settings opens only on the active org's own settings, rebuilt for each org", () => {
    assert.ok(tabSrc.includes('const loaded = !!activeOrgId && settingsOrgId === activeOrgId;'),
        'a panel copies what it is handed when it opens: the previous org\'s settings, or the defaults after a failed load');
    assert.ok(/\{loaded\s*\?\s*<AdminView key=\{activeOrgId\} /.test(tabSrc),
        'without the key one AdminView, its open panel and its forms carry across a switch');
    assert.ok(tabSrc.includes(': <SettingsNotLoaded failed={!!settingsLoadError}/>}'));
});

test('App loads the active org, and ends unsaved Settings edits on a switch', () => {
    assert.ok(appSrc.includes('} = useSettings();'), 'the hook takes no org: it loads the one App names, and saves nothing (§0.170)');
    assert.ok(appSrc.includes('loadSettings(clerkUser, orgSwitched, organization?.id || null);'),
        'a load without its org loads nothing');
    assert.ok(/useEffect\(\(\) => \{\s*setSettingsDirty\(false\);\s*settingsSaveRef\.current = null;\s*\}, \[activeOrgId\]\);/.test(appSrc),
        "the leave guard's Save must not run the previous org's panel save after a switch");
    assert.ok(appSrc.includes('settingsOrgId, settingsLoadError,'), 'the context carries both to Settings and Sales Manager');
});

test("the Sales Manager tiers and SPIFFs save only over the loaded org's settings", () => {
    assert.ok(/const saveExtra = async \(patch, label\) => \{\s*if \(!settingsLoaded\) \{/.test(mgrSrc),
        'the patch is built from the settings on screen — the defaults until the load succeeds');
    // The saves are the page's since §0.170 (its drafts outlive the sub-tabs).
    assert.ok(mgrSrc.includes('const settingsLoaded = !!activeOrgId && settingsOrgId === activeOrgId;'));
});
