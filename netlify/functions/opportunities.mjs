import { db } from '../../db/index.js';
import { opportunities, users, accounts } from '../../db/schema.js';
import { eq, asc, and, inArray } from 'drizzle-orm';
import { verifyAuth, canSeeAll, isReadOnly, requireRole, requireWrite } from './auth.mjs';
// The read rule, imported directly so a suite that mocks auth.mjs still runs it.
import { dealVisibleTo } from '../../src/utils/roles.js';
import { dealReadContext } from './_dealAccess.mjs';
import { sendEmail, emailTemplates } from './send-email.mjs';
import { dispatchWebhook } from './webhooks.mjs';
import { postDealEvents, postBulkStageMove } from './send-slack.mjs';
import { dispatchAutomations } from './dispatch-automations.mjs';
import { dealEventData } from '../../src/utils/automationEvents.js';
import {
    serverErrorBody, writeAudit, getCallerName, getCallerId, bulkInsert, bulkUpsert, assertOwnership,
    stampOwnerId, stampOwnerIds, ownerIdForUpdate, rekeyBulkOwners, ambiguousOwnerResponse,
} from './_lib.mjs';
import { ownerColumnOf } from './_ownership.mjs';
import { deletionAudit } from './_audit.mjs';
import { partialRows } from './_sanitize.mjs';
import { applyStageChanges } from './_stage.mjs';
import { bulkStageSummary } from '../../src/utils/slackAlerts.js';
import { bulkAccountLinks } from '../../src/utils/dealAccount.js';
import { searchKey } from '../../src/utils/searchMatch.js';
import { checkLinks, checkBulkLinks } from './_links.mjs';

// The contacts a deal names, each a live contact of this org when a write names it anew (state §0.199;
// its account is accountLink's, below).
const DEAL_LINKS = [{ key: 'contactIds', kind: 'contact', shape: 'many' }];

// ── Email helpers ─────────────────────────────────────────────────────────────

// Default notification preferences — all instant by default
const DEFAULT_PREFS = {
    stageChanged:        { enabled: true,  mode: 'instant' },
    dealAssigned:        { enabled: true,  mode: 'instant' },
    opportunityCreated:  { enabled: true,  mode: 'instant' },
    opportunityUpdated:  { enabled: false, mode: 'digest'  },
    dealClosed:          { enabled: true,  mode: 'instant' },
    commentAdded:        { enabled: true,  mode: 'instant' },
    taskDigest:          { enabled: true,  mode: 'digest'  },
    overdueTaskNudge:    { enabled: true,  mode: 'digest'  },
};

// Fetch a rep's full user record (email + notification prefs) by display name.
//
// orgId IS REQUIRED. This lookup was unscoped, which was survivable only while
// users.email carried a GLOBAL unique constraint -- one person, one org, so a
// display name could resolve in exactly one place. Per-org rosters removed that
// guarantee: two orgs may now each employ a "John Smith", and an unscoped match
// returns an ARBITRARY one of them. This function's result is an EMAIL ADDRESS
// that maybeEmail() then sends deal names, ARR and stage changes to, so the
// failure mode is one tenant's pipeline activity delivered to another tenant's
// employee. Same defect class as the caller lookup in 18b20.3, and missed by
// that sweep for the same reason: it is an inline query, not a call to the
// shared helper, so nothing textual matched it.
async function getRepUser(repName, orgId) {
    if (!repName || !orgId) return null;
    try {
        const [user] = await db.select({ email: users.email, profile: users.profile })
            .from(users)
            .where(and(eq(users.name, repName), eq(users.orgId, orgId)));
        return user || null;
    } catch (err) {
        console.error('getRepUser error:', err.message);
        return null;
    }
}

// Check if a notification should fire instantly for this user
function shouldSendInstant(repUser, alertType) {
    const prefs = repUser?.profile?.notificationPrefs || {};
    const pref  = prefs[alertType] || DEFAULT_PREFS[alertType] || { enabled: true, mode: 'instant' };
    return pref.enabled && pref.mode === 'instant';
}

