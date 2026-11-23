// tests/job-editor-save.test.mjs
//
// Saving a job with no category (state §0.113). Jeff set a preferred start
// time and Save answered "Internal server error". Bisected field by field in
// the pane: the start time was innocent — `jobType: null` and `trade: null`
// each 500 alone. Both columns are NOT NULL (defaults 'hvac'/'repair'); the
// create path writes '' for "— None —", but the Jobs editor's save sent null,
// so ANY job without a category could not be saved from the editor. Now the
// server coerces a null to '' on the dispatcher PUT (matching create) and the
// editor sends '' in the first place. The behaviour itself is proved against
// the test database in tests/integration/customer-notify.itest.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as JC from '../src/utils/jobChanges.js';
import { writeRefusalOf, refusalError, saidError, maybeSaid, thrownSaid } from '../src/utils/refusalWords.js';
import { heldCreate } from '../src/utils/createResend.js';

const { editorFields, jobChanges, sentOf, seenIn, movedWords, pressLanded, sameAppointment } = JC;

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const code = (src) => src.split(/\r?\n/).filter(l => !l.trim().startsWith('//')).join('\n');

test('dispatcher PUT: a null trade or jobType becomes the empty string the column accepts', () => {
    const f = code(read('netlify/functions/dispatch-jobs.mjs'));
    assert.ok(f.includes("            scalarFields.forEach(f => { if (f in data) updates[f] = data[f]; });\n            for (const f of ['trade', 'jobType']) if (f in data && data[f] == null) updates[f] = '';"),
        'the coercion runs right after the scalar copy, on the dispatcher path');
    assert.ok(f.includes("                trade:            data.trade            ?? '',"), 'create already wrote the empty string');
});

test('the Jobs editor sends the empty string for "— None —", never null', () => {
    // Moved in §0.286: the editor's Save body is jobChanges over editorFields (src/utils/jobChanges.js) — the same
    // expressions, run here on the real builder.
    const s = code(read('src/Tabs/DispatchTab.jsx'));
    const jc = code(read('src/utils/jobChanges.js'));
    // Moved in §0.289: the Save names the job as opened as what it saw (run below).
    assert.ok(s.includes('const body = jobChanges(editorFields(base, base.locationId), editorFields(draft, locationId), draft.id, { seen: base });'), 'the editor saves editorFields');
    assert.ok(jc.includes("    jobType:         job.jobType || '',"));
    assert.ok(jc.includes("    trade:           job.trade || '',"));
    assert.ok(!jc.includes('jobType:         job.jobType || null,') && !s.includes('jobType:         draft.jobType || null,'));
    const none = editorFields({ title: 'T', jobType: null, trade: undefined }, null);
    assert.equal(none.jobType, '', 'a null type sends the empty string');
    assert.equal(none.trade, '', 'an unset trade sends the empty string');
    // "— None —" picked over a category: the empty string is sent, never null; an untouched none is not sent at all.
    const opened = { id: 'j1', title: 'T', status: 'unscheduled', jobType: 'repair', trade: '' };
    assert.deepEqual(jobChanges(editorFields(opened, null), editorFields({ ...opened, jobType: '' }, null), 'j1'), { id: 'j1', jobType: '' });
    assert.equal(jobChanges(editorFields(opened, null), editorFields({ ...opened, trade: null }, null), 'j1'), null, 'none held, none picked: nothing to save');
});

// ── RUN (state §0.289): the editor's whole Save, extracted from DispatchTab.jsx and run over stubs, every helper real. ──
const between = (src, a, b) => { const i = src.indexOf(a); assert.ok(i >= 0, a); const j = src.indexOf(b, i + a.length); assert.ok(j > i, b); return src.slice(i, j); };
const answerOf = (status, body) => ({ ok: status < 400, status, json: async () => { if (body instanceof Error) throw body; return body; } });
const view = between(code(read('src/Tabs/DispatchTab.jsx')), 'const JobsView = (', 'setQuery(e.target.value)');
const SAVE = between(view, '    const save = async () => {', '\n    };\n') + '\n    };';
const SEEN = ', { seen: base }';
// A source with one piece of it (there once) swapped or taken out in memory: how a case below is shown to turn on it.
const without = (src, piece, put = '') => { assert.equal(src.split(piece).length - 1, 1, piece); return src.replace(piece, () => put); };
// jobChanges.js itself with one piece taken out.
const libWithout = (piece, put) => new Function(`${without(code(read('src/utils/jobChanges.js')), piece, put).replace(/^export /gm, '')}
return { jobChanges, editorFields, jobAnswerOf, sentOf, rebaseDraft, appointmentDropped };`)();

