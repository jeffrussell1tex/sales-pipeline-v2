// §0.170 (Jeff: "go with your recommendation", on "save buttons") — no
// app-wide autosave: each screen saves the keys it owns, by its Save button or
// as one action; the app's copy follows a save that landed; leaving a page
// with unsaved edits asks first; the server keeps the defaults.
//
// What the autosave was (useSettings, until §0.170): a PUT of the WHOLE
// settings object on any change — every key as it was at sign-in. It put back
// whatever had been saved since by a screen with its own copy (Connected Apps,
// field visibility) or by the server (integration requests, the nightly
// lead-scoring model); every screen's save went out twice, as two audit rows
// listing the first 20 keys; and its one useful act — writing a new workspace's
// defaults — happened only through it.
//
// Run here: the REAL defaults module. Scanned: the hook, the server, the panels,
// App's guard and the Sales Manager page — tests/integration/settings-defaults
// .itest.mjs proves the server half against the database; the harness runs
// unit suites only, so each rule is pinned here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_SETTINGS, SEEDED_KEYS, settingsSeeds } from '../src/utils/settingsDefaults.js';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const code = (src) => src.split(/\r?\n/).filter((l) => !l.trim().startsWith('//')).join('\n');
const between = (s, start, end) => {
    const a = s.indexOf(start);
    assert.ok(a >= 0, `missing: ${start}`);
    const b = s.indexOf(end, a + start.length);
    assert.ok(b > a, `no end after: ${start}`);
    return s.slice(a, b + end.length);
};
const count = (s, needle) => s.split(needle).length - 1;
const before = (s, first, second, why) => {
    const a = s.indexOf(first), b = s.indexOf(second);
    assert.ok(a >= 0, `missing: ${first}`);
    assert.ok(b >= 0, `missing: ${second}`);
    assert.ok(a < b, why);
};

// ── the defaults, run ──────────────────────────────────────────────────────

test('settingsSeeds: the defaults that are something, a fresh copy each time', () => {
    const seeds = settingsSeeds();
    assert.deepEqual(Object.keys(seeds).sort(), [...SEEDED_KEYS].sort());
    for (const k of SEEDED_KEYS) assert.deepEqual(seeds[k], DEFAULT_SETTINGS[k], k);
    assert.deepEqual(seeds.pipelines.map((p) => p.name), ['New Business']);
    assert.equal(seeds.quotaData.commissionTiers.length, 4);
    seeds.pipelines.push({ id: 'x' });
    seeds.quotaData.commissionTiers[0].rate = 99;
    assert.equal(DEFAULT_SETTINGS.pipelines.length, 1, 'a copy — a workspace\'s edit never reaches the defaults');
    assert.equal(DEFAULT_SETTINGS.quotaData.commissionTiers[0].rate, 5);
    assert.notEqual(settingsSeeds().pipelines, settingsSeeds().pipelines, 'fresh each call');
});

test('the seeded keys: none the server defaults to empty or off anyway, none it does not store in extra', () => {
    for (const k of SEEDED_KEYS) {
        const v = DEFAULT_SETTINGS[k];
        const empty = v === false || v === '' || (Array.isArray(v) && v.length === 0);
        assert.ok(!empty, `${k}: its default is the server's own fallback`);
    }
    for (const k of ['users', 'fiscalYearStart', 'taskTypes', 'verticalMarkets', 'fieldVisibility', 'priceBookConfig']) {
        assert.ok(!SEEDED_KEYS.includes(k), `${k} is not an extra key the server seeds`);
    }
});

test('one copy of the defaults: the hook imports them and keeps none of its own', () => {
    const hook = code(read('src/hooks/useSettings.js'));
    assert.ok(hook.includes("import { DEFAULT_SETTINGS } from '../utils/settingsDefaults.js';"));
    assert.ok(!/const DEFAULT_SETTINGS\s*=/.test(hook));
});

// ── the server keeps them ──────────────────────────────────────────────────

