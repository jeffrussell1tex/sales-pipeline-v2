// tests/plan-links.test.mjs
//
// A service plan's links (state §0.223 — batch 4b-3 of OPEN_ITEMS §1 item 1, step D; Jeff, 2 Nov: "Start step D", every
// answer the Recommended — docs/design/links-batch-4b3/STEP-D.md). A plan's visit template and covered job types name
// entries of THIS org's job templates and job types lists — any of the org's ("Any of this org's, refuse"); a value the
// plan holds is never asked again (the text form a plan was stored in before too); a value that names no record by its
// id is 400; the list itself is stored (JD2); the GET answers a list. "Create N plans" from legacy labels skips a label
// a plan of this org already stands for — by its name, case and spaces aside, or the old button's id — and makes the
// rest with random ids (Q12, JD1).
//
// Before: the plans endpoint stored both as sent — another org's ids, or ids naming nothing; it wrote the covered types
// as JSON text inside the jsonb column; the legacy button's ids were made from the label, so a re-press overwrote every
// seeded plan's terms and another org's seed of the label refused this org's.
//
// Run here: planLinks.js's rules; the endpoint's spec, read from its source, through the REAL linksAsked/linksDecided;
// pins on the screen. THE GUARD on the endpoint's order: tests/dispatch-links.test.mjs. The reader of the lists:
// tests/sales-links.test.mjs. The handler, against the test database: tests/integration/plan-links.itest.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NOUNS, MERGES, NOT_AN_ID, notInOrg, linksAsked, linksDecided } from '../src/utils/linkIds.js';
import { coveredJobTypesOf, coveredToStore, labelise, legacyPlanId, legacyPlansToCreate } from '../src/utils/planLinks.js';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8').replace(/\r\n/g, '\n');
const code = (src) => src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
const inOrder = (s, ...texts) => { let at = 0; for (const x of texts) { const i = s.indexOf(x, at); if (i < 0) return false; at = i + x.length; } return true; };
const count = (s, sub) => s.split(sub).length - 1;

// The endpoint's spec, as it is written there.
const SPEC_LINE = code(read('netlify/functions/dispatch-service-plans.mjs')).split('\n').find((l) => l.startsWith('const PLAN_LINKS = '));
const PLAN_LINKS = new Function(`${SPEC_LINE}\nreturn PLAN_LINKS;`)();
const live = (byKind) => (ask) => new Map((byKind[ask.kind] || []).map((id) => [id, id]));

test('P1 — the words: a job template and a job type, in the house words; neither is ever merged away', () => {
    assert.equal(NOUNS.jobTemplate, 'job template');
    assert.equal(NOUNS.jobType, 'job type');
    assert.equal(notInOrg('jobTemplate'), 'That job template is not in your organization — pick one from the list.');
    assert.equal(notInOrg('jobType'), 'That job type is not in your organization — pick one from the list.');
    assert.ok(!MERGES.includes('jobTemplate') && !MERGES.includes('jobType'));
    assert.deepEqual(PLAN_LINKS, [{ key: 'visitTemplateId', kind: 'jobTemplate' }, { key: 'coveredJobTypes', kind: 'jobType', shape: 'many' }]);
});

