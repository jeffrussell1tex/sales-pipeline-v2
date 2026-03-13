import { db } from '../../db/index.js';
import { opportunities, users } from '../../db/schema.js';
import { eq, asc } from 'drizzle-orm';
import { verifyAuth, canSeeAll, isManager } from './auth.mjs';
import { sendEmail, emailTemplates } from './send-email.mjs';

// Looks up a rep's email from the users table by their display name.
// Returns null if not found so email failures never break the main response.
async function getRepEmail(repName) {
    if (!repName) return null;
    try {
        const [user] = await db.select({ email: users.email })
            .from(users)
            .where(eq(users.name, repName));
        return user?.email || null;
    } catch (err) {
        console.error('getRepEmail error:', err.message);
        return null;
    }
}

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

    try {
        if (event.httpMethod === 'GET') {
            let results = await db.select().from(opportunities).orderBy(asc(opportunities.createdAt));
            if (!canSeeAll(userRole)) {
                results = results.filter(o => !o.salesRep || o.salesRep === userId);
            } else if (isManager(userRole) && managedReps.length > 0) {
                results = results.filter(o => !o.salesRep || managedReps.includes(o.salesRep));
            }
            return { statusCode: 200, headers, body: JSON.stringify({ opportunities: results }) };
        }

        if (event.httpMethod === 'POST') {
            const data = JSON.parse(event.body);
            if (!data.id) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) };
            }
            const [inserted] = await db.insert(opportunities).values(sanitize(data)).returning();

            // Email: notify rep when a deal is assigned to them
            if (inserted.salesRep && inserted.salesRep !== userId) {
                getRepEmail(inserted.salesRep).then(repEmail => {
                    if (!repEmail) return;
                    return sendEmail({
                        to: repEmail,
                        ...emailTemplates.dealAssigned({
                            repName:       inserted.salesRep,
                            dealName:      inserted.opportunityName || 'New Deal',
                            account:       inserted.account,
                            arr:           inserted.arr,
                            stage:         inserted.stage,
                            assignedBy:    userId,
                            opportunityId: inserted.id,
                        }),
                    });
                }).catch(err => console.error('dealAssigned email error:', err.message));
            }

            return { statusCode: 201, headers, body: JSON.stringify({ opportunity: inserted }) };
        }

        if (event.httpMethod === 'PUT') {
            const data = JSON.parse(event.body);
            if (!data.id) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) };
            }

            // Fetch the existing record so we can detect stage changes
            const [existing] = await db.select().from(opportunities).where(eq(opportunities.id, data.id));
            const previousStage = existing?.stage || null;

            const clean = sanitize(data);
            const { id, ...updateData } = clean;
            const [upserted] = await db.insert(opportunities)
                .values(clean)
                .onConflictDoUpdate({
                    target: opportunities.id,
                    set: { ...updateData, updatedAt: new Date() }
                })
                .returning();

            // Email: notify rep when stage has changed
            if (previousStage && upserted.stage !== previousStage && upserted.salesRep) {
                getRepEmail(upserted.salesRep).then(repEmail => {
                    if (!repEmail) return;
                    return sendEmail({
                        to: repEmail,
                        ...emailTemplates.stageChanged({
                            repName:       upserted.salesRep,
                            dealName:      upserted.opportunityName || 'Deal',
                            account:       upserted.account,
                            arr:           upserted.arr,
                            fromStage:     previousStage,
                            toStage:       upserted.stage,
                            changedBy:     userId,
                            opportunityId: upserted.id,
                        }),
                    });
                }).catch(err => console.error('stageChanged email error:', err.message));
            }

            return { statusCode: 200, headers, body: JSON.stringify({ opportunity: upserted }) };
        }

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
