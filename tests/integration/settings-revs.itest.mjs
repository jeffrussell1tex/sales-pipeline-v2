// tests/integration/settings-revs.itest.mjs
// The stale settings save (state §0.224 — batch 4b-3, step B, B-1: the server), against the real test database.
//
// Proves: a save answers the tokens of the keys it sent, the GET the same; a save naming no token for a key none holds
// lands; a stale token is refused (409, `code: 'stale'`, the keys that moved), nothing written, no audit; three tabs;
// a save landing in another's gap is never put back — the gap's save going through the real handler, so it sets its
// tokens as every save does; a stale teams list renames no one, and a write refused in the gap renames no one; after a
// removal a stale teams save is the 409, not the 404, and one holding the removal's tokens lands; a save naming no
// tokens is tried again on a fresh read (Q6, J-B15), refused only after two; a first save racing another on an org
// with no row; a retired key dropped, the server's own and the tokens kept, an older row's own stages kept (J-B3);
// Train now's model never puts back a save made while it trained, and is refused when the rules changed (J-B9); two
// saves of one key at once never both land. Org B's row, byte for byte, after every test.
//
// The auth mock fakes the SIGN-IN only; the handler, its role gate and its queries are the real ones.
//
// Run:  npm run test:int   (needs DATABASE_URL_TEST)
if (!process.env.DATABASE_URL_TEST) {
    throw new Error('DATABASE_URL_TEST is not set — refusing to run integration tests against a non-test database.');
}
process.env.NETLIFY_DATABASE_URL = process.env.DATABASE_URL_TEST;

import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';

const roles = await import('../../src/utils/roles.js');
const roleGate = await import('../../netlify/functions/_roleGate.mjs');

mock.module(new URL('../../netlify/functions/auth.mjs', import.meta.url).href, {
    namedExports: {
        verifyAuth: async (event) => {
            const orgId = event.headers?.['x-test-org'];
            if (!orgId) return { error: 'no test org', status: 401 };
            const userRole = event.headers?.['x-test-role'] || 'Admin';
            return { userId: `clerk_itest_setrevs_${userRole}_${orgId}`, orgId, userRole, managedReps: [], error: null };
        },
        APP_ROLES: roles.APP_ROLES, isAppRole: roles.isAppRole,
        isAdmin: roles.isAdmin, isManager: roles.isManager, canSeeAll: roles.canSeeAll,
        isReadOnly: roles.isReadOnly, isTechnician: roles.isTechnician, isDispatcher: roles.isDispatcher,
        requireWrite: roleGate.requireWrite, requireRole: roleGate.requireRole,
    },
});

const { handler, putSeam } = await import('../../netlify/functions/settings.mjs');
const { removeWithLists } = await import('../../netlify/functions/_links.mjs');
const { scoreOrg } = await import('../../netlify/functions/score-leads-batch.mjs');
const { DEFAULT_LEAD_SCORING } = await import('../../src/utils/leadScoringDefaults.js');
const { DEFAULT_SETTINGS } = await import('../../src/utils/settingsDefaults.js');
const { db } = await import('../../db/index.js');
const { settings, users, leads, auditLog } = await import('../../db/schema.js');
const { eq, and, inArray, sql } = await import('drizzle-orm');
const { assertTestSchema } = await import('./_schema-guard.mjs');

// ORG NAMESPACE: this file owns 'itest_setrevs_*'.
const A     = 'itest_setrevs_A';      // the workspace the tabs save
const B     = 'itest_setrevs_B';      // the other org: must stay as it was
const NEW   = 'itest_setrevs_new';    // no row until a test makes one
const OLD   = 'itest_setrevs_old';    // an older row: stages and pain points in their own columns, a retired key
const TRAIN = 'itest_setrevs_train';  // Train now's org
const ORGS = [A, B, NEW, OLD, TRAIN];

const M1 = 'usr_itest_setrevs_m1', M2 = 'usr_itest_setrevs_m2', M3 = 'usr_itest_setrevs_m3', BM = 'usr_itest_setrevs_bm';
const EAST = 'team_itest_setrevs_east';
const OLD_STAGES = [{ name: 'Old Qualify', weight: 20 }, { name: 'Old Close', weight: 90 }];
const team = (name, repIds, more = {}) => ({ id: EAST, name, managerId: '', repIds, ...more });
const A_EXTRA = () => ({ teams: [team('East', [M1, M2])], territories: [], competitors: ['A Rival'], integrationRequests: { hubspot: { requestedAt: '2026-11-01T00:00:00.000Z' } } });
const B_EXTRA = { teams: [{ id: EAST, name: 'B East', managerId: '', repIds: [BM] }], competitors: ['B Rival'], revs: { teams: 'b_token', competitors: 'b_token2' } };

