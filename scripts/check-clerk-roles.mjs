// scripts/check-clerk-roles.mjs — READ ONLY. Writes nothing, to Clerk or the DB.
//
// WHY THIS EXISTS
//
// auth.mjs now ALLOWS three roles rather than DENYING two. That is the correct
// direction (18b20.2: absence of a known role is not a permission), but it has a
// blast radius: anyone whose Clerk publicMetadata.role holds a value outside
// APP_ROLES had full write access under the old blocklist and has none under the
// new allowlist. They will get a 403 on every save.
//
// At least one path could produce exactly that: the invite screen seeded its rows
// with 'Sales Rep' — the display LABEL for 'User' — and users.mjs wrote whatever
// it was given straight into publicMetadata. Both are fixed, but a value already
// written to Clerk stays written.
//
// So: run this BEFORE deploying. If it reports nothing, the change is invisible
// to every user. If it reports someone, fix their role first — Settings → People
// & Teams → the user → Role — and run it again.
//
//   node --env-file=.env scripts/check-clerk-roles.mjs
//   node --env-file=.env scripts/check-clerk-roles.mjs --org=org_2abc...
//
// Exits 1 if anything was found, so it can gate a deploy.
//
// NOTE: `set -a; source .env` is not an alternative — it executes the values as
// commands and echoes credentials. Use --env-file.
import { createClerkClient } from '@clerk/backend';

const APP_ROLES = ['Admin', 'Manager', 'User', 'ReadOnly', 'Technician'];

const secret = process.env.CLERK_SECRET_KEY;
if (!secret) {
    console.error('CLERK_SECRET_KEY is not set. Run with: node --env-file=.env scripts/check-clerk-roles.mjs');
    process.exit(2);
}
const clerk = createClerkClient({ secretKey: secret });

const argOrgs = process.argv.slice(2)
    .filter((a) => a.startsWith('--org='))
    .map((a) => a.slice('--org='.length))
    .filter(Boolean);

const page = (res) => res?.data || res || [];

async function listOrgs() {
    if (argOrgs.length) return argOrgs.map((id) => ({ id, name: id }));
    const orgs = [];
    let offset = 0;
    while (true) {
        const batch = page(await clerk.organizations.getOrganizationList({ limit: 100, offset }));
        if (!batch.length) break;
        orgs.push(...batch.map((o) => ({ id: o.id, name: o.name || o.id })));
        if (batch.length < 100) break;
        offset += 100;
    }
    return orgs;
}

async function membersOf(organizationId) {
    const members = [];
    let offset = 0;
    while (true) {
        const batch = page(await clerk.organizations.getOrganizationMembershipList({ organizationId, limit: 100, offset }));
        if (!batch.length) break;
        members.push(...batch);
        if (batch.length < 100) break;
        offset += 100;
    }
    return members;
}

let findings = 0;
let scanned = 0;

let orgs;
try {
    orgs = await listOrgs();
} catch (e) {
    console.error('Could not list organizations:', e.message);
    console.error('Pass them explicitly instead:  --org=org_xxx --org=org_yyy');
    process.exit(2);
}

console.log(`Checking ${orgs.length} organization(s) against: ${APP_ROLES.join(' | ')}\n`);

for (const org of orgs) {
    let members;
    try {
        members = await membersOf(org.id);
    } catch (e) {
        console.error(`  ! ${org.name} (${org.id}): could not list members — ${e.message}`);
        continue;
    }

    for (const m of members) {
        const userId = m.publicUserData?.userId || m.userId;
        if (!userId) continue;
        scanned++;

        let user;
        try { user = await clerk.users.getUser(userId); }
        catch (e) { console.error(`  ! ${org.name}: could not read user ${userId} — ${e.message}`); continue; }

        const role  = user.publicMetadata?.role;
        const email = user.emailAddresses?.[0]?.emailAddress || '(no email)';
        const name  = [user.firstName, user.lastName].filter(Boolean).join(' ') || email;

        // ABSENT is fine and always has been: auth.mjs reads `meta.role || 'User'`,
        // so these users are reps today and stay reps. Only a PRESENT value outside
        // the list changes behaviour under the allowlist.
        if (role === undefined || role === null || role === '') continue;
        if (APP_ROLES.includes(role)) continue;

        findings++;
        console.log(`  ${org.name} (${org.id})`);
        console.log(`    ${name} <${email}>`);
        console.log(`    publicMetadata.role = ${JSON.stringify(role)}  ← not an Accelerep role`);
        console.log(`    clerk org role      = ${m.role || '(none)'}`);
        console.log(`    Effect after deploy : every write returns 403 until this is set to one of ${APP_ROLES.join(' | ')}\n`);
    }
}

console.log(`Scanned ${scanned} membership(s).`);
if (findings) {
    console.log(`\n${findings} user(s) hold a role no gate recognises.`);
    console.log('Fix each one in Settings → People & Teams → <user> → Role, then re-run this check.');
    process.exit(1);
}
console.log('No unrecognised roles. The requireWrite change is a no-op for every current user.');
