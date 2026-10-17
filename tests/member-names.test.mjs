// tests/member-names.test.mjs
//
// One name per member of an org (state §0.196 — batch B of the PROD Closed Lost fix;
// Jeff, 9 Oct: "Split: prod fix first", "Number it", "Yes, Full name wins"). Deals, tasks
// and leads are still assigned by NAME through resolveOwnerId, which refuses a name two
// members share (§0.193): two rows of Jeff's prod org read "Jeff Russell", and every
// assignment by that name was a 409. Every writer of users.name now decides it through
// src/utils/memberName.js:
//   RUN    the rule itself — one key (whitespace collapsed, trimmed, any case); a write
//          that keeps its row's resolver key is let through (a pair made before the rule
//          stays editable, and can be renamed apart, never respaced onto the other);
//          a taken name numbered "Pat Smith (2)", cut to the column; a backup's members
//          restored under free names, First/Last kept only when they spell the name —
//          and a hand-edited file, put through the users table's own keys, makes no
//          pair; the restore's words; the team import's check by the same key
//   PINS   each writer's decision in its place: users.mjs (the self PUT, the Admin PUT,
//          the create, the invite — decided before Clerk), ensureRosterRow, users-sync,
//          the restore; the screens (the profile panel sends what changed and shows a
//          refusal; the Full name clears First/Last; the restore's note)
//   GUARD  every write of a name to the users table in netlify/functions is one of the
//          listed sites, and each has its decider (a parse, not a regex)
// tests/integration/member-names.itest.mjs proves the server against the test database.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { parse } from '@babel/parser';
import * as memberName from '../src/utils/memberName.js';
import { NAME_MAX, nameKey, resolverKey, nameTakenMessage, nameRefusal, numbered, firstFreeName, restorableMembers, restoreNotes, droppedErrors } from '../src/utils/memberName.js';
import { userConflicts } from '../src/utils/userImport.js';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const code = (src) => src.split(/\r?\n/).filter((l) => !l.trim().startsWith('//')).join('\n');
const between = (s, start, end) => {
    const a = s.indexOf(start);
    assert.ok(a >= 0, `missing: ${start}`);
    const b = s.indexOf(end, a + start.length);
    assert.ok(b > a, `no end after: ${start}`);
    return s.slice(a, b + end.length);
};
// Each part found after the one before it.
const order = (s, ...parts) => {
    let at = -1;
    for (const p of parts) {
        const i = s.indexOf(p, at + 1);
        assert.ok(i > at, `missing or out of order: ${p}`);
        at = i;
    }
};
const count = (s, part) => s.split(part).length - 1;
const NBSP = String.fromCharCode(160);

// ── RUN ──────────────────────────────────────────────────────────────────────

test("the same name: whitespace collapsed, trimmed, any case — the resolver's key is the same without the collapse", () => {
    for (const s of [' Jeff  Russell ', 'jeff russell', 'JEFF\tRUSSELL', 'Jeff Russell', 'Jeff Russell   ', `Jeff${NBSP}Russell`]) {
        assert.equal(nameKey(s), 'jeff russell', JSON.stringify(s));
    }
    assert.equal(nameKey(null), '');
    assert.equal(nameKey(undefined), '');
    for (const s of [' Jeff  Russell ', 'jeff russell', 'JEFF\tRUSSELL', 'Jeff Russell   ', 'Pat  Smith', '', null]) {
        assert.equal(resolverKey(s), String(s ?? '').trim().toLowerCase(), JSON.stringify(s));
        assert.equal(nameKey(s), resolverKey(s).replace(/\s+/g, ' '), 'nameKey is the resolver key collapsed');
    }
    // The resolver compares exactly this (state §0.193): a roster with no two of one
    // nameKey can never give it two matches.
    const lib = read('netlify/functions/_lib.mjs');
    assert.ok(lib.includes("    const wanted = String(name ?? '').trim().toLowerCase();"));
    assert.ok(lib.includes("        .filter((u) => String(u.name ?? '').trim().toLowerCase() === wanted);"));
});

test('nameRefusal: a name another member holds is refused; a write that keeps its own row\'s name is not — and an old pair is never respaced onto each other', () => {
    // The prod shape (§0.193): two rows that read "Jeff Russell".
    const prod = [{ id: 'a', name: 'Jeff Russell', email: 'a@x.test' }, { id: 'b', name: 'Jeff Russell   ', email: 'b@x.test' }];
    assert.equal(nameRefusal(prod, 'Jeff Russell', 'b'), null, 'b keeps its own name (trimmed): the pair stays editable');
    assert.equal(nameRefusal(prod, 'JEFF RUSSELL', 'b'), null, 'in any case');
    assert.equal(nameRefusal(prod, 'Jeff Russell', 'a'), null);
    assert.equal(nameRefusal(prod, 'Jeff R (rep)', 'b'), null, 'renamed apart');
    assert.ok(nameRefusal(prod, 'Jeff  Russell', 'b'), 'a respaced name is a new name for the resolver — refused');
    assert.ok(nameRefusal(prod, 'jeff russell'), 'a new row');
    assert.ok(nameRefusal(prod, ' JEFF   russell ', 'c'), 'another row');
    assert.ok(nameRefusal([{ id: 'p', name: 'Pat Smith' }, { id: 'q', name: 'Pat  Smith' }], 'pat smith', 'q'), 'q may not take p\'s name by respacing its own');
    assert.equal(nameRefusal([{ id: 's', name: 'Kim  Lee' }], 'Kim Lee', 's'), null, 'respacing one\'s own name is fine when nobody else holds it');
    assert.equal(nameRefusal([{ id: 's', name: 'Kim Lee' }, { id: 't', name: null }], 'Lee Kim', 's'), null, 'a row with no name holds none');
    assert.equal(nameRefusal([...prod, { id: 'n', name: '' }], '   '), null, 'nothing to compare — not even with a member whose name is blank');
    assert.equal(nameRefusal(null, 'Jeff Russell'), null, 'no roster, no holder');
    const words = nameRefusal(prod, ' jeff russell ');
    assert.equal(words, nameTakenMessage('jeff russell'));
    assert.ok(words.includes('"jeff russell"'), 'the name as it was typed, trimmed');
    assert.ok(!words.includes('@'), 'no member\'s email: a rep reads it');
});