// Called as the runtime calls it — (event, context, callback): a retry count in the handler's own arguments would meet
// the callback (the review, 2 Nov).
const call = async (org, body, method = 'PUT') => {
    const res = await handler({
        httpMethod: method,
        headers: { 'x-test-org': org, 'x-test-role': 'Admin', 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        queryStringParameters: {},
    }, {}, () => {});
    return { status: res.statusCode, body: JSON.parse(res.body || '{}') };
};
const get = async (org) => (await call(org, undefined, 'GET')).body.settings;
const rowOf = async (org) => (await db.select().from(settings).where(eq(settings.orgId, org)))[0];
const extraText = async (org) => (await db.select({ t: sql`${settings.extra}::text` }).from(settings).where(eq(settings.orgId, org)))[0]?.t ?? null;
const audits = async (org) => (await db.select({ id: auditLog.id }).from(auditLog).where(eq(auditLog.orgId, org))).length;
const teamOf = async (id) => (await db.select({ team: users.team }).from(users).where(eq(users.id, id)))[0]?.team;
let bText;
const bUntouched = async () => {
    assert.equal(await extraText(B), bText, "org B's row, byte for byte");
    assert.equal(await teamOf(BM), 'B East', "org B's member holding the same team id is never renamed");
};

const member = (id, org, name, extra = {}) => ({ id, orgId: org, clerkUserId: `clerk_${id}`, name, email: `${id}@itest.setrevs`, role: 'User', ...extra });
const seedA = async () => {
    await db.delete(settings).where(eq(settings.orgId, A));
    await db.delete(users).where(eq(users.orgId, A));
    await db.insert(settings).values({ id: A, orgId: A, companyName: 'A Corp', extra: A_EXTRA(), updatedAt: new Date() });
    await db.insert(users).values([
        member(M1, A, 'Mia Revs', { team: 'East', profile: { status: 'Active', teamId: EAST } }),
        member(M2, A, 'Max Revs', { team: 'East', profile: { status: 'Active', teamId: EAST } }),
        member(M3, A, 'Moe Revs', { profile: { status: 'Active' } }),
    ]);
};
const seedLeads = (org, n) => {
    const rows = [];
    for (let i = 0; i < n; i++) {
        rows.push({ id: `lead_${org}_${i}`, orgId: org, firstName: 'L', lastName: String(i), company: `Co ${i}`, title: i % 3 === 0 ? 'VP Operations' : 'Analyst',
            source: i % 2 ? 'Referral' : 'Web Form', status: i % 2 ? 'Converted' : 'Dead', estimatedARR: String(1000 * (i + 1)), createdAt: new Date(Date.now() - i * 86400000) });
    }
    return db.insert(leads).values(rows);
};
const scoring = (more = {}) => ({ ...DEFAULT_LEAD_SCORING, enabled: true, predictive: { enabled: true, minClosedRecords: 150, model: null }, ...more });

const cleanup = async () => {
    putSeam.beforeWrite = null;
    await db.delete(auditLog).where(inArray(auditLog.orgId, ORGS));
    await db.delete(users).where(inArray(users.orgId, ORGS));
    await db.delete(leads).where(inArray(leads.orgId, ORGS));
    await db.delete(settings).where(inArray(settings.orgId, ORGS));
};

before(async () => {
    await assertTestSchema(db);
    await cleanup();
    await seedA();
    await db.insert(settings).values([
        { id: B, orgId: B, companyName: 'B Corp', extra: B_EXTRA, updatedAt: new Date() },
        { id: OLD, orgId: OLD, stages: OLD_STAGES, painPoints: ['Old pain'], extra: { roles: [{ id: 'r4', name: 'Retired' }], competitors: ['Old Rival'] }, updatedAt: new Date() },
        { id: TRAIN, orgId: TRAIN, extra: { leadScoring: scoring(), competitors: ['T Rival'] }, updatedAt: new Date() },
    ]);
    await db.insert(users).values(member(BM, B, 'Bea Revs', { team: 'B East', profile: { status: 'Active', teamId: EAST } }));
    await seedLeads(TRAIN, 30);
    bText = await extraText(B);
});
after(cleanup);

test('the tokens: the GET answers them; a save answers those of the keys it sent, the next GET the same; a key with none sent as null lands', async () => {
    await seedA();
    const s = await get(A);
    assert.deepEqual(s.revs, {}, 'none yet');
    const r = await call(A, { competitors: ['A Rival 2'], ifRevs: { competitors: null } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(Object.keys(r.body.revs), ['competitors'], 'only the key sent');
    assert.equal(typeof r.body.revs.competitors, 'string');
    assert.deepEqual(((await get(A)).revs || {}), r.body.revs, 'the GET answers what the save did');
    assert.equal((await call(A, { competitors: [], ifRevs: { competitors: 7 } })).status, 400, 'a token that is no text: refused');
    await bUntouched();
});

test('a stale token: 409, the keys that moved, nothing written, no audit — the save that carried the latest lands', async () => {
    await seedA();
    const first = await call(A, { competitors: ['One'], ifRevs: { competitors: null } });
    assert.equal(first.status, 200);
    const before = await extraText(A), n = await audits(A);
    const stale = await call(A, { competitors: ['Stale'], ifRevs: { competitors: null } });
    assert.equal(stale.status, 409);
    assert.deepEqual(stale.body, { error: 'These settings changed since this page loaded. Reload the page to see the latest, then make your change again.', code: 'stale', stale: ['competitors'] });
    assert.equal(await extraText(A), before, 'nothing written');
    assert.equal(await audits(A), n, 'no audit');
    const fresh = await call(A, { competitors: ['Fresh'], ifRevs: first.body.revs });
    assert.equal(fresh.status, 200);
    assert.deepEqual((await rowOf(A)).extra.competitors, ['Fresh']);
    await bUntouched();
});

test('three tabs: A saves territories, B teams — both land, neither puts back the other; a stale C saving territories is refused', async () => {
    await seedA();
    const loaded = ((await get(A)).revs || {});            // all three tabs load the same tokens
    const a = await call(A, { territories: [{ id: 'terr_itest_setrevs_n', name: 'North', ownerId: '', repIds: [] }], ifRevs: { territories: loaded.territories ?? null } });
    assert.equal(a.status, 200, JSON.stringify(a.body));
    const b = await call(A, { teams: [team('East', [M1, M2], { color: '#123456' })], ifRevs: { teams: loaded.teams ?? null } });
    assert.equal(b.status, 200, JSON.stringify(b.body));
    const c = await call(A, { territories: [], ifRevs: { territories: loaded.territories ?? null } });
    assert.equal(c.status, 409);
    assert.deepEqual(c.body.stale, ['territories']);
    const extra = (await rowOf(A)).extra;
    assert.equal(extra.territories[0].name, 'North', 'A\'s, not put back by B, not taken by C');
    assert.equal(extra.teams[0].color, '#123456', 'B\'s');
    await bUntouched();
});

test('THE SEAM: a save landing in another\'s gap is never put back; one of the same key refuses the other, nothing of it written', async () => {
    await seedA();
    // Another key in the gap: the teams save writes teams alone — the territories the gap's save wrote stay.
    let r0 = ((await get(A)).revs || {});
    putSeam.beforeWrite = async () => {
        putSeam.beforeWrite = null;
        const gap = await call(A, { territories: [{ id: 'terr_itest_setrevs_gap', name: 'Gap', ownerId: '', repIds: [] }] });
        assert.equal(gap.status, 200);
    };
    const r = await call(A, { teams: [team('East', [M1, M2], { color: '#abcdef' })], ifRevs: { teams: r0.teams ?? null } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    let extra = (await rowOf(A)).extra;
    assert.equal(extra.territories[0]?.name, 'Gap', 'REGRESSION: the save put back the territories it read');
    assert.equal(extra.teams[0].color, '#abcdef');
    // The same key in the gap: refused, nothing of it written.
    r0 = ((await get(A)).revs || {});
    putSeam.beforeWrite = async () => {
        putSeam.beforeWrite = null;
        assert.equal((await call(A, { teams: [team('East', [M1, M2], { color: '#000001' })] })).status, 200);
    };
    const n = await audits(A);
    const lost = await call(A, { teams: [team('East', [M1, M2], { color: '#000002' })], ifRevs: { teams: r0.teams } });
    assert.equal(lost.status, 409, JSON.stringify(lost.body));
    assert.deepEqual(lost.body.stale, ['teams']);
    extra = (await rowOf(A)).extra;
    assert.equal(extra.teams[0].color, '#000001', 'the gap\'s save stands');
    assert.equal(await audits(A), n + 1, 'only the gap\'s save audited');
    await bUntouched();
});

test('a stale teams list renames no one; nor a rename refused in its own write', async () => {
    await seedA();
    const r0 = ((await get(A)).revs || {});
    // Tab 1 renames East to North: its holders follow.
    const one = await call(A, { teams: [team('North', [M1, M2])], ifRevs: { teams: r0.teams ?? null } });
    assert.equal(one.status, 200, JSON.stringify(one.body));
    assert.equal(await teamOf(M1), 'North');
    // Tab 2, loaded before, saves the list naming East: refused — the holders keep North.
    const n = await audits(A);
    const two = await call(A, { teams: [team('East', [M1, M2])], ifRevs: { teams: r0.teams ?? null } });
    assert.equal(two.status, 409);
    assert.equal(await teamOf(M1), 'North', 'REGRESSION: a stale tab renamed the holders back');
    assert.equal(await teamOf(M2), 'North');
    assert.equal(await audits(A), n);
    // A rename refused in its own write: in its gap the list already names the team South, under a new token, its
    // holders not renamed — so only this save's own token keeps the refused save from renaming them (the review: a gap
    // still naming North would stop the rename by the list's content alone).
    const r1 = ((await get(A)).revs || {});
    putSeam.beforeWrite = async () => {
        putSeam.beforeWrite = null;
        const now = (await rowOf(A)).extra;
        await db.update(settings).set({ extra: { ...now, teams: [team('South', [M1, M2])], revs: { ...(now.revs || {}), teams: 'gap_token' } } })
            .where(eq(settings.orgId, A));
    };
    const m = await audits(A);
    const race = await call(A, { teams: [team('South', [M1, M2])], ifRevs: { teams: r1.teams } });
    assert.equal(race.status, 409);
    assert.equal(await teamOf(M1), 'North', 'REGRESSION: a save refused in its write renamed its members');
    assert.equal(await teamOf(M2), 'North');
    assert.equal(await audits(A), m, 'no audit of it');
    await bUntouched();
});

test('after a removal: a stale teams save is the 409 and the latest, not the 404; one holding the removal\'s tokens lands', async () => {
    await seedA();
    const r0 = ((await get(A)).revs || {});
    const done = await removeWithLists(A, [M2, `clerk_${M2}`], db.delete(users).where(and(eq(users.id, M2), eq(users.orgId, A))));
    assert.deepEqual(done.lists.teams[0].repIds, [M1]);
    // The stale tab still lists the removed member.
    const stale = await call(A, { teams: [team('East', [M1, M2], { color: '#111111' })], ifRevs: { teams: r0.teams ?? null } });
    assert.equal(stale.status, 409, 'REGRESSION: the stale tab is told "not in your organization" about a member it never picked');
    assert.deepEqual(stale.body.stale, ['teams']);
    assert.deepEqual(Object.keys(done.revs || {}), ['teams'], 'the lists it wrote, each with a new token');
    // The screen that removed the member took the answer's tokens.
    const after = await call(A, { teams: [team('East', [M1], { color: '#222222' })], ifRevs: done.revs });
    assert.equal(after.status, 200, JSON.stringify(after.body));
    await bUntouched();
});

test('a save naming no tokens (Q6): accepted unchecked — lost in its own gap, tried again on a fresh read; refused only after two more', async () => {
    await seedA();
    let fired = 0;
    putSeam.beforeWrite = async () => {
        putSeam.beforeWrite = null;
        fired++;
        assert.equal((await call(A, { competitors: ['Gap'] })).status, 200);
    };
    const r = await call(A, { competitors: ['Mine'] });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(fired, 1);
    assert.deepEqual((await rowOf(A)).extra.competitors, ['Mine'], 'tried again, and landed (J-B15)');
    // Every try loses: two more, then the 409.
    let each = 0;
    const seam = async () => {
        putSeam.beforeWrite = null;
        each++;
        assert.equal((await call(A, { competitors: ['Gap ' + each] })).status, 200);
        putSeam.beforeWrite = seam;
    };
    putSeam.beforeWrite = seam;
    const lost = await call(A, { competitors: ['Never'] });
    putSeam.beforeWrite = null;
    assert.equal(each, 3, 'the first try and two more');
    assert.equal(lost.status, 409);
    assert.deepEqual((await rowOf(A)).extra.competitors, ['Gap 3']);
    await bUntouched();
});

test('a first save racing another on an org with no row: other keys both land; the same key refuses the second', async () => {
    await db.delete(settings).where(eq(settings.orgId, NEW));
    putSeam.beforeWrite = async () => {
        putSeam.beforeWrite = null;
        assert.equal((await call(NEW, { reasonsWon: ['Price'] })).status, 200);
    };
    const r = await call(NEW, { competitors: ['First'], ifRevs: { competitors: null } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    let row = await rowOf(NEW);
    assert.deepEqual(row.extra.reasonsWon, ['Price']);
    assert.deepEqual(row.extra.competitors, ['First']);
    assert.deepEqual(row.extra.pipelines, DEFAULT_SETTINGS.pipelines, 'the seeds (§0.170)');
    await db.delete(settings).where(eq(settings.orgId, NEW));
    putSeam.beforeWrite = async () => {
        putSeam.beforeWrite = null;
        assert.equal((await call(NEW, { competitors: ['Theirs'] })).status, 200);
    };
    const lost = await call(NEW, { competitors: ['Mine'], ifRevs: { competitors: null } });
    assert.equal(lost.status, 409);
    row = await rowOf(NEW);
    assert.deepEqual(row.extra.competitors, ['Theirs']);
    await bUntouched();
});

test('the patch keeps what it does not write: a retired key dropped (§0.171), the server\'s own and the tokens kept, an older row\'s own stages kept (J-B3)', async () => {
    const r = await call(OLD, { reasonsWon: ['Price'] });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const row = await rowOf(OLD);
    assert.ok(!('roles' in row.extra), 'a key the PUT no longer keeps is dropped');
    assert.deepEqual(row.extra.competitors, ['Old Rival'], 'a key not sent kept');
    assert.deepEqual(row.extra.funnelStages, OLD_STAGES, 'REGRESSION (J-B3): the older row\'s own stages hidden under the default');
    assert.deepEqual(row.extra.painPoints, ['Old pain']);
    assert.deepEqual(row.stages, OLD_STAGES, 'the column untouched — not sent');
    assert.deepEqual((await get(OLD)).funnelStages, OLD_STAGES);
    // A's integration requests and tokens survive a save of another key.
    await seedA();
    const t = await call(A, { competitors: ['X'] });
    await call(A, { reasonsLost: ['Y'] });
    const a = (await rowOf(A)).extra;
    assert.equal(a.integrationRequests.hubspot.requestedAt, '2026-11-01T00:00:00.000Z', 'the server\'s own (Q15)');
    assert.equal(a.revs.competitors, t.body.revs.competitors, 'another key\'s token kept');
    assert.equal(typeof a.revs.reasonsLost, 'string');
    // A column only when sent, with its own token.
    const c = await call(A, { companyName: 'A Renamed' });
    assert.equal((await rowOf(A)).companyName, 'A Renamed');
    assert.equal(typeof c.body.revs.companyName, 'string');
    await call(A, { competitors: ['Z'] });
    assert.equal((await rowOf(A)).companyName, 'A Renamed', 'a save not sending it leaves it');
    await bUntouched();
});

test('Train now: a save made while it trained is never put back; rules changed while it trained refuse the model (J-B9)', async () => {
    // Another key saved during training: kept, and the model lands with its token.
    let r = await scoreOrg(TRAIN, { force: true, beforeWrite: async () => {
        assert.equal((await call(TRAIN, { competitors: ['During training'] })).status, 200);
    } });
    assert.equal(r.modelTrained, true, JSON.stringify({ reason: r.reason }));
    let row = await rowOf(TRAIN);
    assert.deepEqual(row.extra.competitors, ['During training'], 'REGRESSION: the model put back the extra it read before training');
    assert.ok(row.extra.leadScoring.predictive.model, 'the model stored');
    assert.equal(row.extra.revs.leadScoring, r.revs.leadScoring, 'with its token, answered');
    assert.equal(typeof row.extra.revs.competitors, 'string', 'the other key\'s token kept');
    // The rules saved during training: nothing trained, the saved rules stand.
    const saved = scoring({ predictive: { enabled: true, minClosedRecords: 99, model: null } });
    r = await scoreOrg(TRAIN, { force: true, beforeWrite: async () => {
        assert.equal((await call(TRAIN, { leadScoring: saved })).status, 200);
    } });
    assert.equal(r.modelTrained, false);
    assert.equal(r.reason, 'config-changed');
    assert.deepEqual(r.revs, {});
    row = await rowOf(TRAIN);
    assert.equal(row.extra.leadScoring.predictive.minClosedRecords, 99, 'the rules as saved');
    assert.equal(row.extra.leadScoring.predictive.model, null, 'no model written over them');
    await bUntouched();
});

test('two saves of one key at once, carrying one token: never both land', async () => {
    await seedA();
    const t = ((await get(A)).revs || {}).competitors ?? null;
    const both = await Promise.all([
        call(A, { competitors: ['Left'], ifRevs: { competitors: t } }),
        call(A, { competitors: ['Right'], ifRevs: { competitors: t } }),
    ]);
    // The outcome only: which check refuses the loser (the early one or the write's) depends on how the two interleave —
    // the seam cases prove the write's compare.
    const codes = both.map((x) => x.status).sort();
    assert.deepEqual(codes, [200, 409], `exactly one lands, the other refused: ${codes}`);
    const won = both.find((x) => x.status === 200), lost = both.find((x) => x.status === 409);
    assert.equal(lost.body.code, 'stale');
    assert.deepEqual(lost.body.stale, ['competitors']);
    assert.equal((await rowOf(A)).extra.revs.competitors, won.body.revs.competitors);
    await bUntouched();
});

test('a column only when sent: one saved in another save\'s gap is never put back — the company name, and the stages column', async () => {
    await seedA();
    putSeam.beforeWrite = async () => {
        putSeam.beforeWrite = null;
        assert.equal((await call(A, { companyName: 'Gap Co', funnelStages: [{ name: 'Gap Stage', weight: 50 }] })).status, 200);
    };
    const r = await call(A, { competitors: ['Mine'], ifRevs: { competitors: null } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const row = await rowOf(A);
    assert.equal(row.companyName, 'Gap Co', 'REGRESSION: the columns rewritten from the read');
    assert.deepEqual(row.stages, [{ name: 'Gap Stage', weight: 50 }]);
    assert.deepEqual(row.extra.funnelStages, [{ name: 'Gap Stage', weight: 50 }]);
    assert.deepEqual(row.extra.competitors, ['Mine']);
    await bUntouched();
});

test('a save whose own keys did not move, refused only by a key the server derived, is tried again and lands', async () => {
    await seedA();
    // A stored AI blob holding junk: every save scrubs it (a derived write of aiSettings, compared in the write).
    const now = (await rowOf(A)).extra;
    await db.update(settings).set({ extra: { ...now, aiSettings: { byokProvider: 'Anthropic', apiKey: 'not-a-key' } } }).where(eq(settings.orgId, A));
    putSeam.beforeWrite = async () => {
        putSeam.beforeWrite = null;
        assert.equal((await call(A, { aiSettings: { byokProvider: 'Anthropic', tone: 'brief' } })).status, 200);
    };
    const r = await call(A, { competitors: ['Mine'], ifRevs: { competitors: null } });
    assert.equal(r.status, 200, 'REGRESSION: refused for a key it never sent — the screen would throw its edit away');
    const row = await rowOf(A);
    assert.deepEqual(row.extra.competitors, ['Mine']);
    assert.deepEqual(row.extra.aiSettings, { byokProvider: 'Anthropic', tone: 'brief' }, 'the gap\'s save stands');
    await bUntouched();
});

test('a fresh org\'s first save: its GET reads every other key as before it saved, key for key', async () => {
    await db.delete(settings).where(eq(settings.orgId, NEW));
    const before = await get(NEW);
    assert.equal(before, null, 'no row');
    // What the app paints for no row: the GET of a row holding only the seeds.
    await db.insert(settings).values({ id: NEW, orgId: NEW, extra: {}, updatedAt: new Date() });
    const seededOnly = await get(NEW);
    await db.delete(settings).where(eq(settings.orgId, NEW));
    assert.equal((await call(NEW, { competitors: ['First'] })).status, 200);
    const after = await get(NEW);
    // The keys the row's extra drives: the PUT's own columns keep the insert's defaults, as before §0.224 (task types,
    // the markets — §0.170), and the company name feeds the display name.
    const COLUMNS = new Set(['companyName', 'companyLogo', 'fiscalYearStart', 'taskTypes', 'verticalMarkets', 'companyDisplayName']);
    for (const k of Object.keys(seededOnly)) {
        if (k === 'competitors' || k === 'revs' || COLUMNS.has(k)) continue;
        assert.deepEqual(after[k], seededOnly[k], `${k}: read as it was before the first save`);
    }
    assert.deepEqual(after.competitors, ['First']);
    await bUntouched();
});
