// tests/settings-cards.test.mjs
//
// Handoff item 15 (state §0.81): the Settings catalogue's 46 hand-typed footers
// ("Edited 2 months ago by Admin", values that never moved), two hand-typed
// attention flags, and a Workspace Health tile whose "N of 8 checks passing" was
// built from four constants under a static "Set up SSO and enforce MFA to reach
// 90%+". cardStateOf / healthChecksOf / healthSummaryOf are pure; the scans pin
// the catalogue, the card footer, the two shared panel headers and the panels
// that typed their own edit history.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cardStateOf, healthChecksOf, healthSummaryOf } from '../src/utils/settingsCards.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const item = (id, extra = {}) => ({ id, scope: 'workspace', category: 'x', name: id, desc: '', status: 'ok', statusDetail: 'typed', ...extra });

// ── card state ───────────────────────────────────────────────────────────────

test('webhooks: status and attention follow the live counts, never the catalogue row', () => {
    const row = item('webhooks', { status: 'none', statusDetail: null });
    assert.deepEqual(cardStateOf(row, {}, { webhooksTotal: 4, webhooksFailing: 1 }), { status: 'partial', statusDetail: '4 endpoints · 1 failing', attention: true });
    assert.deepEqual(cardStateOf(row, {}, { webhooksTotal: 4, webhooksFailing: 0 }), { status: 'ok', statusDetail: '4 endpoints', attention: false });
    assert.deepEqual(cardStateOf(row, {}, { webhooksTotal: 0 }), { status: 'ok', statusDetail: 'No endpoints', attention: false });
    assert.deepEqual(cardStateOf(row, {}, {}), { status: 'none', statusDetail: null, attention: false }, 'fetch not answered: nothing claimed');
    // REGRESSION: a row that still typed partial + attention is overruled by live data.
    assert.equal(cardStateOf(item('webhooks', { status: 'partial', attention: true }), {}, { webhooksTotal: 2, webhooksFailing: 0 }).attention, false);
});

test('sso and connected apps claim nothing: no status, no attention', () => {
    for (const id of ['sso', 'apps']) {
        assert.deepEqual(cardStateOf(item(id, { status: 'warning', attention: true }), { ssoConfig: { provider: 'Okta' } }, {}), { status: 'none', statusDetail: null, attention: false }, id);
    }
});

test('a status of ok with nothing behind it becomes none; a real detail keeps ok', () => {
    assert.equal(cardStateOf(item('session'), {}, {}).status, 'none', 'session detail is nulled by design');
    assert.equal(cardStateOf(item('teams'), { users: [{ name: 'A' }] }, {}).status, 'none', 'zero teams: nothing to be ok about');
    const teams = cardStateOf(item('teams'), { users: [{ name: 'A', team: 'West' }] }, {});
    assert.deepEqual([teams.status, teams.statusDetail], ['ok', '1 team']);
});

test('the MFA card still reads Clerk enrolment through mfaCardOf', () => {
    assert.deepEqual(cardStateOf(item('mfa', { status: 'none', statusDetail: null }), {}, { mfa: { enrolled: 2, total: 4 } }), { status: 'partial', statusDetail: '2/4 enrolled · 50%', attention: true });
    assert.deepEqual(cardStateOf(item('mfa', { status: 'none', statusDetail: null }), {}, {}), { status: 'none', statusDetail: null, attention: false });
});

// ── health checks ────────────────────────────────────────────────────────────

const SETTINGS = { users: [{ name: 'A', team: 'West' }], pipelines: [{ id: 'p' }], quoteBrand: { logo: 'x' } };

test('before any live fetch answers, only the settings-readable checks are counted', () => {
    const checks = healthChecksOf(SETTINGS, {});
    assert.deepEqual(checks.map(c => c.id), ['pipelines', 'teams', 'quote-brand']);
    assert.ok(checks.every(c => c.ok));
    assert.ok(!checks.some(c => /SSO|Session|MFA enforced/.test(c.label)), 'no check the app cannot read');
});

test('live checks join the denominator once known, and read what they claim', () => {
    const live = { mfa: { enrolled: 2, total: 4 }, webhooksTotal: 3, webhooksFailing: 0, backupChecked: true, backupLastHours: 5 };
    const checks = healthChecksOf(SETTINGS, live);
    assert.deepEqual(checks.map(c => [c.id, c.ok]), [['mfa', false], ['webhooks', true], ['backup', true], ['pipelines', true], ['teams', true], ['quote-brand', true]]);
    assert.equal(checks.find(c => c.id === 'mfa').label, 'MFA fully enrolled', 'enrolment, not a policy the app cannot read');
    assert.equal(healthChecksOf(SETTINGS, { ...live, mfa: { enrolled: 4, total: 4 } }).find(c => c.id === 'mfa').ok, true);
    assert.equal(healthChecksOf(SETTINGS, { ...live, webhooksFailing: 1 }).find(c => c.id === 'webhooks').ok, false);
});

test('backups: an answered fetch with no snapshot, or a stale one, is a failing check — an unanswered fetch is no check', () => {
    assert.equal(healthChecksOf(SETTINGS, { backupChecked: true }).find(c => c.id === 'backup').ok, false, 'no snapshot at all');
    assert.equal(healthChecksOf(SETTINGS, { backupChecked: true, backupLastHours: 49 }).find(c => c.id === 'backup').ok, false, 'older than two days');
    assert.equal(healthChecksOf(SETTINGS, { backupChecked: true, backupLastHours: 48 }).find(c => c.id === 'backup').ok, true);
    assert.equal(healthChecksOf(SETTINGS, { backupLastHours: 5 }).find(c => c.id === 'backup'), undefined, 'hours without an answer flag is not trusted');
});

