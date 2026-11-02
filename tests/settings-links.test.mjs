// tests/settings-links.test.mjs
//
// The ids inside settings name this org's (state §0.221 — batch 4b-3 of OPEN_ITEMS §1 item 1, step A; Jeff, 1 Nov:
// "Build step A", every answer the Recommended — docs/design/links-batch-4b3/ANSWERS.md). A team's manager and reps
// and a territory's owner and reps are members of THIS org, a crew's members and lead its technicians and its default
// vehicle its vehicle, a quote template's products its products — any of the org's, an inactive one too ("Any of this
// org's, refuse"); an id the stored list holds, in that field anywhere, is never asked again (Q1); a list whose
// entries are records is a list of them, each with its own id, what the stored list holds standing by count; a
// restore clears what it LANDS ('' for one id — never null — dropped from a list), a row the org already had left as
// it is; a team note's team is the house link (Q10); a save never writes integrationRequests (Q15).
//
// Before: the settings PUT stored every list as sent — any shape, any ids, another org's or none; the restore landed
// a settings row's lists unchecked; a team note's team was its own looser check (one row, 400 "Unknown team"); a
// save's body could preset an app's integration request.
//
// Run here, on made-up data: linkIds.js's table, its views and decisions; pins on settings.mjs, _links.mjs and
// coaching-notes.mjs (the order the PUT checks in, the restore's branch, the note's link); THE CLASS — every key the
// settings PUT stores is classified, so a later key holding ids cannot skip the rule. The handlers, against the test
// database: tests/integration/settings-links.itest.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    SETTINGS_LINKS, SETTINGS_LISTS, NOT_A_LIST, ENTRY_NEEDS_ID, NOT_AN_ID, notInOrg, linksDecided,
    listShapeRefused, settingsLinkIds, settingsLinksAsked, settingsLinksCleared, settingsLinkIdsByKind,
} from '../src/utils/linkIds.js';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8').replace(/\r\n/g, '\n');
// The code a pin reads: whole-line comments dropped, so a comment quoting a line never stands in for it.
const code = (src) => src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

// ── The table ─────────────────────────────────────────────────────────────────

test('S1 — the table: each list, its fields, the kind each names and its shape', () => {
    assert.deepEqual(JSON.parse(JSON.stringify(SETTINGS_LINKS)), {
        teams: [{ field: 'managerId', kind: 'member' }, { field: 'repIds', kind: 'member', shape: 'many' }],
        territories: [{ field: 'ownerId', kind: 'member' }, { field: 'repIds', kind: 'member', shape: 'many' }],
        dispatchCrews: [{ field: 'members', kind: 'technician', shape: 'many' }, { field: 'lead', kind: 'technician' }, { field: 'defaultVehicle', kind: 'vehicle' }],
        quoteTemplates: [{ field: 'productIds', kind: 'product', shape: 'many' }],
    });
    assert.deepEqual([...SETTINGS_LISTS], ['teams', 'territories', 'spiffs', 'dispatchCrews', 'quoteTemplates', 'dispatchJobTemplates', 'dispatchJobTypes']);
    for (const key of Object.keys(SETTINGS_LINKS)) assert.ok(SETTINGS_LISTS.includes(key), `${key}: a list of records too`);
    assert.ok(Object.isFrozen(SETTINGS_LINKS) && Object.values(SETTINGS_LINKS).every(Object.isFrozen));
    assert.equal(NOT_A_LIST, 'This setting must be a list.');
    assert.equal(ENTRY_NEEDS_ID, 'Each entry of this list needs its own id.');
    for (const kind of ['member', 'technician', 'vehicle', 'product']) assert.equal(notInOrg(kind), `That ${kind} is not in your organization — pick one from the list.`);
});

// ── The shape ─────────────────────────────────────────────────────────────────

test('S2 — the shape: null, empty or a list of entries each with its own text id, no id twice; else 400 naming the list', () => {
    const ok = [{ id: 'a' }, { id: 'b', name: 'B' }];
    for (const v of [null, undefined, '', false, [], ok]) assert.equal(listShapeRefused('teams', v, null), null, JSON.stringify(v));
    const refused = (v, error) => assert.deepEqual(listShapeRefused('teams', v, null), { status: 400, error, field: 'teams' }, JSON.stringify(v));
    refused('East', NOT_A_LIST);
    refused({ id: 'a' }, NOT_A_LIST);
    refused(7, NOT_A_LIST);
    refused([...ok, 'Legacy'], ENTRY_NEEDS_ID);
    refused([...ok, { name: 'no id' }], ENTRY_NEEDS_ID);
    refused([...ok, { id: '' }], ENTRY_NEEDS_ID);
    refused([...ok, { id: 7 }], ENTRY_NEEDS_ID);
    refused([...ok, ['a']], ENTRY_NEEDS_ID);
    refused([...ok, null], ENTRY_NEEDS_ID);
    refused([...ok, { id: 'a' }], ENTRY_NEEDS_ID);
});

