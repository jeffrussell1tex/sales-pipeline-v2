import { db } from '../../db/index.js';
import { contacts } from '../../db/schema.js';
import { eq, asc, and, inArray } from 'drizzle-orm';
import { verifyAuth, requireRole, canSeeAll, isReadOnly, requireWrite } from './auth.mjs';
import { crmReadScope } from '../../src/utils/roles.js';
import {
    serverErrorBody, writeAudit, getCallerId, bulkUpsert, bulkInsert, assertOwnership,
    stampOwnerId, stampOwnerIds, ownerIdForUpdate, rekeyBulkOwners, ambiguousOwnerResponse,
} from './_lib.mjs';
import { ownerColumnOf, ownerKeyFor } from './_ownership.mjs';
import { deletionAudit } from './_audit.mjs';
import { openDealNamingContact, openDealNamingAnyContact, openDealRefusal } from './_openDeals.mjs';
import { partialRows } from './_sanitize.mjs';
import { checkLinks, checkBulkLinks, clearStrayLinks } from './_links.mjs';

// The links a contact stores, each a live row of this org when a write names it anew (state §0.199):
// its account, and the contacts on its org chart.
const CONTACT_LINKS = [
    { key: 'accountId', kind: 'account' },
    { key: 'managers', kind: 'contact', shape: 'chips' },
    { key: 'directReports', kind: 'contact', shape: 'chips' },
];

