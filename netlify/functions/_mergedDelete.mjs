// _mergedDelete.mjs — a Delete of a merged-away contact or account is refused while its merge can still be undone
// (state §0.282; OPEN_ITEMS §4.8, §0.273's found (2); Jeff, 21 Nov: "Refuse it"). A merge archives the record merged
// away (mergeArchived, mergedIntoId) and its Undo needs both records; a tab loaded before the merge still listed it, and
// its Delete removed it — the merge could never be undone. The DELETEs ask here before they write, and carry the same
// condition in the write's own SQL (notMerged); a write that missed asks here again. All reads in the caller's org.
//
// The review: once the record it was merged into is gone, the merge can never be undone — refusing then only strands
// the record (removable by an org-wide clear alone, a person's data with it): it deletes as before. A rep is told the
// survivor's name only where they may read it.
import { db } from '../../db/index.js';
import { contacts, accounts } from '../../db/schema.js';
import { and, eq, sql } from 'drizzle-orm';
import { mergedDeleteWords } from '../../src/utils/mergedDelete.js';

const nameOf = (kind, r) => (kind === 'contact' ? [r?.firstName, r?.lastName].filter(Boolean).join(' ') : r?.name) || '';

// The write's own condition: the row is not merged away (none read as not merged — a row stored before merges), or the
// record it was merged into is no longer a row of its org (that merge can never be undone).
export const notMerged = (table) => sql`(${table.mergeArchived} is not true or not exists (select 1 from ${table} s where s.id = ${table.mergedIntoId} and s.org_id = ${table.orgId}))`;

// One record of this org by id — each table read by name, so the merged-away reads guard (tests/merged-away-lists T10)
// counts what this reads.
const rowOf = (kind, id, orgId) => (kind === 'contact'
    ? db.select().from(contacts).where(and(eq(contacts.id, id), eq(contacts.orgId, orgId)))
    : db.select().from(accounts).where(and(eq(accounts.id, id), eq(accounts.orgId, orgId))));

// The refusal when the record is merged away in this org into one that still stands, else null: 409 code 'merged' in
// words naming the record it lives on in — `nameable` says whether the caller may read it (a rep: theirs or nobody's);
// when not, neither its name nor its id is said — nothing written.
export async function mergedDeleteRefusal({ kind, id, orgId, headers, nameable = () => true }) {
    const [row] = await rowOf(kind, id, orgId);
    if (!row || row.mergeArchived !== true) return null;
    const [into] = row.mergedIntoId ? await rowOf(kind, row.mergedIntoId, orgId) : [];
    if (!into) return null;
    const shown = nameable(into);
    return { statusCode: 409, headers, body: JSON.stringify({ error: mergedDeleteWords(kind, nameOf(kind, row), shown ? nameOf(kind, into) : '', { chained: into.mergeArchived === true }), code: 'merged', mergedIntoId: shown ? row.mergedIntoId : null }) };
}
