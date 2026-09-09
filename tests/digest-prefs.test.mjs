// tests/digest-prefs.test.mjs
//
// State §0.101. `bf4a3c5` (7 Apr 2026, "text bug fix 2") touched TWO files:
// pipeline-alerts.mjs — fixed in §0.95 — and digest.mjs, where the same rename
// left `wantsDigest` and `wantsSms` reading `profile`, a name bound only inside
// the handler's user loop. The first user whose digest hour matched the clock
// threw ReferenceError, the outer catch answered 500, and Netlify retried the
// run twice — six `error` stamps a day on every site's heartbeat row (08:00 and
// 13:00 UTC, every roster member being 08:00 local in UTC or Chicago) and no
// digest of any kind since April. The Monday manager block had two more: it
// read `resolvedProfile` (the rep loop's const, out of scope) and selected
// managers by `u.userType`, a key the users table does not have (`role` is the
// column; `userType` lives inside the profile jsonb) — so no manager had ever
// matched. As in tests/pipeline-alerts.test.mjs the helpers are lifted out of
// the source text and RUN with nothing but the globals in scope.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../netlify/functions/digest.mjs', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const code = src.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');

const fnSrc = (name) => {
    const m = src.match(new RegExp(`^function ${name}\\([^)]*\\) \\{[\\s\\S]*?^\\}`, 'm'));
    assert.ok(m, `${name} is a top-level function declaration in digest.mjs`);
    return m[0];
};
const defaults = src.match(/^const DEFAULT_PREFS = \{[\s\S]*?^\};/m)?.[0];
assert.ok(defaults, 'DEFAULT_PREFS is a top-level const');

// Instantiated with nothing but the standard globals: no db, no imports, and
// no `profile` — exactly the scope the helper has in the module.
const wantsDigest = new Function(`${defaults}\n${fnSrc('getPref')}\n${fnSrc('wantsDigest')}\nreturn wantsDigest;`)();
const wantsSms    = new Function(`${fnSrc('wantsSms')}\nreturn wantsSms;`)();

test('REGRESSION: wantsDigest reads the profile it is handed — the body had read a name bound only inside the user loop', () => {
    assert.equal(wantsDigest({ notificationPrefs: { taskDigest: { enabled: true,  mode: 'digest'  } } }, 'taskDigest'), true);
    assert.equal(wantsDigest({ notificationPrefs: { taskDigest: { enabled: false, mode: 'digest'  } } }, 'taskDigest'), false, 'a disabled preference is honoured');
    assert.equal(wantsDigest({ notificationPrefs: { taskDigest: { enabled: true,  mode: 'instant' } } }, 'taskDigest'), false, 'instant is not digest');
    assert.equal(wantsDigest({ notificationPrefs: {} }, 'overdueTaskNudge'), true, 'an unset preference falls back to the default (digest, on)');
    assert.equal(wantsDigest({ notificationPrefs: {} }, 'stageChanged'), false, 'the default for stageChanged is instant, so no digest');
    assert.equal(wantsDigest({}, 'managerTeamDigest'), true, 'no prefs at all: the default');
    assert.equal(wantsDigest(undefined, 'taskDigest'), true, 'no profile at all: the default, not a throw');
    assert.equal(wantsDigest({ notificationPrefs: {} }, 'notAnAlertType'), false, 'an unknown type is off');
});

test('REGRESSION: wantsSms reads the profile it is handed', () => {
    assert.equal(wantsSms({ smsNotifications: { enabled: true,  digest: true  } }, 'digest'), true);
    assert.equal(wantsSms({ smsNotifications: { enabled: true,  digest: false } }, 'digest'), false, 'SMS on but not for the digest');
    assert.equal(wantsSms({ smsNotifications: { enabled: false, digest: true  } }, 'digest'), false, 'SMS off globally');
    assert.equal(wantsSms({ smsNotifications: { enabled: true,  digest: 'yes' } }, 'digest'), false, 'the key must be boolean true');
    assert.equal(wantsSms({}, 'digest'), false, 'no SMS prefs: off');
    assert.equal(wantsSms(undefined, 'digest'), false, 'no profile: off, not a throw');
});

test('neither helper names the loop-scoped binding; the rep loop hands them resolvedProfile; the manager loop reads its own row', () => {
    assert.doesNotMatch(fnSrc('wantsDigest'), /\bprofile\b/, 'wantsDigest reads only its parameter');
    assert.doesNotMatch(fnSrc('wantsSms'),    /\bprofile\b/, 'wantsSms reads only its parameter');
    assert.equal((code.match(/wantsDigest\(resolvedProfile, '/g) || []).length, 5, 'the five rep-side digests check the rep\'s resolved profile');
    assert.equal((code.match(/wantsSms\(resolvedProfile, 'digest'\)/g) || []).length, 2, 'the two SMS follow-ups check the rep\'s SMS preference');
    // The manager block: its own `profile` (declared the line above), never the rep loop's const.
    assert.match(code, /const profile = mgr\.profile \|\| \{\};\n\s*if \(!wantsDigest\(profile, 'managerTeamDigest'\)\) continue;/, 'REGRESSION: the manager check reads the manager\'s profile — it had read resolvedProfile, out of scope');
    const managerBlock = code.slice(code.indexOf('const isMonday'));
    assert.doesNotMatch(managerBlock, /resolvedProfile/, 'the rep loop\'s const is not named after the loop ends');
});

test('REGRESSION: managers and reps are selected by the role COLUMN — userType is a profile-jsonb key the row never carries', () => {
    assert.doesNotMatch(code, /\.userType\b/, 'no read of userType on a users row');
    assert.match(code, /u\.email && u\.active &&\n\s*\(u\.role === 'Manager' \|\| u\.role === 'Admin'\)/, 'the Monday managers are Manager or Admin by role');
    assert.match(code, /allUsers\.filter\(u => u\.role === 'User'\)/, 'the reps a manager sees are role User');
});
