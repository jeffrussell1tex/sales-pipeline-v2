// tests/calendar-return.test.mjs
//
// State §0.97, handoff item 30. A calendar Connect is a browser redirect out to
// the provider and back through calendar-oauth-callback. Until §0.97 the
// callback sent the browser to `/?tab=settings&subtab=calendar&calconnect=…`,
// which nothing read: a failed Connect landed on Home with no message. Now the
// start carries `from` (where Connect was clicked) through the provider in
// `state`; the callback redirects with status, provider, scope, from and a
// reason — every value from an allowlist; App.jsx reads it once, cleans the
// URL and lands the user on that surface, which shows one line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    CALENDAR_RETURN_FROM, CALENDAR_RETURN_REASONS, cleanCalendarReturnFrom,
    calendarReturnUrl, readCalendarReturn, calendarReturnMessage,
} from '../src/utils/calendarReturn.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const code = (src) => src.split(/\r?\n/).filter(l => !l.trim().startsWith('//')).join('\n');

// ── the pure module ──────────────────────────────────────────────────────────

test('from is allowlisted: the four surfaces, anything else is home', () => {
    assert.deepEqual([...CALENDAR_RETURN_FROM], ['apps', 'profile', 'home', 'company']);
    for (const f of CALENDAR_RETURN_FROM) assert.equal(cleanCalendarReturnFrom(f), f);
    for (const junk of ['settings', '', null, undefined, 42, 'APPS', '<script>']) assert.equal(cleanCalendarReturnFrom(junk), 'home', String(junk));
});

test('calendarReturnUrl carries only allowlisted values, a reason on error only, and strips a trailing slash', () => {
    const ok = new URL(calendarReturnUrl('https://x.test/', { status: 'success', provider: 'google', scope: 'org', from: 'apps' }));
    assert.equal(ok.origin + ok.pathname, 'https://x.test/');
    assert.deepEqual(Object.fromEntries(ok.searchParams), { calconnect: 'success', provider: 'google', scope: 'org', from: 'apps' }, 'no reason on success');
    const err = new URL(calendarReturnUrl('https://x.test', { status: 'error', provider: 'outlook', scope: 'user', from: 'profile', reason: 'not_admin' }));
    assert.deepEqual(Object.fromEntries(err.searchParams), { calconnect: 'error', provider: 'outlook', scope: 'user', from: 'profile', reason: 'not_admin' });
    const tampered = new URL(calendarReturnUrl('https://x.test', { status: 'weird', provider: 'evil', scope: 'root', from: 'settings', reason: '<script>' }));
    assert.deepEqual(Object.fromEntries(tampered.searchParams), { calconnect: 'error', from: 'home', reason: 'server_error' }, 'REGRESSION: free text in the redirect');
    assert.deepEqual(Object.fromEntries(new URL(calendarReturnUrl('https://x.test')).searchParams), { calconnect: 'error', from: 'home', reason: 'server_error' }, 'nothing known is still a valid landing');
});

test('readCalendarReturn: null without calconnect, safe values under tampering, no reason on success', () => {
    assert.equal(readCalendarReturn(''), null);
    assert.equal(readCalendarReturn('?foo=1'), null);
    assert.equal(readCalendarReturn('?calconnect=maybe'), null, 'an unknown status is no landing at all');
    assert.equal(readCalendarReturn(undefined), null);
    assert.deepEqual(readCalendarReturn('?calconnect=success&provider=google&scope=user&from=home&reason=not_admin'),
        { status: 'success', provider: 'google', scope: 'user', from: 'home', reason: null });
    assert.deepEqual(readCalendarReturn('?calconnect=error&provider=nope&scope=all&from=elsewhere&reason=made_up'),
        { status: 'error', provider: null, scope: null, from: 'home', reason: 'server_error' });
    assert.deepEqual(readCalendarReturn('?calconnect=error&provider=outlook&scope=org&from=company&reason=no_refresh_token'),
        { status: 'error', provider: 'outlook', scope: 'org', from: 'company', reason: 'no_refresh_token' });
    // Round trip: what the callback writes, the app reads back unchanged.
    const u = new URL(calendarReturnUrl('https://x.test', { status: 'error', provider: 'google', scope: 'org', from: 'apps', reason: 'provider_denied' }));
    assert.deepEqual(readCalendarReturn(u.search), { status: 'error', provider: 'google', scope: 'org', from: 'apps', reason: 'provider_denied' });
});

