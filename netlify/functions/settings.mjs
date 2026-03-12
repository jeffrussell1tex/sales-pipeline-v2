import { db } from '../../db/index.js';
import { settings } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { verifyAuth } from './auth.mjs';

const SETTINGS_ID = 'default';

export const handler = async (event) => {
    const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' };
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
    const auth = await verifyAuth(event);
    if (auth.error) return { statusCode: auth.status || 401, headers, body: JSON.stringify({ error: auth.error }) };

    try {
        if (event.httpMethod === 'GET') {
            const rows = await db.select().from(settings).where(eq(settings.id, SETTINGS_ID));
            if (rows.length === 0) return { statusCode: 200, headers, body: JSON.stringify({ settings: null }) };
            const row = rows[0];
            return { statusCode: 200, headers, body: JSON.stringify({ settings: {
                companyName:     row.companyName     || '',
                companyLogo:     row.companyLogo     || '',
                fiscalYearStart: row.fiscalYearStart || '',
                funnelStages:    row.stages          || [],
                taskTypes:       row.taskTypes       || ['Call', 'Meeting', 'Email'],
                painPoints:      row.painPoints      || [],
                verticalMarkets: row.verticalMarkets || [],
                fieldVisibility: row.fieldVisibility || {},
            }})};
        }
        if (event.httpMethod === 'PUT') {
            const data = JSON.parse(event.body);
            const dbRow = {
                id:              SETTINGS_ID,
                companyName:     data.companyName     || null,
                companyLogo:     data.companyLogo     || null,
                fiscalYearStart: data.fiscalYearStart || null,
                stages:          data.funnelStages    || [],
                taskTypes:       data.taskTypes       || ['Call', 'Meeting', 'Email'],
                painPoints:      data.painPoints      || [],
                verticalMarkets: data.verticalMarkets || [],
                fieldVisibility: data.fieldVisibility || {},
                updatedAt:       new Date(),
            };
            await db.insert(settings).values(dbRow).onConflictDoUpdate({
                target: settings.id,
                set: { companyName: dbRow.companyName, companyLogo: dbRow.companyLogo, fiscalYearStart: dbRow.fiscalYearStart, stages: dbRow.stages, taskTypes: dbRow.taskTypes, painPoints: dbRow.painPoints, verticalMarkets: dbRow.verticalMarkets, fieldVisibility: dbRow.fieldVisibility, updatedAt: dbRow.updatedAt }
            });
            return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
        }
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    } catch (err) {
        console.error('Settings error:', err.message);
        return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
};
