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

test('the settings autosave diffs against the server baseline before PUTting', () => {
    assert.ok(hookSrc.includes('if (json === lastSavedRef.current) return;'),
        'without the no-change guard, every load mirror-back and roster refresh PUTs an unchanged payload — junk settings.updated audits for admins, naked 403 toasts for non-writers');
    const baselines = hookSrc.match(/lastSavedRef\.current = serializeForSave\(next\);/g) || [];
    assert.equal(baselines.length, 2,
        'both load paths (settings present / absent) must adopt what arrived as the baseline, or the first edit after load is swallowed as baseline instead of saved');
    assert.ok(hookSrc.includes('lastSavedRef.current = json;'),
        'an accepted PUT must advance the baseline, or the next unrelated settings change re-sends the same payload');
});
