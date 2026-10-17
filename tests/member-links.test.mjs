// tests/member-links.test.mjs
//
// A member's team and pinned reports name this org's, and the restore says what it did (state §0.205 — batch 4b-2c of
// OPEN_ITEMS §1 item 1, "the members and the restore"). Jeff, 15 Oct: "Any of this org's, refuse" — a member's team
// is an entry of THIS org's teams list (settings.extra.teams), each pinned report a saved report of THIS org, any of
// them (a colleague's private one too); anything else is refused, naming the field; a link the row holds is never
// asked again. Pins are the member's own: of the saves, only their own (?me — the Pin) writes them. "Send only what
// changed": the Sales Manager tab's forecast call sends { id, forecastCalls }. "Fix both in 4b-2" (15 Oct) and "Fix
// both" (16 Oct): the restore converts every date column of a table it restores, says how many rows a table could not
// restore, counts as restored only the rows it wrote — the rest said apart as already here — and clears, counted, a
// quote line's unknown product, a member's unknown team (with the date they joined it) and unknown pins. 16 Oct: "Fold
// it in" (the import window shows the restore's answer), "Fix now" (a backup snapshot's id is unique), "No, leave it"
// (a Manager may put a rep on any team of the org — no 403), "Not now, file it" (pins kept as the merge read them).
//
// Before: a member's team and pins were stored as sent — the create, the invitation and the PUT any team, the member's
// own save any pins; an Admin's or a Manager's save wrote the pins it sent; a forecast call re-sent the rep's whole
// cached row. The restore converted six named columns — missing seven, so the app's own backup dropped every member
// who changed team, every approved, sent or accepted quote, every merged account and contact and every scored lead,
// silently — and made a Date of a job's text invoice paid date (refused); it counted the rows it sent as restored;
// refused rows went unsaid; its window closed on its answer. A snapshot's id was the minute alone, a global key.
//
// The review (16 Oct): a row the database never answered for is counted apart — never the file's fault, never already
// here — and said once; the audit row names each table's rows refused or not reached; the clean-up counts a member only
// where its write reaches (a profile stored as an object); only the create drops the pins from its body; a Pin from a
// window whose pin list is stale reads the member's own row again and sends once more; the import window shows a refused
// restore's errors one per line, is inert while the restore runs, says when no answer is the restore's own that records
// may have been written, and reloads the page on Close once records were restored.
//
// The second fix round (16 Oct): a row is refused only for a data error — a SQLSTATE of class 22 or 23 — or a value
// the driver cannot encode; any other code (a timeout, a connection, the database's own state) is not reached, its rows
// said to be ones that "may not have been written"; the import window shows any answer not the restore's own in the
// server's words, with its log ref, says a function crash may have written records, and reloads the page on Close
// wherever records may have been written — and says so; a Pin with no answer says to reload and see.
//
// The re-check (16 Oct): the restore's answer counts its rows not reached (unreached), and the import window takes any
// as records that may have been written — refused (a 500) or not — so Close reloads the page, and the window says so;
// the rows not reached are said only as known — the database did not answer, or did not take them for a reason of its
// own; an org switch while a stale Pin's PUT is refused reads nothing more.
//
// Run here, on made-up data: the words; users.mjs's two specs, read from its file and run through linkIds.js's
// decisions; the clean-up's helpers (lineProductsCleared, memberLinksCleared); backup.mjs's dateKeysOf against
// drizzle's own column classes (a made-up table — no schema import), its stamp and its words, each taken from the file
// and run as written; the restore's clean-up — _links.mjs's own clearLineProducts and clearMemberLinks — and
// backup.mjs's sayRefused, each taken from its file and run on made-up rows; a backup snapshot's id, minted; backup.mjs's
// isRefusal on the errors drizzle's own neon-http driver throws, and its row fallback, words, status and audit on the
// driver's answers (a made-up fetch — no network, no database); ReportsTab.jsx's togglePin and BackupDetail.jsx's
// handleImport and close, each taken from its file and run on made-up answers. Pinned, line for line: every line the
// mutation harness breaks — it runs the unit suites only (scripts/mutate-import.mjs). Each test's title begins with its
// label (T1-T15: design-4b2c.md, its amendment and the review), as the harness and these tests cite it.
// tests/integration/member-links.itest.mjs proves the server's side of each against the test database
// (itest_mlinks_A/B).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { pgTable, text, varchar, timestamp, date, jsonb } from 'drizzle-orm/pg-core';
import { getTableColumns } from 'drizzle-orm';
// drizzle's own neon-http driver, on a made-up fetch (T13 — no network, no database): the errors a restore's row
// fallback reads are the driver's own.
import { drizzle } from 'drizzle-orm/neon-http';
import { neon, neonConfig } from '@neondatabase/serverless';
import { NOUNS, MERGES, notInOrg, NOT_AN_ID, linksAsked, linksDecided, productIdsOf, lineProductsCleared, memberLinksCleared } from '../src/utils/linkIds.js';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8').replace(/\r\n/g, '\n');
// The code a pin reads: whole-line comments dropped, so a comment quoting a line never stands in for it.
const code = (src) => src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
const fn = (name) => code(read(`netlify/functions/${name}.mjs`));
// From `from` to the first `to` after it, both included — each there.
const between = (s, from, to) => {
    const a = s.indexOf(from);
    assert.ok(a >= 0, `missing: ${from}`);
    const b = s.indexOf(to, a + from.length);
    assert.ok(b > a, `missing after it: ${to}`);
    return s.slice(a, b + to.length);
};
// Each a WHOLE line of s, each after the one before it: a line changed, gone or moved fails it.
const order = (s, ...lines) => {
    const t = `\n${s}\n`;
    let at = 0;
    for (const line of lines) {
        const i = t.indexOf(`\n${line}\n`, at);
        assert.ok(i >= 0, `missing, changed or out of order: ${line.trim()}`);
        at = i + 1 + line.length;   // the newline that ends it begins the next
    }
};
// A whole line of s, exactly once.
const once = (s, line, why) => assert.equal(s.split('\n').filter((l) => l === line).length, 1, why || `once, as a whole line: ${line.trim()}`);
const ind = (n, line) => ' '.repeat(n) + line;
// A check's refusal, answered whole: its status, its words and its field reach the screen.
const ONE = (v) => `if (${v}.error) return { statusCode: ${v}.status, headers, body: JSON.stringify({ error: ${v}.error, field: ${v}.field }) };`;
// An endpoint's own spec: pinned as its whole line, then run as written.
const specOf = (file, line) => {
    once(fn(file), line, `${file}: its links, as one line`);
    const name = line.match(/^const (\w+) = /)[1];
    return new Function(`${line}\nreturn ${name};`)();
};

// users.mjs's two specs, as it writes them (design §4.2).
const TEAM_SPEC = "const TEAM_LINK = [{ key: 'teamId', kind: 'team' }];";
const PIN_SPEC = "const PIN_LINKS = [{ key: 'pinnedReports', kind: 'report', shape: 'many' }];";

// Org A's teams and saved reports: tm_east and tm_west entries of its teams list; rep_karen (Karen's), rep_ravi_private
// (a colleague's private one) and rep_shared its saved reports. Org B's (tm_b, rep_b), an old plain-text team
// ('Legacy') and anything removed or deleted since (…_gone) are none of them.
const LIVE = { team: ['tm_east', 'tm_west'], report: ['rep_karen', 'rep_ravi_private', 'rep_shared'] };
const liveOf = (ask) => new Map((LIVE[ask.kind] || []).map((id) => [id, id]));
const one = (spec, data, stored) => {
    const asked = linksAsked(spec, data, stored);
    return asked.error ? asked : linksDecided(asked.asks, data, liveOf);
};

// ── the words and the specs — run ───────────────────────────────────────────

test("T1 — the words name a member's two kinds — a team, a saved report — and neither is ever merged away (state §0.205)", () => {
    assert.equal(notInOrg('team'), 'That team is not in your organization — pick one from the list.');
    assert.equal(notInOrg('report'), 'That saved report is not in your organization — pick one from the list.');
    assert.deepEqual(Object.keys(NOUNS).slice(-2), ['team', 'report'], "after a sales record's three (§0.204)");
    for (const kind of ['team', 'report']) assert.ok(!MERGES.includes(kind), `${kind}: never merged away — stored as sent`);
});

test("T2 — a member's team (users.mjs's TEAM_LINK, run — Jeff, 15 Oct: \"Any of this org's, refuse\"): an entry of this org's teams list; another org's, an old plain-text team or one naming nothing refused 404 naming the field, a team that is no text 400; the team the row holds is never asked again, one removed since too; an empty team clears; a forecast call names no team", () => {
    const TEAM = specOf('users', TEAM_SPEC);
    assert.deepEqual(one(TEAM, { teamId: 'tm_west' }, null), { set: {} }, "the org's own: stored as sent");
    assert.deepEqual(one(TEAM, { teamId: 'tm_b' }, null), { status: 404, error: notInOrg('team'), field: 'teamId' }, "org B's team");
    assert.deepEqual(one(TEAM, { teamId: 'Legacy' }, null), { status: 404, error: notInOrg('team'), field: 'teamId' }, 'a plain-text team (an old one: no id) names nothing');
    assert.deepEqual(one(TEAM, { teamId: 7 }, null), { status: 400, error: NOT_AN_ID, field: 'teamId' }, 'not an id');
    assert.deepEqual(linksAsked(TEAM, { teamId: 'tm_gone' }, { teamId: 'tm_gone' }), { asks: [] }, 'the team the row holds, re-sent: never asked again (a team removed since stands)');
    assert.deepEqual(one(TEAM, { teamId: 'tm_b' }, { teamId: 'tm_gone' }), { status: 404, error: notInOrg('team'), field: 'teamId' }, 'a team named anew over a held one is asked');
    assert.deepEqual(linksAsked(TEAM, { teamId: '' }, { teamId: 'tm_east' }), { asks: [] }, "an empty team clears — the Teams page's delete sends teamId ''");
    assert.deepEqual(linksAsked(TEAM, { forecastCalls: { '2026-Q4': { commit: 1 } } }, { teamId: 'tm_gone' }), { asks: [] }, 'a forecast call names no team: nothing asked');
});

