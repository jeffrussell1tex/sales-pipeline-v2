// tests/session-status.test.mjs
//
// A session Clerk has parked as PENDING -- "Require multi-factor authentication"
// on, user not enrolled -- still gets a user object on the client and a signed
// v2 token carrying `sts: "pending"`. Clerk's own helpers treat that as signed
// out; this app did not (0.65, observed on Development as Karen: the app shell
// rendered, opportunities answered 200). Two gates now close it, and both are
// pinned here: the server refusal as a pure function, and the wiring of both
// gates as a source scan, because verifyAuth needs Clerk to run and the client
// gate lives in React.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pendingSessionRefusal } from '../netlify/functions/auth.mjs';

const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

// ── The refusal ─────────────────────────────────────────────────────────────

test('a pending session token is refused with 401 and says why', () => {
    const r = pendingSessionRefusal({ sub: 'user_1', sts: 'pending', v: 2 });
    assert.ok(r, 'must refuse');
    assert.equal(r.status, 401);
    assert.match(r.error, /pending/i);
    assert.match(r.error, /multi-factor|sign-in/i, 'the message names what to do');
});

test('an active session token passes', () => {
    assert.equal(pendingSessionRefusal({ sub: 'user_1', sts: 'active', v: 2 }), null);
});

test('a token with no sts claim passes — v1 tokens have no pending state', () => {
    // Refusing these would lock out every session issued before the claim
    // existed. Absence is not pending.
    assert.equal(pendingSessionRefusal({ sub: 'user_1' }), null);
    assert.equal(pendingSessionRefusal({ sub: 'user_1', sts: undefined }), null);
});

test('any other non-active status is refused too', () => {
    // The gate is "active or nothing", not "not pending": a new status Clerk
    // adds later must not walk through by being unrecognised (18b20).
    assert.ok(pendingSessionRefusal({ sub: 'user_1', sts: 'expired' }));
    assert.ok(pendingSessionRefusal({ sub: 'user_1', sts: '' }));
});

// ── The wiring, pinned as text ──────────────────────────────────────────────

test('verifyAuth refuses a pending token BEFORE caching or reading the user', () => {
    const auth = src('../netlify/functions/auth.mjs');
    const call  = auth.indexOf('pendingSessionRefusal(payload)');
    const cache = auth.indexOf('authCache.set(token');
    const user  = auth.indexOf('clerk.users.getUser(userId)');
    assert.ok(call > 0, 'verifyAuth must call pendingSessionRefusal on the verified payload');
    assert.ok(call < user,  'the refusal must come before the user lookup');
    assert.ok(call < cache, 'a refused token must never be cached as a result');
    assert.match(auth.slice(call, call + 160), /if \(pending\) return pending;/, 'and the refusal must be RETURNED, not logged');
});

test('App.jsx trusts the Clerk user only while useAuth says the session is signed in', () => {
    const app = src('../src/App.jsx');
    assert.match(app, /const \{ getToken, isSignedIn \} = useAuth\(\);/, 'isSignedIn must come from useAuth, the only hook that applies treatPendingAsSignedOut');
    assert.match(app, /const clerkUser = isSignedIn \? rawClerkUser : null;/, 'the user the app gates on must be null while pending');
    assert.doesNotMatch(app, /const \{ user: clerkUser, isLoaded: clerkLoaded \} = useUser\(\);/, 'useUser() must not be the gate');
});
