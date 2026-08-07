// Shared settings save.
//
// Every settings panel used this shape:
//
//     try { await dbFetch('/.netlify/functions/settings', {...}); }
//     catch (e) { console.error('save x', e); }
//     setSaving(false); setDirty(false);
//
// which is wrong twice over. dbFetch resolves the promise for ANY response, so a
// 403 or 500 never reaches the catch — and the dirty flag is cleared regardless,
// so a failed save is indistinguishable from a successful one. After the SVR-2
// change made PUT /settings Admin-only, a non-admin's save silently did nothing
// and the panel said it had worked.
//
// This throws a readable Error on a non-2xx so callers can surface it and keep
// the panel dirty.
import { dbFetch } from '../../../utils/storage';

export async function putSettings(payload) {
    const res = await dbFetch('/.netlify/functions/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    if (!res.ok) {
        if (res.status === 403) throw new Error('You need the Admin role to change these settings.');
        let msg = 'HTTP ' + res.status;
        try { const d = await res.json(); if (d?.error) msg = d.error; } catch (_) {}
        throw new Error(msg);
    }
    return res.json().catch(() => ({}));
}
