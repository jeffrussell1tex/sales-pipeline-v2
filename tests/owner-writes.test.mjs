// tests/owner-writes.test.mjs
//
// §0.275 (OPEN_ITEMS §4.8, §0.273's found (1); Jeff, 20 Nov: "Delete ownership race", then "Whole class"): a rep's
// write was checked by a read (assertOwnership, or the bulk path's read) and then ran with no owner in its own filter —
// an Admin or Manager reassigning the row between the two let the rep delete it, or save over it, though it was no
// longer theirs. Each write the check gates now carries the owner in its own SQL — ownerMayWrite, mayMutate case for
// case — so a row reassigned since the check is touched by nothing: answered 403 (still there, another's) or 404 (gone);
// the bulk overwrite counts it forbidden. The accounts PUT, a batch, opens with a claim that aborts the whole batch.
//
// The census of 20 Nov (a map and verify workflow, 44 agents): thirteen writes a rep reaches — the contacts, activities
// and tasks DELETEs; the single PUTs of contacts, activities, tasks, leads, opportunities (and its team note) and
// accounts; the bulk PUTs of contacts, opportunities and accounts (bulkUpsert). Not in it: the accounts, leads and
// opportunities DELETEs (an Admin-only role gate after the ownership check — no rep reaches the write, and an Admin is
// not checked), every clear=true (Admin only), every create, and ai-score's two writes (the server's own values —
// Claude's cached reading and the deal's score, THE GUARD tests/deal-score-server.test.mjs; nothing a rep sends).
//
// The race itself, on the real test database: tests/integration/owner-race.itest.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { pgTable, text } from 'drizzle-orm/pg-core';
import { PgDialect } from 'drizzle-orm/pg-core';
import { ownerMayWrite, bulkUpsert } from '../netlify/functions/_bulk.mjs';
import { mayMutate } from '../netlify/functions/_ownership.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8').split('\r\n').join('\n');
const between = (src, from, to) => { const a = src.indexOf(from); assert.ok(a >= 0, from); const b = src.indexOf(to, a + from.length); assert.ok(b > a, to); return src.slice(a, b); };
const dialect = new PgDialect();
const render = (q) => dialect.sqlToQuery(q);
const t = pgTable('t', { id: text('id').notNull(), orgId: text('org_id').notNull(), ownerId: text('owner_id'), name: text('name') });

test('§0.275 ownerMayWrite: mayMutate in SQL — unassigned (blank or spaces) for anyone, an owned row for its owner by app id, trimmed; a caller with no app id only unassigned', () => {
    const asRep = render(ownerMayWrite(t.ownerId, 'usr_rep'));
    assert.equal(asRep.sql, `(coalesce(btrim("t"."owner_id"), '') = '' or btrim("t"."owner_id") = $1)`);
    assert.deepEqual(asRep.params, ['usr_rep']);
    for (const nobody of [null, undefined, '', 'user_clerk123', 'usr_']) {
        const q = render(ownerMayWrite(t.ownerId, nobody));
        assert.equal(q.sql, `coalesce(btrim("t"."owner_id"), '') = ''`, `a caller ${JSON.stringify(nobody)} writes only unassigned rows`);
        assert.deepEqual(q.params, []);
    }
    // The cases the SQL decides, against mayMutate's own answers (the SQL evaluated here as Postgres reads it: btrim
    // trims spaces, coalesce reads null as '').
    const sqlSays = (owner, caller) => {
        const o = owner == null ? '' : owner.replace(/^ +| +$/g, '');
        return o === '' || (typeof caller === 'string' && caller.startsWith('usr_') && caller.length > 4 && o === caller);
    };
    for (const owner of [null, '', '   ', 'usr_rep', ' usr_rep ', 'usr_other', 'user_clerk123', 'usr_rep2']) {
        for (const caller of ['usr_rep', null, 'user_clerk123']) {
            assert.equal(sqlSays(owner, caller), mayMutate({ ownerId: owner, callerId: caller, canSeeAll: false }), `owner ${JSON.stringify(owner)}, caller ${JSON.stringify(caller)}`);
        }
    }
});

// ── bulkUpsert, with a client that answers as Postgres would ──
const bulkClient = (stored, { skip = new Set() } = {}) => {
    const seen = { setWhere: null };
    const client = {
        select: (projection) => ({ from: () => ({ where: async () => stored.map((r) => Object.fromEntries(Object.keys(projection).map((k) => [k, r[k]]))) }) }),
        insert: () => ({ values: (chunk) => ({ onConflictDoUpdate: (cfg) => { seen.setWhere = cfg.setWhere; return { returning: async () => chunk.filter((r) => !skip.has(r.id)).map((r) => ({ id: r.id })) }; } }) }),
    };
    return { client, seen };
};
const ROWS = [{ id: 'c1', orgId: 'org_A', ownerId: 'usr_rep' }, { id: 'c2', orgId: 'org_A', ownerId: null }];

