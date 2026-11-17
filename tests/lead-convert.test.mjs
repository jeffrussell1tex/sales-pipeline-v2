// tests/lead-convert.test.mjs
//
// A lead's Convert (state §0.253; OPEN_ITEMS §4.2 "A lead's Convert opens the deal window blank", filed by §0.252's map;
// Jeff, 16 Nov: "do 2", then "When the deal saves"). The convert set the lead's values as the deal the window edited,
// 50 ms after the window opened — and the form, taken as it mounts, never had them: the window opened blank. And it
// marked the lead Converted on the press, before any deal existed: a Cancel left a Converted lead with no deal.
//   RUN     the deal window's create and the Closed Lost dialog's create: the lead marked once the deal lands, never on a
//           refusal or after an org switch, its id never in the body; App's markLeadConverted: the lead as the server
//           stored it, a refusal said
//   WIRING  the convert seeds the window (newDealSeed), the window opens on it and clears it as it opens, and the
//           convert marks nothing itself
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dealBody } from '../src/utils/dealNotes.js';
import { sentBody, shownRow } from '../src/utils/leaveOut.js';
import { readRefusal, failureWords } from '../src/utils/refusalWords.js';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8').replace(/\r\n/g, '\n');
const code = (src) => src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
const between = (s, a, b) => { const i = s.indexOf(a); assert.ok(i >= 0, a); const j = s.indexOf(b, i + a.length); assert.ok(j > i, b); return s.slice(i, j); };
const settle = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setImmediate(r)); };   // turns of the loop, never a timer (§0.251)
const quiet = { error: () => {}, warn: () => {}, log: () => {} };
const stateOf = (initial) => { const s = { value: initial }; s.set = (u) => { s.value = typeof u === 'function' ? u(s.value) : u; }; return s; };
const answerOf = (status, body) => ({ ok: status < 400, status, json: async () => body });

const HOOK = code(read('src/hooks/useOpportunities.js'));
const SEEDED = Object.freeze({ opportunityName: 'Ada Lane — Lane Co', account: 'Lane Co', salesRep: 'Karen Rep', arr: 1200, stage: 'Qualification', fromLeadId: 'lead_1' });

// ── RUN: the deal window's create ───────────────────────────────────────────

const handleSaveOf = () => new Function('opportunities', 'setOpportunities', 'setOppModalError', 'setOppModalSaving', 'requestOrg', 'stillOrg', 'dbFetch',
    'dealBody', 'sentBody', 'shownRow', 'readRefusal', 'failureWords', 'addAudit', 'fireMentionSms', 'deps', 'console',
    `${between(HOOK, '    const handleSave = (formData, editingOpp, activePipeline, currentUser,', '\n    };\n\n    const completeLostSave')}\n    };\nreturn handleSave;`);

const create = async ({ answer, switchOrg = false, formData = SEEDED }) => {
    const opps = stateOf([]);
    const did = { order: [], bodies: [], converted: [] };
    let org = 'org_a';
    const handleSave = handleSaveOf()([], opps.set, () => {}, () => {}, () => 'org_a', (o) => o === org,
        async (url, opts) => { did.bodies.push(JSON.parse(opts.body)); if (switchOrg) org = 'org_b'; return answer; },
        dealBody, sentBody, shownRow, readRefusal, failureWords, () => {}, () => {},
        { onLeadConverted: (id) => { did.order.push('converted'); did.converted.push(id); } }, quiet);
    handleSave({ ...formData }, null, { id: 'pl_1' }, 'Karen Rep', (v) => { if (v === false) did.order.push('closed'); }, () => {});
    await settle();
    return did;
};

test('RUN: the deal window\'s create marks the lead once the deal lands — after the window closes, its id never sent', async () => {
    const r = await create({ answer: answerOf(201, { opportunity: { id: 'x' } }) });
    assert.deepEqual(r.converted, ['lead_1'], 'REGRESSION (§0.253): the lead marked before, or without, its deal');
    assert.deepEqual(r.order, ['closed', 'converted'], 'the deal landed and the window closed first');
    assert.equal(r.bodies.length, 1);
    assert.ok(!('fromLeadId' in r.bodies[0]), 'the lead id is the screen\'s, never the deal\'s body');
    assert.equal(r.bodies[0].opportunityName, 'Ada Lane — Lane Co');
});

