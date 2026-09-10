// tests/crew-next-step.test.mjs
//
// The next step after choosing a crew (state §0.115). Jeff: "the schedule crew
// buttons are so low I can't see them on a 40" ultrawide monitor … once I assign
// a rep/crew then it needs to automatically prompt me to schedule job or ask
// schedule now or wait for group schedule." Two faults, two fixes: the Dispatch
// page is bound to the viewport so no view's action bar can fall below the fold;
// and the moment a crew slot is filled a card at the TOP of the crew panel asks
// what next — Schedule now (date + start right there), Wait for group schedule
// (the crew is persisted on the job with no time; Mass-schedule next week places
// exactly those people), or Clear. Source scans (§18b23) — the builder is one
// component inside DispatchTab.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const code = (src) => src.split(/\r?\n/).filter(l => !l.trim().startsWith('//')).join('\n');
const s = code(read('src/Tabs/DispatchTab.jsx'));

test('the next-step card is a module-scope component, rendered the moment a slot is filled, at the top of the crew section', () => {
    assert.ok(s.includes('const CrewNextStep = ({ crewNames, addedCount, crewSlots, held, dateStr, onDate, time, onTime, onScheduleNow, onHold, onClear, saving }) => {'),
        'module scope, data as props');
    const card = s.indexOf('{addedCount > 0 && (\n                                <CrewNextStep');
    const header = s.indexOf('Suggested crew — ranked by match</span>');
    assert.ok(card > 0 && header > card, 'the card renders above the suggestions header, not below the fold');
    assert.ok(s.includes("{saving ? 'Saving…' : 'Schedule now'}"));
    assert.ok(s.includes('Wait for group schedule\n                    </button>'));
    assert.ok(s.includes("{held ? 'Release crew' : 'Clear crew'}"));
    assert.ok(s.includes('<TimeDropdown value={time} onChange={onTime} stepMinutes={30} ariaLabel="Next step start time"/>'), 'date and start live in the card');
    assert.ok(s.includes('onScheduleNow={handleSchedule} onHold={handleHoldCrew} onClear={handleClearCrew}'));
});

test('the refusal and success banners sit beside the card, not at the bottom', () => {
    const alert = s.indexOf('<div role="alert"');
    const card = s.indexOf('<CrewNextStep');
    const bar = s.indexOf('{/* Action bar.');
    assert.ok(alert > 0 && alert < card && card < bar, 'alert → card → action bar, in that order');
    assert.equal(s.match(/<div role="alert"/g).length, 1, 'one refusal banner');
    assert.equal(s.match(/<div role="status"/g).length, 1, 'one success banner');
});

test('Wait for group schedule persists the crew with NO time and the status unchanged; Release clears it', () => {
    assert.ok(s.includes("body: JSON.stringify({ id: selectedJob.id, status: 'unscheduled', assignedTechId: leadId, coTechIds: coIds }),"),
        'no scheduledStart, no scheduledEnd, status stays unscheduled — so no customer confirmation goes out');
    assert.ok(s.includes('const handleHoldCrew = () => writeHeldCrew(Object.entries(addedTechs).filter(([, v]) => v).map(([k]) => k));'));
    assert.ok(s.includes('const handleClearCrew = () => { if (isHeld) writeHeldCrew([]); else setAddedTechs({}); };'), 'clearing a held crew releases it on the server');
    assert.ok(s.includes('const isHeld = heldIds.length > 0 && addedIdsNow.length === heldIds.length && addedIdsNow.every(id => heldIds.includes(id));'));
    assert.ok(s.includes("const held = sel && sel.start == null ? (sel.assignedTechIds || []) : [];\n        setAddedTechs(Object.fromEntries(held.map(id => [id, true])));"),
        'selecting a job brings its held crew back as the added crew');
    assert.ok(s.includes("setJobs(prev => prev.map(j => j.id === jobId ? { ...j, assignedTechIds: techIds, start: null, status: 'unscheduled', window: 'TBD', assignedEquipment: [] } : j));"),
        'the parent records the crew with NO placed start — holding a crew on a job that had a time takes the time off the client copy too');
    // An unscheduled job's scheduledStart is its PREFERRED time (§0.112); it must
    // not read as a placement, or a held crew shows as booked at that hour.
    assert.ok(s.includes("if (j.scheduledStart && j.status !== 'unscheduled') {"), 'the board mapping places only a scheduled job');
    assert.ok(s.includes("start: saved.scheduledStart && saved.status !== 'unscheduled' ? hhToNum(saved.scheduledStart) : null,"), 'the editor save mapping too');
    assert.ok(s.includes("addAudit(techIds.length ? 'dispatch.crew.hold' : 'dispatch.crew.release', 'dispatch_job', jobId, jobName,"));
});

test('Mass-schedule next week honours a held crew — those people, exactly, or a named skip', () => {
    assert.ok(s.includes('const candidatesForDay = (job, dateStr, only = null) => {'));
    assert.ok(s.includes('            .filter(t => !only || only.has(t.id))   // a held crew: these people, exactly (§0.115)'));
    assert.ok(s.includes('const crewForDay = (job, dateStr, need, only = null) => {\n        const cands = candidatesForDay(job, dateStr, only);'));
    assert.ok(s.includes('const heldIds = (job.assignedTechIds || []).filter(id => techs.some(t => t.id === id));\n        const only = heldIds.length ? new Set(heldIds) : null;\n        const want = only ? heldIds.length : need;'));
    assert.ok(s.includes('const r = crewForDay(job, dateStr, want, only);'));
    assert.ok(s.includes("reason = `Held crew (${heldIds.map(id => techs.find(t => t.id === id)?.name || id).join(', ')}) not free together in this window`;"));
});

test('the Dispatch page is bound to the viewport below the fixed header, so no action bar falls below the fold', () => {
    assert.ok(s.includes('import React, { useState, useMemo, useRef, useEffect, useLayoutEffect, useCallback } from \'react\';'));
    assert.ok(s.includes('setPageTop(Math.max(0, Math.round(pageRef.current.getBoundingClientRect().top + window.scrollY)));'), 'measured from the page div, the ContactsTab pattern');
    assert.ok(s.includes("        if (pageTop != null || !pageRef.current) return;\n        setPageTop("), 'measured on every render until it exists — the loading state renders first, without the div');
    assert.ok(!s.includes("getBoundingClientRect().top + window.scrollY)));\n    }, []);"), 'not mount-only');
    assert.ok(s.includes("height: pageTop != null ? `calc(100vh - ${pageTop}px)` : '100%', boxSizing: 'border-box', overflow: 'hidden' }}>"));
    assert.ok(s.includes('<div ref={pageRef} className="tab-page"'));
});
