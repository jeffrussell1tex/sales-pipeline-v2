// tests/dispatch-stubs.test.mjs
//
// Two dispatch buttons rendered and did nothing (state §9 "Unwired stubs", closed
// in §0.109): "Manual pick" in the crew builder and "Test auto-create" in the
// job-templates panel. A control that reads as an action and silently is not one
// is the "renders and does nothing" class the scanners cannot see; both are gone,
// and the copy that pointed at Manual pick with it. These scans keep them gone
// until the feature behind either is actually built.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const code = (src) => src.split(/\r?\n/).filter(l => !l.trim().startsWith('//')).join('\n');

test('DispatchTab: no inert "Manual pick" button, and no copy telling the user to click it', () => {
    const s = code(read('src/Tabs/DispatchTab.jsx'));
    assert.ok(!s.includes('Manual pick'), 'DispatchTab still carries "Manual pick"');
    assert.ok(s.includes('distance from job, and customer preference.'), 'the scoring explanation stays');
    // §9 "Priority vocabulary normalization" asked for the dual-accept alias to
    // be collapsed in its own commit once the vocabulary was one; it is.
    assert.ok(!s.includes('prioColor2'), 'the prioColor2 alias is collapsed — one priority colour map');
});

test('DispatchTab: a filled crew slot says it is not saved, and a saved schedule says so too (§0.114)', () => {
    // Jeff assigned Savannah in the Queue and found the job still "Needs a crew"
    // on the Job Board: the row had never been written. "+ Add" turns green and
    // reads "1 of 1 crew slots filled" — done, to a reader — while only "Schedule
    // crew" persists; and a successful schedule clears the selection with no word.
    const s = code(read('src/Tabs/DispatchTab.jsx'));
    assert.ok(s.includes("{addedCount} of {crewSlots} crew slots filled{addedCount > 0 ? (isHeld ? ' — held for group schedule' : ' — not saved yet: Schedule now or Wait for group schedule above') : ''}"),
        'the slots header names the unsaved state, or the held one');
    assert.ok(s.includes("showNotice(`Scheduled — ${crewNames.join(', ')} on ${dateStr} at ${to12h(scheduleTime) || scheduleTime}. It is on the Job Board now.`);"),
        'a successful write is announced');
    assert.ok(s.includes('{scheduleNotice && !scheduleError && (\n                                <div role="status"'), 'as a status banner, never over a refusal');
    assert.ok(s.includes("noticeTimer.current = setTimeout(() => setScheduleNotice(''), 10000);"), 'timed, since the selection moves on success');
    assert.ok(s.includes("import { to12h } from '../utils/customerNotifications.js';"));
});

test('DispatchTab: a refused crew schedule is a banner above the action bar, not a line among the controls', () => {
    // Jeff's first schedule was refused pre-flight ("Set a start time before
    // scheduling.") in an 11.5px span, and he read the board as broken (§0.111).
    const s = code(read('src/Tabs/DispatchTab.jsx'));
    assert.ok(s.includes('                                    Not scheduled — {scheduleError}'), 'the refusal names itself as a refusal');
    assert.ok(s.includes('{scheduleError && (\n                                <div role="alert"'), 'a banner, announced — at the top of the crew section, beside the next-step card (§0.115)');
    assert.ok(!s.includes("<span style={{ fontSize: 11.5, color: T.danger, fontWeight: 600, fontFamily: T.sans }}>{scheduleError}</span>"), 'the inline span is gone');
});

test('DispatchTab: the queue\'s cards and header click through to the job record (Jeff: "these are static right now")', () => {
    const s = code(read('src/Tabs/DispatchTab.jsx'));
    assert.ok(s.includes("const openJobRecord = (id) => { setOpenJobRequest({ id, at: Date.now() }); setView('jobs'); };"), 'one handler: remember the job, switch to Jobs');
    assert.ok(s.includes('onOpenJob={openJobRecord}'), 'the crew builder receives it');
    assert.ok(s.includes('openJobRequest={openJobRequest}'), 'the Jobs view receives the request');
    assert.ok(s.includes('        setSelectedId(openJobRequest.id);'), 'and selects that job');
    assert.ok(s.includes("<span onClick={e => { e.stopPropagation(); onOpenJob(j.id); }} title=\"Open the job record\""), 'each card has an Open link that does not also re-select');
    assert.ok(s.includes('Open job record →'), 'the header has the button');
});

test('DispatchJobTemplatesDetail: no inert "Test auto-create" button', () => {
    const s = code(read('src/Tabs/settings/dispatch/DispatchJobTemplatesDetail.jsx'));
    assert.ok(!s.includes('Test auto-create'), 'DispatchJobTemplatesDetail still carries "Test auto-create"');
    assert.ok(s.includes('extraActions={'), 'the New template action is still offered');
});
