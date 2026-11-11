// tests/legacy-dispatch-import.test.mjs — the "Import from the old settings list" card (Settings → Dispatch →
// Vehicles & equipment; state §0.243, docs/design/save-cleanup Part 6; Jeff, 10 Nov, Q7: "Send only what's missing
// (Recommended)").
//
// The import's rows carry ids derived from the old entries' (`imp_<id>`, a unit `imp_<id>_u<n>`) and the two POSTs
// are designed upserts (§0.201), so every press re-sent every row and REPLACED the stored one: an edited vehicle's
// make, VIN and service dates went back to null, a checked-out unit was checked in — and the card never went, its
// count the whole old list, its words "Re-running is safe". Now only the rows the tables do not hold are sent; the
// card counts them and goes once none are; a vehicle deleted after an import counts again; with no answered read of
// the tables (every row would look missing) the import refuses and says so; a refusal says the server's words.
// RUN: planImport / importCardShows (src/utils/legacyDispatchImport.js) and the screen's readHeld, extracted and run
// with a stubbed dbFetch. WIRING (§18b23 — the screen needs React and a DOM): DispatchVehiclesDetail.jsx.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    planImport, importCardShows, plannedVehicleImports, plannedEquipmentImports, IMPORT_UNREAD,
} from '../src/utils/legacyDispatchImport.js';
import { readRefusal } from '../src/utils/refusalWords.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const code = (src) => src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
const between = (s, a, b) => { const i = s.indexOf(a); assert.ok(i >= 0, a); const j = s.indexOf(b, i + a.length); assert.ok(j > i, b); return s.slice(i, j); };
const count = (s, needle) => s.split(needle).length - 1;
const order = (s, ...needles) => {
    let at = -1;
    for (const n of needles) { const i = s.indexOf(n, at + 1); assert.ok(i > at, `in order: ${n}`); at = i; }
};

const SCREEN = 'src/Tabs/settings/dispatch/DispatchVehiclesDetail.jsx';

// An org's old lists: two vans, a pressure tester ×2, a ladder.
const LEGACY = Object.freeze({
    vehicles: [
        { id: 'v1', name: 'Van 1', type: 'Van', plate: 'ABC-1' },
        { id: 'v2', name: '  Van 2 ', kind: 'truck', notes: 'blue' },
        { id: 'v3', name: '   ' },                       // no name: makes no row
    ],
    equipment: [
        { id: 'e1', name: 'Pressure Tester', qty: '2' },
        { id: 'e2', name: 'Ladder' },
    ],
});
const ids = (rows) => rows.map((r) => r.id);

test('RUN the rows: ids derived from the old entries, a quantity makes that many units', () => {
    assert.deepEqual(ids(plannedVehicleImports(LEGACY.vehicles)), ['imp_v1', 'imp_v2']);
    assert.deepEqual(plannedVehicleImports(LEGACY.vehicles)[1], { id: 'imp_v2', name: 'Van 2', type: 'truck', licensePlate: null, notes: 'blue' });
    assert.deepEqual(ids(plannedEquipmentImports(LEGACY.equipment)), ['imp_e1_u1', 'imp_e1_u2', 'imp_e2_u1']);
    assert.equal(plannedEquipmentImports(LEGACY.equipment)[1].name, 'Pressure Tester #2');
    assert.equal(plannedEquipmentImports(LEGACY.equipment)[1].category, 'Pressure Tester');
    // A list that is not a list makes nothing (a settings row without the key, or a malformed one).
    assert.deepEqual(plannedVehicleImports(undefined), []);
    assert.deepEqual(plannedEquipmentImports({ not: 'a list' }), []);
});

