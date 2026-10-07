// _openDeals.mjs — the open deals that keep a contact or an account from being
// deleted (state §0.178; Jeff: "Block it").
//
// The rule is the screens' own — src/utils/contactDeals.js decides what an open
// deal is and when a deal names a contact — read here over the org's deals,
// because a rep's screen holds only the deals the rep may see: a contact the rep
// owns can be on a deal the rep cannot see. contacts.mjs and accounts.mjs ask
// before they delete, and refuse with 409.
import { db } from '../../db/index.js';
import { opportunities } from '../../db/schema.js';
import { and, eq, or, ilike, isNull, sql } from 'drizzle-orm';
import { isOpenDeal, dealNamesContact } from '../../src/utils/contactDeals.js';

const DEAL_COLUMNS = {
    id: opportunities.id,
    opportunityName: opportunities.opportunityName,
    account: opportunities.account,
    accountId: opportunities.accountId,
    stage: opportunities.stage,
    contactIds: opportunities.contactIds,
    contacts: opportunities.contacts,
};

// ILIKE's wildcards in a name are literal characters.
const likeLiteral = (s) => String(s).replace(/[\\%_]/g, (c) => '\\' + c);

const nameOf = (c) => [c?.firstName, c?.lastName].filter(Boolean).join(' ').trim();

/** The first open deal in the org that names the contact — by id or by its legacy name — or null. */
export async function openDealNamingContact(orgId, contact) {
    const byId = sql`${opportunities.contactIds} @> ${JSON.stringify([contact.id])}::jsonb`;
    const name = nameOf(contact);
    const named = name ? or(byId, ilike(opportunities.contacts, `%${likeLiteral(name)}%`)) : byId;
    const rows = await db.select(DEAL_COLUMNS).from(opportunities).where(and(eq(opportunities.orgId, orgId), named));
    return rows.find((o) => isOpenDeal(o) && dealNamesContact(o, contact)) || null;
}

/** The first open deal in the org that names any of these contacts, or null (the org-wide clear). */
export async function openDealNamingAnyContact(orgId, contactRows) {
    if (!contactRows.length) return null;
    const rows = await db.select(DEAL_COLUMNS).from(opportunities).where(eq(opportunities.orgId, orgId));
    return rows.find((o) => isOpenDeal(o) && contactRows.some((c) => dealNamesContact(o, c))) || null;
}

/** The first open deal in the org linked to the account — by its id, or by its name where a deal has no id — or null. */
export async function openDealOfAccount(orgId, account) {
    const rows = await db.select(DEAL_COLUMNS).from(opportunities).where(and(
        eq(opportunities.orgId, orgId),
        or(eq(opportunities.accountId, account.id), and(isNull(opportunities.accountId), eq(opportunities.account, account.name))),
    ));
    return rows.find(isOpenDeal) || null;
}

/** The first open deal in the org linked to any of these accounts, or null (the org-wide clear). */
export async function openDealOfAnyAccount(orgId, accountRows) {
    if (!accountRows.length) return null;
    const ids = new Set(accountRows.map((a) => a.id));
    const names = new Set(accountRows.map((a) => a.name));
    const rows = await db.select(DEAL_COLUMNS).from(opportunities).where(eq(opportunities.orgId, orgId));
    return rows.find((o) => isOpenDeal(o) && (o.accountId ? ids.has(o.accountId) : names.has(o.account))) || null;
}

/** A deal as a refusal names it. */
export const dealLabel = (deal) => deal.opportunityName || deal.account || 'a deal';

/** The refusal a delete answers with when an open deal holds the record — 409. A contact's
 *  names no deal: a rep may own a contact on a deal the rep cannot see. */
export const openDealRefusal = (headers, error) => ({
    statusCode: 409,
    headers,
    body: JSON.stringify({ error }),
});
