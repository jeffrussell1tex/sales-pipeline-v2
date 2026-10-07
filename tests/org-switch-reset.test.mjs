// §0.174 (Jeff: "push dev and start the next batch") — the org switch's two
// findings from §0.173's pane pass (state §9), fixed:
//   1. An open modal or rail kept the last org's record across a switch. The
//      modal hook held 60 values and no reset, and the UI and calendar hooks held
//      records, ids, selections and forms the same way — observed: a contact's
//      rail opened in Accelerep QA stayed open in Accelerep Test, showing QA's
//      contact. A save from it was refused (404, not the new org's record), but a
//      selection or a pending confirm would act on ids the new org does not have.
//   2. The Dispatch redirect decided in the render of a switch, on the role's rep
//      fallback (roleKnown) and the default settings (Dispatch off until the
//      org's settings load): anyone on Dispatch was sent to Home.
//
// Run here: the REAL useOrgBoundState and resetAllOf, through React's own
// renderer (react-dom/server — its render-phase updates stand in for a click and
// a switch). Scanned: the rest — which values the three hooks register, and
// App's two effects; the mutation harness runs unit suites only, so each rule is
// pinned here too.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { useOrgBoundState, resetAllOf } from '../src/hooks/useOrgBoundState.js';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const code = (src) => src.split(/\r?\n/).filter((l) => !l.trim().startsWith('//')).join('\n');
const between = (s, start, end) => {
    const a = s.indexOf(start);
    assert.ok(a >= 0, `missing: ${start}`);
    const b = s.indexOf(end, a + start.length);
    assert.ok(b > a, `no end after: ${start}`);
    return s.slice(a, b + end.length);
};
const linesOf = (block) => block.split('\n').map((l) => l.trim()).filter(Boolean);
const before = (s, first, second, why) => {
    const a = s.indexOf(first), b = s.indexOf(second);
    assert.ok(a >= 0, `missing: ${first}`);
    assert.ok(b >= 0, `missing: ${second}`);
    assert.ok(a < b, why);
};
// Each state a hook declares: its name, whether it is org-bound, and the list it is
// registered in (useModalState keeps what the reminders remember apart — §0.185).
const statesOf = (src) => [...src.matchAll(/const \[(\w+),\s+set\w+\]\s+= (useOrgBoundState\((resets|remembered), |useState\()/g)]
    .map((m) => ({ name: m[1], bound: m[2].startsWith('useOrgBoundState'), list: m[3] || null }));

// ── 1. The hook itself — run ─────────────────────────────────────────────────

test('useOrgBoundState: a value set since is put back by the reset; one reset registered per value', () => {
    const seen = [];
    let step = 0;
    function Probe() {
        const resets = [];
        const [record, setRecord] = useOrgBoundState(resets, null);
        const [form, setForm] = useOrgBoundState(resets, { name: '' });
        const resetOnOrgSwitch = resetAllOf(resets);
        seen.push({ record, form: form.name, resets: resets.length });
        if (step === 0) { step = 1; setRecord('ctc_qa_1'); setForm({ name: 'half-typed' }); }   // a rail opened, a form begun
        else if (step === 1) { step = 2; resetOnOrgSwitch(); }                                  // the switch
        return null;
    }
    renderToString(createElement(Probe));
    assert.deepEqual(seen, [
        { record: null, form: '', resets: 2 },
        { record: 'ctc_qa_1', form: 'half-typed', resets: 2 },
        { record: null, form: '', resets: 2 },
    ], 'the switch puts the record and the form back');
});

test('useOrgBoundState: a lazy initial is computed again on a reset — called with no argument, never handed to the setter as an updater', () => {
    const calls = [];
    const seen = [];
    let step = 0;
    function Probe() {
        const resets = [];
        const [ids] = useOrgBoundState(resets, (...args) => { calls.push(args.length); return new Set(['first']); });
        seen.push(ids);
        if (step === 0) { step = 1; resetAllOf(resets)(); }
        return null;
    }
    renderToString(createElement(Probe));
    assert.deepEqual(calls, [0, 0], 'React passes an updater the previous value; a lazy initial takes none');
    assert.equal(seen.length, 2);
    assert.notEqual(seen[0], seen[1], 'a fresh value, not the first one again');
    assert.deepEqual([...seen[1]], ['first']);
});

test('resetAllOf: one reset that runs every registered reset, in order — and none until it is called', () => {
    const ran = [];
    const resets = [() => ran.push('a'), () => ran.push('b'), () => ran.push('c')];
    const reset = resetAllOf(resets);
    assert.deepEqual(ran, [], 'building the reset runs nothing');
    reset();
    assert.deepEqual(ran, ['a', 'b', 'c']);
    reset();
    assert.deepEqual(ran, ['a', 'b', 'c', 'a', 'b', 'c'], 'every switch, not the first only');
});

// ── 2. Which values belong to the org — scanned ──────────────────────────────

const hookShape = (src, hook, { lists = ['resets'], reset = 'resetAllOf(resets)', from = './useOrgBoundState' } = {}) => {
    const c = code(src);
    for (const list of lists) assert.equal(c.split(`const ${list} = [];`).length - 1, 1, `${hook}: one list of ${list}`);
    assert.ok(c.includes(`    return {\n        resetOnOrgSwitch: ${reset},`), `${hook}: hands App its reset`);
    assert.ok(c.includes(`import { useOrgBoundState, resetAllOf } from '${from}';`), `${hook}: imports the hook`);
};

test('useModalState: every value is the org\'s — each modal, rail, confirm, undo and reminder (60), none plain; what the reminders remember (3) apart, which a layer\'s crash keeps', () => {
    const src = read('src/hooks/useModalState.js');
    hookShape(src, 'useModalState', { lists: ['resets', 'remembered'], reset: 'resetAllOf([...resets, ...remembered])', from: './useOrgBoundState.js' });
    assert.ok(code(src).includes('        closeLayers: resetAllOf(resets),'), 'a layer\'s crash closes what is open and keeps what the reminders remember (§0.185)');
    const states = statesOf(src);
    assert.equal(states.length, 60);
    assert.deepEqual(states.filter((s) => s.list === 'remembered').map((s) => s.name), ['dismissedDueTodayAlerts', 'snoozedDueAlerts', 'dismissedReminders'],
        'the alerts dismissed and snoozed, and the reminders fired: a crash that put them back brought every one back, with its chime');
    assert.deepEqual(states.filter((s) => !s.bound).map((s) => s.name), [],
        'a plain useState here outlives a switch — a modal or rail of the last org');
    assert.ok(!/\buseState\b/.test(code(src)), 'no plain useState at all');
    for (const name of ['contactRailId', 'accountRailId', 'taskRailId', 'documentRailId', 'viewingActivity', 'confirmModal', 'promptModal', 'undoToast', 'settingsOpenPanel', 'editingOpp']) {
        assert.ok(states.some((s) => s.name === name && s.bound), `${name} is org-bound`);
    }
});

// The UI and calendar hooks keep the values that are not the org's: the tab, the
// device and the view's preferences. A new state here must choose — org-bound, or
// added to its KEPT list with the reason it outlives a switch.
const UI_KEPT = ['activeTab', 'isMobile', 'showProfilePanel', 'accountsSortDir', 'accountsViewMode', 'contactsSortBy',
    'feedFilter', 'feedLastRead', 'pipelineSortField', 'pipelineSortDir', 'reportOppSortField', 'reportOppSortDir',
    'tasksExpandedSections', 'exportingCSV', 'exportingBackup', 'restoringBackup'];
const CAL_KEPT = ['calView', 'calOffset', 'calShowGcal', 'calShowCalls', 'calShowMeetings', 'calShowWeekends', 'calProvider',
    'logFromCalDateFrom', 'logFromCalDateTo'];

test('useUIState: a record, an id, a name or a form is the org\'s (34); the tab, the device and the view preferences stay (16)', () => {
    const src = read('src/hooks/useUIState.js');
    hookShape(src, 'useUIState');
    const states = statesOf(src);
    assert.deepEqual(states.filter((s) => !s.bound).map((s) => s.name), UI_KEPT,
        'a new plain state: decide whether it is the org\'s (useOrgBoundState) or a view preference (add it to UI_KEPT)');
    assert.equal(states.filter((s) => s.bound).length, 34);
    for (const name of ['activePipelineId', 'viewingContact', 'viewingAccount', 'viewingTask', 'viewingRep', 'selectedAccounts', 'selectedContacts',
        'myProfile', 'profileForm', 'notifications', 'globalSearch', 'quickLogForm', 'settingsView', 'quotaForecastFilter', 'commissionsFilter']) {
        assert.ok(states.some((s) => s.name === name && s.bound), `${name} is org-bound`);
    }
});

test('useCalendarState: the org\'s events, connections, deals and rep are the org\'s (22); the view\'s choices stay (9)', () => {
    const src = read('src/hooks/useCalendarState.js');
    hookShape(src, 'useCalendarState');
    const states = statesOf(src);
    assert.deepEqual(states.filter((s) => !s.bound).map((s) => s.name), CAL_KEPT,
        'a new plain state: decide whether it is the org\'s (useOrgBoundState) or the view\'s choice (add it to CAL_KEPT)');
    assert.equal(states.filter((s) => s.bound).length, 22);
    for (const name of ['calendarEvents', 'calendarConnected', 'calRepFilter', 'userCalConnections', 'orgCalConnections',
        'logFromCalOppMap', 'loggedCalendarIds', 'meetingPrepOppId', 'calConnectResult']) {
        assert.ok(states.some((s) => s.name === name && s.bound), `${name} is org-bound`);
    }
});

// ── 3. App's wiring — scanned ────────────────────────────────────────────────

test('App: the reset runs on a switch only — from one org to another or to none, never on the first load — and puts back all three hooks', () => {
    const app = code(read('src/App.jsx'));
    const block = between(app, 'const uiOrgRef = useRef(null);', '}, [activeOrgId]);');
    assert.deepEqual(linesOf(block), [
        'const uiOrgRef = useRef(null);   // the org the open UI belongs to',
        'useEffect(() => {',
        'const was = uiOrgRef.current;',
        'uiOrgRef.current = activeOrgId;',
        'if (!was || was === activeOrgId) return;',
        'modalState.resetOnOrgSwitch();',
        'uiState.resetOnOrgSwitch();',
        'calState.resetOnOrgSwitch();',
        '}, [activeOrgId]);',
    ], 'the ref moves before the check (or the first load never arms it); the first load and a re-render keep what is open');
    assert.equal(app.split('resetOnOrgSwitch()').length - 1, 3, 'called from this effect only — a layer\'s crash closes the layers alone (closeLayersAfterCrash, §0.185)');
});

test('App: the reset is declared before App\'s other effects, so what they start for the new org in the switch\'s commit is not put back', () => {
    const app = code(read('src/App.jsx'));
    const hooksEnd = app.indexOf('const calState = useCalendarState();');
    const reset = app.indexOf('const uiOrgRef = useRef(null);');
    assert.ok(hooksEnd >= 0 && reset > hooksEnd, 'after the three hooks it resets');
    assert.ok(!app.slice(hooksEnd, reset).includes('useEffect('), 'the first effect after the hooks');
    before(app, 'const uiOrgRef = useRef(null);', 'const calendarOrgRef = useRef(null);',
        'before the calendar\'s auto-fetch — its fetch sets the loading flag in the same commit');
    before(app, 'const uiOrgRef = useRef(null);', 'const loadData = async () => {', 'before the main load');
    // The effects declared above it set no org-bound value: the first org's
    // auto-activation and the token getter.
    assert.equal(app.slice(0, reset).split('useEffect(').length - 1, 2,
        'an effect added above the reset: if it sets an org-bound value, the reset puts it back in the switch\'s commit');
});

test('App: the Dispatch redirect decides on this org\'s role and settings only', () => {
    const app = code(read('src/App.jsx'));
    assert.ok(app.includes("useEffect(() => {\n        if (!roleKnown || settingsOrgId !== activeOrgId) return;"), 'the gate is the effect\'s first statement');
    const block = between(app, 'if (!roleKnown || settingsOrgId !== activeOrgId) return;',
        '}, [settings.dispatchEnabled, settings.repsCanUseDispatch, userRole, roleKnown, settingsOrgId]);');
    assert.deepEqual(linesOf(block), [
        'if (!roleKnown || settingsOrgId !== activeOrgId) return;',
        "if (activeTab === 'dispatch' && !canUseDispatch(userRole, settings)) {",
        "setActiveTab('home');",
        '}',
        '}, [settings.dispatchEnabled, settings.repsCanUseDispatch, userRole, roleKnown, settingsOrgId]);',
    ], 'it re-runs when this org\'s role and settings land, and decides then');
    assert.ok(app.includes('const roleKnown = !!myProfile && !!activeOrgId && myProfileOrgId === activeOrgId;'),
        'roleKnown: the profile in state is this org\'s');
});
