import { db } from '../../db/index.js';
import { settings } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { verifyAuth, requireRole, isAdmin } from './auth.mjs';
import { encrypt, decrypt } from './crypto.mjs';
import { serverErrorBody, writeAudit, getCallerName } from './_lib.mjs';
import { DEFAULT_LEAD_SCORING } from './score-lead.mjs';

// ── BYOK key quarantine ──────────────────────────────────────────────
// The org's Anthropic key may only ever live in extra.anthropicApiKey, as
// AES-256-GCM ciphertext. An earlier build of the AI settings panel bound its
// key input to aiSettings.byokProvider, which stored the key as PLAINTEXT
// inside the aiSettings blob — and that blob is returned to every org member
// on GET. These helpers quarantine that: extractLegacyKey() pulls a key-shaped
// value out for one-time migration into the encrypted field, and
// scrubAiSettings() removes key material from anything we store or return.
const KEY_SHAPED = /^sk-[A-Za-z0-9_-]{16,}$/;
const looksLikeApiKey = (v) => typeof v === 'string' && KEY_SHAPED.test(v.trim());
const LEGACY_KEY_FIELDS = ['byokProvider', 'byokKey', 'apiKey', 'anthropicApiKey'];

function extractLegacyKey(ai) {
    if (!ai || typeof ai !== 'object') return null;
    for (const f of LEGACY_KEY_FIELDS) {
        if (looksLikeApiKey(ai[f])) return ai[f].trim();
    }
    return null;
}

function scrubAiSettings(ai) {
    if (!ai || typeof ai !== 'object') return ai || null;
    const out = { ...ai };
    // These fields have no legitimate use in the aiSettings blob at all.
    for (const f of ['byokKey', 'apiKey', 'anthropicApiKey']) delete out[f];
    // byokProvider is a provider *label*; if it holds a key, replace the value.
    if (looksLikeApiKey(out.byokProvider)) out.byokProvider = 'Anthropic';
    return out;
}

