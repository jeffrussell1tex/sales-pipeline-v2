// Two guards that both exist because a write left no trace.
//
// _audit.mjs: every entity's per-id DELETE was ownership-checked and audited
// NOTHING, while the org-wide clear=true above it was Admin-gated AND audited.
// Six endpoints, six single-record deletes, zero audit records.
//
// _stage.mjs: a CSV overwrite that moved a deal's stage left stageChangedDate
// alone and added no history entry, so the move was invisible and the deal read
// as fresh forever.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entityName, deletionSnapshot, deletionAudit } from '../netlify/functions/_audit.mjs';
import {
    parseDaysInStage, backdate, resolveStageChange, applyStageChanges, MAX_DAYS_IN_STAGE,
} from '../netlify/functions/_stage.mjs';

// ═══ _audit ═══════════════════════════════════════════════════════════════════

const deal = {
    id: 'o1', opportunityName: 'ZZTest Alpha Renewal', account: 'ZZTest Alpha Industries',
    stage: 'Proposal', arr: 44000, salesRep: 'Jeff Russell', forecastedCloseDate: '2026-11-30',
    notes: 'x'.repeat(4000),
};

test('a deletion audit names the record, because the id is useless once the row is gone', () => {
    const a = deletionAudit('opportunity', deal, { userId: 'u1', byRole: 'Admin' });
    assert.equal(a.action, 'opportunity.deleted');
    assert.equal(a.entityId, 'o1');
    assert.equal(a.entityName, 'ZZTest Alpha Renewal');
    assert.match(a.detail, /ZZTest Alpha Renewal/);
    assert.match(a.detail, /by Admin/);
});

test('the snapshot carries enough to reconstruct what was lost', () => {
    const s = deletionSnapshot('opportunity', deal);
    for (const bit of ['account=', 'stage=Proposal', 'arr=44000', 'salesRep=Jeff Russell']) {
        assert.ok(s.includes(bit), `snapshot should include ${bit}`);
    }
});

test('each value is truncated, because audit detail is not a backup', () => {
    const s = deletionSnapshot('opportunity', { ...deal, account: 'y'.repeat(4000) });
    assert.equal(s.includes('y'.repeat(61)), false, 'a 4,000-char value is cut at 60');
    assert.ok(s.includes('y'.repeat(60)), 'but the first 60 are kept');
    assert.equal(s.includes('x'.repeat(100)), false, 'the 4,000-char notes field is not a snapshot field at all');
});

test('empty fields are omitted rather than rendered as null', () => {
    const s = deletionSnapshot('opportunity', { id: 'o1', stage: 'Proposal', arr: null, salesRep: '' });
    assert.equal(s, 'stage=Proposal');
});

test('a row with nothing populated says so instead of producing an empty detail', () => {
    assert.equal(deletionSnapshot('opportunity', { id: 'o1' }), 'no populated fields');
    assert.equal(deletionSnapshot('opportunity', null), 'no row data captured');
});

test('each entity gets a sensible name', () => {
    assert.equal(entityName('contact', { firstName: 'Ada', lastName: 'Lovelace' }), 'Ada Lovelace');
    assert.equal(entityName('contact', { email: 'ada@x.com' }), 'ada@x.com');
    assert.equal(entityName('account', { name: 'Acme' }), 'Acme');
    assert.equal(entityName('task', { title: 'Call back' }), 'Call back');
    assert.equal(entityName('opportunity', { account: 'Acme' }), 'Acme', 'falls back to the account');
    assert.equal(entityName('opportunity', {}), '(unnamed)');
});

// ═══ _stage ═══════════════════════════════════════════════════════════════════

const IMPORT_DATE = '2026-08-17';
const prior = { stage: 'Qualification', stageHistory: [{ prevStage: null, stage: 'Qualification', date: '2026-08-01' }] };

// ── the re-import guard, which is the whole point ────────────────────────────

test('REGRESSION: an overwrite that does NOT change the stage leaves the clock alone', () => {
    // Stamping importDate unconditionally would reset every deal's stage clock on
    // every same-file re-import, and nothing would ever flag as stalled again.
    const { changed, patch } = resolveStageChange({ stage: 'Qualification' }, prior, IMPORT_DATE);
    assert.equal(changed, false);
    assert.deepEqual(patch, {}, 'a no-op overwrite writes nothing');
});

test('an overwrite that changes the stage starts the clock at the import date', () => {
    const { changed, patch } = resolveStageChange({ stage: 'Proposal' }, prior, IMPORT_DATE);
    assert.equal(changed, true);
    assert.equal(patch.stageChangedDate, IMPORT_DATE);
});

test('an unmapped Stage column is not a move to undefined', () => {
    const { changed, patch } = resolveStageChange({ arr: 44000 }, prior, IMPORT_DATE);
    assert.equal(changed, false);
    assert.deepEqual(patch, {});
});

test('an empty Stage cell is not a stage change either', () => {
    assert.equal(resolveStageChange({ stage: '' }, prior, IMPORT_DATE).changed, false);
});

// ── days in stage ────────────────────────────────────────────────────────────

