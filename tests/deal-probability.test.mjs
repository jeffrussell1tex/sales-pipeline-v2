// tests/deal-probability.test.mjs — a deal's probability: none, or a whole number from 0 to 100 (state §0.300; guide §18b143).
// The server's half against a database is tests/integration/deal-probability.itest.mjs; here the rule, the import, the
// automation, and the lines every write and screen reads it by.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { probabilityOf, decideProbabilities, stageDefaultOf, closeDefaultOf, defaultOf, countedProbability, probabilityAfterMove, pressedProbability, probabilityOfCell, cellRefused, probabilityText, PROBABILITY_REFUSED } from '../src/utils/dealProbability.js';
import { planDealImport } from '../src/utils/importLinks.js';
import { buildOpportunityRow, coerceCsvColumns } from '../src/utils/importRows.js';
import { updateFieldPatch } from '../src/utils/automationEvents.js';
import { leaveOut, sentBody, shownRow, LEFT_OUT } from '../src/utils/leaveOut.js';
import { dealBody } from '../src/utils/dealNotes.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const code = (p) => read(p).split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l)).join('\n');
const count = (s, x) => s.split(x).length - 1;
const CLOSES = [{ name: 'Closed Won', weight: 100 }, { name: 'Closed Lost', weight: 0 }];
const LIST = [{ name: 'Lead in', weight: 10 }, { name: 'Site visit', weight: 40 }, { name: 'Bid sent', weight: 70 }, { name: 'Unset' }, ...CLOSES];

test('a value: a whole number from 0 to 100, its digits, or none — anything else refused', () => {
    for (const [v, n] of [[0, 0], [100, 100], ['0', 0], ['100', 100], [' 45 ', 45], ['007', 7]]) assert.deepEqual(probabilityOf(v), { value: n }, JSON.stringify(v));
    for (const none of [undefined, null, '', '   ']) assert.deepEqual(probabilityOf(none), { value: null }, JSON.stringify(none));
    assert.equal(PROBABILITY_REFUSED, "A deal's probability is a whole number from 0 to 100, or none.");
    for (const bad of ['0050', '-0', '1234', -1, 101, 50.5, '50.5', '-1', '101', '50%', 'abc', '1e1', '0x10', true, false, NaN, Infinity, [], [50], {}, '1 2', 99999999999]) assert.deepEqual(probabilityOf(bad), { refused: PROBABILITY_REFUSED }, String(JSON.stringify(bad)));
});

test('the rows of a write: each decided, all or none; one left out is as it was; what a deal holds is never asked; a row the caller may not write refuses nothing', () => {
    assert.deepEqual(decideProbabilities([{ id: 'a', probability: '30' }, { id: 'b' }, { id: 'c', probability: '' }, { id: 'd', probability: undefined }, null]), { rows: [{ id: 'a', probability: 30 }, { id: 'b' }, { id: 'c', probability: null }, { id: 'd', probability: undefined }, null] });
    const priors = new Map([['a', { probability: 150 }], ['b', { probability: 20 }], ['c', { probability: null }]]);
    assert.deepEqual(decideProbabilities([{ id: 'a', probability: 150 }, { id: 'b', probability: 0 }, { id: 'c', probability: 5 }], { priors }), { rows: [{ id: 'a', probability: 150 }, { id: 'b', probability: 0 }, { id: 'c', probability: 5 }] });
    assert.deepEqual(decideProbabilities([{ id: 'a', probability: 151 }, { id: 'b', probability: 5 }, { id: 'c', probability: 'x' }, { id: 'z', probability: 150 }], { priors }), { status: 400, error: PROBABILITY_REFUSED, field: 'probability', ids: ['a', 'c', 'z'] });
    const held = new Map([['a', { probability: 150 }], ['b', { probability: 0 }], ['c', { probability: 1 }]]);
    assert.deepEqual(decideProbabilities([{ id: 'b', probability: '' }, { id: 'c', probability: null }], { priors: held }), { rows: [{ id: 'b', probability: null }, { id: 'c', probability: null }] }, 'a blank is none, never the 0 it holds');
    assert.deepEqual(decideProbabilities([{ id: 'a', probability: '150' }, { id: 'c', probability: true }], { priors: held }).ids, ['a', 'c'], 'held is the very value');
    const mayAsk = (r) => r.id === 'b';
    assert.deepEqual(decideProbabilities([{ id: 'a', probability: 999, n: 1 }, { id: 'c', probability: 7 }, { id: 'b', probability: 9 }], { priors, mayAsk }), { rows: [{ id: 'a', n: 1 }, { id: 'c', probability: 7 }, { id: 'b', probability: 9 }] });
    assert.deepEqual(decideProbabilities([{ id: 'a', probability: 999 }, { id: 'b', probability: 999 }], { priors, mayAsk }).ids, ['b']);
});

