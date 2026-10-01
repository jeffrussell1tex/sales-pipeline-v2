// tests/dispatch-gate.test.mjs
//
// The one Dispatch gate (state §0.152, guide §18b46). The rule
// (dispatchAccessOf, src/utils/roles.js) and the gate's decision
// (_dispatchDecision.mjs) are pure and RUN here with every role and switch; the
// wiring — the ten endpoints, the settings key in both halves, the four client
// places, the quote card, the Settings switch — is pinned by source scan
// (§18b23: the endpoints import db/index.js and cannot load under `npm test`).
// tests/integration/dispatch-access.itest.mjs proves it against the database.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dispatchAccessOf, canUseDispatch, APP_ROLES } from '../src/utils/roles.js';
import {
    dispatchDecision, DISPATCH_OFF_MESSAGE, DISPATCH_REPS_MESSAGE, DISPATCH_TECH_MESSAGE,
    DISPATCH_READ_MESSAGE, DISPATCH_UNKNOWN_MESSAGE,
} from '../netlify/functions/_dispatchDecision.mjs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const code = (src) => src.split(/\r?\n/).filter(l => !l.trim().startsWith('//')).join('\n');
const ON = { dispatchEnabled: true };
const REPS = { dispatchEnabled: true, repsCanUseDispatch: true };
const decide = (role, method, extra, opts) => {
    const r = dispatchDecision({ userRole: role, userId: 'user_test' }, { httpMethod: method }, {}, extra, opts);
    return r.response ? { status: r.response.statusCode, error: JSON.parse(r.response.body).error } : { access: r.access };
};

// ── the rule ────────────────────────────────────────────────────────────────

test('dispatchAccessOf: the module off is none for everyone; Admin, Manager, Dispatcher full; a rep only with the org switch', () => {
    for (const role of [...APP_ROLES, 'member', undefined]) {
        assert.equal(dispatchAccessOf(role, {}), 'none', `${role}: module off`);
        assert.equal(dispatchAccessOf(role, undefined), 'none', `${role}: no settings`);
        assert.equal(dispatchAccessOf(role, { dispatchEnabled: false, repsCanUseDispatch: true }), 'none', `${role}: the reps switch does not open a closed module`);
    }
    for (const role of ['Admin', 'Manager', 'Dispatcher']) {
        assert.equal(dispatchAccessOf(role, ON), 'full', role);
        assert.equal(dispatchAccessOf(role, REPS), 'full', role);
    }
    assert.equal(dispatchAccessOf('User', ON), 'none', 'a rep, the switch absent — Jeff: reps "should not have dispatch power"');
    assert.equal(dispatchAccessOf('User', { ...ON, repsCanUseDispatch: false }), 'none');
    assert.equal(dispatchAccessOf('User', { ...ON, repsCanUseDispatch: 'yes' }), 'none', 'only true opens it');
    assert.equal(dispatchAccessOf('User', REPS), 'full', 'the org opens Dispatch to reps');
    assert.equal(dispatchAccessOf('Technician', ON), 'tech');
    assert.equal(dispatchAccessOf('Technician', REPS), 'tech', 'the reps switch is about reps');
    assert.equal(dispatchAccessOf('ReadOnly', ON), 'read');
    for (const r of ['member', 'dispatcher', '', undefined]) assert.equal(dispatchAccessOf(r, REPS), 'none', String(r));
    assert.equal(canUseDispatch('User', ON), false);
    assert.equal(canUseDispatch('User', REPS), true);
    assert.equal(canUseDispatch('ReadOnly', ON), true, 'ReadOnly sees the tab and reads, as before');
    assert.equal(canUseDispatch('Dispatcher', {}), false, 'no Dispatch tab while the module is off, even for a Dispatcher');
});

// ── the gate's decision ─────────────────────────────────────────────────────

test('the module OFF refuses every role by the same words — an Admin included', () => {
    for (const role of [...APP_ROLES, 'member']) {
        for (const m of ['GET', 'POST']) {
            const d = decide(role, m, { repsCanUseDispatch: true });
            assert.equal(d.status, 403, `${role} ${m}`);
            assert.equal(d.error, DISPATCH_OFF_MESSAGE, `${role} ${m}`);
        }
    }
    assert.equal(decide('Admin', 'GET', null).error, DISPATCH_OFF_MESSAGE, 'no settings row = off');
});