// One editor, opened on `job`: `type` into its draft (or its address, `loc`), `press` its Save over one answer → the job body sent
// (null when none was); the address step's own answer is `address`, or what it answers each request. Moved in §0.290: the ids an
// address may have been made under outlive a press (newLocIds was a new object each), and how each address was sent is recorded.
const editorOf = (job, src = SAVE, lib = JC) => {
    const ed = { opened: { current: { ...job } }, draft: { ...job }, selected: job, saved: [], status: null, loc: null, sentAddresses: [],
        newLocIds: { current: {} }, maybeLocIds: { current: new Set() }, address: { status: 200, body: { location: { id: 'loc9' } } } };
    ed.type = (typed) => { ed.draft = { ...ed.draft, ...typed }; return ed; };
    ed.at = (loc) => { ed.loc = loc; return ed; };
    ed.press = async (answer) => {
        let body = null;
        const names = ['draft', 'loc', 'setStatus', 'setSaving', 'requestOrg', 'stillOrg', 'dbFetch', 'newLocIds', 'maybeLocIds', 'heldCreate', 'setLoc', 'opened', 'selected', 'jobChanges',
            'editorFields', 'jobAnswerOf', 'sentOf', 'rebaseDraft', 'appointmentDropped', 'writeRefusalOf', 'refusalError', 'saidError', 'maybeSaid', 'thrownSaid', 'onSaved', 'setDraft', 'setSelectedId'];
        const save = new Function(...names, `${src}\nreturn save;`)(ed.draft, ed.loc, (v) => { ed.status = v; }, () => {}, () => 'org_a', () => true,
            async (url, o) => {
                if (url.includes('resource=locations')) {
                    const sent = JSON.parse(o.body); ed.sentAddresses.push({ ...sent, method: o.method, url });
                    const a = typeof ed.address === 'function' ? ed.address(sent, o) : ed.address;
                    return answerOf(a.status, a.body);
                }
                body = JSON.parse(o.body); return typeof answer === 'function' ? answer(body) : answer;
            }, ed.newLocIds, ed.maybeLocIds, heldCreate, (f) => { ed.loc = f(ed.loc); }, ed.opened, ed.selected,
            lib.jobChanges, lib.editorFields, lib.jobAnswerOf, lib.sentOf, lib.rebaseDraft, lib.appointmentDropped, writeRefusalOf, refusalError, saidError, maybeSaid, thrownSaid,
            (j) => { ed.saved.push(j); ed.selected = j; }, (f) => { ed.draft = typeof f === 'function' ? f(ed.draft) : f; }, () => {});
        await save();
        return body;
    };
    return ed;
};
// The server over the job as stored (officeWrite and missedOfficeJob, dispatch-jobs.mjs): where the body named is where the job
// stands → written; else an earlier press that landed ('already'), or the refusal in its own words (movedWords over seenIn).
const server = (now) => (body) => {
    const { seen } = seenIn(body);
    const stands = (seen.status === undefined || now.status === seen.status) && (!seen.appointment || sameAppointment(now, seen.appointment));
    if (stands) return answerOf(200, { job: { ...now, ...sentOf(body) } });
    return pressLanded(now, sentOf(body), seen)
        ? answerOf(409, { error: 'already', code: 'already', job: now })
        : answerOf(409, { error: movedWords(now, seen), code: 'stale', job: now });
};
// Booked 09:00–10:30 for a two-hour job: the form reads its end as 11:00, the job holds 10:30.
const JOB = { id: 'j1', title: 'Boiler', status: 'scheduled', priority: 'normal', jobType: 'repair', trade: 'hvac', durationMinutes: 120, crewSize: 1,
    assignedTechId: 't1', coTechIds: ['t2'], scheduledDate: '2026-09-15', scheduledStart: '09:00', scheduledEnd: '10:30', timeSlot: 'exact', locationId: null };
const BOOKED = { scheduledDate: '2026-09-15', scheduledStart: '09:00', scheduledEnd: '10:30', timeSlot: 'exact', durationMinutes: 120 };
const TIME = 'This job’s time changed since this screen loaded it. Nothing was saved.';
const DROPPED = ' Its time is shown as it is now — choose yours again.';
const QUEUED = { ...JOB, status: 'unscheduled', scheduledDate: null, scheduledStart: null, scheduledEnd: null, timeSlot: null };
const NO_TIME = { scheduledDate: '', scheduledStart: '', scheduledEnd: '', timeSlot: 'anytime', durationMinutes: 120 };
// The job rescheduled by another member since the editor opened, its status unmoved.
const LATER = { ...JOB, scheduledDate: '2026-09-18', scheduledStart: '11:00', scheduledEnd: '13:00' };

