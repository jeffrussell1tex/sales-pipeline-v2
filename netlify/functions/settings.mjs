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
                // Extended fields — stored in the extra jsonb blob column
                quotaData:       row.extra?.quotaData       || null,
                commissionTiers: row.extra?.commissionTiers || null,
                pipelines:       row.extra?.pipelines       || null,
                teams:           row.extra?.teams           || null,
                territories:     row.extra?.territories     || null,
                verticals:       row.extra?.verticals       || null,
                kpiTolerances:   row.extra?.kpiTolerances   || null,
                kpiTargets:      row.extra?.kpiTargets      || null,
                logoUrl:         row.extra?.logoUrl         || null,
                kpiConfig:       row.extra?.kpiConfig       || null,
                commissionPlan:  row.extra?.commissionPlan  || null,
            }})};
        }
        if (event.httpMethod === 'PUT') {
            const data = JSON.parse(event.body);
            // Build the extra jsonb blob for fields without dedicated columns
            const extra = {
                quotaData:       data.quotaData       || null,
                commissionTiers: data.commissionTiers || null,
                pipelines:       data.pipelines       || null,
                teams:           data.teams           || null,
                territories:     data.territories     || null,
                verticals:       data.verticals       || null,
                kpiTolerances:   data.kpiTolerances   || null,
                kpiTargets:      data.kpiTargets      || null,
                logoUrl:         data.logoUrl         || null,
                kpiConfig:       data.kpiConfig       || null,
                commissionPlan:  data.commissionPlan  || null,
            };
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
                extra,
                updatedAt:       new Date(),
            };
            await db.insert(settings).values(dbRow).onConflictDoUpdate({
                target: settings.id,
                set: { companyName: dbRow.companyName, companyLogo: dbRow.companyLogo, fiscalYearStart: dbRow.fiscalYearStart, stages: dbRow.stages, taskTypes: dbRow.taskTypes, painPoints: dbRow.painPoints, verticalMarkets: dbRow.verticalMarkets, fieldVisibility: dbRow.fieldVisibility, extra: dbRow.extra, updatedAt: dbRow.updatedAt }
            });
            return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
        }
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    } catch (err) {
        console.error('Settings error:', err.message);
        return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
};