test("a stage's default, read within its range; a move's: the new stage's where the deal stood on the old one's or on none; a rep's own stands; a close its own", () => {
    assert.deepEqual(['Lead in', 'Unset', 'Gone', 'Closed Lost'].map((n) => stageDefaultOf(LIST, n)), [10, null, null, 0]);
    assert.deepEqual([{ name: 'x', weight: 12.5 }, { name: 'x', weight: '50' }, { name: 'x', weight: 900 }, { name: 'x', weight: -3 }, { name: 'x', weight: 'y' }, { name: 'x', weight: null }, { name: 'x', weight: '' }].map((s) => stageDefaultOf([null, 'x', s], 'x')), [13, 50, 100, 0, null, null, null]);
    for (const none of [undefined, null, 'junk', {}]) assert.equal(stageDefaultOf(none, 'x'), null);
    assert.deepEqual([stageDefaultOf([{ name: 'x', weight: 12.4 }], 'x'), stageDefaultOf(LIST, 'lead in')], [12, null]);
    assert.deepEqual([closeDefaultOf([{ name: 'Closed Won', weight: 0 }], 'Closed Won'), defaultOf([], 'Closed Won'), defaultOf(LIST, 'Bid sent'), defaultOf([], 'Bid sent')], [0, 100, 70, null]);
    assert.deepEqual([{ probability: 5, stage: 'Bid sent' }, { probability: 0, stage: 'Bid sent' }, { probability: null, stage: 'Bid sent' }, { stage: 'Unset' }, { stage: 'Closed Won' }, null].map((d) => countedProbability(d, LIST)), [5, 0, 70, null, 100, null], 'its own, a 0 too, else its stage\'s');
    assert.deepEqual([closeDefaultOf([], 'Closed Won'), closeDefaultOf([], 'Closed Lost'), closeDefaultOf([{ name: 'Closed Won', weight: 95 }], 'Closed Won')], [100, 0, 95]);
    const after = (probability, stage, to, list = LIST) => probabilityAfterMove({ probability, stage }, to, list);
    assert.equal(after(10, 'Lead in', 'Site visit'), 40);
    assert.equal(after(null, 'Lead in', 'Site visit'), 40);
    assert.equal(after(undefined, 'Lead in', 'Site visit'), 40);
    assert.equal(after(55, 'Lead in', 'Site visit'), 55);
    assert.equal(after(0, 'Lead in', 'Site visit'), 0, 'a 0 a rep set is theirs');
    assert.equal(after(10, 'Lead in', 'Unset'), 10, 'a stage with no default leaves it');
    assert.equal(after(null, 'Lead in', 'Unset'), null);
    assert.equal(after(55, 'Unset', 'Bid sent'), 55);
    for (const p of [10, 55, null]) assert.deepEqual([after(p, 'Lead in', 'Closed Won'), after(p, 'Lead in', 'Closed Lost')], [100, 0]);
    assert.equal(after(100, 'Closed Won', 'Bid sent'), 70, 'reopened');
    assert.equal(after(100, 'Closed Won', 'Bid sent', [{ name: 'Bid sent', weight: 70 }]), 70, "a list without the close: won is 100");
    assert.equal(after(80, 'Closed Won', 'Bid sent'), 80);
    assert.deepEqual([after(100, 'Closed Won', 'Unset'), after(0, 'Closed Lost', 'Unset'), after(80, 'Closed Won', 'Unset')], [null, null, 80], "a close's own never stays on an open deal");
    const cheap = [{ name: 'Bid sent', weight: 70 }, { name: 'Closed Won', weight: 90 }, { name: 'Closed Lost', weight: 5 }];
    assert.deepEqual([after(100, 'Closed Won', 'Bid sent', cheap), after(90, 'Closed Won', 'Bid sent', cheap), after(0, 'Closed Lost', 'Bid sent', cheap), after(0, 'Closed Won', 'Bid sent', cheap)], [70, 70, 70, 0], "a close's default changed since");
    assert.equal(after(10, 'A', 'B', [{ name: 'A', weight: 10 }, { name: 'B', weight: 0 }]), 0, 'a stage of 0');
    const bare = [{ name: 'A', weight: 10 }];
    assert.deepEqual([after(10, 'A', 'Closed Won', bare), after(10, 'A', 'Closed Lost', bare), after(0, 'Closed Lost', 'A', bare)], [100, 0, 10], 'a list without the closes');
    assert.equal(probabilityAfterMove(null, 'Bid sent', LIST), 70);
    assert.equal(probabilityAfterMove(null, 'Unset', LIST), null);
    assert.deepEqual([stageDefaultOf([{ name: 'x', weight: '50%' }], 'x'), countedProbability({ stage: 'Closed Won' }, bare), countedProbability({ stage: 'Closed Lost' }, bare)], [null, 100, 0]);
});