// Fire an instant email if the rep has opted in
async function maybeEmail(repName, alertType, templateArgs, orgId) {
    try {
        const repUser = await getRepUser(repName, orgId);
        if (!repUser?.email) {
            console.warn(`${alertType}: no email found for rep`, repName);
            return;
        }
        if (!shouldSendInstant(repUser, alertType)) {
            console.log(`${alertType}: rep ${repName} set to digest/disabled — skipping instant`);
            return;
        }
        await sendEmail({
            to: repUser.email,
            ...emailTemplates[alertType](templateArgs),
        });
        console.log(`${alertType} email sent to`, repUser.email);
    } catch (err) {
        console.error(`${alertType} email error:`, err.message);
    }
}

// ── Sanitize ──────────────────────────────────────────────────────────────────

const sanitize = (data) => ({
    id:                 data.id,
    pipelineId:         data.pipelineId         || 'default',
    opportunityName:    data.opportunityName     || null,
    account:            data.account             || null,
    accountId:          data.accountId           || null,
    site:               data.site                || null,
    salesRep:           data.salesRep            || null,
    stage:              data.stage               || 'Discovery',
    arr:                data.arr                 ?? null,
    implementationCost: data.implementationCost  ?? null,
    forecastedCloseDate:data.forecastedCloseDate || null,
    closeQuarter:       data.closeQuarter        || null,
    products:           data.products            || null,
    productRevenues:    (() => {
        const r = data.productRevenues;
        if (r && typeof r === 'object' && !Array.isArray(r)) return r;
        if (typeof r === 'string') { try { return JSON.parse(r); } catch { return {}; } }
        return {};
    })(),
    unionized:          data.unionized           || null,
    painPoints:         data.painPoints          || null,
    contacts:           data.contacts            || null,
    contactIds:         data.contactIds          || [],
    notes:              data.notes               || null,
    nextSteps:          data.nextSteps           || null,
    probability:        data.probability         ?? null,
    forecastCategory:   data.forecastCategory    || null,
    vertical:           data.vertical            || null,
    territory:          data.territory           || null,
    team:               data.team                || null,
    lostReason:         data.lostReason          || null,
    lostCategory:       data.lostCategory        || null,
    lostDate:           data.lostDate            || null,
    wonDate:            data.wonDate             || null,
    stageChangedDate:   data.stageChangedDate    || null,
    createdDate:        data.createdDate         || null,
    createdBy:          data.createdBy           || null,
    stageHistory:       data.stageHistory        || [],
    comments:           data.comments            || [],
    // No aiScore: a deal's AI score is ai-score.mjs's alone (state §0.188). The deal
    // window saves the deal it opened — its score too — so a save after a scoring
    // wrote the old score back over the new one.
});

// ── The deal's account ────────────────────────────────────────────────────────

// A deal keeps the account picked, by id (state §0.198; Jeff, 11 Oct: D2 "Yes, same
// batch", D13 "Check it now"). sanitize had no accountId: a deal saved from the deal
// window was linked to its account by NAME alone — both of UKG's "Shell - Port Allen"
// rows listed it — and a deal moved to another account kept its old id under the new name.
//
// A NEW link is checked here, in this org: an id the deal does not already hold must be
// one of this org's accounts — another org's, or none, is refused (§0.166's rule, 404) —
// and never a site (a deal's account is never a site, D5); the deal takes that account's
// own name, so the name shown and the id kept cannot drift. An id the deal already holds
// is never looked up again, name and all (D13): an untouched save, a site an older Save
// stored, a closed deal whose account was deleted. Read scope is not asked: the window
// offers only the caller's own list, and a rep's untouched save of a link outside it must
// still save. A new id of an account merged into another stands for the account it was
// merged into (D12, D14): a screen loaded before the merge sends the old id — a Kanban
// drag, an untouched deal-window Save — and the deal follows the merge to the survivor, in
// this org, at most MERGE_HOPS merges on; none live is the 404 a missing id gets. A walk that
// reaches the id the deal already holds is an untouched save, never re-checked (D13): the
// survivor a merge left the deal on, even one deleted or a site since — and a site whose
// account the deal holds, where a merge or a move put the deal when its account became that
// site (D22: "Move them up"), or a site whose name the deal's Site Name holds while the account
// it holds is no site — the site a D22 lift named it after, wherever that site stands now (D21
// keeps a site a site when it moves); a same-named site sent directly is kept untouched too
// (accepted, OPEN_ITEMS §4.2), and one renamed since is refused as a site (filed there). The
// deal keeps its link as stored (keep). And a save that sends no id while the deal holds one
// keeps the id and the name: no screen clears a deal's account — the deal window refuses an
// empty Account — so it is a screen loaded before the deal was linked. Its Site Name is kept
// too where the Account text it sends is not the stored one — a screen loaded before a D22 lift
// by name, which renamed the deal — and saved as sent where it is: a deal window opened from a
// list loaded before another session linked the deal under the same name, its Site Name edited
// (state §0.198; the critics, 12 Oct).
const ACCOUNT_NOT_IN_ORG = 'That account is not in your organization — pick one from the list.';
const ACCOUNT_IS_SITE = 'A site can’t be a deal’s account — pick the account it belongs to.';
const MERGE_HOPS = 5;

