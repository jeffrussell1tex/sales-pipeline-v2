// Safe localStorage wrapper
export const safeStorage = {
    getItem(key) { try { return localStorage.getItem(key); } catch(e) { return null; } },
    setItem(key, val) { try { localStorage.setItem(key, val); } catch(e) {} },
    removeItem(key) { try { localStorage.removeItem(key); } catch(e) {} }
};

// Authenticated fetch — injects Clerk JWT
export const dbFetch = async (url, options) => {
    let token = '';
    try {
        // Try the Clerk client session token
        const sessions = window.Clerk?.client?.activeSessions;
        if (sessions && sessions.length > 0) {
            token = await sessions[0].getToken();
        } else if (window.Clerk?.session) {
            token = await window.Clerk.session.getToken();
        }
    } catch(e) {}

    const authHeaders = token ? { 'Authorization': 'Bearer ' + token } : {};
    const mergedOptions = {
        ...options,
        headers: { ...(options?.headers || {}), ...authHeaders }
    };
    return fetch(url, mergedOptions)
        .then(r => {
            if (!r.ok) console.error(`DB error ${r.status} ${r.statusText} [${options?.method || 'GET'} ${url}]`);
            return r;
        })
        .catch(err => console.error(`Network error [${options?.method || 'GET'} ${url}]:`, err));
};
