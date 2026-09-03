// tests/connected-apps.test.mjs
//
// State §0.89. The Connected Apps panel rendered <SlackConfigModal/> from 11 May
// 2026 (`5772f63` deleted the definition in a cleanup) to 3 Sep with no binding
// for the name: every build passed, and every "Configure Slack" click threw
// "SlackConfigModal is not defined" into the Settings error boundary — so no org
// could ever enter the webhook that send-slack.mjs and pipeline-alerts.mjs read.
// Found reading for handoff item 24. Alongside: IntBtn dropped `disabled`; the
// Industries defaults carried typed `n` counts every Save persisted; the Account
// rail read `name` from a taxonomy keyed `k` and offered no suggestions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const code = (src) => src.split(/\r?\n/).filter(l => !l.trim().startsWith('//')).join('\n');
const tdz = (file) => {
    try { return { code: 0, out: execFileSync('node', ['scripts/check-tdz.mjs', file], { encoding: 'utf8' }) }; }
    catch (e) { return { code: e.status ?? 1, out: (e.stdout || '') + (e.stderr || '') }; }
};

const CA  = 'src/Tabs/settings/integrations/ConnectedAppsDetail.jsx';
const SH  = 'src/Tabs/settings/integrations/shared.jsx';
const IND = 'src/Tabs/settings/salesProcess/IndustriesDetail.jsx';
const RAIL = 'src/components/rails/AccountRail.jsx';

// ── the regression ───────────────────────────────────────────────────────────

test('REGRESSION: every JSX element ConnectedAppsDetail renders is bound in the file', () => {
    const r = tdz(CA);
    assert.equal(r.code, 0, r.out);
});

test('the gate that guards this catches its fixture at both sites', () => {
    // Pinned here as well as in scanners.test.mjs so the mutation harness, which
    // runs this suite, grades the gate's two JSX passes (18b10).
    const r = tdz('tests/fixtures/scanners/tdz-undefined-jsx.jsx');
    assert.notEqual(r.code, 0, 'the fixture was not reported');
    assert.match(r.out, /<Panel> reads "SlackConfigModal"/, 'inside a component: the scope walk');
    assert.match(r.out, /<file> reads "RowFromNowhere"/, 'outside any component: the whole-file pass');
});

