// tests/document-sharing.test.mjs
//
// Who a document is shared with, who may change it, and what it links to (state §0.183 —
// §0.182's found (a)–(d); Jeff: "fix all 4 when you have the chance. for number 2 build a
// picker"; who may change who sees it or delete it: "Owner or an Admin").
//
// Before: a Specific document read "Chosen people only" and no screen chose anyone — its
// list was taken unchecked, and compared to the caller's Clerk id while nothing could fill
// it — so it was its owner's alone. Anyone who could see a document could change who sees
// it, or delete it. A link stored the record id, name and line the browser sent,
// unchecked. And a restore answered with the version number alone, so the screens kept
// the size of the version restored over.
//
// tests/integration/documents-sharing.itest.mjs proves the server's rules against the
// database. Here: the picker's rules, run; and each rule where it lives, pinned (the
// mutation harness runs unit suites).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sharablePeople, sharedNames, toggled, peopleMatching } from '../src/utils/documentPeople.js';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8').replace(/\r\n/g, '\n');
const code = (src) => src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
const between = (src, from, to) => { const a = src.indexOf(from); assert.ok(a >= 0, from); const b = src.indexOf(to, a + from.length); assert.ok(b > a, to); return src.slice(a, b); };
const before = (s, first, second, why) => { const a = s.indexOf(first), b = s.indexOf(second); assert.ok(a >= 0, `missing: ${first}`); assert.ok(b >= 0, `missing: ${second}`); assert.ok(a < b, why); };
const fn = () => code(read('netlify/functions/documents.mjs'));

// ── the picker — run ────────────────────────────────────────────────────────

const ROSTER = [
    { id: 'usr_cara', name: 'Cara Diaz', active: true },
    { id: 'usr_abe', name: 'Abe Brook' },                       // a rep's directory row: no active flag means active
    { id: 'usr_gone', name: 'Gus Gone', active: false },        // deactivated
    { id: 'usr_me', name: 'Me Myself', active: true },
    { id: '', name: 'No id' },
    null,
];

test('the picker offers this org\'s active members, by name — the one choosing left out when the document is theirs', () => {
    assert.deepEqual(sharablePeople(ROSTER, { selfId: 'usr_me', selfIsOwner: true }).map((p) => p.id), ['usr_abe', 'usr_cara']);
    assert.deepEqual(sharablePeople(ROSTER, { selfId: 'usr_me', selfIsOwner: false }).map((p) => p.id), ['usr_abe', 'usr_cara', 'usr_me'],
        'an Admin sharing another\'s document may keep themselves on it');
    assert.deepEqual(sharablePeople(undefined), []);
    assert.equal(sharablePeople([{ id: 'usr_x', name: '  ' }])[0].name, 'Unnamed member');
});

test('the names a document is shared with are the roster\'s; one no longer on it reads "Former member"', () => {
    assert.deepEqual(sharedNames(['usr_cara', 'usr_left'], ROSTER), ['Cara Diaz', 'Former member']);
    assert.deepEqual(sharedNames(undefined, ROSTER), []);
});

test('choosing a person puts them in, and a chip\'s × takes them out', () => {
    assert.deepEqual(toggled(['a'], 'b'), ['a', 'b']);
    assert.deepEqual(toggled(['a', 'b'], 'a'), ['b']);
});

test('a search offers the members whose names hold what was typed — not those chosen, fifty at a time (Jeff: "A type ahead multi select"; state §0.194)', () => {
    const people = sharablePeople(ROSTER, { selfId: 'usr_me', selfIsOwner: true });
    assert.deepEqual(peopleMatching(people, '', []), { shown: [], more: 0 }, 'nothing typed, nothing offered');
    assert.deepEqual(peopleMatching(people, '   ', []), { shown: [], more: 0 });
    assert.deepEqual(peopleMatching(people, ' - ', []), { shown: [], more: 0 }, 'only punctuation typed is nothing typed (state §0.194)');
    assert.deepEqual(peopleMatching(people, 'BROOK', []).shown.map((p) => p.id), ['usr_abe'], 'in any case');
    assert.deepEqual(peopleMatching(people, 'a', []).shown.map((p) => p.id), ['usr_abe', 'usr_cara']);
    assert.deepEqual(peopleMatching(people, 'a', ['usr_cara']).shown.map((p) => p.id), ['usr_abe'], 'one chosen already is not offered again');
    const many = Array.from({ length: 60 }, (_, i) => ({ id: `usr_${i}`, name: `Sam ${String(i).padStart(2, '0')}` }));
    const found = peopleMatching(many, 'sam', []);
    assert.equal(found.shown.length, 50);
    assert.equal(found.more, 10, 'and how many more — keep typing');
});

