// MUST NOT BE CAUGHT, either class. This is the shape that produced a 59%
// false-positive rate on the hooks: the Response IS checked, inside a .then()
// callback that the scanner used to unwrap without ever reading.
const load = () => {
    dbFetch('/.netlify/functions/accounts')
        .then(r => { if (!r.ok) { setDbOffline(true); throw new Error('HTTP ' + r.status); } return r.json(); })
        .then(data => setAccounts(data.accounts || []))
        .catch(err => console.error('load failed', err));
};
const alsoSafe = async () => {
    const res = await dbFetch('/.netlify/functions/x', { method: 'POST' });
    if (!res.ok) throw new Error('nope');
};

// MUST NOT BE CAUGHT — aliased AND checked. Alias resolution must not become a
// second false-positive class: the name changing says nothing about whether the
// Response is read.
import { dbFetch as req } from '../../utils/storage';

const loadAliased = async () => {
    const res = await req('/.netlify/functions/contacts');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
};

// Concise arrow body that returns a value nobody discards — the enclosing
// position is a return, not an expression statement.
const chained = () => req('/.netlify/functions/x').then(r => r.ok ? r.json() : null);

// MUST NOT BE CAUGHT by the variable class: the canonical var shape. `res`
// only ever has Response members read (.ok, .status, .json), and `data` is
// initialized from res.json(), not from dbFetch — reading .task off it is
// exactly right. The third class must not turn the CORRECT pattern into noise.
const properVar = async (updated) => {
    const res = await dbFetch('/.netlify/functions/tasks', { method: 'PUT', body: JSON.stringify(updated) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    return data.task || updated;
};

// MUST NOT BE CAUGHT: a .then() in the init chain transforms the value, so the
// variable is not provably a Response — the class bails rather than guesses.
const transformed = async () => {
    const data = await dbFetch('/.netlify/functions/x').then(r => r.json());
    return data.items || [];
};