test('what the window shows after a press is what its save stores: one move from the deal as stored, however many presses', () => {
    const own = { id: 'd', stage: 'Lead in', probability: 40 };
    const press = (opened, form, typed, to) => pressedProbability(opened, form, typed, to, LIST);
    assert.equal(press(own, { stage: 'Site visit', probability: 40 }, false, 'Bid sent'), 40, "REGRESSION: by way of a stage whose default it equals, a rep's own read as a default");
    assert.equal(press(own, { stage: 'Bid sent', probability: 70 }, false, 'Lead in'), 40, 'a press back is no move');
    assert.equal(press({ id: 'd', stage: 'Lead in', probability: 10 }, { stage: 'Unset', probability: 10 }, false, 'Bid sent'), 70);
    assert.equal(press({ id: 'd', stage: 'Closed Won', probability: 90 }, { stage: 'Bid sent', probability: 90 }, false, 'Closed Won'), 90);
    assert.equal(press({ id: 'd', stage: 'Lead in' }, { stage: 'Lead in' }, false, 'Lead in'), null);
    assert.equal(press(own, { stage: 'Site visit', probability: 40 }, true, 'Bid sent'), 70, 'one typed here moves from here');
    assert.equal(press(null, { stage: 'Lead in', probability: null }, false, 'Bid sent'), 70, 'a new deal');
    assert.equal(press(null, { stage: 'Lead in', probability: 33 }, false, 'Bid sent'), 33);
    assert.equal(press(own, own, false, 'Closed Lost'), 0);
});

const ACCOUNTS = [{ id: 'a1', name: 'Acme', accountTier: 'account' }];
const planOver = (probability) => planDealImport([{ account: 'Acme', opportunityName: 'D0', probability }], [2], ACCOUNTS, [{ id: 'd0', opportunityName: 'D0', account: 'Acme', accountId: 'a1', stage: 'Lead in', probability: 40 }], ['Lead in', 'Closed Won', 'Closed Lost']);
const plan = (cells) => planDealImport(cells.map((probability, i) => ({ account: 'Acme', opportunityName: `D${i}`, ...(probability === undefined ? {} : { probability }) })), cells.map((_, i) => i + 2), ACCOUNTS, [], ['Lead in', 'Closed Won', 'Closed Lost']);

