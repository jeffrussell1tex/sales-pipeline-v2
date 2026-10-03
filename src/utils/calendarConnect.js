// calendarConnect.js — the browser's side of a calendar Connect (state §0.160).
//
// Every Connect button calls this. The start is a signed-in POST: it answers with the
// provider's consent page and sets the state's nonce as a cookie on this browser
// (netlify/functions/_oauthState.mjs), and the browser then goes to that page. Who
// connects and to which org are the server's to say, from the verified sign-in — this
// sends only the provider, the scope and where Connect was clicked. (Until §0.160 the
// four buttons put userId, orgId and userRole into the link, and the server believed
// them.) A refusal lands back on the same surface with its one sentence, through the
// return path the callback uses (calendarReturn.js) — no second way to show an error.
import { dbFetch } from './storage';
import { calendarReturnUrl } from './calendarReturn.js';

export async function startCalendarConnect({ provider, scope, from }) {
    let res = null, data = null;
    try {
        res = await dbFetch('/.netlify/functions/calendar-oauth-start', {
            method: 'POST',
            body: JSON.stringify({ provider, scope, from }),
        });
        data = await res.json().catch(() => null);
    } catch { res = null; }
    // Only the provider's own https page — never anywhere else a reply might name.
    if (res?.ok && typeof data?.url === 'string' && data.url.startsWith('https://')) {
        window.location.assign(data.url);
        return;
    }
    const reason = res?.status === 403 ? 'not_admin' : 'server_error';
    window.location.assign(calendarReturnUrl(window.location.origin, { status: 'error', provider, scope, from, reason }));
}