test('the settings GET: a key never saved reads as the shared default; one saved, even as null, is the workspace\'s', () => {
    const s = code(read('netlify/functions/settings.mjs'));
    assert.ok(s.includes("import { settingsSeeds, DEFAULT_SETTINGS } from '../../src/utils/settingsDefaults.js';"));
    const get = between(s, "if (event.httpMethod === 'GET') {", '}})};');
    assert.ok(get.includes('const ex = { ...settingsSeeds(), ...(row.extra || {}) };'), 'the stored extra over the seeds');
    assert.ok(get.includes('const saved = (k) => !!row.extra && k in row.extra;'));
    for (const k of ['quotaData', 'pipelines', 'kpiConfig', 'companyProfile']) {
        assert.ok(new RegExp(`${k}:\\s+ex\\.${k}\\s+\\|\\| null,`).test(get), `${k} through the seeds`);
    }
    assert.ok(/dispatchLicenses:\s+ex\.dispatchLicenses\s+\|\| DEFAULT_SETTINGS\.dispatchLicenses,/.test(get));
    assert.ok(/dispatchBlockTypes:\s+ex\.dispatchBlockTypes\s+\|\| DEFAULT_SETTINGS\.dispatchBlockTypes,/.test(get), 'one list of block types, not a second literal');
    assert.ok(get.includes("funnelStages:     saved('funnelStages') ? (row.extra.funnelStages || row.stages || []) : (row.stages?.length ? row.stages : ex.funnelStages),"),
        'stages: an older row\'s column first');
    assert.ok(get.includes("painPoints:       saved('painPoints') ? (row.extra.painPoints || row.painPoints || []) : (row.painPoints?.length ? row.painPoints : ex.painPoints),"));
});

test('the settings PUT: a seeded key it is not sent keeps what is stored, or the default if nothing is', () => {
    const s = code(read('netlify/functions/settings.mjs'));
    const put = between(s, "if (event.httpMethod === 'PUT') {", 'anthropicApiKey:  encryptedApiKey,');
    assert.ok(put.includes('const base = { ...settingsSeeds(), ...existingExtra };'));
    for (const k of ['quotaData', 'pipelines', 'kpiConfig', 'companyProfile', 'funnelStages', 'dispatchLicenses', 'dispatchBlockTypes', 'painPoints']) {
        assert.ok(new RegExp(`${k}:\\s+'${k}'\\s+in data \\? \\(data\\.${k}\\s+\\|\\| (null|\\[\\])\\)\\s*: base\\.${k}\\s+\\|\\| (null|\\[\\]),`).test(put), `${k} falls back through base`);
        assert.ok(!put.includes(`: existingExtra.${k} `), `${k} no longer reads the stored extra alone`);
    }
    assert.ok(/verticalMarkets: 'verticalMarkets' in data \? \(data\.verticalMarkets \|\| \[\]\)\s+: \(existing\[0\]\?\.verticalMarkets \?\? DEFAULT_SETTINGS\.verticalMarkets\),/.test(s),
        'a new row takes the default markets');
});

// ── the app's copy follows the save ────────────────────────────────────────