test('numbered and firstFreeName: "Pat Smith (2)" where nobody can be asked, every candidate cut to the column', () => {
    assert.deepEqual(numbered(' Pat Smith ', 3), ['Pat Smith', 'Pat Smith (2)', 'Pat Smith (3)']);
    assert.deepEqual(numbered(''), []);
    assert.deepEqual(numbered('   '), []);
    assert.deepEqual(numbered(null), []);
    assert.equal(numbered('x').length, 20);
    assert.equal(NAME_MAX, 255, 'users.name is varchar(255)');
    const long = numbered('L'.repeat(300));
    assert.equal(long[0], 'L'.repeat(255));
    assert.equal(long[1], 'L'.repeat(251) + ' (2)');
    assert.equal(long[19], 'L'.repeat(250) + ' (20)');
    assert.ok(long.every((n) => n.length <= 255), 'every candidate fits the column');
    const roster = [{ id: 'u1', name: 'Pat Smith' }];
    assert.equal(firstFreeName(roster, numbered('Pat Smith')), 'Pat Smith (2)');
    roster.push({ id: 'u2', name: 'pat smith (2)' });
    assert.equal(firstFreeName(roster, numbered('PAT SMITH')), 'PAT SMITH (3)');
    assert.equal(firstFreeName(roster, ['', '  ', ' Lee ']), 'Lee', 'blank candidates skipped, the one taken trimmed');
    assert.equal(firstFreeName(roster, ['pat  smith']), null, 'every candidate held');
    assert.equal(firstFreeName(roster, null), null);
});

test('restorableMembers: a backup\'s member is restored under a free name, First/Last kept only when they spell it; a row the insert skips is left as it is', () => {
    const roster = [{ id: 'u1', name: 'Pat Smith', email: 'pat@x.test', clerkUserId: 'c1' }];
    const file = [
        { id: 'u1', name: 'Pat Smith', email: 'other@x.test' },                       // its id is here
        { id: 'f1', name: 'Pat Smith', email: 'pat@x.test' },                         // its email is here
        { id: 'f2', name: 'Pat Smith', email: 'f2@x.test', clerkUserId: 'c1' },       // its Clerk id is here
        { name: 'Pat Smith', email: 'f3@x.test' },                                     // no id: NOT NULL refuses it
        { id: 'f4', name: 'Pat Smith' },                                               // no email: NOT NULL refuses it
        { id: 'f5', name: ' pat smith ', email: 'f5@x.test', profile: { firstName: 'Pat', lastName: 'Smith', title: 'AE' } },
        { id: 'f6', name: 'Lee', email: 'f6@x.test' },
        { id: 'f7', name: ' LEE ', email: 'f7@x.test' },
        { id: 'f8', name: 'Pat Q', email: 'f8@x.test', profile: { firstName: 'Pat', lastName: 'Smith' } },
        { id: 'f9', name: '  Dee Lee  ', email: 'f9@x.test', profile: { firstName: 'Dee', lastName: 'Lee' } },
        { id: 'f10', name: '', email: 'blank@x.test' },
        null,                                                                          // not a row: NOT NULL refuses it
    ];
    const { rows, renamed, dropped } = restorableMembers(roster, file);
    assert.equal(rows.length, file.length, 'none dropped');
    assert.deepEqual(dropped, []);
    for (const i of [0, 1, 2, 3, 4, 11]) assert.equal(rows[i], file[i], `row ${i} goes as it is`);
    assert.equal(rows[5].name, 'pat smith (2)', 'a taken name is numbered');
    assert.deepEqual([rows[5].profile.firstName, rows[5].profile.lastName, rows[5].profile.title], [null, null, 'AE'],
        'REGRESSION: a First/Last that rebuild the taken name are kept — the member\'s next save is refused for good');
    assert.deepEqual([rows[6].name, rows[7].name], ['Lee', 'LEE (2)'], 'two file rows of one name: the second is numbered');
    assert.equal(rows[8].name, 'Pat Q');
    assert.deepEqual([rows[8].profile.firstName, rows[8].profile.lastName], [null, null], 'a First/Last that spell ANOTHER name go');
    assert.equal(rows[9].name, 'Dee Lee', 'trimmed');
    assert.deepEqual([rows[9].profile.firstName, rows[9].profile.lastName], ['Dee', 'Lee'], 'a First/Last that spell the name are kept');
    assert.equal(rows[10].name, 'blank@x.test', 'no name: the address');
    assert.deepEqual(renamed, [
        { id: 'f5', from: 'pat smith', to: 'pat smith (2)' },
        { id: 'f7', from: 'LEE', to: 'LEE (2)' },
        { id: 'f10', from: '', to: 'blank@x.test' },
    ]);
    assert.deepEqual(file[5].profile, { firstName: 'Pat', lastName: 'Smith', title: 'AE' }, 'the file\'s own rows are not changed');
    assert.deepEqual(restorableMembers(roster, undefined), { rows: [], renamed: [], dropped: [] });
});