export const handler = async (event) => {
    const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' };
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
    const auth = await verifyAuth(event);
    if (auth.error) return { statusCode: auth.status || 401, headers, body: JSON.stringify({ error: auth.error }) };
    const { userId, orgId, userRole, managedReps } = auth;

    // Server-side role enforcement: ReadOnly can never mutate, regardless of
    // what the client UI allows. Runs before any handler logic.
    // Shared write gate. Denies ReadOnly AND Technician: a technician's only
    // write capability is the field whitelist in dispatch-jobs.mjs, so they must
    // not be able to mutate CRM records. Previously this checked isReadOnly
    // alone, which would have granted a new role full write access by default.
    const forbidden = requireWrite(auth, event, headers);
    if (forbidden) return forbidden;

    const sanitize = (d) => ({
        id:                d.id,
        prefix:            d.prefix            || null,
        firstName:         d.firstName         || null,
        middleName:        d.middleName        || null,
        lastName:          d.lastName          || null,
        suffix:            d.suffix            || null,
        nickName:          d.nickName          || null,
        title:             d.title             || null,
        company:           d.company           || null,
        accountId:         d.accountId         || null,
        department:        d.department        || null,
        workLocation:      d.workLocation      || null,
        email:             d.email             || null,
        personalEmail:     d.personalEmail     || null,
        phone:             d.phone             || null,
        mobile:            d.mobile            || null,
        address:           d.address           || null,
        address2:          d.address2          || null,
        city:              d.city              || null,
        state:             d.state             || null,
        zip:               d.zip               || null,
        country:           d.country           || null,
        managers:          d.managers          || [],
        directReports:     d.directReports     || [],
        assistantName:     d.assistantName     || null,
        homeAddress:       d.homeAddress       || null,
        notes:             d.notes             || null,
        assignedRep:       d.assignedRep       || null,
        assignedTerritory: d.assignedTerritory || null,
        doNotContact:      d.doNotContact === true ? true : false,
        buyerPersona:      d.buyerPersona      || null,
    });

    try {
        if (event.httpMethod === 'GET') {
            let results = await db.select().from(contacts).where(eq(contacts.orgId, orgId)).orderBy(asc(contacts.lastName));
            // What the caller may READ (src/utils/roles.js): 'all' for Admin, Manager
            // and a Dispatcher, 'none' for a Technician, 'own' for everyone else. A
            // READ scope only — canSeeAll stays the WRITE authority (guide §18b45).
            const readScope = crmReadScope(userRole);
            if (readScope === 'none') {
                results = [];
            } else if (readScope === 'own') {
                // Rep scoping. This endpoint returned every row in the org to
                // every caller until now — the client filter in App.jsx was the
                // only thing narrowing it, and a client filter is not a boundary.
                //
                // Same predicate as opportunities.mjs: unassigned is visible to
                // everyone, owned rows only to their owner. Keys on the OWNER ID,
                // never the display name — two users sharing a name saw each
                // other's records, and renaming one detached theirs (18b22).
                //
                // A caller that cannot be resolved stays null and sees only
                // unassigned rows, matching mayMutate()'s direction on writes.
                const callerId = await getCallerId(userId, orgId);
                results = results.filter(r => !r.ownerId || r.ownerId === callerId);
            }
            return { statusCode: 200, headers, body: JSON.stringify({ contacts: results }) };
        }
        if (event.httpMethod === 'POST') {
            const data = JSON.parse(event.body);
            // Bulk insert — body is an array
            if (Array.isArray(data)) {
                if (data.length === 0) return { statusCode: 200, headers, body: JSON.stringify({ contacts: [], inserted: 0, failed: [] }) };
                if (data.some(d => !d.id)) return { statusCode: 400, headers, body: JSON.stringify({ error: 'every row requires an id' }) };
                // Chunked with per-row isolation by bisection — see bulkInsert in
                // _lib.mjs (18b8). The removed onConflictDoNothing() could never
                // fire: the only unique constraint is the id primary key and every
                // id is a fresh randomUUID from the client.
                // Each link a row names is one of this org's — the batch's own new contacts too, on one
                // another's org chart, and only there (state §0.199): an id this org already holds is no new
                // row (its insert will not land), so a link to it is asked as any link is. A batch naming a
                // stray is refused whole.
                const batchIds = data.map(d => d.id);
                const taken = new Set((await db.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.orgId, orgId), inArray(contacts.id, batchIds)))).map(r => r.id));
                const linked = await checkBulkLinks(CONTACT_LINKS, data, orgId, { also: { kind: 'contact', ids: new Set(batchIds.filter(id => !taken.has(id))) } });
                if (linked.error) return { statusCode: linked.status, headers, body: JSON.stringify({ error: linked.error, field: linked.field, ids: linked.ids }) };
                const owned = await stampOwnerIds(linked.rows.map(d => sanitize(d)), 'contact', { clerkUserId: userId, orgId });
                const result = await bulkInsert({ table: contacts, rows: owned.rows, orgId });
                // A row of the batch that did not land leaves no link to it: an org-chart entry naming one is
                // cleared (state §0.199 — the batch's own rows were counted live).
                if (result.failed.length) {
                    const swept = await clearStrayLinks(orgId, new Map([[contacts, result.insertedIds]]));
                    result.linksCleared = swept.cleared;
                    if (swept.failed.length) result.linksNotChecked = swept.failed;   // said, not left silent
                }
                result.ambiguousOwners = owned.ambiguousOwners;
                result.unmatchedOwners = owned.unmatchedOwners;
                return { statusCode: 201, headers, body: JSON.stringify(result) };
            }
            // Single insert
            if (!data.id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) };
            // Each link it names is one of this org's (state §0.199).
            const linked = await checkLinks(CONTACT_LINKS, data, null, orgId);
            if (linked.error) return { statusCode: linked.status, headers, body: JSON.stringify({ error: linked.error, field: linked.field }) };
            const newRow = await stampOwnerId(sanitize({ ...data, ...linked.set }), 'contact', { clerkUserId: userId, orgId });
            // An id another org holds writes nothing — answered, not crashed on the key (state §0.199).
            const [inserted] = await db.insert(contacts).values({ ...newRow, orgId }).onConflictDoNothing({ target: contacts.id }).returning();
            if (!inserted) return { statusCode: 409, headers, body: JSON.stringify({ error: 'That contact id is already in use.' }) };
            return { statusCode: 201, headers, body: JSON.stringify({ contact: inserted }) };
        }
        if (event.httpMethod === 'PUT') {
            const data = JSON.parse(event.body);
            // Bulk update — body is an array. Used by the CSV importer's
            // "overwrite" path, which previously issued one PUT per record.
            // See bulkUpsert in _bulk.mjs for the chunking and safety notes.
            if (Array.isArray(data)) {
                if (data.length === 0) return { statusCode: 200, headers, body: JSON.stringify({ updated: 0, notFound: [], forbidden: [] }) };
                if (data.some(d => !d.id)) return { statusCode: 400, headers, body: JSON.stringify({ error: 'every row requires an id' }) };
                // Reps may only overwrite their own or unassigned records. Resolved
                // once here rather than per row; null means "may edit everything".
                // Resolved unconditionally; canSeeAll is an explicit parameter
                // below. The retired ternary made a null caller mean both
                // "trusted Admin" and "unidentifiable" (18b20).
                const callerId = await getCallerId(userId, orgId);
                    // partialRows, not sanitize() alone. sanitize() is a FULL-ROW
                    // builder -- it expands a payload rather than filtering one --
                    // and bulkUpsert derives its SET clause from the keys supplied,
                    // so feeding it a sanitized row wrote every column. A CSV
                    // overwrite carrying fourteen columns wrote all forty, blanking
                    // stage history, Team Notes and linked contacts with the empty
                    // arrays sanitize had just invented. 18b13: the fix belongs
                    // here, in the endpoint. The previous one was in the caller and
                    // sanitize put the columns straight back.
                // The owner id moves with the owner name (state §0.193).
                // Each link a row names anew is one of this org's; one a contact already holds is not
                // asked again (state §0.199). The stored rows are read whole: a key one row leaves out (a blank
                // cell, Q14 — state §0.216) is filled from its stored row, never written empty.
                const stored = await db.select()
                    .from(contacts).where(and(eq(contacts.orgId, orgId), inArray(contacts.id, data.map(d => d.id))));
                const storedById = new Map(stored.map(r => [r.id, r]));
                const linked = await checkBulkLinks(CONTACT_LINKS, data, orgId, { held: storedById });
                if (linked.error) return { statusCode: linked.status, headers, body: JSON.stringify({ error: linked.error, field: linked.field, ids: linked.ids }) };
                const keyed = await rekeyBulkOwners(partialRows(linked.rows, sanitize, storedById), 'contact', { table: contacts, orgId });
                const result = await bulkUpsert({
                    table: contacts,
                    rows: keyed.rows,
                    orgId,
                    // Was `contacts.createdBy` -- a property that does not exist on
                    // this table. bulkUpsert does `if (ownerColumn)`, so undefined
                    // silently removed the owner from the projection and the
                    // forbidden branch could never fire: every rep could overwrite
                    // every contact in the org. Resolved through the registry now,
                    // which throws by name rather than degrading to "no owner".
                    ownerColumn: ownerColumnOf(contacts, 'contact'),
                    callerId,
                    canSeeAll: canSeeAll(userRole),
                });
                return { statusCode: 200, headers, body: JSON.stringify({ ...result, ambiguousOwners: keyed.ambiguousOwners, unmatchedOwners: keyed.unmatchedOwners }) };
            }
            if (!data.id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) };
            // PUT is strictly an update: unknown ids 404 instead of silently creating.
            // The stored row is read whole and the update built over it (state
            // §0.169): sanitize() builds a FULL row, so a body naming three fields
            // blanked the rest (CLAUDE.md; leads, opportunities and tasks merge the
            // same way).
            const [target] = await db.select().from(contacts).where(and(eq(contacts.id, data.id), eq(contacts.orgId, orgId)));
            if (!target) {
                return { statusCode: 404, headers, body: JSON.stringify({ error: 'Contact not found' }) };
            }
            const clean = sanitize({ ...target, ...data });
            const ownPut = await ownerIdForUpdate({ payload: data, entity: 'contact', orgId, stored: target });
            if (ownPut.change) clean.ownerId = ownPut.ownerId;
            const { id, ...updateData } = clean;
            // Object-level authorization. Previously selected contacts.createdBy,
            // which does not exist -- db.select({ owner: undefined }) THREW, so a
            // rep editing any contact got a 500 rather than an answer.
            const forbiddenPut = await assertOwnership({
                table: contacts, entity: 'contact', id: data.id, orgId, userId, userRole, headers, row: target,
            });
            if (forbiddenPut) return forbiddenPut;
            // Each link it names anew is one of this org's; one the contact already holds is not asked
            // again (state §0.199).
            const linked = await checkLinks(CONTACT_LINKS, data, target, orgId);
            if (linked.error) return { statusCode: linked.status, headers, body: JSON.stringify({ error: linked.error, field: linked.field }) };
            Object.assign(clean, linked.set);
            Object.assign(updateData, linked.set);
            const [upserted] = await db.insert(contacts).values({ ...clean, orgId })
                .onConflictDoUpdate({ target: contacts.id, setWhere: eq(contacts.orgId, orgId), set: { ...updateData, updatedAt: new Date() } })
                .returning();
            return { statusCode: 200, headers, body: JSON.stringify({ contact: upserted }) };
        }
        if (event.httpMethod === 'DELETE') {
            if (event.queryStringParameters?.clear === 'true') {
                // Org-wide wipe — Admin only. Non-admin bulk deletes use per-id DELETEs (see ContactsTab).
                const forbidden = requireRole(auth, ['Admin'], headers);
                if (forbidden) return forbidden;
                // A contact on an open deal is kept (state §0.178): the wipe is refused while any is.
                const everyone = await db.select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName })
                    .from(contacts).where(eq(contacts.orgId, orgId));
                if (await openDealNamingAnyContact(orgId, everyone)) {
                    return openDealRefusal(headers, 'Contacts on open deals cannot be cleared. Take them off their deals, or close the deals, first.');
                }
                const deleted = await db.delete(contacts).where(eq(contacts.orgId, orgId)).returning({ id: contacts.id });
                await writeAudit(orgId, {
                    action: 'contact.cleared', entityType: 'contact', entityId: 'ALL',
                    entityName: 'All contacts', detail: `Cleared ${deleted.length} contacts via clear=true`, userId,
                });
                return { statusCode: 200, headers, body: JSON.stringify({ success: true, cleared: true, count: deleted.length }) };
            }
            const id = event.queryStringParameters?.id;
            if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id or clear=true is required' }) };
            // Object-level authorization: reps may only delete their own or
            // unassigned contacts. Same createdBy fault as the PUT above -- this
            // branch 500'd for every rep, for as long as it has existed.
            const forbiddenDel = await assertOwnership({
                table: contacts, entity: 'contact', id, orgId, userId, userRole, headers,
            });
            if (forbiddenDel) return forbiddenDel;
            // A contact on an open deal is kept (state §0.178; Jeff: "Block it") — the deal
            // would name a contact that is gone. Asked here as well as on the screen: a rep's
            // screen holds only the deals the rep may see, so the refusal names no deal.
            const [target] = await db.select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName })
                .from(contacts).where(and(eq(contacts.id, id), eq(contacts.orgId, orgId)));
            if (target && await openDealNamingContact(orgId, target)) {
                return openDealRefusal(headers, 'This contact is on an open deal. Take them off the deal, or close it, before deleting.');
            }
            // .returning() rather than a bare delete: a hard delete destroys the
            // audit trail's subject, so the row has to be captured in the same
            // statement that removes it. An id alone cannot be resolved back to a
            // name once the record is gone.
            const [deletedRow] = await db.delete(contacts).where(and(eq(contacts.id, id), eq(contacts.orgId, orgId))).returning();
            // An unknown id used to return success:true. It deleted nothing.
            if (!deletedRow) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };
            await writeAudit(orgId, deletionAudit('contact', deletedRow, { userId }));
            return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
        }
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    } catch (err) {
        const amb = ambiguousOwnerResponse(err, headers);
        if (amb) return amb;
        console.error('Contacts error:', err.message);
        return { statusCode: 500, headers, body: serverErrorBody(err, 'contacts') };
    }
};
