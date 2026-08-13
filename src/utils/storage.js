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
            resolve(); // resolve anyway — dbFetch will send without token and get 401
        }
    }, 100);
});

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
// dbWrite is for write paths that do not need the Response body. It resolves to
// { ok, status, error } and NEVER throws, so a caller can roll back in one place
// without a try/catch around every call.
export const dbWrite = async (url, options) => {
    try {
        const res = await dbFetch(url, options);
        if (res.ok) return { ok: true, status: res.status, error: null };
        let error = `The server returned ${res.status}.`;
        if (res.status === 403) error = 'You do not have permission to make this change.';
        else {
            // serverErrorBody sends { error, requestId }; surface the ref so the
            // exact Netlify function log line can be found.
            try {
                const body = await res.json();
                if (body?.error) error = body.requestId ? `${body.error} (ref ${body.requestId})` : body.error;
            } catch { /* non-JSON error body */ }
        }
        return { ok: false, status: res.status, error };
    } catch (err) {
        return { ok: false, status: 0, error: 'Network error — the change was not saved.' };
    }
};
