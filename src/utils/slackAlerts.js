// slackAlerts.js — what an org posts to Slack (state §0.96 and §0.99, handoff
// items 29 and 33; Jeff: "I don't want to have to rely on users to pick the
// correct items by themselves to enable alerts the company wants to post to
// slack").
//
// THE COMPANY DECIDES. The Admin's checkboxes in Configure Slack are the only
// gate on what reaches the org's channel. A rep's own notification preferences
// (avatar → Notifications) decide what THAT rep is emailed or texted — never
// what the company posts. Two kinds of alert:
//
//   event  — posted the moment it happens, from the deal save itself
//            (stageChanged, dealClosedWon; opportunities.mjs → postDealEvents)
//   hourly — a condition the scheduled job detects on each run
//            (pipeline-alerts.mjs, the five signals, once per deal per week)
//
// Shared by both sides the way integrationCatalog.js is: the modal renders
// SLACK_ALERT_TYPES as checkboxes and saves `slackConfig.alerts`; settings.mjs
// normalises what is saved through cleanSlackAlerts(); send-slack.mjs's
// sendSlackToOrg() asks slackAlertEnabled() before it posts. A config saved
// before a key existed has no entry for it — absent is on; only an explicit
// false is off. Pure: no React, no db, reachable by `node --test`.

export const SLACK_ALERT_TYPES = Object.freeze([
    // Posted when it happens
    Object.freeze({ key: 'stageChanged',   kind: 'event',  label: 'Deal stage changed' }),
    Object.freeze({ key: 'dealClosedWon',  kind: 'event',  label: 'Deal closed won' }),
    // Checked every hour by the pipeline-alerts job
    Object.freeze({ key: 'dealSilent',     kind: 'hourly', label: 'Deal gone silent (no activity for 14 days)' }),
    Object.freeze({ key: 'dealStuck',      kind: 'hourly', label: 'Deal stuck in a stage past the average' }),
    Object.freeze({ key: 'closeLapsed',    kind: 'hourly', label: 'Close date lapsed' }),
    Object.freeze({ key: 'dealMomentum',   kind: 'hourly', label: 'Deal momentum (2+ stages within 14 days of creation)' }),
    Object.freeze({ key: 'scoreDropAlert', kind: 'hourly', label: 'AI score dropped below threshold' }),
]);

export const SLACK_ALERT_KEYS  = Object.freeze(SLACK_ALERT_TYPES.map(t => t.key));
export const SLACK_EVENT_KEYS  = Object.freeze(SLACK_ALERT_TYPES.filter(t => t.kind === 'event').map(t => t.key));
export const SLACK_HOURLY_KEYS = Object.freeze(SLACK_ALERT_TYPES.filter(t => t.kind === 'hourly').map(t => t.key));

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
 *   - no alertType (the digest, the test message): yes — the switches are for the alerts above
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

/** How many of the types are on — for the card's "n of N alerts". */
export function slackAlertsOnCount(slackConfig) {
    return Object.values(cleanSlackAlerts(slackConfig?.alerts)).filter(Boolean).length;
}

/**
 * The event posts a deal save produces, from the row before and after. Pure;
 * the poster (send-slack.mjs postDealEvents) asks the org's selection per type.
 *   - into 'Closed Won' from anything else → one dealClosedWon
 *   - any other stage change (Closed Lost included) → one stageChanged
 *   - no stage change, or no `after` → nothing
 * A deal CREATED already won (no `before`) counts as won; created in a stage
 * is not "changed".
 */
export function dealSlackEvents({ before, after } = {}) {
    const to = typeof after?.stage === 'string' ? after.stage : null;
    if (!to) return [];
    const from = typeof before?.stage === 'string' ? before.stage : null;
    if (from === to) return [];
    if (to === 'Closed Won') return [{ type: 'dealClosedWon', from, to }];
    if (from === null) return [];
    return [{ type: 'stageChanged', from, to }];
}
