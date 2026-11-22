// tests/tech-moves.test.mjs — THE GUARD for state §0.281 (OPEN_ITEMS §4.8, §0.278's found (b); Jeff, 21 Nov: "Next race
// finding"). A technician's status move was checked by where it went (TECH_STATUS_ALLOWED), never where it came from:
// a direct request completed a cancelled or unscheduled job, skipped a step, and a job card that had not seen a
// dispatcher's change — its jobs read once — offered its old moves and, after a 409, sent the same one again. Now one
// rule (src/utils/techMoves.js) holds the card's moves; the server checks the move from the job as it read it (which
// the write claims by its stamp, §0.278) and refuses any other with the job as stored, which the card shows; the
// write's own miss answers the same. Staged against the database in tests/integration/tech-moves.itest.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { TECH_MOVES, techMoveRefusal } from '../src/utils/techMoves.js';
import { writeRefusalOf, refusalError, landedBefore } from '../src/utils/refusalWords.js';

const read = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8').split('\r\n').join('\n');
const between = (s, a, b) => { const i = s.indexOf(a); assert.ok(i >= 0, a); const j = s.indexOf(b, i + a.length); assert.ok(j >= 0, b); return s.slice(i, j); };
const order = (s, ...lines) => lines.forEach((l, i) => { assert.ok(s.includes(l), `missing: ${l}`); if (i) assert.ok(s.indexOf(l) > s.indexOf(lines[i - 1]), `in order: ${l}`); });

test('techMoveRefusal: the field\'s moves — travel, arrive, pause or complete on site, resume — and none other; a status kept is no move', () => {
    for (const [from, tos] of Object.entries(TECH_MOVES)) for (const to of tos) assert.equal(techMoveRefusal(from, to), null, `${from} → ${to}`);
    for (const s of ['unscheduled', 'scheduled', 'en_route', 'on_site', 'paused', 'completed', 'cancelled']) assert.equal(techMoveRefusal(s, s), null, `${s} kept`);
    for (const [from, to] of [['cancelled', 'completed'], ['unscheduled', 'en_route'], ['completed', 'on_site'], ['scheduled', 'completed'], ['scheduled', 'on_site'],
        ['en_route', 'completed'], ['en_route', 'paused'], ['paused', 'completed'], ['cancelled', 'en_route'], [null, 'en_route']]) {
        assert.ok(techMoveRefusal(from, to), `${from} → ${to} refused`);
    }
    assert.equal(techMoveRefusal('cancelled', 'completed'), 'This job is cancelled — it cannot be marked completed from the field. Nothing was saved.');
    assert.equal(techMoveRefusal(null, 'on_site'), 'This job is unscheduled — it cannot be marked on site from the field. Nothing was saved.');
    assert.ok(Object.isFrozen(TECH_MOVES) && Object.values(TECH_MOVES).every(Object.isFrozen));
});

test('THE GUARD: the job card offers exactly the moves the rule allows — TECH_NEXT and TECH_MOVES one list', () => {
    const tab = read('src/Tabs/DispatchTab.jsx');
    const next = between(tab, 'const TECH_NEXT = {', '\n};');
    const offered = {};
    for (const m of next.matchAll(/^\s*(\w+):\s*\[(.*)\],?$/gm)) offered[m[1]] = [...m[2].matchAll(/to:\s*'(\w+)'/g)].map((x) => x[1]);
    assert.deepEqual(offered, Object.fromEntries(Object.entries(TECH_MOVES).map(([k, v]) => [k, [...v]])));
});

test('THE GUARD: the server checks a technician\'s move from the job as it read it — after the field and target checks, before the claimed write — and refuses any other with the job as stored; the write\'s own miss answers the same', () => {
    const src = read('netlify/functions/dispatch-jobs.mjs');
    assert.ok(src.includes("import { techMoveRefusal } from '../../src/utils/techMoves.js';"));
    const tech = between(between(src, "if (event.httpMethod === 'PUT') {", "if (event.httpMethod === 'DELETE') {"), 'if (tech) {', '// Each link it names anew');
    order(tech,
        'if (!techOnJob(currentJob, myTechId)) {',
        "if ('status' in data && !TECH_STATUS_ALLOWED.includes(data.status)) {",
        "const moveRefused = 'status' in data ? techMoveRefusal(current.status, data.status) : null;",
        "if (moveRefused) return { statusCode: 409, headers, body: JSON.stringify({ error: moveRefused, code: 'stale', job: currentJob }) };",
        'TECH_WRITABLE.forEach(f => { if (f in data) updates[f] = data[f]; });',
        'const [written] = await db.update(dispatchJobs).set(updates)');
    assert.ok(!/techMoveRefusal\([^)]*data\.(from|current)/.test(tech), 'REGRESSION: the move read from the body');
    // The review: a status the job already holds — done only when the job holds everything the body names, else stale.
    order(tech, "if (moveRefused) return",
        "if ('status' in data && data.status === (current.status || 'unscheduled')) {",
        "if (techPatchHolds(current, data)) return { statusCode: 409, headers, body: JSON.stringify({ error: `This job is ${kept} already.`, code: 'already', job: currentJob }) };",
        "return { statusCode: 409, headers, body: JSON.stringify({ error: `This job is ${kept} already — it changed since you opened it. Nothing was saved.`, code: 'stale', job: currentJob }) };",
        'const [written] = await db.update(dispatchJobs).set(updates)');
    const missed = between(src, 'async function missedTechJob(orgId, id, myTechId, data) {', '\n}\n');
    assert.ok(missed.includes("return { statusCode: 409, headers, body: JSON.stringify({ error: `This job changed since you opened it — it is ${status} now. Nothing was saved.`, code: 'stale', job }) };"));
});

