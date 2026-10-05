// tests/honest-panels.test.mjs
//
// Three Settings panels were design mockups in depth (state §0.86, handoff item
// 21; Jeff's call per panel, 3 Sep): SSO (a SEC_SSO constant with Okta URLs, a
// fake domain, a wizard frozen on step 2, a Save to a key nothing read),
// Session & password (a policy form whose Save PUT `sessionPolicy` — a key in
// NEITHER half of settings.mjs — and toasted "Policy saved."), and Import (a
// fake history and wizard whose "Run import" posted no rows and echoed the
// preview back as a success). Each is now the MfaDetail pattern: what Clerk
// does, what this app does, what it does not do, and a launcher for the real
// importers. These scans keep the invented parts from coming back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { roleAccessRows, RECORD_ACCESS, DISPATCH_ACCESS } from '../src/utils/roleAccess.js';
import { ROLE_OPTIONS } from '../src/utils/roles.js';
import { activeMembersByRole } from '../src/Tabs/settings/people/memberStatus.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const code = (src) => src.split(/\r?\n/).filter(l => !l.trim().startsWith('//')).join('\n');

// ── SSO ──────────────────────────────────────────────────────────────────────

test('SSO: no fabricated config, no inert wizard, no save to a key nothing reads — a Managed-in-Clerk panel', () => {
    const s = code(read('src/Tabs/settings/security/SsoDetail.jsx'));
    for (const ghost of ['SEC_SSO', 'acme-corp.com', 'okta.com', '412 logins', 'ConfigureSsoModal', 'putSettings', 'ssoConfig', 'Download metadata', 'Test login', 'Add domain', 'Enterprise plan', 'jitProvisioning']) {
        assert.ok(!s.includes(ghost), `SsoDetail still carries "${ghost}"`);
    }
    assert.ok(s.includes('Managed in Clerk'));
    assert.ok(s.includes('enterprise connection'), 'says what SSO is in Clerk');
    assert.ok(s.includes('There is nothing to configure in Accelerep.'));
    assert.ok(s.includes("href={CLERK_DASHBOARD}"), 'links the dashboard');
    assert.ok(s.includes('cannot tell whether an SSO connection exists'), 'says what the app cannot read');
    assert.doesNotMatch(s, /useState|useEffect/, 'nothing to load, nothing to save');
});

// ── Session & password ───────────────────────────────────────────────────────

test('Session: no policy form, no sessionPolicy PUT the server drops, no invented IP allowlist', () => {
    const s = code(read('src/Tabs/settings/security/SessionDetail.jsx'));
    for (const ghost of ['SEC_SESSION', 'sessionPolicy', 'Policy saved', 'Strong policy', '90-day rotation', 'HQ VPN', 'AWS prod NAT', 'IpRangeModal', 'PolicySelect', 'dbFetch', 'Save policy', 'Auto-unlock']) {
        assert.ok(!s.includes(ghost), `SessionDetail still carries "${ghost}"`);
    }
    assert.ok(s.includes('Managed in Clerk'));
    assert.ok(s.includes('Sessions, passwords and lockout are set in Clerk'));
    assert.ok(s.includes('An <b>IP allowlist</b>. Sign-in is not restricted by network address.'), 'the absence is stated, not a form');
    assert.ok(s.includes('Re-authentication for sensitive actions'), 'the second absence is stated');
    assert.ok(s.includes('<b>pending</b>'), 'the one real session rule (§18b27) is named');
    assert.doesNotMatch(s, /useState|useEffect/);
});

test('sessionPolicy is read by nothing and written by nothing — the key never existed server-side', () => {
    assert.ok(!read('netlify/functions/settings.mjs').includes('sessionPolicy'));
    assert.ok(!read('src/hooks/useSettings.js').includes('sessionPolicy'));
    assert.ok(!read('src/utils/settingsDefaults.js').includes('sessionPolicy'), 'nor among the defaults (one module since §0.170)');
});

// ── Import ───────────────────────────────────────────────────────────────────

test('Import: a launcher for the real importers — no fake history, no wizard, no preview echoed as a result', () => {
    const s = code(read('src/Tabs/settings/data/ImportDetail.jsx'));
    for (const ghost of ['DATA_IMPORT', 'morgan@accelerep.com', 'salesforce-accounts', 'RunImportModal', 'SavePresetModal', 'importPresets', 'functions/import', 'Import completed successfully', 'willCreate', 'DataStepRail', 'autoMap', 'parseCSVHeaders', 'Download error report', 'Reload mapping']) {
        assert.ok(!s.includes(ghost), `ImportDetail still carries "${ghost}"`);
    }
    assert.ok(s.includes("setCsvImportType(key);") && s.includes("setShowCsvImportModal(true);"), 'the tabs\' CSV modal, keyed by entity');
    assert.ok(s.includes("if (key === 'leads') { setShowLeadImportModal(true); return; }"), 'leads go to the lead importer, which the CSV modal cannot do');
    assert.ok(s.includes("const leadsOn = settings?.leadsEnabled !== false;"), 'no lead importer when leads are off');
    for (const k of ["key:'accounts'", "key:'contacts'", "key:'opportunities'", "key:'leads'"]) assert.ok(s.includes(k), k);
    assert.ok(s.includes('Nothing is imported from this page itself.'));
});