// backup.mjs inserts the file's rows with onConflictDoNothing (its row-by-row fallback skips
// a row the database refuses) against the users table's own keys (db/schema.ts): the id,
// global; (org, email); (org, Clerk id), NULLs distinct; id, name and email NOT NULL. A
// number sent for a text column is stored as its text.
const insertLikeTheRestore = (table, orgId, rows) => {
    for (const r of rows) {
        if (r == null || typeof r !== 'object' || r.id == null || r.email == null || r.name == null) continue;
        const id = String(r.id), email = String(r.email), clerk = r.clerkUserId == null ? null : String(r.clerkUserId);
        if (table.some((t) => t.id === id)) continue;
        if (table.some((t) => t.orgId === orgId && t.email === email)) continue;
        if (clerk !== null && table.some((t) => t.orgId === orgId && t.clerkUserId === clerk)) continue;
        table.push({ id, orgId, name: String(r.name), email, clerkUserId: clerk });
    }
};
const pairsIn = (table, orgId) => {
    const keys = table.filter((t) => t.orgId === orgId).map((t) => nameKey(t.name));
    return keys.filter((k, i) => keys.indexOf(k) !== i);
};

test('restorableMembers: a hand-edited file makes no pair — only this org\'s members excuse a row, never an earlier row of the file; a blank or non-text id or address is dropped; the last name it could take, the id, is checked too', () => {
    const table = [
        { id: 'u1', orgId: 'A', name: 'Pat Smith', email: 'pat@x.test', clerkUserId: 'c1' },
        { id: 'idB', orgId: 'B', name: 'Bo B', email: 'b@x.test', clerkUserId: null },        // another org's row: its id is global
        { id: 'idB2', orgId: 'B', name: 'Cy B', email: 'c@x.test', clerkUserId: null },
    ];
    const roster = table.filter((t) => t.orgId === 'A');
    const file = [
        { id: 'n1', name: 'Pat Smith', email: '' },                       // '' inserts: dropped
        { id: 'idB', name: 'Pat Smith', email: 'q@x.test' },              // the insert skips it (org B holds the id); nothing here can know
        { id: 'n2', name: 'Pat Smith', email: 'q@x.test' },               // the address of the row above: NOT excused by it
        { id: 'idB2', name: 'Pat Smith', email: 'r@x.test', clerkUserId: 'cX' },
        { id: 'n3', name: 'Pat Smith', email: 's@x.test', clerkUserId: 'cX' },   // the Clerk id of the row above: NOT excused by it
        { id: '', name: 'Pat Smith', email: 'e@x.test' },                 // '' inserts: dropped
        { id: 0, name: 'Pat Smith', email: 'z@x.test' },                  // 0 inserts as '0': dropped
        { id: 7, name: 'Pat Smith', email: 'seven@x.test' },              // not text: dropped
        { id: 'n9', name: '', email: 0 },                                  // not text: dropped
    ];
    const { rows, renamed, dropped } = restorableMembers(roster, file);
    assert.deepEqual(rows.map((r) => [r.id, r.name]), [['idB', 'Pat Smith (2)'], ['n2', 'Pat Smith (3)'], ['idB2', 'Pat Smith (4)'], ['n3', 'Pat Smith (5)']],
        'REGRESSION: a row excused by an earlier row of the file keeps a name a member here has — and lands');
    assert.deepEqual(dropped, [
        { id: 'n1', name: 'Pat Smith', why: 'blank' }, { id: '', name: 'Pat Smith', why: 'blank' },
        { id: 0, name: 'Pat Smith', why: 'blank' }, { id: 7, name: 'Pat Smith', why: 'blank' }, { id: 'n9', name: '', why: 'blank' },
    ], 'REGRESSION: a row whose id or address is \'\' or 0 goes as filed — and lands');
    assert.equal(renamed.length, 4);
    insertLikeTheRestore(table, 'A', rows);
    assert.deepEqual(table.filter((t) => t.orgId === 'A').map((t) => t.name), ['Pat Smith', 'Pat Smith (3)', 'Pat Smith (5)']);
    assert.deepEqual(pairsIn(table, 'A'), [], 'no two members of the org share a name');
    // The builder's own file, through the same insert: the rows it lets go as they are never land.
    const t2 = [{ id: 'u1', orgId: 'A', name: 'Pat Smith', email: 'pat@x.test', clerkUserId: 'c1' }];
    insertLikeTheRestore(t2, 'A', restorableMembers(t2.slice(), [
        { id: 'u1', name: 'Pat Smith', email: 'other@x.test' }, { id: 'f1', name: 'Pat Smith', email: 'pat@x.test' },
        { id: 'f2', name: 'Pat Smith', email: 'f2@x.test', clerkUserId: 'c1' }, { name: 'Pat Smith', email: 'f3@x.test' }, { id: 'f4', name: 'Pat Smith' }, null,
    ]).rows);
    assert.deepEqual(t2.map((t) => t.id), ['u1'], 'every row it lets go as filed is one the insert skips');

    // Every numbered name taken: the id is the last name it could take — checked like the rest.
    const full = [{ id: 'x1', orgId: 'A', name: 'Q', email: 'x1@x.test', clerkUserId: null }, { id: 'e1', orgId: 'A', name: 'm@x.test', email: 'e1@x.test', clerkUserId: null }];
    for (let n = 2; n <= 20; n++) full.push({ id: `x${n}`, orgId: 'A', name: `Q (${n})`, email: `x${n}@x.test`, clerkUserId: null }, { id: `e${n}`, orgId: 'A', name: `m@x.test (${n})`, email: `e${n}@x.test`, clerkUserId: null });
    const ex = restorableMembers(full.slice(), [{ id: 'Q', name: 'Q', email: 'm@x.test' }, { id: ' Q free ', name: 'Q', email: 'm@x.test' }]);
    assert.deepEqual(ex.dropped, [{ id: 'Q', name: 'Q', why: 'taken' }], 'REGRESSION: the id it fell back to was never checked — a member here is named "Q"');
    assert.deepEqual(ex.rows.map((r) => [r.id, r.name]), [[' Q free ', 'Q free']], 'a free id is the name, trimmed');
    insertLikeTheRestore(full, 'A', ex.rows);
    assert.deepEqual(pairsIn(full, 'A'), []);
});

