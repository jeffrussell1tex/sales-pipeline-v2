// tests/dispatch-links.test.mjs
//
// Dispatch's links name live rows of this org (state §0.201 — batch 4b-1 of OPEN_ITEMS §1 item 1; Jeff, 14 Oct:
// "Three batches, Dispatch first", "Any row of the org", "Fix it in 4b-1", "Org check, no self-link").
//
// Before: a dispatch job's crew, vehicle, reserved units, service plan, follow-up and parent job; a vehicle's
// technician; a technician's vehicle and login; an equipment unit's holder; a customer's plan and preferred
// technician; a plan visit's plan; a time-off block's technician — each was stored as sent, another org's id or one
// naming nothing (the census, 14 Oct: none today). A job whose crew names no technician of the org vanished from the
// day board and the queue. The Technicians screen stored a member's app id as the login no sign-in matches (every
// Technician linked there was refused), and any full-access role could link a technician row to anyone's login.
// Here: batch 4's machinery (src/utils/linkIds.js) on Dispatch's kinds, a link that may not name its own row, the
// login's decision (src/utils/techLogin.js), all run on made-up rows; and THE GUARD — every write path asks what it
// names anew, the restore clears Dispatch's strays, the screens say why. tests/integration/dispatch-links.itest.mjs
// proves each against the database, org A's writes refused for org B's rows and org B untouched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NOUNS, notInOrg, namesItself, linksAsked, linksDecided } from '../src/utils/linkIds.js';
import { loginAsked, loginDecided, LOGIN_NOT_AN_ID, LOGIN_NOT_IN_ORG } from '../src/utils/techLogin.js';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8').replace(/\r\n/g, '\n');
const code = (src) => src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
const fn = (name) => code(read(`netlify/functions/${name}.mjs`));
const count = (s, sub) => s.split(sub).length - 1;
// Each text there, each after the one before it — searched from where that one ended: a line that is gone fails it.
const inOrder = (s, ...texts) => { let at = 0; for (const x of texts) { const i = s.indexOf(x, at); if (i < 0) return false; at = i + x.length; } return true; };

// A job's links as dispatch-jobs.mjs names them (THE GUARD pins the file to these lines).
const CREW = ['assignedTechId', 'coTechIds'];
const JOB = [
    { key: 'assignedTechId', kind: 'technician', heldFrom: CREW },
    { key: 'coTechIds', kind: 'technician', shape: 'many', heldFrom: CREW },
    { key: 'assignedVehicleId', kind: 'vehicle' },
    { key: 'assignedEquipmentIds', kind: 'equipment', shape: 'many' },
    { key: 'servicePlanId', kind: 'plan' },
    { key: 'followUpJobId', kind: 'job', notSelf: true },
    { key: 'parentJobId', kind: 'job', notSelf: true },
];
const freshOf = (asked) => Object.fromEntries((asked.asks || []).map((a) => [a.key, a.fresh]));

test("the words name Dispatch's kinds in batch 4's; a job that names itself is refused in words of its own", () => {
    assert.equal(notInOrg('technician'), 'That technician is not in your organization — pick one from the list.');
    assert.equal(notInOrg('vehicle'), 'That vehicle is not in your organization — pick one from the list.');
    assert.equal(notInOrg('equipment'), 'That equipment unit is not in your organization — pick one from the list.');
    assert.equal(notInOrg('plan'), 'That service plan is not in your organization — pick one from the list.');
    assert.equal(notInOrg('job'), 'That job is not in your organization — pick one from the list.');
    assert.equal(namesItself('job'), 'A job cannot name itself.');
    for (const k of ['technician', 'vehicle', 'equipment', 'plan', 'job']) assert.ok(k in NOUNS, k);
});