test('RUN the plan: all new — every row is to send', () => {
    const plan = planImport(LEGACY, { vehicles: [], equipment: [] });
    assert.equal(plan.known, true);
    assert.deepEqual(ids(plan.vehicles), ['imp_v1', 'imp_v2']);
    assert.deepEqual(ids(plan.equipment), ['imp_e1_u1', 'imp_e1_u2', 'imp_e2_u1']);
    assert.equal(plan.count, 5);
    assert.equal(plan.total, 5);
    assert.equal(importCardShows(plan), true);
});

test('RUN the plan: some already in — only the missing are sent, a held row never again', () => {
    // imp_v1 was imported and edited since (a make, a VIN); imp_e1_u1 is checked out. Neither may be sent:
    // the POST would replace them whole.
    const held = {
        vehicles: [{ id: 'imp_v1', name: 'Van 1', make: 'Ford', vin: '1FT…' }, { id: 'veh_other', name: 'Own van' }],
        equipment: [{ id: 'imp_e1_u1', name: 'Pressure Tester #1', checkedOutToId: 'tech_1' }],
    };
    const plan = planImport(LEGACY, held);
    assert.deepEqual(ids(plan.vehicles), ['imp_v2']);
    assert.deepEqual(ids(plan.equipment), ['imp_e1_u2', 'imp_e2_u1']);
    assert.equal(plan.count, 3);
    assert.equal(plan.total, 5);
    // The rows sent are the old list's, untouched by what the table holds.
    assert.deepEqual(plan.vehicles[0], plannedVehicleImports(LEGACY.vehicles)[1]);
    // Ids are matched per table: a vehicle's id never stands for an equipment unit's.
    assert.equal(planImport(LEGACY, { vehicles: [{ id: 'imp_e2_u1' }], equipment: [] }).equipment.some((r) => r.id === 'imp_e2_u1'), true);
});

test('RUN the plan: all in — nothing to send, and the card goes', () => {
    const held = {
        vehicles: [{ id: 'imp_v1' }, { id: 'imp_v2' }],
        equipment: [{ id: 'imp_e1_u1' }, { id: 'imp_e1_u2' }, { id: 'imp_e2_u1' }],
    };
    const plan = planImport(LEGACY, held);
    assert.equal(plan.known, true);
    assert.equal(plan.count, 0);
    assert.deepEqual(plan.vehicles, []);
    assert.deepEqual(plan.equipment, []);
    assert.equal(importCardShows(plan), false);
    assert.equal(importCardShows(plan, { loadFailed: false }), false);
    // ...but while its words are open (kept until closed), or an import runs, it stays.
    assert.equal(importCardShows(plan, { said: true }), true);
    assert.equal(importCardShows(plan, { importing: true }), true);
    // An org with no old lists: never drawn.
    assert.equal(importCardShows(planImport({}, { vehicles: [], equipment: [] })), false);
});

test('RUN the plan: a vehicle deleted after an import counts again (Q7\'s own words)', () => {
    const afterDelete = {
        vehicles: [{ id: 'imp_v1' }],   // imp_v2 deleted since
        equipment: [{ id: 'imp_e1_u1' }, { id: 'imp_e1_u2' }, { id: 'imp_e2_u1' }],
    };
    const plan = planImport(LEGACY, afterDelete);
    assert.deepEqual(ids(plan.vehicles), ['imp_v2']);
    assert.equal(plan.count, 1);
    assert.equal(importCardShows(plan), true);
});

