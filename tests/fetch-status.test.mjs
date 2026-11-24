// tests/fetch-status.test.mjs
//
// Two carried items (handoff §5): a 401/403 rendered as "Database connection
// lost", and the Settings catalogue's MFA card carrying hand-typed status
// text. dbStatusOf / mfaCardOf are pure; the scan pins the wiring in every
// loader, the banner, AdminView and the catalogue.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dbStatusOf, SIGN_IN_WORDS, mfaCardOf } from '../src/utils/fetchStatus.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('dbStatusOf: ok → false, 401/403 → auth, any other non-ok → outage', () => {
    assert.equal(dbStatusOf({ ok: true, status: 200 }), false);
    assert.equal(dbStatusOf({ ok: false, status: 401 }), 'auth');
    assert.equal(dbStatusOf({ ok: false, status: 403 }), 'auth');
    assert.equal(dbStatusOf({ ok: false, status: 500 }), true);
    assert.equal(dbStatusOf({ ok: false, status: 404 }), true);
    assert.equal(dbStatusOf(null), false);
});

test('the auth words name sign-in, not the database', () => {
    assert.match(SIGN_IN_WORDS, /sign in again/);
    assert.doesNotMatch(SIGN_IN_WORDS, /Database|check your connection/i);
});

test('mfaCardOf: live enrolment → chip, detail and attention; unknown → null', () => {
    assert.deepEqual(mfaCardOf({ enrolled: 2, total: 4 }), { status: 'partial', detail: '2/4 enrolled · 50%', attention: true });
    assert.deepEqual(mfaCardOf({ enrolled: 4, total: 4 }), { status: 'ok', detail: '4/4 enrolled · 100%', attention: false });
    assert.deepEqual(mfaCardOf({ enrolled: 0, total: 0 }), { status: 'partial', detail: 'No users yet', attention: false });
    assert.equal(mfaCardOf(null), null, 'fetch failed or not an Admin');
    assert.equal(mfaCardOf({}), null);
});

// Moved in §0.294: the loads read dbStatusOf through the one loader (readList), and the banner's words are loadsBanner's
// (tests/list-loads.test.mjs RUNS both).
test('every loader goes through readList, which reads dbStatusOf; nothing keeps an outage flag of its own', () => {
    for (const [f, lists] of [['src/hooks/useAccounts.js', ['accounts']], ['src/hooks/useActivities.js', ['activities']], ['src/hooks/useContacts.js', ['contacts']], ['src/hooks/useOpportunities.js', ['opportunities']],
        ['src/hooks/useTasks.js', ['tasks']], ['src/hooks/useDocuments.js', ['documents']], ['src/hooks/useQuotes.js', ['quotes', 'products']], ['src/App.jsx', ['leads']]]) {
        const src = read(f);
        assert.ok(!/dbOffline|setDbOffline/i.test(src), `${f}: an outage flag of its own`);
        for (const l of lists) assert.ok(src.includes(`readList('${l}', {`), `${f}: ${l} through readList`);
        assert.ok(/import \{[^}]*\breadList\b[^}]*\} from '\.\.?\/utils\/listLoads\.js'/.test(src), `${f}: imports the loader`);
    }
    assert.ok(read('src/utils/listLoads.js').includes("auth: dbStatusOf(r) === 'auth'"), 'the one loader tells a refused sign-in from an outage');
    const app = read('src/App.jsx');
    assert.ok(app.includes('<span>{loadBanner.text}</span>'), 'the banner copy comes from the loads');
    // Tokens since the blue-era sweep (state §0.136): warn for the auth banner, danger for the outage.
    assert.ok(app.includes("background: loadBanner.tone === 'auth' ? T.warn : T.danger"), 'the auth banner is amber, the outage banner red');
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
