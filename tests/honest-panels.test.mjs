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
    // The keys that stay are the streaming pair (built for real in the next batch).
    assert.equal((s.match(/streamingDestinations:/g) || []).length, 2, 'GET and PUT halves');
    assert.equal((s.match(/streamingGlobals:/g) || []).length, 2, 'GET and PUT halves');
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