test('a rep is refused by name with the switch absent, reads and writes with it on', () => {
    for (const m of ['GET', 'POST', 'PUT', 'DELETE']) {
        assert.deepEqual(decide('User', m, ON), { status: 403, error: DISPATCH_REPS_MESSAGE }, m);
        assert.deepEqual(decide('User', m, REPS), { access: 'full' }, m);
    }
});

test('Admin, Manager and a Dispatcher run Dispatch — reads and writes', () => {
    for (const role of ['Admin', 'Manager', 'Dispatcher']) {
        for (const m of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) assert.deepEqual(decide(role, m, ON), { access: 'full' }, `${role} ${m}`);
    }
});

test('a Technician reads; writes only through the one opt-in; ReadOnly reads and never writes', () => {
    assert.deepEqual(decide('Technician', 'GET', ON), { access: 'tech' });
    for (const m of ['POST', 'PUT', 'DELETE']) {
        assert.deepEqual(decide('Technician', m, ON), { status: 403, error: DISPATCH_TECH_MESSAGE }, m);
        assert.deepEqual(decide('Technician', m, ON, { allowTechnician: true }), { access: 'tech' }, `${m} with the opt-in`);
        assert.deepEqual(decide('ReadOnly', m, ON), { status: 403, error: DISPATCH_READ_MESSAGE }, m);
        assert.deepEqual(decide('ReadOnly', m, ON, { allowTechnician: true }), { status: 403, error: DISPATCH_READ_MESSAGE }, `${m}: the technician opt-in is not a ReadOnly opt-in`);
    }
    assert.deepEqual(decide('ReadOnly', 'GET', ON), { access: 'read' });
    assert.deepEqual(decide('member', 'GET', REPS), { status: 403, error: DISPATCH_UNKNOWN_MESSAGE }, 'a value that is not a role');
});

test('five refusals, five sentences — the body is the only way to tell them apart', () => {
    const all = [DISPATCH_OFF_MESSAGE, DISPATCH_REPS_MESSAGE, DISPATCH_TECH_MESSAGE, DISPATCH_READ_MESSAGE, DISPATCH_UNKNOWN_MESSAGE];
    assert.equal(new Set(all).size, 5);
    const ok = dispatchDecision({ userRole: 'Dispatcher' }, { httpMethod: 'GET' }, {}, { ...ON, productTypes: [1] });
    assert.deepEqual(ok.extra.productTypes, [1], 'the settings read travels with a pass (quote-to-job’s product types)');
});

// ── the server wiring ───────────────────────────────────────────────────────

test('the eight dispatch-* endpoints gate through dispatchGate, and none keeps requireWrite', () => {
    for (const name of ['customers', 'equipment', 'jobs', 'plan-visits', 'schedule-blocks', 'service-plans', 'technicians', 'vehicles']) {
        const s = code(read(`netlify/functions/dispatch-${name}.mjs`));
        assert.ok(s.includes("import { dispatchGate } from './_dispatchGate.mjs';"), name);
        const call = name === 'jobs' ? 'const gate = await dispatchGate(auth, event, headers, { allowTechnician: true });' : 'const gate = await dispatchGate(auth, event, headers);';
        assert.ok(s.includes(call) && s.includes('if (gate.response) return gate.response;'), `${name}: the gate`);
        assert.ok(!/\brequireWrite\b/.test(s), `${name}: the old gate, which let any rep write`);
    }
});

test('invoices.mjs behind the gate (Technicians still 403, delete still Admin-only); quote-to-job: the gate on POST before the quote, the GET left open', () => {
    const inv = code(read('netlify/functions/invoices.mjs'));
    assert.ok(inv.includes('const gate = await dispatchGate(auth, event, headers);') && !/\brequireWrite\b/.test(inv));
    assert.ok(inv.includes("if (isTechnician(auth.userRole)) return reply(403, { error: 'Technicians cannot view invoices.' });"));
    assert.ok(inv.includes("if (!isAdmin(auth.userRole)) return reply(403, { error: 'Admin only' });"));
    const q = code(read('netlify/functions/quote-to-job.mjs'));
    const get = q.indexOf("if (event.httpMethod === 'GET') {"), post = q.indexOf("if (event.httpMethod !== 'POST') return reply(405");
    const gate = q.indexOf('const gate = await dispatchGate(auth, event, headers);');
    assert.ok(get !== -1 && post > get && gate > post, 'the GET (the quote card’s status) answers before the gate; the POST meets it');
    assert.ok(gate < q.indexOf('let data;'), 'before the body is read');
    const gateFile = code(read('netlify/functions/_dispatchGate.mjs'));
    assert.ok(gateFile.includes("import { dispatchDecision } from './_dispatchDecision.mjs';"));
    assert.ok(gateFile.includes('} catch (err) {') && gateFile.includes('statusCode: 500'), 'a failed settings read is a 500, never a default');
    assert.ok(gateFile.includes('.where(eq(settingsTable.orgId, orgId)).limit(1);'), 'read by org');
});

