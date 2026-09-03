// tests/forecast-call.test.mjs
//
// The Forecast ledger's editable Commit went through updateRepField → users PUT,
// and users.mjs sanitize() carried neither `commit` nor `bestCase`, so a typed
// commit was 0 again on refresh (state §0.80, handoff item 18). It is now a
// per-quarter call in profile.forecastCalls, validated by one pure module on both
// sides (state §0.84). The same batch gave the tab's inert buttons real
// destinations, Home's quota card the quarter's own figures, and the tab an
// export (item 19). The pure cases first; the source scans pin the wiring.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cleanForecastCalls, forecastCallOf, withForecastCall, bestCaseOf, QUARTER_KEY_RE } from '../src/utils/forecastCall.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

const KAREN = { id: 'usr_k', name: 'Karen Russell', forecastCalls: { '2026-Q4': { commit: 120000, bestCase: 180000 }, '2026-Q3': { commit: 50000 } } };

// ── the regression ───────────────────────────────────────────────────────────

test('REGRESSION: a commit is a quarter\'s call — Q4 FY2026\'s figure is not Q1 FY2027\'s', () => {
    assert.equal(forecastCallOf(KAREN, '2026-Q4').commit, 120000);
    assert.equal(forecastCallOf(KAREN, '2027-Q1').commit, null, 'the new quarter opens with no call, not last quarter\'s number');
    assert.equal(forecastCallOf(KAREN, '2026-Q3').commit, 50000);
    assert.equal(forecastCallOf(KAREN, '2026-Q3').bestCase, null);
});

test('a rep with no calls, or no rep at all, reads null — never a made-up number', () => {
    assert.deepEqual(forecastCallOf({ name: 'x' }, '2026-Q4'), { commit: null, bestCase: null });
    assert.deepEqual(forecastCallOf(null, '2026-Q4'), { commit: null, bestCase: null });
    assert.deepEqual(forecastCallOf({ forecastCalls: 'garbage' }, '2026-Q4'), { commit: null, bestCase: null });
});

// ── the validator (users.mjs sanitize runs it on every PUT) ──────────────────

test('cleanForecastCalls keeps only well-formed quarter keys and non-negative numbers', () => {
    const out = cleanForecastCalls({
        '2026-Q4': { commit: '120000', bestCase: 180000.5 },   // strings are read as numbers
        '2026-Q5': { commit: 1 },                              // no fifth quarter
        'Q4':      { commit: 1 },                              // no year
        '2026-Q1': { commit: -5, bestCase: 'abc' },            // both refused → quarter dropped
        '2026-Q2': { commit: 0 },                              // a typed 0 is a call
        '2026-Q3': 'not an object',
        '2025-Q4': null,
    });
    assert.deepEqual(out, { '2026-Q4': { commit: 120000, bestCase: 180000.5 }, '2026-Q2': { commit: 0 } });
});

test('cleanForecastCalls returns null for nothing, arrays, scalars and an emptied blob', () => {
    for (const v of [undefined, null, '', 0, 'x', [], [{ '2026-Q4': { commit: 1 } }], {}, { '2026-Q4': {} }, { '2026-Q4': { commit: null } }]) {
        assert.equal(cleanForecastCalls(v), null, JSON.stringify(v));
    }
});

test('the quarter key is quarters.js\'s: FY-Qn', () => {
    for (const k of ['2026-Q1', '2026-Q4', '1999-Q2']) assert.ok(QUARTER_KEY_RE.test(k), k);
    for (const k of ['2026-Q0', '2026-Q5', 'Q4 FY2026', '2026-q4', '26-Q4', '']) assert.ok(!QUARTER_KEY_RE.test(k), k);
});

// ── writing one quarter leaves the others alone ──────────────────────────────

test('withForecastCall sets one quarter\'s figure and carries every other quarter through', () => {
    const next = withForecastCall(KAREN, '2027-Q1', { commit: 90000 });
    assert.deepEqual(next, { '2026-Q4': { commit: 120000, bestCase: 180000 }, '2026-Q3': { commit: 50000 }, '2027-Q1': { commit: 90000 } });
    const patched = withForecastCall(KAREN, '2026-Q4', { bestCase: 200000 });
    assert.deepEqual(patched['2026-Q4'], { commit: 120000, bestCase: 200000 }, 'the other figure in the same quarter survives');
    assert.deepEqual(KAREN.forecastCalls['2026-Q4'], { commit: 120000, bestCase: 180000 }, 'the input is not mutated');
});

