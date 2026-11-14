// What a non-ok response means for the banner at the top of the app.
//
// Every loader used to call `setDbOffline(true)` on ANY non-ok response, so an
// auth refusal (401 pending / expired session, 403 revoked role) was reported
// as "Database connection lost" — the wrong layer (guide 18b22). The banner
// state is now false (fine), 'auth' (sign in again), or true (a real outage /
// server error). Pure, so the mapping is tested and mutated.

/** false when the response is ok, 'auth' on 401/403, true on any other non-ok. */
export function dbStatusOf(res) {
    if (!res || res.ok) return false;
    return res.status === 401 || res.status === 403 ? 'auth' : true;
}

/**
 * Copy for the banner, by state. `true` is reached only through dbStatusOf — a load the server ANSWERED with a
 * non-ok status other than 401/403 (a 5xx, a 404); a load that never left throws before any loader calls it, so the
 * banner never stands for a request that did not reach the server. It says the server's failure, never "Check your
 * connection" (§0.249, docs/design/refusal-sweep Q4: that is "The server could not be reached.", and only for a
 * request that never left) and never "Database connection lost" (the database is not what the answer names).
 */
export function bannerCopyOf(state) {
    if (state === 'auth') {
        return {
            tone: 'auth',
            text: 'Your sign-in is no longer valid — refresh the page and sign in again. Changes are not being saved.',
        };
    }
    return {
        tone: 'outage',
        text: 'The server returned an error loading your data — changes may not be saving. Refresh the page to try again.',
    };
}

/**
 * The Settings catalogue card for MFA, from the live Clerk enrolment the
 * detail panel already fetches. `null` when the numbers are not known (the
 * fetch failed, or the viewer is not an Admin) — the card then shows nothing
 * rather than the old hand-typed "Optional · not all enrolled · 3 months ago".
 */
export function mfaCardOf(mfa) {
    if (!mfa || typeof mfa.total !== 'number' || typeof mfa.enrolled !== 'number') return null;
    const { enrolled, total } = mfa;
    if (total === 0) return { status: 'partial', detail: 'No users yet', attention: false };
    const pct = Math.round(enrolled / total * 100);
    const complete = enrolled >= total;
    return {
        status: complete ? 'ok' : 'partial',
        detail: `${enrolled}/${total} enrolled · ${pct}%`,
        attention: !complete,
    };
}
