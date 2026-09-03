// tests/settings-counts.test.mjs
//
// Handoff item 22 (state §0.88): the Settings catalogue's remaining hand-typed
// card counts ("12 KPIs configured", "14 industries · 47 sub-types", "18 custom
// fields", "Q1 starts Feb 1", "Complete"…) and its never-expiring NEW badges.
// Every count now comes from the key the card's own panel saves, or is null;
// two guards had named keys no panel writes (`customFields`, `holidays`), so
// their typed numbers had shown for every org, always.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cardStateOf, fiscalYearDetail, customFieldCount, industriesDetail, fieldRuleCount, auditEventsDetail } from '../src/utils/settingsCards.js';
import { SETTINGS_ITEMS } from '../src/Tabs/settings/catalogue.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const row = (id) => SETTINGS_ITEMS.find(i => i.id === id);
const detail = (id, settings = {}, live = {}) => cardStateOf(row(id), settings, live).statusDetail;

// ── the regression: typed numbers with no key behind them ────────────────────

test('REGRESSION: with an empty settings object no card claims a number it cannot read', () => {
    for (const it of SETTINGS_ITEMS) {
        const d = cardStateOf(it, {}, {}).statusDetail;
        assert.ok(d === null || !/\d/.test(d) || d === '0 personas' || d === '0 competitors' || d === '0 reasons', `${it.id}: "${d}"`);
    }
});

test('the two guards that named keys no panel writes now read the panel\'s key', () => {
    assert.equal(detail('custom-fields', { customFields: [1, 2, 3] }), null, 'the old key is ignored');
    assert.equal(detail('custom-fields', { customFieldsByObject: { accounts: [1, 2], contacts: [1] } }), '3 custom fields');
    assert.equal(detail('company-calendar', { holidays: [1, 2] }), null, 'the old key is ignored');
    assert.equal(detail('company-calendar', { customHolidays: [1], federalHolidays: [1, 2] }), '3 holidays');
    assert.equal(detail('company-calendar', { customHolidays: [1] }), '1 holiday');
});

// ── each count reads its panel's key ─────────────────────────────────────────

test('company: the profile shows the name it has, the fiscal year the month it starts, or nothing', () => {
    assert.equal(detail('company-profile', {}), null);
    assert.equal(detail('company-profile', { companyName: 'UKG' }), 'UKG');
    assert.equal(detail('company-profile', { companyName: 'UKG', companyDisplayName: 'UKG Inc.' }), 'UKG Inc.');
    assert.equal(fiscalYearDetail('10'), 'FY starts October 1');
    assert.equal(fiscalYearDetail(2), 'FY starts February 1');
    assert.equal(fiscalYearDetail(''), null, 'never set: nothing — every consumer assumes October, but the org did not choose it');
    assert.equal(fiscalYearDetail('13'), null);
    assert.equal(detail('fiscal-year', { fiscalYearStart: '1' }), 'FY starts January 1');
});

test('sales process: pipelines, stages, KPIs, tiers, industries, sources, pain points, personas', () => {
    assert.equal(detail('pipelines', { pipelines: [{ stages: [1, 2] }, { stages: [1] }] }), '2 pipelines · 3 stages');
    assert.equal(detail('pipelines', {}), null);
    assert.equal(detail('funnel-stages', { funnelStages: [1, 2, 3, 4, 5, 6] }), '6 stages');
    assert.equal(detail('kpi-settings', {}), 'App defaults', 'the panel falls back to DEFAULT_KPI_THRESHOLDS — a number the org never chose is not counted');
    assert.equal(detail('kpi-settings', { kpiThresholds: [1, 2, 3] }), '3 KPIs');
    assert.equal(detail('customer-types', {}), 'App defaults');
    assert.equal(detail('customer-types', { customerTypeTiers: [1, 2] }), '2 tiers');
    assert.equal(detail('account-segments', { accountSegmentTiers: [1] }), '1 tier');
    assert.equal(detail('industries', {}), 'App defaults');
    assert.equal(industriesDetail([{ k: 'Tech', subs: ['a', 'b'] }, { k: 'Retail' }]), '2 industries · 2 sub-types');
    assert.equal(industriesDetail([{ k: 'Tech' }]), '1 industry');
    assert.equal(detail('lead-conv-benchmarks', { leadConvBenchmarks: [1, 2, 3, 4] }), '4 sources');
    assert.equal(detail('lead-conv-benchmarks', {}), null);
    assert.equal(detail('pain-points', { painPoints: [1] }), '1 pain point');
    assert.equal(detail('buyer-personas', {}), '0 personas');
});

test('quoting, people, security, data: real keys or nothing', () => {
    assert.equal(detail('price-book', { priceBookProducts: [1, 2] }), '2 products');
    assert.equal(detail('price-book', {}), null);
    assert.equal(detail('approval-tiers', {}), null);
    assert.equal(detail('quote-templates', { quoteTemplates: [1] }), '1 template');
    assert.equal(detail('territories', {}), null);
    assert.equal(detail('territories', { territories: [1, 2] }), '2 territories');
    assert.equal(detail('roles', { roles: [1] }), '1 role');
    assert.equal(detail('users', {}), null, 'no roster loaded: nothing, not "users · pending invites"');
    assert.equal(fieldRuleCount({ arr: { User: 'hidden' }, notes: {}, phone: 'hidden' }), 2);
    assert.equal(detail('field-visibility', { fieldVisibility: { arr: { User: 'hidden' } } }), '1 rule');
    assert.equal(detail('field-visibility', {}), null);
    assert.equal(detail('features', {}), null);
    assert.equal(detail('features', { featureFlags: { a: true, b: false } }), '1 of 2 on');
    assert.equal(detail('backup', {}, {}), null);
    assert.equal(detail('api-keys', {}, {}), null);
    assert.equal(detail('automations', {}, {}), null);
});

test('the audit card counts what the GET returned and says so at the cap — never "last 30 days"', () => {
    assert.equal(auditEventsDetail(undefined), null);
    assert.equal(auditEventsDetail(1), '1 recent event');
    assert.equal(auditEventsDetail(42), '42 recent events');
    assert.equal(auditEventsDetail(500), '500+ recent events', 'the GET is capped at 500 rows; the count is a floor');
    assert.equal(detail('audit-log', {}, { auditEvents: 7 }), '7 recent events');
    assert.doesNotMatch(detail('audit-log', {}, { auditEvents: 7 }), /30d/);
});

// ── the catalogue and the badge ──────────────────────────────────────────────

test('the catalogue carries no typed count, no isNew, no moved — only deterministic labels', () => {
    const cat = read('src/Tabs/settings/catalogue.js');
    assert.doesNotMatch(cat, /statusDetail:'\d/, 'a typed number');
    assert.doesNotMatch(cat, /isNew:/, 'a badge that never expires');
    assert.doesNotMatch(cat, /moved:/, 'a flag nothing renders');
    for (const it of SETTINGS_ITEMS) {
        assert.ok(it.statusDetail === null || ['Admin-defined', 'Scan on demand', 'Fit + Engagement'].includes(it.statusDetail), `${it.id}: "${it.statusDetail}"`);
    }
    assert.doesNotMatch(cat, /Complete|Q1 starts Feb 1|12 holidays|users · pending invites|teams · managers|Last 30 days/, 'the old typed details');
});

test('AdminView renders no NEW badge', () => {
    const av = read('src/Tabs/AdminView.jsx');
    assert.doesNotMatch(av, /NewBadge/);
    assert.doesNotMatch(av, /item\.isNew/);
});
