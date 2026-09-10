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
    assert.ok(s.includes("const unknown = req.filter(r => !equipCats.includes(r));"));
    assert.ok(s.includes('                                        {unknown.map(r => ('), 'a requirement the fleet does not have is shown, not hidden');
    assert.ok(s.includes('⚠ {r} — not in Vehicles &amp; equipment · remove ×'));
    assert.ok(s.includes("const toggle = (cat) => set('equipmentIds', req.includes(cat) ? req.filter(x => x !== cat) : [...req, cat]);"), 'the same click adds a category or removes any entry');
    assert.ok(s.includes('<JobsView jobsRaw={jobsRaw} customers={customers} techs={techs} skills={skills} equipment={equipment}'), 'the parent hands the fleet in');
});

test('saving writes equipmentIds, and the board job takes the requirement back', () => {
    assert.ok(s.includes('                    equipmentIds:    Array.isArray(draft.equipmentIds) ? draft.equipmentIds : [],'));
    assert.ok(s.includes('                                    equipCategories: Array.isArray(saved.equipmentIds) ? saved.equipmentIds : [],'),
        'the crew builder re-checks against what was just saved, not a stale copy');
});

test('the crew builder names a requirement the fleet does not have, and says where to fix it', () => {
    assert.ok(s.includes("const known = (equipUnits || []).some(u => (u.category || '').trim() === cat);"));
    assert.ok(s.includes('(not in Vehicles &amp; equipment — remove it under Jobs)'));
});

test('the dispatcher PUT accepts equipmentIds as a JSON field (server side)', () => {
    const f = code(read('netlify/functions/dispatch-jobs.mjs'));
    assert.ok(f.includes("if ('equipmentIds' in data) updates.equipmentIds = JSON.stringify(data.equipmentIds);"));
});