test('the restore\'s words: who was renamed, and on its own line who had no name in the file; a row it dropped is an error', () => {
    assert.deepEqual(restoreNotes([]), []);
    assert.deepEqual(restoreNotes(undefined), []);
    assert.deepEqual(restoreNotes([{ id: 'f5', from: 'pat smith', to: 'pat smith (2)' }]),
        ['1 member was restored under another name — a member of this workspace already has theirs: "pat smith" as "pat smith (2)".']);
    assert.deepEqual(restoreNotes([{ id: 'f5', from: 'pat smith', to: 'pat smith (2)' }, { id: 'f10', from: '', to: 'blank@x.test' }, { id: 'f7', from: 'LEE', to: 'LEE (2)' }, { id: 'f11', from: '', to: 'b2@x.test (2)' }]), [
        '2 members were restored under another name — a member of this workspace already has theirs: "pat smith" as "pat smith (2)", "LEE" as "LEE (2)".',
        '2 members were restored with no name in the file — named by their address: "blank@x.test", "b2@x.test (2)".',
    ], 'REGRESSION: a member the file gave no name is said to have a name another member has');
    assert.deepEqual(restoreNotes([{ id: 'f10', from: '', to: 'blank@x.test' }]), ['1 member was restored with no name in the file — named by their address: "blank@x.test".']);

    assert.deepEqual(droppedErrors([]), []);
    assert.deepEqual(droppedErrors([{ id: 'n1', name: 'Pat Smith', why: 'blank' }, { id: 'Q', name: 'Q', why: 'taken' }, { id: 0, name: '', why: 'blank' }]), [
        'users: 2 member rows were not restored — the file gives no usable id or email address: "Pat Smith", one with no name',
        'users: 1 member row was not restored — every name the restore could give is held by a member here: "Q"',
    ]);
});

test('the team import refuses a name already on the team, or earlier in the file, in any spacing', () => {
    const conflicts = userConflicts([
        { email: 'p2@y.test', memberName: 'pat smith' },      // the roster's 'Pat  Smith'
        { email: 'q2@y.test', memberName: 'DEE  LEE' },       // the roster's 'Dee Lee'
        { email: 'lee1@y.test', memberName: 'Lee Ann' },
        { email: 'lee2@y.test', memberName: 'lee  ann' },
        { email: 'kim1@y.test', memberName: 'Kim  Lee' },
        { email: 'kim2@y.test', memberName: 'kim lee' },
    ], { roster: [{ id: 'u1', name: 'Pat  Smith', email: 'pat@x.test' }, { id: 'u2', name: 'Dee Lee', email: 'dee@x.test' }] });
    assert.deepEqual(conflicts.map((c) => [c.incomingIndex, c.matchReason]), [
        [0, 'a member is already named "pat smith"'],
        [1, 'a member is already named "DEE  LEE"'],
        [3, 'an earlier row is also named "lee  ann"'],
        [5, 'an earlier row is also named "kim lee"'],
    ]);
});