test('the Jobs editor names the appointment it saw with one it sends — as stored, never the form’s reading of it; the crew, which it never sends, never — RUN', async () => {
    const landed = answerOf(200, { job: JOB });
    assert.deepEqual(await editorOf(JOB).type({ title: 'Boiler (rush)' }).press(landed), { id: 'j1', title: 'Boiler (rush)' },
        'no appointment sent, none named: another member’s stands beside the title');
    const moved = { id: 'j1', scheduledDate: '2026-09-15', scheduledStart: '13:00', scheduledEnd: '15:00', timeSlot: 'exact' };
    assert.deepEqual(await editorOf(JOB).type({ scheduledStart: '13:00' }).press(landed), { ...moved, fromAppointment: BOOKED },
        'a new start: the appointment whole, and the one it saw, its end as stored');
    assert.deepEqual(await editorOf(JOB).type({ durationHrs: '3' }).press(landed),
        { id: 'j1', durationMinutes: 180, scheduledDate: '2026-09-15', scheduledStart: '09:00', scheduledEnd: '12:00', timeSlot: 'exact', fromAppointment: BOOKED },
        'a longer job moves its end: the appointment it was seen at');
    assert.deepEqual(await editorOf(JOB).type({ scheduledStart: '', status: 'unscheduled' }).press(landed),
        { id: 'j1', status: 'unscheduled', scheduledDate: '2026-09-15', scheduledStart: null, scheduledEnd: null, timeSlot: 'anytime', fromStatus: 'scheduled', fromAppointment: BOOKED },
        'with a status move: where it stood too');
    assert.deepEqual(await editorOf(JOB).type({ status: 'completed' }).press(landed), { id: 'j1', status: 'completed', fromStatus: 'scheduled' },
        'a status that puts nothing on the schedule, alone: where it stood');
    // A job with no time, its slot none: named as the server compares it.
    assert.deepEqual(await editorOf(QUEUED).type({ timeSlot: 'morning' }).press(landed),
        { id: 'j1', scheduledDate: null, scheduledStart: null, scheduledEnd: null, timeSlot: 'morning', fromAppointment: NO_TIME });
    // The length of a job with no start moves no time of it — named all the same (the review); the line out, nothing is.
    const longer = { id: 'j1', durationMinutes: 180 };
    assert.deepEqual(await editorOf(QUEUED).type({ durationHrs: '3' }).press(landed), { ...longer, fromAppointment: NO_TIME });
    assert.deepEqual(await editorOf(QUEUED, SAVE, libWithout("[...APPOINTMENT, 'durationMinutes'].some((k) => k in out)", 'APPOINTMENT.some((k) => k in out)'))
        .type({ durationHrs: '3' }).press(landed), longer, 'shown red');
    // Put on the schedule, its time untouched: the time it goes on at; the line out, none is named.
    const on = { id: 'j1', status: 'scheduled', fromStatus: 'unscheduled' };
    assert.deepEqual(await editorOf(QUEUED).type({ status: 'scheduled' }).press(landed), { ...on, fromAppointment: NO_TIME });
    assert.deepEqual(await editorOf(QUEUED, SAVE, libWithout(" || out.status === 'scheduled'")).type({ status: 'scheduled' }).press(landed), on, 'shown red');
    // A job kept from a press whose answer proved nothing (_maybe) was never seen as stored: none named.
    assert.deepEqual(await editorOf({ ...JOB, _maybe: true }).type({ scheduledStart: '13:00' }).press(landed), moved);
    assert.deepEqual((await editorOf({ ...JOB, _maybe: true }, SAVE, libWithout(' && !job._maybe')).type({ scheduledStart: '13:00' }).press(landed)).fromAppointment, BOOKED, 'shown red');
    // The Save with the job it saw left out (in memory), and with the form's reading in its place: each sends another body.
    assert.equal(SAVE.split(SEEN).length - 1, 1, 'one Save, one job seen');
    assert.deepEqual(await editorOf(JOB, SAVE.replace(SEEN, '')).type({ scheduledStart: '13:00' }).press(landed), moved, 'left out: nothing named');
    // Moved in §0.289 (the review): the form's reading holds no id, so it names nothing (seenOf) — its end, 11:00, once named over 10:30.
    const form = await editorOf(JOB, SAVE.replace(SEEN, ', { seen: { ...editorFields(base, base.locationId), id: base.id } }')).type({ scheduledStart: '13:00' }).press(landed);
    assert.equal(form.fromAppointment.scheduledEnd, '11:00', 'the form’s reading: an end the job never held');
    assert.equal(movedWords(JOB, seenIn(form).seen), TIME, 'refused over a job nobody moved');
    assert.deepEqual(await editorOf(JOB, SAVE.replace(SEEN, ', { seen: editorFields(base, base.locationId) }')).type({ scheduledStart: '13:00' }).press(landed), moved,
        'with no id on it, nothing named at all');
});

