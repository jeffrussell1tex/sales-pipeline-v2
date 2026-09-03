// settingsCards.js — what a Settings catalogue card may claim, and what the
// Workspace Health tile may count.
//
// WHY THIS IS ITS OWN MODULE
// --------------------------
// The catalogue rows in settings/catalogue.js were a design handoff: every card
// carried a hand-typed status ('ok' on 43 of 48), an invented edit history
// ("Edited 2 months ago by Admin", values that never moved), and two carried a
// permanent attention:true. The Workspace Health tile counted eight checks of
// which four were constants — "MFA enforced" false with live enrolment one
// card over, "Backups running" / "Session policy set" / "Quote branding
// configured" true — under a static "Set up SSO and enforce MFA to reach 90%+"
// (state §0.78 last paragraph, §0.81). The enrichment that made most card
// DETAILS live sat inside the card component where node --test cannot reach it.
//
// Rules, unchanged from the block this came from: use real data when available;
// null = show nothing; keep static only when the value is deterministic from
// settings. Added here: a status of 'ok' with nothing behind it is not a status
// — it becomes 'none'; a card whose detail comes from a live fetch takes its
// status and attention from the same fetch; a health check that cannot be READ
// is not in the denominator.
import { mfaCardOf } from './fetchStatus.js';

// ── counting helpers (state §0.88) ───────────────────────────────────────────
// Every count below reads the key the card's OWN panel saves. The catalogue
// used to carry typed numbers ("12 KPIs configured", "14 industries · 47
// sub-types", "18 custom fields") that showed whenever the guard's key was
// absent — and two guards named keys no panel writes (`customFields`,
// `holidays`), so their typed counts showed always. A count the app cannot
// read is null, and null renders nothing.
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const len = (v) => (Array.isArray(v) ? v.length : 0);
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const countOrNull = (n, one, many) => (n > 0 ? plural(n, one, many) : null);

/** "FY starts October 1", or null when the org has never set it (consumers assume October). */
export function fiscalYearDetail(fiscalYearStart) {
    const m = parseInt(fiscalYearStart, 10);
    return m >= 1 && m <= 12 ? `FY starts ${MONTHS[m - 1]} 1` : null;
}

/** Custom fields are stored per object: { accounts:[…], contacts:[…], … }. */
export function customFieldCount(byObject) {
    if (!byObject || typeof byObject !== 'object' || Array.isArray(byObject)) return 0;
    return Object.values(byObject).reduce((s, list) => s + len(list), 0);
}

/** Industries as the panel saves them: [{ k, subs:[…] }]. */
export function industriesDetail(industries) {
    const n = len(industries);
    if (!n) return null;
    const subs = industries.reduce((s, i) => s + len(i?.subs), 0);
    return `${plural(n, 'industry', 'industries')}${subs ? ` · ${plural(subs, 'sub-type')}` : ''}`;
}

/** Field-level visibility is a matrix keyed by field; a key with any rule counts. */
export function fieldRuleCount(matrix) {
    if (!matrix || typeof matrix !== 'object' || Array.isArray(matrix)) return 0;
    return Object.values(matrix).filter(v => v && (typeof v !== 'object' || Object.keys(v).length > 0)).length;
}

/** The audit-log GET is capped at 500 rows; at the cap the count is a floor, not a total. */
export function auditEventsDetail(n) {
    if (typeof n !== 'number') return null;
    return n >= 500 ? '500+ recent events' : plural(n, 'recent event');
}

