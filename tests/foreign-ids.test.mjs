// An id another org holds (state §0.166 — the cross-org audit's lower findings).
// Ids are global keys: a write naming one that another org holds reaches an
// org-scoped upsert that writes nothing. A document create then wrote its
// version and link rows against that org's document, a job create a
// status-history row against its job, and the other creates and PUTs crashed on
// the missing row — a 500 that told the caller the id existed elsewhere — or
// answered 200 with no record. A member's id was the client's, so a create could
// adopt one (a deleted member's personal inbound address names only the id). And
// job-status handed every org's Admin the site's cross-org counts and raw errors.
//
// tests/integration/foreign-ids.itest.mjs proves the behaviour against the
// database for a representative of each kind; this pins the rule in every place.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const code = (src) => src.split(/\r?\n/).filter((l) => !l.trim().startsWith('//')).join('\n');
const fn = (name) => code(read(`netlify/functions/${name}.mjs`));

test('a new member\'s id is minted by the server — the screen sends none, and the create never adopts one', () => {
    const u = fn('users');
    assert.ok(u.includes('const result = await upsertUser(withRole(sanitize({ ...data, id: newUserId() }), createRole));'), 'REGRESSION: a create adopts the id it is sent');
    assert.ok(!u.includes('data.id || newUserId()'));
    const h = code(read('src/hooks/useUserHandlers.js'));
    assert.ok(h.includes('const { id: _noClientId, ...fields } = userData;'), 'the screen sends no id');
    assert.ok(!h.includes("'usr_' + crypto.randomUUID()"), 'REGRESSION: the screen mints the id again');
    assert.ok(h.includes('const savedUser = data.user;') && h.includes('if (!savedUser || !savedUser.id) {'), 'the member is the row the server answers with');
});

test('a document create never takes over an id, and every key must be one the server issues', () => {
    const d = fn('documents');
    assert.ok(d.includes('.onConflictDoNothing({ target: documents.id })'), 'REGRESSION: the create upserts again');
    assert.ok(d.includes("if (!created) return { statusCode: 409, headers, body: JSON.stringify({ error: 'That document id is already in use.' }) };"), 'REGRESSION: the version and link rows go in for an id the create did not write');
    const create = d.slice(d.indexOf("if (!action || action === 'create') {"), d.indexOf("if (action === 'new-version') {"));
    assert.ok(create.indexOf('if (!created) return') < create.indexOf('await db.insert(documentVersions)'), 'refused before the version row');
    assert.ok(create.indexOf('if (!created) return') < create.indexOf('await insertLinks(orgId, id, links)'), 'and before the links');
    assert.ok(d.includes('const KEY_SHAPE = /^[^/]+\\/[^/]+\\/v\\d+\\/[A-Za-z0-9._-]+$/;'));
    assert.ok(d.includes('typeof key === \'string\' && key.startsWith(`${orgId}/${docId}/v${v}/`) && KEY_SHAPE.test(key);'), 'REGRESSION: any key under the prefix is taken');
    assert.ok(d.includes("if (!keyIs(storageKey, orgId, id, 1)) return"), 'a create takes version 1\'s key');
    assert.ok(d.includes("if (!keyIs(storageKey, orgId, id, v)) return"), 'a new version takes the next version\'s key');
    assert.ok(!d.includes('keyBelongsTo'));
    // The owner and each version's author are the caller's roster name — verifyAuth
    // never carried a userName, so all of them read "Unknown" (the §0.166 pane check).
    assert.ok(!d.includes('auth.userName'), 'REGRESSION: a field verifyAuth never sets decides who did it');
    assert.equal(d.split('(await getCallerName(userId, orgId)) || \x27Unknown\x27').length - 1, 3, 'the create, a new version and a restore');
});

test('a job create naming another org\'s job is refused before its status history, notice and audit', () => {
    const j = fn('dispatch-jobs');
    const guard = "if (!written) return { statusCode: 409, headers, body: JSON.stringify({ error: 'That job id is already in use.' }) };";
    assert.ok(j.includes(guard), 'REGRESSION: a stray status-history row goes in against another org\'s job');
    assert.ok(j.indexOf(guard) < j.indexOf("await recordStatusChange(orgId, data.id, null, row.status, userId, 'Job created');"), 'before the status history');
});

test('a line item and a location belong to one of this org\'s jobs and customers', () => {
    const j = fn('dispatch-jobs');
    assert.ok(j.includes(".where(and(eq(dispatchJobs.id, data.jobId), eq(dispatchJobs.orgId, orgId)));"));
    assert.ok(j.includes("if (!ownJob) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Job not found' }) };"), 'REGRESSION: a line item is filed against another org\'s job');
    const c = fn('dispatch-customers');
    assert.ok(c.includes(".where(and(eq(dispatchCustomers.id, data.customerId), eq(dispatchCustomers.orgId, orgId)));"));
    assert.ok(c.includes("if (!ownCust) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Customer not found' }) };"), 'REGRESSION: a location is filed under another org\'s customer');
});

test('every dispatch create answers 409 for an id another org holds — never a crash', () => {
    const cases = [
        ['dispatch-jobs', 'line item'], ['dispatch-customers', 'location'], ['dispatch-customers', 'customer'],
        ['dispatch-equipment', 'equipment'], ['dispatch-schedule-blocks', 'block'], ['dispatch-service-plans', 'plan'],
        ['dispatch-technicians', 'technician'], ['dispatch-vehicles', 'vehicle'],
    ];
    for (const [file, what] of cases) {
        assert.ok(fn(file).includes(`if (!inserted) return { statusCode: 409, headers, body: JSON.stringify({ error: 'That ${what} id is already in use.' }) };`),
            `REGRESSION: ${file}'s ${what} create crashes on another org's id — a 500 that says the id exists`);
    }
});

test('a PUT naming a record another org holds answers 404 — spiff claims and products now; the four strictly-update PUTs already did', () => {
    for (const [file, v, noun] of [['spiff-claims', 'upserted', 'Claim'], ['products', 'updated', 'Product']]) {
        assert.ok(fn(file).includes(`if (!${v}) return { statusCode: 404, headers, body: JSON.stringify({ error: '${noun} not found in your organization' }) };`),
            `REGRESSION: ${file}'s PUT crashes on another org's record — a 500 that says it exists`);
    }
    // These look the record up in the org before their upsert ("PUT is strictly
    // an update"), so another org's id never reaches it.
    for (const [file, noun] of [['accounts', 'Account'], ['contacts', 'Contact'], ['tasks', 'Task'], ['opportunities', 'Opportunity']]) {
        const s = fn(file);
        const early = s.indexOf(`return { statusCode: 404, headers, body: JSON.stringify({ error: '${noun} not found' }) };`);
        assert.ok(early > 0 && early < s.indexOf('onConflictDoUpdate'), `${file}'s PUT looks the record up in the org before its upsert`);
    }
});