test('SlackConfigModal is declared at module scope and rendered by the panel', () => {
    const s = code(read(CA));
    assert.match(s, /^const SlackConfigModal = \(\{ existing, onClose, onSave \}\) => \{/m, 'declared at module scope, not inside a component');
    assert.match(s, /\{slackModal\s+&& <SlackConfigModal existing=\{slackConfig\}/, 'rendered when slackModal is set');
    assert.match(s, /^const SlackField = /m, 'the field wrapper is module-scope too (a per-render wrapper remounts the input it wraps)');
    assert.doesNotMatch(s, /const FL = /, 'the old inline wrapper is gone');
});

test('the modal tests the URL the user typed and saves it enabled', () => {
    const s = code(read(CA));
    assert.ok(s.includes("dbFetch('/.netlify/functions/send-slack', {"), 'the test posts to send-slack');
    assert.ok(s.includes('body: JSON.stringify({ webhookUrl: webhookUrl.trim() }),'), 'with the typed URL, so the stored one is untouched');
    assert.ok(s.includes('await onSave({ webhookUrl: webhookUrl.trim(), channel: channel.trim(), enabled: true });'), 'saved enabled — send-slack treats enabled !== false as on');
    assert.ok(s.includes("if (!res.ok) throw new Error(data.error || 'Test failed');"), 'a non-2xx test is a failure, not a success toast');
});

test('the panel still saves slackConfig and marks slack connected in one PUT', () => {
    const s = code(read(CA));
    assert.ok(s.includes('await putSettings({ slackConfig: config, connectedApps: nextApps });'));
    assert.ok(s.includes('setSlackModal(false);          // only close once the write has landed'));
});

test('send-slack posts to an explicit webhookUrl when the body carries one', () => {
    const s = code(read('netlify/functions/send-slack.mjs'));
    assert.ok(s.includes('const { type, webhookUrl, text, blocks } = JSON.parse(event.body || \'{}\');'));
    assert.ok(s.includes('await sendSlack({ webhookUrl: url, text: text || slackTemplates.test({}).text, blocks });'));
});

// ── IntBtn ───────────────────────────────────────────────────────────────────

test('IntBtn honours disabled — four callers were passing it into the void', () => {
    const s = code(read(SH));
    assert.match(s, /export const IntBtn = \(\{ label, primary, onClick, disabled \}\)/);
    assert.ok(s.includes('<button onClick={onClick} disabled={disabled}'));
    for (const f of ['ApiKeysDetail', 'AutomationsDetail', 'WebhooksDetail']) {
        assert.match(read(`src/Tabs/settings/integrations/${f}.jsx`), /<IntBtn [^>]*disabled=/, `${f} passes disabled`);
    }
});

// ── Industries ───────────────────────────────────────────────────────────────

test('the industry defaults carry no typed count, and a saved taxonomy is stripped of one', () => {
    const s = code(read(IND));
    assert.doesNotMatch(s, /\bn:\s*\d/, 'a typed n');
    assert.ok(s.includes('const cloneIndustries = (list) => list.map(({ n, ...ind }) => ({ ...ind, subs: [...(ind.subs || [])] }));'));
    assert.ok(s.includes('useState(() => cloneIndustries(saved))'), 'the initial state goes through the clone');
    assert.ok(s.includes('setIndustries(cloneIndustries(saved))'), 'Cancel goes through the clone');
    assert.doesNotMatch(s, /JSON\.parse\(JSON\.stringify\(saved\)\)/);
    assert.ok(s.includes("distItems.map((ind,i) =>"), 'the Distribution card still renders');
    assert.ok(s.includes("({ k: ind.k, n: counts[ind.k] || 0 })"), 'and its count is the computed one');
});

// ── Item 24, option A (state §0.90): the panel is what exists ────────────────

test('the connect mockup is gone: no Morgan Reyes, no INT_APPS, no Authorize, no inert header buttons, no gcal flag', () => {
    const s = code(read(CA));
    for (const ghost of ['Morgan Reyes', 'morgan@accelerep.com', 'ConnectAppModal', 'INT_APPS', 'Authorize', 'Browse marketplace', '+ Request integration', 'requiredScopes', "connectedApps['gcal']", 'handleMarkConnected', '1,247 msgs/day', 'Token refresh in 6d', 'redirected to Google to authorize']) {
        assert.ok(!s.includes(ghost), `ConnectedAppsDetail still carries "${ghost}"`);
    }
});

test('the panel reads the three real sources and renders the four real integrations', () => {
    const s = code(read(CA));
    assert.ok(s.includes("dbFetch('/.netlify/functions/settings')"), 'Slack + requests');
    assert.ok(s.includes("dbFetch('/.netlify/functions/calendar-connections')"), 'calendar state');
    assert.ok(s.includes("dbFetch('/.netlify/functions/email-inbound')"), 'the BCC address');
    assert.ok(s.includes("window.location.href = '/.netlify/functions/calendar-oauth-start?' + qs.toString();"), 'Connect is the real OAuth start');
    assert.ok(s.includes("calendar-connections?id=${encodeURIComponent(id)}&scope=${scope}`, { method: 'DELETE' }"), 'Disconnect is the real endpoint');
    assert.ok(s.includes("{ provider:'google',"), 'Google Calendar');
    assert.ok(s.includes("{ provider:'outlook',"), 'Microsoft 365 Calendar — the backend always supported it; no UI offered it');
    assert.ok(s.includes('Not available on this site'), 'an unconfigured provider says so instead of navigating into a 503');
    assert.ok(s.includes("import { REQUESTABLE_APPS } from '../../../utils/integrationCatalog.js';"), 'the catalogue is the shared module');
    assert.ok(s.includes("dbFetch('/.netlify/functions/integration-requests', {"), 'a catalogue row is a request');
    assert.match(s, /const RequestRow = /, 'module-scope row');
    assert.match(s, /const CalendarCard = /, 'module-scope card');
    assert.match(s, /const BccCard = /, 'module-scope card');
    // The harness's first run let a mutant that renamed the row's button to
    // 'Connect' survive: the old regex matched only a bare >Connect< element,
    // and the label is a quoted literal in a JSX expression. A real integration's
    // "Connect my calendar" is JSX text, never a quoted 'Connect'.
    assert.ok(s.includes("{busy === app.id ? 'Sending…' : 'Request'}"), 'the catalogue row button says Request');
    assert.doesNotMatch(s, /['"]Connect['"]/, 'no quoted Connect literal anywhere in the panel');
});

test('integrationRequests is carried by BOTH halves of settings.mjs (18b12)', () => {
    const s = code(read('netlify/functions/settings.mjs'));
    assert.ok(s.includes('integrationRequests: row.extra?.integrationRequests || {},'), 'GET');
    assert.ok(s.includes("integrationRequests: 'integrationRequests' in data ? (data.integrationRequests || {}) : existingExtra.integrationRequests || {},"), 'PUT read-then-merge');
});

test('integration-requests accepts only the catalogue, is a write, audits, and mails only when an owner address is set', () => {
    const s = code(read('netlify/functions/integration-requests.mjs'));
    assert.ok(s.includes("import { requestableApp, cleanNote } from '../../src/utils/integrationCatalog.js';"), 'one catalogue for both sides');
    assert.ok(s.includes('const app = requestableApp(body.appId);'));
    assert.ok(s.includes("if (!app) return json(400, { error: 'Unknown integration. Only apps in the catalogue can be requested.' });"));
    assert.ok(s.includes('const forbidden = requireWrite(auth, event, HEADERS);'));
    assert.ok(s.includes("if (existing[app.id]?.requestedAt) {"), 'idempotent');
    assert.ok(s.includes("action: 'integration.requested', entityType: 'integration', entityId: app.id, entityName: app.name,"));
    assert.ok(s.includes('const to = process.env.INTEGRATION_REQUESTS_TO;'));
    assert.ok(s.includes('if (!to) return false;'), 'no address, no mail, request still recorded');
    assert.ok(s.includes('.where(eq(settings.orgId, orgId));'), 'the update is org-scoped');
});

test('calendar-connections reports provider availability by env NAME presence, never a value', () => {
    const s = code(read('netlify/functions/calendar-connections.mjs'));
    assert.ok(s.includes("google:  !!(process.env.GOOGLE_CLIENT_ID    && process.env.GOOGLE_CLIENT_SECRET),"));
    assert.ok(s.includes("outlook: !!(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET),"));
    assert.ok(s.includes('body: JSON.stringify({ userConnections: userRows, orgConnections: orgRows, providers }),'));
});

test('the catalogue is a frozen list of requestable ids, and the settings card no longer promises Gmail/Zoom/DocuSign', async () => {
    const { REQUESTABLE_APPS, REQUESTABLE_IDS, isRequestableApp, requestableApp, cleanNote, NOTE_MAX } = await import('../src/utils/integrationCatalog.js');
    assert.ok(Object.isFrozen(REQUESTABLE_APPS));
    assert.equal(new Set(REQUESTABLE_IDS).size, REQUESTABLE_IDS.length, 'ids are unique');
    assert.ok(isRequestableApp('hubspot'));
    assert.ok(!isRequestableApp('slack'), 'Slack is real, not requestable');
    assert.ok(!isRequestableApp('gcal'), 'the calendars are real, not requestable');
    assert.equal(requestableApp('nope'), null);
    assert.equal(cleanNote('  a\tb  '), 'a b');
    assert.equal(cleanNote('x'.repeat(NOTE_MAX + 50)).length, NOTE_MAX);
    assert.equal(cleanNote(42), '');
    const cat = read('src/Tabs/settings/catalogue.js');
    assert.doesNotMatch(cat, /Gmail, Outlook, Zoom, Docusign, LinkedIn/);
});

test('the Account rail reads the taxonomy primary from k and skips hidden rows', () => {
    const s = code(read(RAIL));
    assert.ok(s.includes("m.k || m.name || ''"), 'k first');
    assert.ok(s.includes('raw.filter(m => !(m && m.hidden))'), 'hidden industries are not suggested');
});
