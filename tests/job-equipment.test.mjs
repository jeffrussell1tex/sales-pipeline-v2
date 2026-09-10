// tests/job-equipment.test.mjs
//
// Equipment on a job (state §0.116). Jeff, in three steps: "I do not see where an
// equipment requirement is listed" → "HVAC is not a type of equipment … show the
// name of the actual piece" → "I don't want to require a specific unit. I want to
// require a kind of equipment. If I need a pressure tester and we have 10 of them
// I don't care which one I get as long as there is one assigned to me and the
// job at the day and time needed." So: a requirement is a KIND (the Category on
// the fleet's units, named the way a technician asks for it); the Jobs editor and
// the new-job form pick kinds and show a stale entry as a removable chip; and
// SCHEDULING RESERVES one in-service unit of each kind that no overlapping job
// holds that day, stores it on the job (assigned_equipment_ids), shows it, and
// releases it whenever the job goes back to unscheduled. Source scans (§18b23);
// the storage rule is proved against the test database in
// tests/integration/customer-notify.itest.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const code = (src) => src.split(/\r?\n/).filter(l => !l.trim().startsWith('//')).join('\n');
const s = code(read('src/Tabs/DispatchTab.jsx'));

test('the kind and skill chips read as toggles — "+ Kind" off, "✓ Kind" on, role=checkbox — and the forms say to click them', () => {
    // Jeff: "There is no way to add equipment under required equipment." The
    // pills toggled on click (observed in the pane, both forms) but looked like
    // labels; nothing said they were controls.
    assert.equal((s.match(/role="checkbox" aria-checked=\{!!on\}/g) || []).length, 5, 'skills in the technician editor, skills and kinds in the Jobs editor, skills and kinds in the new-job form');
    assert.ok(s.includes("                                                        {on ? '✓ ' : '+ '}{kind}"), 'Jobs editor kinds');
    assert.ok(s.includes("                                                    {on ? '✓ ' : '+ '}{kind}"), 'new-job form kinds');
    assert.ok(s.includes("{on ? '✓ ' : '+ '}{sk.name}"), 'Jobs editor skills');
    assert.ok(s.includes("                                                        {on ? '✓ ' : '+ '}{s.name}"), 'new-job form skills');
    assert.ok(s.includes('<strong>Click a kind to require it; click again to drop it.</strong>'), 'the Jobs editor says so');
    assert.ok(s.includes('Click a kind to require it; click again to drop it. In service over total.'), 'the new-job form says so');
});

test('a requirement is a kind: the editor and the new-job form pick categories, and a stale entry is a removable chip', () => {
    assert.ok(s.includes('<CustFieldRow label="Required equipment">'));
    assert.ok(s.includes("const kindList = [...new Set(units.map(u => (u.category || '').trim()).filter(Boolean))].sort();"));
    assert.ok(s.includes('const unknown = req.filter(r => !kindList.includes(r));'));
    assert.ok(s.includes('                                            {unknown.map(r => ('), 'a stored entry that is not a kind is shown, not hidden');
    assert.ok(s.includes('⚠ {r} — not a kind in Vehicles &amp; equipment · remove ×'));
    assert.ok(s.includes("const toggle = (v) => set('equipmentIds', req.includes(v) ? req.filter(x => x !== v) : [...req, v]);"));
    assert.ok(s.includes('name it the way a'), 'the editor tells the dispatcher what a kind is');
    assert.ok(s.includes('<strong>Reserved for this job:</strong>'), 'the reservation is shown, read-only');
    // the new-job form
    assert.ok(s.includes('{equipCategories.map(kind => {\n                                            const on    = (newJobForm.equipCategories || []).includes(kind);'));
    assert.ok(!s.includes('(newJobForm.equipCategories || []).includes(u.id)'), 'no unit picker remains');
    assert.ok(s.includes('                    equipmentIds:    Array.isArray(draft.equipmentIds) ? draft.equipmentIds : [],'), 'the editor saves the kinds');
});

test('the conflict check counts a kind against what overlapping jobs hold: reserved units when they have them, requirements otherwise', () => {
    assert.ok(s.includes('const rivals = overlappingRivals(job, allJobs, dateStr, probe);'));
    assert.ok(s.includes("((j.equipCategories || []).length > 0 || (j.assignedEquipment || []).length > 0) &&"), 'a rival competes if it requires OR holds equipment');
    assert.ok(s.includes('const committed = rivals.reduce((n, j) => n + committedOfKind(j, kind, units), 0);'));
    assert.ok(s.includes("return reserved.filter(id => ((units || []).find(u => u.id === id)?.category || '').trim() === kind).length;"), 'reserved units count by their kind');
    assert.ok(s.includes('return (rival.equipCategories || []).filter(k => k === kind).length;'), 'a rival without a reservation counts its requirement');
    assert.ok(s.includes("if (c.missing) return `${c.cat} — not a kind in Vehicles & equipment (remove it under Jobs, or set a unit's Category to it)`;"));
    assert.ok(s.includes("return `${c.cat} — all ${c.usable} available unit(s) reserved by overlapping jobs that day`;"));
    assert.ok(!s.includes('const unit = (units || []).find(u => u.id === req);'), 'no unit-as-requirement branch');
});

