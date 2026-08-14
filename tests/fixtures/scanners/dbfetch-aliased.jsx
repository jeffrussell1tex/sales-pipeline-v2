// MUST BE CAUGHT — all three are discarded Responses wearing a different name.
// The scanner matched the callee NAME `dbFetch`, so every one of these read as
// clean. The first is verbatim what shipped in AppHeader.jsx: a timezone save
// into an empty catch, invisible to the gate AND to the user on a 403.
//
// It is two blind spots on one line — the alias, and the concise arrow body,
// which has no ExpressionStatement anywhere for findStatements to find.

const onAvatarClick = () => {
    import('../../utils/storage').then(({ dbFetch: df }) =>
        df('/.netlify/functions/users?me=true', { method: 'PUT', body: '{}' }).catch(() => {}));
};

// Static rename — same hazard, no dynamic import to notice.
import { dbFetch as post } from '../../utils/storage';

const save = (payload) => {
    post('/.netlify/functions/thing', { method: 'PUT', body: JSON.stringify(payload) });
};

// Plain reassignment, resolved transitively.
const write = dbFetch;
const remove = (id) => {
    write(`/.netlify/functions/thing?id=${id}`, { method: 'DELETE' });
};
