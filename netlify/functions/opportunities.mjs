import { db } from '../../db/index.js';
import { opportunities } from '../../db/schema.js';
import { eq, asc } from 'drizzle-orm';
import { verifyAuth, canSeeAll, isManager } from './auth.mjs';

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
            return { statusCode: 201, headers, body: JSON.stringify({ opportunity: inserted }) };
        }
        if (event.httpMethod === 'PUT') {
            const data = JSON.parse(event.body);
            if (!data.id) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) };
            }
            const clean = sanitize(data);
            const { id, ...updateData } = clean;
            const [upserted] = await db.insert(opportunities)
                .values(clean)
                .onConflictDoUpdate({
                    target: opportunities.id,
                    set: { ...updateData, updatedAt: new Date() }
                })
                .returning();
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