test("§0.275 bulkUpsert: a rep's overwrite writes each row only while still theirs or nobody's — one the write skipped (reassigned since its read) counted forbidden, not updated", async () => {
    const { client, seen } = bulkClient(ROWS, { skip: new Set(['c1']) });
    const r = await bulkUpsert({ table: t, rows: [{ id: 'c1', name: 'x' }, { id: 'c2', name: 'y' }], orgId: 'org_A', ownerColumn: t.ownerId, callerId: 'usr_rep', canSeeAll: false, client });
    assert.deepEqual(r, { updated: 1, notFound: [], forbidden: ['c1'] });
    const w = render(seen.setWhere);
    assert.equal(w.sql, `("t"."org_id" = $1 and (coalesce(btrim("t"."owner_id"), '') = '' or btrim("t"."owner_id") = $2))`);
    assert.deepEqual(w.params, ['org_A', 'usr_rep']);
});

test('§0.275 bulkUpsert: an Admin or Manager (canSeeAll) — and a table with no owner column — writes by the org alone, as before', async () => {
    for (const extra of [{ ownerColumn: t.ownerId, callerId: 'usr_admin', canSeeAll: true }, {}]) {
        const { client, seen } = bulkClient(ROWS);
        const r = await bulkUpsert({ table: t, rows: [{ id: 'c1', name: 'x' }], orgId: 'org_A', client, ...extra });
        assert.deepEqual(r, { updated: 1, notFound: [], forbidden: [] });
        assert.equal(render(seen.setWhere).sql, '"t"."org_id" = $1');
    }
});

// ── THE GUARD: every write the ownership check gates carries the owner in its own filter ──
const FNS = ['contacts', 'activities', 'tasks', 'leads', 'opportunities', 'accounts'];
const TABLE = { contacts: 'contacts', activities: 'activities', tasks: 'tasks', leads: 'leads', opportunities: 'opportunities', accounts: 'accounts' };
const ENTITY = { contacts: 'contact', activities: 'activity', tasks: 'task', leads: 'lead', opportunities: 'opportunity', accounts: 'account' };
// The ownership checks each file runs, by count: a new one is a new gated write, and fails until it is named here.
const CHECKS = { contacts: 2, activities: 2, tasks: 2, leads: 2, opportunities: 3, accounts: 2 };
// DELETEs no rep reaches: an Admin-only role gate after the ownership check, and an Admin is not checked.
const ADMIN_ONLY_DELETE = new Set(['leads', 'opportunities', 'accounts']);

test('§0.275 THE GUARD: each single PUT writes its row only while still the caller\'s or nobody\'s, and answers a missed write by missedWrite', () => {
    for (const f of FNS) {
        const src = read(`netlify/functions/${f}.mjs`);
        const T = TABLE[f];
        assert.equal(src.split('assertOwnership({').length - 1, CHECKS[f], `${f}: ${CHECKS[f]} ownership checks — a new one gates a new write: give the write the owner filter and name it here`);
        assert.equal(src.split('onConflictDoUpdate(').length - 1, 1, `${f}: one upsert that updates — the single PUT's`);
        if (f === 'accounts') {
            // Its batch's claim is the guard: it holds the row, locked, until the batch ends — so its upsert's setWhere
            // could decide nothing (the proof's one survivor of 20 Nov, an equivalent mutant), and names the org alone.
            assert.ok(src.includes('wrote = await db.batch([\n                    ...claim,\n'), 'accounts: the batch opens with the claim');
        } else {
            assert.ok(new RegExp(`setWhere: and\\(eq\\(${T}\\.orgId, orgId\\), mine\\)`).test(src), `${f}: the PUT's setWhere names the org and the owner filter`);
            assert.ok(!new RegExp(`setWhere: eq\\(${T}\\.orgId, orgId\\)`).test(src), `${f}: no setWhere by the org alone`);
        }
        const put = between(src, "if (event.httpMethod === 'PUT') {", "if (event.httpMethod === 'DELETE') {");
        const mine = put.lastIndexOf(`ownerWriteFilter({ table: ${T}, entity: '${ENTITY[f]}', orgId, userId, userRole })`);
        assert.ok((put.includes('assertOwnership({') && mine > put.lastIndexOf('assertOwnership({')) || f === 'opportunities', `${f}: the filter read after the check`);
        // Moved in §0.278 (the review): every missed write's answer awaited — THE GUARD's scan below.
        assert.ok(put.includes(`if (!upserted) return await missed`), `${f}: a PUT that touched no row answers by missedWrite (403 still there, 404 gone)`);
    }
});

