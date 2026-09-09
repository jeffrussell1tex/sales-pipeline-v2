// FIXTURE — the §0.95 shape (bf4a3c5, 7 Apr 2026): a helper's parameter was
// renamed and its body still reads the OLD name, which is bound only inside
// another function's loop. It parses, it bundles, it imports — and throws
// ReferenceError on the first call. check-fnscope must flag `profile` here.
export const DEFAULT_PREFS = { dealSilent: { enabled: true } };

function wantsAlert(resolvedProfile, alertType) {
    const prefs = profile?.notificationPrefs || {};
    const pref = prefs[alertType] || DEFAULT_PREFS[alertType];
    return !!pref?.enabled;
}

export const handler = async () => {
    const reps = [{ profile: { notificationPrefs: {} } }];
    for (const rep of reps) {
        const profile = rep.profile || {};
        if (wantsAlert(profile, 'dealSilent')) return { statusCode: 200, body: 'sent' };
    }
    return { statusCode: 200, body: 'nothing' };
};
