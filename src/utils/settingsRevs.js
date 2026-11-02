// The stale settings save (state §0.224 — batch 4b-3, step B; Jeff, 2 Nov: "Revision per key", "Three commits",
// "Re-read settings once", "Retry, then refuse"). A save of one settings key writes that key alone — never every key
// from its own read — and every key carries a revision token (`extra.revs`, a random string per key), set anew by
// every writer of the key. A save names the token it loaded for each key it sends (`ifRevs`); one whose token has
// moved since is refused, nothing written, and the screen reads settings again for the latest. A save naming no
// tokens at all (an old tab, a hand-made call) is accepted unchecked (Q6). Pure, so the server and the screens share
// one rule and the tests run it.

// The settings PUT's own columns: written only when a save sends them, each with a token of its own. funnelStages and
// painPoints are keys of `extra` too — their token covers their column.
export const COLUMN_KEYS = Object.freeze(['companyName', 'companyLogo', 'fiscalYearStart', 'taskTypes', 'verticalMarkets']);

// Every key a token covers: each key the settings PUT stores (settings.mjs's `const extra = {` — the test reads it)
// but integrationRequests (the server's own, Q15 — no screen sends it), and the columns.
export const REV_KEYS = Object.freeze([
    'quotaData', 'commissionTiers', 'spiffs', 'pipelines', 'teams', 'territories', 'verticals', 'kpiTolerances',
    'kpiTargets', 'logoUrl', 'kpiConfig', 'commissionPlan', 'products', 'aiScoringEnabled', 'aiReportPromptsEnabled',
    'leadsEnabled', 'unassignedLeadsVisibleToReps', 'unassignedDealsVisibleToReps', 'customerTypes', 'companyProfile',
    'leadConvBenchmarks', 'connectedApps', 'slackConfig', 'customerNotifications', 'webToLead', 'emailTemplates',
    'companyDisplayName', 'companyLegalName', 'companyBrandColor', 'companyAddress', 'companyCity', 'companyState',
    'companyZip', 'companyCountry', 'companyPhone', 'companySupportEmail', 'quoteHeader', 'customHolidays',
    'federalHolidays', 'approvalTiers', 'approvalRouting', 'priceBookProducts', 'productTypes', 'quoteTemplates',
    'quoteBrand', 'quoteDefaults', 'quoteBoilerplate', 'funnelStages', 'kpiThresholds', 'assignmentRules',
    'customFieldsByObject', 'customerTypeTiers', 'accountSegmentTiers', 'leadScoring', 'industries', 'buyerPersonas',
    'quotesEnabled', 'dispatchEnabled', 'repsCanUseDispatch', 'quotaPeriods', 'dispatchSkills', 'dispatchPropertyTypes',
    'dispatchCerts', 'dispatchLicenses', 'dispatchTrades', 'dispatchJobTypes', 'dispatchBlockTypes', 'dispatchVehicles',
    'dispatchEquipment', 'dispatchJobs', 'dispatchCrews', 'dispatchJobTemplates', 'featureFlags', 'aiSettings',
    'painPoints', 'competitors', 'reasonsWon', 'reasonsLost', 'anthropicApiKey',
    ...COLUMN_KEYS,
]);
const REV_KEY_SET = new Set(REV_KEYS);

// The server's words for a stale save. A screen that reads settings again says its own; these reach only an old tab
// or a hand-made call.
export const STALE_ERROR = 'These settings changed since this page loaded. Reload the page to see the latest, then make your change again.';

const isPlain = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/** The tokens a stored `extra` holds: { key: token } — only text tokens; anything else holds none. */
export function revsOf(extra) {
    const revs = isPlain(extra) && isPlain(extra.revs) ? extra.revs : {};
    return Object.fromEntries(Object.entries(revs).filter(([, v]) => typeof v === 'string'));
}

/**
 * What a save says it loaded: { checked: false } when the body names no `ifRevs` (Q6 — accepted unchecked);
 * { checked: true, revs } when it is an object of tokens or nulls (null: "there was none"); else { error } (a 400).
 */
export function ifRevsOf(body) {
    if (!isPlain(body) || !('ifRevs' in body)) return { checked: false };
    const sent = body.ifRevs;
    if (!isPlain(sent) || Object.values(sent).some((v) => v !== null && typeof v !== 'string')) {
        return { error: 'ifRevs must name a revision or null for each key.' };
    }
    return { checked: true, revs: { ...sent } };
}

/** The body's settings — a copy, without `ifRevs` or `revs` (a body never writes tokens). */
export function bodyKeys(body) {
    const { ifRevs: _ifRevs, revs: _revs, ...data } = isPlain(body) ? body : {};
    return data;
}

/** The keys of a save that a token covers. */
export const revKeysOf = (data) => Object.keys(isPlain(data) ? data : {}).filter((k) => REV_KEY_SET.has(k));

/** The keys whose token moved: what the save loaded (a key it names no token for: none) against what is stored. */
export const staleKeys = (ifRevs, storedRevs, keys) =>
    keys.filter((k) => ((ifRevs || {})[k] ?? null) !== ((storedRevs || {})[k] ?? null));

/**
 * The keys of `extra` this save writes: those it sent (never integrationRequests, Q15; the API key only when it is
 * set, cleared or moved — keyAction), and aiSettings when the stored blob needs its scrub.
 */
export function writtenKeys(data, storedKeys, { keyAction = null, aiScrubbed = false } = {}) {
    const known = new Set(storedKeys);
    const out = Object.keys(isPlain(data) ? data : {})
        .filter((k) => known.has(k) && k !== 'integrationRequests' && k !== 'anthropicApiKey');
    if (keyAction) out.push('anthropicApiKey');
    if (aiScrubbed && !out.includes('aiSettings')) out.push('aiSettings');
    return out;
}

/** The columns a save sends, as the row would store them (`row` is the PUT's built row): its column name → value. */
export function columnsSent(data, row) {
    const out = {};
    for (const k of COLUMN_KEYS) if (k in data) out[k] = row[k];
    if ('funnelStages' in data) out.stages = row.stages;
    if ('painPoints' in data) out.painPoints = row.painPoints;
    return out;
}

/** A new token for each key. `mint` makes one (the server's is random). */
export const revsMinted = (keys, mint) => Object.fromEntries([...new Set(keys)].map((k) => [k, mint()]));

/** The keys a stored `extra` holds that the save's own list does not — dropped by the write (state §0.171). */
export const keysDropped = (stored, keep) => Object.keys(isPlain(stored) ? stored : {}).filter((k) => !keep.has(k));

/** Only the keys named. */
export const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => k in (obj || {})).map((k) => [k, obj[k]]));