test('the chooser is the deal\'s Contacts field\'s kind: chips with an ×, and a search', () => {
    const atoms = read('src/components/documents/atoms.jsx');
    const chooser = between(atoms, 'export function PeopleChooser(', '\n}\n');
    assert.ok(chooser.includes('placeholder="Search people to share with…"'));
    assert.ok(chooser.includes('const { shown, more } = peopleMatching(people, query, chosen);'), 'it offers only what matches');
    assert.ok(chooser.includes("onKeyDown={(e) => { if (e.key === 'Enter' && shown[0]) { e.preventDefault(); add(shown[0].id); } }}"), 'Enter takes the first');
    assert.ok(chooser.includes('<button type="button" onClick={() => onToggle && onToggle(id)} title={`Remove ${label(id)}`}'), 'a chip\'s ×');
    assert.ok(!chooser.includes('type="checkbox"'), 'no list of the whole org');
});

// ── the server ──────────────────────────────────────────────────────────────

test('a Specific document lists people by their app id, and the viewer carries the caller\'s', () => {
    const s = fn();
    const see = between(s, 'function canSee(doc, viewer) {', '\n}\n');
    assert.ok(see.includes('return !!viewer.appId && ids.includes(viewer.appId);'), 'the roster id, and none for a caller with no row');
    assert.ok(see.includes('if (doc.ownerId && doc.ownerId === viewer.userId) return true;'), 'the owner by the Clerk id a document is owned by');
    assert.ok(s.includes('const viewer = { userId, userRole, appId: await getCallerId(userId, orgId) };'));
});

test('who may change who sees a document, or delete it: its owner, or an Admin', () => {
    const s = fn();
    assert.ok(s.includes('const mayManage = (doc, viewer) => (!!doc.ownerId && doc.ownerId === viewer.userId) || isAdmin(viewer.userRole);'),
        'an unowned document is not every caller\'s (null === null)');
    const put = between(s, "if (event.httpMethod === 'PUT') {", "if (event.httpMethod === 'DELETE') {");
    before(put, "if ('visibility' in data || 'visibilityUserIds' in data) {", 'if (!mayManage(doc, viewer)) return { statusCode: 403,', 'a visibility change asks');
    before(put, 'if (!mayManage(doc, viewer)) return { statusCode: 403,', 'await db.update(documents)', 'before the write');
    assert.ok(put.includes('set.visibilityUserIds = who.ids;'), 'the list is the checked one');
    const del = s.slice(s.indexOf('const id = qs.id;'));
    before(del, 'if (doomed && !mayManage(doomed, viewer)) return { statusCode: 403,', 'r2().send(new DeleteObjectCommand', 'a delete asks before its objects go');
    const links = between(s, 'async function withLinks(orgId, docs, viewer) {', '\n}\n');
    assert.ok(links.includes('canManage: mayManage(d, viewer),'), 'and each document tells the screens');
});

test('a Specific list is this org\'s members — at least one; any other kind keeps none', () => {
    const who = between(fn(), 'async function whoMaySee(orgId, kind, ids, headers) {', '\n}\n');
    assert.ok(who.includes("if (!VISIBILITY_KINDS.has(kind)) return refuse('Unknown visibility.');"));
    assert.ok(who.includes("if (kind !== 'specific') return { ids: [] };"));
    assert.ok(who.includes("if (!wanted.length) return refuse('Choose at least one person to share it with.');"));
    assert.ok(who.includes('.where(and(eq(users.orgId, orgId), inArray(users.id, wanted)));'), 'this org\'s roster');
    assert.ok(who.includes("if (found.length !== wanted.length) return refuse('Choose people from this organization.');"));
});

