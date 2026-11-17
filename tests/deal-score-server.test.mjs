// tests/deal-score-server.test.mjs — the deal score's wiring (AI scoring batch 2A; docs/design/deal-score — Jeff,
// 17 Nov: Q1-Q9 each the Recommended). THE GUARD: a deal's score and the org's deal model are the server's alone — no
// body, file or screen writes either; every write that can move a score scores its deal again; the screens read the
// kept score through one reader, behind the Deal scoring switch; the Funnel stages panel edits the weight the app reads.
// RUN where it is pure (the restore's drop, the settings PUT's keys, the panel's rows, Settings' words).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { restoredHistories } from '../src/utils/dealHistory.js';
import { writtenKeys, SERVER_KEYS, REV_KEYS } from '../src/utils/settingsRevs.js';
import { funnelRowsOf } from '../src/utils/stageOrder.js';
import { standingWords, trainDealWords, withDealScores, MIN_TEACHING } from '../src/utils/dealScore.js';
import { DEFAULT_SETTINGS } from '../src/utils/settingsDefaults.js';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const code = (src) => src.split(/\r?\n/).filter((l) => !l.trim().startsWith('//')).join('\n');
const count = (s, needle) => s.split(needle).length - 1;

test('THE GUARD: only _dealScore.mjs builds a deal\'s dealScore — sanitize never names it, so no body writes it', () => {
    const dir = new URL('netlify/functions/', ROOT);
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.mjs'))) {
        const s = code(read(`netlify/functions/${f}`));
        const builds = /[{,]\s*dealScore\s*:/.test(s);
        if (f === '_dealScore.mjs') assert.ok(builds, 'the one writer still writes');
        else assert.ok(!builds, `${f} builds a dealScore — the score is _dealScore.mjs's alone`);
    }
    const opp = code(read('netlify/functions/opportunities.mjs'));
    const sanitize = opp.slice(opp.indexOf('const sanitize = (data) => ({'), opp.indexOf('\n});\n', opp.indexOf('const sanitize = (data) => ({')));
    assert.ok(sanitize.length > 200 && !/dealScore/.test(sanitize), 'sanitize never names dealScore');
    // Self-check: the scan sees the shape.
    assert.ok(/[{,]\s*dealScore\s*:/.test('db.update(o).set({ dealScore: next })'));
});

test('every write that can move a score scores its deal again, and hands it back', () => {
    const opp = code(read('netlify/functions/opportunities.mjs'));
    assert.equal(count(opp, 'await rescoreDeals(orgId, '), 4, 'the bulk create, the single create, the import Overwrite, the single save');
    assert.ok(opp.includes('JSON.stringify({ opportunity: withDealScore(inserted, await rescoreDeals(orgId, [inserted.id])) })'));
    assert.ok(opp.includes('JSON.stringify({ opportunity: withDealScore(upserted, await rescoreDeals(orgId, [upserted.id])) })'));
    assert.ok(opp.includes('await rescoreDeals(orgId, keyed.rows.map(r => r.id).filter(id => !unwritten.has(id)));'), 'an import\'s rows written, never one refused');
    const acts = code(read('netlify/functions/activities.mjs'));
    assert.ok(acts.includes('dealScores: await rescoreDeals(orgId, [inserted.opportunityId])'), 'a logged activity');
    assert.ok(acts.includes('dealScores: await rescoreDeals(orgId, [upserted.opportunityId, target.opportunityId])'), 'an edit — the deal it names and the one it named');
    assert.ok(acts.includes('dealScores: await rescoreDeals(orgId, [deletedRow.opportunityId])'), 'a delete');
    const backup = code(read('netlify/functions/backup.mjs'));
    assert.ok(backup.includes('try { await scoreOrgDeals(orgId, { train: false }); }'), 'a restore scores the org after it lands');
});

test('THE GUARD: the org\'s deal model is the server\'s — the settings PUT keeps the stored one, a restore drops a file\'s', () => {
    const s = code(read('netlify/functions/settings.mjs'));
    assert.ok(s.includes('dealModel: row.extra?.dealModel || null,'), 'the GET returns it');
    assert.ok(s.includes('dealModel: existingExtra.dealModel ?? null,'), 'the PUT names it — kept as stored, never dropped');
    assert.doesNotMatch(s, /data\.dealModel/, 'REGRESSION: a body\'s dealModel read');
    assert.deepEqual([...SERVER_KEYS].sort(), ['dealModel', 'integrationRequests']);
    assert.deepEqual(writtenKeys({ dealModel: { n: 999 }, integrationRequests: {} }, ['dealModel', 'integrationRequests']), [], 'a body naming it writes nothing');
    assert.ok(!REV_KEYS.includes('dealModel'), 'no token: no screen saves it');
    assert.ok(code(read('netlify/functions/backup.mjs')).includes('delete extra.dealModel;'), 'a restore never lands a file\'s model');
    const row = restoredHistories({ id: 'd1', dealScore: { score: 99 }, stageHistory: [] });
    assert.ok(!('dealScore' in row), 'a restored deal lands with no score — the server scores it');
    assert.deepEqual(row, { id: 'd1', stageHistory: [] });
});

test('Train now: an Admin\'s alone, the org from the token, never a body; the nightly pass behind the heartbeat, org by org', () => {
    const t = code(read('netlify/functions/train-deal-model.mjs'));
    const gateAt = t.indexOf("requireRole(auth, ['Admin'], HEADERS)"), runAt = t.indexOf('await scoreOrgDeals(orgId, { train: true })');
    assert.ok(gateAt > -1 && runAt > gateAt, 'the Admin gate before the run');
    assert.doesNotMatch(t, /JSON\.parse\(event\.body/, 'no body read');
    assert.ok(t.includes("action: 'deal_model.trained', entityType: 'deal_model'"));
    const b = code(read('netlify/functions/score-deals-batch.mjs'));
    assert.ok(b.includes("export const handler = withHeartbeat('score-deals-batch', run);"));
    assert.ok(b.includes('const r = await scoreOrgDeals(orgId, { train: true });'));
    const d = code(read('netlify/functions/_dealScore.mjs'));
    assert.ok(d.includes("sql`(${settingsTable.extra}->'dealModel') is not distinct from ((${srow.asRead}::jsonb)->'dealModel')`"), 'the model written only as this run read it');
    assert.equal(count(d, '.where(eq(opportunities.orgId, orgId))') + count(d, 'eq(opportunities.orgId, orgId)'), 4, 'every read and write of deals in the org');
});

test('the funnel the score reads is the settings GET\'s', () => {
    const s = code(read('netlify/functions/settings.mjs'));
    assert.ok(s.includes("funnelStages:     saved('funnelStages') ? (row.extra.funnelStages || row.stages || []) : (row.stages?.length ? row.stages : ex.funnelStages),"),
        'the GET\'s rule, which funnelStagesOf (_dealScore.mjs) follows — change both');
    const d = code(read('netlify/functions/_dealScore.mjs'));
    assert.ok(d.includes('const list = saved ? (row.extra.funnelStages || row.stages || []) : (row?.stages?.length ? row.stages : null);'));
});

test('the screens read the kept score through one reader, behind the Deal scoring switch — no health worked out on screen', () => {
    const walk = (dir) => readdirSync(new URL(dir, ROOT), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${dir}${e.name}/`) : /\.(jsx?|mjs)$/.test(e.name) ? [`${dir}${e.name}`] : []));
    for (const f of walk('src/')) assert.ok(!read(f).includes('calculateDealHealth'), `${f} still names calculateDealHealth`);
    const app = code(read('src/App.jsx'));
    assert.ok(app.includes("const dealScoreOf = (opportunity) => (isFeatureEnabled('deal-scoring') ? dealScoreView(opportunity) : null);"));
    assert.ok(app.includes('const isFeatureEnabled = (flagId) => featureOn(settings?.featureFlags, flagId);'));
    for (const f of ['src/components/KanbanView.jsx', 'src/components/ListView.jsx', 'src/Tabs/PipelineTab.jsx', 'src/components/layout/MeetingPrepPanel.jsx']) {
        assert.ok(read(f).includes('dealScoreOf('), `${f} reads the kept score`);
    }
    assert.ok(read('src/components/ListView.jsx').includes('<div>Win %</div>'), 'the list\'s column (Q8)');
    // Train now scores every deal on the server; the deals on screen are loaded again once it lands (§0.256's browser check).
    const panel = code(read('src/Tabs/settings/salesProcess/DealScoringDetail.jsx'));
    const landedAt = panel.indexOf('setTrainMsg(trainDealWords(answer));'), reloadAt = panel.indexOf("if (typeof loadOpportunities === 'function') loadOpportunities(() => {});");
    assert.ok(landedAt > -1 && reloadAt > landedAt, 'REGRESSION: Train now leaves the screen\'s deals without their scores until the next sign-in');
    assert.ok(read('src/Tabs/PipelineTab.jsx').includes("'Sales Rep', 'Win %', 'AI Score'"), 'the CSV\'s column');
});

test('an answer\'s scores land on the deals they name, and only those', () => {
    const deals = [{ id: 'a', dealScore: null }, { id: 'b', dealScore: { score: 1 } }];
    const next = withDealScores(deals, { a: { score: 42 } });
    assert.deepEqual(next.map((d) => d.dealScore), [{ score: 42 }, { score: 1 }]);
    assert.equal(next[1], deals[1], 'a deal not named is the same row');
    assert.equal(withDealScores(deals, { zz: { score: 1 } }), deals, 'none named: the same list');
    assert.equal(withDealScores(deals, null), deals);
    assert.equal(withDealScores(deals, [1]), deals);
    assert.deepEqual(withDealScores(deals, { b: null }).map((d) => d.dealScore), [null, null], 'a deal closed since: no score');
});

test('the Funnel stages panel edits the weight the app reads (Q7) — a stored stage as a row, an old prob read as its weight', () => {
    const rows = funnelRowsOf([{ name: 'Discovery', weight: 20 }, { name: 'Proposal', prob: 55 }, 'Contracts', { name: 'Closed Won', weight: 100 }, { name: 'Closed Lost', weight: 0 }, { weight: 5 }]);
    assert.deepEqual(rows.map((r) => [r.name, r.weight, r.type]), [
        ['Discovery', 20, 'Open'], ['Proposal', 55, 'Open'], ['Contracts', 30, 'Open'], ['Closed Won', 100, 'Won'], ['Closed Lost', 0, 'Lost'],
    ]);
    assert.ok(rows.every((r) => !('prob' in r)), 'no prob kept — nothing reads it');
    assert.ok(rows.every((r) => typeof r.color === 'string' && r.color), 'each a colour');
    assert.deepEqual(funnelRowsOf([{ name: 'X', weight: 140 }])[0].weight, 100);
    const panel = code(read('src/Tabs/settings/salesProcess/FunnelStagesDetail.jsx'));
    assert.doesNotMatch(panel, /\bprob\s*:/, 'REGRESSION: the panel edits prob');
    assert.ok(panel.includes("update(i,'weight',"), 'the input writes weight');
    assert.ok(panel.includes('const DEFAULT_FUNNEL_STAGES = funnelRowsOf(DEFAULT_SETTINGS.funnelStages);'), 'the app\'s own stages when none are saved');
    assert.deepEqual(funnelRowsOf(DEFAULT_SETTINGS.funnelStages).map((r) => r.name), DEFAULT_SETTINGS.funnelStages.map((s) => s.name));
});

test('Settings says where the workspace stands — learning from N, or trained with its held-out accuracy', () => {
    assert.match(standingWords(null), /^Not looked at yet/);
    assert.equal(standingWords({ n: 4, leftOut: 0, trained: false }), `Learning from 4 closed deals — the model starts at ${MIN_TEACHING}. Until then each deal’s win chance is its stage’s weight, moved down by the health rules.`);
    assert.match(standingWords({ n: 1, leftOut: 2, trained: false }), /^Learning from 1 closed deal — .* 2 closed deals do not teach: nothing about them is known from before the close/);
    assert.match(standingWords({ n: 25, trained: false }), /they hold only one outcome; it needs wins and losses/);
    assert.equal(standingWords({ n: 50, trained: true, accuracy: { correct: 41, total: 50 }, trainedAt: '2026-11-17T06:00:00.000Z' }, () => '11/17/2026'),
        'Trained on 50 closed deals · right on 41 of 50 it did not train on · the model makes 50% of each score, the stage and health rules the rest · last trained 11/17/2026.');
    assert.ok(!/training accuracy/.test(standingWords({ n: 50, trained: true, accuracy: { correct: 1, total: 1 } })), 'never the accuracy on the deals it trained on');
    assert.deepEqual(trainDealWords({ ok: false, dealModel: { n: 3, trained: false }, dealsUpdated: 2, modelWritten: true }).ok, false);
    assert.match(trainDealWords({ ok: true, dealModel: { n: 30, trained: true, accuracy: { correct: 25, total: 30 } }, dealsUpdated: 1, modelWritten: true }).text, /^Trained\. Trained on 30 closed deals.* 1 deal re-scored\.$/);
    assert.match(trainDealWords({ dealModel: null }).text, /no settings saved yet/);
    assert.match(trainDealWords({ dealModel: { n: 1 }, modelWritten: false }).text, /^Another pass trained the model first/);
});
