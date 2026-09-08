// tests/pipeline-alerts.test.mjs
//
// State §0.95. `bf4a3c5` (7 Apr 2026, "text bug fix 2") renamed the parameter
// of wantsAlert and wantsSms from `profile` to `resolvedProfile` and left both
// bodies reading `profile` — a name bound only inside the handler's deal loop.
// The first wantsAlert call threw ReferenceError, the handler's outer catch
// answered 500, and the hourly job sent no alert of any kind (email, SMS,
// Slack), to any org, for five months. No gate covers this: check-tdz inspects
// Capitalised components under src/, and a lowercase helper in a Netlify
// function is outside every scanner. So the two helpers are lifted out of the
// source text and RUN here — a body that reads a name it was not handed fails
// this suite, whatever the parameter is called.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../netlify/functions/pipeline-alerts.mjs', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

// A top-level `function name(...) { … }` — from its first line to the first
// line that is exactly `}` — as text.
const fnSrc = (name) => {
    const m = src.match(new RegExp(`^function ${name}\\([^)]*\\) \\{[\\s\\S]*?^\\}`, 'm'));
    assert.ok(m, `${name} is a top-level function declaration in pipeline-alerts.mjs`);
    return m[0];
};
const defaults = src.match(/^const DEFAULT_PREFS = \{[\s\S]*?^\};/m)?.[0];
assert.ok(defaults, 'DEFAULT_PREFS is a top-level const');

// Instantiated with nothing but the standard globals: no db, no imports, and
// no `profile` — exactly the scope the helper has in the module.
const wantsAlert = new Function(`${defaults}\n${fnSrc('wantsAlert')}\nreturn wantsAlert;`)();
const wantsSms   = new Function(`${fnSrc('wantsSms')}\nreturn wantsSms;`)();

test('REGRESSION: wantsAlert reads the profile it is handed — the body had read a name bound only inside the deal loop', () => {
    assert.equal(wantsAlert({ notificationPrefs: { dealSilent: { enabled: false } } }, 'dealSilent'), false, 'a disabled preference is honoured');
    assert.equal(wantsAlert({ notificationPrefs: { dealSilent: { enabled: true } } }, 'dealSilent'), true);
    assert.equal(wantsAlert({ notificationPrefs: {} }, 'dealStuck'), true, 'an unset preference falls back to the default (on)');
    assert.equal(wantsAlert({}, 'dealMomentum'), true, 'no prefs at all: the default');
    assert.equal(wantsAlert(undefined, 'closeLapsed'), true, 'no profile at all: the default, not a throw');
    assert.equal(wantsAlert({ notificationPrefs: {} }, 'notAnAlertType'), false, 'an unknown type is off');
    assert.equal(wantsAlert({ notificationPrefs: { scoreDropAlert: { enabled: 'yes' } } }, 'scoreDropAlert'), false, 'enabled must be boolean true');
});

test('REGRESSION: wantsSms reads the profile it is handed', () => {
    assert.equal(wantsSms({ smsNotifications: { enabled: true,  pipelineAlerts: true  } }), true);
    assert.equal(wantsSms({ smsNotifications: { enabled: true,  pipelineAlerts: false } }), false, 'SMS on but not for pipeline alerts');
    assert.equal(wantsSms({ smsNotifications: { enabled: false, pipelineAlerts: true  } }), false, 'SMS off globally');
    assert.equal(wantsSms({}), false, 'no SMS prefs: off');
    assert.equal(wantsSms(undefined), false, 'no profile: off, not a throw');
});

test('neither helper names the loop-scoped binding, and every rep-side call hands them resolvedProfile', () => {
    assert.doesNotMatch(fnSrc('wantsAlert'), /\bprofile\b/, 'wantsAlert reads only its parameter');
    assert.doesNotMatch(fnSrc('wantsSms'),   /\bprofile\b/, 'wantsSms reads only its parameter');
    assert.equal((src.match(/wantsAlert\(resolvedProfile, '/g) || []).length, 5, 'the five signals check the rep\'s resolved profile');
    assert.equal((src.match(/if \(wantsSms\(resolvedProfile\) && smsPhone\)/g) || []).length, 3, 'signals 1–3 (silent, stuck, lapsed) check the rep\'s SMS preference; momentum and score drop send no SMS');
    assert.equal((src.match(/wantsSms\(manager\.profile \|\| \{\}\)/g) || []).length, 3, 'and their manager copies check the manager\'s');
    assert.equal((src.match(/wantsAlert\(manager\.profile \|\| \{\}, 'managerAlerts'\)/g) || []).length, 4, 'the four manager copies read the manager\'s profile blob (top-level prefs not consulted — noted in §0.95)');
});