test('calendarReturnMessage names the provider and the reason, in one sentence', () => {
    assert.equal(calendarReturnMessage({ status: 'success', provider: 'google', scope: 'user' }), 'Google Calendar connected — your calendar is live.');
    assert.equal(calendarReturnMessage({ status: 'success', provider: 'outlook', scope: 'org' }), 'Microsoft 365 Calendar connected — your company calendar is live.');
    assert.equal(calendarReturnMessage({ status: 'error', provider: 'google', reason: 'provider_denied' }), 'Google Calendar was not connected — ' + CALENDAR_RETURN_REASONS.provider_denied);
    assert.equal(calendarReturnMessage({ status: 'error', provider: null, reason: 'bogus' }), 'The calendar was not connected — ' + CALENDAR_RETURN_REASONS.server_error, 'unknown provider and reason still read');
    assert.equal(calendarReturnMessage(null), '');
    assert.equal(calendarReturnMessage({ status: 'pending' }), '');
    for (const r of Object.keys(CALENDAR_RETURN_REASONS)) assert.ok(CALENDAR_RETURN_REASONS[r].endsWith('.'), r + ' is a sentence');
});

// ── source scans: the round trip is wired end to end ─────────────────────────

test('calendar-oauth-start carries an allowlisted `from` through the provider in state', () => {
    const s = code(read('netlify/functions/calendar-oauth-start.mjs'));
    assert.ok(s.includes("import { cleanCalendarReturnFrom } from '../../src/utils/calendarReturn.js';"));
    assert.ok(s.includes('    const from = cleanCalendarReturnFrom(fromRaw);'));
    assert.ok(s.includes("const state = Buffer.from(JSON.stringify({ userId, orgId, provider, scope, userRole, from })).toString('base64');"), 'from rides in state');
});

test('calendar-oauth-callback redirects through calendarReturnUrl at every exit, each with its reason', () => {
    const s = code(read('netlify/functions/calendar-oauth-callback.mjs'));
    assert.ok(s.includes("import { calendarReturnUrl } from '../../src/utils/calendarReturn.js';"));
    assert.ok(!s.includes('SUCCESS_REDIRECT') && !s.includes('ERROR_REDIRECT'), 'the unread literals are gone');
    assert.ok(!s.includes('subtab=calendar'), 'nothing reads subtab; nothing sends it');
    assert.ok(s.includes('headers: { Location: calendarReturnUrl(APP_URL, { status, provider: stateData?.provider, scope: stateData?.scope, from: stateData?.from, reason }) },'));
    assert.ok(s.indexOf('let stateData = null;') < s.indexOf('if (error) {'), 'state is parsed BEFORE the provider-error branch, so even a refusal names the provider');
    for (const reason of ['provider_denied', 'missing_code', 'bad_state', 'not_admin', 'no_refresh_token', 'server_error']) {
        assert.ok(s.includes(`back('error', '${reason}')`), reason);
        assert.ok(Object.hasOwn(CALENDAR_RETURN_REASONS, reason), reason + ' has a sentence');
    }
    assert.equal((s.match(/back\('success'\)/g) || []).length, 1, 'one success exit');
    assert.ok(!s.includes("statusCode: 302, headers: { Location: `${"), 'no hand-built redirect left');
});

