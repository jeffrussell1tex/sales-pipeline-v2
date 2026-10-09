// tests/security-closes.test.mjs
//
// The small security closes (state §0.191; OPEN_ITEMS §1, item 1):
//
//   AUDIT    audit-log.mjs's POST takes only the app's own entries — the pairs
//            App.jsx's addAudit is called with — each behind the gate of the work
//            it records. Before, any action and entity type a member sent was
//            written (only quote events were refused, §0.156). THE GUARD: every
//            addAudit call under src/ is parsed and its (action, entityType)
//            resolved; each must be on the list, so a new call site adds its pair
//            to _auditClientEntries.mjs or this fails.
//   RECLOG   recommendation-log.mjs holds a caller who cannot see the whole org
//            to their own log: `?rep=` no longer reads a teammate's, and a POST
//            no longer writes a row in a teammate's name (which pipeline-alerts
//            reads as "already alerted").
//   LEADS    the Leads tab offers its write controls to the CRM write roles alone
//            (canEditCrm), as every other CRM tab does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { parse } from '@babel/parser';
import { CLIENT_AUDIT_ENTRIES, clientAuditKind } from '../netlify/functions/_auditClientEntries.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8').replace(/\r\n/g, '\n');
const walk = (node, visit) => {
    if (!node || typeof node.type !== 'string') return;
    visit(node);
    for (const k of Object.keys(node)) {
        if (k === 'loc' || k === 'start' || k === 'end' || k === 'extra') continue;
        const v = node[k];
        if (Array.isArray(v)) v.forEach((c) => walk(c, visit));
        else if (v && typeof v.type === 'string') walk(v, visit);
    }
};
const srcFiles = () => {
    const out = [];
    const into = (dir) => {
        for (const e of readdirSync(new URL(dir, ROOT), { withFileTypes: true })) {
            if (e.isDirectory()) into(`${dir}${e.name}/`);
            else if (/\.jsx?$/.test(e.name)) out.push(`${dir}${e.name}`);
        }
    };
    into('src/');
    return out;
};
const between = (s, a, b) => {
    const i = s.indexOf(a);
    assert.ok(i >= 0, `anchor not found: ${a}`);
    const j = s.indexOf(b, i + a.length);
    assert.ok(j > i, `end anchor not found: ${b}`);
    return s.slice(i, j);
};

// ── AUDIT ────────────────────────────────────────────────────────────────────

test('AUDIT: the app\'s own entries are taken, by kind; anything else is not', () => {
    for (const [kind, actions] of Object.entries(CLIENT_AUDIT_ENTRIES)) {
        for (const [action, types] of Object.entries(actions)) {
            for (const t of types) assert.equal(clientAuditKind(action, t), kind, `${action} ${t}`);
        }
    }
    const refused = [
        ['quote.approved', 'quote'], ['update', 'quote'], ['quote.sentback', 'account'],
        ['user.role', 'user'], ['settings.updated', 'settings'], ['update', 'user'],
        ['delete', 'opportunity'], ['create', 'lead'], ['merge', 'opportunity'],
        ['Update', 'account'], [' update', 'account'], ['update', 'Account'],
        ['dispatch.schedule', 'opportunity'], ['dispatch.timeoff.unassign', 'dispatch_job'],
        ['dispatch.anything', 'dispatch_job'], ['__proto__', 'account'], ['hasOwnProperty', 'account'],
        ['toString', 'account'], [undefined, 'account'], ['update', undefined], [null, null],
    ];
    for (const [a, t] of refused) assert.equal(clientAuditKind(a, t), null, `${String(a)} ${String(t)}`);
});

// The (action, entityType) values one argument can take: a string, either branch
// of a ternary of strings, or a local the file assigns only strings to.
const valuesOf = (node, file, ast) => {
    if (node?.type === 'StringLiteral') return [node.value];
    if (node?.type === 'ConditionalExpression') {
        const both = [...valuesOf(node.consequent, file, ast), ...valuesOf(node.alternate, file, ast)];
        return both;
    }
    if (node?.type === 'Identifier') {
        const vals = [];
        let other = false;
        walk(ast, (n) => {
            if (n.type === 'AssignmentExpression' && n.left.type === 'Identifier' && n.left.name === node.name) {
                if (n.right.type === 'StringLiteral') vals.push(n.right.value); else other = true;
            }
            if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.id.name === node.name && n.init) {
                if (n.init.type === 'StringLiteral') vals.push(n.init.value); else other = true;
            }
        });
        assert.ok(!other && vals.length, `${file}: cannot resolve ${node.name} to strings — name the pair literally`);
        return vals;
    }
    assert.fail(`${file}: an addAudit argument this scan cannot read (${node?.type}) — name the pair literally`);
};

test('AUDIT: every addAudit call under src/ names a pair the endpoint takes (the guard)', () => {
    const seen = [];
    for (const file of srcFiles()) {
        const src = read(file);
        if (!src.includes('addAudit')) continue;
        const ast = parse(src, { sourceType: 'module', plugins: ['jsx'] });
        walk(ast, (n) => {
            if ((n.type === 'CallExpression' || n.type === 'OptionalCallExpression') && n.callee.type === 'Identifier' && n.callee.name === 'addAudit') {
                const actions = valuesOf(n.arguments[0], file, ast);
                const types = valuesOf(n.arguments[1], file, ast);
                for (const a of actions) for (const t of types) {
                    seen.push(`${a} ${t}`);
                    assert.ok(clientAuditKind(a, t), `${file}: addAudit('${a}', '${t}') — audit-log.mjs refuses it; add the pair to _auditClientEntries.mjs`);
                }
            }
        });
    }
    // Not vacuous: the call sites read on 9 Oct (the hooks, the merges, Dispatch).
    for (const pair of ['create opportunity', 'update task', 'update account', 'merge contact', 'dispatch.crew.hold dispatch_job', 'dispatch.timeoff.unassign dispatch_technician']) {
        assert.ok(seen.includes(pair), `the scan found ${pair}`);
    }
    // And nothing on the list that no call site sends.
    const listed = Object.values(CLIENT_AUDIT_ENTRIES).flatMap((m) => Object.entries(m).flatMap(([a, ts]) => ts.map((t) => `${a} ${t}`)));
    for (const pair of listed) assert.ok(seen.includes(pair), `listed but sent by nothing: ${pair} — remove it`);
});