// A single save's link: { id, name } (the account linked — the one named, or the one it was
// merged into — and its own name), {} (the payload as sent), { keep } (the link as stored:
// the walk reached the id the deal holds; lifted, its Site Name kept too — through a site whose
// account it holds, or one whose name its Site Name holds, or no id sent under an Account text
// that is not the stored one), or { status, error }. storedId: the id the deal holds now (null
// for a new deal); storedSite, storedName: its Site Name and its account's name now.
async function accountLink(data, storedId, orgId, storedSite = null, storedName = null) {
    if (!data || !('accountId' in data)) return {};
    const id = data.accountId || null;
    if (!id && storedId) return { keep: true, lifted: 'account' in data && (data.account || null) !== (storedName || null) };
    if (!id || id === (storedId || null)) return {};
    if (typeof id !== 'string') return { status: 400, error: ACCOUNT_NOT_IN_ORG };
    let acct = null;
    const seen = new Set();
    for (let next = id; next && !seen.has(next) && seen.size <= MERGE_HOPS;) {
        if (storedId && next === storedId) return { keep: true };
        seen.add(next);
        [acct] = await db.select({
            id: accounts.id, name: accounts.name, accountTier: accounts.accountTier, parentAccountId: accounts.parentAccountId,
            mergeArchived: accounts.mergeArchived, mergedIntoId: accounts.mergedIntoId,
        }).from(accounts).where(and(eq(accounts.id, next), eq(accounts.orgId, orgId)));
        next = acct && acct.mergeArchived === true ? acct.mergedIntoId : null;
    }
    if (!acct || acct.mergeArchived === true) return { status: 404, error: ACCOUNT_NOT_IN_ORG };
    if (acct.accountTier === 'site' && storedId && acct.parentAccountId === storedId) return { keep: true, lifted: true };
    if (acct.accountTier === 'site' && storedId && storedSite && storedSite === acct.name && !(await heldSite(storedId, orgId))) return { keep: true, lifted: true };
    if (acct.accountTier === 'site') return { status: 400, error: ACCOUNT_IS_SITE };
    return { id: acct.id, name: acct.name };
}

// Whether the account a deal holds is a site (one an older Save stored — UKG's 6 deals on a
// site), read in this org: such a deal was not lifted through the site its Site Name names.
async function heldSite(storedId, orgId) {
    const [held] = await db.select({ accountTier: accounts.accountTier }).from(accounts).where(and(eq(accounts.id, storedId), eq(accounts.orgId, orgId)));
    return held?.accountTier === 'site';
}

// The account ids a batch names that are not this org's accounts — one read, in this org.
// held: a bulk overwrite's stored rows by id; an id a deal already holds is not asked again
// (D13). An import names none today (importRows.js); a batch that names a stray is refused
// whole, before anything is written.
async function accountIdsNotInOrg(rows, orgId, held = null) {
    const fresh = rows.filter((r) => r && r.accountId && r.accountId !== (held?.get(r.id)?.accountId ?? null));
    const ids = [...new Set(fresh.map((r) => r.accountId))];
    const asked = ids.filter((id) => typeof id === 'string');
    const found = asked.length
        ? await db.select({ id: accounts.id }).from(accounts).where(and(eq(accounts.orgId, orgId), inArray(accounts.id, asked)))
        : [];
    const have = new Set(found.map((r) => r.id));
    return ids.filter((id) => !have.has(id));
}

// ── Handler ───────────────────────────────────────────────────────────────────

// Whether sales reps see UNASSIGNED deals (§0.151) is read in _dealAccess.mjs now,
// beside the rest of "may this caller see this deal" — the quotes ask it too (§0.155).

