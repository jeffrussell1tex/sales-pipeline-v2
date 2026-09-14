// tests/integration/train-lead-model.itest.mjs
// scoreOrg against the real (test) database — state §0.132. What the unit
// scans cannot prove: with `force` an org below its own threshold trains and
// the model lands on ITS settings row alone; without `force` the same org is
// refused by the threshold; an org under the engine's floor is refused by the
// floor whatever the flag; every lead of the org is scored either way; the
// other org's row is untouched.
//
// Run:  npm run test:int   (needs DATABASE_URL_TEST — see TESTING.md)

if (!process.env.DATABASE_URL_TEST) {
    throw new Error('DATABASE_URL_TEST is not set — refusing to run integration tests against a non-test database. See TESTING.md.');
}
process.env.NETLIFY_DATABASE_URL = process.env.DATABASE_URL_TEST;

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const { scoreOrg, MODEL_MIN_ROWS } = await import('../../netlify/functions/score-leads-batch.mjs');
const { DEFAULT_LEAD_SCORING } = await import('../../src/utils/leadScoringDefaults.js');
const { db } = await import('../../db/index.js');
// A saved config is the FULL object (the panel saves the whole thing); a
// partial one has no fit/engagement rules and scores nothing.
const config = (predictive) => ({ ...DEFAULT_LEAD_SCORING, enabled: true, predictive });
const { leads, settings } = await import('../../db/schema.js');
const { eq } = await import('drizzle-orm');

// ORG NAMESPACE: this file owns 'itest_train_*' and ONLY this file writes to it (guide §18b25).
const A = 'itest_train_A', B = 'itest_train_B';

const cleanup = async () => {
    for (const o of [A, B]) {
        await db.delete(leads).where(eq(leads.orgId, o));
        await db.delete(settings).where(eq(settings.orgId, o));
    }
};
const settingsOf = (org) => db.select().from(settings).where(eq(settings.orgId, org)).then(r => r[0]);
const leadsOf    = (org) => db.select().from(leads).where(eq(leads.orgId, org));

// n decided leads (alternating Converted / Dead, two sources) plus one open lead, in one org.
const seedLeads = (org, n) => {
    const rows = [];
    for (let i = 0; i < n; i++) {
        rows.push({
            id: `lead_${org}_${i}`, orgId: org, firstName: 'L', lastName: String(i), company: `Co ${i}`,
            title: i % 3 === 0 ? 'VP Operations' : 'Analyst', source: i % 2 ? 'Referral' : 'Web Form',
            status: i % 2 ? 'Converted' : 'Dead', estimatedARR: String(1000 * (i + 1)),
            createdAt: new Date(Date.now() - i * 86400000),
        });
    }
    rows.push({ id: `lead_${org}_open`, orgId: org, firstName: 'Open', lastName: 'Lead', company: 'Open Co', source: 'Web Form', status: 'New', createdAt: new Date() });
    return db.insert(leads).values(rows);
};

before(async () => {
    await cleanup();
    await seedLeads(A, 30);                 // above the engine floor (20), below the org threshold (150)
    await seedLeads(B, 10);                 // below the engine floor
    await db.insert(settings).values([
        { id: 'itest_train_settings_A', orgId: A, extra: { leadScoring: config({ enabled: true, minClosedRecords: 150, model: null }) }, updatedAt: new Date() },
        { id: 'itest_train_settings_B', orgId: B, extra: { leadScoring: config({ enabled: true, minClosedRecords: 150, model: null }) }, updatedAt: new Date() },
    ]);
});
after(cleanup);

test('without force, an org below its own threshold is refused by the threshold — no model, every lead still scored', async () => {
    const r = await scoreOrg(A);
    assert.equal(r.modelTrained, false);
    assert.equal(r.reason, 'below-threshold');
    assert.equal(r.decided, 30);
    assert.equal(r.threshold, 150);
    assert.equal((await settingsOf(A)).extra.leadScoring.predictive.model, null, 'nothing stored');
    const scored = (await leadsOf(A)).filter(l => l.scoreUpdatedAt);
    assert.equal(scored.length, 31, 'the nightly pass scored every lead, decided or not');
});

test('with force (an Admin\'s Train now), the same org trains: the model is stored on ITS settings row alone, with the size and accuracy the panel prints', async () => {
    const r = await scoreOrg(A, { force: true });
    assert.equal(r.modelTrained, true);
    assert.equal(r.reason, null);
    const model = (await settingsOf(A)).extra.leadScoring.predictive.model;
    assert.ok(model, 'the model is on A\'s row');
    assert.equal(model.n, 30);
    assert.ok(model.accuracy >= 0 && model.accuracy <= 100);
    assert.ok(model.trainedAt);
    assert.equal(model.coefficients.length, 5);
    assert.ok(model.sourceWinRate && '_avg' in model.sourceWinRate, 'the source win rates ride with the model');
    assert.deepEqual(r.leadScoring.predictive.model.n, 30, 'the answer carries the saved config');
    assert.equal((await settingsOf(B)).extra.leadScoring.predictive.model, null, 'B\'s row untouched');
    assert.equal((await settingsOf(A)).extra.leadScoring.predictive.minClosedRecords, 150, 'the org\'s threshold is not rewritten');
    // and every lead of A now carries a probability from the model
    const probs = (await leadsOf(A)).map(l => l.scoreBreakdown?.probability).filter(p => p != null);
    assert.equal(probs.length, 31, 'every lead of A has a probability');
});

test('an org under the engine\'s floor is refused by the floor, force or not — the answer names the floor and the count', async () => {
    for (const force of [false, true]) {
        const r = await scoreOrg(B, { force });
        assert.equal(r.modelTrained, false, `force=${force}`);
        assert.equal(r.reason, 'below-engine-floor');
        assert.equal(r.decided, 10);
        assert.equal(MODEL_MIN_ROWS, 20);
    }
    assert.equal((await settingsOf(B)).extra.leadScoring.predictive.model, null);
});

test('predictive off: refused as predictive-off; scoring off: skipped as disabled', async () => {
    const row = await settingsOf(B);
    await db.update(settings).set({ extra: { leadScoring: config({ enabled: false, minClosedRecords: 150, model: null }) } }).where(eq(settings.orgId, B));
    assert.equal((await scoreOrg(B, { force: true })).reason, 'predictive-off');
    await db.update(settings).set({ extra: { leadScoring: { ...config({ enabled: true }), enabled: false } } }).where(eq(settings.orgId, B));
    assert.deepEqual(await scoreOrg(B, { force: true }), { skipped: 'disabled' });
    await db.update(settings).set({ extra: row.extra }).where(eq(settings.orgId, B));
});
