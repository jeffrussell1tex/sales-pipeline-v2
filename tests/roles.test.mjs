// tests/roles.test.mjs
//
// The Dispatcher role and the one role module (state §0.151). The pure rules in
// src/utils/roles.js are RUN here; the wiring — the six CRM GETs reading
// crmReadScope, the directory a whole-org reader gets, the CRM tabs' canEdit,
// the banners, the Reports scope and the rep rosters — is pinned by source scan
// (§18b23: the endpoints import db/index.js and cannot load under `npm test`).
// The whole path is proven against the test database in
// tests/integration/roles-crm.itest.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    APP_ROLES, isAppRole, ROLE_OPTIONS, canSeeAll, canEditCrm, CRM_WRITE_ROLES, crmReadScope,
    NON_REP_ROLES, isDispatcher, isTechnician,
} from '../src/utils/roles.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const code = (src) => src.split(/\r?\n/).filter(l => !l.trim().startsWith('//')).join('\n');

// ── the vocabulary ───────────────────────────────────────────────────────────

test('six roles, one list; every picker option is a stored value, and the words are the labels', () => {
    assert.deepEqual([...APP_ROLES], ['Admin', 'Manager', 'User', 'ReadOnly', 'Technician', 'Dispatcher']);
    assert.ok(Object.isFrozen(APP_ROLES) && Object.isFrozen(ROLE_OPTIONS));
    assert.deepEqual(ROLE_OPTIONS.map(o => o.value).sort(), [...APP_ROLES].sort(), 'a picker offers exactly the roles the server knows');
    for (const o of ROLE_OPTIONS) {
        assert.ok(Object.isFrozen(o) && o.label && o.desc, o.value);
        assert.equal(isAppRole(o.value), true, o.value);
    }
    const label = Object.fromEntries(ROLE_OPTIONS.map(o => [o.value, o.label]));
    assert.equal(label.User, 'Sales Rep', "the stored value is 'User'; \"Sales Rep\" is only its label");
    assert.equal(label.Dispatcher, 'Dispatcher');
    assert.equal(isAppRole('Sales Rep'), false, 'a label is never a role');
    assert.equal(isDispatcher('Dispatcher'), true);
    assert.equal(isDispatcher('dispatcher'), false);
});

// ── read scope vs write authority (§18b45) ───────────────────────────────────

test('crmReadScope: Admin, Manager and a Dispatcher read the whole org; a Technician reads nothing; everyone else their own', () => {
    for (const r of ['Admin', 'Manager', 'Dispatcher']) assert.equal(crmReadScope(r), 'all', r);
    assert.equal(crmReadScope('Technician'), 'none');
    for (const r of ['User', 'ReadOnly', 'member', 'dispatcher', '', undefined, null]) assert.equal(crmReadScope(r), 'own', String(r));
});

test('a whole-org READER is not a WRITER: canSeeAll and canEditCrm refuse the Dispatcher', () => {
    assert.equal(canSeeAll('Dispatcher'), false, 'canSeeAll is the ownership bypass on writes');
    assert.deepEqual([...CRM_WRITE_ROLES], ['Admin', 'Manager', 'User']);
    for (const r of ['Admin', 'Manager', 'User']) assert.equal(canEditCrm(r), true, r);
    for (const r of ['Dispatcher', 'ReadOnly', 'Technician', 'member', undefined]) assert.equal(canEditCrm(r), false, String(r));
});

test('NON_REP_ROLES: every role but a sales rep, frozen — the rosters count a rep and a row with no role', () => {
    assert.deepEqual([...NON_REP_ROLES], ['Admin', 'Manager', 'ReadOnly', 'Technician', 'Dispatcher']);
    assert.ok(Object.isFrozen(NON_REP_ROLES));
    assert.deepEqual(APP_ROLES.filter(r => !NON_REP_ROLES.includes(r)), ['User'], 'the only rep role is User');
    for (const r of [undefined, 'Sales Rep']) assert.equal(NON_REP_ROLES.includes(r), false, `${String(r)} still counts, as before the list`);
    assert.equal(isTechnician('Technician'), true);
});

// ── the server wiring ────────────────────────────────────────────────────────

const CRM = [['accounts', 'accounts'], ['contacts', 'contacts'], ['tasks', 'tasks'],
             ['activities', 'activities'], ['leads', 'leads'], ['opportunities', 'opportunities']];

test('the six CRM GETs read through crmReadScope — none → nothing, own → the rep filter, all → the org', () => {
    for (const [file, key] of CRM) {
        const s = code(read(`netlify/functions/${file}.mjs`));
        assert.ok(s.includes("import { crmReadScope } from '../../src/utils/roles.js';"), `${file}: imports the rule directly (a suite that mocks auth.mjs still runs it)`);
        const get = s.slice(s.indexOf("if (event.httpMethod === 'GET') {"), s.indexOf(`JSON.stringify({ ${key}: results })`));
        assert.ok(get.length > 100, `${file}: the GET branch was found`);
        assert.ok(get.includes('const readScope = crmReadScope(userRole);'), file);
        assert.ok(get.includes("if (readScope === 'none') {\n                results = [];\n            } else if (readScope === 'own') {"), `${file}: none → [], own → the filter`);
        assert.ok(!get.includes('if (!canSeeAll(userRole)) {'), `${file}: the read no longer keys on the write authority`);
    }
    const opp = code(read('netlify/functions/opportunities.mjs'));
    assert.ok(opp.includes("} else if (isManager(userRole) && managedReps.length > 0) {"), 'the Manager narrowing still follows the rep branch');
    const leads = code(read('netlify/functions/leads.mjs'));
    assert.ok(leads.includes('const unassignedVisible = await getUnassignedLeadsVisible(orgId);'), 'the leads policy stays inside the own branch');
});