test('every name a function file or the team import takes from memberName.js is one it exports', () => {
    // function-imports.test.mjs checks only .mjs targets: a typo here would first fail at deploy.
    for (const [file, spec] of [
        ['netlify/functions/users.mjs', '../../src/utils/memberName.js'],
        ['netlify/functions/_lib.mjs', '../../src/utils/memberName.js'],
        ['netlify/functions/users-sync.mjs', '../../src/utils/memberName.js'],
        ['netlify/functions/backup.mjs', '../../src/utils/memberName.js'],
        ['src/utils/userImport.js', './memberName.js'],
    ]) {
        const ast = parse(read(file), { sourceType: 'module', plugins: ['jsx', 'topLevelAwait'] });
        const imports = ast.program.body.filter((n) => n.type === 'ImportDeclaration' && n.source.value === spec);
        assert.equal(imports.length, 1, `${file}: one import from ${spec}`);
        for (const s of imports[0].specifiers) {
            assert.equal(s.type, 'ImportSpecifier', `${file}: a named import`);
            assert.ok(s.imported.name in memberName, `${file} imports "${s.imported.name}", which memberName.js does not export`);
        }
    }
});

// ── PINS ─────────────────────────────────────────────────────────────────────

test('users.mjs: the self PUT, the Admin/Manager PUT and the create decide the name they would write — a taken one is a 409 NAME_TAKEN; names are trimmed', () => {
    const u = code(read('netlify/functions/users.mjs'));
    assert.ok(u.includes("import { nameRefusal, firstFreeName, numbered, nameTakenMessage } from '../../src/utils/memberName.js';"));
    assert.match(u, /import \{ [^}]*memberNamesOf[^}]* \} from '\.\/_lib\.mjs';/);
    assert.ok(u.includes("    const nameTaken = (message) => ({ statusCode: 409, headers, body: JSON.stringify({ error: message, field: 'name', code: 'NAME_TAKEN' }) });"),
        'one refusal: the screens show `error`, `field` says which');
    assert.ok(u.includes("        name:         ((data.firstName || '') + ' ' + (data.lastName || '')).trim() || String(data.name ?? '').trim() || 'Unnamed User',"),
        'a name is trimmed on write');

    const self = between(u, 'const own  = { id: data.id, ...pickSelfEditable(data) };', 'invalidateRoster(orgId);');
    order(self,
        'const clean = withRole(',
        '            const selfNameTaken = nameRefusal(await memberNamesOf(orgId), clean.name, data.id);',
        '            if (selfNameTaken) return nameTaken(selfNameTaken);',
        '.set({ ...updateData, profile: keepQuotaPlans(updateData.profile), clerkUserId: userId, updatedAt: new Date() })');   // update-only (state §0.202)

    const create = between(u, "            const createRole = data.userType || data.role || 'User';", "        if (event.httpMethod === 'PUT') {");
    order(create,
        '                if (taken) {',
        '                const clean = withRole(sanitize({ ...data, status: null, active: true, id: newUserId(), clerkUserId: null }), createRole);',
        '                const newNameTaken = nameRefusal(await memberNamesOf(orgId), clean.name);',
        '                if (newNameTaken) return nameTaken(newNameTaken);',
        '                const result = await upsertUser(clean);');

    const put = between(u, "        if (event.httpMethod === 'PUT') {", "        if (event.httpMethod === 'DELETE') {");
    order(put,
        "                    clean.profile = { ...clean.profile, status:",
        '                const putNameTaken = nameRefusal(await memberNamesOf(orgId), clean.name, data.id);',
        '                if (putNameTaken) return nameTaken(putNameTaken);',
        '                const result = await upsertUser(clean, { updateOnly: true });');
});

test('users.mjs: an invitation\'s name is decided before Clerk is called — a given name taken is refused, none given is the address\'s front part numbered, and each row joins the names the batch checks', () => {
    const u = code(read('netlify/functions/users.mjs'));
    const inv = between(u, "            if (data.action === 'invite') {", "            const createRole = data.userType || data.role || 'User';");
    order(inv,
        '                const roster = await memberNamesOf(orgId);',
        '                for (const invite of invites) {',
        "                    const givenName = typeof invite.name === 'string' ? invite.name.trim().slice(0, 255) : '';",
        "                    const localPart = email.split('@')[0] || email;",
        '                    const newRow = !roster.some((u) => u.email === email);',
        '                    const rowName = givenName ? (nameRefusal(roster, givenName) ? null : givenName) : firstFreeName(roster, numbered(localPart));',
        '                    if (newRow && !rowName) { errors.push({ email, error: nameTakenMessage(givenName || localPart) }); continue; }',
        '                    try {',
        'createOrganizationInvitation(',
        '                                name:      rowName ?? email,',
        '                            results.push(flatten(row));',
        '                            roster.push({ id: row.id, name: row.name, email: row.email });');
    assert.equal(count(inv, 'const givenName = '), 1, 'decided once, above the Clerk call');
});