test('settings.mjs carries repsCanUseDispatch in BOTH halves, OFF when absent (18b12)', () => {
    const s = code(read('netlify/functions/settings.mjs'));
    const pairs = s.match(/repsCanUseDispatch:[^\n]*\?\?\s*false,/g) || [];
    assert.equal(pairs.length, 2, `GET and PUT — found ${pairs.length}`);
    assert.ok(code(read('src/hooks/useSettings.js')).includes('repsCanUseDispatch: false,'), 'the client default agrees');
});

// ── the client wiring ───────────────────────────────────────────────────────

test('the client asks ONE question in all four places Dispatch appears; a Dispatcher lands on it once', () => {
    const app = code(read('src/App.jsx'));
    // Both names from the one role module; App.jsx may take more from it (NON_REP_ROLES, §0.153).
    assert.ok(/import \{ isDispatcher, canUseDispatch\b[^}]*\} from '\.\/utils\/roles\.js';/.test(app));
    assert.ok(app.includes("style={{ display: canUseDispatch(userRole, settings) ? '' : 'none' }}"), 'the mobile nav');
    assert.ok(app.includes("if (activeTab === 'dispatch' && !canUseDispatch(userRole, settings)) {"), 'the redirect');
    assert.ok(app.includes("{activeTab === 'dispatch' && canUseDispatch(userRole, settings) && ("), 'the mount');
    assert.ok(app.includes('if (dispatcherLandedRef.current || !isDispatcher(userRole) || !canUseDispatch(userRole, settings)) return;'), 'the landing waits for the rule to say yes');
    assert.ok(app.includes("if (activeTab === 'home') setActiveTab('dispatch');"), 'and moves only a Dispatcher still on Home');
    // The first cut keyed the landing on settingsReady — a REF (always truthy, flipped
    // after a timeout, re-runs nothing): it ran against the default settings (module
    // off), marked itself done and never landed. Caught in the pane, 30 Sep.
    assert.ok(!/!settingsReady \|\||settingsReady && activeTab/.test(app), 'no effect keys on the settingsReady ref');
    assert.ok(!/settings\.dispatchEnabled \? ''|dispatchEnabled !== false && \(|settings\.dispatchEnabled === false && activeTab/.test(app), 'no place asks the old question');
    const header = code(read('src/components/layout/AppHeader.jsx'));
    assert.ok(header.includes("...(canUseDispatch(userRole, settings) ? [{ id: 'dispatch',     label: 'Dispatch'     }] : []),"), 'the header tabs');
    assert.ok(!header.includes('settings.dispatchEnabled       ?'), 'not every role whenever the module is on');
});

test('the quote card offers Create to whoever runs Dispatch; the Features switch; the permissions summary', () => {
    const q = code(read('src/Tabs/QuotesTab.jsx'));
    assert.ok(q.includes("const canCreateJob = dispatchAccessOf(userRole, settings) === 'full';"));
    assert.ok(q.includes('onCreateJob={canCreateJob ? handleCreateJob : null} />}'));
    assert.ok(q.includes('No job yet — whoever runs Dispatch creates it from here.'));
    const f = code(read('src/Tabs/settings/data/FeaturesDetail.jsx'));
    assert.ok(f.includes("{ key: 'repsCanUseDispatch', name: 'Sales reps can use Dispatch',"));
    assert.ok(f.includes(".filter(item => item.key !== 'repsCanUseDispatch' || tabViz.dispatchEnabled)"), 'shown only while the module is on');
    assert.equal((f.match(/repsCanUseDispatch: tabViz\.repsCanUseDispatch,/g) || []).length, 2, 'saved, and adopted locally');
    const u = code(read('src/Tabs/settings/people/UsersDetail.jsx'));
    assert.ok(u.includes("const repDispatch = !settings?.dispatchEnabled ? 'No access' : settings?.repsCanUseDispatch ? 'Full' : 'No access';"), 'the rep’s cell reads the org’s switch');
});
