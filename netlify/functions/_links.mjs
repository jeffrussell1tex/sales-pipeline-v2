// _links.mjs — a link names a live row of THIS org (state §0.199 — batch 4 of OPEN_ITEMS §1 item 1;
// Jeff, 13 Oct: E1 "Listed + CRM extras", E2 "Link the survivor", E3 "Org check only", E4 "Clear stray
// links").
//
// Ids are global keys, and the writes that store a link stored whatever id they were sent — another
// org's, or one that names nothing: a contact's account and its managers and direct reports; an
// activity's account, deal, lead and contacts; a task's account, deal and contacts; a deal's contacts;
// a bulk row's parent account; a dispatch customer's account; a dispatch job's customer, location,
// account and deal. Every reader looks a stored id up in its own org, so nothing leaked (the census,
// 13 Oct: no link names another org's row). The rule is CLAUDE.md's: no write path takes another org's
// rows. What a write asks and what it stores is src/utils/linkIds.js's (pure, and run by
// tests/link-ids.test.mjs); this module reads, in this org, which of the ids asked are live rows — one
// merged away followed to the row it was merged into (E2) — and answers:
//   - a single write: 404 "That account is not in your organization — pick one from the list." (the
//     deals endpoint's words, §0.198), 400 for a value that names no record by its id;
//   - a bulk write: refused whole, 400, naming the ids, before anything is written.
// An Admin's backup restore clears, on the rows it restored, every link that names no row of this org
// (E4: clearStrayLinks), and says how many; a bulk create clears so, after its insert, a link to one of its
// own rows that did not land.
import { db } from '../../db/index.js';
import {
    accounts, contacts, opportunities, leads, tasks, activities, quotes,
    dispatchCustomers, dispatchServiceLocations, dispatchJobs,
} from '../../db/schema.js';
import { and, eq, getTableName, inArray, isNotNull, sql } from 'drizzle-orm';
import { MERGES, liveIds, linksAsked, linksDecided, bulkLinksAsked, bulkLinksDecided } from '../../src/utils/linkIds.js';

// The table each kind of link names.
const TABLES = Object.freeze({
    account: accounts, contact: contacts, deal: opportunities, lead: leads,
    customer: dispatchCustomers, location: dispatchServiceLocations,
});

// The live row each asked id names in this org (linkIds.js's liveIds): every row it reads — the merge walk's
// each hop too — is read in this org.
export async function liveIdsInOrg(kind, ids, orgId, { follow = true } = {}) {
    const table = TABLES[kind];
    const merges = MERGES.includes(kind);
    const cols = merges
        ? { id: table.id, mergeArchived: table.mergeArchived, mergedIntoId: table.mergedIntoId }
        : { id: table.id };
    const read = (list) => db.select(cols).from(table).where(and(eq(table.orgId, orgId), inArray(table.id, list)));
    return liveIds(ids, read, { merges, follow });
}

// Each ask's live ids, read in this org — one read per field asked.
async function liveOfAsks(asks, orgId) {
    const read = new Map();
    for (const ask of asks) read.set(ask, await liveIdsInOrg(ask.kind, ask.fresh, orgId, { follow: ask.follow }));
    return (ask) => read.get(ask) || new Map();
}

// One write's links, checked: { set } — the fields to store in place of those sent — or { status, error,
// field }, and nothing is written. stored: the row as stored, or null for a create.
export async function checkLinks(spec, data, stored, orgId) {
    const asked = linksAsked(spec, data, stored);
    if (asked.error) return asked;
    if (!asked.asks.length) return { set: {} };
    return linksDecided(asked.asks, data, await liveOfAsks(asked.asks, orgId));
}