test('AUDIT: audit-log.mjs refuses an entry not on the list before anything is written, and gates each kind on its own work', () => {
    const s = read('netlify/functions/audit-log.mjs');
    const post = between(s, "if (event.httpMethod === 'POST') {", 'return { statusCode: 405');
    const kindAt = post.indexOf('const kind = clientAuditKind(data.action, data.entityType);');
    const insertAt = post.indexOf('await db.insert(auditLog)');
    assert.ok(kindAt > 0 && kindAt < insertAt, 'the list is read first');
    assert.ok(post.includes("if (!kind) {\n                return { statusCode: 403,"), 'not on the list: 403');
    const gates = between(post, "if (kind === 'crm') {", 'const callerName');
    assert.ok(gates.includes('const forbidden = requireWrite(auth, event, headers);\n                if (forbidden) return forbidden;'), 'a CRM entry: the CRM write roles');
    assert.ok(gates.includes('const gate = await dispatchGate(auth, event, headers);\n                if (gate.response) return gate.response;'), 'a Dispatch entry: the Dispatch gate');
    assert.equal(s.split('requireWrite(').length - 1, 1, 'requireWrite once, inside the CRM branch');
    assert.ok(!s.includes('isQuoteEvent'), 'the list covers quote events (§0.156)');
});

// ── RECLOG ───────────────────────────────────────────────────────────────────

test('RECLOG: a caller who cannot see the whole org reads, writes and sweeps only their own log', () => {
    const s = read('netlify/functions/recommendation-log.mjs');
    const scope = between(s, 'async function repScopeOf(auth, requested) {', '\n}\n');
    assert.ok(scope.includes('if (canSeeAll(auth.userRole)) return { repName: requested || null };'), 'Admin / Manager: any rep, or the org');
    assert.ok(scope.includes('const own = await getCallerName(auth.userId, auth.orgId);\n    return own ? { repName: own } : { none: true };'), 'everyone else: their own name, or nothing');
    const get = between(s, "if (event.httpMethod === 'GET') {", "if (event.httpMethod === 'POST') {");
    assert.ok(get.includes('const scope   = await repScopeOf(auth, event.queryStringParameters?.rep);\n            const repName = scope.repName;'));
    assert.ok(get.includes('const logs = scope.none ? [] : await query;'), 'no roster name: no rows');
    const post = between(s, "if (event.httpMethod === 'POST') {", "if (event.httpMethod === 'PUT') {");
    assert.ok(post.includes('const scope = await repScopeOf(auth, data.repName);\n            if (scope.none) {'));
    assert.ok(post.includes('repName:       scope.repName,') && !post.includes('repName:       data.repName'), 'the row names the scoped rep');
    const put = between(s, "if (event.httpMethod === 'PUT') {", 'return { statusCode: 405');
    assert.ok(put.includes("if (scope.none) return { statusCode: 200, headers, body: JSON.stringify({ evaluated: [] }) };\n            const repName = scope.repName;"));
    assert.ok(!/queryStringParameters\?\.rep;/.test(s), 'no branch reads ?rep= raw');
});

// ── LEADS ────────────────────────────────────────────────────────────────────

test('LEADS: the write controls are the CRM write roles\' alone', () => {
    const s = read('src/Tabs/LeadsTab.jsx');
    assert.ok(s.includes("import { canEditCrm } from '../utils/roles.js';"));
    const main = between(s, 'export default function LeadsTab() {', '\n}\n');
    assert.ok(main.includes('const canEdit = canEditCrm(userRole);'));
    assert.ok(main.includes("{canEdit && <div style={{ display:'flex', gap:6, alignItems:'center' }}>\n                    <button onClick={() => setShowLeadImportModal(true)}"), 'Import and + New lead');
    assert.equal(main.split('canEdit={canEdit}').length - 1, 2, 'both views are told');

    const triage = between(s, 'const TriageView = (', 'const CockpitListRow');
    assert.ok(triage.includes('{canEdit && selCount > 0 && ('), 'the bulk bar');
    assert.ok(triage.includes("{canEdit ? (\n                                        <div onClick={e => { e.stopPropagation(); setSelected("), 'the row checkbox');
    assert.ok(triage.includes(') : !canEdit ? (\n                                            <LeadAssignee name={l.assignee}/>'), 'no Request button');
    assert.ok(triage.includes('{canEdit && <button onClick={e => { e.stopPropagation(); convertLead(l); }}'), 'the row\'s convert');

    const detail = between(s, 'const CockpitDetail = (', 'const CockpitView');
    assert.ok(detail.includes("{canEdit && <div style={{ display:'flex', gap:6, marginTop:12, flexWrap:'wrap' }}>\n                    <button onClick={() => convertLead && convertLead(lead)}"), 'Convert, Email, Call, Schedule');
    assert.ok(detail.includes('{canEdit && <button onClick={e => {\n                        if (!lead) return;'), 'Do it');
    assert.ok(detail.includes(') : !canEdit ? null : myPending ? ('), 'Request assignment / Cancel request');
    assert.ok(detail.includes("!canEdit ? 'Waiting to be assigned'"), 'the next action reads as a reader\'s');
});
