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

test('the Account rail reads the taxonomy primary from k and skips hidden rows', () => {
    const s = code(read(RAIL));
    assert.ok(s.includes("m.k || m.name || ''"), 'k first');
    assert.ok(s.includes('raw.filter(m => !(m && m.hidden))'), 'hidden industries are not suggested');
});
