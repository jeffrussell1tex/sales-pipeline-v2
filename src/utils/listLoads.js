// src/utils/listLoads.js
// Whether each of the app's record lists was read (state §0.294; guide §18b139). A list whose load failed stayed `[]`,
// and every screen drew it as none: "No accounts yet — add your first one", $0 of pipeline, an import that met no
// duplicate. The banner that said so was set by whichever load answered last, so the next one that landed took it down;
// a request that never left raised none, and an answer that could not be read took one down.
//
// Each load reports here under its list's name: begun, landed, or failed and why. A list is READ once a load of it has
// landed in the org on screen; its latest load may have failed since (its rows are then the last ones read). The screens
// ask by name — never by the list's length: a failed list can hold the one row made on it.
//
// The pure half. readList (below) is the one loader; useListLoads.js holds the state; ListsGate.jsx draws a tab or a
// Settings panel that waits, ListsWait.jsx a window.
import { requestOrg, stillOrg } from './storage.js';
import { dbStatusOf, SIGN_IN_WORDS } from './fetchStatus.js';
import { readRefusal, failureWords } from './refusalWords.js';

// The lists, in the order the banner names them, and what a member calls each.
export const LIST_NAMES = {
    opportunities: 'deals',
    accounts: 'accounts',
    contacts: 'contacts',
    tasks: 'tasks',
    activities: 'activities',
    leads: 'leads',
    users: 'the team',
    spiffClaims: 'SPIFF claims',
    documents: 'documents',
    quotes: 'quotes',
    products: 'the price book',
};
// The two every screen is worked out from (state §0.296): whose session this is, and their org's settings — its pipelines,
// stages, quarters, fields and switches. They load and are tracked as a list does; until both were read the settings on
// screen are the product's defaults, the member is Clerk's name with no id here, and everyone is a Sales Rep. So no tab is drawn (App's
// gate over them all) and no window (below) until they were.
export const ORG_LOADS = ['settings', 'profile'];
// What the loads are called, in the order the banner names them.
export const LOAD_NAMES = { settings: 'settings', profile: 'your profile', ...LIST_NAMES };

// The lists each tab draws from: it is drawn once every one was read (ListsGate). A tab that is not here draws on its
// own — Documents says its own failure (docsError), Settings opens whatever list failed (its panels that count a list, or write to
// the team, wait: PANEL_LISTS). Every tab waits for ORG_LOADS first. tests/list-loads.test.mjs THE GUARD holds each to the lists its file takes from the app; NO_GATE there
// names those a tab's file takes and needs no gate for, each with why.
export const TAB_LISTS = {
    home: ['opportunities', 'contacts', 'tasks', 'activities', 'users'],
    pipeline: ['opportunities', 'activities', 'users'],
    tasks: ['tasks', 'activities', 'opportunities', 'accounts', 'contacts'],
    accounts: ['accounts', 'opportunities', 'contacts', 'tasks', 'activities'],
    contacts: ['contacts', 'opportunities', 'accounts', 'tasks', 'activities'],
    leads: ['leads', 'users'],
    quotes: ['quotes', 'products', 'opportunities'],
    dispatch: ['accounts', 'opportunities', 'users'],
    reports: ['opportunities', 'accounts', 'contacts', 'tasks', 'activities', 'leads', 'users'],
    salesManager: ['opportunities', 'tasks', 'activities', 'users', 'spiffClaims'],
};
// A technician's Dispatch waits for none of them: the server answers them no account and no deal (crmReadScope), their
// day's jobs are Dispatch's own, and the team is the Technicians page's, which is not theirs.
export const tabLists = (tab, { technician = false } = {}) => (tab === 'dispatch' && technician ? [] : TAB_LISTS[tab] || []);

