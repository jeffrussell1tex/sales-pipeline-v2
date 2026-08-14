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