// The card's update, RUN from its source: a stale refusal puts the job as stored on the card and says the words.
const mineSrc = between(read('src/Tabs/DispatchTab.jsx'), '    const updateMyJob = async (jobId, patch) => {', '\n    };');
const runMine = async (status, body) => {
    let jobs = [{ id: 'j1', status: 'on_site' }, { id: 'j2', status: 'scheduled' }];
    const busy = [];
    const fn = new Function('setTechBusyId', 'dbFetch', 'writeRefusalOf', 'landedBefore', 'setJobsRaw', 'refusalError', `${mineSrc}\n    };\nreturn updateMyJob;`)(
        (v) => busy.push(v), async () => ({ ok: status < 300, status, json: async () => body, headers: { get: () => 'application/json' } }),
        writeRefusalOf, landedBefore, (f) => { jobs = typeof f === 'function' ? f(jobs) : f; }, refusalError);
    let thrown = null;
    try { await fn('j1', { status: 'completed' }); } catch (e) { thrown = e; }
    return { jobs, thrown, busy };
};

test('THE GUARD (the review): the technician\'s job cards are listed by a component at module scope — never one made inside TechnicianView, which remounted every card on each press, losing its words and typed notes; a Complete\'s typed words stay drawn when refused', () => {
    const tab = read('src/Tabs/DispatchTab.jsx');
    const view = between(tab, 'const TechnicianView = (', '\n};\n');
    assert.ok(!/\bconst\s+[A-Z]\w*\s*=\s*\(/.test(view.slice('const TechnicianView = ('.length)), 'REGRESSION: a component defined inside TechnicianView');
    assert.ok(tab.indexOf('const TechJobSection = ({ title, list, empty, custName, blocks, onUpdate, busyId }) => (') < tab.indexOf('const TechnicianView = ('));
    assert.equal((view.match(/<TechJobSection /g) || []).length, 4);
    assert.ok(tab.includes("{(job.status === 'on_site' || done || completion !== (job.completionNotes || '')) && ("));
});

test('RUN: the job card — a move refused as stale puts the job as stored on the card (its buttons what it now offers) and says the server\'s words; another job\'s in the answer, or none, leaves the card', async () => {
    const stale = await runMine(409, { error: 'This job changed since you opened it — it is cancelled now. Nothing was saved.', code: 'stale', job: { id: 'j1', status: 'cancelled' } });
    assert.deepEqual(stale.jobs, [{ id: 'j1', status: 'cancelled' }, { id: 'j2', status: 'scheduled' }]);
    assert.equal(stale.thrown?.message, 'This job changed since you opened it — it is cancelled now. Nothing was saved.');
    assert.equal(stale.thrown.unknown, false, "the server's own refusal");
    assert.deepEqual(stale.busy, ['j1', null]);
    for (const body of [{ error: 'x', code: 'stale', job: { id: 'j2', status: 'cancelled' } }, { error: 'This job changed.' }, { error: 'x', job: { id: 'j1', status: 'cancelled' } }]) {
        const r = await runMine(409, body);
        assert.deepEqual(r.jobs, [{ id: 'j1', status: 'on_site' }, { id: 'j2', status: 'scheduled' }], JSON.stringify(body));
        assert.ok(r.thrown);
    }
    // An 'already' is done, as before — the job as stored, nothing said.
    const done = await runMine(409, { error: 'This job is completed already.', code: 'already', job: { id: 'j1', status: 'completed' } });
    assert.equal(done.thrown, null);
    assert.equal(done.jobs[0].status, 'completed');
});
