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
//
// It answers only in the org that asked (state §0.175). A save whose answer comes
// back after an org switch never settles: the panel that asked was unmounted by
// the switch, and what it would do next — copy the saved keys into the app's
// settings, roll back to its snapshot of the last org's settings, report an
// error — would land on the new org's screen. Every caller is a Settings panel,
// inside the tabs that remount on a switch, so nothing waits on it.
import { dbFetch, requestOrg, stillOrg, stopped } from '../../../utils/storage.js';

export async function putSettings(payload) {
    const askedOrg = requestOrg();
    const res = await dbFetch('/.netlify/functions/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    if (!stillOrg(askedOrg)) return stopped();
    if (!res.ok) {
        if (res.status === 403) throw new Error('You need the Admin role to change these settings.');
        let msg = 'HTTP ' + res.status;
        try { const d = await res.json(); if (d?.error) msg = d.error; } catch (_) {}
        if (!stillOrg(askedOrg)) return stopped();
        throw new Error(msg);
    }
    const body = await res.json().catch(() => ({}));
    if (!stillOrg(askedOrg)) return stopped();
    return body;
}