test('a link names a record of this org the caller can see, under the record\'s own name', () => {
    const s = fn();
    const resolve = between(s, 'async function resolveLinks(auth, viewer, links, headers) {', '\n}\n');
    assert.ok(resolve.includes('.where(and(eq(table.id, recordId), eq(table.orgId, auth.orgId)));'), 'in this org');
    assert.ok(resolve.includes('visible = dealVisibleTo(row, dealCtx);'), 'a deal by the deals list\'s rule');
    assert.ok(resolve.includes("visible = scope === 'all' || (scope === 'own' && (!row.ownerId || row.ownerId === viewer.appId));"), 'the rest by theirs');
    assert.ok(resolve.includes('rows.push({ type, recordId, name: name(row) || null, sub: null });'), 'the record\'s name, not the browser\'s');
    assert.ok(s.includes("task:        { table: tasks,         name: (r) => r.title },"));
    assert.ok(s.includes("activity:    { table: activities,    name: (r) => r.subject || r.type },"));
    const create = between(s, "if (!action || action === 'create') {", "if (action === 'new-version') {");
    before(create, 'const linked = await resolveLinks(auth, viewer, asked, headers);', 'await db.insert(documents)', 'a create checks its links first');
    before(create, 'const who = await whoMaySee(orgId, visibility || \'team\', visibilityUserIds, headers);', 'await db.insert(documents)', 'and its people');
    const link = between(s, "if (action === 'link') {", "return { statusCode: 400, headers, body: JSON.stringify({ error: 'Unknown action' }) };");
    before(link, 'const linked = await resolveLinks(auth, viewer, asked, headers);', 'await insertLinks(orgId, id, linked.rows)', 'a link too');
});

test('a restore answers the document it left', () => {
    const restore = between(fn(), "if (action === 'restore-version') {", "if (action === 'link') {");
    assert.ok(restore.includes('.where(and(eq(documents.id, id), eq(documents.orgId, orgId))).returning();'));
    assert.ok(restore.includes('document: restored ? { ...restored, visibility: restored.visibilityKind } : null'));
    const hook = read('src/hooks/useDocuments.js');
    assert.ok(hook.includes("d.id === id ? { ...d, modifiedAt: new Date().toISOString(), ...(r.data.document || {}), version: r.data.version } : d));"),
        'the hook takes its size and file');
});

// ── the screens ─────────────────────────────────────────────────────────────

test('the rail: visibility and Delete are the manager\'s; Specific chooses people first and saves them with it', () => {
    const rail = read('src/components/documents/DocumentRail.jsx');
    assert.ok(rail.includes('disabled={!canEdit || !doc.canManage} onChange={onVisibility}'), 'locked for one who may not manage it');
    assert.ok(rail.includes('{canEdit && doc.canManage && ('), 'Delete');
    assert.ok(rail.includes("{canEdit && !doc.canManage && ("), 'and the reason, for a writer');
    const on = between(rail, 'const onVisibility = (v) => {', '\n    };');
    before(on, "if (v === 'specific') {", 'updateDocument(doc.id, { visibility: v })', 'Specific opens the people before anything is sent');
    assert.ok(rail.includes("const r = updateDocument && await updateDocument(doc.id, { visibility: 'specific', visibilityUserIds: picked });"), 'one PUT carries both');
    assert.ok(rail.includes('<button onClick={savePeople} disabled={picked.length === 0}'), 'not with no one');
    assert.ok(rail.includes("Shared with {sharedNames(doc.visibilityUserIds, settings?.users).join(', ') || 'no one'}"));
    assert.ok(read('src/Tabs/DocumentsTab.jsx').includes('onDelete={canEdit && menu.doc.canManage ? () => handleDelete(menu.doc) : undefined}'));
});

test('the upload rail: Specific asks for the people, and Upload waits for one', () => {
    const up = read('src/components/documents/DocumentUploadRail.jsx');
    assert.ok(up.includes("const blocked = !file || uploading || (!isVersion && visibility === 'specific' && sharedWith.length === 0);"));
    assert.ok(up.includes('<button onClick={submit} disabled={blocked}'));
    assert.ok(up.includes("visibilityUserIds: visibility === 'specific' ? sharedWith : []"), 'the create carries them');
    assert.ok(up.includes('sharablePeople(settings?.users, { selfId: currentUserId, selfIsOwner: true })'), 'the uploader owns it');
});