test('a file: 50, 50% or 50.0, 0 a 0; a fraction, a word, one past 100 refused at Preview by its row; a blank is none', () => {
    for (const [c, n] of [['50', 50], ['50%', 50], [' 50 % ', 50], ['50.0', 50], ['0', 0], ['0%', 0], ['100.00%', 100]]) assert.deepEqual(probabilityOfCell(c), { value: n }, c);
    for (const c of ['', '  ', null, undefined]) assert.deepEqual(probabilityOfCell(c), { value: null }, String(c));
    for (const c of ['0.5', '50.5', '101', '-1', 'abc', 'high', '5 0', '%', '1,000', '$50', '1e2', '50.', '50%%', '0050']) assert.ok(probabilityOfCell(c).refused, c);
    const p = plan(['0', '0.5', undefined, '', '150', 'abc', '25%']);
    assert.deepEqual(p.records.map((r) => [r.opportunityName, r.probability]), [['D0', '0'], ['D2', undefined], ['D3', ''], ['D6', '25%']]);
    assert.deepEqual(p.refused.map((r) => [r.rowNumber, r.field, r.value]), [[3, 'Probability', '0.5'], [6, 'Probability', '150'], [7, 'Probability', 'abc']]);
    for (const c of ['0.5', 'abc']) assert.deepEqual([planOver(c).records.length, planOver(c).refused.map((r) => r.field)], [0, ['Probability']], 'an Overwrite too: it erased the stored one');
    assert.equal(planOver('0').conflicts.length, 1);
    assert.equal(p.refused[0].why, '“0.5” is not a probability — a whole number from 0 to 100, as 50 or 50%.');
    assert.equal(cellRefused(' x '), '“x” is not a probability — a whole number from 0 to 100, as 50 or 50%.');
    assert.deepEqual(['0', '25%', '', '50.0'].map((probability) => coerceCsvColumns({ probability }).probability), [0, 25, null, 50], 'REGRESSION: a "0" erased the stored one');
    assert.equal(buildOpportunityRow({ account: 'Acme', probability: '0%' }, { existingId: 'd1' }).probability, 0);
    assert.equal('probability' in buildOpportunityRow({ account: 'Acme' }, { existingId: 'd1' }), false, 'not in the file: not sent');
});

test('an automation sets a whole number from 0 to 100, or nothing — never a fraction rounded, nor a space read as 0', () => {
    const set = (value) => updateFieldPatch({ entity: 'opportunity', field: 'probability', value });
    for (const [v, n] of [[75, 75], ['0', 0], [' 100 ', 100], ['50.0', 50], ['60%', 60]]) assert.deepEqual(set(v), { ok: true, field: 'probability', value: n });
    for (const bad of ['75.4', 75.4, ' ', '', null, undefined, 150, '-1', 'high', true, [], [75], ['75']]) assert.deepEqual(set(bad), { ok: false, reason: 'probability must be a whole number from 0 to 100' }, JSON.stringify(bad));
});

test('a screen says none as none, never 0%', () => {
    assert.deepEqual([0, 45, '45', null, undefined, '', NaN].map(probabilityText), ['0%', '45%', '45%', '—', '—', '—', '—']);
});

test('THE GUARD: every write of a deal asks the one rule, after its stage, and answers its refusal; a move that names none takes the stage\'s', () => {
    const o = code('netlify/functions/opportunities.mjs'), l = code('netlify/functions/_links.mjs');
    assert.deepEqual([count(o, 'decideProbabilities('), count(o, 'const likely = decideProbabilities(people.rows);'), count(o, 'const likely = decideProbabilities([data]);'), count(o, 'const likely = decideProbabilities(data, { priors, mayAsk: mayName });'),
        count(o, 'const likely = decideProbabilities([data], { priors: new Map([[data.id, existing]]) });')], [4, 1, 1, 1, 1]);
    assert.equal(count(o, 'if (likely.error) return { statusCode: likely.status, headers, body: JSON.stringify({ error: likely.error, field: likely.field }) };'), 2);
    assert.equal(count(o, 'if (likely.error) return { statusCode: likely.status, headers, body: JSON.stringify({ error: likely.error, field: likely.field, ids: likely.ids }) };'), 2);
    const order = (s, ...xs) => { let at = -1; for (const x of xs) { const i = s.indexOf(x, at + 1); assert.ok(i > at, x); at = i; } };
    order(o, 'people.rows = inStages.rows;', 'decideProbabilities(people.rows);', 'people.rows = likely.rows;', 'await stampOwnerIds(people.rows.map(',
        'data.stage = inStage.rows[0].stage;', 'decideProbabilities([data]);', 'data.probability = likely.rows[0].probability ?? null;', 'const named = { ...data, ...people.set };',
        'data.splice(0, data.length, ...inStages.rows);', 'decideProbabilities(data, { priors, mayAsk: mayName });', 'data.splice(0, data.length, ...likely.rows);', 'const staged = applyStageChanges(',
        "if ('stage' in inStage.rows[0]) data.stage", 'decideProbabilities([data], { priors: new Map(', 'if (likely.rows[0].probability !== undefined) data.probability = likely.rows[0].probability; else delete data.probability;', 'const move = stageMoveOf(existing, data, {',
        'const clean = sanitize({ ...existing, ...data });', "if (move && !('probability' in data)) clean.probability = probabilityAfterMove(existing, move.stage, inStage.funnelStages);", 'const { id, comments: _notes');
    assert.equal(count(l, 'return { ...decideStages(rows, orgStages({ funnelStages }), how), funnelStages };'), 1);
    assert.equal(count(l, '    return Array.isArray(list) && list.length ? list : DEFAULT_SETTINGS.funnelStages;'), 1);
});