test('S3 — the shape, held: what the stored list holds stands — a value that is no list while it is the stored value; entries with no id, by count, however rewritten; an id twice while stored as often', () => {
    assert.equal(listShapeRefused('teams', 'East', 'East'), null, 'the stored value that is no list');
    assert.deepEqual(listShapeRefused('teams', 'West', 'East'), { status: 400, error: NOT_A_LIST, field: 'teams' }, 'another one');
    const stored = [{ id: 'a' }, 'Legacy', { name: 'old' }];
    assert.equal(listShapeRefused('teams', [{ id: 'a' }, 'Legacy', { name: 'old, rewritten', crew: 2 }], stored), null, 'two stood, two sent — rewritten');
    assert.equal(listShapeRefused('teams', [{ id: 'a' }, 'Renamed legacy'], stored), null, 'fewer than stored');
    assert.deepEqual(listShapeRefused('teams', [{ id: 'a' }, 'Legacy', { name: 'old' }, { name: 'new' }], stored), { status: 400, error: ENTRY_NEEDS_ID, field: 'teams' }, 'one more than stored');
    const twice = [{ id: 'a' }, { id: 'a' }, { id: 'b' }];
    assert.equal(listShapeRefused('teams', twice, twice), null, 'an id twice, stored twice');
    assert.deepEqual(listShapeRefused('teams', [...twice, { id: 'a' }], twice), { status: 400, error: ENTRY_NEEDS_ID, field: 'teams' }, 'three times, stored twice');
    assert.deepEqual(listShapeRefused('teams', [...twice, { id: 'b' }], twice), { status: 400, error: ENTRY_NEEDS_ID, field: 'teams' }, 'another id twice');
    assert.equal(listShapeRefused('spiffs', [{ id: 'a' }], 'not a list'), null, 'a stored value that is no list holds nothing: a good list stands');
});

// ── The links ─────────────────────────────────────────────────────────────────

test('S4 — the view: a field across the entries — the text ids, and every value that names no record by its id', () => {
    const list = [
        { id: 't1', managerId: 'u1', repIds: ['u2', '', null, 'u3'] },
        { id: 't2', managerId: '', repIds: [] },
        { id: 't3', managerId: null },
        'Legacy', null, ['u9'],
        { id: 't4', managerId: 42, repIds: 'u4' },
        { id: 't5', repIds: ['u5', 6, { id: 'u7' }] },
    ];
    assert.deepEqual(settingsLinkIds(list, 'managerId'), { ids: ['u1'], bad: [42] });
    assert.deepEqual(settingsLinkIds(list, 'repIds', 'many'), { ids: ['u2', 'u3', 'u5'], bad: ['u4', 6, { id: 'u7' }] });
    assert.deepEqual(settingsLinkIds('not a list', 'repIds', 'many'), { ids: [], bad: [] });
    assert.deepEqual(settingsLinkIds(undefined, 'managerId'), { ids: [], bad: [] });
});