test('RUN: a refused create, or one answered after an org switch, marks nothing; a create from no lead marks nothing', async () => {
    assert.deepEqual((await create({ answer: answerOf(409, { error: 'That deal id is already in use.' }) })).converted, []);
    assert.deepEqual((await create({ answer: answerOf(201, { opportunity: { id: 'x' } }), switchOrg: true })).converted, [], 'the org on screen changed');
    const { fromLeadId: _l, ...plain } = SEEDED;
    assert.deepEqual((await create({ answer: answerOf(201, { opportunity: { id: 'x' } }), formData: plain })).converted, []);
});

// ── RUN: the Closed Lost dialog's create ────────────────────────────────────

const lostSaveOf = () => new Function('opportunities', 'setOpportunities', 'requestOrg', 'stillOrg', 'dbWrite', 'dealBody', 'sentBody', 'shownRow', 'addAudit', 'deps',
    `${between(HOOK, '    const completeLostSave = async (', '\n    };\n')}\n    };\nreturn completeLostSave;`);

const lost = async (answer) => {
    const opps = stateOf([]);
    const did = { bodies: [], converted: [] };
    const fn = lostSaveOf()([], opps.set, () => 'org_a', () => true,
        async (url, opts) => { did.bodies.push(JSON.parse(opts.body)); return answer; },
        dealBody, sentBody, shownRow, () => {}, { onLeadConverted: (id) => did.converted.push(id) });
    const out = await fn({ ...SEEDED, stage: 'Closed Lost', id: 'id_new' }, null, 'Price', 'Budget', { id: 'pl_1' }, 'Karen Rep', () => {});
    return { ...did, out };
};

test('RUN: a converted lead\'s deal saved Closed Lost marks the lead once it lands; a refusal marks nothing', async () => {
    const ok = await lost({ ok: true, status: 201, error: null, data: { opportunity: { id: 'id_new' } } });
    assert.deepEqual(ok.converted, ['lead_1']);
    assert.ok(!('fromLeadId' in ok.bodies[0]));
    assert.deepEqual(ok.out, { ok: true });
    const no = await lost({ ok: false, status: 409, error: 'Refused' });
    assert.deepEqual(no.converted, []);
    assert.equal(no.out.ok, false);
});

// ── RUN: App's markLeadConverted ────────────────────────────────────────────

const markOf = () => new Function('requestOrg', 'stillOrg', 'dbWrite', 'setUndoToast', 'setLeads',
    `${between(code(read('src/App.jsx')), '    const markLeadConverted = async (leadId) => {', '\n    };')}\n    };\nreturn markLeadConverted;`);

test('RUN: markLeadConverted — the lead through the leads endpoint, as the server stored it; a refusal said, the deal kept', async () => {
    const leads = stateOf([{ id: 'lead_1', status: 'Qualified' }, { id: 'lead_2', status: 'New' }]);
    const sent = [];
    const toasts = [];
    const stored = { id: 'lead_1', status: 'Converted', convertedAt: '2026-11-16' };
    await markOf()(() => 'org_a', () => true, async (url, opts) => { sent.push([url, opts.method, JSON.parse(opts.body)]); return { ok: true, data: { lead: stored } }; },
        (t) => toasts.push(t), leads.set)('lead_1');
    assert.deepEqual(sent, [['/.netlify/functions/leads?id=lead_1', 'PUT', { id: 'lead_1', status: 'Converted' }]], 'only the status: the server stamps convertedAt');
    assert.deepEqual(leads.value[0], stored);
    assert.equal(leads.value[1].status, 'New');
    assert.deepEqual(toasts, []);

    const before = stateOf([{ id: 'lead_1', status: 'Qualified' }]);
    await markOf()(() => 'org_a', () => true, async () => ({ ok: false, error: 'Only managers and admins can change lead assignment.' }),
        (t) => toasts.push(t), before.set)('lead_1');
    assert.equal(before.value[0].status, 'Qualified', 'a refusal changes nothing on screen');
    assert.match(toasts[0].error, /^The deal was saved; its lead was not marked Converted — Only managers/);

    const switched = stateOf([{ id: 'lead_1', status: 'Qualified' }]);
    const toastsAfter = [];
    await markOf()(() => 'org_a', () => false, async () => ({ ok: false, error: 'x' }), (t) => toastsAfter.push(t), switched.set)('lead_1');
    assert.deepEqual(toastsAfter, [], 'an answer after an org switch says nothing in the new org');
});