test('§0.275 THE GUARD: the contacts, activities and tasks DELETEs delete only while still the caller\'s or nobody\'s; the other three are Admin only', () => {
    for (const f of FNS) {
        const src = read(`netlify/functions/${f}.mjs`);
        const T = TABLE[f];
        const del = between(src, "if (event.httpMethod === 'DELETE') {", 'return { statusCode: 405');
        const byId = del.split(`db.delete(${T}).where(and(eq(${T}.id, id), eq(${T}.orgId, orgId)`).length - 1;
        assert.equal(byId, 1, `${f}: one delete by id`);
        if (ADMIN_ONLY_DELETE.has(f)) {
            const gate = del.indexOf("const forbiddenDelete = requireRole(auth, ['Admin'], headers);");
            assert.ok(del.includes('assertOwnership({') && gate > del.indexOf('assertOwnership({') && gate < del.indexOf(`db.delete(${T}).where(and(eq(${T}.id, id)`), `${f}: no rep reaches the delete — the Admin gate before it (were it opened to reps, its delete takes the owner filter)`);
            assert.ok(del.includes('if (forbiddenDelete) return forbiddenDelete;'));
        } else {
            // Moved in §0.282: a contact's also names the merged-away condition.
            assert.ok(del.includes(`db.delete(${T}).where(and(eq(${T}.id, id), eq(${T}.orgId, orgId), mine${T === 'contacts' ? ', notMerged(contacts)' : ''})).returning();`), `${f}: the delete names the owner filter`);
            assert.ok(del.includes('assertOwnership({') && del.indexOf(`const mine = await ownerWriteFilter({ table: ${T}, entity: '${ENTITY[f]}', orgId, userId, userRole });`) > del.indexOf('assertOwnership({'), `${f}: read after the check`);
            assert.ok(del.includes(`if (!deletedRow) return ${T === 'contacts' ? "(await mergedDeleteRefusal({ kind: 'contact', id, orgId, headers, nameable })) || " : ''}await missedWrite({ table: ${T}, id, orgId, headers, gone: { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found', code: 'gone' }) } });`), `${f}: a missed delete — 403 still there, 404 gone`);   // moved in §0.282: a contact's miss asked as merged first
        }
    }
});

test("§0.275 THE GUARD: a deal's team note writes only while the deal is still the caller's or nobody's, and a missed write read again is refused as the check refuses", () => {
    const src = read('netlify/functions/opportunities.mjs');
    const branch = between(src, "if ('note' in data) {", "if ('comments' in data) return");
    assert.ok(branch.includes("const mine = await ownerWriteFilter({ table: opportunities, entity: 'opportunity', orgId, userId, userRole });"));
    assert.ok(branch.includes('notesStill(stored.comments), mine))'), 'the compare-and-set and the owner, in one WHERE');
    const reread = branch.indexOf('[stored] = await db.select().from(opportunities)');
    const again = branch.indexOf("const refusedNow = await assertOwnership({ table: opportunities, entity: 'opportunity', id: data.id, orgId, userId, userRole, headers, row: stored });");
    assert.ok(reread > 0 && again > reread && branch.indexOf('if (refusedNow) return refusedNow;') > again, 'read again, refused before trying again');
});

test("§0.275 THE GUARD: the accounts PUT's batch opens with the owner claim — reassigned or deleted since the check, nothing of it lands; its refusal read as missedWrite", () => {
    const src = read('netlify/functions/accounts.mjs');
    const put = between(src, "if (event.httpMethod === 'PUT') {", "if (event.httpMethod === 'DELETE') {");
    assert.ok(put.includes("const claim = ownerClaim(accounts, data.id, orgId, mine);"));
    assert.ok(put.includes('wrote = await db.batch([\n                    ...claim,\n                    db.insert(accounts)'), 'the claim first, then the account, its deal lifts and tier writes');
    assert.ok(put.includes('                if (!claimRefused(e)) throw e;\n                return await missedPut();\n'), 'the claim\'s refusal answered as a missed write; anything else thrown');
    assert.ok(put.includes('const [[upserted], ...lifts] = wrote.slice(claim.length);'));
    const lib = read('netlify/functions/_lib.mjs');
    assert.ok(lib.includes("export const ownerClaim = (table, id, orgId, filter) => (filter === undefined ? [] : [db.execute(sql`with c as (select ${table.id} from ${table} where ${table.id} = ${id} and ${table.orgId} = ${orgId} and ${filter} for update) select 1 / count(*) from c`)]);"), 'the claim: the row in this org, still the caller\'s or nobody\'s, locked for the batch — else 1 / 0');
    assert.ok(lib.includes("export const claimRefused = (e) => String(e?.cause?.code || e?.code || '') === '22012';"));
});