test('a blank clears the figure; a quarter with nothing left is removed; an empty blob is null', () => {
    assert.deepEqual(withForecastCall(KAREN, '2026-Q3', { commit: '' }), { '2026-Q4': { commit: 120000, bestCase: 180000 } });
    assert.equal(withForecastCall({ forecastCalls: { '2026-Q3': { commit: 1 } } }, '2026-Q3', { commit: null }), null);
    assert.deepEqual(withForecastCall({}, '2026-Q4', { commit: '75000' }), { '2026-Q4': { commit: 75000 } }, 'from nothing');
    assert.deepEqual(withForecastCall({}, '2026-Q4', { commit: -1 }), null, 'a negative is a refusal, not a 0');
});

test('withForecastCall refuses a malformed key rather than filing a call under it', () => {
    assert.throws(() => withForecastCall(KAREN, 'Q4', { commit: 1 }), /bad quarter key/);
    assert.throws(() => withForecastCall(KAREN, undefined, { commit: 1 }), /bad quarter key/);
});

// ── best case: the rep's figure, else a flagged estimate ─────────────────────

test('bestCaseOf is the rep\'s own figure when set, else 60% of open pipeline flagged as an estimate', () => {
    assert.deepEqual(bestCaseOf(KAREN, '2026-Q4', 500000), { value: 180000, estimated: false });
    assert.deepEqual(bestCaseOf(KAREN, '2026-Q3', 500000), { value: 300000, estimated: true });
    assert.deepEqual(bestCaseOf(null, '2026-Q3', '250000'), { value: 150000, estimated: true });
    assert.deepEqual(bestCaseOf({ forecastCalls: { '2026-Q3': { bestCase: 0 } } }, '2026-Q3', 500000), { value: 0, estimated: false }, 'a typed 0 is a call, not an estimate');
});

// ── the server stores it (the whole point of item 18) ────────────────────────

test('users.mjs sanitize carries forecastCalls through the shared validator', () => {
    const u = read('netlify/functions/users.mjs');
    assert.ok(u.includes("import { cleanForecastCalls } from '../../src/utils/forecastCall.js';"), 'one validator on both sides');
    assert.ok(u.includes('forecastCalls: cleanForecastCalls(data.forecastCalls),'), 'in the profile blob sanitize() rebuilds');
    // The blob is spread first by flatten(), so the key reaches the client as rep.forecastCalls.
    assert.ok(u.includes('...(row.profile || {}),'));
});

// ── the tab reads and writes per quarter ─────────────────────────────────────

const sm = read('src/Tabs/SalesManagerTab.jsx');

test('buildRepStats reads this quarter\'s call, never the never-stored rep.commit', () => {
    assert.ok(sm.includes("import { forecastCallOf, withForecastCall, bestCaseOf } from '../utils/forecastCall';"));
    assert.ok(sm.includes('const call     = forecastCallOf(rep, period.key);'));
    assert.ok(sm.includes('const commit   = call.commit ?? 0;'));
    assert.ok(sm.includes('const best     = bestCaseOf(rep, period.key, pipelineArr);'));
    assert.doesNotMatch(sm, /parseFloat\(rep\.commit\)/, 'the read of a field users.mjs never carried');
    assert.doesNotMatch(sm, /parseFloat\(rep\.bestCase\)/);
    assert.ok(sm.includes('bestCaseEstimated'), 'the estimate is flagged for the cell and the export');
});

