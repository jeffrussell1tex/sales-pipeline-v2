// tests/roster-provision.test.mjs
//
// State §0.108. The production workspace had no roster rows at all: nothing
// created one until an Admin pressed Sync in Settings, so its Admin's
// integration request recorded no name, and everything they created was
// unowned (an unresolvable caller stamps null — §18b20). Now the self-profile
// GET provisions the caller's row from Clerk when nothing matches, and the
// request function does the same for an unrostered requester. The helper is
// exercised against the real test database in
// tests/integration/integration-requests.itest.mjs; these scans pin the wiring
// and the one rule that matters: the role is VALIDATED, never copied raw.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const code = (src) => src.split(/\r?\n/).filter(l => !l.trim().startsWith('//')).join('\n');

test('ensureRosterRow: our id, the Clerk id in its column, a VALIDATED role, the sync\'s profile shape, idempotent by Clerk id then email, never throws', () => {
    const s = code(read('netlify/functions/_lib.mjs'));
    assert.ok(s.includes('export async function ensureRosterRow({ clerkUserId, orgId, userRole, clerkUser } = {}) {'));
    assert.ok(s.includes('        if (byId) return byId;'), 'an existing row by Clerk id is returned untouched');
    assert.ok(s.includes('            if (byEmail) return byEmail;   // an invited row: users.mjs ?me=true links it'), 'an invited row by email is returned, not duplicated, not linked here');
    assert.ok(s.includes("        const { isAppRole } = await import('./auth.mjs');"), 'the role vocabulary is the one in auth.mjs, imported lazily so a mocked auth module still loads _lib');
    assert.ok(s.includes("        const role = ok(rawRole) ? rawRole : ok(userRole) ? userRole : 'User';"), 'REGRESSION: the role is validated — Clerk\'s value only when it is one of ours, else the verified role, else User');
    assert.ok(s.includes("            id: 'usr_' + randomUUID(), clerkUserId, orgId, name, email: email || `${clerkUserId}@no-email.invalid`, role,"), 'our usr_ id; the Clerk id in its own column');
    assert.ok(s.includes("            active: true, profile: { status: 'Active', userType: role }, updatedAt: new Date(),"), 'the shape users-sync.mjs creates');
    assert.ok(s.includes('        }).onConflictDoNothing().returning();'), 'a race on the per-org unique index is not an error');
    assert.ok(s.includes('        invalidateRoster(orgId);'), 'the 30 s "no roster row" answer in the caller cache is dropped');
    assert.ok(s.includes("        console.warn('_lib.ensureRosterRow:', e.message);"), 'never throws');
});

test('the self-profile GET provisions when nothing matched; the request function provisions an unrostered requester', () => {
    const u = code(read('netlify/functions/users.mjs'));
    assert.ok(u.includes("import { serverErrorBody, resolveCaller, invalidateRoster, getCallerName, ensureRosterRow } from './_lib.mjs';"));
    const line = '                if (!row) row = await ensureRosterRow({ clerkUserId: userId, orgId, userRole, clerkUser });';
    assert.ok(u.includes(line), 'REGRESSION (§0.108): a member with no roster row gets one on their first load');
    const linkEnd = u.indexOf("console.warn('users.mjs: link update failed:'");
    const ret = u.indexOf("return { statusCode: 200, headers, body: JSON.stringify({ user: row ? flatten(row) : null }) };");
    assert.ok(linkEnd > 0 && u.indexOf(line) > linkEnd && u.indexOf(line) < ret, 'after the link attempt, before the answer — the Clerk user already fetched is handed in');
    const r = code(read('netlify/functions/integration-requests.mjs'));
    assert.match(r, /import \{ [^}]*ensureRosterRow[^}]* \} from '\.\/_lib\.mjs';/);
    assert.ok(r.includes('        const made = await ensureRosterRow({ clerkUserId, orgId });'), 'REGRESSION: a request from an unrostered user provisions the row, so the mail and the record carry a name');
    assert.ok(r.includes('        return made ? { name: made.name, email: made.email } : null;'));
});