test("P2 — the spec, run: a create asks both; what the plan holds is never asked — its covered types stored as text too; a fresh id is; a key left out or null is not; a value that names no record is 400 NOT_AN_ID naming the field; one naming nothing of this org is 404 in the words", () => {
    const body = { id: 'plan_1', name: 'Gold', visitTemplateId: 'tmpl_a', coveredJobTypes: ['jt_a', 'jt_b'] };
    const asked = linksAsked(PLAN_LINKS, body, null);
    assert.deepEqual(asked.asks.map((a) => [a.key, a.kind, a.fresh]), [['visitTemplateId', 'jobTemplate', ['tmpl_a']], ['coveredJobTypes', 'jobType', ['jt_a', 'jt_b']]]);
    // Held: the stored plan as drizzle reads it — a list, the text form parsed (a plan stored before §0.223).
    const held = { visitTemplateId: 'tmpl_gone', coveredJobTypes: JSON.parse('["jt_other_org","jt_a"]') };
    assert.deepEqual(linksAsked(PLAN_LINKS, { visitTemplateId: 'tmpl_gone', coveredJobTypes: ['jt_other_org', 'jt_a'] }, held).asks, [],
        'REGRESSION: a plan re-saved as it holds is refused — a template deleted since, a stray stored before (Q3) stand');
    assert.deepEqual(linksAsked(PLAN_LINKS, { coveredJobTypes: ['jt_other_org', 'jt_a', 'jt_new'] }, held).asks.map((a) => a.fresh), [['jt_new']], 'only the type named anew');
    assert.deepEqual(linksAsked(PLAN_LINKS, { name: 'Renamed' }, held).asks, [], 'a key left out is not asked (the plan keeps it)');
    assert.deepEqual(linksAsked(PLAN_LINKS, { visitTemplateId: null, coveredJobTypes: [] }, held).asks, [], 'null and an empty list clear');
    assert.deepEqual(linksAsked(PLAN_LINKS, { coveredJobTypes: '["jt_a"]' }, null), { status: 400, error: NOT_AN_ID, field: 'coveredJobTypes' },
        'a list sent as text names no record by its id — the screen sends a list');
    assert.deepEqual(linksAsked(PLAN_LINKS, { visitTemplateId: 7 }, null), { status: 400, error: NOT_AN_ID, field: 'visitTemplateId' });
    const decided = linksDecided(asked.asks, body, live({ jobTemplate: ['tmpl_a'], jobType: ['jt_a'] }));
    assert.deepEqual(decided, { status: 404, error: notInOrg('jobType'), field: 'coveredJobTypes' }, 'REGRESSION: a type naming nothing of this org is stored');
    assert.deepEqual(linksDecided(asked.asks, body, live({ jobTemplate: [], jobType: ['jt_a', 'jt_b'] })),
        { status: 404, error: notInOrg('jobTemplate'), field: 'visitTemplateId' });
    assert.deepEqual(linksDecided(asked.asks, body, live({ jobTemplate: ['tmpl_a'], jobType: ['jt_a', 'jt_b'] })), { set: {} }, "any of this org's: nothing rewritten");
});

test('P3 — coveredJobTypesOf: a list as its text ids, each once, in order; JSON text for the list it holds; anything else none', () => {
    assert.deepEqual(coveredJobTypesOf(['jt_a', 'jt_b', 'jt_a', '', null, 7, 'jt_c']), ['jt_a', 'jt_b', 'jt_c']);
    assert.deepEqual(coveredJobTypesOf('["jt_a","jt_b"]'), ['jt_a', 'jt_b'], 'REGRESSION: a plan stored as text reaches the screen as a string (its chips throw)');
    assert.deepEqual(coveredJobTypesOf('not json'), []);
    assert.deepEqual(coveredJobTypesOf('{"jt_a":true}'), [], 'text of no list');
    assert.deepEqual(coveredJobTypesOf('"jt_a"'), []);
    for (const v of [null, undefined, {}, 7, true]) assert.deepEqual(coveredJobTypesOf(v), []);
});

test('P4 — coveredToStore: the list itself (JD2), never its text; a value that is no list stores none', () => {
    assert.deepEqual(coveredToStore(['jt_a', 'jt_a', 'jt_b']), ['jt_a', 'jt_b']);
    assert.deepEqual(coveredToStore(undefined), [], 'a create leaving it out stores none, as before');
    assert.deepEqual(coveredToStore(null), []);
    assert.deepEqual(coveredToStore('["jt_a"]'), [], 'text is no list — the check refuses it first');
    assert.ok(Array.isArray(coveredToStore(['jt_a'])), 'REGRESSION: stored as JSON text inside the jsonb column');
});

test("P5 — legacyPlansToCreate (Q12, JD1): a label a plan of this org stands for — by its name, case and spaces aside, or the old button's id, any plan — is skipped and counted; labels of one name make one plan; the rest are made", () => {
    assert.equal(labelise('gold_plus'), 'Gold Plus');
    assert.equal(legacyPlanId('Gold Plus!'), 'plan_legacy_gold_plus_');
    const plans = [
        { id: 'plan_x', name: '  gold  ', active: true },
        { id: 'plan_legacy_silver', name: 'Renamed since', active: true },
        { id: 'plan_y', name: 'Platinum', active: false },
    ];
    const out = legacyPlansToCreate(['gold', 'silver', 'platinum', 'bronze', 'Bronze', 'copper_plus', '  '], plans);
    assert.deepEqual(out.create, [{ tier: 'bronze', name: 'Bronze' }, { tier: 'copper_plus', name: 'Copper Plus' }],
        'REGRESSION: a re-press re-creates (or overwrites) a plan the org has; "bronze" and "Bronze" make two');
    assert.equal(out.existing, 3, "gold by its name, silver by the old button's id, platinum though inactive");
    assert.deepEqual(legacyPlansToCreate(['gold'], []), { create: [{ tier: 'gold', name: 'Gold' }], existing: 0 });
    assert.deepEqual(legacyPlansToCreate(undefined, undefined), { create: [], existing: 0 });
});