test("a job's crew is one link: a lead swap or a drag that only moves a technician the job holds is not asked; a technician named anew is", () => {
    const stored = { id: 'j1', assignedTechId: 't1', coTechIds: ['t2'] };
    assert.deepEqual(freshOf(linksAsked(JOB, { assignedTechId: 't2', coTechIds: ['t1'] }, stored)), {}, 'the lead and a co-tech swapped: both held');
    assert.deepEqual(freshOf(linksAsked(JOB, { assignedTechId: 't1', coTechIds: ['t2', 't3'] }, stored)), { coTechIds: ['t3'] }, 'a third added: asked');
    assert.deepEqual(freshOf(linksAsked(JOB, { assignedTechId: 't9' }, stored)), { assignedTechId: ['t9'] }, 'a new lead: asked');
    assert.deepEqual(freshOf(linksAsked(JOB, { assignedTechId: 't1', coTechIds: ['t2'] }, null)), { assignedTechId: ['t1'], coTechIds: ['t2'] }, 'a create asks its whole crew');
    assert.deepEqual(freshOf(linksAsked(JOB, { assignedTechId: null, coTechIds: [] }, stored)), {}, 'released: nothing to ask');
    assert.deepEqual(linksAsked(JOB, { coTechIds: '["t2"]' }, stored), { status: 400, error: 'A link must name a record by its id.', field: 'coTechIds' },
        'a list sent as a string is no list');
});

test("a job's vehicle, units, plan and linked jobs: asked when named anew, held when the job has them", () => {
    const stored = { id: 'j1', assignedVehicleId: 'v1', assignedEquipmentIds: ['e1'], servicePlanId: 'p1', followUpJobId: null, parentJobId: 'j0' };
    assert.deepEqual(freshOf(linksAsked(JOB, { assignedVehicleId: 'v1', assignedEquipmentIds: ['e1'], servicePlanId: 'p1', parentJobId: 'j0' }, stored)), {}, 'all held');
    assert.deepEqual(freshOf(linksAsked(JOB, { assignedVehicleId: 'v2', assignedEquipmentIds: ['e1', 'e2'], servicePlanId: 'p2', followUpJobId: 'j3' }, stored)),
        { assignedVehicleId: ['v2'], assignedEquipmentIds: ['e2'], servicePlanId: ['p2'], followUpJobId: ['j3'] });
});

test('a job may not name itself — on a create (its body\'s id) or an update (its own row) — though one it already holds is never asked again', () => {
    assert.deepEqual(linksAsked(JOB, { parentJobId: 'j1' }, { id: 'j1' }), { status: 400, error: 'A job cannot name itself.', field: 'parentJobId' });
    assert.deepEqual(linksAsked(JOB, { id: 'j9', followUpJobId: 'j9' }, null), { status: 400, error: 'A job cannot name itself.', field: 'followUpJobId' });
    assert.deepEqual(freshOf(linksAsked(JOB, { parentJobId: 'j1' }, { id: 'j1', parentJobId: 'j1' })), {}, 'held: never asked again');
    assert.deepEqual(freshOf(linksAsked(JOB, { parentJobId: 'j2' }, { id: 'j1' })), { parentJobId: ['j2'] }, 'another job: asked');
    assert.deepEqual(freshOf(linksAsked([{ key: 'assignedTechId', kind: 'technician' }], { assignedTechId: 'j1' }, { id: 'j1' })), { assignedTechId: ['j1'] },
        'only a notSelf link is held to it');
});

test("what a Dispatch write stores: a technician, vehicle, unit, plan or job no live row of this org has is refused 404 in the kind's words, naming the field", () => {
    const live = new Map([['t1', 't1'], ['v1', 'v1'], ['e1', 'e1'], ['p1', 'p1'], ['j2', 'j2']]);
    const decide = (data) => { const a = linksAsked(JOB, data, { id: 'j1' }); return a.error ? a : linksDecided(a.asks, data, () => live); };
    assert.deepEqual(decide({ assignedTechId: 't1', coTechIds: ['t1'], assignedVehicleId: 'v1', assignedEquipmentIds: ['e1'], servicePlanId: 'p1', parentJobId: 'j2' }), { set: {} });
    assert.deepEqual(decide({ coTechIds: ['t1', 'tB'] }), { status: 404, error: notInOrg('technician'), field: 'coTechIds' }, "another org's co-tech");
    assert.deepEqual(decide({ assignedVehicleId: 'vGone' }), { status: 404, error: notInOrg('vehicle'), field: 'assignedVehicleId' });
    assert.deepEqual(decide({ assignedEquipmentIds: ['e1', 'eB'] }), { status: 404, error: notInOrg('equipment'), field: 'assignedEquipmentIds' });
    assert.deepEqual(decide({ servicePlanId: 'pB' }), { status: 404, error: notInOrg('plan'), field: 'servicePlanId' });
    assert.deepEqual(decide({ followUpJobId: 'jB' }), { status: 404, error: notInOrg('job'), field: 'followUpJobId' });
});