// ── WIRING ──────────────────────────────────────────────────────────────────

test('WIRING: the convert seeds the window and marks nothing itself', () => {
    const t = code(read('src/Tabs/LeadsTab.jsx'));
    const fn = between(t, '    const convertLead = useCallback((lead) => {', '    }, [');
    assert.ok(fn.includes('setNewDealSeed({ ...oppSeed, fromLeadId: normalized.id });'));
    const [e, s, o] = ['setEditingOpp(null);', 'setNewDealSeed(', 'setShowModal(true);'].map((x) => fn.indexOf(x));
    assert.ok(e >= 0 && e < s && s < o, 'the seed before the window opens (each present: an indexOf of -1 passes an order alone)');
    assert.ok(!fn.includes('Converted') && !fn.includes('saveLead('), 'REGRESSION (§0.253): the lead marked on the press');
    assert.ok(!fn.includes('setTimeout'), 'REGRESSION (§0.253): the seed set after the form was taken');
});

test('WIRING: the bulk Convert converts one lead at a time — the first, the rest kept selected and said', () => {
    const t = code(read('src/Tabs/LeadsTab.jsx'));
    const bulk = between(t, '                                    const isSel = (l) => !!selected[l.id];', '}}>Convert to opportunity</span>');
    // The first in the table's order (the shown rows, sorted by score), then any selected and hidden; never a lead already
    // Converted (the round-2 review: first-checked order, a hidden lead, and a lead converted twice).
    assert.ok(bulk.includes('const shownSel = allForTable.filter(isSel);'));
    assert.ok(bulk.includes("const picked = [...shownSel, ...leads.filter(l => isSel(l) && !shownSel.includes(l))].filter(l => l.status !== 'Converted');"));
    assert.ok(bulk.includes('convertLead(picked[0]);') && !bulk.includes('forEach'), 'REGRESSION (§0.253\'s review): a loop seeded every lead into one window and kept the last');
    // Every other selected id stays selected — one outside this list (a scope switched, a lead deleted) too (the last review).
    assert.ok(bulk.includes('const restSel = Object.fromEntries(Object.keys(selected).filter(id => selected[id] && id !== picked[0].id).map(id => [id, true]));'));
    assert.ok(bulk.includes('setSelected(restSel);'), 'the rest stay selected');
    assert.ok(bulk.includes("const others = kept === 1 ? 'the other stays selected; convert it' : `the other ${kept} stay selected; convert each`;"), 'the count of those kept');
    assert.ok(bulk.includes('setBulkNote(kept ? { text: `Opened a deal for 1 of ${picked.length} — ${others} after this one.`, forKeys: Object.keys(restSel).sort().join(\'|\') } : null);'), 'and the bar says so, of that selection');
    assert.ok(bulk.includes("text: leads.some(isSel) ? 'Every lead selected here is Converted already.' : 'No lead selected is in this list.', forKeys: selectedKeys }); return;"), 'nothing to convert, said as it is');
    // Every other change to the selection retires the note — a box, Assign, its clear, Change status, Clear.
    assert.equal(t.split('setSelected({}); setBulkNote(null);').length - 1, 4, 'Assign, its clear, Change status and Clear');
    assert.ok(t.includes('setSelected(s => ({ ...s, [l.id]:!s[l.id] })); setBulkNote(null); }}'), 'a box');
    // The note is the selection's it was said of: any change to the selection retires it.
    assert.ok(t.includes("    const selectedKeys = Object.keys(selected).filter(id => selected[id]).sort().join('|');"));
    assert.ok(t.includes("    const bulkNoteNow = bulkNote && bulkNote.forKeys === selectedKeys ? bulkNote.text : '';"));
    assert.ok(t.includes('{bulkNoteNow && <span style={{ fontSize:11, opacity:0.85 }}>{bulkNoteNow}</span>}'));
});

