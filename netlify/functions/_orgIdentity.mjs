// _orgIdentity.mjs — the server's side of who an org is to its customers (state §0.234; guide §18b117;
// src/utils/orgIdentity.js holds the rule). Read BY THE CALLER'S ORG — its settings row, then its own name in Clerk
// only when the Company profile has no display name. Nothing here takes an org, a name or a profile from a request
// body: a customer document can name only the org that sends it.
import { db } from '../../db/index.js';
import { settings } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { orgIdentityOf, profileOfRow } from '../../src/utils/orgIdentity.js';

// The org's name in Clerk, or '' — never a refusal: a quote or a visit email must still go out when Clerk is slow
// or down; it then carries no name rather than another (ANSWERS.md, Q1's open case).
export async function clerkOrgName(orgId) {
    if (!orgId || !process.env.CLERK_SECRET_KEY) return '';
    try {
        const { createClerkClient } = await import('@clerk/backend');
        const org = await createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY })
            .organizations.getOrganization({ organizationId: orgId });
        return String(org?.name || '');
    } catch (e) {
        console.warn('orgIdentity: could not read the org name from Clerk:', e.message);
        return '';
    }
}

// From a settings row the caller already read for this org: Clerk is asked only when the profile names no one.
export async function identityOfRow(orgId, row) {
    const profile = profileOfRow(row);
    const own = orgIdentityOf(profile);
    return own.name ? own : orgIdentityOf(profile, await clerkOrgName(orgId));
}

// The org's identity, read from its own settings row.
export async function orgIdentityFor(orgId) {
    const [row] = orgId ? await db.select().from(settings).where(eq(settings.orgId, orgId)) : [];
    return identityOfRow(orgId, row);
}