test('P6 — the screen: the press reads the plans first, checks the org after the answer, makes only the missing labels with random ids, says what it left; the button counts what is still missing; a stale covered type shows as itself; a template with no id is no option', () => {
    const s = code(read('src/Tabs/settings/dispatch/DispatchServicePlansDetail.jsx'));
    assert.ok(s.includes("import { labelise, legacyPlansToCreate } from '../../../utils/planLinks.js';"));
    assert.ok(!s.includes('const labelise = '), 'one labelise — the name and the skip key cannot drift');
    const seed = s.slice(s.indexOf('const seedFromLegacy = async () => {'), s.indexOf('const legacyToCreate = '));
    assert.ok(inOrder(seed,
        'const askedOrg = requestOrg();',
        "const res = await dbFetch('/.netlify/functions/dispatch-service-plans');",
        'const data = await res.json().catch(() => ({}));',
        'if (!stillOrg(askedOrg)) return;',
        "if (!res.ok || !Array.isArray(data.plans)) throw new Error(data.error || (res.ok ? 'the answer held no list of plans' : 'HTTP ' + res.status));",
        'todo = legacyPlansToCreate(legacyTiers, data.plans);',
        "} catch (err) { setSeedMsg(`Nothing created — the plans could not be read: ${err.message}`); setSeeding(false); return; }",
        'for (const { tier, name } of todo.create) {',
        "id:      'plan_' + crypto.randomUUID(),",
        "method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(row) });",
        'const data = await res.json().catch(() => ({}));',
        "if (!res.ok) throw new Error(data.error || 'HTTP ' + res.status);"),
        'in this order — the read fails closed (REGRESSION: an answer with no plans read as none, every label made again), and a refusal reads its words');
    assert.ok(!seed.includes('data.plans || []'), 'REGRESSION: a read with no list of plans taken as "this org has none"');
    assert.ok(!seed.includes("'plan_legacy_'"), 'REGRESSION: an id made from the label — global, overwritten on a re-press, refused for a second org');
    assert.ok(seed.includes('already had one'), 'what it left is said');
    assert.equal(count(seed, 'if (!stillOrg(askedOrg)) return;'), 3, 'after the read, before each POST, before the reload');
    assert.ok(s.includes('const legacyToCreate = legacyPlansToCreate(legacyTiers, plans).create.length;'));
    assert.ok(s.includes("{seeding ? 'Creating…' : legacyToCreate === 0 ? 'Each label has a plan' : `Create ${legacyToCreate} plan${legacyToCreate === 1 ? '' : 's'}`}"));
    assert.ok(!s.includes('cannot create duplicates'), 'the card no longer promises what the old ids did not keep');
    assert.ok(s.includes('    const staleTypes = (draft.coveredJobTypes || []).filter(id => !jobTypes.some(jt => jt.id === id));'));
    assert.ok(s.includes('Deleted job type ({id})'), 'a covered type the list no longer holds shows as itself');
    assert.ok(s.includes('{jobTypes.length === 0 && staleTypes.length === 0 ? ('), 'REGRESSION: an org with no job types left hides a plan\'s stale one — sent back on every save');
    assert.ok(s.includes("<span key={id} onClick={() => set('coveredJobTypes', (draft.coveredJobTypes || []).filter(x => x !== id))}"), 'a click takes that one off, and only it');
    assert.ok(s.includes('<button onClick={seedFromLegacy} disabled={seeding || legacyToCreate === 0}'), 'nothing to make: the button is off');
    assert.ok(s.includes('    const templates = (settings?.dispatchJobTemplates || []).filter(t => t && t.id);'),
        'REGRESSION: a template with no id of its own is offered — its text sent as the id, now refused');
});

test('P7 — the suites: this file is graded by the harness; the integration suite runs in test:int', () => {
    const suites = read('scripts/mutate-import.mjs').match(/^const SUITES = '([^'\n]*)';$/m)?.[1].split(' ') ?? [];
    assert.ok(suites.includes('tests/plan-links.test.mjs'), 'SUITES runs this file');
    assert.ok(JSON.parse(read('package.json')).scripts['test:int'].includes('tests/integration/plan-links.itest.mjs'), 'test:int runs the integration suite');
});
