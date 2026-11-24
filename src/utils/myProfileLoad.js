// src/utils/myProfileLoad.js
// The caller's own roster row as the app starts (users?me=true, state §0.292) — the profile every screen names them by and
// reads their role from. A refused or failed answer was dropped in silence: no profile, the whole session a Sales Rep's of
// nobody, until a reload. It is asked once more — the request links or makes the row, and may be sent again (state §0.108)
// — and a second failure is thrown in plain words, for the screen to say.
// { user } as answered (joined: true when their row here was linked, made or saved in the last two minutes, users.mjs, state §0.295), or { deactivated: true } — the caller's access here was turned off (state §0.164), never asked again;
// null once `still()` says another load is the one on screen — never asked again for it, which would ask for its org.
import { refusalWords } from './refusalWords.js';

export async function readMyProfile(ask, still = () => true) {
    let failed = null;
    for (let tries = 0; tries < 2; tries++) {
        try {
            const r = await ask();
            if (r.ok) return await r.json();
            const body = await r.json().catch(() => null);
            if (r.status === 403 && body?.code === 'deactivated') return { deactivated: true };
            throw new Error(refusalWords(r, body));
        } catch (e) {
            failed = e;
        }
        if (!still()) return null;
    }
    throw failed;
}
