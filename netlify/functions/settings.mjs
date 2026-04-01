import { db } from '../../db/index.js';
import { settings } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { verifyAuth } from './auth.mjs';
import { encrypt, decrypt } from './crypto.mjs';

// ── Handler ───────────────────────────────────────────────────────────────────
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

            // Decrypt the stored API key — only expose whether one exists, not the value.
            // The frontend never receives the plaintext key.
            const storedKey = row.extra?.anthropicApiKey || null;
            const decryptedKey = storedKey ? decrypt(storedKey) : null;

            return { statusCode: 200, headers, body: JSON.stringify({ settings: {
                companyName:      row.companyName     || '',
                companyLogo:      row.companyLogo     || '',
                fiscalYearStart:  row.fiscalYearStart || '',
                funnelStages:     row.stages          || [],
                products:         row.extra?.products        || [],
                taskTypes:        row.taskTypes       || ['Call', 'Meeting', 'Email'],
                painPoints:       row.painPoints      || [],
                verticalMarkets:  row.verticalMarkets || [],
                fieldVisibility:  row.fieldVisibility || {},
                // Extended fields — stored in the extra jsonb blob column
                quotaData:        row.extra?.quotaData       || null,
                commissionTiers:  row.extra?.commissionTiers || null,
                pipelines:        row.extra?.pipelines       || null,
                teams:            row.extra?.teams           || null,
                territories:      row.extra?.territories     || null,
                verticals:        row.extra?.verticals       || null,
                kpiTolerances:    row.extra?.kpiTolerances   || null,
                kpiTargets:       row.extra?.kpiTargets      || null,
                logoUrl:          row.extra?.logoUrl         || null,
                kpiConfig:        row.extra?.kpiConfig       || null,
                commissionPlan:   row.extra?.commissionPlan  || null,
                aiScoringEnabled: row.extra?.aiScoringEnabled ?? false,
                leadsEnabled:     row.extra?.leadsEnabled     ?? true,
                customerTypes:    row.extra?.customerTypes    || [],
                companyProfile:   row.extra?.companyProfile   || null,
                // BYOK: send back the plaintext key so the UI can display it,
                // but NEVER log or expose it in error responses
                anthropicApiKey:  decryptedKey || null,
            }})};
        }

        if (event.httpMethod === 'PUT') {
            const data = JSON.parse(event.body);

            // Read existing row first so we can merge extra fields safely.
            const existing = await db.select().from(settings).where(eq(settings.orgId, orgId));
            const existingExtra = existing.length > 0 ? (existing[0].extra || {}) : {};

            // Handle BYOK key: encrypt if provided, preserve existing if not sent, clear if explicitly null
            let encryptedApiKey;
            if ('anthropicApiKey' in data) {
                if (data.anthropicApiKey) {
                    try {
                        encryptedApiKey = encrypt(data.anthropicApiKey);
                    } catch (err) {
                        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Encryption not available: ' + err.message }) };
                    }
                } else {
                    encryptedApiKey = null;
                }
            } else {
                encryptedApiKey = existingExtra.anthropicApiKey || null;
            }

            // Merge: incoming data wins for any key it explicitly provides,
            // keys absent from the payload fall back to whatever is in the DB.
            const extra = {
                quotaData:        'quotaData'        in data ? (data.quotaData        || null) : existingExtra.quotaData        || null,
                commissionTiers:  'commissionTiers'  in data ? (data.commissionTiers  || null) : existingExtra.commissionTiers  || null,
                pipelines:        'pipelines'        in data ? (data.pipelines        || null) : existingExtra.pipelines        || null,
                teams:            'teams'            in data ? (data.teams            || null) : existingExtra.teams            || null,
                territories:      'territories'      in data ? (data.territories      || null) : existingExtra.territories      || null,
                verticals:        'verticals'        in data ? (data.verticals        || null) : existingExtra.verticals        || null,
                kpiTolerances:    'kpiTolerances'    in data ? (data.kpiTolerances    || null) : existingExtra.kpiTolerances    || null,
                kpiTargets:       'kpiTargets'       in data ? (data.kpiTargets       || null) : existingExtra.kpiTargets       || null,
                logoUrl:          'logoUrl'          in data ? (data.logoUrl          || null) : existingExtra.logoUrl          || null,
                kpiConfig:        'kpiConfig'        in data ? (data.kpiConfig        || null) : existingExtra.kpiConfig        || null,
                commissionPlan:   'commissionPlan'   in data ? (data.commissionPlan   || null) : existingExtra.commissionPlan   || null,
                products:         'products'         in data ? (data.products         || [])   : existingExtra.products         || [],
                aiScoringEnabled: 'aiScoringEnabled' in data ? !!data.aiScoringEnabled : existingExtra.aiScoringEnabled ?? false,
                leadsEnabled:     'leadsEnabled'     in data ? !!data.leadsEnabled     : existingExtra.leadsEnabled     ?? true,
                customerTypes:    'customerTypes'    in data ? (data.customerTypes    || [])   : existingExtra.customerTypes    || [],
                companyProfile:   'companyProfile'   in data ? (data.companyProfile   || null) : existingExtra.companyProfile   || null,
                // Store encrypted ciphertext — never the plaintext key
                anthropicApiKey:  encryptedApiKey,
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
