// Safe localStorage wrapper
export const safeStorage = {
    getItem(key) { try { return localStorage.getItem(key); } catch(e) { return null; } },
    setItem(key, val) { try { localStorage.setItem(key, val); } catch(e) {} },
    removeItem(key) { try { localStorage.removeItem(key); } catch(e) {} }
};

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