// Rewritten in §0.289 (the review): the start typed was kept beside the day another member moved the job to — an appointment
// nobody chose, sent by the next Save. The stored appointment is shown whole now, and said.
test('the Jobs editor over a job rescheduled since: refused, open on the stored appointment whole — said, for the member to choose again — everything else typed kept; its next Save names the appointment it now sees — RUN', async () => {
    const ed = editorOf(JOB).type({ scheduledStart: '13:00', title: 'Boiler (rush)' });
    const first = await ed.press((body) => { ed.type({ priority: 'high' }); return server(LATER)(body); });   // a priority typed while it was out
    assert.deepEqual(first.fromAppointment, BOOKED);
    assert.deepEqual(ed.status, { kind: 'err', msg: TIME + DROPPED });
    assert.deepEqual(ed.saved, [LATER], 'the job as stored adopted');
    assert.deepEqual(ed.opened.current, LATER);
    assert.deepEqual([ed.draft.scheduledDate, ed.draft.scheduledStart, ed.draft.scheduledEnd, ed.draft.timeSlot], ['2026-09-18', '11:00', '13:00', 'exact'], 'theirs, whole');
    assert.equal(ed.draft.title, 'Boiler (rush)', 'the title typed: kept');
    assert.equal(ed.draft.priority, 'high', 'and what was typed while the Save was out');
    // Saved again with no time chosen: only what else was typed, no appointment sent, none named — theirs stands.
    const plain = editorOf(LATER); plain.opened.current = { ...ed.opened.current }; plain.draft = { ...ed.draft };
    assert.deepEqual(await plain.press(server(LATER)), { id: 'j1', title: 'Boiler (rush)', priority: 'high' });
    // Chosen again: the appointment named as it now stands.
    const landed = { ...LATER, title: 'Boiler (rush)', priority: 'high', scheduledStart: '13:00', scheduledEnd: '15:00' };
    assert.deepEqual(await ed.type({ scheduledStart: '13:00' }).press(server(LATER)), { id: 'j1', title: 'Boiler (rush)', priority: 'high',
        scheduledDate: '2026-09-18', scheduledStart: '13:00', scheduledEnd: '15:00', timeSlot: 'exact',
        fromAppointment: { scheduledDate: '2026-09-18', scheduledStart: '11:00', scheduledEnd: '13:00', timeSlot: 'exact', durationMinutes: 120 } });
    assert.deepEqual(ed.status, { kind: 'ok', msg: 'Saved' });
    // The base after it is the job as stored: another time names the one just saved.
    assert.deepEqual((await ed.type({ scheduledStart: '14:00' }).press(answerOf(200, { job: landed }))).fromAppointment,
        { scheduledDate: '2026-09-18', scheduledStart: '13:00', scheduledEnd: '15:00', timeSlot: 'exact', durationMinutes: 120 });

    // Shown red, each line out: the rebase not told it was refused, and the rebase's own line — the start typed stands beside
    // their day and the next Save sends it; the said words — nothing tells the member their time is gone.
    for (const [src, lib] of [[without(SAVE, ', { refused: true }'), JC],
        [SAVE, libWithout('if (refused && appointmentMoved(opened, stored)) for (const k of APPOINTMENT) next[k] = stored[k] ?? null;')]]) {
        const mixed = editorOf(JOB, src, lib).type({ scheduledStart: '13:00' });
        await mixed.press(server(LATER));
        assert.deepEqual([mixed.draft.scheduledDate, mixed.draft.scheduledStart], ['2026-09-18', '13:00']);
        assert.equal((await mixed.press(server(LATER))).scheduledStart, '13:00');
    }
    for (const src of [without(SAVE, 'if (appointmentDropped(base, draft, r.body.job)) dropped = ' + "'" + DROPPED + "';"), without(SAVE, ' + dropped : r.words', ' : r.words')]) {
        const silent = editorOf(JOB, src).type({ scheduledStart: '13:00' });
        await silent.press(server(LATER));
        assert.deepEqual(silent.status, { kind: 'err', msg: TIME });
    }
});