test('the write gate is pure and re-exported: a Dispatcher refused by name, auth.mjs keeps sign-in', () => {
    const gate = code(read('netlify/functions/_roleGate.mjs'));
    assert.ok(gate.includes("from '../../src/utils/roles.js'") && !/@clerk\/backend|db\/index/.test(gate), 'pure — a mocked auth.mjs can re-export it');
    assert.ok(gate.includes('if (CRM_WRITE_ROLES.includes(auth?.userRole)) return null;'));
    assert.ok(gate.includes("if (isDispatcher(auth?.userRole)) {"));
    const auth = code(read('netlify/functions/auth.mjs'));
    assert.ok(auth.includes("import { requireWrite, requireRole } from './_roleGate.mjs';"));
    assert.ok(/export \{\s*APP_ROLES, isAppRole, isAdmin, isManager, canSeeAll, isReadOnly, isTechnician, isDispatcher,\s*requireWrite, requireRole,\s*\};/.test(auth), 'every name the endpoints import is still exported');
    assert.ok(!/export function requireWrite|const WRITE_ROLES/.test(auth), 'one gate, not two');
});

test('the directory: a whole-org reader gets role, team and territory; a rep still gets names alone', () => {
    const s = code(read('netlify/functions/users.mjs'));
    assert.ok(s.includes("import { crmReadScope } from '../../src/utils/roles.js';"));
    assert.ok(s.includes("const wholeOrgReader = crmReadScope(userRole) === 'all';"));
    assert.ok(s.includes('? { id: row.id, name: row.name, active: row.active, role: row.role, userType: row.role, team: row.team, territory: row.territory }\n        : { id: row.id, name: row.name, active: row.active });'));
    assert.ok(!/email|quota|profile/.test(s.slice(s.indexOf('const DIRECTORY_FIELDS'), s.indexOf('const DIRECTORY_FIELDS') + 400)), 'no email, quota or profile in the directory');
});

// ── the client wiring ────────────────────────────────────────────────────────

test('the CRM tabs: canEdit is canEditCrm — a Dispatcher and ReadOnly see no edit controls', () => {
    for (const tab of ['AccountsTab', 'ContactsTab', 'HomeTab', 'PipelineTab', 'QuotesTab', 'TasksTab']) {
        const s = code(read(`src/Tabs/${tab}.jsx`));
        assert.ok(/import \{ canEditCrm[^}]*\} from '\.\.\/utils\/roles\.js';/.test(s), tab);
        assert.ok(/const canEdit +=\s*canEditCrm\(userRole\);/.test(s), tab);
        assert.ok(!/userRole === 'ReadOnly'|\bisReadOnly\b/.test(s), `${tab}: no second read-only test`);
    }
    assert.ok(code(read('src/Tabs/PipelineTab.jsx')).includes('{canEdit && ('), 'Pipeline\'s Add button');
    assert.ok(code(read('src/Tabs/PipelineTab.jsx')).includes('{canEdit && <button onClick={handleAddNew}'), 'and its mobile twin — shown on a phone to a Dispatcher it was a 403 waiting to happen');
    assert.ok(code(read('src/Tabs/QuotesTab.jsx')).includes('if (isAdmin || isDispatcher(userRole)) return true;'), 'a Dispatcher reads every quote');
});

test('the banners say "CRM view only" for a Dispatcher', () => {
    for (const f of ['src/App.jsx', 'src/components/layout/AppHeader.jsx']) {
        const s = code(read(f));
        assert.ok(s.includes('{(isReadOnly || isDispatcher(userRole)) && ('), f);
        assert.ok(s.includes(": 'CRM view only'}"), f);
    }
});

test('Reports: a Dispatcher reads the whole org and slices it; the Rep slice and the rosters list reps only', () => {
    const s = code(read('src/Tabs/ReportsTab.jsx'));
    assert.ok(s.includes('const readsWholeOrg = isAdmin || isDispatcher(userRole);'));
    assert.ok(s.includes('const canSeeAll = readsWholeOrg || isManager;'));
    assert.ok(s.includes('if (readsWholeOrg) return null;'), 'the data gate');
    assert.ok(s.includes('const excludedRoles = new Set(NON_REP_ROLES);'), 'the Rep slice');
    assert.ok(s.includes('{!readsWholeOrg && ('), 'the scope banner');
    assert.ok(s.includes('const seesAllRecords = isAdmin || isManager || isDispatcher(userRole);'));
    assert.equal((s.match(/if \(seesAllRecords\) return all;/g) || []).length, 2, 'Activity History: accounts and contacts');
    assert.ok(code(read('src/utils/reportScope.js')).includes('const ROSTER_EXCLUDED = new Set(NON_REP_ROLES);'));
    assert.ok(code(read('src/utils/pipelineReport.js')).includes('const REP_EXCLUDED = new Set(NON_REP_ROLES);'));
});
