// tests/fetch-status.test.mjs
//
// Two carried items (handoff §5): a 401/403 rendered as "Database connection
// lost", and the Settings catalogue's MFA card carrying hand-typed status
// text. dbStatusOf / bannerCopyOf / mfaCardOf are pure; the scan pins the
// wiring in every loader, the banner, AdminView and the catalogue.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dbStatusOf, bannerCopyOf, mfaCardOf } from '../src/utils/fetchStatus.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('dbStatusOf: ok → false, 401/403 → auth, any other non-ok → outage', () => {
    assert.equal(dbStatusOf({ ok: true, status: 200 }), false);
    assert.equal(dbStatusOf({ ok: false, status: 401 }), 'auth');
    assert.equal(dbStatusOf({ ok: false, status: 403 }), 'auth');
    assert.equal(dbStatusOf({ ok: false, status: 500 }), true);
    assert.equal(dbStatusOf({ ok: false, status: 404 }), true);
    assert.equal(dbStatusOf(null), false);
});

test('bannerCopyOf: the auth state names sign-in, not the database', () => {
    const auth = bannerCopyOf('auth');
    assert.equal(auth.tone, 'auth');
    assert.match(auth.text, /sign in again/);
    assert.doesNotMatch(auth.text, /Database/);
    const outage = bannerCopyOf(true);
    assert.equal(outage.tone, 'outage');
    assert.match(outage.text, /Database connection lost/);
});

test('mfaCardOf: live enrolment → chip, detail and attention; unknown → null', () => {
    assert.deepEqual(mfaCardOf({ enrolled: 2, total: 4 }), { status: 'partial', detail: '2/4 enrolled · 50%', attention: true });
    assert.deepEqual(mfaCardOf({ enrolled: 4, total: 4 }), { status: 'ok', detail: '4/4 enrolled · 100%', attention: false });
    assert.deepEqual(mfaCardOf({ enrolled: 0, total: 0 }), { status: 'partial', detail: 'No users yet', attention: false });
    assert.equal(mfaCardOf(null), null, 'fetch failed or not an Admin');
    assert.equal(mfaCardOf({}), null);
});

test('every loader reports through dbStatusOf; nothing sets the outage flag on a bare non-ok', () => {
    const files = ['src/hooks/useAccounts.js', 'src/hooks/useActivities.js', 'src/hooks/useContacts.js', 'src/hooks/useOpportunities.js', 'src/hooks/useTasks.js', 'src/hooks/useDocuments.js', 'src/hooks/useQuotes.js', 'src/App.jsx'];
    for (const f of files) {
        const src = read(f);
        assert.ok(!src.includes('setDbOffline(true)'), `${f}: a bare setDbOffline(true)`);
        assert.ok(src.includes('dbStatusOf('), `${f}: reports through dbStatusOf`);
        assert.ok(src.includes("from '../utils/fetchStatus'") || src.includes("from './utils/fetchStatus'"), `${f}: imports the helper`);
    }
    const app = read('src/App.jsx');
    assert.ok(app.includes('<span>{bannerCopyOf(dbOffline).text}</span>'), 'the banner copy comes from the state');
    assert.ok(app.includes("background: dbOffline === 'auth' ? '#b45309' : '#dc2626'"), 'the auth banner is amber, the outage banner red');
    assert.ok(!app.includes('<span>Database connection lost'), 'no hardcoded outage sentence');
});

test('the MFA panel notice does not tell an Admin to turn on a policy the app cannot read', () => {
    const src = read('src/Tabs/settings/security/MfaDetail.jsx');
    assert.ok(!src.includes('Turn on Require multi-factor authentication'), 'asserts the policy is off');
    assert.ok(src.includes('This app cannot read that setting'), 'says what it does not know');
});

test('the MFA catalogue card reads live enrolment and carries no invented text', () => {
    const cat = read('src/Tabs/settings/catalogue.js');
    const row = cat.split('\n').find(l => l.includes("id:'mfa'"));
    assert.ok(row, 'the mfa row');
    assert.ok(!row.includes('not all enrolled') && !row.includes('3 months ago') && !row.includes('Enforce MFA'), 'hand-typed status text');
    assert.ok(row.includes("managedIn:'Clerk'"));
    // isNew left the catalogue altogether in §0.88 (a badge that never expired said nothing).
    assert.ok(row.includes("attention:false") && !/isNew/.test(row));
    const av = read('src/Tabs/AdminView.jsx');
    const sc = read('src/utils/settingsCards.js');   // the card-state block moved out of V2Card (§0.81)
    assert.ok(av.includes("dbFetch('/.netlify/functions/clerk-mfa-status'),"), 'AdminView fetches enrolment with the other live counts');
    assert.ok(sc.includes('const card = mfaCardOf(liveCounts.mfa);'));
    assert.ok(sc.includes("status = card?.status ?? 'none';"));
    assert.ok(sc.includes('attention = !!card?.attention;'));
    assert.ok(av.includes('const { status, statusDetail, attention } = cardStateOf(item, settings, liveCounts);'), 'the card reads the module');
    assert.ok(av.includes("<StatusChip status={status} detail={statusDetail || (status === 'none' ? 'No data' : null)} small/>"), 'the chip reads the computed status');
    assert.ok(av.includes('{attention && <span'), 'Needs attention reads the computed flag');
    assert.ok(av.includes('item.managedIn ? `Managed in ${item.managedIn}`'), 'no invented edit history on a Clerk-managed card');
    assert.ok(!av.includes("if (item.id === 'mfa')     statusDetail = null;"));
});