test("T3 — a member's pins (users.mjs's PIN_LINKS, run — Jeff, 15 Oct: \"Any of this org's, refuse\"): any saved report of this org, a colleague's private one too; another org's, or one naming nothing, refused 404 naming the field; pins that are no list, or a pin that is no text, 400; the pins the row holds are never asked again; none, or an empty list, unpins every pin", () => {
    const PIN = specOf('users', PIN_SPEC);
    assert.deepEqual(one(PIN, { pinnedReports: ['rep_karen', 'rep_ravi_private', 'rep_shared'] }, null), { set: {} }, "a colleague's private report counts — which one a viewer may open is the reader's");
    assert.deepEqual(one(PIN, { pinnedReports: ['rep_karen', 'rep_b'] }, { pinnedReports: ['rep_karen'] }), { status: 404, error: notInOrg('report'), field: 'pinnedReports' }, "org B's report");
    assert.deepEqual(one(PIN, { pinnedReports: ['rep_gone'] }, { pinnedReports: [] }), { status: 404, error: notInOrg('report'), field: 'pinnedReports' }, 'a report deleted, pinned anew');
    assert.deepEqual(linksAsked(PIN, { pinnedReports: ['rep_gone', 'rep_shared'] }, { pinnedReports: ['rep_gone'] }).asks.map((a) => a.fresh), [['rep_shared']],
        'only the pin named anew is asked — one the row holds whose report was deleted since stands');
    assert.deepEqual(one(PIN, { pinnedReports: 'rep_karen' }, null), { status: 400, error: NOT_AN_ID, field: 'pinnedReports' }, 'not a list');
    assert.deepEqual(one(PIN, { pinnedReports: ['rep_karen', 7] }, null), { status: 400, error: NOT_AN_ID, field: 'pinnedReports' }, 'a pin that is no id');
    assert.deepEqual(one(PIN, { pinnedReports: [] }, { pinnedReports: ['rep_gone'] }), { set: {} }, 'every pin unpinned');
    assert.deepEqual(one(PIN, { pinnedReports: null }, null), { set: {} }, 'none');
});

// ── the restore's clean-up: the helpers that decide it — run ────────────────

test("T4 — the restore's clean-up decides through two pure helpers (linkIds.js — state §0.205, run on made-up data): a quote line's product that names no product of this org is cleared, the line and its other keys kept; a member's team that names no team of this org is cleared, and each pin that names no saved report of it dropped, the rest in their order — nothing else in the patch", () => {
    const input = [{ productId: 'p1', qty: 2 }, { productId: 'p_b', productName: 'Widget', listPrice: 10, quantity: 3 }, { description: 'Custom', unitPrice: 5 }, { productId: '' }, { productId: 7 }, null, 'x'];
    const copy = JSON.parse(JSON.stringify(input));
    assert.deepEqual(lineProductsCleared(input, new Map([['p1', 'p1']])), {
        lines: [{ productId: 'p1', qty: 2 }, { productId: null, productName: 'Widget', listPrice: 10, quantity: 3 }, { description: 'Custom', unitPrice: 5 }, { productId: '' }, { productId: null }, null, 'x'],
        cleared: 2,
    }, "org B's product and one that is no id cleared; a custom line, an empty product, a line that is no object kept as filed");
    assert.deepEqual(input, copy, 'a new list is written — the lines read are never changed');
    for (const notList of [null, undefined, '', 'x', { productId: 'p_b' }]) {
        assert.deepEqual(lineProductsCleared(notList, new Map()), { lines: notList, cleared: 0 }, `lines that are no list are left as they are: ${JSON.stringify(notList)}`);
    }

    const teams = new Map([['tm_east', 'tm_east']]);
    const reports = new Map([['rep_a', 'rep_a'], ['rep_c', 'rep_c']]);
    assert.deepEqual(memberLinksCleared({ teamId: 'tm_b', team: 'B Team', pinnedReports: ['rep_a', 'rep_b', '', null, 'rep_c', 7], quotaPlans: { 2026: { annual: 1 } } }, teams, reports),
        { patch: { teamId: null, pinnedReports: ['rep_a', '', null, 'rep_c'] }, cleared: 3 },
        "the team and two pins, one each — the team's name and the quota plans are not the clean-up's (B17)");
    assert.deepEqual(memberLinksCleared({ teamId: 'tm_east', pinnedReports: ['rep_a'] }, teams, reports), { patch: {}, cleared: 0 }, 'all of this org: nothing to write');
    assert.deepEqual(memberLinksCleared({ teamId: 7 }, teams, reports), { patch: { teamId: null }, cleared: 1 }, 'a team that is no text is cleared');
    assert.deepEqual(memberLinksCleared({ teamId: '', pinnedReports: 'rep_b' }, teams, reports), { patch: {}, cleared: 0 },
        'an empty team names nothing; pins that are no list are left as they are (every reader reads them as none)');
    for (const notProfile of [null, undefined, 'x', ['tm_b'], 7]) {
        assert.deepEqual(memberLinksCleared(notProfile, teams, reports), { patch: {}, cleared: 0 }, `a profile that is no object is left as it is: ${JSON.stringify(notProfile)}`);
    }
});

// ── users.mjs: where each is asked — pinned ─────────────────────────────────

test("T5 — users.mjs: a member's team is asked where a write names one anew — the create, a new member's invitation (before Clerk is called; a row removed mid-batch stores only a team the batch's read found), the PUT over the stored team; the pins on the member's own save over the stored pins; a create stores none, and an Admin's or a Manager's save keeps the stored ones — on the row it builds, never by dropping them from its body, which would make { id, active, pinnedReports } a Deactivate (the lines the harness breaks)", () => {
    const u = fn('users');
    once(u, "import { checkLinks, liveIdsInOrg } from './_links.mjs';");
    once(u, "import { notInOrg, NOT_AN_ID } from '../../src/utils/linkIds.js';");
    once(u, TEAM_SPEC);
    once(u, PIN_SPEC);
    // The create: no quota keys, no pins; the name decided, then the team asked — before the write.
    order(between(u, "            const createRole = data.userType || data.role || 'User';", "        if (event.httpMethod === 'PUT' && event.queryStringParameters?.quotas === 'true') {"),
        ind(16, 'for (const k of QUOTA_KEYS) delete data[k];'), ind(16, 'delete data.pinnedReports;'),
        ind(16, 'const clean = withRole(sanitize({ ...data, status: null, active: true, id: newUserId(), clerkUserId: null }), createRole);'),
        ind(16, 'if (newNameTaken) return nameTaken(newNameTaken);'), ind(16, 'const teamed = await checkLinks(TEAM_LINK, data, null, orgId);'),
        ind(16, ONE('teamed')), ind(16, 'const result = await upsertUser(clean);'));
    // The invitation: the batch's teams read once; a new member's team refused before Clerk is called; the race's store
    // asks the same read.
    order(between(u, "            if (data.action === 'invite') {", "            const createRole = data.userType || data.role || 'User';"),
        ind(16, 'const roster = await memberNamesOf(orgId);'), ind(16, "const liveTeams = await liveIdsInOrg('team', invites.map((i) => i?.teamId), orgId);"),
        ind(16, 'for (const invite of invites) {'), ind(20, 'if (newRow && !rowName) { errors.push({ email, error: nameTakenMessage(givenName || localPart) }); continue; }'),
        ind(20, "if (newRow && invite.teamId != null && invite.teamId !== '') {"),
        ind(24, "if (typeof invite.teamId !== 'string') { errors.push({ email, error: NOT_AN_ID, field: 'teamId' }); continue; }"),
        ind(24, "if (!liveTeams.has(invite.teamId)) { errors.push({ email, error: notInOrg('team'), field: 'teamId' }); continue; }"),
        ind(20, "if (userRole !== 'Admin') {"), ind(20, 'try {'), ind(24, 'await clerk.organizations.createOrganizationInvitation({'),
        ind(32, "teamId:    (typeof invite.teamId === 'string' && liveTeams.has(invite.teamId)) ? invite.teamId : null,"));
    // The PUT: the stored pins kept on the built row; the team asked over the STORED team, after the access branch.
    order(between(u, "        if (event.httpMethod === 'PUT') {", "        if (event.httpMethod === 'DELETE') {"),
        ind(16, 'if (before && prevTeam !== nextTeam) clean.teamJoinedAt = nextTeam ? new Date() : null;'),
        ind(16, 'clean.profile = { ...clean.profile, pinnedReports: Array.isArray(before?.profile?.pinnedReports) ? before.profile.pinnedReports : null };'),
        ind(16, 'if (before && wasActive !== nowActive) {'), ind(20, "clean.profile = { ...clean.profile, status: nowActive ? (before.clerkUserId ? 'Active' : 'Invited') : 'Deactivated' };"),
        ind(16, 'const teamed = await checkLinks(TEAM_LINK, data, { teamId: before?.profile?.teamId ?? null }, orgId);'),
        ind(16, ONE('teamed')), ind(16, 'const putNameTaken = nameRefusal(await memberNamesOf(orgId), clean.name, data.id);'),
        ind(16, 'const result = await upsertUser(clean, { updateOnly: true });'));
    assert.ok(!u.includes('put a member on a team'), "D7(a)'s dropped refusal words are not built in — the rule itself (a Manager may put a rep on any team of the org, no 403: Jeff, 16 Oct, \"No, leave it\") is tests/integration/member-links.itest.mjs's \"CREATE (Manager): any team of this org's list stands\" and \"PUT (Manager): a rep's team of this org stands\"");
    // The stored pins are kept on the row the PUT builds, never by dropping them from the body (the review): only the
    // create drops them — a PUT that did would make an Admin's { id, active, pinnedReports } the Deactivate request
    // (isAccessChange reads the body's keys).
    assert.equal(u.split('\n').filter((l) => l.trim() === 'delete data.pinnedReports;').length, 1,
        "REGRESSION: a PUT drops the pins from its body — an Admin's { id, active, pinnedReports } deactivates the member");
    // The member's own save: a pin named anew asked over the pins the row holds, read in the org, before the write.
    order(between(u, 'const own  = { id: data.id, ...pickSelfEditable(data) };', 'invalidateRoster(orgId);'),
        ind(12, 'const clean = withRole(sanitize({ ...(await mergeForUpdate(own)), userType: storedRole }), storedRole);'),
        ind(12, "if ('pinnedReports' in own) {"),
        ind(16, 'const [stored] = await db.select({ profile: users.profile }).from(users).where(and(eq(users.orgId, orgId), eq(users.id, data.id)));'),
        ind(16, 'const pinned = await checkLinks(PIN_LINKS, own, { pinnedReports: stored?.profile?.pinnedReports ?? null }, orgId);'),
        ind(16, ONE('pinned')), ind(12, '}'), ind(12, 'const selfNameTaken = nameRefusal(await memberNamesOf(orgId), clean.name, data.id);'));
});

// ── the screens — pinned ────────────────────────────────────────────────────

