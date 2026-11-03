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
// inside the tabs that remount on a switch, so nothing waits on it. A send that
// never reached the server is the same (state §0.226 — JB3-7c): in the org that
// asked it throws writeSettings' words for it (NETWORK_ERROR); after a switch it
// never settles.
//
// Each save names the revision token it loaded for every key it sends (state
// §0.225 — batch 4b-3, step B-2; src/utils/settingsRevs.js). The server refuses
// one whose token has moved since — another tab or another Admin saved that key
// first — with a 409 `code: 'stale'`, and writes nothing of it. putSettings
// throws that refusal with `.stale` (the keys that moved) on the Error. Called
// with no tokens at all it sends none, and the save is accepted unchecked, as
// every save was before (Q6 — the panels not converted yet). A save that lands
// answers each key's new token; the caller merges them into the app's copy with
// the values (revsAfter), so its next save names them.
//
// writeSettings is the same send for a screen that handles a refusal in line: it
// never throws, and answers dbWrite's shape and words, `stale` on a stale
// refusal. takeLatestSettings is what every stale refusal does next (J-B4): one
// read, the latest values and their tokens put in the app's copy together, the
// way the load puts them. addToSettingsList makes an addition to one list that
// no screen drafted by hand — the member invite's and import's teams (Q5):
// refused as stale, it takes the latest and makes the same addition once more on
// it; a second refusal is `twice`, and the screen says so.
import { dbFetch, requestOrg, stillOrg, stopped, refusalOf, NETWORK_ERROR } from '../../../utils/storage.js';
import { withIfRevs, staleOf, revsAfter } from '../../../utils/settingsRevs.js';
import { settingsAsLoaded } from '../../../utils/settingsDefaults.js';

const SETTINGS_URL = '/.netlify/functions/settings';

export async function putSettings(payload, revs) {
    const askedOrg = requestOrg();
    let res;
    try {
        res = await dbFetch(SETTINGS_URL, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(withIfRevs(payload, revs)),
        });
    } catch {
        if (!stillOrg(askedOrg)) return stopped();
        throw new Error(NETWORK_ERROR);
    }
    if (!stillOrg(askedOrg)) return stopped();
    if (!res.ok) {
        if (res.status === 403) throw new Error('You need the Admin role to change these settings.');
        let msg = 'HTTP ' + res.status, stale = null;
        try { const d = await res.json(); if (d?.error) msg = d.error; stale = staleOf(res.status, d); } catch (_) {}
        if (stale && stillOrg(askedOrg)) throw Object.assign(new Error(msg), { stale });
        if (!stillOrg(askedOrg)) return stopped();
        throw new Error(msg);
    }
    const body = await res.json().catch(() => ({}));
    if (!stillOrg(askedOrg)) return stopped();
    return body;
}

// The same save for a screen that handles a refusal in line: it never throws.
// It answers { ok, status, error, data, revs } — dbWrite's shape, and its words
// for a refusal and for a network failure — with `stale` (the keys that moved)
// on a stale refusal; `revs` holds the tokens a landed save answered. After an
// org switch it never settles, at the send or at the body read.
export async function writeSettings(payload, revs) {
    const askedOrg = requestOrg();
    let res;
    try { res = await dbFetch(SETTINGS_URL, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(withIfRevs(payload, revs)) }); }
    catch { return stillOrg(askedOrg) ? { ok: false, status: 0, error: NETWORK_ERROR } : stopped(); }
    const answer = await res.json().catch(() => null);
    if (!stillOrg(askedOrg)) return stopped();
    if (res.ok) return { ok: true, status: res.status, error: null, data: answer, revs: revsAfter(null, answer?.revs) };
    const stale = staleOf(res.status, answer);
    const error = await refusalOf({ status: res.status, json: async () => answer });
    return { ok: false, status: res.status, error, ...(stale ? { stale } : {}) };
}

// What a stale refusal does next (J-B4): read settings once, and put the latest
// in the app's copy — the values and their tokens as one set, the roster kept,
// as the load builds it (settingsAsLoaded). It answers the latest settings, or
// null when they could not be read, and then sets nothing. After an org switch
// it never settles.
export async function takeLatestSettings(setSettings) {
    const askedOrg = requestOrg();
    let data = null;
    try { const r = await dbFetch(SETTINGS_URL); data = r.ok ? await r.json() : null; } catch { data = null; }
    if (!stillOrg(askedOrg)) return stopped();
    if (!data || !data.settings) return null;
    setSettings((prev) => settingsAsLoaded(prev, data.settings));
    return data.settings;
}

// An addition to one settings list that no screen drafted by hand (Q5): the
// member invite's and import's teams. `apply(list)` answers { [key]: next,
// changed }, as teamsWithMembers does; `list` and `rev` are the list and its
// token from the same render. Refused as stale, it takes the latest and makes
// the same addition once more, on the latest list with its token. It answers
// { ok: true } when the addition landed, { ok: true, already: true } when the
// latest list already held it, `twice` when the second try was refused too (the
// latest is on screen by then), or writeSettings' refusal — a 403, a 404 or the
// network is never tried again. It never throws, and never settles after an org
// switch.
export async function addToSettingsList(key, apply, { list, rev, setSettings }) {
    let held = list, token = rev ?? null;
    for (let tries = 0; tries < 2; tries++) {
        const made = apply(held);
        if (!made?.changed) return { ok: true, already: tries > 0 };
        const w = await writeSettings({ [key]: made[key] }, { [key]: token });
        if (w.ok) {
            setSettings((prev) => ({ ...prev, [key]: made[key], revs: revsAfter(prev?.revs, w.revs) }));
            return { ok: true };
        }
        if (!w.stale) return w;
        const latest = await takeLatestSettings(setSettings);
        if (!latest) return { ok: false, status: 409, error: w.error, stale: w.stale };
        held = latest[key];
        token = latest.revs?.[key] ?? null;
    }
    return { ok: false, status: 409, stale: true, twice: true };
}