// The lists a record's window reads — a deal's, an account's, a contact's, a task's, an activity's, an import's, a merge's,
// a document's link picker, the quick log: what it names, offers, counts, refuses and checks for a duplicate. A window
// opened before they were read waits (ModalLayer's ListsWait); opened over one that was not, it made duplicates of what it
// never read and called a good link one you can't open. A list read once stays read, so no window waits again.
export const RECORD_LISTS = [...ORG_LOADS, 'opportunities', 'accounts', 'contacts', 'tasks', 'activities'];
// A new lead's and the lead import's: their duplicates, and whom the new lead goes to.
export const LEAD_LISTS = [...ORG_LOADS, 'leads', 'contacts', 'users'];
// The team import's, and a document's rails: who is on the team already, and whom a document is shared with — one not read
// sent an invitation again, and named a member "Former member", with an × to take them off.
export const TEAM_LISTS = [...ORG_LOADS, 'users'];
// The lists the windows asked for and not yet drawn wait for — each once; none when nothing asked for waits. The team import
// is a CSV import of users.
export function waitsFor(loads, o) {
    const records = o.showModal || (o.showCsvImportModal && o.csvImportType !== 'users') || o.showActivityModal || o.taskRailId || o.contactRailId || o.accountRailId
        || o.showDocLinkPicker || o.mergeModal || o.contactMergeModal || o.viewingActivity || o.quickLogOpen || (o.meetingPrepOpen && o.meetingPrepEvent);
    const leads = o.showLeadModal || o.showLeadImportModal;
    return [...new Set([
        ...(records && !areRead(loads, RECORD_LISTS) ? RECORD_LISTS : []),
        ...(leads && !areRead(loads, LEAD_LISTS) ? LEAD_LISTS : []),
        ...(((o.showCsvImportModal && o.csvImportType === 'users') || o.documentRailId || o.showUploadRail) && !areRead(loads, TEAM_LISTS) ? TEAM_LISTS : []),
    ])];
}
// The Settings panels that count a list, let a Delete by its count, or write to whom it lists: a team or a territory saved
// or deleted over a team that was not read reached no member of it, and Export wrote a file of none.
export const PANEL_LISTS = {
    pipelines: ['opportunities'], 'funnel-stages': ['opportunities'], 'lead-scoring': ['leads'], 'account-segments': ['accounts'], 'buyer-personas': ['contacts'], industries: ['accounts'],
    users: ['users'], teams: ['users'], territories: ['users'], roles: ['users'], 'approval-tiers': ['users'], automations: ['users'],
};

// ── The state ────────────────────────────────────────────────────────────────
// { org, lists: { [name]: { read, out, error, auth } } } (the lists, and the two of ORG_LOADS) — read: a load landed; out: one is out; error: the latest
// load's words when it failed, kept while the next is out; auth: it was refused as a sign-in no longer valid.
export const NO_LOADS = Object.freeze({ org: null, lists: {} });
const NONE = Object.freeze({ read: false, out: false, error: null, auth: false });

export function loadsReducer(state, ev) {
    // An org's lists were emptied, or its profile put back — a switch, to no org too (App): nothing of it is read.
    if (ev.type === 'reset') return { org: ev.org, lists: {} };
    if (!ev.org) return state;
    // The first load of another org: what is held was the last org's.
    const held = state.org === ev.org ? state : (ev.type === 'begin' ? { org: ev.org, lists: {} } : null);
    if (!held) return state;
    const was = held.lists[ev.name] || NONE;
    const now = ev.type === 'begin' ? { ...was, out: true }
        : ev.type === 'ok' ? { read: true, out: false, error: null, auth: false }
        : { ...was, out: false, error: ev.words || 'It could not be loaded.', auth: !!ev.auth };
    return { org: held.org, lists: { ...held.lists, [ev.name]: now } };
}

// The lists' state as a screen of `org` may read it: nothing of any other org's.
export const loadsOf = (state, org) => (org && state && state.org === org ? state.lists : {});

// ── What a screen asks ───────────────────────────────────────────────────────
const of = (loads, name) => (loads && loads[name]) || NONE;
const inOrder = (names) => Object.keys(LOAD_NAMES).filter(n => names.includes(n));
const listed = (names) => {
    const said = inOrder(names).map(n => LOAD_NAMES[n]);
    return said.length < 2 ? said.join('') : `${said.slice(0, -1).join(', ')} and ${said[said.length - 1]}`;
};
const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);
// Each failure's words once, each ended.
const why = (loads, names) => [...new Set(inOrder(names).map(n => of(loads, n).error).filter(Boolean)
    .map(w => (/[.!?…]$/.test(w.trim()) ? w.trim() : `${w.trim()}.`)))].join(' ');