test('S5 — the ask: the ids a body names that the stored list does not hold in that field anywhere — one ask per field, its key the LIST; a list not sent, or no list, asks nothing', () => {
    const stored = { teams: [{ id: 'east', managerId: 'u_mgr', repIds: ['u_karen', 'u_stray'] }, { id: 'west', managerId: '', repIds: [] }] };
    assert.deepEqual(settingsLinksAsked({ teams: stored.teams }, stored), { asks: [] }, 'as stored: nothing asked');
    assert.deepEqual(settingsLinksAsked({ teams: [{ id: 'east', managerId: 'u_mgr', repIds: ['u_karen'] }, { id: 'west', managerId: '', repIds: ['u_stray'] }] }, stored),
        { asks: [] }, 'a held stray moved to another team: held anywhere (Q1)');
    assert.deepEqual(settingsLinksAsked({ teams: [{ id: 'west', managerId: 'u_karen', repIds: ['u_new', 'u_new', 'u_mgr'] }] }, stored), { asks: [
        { key: 'teams', kind: 'member', shape: 'many', follow: false, fresh: ['u_karen'] },
        { key: 'teams', kind: 'member', shape: 'many', follow: false, fresh: ['u_new', 'u_mgr'] },
    ] }, "held in its OWN field only: a rep made manager is asked, a manager made rep is asked; an id twice asked once");
    assert.deepEqual(settingsLinksAsked({ teams: [{ id: 'x', managerId: 'u1' }] }, null).asks.map((a) => a.fresh), [['u1']], 'nothing stored: every id is new');
    assert.deepEqual(settingsLinksAsked({ competitors: ['A'] }, stored), { asks: [] }, 'no list sent');
    assert.deepEqual(settingsLinksAsked({ teams: 'East' }, stored), { asks: [] }, 'no list: the shape judges it');
    assert.deepEqual(settingsLinksAsked(null, stored), { asks: [] });
    const all = settingsLinksAsked({
        territories: [{ id: 'n', ownerId: 'u_o', repIds: ['u_r'] }],
        dispatchCrews: [{ id: 'c', members: ['t1'], lead: 't2', defaultVehicle: 'v1' }],
        quoteTemplates: [{ id: 'q', productIds: ['p1'] }],
    }, {});
    assert.deepEqual(all.asks.map((a) => [a.key, a.kind, a.fresh]), [
        ['territories', 'member', ['u_o']], ['territories', 'member', ['u_r']],
        ['dispatchCrews', 'technician', ['t1']], ['dispatchCrews', 'technician', ['t2']], ['dispatchCrews', 'vehicle', ['v1']],
        ['quoteTemplates', 'product', ['p1']],
    ]);
});

test('S6 — the ask: a value that names no record by its id is 400 NOT_AN_ID naming the list — one the stored list holds stands, by count', () => {
    const refused = { status: 400, error: NOT_AN_ID, field: 'teams' };
    assert.deepEqual(settingsLinksAsked({ teams: [{ id: 'a', managerId: 7 }] }, {}), refused, 'an id that is no text');
    assert.deepEqual(settingsLinksAsked({ teams: [{ id: 'a', repIds: 'u1' }] }, {}), refused, 'reps that are no list');
    assert.deepEqual(settingsLinksAsked({ teams: [{ id: 'a', repIds: ['u1', 7] }] }, {}), refused, 'a rep that is no text');
    const stored = { teams: [{ id: 'a', managerId: 7, repIds: 'u1' }] };
    assert.deepEqual(settingsLinksAsked({ teams: [{ id: 'a', managerId: 7, repIds: 'u1', name: 'renamed' }] }, stored), { asks: [] }, 'as stored: stands');
    assert.deepEqual(settingsLinksAsked({ teams: [{ id: 'a', managerId: 7 }, { id: 'b', managerId: 7 }] }, stored), refused, 'one more than stored');
    assert.deepEqual(settingsLinksAsked({ dispatchCrews: [{ id: 'c', lead: 42 }] }, {}), { ...refused, field: 'dispatchCrews' });
});

test('S7 — the decision: an id asked that names no live row of this org is 404 in the house words, naming the list', () => {
    const { asks } = settingsLinksAsked({ teams: [{ id: 'a', managerId: 'u_live', repIds: ['u_live', 'u_b'] }] }, {});
    const live = new Map([['u_live', 'u_live']]);
    assert.deepEqual(linksDecided(asks, {}, () => live), { status: 404, error: notInOrg('member'), field: 'teams' });
    live.set('u_b', 'u_b');
    assert.deepEqual(linksDecided(asks, {}, () => live), { set: {} }, 'every id live: nothing rewritten');
});

// ── The restore ───────────────────────────────────────────────────────────────

