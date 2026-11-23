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
// (null when none was); the address step's own answer is `address`.
const editorOf = (job, src = SAVE, lib = JC) => {
    const ed = { opened: { current: { ...job } }, draft: { ...job }, selected: job, saved: [], status: null, loc: null, sentAddresses: [],
        address: { status: 200, body: { location: { id: 'loc9' } } } };
    ed.type = (typed) => { ed.draft = { ...ed.draft, ...typed }; return ed; };
    ed.at = (loc) => { ed.loc = loc; return ed; };
    ed.press = async (answer) => {
        let body = null;
        const names = ['draft', 'loc', 'setStatus', 'setSaving', 'requestOrg', 'stillOrg', 'dbFetch', 'newLocIds', 'setLoc', 'opened', 'selected', 'jobChanges',
            'editorFields', 'jobAnswerOf', 'sentOf', 'rebaseDraft', 'appointmentDropped', 'writeRefusalOf', 'refusalError', 'saidError', 'maybeSaid', 'thrownSaid', 'onSaved', 'setDraft', 'setSelectedId'];
        const save = new Function(...names, `${src}\nreturn save;`)(ed.draft, ed.loc, (v) => { ed.status = v; }, () => {}, () => 'org_a', () => true,
            async (url, o) => {
                if (url.includes('resource=locations')) { ed.sentAddresses.push(JSON.parse(o.body)); return answerOf(ed.address.status, ed.address.body); }
                body = JSON.parse(o.body); return typeof answer === 'function' ? answer(body) : answer;
            }, { current: {} }, (f) => { ed.loc = f(ed.loc); }, ed.opened, ed.selected,
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