const AFTER_SAVE = [
    ['salesProcess/CustomerTypesDetail.jsx',    'putSettings({ customerTypeTiers: tiers })',  'setSettings(prev => ({ ...prev, customerTypeTiers: tiers }));'],
    ['salesProcess/AccountSegmentsDetail.jsx',  'putSettings({ accountSegmentTiers: tiers })', 'setSettings(prev => ({ ...prev, accountSegmentTiers: tiers }));'],
    ['salesProcess/IndustriesDetail.jsx',       'putSettings({ industries })',                'setSettings(prev => ({ ...prev, industries }));'],
    ['salesProcess/FunnelStagesDetail.jsx',     'putSettings({ funnelStages: stages })',      'setSettings(prev => ({ ...prev, funnelStages: stages }));'],
    ['salesProcess/KPIThresholdsDetail.jsx',    'putSettings({ kpiThresholds: rows })',       'setSettings(prev => ({ ...prev, kpiThresholds: rows }));'],
    ['salesProcess/CustomFieldsDetail.jsx',     'putSettings({ customFieldsByObject: fields })', 'setSettings(prev => ({ ...prev, customFieldsByObject: fields }));'],
    ['salesProcess/PainPointsDetail.jsx',       'putSettings({ painPoints: groups })',        'setSettings(prev => ({ ...prev, painPoints: groups }));'],
    ['salesProcess/FlatListDetail.jsx',         'putSettings({ [settingsKey]: items })',      'setSettings(prev => ({ ...prev, [settingsKey]: items }));'],
    ['salesProcess/BuyerPersonasDetail.jsx',    'putSettings({ buyerPersonas: personas })',   'setSettings(prev => ({ ...prev, buyerPersonas: personas }));'],
    ['salesProcess/LeadConversionDetail.jsx',   'putSettings({ leadConvBenchmarks: rows })',  'setSettings(prev => ({ ...prev, leadConvBenchmarks: rows }));'],
    ['salesProcess/LeadScoringDetail.jsx',      'putSettings({ leadScoring: cfg })',          'setSettings(prev => ({ ...prev, leadScoring: cfg }));'],
    ['salesProcess/LeadVisibilityDetail.jsx',   'putSettings(patch)',                         'setSettings(prev => ({ ...prev, ...patch }));'],
    ['company/CompanyProfileDetail.jsx',        'putSettings(patch)',                         'setSettings(prev => ({ ...prev, ...patch }));'],
    ['company/FiscalYearDetail.jsx',            'putSettings({ fiscalYearStart: dbValue })',  'setSettings(prev => ({ ...prev, fiscalYearStart: dbValue }));'],
    ['dispatch/DispatchSkillsDetail.jsx',       'putSettings(payload)',                       'setSettings(prev => ({ ...prev, ...payload }));'],
    ['dispatch/DispatchCrewsDetail.jsx',        'putSettings({ dispatchCrews: crews })',      'setSettings(prev => ({ ...prev, dispatchCrews: crews }));'],
    ['dispatch/DispatchJobTemplatesDetail.jsx', 'putSettings({ dispatchJobTemplates: clean })', 'setSettings(prev => ({ ...prev, dispatchJobTemplates: clean }));'],
    ['dispatch/DispatchCustomerNotificationsDetail.jsx', 'putSettings(payload)',              'setSettings(prev => ({ ...prev, ...payload }));'],
    ['dispatch/DispatchPropertyTypesDetail.jsx', 'putSettings({ dispatchPropertyTypes: clean })', 'setSettings(s => ({ ...s, dispatchPropertyTypes: clean }));'],
    ['quoting/QuoteTemplatesDetail.jsx',        'putSettings({ quoteTemplates:templates, quoteDefaults:defaults, quoteBoilerplate:boilerplate })',
                                                'setSettings(prev => ({ ...prev, quoteTemplates:templates, quoteDefaults:defaults, quoteBoilerplate:boilerplate }));'],
];

test('every settings screen changes the app\'s copy only once its save has landed — never before, never a snapshot put back', () => {
    for (const [f, save, mirror] of AFTER_SAVE) {
        const s = code(read('src/Tabs/settings/' + f));
        assert.equal(count(s, mirror), 1, `${f}: the copy is set once`);
        before(s, 'await ' + save, mirror, `${f}: after the save, inside the try — a refused save showed in the app anyway`);
        assert.ok(!/let snapshot;|setSettings\(snapshot\)/.test(s), `${f}: no snapshot to put back`);
    }
});

test('Fields & security mirrors what it saved — the app held the old matrix until a reload', () => {
    const s = code(read('src/Tabs/settings/security/FlsDetail.jsx'));
    before(s, "if (!res.ok) { const d = await res.json(); throw new Error(d.error); }",
        'if (setSettings) setSettings(prev => ({ ...prev, fieldVisibility: matrix }));', 'after a save that landed');
});