test("T6 — the screens (state §0.205): a forecast call sends only its field — { id, forecastCalls } — its refusal naming the rep from the tab's copy (Jeff: \"Send only what changed\"); the member profile page sends no pins; the import window stays open on the restore's answer — closed neither by the page that opens it nor from inside — shows a refused restore's errors one per line, as an accepted one's, shows any other answer the server gave in words in those words, with its log ref, says the restore may have written records when no answer came, the function crashed or the restore's own answer counts rows not reached, is inert while the restore runs, reloads the page on Close once records were restored or may have been — and says so — and says what it does with a record already here (Jeff, 16 Oct: \"Fold it in\"; the review, the second fix round and the re-check — T15 runs it)", () => {
    const m = code(read('src/Tabs/SalesManagerTab.jsx'));
    once(m, ind(4, 'const saveUser = async (user, label, who = user.name) => {'));
    once(m, ind(20, '? `Not saved \\u2014 ${who || \'a member\'}: ${d.error}`'));
    assert.ok(!m.includes("${user.name || 'a member'}"), 'the refusal names the rep from the tab, not from the body sent');
    const upd = between(m, '    const updateRepField = async (userId, field, value) => {', '\n    };');
    order(upd, ind(8, 'const rep = (settings.users || []).find(u => u.id === userId);'), ind(8, 'if (!rep) return false;'),
        ind(8, "if (!await saveUser({ id: userId, [field]: value }, 'forecast call', rep.name)) return false;"), ind(8, 'if (!stillOrg(askedOrg)) return false;'));
    assert.ok(!upd.includes('...rep'), "REGRESSION: the rep's whole cached row — an old team, a stale name, pins — put back");

    const s = code(read('src/Tabs/settings/people/UsersDetail.jsx'));
    once(s, ind(12, 'const { active: _active, status: _status, clerkUserId: _login, pinnedReports: _pins, ...edited } = form;'));

    const bd = code(read('src/Tabs/settings/data/BackupDetail.jsx'));
    once(bd, ind(12, '{showImport  && <ImportBackupModal onClose={()=>setShowImport(false)}/>}'));
    assert.ok(!bd.includes('setShowImport(false); }}'), 'REGRESSION: the window closes on its answer — nothing the restore says is read');
    // Nor from inside (the review): its answer is set, and nothing closes the window after it.
    assert.ok(!between(bd, '    const handleImport = async () => {', '\n    };').includes('onClose'), 'REGRESSION: the window closes on its answer from inside — nothing the restore says is read');
    // No answer, or one that is not the restore's own and has no words, is no answer: the restore may have written
    // records (the review). Any other the server gave in words is said in them, with its log ref; a function crash's
    // also says the restore may have written records; so does the restore's own answer counting rows not reached,
    // refused or not (the re-check); where records may have been written, closing the window reloads the page — kept
    // once set, and said (the second fix round; T15 runs each).
    once(bd, "const NO_ANSWER = 'No answer from the server — the restore may have written records. Run the file again: a record already here is left as it is, never written twice.';");
    order(bd, "const saidBy = (d) => (d && typeof d === 'object' && !('imported' in d) && !('errors' in d) && typeof d.error === 'string' && d.error",
        ind(4, "? `${d.error}${d.requestId ? ` (ref ${d.requestId})` : ''}` : '');"),
        "const crashedWords = (said) => `${said} — the restore may have written records. Run the file again: a record already here is left as it is, never written twice.`;",
        'const ImportBackupModal = ({ onClose, onSuccess }) => {', ind(4, 'const [mayHaveWritten, setMayHaveWritten] = useState(false);'));
    assert.ok(!bd.includes('setMayHaveWritten(false)'), 'REGRESSION: a later run unsets it — Close after it leaves the page stale, records an earlier run may have written unseen');
    once(bd, ind(12, 'data = await res.json().catch(() => null);   // an answer that is no JSON is no answer (state §0.205)'));
    order(between(bd, '    const handleImport = async () => {', '\n    };'), ind(8, 'const said = saidBy(data);'),
        ind(8, "if (typeof data?.imported !== 'number' && !said) { setMayHaveWritten(true); setError(NO_ANSWER); return; }"),
        ind(8, 'if (said && res.status >= 500 && data.requestId) { setMayHaveWritten(true); setError(crashedWords(said)); return; }'),
        ind(8, 'if (said) { setError(said); return; }'),
        ind(8, 'if (data.unreached > 0) setMayHaveWritten(true);'),
        ind(8, "if (!res.ok) { setError(data.error || (Array.isArray(data.errors) && data.errors.length ? `Import failed — ${data.errors.join('\\n')}` : 'Import failed')); return; }"));
    assert.ok(!bd.includes('res.status < 500'), 'REGRESSION: any answer of 500 or more read as no answer — verifyAuth\'s 503 or 500 said "may have written records", its words lost');
    // A refused restore's errors, one per line as an accepted one's (the review: they ran together on one line).
    once(bd, ind(8, "if (!res.ok) { setError(data.error || (Array.isArray(data.errors) && data.errors.length ? `Import failed — ${data.errors.join('\\n')}` : 'Import failed')); return; }"));
    once(bd, ind(28, "<div style={{ fontSize:12.5, color:T.danger, fontWeight:600, marginBottom:8, whiteSpace:'pre-line' }}>"));
    // Inert while the restore runs; once records are restored — or may have been: no answer, a crash's, or rows not
    // reached — Close reloads the page (the review; the second fix round; the re-check), and the window says so.
    once(bd, ind(4, 'const close = loading ? () => {} : result?.imported > 0 || mayHaveWritten ? () => window.location.reload() : onClose;'));
    order(bd, ind(24, '{mayHaveWritten && ('), ind(32, 'The page reloads when this window closes, so every screen shows what the restore wrote.'));
    order(bd, ind(24, '{(result.imported > 0 || mayHaveWritten) && ('), ind(32, 'The page reloads on Close, so every screen shows what was restored.'));
    once(bd, ind(8, '<DataModal width={520} onClose={close}>'));
    once(bd, ind(12, '<DataModalHead onClose={close}'));
    once(bd, ind(16, "<DataBtn label={result ? 'Close' : 'Cancel'} onClick={close} disabled={loading}/>"));
    assert.ok(!/=\{onClose\}/.test(between(bd, 'const ImportBackupModal = ', 'const RestoreModal = ')), 'REGRESSION: a close control of the import window calls onClose itself — live while the restore runs, and no reload after it');
    once(bd, ind(32, 'The page reloads on Close, so every screen shows what was restored.'));
    assert.ok(bd.includes('A record already here — the same id, or a detail only one record may have, such as a number, an email or a login — is left as it is.') && !bd.includes('will be updated'));
    once(bd, ind(32, '{result.errors.map((e, i) => <div key={i}>{e}</div>)}'));
});

// ── backup.mjs: the restore — run as written, and pinned ────────────────────

test("T7 — the restore's dates, by the table's own columns, run against drizzle's own column classes (state §0.205 — B15, B22): a mode-less timestamp and a date({ mode: 'date' }) are made Dates; a text column holding a date, a string-mode timestamp and a plain date() stay text; '' or text that is no date is left to the column — its default, or none; a number is left (refused, and said)", () => {
    const b = fn('backup');
    const DK = b.split('\n').find((l) => l.startsWith('const dateKeysOf = '));
    assert.equal(DK, "const dateKeysOf = (table) => Object.entries(getTableColumns(table)).filter(([, c]) => c.dataType === 'date').map(([k]) => k);");
    const dateKeysOf = new Function('getTableColumns', `${DK}\nreturn dateKeysOf;`)(getTableColumns);
    const T = pgTable('made_up', {
        id: text('id').primaryKey(), joinedAt: timestamp('joined_at'), createdAt: timestamp('created_at').notNull().defaultNow(),
        invoicePaidAt: varchar('invoice_paid_at', { length: 20 }), stampText: timestamp('stamp_text', { mode: 'string' }),
        day: date('day'), dayAsDate: date('day_as_date', { mode: 'date' }), notes: text('notes'), tags: jsonb('tags'),
    });
    assert.deepEqual(dateKeysOf(T), ['joinedAt', 'createdAt', 'dayAsDate'],
        "exactly the columns whose write calls toISOString — a text column holding a date (a job's invoice paid date), a string-mode timestamp and a plain date() are text to the driver");
    assert.ok(!b.includes('TIMESTAMP_KEYS'), 'no list of names');
    once(b, "import { eq, and, desc, getTableColumns } from 'drizzle-orm';");
    const src = between(b, '            const JSONB_KEYS = new Set([', '\n            });');
    const stamp = new Function('orgId', 'dateKeysOf', `${src}\nreturn stamp;`)('org_A', dateKeysOf);
    const [r1, r2, r3] = stamp(T, [
        { id: 'r1', orgId: 'org_B', joinedAt: '2026-08-15T00:00:00.000Z', createdAt: '', invoicePaidAt: '2026-10-01', stampText: '2026-10-01 10:00:00', day: '2026-10-01', dayAsDate: 'not a date', notes: 'x' },
        { id: 'r2', joinedAt: null, createdAt: 1696118400000 },
        { id: 'r3', joinedAt: '' },
    ]);
    assert.equal(r1.orgId, 'org_A', "the file's org is never kept");
    assert.ok(r1.joinedAt instanceof Date && r1.joinedAt.toISOString() === '2026-08-15T00:00:00.000Z', "a date column's text is a Date");
    assert.equal(r1.createdAt, undefined, "'' is left to the column: a NOT NULL one with a default takes it — drizzle writes `default` only for undefined; an explicit null is refused (L1)");
    assert.equal(r3.joinedAt, undefined, "'' in a nullable column: none");
    assert.equal(r1.invoicePaidAt, '2026-10-01', 'a text column holding a date stays text');
    assert.equal(r1.stampText, '2026-10-01 10:00:00');
    assert.equal(r1.day, '2026-10-01');
    assert.equal(r1.dayAsDate, undefined, 'text that is no date is left to the column');
    assert.equal(r2.joinedAt, null, 'null stays null');
    assert.equal(r2.createdAt, 1696118400000, 'a number is left — the insert refuses it, and it is counted and said');
    once(b, ind(12, 'const stamp = (table, rows) => (rows || []).map(r => {'));
    once(b, ind(16, 'dateKeysOf(table).forEach(k => {'));
    once(b, ind(20, "if (typeof out[k] === 'string') {"));
    once(b, ind(24, 'out[k] = isNaN(d.getTime()) ? undefined : d;'));
    once(b, ind(16, 'const stamped = stamp(table, rows);'));
});

