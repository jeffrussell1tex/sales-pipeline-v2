// FIXTURE — every way a name can be bound, and every kind of read, with nothing
// unbound. check-fnscope must stay quiet here; a scanner that cries wolf is
// switched off. Mirrors the shapes the real function files use.
import crypto, { randomUUID as uuid } from 'node:crypto';
import * as fsAll from 'node:fs';
export { readFileSync as read } from 'node:fs';

const TOP = 1;
let later;
export const DEFAULT_PREFS = { dealSilent: { enabled: true } };

function wantsAlert(resolvedProfile, alertType) {
    const prefs = resolvedProfile?.notificationPrefs || {};
    const pref = prefs[alertType] || DEFAULT_PREFS[alertType];
    return pref?.enabled === true;
}

function outer(a, { b, c: d = a }, [e, ...f], ...rest) {
    var hoistedLater;
    inner();
    function inner() { return a + b + d + e + f.length + rest.length + hoistedLater + TOP + later + arguments.length + outer.name; }
    try { throw new Error('x'); } catch (err) { console.warn(err.message); }
    for (let i = 0; i < 2; i++) { const j = i; console.log(j); }
    for (const k of []) console.log(k);
    for (const key in {}) console.log(key);
    switch (a) { case 1: { const s = 2; console.log(s); } }
    class K extends Object { static m() { return K; } n() { return this; } }
    const arrow = (p = TOP) => p;
    const fe = function named() { return named; };
    const obj = { TOP, [uuid()]: 1, later: 2, m() { return TOP; } };
    return [K, arrow, fe, obj, obj.anything, obj?.deep?.prop, `${TOP}`, crypto.randomUUID(), fsAll.existsSync('.'), process.env.X, Buffer.from(''), JSON.stringify({})];
}

export const handler = async (event) => {
    later = Date.now();
    const rows = [{ profile: { notificationPrefs: { dealSilent: { enabled: true } } } }];
    for (const rep of rows) {
        const profile = rep.profile || {};
        if (wantsAlert(profile, 'dealSilent')) return { statusCode: 200, body: JSON.stringify({ ok: true, path: event?.path, out: outer(1, { b: 2 }, [3]) }) };
    }
    return { statusCode: 200, body: 'nothing' };
};