test('RUN the plan: a failed load is refused — nothing to send, nothing counted, the card says so', () => {
    for (const held of [null, undefined, {}, { vehicles: [] }, { equipment: [] }, { vehicles: null, equipment: [] },
        { vehicles: [], equipment: 'not a list' }]) {
        const plan = planImport(LEGACY, held);
        assert.equal(plan.known, false, JSON.stringify(held));
        assert.deepEqual(plan.vehicles, []);
        assert.deepEqual(plan.equipment, []);
        assert.equal(plan.count, 0);
        assert.equal(plan.total, 5);
    }
    const unread = planImport(LEGACY, null);
    // A load still out: no card (nothing is known yet, nothing to say).
    assert.equal(importCardShows(unread), false);
    // A load that failed: the card is drawn, to say what cannot be counted.
    assert.equal(importCardShows(unread, { loadFailed: true }), true);
    // ...unless the old lists make no row at all.
    assert.equal(importCardShows(planImport({ vehicles: [{ id: 'x', name: '' }] }, null), { loadFailed: true }), false);
    assert.match(IMPORT_UNREAD, /couldn't be read/);
    assert.match(IMPORT_UNREAD, /didn't run/);
});

// readHeld, extracted from the screen and run with a stubbed dbFetch: the plan's read of the tables as they are now.
const readHeldOf = (dbFetch) => {
    const s = read(SCREEN);
    const unstoppedText = between(s, 'const unstopped = ', '\n');
    const fnText = between(s, 'const readHeld = async () => {', '\n};\n') + '\n};';
    return new Function('dbFetch', 'readRefusal', `${unstoppedText}\n${fnText}\nreturn readHeld;`)(dbFetch, readRefusal);
};
const answer = (status, body, { json = true } = {}) => ({
    ok: status >= 200 && status < 300, status,
    json: async () => { if (!json) throw new SyntaxError("Unexpected token '<'"); return body; },
});

test('RUN readHeld: the tables as answered, or the words of the read that failed', async () => {
    const asked = [];
    const ok = readHeldOf(async (url) => {
        asked.push(url);
        return url.endsWith('dispatch-vehicles') ? answer(200, { vehicles: [{ id: 'imp_v1' }] }) : answer(200, { equipment: [] });
    });
    assert.deepEqual(await ok(), { vehicles: [{ id: 'imp_v1' }], equipment: [] });
    assert.deepEqual(asked, ['/.netlify/functions/dispatch-vehicles', '/.netlify/functions/dispatch-equipment']);

    // A refusal: the server's words, never "HTTP 409".
    const refused = readHeldOf(async (url) => (url.endsWith('dispatch-vehicles')
        ? answer(403, { error: 'Dispatch is turned off for this workspace.' }) : answer(200, { equipment: [] })));
    await assert.rejects(refused(), (err) => err.message === "the vehicles couldn't be read (Dispatch is turned off for this workspace)");
    const bare = readHeldOf(async (url) => (url.endsWith('dispatch-equipment') ? answer(502, null, { json: false }) : answer(200, { vehicles: [] })));
    await assert.rejects(bare(), (err) => err.message === "the equipment couldn't be read (The server returned 502)");
    // Offline.
    const offline = readHeldOf(async () => { throw new TypeError('Failed to fetch'); });
    await assert.rejects(offline(), (err) => err.message === 'the server could not be reached');
    // A 200 whose body is not JSON.
    const garbled = readHeldOf(async () => answer(200, null, { json: false }));
    await assert.rejects(garbled(), (err) => /answer couldn't be read/.test(err.message));
    // A 200 with no list: the plan is not known (refused), never "all missing".
    const empty = readHeldOf(async () => answer(200, {}));
    assert.equal(planImport(LEGACY, await empty()).known, false);
});

// The panel's load, extracted and run with a stubbed dbFetch (§0.243's re-check): a technicians' refusal failed the
// whole load, so the import card said the vehicles and equipment couldn't be read and refused an import that could run.
const loadOf = (answers) => {
    const s = read(SCREEN);
    const unstoppedText = between(s, 'const unstopped = ', '\n');
    const head = 'const load = useCallback(async () => {';
    const body = between(s, head, '}, []);').slice(head.length);
    const st = { loading: null, loadError: null, techsError: null, vehicles: null, equipment: null, techs: null, fleetLoaded: null };
    const set = (k) => (v) => { st[k] = v; };
    const fn = new Function('dbFetch', 'readRefusal', 'setLoading', 'setLoadError', 'setTechsError', 'setVehicles', 'setEquipment', 'setTechs', 'setFleetLoaded',
        `${unstoppedText}\nreturn async () => {${body}};`)(
        async (url) => answers[url.split('/').pop()], readRefusal,
        set('loading'), set('loadError'), set('techsError'), set('vehicles'), set('equipment'), set('techs'), set('fleetLoaded'));
    return async () => { await fn(); return st; };
};
const fleet = { 'dispatch-vehicles': answer(200, { vehicles: [{ id: 'imp_v1' }] }), 'dispatch-equipment': answer(200, { equipment: [] }) };

test('RUN load: a technicians\' refusal is said on its own — the fleet still loads, and the import plans and runs', async () => {
    const st = await loadOf({ ...fleet, 'dispatch-technicians': answer(500, { error: 'Internal error', requestId: 'req_7' }) })();
    assert.equal(st.fleetLoaded, true, 'REGRESSION: a technicians\' refusal failed the fleet');
    assert.equal(st.loadError, '', 'the fleet\'s error is not set');
    assert.deepEqual(st.vehicles, [{ id: 'imp_v1' }]);
    assert.deepEqual(st.equipment, []);
    assert.equal(st.techs, null, 'their names stay as last read');
    assert.equal(st.techsError, "The technicians couldn't be read (Internal error (ref req_7)), so who is assigned to what may not show. Refresh to try again.");
    assert.equal(st.loading, false);
    // The import plans by the vehicles and equipment alone: known, and only the missing rows.
    const plan = planImport(LEGACY, { vehicles: st.vehicles, equipment: st.equipment });
    assert.equal(plan.known, true);
    assert.deepEqual(ids(plan.vehicles), ['imp_v2']);
    // A technicians' answer that is not JSON: the same.
    const garbled = await loadOf({ ...fleet, 'dispatch-technicians': answer(200, null, { json: false }) })();
    assert.equal(garbled.fleetLoaded, true);
    assert.match(garbled.techsError, /answer couldn't be read/);
    // All answered: no words, the technicians read.
    const all = await loadOf({ ...fleet, 'dispatch-technicians': answer(200, { technicians: [{ id: 't1' }] }) })();
    assert.deepEqual([all.fleetLoaded, all.loadError, all.techsError, all.techs], [true, '', '', [{ id: 't1' }]]);
});

test('RUN load: a vehicles or equipment refusal still fails the fleet, in the server\'s words', async () => {
    const v = await loadOf({ ...fleet, 'dispatch-vehicles': answer(403, { error: 'Dispatch is turned off for this workspace.' }), 'dispatch-technicians': answer(200, { technicians: [] }) })();
    assert.equal(v.fleetLoaded, false);
    assert.equal(v.loadError, "The vehicles couldn't be read (Dispatch is turned off for this workspace).");
    assert.equal(v.vehicles, null, 'nothing listed from a refusal');
    const e = await loadOf({ ...fleet, 'dispatch-equipment': answer(502, null, { json: false }), 'dispatch-technicians': answer(500, {}) })();
    assert.equal(e.fleetLoaded, false);
    assert.equal(e.loadError, "The equipment couldn't be read (The server returned 502).");
    assert.match(e.techsError, /The technicians couldn't be read \(The server returned 500\)/, 'both said');
});

test('WIRING: the screen plans with the lifted helper, from the tables as read now, and refuses with no answered read', () => {
    const s = code(read(SCREEN));
    assert.ok(s.includes("import { planImport, importCardShows, IMPORT_UNREAD } from '../../../utils/legacyDispatchImport.js';"));
    assert.ok(s.includes("import { readRefusal } from '../../../utils/refusalWords.js';"));
    // The old in-file planners are gone: one rule, the helper's.
    assert.equal(count(s, 'plannedVehicleImports'), 0);
    assert.equal(count(s, 'plannedEquipmentImports'), 0);
    assert.equal(count(s, 'importPending'), 0);

    // The load says whether the tables answered. Moved pin (§0.243's re-check): `setTechs(tJson.technicians    || []);`
    // before setFleetLoaded(true) became the technicians read apart, first — RUN below.
    const load = between(s, 'const load = useCallback(async () => {', '}, []);');
    order(load, "setTechsError('');", 'if (!tRes.ok) {', 'if (tJson) setTechs(tJson.technicians || []);',
        'setEquipment(eJson.equipment  || []);', 'setFleetLoaded(true);', '} catch (err) {', 'setLoadError(', 'setFleetLoaded(false);');
    // The technicians' words are drawn beside the fleet's.
    assert.ok(s.includes("<CategoryDetailChrome error={[loadError, techsError].filter(Boolean).join(' ')} crumb="));

    const run = between(s, 'const runImport = async () => {', 'const importPlan = ');
    // Refused first — before anything is set running or sent — while the load failed or never answered.
    order(run, 'if (loadError || !fleetLoaded) { setImportError(IMPORT_UNREAD); return; }', 'setImporting(true);',
        'const askedOrg = requestOrg();',
        'plan = planImport({ vehicles: legacyVehicles, equipment: legacyEquipment }, await readHeld());',
        'if (!stillOrg(askedOrg)) return;',
        'if (!plan.known) { setImportError(IMPORT_UNREAD); setImporting(false); return; }',
        'for (const row of plan.vehicles) {', 'for (const row of plan.equipment) {', 'await load();');
    // Every POST checks the org first (state §0.175).
    assert.equal(count(run, 'if (!stillOrg(askedOrg)) return;'), 5);
    order(run, 'for (const row of plan.vehicles) {', 'if (!stillOrg(askedOrg)) return;', "dbFetch('/.netlify/functions/dispatch-vehicles', {");
    order(run, 'for (const row of plan.equipment) {', 'if (!stillOrg(askedOrg)) return;', "dbFetch('/.netlify/functions/dispatch-equipment', {");
    // A refusal: the server's words, not "HTTP 409".
    assert.equal(count(run, 'failed.push(`${row.name}: ${unstopped(await readRefusal(res))}`); continue;'), 2);
    assert.equal(count(run, "'HTTP '"), 0);
    // A failed row is an error, kept until closed; "Re-running is safe" is gone from the screen.
    assert.ok(run.includes('if (failed.length) {\n            setImportError(`Imported ${ok} of ${plan.count}.'));
    assert.equal(count(s, 'Re-running is safe'), 0);
    assert.equal(count(s, 're-running the import cannot create duplicates'), 0);

    // The card: counted against the tables as loaded, known only when a load answered; drawn by the helper's rule.
    assert.ok(s.includes('fleetLoaded && !loadError ? { vehicles, equipment } : null);'));
    assert.ok(s.includes("{ importing, said: !!(importResult || importError), loadFailed: !!loadError });"));
    assert.ok(s.includes('{showImport && ('));
    assert.ok(s.includes('{importPlan.vehicles.length} vehicle(s)'));
    assert.ok(s.includes('{importPlan.equipment.length} equipment unit(s)'));
    // Not known: it says so, and offers no button.
    assert.ok(s.includes("{!importPlan.known ? (\n                            <>The vehicles and equipment couldn't be read"));
    assert.ok(s.includes('{importPlan.count > 0 && (\n                            <button onClick={runImport} disabled={importing || loading || !importPlan.known}'));
    // The words are drawn, the error kept until its Close.
    assert.ok(s.includes('{importError && <span style={{ fontSize: 12, fontWeight: 600, fontFamily: T.sans, color: T.danger'));
    assert.ok(s.includes('const closeImportWords = () => { setImportResult(\'\'); setImportError(\'\'); };'));
    assert.ok(s.includes('{(importResult || importError) && !importing && (\n                            <button onClick={closeImportWords}'));
});
