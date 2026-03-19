import { db } from '../../db/index.js';
import { settings } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { verifyAuth } from './auth.mjs';

const SETTINGS_ID = 'default';

export const handler = async (event) => {
    const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' };
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
    const auth = await verifyAuth(event);
    if (auth.error) return { statusCode: auth.status || 401, headers, body: JSON.stringify({ error: auth.error }) };
    const { orgId } = auth;

    try {
        if (event.httpMethod === 'GET') {
            const rows = await db.select().from(settings).where(eq(settings.orgId, orgId));
            if (rows.length === 0) return { statusCode: 200, headers, body: JSON.stringify({ settings: null }) };
            const row = rows[0];
            return { statusCode: 200, headers, body: JSON.stringify({ settings: {
                companyName:     row.companyName     || '',
                companyLogo:     row.companyLogo     || '',
                fiscalYearStart: row.fiscalYearStart || '',
                funnelStages:    row.stages          || [],
                products:        row.extra?.products        || [],
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
                aiScoringEnabled: row.extra?.aiScoringEnabled ?? false,
            }})};
        }
        if (event.httpMethod === 'PUT') {
            const data = JSON.parse(event.body);

            // Read existing row first so we can merge extra fields safely.
            // This prevents a partial save (e.g. from the quota manager) from
            // nulling out teams/territories/pipelines/verticals that weren't
            // included in the payload.
            const existing = await db.select().from(settings).where(eq(settings.orgId, orgId));
            const existingExtra = existing.length > 0 ? (existing[0].extra || {}) : {};

            // Merge: incoming data wins for any key it explicitly provides (even null),
            // but keys absent from the payload fall back to whatever is already in the DB.
            const extra = {
                quotaData:       'quotaData'       in data ? (data.quotaData       || null) : existingExtra.quotaData       || null,
                commissionTiers: 'commissionTiers' in data ? (data.commissionTiers || null) : existingExtra.commissionTiers || null,
                pipelines:       'pipelines'       in data ? (data.pipelines       || null) : existingExtra.pipelines       || null,
                teams:           'teams'           in data ? (data.teams           || null) : existingExtra.teams           || null,
                territories:     'territories'     in data ? (data.territories     || null) : existingExtra.territories     || null,
                verticals:       'verticals'       in data ? (data.verticals       || null) : existingExtra.verticals       || null,
                kpiTolerances:   'kpiTolerances'   in data ? (data.kpiTolerances   || null) : existingExtra.kpiTolerances   || null,
                kpiTargets:      'kpiTargets'      in data ? (data.kpiTargets      || null) : existingExtra.kpiTargets      || null,
                logoUrl:         'logoUrl'         in data ? (data.logoUrl         || null) : existingExtra.logoUrl         || null,
                kpiConfig:       'kpiConfig'       in data ? (data.kpiConfig       || null) : existingExtra.kpiConfig       || null,
                commissionPlan:  'commissionPlan'  in data ? (data.commissionPlan  || null) : existingExtra.commissionPlan  || null,
                products:        'products'        in data ? (data.products        || [])   : existingExtra.products        || [],
                aiScoringEnabled: 'aiScoringEnabled' in data ? !!data.aiScoringEnabled : existingExtra.aiScoringEnabled ?? false,
            };

            const dbRow = {
                id:              orgId,
                orgId:           orgId,
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
                set: { orgId, companyName: dbRow.companyName, companyLogo: dbRow.companyLogo, fiscalYearStart: dbRow.fiscalYearStart, stages: dbRow.stages, taskTypes: dbRow.taskTypes, painPoints: dbRow.painPoints, verticalMarkets: dbRow.verticalMarkets, fieldVisibility: dbRow.fieldVisibility, extra: dbRow.extra, updatedAt: dbRow.updatedAt }
            });
            return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
        }
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    } catch (err) {
        console.error('Settings error:', err.message);
        return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
};
