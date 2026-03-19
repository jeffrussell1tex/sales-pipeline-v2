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
    const r = await fetch(url, mergedOptions);
    if (!r.ok) {
        console.error(`DB error ${r.status} ${r.statusText} [${options?.method || 'GET'} ${url}]`);
        throw new Error(`HTTP ${r.status}`);
    }
    return r.json();
};