test("§0.275 the review: the deals bulk import's stage moves are the rows written — its audit line, its Slack post and its answer count none the batch refused (one reassigned since its read among them)", () => {
    const src = read('netlify/functions/opportunities.mjs');
    const bulk = between(src, 'const staged = applyStageChanges(', "if (!data.id) {");
    assert.ok(bulk.includes('const movedRows = staged.rows.filter(r => !unwritten.has(r.id) && resolveStageChange(r, priors.get(r.id), importDate).changed);'), 'the moves written, by the import\'s own rule');
    assert.ok(bulk.includes('const unwritten = new Set(') && bulk.indexOf('const movedRows') > bulk.indexOf('const unwritten = new Set('), 'after the write answered');
    assert.ok(bulk.includes('if (movedRows.length > 0) {') && bulk.includes('entityName: `${movedRows.length} deals`,') && bulk.includes('detail: `CSV import moved ${movedRows.length} of ${data.length} deals to a new stage`,'), 'the audit line counts them');
    assert.ok(bulk.includes('summary: bulkStageSummary(movedRows, priors)'), 'the Slack post summarises them');
    assert.ok(bulk.includes('stageChanged: movedRows.length,'), 'the answer counts them');
    assert.ok(!bulk.includes('staged.changedCount'), 'no count of the rows sent');
});

test("§0.276 THE GUARD: a SPIFF claim's save writes only what it names; a rep's only while the claim is still pending and still theirs, in the write's own WHERE; a missed write read again and answered in the check's words", () => {
    const src = read('netlify/functions/spiff-claims.mjs');
    const put = between(src, "if (event.httpMethod === 'PUT') {", "if (event.httpMethod === 'DELETE') {");
    assert.ok(put.includes('const isRep = !isAdmin && !isManager;') && put.includes('const me = isRep ? await getCallerName(auth.userId, orgId) : null;'), 'the rep named once — the name the check and the write both read');
    assert.ok(put.includes('if (!sameName(existing.repName, me)) {'), 'the check reads that name');
    assert.ok(put.includes('const named = Object.fromEntries(Object.entries(updateData).filter(([k]) => Object.hasOwn(changes, k)));'), 'the keys the save names, as sanitize stores them');
    assert.ok(put.includes('db.update(spiffClaims).set({ ...named, updatedAt: new Date() })') && !put.includes('set({ ...updateData'), 'never the whole row as read');
    // The review of §0.276: compared as the check read it — never normalised again in SQL, whose trim and case are not
    // sameName's — and for a rep alone (isRep: a Manager's save under it would match no rep and write nothing).
    assert.ok(put.includes('const stillTheirs = isRep\n                ? and(eq(spiffClaims.repName, existing.repName), eq(spiffClaims.status, existing.status))\n                : undefined;'), 'its rep and status as the check read them — for a rep alone');
    assert.ok(put.includes("const seen = Object.hasOwn(data, 'fromStatus') ? sql`coalesce(nullif(${spiffClaims.status}, ''), 'pending') = ${data.fromStatus || 'pending'}` : undefined;"), 'the status a screen saw, held');
    assert.ok(put.includes("if (Object.hasOwn(data, 'fromStatus') && typeof data.fromStatus !== 'string') return { statusCode: 400,"), 'a status is text');
    assert.ok(put.includes('.where(and(eq(spiffClaims.orgId, orgId), eq(spiffClaims.id, id), stillTheirs, seen))'), 'in the write\'s own WHERE');
    const missed = between(put, '            if (!updated) {\n', '\n            }\n');
    assert.ok(missed.includes("const [now] = await db.select().from(spiffClaims).where(and(eq(spiffClaims.id, id), eq(spiffClaims.orgId, orgId)));"), 'a missed write reads the claim again, in this org');
    const order = ['if (!now) return { statusCode: 404,', "if (isRep && (now.status || 'pending') !== 'pending') return { statusCode: 403, headers, body: JSON.stringify({ error: 'A claim can only be edited while it is pending.' }) };",
        "if (isRep && !sameName(now.repName, me)) return { statusCode: 403, headers, body: JSON.stringify({ error: 'You can only edit your own claims.' }) };",
        'return { statusCode: 409, headers, body: JSON.stringify({ error: `This claim is ${now.status || \'pending\'} now — it changed since it was loaded. Nothing was saved; reload to see it.` }) };'];
    order.forEach((line, i) => { assert.ok(missed.includes(line), line.slice(0, 60)); if (i) assert.ok(missed.indexOf(line) > missed.indexOf(order[i - 1]), 'in order'); });
});