test('THE GUARD: the deal window, the app\'s copy and the screens read it by the one rule', () => {
    const m = code('src/components/modals/OpportunityModal.jsx'), h = code('src/hooks/useOpportunities.js'), p = code('src/Tabs/PipelineTab.jsx');
    for (const x of [
        'setFormData({ ...formData, [field]: value, probability: pressedProbability(opportunity, formData, probTouched.current || stageWentOut.current, value, settings?.funnelStages) });',
        'setFormData({ ...formData, stage: stageName, probability: pressedProbability(opportunity, formData, probTouched.current || stageWentOut.current, stageName, settings?.funnelStages) });',
        'const back = target === prevOpenStageRef.current ? prevProbRef.current : undefined;', 'const stageWentOut = useRef(false);', 'if (stageTouched.current) stageWentOut.current = true;',
        'setFormData({ ...formData, stage: target, probability: back !== undefined ? back ?? null : pressedProbability(opportunity, formData, probTouched.current || stageWentOut.current, target, settings?.funnelStages) });',
        'closeQuarter, contactIds: selectedContactIds }, left));', "{isOverridden && <span style={{ fontSize: 10, fontWeight: 700, color: T.warn,", 'your override: {formData.probability}%',
        'const stageTouched = useRef(false), probTouched = useRef(false);', "if (field === 'probability') probTouched.current = true;", "...(stageTouched.current ? [] : ['stage']),", "...(probTouched.current || stageWentOut.current ? [] : ['probability']),",
        'probability: opportunity?.id && !stageTouched.current ? formData.probability ?? null : countedProbability(formData, settings?.funnelStages), closeQuarter,', 'const prob = countedProbability(formData, settings?.funnelStages);', '· {probabilityText(prob)} probability',
        'const defaultProb = defaultOf(settings?.funnelStages, formData.stage);', 'const effectiveProb = countedProbability(formData, settings?.funnelStages);', 'const stageDefault = defaultOf(settings?.funnelStages, formData.stage);',
        'probability: null, arr: 0, implementationCost: 0,', 'const prevProbRef = useRef(null);', "value={(effectiveProb !== null && effectiveProb !== undefined && !isNaN(effectiveProb)) ? effectiveProb : ''}",
        "onChange={e => { const val = e.target.value === '' ? null : Math.min(100, Math.max(0, parseInt(e.target.value) || 0)); handleChange('probability', val); }}", "onClick={() => handleChange('probability', null)}",
        '{!isOverridden && defaultProb !== null && <span', '{isOverridden && defaultProb !== null && (',
        'const isOverridden = (formData.probability ?? null) !== null && formData.probability !== defaultProb;',
        'if (stageDefault === null && timeInStage === null) return null;', '{stageDefault !== null && ` · ${stageDefault}% default probability`}',
    ]) assert.equal(count(m, x), 1, x);
    assert.equal(count(m, 'stageTouched.current = true;'), 3, 'the ribbon, Won and Lost, Reopen');
    const k = code('src/components/KanbanView.jsx'), lv = code('src/components/ListView.jsx');
    assert.equal(count(k, 'probability: probabilityAfterMove(updatedOpp, toStage, settings?.funnelStages),'), 1, "REGRESSION: the board's copy kept the old stage's, and a window opened on it saved that as the rep's own");
    assert.ok(k.includes('body: JSON.stringify({ id: newOpp.id, stage: newOpp.stage, stageChangedDate: newOpp.stageChangedDate }),'), 'the board names none: the server decides from the deal as stored');
    assert.equal(count(lv, 'const funnelStages = settings?.funnelStages;'), 1);
    const qSummary = new Function('countedProbability', lv.slice(lv.indexOf('function qSummary('), lv.indexOf('\n}', lv.indexOf('function qSummary(')) + 2) + '\nreturn qSummary;')(countedProbability);
    assert.deepEqual(qSummary([{ arr: 100, stage: 'Bid sent', probability: null }, { arr: '50', stage: 'Lead in', probability: 20 }, { arr: 'x', stage: 'Bid sent', probability: 90 }, { arr: 10, stage: 'Unset' }], ['Bid sent'], LIST), { total: 160, weighted: 80, commit: 100, count: 4 });
    const cut = (from, to) => p.slice(p.indexOf(from), p.indexOf(to, p.indexOf(from)) + to.length);
    const header = new Function('pipelineFilteredOpps', 'countedProbability', 'settings', cut('const weightedARR ', '/ 100), 0);') + '\nreturn weightedARR;');
    assert.equal(header([{ arr: 100, stage: 'Bid sent' }, { arr: 50, stage: 'Lead in', probability: 20 }, { arr: 1000, stage: 'Closed Won' }, { arr: 1000, stage: 'Closed Lost', probability: 60 }], countedProbability, { funnelStages: LIST }), 80, 'open deals alone');
    const exported = new Function('o', 'countedProbability', 'settings', cut('const weightedVal', '.toFixed(0);') + '\nreturn weightedVal;');
    assert.deepEqual([{ arr: '200', stage: 'Bid sent' }, { arr: 200, stage: 'Bid sent', probability: 15 }, { stage: 'Bid sent' }].map((o) => exported(o, countedProbability, { funnelStages: LIST })), ['140', '30', '0']);
    assert.ok(p.includes("o.probability + '%',") && /probability \+ '%',[^\n]*\n\s+weightedVal,\n/.test(read('src/Tabs/PipelineTab.jsx')), 'the weighted column beside it');
    assert.deepEqual([count(lv, '((countedProbability(o, funnelStages) ?? 0) / 100)'), count(lv, 'qSummary(g.opps, commitStages, funnelStages)'), count(lv, 'qSummary(activeGroup.opps, commitStages, funnelStages)'), count(lv, 'funnelStages={settings?.funnelStages}')], [1, 1, 1, 1]);
    assert.equal(count(p, '(countedProbability(o, settings?.funnelStages) ?? 0) / 100)'), 2, 'the header\'s weighted, and the export\'s');
    assert.equal(count(code('netlify/functions/opportunities.mjs'), '    probability:        data.probability         ?? null,'), 1);
    const ad = code('src/Tabs/settings/integrations/AutomationsDetail.jsx');
    assert.equal(count(ad, "const unset = actions.filter(a => a.type === 'update_field').map(a => updateFieldPatch(a.params)).find(r => !r.ok);"), 1);
    assert.equal(count(ad, 'if (unset) { setError(`Update field: ${unset.reason}`); return; }'), 1);
    assert.ok(!/funnelStages \|\| \[\]\)\.find\(/.test(m), 'no reader of a weight of its own');
    assert.equal(count(h, '                        probability: opp.probability ?? null,'), 1, 'REGRESSION: a deal with none was held as NaN');
    assert.equal(count(p, "                o.probability == null ? '' : o.probability + '%',"), 1, 'REGRESSION: none was exported as 0%');
    assert.equal(count(code('src/Tabs/QuotesTab.jsx'), 'Revenue · {probabilityText(countedProbability(opp, settings?.funnelStages))} probability'), 1);
    for (const x of ["const stageSent = !(editingOpp && editingOpp.id) || 'stage' in sentBody(formData);", 'const stageChanged = stageSent && prevOpp && prevOpp.stage !== formData.stage;',
        "const enrichedData = stageSent ? enriched : leaveOut(enriched, [...(formData[LEFT_OUT] || []), 'wonDate', 'lostReason', 'lostCategory', 'lostDate']);", "if (stageSent && formData.stage === 'Closed Lost' && (",
        "const landed = data.opportunity || shownRow(updatedOpp);", "if (landed.stage === 'Closed Won') {", 'deps.onDealWon?.({ ...landed, id: editingOpp.id });']) assert.equal(count(h, x), 1, x);
    const r = code('src/Tabs/ReportsTab.jsx');
    assert.equal(count(r, '    }, [settings?.funnelStages]);\n\n    const ActionButtons ='), 1);
    for (const x of ['<div class="kpi-val">${probabilityText(countedProbability(opp, settings?.funnelStages))}</div>', '{probabilityText(countedProbability(o, settings?.funnelStages))}', "{ label:'Probability', value: probabilityText(countedProbability(selectedOpp, settings?.funnelStages)),"]) assert.equal(count(r, x), 1, x);
});