export const handler = async (event) => {
    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers, body: '' };
    }

    const auth = await verifyAuth(event);
    if (auth.error) {
        return { statusCode: auth.status || 401, headers, body: JSON.stringify({ error: auth.error }) };
    }
    const { userId, orgId, userRole } = auth;

    // Server-side role enforcement: ReadOnly can never mutate, regardless of
    // what the client UI allows. Runs before any handler logic.
    // Shared write gate. Denies ReadOnly AND Technician: a technician's only
    // write capability is the field whitelist in dispatch-jobs.mjs, so they must
    // not be able to mutate CRM records. Previously this checked isReadOnly
    // alone, which would have granted a new role full write access by default.
    const forbidden = requireWrite(auth, event, headers);
    if (forbidden) return forbidden;

    try {
        // ── GET ───────────────────────────────────────────────────────────────
        if (event.httpMethod === 'GET') {
            let results = await db.select().from(opportunities).where(eq(opportunities.orgId, orgId)).orderBy(asc(opportunities.createdAt));
            // What reaches the caller is dealVisibleTo (src/utils/roles.js) — ONE rule
            // for deals and everything that belongs to one: a quote, its email, the job
            // it became (§0.155, guide §18b48). A Technician reads none; a rep (and
            // ReadOnly) her own deals by OWNER ID, the unassigned ones only where the
            // Admin's switch allows (OFF when absent, §0.151); Admin, Manager and a
            // Dispatcher the org, a Manager narrowed to the reps named in Clerk (still
            // by NAME). A READ scope only — canSeeAll stays the WRITE authority (§18b45).
            //
            // What the rule carries (roles.js): visibility once compared DISPLAY NAMES;
            // the identity split broke that lookup and every rep saw only the
            // unassigned deals; then a renamed rep vanished from her own pipeline and
            // two reps sharing a name saw each other's. It keys on ids, and a caller
            // who cannot be resolved owns nothing.
            const ctx = await dealReadContext(auth);
            results = results.filter(o => dealVisibleTo(o, ctx));
            return { statusCode: 200, headers, body: JSON.stringify({ opportunities: results }) };
        }

        // ── POST (create) ─────────────────────────────────────────────────────
        if (event.httpMethod === 'POST') {
            const data = JSON.parse(event.body);
            // Bulk insert — body is an array
            if (Array.isArray(data)) {
                if (data.length === 0) return { statusCode: 200, headers, body: JSON.stringify({ opportunities: [], inserted: 0, failed: [] }) };
                if (data.some(d => !d.id)) return { statusCode: 400, headers, body: JSON.stringify({ error: 'every row requires an id' }) };
                // An account named by id is one of this org's (accountLink, above).
                const strays = await accountIdsNotInOrg(data, orgId);
                if (strays.length) return { statusCode: 400, headers, body: JSON.stringify({ error: ACCOUNT_NOT_IN_ORG, accountIds: strays }) };
                const people = await checkBulkLinks(DEAL_LINKS, data, orgId);
                if (people.error) return { statusCode: people.status, headers, body: JSON.stringify({ error: people.error, field: people.field, ids: people.ids }) };
                // Same unbatched single statement as accounts/contacts — the
                // handoff named two files, this is the third. See bulkInsert in
                // _lib.mjs (18b8).
                const owned = await stampOwnerIds(people.rows.map(d => sanitize(d)), 'opportunity', { clerkUserId: userId, orgId });
                const result = await bulkInsert({ table: opportunities, rows: owned.rows, orgId });
                result.ambiguousOwners = owned.ambiguousOwners;
                result.unmatchedOwners = owned.unmatchedOwners;
                return { statusCode: 201, headers, body: JSON.stringify(result) };
            }
            // Single insert
            if (!data.id) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) };
            }
            const link = await accountLink(data, null, orgId);
            if (link.error) return { statusCode: link.status, headers, body: JSON.stringify({ error: link.error }) };
            const people = await checkLinks(DEAL_LINKS, data, null, orgId);
            if (people.error) return { statusCode: people.status, headers, body: JSON.stringify({ error: people.error, field: people.field }) };
            const named = { ...data, ...people.set };
            const newRow = await stampOwnerId(sanitize(link.id ? { ...named, account: link.name, accountId: link.id } : named), 'opportunity', { clerkUserId: userId, orgId });
            // An id another org holds writes nothing — answered, not crashed on the key (state §0.199).
            const [inserted] = await db.insert(opportunities).values({ ...newRow, orgId }).onConflictDoNothing({ target: opportunities.id }).returning();
            if (!inserted) return { statusCode: 409, headers, body: JSON.stringify({ error: 'That deal id is already in use.' }) };

            // Email: new opportunity created — notify the assigned rep only if
            // SOMEONE ELSE created it.
            //
            // This compared `inserted.salesRep !== userId`: a display name against
            // a Clerk user id. Those can never be equal, so the guard never
            // suppressed anything and a rep creating their own deal always emailed
            // themselves about it. Pre-existing (userId has always been Clerk's),
            // and the same category as the two GET filters -- a name compared to
            // an id -- so it is fixed in the same pass.
            const creatorName = await getCallerName(userId, orgId);
            if (inserted.salesRep && inserted.salesRep !== creatorName) {
                await maybeEmail(inserted.salesRep, 'opportunityCreated', {
                    repName:       inserted.salesRep,
                    dealName:      inserted.opportunityName || 'New Deal',
                    account:       inserted.account,
                    arr:           inserted.arr,
                    stage:         inserted.stage,
                    createdBy:     userId,
                    opportunityId: inserted.id,
                }, orgId);
            }

            // Webhook: opportunity.created
            await dispatchWebhook(orgId, 'opportunity.created', {
                id:               inserted.id,
                opportunity_name: inserted.opportunityName,
                account:          inserted.account,
                sales_rep:        inserted.salesRep,
                stage:            inserted.stage,
                arr:              inserted.arr ? Number(inserted.arr) : null,
                pipeline_id:      inserted.pipelineId,
                created_date:     inserted.createdDate,
            });
            dispatchAutomations(orgId, 'opportunity.created', dealEventData(inserted)).catch(e => console.warn('auto error:', e.message));

            return { statusCode: 201, headers, body: JSON.stringify({ opportunity: inserted }) };
        }

        // ── PUT (update) ──────────────────────────────────────────────────────
        if (event.httpMethod === 'PUT') {
            const data = JSON.parse(event.body);

            // Bulk update — body is an array. accounts.mjs and contacts.mjs both
            // grew this branch last session; opportunities did not, so the CSV
            // importer's overwrite path (ModalLayer sends an array here) hit
            // `!data.id` on an Array and 400'd every single time. Overwriting
            // opportunities by import has never once worked.
            if (Array.isArray(data)) {
                if (data.length === 0) return { statusCode: 200, headers, body: JSON.stringify({ updated: 0, notFound: [], forbidden: [] }) };
                if (data.some(d => !d.id)) return { statusCode: 400, headers, body: JSON.stringify({ error: 'every row requires an id' }) };
                // Reps may only overwrite their own or unassigned deals — the same
                // check the single-record path applies below, resolved once for
                // the batch.
                //
                // Resolved UNCONDITIONALLY. The retired ternary
                // (`canSeeAll(userRole) ? null : ...`) made a null callerName mean
                // "trusted Admin" as well as "unidentifiable", which is the
                // conflation 18b20 exists to end. canSeeAll is explicit below.
                const callerId = await getCallerId(userId, orgId);

                // Stage clock and history. Only the server can resolve these: the
                // client does not know a deal's prior stage. One SELECT for the
                // batch, not one per row.
                //
                // An import that moved a deal used to leave stageChangedDate alone
                // and add no history entry, so the move was invisible in History
                // and "0 days in Proposal" was measured from the deal's creation.
                // Stamping the date unconditionally would be worse -- see _stage.mjs
                // for why a same-file re-import must not reset every clock.
                const importDate = new Date().toISOString().slice(0, 10);
                // stageChangedDate is selected as well as stage and stageHistory:
                // applyStageChanges backfills the derived columns of untouched rows
                // from the STORED values when any row in the batch moves. Drop it
                // from this select and the backfill writes null. See _stage.mjs.
                const priorRows = await db
                    .select({
                        id:               opportunities.id,
                        stage:            opportunities.stage,
                        stageHistory:     opportunities.stageHistory,
                        stageChangedDate: opportunities.stageChangedDate,
                        accountId:        opportunities.accountId,
                        account:          opportunities.account,
                        contactIds:       opportunities.contactIds,
                    })
                    .from(opportunities)
                    .where(and(eq(opportunities.orgId, orgId), inArray(opportunities.id, data.map(d => d.id))));
                const priors = new Map(priorRows.map(r => [r.id, r]));
                // An account named by id is one of this org's; one a deal already holds is not
                // asked again (accountLink, above).
                const strays = await accountIdsNotInOrg(data, orgId, priors);
                if (strays.length) return { statusCode: 400, headers, body: JSON.stringify({ error: ACCOUNT_NOT_IN_ORG, accountIds: strays }) };
                // Each contact a row names anew is one of this org's; one the deal already holds is not
                // asked again (state §0.199).
                const people = await checkBulkLinks(DEAL_LINKS, data, orgId, { held: priors });
                if (people.error) return { statusCode: people.status, headers, body: JSON.stringify({ error: people.error, field: people.field, ids: people.ids }) };
                data.splice(0, data.length, ...people.rows);   // the rows as checked: a merged-away contact, its survivor
                // A row that sends an Account name and no id unlinks its deal when the name is not
                // the one stored, as a single save does (below) — and the batch's other rows keep
                // the ids their deals hold (bulkAccountLinks, src/utils/dealAccount.js).
                const staged = applyStageChanges(bulkAccountLinks(data, priors), priors, importDate);
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
                const keyed = await rekeyBulkOwners(partialRows(staged.rows, sanitize), 'opportunity', { table: opportunities, orgId });
                const result = await bulkUpsert({
                    table: opportunities,
                    rows: keyed.rows,
                    orgId,
                    // Through the registry, never named at the call site (18b19).
                    ownerColumn: ownerColumnOf(opportunities, 'opportunity'),
                    callerId,
                    canSeeAll: canSeeAll(userRole),
                });
                // One audit record for the batch, not one per deal. A 500-row
                // import moving 200 deals is one action by one person.
                if (staged.changedCount > 0) {
                    await writeAudit(orgId, {
                        action: 'opportunity.stage_changed_bulk', entityType: 'opportunity', entityId: 'BATCH',
                        entityName: `${staged.changedCount} deals`,
                        detail: `CSV import moved ${staged.changedCount} of ${data.length} deals to a new stage`,
                        userId,
                    });
                    // One Slack post for the batch too (state §0.106) — under the org's
                    // 'stageChanged' switch, never one post per deal. Never throws.
                    await postBulkStageMove(orgId, { summary: bulkStageSummary(staged.rows, priors), total: data.length, mover: await getCallerName(userId, orgId) });
                }
                return { statusCode: 200, headers, body: JSON.stringify({ ...result, stageChanged: staged.changedCount, ambiguousOwners: keyed.ambiguousOwners, unmatchedOwners: keyed.unmatchedOwners }) };
            }

            if (!data.id) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) };
            }

            // Fetch existing record before update so we can detect changes
            const [existing] = await db.select().from(opportunities).where(and(eq(opportunities.id, data.id), eq(opportunities.orgId, orgId)));
            // PUT is strictly an update: unknown ids 404 instead of silently
            // creating (upsert-as-create allowed bypassing POST semantics).
            if (!existing) {
                return { statusCode: 404, headers, body: JSON.stringify({ error: 'Opportunity not found' }) };
            }
            // Object-level authorization: reps may only edit their own or
            // unassigned deals. `existing` is the full row, already loaded, so no
            // second query is issued.
            const forbiddenPut = await assertOwnership({
                table: opportunities, entity: 'opportunity', id: data.id, orgId, userId, userRole, headers, row: existing,
            });
            if (forbiddenPut) return forbiddenPut;
            const link = await accountLink(data, existing.accountId, orgId, existing.site, existing.account);
            if (link.error) return { statusCode: link.status, headers, body: JSON.stringify({ error: link.error }) };
            // Each contact it names anew is one of this org's; one the deal already holds is not asked
            // again (state §0.199).
            const people = await checkLinks(DEAL_LINKS, data, existing, orgId);
            if (people.error) return { statusCode: people.status, headers, body: JSON.stringify({ error: people.error, field: people.field }) };
            Object.assign(data, people.set);
            const previousStage    = existing?.stage    || null;
            const previousComments = existing?.comments || [];

            // The payload is sanitized OVERLAID ON THE STORED ROW (the
            // leads/users merge pattern): a key sent is applied — including an
            // explicit null — a key omitted keeps its stored value. The raw
            // sanitize(data) that stood here was the fourth face of the same
            // wipe: a partial PUT nulled every absent column, emptied
            // stageHistory and comments, and reset pipelineId to 'default'.
            // The bulk branch above already merges via partialRows; this is the
            // single-record equivalent.
            //
            // ownerIdForUpdate below still receives the RAW body on purpose:
            // its 18b13 change-detection keys on whether the REQUEST mentioned
            // salesRep, and merging first would make every PUT look like a
            // reassignment.
            const clean = sanitize({ ...existing, ...data });
            // The deal's account (accountLink): a new id brings its account's own name — one
            // merged away, the account it was merged into; an id that leads back to the one the
            // deal holds (a screen loaded before a merge or a move), and a save sending no id while
            // the deal holds one, keep the link as stored (its Site Name with it where accountLink
            // says lifted); a name sent without an id key that reads as another name (searchKey —
            // not another case or spacing, which the pickers and a CSV's duplicate rule read as the
            // same) is no longer the linked account's, and the id goes with it.
            if (link.id) { clean.accountId = link.id; clean.account = link.name; }
            else if (link.keep) { clean.accountId = existing.accountId; clean.account = existing.account; if (link.lifted) clean.site = existing.site; }
            else if ('account' in data && !('accountId' in data) && searchKey(clean.account || '') !== searchKey(existing.account || '')) clean.accountId = null;
            else if ('account' in data && !('accountId' in data) && existing.accountId) clean.account = existing.account;   // the same name in another case or spacing, on a linked deal: the account's own spelling, as stored
            // Reassigning a deal re-keys its ownership; a PUT that never
            // mentioned salesRep leaves it alone (18b13).
            const ownPut = await ownerIdForUpdate({ payload: data, entity: 'opportunity', orgId, stored: existing });
            if (ownPut.change) clean.ownerId = ownPut.ownerId;
            const { id, ...updateData } = clean;
            const [upserted] = await db.insert(opportunities)
                .values({ ...clean, orgId })
                .onConflictDoUpdate({
                    target: opportunities.id, setWhere: eq(opportunities.orgId, orgId),
                    set: { ...updateData, updatedAt: new Date() }
                })
                .returning();

            const rep          = upserted.salesRep;
            const stageChanged = previousStage && upserted.stage !== previousStage;

            // Email: stage changed (or deal closed)
            if (rep && stageChanged) {
                const isClosedWon  = upserted.stage === 'Closed Won';
                const isClosedLost = upserted.stage === 'Closed Lost';

                if (isClosedWon || isClosedLost) {
                    await maybeEmail(rep, 'dealClosed', {
                        repName:       rep,
                        dealName:      upserted.opportunityName || 'Deal',
                        account:       upserted.account,
                        arr:           upserted.arr,
                        outcome:       isClosedWon ? 'Won' : 'Lost',
                        closedBy:      userId,
                        opportunityId: upserted.id,
                    }, orgId);
                } else {
                    await maybeEmail(rep, 'stageChanged', {
                        repName:       rep,
                        dealName:      upserted.opportunityName || 'Deal',
                        account:       upserted.account,
                        arr:           upserted.arr,
                        fromStage:     previousStage,
                        toStage:       upserted.stage,
                        changedBy:     userId,
                        opportunityId: upserted.id,
                    }, orgId);
                }
            }

            // Email: new comment added
            const newComments = (upserted.comments || []).filter(
                c => !previousComments.some(p => p.id === c.id)
            );
            for (const comment of newComments) {
                if (rep && comment.author !== rep) {
                    await maybeEmail(rep, 'commentAdded', {
                        repName:       rep,
                        dealName:      upserted.opportunityName || 'Deal',
                        account:       upserted.account,
                        comment:       comment.text || '',
                        commentBy:     comment.author || userId,
                        opportunityId: upserted.id,
                    }, orgId);
                }
            }

            // Email: general update — only if no stage change and no new comment to avoid double-emailing
            if (rep && !stageChanged && newComments.length === 0 && rep !== userId) {
                await maybeEmail(rep, 'opportunityUpdated', {
                    repName:       rep,
                    dealName:      upserted.opportunityName || 'Deal',
                    account:       upserted.account,
                    arr:           upserted.arr,
                    stage:         upserted.stage,
                    updatedBy:     userId,
                    opportunityId: upserted.id,
                }, orgId);
            }

            // Webhooks: fire based on what changed
            const webhookBase = {
                id:               upserted.id,
                opportunity_name: upserted.opportunityName,
                account:          upserted.account,
                sales_rep:        upserted.salesRep,
                stage:            upserted.stage,
                arr:              upserted.arr ? Number(upserted.arr) : null,
                pipeline_id:      upserted.pipelineId,
            };
            if (stageChanged) {
                if (upserted.stage === 'Closed Won') {
                    await dispatchWebhook(orgId, 'opportunity.won', { ...webhookBase, won_date: upserted.wonDate });
                } else if (upserted.stage === 'Closed Lost') {
                    await dispatchWebhook(orgId, 'opportunity.lost', { ...webhookBase, lost_reason: upserted.lostReason, lost_date: upserted.lostDate });
                } else {
                    await dispatchWebhook(orgId, 'opportunity.stage_changed', { ...webhookBase, from_stage: previousStage, to_stage: upserted.stage });
                }
                // The company's Slack post — stage changed, or closed won — the
                // moment it happens, per the org's selection; never the rep's
                // preferences (state §0.99, item 33). Never throws; 4 s cap.
                await postDealEvents(orgId, { before: { stage: previousStage }, after: upserted, mover: await getCallerName(userId, orgId) });
                const autoEvt = upserted.stage === 'Closed Won' ? 'opportunity.won' : upserted.stage === 'Closed Lost' ? 'opportunity.lost' : 'opportunity.stage_changed';
                dispatchAutomations(orgId, autoEvt, dealEventData(upserted, { from_stage: previousStage, to_stage: upserted.stage })).catch(e => console.warn('auto error:', e.message));
            }

            return { statusCode: 200, headers, body: JSON.stringify({ opportunity: upserted }) };
        }

        // ── DELETE ────────────────────────────────────────────────────────────
        if (event.httpMethod === 'DELETE') {
            const clear = event.queryStringParameters?.clear;
            if (clear === 'true') {
                // Org-wide wipe — Admin only. Any lesser role gets 403 before any delete runs.
                const forbidden = requireRole(auth, ['Admin'], headers);
                if (forbidden) return forbidden;
                const deleted = await db.delete(opportunities).where(eq(opportunities.orgId, orgId)).returning({ id: opportunities.id });
                await writeAudit(orgId, {
                    action: 'opportunity.cleared', entityType: 'opportunity', entityId: 'ALL',
                    entityName: 'All opportunities', detail: `Cleared ${deleted.length} opportunities via clear=true`, userId,
                });
                return { statusCode: 200, headers, body: JSON.stringify({ success: true, cleared: true, count: deleted.length }) };
            }
            const id = event.queryStringParameters?.id;
            if (!id) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'id or clear=true is required' }) };
            }
            // Object-level authorization: reps may only delete their own or
            // unassigned deals.
            //
            // ORDERING IS LOAD-BEARING: this must stay ABOVE the Admin role gate.
            // Both refusals are 403 and only the body distinguishes them, so a
            // non-owner gets the ownership message and an owner gets the role
            // message. The delete gate asserts that split.
            const forbiddenOwn = await assertOwnership({
                table: opportunities, entity: 'opportunity', id, orgId, userId, userRole, headers,
            });
            if (forbiddenOwn) return forbiddenOwn;
            // Admin only. Reps close deals Won or Lost rather than deleting them,
            // and that rule was DESIGN INTENT ONLY -- this branch was ownership-
            // checked, so canSeeAll being false for a rep still let them delete
            // their own records through the API. The clear=true branch above has
            // always been gated; this one never was.
            const forbiddenDelete = requireRole(auth, ['Admin'], headers);
            if (forbiddenDelete) return forbiddenDelete;
            // .returning() rather than a bare delete: a hard delete destroys the
            // audit trail's subject, so the row has to be captured in the same
            // statement that removes it. An id alone cannot be resolved back to a
            // name once the record is gone.
            const [deletedRow] = await db.delete(opportunities).where(and(eq(opportunities.id, id), eq(opportunities.orgId, orgId))).returning();
            // An unknown id used to return success:true. It deleted nothing.
            if (!deletedRow) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };
            await writeAudit(orgId, deletionAudit('opportunity', deletedRow, { userId, byRole: 'Admin' }));
            return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
        }

        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

    } catch (err) {
        const amb = ambiguousOwnerResponse(err, headers);
        if (amb) return amb;
        console.error('Opportunities function error:', err.message);
        return { statusCode: 500, headers, body: serverErrorBody(err, 'opportunities') };
    }
};