// ── Handler ───────────────────────────────────────────────────────────────────
export const handler = async (event) => {
    const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' };
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
    const auth = await verifyAuth(event);
    if (auth.error) return { statusCode: auth.status || 401, headers, body: JSON.stringify({ error: auth.error }) };
    const { orgId, userId, userRole } = auth;

    try {
        if (event.httpMethod === 'GET') {
            const rows = await db.select().from(settings).where(eq(settings.orgId, orgId));
            if (rows.length === 0) return { statusCode: 200, headers, body: JSON.stringify({ settings: null }) };
            const row = rows[0];

            // BYOK key: the plaintext NEVER leaves the server. Every member gets a
            // boolean so the UI can render "key configured"; only an Admin gets the
            // last-4 hint so they can confirm *which* key is installed.
            const storedKey = row.extra?.anthropicApiKey || null;
            let keyLast4 = null;
            if (storedKey && isAdmin(userRole)) {
                // decrypt() returns null (never throws) on a bad key/ciphertext,
                // so a corrupt value degrades the hint instead of 500-ing the
                // whole settings load for the entire org.
                const plain = decrypt(storedKey);
                keyLast4 = plain ? plain.slice(-4) : null;
            }

            return { statusCode: 200, headers, body: JSON.stringify({ settings: {
                companyName:      row.companyName     || '',
                companyLogo:      row.companyLogo     || '',
                fiscalYearStart:  row.fiscalYearStart || '',
                funnelStages:     row.extra?.funnelStages || row.stages || [],
                competitors:      row.extra?.competitors      || [],
                reasonsWon:       row.extra?.reasonsWon       || [],
                reasonsLost:      row.extra?.reasonsLost      || [],
                products:         row.extra?.products        || [],
                taskTypes:        row.taskTypes       || ['Call', 'Meeting', 'Email'],
                painPoints:       row.extra?.painPoints || row.painPoints || [],
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
                leadConvBenchmarks: row.extra?.leadConvBenchmarks || null,
                // Company profile detail fields
                companyDisplayName:   row.extra?.companyDisplayName   || row.companyName || '',
                companyLegalName:     row.extra?.companyLegalName     || '',
                companyBrandColor:    row.extra?.companyBrandColor    || '#7a6a48',
                companyAddress:       row.extra?.companyAddress       || '',
                companyCity:          row.extra?.companyCity          || '',
                companyState:         row.extra?.companyState         || '',
                companyZip:           row.extra?.companyZip           || '',
                companyCountry:       row.extra?.companyCountry       || 'United States',
                companyPhone:         row.extra?.companyPhone         || '',
                companySupportEmail:  row.extra?.companySupportEmail  || '',
                quoteHeader:          row.extra?.quoteHeader          || '',
                // Company calendar
                customHolidays:       row.extra?.customHolidays       || [],
                federalHolidays:      row.extra?.federalHolidays      || [],
                // Sales process Group 1
                kpiThresholds:        row.extra?.kpiThresholds        || null,
                assignmentRules:      row.extra?.assignmentRules      || null,
                // Sales process Group 2
                customFieldsByObject: row.extra?.customFieldsByObject || null,
                customerTypeTiers:    row.extra?.customerTypeTiers    || null,
                accountSegmentTiers:  row.extra?.accountSegmentTiers  || null,
                leadScoring:          row.extra?.leadScoring          || DEFAULT_LEAD_SCORING,
                rolePermissions:      row.extra?.rolePermissions      || null,
                roles:      row.extra?.roles      || null,
                ssoConfig:            row.extra?.ssoConfig            || null,
                // Quoting (persisted via quoting settings panels)
                approvalTiers:        row.extra?.approvalTiers        || null,
                approvalTriggers:     row.extra?.approvalTriggers     || null,
                priceBookProducts:    row.extra?.priceBookProducts    || [],
                quoteTemplates:       row.extra?.quoteTemplates       || null,
                quoteBrand:       row.extra?.quoteBrand       || null,
                quoteDefaults:        row.extra?.quoteDefaults        || null,
                quoteBoilerplate:     row.extra?.quoteBoilerplate     || null,
                industries:           row.extra?.industries            || null,
                buyerPersonas:        row.extra?.buyerPersonas         || [],
                quotesEnabled:        row.extra?.quotesEnabled         ?? true,
                dispatchEnabled:      row.extra?.dispatchEnabled       ?? false,
                dispatchSkills:       row.extra?.dispatchSkills        || [],
                dispatchCerts:        row.extra?.dispatchCerts         || [],
                dispatchLicenses:     row.extra?.dispatchLicenses      || ['Apprentice','Journeyman','Master','Lead'],
                dispatchVehicles:     row.extra?.dispatchVehicles      || [],
                dispatchEquipment:     row.extra?.dispatchEquipment      || [],
                dispatchJobs:         row.extra?.dispatchJobs          || [],
                dispatchCrews:        row.extra?.dispatchCrews         || [],
                dispatchJobTemplates: row.extra?.dispatchJobTemplates  || [],
                featureFlags:         row.extra?.featureFlags          || {},
                aiSettings:           scrubAiSettings(row.extra?.aiSettings) || null,
                // BYOK: presence flag for all members; masked hint for Admins only.
                // The plaintext key is never included in this response body.
                anthropicApiKeySet:   !!storedKey,
                anthropicApiKeyLast4: keyLast4,
            }})};
        }

        if (event.httpMethod === 'PUT') {
            // Settings are org-wide (stages, field visibility, feature flags,
            // fiscal year, the BYOK key). Per the role model, only Admins may
            // write them — without this, any member could rewrite shared config
            // that every other user depends on.
            const forbidden = requireRole(auth, ['Admin'], headers);
            if (forbidden) return forbidden;

            const data = JSON.parse(event.body);

            // Read existing row first so we can merge extra fields safely.
            const existing = await db.select().from(settings).where(eq(settings.orgId, orgId));
            const existingExtra = existing.length > 0 ? (existing[0].extra || {}) : {};

            // One-time migration: if a plaintext key is sitting in the aiSettings
            // blob (incoming or already stored), lift it into the encrypted field.
            // scrubAiSettings() below then strips it from what we persist, so the
            // plaintext self-heals out of the DB on the first admin save.
            const legacyPlainKey = extractLegacyKey('aiSettings' in data ? data.aiSettings : null)
                                || extractLegacyKey(existingExtra.aiSettings);

            // Handle BYOK key: encrypt if provided, migrate a legacy plaintext key,
            // preserve existing if not sent, clear if explicitly null.
            let encryptedApiKey;
            let keyAction = null; // 'set' | 'cleared' | 'migrated' | null (unchanged)
            try {
                if ('anthropicApiKey' in data) {
                    if (data.anthropicApiKey) {
                        encryptedApiKey = encrypt(String(data.anthropicApiKey).trim());
                        keyAction = 'set';
                    } else {
                        encryptedApiKey = null;
                        keyAction = existingExtra.anthropicApiKey ? 'cleared' : null;
                    }
                } else if (!existingExtra.anthropicApiKey && legacyPlainKey) {
                    encryptedApiKey = encrypt(legacyPlainKey);
                    keyAction = 'migrated';
                } else {
                    encryptedApiKey = existingExtra.anthropicApiKey || null;
                }
            } catch (err) {
                // Never echo err.message — it can name the missing env var.
                console.error('[settings] BYOK encrypt failed:', err?.message);
                return { statusCode: 503, headers, body: JSON.stringify({ error: 'Key encryption is not available. Contact your administrator.' }) };
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
                leadConvBenchmarks:   'leadConvBenchmarks'   in data ? (data.leadConvBenchmarks   || null) : existingExtra.leadConvBenchmarks   || null,
                // Company profile detail fields
                companyDisplayName:   'companyDisplayName'   in data ? (data.companyDisplayName   || null) : existingExtra.companyDisplayName   || null,
                companyLegalName:     'companyLegalName'     in data ? (data.companyLegalName     || null) : existingExtra.companyLegalName     || null,
                companyBrandColor:    'companyBrandColor'    in data ? (data.companyBrandColor    || null) : existingExtra.companyBrandColor    || null,
                companyAddress:       'companyAddress'       in data ? (data.companyAddress       || null) : existingExtra.companyAddress       || null,
                companyCity:          'companyCity'          in data ? (data.companyCity          || null) : existingExtra.companyCity          || null,
                companyState:         'companyState'         in data ? (data.companyState         || null) : existingExtra.companyState         || null,
                companyZip:           'companyZip'           in data ? (data.companyZip           || null) : existingExtra.companyZip           || null,
                companyCountry:       'companyCountry'       in data ? (data.companyCountry       || null) : existingExtra.companyCountry       || null,
                companyPhone:         'companyPhone'         in data ? (data.companyPhone         || null) : existingExtra.companyPhone         || null,
                companySupportEmail:  'companySupportEmail'  in data ? (data.companySupportEmail  || null) : existingExtra.companySupportEmail  || null,
                quoteHeader:          'quoteHeader'          in data ? (data.quoteHeader          || null) : existingExtra.quoteHeader          || null,
                // Company calendar
                customHolidays:       'customHolidays'       in data ? (data.customHolidays       || [])   : existingExtra.customHolidays       || [],
                federalHolidays:      'federalHolidays'      in data ? (data.federalHolidays      || [])   : existingExtra.federalHolidays      || [],
                // Quoting
                approvalTiers:        'approvalTiers'        in data ? (data.approvalTiers        || null) : existingExtra.approvalTiers        || null,
                approvalTriggers:     'approvalTriggers'     in data ? (data.approvalTriggers     || null) : existingExtra.approvalTriggers     || null,
                priceBookProducts:    'priceBookProducts'    in data ? (data.priceBookProducts    || [])   : existingExtra.priceBookProducts    || [],
                quoteTemplates:       'quoteTemplates'       in data ? (data.quoteTemplates       || null) : existingExtra.quoteTemplates       || null,
                quoteBrand:       'quoteBrand'       in data ? (data.quoteBrand       || null) : existingExtra.quoteBrand       || null,
                quoteDefaults:        'quoteDefaults'        in data ? (data.quoteDefaults        || null) : existingExtra.quoteDefaults        || null,
                quoteBoilerplate:     'quoteBoilerplate'     in data ? (data.quoteBoilerplate     || null) : existingExtra.quoteBoilerplate     || null,
                // Sales process Group 1
                funnelStages:         'funnelStages'         in data ? (data.funnelStages         || [])   : existingExtra.funnelStages         || [],
                kpiThresholds:        'kpiThresholds'        in data ? (data.kpiThresholds        || null) : existingExtra.kpiThresholds        || null,
                assignmentRules:      'assignmentRules'      in data ? (data.assignmentRules      || null) : existingExtra.assignmentRules      || null,
                // Sales process Group 2
                customFieldsByObject: 'customFieldsByObject' in data ? (data.customFieldsByObject || null) : existingExtra.customFieldsByObject || null,
                customerTypeTiers:    'customerTypeTiers'    in data ? (data.customerTypeTiers    || null) : existingExtra.customerTypeTiers    || null,
                accountSegmentTiers:  'accountSegmentTiers'  in data ? (data.accountSegmentTiers  || null) : existingExtra.accountSegmentTiers  || null,
                leadScoring:          'leadScoring'          in data ? (data.leadScoring          || null) : existingExtra.leadScoring          || null,
                rolePermissions:      'rolePermissions'      in data ? (data.rolePermissions      || null) : existingExtra.rolePermissions      || null,
                roles:      'roles'      in data ? (data.roles      || null) : existingExtra.roles      || null,
                ssoConfig:            'ssoConfig'            in data ? (data.ssoConfig            || null) : existingExtra.ssoConfig            || null,
                industries:           'industries'           in data ? (data.industries           || null) : existingExtra.industries           || null,
                buyerPersonas:        'buyerPersonas'        in data ? (data.buyerPersonas        || [])   : existingExtra.buyerPersonas        || [],
                quotesEnabled:        'quotesEnabled'        in data ? !!data.quotesEnabled                : existingExtra.quotesEnabled        ?? true,
                dispatchEnabled:      'dispatchEnabled'      in data ? !!data.dispatchEnabled               : existingExtra.dispatchEnabled       ?? false,
                dispatchSkills:       'dispatchSkills'       in data ? (data.dispatchSkills       || [])   : existingExtra.dispatchSkills        || [],
                dispatchCerts:        'dispatchCerts'        in data ? (data.dispatchCerts        || [])   : existingExtra.dispatchCerts         || [],
                dispatchLicenses:     'dispatchLicenses'     in data ? (data.dispatchLicenses     || null) : existingExtra.dispatchLicenses      || null,
                dispatchVehicles:     'dispatchVehicles'     in data ? (data.dispatchVehicles     || [])   : existingExtra.dispatchVehicles      || [],
                dispatchEquipment:     'dispatchEquipment'     in data ? (data.dispatchEquipment     || [])   : existingExtra.dispatchEquipment      || [],
                dispatchJobs:         'dispatchJobs'         in data ? (data.dispatchJobs         || [])   : existingExtra.dispatchJobs          || [],
                dispatchCrews:        'dispatchCrews'        in data ? (data.dispatchCrews        || [])   : existingExtra.dispatchCrews         || [],
                dispatchJobTemplates: 'dispatchJobTemplates' in data ? (data.dispatchJobTemplates || [])   : existingExtra.dispatchJobTemplates  || [],
                featureFlags:         'featureFlags'         in data ? (data.featureFlags         || {})   : existingExtra.featureFlags         || {},
                aiSettings:           'aiSettings'           in data ? (scrubAiSettings(data.aiSettings) || null) : scrubAiSettings(existingExtra.aiSettings) || null,
                painPoints:           'painPoints'           in data ? (data.painPoints           || [])   : existingExtra.painPoints           || [],
                competitors:          'competitors'          in data ? (data.competitors          || [])   : existingExtra.competitors          || [],
                reasonsWon:           'reasonsWon'           in data ? (data.reasonsWon           || [])   : existingExtra.reasonsWon           || [],
                reasonsLost:          'reasonsLost'          in data ? (data.reasonsLost          || [])   : existingExtra.reasonsLost          || [],
                // Store encrypted ciphertext — never the plaintext key
                anthropicApiKey:  encryptedApiKey,
            };

            // Preserve fiscalYearStart if not explicitly sent in this PUT
            const fiscalYearStartToSave = 'fiscalYearStart' in data
                ? (data.fiscalYearStart || null)
                : (existing[0]?.fiscalYearStart ?? null);

            const dbRow = {
                id:              orgId,
                orgId:           orgId,
                companyName:     'companyName' in data ? (data.companyName || null) : (existing[0]?.companyName ?? null),
                companyLogo:     'companyLogo' in data ? (data.companyLogo || null) : (existing[0]?.companyLogo ?? null),
                fiscalYearStart: fiscalYearStartToSave,
                stages:          'funnelStages'    in data ? (data.funnelStages    || [])                          : (existing[0]?.stages         ?? []),
                taskTypes:       'taskTypes'       in data ? (data.taskTypes       || ['Call', 'Meeting', 'Email']) : (existing[0]?.taskTypes       ?? ['Call', 'Meeting', 'Email']),
                painPoints:      'painPoints'      in data ? (data.painPoints      || [])                          : (existing[0]?.painPoints      ?? []),
                verticalMarkets: 'verticalMarkets' in data ? (data.verticalMarkets || [])                          : (existing[0]?.verticalMarkets ?? []),
                fieldVisibility: 'fieldVisibility' in data ? (data.fieldVisibility || {})                          : (existing[0]?.fieldVisibility ?? {}),
                extra,
                updatedAt:       new Date(),
            };
            await db.insert(settings).values(dbRow).onConflictDoUpdate({
                target: settings.id, setWhere: eq(settings.orgId, orgId),
                set: { orgId, companyName: dbRow.companyName, companyLogo: dbRow.companyLogo, fiscalYearStart: dbRow.fiscalYearStart, stages: dbRow.stages, taskTypes: dbRow.taskTypes, painPoints: dbRow.painPoints, verticalMarkets: dbRow.verticalMarkets, fieldVisibility: dbRow.fieldVisibility, extra: dbRow.extra, updatedAt: dbRow.updatedAt }
            });

            // Audit the write. Org-wide config changes are exactly the kind of
            // integrity event the audit log exists for. Key material is never
            // recorded — only the fact that the key changed.
            const changedKeys = Object.keys(data).filter(k => k !== 'anthropicApiKey');
            const callerName = await getCallerName(userId);
            await writeAudit(orgId, {
                action: keyAction ? 'settings.apikey.' + keyAction : 'settings.updated',
                entityType: 'settings',
                entityId: orgId,
                entityName: dbRow.companyName || 'Organization settings',
                detail: keyAction
                    ? `BYOK key ${keyAction}` + (changedKeys.length ? `; updated: ${changedKeys.slice(0, 20).join(', ')}` : '')
                    : `Updated: ${changedKeys.slice(0, 20).join(', ') || '(no fields)'}`,
                userId,
                userName: callerName,
            });

            return { statusCode: 200, headers, body: JSON.stringify({ success: true, anthropicApiKeySet: !!encryptedApiKey }) };
        }

        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    } catch (err) {
        // serverErrorBody logs the real error + stack server-side with a
        // correlation id and returns only a generic message to the client.
        return { statusCode: 500, headers, body: serverErrorBody(err, 'settings') };
    }
};