// The deal window's save, cut from the hook and run.
const HOOK = code('src/hooks/useOpportunities.js');
const at = HOOK.indexOf('    const handleSave = (formData, editingOpp, activePipeline, currentUser,'), end = HOOK.indexOf('\n    };\n\n    const completeLostSave');
const saveOf = new Function('opportunities', 'setOpportunities', 'setOppModalError', 'setOppModalSaving', 'requestOrg', 'stillOrg', 'dbFetch', 'dealBody', 'sentBody', 'shownRow', 'leaveOut', 'LEFT_OUT',
    'readRefusal', 'failureWords', 'addAudit', 'fireMentionSms', 'deps', 'console', 'maybeSaid', 'landedBefore', 'writeRefusal', 'loadOpportunities', HOOK.slice(at, end) + '\n    };\nreturn handleSave;');
const save = async (held, form, stored) => {
    const did = { bodies: [], sms: [], won: [], lost: [] };
    const none = () => {};
    const handleSave = saveOf([held], none, none, none, () => 'org_a', () => true, async (u, o) => { did.bodies.push(JSON.parse(o.body)); return { ok: true, json: async () => ({ opportunity: stored }) }; },
        dealBody, sentBody, shownRow, leaveOut, LEFT_OUT, none, none, none, (m) => did.sms.push(m.type), { onDealWon: (d) => did.won.push(d.stage) }, console, none, none, none, none);
    handleSave(form, { id: held.id }, { id: 'pl' }, 'Karen Rep', none, (m) => did.lost.push(m));
    for (let i = 0; i < 8; i++) await new Promise((r) => setImmediate(r));
    return did;
};
const HELD = { id: 'd1', opportunityName: 'D', stage: 'Proposal', salesRep: 'Karen Rep', createdDate: '2026-01-01', stageChangedDate: '2026-01-01' };