/** { status, statusDetail, attention } for one catalogue card. */
export function cardStateOf(item, settings, liveCounts = {}) {
    // ── Live badge enrichment ─────────────────────────────────────────────────
    // Rules: use real data when available; null = show nothing; keep static only
    // when the value is genuinely deterministic from settings (not counts of things
    // we don't track). Never show made-up numbers.
    let statusDetail = item.statusDetail;
    let status = item.status;
    let attention = !!item.attention;

    // ── People & Teams — from settings.users / settings.pipelines etc ─────────
    if (item.id === 'users' && settings?.users) {
        const active  = (settings.users||[]).filter(u => u.name && u.active !== false).length;
        const pending = (settings.users||[]).filter(u => u.status === 'Invited').length;
        statusDetail = `${active} user${active!==1?'s':''}${pending > 0 ? ` · ${pending} pending` : ''}`;
    }
    if (item.id === 'teams' && settings?.users) {
        const teamNames = [...new Set((settings.users||[]).filter(u=>u.team).map(u=>u.team))];
        statusDetail = teamNames.length > 0 ? `${teamNames.length} team${teamNames.length!==1?'s':''}` : null;
    }
    if (item.id === 'territories') statusDetail = countOrNull(len(settings?.territories), 'territory', 'territories');
    if (item.id === 'roles')       statusDetail = countOrNull(len(settings?.roles), 'role');
    // Lead visibility — show the policy actually in force, not the static text.
    // An absent key reads as the default (visible), same as the server.
    if (item.id === 'lead-visibility') {
        statusDetail = settings?.unassignedLeadsVisibleToReps === false
            ? 'Reps see assigned only'
            : 'Unassigned visible to reps';
    }

    // ── Company ───────────────────────────────────────────────────────────────
    if (item.id === 'company-profile') {
        const name = String(settings?.companyDisplayName || settings?.companyName || '').trim();
        statusDetail = name || null;
    }
    if (item.id === 'fiscal-year') statusDetail = fiscalYearDetail(settings?.fiscalYearStart);
    if (item.id === 'company-calendar') {
        // The panel saves customHolidays and reads federalHolidays; there is no `holidays` key.
        statusDetail = countOrNull(len(settings?.customHolidays) + len(settings?.federalHolidays), 'holiday');
    }

    // ── Sales process ─────────────────────────────────────────────────────────
    if (item.id === 'pipelines') {
        const count  = len(settings?.pipelines);
        const stages = (settings?.pipelines || []).reduce((a,p) => a + len(p?.stages), 0);
        statusDetail = count > 0 ? `${plural(count, 'pipeline')}${stages > 0 ? ` · ${plural(stages, 'stage')}` : ''}` : null;
    }
    if (item.id === 'funnel-stages')  statusDetail = countOrNull(len(settings?.funnelStages), 'stage');
    if (item.id === 'custom-fields')  statusDetail = countOrNull(customFieldCount(settings?.customFieldsByObject), 'custom field');
    // Panels that fall back to app defaults when the key is empty say so — a
    // count of the defaults would be a number the org never chose.
    if (item.id === 'kpi-settings')    statusDetail = len(settings?.kpiThresholds) ? plural(len(settings.kpiThresholds), 'KPI') : 'App defaults';
    if (item.id === 'customer-types')  statusDetail = len(settings?.customerTypeTiers) ? plural(len(settings.customerTypeTiers), 'tier') : 'App defaults';
    if (item.id === 'account-segments') statusDetail = len(settings?.accountSegmentTiers) ? plural(len(settings.accountSegmentTiers), 'tier') : 'App defaults';
    if (item.id === 'industries')      statusDetail = industriesDetail(settings?.industries) || 'App defaults';
    if (item.id === 'lead-conv-benchmarks') statusDetail = countOrNull(len(settings?.leadConvBenchmarks), 'source');
    if (item.id === 'pain-points')     statusDetail = countOrNull(len(settings?.painPoints), 'pain point');
    if (item.id === 'buyer-personas')  statusDetail = plural(len(settings?.buyerPersonas), 'persona');

    if (item.id === 'competitors') {
        const count = (settings?.competitors || []).length;
        statusDetail = `${count} competitor${count !== 1 ? 's' : ''}`;
    }
    if (item.id === 'reasons-won') {
        const count = (settings?.reasonsWon || []).length;
        statusDetail = `${count} reason${count !== 1 ? 's' : ''}`;
    }
    if (item.id === 'reasons-lost') {
        const count = (settings?.reasonsLost || []).length;
        statusDetail = `${count} reason${count !== 1 ? 's' : ''}`;
    }

    // ── Quoting ───────────────────────────────────────────────────────────────
    if (item.id === 'approval-tiers')  statusDetail = countOrNull(len(settings?.approvalTiers), 'tier');
    if (item.id === 'quote-templates') statusDetail = countOrNull(len(settings?.quoteTemplates), 'template');
    if (item.id === 'price-book')      statusDetail = countOrNull(len(settings?.priceBookProducts), 'product');

    // ── Features & AI — count from featureFlags in settings ─────────────────
    if (item.id === 'features') {
        const flags = settings?.featureFlags && typeof settings.featureFlags === 'object' ? settings.featureFlags : {};
        const on  = Object.values(flags).filter(Boolean).length;
        const tot = Object.keys(flags).length;
        statusDetail = tot > 0 ? `${on} of ${tot} on` : null;
    }

    // ── Security — field-level visibility is a saved matrix ──────────────────
    if (item.id === 'field-visibility') statusDetail = countOrNull(fieldRuleCount(settings?.fieldVisibility), 'rule');

    // ── Security — only show what we actually know ────────────────────────────
    if (item.id === 'sso') {
        // SSO is a Clerk enterprise connection this app cannot read (§0.86); the
        // app cannot say whether SSO is in force. No status, no attention — a
        // workspace without SSO is not a fault.
        statusDetail = null; status = 'none'; attention = false;
    }
    if (item.id === 'mfa') {
        // Live from Clerk (the same fetch the detail panel makes); nothing when
        // the numbers are unknown — never the old hand-typed status text.
        const card = mfaCardOf(liveCounts.mfa);
        statusDetail = card?.detail ?? null;
        status = card?.status ?? 'none';
        attention = !!card?.attention;
    }
    if (item.id === 'session') statusDetail = null; // policy stored but no meaningful summary

    // ── Integrations — from liveCounts fetched on mount ──────────────────────
    if (item.id === 'api-keys') {
        if (liveCounts.apiKeysTotal !== undefined) {
            const a = liveCounts.apiKeysActive;
            statusDetail = a > 0 ? `${a} active key${a!==1?'s':''}` : 'No active keys';
        } else statusDetail = null;
    }
    if (item.id === 'webhooks') {
        // Status and attention from the same live counts as the detail — the
        // catalogue row carried 'partial' and attention:true regardless.
        if (liveCounts.webhooksTotal !== undefined) {
            const t = liveCounts.webhooksTotal;
            const f = liveCounts.webhooksFailing || 0;
            if (t === 0) statusDetail = 'No endpoints';
            else statusDetail = `${t} endpoint${t!==1?'s':''}${f > 0 ? ` · ${f} failing` : ''}`;
            status = f > 0 ? 'partial' : 'ok';
            attention = f > 0;
        } else { statusDetail = null; status = 'none'; attention = false; }
    }
    if (item.id === 'automations') {
        if (liveCounts.autosTotal !== undefined) {
            const a = liveCounts.autosActive;
            const t = liveCounts.autosTotal;
            if (t === 0) statusDetail = 'No rules yet';
            else statusDetail = `${a} active · ${t - a} paused`;
        } else statusDetail = null;
    }

    // ── Security — audit log real event count (the GET is capped at 500 rows,
    // so this is "recent events", never "last 30 days") ──────────────────────
    if (item.id === 'audit-log') statusDetail = auditEventsDetail(liveCounts.auditEvents);

    // ── Data — backup ─────────────────────────────────────────────────────────
    if (item.id === 'backup') {
        if (liveCounts.backupLastLabel) {
            statusDetail = `${liveCounts.backupFreq} · last: ${liveCounts.backupLastLabel}`;
        } else statusDetail = null;
    }

    // ── Data — import/export: no tracking table, show nothing rather than fake ─
    if (item.id === 'import') statusDetail = null;
    if (item.id === 'export') statusDetail = null;

    // ── Connected apps — no real connection tracking ──────────────────────────
    if (item.id === 'apps') { statusDetail = null; status = 'none'; attention = false; }

    // A green check with nothing behind it is an invented status.
    if (statusDetail == null && status === 'ok') status = 'none';
    return { status, statusDetail, attention };
}