test("S8 — the restore's clean-up: a one id that names nothing here becomes '' (never null), a list's strays are dropped in order, the rest as filed; counted", () => {
    const extra = {
        teams: [{ id: 't', name: 'T', managerId: 'u_b', repIds: ['u_a', 'u_x', 'u_y', '', 'u_a2'], color: 'c' }, 'Legacy', { id: 't2', managerId: 'u_a' }],
        territories: [{ id: 'n', ownerId: 7, repIds: 'not a list' }],
        dispatchCrews: [{ id: 'c', members: ['t_b', 't_a'], lead: 't_b', defaultVehicle: 'v_b' }],
        quoteTemplates: [{ id: 'q', productIds: ['p_a'] }],
        competitors: ['as filed'],
    };
    const live = { member: new Set(['u_a', 'u_a2']), technician: new Set(['t_a']), vehicle: new Set(), product: new Set(['p_a']) };
    const done = settingsLinksCleared(extra, (kind) => live[kind]);
    assert.equal(done.cleared, 7, "B's manager, two reps naming nothing — a list's count is its strays — a territory's owner that is no text, B's crew member and lead, B's vehicle");
    assert.deepEqual(done.patch, {
        teams: [{ id: 't', name: 'T', managerId: '', repIds: ['u_a', '', 'u_a2'], color: 'c' }, 'Legacy', { id: 't2', managerId: 'u_a' }],
        territories: [{ id: 'n', ownerId: '', repIds: 'not a list' }],
        dispatchCrews: [{ id: 'c', members: ['t_a'], lead: '', defaultVehicle: '' }],
    }, 'only the lists it changed; a list field that is no list left as it is');
    assert.deepEqual(settingsLinksCleared({ quoteTemplates: extra.quoteTemplates }, (kind) => live[kind]), { patch: {}, cleared: 0 });
    assert.deepEqual(settingsLinksCleared({
        teams: [{ id: 'w', name: 'West', managerId: '', repIds: [] }, { id: 'n', managerId: null }, { id: 'u' }],
        territories: [{ id: 'e', ownerId: '' }],
        dispatchCrews: [{ id: 'c2', members: [], lead: '', defaultVehicle: null }, { id: 'c3' }],
    }, (kind) => live[kind]), { patch: {}, cleared: 0 }, 'an empty one id names nothing: left as it is, never counted');
    assert.deepEqual(settingsLinksCleared(null, () => new Set()), { patch: {}, cleared: 0 });
    assert.deepEqual(settingsLinksCleared({ teams: 'East' }, () => new Set()), { patch: {}, cleared: 0 });
    assert.deepEqual(settingsLinkIdsByKind(extra).get('member'), ['u_b', 'u_a', 'u_a', 'u_x', 'u_y', 'u_a2'], "teams' managers, then their reps; a territory's owner that is no text names none");
    assert.deepEqual(settingsLinkIdsByKind(extra).get('technician'), ['t_b', 't_a', 't_b']);
    assert.deepEqual(settingsLinkIdsByKind(extra).get('vehicle'), ['v_b']);
    assert.deepEqual(settingsLinkIdsByKind(extra).get('product'), ['p_a']);
});

// ── The servers ───────────────────────────────────────────────────────────────

test('S9 — the settings PUT: read, the approvals, every list\'s shape, its links, then the build — a refusal returns before anything is written', () => {
    const s = code(read('netlify/functions/settings.mjs'));
    assert.ok(s.includes("import { SETTINGS_LISTS, listShapeRefused } from '../../src/utils/linkIds.js';"));
    assert.ok(s.includes("import { checkSettingsLinks } from './_links.mjs';"));
    const at = (needle) => { const i = s.indexOf(needle); assert.ok(i > 0, needle); return i; };
    const order = [
        "const existingExtra = existing.length > 0 ? (existing[0].extra || {}) : {};",
        'data.approvalRouting = mode;',
        'for (const key of SETTINGS_LISTS) {',
        "const bad = key in data ? listShapeRefused(key, data[key], existingExtra[key]) : null;",
        'if (bad) return { statusCode: bad.status, headers, body: JSON.stringify({ error: bad.error, field: bad.field }) };',
        'const linked = await checkSettingsLinks(data, existingExtra, orgId);',
        'if (linked.status) return { statusCode: linked.status, headers, body: JSON.stringify({ error: linked.error, field: linked.field }) };',
        'const legacyPlainKey',
        'const extra = {',
        'await db.insert(settings).values(dbRow)',
    ].map(at);
    assert.deepEqual(order, [...order].sort((a, b) => a - b), 'in this order');
    assert.ok(s.includes('integrationRequests: existingExtra.integrationRequests || {},'), 'the stored requests (Q15)');
    assert.doesNotMatch(s, /data\.integrationRequests/, "a body's requests are never read");
});