test('App.jsx reads the return once the role is known, cleans the URL, and lands on the surface that offered Connect', () => {
    const s = code(read('src/App.jsx'));
    assert.ok(s.includes("import { readCalendarReturn } from './utils/calendarReturn.js';"));
    assert.ok(s.includes('        const r = readCalendarReturn(window.location.search);'));
    assert.ok(s.includes("        window.history.replaceState(null, '', window.location.pathname);"), 'a refresh must not replay the landing');
    assert.ok(s.includes("        const adminHere = (clerkUser.publicMetadata?.role || 'User') === 'Admin';"), 'the role is read from Clerk, not the one-render-behind state');
    assert.ok(s.includes("            setSettingsOpenPanel(r.from === 'apps' ? 'apps' : 'company-calendar');"));
    assert.ok(s.includes("            setActiveTab('settings');"));
    assert.ok(s.includes('            setShowProfilePanel(true);'), 'a User lands in the profile panel');
    assert.ok(s.includes('        setCalConnectResult(r);'));
    assert.ok(s.includes('calConnectResult, setCalConnectResult, settingsOpenPanel, setSettingsOpenPanel,'), 'both pairs are in the app context value');
    const hook = code(read('src/hooks/useModalState.js'));
    assert.ok(hook.includes('const [settingsOpenPanel, setSettingsOpenPanel] = useState(null);') && hook.includes('settingsOpenPanel, setSettingsOpenPanel,'), 'the wiring file (CLAUDE.md: useModalState → App.jsx → appContextValue)');
});

test('Settings opens the requested panel once and clears the request', () => {
    const tab = code(read('src/Tabs/SettingsTab.jsx'));
    assert.ok(tab.includes('openPanelId={settingsOpenPanel} onOpenedPanel={() => setSettingsOpenPanel(null)}'));
    const av = code(read('src/Tabs/AdminView.jsx'));
    assert.ok(av.includes('openPanelId = null, onOpenedPanel }) => {'));
    assert.ok(av.includes('        const it = SETTINGS_ITEMS.find(i => i.id === openPanelId);'));
    assert.ok(av.includes('        if (it) setActiveItem(it);'));
    assert.ok(av.includes('        if (onOpenedPanel) onOpenedPanel();'), 'cleared so it runs once');
    const cat = read('src/Tabs/settings/catalogue.js');
    assert.ok(cat.includes("id:'apps'") && cat.includes("id:'company-calendar'"), 'the two ids App.jsx asks for exist');
});

test('every Connect names where it started, and every surface shows the outcome', () => {
    const ca = code(read('src/Tabs/settings/integrations/ConnectedAppsDetail.jsx'));
    assert.ok(ca.includes("userRole: userRole || 'User', from: 'apps' });"));
    assert.ok(ca.includes("const returnNote = returned && returned.provider === cal.provider ? calendarReturnMessage(returned) : '';"), "on the provider's own card");
    assert.ok(ca.includes("<CardNote text={returnNote} tone={returned?.status === 'success' ? 'ok' : 'danger'}/>"));
    assert.ok(ca.includes('returned={calConnectResult}'));
    assert.ok(ca.includes('useEffect(() => () => { if (calConnectResult) setCalConnectResult(null); }, []);'), 'cleared when the panel closes');
    const hd = code(read('src/components/layout/AppHeader.jsx'));
    assert.ok(hd.includes("            from: 'profile',"));
    assert.ok(hd.includes("const returnedHere = calConnectResult && (calConnectResult.from === 'profile' || calConnectResult.from === 'home');"));
    assert.ok(hd.includes("        if (returnedHere && showProfilePanel) setProfilePanelTab('calendar');"), 'the Calendar tab is selected so the line is in view');
    assert.ok(hd.includes('{calendarReturnMessage(calConnectResult)}'));
    const home = code(read('src/Tabs/HomeTab.jsx'));
    assert.ok(home.includes("userRole: userRole || 'User', from: 'home' });"));
    const cc = code(read('src/Tabs/settings/company/CompanyCalendarDetail.jsx'));
    assert.ok(cc.includes("userRole: userRole || 'User', from: 'company' });"));
    assert.ok(cc.includes("{calConnectResult && calConnectResult.from === 'company' && ("));
    assert.ok(cc.includes('{calendarReturnMessage(calConnectResult)}'));
});
