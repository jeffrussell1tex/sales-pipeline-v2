// A deal's health, the parts a test can run (state §0.244): App.jsx's calculateDealHealth reads them here.

// The last-activity part (state §0.240, §0.244): what the days since the deal's last activity cost its score and the
// reason said. An activity day that does not read (null) says nothing of the days -- no points, no reason -- never
// "Recent activity null days ago".
export function activityHealth(days) {
    if (days == null) return null;
    if (days > 30) return { penalty: 40, reason: 'No activity in over 30 days (' + days + ' days)' };
    if (days > 14) return { penalty: 25, reason: 'No activity in over 14 days (' + days + ' days)' };
    if (days > 7) return { penalty: 10, reason: 'No activity in over 7 days (' + days + ' days)' };
    return { penalty: 0, reason: 'Recent activity ' + days + ' day' + (days !== 1 ? 's' : '') + ' ago' };
}