test("S10 — _links.mjs: the settings check, and the restore's branch — only the row the restore landed, '' never null, merged into the stored extra, a failure named", () => {
    const s = code(read('netlify/functions/_links.mjs'));
    assert.ok(s.includes("import { settingsLinksAsked, settingsLinksCleared, settingsLinkIdsByKind } from '../../src/utils/linkIds.js';"));
    assert.ok(s.includes('const asked = settingsLinksAsked(data, stored);\n    if (asked.error) return asked;\n    if (!asked.asks.length) return { set: {} };\n    return linksDecided(asked.asks, data, await liveOfAsks(asked.asks, orgId));'));
    assert.ok(s.includes('cleared += await clearMemberLinks(orgId, restored, failed);\n    cleared += await clearSettingsLinks(orgId, restored, failed);'), 'clearStrayLinks runs it, after the members');
    assert.ok(s.includes('const ids = (restored && restored.get(settings)) || [];\n    if (!ids.length) return 0;'), 'only a row the restore landed');
    assert.ok(s.includes('.where(and(eq(settings.orgId, orgId), inArray(settings.id, ids)));'), 'read in the org');
    assert.ok(s.includes("for (const [kind, named] of byKind) live.set(kind, await liveIdsInOrg(kind, named, orgId, { follow: false }));"));
    assert.ok(s.includes("writes.push(db.update(settings).set({ extra: sql`coalesce(${settings.extra}, '{}'::jsonb) || ${JSON.stringify(done.patch)}::jsonb` })"), 'merged: the lists it changed, every other key as stored');
    assert.ok(s.includes(".where(and(eq(settings.orgId, orgId), eq(settings.id, row.id), sql`jsonb_typeof(${settings.extra}) = 'object'`)));"));
    assert.ok(s.includes("failed.push('settings.extra');"));
    // The branch decides and writes in this order: each row's ids by kind, read live, the decision, counted, one batch.
    const body = s.slice(s.indexOf('async function clearSettingsLinks(orgId, restored, failed) {'));
    const fnBody = body.slice(0, body.indexOf('\n}\n'));
    const steps = [
        '            const byKind = settingsLinkIdsByKind(row.extra);',
        '            const done = settingsLinksCleared(row.extra, (kind) => live.get(kind) || new Map());',
        '            if (!done.cleared) continue;',
        '            cleared += done.cleared;',
        '        if (writes.length) await db.batch(writes);',
        '        return cleared;',
    ].map((l) => { const i = fnBody.indexOf(l + '\n'); assert.ok(i > 0, l); return i; });
    assert.deepEqual(steps, [...steps].sort((a, b) => a - b), 'in this order');
    const cleared = code(read('src/utils/linkIds.js'));
    assert.ok(cleared.includes("out = { ...out, [field]: '' };"), "a one id cleared to '' (null === null)");
    assert.doesNotMatch(cleared.slice(cleared.indexOf('export function settingsLinksCleared')), /\[field\]: null/);
});