test("§0.277 THE GUARD: a quote's save is one batch — the quote as read, its deal still the caller's or nobody's, then the deal's value and the quote; a create rides behind the deal's claim; a miss is read again", () => {
    const src = read('netlify/functions/quotes.mjs');
    const put = between(src, "if (event.httpMethod === 'PUT') {", "if (event.httpMethod === 'DELETE') {");
    // Moved in §0.280: the read's selection is STAMPED — the columns and the last edit as text, the one every answer hands out.
    assert.ok(put.includes('const [read] = await db.select(STAMPED()).from(quotes)'), 'read with its last edit as text');
    assert.ok(src.includes('const STAMPED = () => ({ ...getTableColumns(quotes), stamp: sql`${quotes.updatedAt}::text` });'), 'the stamp is the last edit as text');
    assert.ok(put.includes("const dealMine = await ownerWriteFilter({ table: opportunities, entity: 'opportunity', orgId, userId: auth.userId, userRole });"));
    const batch = between(put, 'wrote = await db.batch([\n', '                ]);');
    const order = ['rowAsRead(quotes, existing.id, orgId, stamp),', '...dealClaim,', '...(accepting ? [syncToOpportunity(orgId, existing.opportunityId, totals.totalValue)] : []),', 'db.update(quotes).set(payload).where(and(eq(quotes.id, existing.id), eq(quotes.orgId, orgId))).returning(STAMPED()),'];   // moved in §0.280: answered with its stamp
    order.forEach((line, i) => { assert.ok(batch.includes(line), line); if (i) assert.ok(batch.indexOf(line) > batch.indexOf(order[i - 1]), `in order: ${line}`); });
    assert.ok(!put.includes('await syncToOpportunity('), 'the deal\'s value never written apart from the quote');
    assert.ok(put.includes("if (!claimRefused(e)) throw e;\n                return await missedQuote(auth, existing.id, 'Forbidden: you can only change quotes on your own or unassigned deals', moved ? to : null, data);"));   // moved in §0.280: the body, for a save sent again
    // The review: the claim's own lines whole — an empty claim (its filter dropped) passes every other pin.
    assert.ok(put.includes('const dealClaim = ownerClaim(opportunities, existing.opportunityId, orgId, dealMine);'));
    const missed = between(src, 'async function missedQuote(auth, id, forbidden, moveTo = null, body = null) {', '\n}\n');   // moved in §0.280: the body, for a save sent again
    assert.ok(missed.includes('if (!now) return refuse(404, NOT_FOUND);') && missed.includes('if (!access.canRead) return refuse(404, NOT_FOUND);') && missed.includes('if (!access.canWrite) return refuse(403, forbidden);'));
    assert.ok(missed.includes("if (moveTo && now.status === moveTo) return { statusCode: 409, headers, body: JSON.stringify({ error: `This quote is ${moveTo} already.`, code: 'already' }) };"), 'the move it asked for made by a press in flight with it: done (the review)');
    // Moved in §0.280: changed since read is the stale answer, the quote as it stands with it (changedSince).
    assert.ok(missed.includes('const [now] = await db.select(STAMPED()).from(quotes)') && missed.includes('if (moveTo && now.status === moveTo)') && missed.indexOf('return changedSince(now);') > missed.indexOf('if (moveTo && now.status === moveTo)'), 'changed since read: 409 stale with the quote, last');
    const post = between(src, "if (event.httpMethod === 'POST') {", "if (event.httpMethod === 'PUT') {");
    assert.ok(post.includes('const claim = ownerClaim(opportunities, access.deal.id, orgId, dealMine);') && post.includes('const done = await db.batch([...claim, db.insert(quotes)'), 'a create behind the deal\'s claim');
    assert.ok(post.includes("return now.canRead ? refuse(403, 'Forbidden: you can only quote your own or unassigned deals') : refuse(404, 'Deal not found');"));
    const lib = read('netlify/functions/_lib.mjs');
    assert.ok(lib.includes('export const rowAsRead = (table, id, orgId, stamp) => db.execute(sql`with c as (select ${table.id} from ${table} where ${table.id} = ${id} and ${table.orgId} = ${orgId} and ${table.updatedAt}::text = ${stamp} for update) select 1 / count(*) from c`);'));
});