// A bulk write's links, checked for the whole batch: { rows } — the rows to store — or { status: 400,
// error, field, ids }, and nothing is written. held: Map(row id → the stored row) for an overwrite;
// also: { kind, ids } — a bulk create's own new rows, live without a read for a link of their kind
// (linkIds.js's bulkLinksAsked).
export async function checkBulkLinks(spec, rows, orgId, { held = null, also = null } = {}) {
    const asked = bulkLinksAsked(spec, rows, { held, also });
    if (asked.error) return asked;
    if (!asked.asks.length) return { rows: Array.isArray(rows) ? rows : [] };
    return bulkLinksDecided(asked.asks, rows, await liveOfAsks(asked.asks, orgId));
}

// ── The backup restore's clean-up (E4) ────────────────────────────────────────

// Every link batch 4 checks, and a deal's account (§0.198's), as the restore clears it: [table, column key,
// kind, shape, the list a mirror column repeats]. A mirror stands before its list.
const RESTORE_LINKS = [
    [contacts, 'accountId', 'account', 'one'],
    [contacts, 'managers', 'contact', 'chips'],
    [contacts, 'directReports', 'contact', 'chips'],
    [activities, 'accountId', 'account', 'one'],
    [activities, 'opportunityId', 'deal', 'one'],
    [activities, 'leadId', 'lead', 'one'],
    [activities, 'contactId', 'contact', 'one', 'contactIds'],
    [activities, 'contactIds', 'contact', 'many'],
    [tasks, 'accountId', 'account', 'one'],
    [tasks, 'opportunityId', 'deal', 'one'],
    [tasks, 'contactId', 'contact', 'one', 'contacts'],
    [tasks, 'contacts', 'contact', 'chips'],
    [accounts, 'parentAccountId', 'account', 'one'],
    [opportunities, 'accountId', 'account', 'one'],
    [opportunities, 'contactIds', 'contact', 'many'],
    [dispatchCustomers, 'accountId', 'account', 'one'],
    [dispatchJobs, 'locationId', 'location', 'one'],
    [dispatchJobs, 'accountId', 'account', 'one'],
    [dispatchJobs, 'opportunityId', 'deal', 'one'],
];

// On the rows a write inserted — restored: Map(table → [ids]) — every link that names no row of this org is
// cleared: a scalar set null; a list's entries that name none dropped, the rest kept in their order (an entry
// that names no record by its id — a chip with no id, an empty one — is kept). A dispatch job's customer and a
// quote's deal cannot be cleared (both columns are required): such rows are counted, not changed. A field
// whose clean-up fails is named and the rest go on. Answers { cleared, jobsWithoutCustomer, quotesWithoutDeal,
// failed }: cleared the links cleared — a list's stray entries one each, a mirror (an activity's or a task's
// contactId) only where its list does not hold the same id: the pair is one link.
export async function clearStrayLinks(orgId, restored) {
    let cleared = 0;
    let carried = 0;   // a mirror's ids its list holds: the list's clean-up counts them — or, if it fails, here
    const failed = [];
    for (const [table, key, kind, shape, mirrorOf] of RESTORE_LINKS) {
        const ids = (restored && restored.get(table)) || [];
        if (!ids.length) continue;
        try {
            const done = await clearField(orgId, table, ids, key, kind, shape, mirrorOf);
            cleared += done.cleared;
            carried = done.mirrored;
        } catch (e) {
            cleared += carried;
            carried = 0;
            failed.push(`${getTableName(table)}.${key}`);
            console.warn('clearStrayLinks:', getTableName(table), key, e?.cause?.message || e?.message);
        }
    }
    const jobsWithoutCustomer = await countRequired(orgId, restored, dispatchJobs, 'customerId', dispatchCustomers, failed);
    const quotesWithoutDeal = await countRequired(orgId, restored, quotes, 'opportunityId', opportunities, failed);
    return { cleared, jobsWithoutCustomer, quotesWithoutDeal, failed };
}

