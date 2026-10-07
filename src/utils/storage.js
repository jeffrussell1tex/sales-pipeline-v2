// Safe localStorage wrapper
export const safeStorage = {
    getItem(key) { try { return localStorage.getItem(key); } catch(e) { return null; } },
    setItem(key, val) { try { localStorage.setItem(key, val); } catch(e) {} },
    removeItem(key) { try { localStorage.removeItem(key); } catch(e) {} }
};

// Waits until window.__getClerkToken is available (set by App.jsx after Clerk+org initializes)
// Polls every 100ms for up to 8 seconds, then gives up.
export const waitForToken = () => new Promise((resolve) => {
    if (typeof window.__getClerkToken === 'function') { resolve(); return; }
    let attempts = 0;
    const interval = setInterval(() => {
        attempts++;
        if (typeof window.__getClerkToken === 'function') {
            clearInterval(interval);
            resolve();
        } else if (attempts > 80) { // 8 seconds max
            clearInterval(interval);
            // Giving up here sends the caller's request WITHOUT a token — a 401.
            // Every load keys on an active org now (App.jsx activeOrgId, state
            // §0.125), so this line should never print; if it does, a caller is
            // fetching before sign-in again.
            console.warn('waitForToken: no Clerk token after 8 s — the request will go out unauthenticated (401)');
            resolve();
        }
    }, 100);
});

// The org every request is made for (state §0.173): the org on screen NOW. App.jsx
// sets it as it renders — before any effect of that render runs, a child's or
// App's own — and the token getter reads it when a request is made. The getter
// used to close over the org of the render that installed it, and App's effects
// run after its children's: in the commit that switched the org, a tab's effect
// fetched with the PREVIOUS org's token (observed: Home's pinned reports).
let requestOrgId = null;
export const setRequestOrg = (orgId) => { requestOrgId = orgId || null; };
export const requestOrg = () => requestOrgId;
// True while the org that asked is still the org on screen. A load takes
// requestOrg() when it starts and checks this when its answer lands: an answer
// for an org the user has switched away from is dropped, never shown under the
// new org's name.
export const stillOrg = (askedOrgId) => !!askedOrgId && askedOrgId === requestOrgId;
// An action cut by an org switch stops and never settles (state §0.175): what it
// would do next — set the screen, send its next request — belongs to an org no
// longer on screen, and whoever asked was remounted by the switch.
export const stopped = () => new Promise(() => {});

// Authenticated fetch — injects Clerk JWT
// window.__getClerkToken is set by App.jsx after useAuth() initializes
export const dbFetch = async (url, options) => {
    let token = '';
    try {
        if (typeof window.__getClerkToken === 'function') {
            token = await window.__getClerkToken();
        }
    } catch(e) {
        console.warn('Failed to get Clerk token:', e);
    }

    const authHeaders = token ? { 'Authorization': 'Bearer ' + token } : {};
    const mergedOptions = {
        ...options,
        headers: { 'Content-Type': 'application/json', ...(options?.headers || {}), ...authHeaders }
    };
    return fetch(url, mergedOptions)
        .then(r => {
            if (!r.ok) console.error(`DB error ${r.status} ${r.statusText} [${options?.method || 'GET'} ${url}]`);
            return r;
        })
        .catch(err => { console.error(`Network error [${options?.method || 'GET'} ${url}]:`, err); throw err; });
};

// dbFetch resolves for ANY response, including 4xx/5xx (guide §18b1). That is the
// right default for callers that want the Response, but it means a bare
//
//     dbFetch(url, { method: 'PUT', ... }).catch(err => console.error(err))
//
// swallows every server rejection: the catch only fires on a network failure, so a
// 403 or 500 is invisible and the optimistic UI state is never rolled back. Five
// such sites were live in the hooks, including the Closed Lost write, which also
// called addAudit() unconditionally — leaving the audit log asserting a deal was
// lost while the row in the database was still open.
//
// What a refused request says — dbWrite's words, and the documents hook's (state
// §0.181): a 403 is a permission sentence; otherwise the server's own error, with the
// ref of its log line when it sent one; otherwise the status. Reads the body; never
// throws.
export const refusalOf = async (res) => {
    if (res.status === 403) return 'You do not have permission to make this change.';
    // serverErrorBody sends { error, requestId }; surface the ref so the
    // exact Netlify function log line can be found.
    try {
        const body = await res.json();
        if (body?.error) return body.requestId ? `${body.error} (ref ${body.requestId})` : body.error;
    } catch { /* non-JSON error body */ }
    return `The server returned ${res.status}.`;
};
// …and one that never reached the server.
export const NETWORK_ERROR = 'Network error — the change was not saved.';

// dbWrite is for write paths that do not need the Response body. It resolves to
// { ok, status, error } and NEVER throws, so a caller can roll back in one place
// without a try/catch around every call.
export const dbWrite = async (url, options) => {
    try {
        const res = await dbFetch(url, options);
        if (res.ok) return { ok: true, status: res.status, error: null };
        return { ok: false, status: res.status, error: await refusalOf(res) };
    } catch (err) {
        return { ok: false, status: 0, error: NETWORK_ERROR };
    }
};