test('§0.277 THE GUARD: the quote email is claimed before it is sent — the quote in the status the checks read, its deal still the caller\'s or nobody\'s — and a send that fails puts the quote back', () => {
    const src = read('netlify/functions/quote-email.mjs');
    const claimAt = src.indexOf('const done = await db.batch([rowAsRead(quotes, quoteId, orgId, stamp), ...claim, db.update(quotes)');
    const sendAt = src.indexOf('await sendEmail({');
    assert.ok(claimAt > 0 && sendAt > claimAt, 'the claim before the email — an email cannot be taken back');
    assert.ok(src.includes("const claim = ownerClaim(opportunities, quote.opportunityId, orgId, dealMine);"));
    assert.ok(src.includes("const dealMine = await ownerWriteFilter({ table: opportunities, entity: 'opportunity', orgId, userId, userRole: auth.userRole });"), 'the deal\'s filter, whole (the review)');
    // The review: claimed on the quote as read — its stamp, not its status alone (a Draft edited since kept its status) —
    // and the quote locked before the deal, as the save locks them (opposite orders deadlocked).
    assert.ok(src.includes('const [read] = await db.select({ ...getTableColumns(quotes), stamp: sql`${quotes.updatedAt}::text` }).from(quotes)'), 'read with its last edit as text');
    assert.ok(src.includes('[claimed] = done[done.length - 1];'));
    assert.ok(src.includes("if (now.status === 'Sent to Customer') return { statusCode: 409, headers: responseHeaders, body: JSON.stringify({ error: 'This quote was just sent — it went once.', code: 'already' }) };"), 'a press in flight with one that sent it: done');
    assert.ok(src.includes('        if (!claimed) {') && src.indexOf('        if (!claimed) {') < sendAt, 'no claim, no email');
    assert.ok(src.includes('return { statusCode: 409, headers: responseHeaders, body: JSON.stringify({ error: `This quote is ${now.status || \'Draft\'} now — it changed since it was opened. Nothing was sent.` }) };'));
    const undo = between(src, '        } catch (e) {\n            await db.update(quotes)', 'throw e;');
    assert.ok(undo.includes('.set({ status: quote.status, sentAt: quote.sentAt ?? null, updatedAt: new Date() })') && undo.includes("eq(quotes.status, 'Sent to Customer'), eq(quotes.sentAt, sentAt)"), 'put back as it was — only while it still holds this send\'s mark');
    assert.ok(!/await db\.update\(quotes\)\s*\.set\(\{ status: 'Sent to Customer', sentAt: new Date\(\)/.test(src), 'REGRESSION: the status written after the email');
});

test("§0.278 THE GUARD: a technician's job update lands only on the job as its check read it — read with its last edit as text, the write claiming it; a miss read again: 404 off the job or gone, 409 'already' with the job when it holds what was sent, else 409 changed", () => {
    const src = read('netlify/functions/dispatch-jobs.mjs');
    const put = between(src, "if (event.httpMethod === 'PUT') {", "if (event.httpMethod === 'DELETE') {");
    assert.ok(put.includes('const [read] = await db.select({ ...getTableColumns(dispatchJobs), stamp: sql`${dispatchJobs.updatedAt}::text` }).from(dispatchJobs)'), 'read with its last edit as text');
    assert.ok(put.includes('const stamp = read?.stamp;') && put.includes('const current = read ? (({ stamp: _stamp, ...row }) => row)(read) : null;'), 'the stamp kept off the job the history and the notice read');
    const tech = between(put, 'if (tech) {', '// Each link it names anew');
    const checkAt = tech.indexOf('if (!techOnJob(currentJob, myTechId)) {');
    const writeAt = tech.indexOf('const [written] = await db.update(dispatchJobs).set(updates)\n                    .where(and(eq(dispatchJobs.id, id), eq(dispatchJobs.orgId, orgId), sql`${dispatchJobs.updatedAt}::text = ${stamp}`)).returning();');
    assert.ok(checkAt > 0 && writeAt > checkAt, 'the write claims the job as the check read it');
    assert.ok(tech.includes('if (!written) return await missedTechJob(orgId, id, myTechId, data);'));
    const historyAt = tech.indexOf("await recordStatusChange(orgId, id, current.status, data.status, userId, 'Updated in the field');");
    const noticeAt = tech.indexOf('await notifyCustomer({ orgId, before: current, after: written,');
    assert.ok(historyAt > writeAt && noticeAt > writeAt, 'the history and the notice only after the claimed write');
    const missed = between(src, 'async function missedTechJob(orgId, id, myTechId, data) {', '\n}\n');
    const order = ['const [now] = await db.select().from(dispatchJobs).where(and(eq(dispatchJobs.id, id), eq(dispatchJobs.orgId, orgId)));',
        "if (!job || !techOnJob(job, myTechId)) return { statusCode: 404, headers, body: JSON.stringify({ error: 'This job is no longer assigned to you. Nothing was saved; reload to see your jobs.' }) };",
        // The review: compared against the row as stored, never normaliseJob's copy (a NULL signature read as false).
        "if (techPatchHolds(now, data)) return { statusCode: 409, headers, body: JSON.stringify({ error: 'status' in data ? `This job is ${status} already.` : 'This job holds what you sent already.', code: 'already', job }) };",
        // Moved in §0.281: with the job as stored, code 'stale' — the card shows it, its buttons what the job now offers.
        'return { statusCode: 409, headers, body: JSON.stringify({ error: `This job changed since you opened it — it is ${status} now. Nothing was saved.`, code: \'stale\', job }) };'];
    order.forEach((line, i) => { assert.ok(missed.includes(line), line.slice(0, 70)); if (i) assert.ok(missed.indexOf(line) > missed.indexOf(order[i - 1]), 'in order'); });
    // The screen reads the 'already' as done, the job as stored — never "not saved" over a change that landed.
    const screen = read('src/Tabs/DispatchTab.jsx');
    const mine = between(screen, 'const updateMyJob = async (jobId, patch) => {', '    };\n');
    assert.ok(mine.includes('if (landedBefore(res.status, r.body)) { if (r.body.job) setJobsRaw(prev => prev.map(j => j.id === jobId ? r.body.job : j)); return; }'));
    assert.ok(mine.includes('if (landedBefore(') && mine.indexOf('if (landedBefore(') < mine.indexOf('throw refusalError(r.words, r.heard);'));
});

test("§0.278 techPatchHolds: done only when the job as stored holds every field sent — as text, absent as empty; a type-only match (false and none) or any field short is not done; the id is no field; an empty body is never done", async () => {
    const { techPatchHolds } = await import('../netlify/functions/_techJobs.mjs');
    const job = { id: 'j1', status: 'en_route', techNotes: 'gate', completionNotes: null, photosCount: 3, customerSignature: true };
    assert.equal(techPatchHolds(job, { id: 'j1', status: 'en_route' }), true);
    assert.equal(techPatchHolds(job, { status: 'en_route', techNotes: 'gate', photosCount: 3, customerSignature: true }), true);
    assert.equal(techPatchHolds(job, { status: 'en_route', completionNotes: '' }), true, 'none stored, none sent');
    assert.equal(techPatchHolds(job, { status: 'en_route', techNotes: 'gate code' }), false, 'a field short');
    assert.equal(techPatchHolds(job, { status: 'on_site' }), false);
    assert.equal(techPatchHolds({ ...job, customerSignature: null }, { customerSignature: false }), false, 'false is not none');
    assert.equal(techPatchHolds(job, { id: 'j1' }), false, 'nothing sent: never done');
    assert.equal(techPatchHolds(job, {}), false);
    assert.equal(techPatchHolds(null, { status: 'en_route' }), false);
});

test("§0.279 THE GUARD: a lead request's writes land only on what their checks read — a cancel and a deny only while still pending, in their own WHERE; an approve one batch claiming the request pending, the lead's owner as read and the requester, then the three writes; a miss read again", () => {
    const src = read('netlify/functions/lead-requests.mjs');
    assert.ok(src.includes("const PENDING = eq(leadClaimRequests.status, 'pending');"));
    // The cancel.
    const del = between(src, "if (event.httpMethod === 'DELETE') {", "return { statusCode: 405");
    assert.ok(del.includes('const [cancelled] = await db.delete(leadClaimRequests)\n                .where(and(eq(leadClaimRequests.id, id), eq(leadClaimRequests.orgId, orgId), PENDING))'), 'a cancel deletes only a pending request');
    assert.ok(del.includes('const [cancelled] = ') && del.indexOf("if (!cancelled) return await missedRequest(orgId, id, 'cancel');") > del.indexOf('const [cancelled] = '), 'a miss read again');
    // The deny.
    const put = between(src, "if (event.httpMethod === 'PUT') {", "if (event.httpMethod === 'DELETE') {");
    const deny = between(put, "if (data.action === 'deny') {", '// approve');
    assert.ok(deny.includes('.where(and(eq(leadClaimRequests.id, data.id), eq(leadClaimRequests.orgId, orgId), PENDING))'), 'a deny writes only a pending request');
    assert.ok(deny.includes("if (!denied) return await missedRequest(orgId, data.id, 'deny');") && deny.indexOf("if (!denied) return await missedRequest(orgId, data.id, 'deny');") < deny.indexOf('await writeAudit('), 'a missed deny is read again before its audit');
    // The approve: the claims in order, then the writes, in one batch; no write of it apart.
    const approve = put.slice(put.indexOf('// approve'));
    // The lead first (the review): two approves of sibling requests locked their own request, then the lead, then each
    // other's request — a deadlock, a 500. Lead, request, requester: the second waits on the lead holding nothing.
    const claims = ['...ownerClaim(leads, lead.id, orgId, sql`${leads.ownerId} is not distinct from ${lead.ownerId}`),',
        '...ownerClaim(leadClaimRequests, request.id, orgId, PENDING),',
        '...ownerClaim(users, requester.id, orgId, sql`true`),'];
    claims.forEach((line, i) => { assert.ok(approve.includes(line), line); if (i) assert.ok(approve.indexOf(line) > approve.indexOf(claims[i - 1]), 'in order: lead, request, requester'); });
    const batch = between(approve, 'done = await db.batch([', ']);');
    const writes = ['...claims,', 'db.update(leads)', "set({ status: 'approved', ...resolution })",
        '.where(and(eq(leadClaimRequests.orgId, orgId), eq(leadClaimRequests.leadId, request.leadId), PENDING, ne(leadClaimRequests.id, request.id))),'];
    writes.forEach((line, i) => { assert.ok(batch.includes(line), line); if (i) assert.ok(batch.indexOf(line) > batch.indexOf(writes[i - 1]), 'in order'); });
    assert.ok(approve.includes("if (!claimRefused(e)) throw e;\n                return await missedRequest(orgId, data.id, 'approve');"));
    assert.ok(approve.includes('const [approved] = done[claims.length + 1];'), 'the approved request answered from its own write');
    const outside = approve.slice(0, approve.indexOf('done = await db.batch(')) + approve.slice(approve.indexOf('const [approved] = done['));
    assert.ok(!/await db\.update\(/.test(outside) && !/for \(const s of siblings\)/.test(approve), 'REGRESSION: an approve write outside its batch');
    // The miss: what stands now, in the checks' words.
    const missed = between(src, 'async function missedRequest(orgId, id, action) {', '\n}\n');
    const order = ['const [now] = await db.select().from(leadClaimRequests).where(and(eq(leadClaimRequests.id, id), eq(leadClaimRequests.orgId, orgId)));',
        "? { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found', code: 'gone' }) }",
        "if (action === 'cancel') return { statusCode: 409, headers, body: JSON.stringify({ error: `This request was ${now.status} since — resolved requests are history. Nothing was cancelled.`, leadRequest: now }) };",
        "const again = (action === 'approve' && now.status === 'approved') || (action === 'deny' && now.status === 'denied');",
        "if (!lead) return { statusCode: 409, headers, body: JSON.stringify({ error: 'The requested lead no longer exists — deny the request instead.' }) };",   // the review
        "if (lead.ownerId && lead.ownerId !== now.requesterId) return",
        "if (!requester) return",
        "error: 'This request changed since it was read. Nothing was saved; reload to see it.'"];
    order.forEach((line, i) => { assert.ok(missed.includes(line), line.slice(0, 70)); if (i) assert.ok(missed.indexOf(line) > missed.indexOf(order[i - 1]), 'in order'); });
});

test('§0.275 _lib: the filter is no filter for an Admin or Manager, the caller\'s mayMutate in SQL for anyone else; a missed write is 403 while the row stands, the caller\'s 404 when gone', () => {
    const lib = read('netlify/functions/_lib.mjs');
    const fn = between(lib, 'export async function ownerWriteFilter(', '\n}\n');
    assert.ok(fn.includes('if (canSeeAllRole(userRole)) return undefined;'));
    assert.ok(fn.includes('return ownerMayWrite(ownerColumnOf(table, entity), await getCallerId(userId, orgId));'));
    const missed = between(lib, 'export async function missedWrite(', '\n}\n');
    assert.ok(missed.includes('const [row] = await db.select({ id: table.id }).from(table).where(and(eq(table.id, id), eq(table.orgId, orgId)));'), 'the row, in this org');
    assert.ok(missed.includes('return row ? { statusCode: 403, headers, body: JSON.stringify({ error: OWNERSHIP_FORBIDDEN }) } : gone;'));
    const bulk = read('netlify/functions/_bulk.mjs');
    assert.ok(bulk.includes('const mine = (ownerColumn && !canSeeAll) ? ownerMayWrite(ownerColumn, callerId) : undefined;'));
    assert.ok(bulk.includes('.onConflictDoUpdate({ target: table.id, setWhere: and(eq(table.orgId, orgId), mine), set })'));
    assert.ok(bulk.includes('for (const row of eligible) if (!written.has(row.id)) forbidden.push(row.id);'));
});

test("§0.278 THE GUARD (the review): every missed write's answer is awaited where it is returned — a promise returned unawaited from a handler's try settles after it, so a failed re-read skipped the catch: no house 500, no headers", () => {
    const dir = new URL('netlify/functions/', ROOT);
    let seen = 0;
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.mjs'))) {
        const src = read('netlify/functions/' + f);
        for (const m of src.matchAll(/(?:\breturn|\|\|)\s+(await\s+)?(missed\w*)\(/g)) {   // moved in §0.282: one after `||` (a merged-away answer first) counted too
            seen += 1;
            assert.ok(m[1], `${f}: \`return ${m[2]}(\` unawaited — return await ${m[2]}(...)`);
        }
    }
    // Moved in §0.279: and missedRequest's three (the lead request's cancel, deny and approve).
    // Moved in §0.287 (15 → 16): §0.286's missedOfficeJob is the sixteenth. At 15 the floor had one to spare, and the scoped
    // run before the push of §0.284-§0.286 found the deny's `return await missedRequest(` deleted passing it (and the deny's
    // order pin, -1 before everything — tests/order-pins.test.mjs).
    assert.ok(seen >= 16, `the missed writes scanned (${seen}) — eight missedWrite, two missedPut, missedQuote, missedTechJob, three missedRequest, missedOfficeJob`);
});
