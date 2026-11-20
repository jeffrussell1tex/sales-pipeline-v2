// A row whose Undo is still re-POSTing it (state §0.273). The Undo puts the row back on screen before its POST is
// answered, so a Delete pressed on it meanwhile finds nothing on the server and is answered 404 `gone` — read as done
// since §0.273 — and the Undo's POST then lands it again: live on the server, off the screen. A Delete of a row its
// own Undo still has out is not sent; it says so, and the row stays. One tab's state, by kind and id (ids are unique
// across orgs; an Undo cut by an org switch ends, and its rows with it).
const out = new Set();
const keyOf = (kind, id) => `${kind}|${id}`;

export const isRestoring = (kind, id) => out.has(keyOf(kind, id));

// The restore function softDelete's Undo calls: `run`, with its rows marked out until it ends, however it ends.
export const undoWhileOut = (kind, ids, run) => async () => {
    const keys = (ids || []).map((id) => keyOf(kind, id));
    keys.forEach((k) => out.add(k));
    try { return await run(); } finally { keys.forEach((k) => out.delete(k)); }
};

// The words, kept until closed: what is still being restored, and to press again.
export const stillRestoringWords = (names) => (names.length === 1
    ? `Not deleted — "${names[0]}" is still being restored by its Undo. Try again in a moment.`
    : `Not deleted — ${names.length} of them are still being restored by their Undo. Try again in a moment.`);