test('a mapped daysInStage back-dates the clock', () => {
    const { patch } = resolveStageChange({ stage: 'Proposal', daysInStage: '12' }, prior, IMPORT_DATE);
    assert.equal(patch.stageChangedDate, '2026-08-05');
});

test('a mapped daysInStage is honoured even with no stage change, because mapped is an assertion', () => {
    const { changed, patch } = resolveStageChange({ stage: 'Qualification', daysInStage: '30' }, prior, IMPORT_DATE);
    assert.equal(changed, false, 'still not a stage CHANGE');
    assert.equal(patch.stageChangedDate, '2026-07-18', 'but the file asserted the clock');
    assert.equal('stageHistory' in patch, false, 'and no history entry, because nothing moved');
});

test('daysInStage of zero means today, not unmapped', () => {
    const { patch } = resolveStageChange({ stage: 'Qualification', daysInStage: 0 }, prior, IMPORT_DATE);
    assert.equal(patch.stageChangedDate, IMPORT_DATE);
});

test('a negative daysInStage is clamped, never a future date', () => {
    // A future stageChangedDate makes `days > 14` permanently false.
    assert.equal(parseDaysInStage(-5), 0);
    const { patch } = resolveStageChange({ stage: 'Proposal', daysInStage: -5 }, prior, IMPORT_DATE);
    assert.equal(patch.stageChangedDate, IMPORT_DATE);
});

test('a non-numeric daysInStage is ignored rather than guessed', () => {
    assert.equal(parseDaysInStage('n/a'), null);
    const { patch } = resolveStageChange({ stage: 'Qualification', daysInStage: 'n/a' }, prior, IMPORT_DATE);
    assert.deepEqual(patch, {}, 'unparseable is treated as unmapped');
});

test('an implausible daysInStage is ignored rather than dating the deal to 1753', () => {
    assert.equal(parseDaysInStage(MAX_DAYS_IN_STAGE + 1), null);
    assert.equal(parseDaysInStage(99999), null);
});

test('backdate crosses month and year boundaries correctly', () => {
    assert.equal(backdate('2026-08-17', 0), '2026-08-17');
    assert.equal(backdate('2026-03-01', 1), '2026-02-28');
    assert.equal(backdate('2026-01-05', 10), '2025-12-26');
    assert.equal(backdate('2028-03-01', 1), '2028-02-29', 'leap year');
});

// ── history ──────────────────────────────────────────────────────────────────

test('a stage change appends to the history already in the database', () => {
    const { patch } = resolveStageChange({ stage: 'Proposal' }, prior, IMPORT_DATE);
    assert.equal(patch.stageHistory.length, 2, 'appended, not replaced');
    assert.deepEqual(patch.stageHistory[0], prior.stageHistory[0], 'the existing entry is intact');
    assert.deepEqual(patch.stageHistory[1], {
        prevStage: 'Qualification', stage: 'Proposal', date: IMPORT_DATE, source: 'import',
    });
});

test('REGRESSION: history is never replaced with an empty array', () => {
    // 0A0000.1: an overwrite wrote stageHistory: [] over real data. This is the
    // one place the field legitimately re-enters a write, so it is pinned here.
    const { patch } = resolveStageChange({ stage: 'Proposal', stageHistory: [] }, prior, IMPORT_DATE);
    assert.equal(patch.stageHistory.length, 2);
});

test('the history entry carries the DERIVED date, not the import date', () => {
    // Otherwise History contradicts the "days in stage" in the header.
    const { patch } = resolveStageChange({ stage: 'Proposal', daysInStage: 12 }, prior, IMPORT_DATE);
    assert.equal(patch.stageHistory[1].date, '2026-08-05');
});

test('a deal with no prior history still gets its first entry', () => {
    const { patch } = resolveStageChange({ stage: 'Proposal' }, { stage: 'Qualification' }, IMPORT_DATE);
    assert.equal(patch.stageHistory.length, 1);
    assert.equal(patch.stageHistory[0].prevStage, 'Qualification');
});

// ── batch ────────────────────────────────────────────────────────────────────

test('applyStageChanges strips daysInStage — it is transport, not a column', () => {
    const priors = new Map([['o1', prior]]);
    const { rows } = applyStageChanges([{ id: 'o1', stage: 'Proposal', daysInStage: '12' }], priors, IMPORT_DATE);
    assert.equal('daysInStage' in rows[0], false);
    assert.equal(rows[0].stageChangedDate, '2026-08-05');
});

test('applyStageChanges counts only real changes', () => {
    const priors = new Map([['o1', prior], ['o2', prior]]);
    const { changedCount } = applyStageChanges([
        { id: 'o1', stage: 'Proposal' },
        { id: 'o2', stage: 'Qualification' },
    ], priors, IMPORT_DATE);
    assert.equal(changedCount, 1);
});

test('a row with no prior is passed through untouched', () => {
    // bulkUpsert reports it as notFound; this must not invent a patch for it.
    const { rows } = applyStageChanges([{ id: 'ghost', stage: 'Proposal' }], new Map(), IMPORT_DATE);
    assert.equal('stageChangedDate' in rows[0], false);
    assert.equal('stageHistory' in rows[0], false);
});