test('the Jobs editor says a time was dropped only where one was: a status refusal, a length moved, or no time typed keeps or shows without the words — RUN', async () => {
    // Moved by status alone, its time as seen: the time typed is kept, to be sent again.
    const enRoute = { ...JOB, status: 'en_route' };
    const a = editorOf(JOB).type({ scheduledStart: '13:00', status: 'paused' });
    await a.press(server(enRoute));
    assert.deepEqual(a.status, { kind: 'err', msg: 'This job is en route now — it changed since you opened it. Nothing was saved.' });
    assert.equal(a.draft.scheduledStart, '13:00');
    assert.deepEqual((await a.press(server(enRoute))).fromStatus, 'en_route');
    // Made longer since, its day, start, end and slot as seen: refused for its time; the start typed is kept, its end worked
    // out from the stored length.
    const longer = { ...JOB, durationMinutes: 180 };
    const b = editorOf(JOB).type({ scheduledStart: '13:00' });
    await b.press(server(longer));
    assert.deepEqual(b.status, { kind: 'err', msg: TIME });
    assert.equal(b.draft.scheduledStart, '13:00');
    const again = await b.press(server(longer));
    assert.equal(again.scheduledEnd, '16:00'); assert.equal(again.fromAppointment.durationMinutes, 180);
    // Put on the schedule with no time typed, given a time since: the stored one is shown, nothing of the member's dropped —
    // never 'already' for the status it now holds (pressLanded: the time it named is not the job's).
    const given = { ...QUEUED, status: 'scheduled', scheduledDate: '2026-09-18', scheduledStart: '11:00', scheduledEnd: '13:00', timeSlot: 'exact' };
    const c = editorOf(QUEUED).type({ status: 'scheduled' });
    await c.press(server(given));
    assert.equal(c.status.kind, 'err'); assert.ok(!c.status.msg.includes(DROPPED));
    assert.equal(c.draft.scheduledStart, '11:00');
    const taken = editorOf(QUEUED, without(SAVE, SEEN)).type({ status: 'scheduled' });
    await taken.press(server(given));
    assert.deepEqual(taken.status, { kind: 'ok', msg: 'Saved' }, 'shown red: the time not named, another member’s schedule is said as this one’s');
    // An earlier press of the same Save that landed: 'already', "Saved", the job as stored the base.
    const d = editorOf(JOB).type({ scheduledStart: '13:00' });
    assert.equal(await d.press(answerOf(500, {})).then(() => d.status.kind), 'err');
    const landed = { ...JOB, scheduledStart: '13:00', scheduledEnd: '15:00' };
    await d.press(server(landed));
    assert.deepEqual(d.status, { kind: 'ok', msg: 'Saved' });
    assert.deepEqual(d.opened.current, landed);
    // A refusal that is not 'stale' keeps the draft as typed, in its own words.
    const e = editorOf(JOB).type({ scheduledStart: '13:00' });
    await e.press(answerOf(400, { error: 'No. Nothing was saved.' }));
    assert.equal(e.draft.scheduledStart, '13:00'); assert.deepEqual(e.saved, []); assert.ok(!e.status.msg.includes(DROPPED));
});

test('a Save whose address landed before the job was refused says its address was saved, never that nothing was — RUN', async () => {
    const ADDRESS = { id: null, address: '1 Main St', city: 'Austin', state: 'TX', zip: '' };
    const SAVED = 'This job’s time changed since this screen loaded it. Its address was saved; nothing else was.';
    const ed = editorOf(JOB).type({ scheduledStart: '13:00' }).at(ADDRESS);
    const body = await ed.press(server(LATER));
    assert.equal(body.locationId, 'loc9'); assert.equal(ed.sentAddresses.length, 1);
    assert.deepEqual(ed.status, { kind: 'err', msg: SAVED + DROPPED });
    assert.equal(ed.draft.locationId, 'loc9', 'the address kept on the draft: the next Save links it');
    assert.equal(ed.loc.id, 'loc9', 'and the form’s, so it is not made again');
    const next = await ed.press(server(LATER));
    assert.deepEqual(next, { id: 'j1', locationId: 'loc9' });
    assert.deepEqual(ed.status, { kind: 'ok', msg: 'Saved' });
    // The status words too.
    const route = editorOf(JOB).type({ status: 'paused' }).at(ADDRESS);
    await route.press(server({ ...JOB, status: 'en_route' }));
    assert.deepEqual(route.status, { kind: 'err', msg: 'This job is en route now — it changed since you opened it. Its address was saved; nothing else was.' });
    // No address step: nothing was saved. The address refused: the job is never sent.
    const none = editorOf(JOB).type({ scheduledStart: '13:00' }).at({ ...ADDRESS, address: ' ' });
    await none.press(server(LATER));
    assert.deepEqual(none.status, { kind: 'err', msg: TIME + DROPPED });
    const refused = editorOf(JOB).type({ scheduledStart: '13:00' }).at(ADDRESS);
    refused.address = { status: 400, body: { error: 'No such customer.' } };
    assert.equal(await refused.press(server(LATER)), null);
    assert.deepEqual(refused.status, { kind: 'err', msg: 'The address was not saved — No such customer.' });
    // Shown red: the landed address not recorded, and the words not swapped — each says nothing was saved over an address that was.
    for (const src of [without(SAVE, 'addressSaved = true;'), without(SAVE, "(addressSaved ? r.words.replace(/ Nothing was saved\\.$/, ' Its address was saved; nothing else was.') : r.words)", 'r.words')]) {
        const red = editorOf(JOB, src).type({ scheduledStart: '13:00' }).at(ADDRESS);
        await red.press(server(LATER));
        assert.deepEqual(red.status, { kind: 'err', msg: TIME + DROPPED });
    }
});

