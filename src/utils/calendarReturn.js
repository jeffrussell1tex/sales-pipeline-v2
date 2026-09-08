// calendarReturn.js — the round trip back from a calendar OAuth connect
// (state §0.97, handoff item 30).
//
// Connect is a browser redirect: calendar-oauth-start → the provider's consent
// screen → calendar-oauth-callback → back to the app. Until §0.97 the callback
// sent the browser to `/?tab=settings&subtab=calendar&calconnect=error`, which
// nothing read (App.jsx read only `calconnect=success`, to refetch events), so
// a failed Connect landed on Home with no message and a successful one said
// nothing either. Now the redirect carries WHERE the user came from, WHICH
// provider and scope, and WHY it failed — from allowlists only, never free
// text — and the app lands them back on that surface with one line.
//
// Shared by both sides the way slackAlerts.js is: the callback builds the URL
// with calendarReturnUrl(); App.jsx reads it with readCalendarReturn(); the
// surface that offered Connect renders calendarReturnMessage(). Pure.

export const CALENDAR_RETURN_FROM = Object.freeze(['apps', 'profile', 'home', 'company']);
export const CALENDAR_RETURN_PROVIDERS = Object.freeze(['google', 'outlook', 'yahoo']);
export const CALENDAR_RETURN_SCOPES = Object.freeze(['user', 'org']);
export const CALENDAR_RETURN_STATUS = Object.freeze(['success', 'error']);

export const CALENDAR_RETURN_REASONS = Object.freeze({
    provider_denied:  'you cancelled at the provider\'s consent screen, or the provider refused.',
    missing_code:     'the provider sent the browser back without an authorization code.',
    bad_state:        'the sign-in state could not be read — start the connection again from this page.',
    not_admin:        'only an Admin can connect a company calendar.',
    no_refresh_token: 'the provider did not grant offline access — remove Accelerep from your account\'s connected apps and try again.',
    server_error:     'the server could not store the connection. Try again; if it repeats, the site\'s calendar credentials may be wrong.',
});

export const PROVIDER_NAMES = Object.freeze({ google: 'Google Calendar', outlook: 'Microsoft 365 Calendar', yahoo: 'Yahoo Calendar' });

const pick = (v, list, fallback) => (list.includes(v) ? v : fallback);

/** The `from` a caller may send to calendar-oauth-start; anything else is 'home'. */
export function cleanCalendarReturnFrom(raw) {
    return pick(typeof raw === 'string' ? raw : '', CALENDAR_RETURN_FROM, 'home');
}

/**
 * The URL the callback redirects to. Every value is checked against its list
 * (an unknown provider or scope is dropped, an unknown reason becomes
 * server_error, an unknown from becomes home), so the query can carry
 * nothing the app did not define.
 */
export function calendarReturnUrl(appUrl, { status, provider, scope, from, reason } = {}) {
    const base = String(appUrl || '').replace(/\/+$/, '');
    const q = new URLSearchParams();
    q.set('calconnect', pick(status, CALENDAR_RETURN_STATUS, 'error'));
    if (CALENDAR_RETURN_PROVIDERS.includes(provider)) q.set('provider', provider);
    if (CALENDAR_RETURN_SCOPES.includes(scope)) q.set('scope', scope);
    q.set('from', cleanCalendarReturnFrom(from));
    if (q.get('calconnect') === 'error') q.set('reason', Object.hasOwn(CALENDAR_RETURN_REASONS, reason) ? reason : 'server_error');
    return `${base}/?${q.toString()}`;
}

/**
 * What App.jsx reads on mount. Null unless `calconnect` is present and valid;
 * otherwise every field is from its list (a tampered query reads as the
 * nearest safe value — it can only ever choose a landing surface and a
 * sentence the app wrote).
 */
export function readCalendarReturn(search) {
    let q;
    try { q = new URLSearchParams(typeof search === 'string' ? search : ''); } catch { return null; }
    const status = q.get('calconnect');
    if (!CALENDAR_RETURN_STATUS.includes(status)) return null;
    const provider = q.get('provider');
    const scope = q.get('scope');
    const reason = q.get('reason');
    return {
        status,
        provider: CALENDAR_RETURN_PROVIDERS.includes(provider) ? provider : null,
        scope:    CALENDAR_RETURN_SCOPES.includes(scope) ? scope : null,
        from:     cleanCalendarReturnFrom(q.get('from')),
        reason:   status === 'error' ? (Object.hasOwn(CALENDAR_RETURN_REASONS, reason) ? reason : 'server_error') : null,
    };
}

/** One sentence for the surface the user lands on. */
export function calendarReturnMessage(r) {
    if (!r || !CALENDAR_RETURN_STATUS.includes(r.status)) return '';
    const name = PROVIDER_NAMES[r.provider] || 'The calendar';
    const which = r.scope === 'org' ? 'company calendar' : 'calendar';
    if (r.status === 'success') return `${name} connected — your ${which} is live.`;
    return `${name} was not connected — ${CALENDAR_RETURN_REASONS[r.reason] || CALENDAR_RETURN_REASONS.server_error}`;
}