test('_lib.mjs: memberNamesOf reads this org\'s members fresh; a first sign-in whose name a member has is numbered', () => {
    const l = code(read('netlify/functions/_lib.mjs'));
    assert.ok(l.includes("import { firstFreeName, numbered } from '../../src/utils/memberName.js';"));
    const fn = between(l, 'export async function memberNamesOf(orgId) {', '\n}');
    assert.ok(fn.includes("    if (!orgId) throw new Error('_lib.memberNamesOf: orgId is required.');"));
    assert.ok(fn.includes('.from(users).where(eq(users.orgId, orgId));'), 'this org\'s rows, every one of them');
    assert.ok(!/orgRoster|rosterCache/.test(fn), 'never the 30 s roster cache: a write decides on it');
    assert.ok(l.indexOf('export async function memberNamesOf(') < l.indexOf('export async function ensureRosterRow('), 'outside ensureRosterRow (org-roles.test reads its body for users.name)');
    const ens = between(l, 'export async function ensureRosterRow(', "console.warn('_lib.ensureRosterRow:', e.message);");
    order(ens,
        "        const clerkName = ((cu?.firstName || '') + ' ' + (cu?.lastName || '')).trim();",
        '        const name = firstFreeName(await memberNamesOf(orgId), numbered(clerkName || email || clerkUserId)) || clerkUserId;',
        "            id: 'usr_' + randomUUID(), clerkUserId, orgId, name,");
});