// The lists a saved report of each source is worked out from (reportQuery.js runReport).
export const REPORT_LISTS = {
    Opportunities: ['opportunities', 'accounts'],
    Accounts: ['accounts', 'opportunities', 'activities'],
    Leads: ['leads'],
    Activity: ['activities', 'opportunities', 'accounts'],
};

// Every one of them was read.
export const areRead = (loads, names) => names.every(n => of(loads, n).read);
// The ones not read, and whether any of those failed.
export const unreadOf = (loads, names) => inOrder(names).filter(n => !of(loads, n).read);
export const failedOf = (loads, names) => inOrder(names).filter(n => !of(loads, n).read && of(loads, n).error);

// What stands in place of "none": '' when every list was read, else why it is not known — the load failed, or has not
// landed yet.
export function unreadWords(loads, names) {
    const failed = failedOf(loads, names);
    if (failed.length) return `${capital(listed(failed))} could not be loaded — ${why(loads, failed)}`;
    const out = unreadOf(loads, names);
    return out.length ? `Loading ${listed(out)}…` : '';
}
// ── The banner ───────────────────────────────────────────────────────────────
// Up while any list's latest load failed; each list leaves it by its own next load that lands. A list read before and
// failed since keeps its rows, which may be out of date. null: nothing to say.
export function loadsBanner(loads) {
    const names = inOrder(Object.keys(loads || {}));
    const failed = names.filter(n => of(loads, n).error);
    if (!failed.length) return null;
    const trying = failed.every(n => of(loads, n).out);
    if (failed.some(n => of(loads, n).auth)) return { tone: 'auth', text: SIGN_IN_WORDS, failed, trying };
    const never = failed.filter(n => !of(loads, n).read);
    const stale = failed.filter(n => of(loads, n).read);
    const said = [];
    if (never.length) said.push(`${capital(listed(never))} could not be loaded.`);
    if (stale.length) said.push(`${capital(listed(stale))} could not be read again — what is shown may be out of date.`);
    said.push(why(loads, failed));
    if (never.length) said.push('Nothing is missing from the server.');
    return { tone: 'outage', text: said.join(' '), failed, trying };
}

// ── The loader ───────────────────────────────────────────────────────────────
// One read of one list. An answer for an org switched away from is dropped (state §0.173), and one a later load of the
// list overtook (§0.207) — neither lands, and neither is reported: it says nothing of what is on screen.
//   name    the list, and its key in the answer        gen     the list's own count of loads (a ref)
//   read    () => the request                          take    sets the rows
//   report  useListLoads' (org, event)                 wait    what to wait for first (the token), if anything
//   pick    what the answer holds, undefined when it holds none of it — the rows under the list's name (the settings
//           are no list: their own, state §0.296)
// Answers { current, error }: whether this load was still the list's when it ended, and its words when it failed.
const rowsOf = (name) => (data) => (Array.isArray(data && data[name]) ? data[name] : undefined);
export async function readList(name, { read, take, gen, report, wait = null, pick = rowsOf(name) }) {
    const askedOrg = requestOrg();
    const mine = ++gen.current;
    const current = () => stillOrg(askedOrg) && gen.current === mine;
    const say = (ev) => { if (report) report({ org: askedOrg, name, ...ev }); };
    say({ type: 'begin' });
    try {
        if (wait) await wait();
        const r = await read();
        if (!current()) return { current: false, error: null };
        if (!r.ok) {
            const words = await readRefusal(r);
            if (!current()) return { current: false, error: null };
            console.error(`Failed to load ${name}:`, words);
            say({ type: 'failed', words, auth: dbStatusOf(r) === 'auth' });
            return { current: true, error: words };
        }
        const data = await r.json();
        if (!current()) return { current: false, error: null };
        // An answer with no list is not an answer of none.
        const rows = pick(data);
        if (rows === undefined) throw new SyntaxError(`no ${name} in the answer`);
        take(rows);
        say({ type: 'ok' });
        return { current: true, error: null };
    } catch (err) {
        if (!current()) return { current: false, error: null };
        console.error(`Failed to load ${name}:`, err);
        const words = failureWords(err);
        say({ type: 'failed', words });
        return { current: true, error: words };
    }
}