test('a landed Save whose answer cannot be read keeps what it set — never what it saw — and the next Save names that appointment — RUN', async () => {
    const ed = editorOf(JOB).type({ scheduledStart: '13:00' });
    await ed.press(answerOf(200, new SyntaxError("Unexpected token '<'")));
    assert.deepEqual(ed.status, { kind: 'ok', msg: 'Saved' });
    assert.deepEqual(ed.saved, [{ ...JOB, scheduledStart: '13:00', scheduledEnd: '15:00' }], 'the job with what was sent over it, no fromAppointment on it');
    assert.deepEqual(await ed.type({ scheduledDate: '2026-09-17' }).press(answerOf(200, { job: JOB })),
        { id: 'j1', scheduledDate: '2026-09-17', scheduledStart: '13:00', scheduledEnd: '15:00', timeSlot: 'exact',
            fromAppointment: { scheduledDate: '2026-09-15', scheduledStart: '13:00', scheduledEnd: '15:00', timeSlot: 'exact', durationMinutes: 120 } });
});

test('a landed Save over another member’s appointment still keeps a start typed while it was out: only a refused one shows the stored appointment whole — RUN', async () => {
    const ed = editorOf(JOB).type({ title: 'Boiler (rush)' });
    const sent = await ed.press((body) => { ed.type({ scheduledStart: '13:00' }); return server(LATER)(body); });
    assert.deepEqual(sent, { id: 'j1', title: 'Boiler (rush)' });
    assert.deepEqual(ed.status, { kind: 'ok', msg: 'Saved' });
    assert.equal(ed.draft.scheduledStart, '13:00'); assert.equal(ed.draft.scheduledDate, '2026-09-18');
});

// ── RUN (state §0.290): the address step sends a create again with its id, and takes what an earlier press made. ──
const TYPED = { id: null, address: '1 Main St', city: 'Austin', state: 'TX', zip: '' };
const MAYBE = 'The address may have been saved';   // how an answer that proved nothing is said
const madeOf = (sent) => ({ id: sent.id, customerId: sent.customerId, name: sent.name, address: sent.address, city: sent.city, state: sent.state, zip: sent.zip, gateCode: null });
// The server's locations POST and PUT (dispatch-customers.mjs), one row an id: `lost` answers are 500s over a write that landed.
const locations = (lost = []) => {
    const rows = new Map(); let n = 0;
    const answer = (sent, { method }) => {
        const dead = lost.includes(n++);
        if (method === 'POST' && rows.has(sent.id)) return { status: 409, body: { error: 'That location id is already in use.', code: 'idInUse', location: rows.get(sent.id) } };
        if (method === 'PUT' && !rows.has(sent.id)) return { status: 404, body: { error: 'Not found' } };
        rows.set(sent.id, { ...rows.get(sent.id), ...madeOf(sent) });
        return dead ? { status: 500, body: {} } : { status: method === 'POST' ? 201 : 200, body: { location: rows.get(sent.id) } };
    };
    return Object.assign(answer, { rows });
};

test('an address whose first press proved nothing is sent again with its id, and taken as made — never made twice, never sent over the one made — RUN', async () => {
    const ed = editorOf({ ...JOB, customerId: 'c1' }).at(TYPED);
    ed.address = locations([0]);
    assert.equal(await ed.press(server(JOB)), null, 'the job is not sent after an address that may not be there');
    assert.ok(ed.status.msg.startsWith(MAYBE), ed.status.msg); assert.equal(ed.loc.id, null);
    const id = ed.sentAddresses[0].id;
    const body = await ed.press(server(JOB));
    assert.deepEqual(ed.sentAddresses.map((a) => [a.id, a.method]), [[id, 'POST'], [id, 'POST']], 'REGRESSION: the same create, its id — and nothing written over the address made');
    assert.deepEqual(body, { id: 'j1', locationId: id }, 'the job linked to the address an earlier press made');
    assert.deepEqual(ed.status, { kind: 'ok', msg: 'Saved' }); assert.equal(ed.loc.id, id);
    assert.equal(ed.address.rows.size, 1);
    // Shown red, each line out: the record not read, its refusal is said over an address that stands; the id not kept, a second is made.
    const deaf = editorOf({ ...JOB, customerId: 'c1' }, without(SAVE, "held = loc.id ? null : heldCreate(lres.status, r.body, 'location', locId);")).at(TYPED);
    deaf.address = locations([0]);
    await deaf.press(server(JOB));
    assert.equal(await deaf.press(server(JOB)), null);
    assert.deepEqual(deaf.status, { kind: 'err', msg: 'The address was not saved — That location id is already in use.' });
    const twice = editorOf({ ...JOB, customerId: 'c1' }, without(SAVE, "(newLocIds.current[draft.id] = 'dloc_' + crypto.randomUUID())", "'dloc_' + crypto.randomUUID()")).at(TYPED);
    twice.address = locations([0]);
    await twice.press(server(JOB)); await twice.press(server(JOB));
    assert.equal(twice.address.rows.size, 2);
});