test('users-sync.mjs: a new member whose name a member has is numbered — kept current through the run, a dry run included; an existing row is never renamed', () => {
    const s = code(read('netlify/functions/users-sync.mjs'));
    assert.ok(s.includes("import { firstFreeName, numbered } from '../../src/utils/memberName.js';"));
    order(s,
        'if (r.clerkUserId) dbByClerkId.set(r.clerkUserId, r);',
        '        const named = dbRows.map((r) => ({ id: r.id, name: r.name }));',
        'for (let i = 0; i < detail.length; i++) {',
        '                const rowId = newUserId();',
        '                const rowName = firstFreeName(named, numbered(name)) || rowId;',
        '                if (!dryRun) {',
        '                        id:          rowId,',
        '                        name:        rowName,',
        '                named.push({ id: rowId, name: rowName });',
        '                summary.created.push({ email, name: rowName, role });');
    assert.ok(!/\bpatch\.name\s*=|patch\[['"]name['"]\]/.test(s), 'the update never takes a name (its note says why)');
});

test('backup.mjs: a member the file brings in under a taken name is restored numbered and said so — only once its row is here; a row it drops is an error; names that cannot be checked restore no member', () => {
    const b = code(read('netlify/functions/backup.mjs'));
    assert.ok(b.includes("import { serverErrorBody, auditAs, memberNamesOf } from './_lib.mjs';"));
    assert.ok(b.includes("import { restorableMembers, restoreNotes, droppedErrors } from '../../src/utils/memberName.js';"));
    order(b,
        '            const errs = [];',
        '                try { const own = restorableMembers(await memberNamesOf(orgId), ents.users); ents.users = own.rows; renamedMembers = own.renamed; errs.push(...droppedErrors(own.dropped)); }',
        '                catch (e) { ents.users = []; ',
        '            for (const { key, table } of crmEntities) {',
        "                try { imported += await upsertChunked(table, key === 'settings' ? ownSettings(rows) : rows); }",
        '                    const landed = new Set((await memberNamesOf(orgId)).map((u) => u.id));',
        '                    notes.push(...restoreNotes(renamedMembers.filter((m) => landed.has(m.id))));',
        '                body: JSON.stringify({ ok: imported > 0, imported, unreached: missed, errors: errs, notes, snapId }),');
    assert.ok(!/errs\.push\([^)]*renamed/.test(b), 'a rename is not an error (errs marks the snapshot partial)');
});

test('the screens: the profile panel sends what changed, shows a refusal and takes the stored name into the roster on screen; the Full name clears First/Last; the restore says who it renamed, each on its own line; the new-member window\'s button', () => {
    const h = code(read('src/components/layout/AppHeader.jsx'));
    assert.ok(h.includes("    const [profileError, setProfileError]       = useState('');"));
    const save = between(h, '    const saveProfile = async (updates) => {', '    const togglePref = ');
    assert.ok(save.includes('body: JSON.stringify({ id: myProfile.id, ...updates }),'), 'REGRESSION: the whole cached row is sent again — a stale First/Last undoes a rename');
    assert.ok(!save.includes('myDbUser') && !save.includes('console.error'), 'not looked up in the roster; a refusal is not only logged');
    order(save,
        'const askedOrg = requestOrg();',
        'const undo = Object.fromEntries(',
        "dbFetch('/.netlify/functions/users?me=true'",
        'const data = await res.json().catch(() => ({}));',
        'if (!stillOrg(askedOrg)) return;',
        'setMyProfile(prev => ({ ...(prev||{}), ...undo }));',
        'setProfileError(`Not saved — ${data.error ||',
        'if (data.user) {',
        'setMyProfile(prev => ({ ...(prev||{}), ...data.user }));',
        'setSettings(prev => ({ ...prev, users: (prev.users||[]).map(u => u.id === data.user.id ? { ...u, name: data.user.name } : u) }));',
        '} catch (err) {',
        'if (!stillOrg(askedOrg)) return;',
        'setMyProfile(prev => ({ ...(prev||{}), ...undo }));');
    assert.equal(count(save, '...undo }));'), 2, 'a refusal and a failure both put the screen back');
    // The roster on screen takes the stored name too: Home, Reports and a Manager's reps
    // list find "me" by it (u.name === currentUser) — currentUser is the profile's name.
    assert.ok(h.includes('        settings, setSettings, currentUser, userRole, clerkUser, isMobile,'),
        'REGRESSION: a rename from the panel leaves the roster on the old name — every "me" lookup by name finds nobody until a reload');
    assert.ok(h.includes("    useEffect(() => { setProfileError(''); }, [showProfilePanel, activeOrgId]);"), 'a refusal goes with its panel and its org');
    assert.ok(h.includes('{profileError && <div role="alert"'), 'and it is shown');

    const s = code(read('src/Tabs/settings/people/UsersDetail.jsx'));
    const profile = between(s, 'const UserProfilePage = ', 'export const UsersDetail = ');
    assert.ok(profile.includes("    const handleChange = (field, val) => setForm(prev => ({ ...prev, [field]: val, ...(field === 'name' ? { firstName: null, lastName: null } : {}) }));"),
        'REGRESSION (Jeff: "Yes, Full name wins"): an edited Full name loses to the stored First/Last');
    assert.ok(profile.includes("        if (!String(form.name ?? '').trim()) { setError('A member needs a name.'); return; }"));
    order(profile,
        'body:JSON.stringify(toSave) });',
        'const d = await resp.json().catch(() => ({}));',
        'if (!stillOrg(askedOrg)) return;',
        "if (!resp.ok) throw new Error(d.error || 'Save failed');",
        'const storedName = d.user?.name ?? toSave.name;',
        '{ ...u, ...toSave, name: storedName }',
        'setForm(prev => ({ ...prev, name: storedName }));');

    const m = code(read('src/components/modals/UserModal.jsx'));
    assert.ok(m.includes('Back to the form') && !m.includes('Fix Email'), 'a refused name is not an email to fix');
    const bd = code(read('src/Tabs/settings/data/BackupDetail.jsx'));
    assert.ok(bd.includes('{result.notes?.length > 0 && ('), 'the restore says who it renamed');
    assert.ok(bd.includes('{result.notes.map((note, i) => <div key={i}>{note}</div>)}') && !bd.includes('result.notes.join('), 'each note on its own line');

    const ui = code(read('src/utils/userImport.js'));
    assert.ok(ui.includes("import { nameKey } from './memberName.js';"));
    for (const line of [
        '    if (rosterNames.has(nameKey(invite.name))) return',
        '    if (seenNames.has(nameKey(invite.name))) return',
        '        if (nameKey(u.name)) rosterNames.add(nameKey(u.name));',
        '        ctx.seenNames.add(nameKey(invite.name));',
    ]) assert.ok(ui.includes(line), line);
    assert.ok(!/norm\((invite|u)\.name\)/.test(ui), 'no name compared by the email key');
});

// ── THE GUARD ────────────────────────────────────────────────────────────────

const isFnNode = (n) => n && /^(ArrowFunctionExpression|FunctionExpression|FunctionDeclaration|ObjectMethod|ClassMethod)$/.test(n.type);
const VIA = /^(insert|update|delete|from)$/;
const onUsersTable = (call) => {
    let n = call.callee.object;
    while (n) {
        if (n.type === 'CallExpression') {
            const c = n.callee;
            if (c.type === 'MemberExpression' && /^(insert|update)$/.test(c.property?.name || '') && n.arguments.length === 1 && n.arguments[0].type === 'Identifier' && n.arguments[0].name === 'users') return true;
            n = c.type === 'MemberExpression' ? c.object : null;
        } else if (n.type === 'MemberExpression') n = n.object;
        else if (n.type === 'AwaitExpression') n = n.argument;
        else return false;
    }
    return false;
};
// An argument that names nothing: an object literal with no top-level `name` and no spread.
const namesSomething = (arg) => !(arg && arg.type === 'ObjectExpression' && arg.properties.every((p) => p.type === 'ObjectProperty' && !p.computed && (p.key.name ?? p.key.value) !== 'name'));
// Every place a file may write users.name: a .values / .set / onConflictDoUpdate set on
// insert(users) or update(users) that names something, and the table handed on as a value.
export const usersWrites = (file, src) => {
    const ast = parse(src, { sourceType: 'module', plugins: ['jsx', 'topLevelAwait'] });
    if (!ast.program.body.some((n) => n.type === 'ImportDeclaration' && /db\/schema/.test(n.source.value) && n.specifiers.some((s) => s.local?.name === 'users'))) return [];   // _jobRoster.mjs names a parameter `users`
    const out = [];
    const visit = (node, parent, key, fns) => {
        if (!node || typeof node.type !== 'string') return;
        let here = fns;
        if (isFnNode(node)) here = [...fns, node.id?.name || (parent?.type === 'VariableDeclarator' ? parent.id?.name : null) || fns[fns.length - 1] || '(top)'];
        const where = here[here.length - 1] || '(top)';
        if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression' && onUsersTable(node)) {
            const how = node.callee.property?.name;
            if ((how === 'values' || how === 'set') && namesSomething(node.arguments[0])) out.push(`${file} ${where} .${how}`);
            if (how === 'onConflictDoUpdate') {
                const set = node.arguments[0]?.properties?.find((p) => p.type === 'ObjectProperty' && (p.key.name ?? p.key.value) === 'set');
                if (set && namesSomething(set.value)) out.push(`${file} ${where} .onConflictDoUpdate set`);
            }
        }
        if (node.type === 'Identifier' && node.name === 'users') {
            const ok = parent?.type === 'ImportSpecifier'
                || (parent?.type === 'MemberExpression' && (key === 'object' || (key === 'property' && !parent.computed)))
                || (parent?.type === 'ObjectProperty' && key === 'key' && !parent.computed)
                || (parent?.type === 'CallExpression' && key === 'arguments' && parent.callee.type === 'MemberExpression' && VIA.test(parent.callee.property?.name || ''));
            if (!ok) out.push(`${file} ${where} value`);
        }
        for (const k of Object.keys(node)) {
            if (k === 'loc' || k === 'start' || k === 'end' || k === 'extra') continue;
            const v = node[k];
            if (Array.isArray(v)) v.forEach((c) => visit(c, node, k, here));
            else if (v && typeof v.type === 'string') visit(v, node, k, here);
        }
    };
    visit(ast.program, null, null, []);
    return out;
};
// Each decided through memberName.js (the test below names the decider of each).
// _links.mjs clearMemberLinks: reads the members a restore landed; its .set names no name (state §0.205)
const LISTED = ['_lib.mjs ensureRosterRow .values', '_links.mjs clearMemberLinks value', 'backup.mjs handler value', 'users-sync.mjs handler .set', 'users-sync.mjs handler .values',
    'users.mjs handler .set', 'users.mjs upsertUser .onConflictDoUpdate set',   // the self-save's insert went (state §0.202)
    'users.mjs upsertUser .set',   // the PUT's update-only write (state §0.202) — its name decided above it (putNameTaken)
    'users.mjs upsertUser .values'];

test('THE GUARD: every write of a name to the users table is a listed site, and each decides the name through memberName.js', () => {
    const dir = new URL('netlify/functions/', ROOT);
    const files = readdirSync(dir).filter((f) => f.endsWith('.mjs')).sort();
    const found = files.flatMap((f) => usersWrites(f, readFileSync(new URL(f, dir), 'utf8'))).sort();
    assert.deepEqual(found, LISTED, 'a new writer of users.name — decide it through src/utils/memberName.js, then list it here');
    const fn = (f) => code(read(`netlify/functions/${f}`));
    const u = fn('users.mjs');
    assert.ok(u.includes('const selfNameTaken = nameRefusal(await memberNamesOf(orgId), clean.name, data.id);'), 'users.mjs handler: the self PUT');
    assert.equal((u.match(/upsertUser\(/g) || []).length, 3, 'upsertUser is reached from the invite, the create and the PUT — no fourth');
    for (const decider of ['nameRefusal(roster, givenName)', 'firstFreeName(roster, numbered(localPart))', 'const newNameTaken = nameRefusal(await memberNamesOf(orgId), clean.name);', 'const putNameTaken = nameRefusal(await memberNamesOf(orgId), clean.name, data.id);']) {
        assert.ok(u.includes(decider), `users.mjs: ${decider}`);
    }
    assert.ok(fn('_lib.mjs').includes('firstFreeName(await memberNamesOf(orgId), numbered('), '_lib.mjs ensureRosterRow');
    const sync = fn('users-sync.mjs');
    assert.ok(sync.includes('firstFreeName(named, numbered(name))'), 'users-sync.mjs: the create');
    assert.ok(!/\bpatch\.name\s*=|patch\[['"]name['"]\]/.test(sync), 'users-sync.mjs: the update takes no name');
    assert.ok(fn('backup.mjs').includes('restorableMembers(await memberNamesOf(orgId), ents.users)'), 'backup.mjs: the restore');
    for (const f of files) {
        const src = code(readFileSync(new URL(f, dir), 'utf8'));
        assert.ok(!/\busers\s+as\s+\w+/.test(src), `${f}: the users table under another name`);
        assert.ok(!/\b(insert\s+into|update)\s+"?users"?\b/i.test(src), `${f}: a raw SQL write of users`);
    }
});

test('the guard sees what it is for: a spread or a variable written to users, a name in a literal, the table handed on — and not a write that names nothing', () => {
    const fixture = [
        "import { users } from '../../db/schema.js';",
        'async function a(db, x) { await db.update(users).set({ ...x }); }',
        "async function b(db) { await db.update(users).set({ role: 'User', updatedAt: 1 }); }",
        "async function c(db) { await db.insert(users).values({ id: 1, name: 'n' }); }",
        'function d() { return [{ table: users }]; }',
        'async function e(db) { return db.select().from(users).where(users.id); }',
        'async function f(db, p) { await db.update(users).set(p); }',
        'async function g(db) { await db.insert(users).values({ id: 1 }).onConflictDoUpdate({ target: users.id, set: { ...p } }); }',
    ].join('\n');
    assert.deepEqual(usersWrites('fx.mjs', fixture), ['fx.mjs a .set', 'fx.mjs c .values', 'fx.mjs d value', 'fx.mjs f .set', 'fx.mjs g .onConflictDoUpdate set']);
    assert.deepEqual(usersWrites('fx.mjs', fixture.split('\n').slice(1).join('\n')), [], 'a file that does not import the table has none');
});
