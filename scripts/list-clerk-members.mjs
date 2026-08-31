// scripts/list-clerk-members.mjs — READ ONLY. Same calls as check-clerk-roles.mjs,
// but prints EVERY membership instead of only findings.
//
// WHY: the mirror's email column is the ROSTER email; Clerk sign-in wants the
// CLERK account's identifier, and users.mjs links rows by email OR display-name
// fallback — so the two can differ. This prints, per org: each member's Clerk
// primary email (the one sign-in recognises), name, publicMetadata.role, the
// Clerk org role, and the userId, so a mirror row can be matched to the actual
// account behind it.
//
//   node --env-file=.env.clerk-prod scripts/list-clerk-members.mjs
//   node --env-file=.env.clerk-prod scripts/list-clerk-members.mjs --org=org_3Cwn...
import { createClerkClient } from '@clerk/backend';

const secret = process.env.CLERK_SECRET_KEY;
if (!secret) {
    console.error('CLERK_SECRET_KEY is not set. Run with: node --env-file=.env.clerk-prod scripts/list-clerk-members.mjs');
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

let orgs;
try {
    orgs = await listOrgs();
} catch (e) {
    console.error('Could not list organizations:', e.message);
    process.exit(2);
}

for (const org of orgs) {
    let members;
    try {
        members = await membersOf(org.id);
    } catch (e) {
        console.error(`! ${org.name} (${org.id}): could not list members — ${e.message}`);
        continue;
    }

    console.log(`\n${org.name} (${org.id}) — ${members.length} member(s)`);
    for (const m of members) {
        const userId = m.publicUserData?.userId || m.userId;
        if (!userId) { console.log('  (membership with no userId)'); continue; }

        let user;
        try { user = await clerk.users.getUser(userId); }
        catch (e) { console.log(`  ! could not read user ${userId} — ${e.message}`); continue; }

        const emails  = (user.emailAddresses || []).map((e) => e.emailAddress);
        const primary = user.primaryEmailAddressId
            ? (user.emailAddresses || []).find((e) => e.id === user.primaryEmailAddressId)?.emailAddress
            : emails[0];
        const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || '(no name)';

        console.log(`  ${primary || '(no email)'}  — ${name}`);
        if (emails.length > 1) console.log(`      all emails         = ${emails.join(', ')}`);
        console.log(`      publicMetadata.role = ${JSON.stringify(user.publicMetadata?.role ?? null)}`);
        console.log(`      clerk org role      = ${m.role || '(none)'}`);
        console.log(`      userId              = ${userId}`);
    }
}
