// Source assertions for the §0.54-queued settings hygiene pair, fixed 2 Sep:
// audit actor attribution in users.mjs and the useSettings autosave baseline.
// Behavior spans a Clerk-authed endpoint and a React hook — neither reachable
// from `npm test` — so the rules are pinned where the mutation harness can
// see them (§18b23).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const codeOnly = (src) =>
    src.split(/\r?\n/).filter((l) => !l.trim().startsWith('//')).join('\n');

const usersSrc = codeOnly(readFileSync(new URL('../netlify/functions/users.mjs', import.meta.url), 'utf8'));
const hookSrc  = codeOnly(readFileSync(new URL('../src/hooks/useSettings.js', import.meta.url), 'utf8'));

test('users.mjs audit rows attribute the CALLER as actor, never the target', () => {
    const resolved = usersSrc.match(/await getCallerName\(userId, orgId\)/g) || [];
    assert.ok(resolved.length >= 4,
        `all four writeAudit sites (created/updated/deleted/cleared) must resolve the caller's name — found ${resolved.length}`);
    assert.equal(/writeAudit\(orgId, 'user\.(created|updated)', result\.id, result\.name, userId, result\.name\)/.test(usersSrc), false,
        'the target-as-actor shape must not return: every user.updated row read as the subject acting on themselves');
});

test('the settings hook writes nothing — no autosave, so no baseline to keep (state §0.170)', () => {
    // The no-change guard this pinned (§0.54) stopped the autosave's junk PUTs;
    // §0.170 took the autosave out — each screen saves the keys it owns.
    assert.ok(!/dbWrite|method:\s*'PUT'|lastSavedRef|serializeForSave/.test(hookSrc),
        'a background PUT of the whole object put back newer saves, wrote every save twice, and logged every key it held');
    assert.ok(!/settingsSaveError|handleAddTaskType|handleUpdateFiscalYearStart|settingsReady/.test(hookSrc),
        'its save error, its unused handlers and its ready flag went with it');
});
