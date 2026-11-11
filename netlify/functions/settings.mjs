import { db } from '../../db/index.js';
import { settings, users } from '../../db/schema.js';
import { eq, desc, and, inArray } from 'drizzle-orm';
import { verifyAuth, requireRole, isAdmin } from './auth.mjs';
import { validateSlackWebhookUrl } from './_slackWebhook.mjs';
import { cleanSlackAlerts } from '../../src/utils/slackAlerts.js';
import { cleanCustomerNotifications } from '../../src/utils/customerNotifications.js';
import { cleanWebToLead } from '../../src/utils/webToLead.js';
import { cleanEmailTemplates } from '../../src/utils/emailTemplates.js';
import { cleanProductTypes } from '../../src/utils/invoices.js';
// Who approves each discount tier (§0.157): the mode and the tiers, cleaned by the
// quote rule's own cleaner; quotes.mjs enforces them.
import { cleanApprovalRouting, cleanApprovalTiers, canApproveQuotes } from '../../src/utils/quoteRules.js';
import { randomBytes } from 'crypto';
import { encrypt, decrypt } from './crypto.mjs';
import { serverErrorBody, writeAudit, getCallerName } from './_lib.mjs';
import { DEFAULT_LEAD_SCORING } from './score-lead.mjs';
// A key a workspace has never saved is the shared default (state §0.170) — the
// app's own copy, so a read, a save and the app's first paint agree.
import { settingsSeeds, DEFAULT_SETTINGS } from '../../src/utils/settingsDefaults.js';
import { QUOTA_PERIODS, cleanQuotaPeriods } from '../../src/utils/quotaPlan.js';
// The ids inside settings (state §0.221): each list's shape, and the links its entries name.
import { SETTINGS_LISTS, listShapeRefused } from '../../src/utils/linkIds.js';
import { checkSettingsLinks } from './_links.mjs';
// A team is one record (state §0.222): no new duplicate name; a rename renames every member holding the team.
import { teamNameRefused, teamRenames } from '../../src/utils/teamMembership.js';
// The AI models an Admin may choose and who may ask Claude (state §0.238): a value named anew is on the list.
import { aiSettingsRefused } from '../../src/utils/aiModels.js';
// The org's default tax rate a save names (state §0.242): a percent, checked by the quote money's one rule.
import { percentRefused } from '../../src/utils/quoteTotals.js';
import { sql } from 'drizzle-orm';
import { invalidateRoster } from './_lib.mjs';
// The stale settings save (state §0.224 — batch 4b-3, step B): a save writes only its own keys, each with a revision
// token compared in the write itself.
import { COLUMN_KEYS, STALE_ERROR, revsOf, ifRevsOf, bodyKeys, revKeysOf, staleKeys, writtenKeys, columnsSent, revsMinted, keysDropped, pick } from '../../src/utils/settingsRevs.js';
import { mintRev, revUnchanged, extraMerged } from './_settingsRevs.mjs';

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

// ── Slack webhook: an Admin's to read (state §0.169) ─────────────────
// The webhook URL is a credential: whoever holds it posts to the org's Slack
// channel, as the org. Every member read it on GET. An Admin sets it, tests it
// and sees it; everyone else reads the rest of the config — the server posts
// the alerts itself (send-slack.mjs reads the stored config, not the client's).
const withoutWebhookUrl = (cfg) => {
    const { webhookUrl: _webhookUrl, ...rest } = cfg || {};
    return rest;
};

// A test seam (state §0.224): tests/integration/settings-revs.itest.mjs lands another save between this PUT's read and
// its write. No caller sets it.
export const putSeam = { beforeWrite: null };

// A unique violation on the row's id or its org: two first saves of one org, both inserting (state §0.224).
const ROW_KEYS = ['settings_pkey', 'settings_org_id_uniq'];
const lostFirstInsert = (err) => [err, err?.cause].some((e) => e?.code === '23505'
    && (ROW_KEYS.includes(e?.constraint) || ROW_KEYS.some((c) => String(e?.message || '').includes(`"${c}"`))));

// The org's default tax rate (state §0.242, guide §18b125 rule 3 — Jeff, 10 Nov: "Refuse it"): a rate a save's
// quoteDefaults names is none (blank) or a number 0-100, else refused naming the blob and nothing is written; the rate
// the row already holds is never asked again. Readers keep defaultTaxRateOf's clamp (quoteTotals.js).
const QUOTE_DEFAULT_RATE_REFUSED = 'The default tax rate must be a number from 0 to 100, or blank for none.';
const quoteDefaultRateRefused = (data, existingExtra) => 'quoteDefaults' in data && !!data.quoteDefaults && typeof data.quoteDefaults === 'object'
    && percentRefused(data.quoteDefaults.taxRate, existingExtra?.quoteDefaults?.taxRate);