// ── the leave guard ────────────────────────────────────────────────────────

const WIRED = [
    ['salesProcess/CustomerTypesDetail.jsx', 'customer-types'],
    ['salesProcess/AccountSegmentsDetail.jsx', 'account-segments'],
    ['salesProcess/IndustriesDetail.jsx', 'industries'],
    ['salesProcess/LeadScoringDetail.jsx', 'lead-scoring'],
    ['salesProcess/LeadVisibilityDetail.jsx', 'lead-visibility'],
    ['salesProcess/LeadConversionDetail.jsx', 'lead-conv-benchmarks'],
    ['quoting/QuoteTemplatesDetail.jsx', 'quote-templates'],
    ['quoting/ApprovalTiersDetail.jsx', 'approval-tiers'],
    ['security/FlsDetail.jsx', 'field-visibility'],
];

test('ten more screens hand the leave guard their unsaved state and a save that throws when it does not save', () => {
    const av = code(read('src/Tabs/AdminView.jsx'));
    for (const [f, id] of WIRED) {
        const s = code(read('src/Tabs/settings/' + f));
        assert.ok(s.includes('React.useEffect(() => { if (setSettingsDirty) setSettingsDirty(dirty); return () => { if (setSettingsDirty) setSettingsDirty(false); }; }, [dirty]);'), `${f}: the dirty flag`);
        assert.ok(s.includes('useRegisterSave(settingsSaveRef, dirty, handleSave);'), `${f}: the save`);
        assert.ok(/throw e;/.test(between(s, 'const handleSave', 'useRegisterSave(')), `${f}: a failed save throws — the guard must not move on`);
        const mount = av.split('\n').find((l) => l.includes(`if (id === '${id}')`) && l.includes('return <'));
        assert.ok(mount && mount.includes('setSettingsDirty={setSettingsDirty} settingsSaveRef={settingsSaveRef}'), `AdminView hands ${id} the flag and the slot`);
    }
    for (const id of ['competitors', 'reasons-won', 'reasons-lost']) {
        const mount = av.split('\n').find((l) => l.includes(`if (id === '${id}')`));
        assert.ok(mount.includes('setSettingsDirty={setSettingsDirty} settingsSaveRef={settingsSaveRef}'), `${id}: the panel had the guard code; AdminView never passed it the props`);
    }
    const lc = code(read('src/Tabs/settings/salesProcess/LeadConversionDetail.jsx'));
    assert.ok(lc.includes('const [dirty, setDirty] = useState(false);'), 'Lead conversion knows it has unsaved edits');
    assert.equal(count(lc, 'setDirty(true);'), 4, 'each edit, add, remove and reset');
});

