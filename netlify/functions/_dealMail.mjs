// _dealMail.mjs — who a deal's email goes to (state §0.304; guide §18b147). Pure and dependency-free: opportunities.mjs reads
// the row; tests/five-findings.test.mjs and the mutation harness run the rules.
//
// Until §0.304 the deal emails (created, a note, a stage move, a close, an edit) went to whoever bore the NAME the deal
// carries (`salesRep`): after a member's rename, to nobody — or to the member who took the old name, with the deal's
// figures and the note's words; with two members of one name, to either; and a note was "the rep's own" by comparing names.
// The deal's owner is its app id (`ownerId`), as the texts, the alert job and the digests find their recipient (mention-sms.mjs,
// pipeline-alerts.mjs, digest.mjs).
import { ownAct } from './_mentions.mjs';
import { reachable } from '../../src/utils/approvalNotices.js';

// Whether a deal's act is told at all: it has an owner, and the act is not theirs (by app id — guide §18b123 rule 5).
export const mailsOwner = (deal, actorId) => !!deal?.ownerId && !ownAct(deal.ownerId, actorId);

// The row to mail: the deal's owner, of this org, active, with an address that is no placeholder — else none.
export const ownerToMail = (deal, row, orgId) => (!!row && !!deal?.ownerId && row.id === deal.ownerId && row.orgId === orgId && reachable(row) ? row : null);

// Who a post names as the deal's rep (state §0.307): its owner by their name now — a label, so a member of this org whatever their
// status or address; "Unassigned" for a deal with no owner, or one whose owner is no member here; "—" for a member with no name.
// Never the name the deal carries, which a rename leaves behind.
export const ownerLabel = (deal, row, orgId) => {
    if (!deal?.ownerId || !row || row.id !== deal.ownerId || row.orgId !== orgId) return 'Unassigned';
    return String(row.name ?? '').trim() || '—';
};
