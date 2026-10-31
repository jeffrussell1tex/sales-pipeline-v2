// mergeWindow.js — what the two merge windows count, show and send by link (state §0.218; batch 3c of OPEN_ITEMS §1
// item 1; guide §18b108). Pure: MergeReviewModal.jsx and ContactMergeReviewModal.jsx ask it; tests/merge-undo.test.mjs
// runs every branch. The server half is mergeLinks.js (contactPairOf) and merge.mjs.
//
// Before: the account window counted a contact on an account by `company === name` — a contact linked by id to an
// account under another text was not counted, and an id-less one whose text two twins share was counted on both — and
// said it "re-links" them, which it did not. The contact window compared the Company as text alone: two contacts whose
// Company read alike but were linked to two different accounts (UKG's twin "Shell - Port Allen") merged with no
// question asked, and picking the other's Company wrote its text alone, the survivor keeping its own link or none.
import { unarchived, isMergeArchived, survivorOf, HIDDEN_ACCOUNT } from './pickLink.js';
import { linkedAccount } from './railLinks.js';
import { accountNote } from './importLinks.js';

const idOf = (v) => (v == null || v === '' ? null : String(v));
const has = (v) => String(v ?? '').trim() !== '';
const norm = (v) => String(v ?? '').trim().toLowerCase();

// ── The account window ─────────────────────────────────────────────────────

// What the account merge moves, as merge.mjs moves it (the review of §0.218 — the window's words counted what each
// record shows, a contact or a deal by name alone included, and named the survivor by the name it had): the deals and
// contacts linked to the record merged away by its id — every one, a contact merged away too, as the server moves them —
// and the name they take: the record merged away's when its name was picked over the survivor's, else the survivor's.
// The cards' counts stay "what you see" (Jeff, 18 Oct: "Count what you see"); these are the summary's.
export function mergeMoves(archived, survivor, { opportunities, contacts } = {}, choices = {}) {
    const on = (row) => !!archived?.id && idOf(row?.accountId) === idOf(archived.id);
    const name = (choices.name || 'survivor') === 'archived' && has(archived?.name) ? String(archived.name) : String(survivor?.name ?? '');
    return { opps: (opportunities || []).filter(on).length, contacts: (contacts || []).filter(on).length, name };
}

// How many live contacts stand on each account, as an account's rail reads a contact's account (railLinks.js
// linkedAccount; Jeff, 30 Oct — the map's answers: "the window counts contacts as the rail reads them"): by its
// accountId — one on an account merged away counts on the account it was merged into — else the ONE live account its
// Company text names; twins, or none, count it nowhere. A contact merged away is on no list, so it is counted on none.
// accounts: the app's whole list, merged-away rows included (survivorOf follows them). A Map of account id → count.
export function contactsByAccount(contacts, accounts) {
    const out = new Map();
    for (const c of unarchived(contacts)) {
        const a = linkedAccount(c, accounts);
        if (a) out.set(a.id, (out.get(a.id) || 0) + 1);
    }
    return out;
}

// ── The contact window's Company (Q17, Jeff, 30 Oct: "Show it to pick") ───────────────────────────────────────

// How the two contacts' Company compares, by link first: { kind, byLink }. kind 'conflict' — two different account
// ids (the user picks; each option names its account's level or parent, companyOption), or, neither linked, two texts
// that differ; 'fill' — a link only the record merged away has (its pair carried, as a fill field is), or, neither
// linked, a text only it has; null — nothing to ask: one link (the survivor's pair stands, as the same link does
// whatever its text) or texts that read alike.
export function companyCase(surv, arch) {
    const s = idOf(surv?.accountId), a = idOf(arch?.accountId);
    if (s || a) return { kind: s && a && s !== a ? 'conflict' : !s ? 'fill' : null, byLink: true };
    const sv = surv?.company, av = arch?.company;
    if (has(sv) && has(av) && norm(sv) !== norm(av)) return { kind: 'conflict', byLink: false };
    return { kind: !has(sv) && has(av) ? 'fill' : null, byLink: false };
}

// What the window sends of the Company in resolvedFields — the pair travels together (contactPairOf, the server's
// contract): the picked record's accountId and its Company whenever either contact is linked and the links differ or
// only one is linked — `pick` 'archived' on a conflict, the record merged away's on a fill, else the survivor's; with
// one link the survivor's, which the server keeps. Neither linked: the text alone, as before — the record merged
// away's when picked or filled, else nothing. The same link: nothing (the survivor's pair stands).
export function companyResolved(surv, arch, pick) {
    const { kind, byLink } = companyCase(surv, arch);
    const from = kind === 'fill' || (kind === 'conflict' && pick === 'archived') ? arch : surv;
    if (byLink) {
        if (idOf(surv?.accountId) === idOf(arch?.accountId)) return {};
        return { accountId: idOf(from?.accountId), company: from?.company ?? null };
    }
    return from === arch && kind ? { company: arch?.company ?? null } : {};
}

// One option of the Company conflict: { text, note } — the contact's Company as stored (its account's name when it
// stores none; "No Company" with neither), and what tells its account apart from a twin of that name (importLinks.js accountNote: "site of
// Shell", "unit of Shell", "top level"); an account merged away, the one it was merged into (survivorOf) — the server
// links that one, under its current name; one the list does not hold, said so. No link: no note.
// accounts: the app's whole list, merged-away rows included.
export function companyOption(contact, accounts) {
    const id = idOf(contact?.accountId);
    const list = Array.isArray(accounts) ? accounts.filter(Boolean) : [];
    const acc = id ? list.find((a) => idOf(a.id) === id) || null : null;
    const text = has(contact?.company) ? String(contact.company) : has(acc?.name) ? String(acc.name) : 'No Company';
    if (!id) return { text, note: '' };
    if (!acc) return { text, note: HIDDEN_ACCOUNT.toLowerCase() };
    if (isMergeArchived(acc)) {
        const into = survivorOf(acc, list);
        return { text, note: into ? `merged into “${into.name}”` : 'merged into another account' };
    }
    const byId = new Map(list.map((a) => [a.id, a]));
    return { text, note: accountNote(acc, byId) };
}