test("T8 — the restore says what it did not write (state §0.205 — Jeff, 15 Oct: \"Fix both in 4b-2\"; 16 Oct: \"Fix both\"): a table's refused rows, by the table, counted — never the rows sent, the driver's words to the log only; a row not reached — the database did not answer for it, or did not take it for a reason of its own — counted apart, never refused, never already here (the review and the re-check — T13 runs it); the file's rows already here said apart, never which org holds one; \"records restored\", the snapshot's count and the log count only the rows written; a 500 only for a restore that wrote nothing, found nothing already here and met an error; once members land, this function's own roster and caller caches are dropped (_lib.mjs: after any write of users in a request — another warm function's 30-second roster still misses them until it expires)", () => {
    const b = fn('backup');
    const W = between(b, 'const refusedWords = (label, n) => ', 'were left as they are.`);');
    const { refusedWords, alreadyWords } = new Function(`${W}\nreturn { refusedWords, alreadyWords };`)();
    assert.equal(refusedWords('products', 1), 'products: 1 record could not be restored — it has a value that cannot be stored, or lacks one that is required.');
    assert.equal(refusedWords('dispatch.jobs', 2), 'dispatch.jobs: 2 records could not be restored — each has a value that cannot be stored, or lacks one that is required.');
    assert.equal(alreadyWords(1), '1 record in the file was already here — a record holds the same id, or a detail only one record may have, such as a number, an email or a login — and was left as it is.');
    assert.equal(alreadyWords(11), '11 records in the file were already here — for each, a record holds the same id, or a detail only one record may have, such as a number, an email or a login — and were left as they are.');
    assert.ok(!/organi[sz]ation/.test(alreadyWords(2)), 'never which org holds it: ids are global');
    // The insert answers the rows it wrote, and only those count; a row the database refuses is counted apart.
    order(between(b, '            const keepRestored = (table, rows) => {', '\n            };'),
        ind(16, 'for (const r of rows || []) if (r && r.id) ids.push(r.id);'), ind(16, 'restored.set(table, ids);'), ind(16, 'return (rows || []).length;'));
    // A row the database never answered for is counted apart (isRefusal — the review): never refused, never already here.
    order(between(b, '            async function upsertChunked(table, rows) {', '\n            }\n'),
        ind(16, 'const stamped = stamp(table, rows);'), ind(16, 'let refused = 0;'), ind(16, 'let unreached = 0;'),
        ind(24, 'count += keepRestored(table, await db.insert(table).values(chunk).onConflictDoNothing().returning({ id: table.id }));'),
        ind(32, 'count += keepRestored(table, await db.insert(table).values(row).onConflictDoNothing().returning({ id: table.id }));'),
        ind(28, '} catch (e) {'), ind(32, 'if (!isRefusal(e)) {'), ind(36, 'unreached++;'),
        ind(36, 'if (!firstMiss.has(table)) firstMiss.set(table, e?.cause?.message || e?.message);'), ind(36, 'continue;'), ind(32, '}'),
        ind(32, 'refused++;'), ind(32, 'if (!firstCause.has(table)) firstCause.set(table, e?.cause?.message || e?.message);'),
        ind(16, 'tally.set(table, { sent: stamped.length, written: count, refused, unreached });'), ind(16, 'return count;'));
    assert.ok(!b.includes('count += chunk.length;') && !b.includes('count++;'), 'REGRESSION: the rows sent counted — a re-run read "N records restored"');
    // Said after every table, before the clean-up: each CRM and Dispatch table's refused rows, the roster, the rows the
    // database never answered for, the rows already here.
    order(b, ind(16, 'errs.push(refusedWords(label, n));'), ind(16, 'sayRefused(key, table);'), ind(12, 'if (Array.isArray(ents.users) && ents.users.length) invalidateRoster(orgId);'),
        ind(20, 'sayRefused(`dispatch.${key}`, table);'), ind(12, 'const missed = [...tally.values()].reduce((n, t) => n + t.unreached, 0);'),
        ind(12, 'if (missed) errs.push(unreachedWords(missed));'),
        ind(12, 'const already = [...tally.values()].reduce((n, t) => n + t.sent - t.written - t.refused - t.unreached, 0);'),
        ind(12, 'if (already) notes.push(alreadyWords(already));'), ind(12, 'let swept = null;'));
    once(b, "import { invalidateRoster } from './_lib.mjs';");
    once(b, ind(16, 'statusCode: errs.length && imported === 0 && !already ? 500 : 200,'));
    assert.ok(b.includes("${already ? ` · ${already} already here` : ''}"), 'the log says them too');
    // sayRefused, run as written (F1): a table with no row refused says nothing; one with rows refused says them by
    // its label, the count of rows refused — never the rows sent; the driver's words go to the log only.
    const SR = between(b, '            const sayRefused = (label, table) => {', '\n            };');
    const errs = [];
    const warned = [];
    const notWritten = [];
    const tally = new Map([['t_ok', { sent: 3, written: 3, refused: 0, unreached: 0 }], ['t_bad', { sent: 5, written: 3, refused: 2, unreached: 0 }]]);
    const firstCause = new Map([['t_bad', 'null value in column "list_price"']]);
    const sayRefused = new Function('tally', 'firstCause', 'firstMiss', 'errs', 'refusedWords', 'notWritten', 'console', `${SR}\nreturn sayRefused;`)(
        tally, firstCause, new Map(), errs, refusedWords, notWritten, { warn: (...a) => warned.push(a) });
    sayRefused('products', 't_ok');
    sayRefused('users', 't_none');
    assert.deepEqual([errs, notWritten], [[], []], 'a table with no row refused, or none sent, says nothing');
    sayRefused('dispatch.jobs', 't_bad');
    assert.deepEqual(errs, [refusedWords('dispatch.jobs', 2)], 'the rows refused — 2 — never the 5 sent');
    assert.deepEqual(warned, [['backup: rows refused', 'dispatch.jobs', 2, 'null value in column "list_price"']], "the driver's words, to the log only");
    assert.deepEqual(notWritten, [{ label: 'dispatch.jobs', refused: 2, unreached: 0 }], 'kept for the audit row, by its table (T13)');
});

// ── _links.mjs: the restore's clean-up — pinned, then run ───────────────────

test("T9 — the restore's clean-up, pinned (_links.mjs — state §0.205): a quote line's product and a member's team and pins are cleared after the shelf and before the required links are counted; each reads only this org's restored rows, decides through its helper, writes each row in this org in one batch, and names its field when it fails; a cleared team clears the date they joined it; a member is counted only where the write reaches — a profile stored as an object, its stored kind read with it (the review)", () => {
    const l = fn('_links');
    once(l, "import { productIdsOf, lineProductsCleared, memberLinksCleared } from '../../src/utils/linkIds.js';");
    order(between(l, 'export async function clearStrayLinks(orgId, restored) {', '\n}\n'), ind(12, 'shelfFailed = true;'),
        ind(4, 'cleared += await clearLineProducts(orgId, restored, failed);'), ind(4, 'cleared += await clearMemberLinks(orgId, restored, failed);'),
        ind(4, "const jobsWithoutCustomer = await countRequired(orgId, restored, dispatchJobs, 'customerId', dispatchCustomers, failed);"));
    const lines = between(l, 'async function clearLineProducts(orgId, restored, failed) {', '\n}\n');
    order(lines, ind(4, 'const ids = (restored && restored.get(quotes)) || [];'), ind(4, 'if (!ids.length) return 0;'),
        ind(12, '.where(and(eq(quotes.orgId, orgId), inArray(quotes.id, ids)));'), ind(12, 'const done = lineProductsCleared(q.lineItems, live);'),
        ind(12, 'writes.push(db.update(quotes).set({ lineItems: done.lines }).where(and(eq(quotes.orgId, orgId), eq(quotes.id, q.id))));'),
        ind(8, 'if (writes.length) await db.batch(writes);'), ind(8, "failed.push('quotes.lineItems');"));
    const mem = between(l, 'async function clearMemberLinks(orgId, restored, failed) {', '\n}\n');
    order(mem, ind(4, 'const ids = (restored && restored.get(users)) || [];'),
        ind(8, "const held = await db.select({ id: users.id, profile: users.profile, kind: sql`jsonb_typeof(${users.profile})` }).from(users)"),
        ind(12, '.where(and(eq(users.orgId, orgId), inArray(users.id, ids)));'),
        ind(8, "const teams = await liveIdsInOrg('team', held.map((m) => own(m.profile).teamId), orgId);"),
        ind(8, 'for (const m of held) {'), ind(12, "if (m.kind !== 'object') continue;"),
        ind(12, 'const done = memberLinksCleared(m.profile, teams, reports);'),
        ind(16, "profile: sql`coalesce(${users.profile}, '{}'::jsonb) || ${JSON.stringify(done.patch)}::jsonb`,"),
        ind(16, "teamJoinedAt: 'teamId' in done.patch ? null : sql`${users.teamJoinedAt}`,"),
        ind(12, "}).where(and(eq(users.orgId, orgId), eq(users.id, m.id), sql`jsonb_typeof(${users.profile}) = 'object'`)));"),
        ind(8, 'if (writes.length) await db.batch(writes);'), ind(8, "failed.push('users.profile');"));
    assert.ok(!/\bteam:/.test(mem), "no `team:` key in the clean-up's text — the patch itself (teamId and pinnedReports, never the team's name: B17) is T4's exact deepEqual of memberLinksCleared, and T11 runs the write");
    assert.ok(!mem.includes('inArray(users.id, list)'), "the member read's ids are `ids` — the harness entry \"§0.204 kinds: another org's member counts as this org's (a rule assigns its tasks to them)\" quotes that text, which stays once");
});

