// slackAlerts.js — which pipeline alerts an org posts to Slack (state §0.96,
// handoff item 29; Jeff: "Can we add an option that enables me to select what
// actions get posted").
//
// Shared by both sides the way integrationCatalog.js is: the Configure Slack
// modal renders SLACK_ALERT_TYPES as checkboxes and saves `slackConfig.alerts`;
// settings.mjs normalises what is saved through cleanSlackAlerts(); and
// send-slack.mjs's sendSlackToOrg() asks slackAlertEnabled() before it posts.
// The keys are the rep-side notification-preference keys (pipeline-alerts.mjs
// DEFAULT_PREFS), so an Admin and a rep name the same alert the same way.
//
// A config saved before this key existed has no `alerts` at all — that means
// EVERYTHING posts, as it always did. Absent is on; only an explicit false is
// off. Pure: no React, no db, reachable by `node --test`.

export const SLACK_ALERT_TYPES = Object.freeze([
    Object.freeze({ key: 'dealSilent',     label: 'Deal gone silent (no activity 14d)' }),
    Object.freeze({ key: 'dealStuck',      label: 'Deal stuck in stage too long' }),
    Object.freeze({ key: 'closeLapsed',    label: 'Close date lapsed' }),
    Object.freeze({ key: 'dealMomentum',   label: 'Deal momentum (stage advance)' }),
    Object.freeze({ key: 'scoreDropAlert', label: 'AI score dropped below threshold' }),
]);

export const SLACK_ALERT_KEYS = Object.freeze(SLACK_ALERT_TYPES.map(t => t.key));

/**
 * Normalise whatever was saved: every known key becomes a boolean, an absent
 * key reads true (on), unknown keys are dropped, and garbage is "all on".
 */
export function cleanSlackAlerts(raw) {
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const out = {};
    for (const k of SLACK_ALERT_KEYS) out[k] = src[k] !== false;
    return out;
}

/**
 * Should this org's Slack receive this alert type?
 *   - no alertType (the digest, the test message): yes — the switch is for the five pipeline alerts
 *   - an unknown alertType: no — fail closed, a typo at a call site never posts
 *   - no `alerts` saved: yes — a pre-existing config posts everything
 *   - otherwise: only an explicit false is off
 */
export function slackAlertEnabled(slackConfig, alertType) {
    if (!alertType) return true;
    if (!SLACK_ALERT_KEYS.includes(alertType)) return false;
    const alerts = slackConfig?.alerts;
    if (!alerts || typeof alerts !== 'object' || Array.isArray(alerts)) return true;
    return alerts[alertType] !== false;
}

/** How many of the five are on — for the card's "n of 5 alerts". */
export function slackAlertsOnCount(slackConfig) {
    return Object.values(cleanSlackAlerts(slackConfig?.alerts)).filter(Boolean).length;
}