test("a technician's login: a member of this org by their app id (the screen's pick) or their Clerk identity; the one the row holds is never asked again; a non-member, one not signed in yet, or one another technician holds is refused", () => {
    assert.deepEqual(loginAsked({ firstName: 'Ann' }, { userId: 'user_a' }), { keep: true }, 'not named: kept');
    assert.deepEqual(loginAsked({ userId: 'user_a' }, { userId: 'user_a' }), { keep: true }, 'the one it holds: never asked again');
    assert.deepEqual(loginAsked({ userId: null }, { userId: 'user_a' }), { clear: true }, 'unlinked');
    assert.deepEqual(loginAsked({ userId: '' }, null), { clear: true });
    assert.deepEqual(loginAsked({ userId: 7 }, null), { status: 400, error: LOGIN_NOT_AN_ID, field: 'userId' });
    assert.deepEqual(loginAsked({ userId: 'usr_ann' }, { userId: 'user_a' }), { member: { by: 'id', value: 'usr_ann' } }, "the screen's pick: a member's app id");
    assert.deepEqual(loginAsked({ userId: 'user_b' }, null), { member: { by: 'clerkUserId', value: 'user_b' } }, "a Clerk identity (a seed, an API caller)");
    assert.deepEqual(loginDecided(null, null), { status: 404, error: LOGIN_NOT_IN_ORG, field: 'userId' }, 'no member of this org');
    assert.equal(LOGIN_NOT_IN_ORG, 'That member is not in your organization — pick one from the list.');
    assert.deepEqual(loginDecided({ id: 'usr_ann', name: 'Ann Lee', clerkUserId: null }, null),
        { status: 409, error: 'Ann Lee has not signed in yet — link them once they have accepted their invitation.', field: 'userId' }, 'an invite not yet accepted');
    assert.deepEqual(loginDecided({ id: 'usr_ann', name: 'Ann Lee', clerkUserId: 'user_a' }, 'Bob Ray'),
        { status: 409, error: 'Ann Lee is already linked to Bob Ray — unlink them there first.', field: 'userId' }, 'one login, one technician');
    assert.deepEqual(loginDecided({ id: 'usr_ann', name: 'Ann Lee', clerkUserId: 'user_a' }, null), { userId: 'user_a' }, 'stored as the Clerk identity a sign-in is matched against');
});

// ── THE GUARD ───────────────────────────────────────────────

const REFUSE = "if (linked.error) return { statusCode: linked.status, headers, body: JSON.stringify({ error: linked.error, field: linked.field }) };";