test("T11 — the restore's clean-up, run on made-up rows (_links.mjs's own clearLineProducts and clearMemberLinks — state §0.205): each reads the org's restored rows, asks its own kind — a product, a team, a saved report — writes only what it cleared, in one batch, counts what it cleared — never a member whose profile is stored as anything but an object, which the write would not reach (JSON text a file gave: the review) — and names a field that fails", async () => {
    const l = fn('_links');
    const src = ['async function clearLineProducts(orgId, restored, failed) {', 'async function clearMemberLinks(orgId, restored, failed) {']
        .map((head) => between(l, head, '\n}\n')).join('\n');
    const TB = Symbol('table');
    const table = (name, keys) => Object.fromEntries([...keys.map((k) => [k, { key: k }]), [TB, name]]);
    const quotes = table('quotes', ['id', 'orgId', 'lineItems']);
    const users = table('users', ['id', 'orgId', 'profile', 'teamJoinedAt']);
    const eq = (c, v) => (r) => r[c.key] === v;
    const and = (...tests) => (r) => tests.every((t) => t(r));
    const inArray = (c, vs) => (r) => vs.includes(r[c.key]);
    // A row's stored kind, as jsonb_typeof answers it; a row may say how it is stored (`stored`) — JSON text a file gave
    // is stored as a jsonb string, which the read hands back parsed, an object (the review).
    const kindOf = (r) => ('stored' in r ? r.stored : r.profile == null ? null : Array.isArray(r.profile) ? 'array' : typeof r.profile);
    // sql: a tagged record — as a where, the jsonb_typeof(profile) = 'object' test it stands for; as a column read, the
    // stored kind it reads (jsonb_typeof(profile))
    const sql = (strings, ...values) => Object.assign((r) => kindOf(r) === 'object', { strings: [...strings], values });
    const readOf = (c, r) => (typeof c === 'function' && c.strings?.join('?') === 'jsonb_typeof(?)' && c.values[0] === users.profile ? kindOf(r) : r[c.key]);
    const ROWS = {
        quotes: [
            { id: 'q1', orgId: 'org_A', lineItems: [{ productId: 'p_a', qty: 1 }, { productId: 'p_b', productName: 'Widget', quantity: 2 }, { description: 'Custom' }] },
            { id: 'q2', orgId: 'org_A', lineItems: [{ productId: 'p_a' }, { productId: 'p_gone' }] },
            { id: 'q3', orgId: 'org_A', lineItems: 'not a list' },
            { id: 'q_b', orgId: 'org_B', lineItems: [{ productId: 'p_gone' }] },
        ],
        users: [
            { id: 'm1', orgId: 'org_A', profile: { teamId: 'tm_b', pinnedReports: ['rep_a', 'rep_b'], quotaPlans: { 2026: { annual: 1 } } } },
            { id: 'm2', orgId: 'org_A', profile: { teamId: 'tm_east', pinnedReports: ['rep_a'] } },
            { id: 'm3', orgId: 'org_A', profile: { teamId: 'tm_east', pinnedReports: ['rep_b', 'rep_a'] } },
            { id: 'm4', orgId: 'org_A', profile: null },
            // JSON text a file gave: stored a jsonb string, read back parsed — another org's team and report, which the
            // write would not reach (its guard: jsonb_typeof = 'object'), so never counted
            { id: 'm5', orgId: 'org_A', stored: 'string', profile: { teamId: 'tm_b', pinnedReports: ['rep_b'] } },
            { id: 'm_b', orgId: 'org_B', profile: { teamId: 'tm_gone', pinnedReports: ['rep_gone'] } },
        ],
    };
    // Org A's records by kind — what liveIdsInOrg finds there; org B's none of them.
    const LIVE = { product: ['p_a'], team: ['tm_east'], report: ['rep_a'] };
    const run = ({ fail = false } = {}) => {
        const reads = [], writes = [], batches = [], asks = [];
        const db = {
            select: (cols) => ({ from: (t) => ({ where: (keep) => {
                reads.push(t[TB]);
                if (fail) return Promise.reject(new Error('made-up failure'));
                return Promise.resolve(ROWS[t[TB]].filter(keep).map((r) => Object.fromEntries(Object.entries(cols).map(([k, c]) => [k, readOf(c, r)]))));
            } }) }),
            update: (t) => ({ set: (set) => ({ where: (keep) => { const w = { table: t[TB], set, ids: ROWS[t[TB]].filter(keep).map((r) => r.id) }; writes.push(w); return w; } }) }),
            batch: async (list) => { batches.push(list); },
        };
        const liveIdsInOrg = async (kind, ids, orgId) => {
            asks.push({ kind, ids, orgId });
            return new Map((ids || []).filter((id) => orgId === 'org_A' && (LIVE[kind] || []).includes(id)).map((id) => [id, id]));
        };
        const made = new Function('db', 'quotes', 'users', 'and', 'eq', 'inArray', 'sql', 'liveIdsInOrg', 'productIdsOf', 'lineProductsCleared', 'memberLinksCleared', 'console',
            `${src}\nreturn { clearLineProducts, clearMemberLinks };`)(
            db, quotes, users, and, eq, inArray, sql, liveIdsInOrg, productIdsOf, lineProductsCleared, memberLinksCleared, { warn: () => {} });
        return { ...made, reads, writes, batches, asks };
    };
    const restored = new Map([[quotes, ['q1', 'q2', 'q3', 'q_b']], [users, ['m1', 'm2', 'm3', 'm4', 'm5', 'm_b']]]);

    const q = run();
    const qFailed = [];
    assert.equal(await q.clearLineProducts('org_A', restored, qFailed), 2, "a line's product that names no product of this org, one each");
    assert.deepEqual(q.asks, [{ kind: 'product', ids: ['p_a', 'p_b', undefined, 'p_a', 'p_gone'], orgId: 'org_A' }], 'one ask, of the products the lines name');
    assert.deepEqual(q.writes, [
        { table: 'quotes', set: { lineItems: [{ productId: 'p_a', qty: 1 }, { productId: null, productName: 'Widget', quantity: 2 }, { description: 'Custom' }] }, ids: ['q1'] },
        { table: 'quotes', set: { lineItems: [{ productId: 'p_a' }, { productId: null }] }, ids: ['q2'] },
    ], 'only the quotes it cleared, each its own row of this org — the line kept, every other key as filed');
    assert.deepEqual(q.batches, [q.writes], 'one batch');
    assert.deepEqual(qFailed, []);

    const m = run();
    const mFailed = [];
    assert.equal(await m.clearMemberLinks('org_A', restored, mFailed), 3,
        "a team and two pins that name nothing of this org, one each — REGRESSION if more: m5's, stored as text, counted though the write never reaches it");
    assert.deepEqual(m.asks, [
        { kind: 'team', ids: ['tm_b', 'tm_east', 'tm_east', undefined, 'tm_b'], orgId: 'org_A' },
        { kind: 'report', ids: ['rep_a', 'rep_b', 'rep_a', 'rep_b', 'rep_a', 'rep_b'], orgId: 'org_A' },
    ], "a team asked as a team, a pin as a saved report — of every member's profile read (m5's too: asked in this org, never written)");
    assert.deepEqual(m.writes.map((w) => w.ids), [['m1'], ['m3']], 'only the members it cleared, each its own row of this org — never m5');
    const [w1, w3] = m.writes;
    for (const w of [w1, w3]) {
        assert.deepEqual(Object.keys(w.set), ['profile', 'teamJoinedAt'], "the profile and the date they joined — never the team's name (B17)");
        assert.equal(w.set.profile.strings.join('?'), "coalesce(?, '{}'::jsonb) || ?::jsonb", 'merged into the profile as stored — the quota plans and every other key kept');
        assert.equal(w.set.profile.values[0], users.profile);
    }
    assert.deepEqual(JSON.parse(w1.set.profile.values[1]), { teamId: null, pinnedReports: ['rep_a'] });
    assert.equal(w1.set.teamJoinedAt, null, 'a team cleared clears the date they joined it');
    assert.deepEqual(JSON.parse(w3.set.profile.values[1]), { pinnedReports: ['rep_a'] }, 'a team that stands is not in the patch');
    assert.deepEqual(w3.set.teamJoinedAt.values, [users.teamJoinedAt], 'a team that stands keeps the date they joined it, as stored');
    assert.deepEqual(m.batches, [m.writes], 'one batch');
    assert.deepEqual(mFailed, []);

    const none = run();
    assert.equal(await none.clearLineProducts('org_A', new Map(), []), 0);
    assert.equal(await none.clearMemberLinks('org_A', null, []), 0);
    assert.deepEqual([none.reads, none.asks, none.batches], [[], [], []], 'nothing restored: no read, no ask, no write');

    const f = run({ fail: true });
    const failed = [];
    assert.equal(await f.clearLineProducts('org_A', restored, failed), 0);
    assert.equal(await f.clearMemberLinks('org_A', restored, failed), 0);
    assert.deepEqual(failed, ['quotes.lineItems', 'users.profile'], 'a field that fails is named, and the rest go on');
    assert.deepEqual(f.batches, []);
});

// ── backup.mjs: a snapshot's id — minted ────────────────────────────────────

test("T12 — a backup snapshot's id is its own (state §0.205 — Jeff, 16 Oct: \"Fix now\"): the minute it was taken and a random suffix, so two taken in the same minute — by any two orgs — never share the global key", () => {
    const b = fn('backup');
    once(b, "import { randomBytes } from 'crypto';");
    once(b, ind(4, "return `bk_snap_${y}_${mo}_${d}_${h}${mi}_${randomBytes(6).toString('hex')}`;"));
    const src = between(b, 'function generateSnapId() {', '\n}\n');
    const generateSnapId = new Function('randomBytes', `${src}\nreturn generateSnapId;`)(randomBytes);
    const minted = Array.from({ length: 50 }, () => generateSnapId());
    for (const id of minted) assert.match(id, /^bk_snap_\d{4}_\d{2}_\d{2}_\d{4}_[0-9a-f]{12}$/, 'the minute, then twelve random hex characters');
    assert.equal(new Set(minted).size, 50, 'fifty minted at once are fifty ids');
    assert.ok(b.includes('const snapId  = generateSnapId();'), 'a manual backup mints its id here');
    assert.ok(b.includes("const snapId = generateSnapId() + '_import';"), "an import's id is minted the same way, marked");
});

// ── backup.mjs: the rows the database never answered for — run on the driver's own answers ──