test('an address typed otherwise since the press that made it is saved onto the one made, before the job — and its refusal is said, its id kept — RUN', async () => {
    const ed = editorOf({ ...JOB, customerId: 'c1' }).at(TYPED);
    ed.address = locations([0]);
    await ed.press(server(JOB));
    const id = ed.sentAddresses[0].id;
    ed.at({ ...ed.loc, address: ' 2 Main St ', zip: '78701' });
    const body = await ed.press(server(JOB));
    assert.deepEqual(ed.sentAddresses.slice(1).map((a) => [a.id, a.method, a.address, a.zip]), [[id, 'POST', '2 Main St', '78701'], [id, 'PUT', '2 Main St', '78701']]);
    assert.ok(ed.sentAddresses[2].url.endsWith(`&id=${id}`), 'the PUT names the address made');
    assert.deepEqual(body, { id: 'j1', locationId: id }); assert.equal(ed.address.rows.get(id).address, '2 Main St');
    assert.deepEqual(ed.status, { kind: 'ok', msg: 'Saved' });
    // Each field alone counts; a blank state and none are one value.
    for (const [k, v] of [['address', '3 Main St'], ['city', 'Waco'], ['state', ''], ['zip', '78702']]) {
        const one = editorOf({ ...JOB, customerId: 'c1' }).at(TYPED);
        one.address = locations([0]);
        await one.press(server(JOB)); one.at({ ...TYPED, [k]: v }); await one.press(server(JOB));
        assert.deepEqual(one.sentAddresses.map((a) => a.method), ['POST', 'POST', 'PUT'], k);
    }
    // Its PUT refused, or proving nothing: said, the job not sent, and the next press sends the same id again.
    for (const [status, why, said] of [[400, { error: 'No such city.' }, 'The address was not saved — No such city.'], [500, {}, MAYBE]]) {
        const no = editorOf({ ...JOB, customerId: 'c1' }).at(TYPED), real = locations([0]);
        no.address = real;
        await no.press(server(JOB));
        no.address = (sent, o) => (o.method === 'PUT' ? { status, body: why } : real(sent, o));
        no.at({ ...TYPED, address: '2 Main St' });
        assert.equal(await no.press(server(JOB)), null);
        assert.ok(no.status.kind === 'err' && no.status.msg.startsWith(said), no.status.msg); assert.equal(no.loc.id, null);
        no.address = real;
        assert.deepEqual(await no.press(server(JOB)), { id: 'j1', locationId: no.sentAddresses[0].id });
        assert.equal(real.rows.size, 1);
    }
    // Shown red: the compare out, the address the member corrected is left as first typed, "Saved" said over it.
    const red = editorOf({ ...JOB, customerId: 'c1' }, without(SAVE, "['address', 'city', 'state', 'zip'].some(k => (loc[k] || '').trim() !== (held[k] || ''))", 'false')).at(TYPED);
    red.address = locations([0]);
    await red.press(server(JOB)); red.at({ ...TYPED, address: '2 Main St' }); await red.press(server(JOB));
    assert.deepEqual([red.status.msg, [...red.address.rows.values()][0].address], ['Saved', '1 Main St']);
    const unsaid = editorOf({ ...JOB, customerId: 'c1' }, without(SAVE, ' held = null; }\n', ' }\n')).at(TYPED), real = locations([0]);
    unsaid.address = real;
    await unsaid.press(server(JOB));
    unsaid.address = (sent, o) => (o.method === 'PUT' ? { status: 400, body: { error: 'No such city.' } } : real(sent, o));
    unsaid.at({ ...TYPED, address: '2 Main St' }); await unsaid.press(server(JOB));
    assert.equal(unsaid.status.msg, 'Saved', 'shown red: a refused correction said saved');
});