// ── Handler ───────────────────────────────────────────────────────────────────
// retry: how many times this save has been tried again on a fresh read (a save that lost its race, J-B15). Never the
// runtime's own arguments — it passes (event, context, callback): `handler` below calls this with 0.
const handle = async (event, retry) => {
    const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' };
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
    const auth = await verifyAuth(event);
    if (auth.error) return { statusCode: auth.status || 401, headers, body: JSON.stringify({ error: auth.error }) };
    const { orgId, userId, userRole } = auth;

    try {
        if (event.httpMethod === 'GET') {
            const rows = await db.select().from(settings).where(eq(settings.orgId, orgId))
                .orderBy(desc(settings.updatedAt));
            if (rows.length === 0) return { statusCode: 200, headers, body: JSON.stringify({ settings: null }) };
            const row = rows[0];
            // A key this workspace has never saved reads as the shared default
            // (src/utils/settingsDefaults.js, state §0.170); one it holds, even as
            // null, is its own. Since §0.224 a save writes only the keys it sends
            // (and the seeds under the row), so a key no save has sent and no seed
            // covers is absent and reads through the fallbacks below. Until §0.170
            // the defaults reached the database only through the app's autosave.
            const ex = { ...settingsSeeds(), ...(row.extra || {}) };
            const saved = (k) => !!row.extra && k in row.extra;

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
                // Older rows kept stages and pain points in their own columns — those first.
                funnelStages:     saved('funnelStages') ? (row.extra.funnelStages || row.stages || []) : (row.stages?.length ? row.stages : ex.funnelStages),
                competitors:      row.extra?.competitors      || [],
                reasonsWon:       row.extra?.reasonsWon       || [],
                reasonsLost:      row.extra?.reasonsLost      || [],
                products:         row.extra?.products        || [],
                taskTypes:        row.taskTypes       || ['Call', 'Meeting', 'Email'],
                painPoints:       saved('painPoints') ? (row.extra.painPoints || row.painPoints || []) : (row.painPoints?.length ? row.painPoints : ex.painPoints),
                verticalMarkets:  row.verticalMarkets || [],
                // Extended fields — stored in the extra jsonb blob column
                quotaData:        ex.quotaData               || null,
                commissionTiers:  row.extra?.commissionTiers || null,
                spiffs:           row.extra?.spiffs          || [],
                pipelines:        ex.pipelines               || null,
                teams:            row.extra?.teams           || null,
                territories:      row.extra?.territories     || null,
                verticals:        row.extra?.verticals       || null,
                kpiTolerances:    row.extra?.kpiTolerances   || null,
                kpiTargets:       row.extra?.kpiTargets      || null,
                logoUrl:          row.extra?.logoUrl         || null,
                kpiConfig:        ex.kpiConfig               || null,
                commissionPlan:   row.extra?.commissionPlan  || null,
                aiScoringEnabled: row.extra?.aiScoringEnabled ?? false,
                // §0.141: may report prompts be read by Claude? An Admin's switch
                // (Settings → Features → AI); the client falls back to the built-in
                // reader when off. Both halves, like every extra key (18b12).
                aiReportPromptsEnabled: row.extra?.aiReportPromptsEnabled ?? false,
                leadsEnabled:     row.extra?.leadsEnabled     ?? true,
                // Read-side policy for leads.mjs GET: may reps see unassigned
                // leads? Default true = the standing policy. 18b12: this key
                // exists in BOTH halves — GET here, PUT whitelist below — and
                // tests/ownership-registry.test.mjs asserts the pair.
                unassignedLeadsVisibleToReps: row.extra?.unassignedLeadsVisibleToReps ?? true,
                // The deals twin (§0.151), OFF when absent — Jeff: "Reps should only see
                // their own deals". Both halves, like the leads key (tests/ownership-registry).
                unassignedDealsVisibleToReps: row.extra?.unassignedDealsVisibleToReps ?? false,
                customerTypes:    row.extra?.customerTypes    || [],
                companyProfile:   ex.companyProfile           || null,
                leadConvBenchmarks: row.extra?.leadConvBenchmarks || null,
                // Integrations panel. Written and read back by ConnectedAppsDetail,
                // but present in neither half — so the PUT dropped both keys, the
                // GET always returned {}, and connect/disconnect/Slack-config all
                // appeared to work and reverted on reload. Third instance of this
                // failure mode after the audit-streaming keys; see guide 18b.
                connectedApps:  row.extra?.connectedApps  || {},
                slackConfig:    isAdmin(userRole) ? (row.extra?.slackConfig || {}) : withoutWebhookUrl(row.extra?.slackConfig),
                // What dispatch customers are told (state §0.111). Off by default;
                // the panel and the jobs function read one normaliser.
                customerNotifications: cleanCustomerNotifications(row.extra?.customerNotifications),
                // The web-to-lead form (state §0.121): on/off, the token, source,
                // thank-you URL. Normalised here with NO mint — a read never creates
                // a token; only the PUT below does.
                webToLead: cleanWebToLead(row.extra?.webToLead),
                // Email templates for reps (state §0.122): the org's library, normalised.
                emailTemplates: cleanEmailTemplates(row.extra?.emailTemplates),
                // Written server-side by integration-requests.mjs (§0.90); read by
                // the Connected Apps panel. Carried here so an Admin settings save
                // never wipes it.
                integrationRequests: row.extra?.integrationRequests || {},
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
                // Quoting (persisted via quoting settings panels)
                approvalTiers:        row.extra?.approvalTiers        || null,
                // Who approves (§0.157): 'role' | 'person', null until an Admin
                // chooses (any Admin or Manager approves meanwhile). Both halves (18b12).
                // The six approval "triggers" this blob carried were read by nothing
                // and are gone — the average discount is the rule (Jeff, 2 Oct).
                approvalRouting:      cleanApprovalRouting(row.extra?.approvalRouting),
                priceBookProducts:    row.extra?.priceBookProducts    || [],
                // Product & service types (§0.149): the built-ins always, then the org's own.
                productTypes:         cleanProductTypes(row.extra?.productTypes),
                quoteTemplates:       row.extra?.quoteTemplates       || null,
                quoteBrand:       row.extra?.quoteBrand       || null,
                quoteDefaults:        row.extra?.quoteDefaults        || null,
                quoteBoilerplate:     row.extra?.quoteBoilerplate     || null,
                industries:           row.extra?.industries            || null,
                buyerPersonas:        row.extra?.buyerPersonas         || [],
                // Sales Manager coaching notes — Manager-writable (see the PUT gate).
                quotesEnabled:        row.extra?.quotesEnabled         ?? true,
                dispatchEnabled:      row.extra?.dispatchEnabled       ?? false,
                // May sales reps use Dispatch (§0.152)? OFF when absent — Jeff: reps "should
                // not have dispatch power". Both halves; dispatchAccessOf reads it.
                repsCanUseDispatch:   row.extra?.repsCanUseDispatch    ?? false,
                // How each rep's yearly quota is broken down (state §0.203): quarters or
                // months, quarters when absent. Both halves; the quota writer reads it too.
                quotaPeriods:         cleanQuotaPeriods(row.extra?.quotaPeriods),
                dispatchSkills:       row.extra?.dispatchSkills        || [],
                // Dispatch premises segment for a service customer. Distinct from
                // `customerTypes` above, which is the CRM account-tier vocabulary.
                // Empty here means "never configured" — the client seeds the four
                // legacy values so existing dispatch_customers.customer_type rows
                // ('commercial' etc.) keep resolving.
                dispatchPropertyTypes: row.extra?.dispatchPropertyTypes || [],
                dispatchCerts:        row.extra?.dispatchCerts         || [],
                dispatchLicenses:     ex.dispatchLicenses              || DEFAULT_SETTINGS.dispatchLicenses,
                dispatchTrades:       row.extra?.dispatchTrades         || [],
                dispatchJobTypes:     row.extra?.dispatchJobTypes       || [],
                dispatchBlockTypes:   ex.dispatchBlockTypes             || DEFAULT_SETTINGS.dispatchBlockTypes,
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
                // Each key's revision token (state §0.224): a screen sends back the one it loaded with each key it saves.
                revs: revsOf(row.extra),
            }})};
        }

        if (event.httpMethod === 'PUT') {
            // Settings are org-wide (stages, field visibility, feature flags,
            // fiscal year, the BYOK key). Per the role model, only Admins may
            // write them — without this, any member could rewrite shared config
            // that every other user depends on.
            // Coaching notes are not in this blob any more (state §0.82): they live in
            // their own table (coaching-notes.mjs). The §0.79 Manager carve-out and
            // the coachingNotes key itself are gone (§0.83) — an old value left in
            // extra by a pre-import org is simply never read or rewritten.
            const body = JSON.parse(event.body);
            const forbidden = requireRole(auth, ['Admin'], headers);
            if (forbidden) return forbidden;

            // What the save says it loaded (state §0.224): a token, or null for "there was none", for each key it sends —
            // or nothing at all (Q6: accepted unchecked). Its settings are the body without them.
            const sent = ifRevsOf(body);
            if (sent.error) return { statusCode: 400, headers, body: JSON.stringify({ error: sent.error }) };
            const data = bodyKeys(body);
            const sentKeys = revKeysOf(data);

            // A company's quota periods are quarters or months (state §0.203) — anything
            // else is refused, never stored.
            if ('quotaPeriods' in data && !QUOTA_PERIODS.includes(data.quotaPeriods)) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'Quota periods are quarters or months.' }) };
            }

            // A stored webhook is a URL this server POSTs to on every pipeline
            // alert (send-slack.mjs). Pin it to Slack at save time so the card
            // never reads "Live" over a destination sendSlack will refuse (§0.92).
            if ('slackConfig' in data && data.slackConfig && data.slackConfig.webhookUrl) {
                const checked = validateSlackWebhookUrl(data.slackConfig.webhookUrl);
                if (!checked.ok) return { statusCode: 400, headers, body: JSON.stringify({ error: checked.error }) };
                // The per-alert selection is stored as five booleans, whatever the client sent (§0.96, item 29).
                data.slackConfig = { ...data.slackConfig, alerts: cleanSlackAlerts(data.slackConfig.alerts) };
            }

            // Read existing row first so we can merge extra fields safely.
            const existing = await db.select().from(settings).where(eq(settings.orgId, orgId))
                .orderBy(desc(settings.updatedAt));
            const existingExtra = existing.length > 0 ? (existing[0].extra || {}) : {};
            // A key this save sends whose token has moved since its screen loaded it: refused before anything else is
            // judged — a stale list's members are never asked about (state §0.224). The screen reads settings again.
            const readRevs = revsOf(existingExtra);
            const stale = sent.checked ? staleKeys(sent.revs, readRevs, sentKeys) : [];
            if (stale.length) return { statusCode: 409, headers, body: JSON.stringify({ error: STALE_ERROR, code: 'stale', stale }) };
            // A key not sent keeps what is stored — and a seeded key never stored
            // is the shared default (state §0.170), so the first screen a new
            // workspace saves writes the defaults with it, never nulls in their place.
            const base = { ...settingsSeeds(), ...existingExtra };

            // Who approves each discount tier (state §0.157): the tiers cleaned for
            // the mode the Admin chose — and every named PERSON must be an active
            // Admin or Manager of THIS org. An id from another org, a rep, or a user
            // since deactivated is refused (400), never stored. Mode and tiers are
            // cleaned together, so changing the mode drops the other mode's names.
            if ('approvalTiers' in data || 'approvalRouting' in data) {
                const mode = 'approvalRouting' in data ? cleanApprovalRouting(data.approvalRouting) : cleanApprovalRouting(existingExtra.approvalRouting);
                if ('approvalRouting' in data && data.approvalRouting != null && !mode) {
                    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Choose who approves: by role or by person.' }) };
                }
                const tiers = cleanApprovalTiers('approvalTiers' in data ? data.approvalTiers : existingExtra.approvalTiers, mode);
                const named = [...new Set((tiers || []).flatMap(t => [t.approverUserId, t.backupUserId]).filter(Boolean))];
                if (named.length) {
                    const rows = await db.select({ id: users.id, role: users.role, active: users.active }).from(users)
                        .where(and(eq(users.orgId, orgId), inArray(users.id, named)));
                    const eligible = new Set(rows.filter(r => r.active !== false && canApproveQuotes(r.role)).map(r => r.id));
                    if (named.some(id => !eligible.has(id))) {
                        return { statusCode: 400, headers, body: JSON.stringify({ error: 'An approver must be an active Admin or Manager in this workspace.' }) };
                    }
                }
                data.approvalTiers = tiers;
                data.approvalRouting = mode;
            }

            // The ids inside settings (state §0.221 — batch 4b-3, step A; Jeff, 1 Nov: "Take all Recommended"). A list
            // whose entries are records is a list of them, each with its own id — a value the stored list holds stands
            // (linkIds.js's listShapeRefused) — and a team's, a territory's, a crew's or a quote template's ids name this
            // org's members, technicians, vehicles and products: any of the org's, an id the stored list holds never
            // asked again. Anything else is refused, naming the list, and nothing is written.
            for (const key of SETTINGS_LISTS) {
                const bad = key in data ? listShapeRefused(key, data[key], existingExtra[key]) : null;
                if (bad) return { statusCode: bad.status, headers, body: JSON.stringify({ error: bad.error, field: bad.field }) };
            }
            // No new team of a name another has (state §0.222 — batch 4b-3, step C; Q8): by its repeats, so a pair
            // stored before this rule stands; nor a name a member's team cannot hold. Refused naming the list, before
            // anything is read or written.
            const teamNamed = 'teams' in data ? teamNameRefused(data.teams, existingExtra.teams) : null;
            if (teamNamed) return { statusCode: teamNamed.status, headers, body: JSON.stringify({ error: teamNamed.error, field: teamNamed.field }) };
            // The AI blob's model, fallback and "Available to" (state §0.238): one the save names anew must be on the list —
            // refused naming the field, nothing written; a value the row already holds is never asked again.
            const aiRefused = 'aiSettings' in data ? aiSettingsRefused(data.aiSettings, existingExtra.aiSettings) : null;
            if (aiRefused) return { statusCode: aiRefused.status, headers, body: JSON.stringify({ error: aiRefused.error, field: aiRefused.field }) };
            if (quoteDefaultRateRefused(data, existingExtra)) return { statusCode: 400, headers, body: JSON.stringify({ error: QUOTE_DEFAULT_RATE_REFUSED, field: 'quoteDefaults' }) };
            const linked = await checkSettingsLinks(data, existingExtra, orgId);
            if (linked.status) return { statusCode: linked.status, headers, body: JSON.stringify({ error: linked.error, field: linked.field }) };
            // The teams this save renames (state §0.222 — Q7): every member holding one is renamed with it, below.
            const renames = 'teams' in data ? teamRenames(data.teams, existingExtra.teams) : [];

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

            // The value each key takes when this save writes it (state §0.224 — Jeff's J-B2: the list kept as it was). Only
            // the keys the save writes are picked from it below; the fallback after each `:` is no longer written — a key
            // not sent keeps what the row holds at the write, not what this read held. The list is still the PUT's: a
            // stored key it does not name is dropped (§0.171).
            const extra = {
                quotaData:        'quotaData'        in data ? (data.quotaData        || null) : base.quotaData                 || null,
                commissionTiers:  'commissionTiers'  in data ? (data.commissionTiers  || null) : existingExtra.commissionTiers  || null,
                spiffs:           'spiffs'           in data ? (data.spiffs           || [])   : existingExtra.spiffs           || [],
                pipelines:        'pipelines'        in data ? (data.pipelines        || null) : base.pipelines                 || null,
                teams:            'teams'            in data ? (data.teams            || null) : existingExtra.teams            || null,
                territories:      'territories'      in data ? (data.territories      || null) : existingExtra.territories      || null,
                verticals:        'verticals'        in data ? (data.verticals        || null) : existingExtra.verticals        || null,
                kpiTolerances:    'kpiTolerances'    in data ? (data.kpiTolerances    || null) : existingExtra.kpiTolerances    || null,
                kpiTargets:       'kpiTargets'       in data ? (data.kpiTargets       || null) : existingExtra.kpiTargets       || null,
                logoUrl:          'logoUrl'          in data ? (data.logoUrl          || null) : existingExtra.logoUrl          || null,
                kpiConfig:        'kpiConfig'        in data ? (data.kpiConfig        || null) : base.kpiConfig                 || null,
                commissionPlan:   'commissionPlan'   in data ? (data.commissionPlan   || null) : existingExtra.commissionPlan   || null,
                products:         'products'         in data ? (data.products         || [])   : existingExtra.products         || [],
                aiScoringEnabled: 'aiScoringEnabled' in data ? !!data.aiScoringEnabled : existingExtra.aiScoringEnabled ?? false,
                aiReportPromptsEnabled: 'aiReportPromptsEnabled' in data ? !!data.aiReportPromptsEnabled : existingExtra.aiReportPromptsEnabled ?? false,
                leadsEnabled:     'leadsEnabled'     in data ? !!data.leadsEnabled     : existingExtra.leadsEnabled     ?? true,
                unassignedLeadsVisibleToReps: 'unassignedLeadsVisibleToReps' in data ? !!data.unassignedLeadsVisibleToReps : existingExtra.unassignedLeadsVisibleToReps ?? true,
                unassignedDealsVisibleToReps: 'unassignedDealsVisibleToReps' in data ? !!data.unassignedDealsVisibleToReps : existingExtra.unassignedDealsVisibleToReps ?? false,
                customerTypes:    'customerTypes'    in data ? (data.customerTypes    || [])   : existingExtra.customerTypes    || [],
                companyProfile:   'companyProfile'   in data ? (data.companyProfile   || null) : base.companyProfile            || null,
                leadConvBenchmarks:   'leadConvBenchmarks'   in data ? (data.leadConvBenchmarks   || null) : existingExtra.leadConvBenchmarks   || null,
                connectedApps:  'connectedApps'  in data ? (data.connectedApps  || {}) : existingExtra.connectedApps  || {},
                slackConfig:    'slackConfig'    in data ? (data.slackConfig    || {}) : existingExtra.slackConfig    || {},
                customerNotifications: 'customerNotifications' in data ? cleanCustomerNotifications(data.customerNotifications) : existingExtra.customerNotifications || {},
                // The stored token survives every save; a token is minted only when
                // the form is turned on without one, or a rotate is asked for.
                webToLead: 'webToLead' in data ? cleanWebToLead(data.webToLead, existingExtra.webToLead, () => randomBytes(24).toString('base64url')) : existingExtra.webToLead || {},
                emailTemplates: 'emailTemplates' in data ? cleanEmailTemplates(data.emailTemplates) : existingExtra.emailTemplates || [],
                // The server's own (state §0.221 — Q15): written only by integration-requests.mjs; a save keeps what is
                // stored, whatever its body says (a body could mark an app requested and block the real request).
                integrationRequests: existingExtra.integrationRequests || {},
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
                approvalRouting:      'approvalRouting'      in data ? cleanApprovalRouting(data.approvalRouting) : cleanApprovalRouting(existingExtra.approvalRouting),
                priceBookProducts:    'priceBookProducts'    in data ? (data.priceBookProducts    || [])   : existingExtra.priceBookProducts    || [],
                productTypes:         'productTypes'         in data ? cleanProductTypes(data.productTypes)    : existingExtra.productTypes         || null,
                quoteTemplates:       'quoteTemplates'       in data ? (data.quoteTemplates       || null) : existingExtra.quoteTemplates       || null,
                quoteBrand:       'quoteBrand'       in data ? (data.quoteBrand       || null) : existingExtra.quoteBrand       || null,
                quoteDefaults:        'quoteDefaults'        in data ? (data.quoteDefaults        || null) : existingExtra.quoteDefaults        || null,
                quoteBoilerplate:     'quoteBoilerplate'     in data ? (data.quoteBoilerplate     || null) : existingExtra.quoteBoilerplate     || null,
                // Sales process Group 1
                funnelStages:         'funnelStages'         in data ? (data.funnelStages         || [])   : base.funnelStages                  || [],
                kpiThresholds:        'kpiThresholds'        in data ? (data.kpiThresholds        || null) : existingExtra.kpiThresholds        || null,
                assignmentRules:      'assignmentRules'      in data ? (data.assignmentRules      || null) : existingExtra.assignmentRules      || null,
                // Sales process Group 2
                customFieldsByObject: 'customFieldsByObject' in data ? (data.customFieldsByObject || null) : existingExtra.customFieldsByObject || null,
                customerTypeTiers:    'customerTypeTiers'    in data ? (data.customerTypeTiers    || null) : existingExtra.customerTypeTiers    || null,
                accountSegmentTiers:  'accountSegmentTiers'  in data ? (data.accountSegmentTiers  || null) : existingExtra.accountSegmentTiers  || null,
                leadScoring:          'leadScoring'          in data ? (data.leadScoring          || null) : existingExtra.leadScoring          || null,
                industries:           'industries'           in data ? (data.industries           || null) : existingExtra.industries           || null,
                buyerPersonas:        'buyerPersonas'        in data ? (data.buyerPersonas        || [])   : existingExtra.buyerPersonas        || [],
                quotesEnabled:        'quotesEnabled'        in data ? !!data.quotesEnabled                : existingExtra.quotesEnabled        ?? true,
                dispatchEnabled:      'dispatchEnabled'      in data ? !!data.dispatchEnabled               : existingExtra.dispatchEnabled       ?? false,
                repsCanUseDispatch:   'repsCanUseDispatch'   in data ? !!data.repsCanUseDispatch            : existingExtra.repsCanUseDispatch    ?? false,
                quotaPeriods:         'quotaPeriods'         in data ? data.quotaPeriods                    : cleanQuotaPeriods(existingExtra.quotaPeriods),
                dispatchSkills:       'dispatchSkills'       in data ? (data.dispatchSkills       || [])   : existingExtra.dispatchSkills        || [],
                dispatchPropertyTypes: 'dispatchPropertyTypes' in data ? (data.dispatchPropertyTypes || []) : existingExtra.dispatchPropertyTypes || [],
                dispatchCerts:        'dispatchCerts'        in data ? (data.dispatchCerts        || [])   : existingExtra.dispatchCerts         || [],
                dispatchLicenses:     'dispatchLicenses'     in data ? (data.dispatchLicenses     || null) : base.dispatchLicenses               || null,
                dispatchTrades:       'dispatchTrades'       in data ? (data.dispatchTrades       || [])   : existingExtra.dispatchTrades        || [],
                dispatchJobTypes:     'dispatchJobTypes'     in data ? (data.dispatchJobTypes     || [])   : existingExtra.dispatchJobTypes      || [],
                dispatchBlockTypes:   'dispatchBlockTypes'   in data ? (data.dispatchBlockTypes   || [])   : base.dispatchBlockTypes             || [],
                dispatchVehicles:     'dispatchVehicles'     in data ? (data.dispatchVehicles     || [])   : existingExtra.dispatchVehicles      || [],
                dispatchEquipment:     'dispatchEquipment'     in data ? (data.dispatchEquipment     || [])   : existingExtra.dispatchEquipment      || [],
                dispatchJobs:         'dispatchJobs'         in data ? (data.dispatchJobs         || [])   : existingExtra.dispatchJobs          || [],
                dispatchCrews:        'dispatchCrews'        in data ? (data.dispatchCrews        || [])   : existingExtra.dispatchCrews         || [],
                dispatchJobTemplates: 'dispatchJobTemplates' in data ? (data.dispatchJobTemplates || [])   : existingExtra.dispatchJobTemplates  || [],
                featureFlags:         'featureFlags'         in data ? (data.featureFlags         || {})   : existingExtra.featureFlags         || {},
                aiSettings:           'aiSettings'           in data ? (scrubAiSettings(data.aiSettings) || null) : scrubAiSettings(existingExtra.aiSettings) || null,
                painPoints:           'painPoints'           in data ? (data.painPoints           || [])   : base.painPoints                    || [],
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
                verticalMarkets: 'verticalMarkets' in data ? (data.verticalMarkets || [])                          : (existing[0]?.verticalMarkets ?? DEFAULT_SETTINGS.verticalMarkets),
                extra,
                updatedAt:       new Date(),
            };
            // What this save writes (state §0.224 — B1): the keys it sent, and what the PUT derives from them (the approvals
            // pair's other half, the key set, cleared or moved, the AI blob's scrub) — never the rest of the row, which
            // another save may have changed since this read. Each key written gets a new token; the tokens this save read
            // are compared in the write itself, for every key it writes or sent.
            const aiScrubbed = !('aiSettings' in data) && JSON.stringify(scrubAiSettings(existingExtra.aiSettings) ?? null) !== JSON.stringify(existingExtra.aiSettings ?? null);
            const written = writtenKeys(data, Object.keys(extra), { keyAction, aiScrubbed });
            const patch = pick(extra, written);
            const newRevs = revsMinted([...written, ...COLUMN_KEYS.filter((k) => k in data)], mintRev);
            const compared = [...new Set([...Object.keys(newRevs), ...sentKeys])];
            const dropped = keysDropped(existingExtra, new Set([...Object.keys(extra), 'revs']));
            const upsert = db.insert(settings).values({ ...dbRow, extra: { ...settingsSeeds(), ...patch, revs: newRevs } }).onConflictDoUpdate({
                target: settings.id,
                setWhere: and(eq(settings.orgId, orgId), ...compared.map((k) => revUnchanged(k, readRevs[k] ?? null))),
                set: { orgId, ...columnsSent(data, dbRow), extra: extraMerged(patch, dropped, newRevs), updatedAt: dbRow.updatedAt },
            }).returning({ id: settings.id });
            // A renamed team renames every member holding it, by its id — an inactive or an invited member too — in the
            // save's own transaction (state §0.222 — Q7): only this org's members (a team id is minted on the client,
            // `team_<ms>`, and may repeat across orgs), and only while the list as written gives the team that name — written
            // by THIS save: the teams token it minted (state §0.224), so a save refused in its write renames no one.
            const renaming = renames.map(({ id, name }) => db.update(users).set({ team: name, updatedAt: new Date() })
                .where(and(eq(users.orgId, orgId), sql`${users.profile}->>'teamId' = ${id}`, sql`${users.team} is distinct from ${name}`,
                    sql`exists (select 1 from ${settings} where ${settings.orgId} = ${orgId} and ${settings.extra}->'teams' @> jsonb_build_array(jsonb_build_object('id', ${id}::text, 'name', ${name}::text))
                        and ${settings.extra}->'revs'->>'teams' = ${newRevs.teams}::text)`))
                .returning({ id: users.id }));
            if (putSeam.beforeWrite) await putSeam.beforeWrite();
            // An org's first two saves at once can both insert: the second meets the row the first made, by its id or its
            // org (one row per org) — a lost race, as a refused write is.
            let landed = [], renamedRows = [];
            try { [landed, ...renamedRows] = await db.batch([upsert, ...renaming]); }
            catch (err) { if (!lostFirstInsert(err)) throw err; }
            // Nothing landed: another save changed a key this one writes since this read. Nothing of it was written — no
            // member renamed, no audit. A save that named none of its tokens (Q6 — accepted unchecked), or whose own keys
            // did not move (it lost only to a key the server derives, or to the row's first insert), is tried again on a
            // fresh read, twice at most (J-B15); else it is refused, naming the keys that moved.
            if (!landed.length) {
                const [now] = await db.select({ extra: settings.extra }).from(settings).where(eq(settings.orgId, orgId));
                const moved = compared.filter((k) => (revsOf(now?.extra)[k] ?? null) !== (readRevs[k] ?? null));
                if ((!sent.checked || !moved.some((k) => sentKeys.includes(k))) && retry < 2) return handle(event, retry + 1);
                return { statusCode: 409, headers, body: JSON.stringify({ error: STALE_ERROR, code: 'stale', stale: moved }) };
            }
            const membersRenamed = renamedRows.reduce((n, rows) => n + rows.length, 0);
            if (membersRenamed) invalidateRoster(orgId);

            // Audit the write. Org-wide config changes are exactly the kind of
            // integrity event the audit log exists for. Key material is never
            // recorded — only the fact that the key changed.
            // The keys the save sent and wrote (state §0.224) — never its tokens, never integrationRequests (the server's).
            const changedKeys = Object.keys(data).filter(k => k !== 'anthropicApiKey' && (written.includes(k) || COLUMN_KEYS.includes(k)));
            const callerName = await getCallerName(userId, orgId);
            await writeAudit(orgId, {
                action: keyAction ? 'settings.apikey.' + keyAction : 'settings.updated',
                entityType: 'settings',
                entityId: orgId,
                entityName: dbRow.companyName || 'Organization settings',
                detail: (keyAction
                    ? `BYOK key ${keyAction}` + (changedKeys.length ? `; updated: ${changedKeys.slice(0, 20).join(', ')}` : '')
                    : `Updated: ${changedKeys.slice(0, 20).join(', ') || '(no fields)'}`)
                    // A save that renamed members says how many, whatever else it did (state §0.222): a stale tab's list
                    // put back renames them too.
                    + (membersRenamed ? `; ${membersRenamed} member(s) renamed with their team` : ''),
                userId,
                userName: callerName,
            });

            // The new tokens of the keys the save SENT — the screen holds their values. A key the server derived is not
            // answered: the screen does not hold its new value, so its next save of it is refused once and reads the latest.
            return { statusCode: 200, headers, body: JSON.stringify({ success: true, anthropicApiKeySet: !!encryptedApiKey, revs: pick(newRevs, sentKeys) }) };
        }

        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    } catch (err) {
        // serverErrorBody logs the real error + stack server-side with a
        // correlation id and returns only a generic message to the client.
        return { statusCode: 500, headers, body: serverErrorBody(err, 'settings') };
    }
};

// The function the runtime calls, with whatever it passes after the event (state §0.224 — the review: a retry count
// in a third parameter met the runtime's callback, and no save was ever tried again).
export const handler = (event) => handle(event, 0);