test("T13 — the restore's rows not reached — the database did not answer for them, or did not take them for a reason of its own (backup.mjs — state §0.205, the review, the second fix round and the re-check): a row is refused only when the database refused its data — a Postgres code of class 22 or 23 on the driver's error drizzle wraps — or the driver could not encode it; any other failure — no answer, a server error, a code of the database's own state (a timeout, a connection, a rollback, its resources) or any other code — is counted apart as not reached — never the file's fault, never already here — and said once, only as known (\"may not have been written — the database did not answer, or did not take them for a reason of its own … restore the file again\"): an error, its snapshot partial, a 500 only when nothing was written and nothing was already here, counted in the answer (unreached); the audit row names each table's rows refused or not reached (isRefusal by class, the row fallback, the words, the status, the answer's count and the audit, run as written on the answers of drizzle's own neon-http driver — a made-up fetch: no network, no database)", async () => {
    const b = fn('backup');
    const lineOf = (start) => {
        const found = b.split('\n').filter((l) => l.startsWith(start));
        assert.equal(found.length, 1, `one line starting: ${start.trim()}`);
        return found[0];
    };
    const IR = lineOf('const isRefusal = ');
    assert.equal(IR, "const isRefusal = (e) => e instanceof TypeError || ['22', '23'].includes(String(e?.cause?.code || e?.code || '').slice(0, 2));");
    const isRefusal = new Function(`${IR}\nreturn isRefusal;`)();
    const unreachedWords = new Function(`${lineOf('const unreachedWords = ')}\nreturn unreachedWords;`)();
    // Not known to be unwritten (the second fix round): an insert that landed while its answer was lost wrote its row.
    // Nor known why (the re-check): a row not reached is one the database did not answer for, or answered with a code
    // outside classes 22 and 23 — it did not take the row for a reason of its own — and the words say only that.
    assert.equal(unreachedWords(1), '1 record may not have been written — the database did not answer, or did not take it for a reason of its own. Restore the file again: a record already here is left as it is.');
    assert.equal(unreachedWords(50), '50 records may not have been written — the database did not answer, or did not take them for a reason of its own. Restore the file again: a record already here is left as it is.');
    assert.ok(!/could not be restored|value/.test(unreachedWords(2)), "never the file's fault");
    assert.ok(!/\b(was|were) not written/.test(unreachedWords(2)), 'never said as a fact');
    assert.ok(!/may land|just then|for now|shortly/.test(unreachedWords(2)), "never said as a moment's: a code the database gives again (54000, an index row too large; 42703, a column it lacks) never lands on a re-run");
    const { refusedWords } = new Function(`${between(b, 'const refusedWords = (label, n) => ', 'were left as they are.`);')}\nreturn { refusedWords };`)();

    // The driver, on a made-up fetch: each request's answer in turn — a refusal (400, its SQLSTATE: '400' a not-null
    // rule, 23502; '400:<code>' any other), no answer (the fetch throws), a server error (503), or the rows written
    // ('ok': each row whose id starts r_; any other is already here).
    const answers = [];
    let unscripted = 0;
    neonConfig.fetchFunction = async (url, init) => {
        const a = answers.shift();
        if (a === 'fetch') throw new TypeError('fetch failed');
        if (a === '400') return new Response(JSON.stringify({ message: 'null value in column "list_price" violates not-null constraint', code: '23502' }), { status: 400 });
        if (a?.startsWith('400:')) return new Response(JSON.stringify({ message: `refused (${a.slice(4)})`, code: a.slice(4) }), { status: 400 });
        if (a === '503') return new Response('upstream unavailable', { status: 503 });
        if (a !== 'ok') { unscripted++; throw new TypeError('no answer scripted'); }
        const ids = JSON.parse(init.body).params.filter((p) => typeof p === 'string' && p.startsWith('r_'));
        return new Response(JSON.stringify({ fields: [{ name: 'id', dataTypeID: 25 }], rows: ids.map((id) => [id]), command: 'INSERT', rowCount: ids.length }), { status: 200 });
    };
    const db = drizzle({ client: neon('postgresql://u:p@ep-made-up.example.test/db') });
    const made = (name) => pgTable(name, { id: text('id').primaryKey(), orgId: text('org_id'), at: timestamp('at') });

    // isRefusal, as written, on what the driver throws
    const probe = made('made_probe');
    const thrown = async (row, a) => {
        if (a) answers.push(a);
        try { await db.insert(probe).values(row).onConflictDoNothing().returning({ id: probe.id }); } catch (e) { return e; }
        return assert.fail('the insert did not throw');
    };
    const refusal = await thrown({ id: 'r_x' }, '400');
    assert.equal(refusal.cause?.code, '23502', "a refusal's SQLSTATE rides the driver's error drizzle wraps — where isRefusal reads it");
    assert.equal(isRefusal(refusal), true, "a row the database refused: the file's");
    const lost = await thrown({ id: 'r_x' }, 'fetch');
    assert.equal(lost.cause?.code ?? lost.code, undefined, 'no answer carries no code');
    assert.equal(isRefusal(lost), false, "no answer — the fetch failed: not the file's");
    assert.equal(isRefusal(await thrown({ id: 'r_x' }, '503')), false, "a server error: not the file's");
    const unencodable = await thrown({ id: 'r_x', at: 1696118400000 }, null);
    assert.ok(unencodable instanceof TypeError, 'a number in a date column fails as the query is built — nothing is sent');
    assert.equal(isRefusal(unencodable), true, "a value the driver cannot encode: the file's");
    assert.equal(isRefusal(Object.assign(new Error('duplicate key'), { code: '23505' })), true, 'a code on the error itself');
    // By its class (the second fix round): a data exception (22) or an integrity rule (23) is the file's; a code about
    // the database's own state — a connection (08), a transaction rolled back (40), its resources (53), an operator's
    // intervention or a timeout (57), the system (58), an internal error (XX) — or any other is not: not reached, said
    // only as known (the re-check) — a code it gives again (54000, an index row too large; 42703, a column it lacks)
    // never lands on a re-run.
    const CODES = ['22P02', '22001', '22003', '22007', '23502', '23503', '23505', '23514', '08006', '08001', '40001', '40P01', '53300', '53100', '57014', '57P01', '58030', 'XX000', '42703', '54000'];
    const byCode = [];
    for (const c of CODES) {
        const e = await thrown({ id: 'r_x' }, `400:${c}`);
        assert.deepEqual([e.cause?.code, e.code], [c, undefined], `${c}: the driver's code rides e.cause alone`);
        byCode.push([c, isRefusal(e)]);
    }
    assert.deepEqual(byCode, CODES.map((c) => [c, c.startsWith('22') || c.startsWith('23')]),
        "REGRESSION: a code of the database's own state (a statement timeout, a dropped connection, a rollback) said as the file's — 'could not be restored', never 'restore the file again' — or a data error said as not reached");
    assert.deepEqual([isRefusal(new TypeError('x')), isRefusal(new Error('x')), isRefusal(Object.assign(new Error('canceling statement due to statement timeout'), { code: '57014' })), isRefusal(Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' })), isRefusal(null)],
        [true, false, false, false, false], "a TypeError is the file's; a plain error, a code of the database's own state or a socket's on the error itself, or no error, is not");

    // backup.mjs's own stamp, keepRestored and upsertChunked, as written, on the driver's answers
    const dateKeysOf = new Function('getTableColumns', `${lineOf('const dateKeysOf = ')}\nreturn dateKeysOf;`)(getTableColumns);
    const restoreOf = () => new Function('orgId', 'dateKeysOf', 'isRefusal', 'db',
        `${between(b, '            const JSONB_KEYS = new Set([', '\n                return count;\n            }\n')}\nreturn { upsertChunked, tally, restored, firstCause, firstMiss };`)('org_A', dateKeysOf, isRefusal, db);
    const [TA, TB, TC, TD] = ['made_a', 'made_b', 'made_c', 'made_d'].map(made);
    const r1 = restoreOf();
    answers.push('fetch', '400', 'fetch', 'ok');   // the chunk not answered; then, row by row: refused, not answered, written
    assert.equal(await r1.upsertChunked(TA, [{ id: 'r_1' }, { id: 'r_2' }, { id: 'r_3' }]), 1, 'only the row written counts');
    answers.push('ok');   // a number in a date column: the chunk and its row fail as the query is built — refused; the other written
    assert.equal(await r1.upsertChunked(TB, [{ id: 'r_4', at: 1696118400000 }, { id: 'r_5' }]), 1);
    assert.deepEqual([r1.tally.get(TA), r1.tally.get(TB)], [{ sent: 3, written: 1, refused: 1, unreached: 1 }, { sent: 2, written: 1, refused: 1, unreached: 0 }],
        'REGRESSION: a row the database never answered for counted refused, or left uncounted (said as already here)');
    assert.deepEqual([r1.restored.get(TA), r1.restored.get(TB)], [['r_3'], ['r_5']], 'the rows written are the rows restored');
    assert.equal(r1.firstCause.get(TA), 'null value in column "list_price" violates not-null constraint', "the refusal's words, for the log");
    assert.match(r1.firstMiss.get(TA), /fetch failed/, "no answer's words, for the log");
    assert.equal(r1.firstMiss.has(TB), false);
    const r2 = restoreOf();
    answers.push('fetch', '503', 'fetch');   // the database gone: nothing answered
    assert.equal(await r2.upsertChunked(TC, [{ id: 'r_6' }, { id: 'r_7' }]), 0);
    assert.deepEqual(r2.tally.get(TC), { sent: 2, written: 0, refused: 0, unreached: 2 }, 'every row not reached — none refused, none already here');
    const r3 = restoreOf();
    answers.push('400', 'ok', '400');   // a re-run: the bulk insert refused; then one row already here (answered, none written), one refused
    assert.equal(await r3.upsertChunked(TD, [{ id: 'q_8' }, { id: 'q_9' }]), 0);
    assert.deepEqual(r3.tally.get(TD), { sent: 2, written: 0, refused: 1, unreached: 0 });
    const r4 = restoreOf();
    answers.push('400:57014', '400', '400:57014', 'fetch', 'ok');   // the chunk timed out; then, row by row: refused, timed out, not answered, written
    assert.equal(await r4.upsertChunked(TA, [{ id: 'r_1' }, { id: 'r_2' }, { id: 'r_3' }, { id: 'r_4' }]), 1, 'only the row written counts');
    assert.deepEqual(r4.tally.get(TA), { sent: 4, written: 1, refused: 1, unreached: 2 },
        "REGRESSION: a statement timeout counted as the file's fault — 'could not be restored', never 'restore the file again' (the second fix round)");
    assert.deepEqual([r4.firstCause.get(TA), r4.firstMiss.get(TA)], ['null value in column "list_price" violates not-null constraint', 'refused (57014)'], 'each first cause, for the log');
    assert.deepEqual([answers, unscripted], [[], 0], 'the driver asked exactly what the run scripted');

    // What the restore then says, as written: each table's sayRefused, the rows not reached, "already here", the status,
    // the answer's count of the rows not reached (the re-check), the snapshot's status and the audit row's detail.
    const SR = between(b, '            const sayRefused = (label, table) => {', '\n            };');
    const MISSED = [lineOf(ind(12, 'const missed = ')), lineOf(ind(12, 'if (missed) errs.push('))].join('\n');
    const ALREADY = lineOf(ind(12, 'const already = '));
    const part = (l, from, to) => between(l, from, to).slice(from.length, -to.length);
    const STATUS = part(lineOf(ind(16, 'statusCode: errs.length')), 'statusCode: ', ',');
    const ANSWER = part(lineOf(ind(16, 'body: JSON.stringify({ ok: imported > 0')), 'body: JSON.stringify(', '),');
    const SNAP = part(lineOf(ind(20, 'status:      errs.length')), 'status:      ', ',');
    const ROWS = [lineOf(ind(12, 'const rowsBy = ')), lineOf(ind(12, 'const rowDetail = '))].join('\n');
    const DETAIL = part(lineOf("            await auditAs(orgId, userId, { action: 'backup.restored'"), 'detail: ', ' });');
    const says = (tally, tables, imported) => {
        const errs = [], notWritten = [], warned = [];
        const sayRefused = new Function('tally', 'firstCause', 'firstMiss', 'errs', 'refusedWords', 'notWritten', 'console', `${SR}\nreturn sayRefused;`)(
            tally, new Map(), new Map(), errs, refusedWords, notWritten, { warn: (...a) => warned.push(a.slice(0, 3)) });
        for (const [label, table] of tables) sayRefused(label, table);
        const { missed, already } = new Function('tally', 'errs', 'unreachedWords', `${MISSED}\n${ALREADY}\nreturn { missed, already };`)(tally, errs, unreachedWords);
        const status = new Function('errs', 'imported', 'already', `return ${STATUS};`)(errs, imported, already);
        const answer = new Function('imported', 'missed', 'errs', 'notes', 'snapId', `return ${ANSWER};`)(imported, missed, errs, [], 'bk_snap_x_import');
        const snapshot = new Function('errs', `return ${SNAP};`)(errs);
        const rowDetail = new Function('notWritten', `${ROWS}\nreturn rowDetail;`)(notWritten);
        const detail = new Function('imported', 'linkDetail', 'already', 'errs', 'rowDetail', `return ${DETAIL};`)(imported, '', already, errs, rowDetail);
        return { errs, warned, already, status, unreached: answer.unreached, snapshot, detail };
    };
    assert.deepEqual(says(new Map([[TA, r1.tally.get(TA)], [TB, r1.tally.get(TB)]]), [['products', TA], ['dispatch.jobs', TB]], 2), {
        errs: [refusedWords('products', 1), refusedWords('dispatch.jobs', 1), unreachedWords(1)],
        warned: [['backup: rows not reached', 'products', 1], ['backup: rows refused', 'products', 1], ['backup: rows refused', 'dispatch.jobs', 1]],
        already: 0, status: 200, unreached: 1, snapshot: 'partial',
        detail: '2 records imported · 3 errors · refused: products 1, dispatch.jobs 1 · not reached: products 1',
    }, 'a row refused and a row not reached: each said in its own words — the row not reached never "already here", and counted in the answer; the audit row names each table');
    assert.deepEqual(says(new Map([[TC, r2.tally.get(TC)]]), [['opportunities', TC]], 0), {
        errs: [unreachedWords(2)], warned: [['backup: rows not reached', 'opportunities', 2]], already: 0, status: 500, unreached: 2, snapshot: 'partial',
        detail: '0 records imported · 1 error · not reached: opportunities 2',
    }, 'REGRESSION: a restore the database never answered — a 500 whose answer counts no row not reached: the window cannot tell records may have been written, and Close leaves the page stale');
    assert.deepEqual(says(new Map([[TD, r3.tally.get(TD)]]), [['products', TD]], 0), {
        errs: [refusedWords('products', 1)], warned: [['backup: rows refused', 'products', 1]], already: 1, status: 200, unreached: 0, snapshot: 'partial',
        detail: '0 records imported · 1 already here · 1 error · refused: products 1',
    }, 'a re-run: a row already here and a row refused — a 200 (B23), no row not reached');
    const quiet = says(new Map([[TA, { sent: 2, written: 2, refused: 0, unreached: 0 }]]), [['products', TA]], 2);
    assert.deepEqual([quiet.errs, quiet.warned, quiet.unreached, quiet.snapshot, quiet.detail], [[], [], 0, 'ready', '2 records imported'], 'a clean restore: nothing more said, nothing more logged, no row not reached');
});

// ── ReportsTab.jsx: a Pin from a window whose pin list is stale — run ──────

test("T14 — a Pin from a window holding a stale pin list (ReportsTab.jsx's togglePin, run as written — state §0.205, the review): a refusal naming the pins reads the member's own row again, adopts its pins and sends the list rebuilt from them, with this report added or removed — what the member asked, as the window showed it — once more; refused again, the server's words show; a refusal not about the pins is said as it is, never re-sent; an org switched mid-way — while a stale Pin's PUT is refused (the re-check), during the re-read, or during a PUT answered — sets, reads and sends nothing more; a fresh window sends once; a PUT with no answer — the first or the retry — may have landed: the window says to reload and see whether the report was pinned or unpinned, and nothing after an org switch (the second fix round)", async () => {
    const s = code(read('src/Tabs/ReportsTab.jsx'));
    const PINNED = [ind(4, 'const pinnedIds = Array.isArray(myProfile?.pinnedReports) ? myProfile.pinnedReports : [];'), ind(4, 'const isPinned = (r) => pinnedIds.includes(r.id);')];
    for (const l of PINNED) once(s, l);
    const TP = between(s, '    const togglePin = async (r) => {', '\n    };');
    // The member's own row as the server holds it (stored) and this org's saved reports (live): a pin the PUT names anew
    // that names none of them is refused, as users.mjs's ?me check refuses it (T3, T5) — a pin the row holds is never asked.
    const run = async ({ shown, stored, live, click, refusal = null, reread = true, switchAt = null, lose = [] }) => {
        let held = [...stored], org = 'org_A', puts = 0, myProfile = { id: 'usr_karen', name: 'Karen', pinnedReports: [...shown] };
        const sent = [], adopted = [], said = [];
        const answer = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
        const dbFetch = async (url, init = {}) => {
            assert.equal(url, '/.netlify/functions/users?me=true', "the member's own row, through dbFetch");
            if (init.method !== 'PUT') {
                sent.push('GET');
                if (switchAt === 'GET') org = 'org_B';
                return reread ? answer(200, { user: { id: 'usr_karen', pinnedReports: [...held] } }) : answer(500, { error: 'Internal server error' });
            }
            const body = JSON.parse(init.body);
            assert.equal(body.id, 'usr_karen');
            sent.push(body.pinnedReports);
            puts++;
            if (switchAt === 'PUT' || switchAt === `PUT${puts}`) org = 'org_B';
            if (lose.includes(puts)) throw new TypeError('Failed to fetch');   // no answer: a network failure
            if (refusal) return answer(refusal.status, refusal.body);
            if (body.pinnedReports.some((id) => !held.includes(id) && !live.includes(id))) return answer(404, { error: notInOrg('report'), field: 'pinnedReports' });
            held = body.pinnedReports;
            return answer(200, { user: { id: 'usr_karen', role: 'User', pinnedReports: [...held] } });
        };
        const setMyProfile = (f) => { myProfile = f(myProfile); adopted.push(myProfile.pinnedReports); };
        const togglePin = new Function('myProfile', 'setMyProfile', 'setLibError', 'dbFetch', 'requestOrg', 'stillOrg', `${PINNED.join('\n')}\n${TP}\nreturn togglePin;`)(
            myProfile, setMyProfile, (m) => { if (m) said.push(m); }, dbFetch, () => org, (asked) => asked === org);
        await togglePin({ id: click });
        return { sent, held, adopted, said };
    };
    // Karen pins W. In another window she unpinned X, which was then deleted: this window still shows [X, W].
    const STALE = { shown: ['rep_x', 'rep_w'], stored: ['rep_w'], live: ['rep_w', 'rep_y'] };
    assert.deepEqual(await run({ shown: ['rep_w'], stored: ['rep_w'], live: ['rep_w', 'rep_y'], click: 'rep_y' }),
        { sent: [['rep_w', 'rep_y']], held: ['rep_w', 'rep_y'], adopted: [['rep_w', 'rep_y']], said: [] }, 'a fresh window: one PUT, as before');
    assert.deepEqual(await run({ ...STALE, click: 'rep_y' }),
        { sent: [['rep_x', 'rep_w', 'rep_y'], 'GET', ['rep_w', 'rep_y']], held: ['rep_w', 'rep_y'], adopted: [['rep_w'], ['rep_w', 'rep_y']], said: [] },
        'REGRESSION: a Pin from a stale window refused, naming a report the member did not click — and every Pin and Unpin there after it');
    assert.deepEqual(await run({ ...STALE, click: 'rep_w' }),
        { sent: [['rep_x'], 'GET', []], held: [], adopted: [['rep_w'], []], said: [] }, 'an Unpin from it: the report unpinned');
    assert.deepEqual(await run({ ...STALE, click: 'rep_z' }),
        { sent: [['rep_x', 'rep_w', 'rep_z'], 'GET', ['rep_w', 'rep_z']], held: ['rep_w'], adopted: [['rep_w']], said: [notInOrg('report')] },
        "a report deleted since, pinned: refused twice, the server's words shown — the window's pins now the stored ones");
    assert.deepEqual(await run({ ...STALE, stored: ['rep_w', 'rep_y'], click: 'rep_y' }),
        { sent: [['rep_x', 'rep_w', 'rep_y'], 'GET', ['rep_w', 'rep_y']], held: ['rep_w', 'rep_y'], adopted: [['rep_w', 'rep_y'], ['rep_w', 'rep_y']], said: [] },
        'pinned in another window already: a Pin keeps it, once — what the member asked, never a toggle of the stored list');
    assert.deepEqual(await run({ ...STALE, click: 'rep_y', reread: false }),
        { sent: [['rep_x', 'rep_w', 'rep_y'], 'GET'], held: ['rep_w'], adopted: [], said: [notInOrg('report')] }, "the row not read again: the refusal's words, nothing re-sent");
    assert.deepEqual(await run({ ...STALE, click: 'rep_y', switchAt: 'GET' }),
        { sent: [['rep_x', 'rep_w', 'rep_y'], 'GET'], held: ['rep_w'], adopted: [], said: [] }, 'the org switched during the re-read: nothing adopted, nothing re-sent, nothing said');
    assert.deepEqual(await run({ ...STALE, click: 'rep_y', switchAt: 'PUT1' }),
        { sent: [['rep_x', 'rep_w', 'rep_y']], held: ['rep_w'], adopted: [], said: [] }, "REGRESSION: the org switched while a stale Pin was refused — the member's row read again in the org switched to (state §0.175)");
    assert.deepEqual(await run({ shown: ['rep_w'], stored: ['rep_w'], live: ['rep_w', 'rep_y'], click: 'rep_y', switchAt: 'PUT' }),
        { sent: [['rep_w', 'rep_y']], held: ['rep_w', 'rep_y'], adopted: [], said: [] }, 'the org switched during the PUT: its answer changes nothing (state §0.175)');
    for (const refusal of [{ status: 500, body: { error: 'Internal server error', requestId: 'r1' } }, { status: 403, body: { error: 'Not your row.' } }]) {
        assert.deepEqual(await run({ ...STALE, click: 'rep_y', refusal }),
            { sent: [['rep_x', 'rep_w', 'rep_y']], held: ['rep_w'], adopted: [], said: [refusal.body.error] }, `a refusal not about the pins (${refusal.status}): said as it is, never read again and re-sent`);
    }
    // No answer to a PUT (the second fix round): it may have landed, so the window says to reload and see — what the
    // member asked, pinned or unpinned; nothing adopted; after an org switch nothing said (state §0.175). togglePin never
    // rejects: an unhandled rejection fails the run here.
    const LOST_PIN = 'No answer from the server — reload the page to see whether the report was pinned.';
    const LOST_UNPIN = 'No answer from the server — reload the page to see whether the report was unpinned.';
    const FRESH = { shown: ['rep_w'], stored: ['rep_w'], live: ['rep_w', 'rep_y'] };
    assert.deepEqual(await run({ ...FRESH, click: 'rep_y', lose: [1] }), { sent: [['rep_w', 'rep_y']], held: ['rep_w'], adopted: [], said: [LOST_PIN] },
        'REGRESSION: a Pin with no answer rejects unhandled — nothing said');
    assert.deepEqual(await run({ ...FRESH, click: 'rep_w', lose: [1] }), { sent: [[]], held: ['rep_w'], adopted: [], said: [LOST_UNPIN] }, 'an Unpin with no answer: reload and see whether it was unpinned');
    assert.deepEqual(await run({ ...STALE, click: 'rep_y', lose: [2] }),
        { sent: [['rep_x', 'rep_w', 'rep_y'], 'GET', ['rep_w', 'rep_y']], held: ['rep_w'], adopted: [['rep_w']], said: [LOST_PIN] }, "REGRESSION: a stale Pin's retry with no answer rejects unhandled — nothing said");
    assert.deepEqual(await run({ ...FRESH, click: 'rep_y', lose: [1], switchAt: 'PUT1' }), { sent: [['rep_w', 'rep_y']], held: ['rep_w'], adopted: [], said: [] },
        'REGRESSION: the org switched while the Pin went unanswered — said in the org switched to (state §0.175)');
    assert.deepEqual(await run({ ...STALE, click: 'rep_y', lose: [2], switchAt: 'PUT2' }),
        { sent: [['rep_x', 'rep_w', 'rep_y'], 'GET', ['rep_w', 'rep_y']], held: ['rep_w'], adopted: [['rep_w']], said: [] }, "REGRESSION: the org switched while a stale Pin's retry went unanswered — said in the org switched to");
});

// ── BackupDetail.jsx: the import window — run ───────────────────────────────

test("T15 — the import window, run as written (BackupDetail.jsx's saidBy, crashedWords, handleImport and close — state §0.205, the review, the second fix round and the re-check): the restore's own answer is shown, the window never closed from inside; a refused restore's errors one per line; any other answer the server gave in words — a refusal before the restore ran: Admin only, a file that is no backup, verifyAuth's 503 or 500 — in those words, with its log ref when it sent one; a function crash's words and ref, and the restore may have written records; no answer — a network failure, an answer that is no JSON, one with no words, one not the restore's — says the restore may have written records; so does the restore's own answer counting rows not reached, refused (a 500) or not (a 200), and only then; where records may have been written, Close reloads the page; after an org switch nothing is set; while the restore runs the backdrop, the × and Cancel do nothing, and once records are restored Close reloads the page", async () => {
    const bd = code(read('src/Tabs/settings/data/BackupDetail.jsx'));
    const NO_ANSWER = new Function(`${bd.split('\n').find((l) => l.startsWith('const NO_ANSWER = '))}\nreturn NO_ANSWER;`)();
    assert.equal(NO_ANSWER, 'No answer from the server — the restore may have written records. Run the file again: a record already here is left as it is, never written twice.');
    const saidBy = new Function(`${between(bd, 'const saidBy = ', "` : '');")}\nreturn saidBy;`)();
    const crashedWords = new Function(`${bd.split('\n').find((l) => l.startsWith('const crashedWords = '))}\nreturn crashedWords;`)();
    const HI = between(bd, '    const handleImport = async () => {', '\n    };');
    const answer = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => { if (body instanceof Error) throw body; return body; } });
    const run = async (got, { switched = false } = {}) => {
        const did = [];
        let org = 'org_A';
        const dbFetch = async (url, init) => {
            assert.deepEqual([url, init.method], ['/.netlify/functions/backup', 'PATCH']);
            if (switched) org = 'org_B';
            if (got instanceof Error) throw got;
            return got;
        };
        const handleImport = new Function('parsed', 'requestOrg', 'stillOrg', 'dbFetch', 'setLoading', 'setError', 'setResult', 'setMayHaveWritten', 'onSuccess', 'onClose', 'NO_ANSWER', 'saidBy', 'crashedWords', `${HI}\nreturn handleImport;`)(
            { entities: { products: [{ id: 'p1' }] } }, () => org, (asked) => asked === org, dbFetch,
            (v) => did.push(['loading', v]), (v) => did.push(['error', v]), (v) => did.push(['result', v]), (v) => did.push(['mayHaveWritten', v]), (v) => did.push(['success', v]), () => did.push(['close']),
            NO_ANSWER, saidBy, crashedWords);
        await handleImport();
        return did;
    };
    const asked = [['loading', true], ['error', ''], ['loading', false]];
    const own = { ok: true, imported: 7, unreached: 0, errors: [], notes: ['2 records in the file were already here — …'], snapId: 'bk_snap_x_import' };
    assert.deepEqual(await run(answer(200, own)), [...asked, ['result', own], ['success', own]], "the restore's own answer: shown — never closed from inside");
    const partial = { ok: true, imported: 3, errors: ['products: 1 record could not be restored — …'], notes: [] };
    assert.deepEqual(await run(answer(200, partial)), [...asked, ['result', partial], ['success', partial]], 'accepted, with an error: shown, its errors listed one per line');
    assert.deepEqual(await run(answer(500, { ok: false, imported: 0, errors: ['users: 1 member row was not restored — …: "Pat Lee"', 'users: 1 record could not be restored — …'], notes: [] })),
        [...asked, ['error', 'Import failed — users: 1 member row was not restored — …: "Pat Lee"\nusers: 1 record could not be restored — …']],
        'REGRESSION: a refused restore\'s errors run together on one line — "Pat Lee users" read as a name');
    assert.deepEqual(await run(answer(500, { ok: false, imported: 0, unreached: 0, errors: [], notes: [] })), [...asked, ['error', 'Import failed']], 'refused, with nothing said — every row reached: nothing may have been written, Close just closes');
    // The restore's own answer counting rows not reached (the re-check): an insert may have landed while its answer was
    // lost, so records may have been written, refused or not — and Close reloads the page (the window says so).
    assert.deepEqual(await run(answer(500, { ok: false, imported: 0, unreached: 2, errors: ['2 records may not have been written — …'], notes: [], snapId: 'bk_snap_x_import' })),
        [...asked, ['mayHaveWritten', true], ['error', 'Import failed — 2 records may not have been written — …']],
        "REGRESSION: a restore whose rows went unanswered — a 500, nothing counted written — shows its errors but never says the page reloads: the page left stale on Close, records it may have written unseen");
    const rerun = { ok: false, imported: 0, unreached: 2, errors: ['2 records may not have been written — …'], notes: ['3 records in the file were already here — …'], snapId: 'bk_snap_x_import' };
    assert.deepEqual(await run(answer(200, rerun)), [...asked, ['mayHaveWritten', true], ['result', rerun], ['success', rerun]],
        "REGRESSION: a re-run whose rows went unanswered — a 200, records already here — shows its errors but never says the page reloads: the page left stale on Close, records it may have written unseen");
    // A refusal before the restore ran — nothing written, no reload: the server's words, with its log ref when it sent
    // one (the second fix round: verifyAuth's 503 and 500 read "may have written records", their words lost).
    for (const [status, body, words] of [
        [400, { error: 'Missing entities key' }, 'Missing entities key'],
        [403, { error: 'Admin only' }, 'Admin only'],
        [401, { error: 'Unauthorized: no token' }, 'Unauthorized: no token'],
        [503, { error: 'The service is unavailable — try again shortly.' }, 'The service is unavailable — try again shortly.'],
        [500, { error: 'Server configuration error' }, 'Server configuration error'],
        [404, { error: 'Snapshot not found', requestId: 'r9' }, 'Snapshot not found (ref r9)'],
    ]) assert.deepEqual(await run(answer(status, body)), [...asked, ['error', words]], `REGRESSION: a refusal before the restore ran (${status}) reads "may have written records" — its words or its ref lost, the page reloaded on Close`);
    // A function crash (serverErrorBody's 500, its requestId) may come after records were written: its words and ref, and so.
    const CRASH = 'Internal server error (ref r1) — the restore may have written records. Run the file again: a record already here is left as it is, never written twice.';
    assert.equal(crashedWords(saidBy({ error: 'Internal server error', requestId: 'r1' })), CRASH);
    assert.deepEqual(await run(answer(500, { error: 'Internal server error', requestId: 'r1' })), [...asked, ['mayHaveWritten', true], ['error', CRASH]],
        "REGRESSION: a function crash mid-restore reads as a refusal — never 'the restore may have written records', its ref lost, the page left stale on Close");
    for (const [why, got] of [
        ['a network failure', new TypeError('Failed to fetch')],
        ['an answer that is no JSON (a gateway page)', answer(502, new SyntaxError('Unexpected token <'))],
        ["an answer that is not the restore's", answer(200, { ok: true })],
        ['a refusal with no words', answer(413, {})],
        ['an answer that is JSON text', answer(500, 'oops')],
        ['an answer that is a list', answer(200, [])],
        ["errors with no count — not the restore's, and not words", answer(500, { error: 'x', errors: ['y'] })],
    ]) assert.deepEqual(await run(got), [...asked, ['mayHaveWritten', true], ['error', NO_ANSWER]], `${why}: the restore may have written records — never "nothing restored" — and Close reloads the page`);
    assert.deepEqual(await run(answer(200, own), { switched: true }), asked, 'after an org switch its answer sets nothing');
    assert.deepEqual(await run(answer(500, { error: 'Internal server error', requestId: 'r1' }), { switched: true }), asked, 'nor a crash after an org switch');

    const CL = bd.split('\n').find((l) => l.trim().startsWith('const close = ')).trim();
    const pressed = (loading, result, mayHaveWritten = false) => {
        const did = [];
        const close = new Function('loading', 'result', 'mayHaveWritten', 'onClose', 'window', `${CL}\nreturn close;`)(loading, result, mayHaveWritten, () => did.push('closed'), { location: { reload: () => did.push('reloaded') } });
        close();
        return did;
    };
    assert.deepEqual(pressed(true, null), [], 'while the restore runs, the backdrop, the × and Cancel do nothing — closing lost its answer');
    assert.deepEqual(pressed(true, null, true), [], 'nor while a later run runs, after one with no answer');
    assert.deepEqual(pressed(false, null), ['closed'], 'before an import, or after a refusal: Cancel closes');
    assert.deepEqual(pressed(false, { imported: 0 }), ['closed'], 'nothing restored: Close just closes');
    assert.deepEqual(pressed(false, { imported: 7 }), ['reloaded'], 'records restored: Close reloads the page — every screen shows what was restored');
    assert.deepEqual(pressed(false, null, true), ['reloaded'], 'REGRESSION: after no answer or a crash, Cancel leaves the page stale — records the restore may have written unseen');
    assert.deepEqual(pressed(false, { imported: 0 }, true), ['reloaded'], 'a later run that restored nothing, after one that may have written: Close reloads');
});

test('T10 — the suites: this file is graded by the harness', () => {
    const suites = read('scripts/mutate-import.mjs').match(/^const SUITES = '([^'\n]*)';$/m)?.[1].split(' ') ?? [];
    assert.ok(suites.includes('tests/member-links.test.mjs'), 'SUITES runs this file');
});