test("THE GUARD: every Dispatch write path asks the links it names anew — after reading what the row holds — and answers the refusal before anything is written", () => {
    const j = fn('dispatch-jobs');
    assert.ok(j.includes([
        "const CREW = ['assignedTechId', 'coTechIds'];",
        'const JOB_LINKS = [',
        "    { key: 'customerId', kind: 'customer' },",
        "    { key: 'locationId', kind: 'location' },",
        "    { key: 'accountId', kind: 'account' },",
        "    { key: 'opportunityId', kind: 'deal' },",
        "    { key: 'assignedTechId', kind: 'technician', heldFrom: CREW },",
        "    { key: 'coTechIds', kind: 'technician', shape: 'many', heldFrom: CREW },",
        "    { key: 'assignedVehicleId', kind: 'vehicle' },",
        "    { key: 'assignedEquipmentIds', kind: 'equipment', shape: 'many' },",
        "    { key: 'servicePlanId', kind: 'plan' },",
        "    { key: 'followUpJobId', kind: 'job', notSelf: true },",
        "    { key: 'parentJobId', kind: 'job', notSelf: true },",
        '];',
    ].join('\n')), 'the job: its crew one link, its vehicle, units, plan and linked jobs (never itself) — this file\'s spec, the one run above');
    assert.ok(j.includes('const linked = await checkLinks(JOB_LINKS, data, priorJob || null, orgId);') && j.includes('const linked = await checkLinks(JOB_LINKS, data, current, orgId);'), 'the create (an upsert, its prior row held) and the update');

    const t = fn('dispatch-technicians');
    assert.ok(t.includes("const TECH_LINKS = [{ key: 'assignedVehicleId', kind: 'vehicle' }];"));
    assert.ok(t.includes("import { loginAsked, loginDecided } from '../../src/utils/techLogin.js';"));
    assert.ok(inOrder(t, 'async function loginOf(orgId, techId, data, stored) {', '    const asked = loginAsked(data, stored);', '    if (asked.status || asked.keep) return asked;',
        '    if (asked.clear) return { userId: null };', "    const by = asked.member.by === 'id' ? users.id : users.clerkUserId;",
        '.where(and(eq(users.orgId, orgId), eq(by, asked.member.value)));',
        '.where(and(eq(dispatchTechnicians.orgId, orgId), eq(dispatchTechnicians.userId, member.clerkUserId), ne(dispatchTechnicians.id, techId)))',
        '    return loginDecided(member || null, taken ? techName(taken) : null);'),
        'the login: a member of THIS org — by the column the value names — never one another technician of the org holds');
    assert.ok(inOrder(t, "            const [prior] = await db.select({ id: dispatchTechnicians.id, userId: dispatchTechnicians.userId, assignedVehicleId: dispatchTechnicians.assignedVehicleId })",
        '            const linked = await checkLinks(TECH_LINKS, data, prior || null, orgId);', REFUSE,
        '            const login = await loginOf(orgId, data.id, data, prior || null);',
        "            if (login.status) return { statusCode: login.status, headers, body: JSON.stringify({ error: login.error, field: login.field }) };",
        '                userId:           login.keep ? (prior ? prior.userId : null) : login.userId,'), "the create: an upsert, its vehicle and login held from the row it overwrites");
    assert.ok(inOrder(t, "            const [current] = await db.select({ id: dispatchTechnicians.id, userId: dispatchTechnicians.userId, assignedVehicleId: dispatchTechnicians.assignedVehicleId })",
        "            if (!current) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };",
        '            const linked = await checkLinks(TECH_LINKS, data, current, orgId);', REFUSE,
        '            const login = await loginOf(orgId, id, data, current);',
        "            if (login.status) return { statusCode: login.status, headers, body: JSON.stringify({ error: login.error, field: login.field }) };",
        '            if (!login.keep) updates.userId = login.userId;',
        "                'firstName','lastName','email','phone','employmentType',"), 'the update: the login only through loginOf — never the field list');
    assert.ok(!t.includes("'userId','firstName'"), 'userId is not a plain field any more');
    assert.ok(inOrder(t, "            const logins = [...new Set(rows.map((r) => r.userId).filter(Boolean))];", '.where(and(eq(users.orgId, orgId), inArray(users.clerkUserId, logins)))',
        'body: JSON.stringify({ technicians: rows.map((r) => normalise({ ...r, memberId: memberOf.get(r.userId) || null })) }),'),
        "the list says which member each login names, by their app id — read in this org — for the screen's picker");
    assert.ok(t.includes('    const [member] = await db.select({ id: users.id }).from(users).where(and(eq(users.orgId, orgId), eq(users.clerkUserId, login)));'), "a login's member, read in this org");
    assert.ok(t.includes('JSON.stringify({ technician: normalise({ ...inserted, memberId: await memberIdOf(orgId, inserted.userId) }) })')
        && t.includes('JSON.stringify({ technician: normalise({ ...updated, memberId: await memberIdOf(orgId, updated.userId) }) })'),
        "a create's and an update's answer name the member, as the list does — the screen puts the answer in its list and its draft (a login just linked showed as no member's)");

    const v = fn('dispatch-vehicles');
    assert.ok(v.includes("const VEHICLE_LINKS = [{ key: 'assignedTechId', kind: 'technician' }];"));
    assert.ok(inOrder(v, "            const [prior] = await db.select({ id: dispatchVehicles.id, assignedTechId: dispatchVehicles.assignedTechId })",
        '            const linked = await checkLinks(VEHICLE_LINKS, data, prior || null, orgId);', REFUSE, '            const row = {'), 'the create: an upsert, its technician held');
    assert.ok(inOrder(v, "            if ('assignedTechId' in data) {", "                const [held] = await db.select({ id: dispatchVehicles.id, assignedTechId: dispatchVehicles.assignedTechId })",
        '                const linked = await checkLinks(VEHICLE_LINKS, data, held, orgId);', REFUSE, '            const updates = { updatedAt: new Date() };'), 'the update');

    const e = fn('dispatch-equipment');
    assert.ok(e.includes("const EQUIPMENT_LINKS = [{ key: 'checkedOutToId', kind: 'technician' }, { key: 'checkedOutJobId', kind: 'job' }];"));
    assert.ok(inOrder(e, "            const [prior] = await db.select({ id: dispatchEquipment.id, checkedOutToId: dispatchEquipment.checkedOutToId, checkedOutJobId: dispatchEquipment.checkedOutJobId })",
        '            const linked = await checkLinks(EQUIPMENT_LINKS, data, prior || null, orgId);', REFUSE, '            const row = {'), 'the create');
    assert.ok(inOrder(e, "            const named = action === 'checkin' ? null : data;",
        '            if (named && EQUIPMENT_LINKS.some((l) => l.key in named)) {',
        '                const [held] = await db.select({ id: dispatchEquipment.id, checkedOutToId: dispatchEquipment.checkedOutToId, checkedOutJobId: dispatchEquipment.checkedOutJobId })',
        '                const linked = await checkLinks(EQUIPMENT_LINKS, named, held, orgId);', REFUSE,
        "            if (action === 'checkout') {"), 'a check-out and an edit name what they send (a holder a check-out leaves out is cleared, not asked); a check-in nothing — before the write');

    const c = fn('dispatch-customers');
    assert.ok(c.includes(['const CUSTOMER_LINKS = [', "    { key: 'accountId', kind: 'account' },", "    { key: 'servicePlanId', kind: 'plan' },", "    { key: 'preferredTechId', kind: 'technician' },", '];'].join('\n')));
    assert.ok(c.includes('                servicePlanId: dispatchCustomers.servicePlanId, preferredTechId: dispatchCustomers.preferredTechId })'), "the create reads the plan and technician the customer holds");
    assert.ok(inOrder(c, '            if (CUSTOMER_LINKS.some((l) => l.key in data)) {',
        '                const [held] = await db.select({ accountId: dispatchCustomers.accountId, servicePlanId: dispatchCustomers.servicePlanId,',
        '                    preferredTechId: dispatchCustomers.preferredTechId }).from(dispatchCustomers)'),
        "an update naming any of its links reads all three it holds");

    const p = fn('dispatch-plan-visits');
    assert.ok(p.includes("const PLAN_VISIT_LINKS = [{ key: 'customerId', kind: 'customer' }, { key: 'planId', kind: 'plan' }];"));
    assert.ok(inOrder(p, '            const linked = await checkLinks(PLAN_VISIT_LINKS, data, null, orgId);', REFUSE, '            const me = await resolveCaller(userId, orgId);'), "both asked — the record's identity — before it is written");
    assert.ok(!p.includes('if (!cust) return') && p.includes('entityName: cust ? cust.name : null,'),
        "checkLinks is the visit's one customer check — the name read for the log only (a second refusal behind it made a mutant of the first prove nothing)");

    const b = fn('dispatch-schedule-blocks');
    assert.ok(b.includes("const BLOCK_LINKS = [{ key: 'techId', kind: 'technician' }];"));
    assert.ok(inOrder(b, "            const [prior] = await db.select({ id: dispatchScheduleBlocks.id, techId: dispatchScheduleBlocks.techId })",
        '            if (prior && prior.techId !== data.techId) {',
        "                return { statusCode: 409, headers, body: JSON.stringify({ error: 'A block stays with its technician — add a new one for another.', field: 'techId' }) };",
        '            const linked = await checkLinks(BLOCK_LINKS, data, prior || null, orgId);', REFUSE,
        '                    set: { ...row, createdAt: undefined, techId: undefined, createdBy: undefined },'),
        "a block stays with its technician on a re-POST, as the PUT keeps it — refused, never re-pointed — and its author stays the first create's");

    for (const [name, n] of [['dispatch-jobs', 2], ['dispatch-technicians', 2], ['dispatch-vehicles', 2], ['dispatch-equipment', 2], ['dispatch-customers', 2], ['dispatch-plan-visits', 1], ['dispatch-schedule-blocks', 1]]) {
        assert.equal(count(fn(name), REFUSE), n, `${name}: each check's refusal answered`);
        assert.ok(fn(name).includes("import { checkLinks } from './_links.mjs';"), name);
    }
});