// One field of the rows inserted, cleared of what names no row of this org: { cleared, mirrored } — the links
// cleared, and a mirror's ids its list holds (counted by the list's own clean-up).
async function clearField(orgId, table, ids, key, kind, shape, mirrorOf) {
    const col = table[key];
    // The row a link names, read apart from the row restored (an account's own parent): its table
    // aliased inside the sub-select, where the alias hides the table's own name from the outer row.
    const named = TABLES[kind];
    const inOrg = (expr) => sql`EXISTS (SELECT 1 FROM ${named} AS link_parent WHERE link_parent.id = ${expr} AND link_parent.org_id = ${orgId})`;
    if (shape === 'one') {
        // A mirror is counted only where its list does not hold the same id — read before the list is cleared.
        let mirrored = 0;
        if (mirrorOf) {
            const list = table[mirrorOf];
            const [{ n }] = await db.select({ n: sql`count(*)`.mapWith(Number) }).from(table)
                .where(and(eq(table.orgId, orgId), inArray(table.id, ids), isNotNull(col), sql`${col} <> ''`, sql`NOT ${inOrg(col)}`,
                    sql`jsonb_typeof(${list}) = 'array'`, sql`(${list} @> jsonb_build_array(${col}) OR ${list} @> jsonb_build_array(jsonb_build_object('id', ${col})))`));
            mirrored = n;
        }
        // An account whose parent is cleared stands at the top: an account (D21 — a cleared parent makes it one).
        const set = table === accounts && key === 'parentAccountId' ? { [key]: null, accountTier: 'account' } : { [key]: null };
        const done = await db.update(table).set(set)
            .where(and(eq(table.orgId, orgId), inArray(table.id, ids), isNotNull(col), sql`${col} <> ''`, sql`NOT ${inOrg(col)}`))
            .returning({ id: table.id });
        return { cleared: done.length - mirrored, mirrored };
    }
    // An entry's id as src/utils/linkIds.js's heldIds reads it: a chip's id, or the entry itself.
    const el = shape === 'chips' ? sql`(CASE WHEN jsonb_typeof(e) = 'object' THEN e ->> 'id' ELSE e #>> '{}' END)` : sql`(e #>> '{}')`;
    const keep = sql`(coalesce(${el}, '') = '' OR ${inOrg(el)})`;
    const [{ strays }] = await db.select({ strays: sql`coalesce(sum((SELECT count(*) FROM jsonb_array_elements(${col}) e WHERE NOT ${keep})), 0)`.mapWith(Number) })
        .from(table).where(and(eq(table.orgId, orgId), inArray(table.id, ids), sql`jsonb_typeof(${col}) = 'array'`));
    if (!strays) return { cleared: 0, mirrored: 0 };
    await db.update(table)
        .set({ [key]: sql`(SELECT coalesce(jsonb_agg(x.e ORDER BY x.i), '[]'::jsonb) FROM jsonb_array_elements(${col}) WITH ORDINALITY AS x(e, i) WHERE ${keep})` })
        .where(and(eq(table.orgId, orgId), inArray(table.id, ids), sql`jsonb_typeof(${col}) = 'array'`,
            sql`EXISTS (SELECT 1 FROM jsonb_array_elements(${col}) e WHERE NOT ${keep})`));
    return { cleared: strays, mirrored: 0 };
}

// The rows inserted whose required link names no row of this org — counted, never changed (a job's customer,
// a quote's deal: both columns are NOT NULL).
async function countRequired(orgId, restored, table, key, parentTable, failed) {
    const ids = (restored && restored.get(table)) || [];
    if (!ids.length) return 0;
    try {
        const stray = await db.select({ id: table.id }).from(table)
            .where(and(eq(table.orgId, orgId), inArray(table.id, ids),
                sql`NOT EXISTS (SELECT 1 FROM ${parentTable} AS link_parent WHERE link_parent.id = ${table[key]} AND link_parent.org_id = ${orgId})`));
        return stray.length;
    } catch (e) {
        failed.push(`${getTableName(table)}.${key}`);
        console.warn('clearStrayLinks:', getTableName(table), key, e?.cause?.message || e?.message);
        return 0;
    }
}