test('the Commit and Best case cells write withForecastCall for the quarter, through the same users PUT as quotas', () => {
    assert.ok(sm.includes("updateRepField(rs.rep.id, 'forecastCalls', withForecastCall(rs.rep, period.key, { commit: v }))"));
    assert.ok(sm.includes("updateRepField(rs.rep.id, 'forecastCalls', withForecastCall(rs.rep, period.key, { bestCase: v }))"));
    assert.doesNotMatch(sm, /updateRepField\(rs\.rep\.id,'commit'/, 'the old write of a key the server dropped');
    assert.ok(sm.includes('function CallCell({ value, estimated, editing, onEdit, onCancel, onSave, color })'), 'one cell component, module scope');
    assert.ok(sm.indexOf('function CallCell(') < sm.indexOf('function ForecastTab('), 'declared at module scope above the tab');
    assert.ok(sm.includes('period={curQ}'), 'the ledger is handed the current fiscal quarter');
});

test('every button on the Sales Manager tab has a handler (the batch-6 class, §0.76)', () => {
    // `[^>]*` stops at the first `>` — inside an `onClick={() => …}` that is the
    // arrow, but `onClick=` has already been seen by then, so the test still holds.
    const tags = sm.match(/<button\b[^>]*>/gs) || [];
    assert.ok(tags.length >= 15, `found ${tags.length} buttons`);
    const inert = tags.filter(t => !/\bonClick=/.test(t));
    assert.deepEqual(inert, [], 'buttons with no onClick');
});

test('Coach → / Coach / Open coaching open the note dialog addressed to that rep; Pipeline / Their pipeline view as them', () => {
    const coach = sm.match(/showCoachingNote\(\{ recipientIds: \[rs\.rep\.id\] \}\)/g) || [];
    assert.equal(coach.length, 3, 'the Forecast ledger, the Team card and the Today tab');
    const pipe = sm.match(/setViewingRep\(rs\.rep\.name\); setActiveTab\('pipeline'\);/g) || [];
    assert.equal(pipe.length, 2, 'the Team card and the Today tab');
    assert.ok(sm.includes("const scheduleOneOnOne = (rep) => {"), 'Schedule 1:1 opens a new task in the rail');
    assert.ok(sm.includes("setTaskRailId('new');") && sm.includes("setTaskRailMode('new');"));
    assert.ok(sm.includes("fn: () => scheduleOneOnOne(rs.rep)"));
    assert.ok(sm.includes('onClick={showCoachingNote}'), 'the bare "+ Add coaching note" button is unchanged');
});

test('the tab has an export: the ledger as CSV, named by the quarter, through the app\'s exportToCSV', () => {
    assert.ok(sm.includes('exportToCSV(`forecast-${period.key}.csv`,'));
    assert.ok(sm.includes("'Best case basis'"), 'the export says whether best case was called or estimated');
    assert.ok(sm.includes("['Team total',"));
    assert.ok(sm.includes("{exportingCSV === 'forecast' ? 'Exporting…' : 'Export CSV'}"));
    assert.ok(sm.includes('onClick={exportLedger}'));
});

// ── the dialog honours a preset, filtered to what the caller may address ─────

test('showCoachingNote takes a { recipientIds } preset and the dialog pre-ticks it', () => {
    const app = read('src/App.jsx');
    assert.ok(app.includes("const showCoachingNote = (preset) => setCoachingNoteModal(Array.isArray(preset?.recipientIds) ? { recipientIds: preset.recipientIds } : {});"));
    const dlg = read('src/components/modals/CoachingNoteDialog.jsx');
    assert.ok(dlg.includes('initialRecipientIds = [] }) {'));
    assert.ok(dlg.includes('const [picked, setPicked] = useState(() => new Set(initialRecipientIds));'));
    assert.ok(dlg.includes("const preset = (coachingNoteModal.recipientIds || []).filter(id => reps.some(r => r.id === id));"), 'a Manager cannot be handed a rep outside their teams');
    assert.ok(dlg.includes('initialRecipientIds={preset}'));
});

// ── Home's quota card is this quarter's ──────────────────────────────────────

test('Home: the quota is the quarter\'s own figure and closed is won by close day inside it — not annual ÷ 4 against every win ever', () => {
    const home = read('src/Tabs/HomeTab.jsx');
    assert.ok(home.includes("import { userQuotaFor, closeDayInRange } from '../utils/pipelineReport';"));
    assert.ok(home.includes("import { openStagesOf, commitFallbackStages } from '../utils/stageOrder';"));
    assert.ok(home.includes('const quarterlyQuota = userQuotaFor(myUserObj, `Q${quarter}`);'));
    assert.doesNotMatch(home, /myAnnualQuota\s*\/\s*4/, 'annual ÷ 4 (a quarterly plan read $0)');
    assert.ok(home.includes("o.stage === 'Closed Won' && closeDayInRange(o, quarterStart, quarterEnd)"));
    assert.doesNotMatch(home, /\['Negotiation','Closing'/, 'a typed stage list naming stages no deal is in');
    assert.ok(home.includes('const commitStages   = commitFallbackStages(openStagesOf(settings));'));
    assert.ok(home.includes("o.forecastCategory === 'commit' || (!o.forecastCategory && commitStages.includes(o.stage))"));
    assert.ok(home.indexOf('const quarterStart = ') < home.indexOf('const quarterlyQuota'), 'the window is computed before the figures that use it');
    assert.equal((home.match(/const quarterStart = /g) || []).length, 1, 'one window, not two');
    assert.ok(home.includes('const qLabel = todayQk ? `Q${todayQk.q} FY${todayQk.fiscalYear}` : `Q${quarter}`;'), 'the card is labelled with the quarter it measures');
    assert.doesNotMatch(home, /getQuarterLabel\(q, opp\.forecastedCloseDate\)/, 'the first-forecast-bucket label');
});