test("THE GUARD: an Admin's restore clears Dispatch's strays on the rows it restored — a login that names no member of this org too — returns a unit whose holder it cleared to the shelf, and says what it could not clear (E4)", () => {
    const l = code(read('netlify/functions/_links.mjs'));
    assert.ok(l.includes("    technician: dispatchTechnicians, vehicle: dispatchVehicles, equipment: dispatchEquipment, plan: dispatchServicePlans, job: dispatchJobs,"), "Dispatch's kinds, read in this org as any kind is");
    assert.ok(l.includes([
        "    [dispatchJobs, 'opportunityId', 'deal', 'one'],",
        "    [dispatchJobs, 'assignedTechId', 'technician', 'one'],",
        "    [dispatchJobs, 'coTechIds', 'technician', 'many'],",
        "    [dispatchJobs, 'assignedVehicleId', 'vehicle', 'one'],",
        "    [dispatchJobs, 'assignedEquipmentIds', 'equipment', 'many'],",
        "    [dispatchJobs, 'servicePlanId', 'plan', 'one'],",
        "    [dispatchJobs, 'followUpJobId', 'job', 'one'],",
        "    [dispatchJobs, 'parentJobId', 'job', 'one'],",
        "    [dispatchJobs, 'quoteId', 'quote', 'one'],",
        "    [dispatchVehicles, 'assignedTechId', 'technician', 'one'],",
        "    [dispatchTechnicians, 'assignedVehicleId', 'vehicle', 'one'],",
        "    [dispatchTechnicians, 'userId', 'login', 'one'],",
        "    [dispatchEquipment, 'checkedOutToId', 'technician', 'one'],",
        "    [dispatchEquipment, 'checkedOutJobId', 'job', 'one'],",
        "    [dispatchCustomers, 'servicePlanId', 'plan', 'one'],",
        "    [dispatchCustomers, 'preferredTechId', 'technician', 'one'],",
        '];',
    ].join('\n')), "Dispatch's links after batch 4's, as the restore clears them");
    assert.ok(l.includes('const SWEPT = Object.freeze({ ...TABLES, quote: quotes });'));
    assert.ok(inOrder(l, "    const inOrg = kind === 'login'",
        '        ? (expr) => sql`EXISTS (${db.select({ one: sql`1` }).from(users).where(and(eq(users.orgId, orgId), sql`${users.clerkUserId} = ${expr}`))})`',
        '        : (expr) => sql`EXISTS (SELECT 1 FROM ${named} AS link_parent WHERE link_parent.id = ${expr} AND link_parent.org_id = ${orgId})`;'),
        "a login names a member of this org by their Clerk identity — the users table read where it is named");
    assert.ok(inOrder(l, '    const unheld = new Set();', '            if (table === dispatchEquipment) for (const id of done.ids || []) unheld.add(id);',
        '    if (unheld.size) {', "            await db.update(dispatchEquipment).set({ status: 'available', checkedOutAt: null })",
        "                .where(and(eq(dispatchEquipment.orgId, orgId), inArray(dispatchEquipment.id, [...unheld]), eq(dispatchEquipment.status, 'checked_out'),",
        "                    sql`coalesce(${dispatchEquipment.checkedOutToId}, '') = ''`, sql`coalesce(${dispatchEquipment.checkedOutJobId}, '') = ''`));",
        '            shelfFailed = true;'),
        'a unit whose holder the clean-up cleared, now held by no one, is back on the shelf — only those, in this org; a failure said apart');
    assert.ok(l.includes('    return { cleared, jobsWithoutCustomer, quotesWithoutDeal, locationsWithoutCustomer, lineItemsWithoutJob, historyWithoutJob, shelfFailed, failed };'));
    for (const [name, line] of [
        ['a location\'s customer', "const locationsWithoutCustomer = await countRequired(orgId, restored, dispatchServiceLocations, 'customerId', dispatchCustomers, failed);"],
        ['a line item\'s job', "const lineItemsWithoutJob = await countRequired(orgId, restored, dispatchJobLineItems, 'jobId', dispatchJobs, failed);"],
        ['a history entry\'s job', "const historyWithoutJob = await countRequired(orgId, restored, dispatchJobStatusHistory, 'jobId', dispatchJobs, failed);"],
    ]) assert.ok(l.includes(line), `${name}: required, counted`);

    const b = code(read('netlify/functions/backup.mjs'));
    assert.ok(b.includes("const ID_LISTS = new Set(['coTechIds', 'assignedEquipmentIds', 'co_tech_ids', 'assigned_equipment_ids']);"));
    assert.ok(!/JSONB_KEYS = new Set\(\[[^\]]*coTechIds/.test(b), 'a co-tech list is never stringified: the clean-up reads lists');
    assert.ok(inOrder(b, '                ID_LISTS.forEach(k => {', "                    if (typeof out[k] !== 'string') return;", '                    try { const list = JSON.parse(out[k]); if (Array.isArray(list)) out[k] = list; } catch { /* kept as the file has it */ }'),
        'a list a file carries as a string is read back to its list');
    for (const k of ['locationsWithoutCustomer', 'lineItemsWithoutJob', 'historyWithoutJob']) {
        assert.ok(b.includes(`if (swept.${k}) notes.push(`), `${k}: said in the answer`);
        assert.ok(b.includes(`swept.${k} ? \`\${swept.${k}} `), `${k}: and in the log`);
    }
    assert.ok(b.includes("                if (swept.shelfFailed) errs.push('equipment: the units whose holder was cleared could not be marked available — they show as checked out to no one. Set them to Available in Settings → Dispatch → Vehicles & equipment.');"),
        "a shelf reset that fails is said in words of its own — its links were cleared, not left as the file had them (the review)");
});

test("THE GUARD: the Technicians screen picks a member by their app id and shows the one a login names; mass scheduling says why a job was refused", () => {
    const d = code(read('src/Tabs/DispatchTab.jsx'));
    assert.ok(d.includes("    const linkedUser = draft && draft.memberId ? (users || []).find(u => u.id === draft.memberId) : null;"));
    assert.ok(inOrder(d, "                            <select value={draft.memberId || (draft.userId ? '__held__' : '')}",
        "                                onChange={e => { if (saving) return; const v = e.target.value; setDraft(d => { const row = (techsRaw || []).find(t => t.id === d.id);",
        "                                    return { ...d, userId: v && row && row.memberId === v ? row.userId : v, memberId: v || null }; }); }}",
        '                                {draft.userId && !draft.memberId && <option value="__held__">Unknown login — no member of this organization has it</option>}',
        '                                {(users || []).map(u => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}',
        "                                    : draft.userId && !draft.memberId",
        "                                        ? 'No member of your organization has this login, so no one signs in as this technician. Pick a member, or No login to clear it.'"),
        "the member the login names is selected; a pick sends their app id, which the server turns into their login; a login no member has is kept until changed, and said so");
    assert.ok(inOrder(d, '                                {t.memberId', "fontWeight: 700 }}>app user</span>", '                                    : t.userId', "fontWeight: 700 }}>unknown login</span>"),
        "the list says 'app user' for a login a member has, 'unknown login' for one no member has (the review: three descriptions disagreed)");
    assert.ok(!d.includes("<select value={draft.userId || ''} onChange={e => set('userId', e.target.value)}"), "the picker never stores a member's app id as the login");
    assert.ok(inOrder(d, '        if (draft && ((draft._isNew && selectedId == null) || draft.id === selectedId)) return;',
        '    const set = (k, v) => { if (saving) return; setDraft(d => ({ ...d, [k]: v })); };',
        '    const guarded = (action) => {', '        if (saving) return;', '        if (draftIsDirty(draft, (techsRaw || []).find(t => t.id === draft?.id))) {',
        '            if (saved) { onSaved(saved); setDraft({ ...saved }); setSelectedId(saved.id); }',
        '                                onChange={e => { if (saving) return; const v = e.target.value; setDraft(d => { const row = (techsRaw || []).find(t => t.id === d.id);'),
        "while a save is out the form holds still and stays on its technician — no field, chip or pick changes it, no list pick or '+ New' leaves it — so the answer is the form's own, taken whole: the login stored and the row's updatedAt, its words with it; a new form gives way to a technician picked (the form read as unsaved after every save; the re-checks: a change typed during the save was overwritten, a technician re-opened got its old values back, 'Saved' landed under another form)");
    assert.ok(!d.includes('draftRef'), 'no answer-time merge: nothing to merge');
    assert.ok(inOrder(d, '    const savingRef = React.useRef(false);',
        '            if (confirmDiscard) { confirmDiscard(UNSAVED_MSG, () => { if (!savingRef.current) action(); }); return; }',
        '        setSaving(true); savingRef.current = true; setStatus(null);', '            setSaving(false); savingRef.current = false;',
        "    const held = saving ? { opacity: 0.6, pointerEvents: 'none' } : null;",
        "        <div style={{ display: 'flex', height: '100%', overflow: 'hidden', cursor: saving ? 'wait' : undefined }} aria-busy={saving}>",
        "            <div style={{ width: 300, borderRight: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column', background: T.surface, ...held }}>",
        '                    <div style={{ maxWidth: 620, ...held }}>'),
        "what a discard prompt runs later asks the hold as it is then (a save begun behind the open prompt let a confirmed pick move the form); the hold is shown — the list and the form dimmed, out of the pointer's reach, a wait cursor (the third re-check: it was silent)");
    assert.ok(d.includes("            !(k === 'workingHours' && JSON.stringify(v) === JSON.stringify(defaultWorkWeek())));"),
        "a new technician's default week is not typed — an untouched '+ New' reads unsaved no more");
    assert.ok(d.includes("        setMassSaving(true);\n        setMassProg({ done: 0, total: massPlan.proposals.length, failed: 0, error: '' });"),
        "a second press counts afresh — the last run's count and words are not shown as this one's");
    assert.ok(inOrder(d, "        let firstError = '';", "                    throw new Error(`${pr.job.title || pr.job.customer || 'A job'}: ${data.error || ('HTTP ' + res.status)}`);",
        '                if (!firstError) firstError = e.message;', '            setMassProg({ done, total: massPlan.proposals.length, failed, error: firstError });',
        '        if (!failed) setMassPlan(null);', '        else setMassPlan(p => p && { ...p, proposals: p.proposals.filter(pr => !applied.includes(pr)) });'),
        "the first refusal's words kept — the server's, with the job they are about — not 'HTTP 404'; what landed leaves the panel, so a second press sends only the rest");
    assert.ok(inOrder(d, '                {(saving || progress.failed > 0) && (',
        "                    <span style={{ fontSize: 12, color: saving ? T.inkMuted : T.danger, fontFamily: T.mono, marginRight: 'auto' }}>",
        "{progress.done}/{progress.total} scheduled{progress.failed ? ` · ${progress.failed} failed${progress.error ? ` — ${progress.error}` : ''}` : ''}"),
        'and shown — still there once the run ends (the review: it showed only while later jobs were sent)');
});

test('THE GUARD: the readers outside a request\'s org keep its clause — the public status page reads the technician in the job\'s org, the renewal run joins each org\'s plans only', () => {
    assert.ok(fn('dispatch-status').includes('.where(and(eq(dispatchTechnicians.id, job.assignedTechId), eq(dispatchTechnicians.orgId, job.orgId)))'),
        "the status page is unauthenticated: a technician id of another org would show that org's technician's name to a customer");
    assert.ok(fn('pipeline-alerts').includes('                    allPlans.filter(p => p.orgId === orgId),'),
        "the renewal run reads every org's plans in one pass: a plan id of another org would put that org's plan name in an email");
});