test('a refusal on the guard\'s path throws, not returns: Approval tiers and KPI thresholds', () => {
    const at = code(read('src/Tabs/settings/quoting/ApprovalTiersDetail.jsx'));
    const refusal = between(at, "if (mode === 'person' && tiers.some(t => needsChoice.has(t.id) && !t.approverUserId)) {", 'throw e;');
    assert.ok(!refusal.includes('return;'));
    const kpi = code(read('src/Tabs/settings/salesProcess/KPIThresholdsDetail.jsx'));
    assert.ok(!kpi.includes('if (hasErrors) return;'), 'a silent return let the guard move on, the invalid edits lost');
    assert.ok(/if \(hasErrors\) \{\s*const e = new Error\('Fix the highlighted thresholds before saving\.'\);\s*setSaveError\(e\.message\);\s*throw e;/.test(kpi));
});

test('one dialog: the shared LeaveGuardModal, in AdminView and App', () => {
    const av = code(read('src/Tabs/AdminView.jsx'));
    assert.ok(av.includes("import { LeaveGuardModal } from './settings/shared/LeaveGuardModal.jsx';"));
    assert.ok(!/const LeaveGuardModal\s*=/.test(av), 'no copy of its own');
    const app = code(read('src/App.jsx'));
    assert.ok(app.includes("import { LeaveGuardModal } from './Tabs/settings/shared/LeaveGuardModal.jsx';"));
    assert.ok(/<LeaveGuardModal saving=\{navGuardSaving\} failed=\{navGuardFailed\}\s+canSave=\{!!settingsSaveRef\.current\}/.test(app));
});

test('every way out of a tab asks first on a page with unsaved edits — the guard nothing called is wired', () => {
    const app = code(read('src/App.jsx'));
    assert.ok(!app.includes('handleNavClick'), 'the uncalled guard is gone');
    const nav = between(app, 'const navigateTo = React.useCallback((tab) => {', '}, [activeTab, settingsDirty, setActiveTab]);');
    assert.ok(nav.includes("if ((activeTab === 'settings' || activeTab === 'salesManager') && settingsDirty && tab !== activeTab) {"), 'Settings and the Sales Manager page');
    assert.ok(nav.includes('return false;') && nav.includes('return true;'));
    assert.ok(app.includes('navigateToRef.current = navigateTo;'));
    assert.ok(app.includes('activeTab, setActiveTab: navigateTo,'), 'the context hands every consumer the guarded switch — the header\'s tabs, search, in-page links');
    for (const tab of ['home', 'pipeline', 'tasks', 'accounts', 'contacts', 'leads', 'quotes', 'dispatch', 'documents', 'reports', 'salesManager', 'settings']) {
        assert.ok(app.includes(`onClick={() => navigateTo('${tab}')}`), `the nav's ${tab}`);
        assert.ok(!app.includes(`onClick={() => setActiveTab('${tab}')}`), `${tab}: no unguarded nav button`);
    }
    for (const tab of ['home', 'pipeline', 'tasks', 'accounts', 'contacts', 'leads', 'quotes', 'reports']) {
        assert.ok(app.includes(`e.preventDefault(); navigateToRef.current('${tab}'); break;`), `the shortcut to ${tab}`);
    }
    assert.ok(app.includes("e.preventDefault(); if (navigateToRef.current('pipeline')) setTimeout(() => { setEditingOpp(null); setShowModal(true); }, 100);"),
        'the new deal opens only once the pipeline is open — not over the dialog');
    const save = between(app, 'const navGuardSave = React.useCallback(async () => {', '}, [pendingNavTab, setActiveTab]);');
    assert.ok(/try \{\s*await save\(\);\s*\} catch \{\s*setNavGuardSaving\(false\);\s*setNavGuardFailed\(true\);\s*return;/.test(save), 'a save that throws keeps the dialog');
});

// ── the Sales Manager's Administration page ────────────────────────────────

test('Sales Manager: quotas, the commission plan and the SPIFF board are drafts until their card\'s Save', () => {
    const s = code(read('src/Tabs/SalesManagerTab.jsx'));
    assert.ok(!/onBlur=\{[^}]*save(Tiers|Spiffs)/.test(s) && !/commit(Tiers|Spiffs|Annual)|applyTiers|applySpiffs/.test(s), 'nothing saves on blur or as typed');
    const card = between(s, 'function QuotaRepCard(', 'return null;');
    assert.ok(!/updateRepField|onBlur=\{e=>commit/.test(card), 'a quota input saves nothing');
    assert.ok(card.includes("const shown = (field) => (draft && field in draft) ? draft[field] : (u[field] != null ? String(u[field]) : '');"));
    for (const [label, save, cancel] of [['Save quotas', 'saveQuotas', 'cancelQuotas'], ['Save plan', 'saveCommission', 'cancelCommission'], ['Save SPIFFs', 'saveSpiffBoard', 'cancelSpiffBoard']]) {
        assert.ok(s.includes(`<DraftActions label="${label}" busy={busy} onSave={${save}} onCancel={${cancel}}/>`), label);
    }
    assert.ok(s.includes("{canEditIncentives && <button onClick={()=>editSpiffs([...spiffList,{id:'spiff_'+Date.now(),name:'',amount:'',type:'flat',condition:'',active:true}])}"),
        '"+ Add SPIFF" adds to the draft — it put a blank, active $0 SPIFF live');
    assert.ok(s.includes("if (spiffsDraft.some(sp => !String(sp.name || '').trim())) throw refuse('give every SPIFF a name.');"), 'a SPIFF goes live only with a name');
    assert.ok(s.includes("if (isNaN(n) || n < 0) throw refuse(`${rep.name}'s quota must be a number, 0 or more.`);"),
        'a quota is a number, 0 or more — refused before anything is saved');
});

test('Sales Manager: the drafts are the page\'s — kept across sub-tabs, dropped on an org switch, saved by the leave guard', () => {
    const s = code(read('src/Tabs/SalesManagerTab.jsx'));
    const page = s.slice(s.indexOf('export default function SalesManagerTab'));
    assert.ok(page.includes('const [quotaDrafts, setQuotaDrafts] = useState({});'));
    assert.ok(page.includes('useEffect(() => { setQuotaDrafts({}); setTiersDraft(null); setSpiffsDraft(null); }, [activeOrgId]);'),
        'one org\'s drafts never go out with the next org\'s token');
    assert.ok(page.includes('useRegisterSave(settingsSaveRef, adminDirty, saveAdminDrafts);'));
    assert.ok(page.includes("useEffect(() => { if (setSettingsDirty) setSettingsDirty(adminDirty); return () => { if (setSettingsDirty) setSettingsDirty(false); }; }, [adminDirty]);"));
    const all = between(page, 'const saveAdminDrafts = async () => {', '};');
    assert.ok(all.includes('await saveQuotas();') && all.includes('await saveCommission();') && all.includes('await saveSpiffBoard();'));
    assert.ok(/if \(!await saveExtra\(\{ quotaData \}, 'commission tiers'\)\) throw new Error/.test(page), 'a refused save throws');
    assert.ok(/if \(!await saveUser\(user, 'quotas'\)\) throw new Error/.test(page));
});

test('Sales Manager: a rep is read from state, not out of a state updater — the save was skipped when React ran it later', () => {
    const s = code(read('src/Tabs/SalesManagerTab.jsx'));
    const upd = between(s, 'const updateRepField = async (userId, field, value) => {', 'return true;');
    assert.ok(upd.includes('const rep = (settings.users || []).find(u => u.id === userId);'));
    assert.ok(!/let updatedUser|updatedUser = updatedUsers/.test(s), 'no value smuggled out of an updater');
    before(upd, "if (!await saveUser({ ...rep, [field]: value }, 'forecast call')) return false;", 'setSettings(prev =>', 'the copy follows the save');
    const mode = between(s, 'const setAllQuotaMode = async (mode) => {', '\n    };');
    assert.ok(mode.includes("const toSave = (settings.users || []).filter(u => u.userType !== 'ReadOnly' && u.quotaType !== mode)"));
    assert.ok(!/let toSave/.test(mode));
});

// ── one word for saving ────────────────────────────────────────────────────

test('the record forms say Save, not Update', () => {
    const opp = read('src/components/modals/OpportunityModal.jsx');
    assert.equal(count(opp, '>Update<'), 0);
    assert.equal(count(opp, "opportunity ? 'Update'"), 0);
    assert.equal(count(opp, "onClick={() => onUpdate && onUpdate()}>Save</PrimaryBtn>"), 3, 'the three detail tabs submit the deal');
    assert.ok(opp.includes("{saving ? 'Saving…' : opportunity ? 'Save' : 'Create'}"));
    assert.ok(read('src/components/modals/ContactModal.jsx').includes("{saving ? 'Saving…' : (contact ? 'Save' : 'Create')}"));
    assert.ok(read('src/components/modals/UserModal.jsx').includes("{saving ? 'Saving…' : (user ? 'Save' : 'Create')}"));
});
