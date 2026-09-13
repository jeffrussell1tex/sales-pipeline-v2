// tests/auth-gated-loads.test.mjs
//
// Every load that fires on mount keys on an active org (state §0.125).
//
// Origin (§9, the §0.109 pane pass, 9 Sep 2026): coaching-notes, calendar-events
// and spiff-claims were each seen GETting once before the Clerk token (401) and
// once after (200). Read against the code: the three fired from mount on
// waitForToken() alone, and waitForToken gives up after 8 seconds and resolves
// ANYWAY — so whenever no org was active for that long (the in-app sign-in
// with its MFA step; the no-organization page) all three went out with no
// Authorization header, 401'd, and never retried; the 200s in the log were the
// next page load. The main load never had the problem: it waits for a
// signed-in user AND an active org. And none of the three reloaded when the
// header's OrganizationSwitcher changed the org — the previous org's spiff
// claims, coaching notes and calendar stayed on screen.
//
// Now App.jsx derives one `activeOrgId`, and the three loads key on it:
// nothing before it is set, again whenever it changes, the previous org's rows
// cleared first. waitForToken's give-up is loud.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const count = (hay, needle) => hay.split(needle).length - 1;

// ── the gate ─────────────────────────────────────────────────────────────────

test('App.jsx derives one activeOrgId from a signed-in user and an active org', () => {
    const app = read('src/App.jsx');
    assert.equal(count(app, "const activeOrgId = (clerkUser && organization?.id) || null;"), 1);
    assert.ok(app.indexOf('const clerkUser = isSignedIn ? rawClerkUser : null;') < app.indexOf('const activeOrgId ='), 'the user it reads is the ACTIVE-session user (0.65), declared first');
});

test('spiff claims: no load before an org is active; reloaded per org, the previous org\'s rows cleared first', () => {
    const app = read('src/App.jsx');
    const start = app.indexOf('// Spiff claims: once signed in with an active org');
    assert.ok(start > 0, 'the effect is labelled');
    const block = app.slice(start, app.indexOf('}, [activeOrgId]);', start) + '}, [activeOrgId]);'.length);
    assert.ok(block.includes("if (!activeOrgId) return;                 // spiff claims: signed in with an org, or nothing"), 'the gate');
    assert.ok(block.includes('setSpiffClaims(prev => (prev.length ? [] : prev));'), 'a switch clears the last org\'s claims before the new load');
    assert.ok(block.indexOf('setSpiffClaims(prev =>') < block.indexOf('if (!activeOrgId) return;'), 'cleared before the gate, so a sign-out empties them too');
    assert.ok(block.includes("dbFetch('/.netlify/functions/spiff-claims')"), 'the same endpoint');
    assert.ok(block.includes('.then(r => (r.ok ? r.json() : null))'), 'a refused response is not parsed as claims');
    assert.ok(block.includes('return () => { cancelled = true; };'), 'a load in flight when the org changes is dropped');
    assert.ok(block.trimEnd().endsWith('}, [activeOrgId]);'), 'keyed on the org, not on mount');
    assert.doesNotMatch(app, /spiff-claims'\)\s*\n\s*\.then\(r => r\.json\(\)\)/, 'the mount-only load is gone');
});

test('coaching notes: the hook is told the org and loads for it, nothing before, reset on a switch', () => {
    const app = read('src/App.jsx');
    assert.equal(count(app, 'useCoachingNotes({ waitForToken, orgId: activeOrgId })'), 1, 'App hands the hook the org');
    assert.equal(count(app, 'useCoachingNotes({ waitForToken })'), 0, 'the mount-only call is gone');
    const hook = read('src/hooks/useCoachingNotes.js');
    assert.ok(hook.includes('export function useCoachingNotes({ waitForToken, orgId = null, enabled = true } = {})'), 'orgId is a parameter, null by default');
    assert.ok(hook.includes('        if (!enabled || !orgId) return;'), 'no org, no load');
    assert.ok(hook.includes('setCoachingNotes(prev => (prev.length ? [] : prev));'), 'the previous org\'s notes are cleared');
    assert.ok(hook.indexOf('setCoachingNotes(prev =>') < hook.indexOf('if (!enabled || !orgId) return;'), 'cleared before the gate');
    assert.ok(hook.includes('    }, [enabled, orgId, waitForToken, reload]);'), 'the effect re-runs per org');
    assert.equal(count(hook, '    }, [enabled, waitForToken, reload]);'), 0, 'the mount-only deps are gone');
});

test('calendar: the home-tab auto-fetch waits for an org and fetches again for a new one', () => {
    const app = read('src/App.jsx');
    const start = app.indexOf('const calendarOrgRef = useRef(null);');
    assert.ok(start > 0, 'the org the strip was fetched for is remembered');
    const block = app.slice(start, app.indexOf('}, [activeTab, activeOrgId]);', start) + '}, [activeTab, activeOrgId]);'.length);
    assert.ok(block.includes('        if (!activeOrgId) return;'), 'nothing before an org is active');
    assert.ok(block.includes('if (calendarOrgRef.current !== activeOrgId) {'), 'a switch is detected');
    assert.ok(block.includes('calendarFetchAttempted.current = false;'), 'and re-arms the once-per-session fetch');
    assert.ok(block.includes('setCalendarEvents([]);'), 'the last org\'s meetings are cleared on a switch (§0.126)');
    assert.ok(block.includes("if (activeTab === 'home' && !calendarFetchAttempted.current && !calendarLoading) {"), 'the original once-per-session guard stays');
    assert.equal(count(app, '}, [activeTab, activeOrgId]);'), 1, 'keyed on the tab AND the org');
    assert.equal(count(app, '    }, [activeTab]);'), 0, 'the tab-only deps are gone');
});

test('the main load is gated the same way (it never had the race) and the getter is set before any load runs', () => {
    const app = read('src/App.jsx');
    assert.ok(app.includes("if (!clerkUser || !organization?.id) return; // Don't load until authenticated + org active"), 'the main load\'s gate');
    assert.ok(app.indexOf('window.__getClerkToken = () => getToken({ organizationId: organization.id });') < app.indexOf('const activeOrgId ='), 'the token getter\'s effect is declared before every gated load, so it runs first in the same commit');
});

// ── waitForToken ─────────────────────────────────────────────────────────────

test('waitForToken resolves at once with a getter, later when one appears, and says so out loud when it gives up', async () => {
    globalThis.window = { __getClerkToken: () => Promise.resolve('t') };
    const { waitForToken } = await import('../src/utils/storage.js');
    let t0 = Date.now();
    await waitForToken();
    assert.ok(Date.now() - t0 < 80, 'a getter already set: no polling');

    globalThis.window.__getClerkToken = null;
    setTimeout(() => { globalThis.window.__getClerkToken = () => Promise.resolve('t'); }, 150);
    t0 = Date.now();
    await waitForToken();
    const took = Date.now() - t0;
    assert.ok(took >= 100 && took < 1500, `resolved once the getter appeared (${took} ms)`);

    const src = read('src/utils/storage.js');
    const giveUp = src.slice(src.indexOf('} else if (attempts > 80) {'), src.indexOf('resolve();', src.indexOf('} else if (attempts > 80) {')) + 'resolve();'.length);
    assert.ok(giveUp.includes("console.warn('waitForToken: no Clerk token after 8 s — the request will go out unauthenticated (401)');"), 'the give-up is loud');
    assert.ok(giveUp.indexOf('console.warn(') < giveUp.indexOf('resolve();'), 'warned before it resolves');
    assert.equal(count(src, 'resolve anyway'), 0, 'the old silent comment is gone');
});