test("an edit that leaves the stage out sends nothing that follows one, and acts on the deal as stored — RUN", async () => {
    const untouched = (more = {}) => leaveOut({ ...HELD, notes: 'x', ...more }, ['stage', 'probability', 'account']);
    const won = await save(HELD, untouched(), { ...HELD, stage: 'Closed Won' });
    for (const k of ['stage', 'probability', 'account', 'wonDate', 'lostReason', 'lostCategory', 'lostDate']) assert.equal(k in won.bodies[0], false, `REGRESSION: ${k} emptied on a deal closed elsewhere since`);
    assert.equal(won.bodies[0].notes, 'x');
    assert.deepEqual([won.sms, won.won], [[], ['Closed Won']], 'the SPIFF offered is the stored deal\'s');
    const held = { ...HELD, stage: 'Closed Won', wonDate: '2026-02-02' };
    const reopened = await save(held, leaveOut({ ...held, notes: 'y' }, ['stage']), { ...HELD, stage: 'Proposal' });
    assert.deepEqual([reopened.won, 'wonDate' in reopened.bodies[0]], [[], false], 'reopened elsewhere: no SPIFF, no won date');
    const copy = await save(HELD, leaveOut({ ...HELD, stage: 'Closed Lost' }, ['stage']), HELD);
    assert.deepEqual([copy.lost, copy.bodies.length, copy.sms], [[], 1, []], 'no Lost dialog for a close nobody pressed, no text');
    // One pressed is sent, with what follows it.
    const pressed = await save(HELD, leaveOut({ ...HELD, stage: 'Closed Won' }, ['account']), { ...HELD, stage: 'Closed Won' });
    assert.deepEqual([pressed.bodies[0].stage, !!pressed.bodies[0].wonDate, 'lostReason' in pressed.bodies[0], pressed.sms, pressed.won], ['Closed Won', true, true, ['dealClosedWon'], ['Closed Won']]);
    assert.equal((await save(HELD, { ...HELD, stage: 'Closed Lost' }, HELD)).lost.length, 1);
});