// ── Workspace Health ─────────────────────────────────────────────────────────

/**
 * The checks the tile may count: only what can be read right now. Live-count
 * checks appear once their fetch has answered; a hidden (snoozed / dismissed)
 * attention item leaves the denominator, as before.
 */
export function healthChecksOf(settings, liveCounts = {}, isHidden = () => false) {
    const users     = settings?.users || [];
    const pipelines = settings?.pipelines || [];
    const checks = [];
    const mfa = liveCounts.mfa;
    if (mfa && typeof mfa.total === 'number' && typeof mfa.enrolled === 'number' && !isHidden('mfa')) {
        // "MFA fully enrolled", not "MFA enforced": the app reads enrolment, never the Clerk policy.
        checks.push({ id: 'mfa', label: 'MFA fully enrolled', ok: mfa.total > 0 && mfa.enrolled >= mfa.total });
    }
    if (liveCounts.webhooksTotal !== undefined && !isHidden('webhooks')) {
        checks.push({ id: 'webhooks', label: 'Webhooks all healthy', ok: (liveCounts.webhooksFailing || 0) === 0 });
    }
    if (liveCounts.backupChecked) {
        // Daily schedule: a snapshot older than two days, or none at all, is not "running".
        checks.push({ id: 'backup', label: 'Backups running', ok: typeof liveCounts.backupLastHours === 'number' && liveCounts.backupLastHours <= 48 });
    }
    checks.push({ id: 'pipelines', label: 'Default pipeline set', ok: pipelines.length > 0 });
    checks.push({ id: 'teams', label: 'Team members assigned', ok: users.filter(u => u.team).length === users.filter(u => u.name).length });
    checks.push({ id: 'quote-brand', label: 'Quote branding configured', ok: !!settings?.quoteBrand });
    return checks;
}

/** Counts and the one sentence under them — naming what failed, never a static pitch. */
export function healthSummaryOf(checks) {
    const list = Array.isArray(checks) ? checks : [];
    const total = list.length;
    const ok = list.filter(c => c.ok).length;
    const failing = list.filter(c => !c.ok).map(c => c.label);
    const pct = total ? Math.round((ok / total) * 100) : 0;
    const sentence = !total ? 'Nothing can be checked yet.'
        : failing.length === 0 ? 'Every check that can be read is passing.'
        : `Not passing: ${failing.join(', ')}.`;
    return { ok, total, pct, failing, sentence };
}