test('WIRING: the window opens on the seed — the form, the Account and Sales Rep text — and clears it as it opens', () => {
    const m = code(read('src/components/modals/OpportunityModal.jsx'));
    assert.ok(m.includes('    errorMessage, onDismissError, saving, onOpenNestedContact, seed, onSeedTaken }) {'));
    assert.ok(m.includes('        const seeded = !opportunity && seed ? {'), 'only a new deal');
    assert.ok(m.includes("            arr: seed.arr || 0, fromLeadId: seed.fromLeadId || null,"));
    assert.ok(m.includes("            pipelineId: activePipelineId || 'default',\n            ...seeded,\n        };"), 'over the blank form');
    assert.ok(m.includes("useState(opportunity?.account || (!opportunity && seed?.account) || '')"));
    assert.ok(m.includes("useState(opportunity?.salesRep || (!opportunity && seed?.salesRep) || '')"));
    assert.ok(m.includes('    useEffect(() => { if (seed && onSeedTaken) onSeedTaken(); }, [seed]);'), 'cleared as it opens, and whenever one is set while it is open, so the next new deal opens blank (the review, 16 Nov)');
    // The seeded fields themselves (the review: dropping one left every test green, though a blank form was the bug).
    assert.ok(m.includes("            opportunityName: seed.opportunityName || '', account: seed.account || '', salesRep: seed.salesRep || '',"), 'the name, account and rep');
    const ml = read('src/components/layout/ModalLayer.jsx');
    assert.ok(ml.includes('                    seed={editingOpp ? null : newDealSeed}\n                    onSeedTaken={() => setNewDealSeed(null)}'));
    const ms = read('src/hooks/useModalState.js');
    assert.ok(ms.includes('    const [newDealSeed, setNewDealSeed] = useOrgBoundState(resets, null);'), 'the org\'s — a switch drops it');
    assert.equal(read('src/App.jsx').split('        newDealSeed, setNewDealSeed,\n').length - 1, 2, 'from the modal state, into the app context');
});

test('WIRING: both creates keep the lead id out of the body and mark the lead after the deal lands', () => {
    const save = between(HOOK, '    const handleSave = (formData,', '    const completeLostSave');
    const at = save.indexOf('            const { fromLeadId, ...enrichedNew } = enrichedData;');
    assert.ok(at > 0 && save.indexOf('const newOpp = { ...enrichedNew, id: newId, pipelineId: activePipeline.id };', at) > at);
    const after = save.indexOf('                    if (fromLeadId) deps.onLeadConverted?.(fromLeadId);');
    assert.ok(after > save.indexOf('                    setShowModal(false); setOppModalError(null);', at), 'after the landed deal closes the window');
    const lostFn = between(HOOK, '    const completeLostSave = async (', '\n    };\n');
    const la = lostFn.indexOf('            if (fromLeadId) deps.onLeadConverted?.(fromLeadId);');
    assert.ok(la > lostFn.indexOf("addAudit('create', 'opportunity', newId"), 'after the create is stored');
    assert.equal(HOOK.split('deps.onLeadConverted?.(fromLeadId)').length - 1, 2, 'the two creates, never an edit');
    const app = code(read('src/App.jsx'));
    assert.ok(app.includes('        get onLeadConverted()     { return _onLeadConvertedRef.current; },') && app.includes('    _onLeadConvertedRef.current = markLeadConverted;'));
});