test('a snoozed or dismissed attention item leaves the denominator, as before', () => {
    const live = { mfa: { enrolled: 1, total: 4 }, webhooksTotal: 1, webhooksFailing: 1 };
    const hidden = new Set(['mfa']);
    const ids = healthChecksOf(SETTINGS, live, (id) => hidden.has(id)).map(c => c.id);
    assert.ok(!ids.includes('mfa') && ids.includes('webhooks'));
});

test('settings-readable checks fail honestly', () => {
    const checks = healthChecksOf({ users: [{ name: 'A' }, { name: 'B', team: 'X' }], pipelines: [] }, {});
    assert.deepEqual(checks.map(c => [c.id, c.ok]), [['pipelines', false], ['teams', false], ['quote-brand', false]]);
});

test('the summary names what failed and never pitches', () => {
    const s = healthSummaryOf([{ label: 'A', ok: true }, { label: 'B', ok: false }, { label: 'C', ok: false }, { label: 'D', ok: true }]);
    assert.deepEqual([s.ok, s.total, s.pct], [2, 4, 50]);
    assert.equal(s.sentence, 'Not passing: B, C.');
    assert.equal(healthSummaryOf([{ label: 'A', ok: true }]).sentence, 'Every check that can be read is passing.');
    assert.deepEqual(healthSummaryOf([]), { ok: 0, total: 0, pct: 0, failing: [], sentence: 'Nothing can be checked yet.' });
    assert.doesNotMatch(s.sentence, /90%|SSO/);
});

// ── the wiring ───────────────────────────────────────────────────────────────

test('the catalogue carries no invented edit history and no hand-typed attention', () => {
    const cat = read('src/Tabs/settings/catalogue.js');
    assert.doesNotMatch(cat, /updatedAt|updatedBy/, 'footer fields');
    assert.doesNotMatch(cat, /attention:true/, 'a permanent Needs attention');
    for (const id of ['sso', 'apps', 'webhooks', 'session', 'import', 'export']) {
        const row = cat.split('\n').find(l => l.includes(`id:'${id}'`));
        assert.ok(row && row.includes("status:'none'") && row.includes('statusDetail:null'), `${id} claims no status it cannot read`);
    }
    assert.doesNotMatch(cat, /Not configured|4 endpoints · 1 failing|3 of 6 connected|8h timeout|812 rows|Weekly export/, 'the typed details of the no-data cards');
});

test('AdminView reads card state, attention and health from the module; the footer says only what is true', () => {
    const av = read('src/Tabs/AdminView.jsx');
    assert.match(av, /import \{ cardStateOf, healthChecksOf, healthSummaryOf \} from '\.\.\/utils\/settingsCards';/);
    assert.ok(av.includes('const { status, statusDetail, attention } = cardStateOf(item, settings, liveCounts);'));
    assert.ok(av.includes('<span>{item.managedIn ? `Managed in ${item.managedIn}` : \'\'}</span>'), 'the footer');
    assert.doesNotMatch(av, /Never changed|Edited \$\{item\.updatedAt\}/, 'the invented footer');
    assert.ok(av.includes('const allAttentionItems = scopeItems.filter(i => cardStates[i.id].attention)'), 'attention is computed');
    assert.doesNotMatch(av, /SETTINGS_ITEMS\.filter\(i => i\.attention\)/);
    assert.ok(av.includes('const activeHealthChecks = healthChecksOf(settings, liveCounts, isHidden);'));
    assert.ok(av.includes('{health.sentence}'), 'the tile sentence comes from the checks');
    assert.doesNotMatch(av, /Set up SSO and enforce MFA|'MFA enforced'|'Session policy set'|ok: true\s+\}/, 'the constants');
    assert.ok(av.includes('if (backupRes.value.ok) counts.backupChecked = true;') && av.includes('counts.backupLastHours = diffH;'), 'backup answers reach the checks');
});

test('the shared panel headers show "Last edited" only when both values are given, and no panel types its own', () => {
    for (const f of ['src/Tabs/settings/shared/CategoryDetailChrome.jsx', 'src/Tabs/settings/shared/form.jsx']) {
        const src = read(f);
        assert.ok(src.includes('{updatedAt && updatedBy && (<>'), `${f}: conditional`);
    }
    const panels = ['company/CompanyCalendarDetail', 'company/CompanyProfileDetail', 'company/FiscalYearDetail', 'quoting/ApprovalTiersDetail', 'quoting/QuoteTemplatesDetail',
        'salesProcess/AccountSegmentsDetail', 'salesProcess/BuyerPersonasDetail', 'salesProcess/CustomerTypesDetail', 'salesProcess/CustomFieldsDetail', 'salesProcess/FlatListDetail',
        'salesProcess/FunnelStagesDetail', 'salesProcess/IndustriesDetail', 'salesProcess/KPIThresholdsDetail', 'salesProcess/LeadConversionDetail', 'salesProcess/PainPointsDetail', 'salesProcess/PipelinesDetail'];
    for (const p of panels) {
        const src = read(`src/Tabs/settings/${p}.jsx`);
        assert.doesNotMatch(src, /updatedAt="/, `${p}: a typed edit time`);
        assert.doesNotMatch(src, /updatedBy=/, `${p}: a typed editor`);
    }
    assert.doesNotMatch(read('src/Tabs/settings/security/SsoDetail.jsx'), /Last edited by Morgan|Last edited never/, 'a fictional editor');
});