test('the import function nothing called any more is gone, and its keys are out of both halves of settings.mjs', () => {
    assert.ok(!existsSync(new URL('../netlify/functions/import.mjs', import.meta.url)), 'import.mjs echoed preview counts as "created" and had no caller left');
    const s = code(read('netlify/functions/settings.mjs'));
    assert.ok(!s.includes('importPresets'), 'never read back — retired with the wizard');
    assert.ok(!s.includes('ssoConfig'), 'never read by sign-in — retired with the form');
    // The streaming pair left in §0.87 (its own table); tests/audit-stream.test.mjs pins that.
});

// ── the catalogue says where each lives ──────────────────────────────────────

test('the catalogue cards for SSO, Session and Import describe the real thing', () => {
    const c = read('src/Tabs/settings/catalogue.js');
    assert.ok(c.includes("id:'sso',") && /id:'sso',[^\n]*managedIn:'Clerk'/.test(c), 'SSO: Managed in Clerk');
    assert.ok(/id:'session',[^\n]*name:'Session & password',[^\n]*managedIn:'Clerk'/.test(c), 'Session: renamed and Managed in Clerk');
    assert.ok(/id:'import',[^\n]*desc:'Open the CSV importers/.test(c), 'Import: a launcher');
    assert.doesNotMatch(c, /Idle timeout, device trust, IP allowlist/, 'the old promise');
    assert.ok(read('src/Tabs/AdminView.jsx').includes('`Managed in ${item.managedIn}`'), 'the card chrome renders managedIn');
});

// ── Roles & permissions, and Field-level security (state §0.171) ─────────────
// Two more security panels that were mockups in depth (Jeff: "Honest page now";
// on Roles, "Fold it in"). Roles listed a hand-typed five roles — two of them no
// role the app has — with invented member counts, and saved a permission grid
// to a key nothing read; Fields & security
// saved Edit / Read / Masked / Hidden for 42 fields — 28 of them no column of
// their object — as strings, while the app's one field check hid a field only
// for the boolean `false`. Neither enforced anything.

test('Roles: the six real roles, built from the rules the server runs — no invented roles, no grid, no save', () => {
    const s = code(read('src/Tabs/settings/people/RolesDetail.jsx'));
    for (const ghost of ['PT_ROLES', 'PT_PERMS', 'PT_PERM', 'Customer Success', 'Finance / CFO', 'userCount', 'putSettings', 'rolePermissions',
                         'Duplicate role', 'Rename role', 'Delete role', 'Apply', 'useState', 'useEffect', 'dbFetch', 'showPrompt']) {
        assert.ok(!s.includes(ghost), `RolesDetail still carries "${ghost}"`);
    }
    assert.ok(s.includes('const rows       = roleAccessRows(settings || {});'), 'the rows are the server\'s rules (roleAccess.js over roles.js)');
    assert.ok(s.includes('const members    = activeMembersByRole(roster);'), 'the counts are the roster\'s');
    assert.ok(s.includes('<SecCrumb section="People & Teams" page="Roles & permissions" onBack={onBack}/>'));
    assert.ok(s.includes('What a role allows is not configurable'));
    assert.ok(s.includes('Not available in Accelerep') && s.includes('Custom or renamed roles') && s.includes('Per-field rules'));
    assert.ok(s.includes('inviting anyone') && s.includes('above a Sales Rep (a Manager may invite Sales Reps)'), 'the invite rule as users.mjs enforces it');
    const crumb = read('src/Tabs/settings/security/shared.jsx');
    assert.ok(crumb.includes("export const SecCrumb = ({ page, onBack, section = 'Security' }) => (") && crumb.includes('>{section}</button>'));
});

test('roleAccessRows: what each role sees, changes and does in Dispatch — run for real', () => {
    const at = (settings) => Object.fromEntries(roleAccessRows(settings).map((r) => [r.role, r]));
    const own = 'Their own, and unassigned ones';
    const rows = roleAccessRows({ dispatchEnabled: true });
    assert.deepEqual(rows.map((r) => r.role), ROLE_OPTIONS.map((o) => o.value), 'the pickers\' six, in their order');
    assert.deepEqual(rows.map((r) => r.label), ROLE_OPTIONS.map((o) => o.label), '"Sales Rep" for the stored User');
    const on = at({ dispatchEnabled: true });
    assert.deepEqual([on.Admin.records, on.Admin.changes, on.Admin.dispatch], ['Every record', 'Any record', 'Full']);
    assert.deepEqual([on.Manager.records, on.Manager.changes, on.Manager.dispatch], ['Every record', 'Any record', 'Full']);
    assert.deepEqual([on.User.records, on.User.changes, on.User.dispatch], [own, own, 'None'], 'a rep stays out of Dispatch unless the org opens it');
    assert.deepEqual([on.Dispatcher.records, on.Dispatcher.changes, on.Dispatcher.dispatch], ['Every record', 'None', 'Full'], 'reads the CRM, changes none of it');
    assert.deepEqual([on.Technician.records, on.Technician.changes, on.Technician.dispatch], ['None', 'None', 'Their own jobs']);
    assert.deepEqual([on.ReadOnly.records, on.ReadOnly.changes, on.ReadOnly.dispatch], [own, 'None', 'View only']);
    assert.equal(at({ dispatchEnabled: true, repsCanUseDispatch: true }).User.dispatch, 'Full', 'the org switch');
    for (const r of roleAccessRows({})) assert.equal(r.dispatch, null, `${r.role}: with Dispatch off the page says so, not "None"`);
    assert.deepEqual(Object.keys(RECORD_ACCESS).sort(), ['all', 'none', 'own']);
    assert.deepEqual(Object.keys(DISPATCH_ACCESS).sort(), ['full', 'none', 'read', 'tech']);
});

test('activeMembersByRole counts who has access — not an invitation, not a deactivated member', () => {
    assert.deepEqual(activeMembersByRole([
        { role: 'Admin', active: true },
        { role: 'User' },
        { role: 'User', active: true },
        { role: 'User', active: false, status: 'Invited' },                    // an invitation not yet accepted
        { role: 'Manager', active: false, clerkUserId: 'user_x' },             // deactivated
        { role: 'Dispatcher', status: 'Invited' },
        null,
    ]), { Admin: 1, User: 2 });
    assert.deepEqual(activeMembersByRole(), {});
});

test('Fields & security: no grid, no levels, no save — it says per-field rules are not available', () => {
    const s = code(read('src/Tabs/settings/security/FlsDetail.jsx'));
    for (const ghost of ['FLS_OBJECT_FIELDS', 'FLS_LEVELS', 'Masked', 'creditScore', 'taxId', 'dateOfBirth', 'dbFetch', 'putSettings',
                         'useState', 'useEffect', 'setSettingsDirty', 'settingsSaveRef', 'useRegisterSave', 'Export CSV', 'fieldVisibility']) {
        assert.ok(!s.includes(ghost), `FlsDetail still carries "${ghost}"`);
    }
    assert.ok(s.includes('sub="Per-field rules are not available"'));
    assert.ok(s.includes('Roles &amp; permissions'), 'it points at what is enforced');
    assert.ok(s.includes('leaves the field out on the server, in every answer'), 'what real field-level security would take');
    assert.ok(read('src/Tabs/AdminView.jsx').includes("if (id === 'field-visibility') return <FlsDetail       onBack={onBack}/>;"), 'nothing to save, nothing to guard');
});

test('the field check nothing could switch on is gone, and its keys are out of both halves of settings.mjs', () => {
    for (const f of ['src/App.jsx', 'src/components/modals/OpportunityModal.jsx', 'src/Tabs/PipelineTab.jsx', 'src/Tabs/ReportsTab.jsx']) {
        assert.ok(!code(read(f)).includes('canViewField'), `${f}: canViewField`);
    }
    const s = code(read('netlify/functions/settings.mjs'));
    assert.ok(!s.includes('fieldVisibility'), 'read by nothing, written by nothing — the column stays, untouched');
    assert.ok(!s.includes('rolePermissions') && !/^\s+roles:/m.test(s), 'the mockup\'s two keys — the next save of a workspace drops them from its extra');
    assert.ok(!read('src/utils/settingsDefaults.js').includes('fieldVisibility'));
});

test('the catalogue cards for Roles and Field-level security describe the real thing', () => {
    const c = read('src/Tabs/settings/catalogue.js');
    assert.ok(/id:'roles',[^\n]*desc:'The six roles, and what each can see and change — enforced by the server'/.test(c));
    assert.ok(/id:'field-visibility',[^\n]*name:'Field-level security',[^\n]*status:'none', statusDetail:'Not available'/.test(c));
    assert.doesNotMatch(c, /Custom roles with granular object-level permissions|Role-based access control for individual fields/, 'the old promises');
    const cards = read('src/utils/settingsCards.js');
    assert.ok(cards.includes("if (item.id === 'roles')       statusDetail = plural(APP_ROLES.length, 'role');"));
    assert.ok(!cards.includes('fieldRuleCount') && !cards.includes('fieldVisibility'));
});
