import { db } from '../../db/index.js';
import { opportunities, users } from '../../db/schema.js';
import { eq, asc } from 'drizzle-orm';
import { verifyAuth, canSeeAll, isManager } from './auth.mjs';
import { sendEmail, emailTemplates } from './send-email.mjs';

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

// Fetch a rep's full user record (email + notification prefs) by display name
async function getRepUser(repName) {
    if (!repName) return null;
    try {
        const [user] = await db.select({ email: users.email, profile: users.profile })
            .from(users)
            .where(eq(users.name, repName));
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
async function maybeEmail(repName, alertType, templateArgs) {
    try {
        const repUser = await getRepUser(repName);
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
    const { userId, userRole, managedReps } = auth;

    try {
        // ── GET ───────────────────────────────────────────────────────────────
        if (event.httpMethod === 'GET') {
            let results = await db.select().from(opportunities).orderBy(asc(opportunities.createdAt));
            if (!canSeeAll(userRole)) {
                results = results.filter(o => !o.salesRep || o.salesRep === userId);
            } else if (isManager(userRole) && managedReps.length > 0) {
                results = results.filter(o => !o.salesRep || managedReps.includes(o.salesRep));
            }
            return { statusCode: 200, headers, body: JSON.stringify({ opportunities: results }) };
        }

        // ── POST (create) ─────────────────────────────────────────────────────
        if (event.httpMethod === 'POST') {
            const data = JSON.parse(event.body);
            if (!data.id) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) };
            }
            const [inserted] = await db.insert(opportunities).values(sanitize(data)).returning();

            // Email: new opportunity created — notify assigned rep if someone else created it
            if (inserted.salesRep && inserted.salesRep !== userId) {
                await maybeEmail(inserted.salesRep, 'opportunityCreated', {
                    repName:       inserted.salesRep,
                    dealName:      inserted.opportunityName || 'New Deal',
                    account:       inserted.account,
                    arr:           inserted.arr,
                    stage:         inserted.stage,
                    createdBy:     userId,
                    opportunityId: inserted.id,
                });
            }

            return { statusCode: 201, headers, body: JSON.stringify({ opportunity: inserted }) };
        }

        // ── PUT (update) ──────────────────────────────────────────────────────
        if (event.httpMethod === 'PUT') {
            const data = JSON.parse(event.body);
            if (!data.id) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) };
            }

            // Fetch existing record before update so we can detect changes
            const [existing] = await db.select().from(opportunities).where(eq(opportunities.id, data.id));
            const previousStage    = existing?.stage    || null;
            const previousComments = existing?.comments || [];

            const clean = sanitize(data);
            const { id, ...updateData } = clean;
            const [upserted] = await db.insert(opportunities)
                .values(clean)
                .onConflictDoUpdate({
                    target: opportunities.id,
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
                    });
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
                    });
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
                    });
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
                });
            }

            return { statusCode: 200, headers, body: JSON.stringify({ opportunity: upserted }) };
        }

        // ── DELETE ────────────────────────────────────────────────────────────
        if (event.httpMethod === 'DELETE') {
            const clear = event.queryStringParameters?.clear;
            if (clear === 'true') {
                await db.delete(opportunities);
                return { statusCode: 200, headers, body: JSON.stringify({ success: true, cleared: true }) };
            }
            const id = event.queryStringParameters?.id;
            if (!id) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'id or clear=true is required' }) };
            }
            await db.delete(opportunities).where(eq(opportunities.id, id));
            return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
        }

        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

    } catch (err) {
        console.error('Opportunities function error:', err.message);
        return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
};