test('scheduling reserves one in-service unit per kind that no overlapping job holds, first by name, never the same unit twice', () => {
    assert.ok(s.includes('const pickEquipmentFor = (kinds, units = [], rivals = [], alsoTaken = []) => {'));
    assert.ok(s.includes('const taken = new Set([...rivals.flatMap(j => j.assignedEquipment || []), ...alsoTaken]);'));
    assert.ok(s.includes("            .filter(x => { const st = x.status || 'available'; return st !== 'maintenance' && st !== 'out_of_service'; })"));
    assert.ok(s.includes('            .filter(x => !taken.has(x.id) && !picked.includes(x.id))'));
    assert.ok(s.includes("            .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))[0];"));
    // the crew builder's write
    assert.ok(s.includes('        const reservedUnits = pickEquipmentFor(\n            selectedJob.equipCategories, equipUnits,'));
    assert.ok(s.includes("                    timeSlot:       'exact',\n                    assignedEquipmentIds: reservedUnits,"), 'the reservation rides the schedule PUT');
    assert.ok(s.includes('                assignedEquipment: reservedUnits,\n            });'), 'the parent learns it');
    assert.ok(s.includes("+ (reservedUnits.length ? ` Reserved: ${reservedUnits.map(id => unitLabel(id, equipUnits)).join(', ')}.` : '')"), 'the success banner names the reserved units');
    // the mass scheduler's writes
    assert.ok(s.includes('        const reservedThisRun = [];'));
    assert.ok(s.includes('                reservedThisRun).picked;'), 'units reserved earlier in the same pass are not offered again');
    assert.ok(s.includes('                        assignedEquipmentIds: pr.assignedEquipment,'));
    assert.ok(s.includes('                reservedThisRun.push(...pr.assignedEquipment);'));
    assert.ok(s.includes("                assignedEquipment: pr.assignedEquipment || [] } : j;"));
});

test('the board job carries its reservation, shows it, and drops it when the job leaves the schedule', () => {
    assert.ok(s.includes('assignedEquipment: Array.isArray(j.assignedEquipmentIds) ? j.assignedEquipmentIds : [],'), 'from the server');
    assert.ok(s.includes('assignedEquipment: Array.isArray(saved.assignedEquipmentIds) ? saved.assignedEquipmentIds : [],'), 'after an editor save');
    assert.ok(s.includes("> · reserved: {(selectedJob.assignedEquipment || []).map(id => unitLabel(id, equipUnits)).join(', ')}</span>"), 'the crew builder shows what is reserved');
    assert.ok(s.includes("(not a kind in Vehicles &amp; equipment — remove it under Jobs)"), 'and names a requirement no unit matches');
    assert.ok(s.includes("start: null, status: 'unscheduled', window: 'TBD', assignedEquipment: [] } : j));"), 'a held crew has no reservation');
    assert.ok(s.includes("? { ...j, assignedTechIds: [], start: null, status: 'unscheduled', window: 'TBD', assignedEquipment: [] }"), 'a time-off unassign has none either');
    assert.ok(s.includes('const unitLabel = (id, units = []) => {'));
});

test('server: assignedEquipmentIds is a JSON field on create and PUT, and a job returning to unscheduled releases it', () => {
    const f = code(read('netlify/functions/dispatch-jobs.mjs'));
    assert.ok(f.includes('assignedEquipmentIds: row.assignedEquipmentIds ?? row.assigned_equipment_ids ?? [],'));
    assert.ok(f.includes('assignedEquipmentIds: JSON.stringify(data.assignedEquipmentIds ?? []),'), 'create');
    assert.ok(f.includes("if ('assignedEquipmentIds' in data) updates.assignedEquipmentIds = JSON.stringify(data.assignedEquipmentIds ?? []);"));
    assert.ok(f.includes("else if (data.status === 'unscheduled') updates.assignedEquipmentIds = JSON.stringify([]);"), 'released by ANY path that unschedules');
    const schema = read('db/schema.ts');
    assert.ok(schema.includes("assignedEquipmentIds: jsonb('assigned_equipment_ids'),"), 'nullable, additive');
    const guard = read('tests/integration/_schema-guard.mjs');
    assert.ok(guard.includes("['dispatch_jobs', 'assigned_equipment_ids'],"), 'the test database must carry it');
});
