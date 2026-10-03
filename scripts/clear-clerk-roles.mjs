// scripts/clear-clerk-roles.mjs — clear the role values left on Clerk USER
// records (state §0.164; Jeff, 3 Oct: "Clerk roles: clear").
//
// Since §0.163 the role this app enforces is the one on a person's row in each
// org's roster; nothing reads Clerk's user-level publicMetadata.role (or
// .managedReps) any more — tests/org-roles.test.mjs guards that. The values
// are left over, one per person for every org they are in, and only mislead
// whoever reads them in the Clerk dashboard.
//
// ORDER MATTERS: clear an instance only once every site that uses it runs
// §0.163 or later. A site still on older code reads these values on every
// request, and clearing them turns its every Admin into a rep. The dev instance
// serves localhost and accelerep.netlify.app; the live instance serves
// salespipelinetracker.com.
//
// READ ONLY unless --apply. Removes ONLY `role` and `managedReps` from each
// user's publicMetadata — Clerk's updateUserMetadata deep-merges, and a key set
// to null is removed; every other key (team, territory, name) is left alone.
// Then re-reads every user it changed and says whether the keys are gone.
//
//   node --env-file=.env scripts/clear-clerk-roles.mjs            (dry run)
//   node --env-file=.env scripts/clear-clerk-roles.mjs --apply    (the dev instance)
//   ... --apply --live                                             (a live key: required)
//
// NOTE: `set -a; source .env` is not an alternative — it executes the values as
// commands and echoes credentials. Use --env-file.
import { createClerkClient } from '@clerk/backend';

const APPLY = process.argv.includes('--apply');
const LIVE_OK = process.argv.includes('--live');
const KEYS = ['role', 'managedReps'];

const secret = process.env.CLERK_SECRET_KEY || '';
if (!secret) { console.error('CLERK_SECRET_KEY is not set (run with --env-file=.env).'); process.exit(1); }
const instance = secret.startsWith('sk_live_') ? 'LIVE (salespipelinetracker.com)'
               : secret.startsWith('sk_test_') ? 'dev (localhost, accelerep.netlify.app)'
               : 'UNKNOWN';
console.log(`Clerk instance: ${instance} — the key itself is not printed.`);
if (APPLY && instance.startsWith('LIVE') && !LIVE_OK) {
    console.error('Refusing: a LIVE key with --apply needs --live as well — and the live site must run §0.163 or later first.');
    process.exit(1);
}
if (APPLY && instance === 'UNKNOWN') { console.error('Refusing: the key is neither sk_test_ nor sk_live_.'); process.exit(1); }

const clerk = createClerkClient({ secretKey: secret });
const list = (p) => (Array.isArray(p) ? p : p?.data || []);

const holders = [];
for (let offset = 0; ; offset += 100) {
    const page = list(await clerk.users.getUserList({ limit: 100, offset }));
    for (const u of page) {
        const meta = u.publicMetadata || {};
        const present = KEYS.filter((k) => k in meta);
        if (present.length) {
            holders.push({
                id: u.id,
                name: [u.firstName, u.lastName].filter(Boolean).join(' ') || '(no name)',
                values: Object.fromEntries(present.map((k) => [k, meta[k]])),
            });
        }
    }
    if (page.length < 100) break;
}

console.log(`${holders.length} user(s) hold ${KEYS.join(' / ')} in publicMetadata:`);
for (const h of holders) console.log(`  ${h.name.padEnd(28)} ${JSON.stringify(h.values)}`);
// No process.exit() once Clerk has been called: on Windows it can abort while
// the client's keep-alive sockets close (a libuv assertion). exitCode instead.
if (!APPLY) {
    console.log('\nDry run — nothing changed. Re-run with --apply once every site on this instance runs §0.163 or later.');
} else {
    let cleared = 0, failed = 0;
    for (const h of holders) {
        try {
            await clerk.users.updateUserMetadata(h.id, { publicMetadata: Object.fromEntries(Object.keys(h.values).map((k) => [k, null])) });
            const after = (await clerk.users.getUser(h.id)).publicMetadata || {};
            const left = KEYS.filter((k) => k in after);
            if (left.length) { failed++; console.log(`  STILL THERE  ${h.name}: ${left.join(', ')}`); }
            else { cleared++; console.log(`  cleared      ${h.name}  (kept: ${Object.keys(after).join(', ') || 'nothing else'})`); }
        } catch (e) {
            failed++;
            console.log(`  FAILED       ${h.name}: ${e?.errors?.[0]?.message || e.message}`);
        }
    }
    console.log(`\n${cleared} cleared, ${failed} not.`);
    process.exitCode = failed ? 1 : 0;
}
