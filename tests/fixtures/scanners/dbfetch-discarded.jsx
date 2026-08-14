// MUST BE CAUGHT — the Response goes nowhere. .catch() does NOT count: dbFetch
// resolves for 4xx/5xx, so a catch only ever sees a network failure.
const save = async (payload) => {
    dbFetch('/.netlify/functions/thing', { method: 'PUT', body: JSON.stringify(payload) })
        .catch(e => console.error('save failed', e));
};