test("an address's id is given up on the server's own refusal of its first press alone; one that may have landed keeps its id; another record's answer proves nothing — RUN", async () => {
    const press = async (answers, src = SAVE) => {
        const ed = editorOf({ ...JOB, customerId: 'c1' }, src).at(TYPED);
        for (const [status, body] of answers) { ed.address = (sent) => ({ status, body: typeof body === 'function' ? body(sent) : body }); await ed.press(server(JOB)); }
        return { ids: ed.sentAddresses.map((a) => a.id), said: ed.status.msg, loc: ed.loc };
    };
    const OK = [201, (sent) => ({ location: { id: sent.id } })], LOST = [500, {}], NO = [400, { error: 'No such customer.' }];
    const first = await press([NO, OK]);
    assert.equal(new Set(first.ids).size, 2, 'refused at once: nothing was made, its id given up');
    const later = await press([LOST, NO, OK]);
    assert.equal(new Set(later.ids).size, 1, 'REGRESSION: a refusal after a press that may have landed gave its id up — a second address');
    assert.equal(new Set((await press([LOST, NO, OK], without(SAVE, 'if (r.heard && !mayBe) {', 'if (r.heard) {'))).ids).size, 2, 'shown red');
    assert.equal(new Set((await press([LOST, NO, OK], without(SAVE, 'if (!loc.id) maybeLocIds.current.add(locId);'))).ids).size, 2, 'shown red: never marked as maybe made');
    // Refused first and its id forgotten with it: the next press's own id is its own.
    assert.equal(new Set((await press([NO, LOST, OK])).ids).size, 2);
    // Another org's id (no code), and a record of another id: refused in words, never taken as made.
    for (const body of [{ error: 'That location id is already in use.' }, { error: 'That location id is already in use.', code: 'idInUse', location: { id: 'dloc_other' } }]) {
        const other = await press([LOST, [409, body]]);
        assert.equal(other.said, 'The address was not saved — That location id is already in use.'); assert.equal(other.loc.id, null);
    }
    // An address the form already holds is a PUT, whose refusal is never read as a create that landed.
    const held = editorOf({ ...JOB, customerId: 'c1', locationId: 'loc5' }).at({ ...TYPED, id: 'loc5' });
    held.address = () => ({ status: 409, body: { error: 'In use.', code: 'idInUse', location: { id: 'loc5' } } });
    assert.equal(await held.press(server(JOB)), null);
    assert.deepEqual(held.sentAddresses.map((a) => [a.id, a.method]), [['loc5', 'PUT']]);
    assert.equal(held.status.msg, 'The address was not saved — In use.');
});

test("another job picked while the address is out: the Save's job is sent as it was opened, and the other job's form never takes this address — RUN", async () => {
    const OTHER = { ...JOB, id: 'j2', title: 'Chiller', status: 'on_site' }, SHOWN = { id: null, address: '', city: '', state: '', zip: '' };
    const run = async (src, held = false) => {
        const ed = editorOf({ ...JOB, customerId: 'c1' }, src).at(TYPED), real = locations(held ? [0] : []);
        ed.type({ title: 'Boiler (rush)' });
        ed.address = real;
        if (held) await ed.press(server(JOB));
        ed.address = (sent, o) => { ed.opened.current = { ...OTHER }; ed.draft = { ...OTHER }; ed.loc = { ...SHOWN }; return real(sent, o); };
        const body = await ed.press(server(JOB));
        return { body, loc: ed.loc, id: ed.sentAddresses[0].id, draft: ed.draft, opened: ed.opened.current };
    };
    for (const held of [false, true]) {
        const r = await run(SAVE, held);
        assert.deepEqual(r.body, { id: 'j1', title: 'Boiler (rush)', locationId: r.id }, "REGRESSION: the job's changes read against the other job");
        assert.deepEqual(r.loc, SHOWN, "REGRESSION: the other job's form holds this job's address — its next Save would be saved over it");
        assert.deepEqual([r.draft, r.opened], [OTHER, OTHER]);
    }
    // Shown red: the base read after the address step (every field the two differ in sent over this job); the address set whatever is shown.
    const BASE = "        const base = opened.current || draft;";
    assert.ok(SAVE.includes(BASE) && SAVE.indexOf(BASE) < SAVE.indexOf('let lres = await sendAddress('), 'the job as opened, read before the address step');
    const late = without(without(SAVE, BASE), '            const body = jobChanges(editorFields(base', `    ${BASE}\n            const body = jobChanges(editorFields(base`);
    assert.equal((await run(late)).body.fromStatus, 'on_site');
    assert.notEqual((await run(without(SAVE, ' && opened.current?.id === draft.id) { delete', ') { delete'))).loc.id, null);
});