test("S11 — a team note's team: the house link, every settings row of the org, 404 naming teamId (Q10) — teamsOf no longer its gate", () => {
    const s = code(read('netlify/functions/coaching-notes.mjs'));
    assert.ok(s.includes("import { checkLinks } from './_links.mjs';"));
    assert.ok(s.includes("const NOTE_TEAM = Object.freeze([{ key: 'teamId', kind: 'team' }]);"));
    assert.ok(s.includes('const team = await checkLinks(NOTE_TEAM, { teamId: audience.teamId }, null, orgId);\n                if (team.status) return reply(team.status, { error: team.error, field: team.field });'));
    assert.doesNotMatch(s, /Unknown team/);
    const post = s.slice(s.indexOf("if (event.httpMethod === 'POST')"), s.indexOf("if (event.httpMethod === 'PUT')"));
    assert.doesNotMatch(post, /teamsOf\(/, 'the POST reads no team list of its own');
});

// ── THE CLASS ─────────────────────────────────────────────────────────────────

// Every key the settings PUT stores, and why it is or is not checked here. A new key fails S12 until it is named.
const CLASSIFIED = {
    // checked: entries naming rows (SETTINGS_LINKS) or records rows name (SETTINGS_LISTS)
    teams: 'links', territories: 'links', dispatchCrews: 'links', quoteTemplates: 'links',
    spiffs: 'list', dispatchJobTemplates: 'list', dispatchJobTypes: 'list',
    // its own check: an approver is an ACTIVE Admin or Manager (state §0.157 — Q14, kept)
    approvalTiers: 'own check', approvalRouting: 'own check',
    // the server's own: never taken from a body
    integrationRequests: 'server', anthropicApiKey: 'server',
    // lists rows name by an entry's id, with built-in ids every org shares — their own batch, 4b-4 (Q16)
    dispatchSkills: '4b-4', dispatchCerts: '4b-4', dispatchTrades: '4b-4', dispatchBlockTypes: '4b-4',
    dispatchPropertyTypes: '4b-4', buyerPersonas: '4b-4', productTypes: '4b-4',
    // a deal's pipelineId names one — left by design ('default' a sentinel; OPEN_ITEMS §4.6)
    pipelines: 'by design',
    // retired Dispatch blobs, still kept and returned (their rows have tables of their own)
    dispatchVehicles: 'retired', dispatchEquipment: 'retired', dispatchJobs: 'retired',
    // no ids: values, flags, words, and lists holding only their own entries' ids
    quotaData: 'value', commissionTiers: 'value', verticals: 'value', kpiTolerances: 'value', kpiTargets: 'value',
    logoUrl: 'value', kpiConfig: 'value', commissionPlan: 'value', products: 'value', aiScoringEnabled: 'value',
    aiReportPromptsEnabled: 'value', leadsEnabled: 'value', unassignedLeadsVisibleToReps: 'value',
    unassignedDealsVisibleToReps: 'value', customerTypes: 'value', companyProfile: 'value', leadConvBenchmarks: 'value',
    connectedApps: 'value', slackConfig: 'value', customerNotifications: 'value', webToLead: 'value', emailTemplates: 'value',
    companyDisplayName: 'value', companyLegalName: 'value', companyBrandColor: 'value', companyAddress: 'value',
    companyCity: 'value', companyState: 'value', companyZip: 'value', companyCountry: 'value', companyPhone: 'value',
    companySupportEmail: 'value', quoteHeader: 'value', customHolidays: 'value', federalHolidays: 'value',
    priceBookProducts: 'value', quoteBrand: 'value', quoteDefaults: 'value', quoteBoilerplate: 'value', funnelStages: 'value',
    kpiThresholds: 'value', assignmentRules: 'value', customFieldsByObject: 'value', customerTypeTiers: 'value',
    accountSegmentTiers: 'value', leadScoring: 'value', industries: 'value', quotesEnabled: 'value', dispatchEnabled: 'value',
    repsCanUseDispatch: 'value', quotaPeriods: 'value', dispatchLicenses: 'value', featureFlags: 'value', aiSettings: 'value',
    painPoints: 'value', competitors: 'value', reasonsWon: 'value', reasonsLost: 'value',
};

test('S12 — THE CLASS: every key the settings PUT stores is classified — checked here, its own check, the server\'s, 4b-4\'s, by design, retired or a value with no ids', () => {
    const s = code(read('netlify/functions/settings.mjs'));
    const block = s.slice(s.indexOf('const extra = {'), s.indexOf('anthropicApiKey:  encryptedApiKey,') + 'anthropicApiKey:'.length);
    const keys = [...block.matchAll(/^\s{16}([A-Za-z]+):/gm)].map((m) => m[1]);
    assert.ok(keys.length >= 80, `the PUT's keys read: ${keys.length}`);
    for (const k of keys) assert.ok(k in CLASSIFIED, `${k}: a settings key nobody classified — does it hold ids? (state §0.221)`);
    for (const k of Object.keys(CLASSIFIED)) assert.ok(keys.includes(k), `${k}: classified but no longer stored`);
    for (const k of Object.keys(SETTINGS_LINKS)) assert.equal(CLASSIFIED[k], 'links', k);
    for (const k of SETTINGS_LISTS) assert.ok(['links', 'list'].includes(CLASSIFIED[k]), k);
    for (const [k, why] of Object.entries(CLASSIFIED)) if (why === 'links') assert.ok(k in SETTINGS_LINKS, k);
    for (const [k, why] of Object.entries(CLASSIFIED)) if (why === 'list') assert.ok(SETTINGS_LISTS.includes(k), k);
});

test('S13 — the suites: this file is graded by the harness; the integration suite runs in test:int', () => {
    const suites = read('scripts/mutate-import.mjs').match(/^const SUITES = '([^'\n]*)';$/m)?.[1].split(' ') ?? [];
    assert.ok(suites.includes('tests/settings-links.test.mjs'), 'SUITES runs this file');
    assert.ok(JSON.parse(read('package.json')).scripts['test:int'].includes('tests/integration/settings-links.itest.mjs'), 'test:int runs the integration suite');
});
