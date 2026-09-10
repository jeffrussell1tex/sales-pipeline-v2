// tests/job-equipment.test.mjs
//
// A job's equipment requirement can be seen and changed (state §0.116). Jeff:
// "Why would this one not schedule due to equipment unavailable? I do not see
// where an equipment requirement is listed." JOB-2026-0004 carried
// equipment_ids ["eq_1786389760843"] from the August seed — a unit id, where the
// scheduler expects equipment KINDS (dispatch_equipment.category values). No
// category matched, so every schedule was refused as "no units exist", and the
// Jobs editor had no equipment field at all, so the requirement was invisible
// and unremovable. Now the editor shows the fleet's categories as toggles,
// shows a requirement the fleet does not have as a removable warning chip, and
// saves equipmentIds; the crew builder names an unmatched requirement too.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const code = (src) => src.split(/\r?\n/).filter(l => !l.trim().startsWith('//')).join('\n');
const s = code(read('src/Tabs/DispatchTab.jsx'));

test('the Jobs editor has a Required equipment field fed by the fleet, with unmatched requirements shown as removable chips', () => {
    assert.ok(s.includes('const JobsView = ({ jobsRaw, customers, techs, skills, licenseLevels, categories, jobTypes, equipment = [], onSaved, openJobRequest }) => {'));
    assert.ok(s.includes('<CustFieldRow label="Required equipment">'));
    // Jeff: "HVAC is not a type of equipment … why does it not just show the name
    // of the actual piece of equipment required" — the pickers offer UNITS by name.
    assert.ok(s.includes('                                        {units.map(u => {\n                                            const on = req.includes(u.id);'), 'the editor lists the fleet by unit, toggling the unit id');
    assert.ok(s.includes("const kinds = req.filter(r => !units.some(u => u.id === r) && units.some(u => (u.category || '').trim() === r));"), 'a kind (from a template) is recognised');
    assert.ok(s.includes("const unknown = req.filter(r => !units.some(u => u.id === r) && !kinds.includes(r));"));
    assert.ok(s.includes('                                        {unknown.map(r => ('), 'a requirement the fleet does not have is shown, not hidden');
    assert.ok(s.includes('⚠ {r} — no longer in Vehicles &amp; equipment · remove ×'));
    assert.ok(s.includes('any {r} · remove ×'), 'a kind shows as "any <kind>" and can be removed');
    assert.ok(s.includes("const toggle = (v) => set('equipmentIds', req.includes(v) ? req.filter(x => x !== v) : [...req, v]);"), 'the same click adds a unit or removes any entry');
    // The new-job form too.
    assert.ok(s.includes("const on = (newJobForm.equipCategories || []).includes(u.id);"), 'the new-job form toggles unit ids');
    assert.ok(!s.includes("equipCategories: on ? (f.equipCategories || []).filter(x => x !== cat) : [...(f.equipCategories || []), cat]"), 'no category toggle remains in the new-job form');
    assert.ok(s.includes('<JobsView jobsRaw={jobsRaw} customers={customers} techs={techs} skills={skills} equipment={equipment}'), 'the parent hands the fleet in');
});

test('saving writes equipmentIds, and the board job takes the requirement back', () => {
    assert.ok(s.includes('                    equipmentIds:    Array.isArray(draft.equipmentIds) ? draft.equipmentIds : [],'));
    assert.ok(s.includes('                                    equipCategories: Array.isArray(saved.equipmentIds) ? saved.equipmentIds : [],'),
        'the crew builder re-checks against what was just saved, not a stale copy');
});

test('the crew builder names a requirement the fleet does not have, and says where to fix it', () => {
    assert.ok(s.includes("const known = (equipUnits || []).some(u => u.id === req || (u.category || '').trim() === req);"));
    assert.ok(s.includes('{equipLabel(req, equipUnits)}'), 'a unit id reads as its name');
    assert.ok(s.includes('(no longer in Vehicles &amp; equipment — remove it under Jobs)'));
});

test('a requirement is a specific unit OR a kind: the conflict check handles both, and says which', () => {
    assert.ok(s.includes('        const unit = (units || []).find(u => u.id === req);\n        if (unit) {'), 'a unit id is checked as that one unit');
    assert.ok(s.includes("const usable = (st !== 'maintenance' && st !== 'out_of_service') ? 1 : 0;"));
    assert.ok(s.includes("const committed = rivals.filter(j => (j.equipCategories || []).includes(unit.id)).length;"), 'committed = an overlapping job the same day requiring that unit');
    assert.ok(s.includes("out.push({ cat: unit.name, unit: true, missing: false, usable, owned: 1, committed });"), 'the conflict carries the unit NAME');
    assert.ok(s.includes("const all = (units || []).filter(u => (u.category || '').trim() === req);"), 'a category name is still a kind — job templates carry kinds');
    assert.ok(s.includes("if (c.missing) return `${c.cat} — no longer in Vehicles & equipment (remove it under Jobs)`;"));
    assert.ok(s.includes("if (c.unit) return c.usable === 0 ? `${c.cat} — in maintenance or out of service` : `${c.cat} — committed to an overlapping job that day`;"));
    assert.ok(s.includes('const equipLabel = (req, units = []) => {'));
    assert.ok(!s.includes('no units exist in Vehicles & equipment'), 'the old wording is gone');
});

test('the dispatcher PUT accepts equipmentIds as a JSON field (server side)', () => {
    const f = code(read('netlify/functions/dispatch-jobs.mjs'));
    assert.ok(f.includes("if ('equipmentIds' in data) updates.equipmentIds = JSON.stringify(data.equipmentIds);"));
});
