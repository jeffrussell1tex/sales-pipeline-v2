import { db } from '../../db/index.js';
import { opportunities, users } from '../../db/schema.js';
import { eq, asc, and, inArray } from 'drizzle-orm';
import { verifyAuth, canSeeAll, isManager, isReadOnly, requireRole, requireWrite } from './auth.mjs';
import { sendEmail, emailTemplates } from './send-email.mjs';
import { dispatchWebhook } from './webhooks.mjs';
import { dispatchAutomations } from './dispatch-automations.mjs';
import { serverErrorBody, writeAudit, getCallerName, bulkInsert, bulkUpsert, assertOwnership } from './_lib.mjs';
import { ownerColumnOf } from './_ownership.mjs';
import { deletionAudit } from './_audit.mjs';
import { partialRows } from './_sanitize.mjs';
import { applyStageChanges } from './_stage.mjs';

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
    aiScore:            data.aiScore             ?? null,
});

// ── Handler ───────────────────────────────────────────────────────────────────

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
    const { userId, orgId, userRole, managedReps } = auth;

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
            if (!canSeeAll(userRole)) {
                // salesRep stores a display name, so the caller's name is what
                // this filters on.
                //
                // THIS WAS BROKEN BY THE IDENTITY SPLIT. It read
                //     .where(eq(users.id, userId))
                // where userId is the CLERK id and users.id is now usr_<uuid>.
                // The match found nothing, repDisplayName fell to null, and the
                // predicate collapsed to `!o.salesRep || o.salesRep === null`:
                // every rep saw ONLY unassigned deals and none of their own. No
                // error, because the query succeeded and simply returned no row --
                // the catch below never fired. It was also unscoped, so it could
                // resolve a name from another tenant.
                //
                // getCallerName is the one lookup that knows both facts: match on
                // clerkUserId, scope to orgId. A caller it cannot resolve stays
                // null and sees only unassigned work, which is the same fail-
                // closed direction mayMutate() takes for writes.
                const repDisplayName = await getCallerName(userId, orgId);
                results = results.filter(o => !o.salesRep || o.salesRep === repDisplayName);
            } else if (isManager(userRole) && managedReps.length > 0) {
                // managedReps are stored as display names in Clerk publicMetadata — this comparison is correct
                results = results.filter(o => !o.salesRep || managedReps.includes(o.salesRep));
            }
            return { statusCode: 200, headers, body: JSON.stringify({ opportunities: results }) };
        }

        // ── POST (create) ─────────────────────────────────────────────────────
        if (event.httpMethod === 'POST') {
            const data = JSON.parse(event.body);
            // Bulk insert — body is an array
            if (Array.isArray(data)) {
                if (data.length === 0) return { statusCode: 200, headers, body: JSON.stringify({ opportunities: [], inserted: 0, failed: [] }) };
                if (data.some(d => !d.id)) return { statusCode: 400, headers, body: JSON.stringify({ error: 'every row requires an id' }) };
                // Same unbatched single statement as accounts/contacts — the
                // handoff named two files, this is the third. See bulkInsert in
                // _lib.mjs (18b8).
                const result = await bulkInsert({ table: opportunities, rows: data.map(d => sanitize(d)), orgId });
                return { statusCode: 201, headers, body: JSON.stringify(result) };
            }
            // Single insert
            if (!data.id) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) };
            }
            const [inserted] = await db.insert(opportunities).values({ ...sanitize(data), orgId }).returning();

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
            dispatchAutomations(orgId, 'opportunity.created', {
                id: inserted.id, account: inserted.account, sales_rep: inserted.salesRep,
                stage: inserted.stage, arr: inserted.arr ? Number(inserted.arr) : null,
            }).catch(e => console.warn('auto error:', e.message));

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
                const callerName = await getCallerName(userId, orgId);

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
                    })
                    .from(opportunities)
                    .where(and(eq(opportunities.orgId, orgId), inArray(opportunities.id, data.map(d => d.id))));
                const priors = new Map(priorRows.map(r => [r.id, r]));
                const staged = applyStageChanges(data, priors, importDate);
                    // partialRows, not sanitize() alone. sanitize() is a FULL-ROW
                    // builder -- it expands a payload rather than filtering one --
                    // and bulkUpsert derives its SET clause from the keys supplied,
                    // so feeding it a sanitized row wrote every column. A CSV
                    // overwrite carrying fourteen columns wrote all forty, blanking
                    // stage history, Team Notes and linked contacts with the empty
                    // arrays sanitize had just invented. 18b13: the fix belongs
                    // here, in the endpoint. The previous one was in the caller and
                    // sanitize put the columns straight back.
                const result = await bulkUpsert({
                    table: opportunities,
                    rows: partialRows(staged.rows, sanitize),
                    orgId,
                    // Through the registry, never named at the call site (18b19).
                    ownerColumn: ownerColumnOf(opportunities, 'opportunity'),
                    callerName,
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
                }
                return { statusCode: 200, headers, body: JSON.stringify({ ...result, stageChanged: staged.changedCount }) };
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
            const previousStage    = existing?.stage    || null;
            const previousComments = existing?.comments || [];

            const clean = sanitize(data);
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
                const autoEvt = upserted.stage === 'Closed Won' ? 'opportunity.won' : upserted.stage === 'Closed Lost' ? 'opportunity.lost' : 'opportunity.stage_changed';
                dispatchAutomations(orgId, autoEvt, {
                    id: upserted.id, account: upserted.account, sales_rep: upserted.salesRep,
                    stage: upserted.stage, arr: upserted.arr ? Number(upserted.arr) : null,
                    from_stage: previousStage, to_stage: upserted.stage,
                }).catch(e => console.warn('auto error:', e.message));
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
        console.error('Opportunities function error:', err.message);
        return { statusCode: 500, headers, body: serverErrorBody(err, 'opportunities') };
    }
};
