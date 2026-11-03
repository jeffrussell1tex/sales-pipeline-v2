// The stale settings save, the screens' half (state §0.225 — batch 4b-3, step B-2; Jeff, 2 Nov: "Take all
// Recommended", JB2-7 and JB2-8 fixed here; state §0.226 — step B-3a; state §0.228 — step B-3b). One sender
// (src/Tabs/settings/shared/saveSettings.js) sends every converted screen's settings save with the token its draft was
// read with; a stale refusal takes the latest (takeLatestSettings, J-B4); a save that lands merges the tokens it
// answered (revsAfter) — before any member row goes out. B-3a converts every draft panel: its hook (usePanelRevs) holds
// the tokens it opened with (`opened`), merges a landed save's (`landed`), and hands a stale refusal to AdminView's one
// handler (`panelStale`, J-B5), which takes the latest and draws the panel again on it. B-3b converts the rest but one:
// Pipelines and the calendar (one save in flight; a refusal puts back only the keys it sent, never the tokens), Edit
// brand (its window takes the latest and stays open, JB3-4) and the Sales Manager (each draft's token taken when it
// begins; a stale refusal takes the latest and drops the draft, JB3-5). Connected apps, B-3c's, names no tokens until
// then and is accepted unchecked (Q6).
//
//   S1  the URL: only the sender, the app's load and Connected apps' two GETs hold it
//   S2  every send names its tokens, read from its draft's binding (the render's settings.revs, a window's snapshot, the
//       panel's own `opened`, the Sales Manager's drafts' own) — never `prev`, never a ref; Connected apps (B-3c) names
//       none, still listed
//   S3  the sender, run with fetch stubbed: putSettings (its network failure too), writeSettings, takeLatestSettings,
//       addToSettingsList, the rules
//   S4  every stale refusal takes the latest, through the one helper or the panel's own panelStale — a guarded panel's
//       catch hands it there first; the invite and the import read `twice`; Pipelines and the calendar put nothing back
//       on a stale one, Edit brand and the Sales Manager take the latest themselves (no AdminView around them)
//   S4b AdminView's panelStale, in order, and the one wrapper it remounts
//   S5  every save that lands merges the tokens it answered, by revsAfter or the panel's landed — the Deletes and
//       Assign before the members; every setSettings an updater; no snapshot put back
//   S6  TerritoryModal's save, run as written
//   S7  Teams' Assign (assignTo), run as written
//   S8  the scanners' own reading on made-up sources; the suites list holds this file
//   S9  usePanelRevs, run as written
//   S10 a save, run as written: Customer types, a flat list, Features (J-B12); Pipelines' persist and the calendar's
//       (one save in flight, its gate shut while AdminView reads the latest, a keys-only rollback) and Pipelines' Add
//       forms, kept when refused; Edit brand's Save, close and Escape; the Sales Manager's saveExtra,
//       saveAdminDrafts (partial, over saveExtra's own refusal too), its cards' flights and the flags that lock them,
//       a SPIFF's Remove answered late, its drafts' setters
//   S11 AdminView's panelStale and guardSave, run as written; Back, another card and Discard
//   S12 the pins: App's leave guard, the words (J-B11, JB3-2, JB3-8, JB3-4), reopen, one save at a time on every guarded
//       file (B-3a's by once, the Sales Manager's by its flights), JB3-6, JB3-7a; the gate's release, Edit brand's window
//       (its token, held while saving), the Sales Manager's drafts' setters; its commission plan and SPIFF board locked
//       while a save is out (every control in a disabled fieldset, read by the AST; state §0.228)
//
// Every import of saveSettings.js, settingsRevs.js or settingsDefaults.js is an `await import()` inside its test: a
// static import of a name the sender lacked would kill the file before the scans ran.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { parse } from '@babel/parser';
import { teamsWithMembers, teamsWithMemberOn } from '../src/utils/teamMembership.js';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8').replace(/\r\n/g, '\n');
const count = (s, sub) => s.split(sub).length - 1;
const astOf = (src) => parse(src, { sourceType: 'module', plugins: ['jsx'] });

const SKIP = new Set(['loc', 'start', 'end', 'extra', 'comments', 'leadingComments', 'trailingComments', 'innerComments']);
const walk = (node, visit, anc = []) => {
    if (!node || typeof node.type !== 'string') return;
    visit(node, anc);
    const here = [...anc, node];
    for (const k of Object.keys(node)) {
        if (SKIP.has(k)) continue;
        const v = node[k];
        if (Array.isArray(v)) v.forEach((c) => walk(c, visit, here));
        else if (v && typeof v.type === 'string') walk(v, visit, here);
    }
};
const isFn = (n) => n && /^(ArrowFunctionExpression|FunctionExpression|FunctionDeclaration|ObjectMethod|ClassMethod)$/.test(n.type);
const isCall = (n) => n && (n.type === 'CallExpression' || n.type === 'OptionalCallExpression');
const isMember = (n) => n && (n.type === 'MemberExpression' || n.type === 'OptionalMemberExpression');
const calleeName = (n) => (n.callee && n.callee.type === 'Identifier' ? n.callee.name : null);
const propName = (n) => (!n.computed && n.property.type === 'Identifier' ? n.property.name : n.property.type === 'StringLiteral' ? n.property.value : null);
const keyName = (p) => (p.type === 'ObjectProperty' && !p.computed ? (p.key.type === 'Identifier' ? p.key.name : p.key.type === 'StringLiteral' ? p.key.value : null) : null);
// A member chain's names from its root — settings.revs?.teams is ['settings', 'revs', 'teams']; null when it is none.
const chainOf = (n) => {
    const names = [];
    while (isMember(n)) {
        const p = propName(n);
        if (p === null) return null;
        names.unshift(p);
        n = n.object;
    }
    return n && n.type === 'Identifier' ? [n.name, ...names] : null;
};
const has = (node, pred) => { let found = false; walk(node, (n) => { if (!found && pred(n)) found = true; }); return found; };
const readsMember = (name) => (n) => isMember(n) && propName(n) === name;
const callsNamed = (name) => (n) => isCall(n) && calleeName(n) === name;

const srcFiles = () => {
    const out = [];
    const walkDir = (dir) => {
        for (const e of readdirSync(new URL(dir, ROOT), { withFileTypes: true })) {
            const p = dir + e.name;
            if (e.isDirectory()) walkDir(p + '/');
            else if (/\.(jsx?|mjs)$/.test(e.name)) out.push(p);
        }
    };
    walkDir('src/');
    return out;
};

// A source with its comments taken out — a line's, a block's, a JSX one's — by the parse, so a URL in a string stays.
const withoutComments = (src) => {
    let out = '', at = 0;
    for (const c of astOf(src).comments) { out += src.slice(at, c.start); at = c.end; }
    return out + src.slice(at);
};

// A component's handler, as written: the `const <handler> = …` among the statements of `const <component> = (…) => {`,
// or of `function <component>(…) {` (FlatListDetail, App).
const componentBody = (n, component) => {
    if (n.type === 'VariableDeclarator' && n.id.name === component && isFn(n.init)) return n.init.body.body || [];
    if (n.type === 'FunctionDeclaration' && n.id?.name === component) return n.body.body;
    return null;
};
const handlerIn = (src, component, handler) => {
    let out = null;
    walk(astOf(src).program, (n) => {
        const body = componentBody(n, component);
        if (!body) return;
        for (const st of body) {
            if (st.type !== 'VariableDeclaration') continue;
            for (const d of st.declarations) if (d.id.name === handler) out = src.slice(d.init.start, d.init.end);
        }
    });
    assert.ok(out, `${component}'s ${handler} not found`);
    return out;
};

// ── The files ────────────────────────────────────────────────────────────────

const SENDER = 'src/Tabs/settings/shared/saveSettings.js';
const HOOK = 'src/Tabs/settings/shared/usePanelRevs.js';
const ADMIN = 'src/Tabs/AdminView.jsx';
// B-3a's draft panels (state §0.226): each sends its one save through the sender with the tokens it opened with
// (usePanelRevs), and each is registered with the leave guard (useRegisterSave).
const B3A_FILES = [
    'src/Tabs/settings/company/CompanyProfileDetail.jsx',
    'src/Tabs/settings/company/FiscalYearDetail.jsx',
    'src/Tabs/settings/data/FeaturesDetail.jsx',
    'src/Tabs/settings/dispatch/DispatchBlockTypesDetail.jsx',
    'src/Tabs/settings/dispatch/DispatchCrewsDetail.jsx',
    'src/Tabs/settings/dispatch/DispatchCustomerNotificationsDetail.jsx',
    'src/Tabs/settings/dispatch/DispatchJobTemplatesDetail.jsx',
    'src/Tabs/settings/dispatch/DispatchJobTypesDetail.jsx',
    'src/Tabs/settings/dispatch/DispatchPropertyTypesDetail.jsx',
    'src/Tabs/settings/dispatch/DispatchSkillsDetail.jsx',
    'src/Tabs/settings/quoting/ApprovalTiersDetail.jsx',
    'src/Tabs/settings/quoting/ProductTypesDetail.jsx',
    'src/Tabs/settings/quoting/QuoteTemplatesDetail.jsx',
    'src/Tabs/settings/salesProcess/AccountSegmentsDetail.jsx',
    'src/Tabs/settings/salesProcess/BuyerPersonasDetail.jsx',
    'src/Tabs/settings/salesProcess/CustomerTypesDetail.jsx',
    'src/Tabs/settings/salesProcess/CustomFieldsDetail.jsx',
    'src/Tabs/settings/salesProcess/EmailTemplatesDetail.jsx',
    'src/Tabs/settings/salesProcess/FlatListDetail.jsx',
    'src/Tabs/settings/salesProcess/FunnelStagesDetail.jsx',
    'src/Tabs/settings/salesProcess/IndustriesDetail.jsx',
    'src/Tabs/settings/salesProcess/KPIThresholdsDetail.jsx',
    'src/Tabs/settings/salesProcess/LeadConversionDetail.jsx',
    'src/Tabs/settings/salesProcess/LeadScoringDetail.jsx',
    'src/Tabs/settings/salesProcess/LeadVisibilityDetail.jsx',
    'src/Tabs/settings/salesProcess/PainPointsDetail.jsx',
];
// B-3b's (state §0.228): Pipelines and the calendar — optimistic, one save in flight, a refusal putting back only the
// keys it sent; Edit brand's window and the Sales Manager's commission plan and SPIFF board — no AdminView around them,
// each takes the latest itself.
const PIPELINES = 'src/Tabs/settings/salesProcess/PipelinesDetail.jsx';
const CALENDAR = 'src/Tabs/settings/company/CompanyCalendarDetail.jsx';
const EDIT_BRAND = 'src/Tabs/settings/quoting/EditBrandModal.jsx';
const SALES_MANAGER = 'src/Tabs/SalesManagerTab.jsx';
// The sends, file by file, each converted: B-2's people screens (state §0.225), B-3a's panels (state §0.226) and B-3b's
// (state §0.228).
const SITES = {
    'src/Tabs/settings/people/TeamsDetail.jsx': { putSettings: 1, writeSettings: 2 },          // Delete; the window, Assign
    'src/Tabs/settings/people/TerritoriesDetail.jsx': { putSettings: 1, writeSettings: 2 },    // Delete; the window, the CSV
    'src/Tabs/settings/people/UsersDetail.jsx': { writeSettings: 1, addToSettingsList: 1 },    // the profile's move; Invite
    'src/components/layout/ModalLayer.jsx': { addToSettingsList: 1 },                          // the member import
    ...Object.fromEntries(B3A_FILES.map((f) => [f, { putSettings: 1 }])),
    [PIPELINES]: { putSettings: 1 },                    // persist: every change
    [CALENDAR]: { putSettings: 2 },                     // persistHolidays (Add, Delete); Sync
    [EDIT_BRAND]: { writeSettings: 1 },                 // the window's Save
    [SALES_MANAGER]: { writeSettings: 1 },              // saveExtra: the commission plan, the SPIFF board
};
const SITE_FILES = Object.keys(SITES);
// The panel B-3c converts, with its putSettings calls: it still names no tokens — one argument — and is accepted
// unchecked (Q6). Converted, it comes off this list; B-3c empties it.
const B3_PENDING = {
    'src/Tabs/settings/integrations/ConnectedAppsDetail.jsx': 3,
};
// The named GETs: the app's load, and the Connected apps panel's own load and re-read (B-3c's). B-3b moved the two
// direct sends (the Sales Manager's, Edit brand's) into the sender (state §0.228): no file but these holds the URL.
const NAMED_GETS = { 'src/hooks/useSettings.js': 1, 'src/Tabs/settings/integrations/ConnectedAppsDetail.jsx': 2 };
const URL_HOLDERS = { [SENDER]: 1, ...NAMED_GETS };

const SETTINGS_URL_ALL = /functions\/settings(?![\w/-])/g;
const SETTINGS_URL_ONE = /functions\/settings(?![\w/-])/;
const urlCount = (src) => (withoutComments(src).match(SETTINGS_URL_ALL) || []).length;

// ── The scanners ─────────────────────────────────────────────────────────────

const SENDS = new Set(['putSettings', 'writeSettings', 'addToSettingsList']);
// Inside a setSettings updater: in a function handed to setSettings.
const inUpdater = (anc) => anc.some((a, i) => i > 0 && isFn(a) && isCall(anc[i - 1]) && /^_?setSettings$/.test(calleeName(anc[i - 1]) || '') && anc[i - 1].arguments.includes(a));
// The const a name is set by, in a function around a node (the innermost first), outside any function inside it.
const constNamed = (name, anc) => {
    for (const fn of [...anc].reverse().filter(isFn)) {
        let found = null;
        const look = (node) => {
            if (!node || typeof node.type !== 'string' || found) return;
            if (node !== fn.body && isFn(node)) return;
            if (node.type === 'VariableDeclaration' && node.kind === 'const') {
                for (const d of node.declarations) if (d.id.type === 'Identifier' && d.id.name === name) found = d;
            }
            for (const k of Object.keys(node)) {
                if (SKIP.has(k)) continue;
                const v = node[k];
                if (Array.isArray(v)) v.forEach(look);
                else if (v && typeof v.type === 'string') look(v);
            }
        };
        look(fn.body);
        if (found) return found;
    }
    return null;
};
// The names a binding pattern binds: `x`, `{ a, b: c }`, `[d, e]`, defaults and rests.
const patternNames = (p) => (!p ? []
    : p.type === 'Identifier' ? [p.name]
    : p.type === 'ObjectPattern' ? p.properties.flatMap((q) => patternNames(q.type === 'RestElement' ? q.argument : q.value))
    : p.type === 'ArrayPattern' ? p.elements.flatMap(patternNames)
    : p.type === 'AssignmentPattern' ? patternNames(p.left)
    : p.type === 'RestElement' ? patternNames(p.argument) : []);
// The binding a name reads at a node, by the scope (the node's ancestors): the innermost function — or the module —
// that binds it, by a parameter or by a declaration in its own body outside any function inside it. Answers { kind,
// decl, scope } (kind: 'param', 'const', 'let', 'var' or 'function'), or null when nothing around it binds the name.
const bindingOf = (name, anc) => {
    for (const scope of [...anc].reverse().filter((a) => isFn(a) || a.type === 'Program')) {
        if (isFn(scope) && scope.params.some((p) => patternNames(p).includes(name))) return { kind: 'param', decl: null, scope };
        let found = null;
        const look = (node) => {
            if (!node || typeof node.type !== 'string' || found) return;
            if (node !== scope && isFn(node)) {
                if (node.type === 'FunctionDeclaration' && node.id?.name === name) found = { kind: 'function', decl: node };
                return;
            }
            if (node.type === 'VariableDeclaration') {
                for (const d of node.declarations) if (!found && patternNames(d.id).includes(name)) found = { kind: node.kind, decl: d };
            }
            for (const k of Object.keys(node)) {
                if (SKIP.has(k)) continue;
                const v = node[k];
                if (Array.isArray(v)) v.forEach(look);
                else if (v && typeof v.type === 'string') look(v);
            }
        };
        if (isFn(scope)) look(scope.body); else scope.body.forEach(look);
        if (found) return { ...found, scope };
    }
    return null;
};
// Why a name is not the panel's own from its hook (null when it is): where it is read, it is bound by
// `const { <name>, … } = usePanelRevs(settings, setSettings)` in the component around it — by the scope, not by the
// name: never a prop, a state, a local, another component's hook, or a hook over another copy (state §0.226).
const hookFault = (name, anc) => {
    const b = bindingOf(name, anc);
    if (!b) return 'is bound nowhere around it';
    const d = b.decl;
    if (!d || d.type !== 'VariableDeclarator' || !isCall(d.init) || calleeName(d.init) !== 'usePanelRevs') {
        return `is ${b.kind === 'param' ? 'a parameter' : `a ${b.kind}`} of its own, not the panel's usePanelRevs'`;
    }
    if (b.kind !== 'const' || !isFn(b.scope)) return 'comes from usePanelRevs, but not as a component\'s const';
    const prop = d.id.type === 'ObjectPattern' && d.id.properties.find((p) => p.type === 'ObjectProperty' && keyName(p) === name);
    if (!prop || prop.value.type !== 'Identifier' || prop.value.name !== name) return `is not usePanelRevs' own ${name}`;
    const args = d.init.arguments.map((a) => (a.type === 'Identifier' ? a.name : '?')).join(', ');
    if (args !== 'settings, setSettings') return `comes from usePanelRevs(${args}) — the hook takes the copy the draft was seeded from`;
    return null;
};
// The Sales Manager's own tokens (state §0.228 — JB3-5): no AdminView and no hook around it, its drafts held above the
// sub-tabs. Why its `opened` is not the tokens its drafts began with (null when it is): `const [opened, setOpened] =
// useState(…)` in the component around the send, and every setOpened of it in draftTiers or draftSpiffs — consts of
// that component — under `<its draft> === null`, putting in its own list's token alone over the others held, read
// from the render's settings.revs: taken when the draft begins, never at save time, never again while it is open.
const DRAFT_STARTS = { draftTiers: ['tiersDraft', 'quotaData'], draftSpiffs: ['spiffsDraft', 'spiffs'] };
const draftOpenedFault = (anc) => {
    const b = bindingOf('opened', anc);
    const d = b && b.decl;
    const pair = d && d.type === 'VariableDeclarator' && d.id.type === 'ArrayPattern' ? d.id.elements : [];
    if (!d || b.kind !== 'const' || !isFn(b.scope) || !isCall(d.init) || calleeName(d.init) !== 'useState'
        || pair[0]?.type !== 'Identifier' || pair[0].name !== 'opened' || pair[1]?.type !== 'Identifier') {
        return 'is not the component\'s own `const [opened, setOpened] = useState(…)`';
    }
    const setter = pair[1].name, faults = [], begun = {};
    walk(b.scope.body, (n, nanc) => {
        if (!callsNamed(setter)(n) || bindingOf(setter, nanc)?.decl !== d) return;
        const fnAt = nanc.findLastIndex(isFn), decl = nanc[fnAt - 1];
        const draft = decl && decl.type === 'VariableDeclarator' && decl.init === nanc[fnAt] && decl.id.type === 'Identifier' ? decl.id.name : null;
        const [held, key] = DRAFT_STARTS[draft] || [];
        if (!key || bindingOf(draft, nanc.slice(0, fnAt))?.scope !== b.scope) {
            faults.push(`${setter} called outside draftTiers / draftSpiffs — a token taken at save time, not with its draft`);
            return;
        }
        const ifAt = nanc.findLastIndex((a) => a.type === 'IfStatement');
        const iff = ifAt > fnAt ? nanc[ifAt] : null;
        const t = iff && nanc[ifAt + 1] === iff.consequent ? iff.test : null;
        if (!t || t.type !== 'BinaryExpression' || t.operator !== '===' || t.left.type !== 'Identifier' || t.left.name !== held || t.right.type !== 'NullLiteral') {
            faults.push(`${draft}: ${setter} not under \`${held} === null\` — the token taken again on an open draft, newer than its edits`);
            return;
        }
        const up = n.arguments[0];
        const props = up && isFn(up) && up.body.type === 'ObjectExpression' ? up.body.properties : [];
        const own = props.filter((p) => p.type === 'ObjectProperty');
        const kept = props.some((p) => p.type === 'SpreadElement' && p.argument.type === 'Identifier' && p.argument.name === up.params[0]?.name);
        if (!kept || props.length !== 2 || own.length !== 1 || keyName(own[0]) !== key) {
            faults.push(`${draft}: ${setter} does not put in ${key}'s token alone, over the others held`);
            return;
        }
        const why = tokenFault(own[0].value, key, nanc);
        if (why) { faults.push(`${draft}: ${key}'s token ${why}`); return; }
        begun[draft] = (begun[draft] || 0) + 1;
    }, anc.slice(0, anc.indexOf(b.scope) + 1));
    for (const draft of Object.keys(DRAFT_STARTS)) if (begun[draft] !== 1) faults.push(`${draft} takes its token ${begun[draft] || 0} times — once, when the draft begins`);
    return faults.length ? faults.join('; ') : null;
};
// Why a token is not read from its draft's binding (null when it is): the render's settings.revs.<key>, a window's
// snapshot's `.rev`, or a const set from one of those in a function around the send — with `?? null` or without. Never
// a ref's `.current`, never an updater's `prev`, never an answer's tokens (the token goes with its draft, state §0.225).
const tokenFault = (expr, key, anc, depth = 0) => {
    if (expr.type === 'LogicalExpression' && expr.operator === '??') {
        if (expr.right.type !== 'NullLiteral') return 'falls back to something other than null';
        return tokenFault(expr.left, key, anc, depth);
    }
    const chain = chainOf(expr);
    if (chain) {
        if (chain.includes('current')) return 'is read from a ref (.current) — at send time, not with its draft';
        if (chain[0] === 'prev') return 'is read from an updater\'s prev';
        if (chain[0] === 'settings' && chain[1] === 'revs') return chain.length === 3 && chain[2] === key ? null : `is settings.revs.${chain.slice(2).join('.') || '(whole)'}, not ${key}'s`;
        if (chain.length === 2 && chain[1] === 'rev') return null;
        if (chain.length === 1 && depth === 0) {
            const decl = constNamed(chain[0], anc);
            if (!decl || !decl.init) return `${chain[0]} is no const set in a function around the send`;
            return tokenFault(decl.init, key, anc, 1);
        }
    }
    return 'is not read from settings.revs or a window\'s snapshot';
};
// One file's sends: each names a token for every key it sends, read from its draft's binding; an addition to a list
// (addToSettingsList) takes the list and its token from one binding. Answers the faults, and the sends by name.
const sendFaults = (file, src) => {
    const out = [], counts = {};
    walk(astOf(src).program, (n, anc) => {
        if (!isCall(n) || !SENDS.has(calleeName(n))) return;
        const name = calleeName(n), at = `${file}:${n.loc.start.line} ${name}`;
        counts[name] = (counts[name] || 0) + 1;
        if (inUpdater(anc)) out.push(`${at}: sent from inside a setSettings updater`);
        if (name === 'addToSettingsList') {
            const [key, , opts] = n.arguments;
            const p = opts && opts.type === 'ObjectExpression' ? Object.fromEntries(opts.properties.map((q) => [keyName(q), q.value])) : {};
            const list = p.list ? chainOf(p.list) : null;
            if (!key || key.type !== 'StringLiteral' || !list || list.length !== 2 || list[1] !== key.value) {
                out.push(`${at}: the list is not a render's <settings>.${key?.value}`);
                return;
            }
            const rev = p.rev && p.rev.type === 'LogicalExpression' && p.rev.operator === '??' && p.rev.right.type === 'NullLiteral' ? p.rev.left : p.rev;
            const revChain = rev ? chainOf(rev) : null;
            if (!revChain || revChain.join('.') !== `${list[0]}.revs.${key.value}`) out.push(`${at}: the token is not ${list[0]}.revs.${key.value} — the list and its token from one binding`);
            if (!('setSettings' in p)) out.push(`${at}: no setSettings — the landed list and its token never reach the copy`);
            return;
        }
        const [payload, revs] = n.arguments;
        // A panel's tokens as it opened (state §0.226): `opened`, its own usePanelRevs' — with any payload; withIfRevs
        // picks the keys it sends.
        if (n.arguments.length === 2 && revs.type === 'Identifier' && revs.name === 'opened') {
            // The Sales Manager's own form, in that file alone: its drafts' tokens (state §0.228, draftOpenedFault).
            const why = file === SALES_MANAGER && hookFault('opened', anc) ? draftOpenedFault(anc) : hookFault('opened', anc);
            if (why) out.push(`${at}: opened ${why}`);
            return;
        }
        if (n.arguments.length !== 2 || !revs || revs.type !== 'ObjectExpression') { out.push(`${at}: no tokens — a second argument naming each key's`); return; }
        if (!payload || payload.type !== 'ObjectExpression') { out.push(`${at}: the payload is not an object literal`); return; }
        const sent = payload.properties.map(keyName), named = revs.properties.map(keyName);
        if (sent.includes(null) || named.includes(null) || [...sent].sort().join() !== [...named].sort().join()) {
            out.push(`${at}: tokens for ${named.join(', ') || 'no key'}, keys sent ${sent.join(', ')}`);
        }
        for (const q of revs.properties) {
            const k = keyName(q);
            if (k === null) continue;
            const why = tokenFault(q.value, k, anc);
            if (why) out.push(`${at}: ${k}'s token ${why}`);
        }
    });
    return { out, counts };
};
// Why a guarded panel's catch does not hand a stale refusal to AdminView first (null when it does): its first statement
// is `if (<e>.stale && await panelStale(<e>…)) throw <e>;` — <e> the catch's own — so nothing of the old mount runs
// once the latest is taken, and the leave guard reads the throw (state §0.226 — J-B5, J-B11).
const firstLineFault = (handler) => {
    const e = handler.param && handler.param.type === 'Identifier' ? handler.param.name : null;
    const is = (x) => !!e && !!x && x.type === 'Identifier' && x.name === e;
    const st = handler.body.body[0];
    const t = st && st.type === 'IfStatement' && !st.alternate ? st.test : null;
    const c = t ? (st.consequent.type === 'BlockStatement' && st.consequent.body.length === 1 ? st.consequent.body[0] : st.consequent) : null;
    const ok = t && t.type === 'LogicalExpression' && t.operator === '&&'
        && isMember(t.left) && is(t.left.object) && propName(t.left) === 'stale'
        && t.right.type === 'AwaitExpression' && isCall(t.right.argument) && calleeName(t.right.argument) === 'panelStale' && is(t.right.argument.arguments[0])
        && c.type === 'ThrowStatement' && is(c.argument);
    return ok ? null : `does not open with \`if (${e || 'e'}.stale && await panelStale(${e || 'e'}…)) throw ${e || 'e'};\` — the old mount would go on over the latest`;
};
// One file's refusals: a putSettings' catch, and the function around a writeSettings, reads `.stale` and takes the
// latest — by takeLatestSettings, or the panel's own panelStale (AdminView's, state §0.226); the function around an
// addToSettingsList reads `.twice` and takes no latest itself — the helper has. In a panel registered with the leave
// guard (useRegisterSave), a putSettings' catch hands a stale refusal to panelStale first (firstLineFault).
const refusalFaults = (file, src) => {
    const out = [];
    const program = astOf(src).program;
    const guarded = has(program, callsNamed('useRegisterSave'));
    walk(program, (n, anc) => {
        if (!isCall(n) || !SENDS.has(calleeName(n))) return;
        const name = calleeName(n), at = `${file}:${n.loc.start.line} ${name}`;
        const fnAt = anc.findLastIndex(isFn), fn = anc[fnAt];
        if (!fn) { out.push(`${at}: outside a function`); return; }
        if (name === 'addToSettingsList') {
            if (!has(fn, readsMember('twice'))) out.push(`${at}: a second refusal (.twice) is never read — J-B6's words never said`);
            if (has(fn, callsNamed('takeLatestSettings'))) out.push(`${at}: takes the latest itself — the helper already has`);
            return;
        }
        let where = fn, whereAnc = anc.slice(0, fnAt);
        if (name === 'putSettings') {
            let tryAt = -1;
            for (let k = anc.length - 2; k > fnAt; k--) if (anc[k].type === 'TryStatement' && anc[k + 1] === anc[k].block) { tryAt = k; break; }
            where = tryAt >= 0 ? anc[tryAt].handler : null;
            if (!where) { out.push(`${at}: its refusal is thrown with no catch around it`); return; }
            whereAnc = anc.slice(0, tryAt + 1);
        }
        if (!has(where, readsMember('stale')) || !(has(where, callsNamed('takeLatestSettings')) || has(where, callsNamed('panelStale')))) {
            out.push(`${at}: a stale refusal does not take the latest (.stale; takeLatestSettings or panelStale) — the screen keeps what the server refuses`);
        }
        walk(where, (o, oanc) => {
            if (!callsNamed('panelStale')(o)) return;
            const why = hookFault('panelStale', oanc);
            if (why) out.push(`${at}: panelStale ${why}`);
        }, whereAnc);
        if (guarded && name === 'putSettings') {
            const why = firstLineFault(where);
            if (why) out.push(`${at}: a guarded panel's catch ${why}`);
        }
    });
    return out;
};
// Whether a function lands a send's tokens through the panel's hook: `const <x> = await <send>(…)` in it (`id` names
// the one wanted) and, after it, the panel's own landed(<x>) — not in a function inside it (state §0.226).
const landsWith = (fn, fnAnc, id = null) => {
    const sent = new Map();
    let lands = false;
    walk(fn.body, (o, oanc) => {
        if (lands || oanc.findLast(isFn) !== fn) return;
        if (o.type === 'VariableDeclarator' && o.id.type === 'Identifier' && o.init?.type === 'AwaitExpression' && isCall(o.init.argument) && SENDS.has(calleeName(o.init.argument))) sent.set(o.id.name, o.end);
        const x = callsNamed('landed')(o) && o.arguments.length === 1 && o.arguments[0].type === 'Identifier' ? o.arguments[0].name : null;
        if (x && sent.has(x) && (id === null || x === id) && o.start > sent.get(x) && !hookFault('landed', oanc)) lands = true;
    }, [...fnAnc, fn]);
    return lands;
};
// One file's setSettings updaters: an object writing a list (teams, territories, or a key computed) writes `revs` too —
// or the function around it lands its send's tokens by the panel's landed (landsWith; FlatList's computed key) — and
// `revs` is only ever revsAfter(<prev>.revs, …) — the held tokens kept key by key, the answered ones set over them.
const updaterFaults = (file, src) => {
    const out = [];
    walk(astOf(src).program, (n, anc) => {
        if (!isCall(n) || !/^_?setSettings$/.test(calleeName(n) || '') || !isFn(n.arguments[0])) return;
        const fn = n.arguments[0], prev = fn.params[0]?.type === 'Identifier' ? fn.params[0].name : null;
        const fnAt = anc.findLastIndex(isFn);
        let lands = null;
        const landsHere = () => (lands ??= fnAt >= 0 && landsWith(anc[fnAt], anc.slice(0, fnAt)));
        // An object built in a function inside the updater — a member's row in a .map — is that row, not the copy
        // (state §0.228: the Sales Manager's forecast call writes one computed field of one member's row).
        walk(fn.body, (o, oanc) => {
            if (o.type !== 'ObjectExpression' || oanc.findLast(isFn) !== fn) return;
            const at = `${file}:${o.loc.start.line}`;
            const keys = o.properties.map((p) => (p.type === 'ObjectProperty' ? (p.computed ? '[computed]' : keyName(p)) : null));
            const revs = o.properties.find((p) => keyName(p) === 'revs');
            if (keys.some((k) => k === 'teams' || k === 'territories' || k === '[computed]') && !revs && !landsHere()) out.push(`${at}: a list set without its token — the next save sends the old one and is refused`);
            if (revs) {
                const v = revs.value;
                const ok = isCall(v) && calleeName(v) === 'revsAfter' && v.arguments.length === 2 && (chainOf(v.arguments[0]) || []).join('.') === `${prev}.revs`;
                if (!ok) out.push(`${at}: revs set other than revsAfter(${prev}.revs, …)`);
            }
        }, [fn]);
    });
    return out;
};
// One file's landings (state §0.226): every setSettings takes an updater — a value set puts back the tokens it was read
// with, over any a save merged since; no snapshot is kept to put back (J-B10); landed takes the answer of a send before
// it, and is the panel's own; in a panel with the hook every putSettings is answered into a const that landed takes.
const landFaults = (file, src) => {
    const out = [];
    const program = astOf(src).program;
    if (/\blet\s+snapshot\b/.test(withoutComments(src))) out.push(`${file}: a snapshot kept to put back — a rollback puts back every key it holds and their tokens`);
    const hooked = has(program, callsNamed('usePanelRevs'));
    walk(program, (n, anc) => {
        if (!isCall(n)) return;
        const name = calleeName(n), at = `${file}:${n.loc.start.line} ${name}`;
        if (/^_?setSettings$/.test(name || '') && !isFn(n.arguments[0])) out.push(`${at}: set with a value, not an updater — the copy's tokens put back as they were read`);
        if (name === 'landed') {
            const [a] = n.arguments;
            const b = a && a.type === 'Identifier' && n.arguments.length === 1 ? bindingOf(a.name, anc) : null;
            const sentBy = b && b.kind === 'const' && b.decl.init?.type === 'AwaitExpression' && isCall(b.decl.init.argument) && SENDS.has(calleeName(b.decl.init.argument));
            if (!sentBy || b.decl.end > n.start) out.push(`${at}: lands no send's answer — its argument is the const a send before it answered`);
            const why = hookFault('landed', anc);
            if (why) out.push(`${at}: landed ${why}`);
        }
        if (hooked && name === 'putSettings') {
            const decl = anc.at(-1)?.type === 'AwaitExpression' ? anc.at(-2) : null;
            const fnAt = anc.findLastIndex(isFn);
            const bound = decl && decl.type === 'VariableDeclarator' && decl.id.type === 'Identifier' && anc.at(-3)?.kind === 'const';
            if (!bound || !landsWith(anc[fnAt], anc.slice(0, fnAt), decl.id.name)) out.push(`${at}: its answer is never landed — the panel's next save names the old token and is refused against its own`);
        }
    });
    return out;
};

// ── S1 ───────────────────────────────────────────────────────────────────────

test('S1 — the URL: the sender, the app\'s load and Connected apps\' two GETs hold it — no other file, none of the converted screens', () => {
    const got = {};
    for (const f of srcFiles()) {
        const n = urlCount(read(f));
        if (n) got[f] = n;
    }
    for (const f of SITE_FILES) assert.equal(got[f], undefined, `${f}: a converted screen sends through the sender (state §0.225, §0.226)`);
    assert.deepEqual(got, URL_HOLDERS, 'a settings request outside the sender names no token and takes no latest — send it through saveSettings.js');
    assert.ok(read(SENDER).includes("const SETTINGS_URL = '/.netlify/functions/settings';"), 'the sender\'s one spelling');
    // The named GETs read: one argument, no method.
    for (const f of Object.keys(NAMED_GETS)) {
        let gets = 0;
        walk(astOf(read(f)).program, (n) => {
            if (!isCall(n) || !n.arguments[0] || n.arguments[0].type !== 'StringLiteral' || !SETTINGS_URL_ONE.test(n.arguments[0].value)) return;
            gets += 1;
            assert.equal(n.arguments.length, 1, `${f}:${n.loc.start.line}: a named GET — a write here names no token`);
        });
        assert.equal(gets, NAMED_GETS[f], `${f}: every GET named`);
    }
});

// ── S2 ───────────────────────────────────────────────────────────────────────

test('S2 — every send names its tokens, read from its draft\'s binding — a panel\'s own opened, by the scope; the Sales Manager\'s drafts\' own; Connected apps (B-3c) names none, still listed', () => {
    const faults = [], sites = {}, pending = {};
    for (const f of srcFiles()) {
        if (f === SENDER) continue;
        const src = read(f);
        if (!/\b(putSettings|writeSettings|addToSettingsList)\(/.test(src)) continue;
        if (f in B3_PENDING) {
            walk(astOf(src).program, (n) => {
                if (!isCall(n) || !SENDS.has(calleeName(n))) return;
                if (calleeName(n) === 'putSettings' && n.arguments.length === 1) pending[f] = (pending[f] || 0) + 1;
                else faults.push(`${f}:${n.loc.start.line}: listed as B-3's, yet names tokens — converted, take it off B3_PENDING`);
            });
            continue;
        }
        const { out, counts } = sendFaults(f, src);
        faults.push(...out);
        if (Object.keys(counts).length) sites[f] = counts;
    }
    assert.deepEqual(faults, []);
    assert.deepEqual(sites, SITES, 'every send outside the pending list is one of B-2\'s, B-3a\'s or B-3b\'s, each named here');
    assert.deepEqual(pending, B3_PENDING, 'the panel listed as B-3c\'s still sends, unchecked — a stale entry hides nothing');
    // B-3a's sends name the tokens their panel opened with (state §0.226).
    for (const f of B3A_FILES) {
        walk(astOf(read(f)).program, (n) => {
            if (callsNamed('putSettings')(n)) assert.equal(n.arguments[1]?.name, 'opened', `${f}:${n.loc.start.line}: REGRESSION — a draft panel's save names tokens other than those it opened with`);
        });
    }
    // B-3b's (state §0.228): Pipelines' and the calendar's sends name the tokens their panel opened with, the Sales
    // Manager's the tokens its drafts began with, Edit brand's the token its window opened with.
    for (const [f, send, want, sends] of [[PIPELINES, 'putSettings', 'opened', 1], [CALENDAR, 'putSettings', 'opened', 2],
        [SALES_MANAGER, 'writeSettings', 'opened', 1], [EDIT_BRAND, 'writeSettings', '{ quoteBrand: base.rev }', 1]]) {
        const src = read(f), got = [];
        walk(astOf(src).program, (n) => {
            if (!callsNamed(send)(n)) return;
            const a = n.arguments[1];
            got.push(a ? src.slice(a.start, a.end) : '(none)');
        });
        assert.deepEqual(got, Array(sends).fill(want), `${f}: REGRESSION — a save names tokens other than its draft's (state §0.228)`);
    }
});

// ── S3 — the sender, run ─────────────────────────────────────────────────────

const PENDING = Symbol('pending');
const outcome = (pr) => Promise.race([pr.then((v) => ({ v }), (e) => ({ e })), new Promise((r) => setTimeout(() => r(PENDING), 60))]);
const tick = () => new Promise((r) => setTimeout(r, 0));
const until = async (cond) => { for (let i = 0; i < 100 && !cond(); i++) await tick(); assert.ok(cond(), 'the request never went out'); };
// An answer held open: released after a switch — whole, or its body read across one.
const held = () => {
    const h = {};
    h.answer = () => new Promise((resolve, reject) => {
        h.release = (status, body) => resolve(new Response(JSON.stringify(body), { status }));
        h.slow = (ok, status, body) => resolve({ ok, status, statusText: '', json: () => new Promise((rb) => { h.body = () => rb(body); }) });
        h.fail = () => reject(new Error('offline'));
    });
    return h;
};
// The sender's requests answered from a queue: { status, body } (no body: not JSON), an Error (the network), or a
// function answering what fetch would (a held answer). Every request is recorded with its parsed body.
const withServer = async (run) => {
    const { setRequestOrg } = await import('../src/utils/storage.js');
    const savedWindow = globalThis.window, savedFetch = globalThis.fetch, savedError = console.error;
    const sent = [], queue = [];
    globalThis.window = { __getClerkToken: async () => 'token' };
    globalThis.fetch = async (url, opts = {}) => {
        sent.push({ url, method: opts.method || 'GET', body: opts.body === undefined ? undefined : JSON.parse(opts.body) });
        const a = queue.shift();
        if (a === undefined) throw new Error('no answer queued');
        if (a instanceof Error) throw a;
        if (typeof a === 'function') return a();
        return new Response(a.body === undefined ? 'not json' : JSON.stringify(a.body), { status: a.status });
    };
    console.error = () => {};   // dbFetch logs every refusal; these are made up
    setRequestOrg('org_A');
    try {
        await run({ sent, queue, setRequestOrg });
    } finally {
        globalThis.window = savedWindow; globalThis.fetch = savedFetch; console.error = savedError;
        setRequestOrg(null);
    }
};

test('S3 — the rules, run: withIfRevs (Q6), staleOf, revsAfter, settingsAsLoaded; the words', async () => {
    const { withIfRevs, staleOf, revsAfter, listChanged, TEAMS_CHANGED_TWICE, TEAM_MOVE_CHANGED, TEAM_MOVE_CHANGED_UNREAD } = await import('../src/utils/settingsRevs.js');
    const { settingsAsLoaded, DEFAULT_SETTINGS } = await import('../src/utils/settingsDefaults.js');
    const p = { teams: [] };
    assert.equal(withIfRevs(p, undefined), p, 'REGRESSION (Q6): no tokens named, yet ifRevs sent — every unconverted panel refused');
    assert.deepEqual(withIfRevs(p, null), { teams: [], ifRevs: { teams: null } }, 'REGRESSION: null read as "no tokens" — a converted screen that loaded none sends unchecked');
    assert.deepEqual(withIfRevs(p, {}), { teams: [], ifRevs: { teams: null } });
    assert.deepEqual(withIfRevs({ teams: [], territories: [], integrationRequests: {}, companyName: 'X' }, { teams: 'a', territories: 7, companyName: 'c', spiffs: 's' }),
        { teams: [], territories: [], integrationRequests: {}, companyName: 'X', ifRevs: { teams: 'a', territories: null, companyName: 'c' } },
        'a token for each key sent that a token covers — never the server\'s own, never a key not sent, null for no text');
    assert.deepEqual(staleOf(409, { code: 'stale', stale: ['teams', 7] }), ['teams']);
    assert.deepEqual(staleOf(409, { code: 'stale' }), []);
    assert.equal(staleOf(409, { code: 'invitation', error: 'x' }), null, 'the users function\'s 409 is no stale refusal');
    assert.equal(staleOf(400, { code: 'stale' }), null);
    assert.equal(staleOf(409, null), null);
    assert.deepEqual(revsAfter({ teams: 'a', spiffs: 's' }, { teams: 'b' }), { teams: 'b', spiffs: 's' }, 'REGRESSION: the held tokens replaced whole — another key\'s next save refused');
    assert.deepEqual(revsAfter(undefined, { teams: 'b', junk: 7 }), { teams: 'b' });
    assert.deepEqual(revsAfter({ teams: 'a' }, undefined), { teams: 'a' });
    // The copy as the load builds it: the read's values and its tokens as one set, the roster as loaded.
    const roster = [{ id: 'usr_a' }];
    assert.deepEqual(settingsAsLoaded({ users: roster, revs: { teams: 'a' } }, null), { ...DEFAULT_SETTINGS, users: roster }, 'no row: the defaults, no tokens');
    const loaded = settingsAsLoaded({ users: roster, revs: { teams: 'a', spiffs: 's' }, kept: 1 },
        { teams: [{ id: 't' }], users: [{ id: 'NOT_THE_ROSTER' }], revs: { teams: 'b' }, taskTypes: [], funnelStages: [] });
    assert.deepEqual(loaded.revs, { teams: 'b' }, 'REGRESSION: the tokens merged — a key the read lacks keeps a token for values no longer shown');
    assert.equal(loaded.users, roster, 'REGRESSION: the roster taken from the settings read');
    assert.deepEqual(loaded.teams, [{ id: 't' }]);
    assert.deepEqual(loaded.taskTypes, DEFAULT_SETTINGS.taskTypes);
    assert.deepEqual(loaded.funnelStages, DEFAULT_SETTINGS.funnelStages);
    assert.equal(loaded.kept, undefined, 'the copy is the read, as the load builds it');
    // The words.
    assert.equal(listChanged('territory'), 'The territory list changed since this page loaded — it now shows the latest. Make your change again.');
    assert.equal(TEAMS_CHANGED_TWICE, 'The invitations went out, but the team list changed twice while saving and does not list them yet — reload; their team is set on their row.', 'J-B6, verbatim');
    for (const w of [TEAM_MOVE_CHANGED, TEAM_MOVE_CHANGED_UNREAD]) {
        assert.ok(w.startsWith('Saved, but the team list changed since this page loaded') && w.endsWith('Save changes tries the list again.'), w);
        assert.ok(!/reload/i.test(w), 'the owed move is sent by Save changes — never Reload (R16b)');
    }
    assert.ok(TEAM_MOVE_CHANGED.includes('it now shows the latest') && !TEAM_MOVE_CHANGED_UNREAD.includes('now shows the latest'), 'only what was read is said');
});

test('S3 — putSettings: no tokens named, no ifRevs (Q6); named, one per key; a stale refusal throws .stale with the server\'s words — never after a switch', async () => {
    const { putSettings } = await import('../src/Tabs/settings/shared/saveSettings.js');
    const { STALE_ERROR } = await import('../src/utils/settingsRevs.js');
    const STALE = { error: STALE_ERROR, code: 'stale', stale: ['teams'] };
    await withServer(async ({ sent, queue, setRequestOrg }) => {
        queue.push({ status: 200, body: { success: true, revs: { teams: 'T1' } } });
        assert.deepEqual(await putSettings({ teams: [] }), { success: true, revs: { teams: 'T1' } }, 'the answer whole');
        assert.deepEqual([sent[0].url, sent[0].method], ['/.netlify/functions/settings', 'PUT']);
        assert.deepEqual(sent[0].body, { teams: [] }, 'REGRESSION (Q6): a panel B-3 has not converted names tokens — refused for every key that has one');

        queue.push({ status: 200, body: {} });
        await putSettings({ teams: [], integrationRequests: {} }, { teams: 'x', spiffs: 'y' });
        assert.deepEqual(sent[1].body.ifRevs, { teams: 'x' }, 'one per key a token covers');
        for (const revs of [null, {}, { teams: 7 }]) {
            queue.push({ status: 200, body: {} });
            await putSettings({ teams: [] }, revs);
            assert.deepEqual(sent.at(-1).body.ifRevs, { teams: null }, `${JSON.stringify(revs)}: checked, the token none`);
        }

        queue.push({ status: 409, body: STALE });
        const stale = await outcome(putSettings({ teams: [] }, { teams: 'old' }));
        assert.equal(stale.e?.message, STALE_ERROR, 'the server\'s words, unchanged');
        assert.deepEqual(stale.e?.stale, ['teams'], 'REGRESSION: the refusal lost the keys that moved — the screen cannot know to take the latest');
        queue.push({ status: 409, body: { error: 'Invitation pending.', code: 'invitation' } });
        const other = await outcome(putSettings({ teams: [] }, { teams: 'old' }));
        assert.equal(other.e?.message, 'Invitation pending.');
        assert.equal(other.e?.stale, undefined, 'another 409 is no stale refusal');

        // A stale refusal across a switch — at the send, and while its body is read: it never settles.
        let h = held(); queue.push(h.answer);
        let pr = putSettings({ teams: [] }, { teams: 'old' });
        await until(() => h.release);
        setRequestOrg('org_B'); h.release(409, STALE);
        assert.equal(await outcome(pr), PENDING);
        setRequestOrg('org_A');
        h = held(); queue.push(h.answer);
        pr = putSettings({ teams: [] }, { teams: 'old' });
        await until(() => h.slow);
        h.slow(false, 409, STALE);
        await until(() => h.body);
        setRequestOrg('org_B'); h.body();
        assert.equal(await outcome(pr), PENDING, 'REGRESSION: a stale refusal read across a switch thrown on the new org\'s screen');
    });
});

test('S3 — putSettings: a send that never reached the server throws writeSettings\' words in the org that asked; after a switch it never settles (JB3-7c)', async () => {
    const { putSettings } = await import('../src/Tabs/settings/shared/saveSettings.js');
    const { NETWORK_ERROR } = await import('../src/utils/storage.js');
    await withServer(async ({ queue, setRequestOrg }) => {
        queue.push(new Error('offline'));
        const lost = await outcome(putSettings({ teams: [] }, { teams: 'T1' }));
        assert.equal(lost.e?.message, NETWORK_ERROR, 'REGRESSION (JB3-7c): the network\'s own words, or none — writeSettings says NETWORK_ERROR');
        assert.equal(lost.e?.stale, undefined, 'no stale refusal');
        const h = held(); queue.push(h.answer);
        const pr = putSettings({ teams: [] }, { teams: 'T1' });
        await until(() => h.fail);
        setRequestOrg('org_B'); h.fail();
        assert.equal(await outcome(pr), PENDING, 'REGRESSION (JB3-7c): the last org\'s failed send said on the new org\'s screen');
    });
});

test('S3 — writeSettings never throws: lands with its tokens; stale with the keys; a refusal in dbWrite\'s words; the network; never settles after a switch', async () => {
    const { writeSettings } = await import('../src/Tabs/settings/shared/saveSettings.js');
    const { STALE_ERROR } = await import('../src/utils/settingsRevs.js');
    const { NETWORK_ERROR } = await import('../src/utils/storage.js');
    await withServer(async ({ sent, queue, setRequestOrg }) => {
        const send = () => writeSettings({ teams: [] }, { teams: 'T1' });
        queue.push({ status: 200, body: { success: true, revs: { teams: 'T2', junk: 7 } } });
        assert.deepEqual(await send(), { ok: true, status: 200, error: null, data: { success: true, revs: { teams: 'T2', junk: 7 } }, revs: { teams: 'T2' } },
            'REGRESSION: a landed save answers no tokens — the screen\'s next save is refused');
        assert.deepEqual(sent[0].body, { teams: [], ifRevs: { teams: 'T1' } });
        queue.push({ status: 409, body: { error: STALE_ERROR, code: 'stale', stale: ['teams'] } });
        assert.deepEqual(await send(), { ok: false, status: 409, error: STALE_ERROR, stale: ['teams'] }, 'REGRESSION: a stale refusal not told apart');
        queue.push({ status: 500 });
        assert.deepEqual(await send(), { ok: false, status: 500, error: 'The server returned 500.' }, 'no stale on another refusal');
        queue.push({ status: 404, body: { error: 'Not in your org.', requestId: 'r1' } });
        assert.deepEqual(await send(), { ok: false, status: 404, error: 'Not in your org. (ref r1)' }, 'dbWrite\'s words');
        queue.push({ status: 403, body: { error: 'Forbidden' } });
        assert.equal((await send()).error, 'You do not have permission to make this change.');
        queue.push(new Error('offline'));
        assert.deepEqual(await send(), { ok: false, status: 0, error: NETWORK_ERROR }, 'REGRESSION: a network failure thrown');
        // A switch at the send, at the body read, or while the network fails: it never settles.
        for (const at of ['send', 'body', 'network']) {
            setRequestOrg('org_A');
            const h = held(); queue.push(h.answer);
            const pr = send();
            await until(() => h.release);
            if (at === 'send') { setRequestOrg('org_B'); h.release(200, { revs: { teams: 'T9' } }); }
            if (at === 'network') { setRequestOrg('org_B'); h.fail(); }
            if (at === 'body') { h.slow(true, 200, { revs: { teams: 'T9' } }); await until(() => h.body); setRequestOrg('org_B'); h.body(); }
            assert.equal(await outcome(pr), PENDING, `${at}: REGRESSION — the last org's answer handed to the new org's screen`);
        }
    });
});

test('S3 — takeLatestSettings: one read; the values and their tokens as one set (a token the read lacks is gone), the roster kept; nothing set when it fails or after a switch', async () => {
    const { takeLatestSettings } = await import('../src/Tabs/settings/shared/saveSettings.js');
    await withServer(async ({ sent, queue, setRequestOrg }) => {
        const roster = [{ id: 'usr_a' }];
        let state = { teams: [{ id: 'old' }], users: roster, revs: { teams: 'T0', spiffs: 'S0' } };
        let sets = 0;
        const setSettings = (f) => { sets += 1; state = f(state); };
        const latest = { teams: [{ id: 'new' }], users: [{ id: 'NOT_THE_ROSTER' }], revs: { teams: 'TL' } };
        queue.push({ status: 200, body: { settings: latest } });
        assert.deepEqual(await takeLatestSettings(setSettings), latest, 'answers the latest settings');
        assert.deepEqual(sent.map((s) => [s.url, s.method]), [['/.netlify/functions/settings', 'GET']], 'one read');
        assert.deepEqual(state.teams, [{ id: 'new' }]);
        assert.deepEqual(state.revs, { teams: 'TL' }, 'REGRESSION: an old token kept beside the latest values — spiffs\' stale draft would pass');
        assert.equal(state.users, roster, 'the roster as loaded, never the read\'s');
        assert.ok(Array.isArray(state.taskTypes) && state.taskTypes.length, 'the defaults under it, as the load builds it');
        for (const a of [{ status: 500, body: { error: 'x' } }, { status: 200, body: { settings: null } }, new Error('offline')]) {
            queue.push(a);
            assert.equal(await takeLatestSettings(setSettings), null, 'unread: null');
        }
        assert.equal(sets, 1, 'a read that failed sets nothing');
        for (const at of ['send', 'body']) {
            setRequestOrg('org_A');
            const h = held(); queue.push(h.answer);
            const pr = takeLatestSettings(setSettings);
            await until(() => h.release);
            if (at === 'send') { setRequestOrg('org_B'); h.release(200, { settings: latest }); }
            else { h.slow(true, 200, { settings: latest }); await until(() => h.body); setRequestOrg('org_B'); h.body(); }
            assert.equal(await outcome(pr), PENDING, at);
            assert.equal(sets, 1, `${at}: REGRESSION — the last org's settings set on the new org's screen`);
        }
    });
});

test('S3 — addToSettingsList (Q5): lands; refused as stale, made again on the latest list with its token; already there; twice; unread; a 404 never again; never settles after a switch', async () => {
    const { addToSettingsList } = await import('../src/Tabs/settings/shared/saveSettings.js');
    const { STALE_ERROR } = await import('../src/utils/settingsRevs.js');
    const EAST = { id: 'team_east', name: 'East', repIds: ['usr_a'] };
    const EAST_WITH = { ...EAST, repIds: ['usr_a', 'usr_n'] };
    const THEIRS = { id: 'team_theirs', name: 'Theirs', repIds: [] };
    const ROSTER = [{ id: 'usr_a' }, { id: 'usr_n' }];
    const STALE = { status: 409, body: { error: STALE_ERROR, code: 'stale', stale: ['teams'] } };
    const latestOf = (teams, token) => ({ status: 200, body: { settings: { teams, revs: { teams: token } } } });
    await withServer(async ({ sent, queue, setRequestOrg }) => {
        let state;
        const setSettings = (f) => { state = f(state); };
        const begin = () => { state = { teams: [EAST], users: ROSTER, revs: { teams: 'T0', spiffs: 'S0' } }; sent.length = 0; };
        const add = () => addToSettingsList('teams', (l) => teamsWithMembers(l, [{ id: 'usr_n', teamId: 'team_east' }]),
            { list: state.teams, rev: state.revs?.teams ?? null, setSettings });

        begin();
        queue.push({ status: 200, body: { success: true, revs: { teams: 'T1' } } });
        assert.deepEqual(await add(), { ok: true });
        assert.deepEqual(sent.map((s) => s.body), [{ teams: [EAST_WITH], ifRevs: { teams: 'T0' } }]);
        assert.deepEqual(state.teams, [EAST_WITH]);
        assert.deepEqual(state.revs, { teams: 'T1', spiffs: 'S0' }, 'REGRESSION: the landed list without its token, or the held tokens replaced whole');

        begin();
        queue.push(STALE, latestOf([EAST, THEIRS], 'TL'), { status: 200, body: { success: true, revs: { teams: 'T2' } } });
        assert.deepEqual(await add(), { ok: true }, 'REGRESSION: a stale refusal not made again (Q5)');
        assert.deepEqual(sent.map((s) => s.method), ['PUT', 'GET', 'PUT'], 'refused, the latest read, made again');
        assert.deepEqual(sent[2].body.teams, [EAST_WITH, THEIRS], 'REGRESSION: made again on the old list — the other tab\'s team taken off');
        assert.deepEqual(sent[2].body.ifRevs, { teams: 'TL' }, 'REGRESSION: made again with the old token — refused again');
        assert.deepEqual(state.teams, [EAST_WITH, THEIRS]);
        assert.deepEqual(state.revs, { teams: 'T2' }, 'the latest\'s tokens, the one this save answered set over them');
        assert.equal(state.users, ROSTER, 'the roster kept');

        begin();
        queue.push(STALE, latestOf([EAST_WITH], 'TL'));
        assert.deepEqual(await add(), { ok: true, already: true }, 'the latest lists them already');
        assert.deepEqual(sent.map((s) => s.method), ['PUT', 'GET'], 'one send');

        begin();
        queue.push(STALE, latestOf([EAST, THEIRS], 'TL'), STALE, latestOf([EAST], 'TL2'));
        assert.deepEqual(await add(), { ok: false, status: 409, stale: true, twice: true }, 'REGRESSION: a second refusal not said (J-B6)');
        assert.deepEqual(sent.map((s) => s.method), ['PUT', 'GET', 'PUT', 'GET']);
        assert.deepEqual([state.teams, state.revs], [[EAST], { teams: 'TL2' }], 'the latest on screen');

        begin();
        queue.push(STALE, { status: 500, body: { error: 'x' } });
        assert.deepEqual(await add(), { ok: false, status: 409, error: STALE_ERROR, stale: ['teams'] }, 'the latest unread: the refusal');

        begin();
        queue.push({ status: 404, body: { error: 'That member is not in your organization.' } });
        assert.deepEqual(await add(), { ok: false, status: 404, error: 'That member is not in your organization.' });
        assert.equal(sent.length, 1, 'REGRESSION: a refusal that is not stale tried again');

        // A switch at each request — the first send, the read of the latest, the second send: it never settles, and
        // sets nothing after the switch.
        for (const at of [0, 1, 2]) {
            setRequestOrg('org_A'); begin();
            const h = held();
            queue.push(...[STALE, latestOf([EAST, THEIRS], 'TL')].slice(0, at), h.answer);
            const pr = add();
            await until(() => h.release);
            const before = state;
            setRequestOrg('org_B'); h.release(200, at === 1 ? { settings: { teams: [THEIRS], revs: { teams: 'TX' } } } : { success: true, revs: { teams: 'TX' } });
            assert.equal(await outcome(pr), PENDING, `request ${at}`);
            assert.equal(state, before, `request ${at}: nothing set after the switch`);
        }
    });
});

// ── S4 ───────────────────────────────────────────────────────────────────────

test('S4 — every stale refusal takes the latest through the one helper, or the panel\'s own panelStale; a guarded panel\'s catch hands it there first; the invite and the import read `twice`; the helper reads once and checks the org first', () => {
    const faults = SITE_FILES.flatMap((f) => refusalFaults(f, read(f)));
    assert.deepEqual(faults, []);
    const guarded = SITE_FILES.filter((f) => has(astOf(read(f)).program, callsNamed('useRegisterSave')));
    // The Sales Manager registers with App's guard too (state §0.228); its send is writeSettings, which the first-line
    // rule (a putSettings' catch) does not read — its stale branch is B-3b's S4 test's.
    assert.deepEqual(guarded, [...B3A_FILES, SALES_MANAGER], 'every B-3a panel is registered with the leave guard — the first-line rule reads each');
    const sender = withoutComments(read(SENDER));
    const fnText = (name) => {
        let out = null;
        walk(astOf(sender).program, (n) => { if (n.type === 'FunctionDeclaration' && n.id?.name === name) out = sender.slice(n.start, n.end); });
        assert.ok(out, `${name} not found in the sender`);
        return out;
    };
    const take = fnText('takeLatestSettings');
    assert.equal(count(take, 'dbFetch('), 1, 'one read');
    assert.ok(take.includes('dbFetch(SETTINGS_URL)'), 'a GET of the settings');
    const check = take.indexOf('if (!stillOrg(askedOrg)) return stopped();');
    assert.ok(check >= 0 && check < take.indexOf('setSettings('), 'REGRESSION: the last org\'s settings set before the org is checked');
    const add = fnText('addToSettingsList');
    assert.equal(count(add, 'takeLatestSettings('), 1, 'the addition takes the latest through the one helper');
    for (const name of ['putSettings', 'writeSettings']) assert.ok(fnText(name).includes('withIfRevs(payload, revs)'), `${name} sends what withIfRevs builds`);
});

// B-3b's refusals (state §0.228). Pipelines and the calendar: a stale refusal goes to panelStale, and nothing of the
// catch's rollback runs before it — AdminView draws the panel again on the latest, and a rollback would put the old
// mount's keys back over it. The gate opens only once panelStale has answered false — opened sooner, a change made
// while AdminView reads the latest goes out with the old tokens; a panel drawn again on the latest has a gate of its
// own: after the stale line, before the catch returns, or — where the catch rethrows (Sync) — in the catch around it.
// Edit brand and the Sales Manager: no AdminView around them — the stale branch of `const <w> = await
// writeSettings(…)` takes the latest itself, into the app's copy.
test("S4 — B-3b's refusals: Pipelines' and the calendar's stale catch goes to panelStale before any rollback, the gate opened only after it answered; Edit brand's and the Sales Manager's writeSettings take the latest in their own stale branch", () => {
    const isGateRelease = (st) => st.type === 'ExpressionStatement' && st.expression.type === 'AssignmentExpression'
        && (chainOf(st.expression.left) || []).join('.') === 'inFlight.current' && st.expression.right.type === 'BooleanLiteral' && st.expression.right.value === false;
    for (const [f, sends] of [[PIPELINES, 1], [CALENDAR, 2]]) {
        let seen = 0;
        walk(astOf(read(f)).program, (n, anc) => {
            if (!callsNamed('putSettings')(n)) return;
            let tryAt = -1;
            for (let k = anc.length - 2; k >= 0 && !isFn(anc[k]); k--) if (anc[k].type === 'TryStatement' && anc[k + 1] === anc[k].block) { tryAt = k; break; }
            const handler = tryAt >= 0 ? anc[tryAt].handler : null;
            assert.ok(handler, `${f}:${n.loc.start.line}: no catch around the send`);
            const e = handler.param?.name, body = handler.body.body;
            const staleAt = body.findIndex((st) => st.type === 'IfStatement' && !st.alternate && st.test.type === 'LogicalExpression' && st.test.operator === '&&'
                && isMember(st.test.left) && st.test.left.object.name === e && propName(st.test.left) === 'stale'
                && st.test.right.type === 'AwaitExpression' && callsNamed('panelStale')(st.test.right.argument) && st.test.right.argument.arguments[0]?.name === e
                && st.consequent.type === 'ReturnStatement');
            assert.ok(staleAt >= 0, `${f}:${n.loc.start.line}: REGRESSION (J-B5) — a stale refusal not handed to panelStale, or the catch goes on after it`);
            const firstSet = body.findIndex((st) => has(st, callsNamed('setSettings')));
            assert.ok(firstSet > staleAt, `${f}:${n.loc.start.line}: REGRESSION (J-B10) — the keys put back before the stale refusal is handed on: the old mount's values over the latest`);
            const releases = body.flatMap((st, i) => (isGateRelease(st) ? [i] : []));
            assert.ok(releases.every((i) => i > staleAt), `${f}:${n.loc.start.line}: REGRESSION (state §0.228) — the gate opened before panelStale answered: a change made while AdminView reads the latest goes out with the old tokens`);
            const exitAt = body.findIndex((st, i) => i > staleAt && (st.type === 'ReturnStatement' || st.type === 'ThrowStatement'));
            let released = releases.some((i) => exitAt < 0 || i < exitAt);
            if (!released && body.at(-1)?.type === 'ThrowStatement' && body.at(-1).argument?.name === e) {
                // Sync: the refusal goes on to the catch around it, in the same function, which opens the gate.
                let outer = null;
                for (let k = tryAt - 1; k >= 0 && !isFn(anc[k]); k--) if (anc[k].type === 'TryStatement' && anc[k + 1] === anc[k].block) { outer = anc[k].handler; break; }
                released = !!outer && outer.body.body.some(isGateRelease);
            }
            assert.ok(released, `${f}:${n.loc.start.line}: REGRESSION (JB3-8) — a refusal leaves the gate shut: every change after it said to be still saving`);
            seen += 1;
        });
        assert.equal(seen, sends, `${f}: every send read`);
    }
    for (const f of [EDIT_BRAND, SALES_MANAGER]) {
        let seen = 0;
        walk(astOf(read(f)).program, (n, anc) => {
            if (!callsNamed('writeSettings')(n)) return;
            const decl = anc.at(-1)?.type === 'AwaitExpression' && anc.at(-2)?.type === 'VariableDeclarator' ? anc.at(-2) : null;
            assert.ok(decl && decl.id.type === 'Identifier', `${f}:${n.loc.start.line}: the send's answer is bound`);
            const w = decl.id.name, fn = anc.findLast(isFn), branches = [];
            walk(fn.body, (o, oanc) => {
                if (o.type === 'IfStatement' && oanc.findLast(isFn) === fn && isMember(o.test) && o.test.object.name === w && propName(o.test) === 'stale') branches.push(o);
            }, [fn]);
            assert.equal(branches.length, 1, `${f}: one stale branch — if (${w}.stale)`);
            const takes = [];
            walk(branches[0].consequent, (o) => { if (callsNamed('takeLatestSettings')(o)) takes.push(o); });
            assert.ok(takes.length === 1 && takes[0].arguments.length === 1 && takes[0].arguments[0].name === 'setSettings',
                `${f}: REGRESSION (JB3-4, JB3-5) — a stale refusal keeps what the server refused: the latest not taken into the app's copy`);
            seen += 1;
        });
        assert.equal(seen, 1, `${f}: one send`);
    }
});

// ── S4b ──────────────────────────────────────────────────────────────────────

test('S4b — AdminView\'s panelStale, in order: the latest read; tookLatest; only while the asker is open, the guard\'s slot and App\'s flag cleared and the panel remounted; the Provider around the one wrapper', () => {
    const src = withoutComments(read(ADMIN));
    const h = handlerIn(src, 'AdminView', 'panelStale');
    let at = -1;
    for (const step of ['takeLatestSettings(setSettings)', 'if (!latest) return false;', 'tookLatest = true', 'if (!isAlive()) return true;',
        'settingsSaveRef.current = null', 'setSettingsDirty(false)', 'setPanelEpoch(']) {
        const i = h.indexOf(step);
        assert.ok(i > at, `REGRESSION (J-B5): ${step} missing, or out of order`);
        at = i;
    }
    assert.match(src, /<PanelStaleContext\.Provider value=\{\{ took: panelStale, landed: \(\) => setPanelNote\(null\) \}\}>\s*<React\.Fragment key=\{panelEpoch\}>\{panelEl\}<\/React\.Fragment>\s*<\/PanelStaleContext\.Provider>/,
        'REGRESSION (J-B5): the open panel is not in the one wrapper the epoch keys, under the handler');
    assert.equal(count(src, '{panelEl}'), 1, 'the panel drawn once, in the wrapper');
});

// ── S5 ───────────────────────────────────────────────────────────────────────

test('S5 — every save that lands merges the tokens it answered — by revsAfter, or the panel\'s landed(<its answer>) after the send; every setSettings an updater, no snapshot put back; the Deletes and Assign merge before any member row goes out', () => {
    const faults = [...SITE_FILES, SENDER, HOOK].flatMap((f) => updaterFaults(f, read(f)));
    faults.push(...SITE_FILES.flatMap((f) => landFaults(f, read(f))));
    assert.deepEqual(faults, []);
    for (const f of B3A_FILES) {
        let lands = 0;
        walk(astOf(read(f)).program, (n) => { if (callsNamed('landed')(n)) lands += 1; });
        assert.equal(lands, 1, `${f}: REGRESSION — a landed save's tokens never merged; the panel's next save refused against its own`);
    }
    // B-3b's (state §0.228): Pipelines' one send and the calendar's two each land by the panel's landed; Edit brand's and
    // the Sales Manager's merge the tokens their send answered as it lands — `revs: revsAfter(<prev>.revs, <w>.revs)` in
    // an updater, in the branch for <w>.ok.
    for (const [f, sends] of [[PIPELINES, 1], [CALENDAR, 2]]) {
        let lands = 0;
        walk(astOf(read(f)).program, (n) => { if (callsNamed('landed')(n)) lands += 1; });
        assert.equal(lands, sends, `${f}: REGRESSION — a landed save's tokens never merged; the panel's next save refused against its own`);
    }
    for (const f of [EDIT_BRAND, SALES_MANAGER]) {
        let merges = 0;
        walk(astOf(read(f)).program, (n, anc) => {
            if (!callsNamed('writeSettings')(n)) return;
            const decl = anc.at(-2);
            const w = decl?.type === 'VariableDeclarator' && decl.id.type === 'Identifier' ? decl.id.name : null;
            walk(anc.findLast(isFn).body, (o) => {
                if (o.type !== 'IfStatement' || !isMember(o.test) || o.test.object.name !== w || propName(o.test) !== 'ok') return;
                walk(o.consequent, (c) => {
                    if (!callsNamed('setSettings')(c) || !isFn(c.arguments[0])) return;
                    const up = c.arguments[0], prev = up.params[0]?.name;
                    walk(up.body, (p) => {
                        if (p.type !== 'ObjectProperty' || keyName(p) !== 'revs' || !callsNamed('revsAfter')(p.value)) return;
                        const [heldRevs, answered] = p.value.arguments;
                        if ((chainOf(heldRevs) || []).join('.') === `${prev}.revs` && (chainOf(answered) || []).join('.') === `${w}.revs`) merges += 1;
                    });
                });
            });
        });
        assert.equal(merges, 1, `${f}: REGRESSION — a landed save's token never reaches the copy: the next draft begins with the old one and is refused against its own`);
    }
    for (const [f, component, handler] of [
        ['src/Tabs/settings/people/TeamsDetail.jsx', 'TeamsDetail', 'handleDelete'],
        ['src/Tabs/settings/people/TerritoriesDetail.jsx', 'TerritoriesDetail', 'handleDelete'],
        ['src/Tabs/settings/people/TeamsDetail.jsx', 'TeamsDetail', 'assignTo'],
    ]) {
        const h = handlerIn(withoutComments(read(f)), component, handler);
        const merge = h.indexOf('revsAfter('), member = h.indexOf("dbWrite('/.netlify/functions/users'");
        assert.ok(merge >= 0 && member > merge, `${component} ${handler}: REGRESSION — the landed list and its token reach the copy only after the members; a member save that fails leaves the old token behind`);
    }
});

// ── S6 / S7 — the handlers, run as written ───────────────────────────────────

// A handler's requests, answered by function name (settings, users) in writeSettings' and dbWrite's shape; today's
// handlers sent their list through dbFetch, kept so old code fails on what it sends, not on a missing name.
const requests = (answers, fallback) => {
    const calls = [];
    const ask = (to, body) => { calls.push({ to, body }); return (answers[to] || fallback[to])(body); };
    return {
        calls,
        dbFetch: async (url, opts) => { const a = ask(url.split('/').pop(), JSON.parse(opts.body)); return { ok: a.ok, status: a.status, json: async () => a.data ?? { error: a.error } }; },
        dbWrite: async (url, opts) => ask(url.split('/').pop(), JSON.parse(opts.body)),
        writeSettings: async (payload, revs) => ask('settings', { ...payload, ifRevs: revs }),
    };
};
const runAs = (fnSrc, scope, ...args) => {
    const names = Object.keys(scope);
    return new Function(...names, `return (${fnSrc});`)(...names.map((n) => scope[n]))(...args);
};
const STALE_ANSWER = async (key) => {
    const { STALE_ERROR } = await import('../src/utils/settingsRevs.js');
    return () => ({ ok: false, status: 409, error: STALE_ERROR, stale: [key] });
};

const NORTH = { id: 'terr_n', name: 'North', parent: '', rule: 'NAM', ownerId: '', repIds: ['usr_a'] };
const SOUTH = { id: 'terr_s', name: 'South', parent: '', rule: '', ownerId: '', repIds: [] };
const THEIRS_T = { id: 'terr_t', name: 'Theirs', parent: '', rule: '', ownerId: '', repIds: [] };
const TERR_USERS = [{ id: 'usr_a', name: 'Ann', territory: 'North' }, { id: 'usr_x', territory: 'North' }, { id: 'usr_b', name: 'Bo', territory: '' }];
const TERR_LATEST = { territories: [NORTH, SOUTH, THEIRS_T], revs: { territories: 'TL' } };

const runTerritorySave = async ({ mode, territory = null, form = {}, base = null, answers = {}, latest = null }) => {
    const { revsAfter, listChanged } = await import('../src/utils/settingsRevs.js');
    const save = handlerIn(read('src/Tabs/settings/people/TerritoriesDetail.jsx'), 'TerritoryModal', 'save');
    const said = [], stale = [];
    const state = { settings: { territories: [NORTH, SOUTH], users: TERR_USERS, revs: { territories: 'NEWER', teams: 'TM' } }, base: null, closed: false, taken: 0 };
    const opened = base || { list: state.settings.territories, rev: 'OPENED' };
    const r = requests(answers, {
        settings: () => ({ ok: true, status: 200, error: null, data: { success: true }, revs: { territories: 'T2' } }),
        users: (body) => ({ ok: true, status: 200, error: null, data: { user: { ...TERR_USERS.find((u) => u.id === body.id), ...body, answered: true } } }),
    });
    await runAs(save, {
        mode, territory,
        name: form.name ?? territory?.name ?? '', parent: form.parent ?? territory?.parent ?? '', rule: form.rule ?? territory?.rule ?? '',
        ownerId: form.ownerId ?? territory?.ownerId ?? '', repIds: form.repIds ?? territory?.repIds ?? [],
        settings: state.settings, allUsers: TERR_USERS.filter((u) => u.name),
        base: opened, territories: opened.list, setBase: (b) => { state.base = b; },
        requestOrg: () => 'org_A', stillOrg: (o) => o === 'org_A',
        dbFetch: r.dbFetch, dbWrite: r.dbWrite, writeSettings: r.writeSettings,
        takeLatestSettings: async (set) => {
            state.taken += 1;
            if (!latest) return null;
            set((prev) => ({ ...prev, territories: latest.territories, revs: latest.revs }));
            return latest;
        },
        revsAfter, listChanged,
        setErr: (v) => said.push(v), setSaving: () => {},
        setSettings: (f) => { state.settings = f(state.settings); },
        onStale: (w) => stale.push(w), onClose: () => { state.closed = true; },
        Date,
    });
    return { calls: r.calls, said: said.filter(Boolean), stale, state };
};

test('S6 — TerritoryModal\'s save, run as written: the token it opened with; lands, merging its tokens, the roster kept whole (JB2-7)', async () => {
    const r = await runTerritorySave({ mode: 'edit', territory: NORTH, form: { name: 'North 2' } });
    assert.deepEqual(r.calls.map((c) => c.to), ['settings', 'users']);
    assert.deepEqual(r.calls[0].body.ifRevs, { territories: 'OPENED' }, 'REGRESSION: the window sends no token, or a newer copy\'s (NEWER)');
    assert.deepEqual(r.calls[1].body, { id: 'usr_a', territory: 'North 2' });
    assert.deepEqual(r.state.base, { list: r.calls[0].body.territories, rev: 'T2' }, 'the window holds the list it landed, with its token');
    assert.deepEqual(r.state.settings.revs, { territories: 'T2', teams: 'TM' }, 'REGRESSION: the landed list without its token');
    assert.deepEqual(r.state.settings.users.map((u) => u.id), ['usr_a', 'usr_x', 'usr_b'], 'REGRESSION (JB2-7): a member with no name dropped from the roster');
    assert.equal(r.state.settings.users[0].answered, true, 'the row as the server answered it');
    assert.equal(r.state.closed, true);
    assert.deepEqual(r.said, []);
});

test('S6 — TerritoryModal\'s save, run as written: stale, an edit closes with the words on the page; a new territory stays open on the latest, its next Save that list\'s', async () => {
    const { listChanged, STALE_ERROR } = await import('../src/utils/settingsRevs.js');
    const answers = { settings: await STALE_ANSWER('territories') };
    for (const [mode, form] of [['edit', { name: 'North 2' }], ['rule', { rule: 'EMEA' }], ['owner', { ownerId: 'usr_b' }], ['reps', { repIds: ['usr_a', 'usr_b'] }]]) {
        const r = await runTerritorySave({ mode, territory: NORTH, form, answers, latest: TERR_LATEST });
        assert.deepEqual(r.calls.map((c) => c.to), ['settings'], `${mode}: REGRESSION — a member row sent after a refused list`);
        assert.equal(r.state.taken, 1, `${mode}: REGRESSION — the latest not taken`);
        assert.deepEqual(r.stale, [listChanged('territory')], `${mode}: the words on the page`);
        assert.equal(r.state.closed, true, `${mode}: REGRESSION (J-B8) — an edit refused as stale stays open on a list that is gone`);
        assert.deepEqual(r.said, []);
        assert.deepEqual(r.state.settings.territories, TERR_LATEST.territories, 'the latest on the page');
    }
    const blind = await runTerritorySave({ mode: 'edit', territory: NORTH, form: { name: 'North 2' }, answers });
    assert.deepEqual([blind.stale, blind.state.closed], [[STALE_ERROR], true], 'the latest unread: the server\'s words');

    const fresh = await runTerritorySave({ mode: 'new', form: { name: 'East' }, answers, latest: TERR_LATEST });
    assert.equal(fresh.state.closed, false, 'REGRESSION (J-B8): a new territory refused as stale is lost with its window');
    assert.deepEqual(fresh.stale, []);
    assert.deepEqual(fresh.said, [listChanged('territory')]);
    assert.deepEqual(fresh.state.base, { list: TERR_LATEST.territories, rev: 'TL' }, 'REGRESSION: the window keeps the old list and token — its next Save refused again');
    const again = await runTerritorySave({ mode: 'new', form: { name: 'East' }, base: fresh.state.base });
    assert.deepEqual(again.calls[0].body.ifRevs, { territories: 'TL' });
    assert.deepEqual(again.calls[0].body.territories.map((t) => t.name), ['North', 'South', 'Theirs', 'East'], 'on the latest list');
    assert.equal(again.state.closed, true);
    const unread = await runTerritorySave({ mode: 'new', form: { name: 'East' }, answers });
    assert.deepEqual([unread.said, unread.state.base, unread.state.closed], [[STALE_ERROR], null, false]);
});

test('S6 — TerritoryModal\'s save, run as written: a refusal sends no member row; a member that fails after the list landed keeps the token and the window', async () => {
    const refused = await runTerritorySave({ mode: 'reps', territory: NORTH, form: { repIds: ['usr_a', 'usr_b'] },
        answers: { settings: () => ({ ok: false, status: 404, error: 'Not in your organization.' }) } });
    assert.deepEqual(refused.calls.map((c) => c.to), ['settings']);
    assert.deepEqual(refused.said, ['Not in your organization.']);
    assert.deepEqual([refused.state.base, refused.state.closed, refused.state.settings.revs.territories], [null, false, 'NEWER']);

    const r = await runTerritorySave({ mode: 'reps', territory: NORTH, form: { repIds: ['usr_a', 'usr_b'] },
        answers: { users: () => ({ ok: false, status: 404, error: 'gone' }) } });
    assert.deepEqual(r.calls.map((c) => [c.to, c.body.id]), [['settings', undefined], ['users', 'usr_b']]);
    assert.deepEqual(r.said, ['Territory saved, but 1 user record(s) did not update: Bo: gone']);
    assert.equal(r.state.settings.revs.territories, 'T2', 'REGRESSION: the landed list without its token — the next save refused');
    assert.equal(r.state.base.rev, 'T2', 'REGRESSION: Save again sends the token the window opened with — refused against its own save');
    assert.deepEqual(r.state.settings.territories[0].repIds, ['usr_a', 'usr_b']);
    assert.equal(r.state.closed, false, 'stays open so the message is read');
});

const EAST_TEAM = { id: 'team_east', name: 'East', territory: 'NAM', vertical: '', repIds: ['usr_b'] };
const WEST_TEAM = { id: 'team_west', name: 'West', territory: '', vertical: 'Health', repIds: [] };
const ANN = { id: 'usr_a', name: 'Ann', team: '', teamId: '' };
const TEAM_USERS = [ANN, { id: 'usr_b', name: 'Bo', team: 'East', teamId: 'team_east' }, { id: 'usr_x', team: '', teamId: '' }];
const TEAMS_START = { teams: [EAST_TEAM, WEST_TEAM], users: TEAM_USERS, revs: { teams: 'T1', spiffs: 'S1' } };

const runAssign = async ({ settings, to, user = ANN, assigning = false, answers = {}, latest = null }) => {
    const { revsAfter, listChanged } = await import('../src/utils/settingsRevs.js');
    const assignTo = handlerIn(read('src/Tabs/settings/people/TeamsDetail.jsx'), 'TeamsDetail', 'assignTo');
    const said = [], state = { settings, taken: 0, open: true, busy: [], heldAtMember: [] };
    const r = requests(answers, {
        settings: () => ({ ok: true, status: 200, error: null, data: { success: true }, revs: { teams: 'T2' } }),
        users: (body) => ({ ok: true, status: 200, error: null, data: { user: { ...TEAM_USERS.find((u) => u.id === body.id), ...body, answered: true } } }),
    });
    await runAs(assignTo, {
        assigning, assigningUser: user, teams: settings.teams || [], settings,
        allUsers: (settings.users || []).filter((u) => u.name),
        requestOrg: () => 'org_A', stillOrg: (o) => o === 'org_A',
        dbFetch: r.dbFetch, writeSettings: r.writeSettings,
        dbWrite: (url, opts) => { state.heldAtMember.push(state.settings.revs?.teams); return r.dbWrite(url, opts); },
        takeLatestSettings: async (set) => {
            state.taken += 1;
            if (!latest) return null;
            set((prev) => ({ ...prev, teams: latest.teams, revs: latest.revs }));
            return latest;
        },
        teamsWithMemberOn, revsAfter, listChanged,
        setAssignErr: (v) => said.push(v), setAssigning: (v) => state.busy.push(v),
        setAssigningUser: (v) => { if (v === null) state.open = false; },
        setSettings: (f) => { state.settings = f(state.settings); },
    }, to);
    return { calls: r.calls, said: said.filter(Boolean), state };
};

test('S7 — Assign, run as written: the render\'s token; the landed list and its token merged before the member\'s save; the roster kept whole, the member as answered', async () => {
    const r = await runAssign({ settings: TEAMS_START, to: WEST_TEAM });
    assert.deepEqual(r.calls.map((c) => c.to), ['settings', 'users']);
    assert.deepEqual(r.calls[0].body.ifRevs, { teams: 'T1' }, 'REGRESSION: the list sent with no token');
    assert.deepEqual(r.calls[0].body.teams.map((t) => [t.id, t.repIds]), [['team_east', ['usr_b']], ['team_west', ['usr_a']]]);
    assert.deepEqual(r.calls[1].body, { id: 'usr_a', team: 'West', teamId: 'team_west', territory: '', vertical: 'Health' });
    assert.deepEqual(r.state.heldAtMember, ['T2'], 'REGRESSION: the member\'s save goes out before the landed list\'s token is held');
    assert.deepEqual(r.state.settings.revs, { teams: 'T2', spiffs: 'S1' });
    assert.deepEqual(r.state.settings.users.map((u) => u.id), ['usr_a', 'usr_b', 'usr_x'], 'REGRESSION (JB2-7): a member with no name dropped from the roster');
    assert.equal(r.state.settings.users[0].answered, true, 'the row as the server answered it');
    assert.equal(r.state.open, false, 'the window closes');
    assert.deepEqual(r.said, []);
    assert.deepEqual(r.state.busy, [true, false], 'the buttons wait for the answer, and are freed');

    const bare = await runAssign({ settings: TEAMS_START, to: WEST_TEAM, answers: { users: () => ({ ok: true, status: 200, error: null, data: {} }) } });
    const ann = bare.state.settings.users[0];
    assert.deepEqual([ann.team, ann.teamId, ann.territory, ann.vertical], ['West', 'team_west', '', 'Health'], 'no row answered: the team as sent');

    const busy = await runAssign({ settings: TEAMS_START, to: WEST_TEAM, assigning: true });
    assert.deepEqual([busy.calls, busy.said, busy.state.busy], [[], [], []], 'REGRESSION: a second click while one is out sends the same token again');
});

test('S7 — Assign, run as written: stale, the latest taken and said, no member save, the window open; a member save that fails keeps the merged token', async () => {
    const { listChanged, STALE_ERROR } = await import('../src/utils/settingsRevs.js');
    const answers = { settings: await STALE_ANSWER('teams') };
    const latest = { teams: [EAST_TEAM, WEST_TEAM, { id: 'team_new', name: 'New', repIds: [] }], revs: { teams: 'TL' } };
    const r = await runAssign({ settings: TEAMS_START, to: WEST_TEAM, answers, latest });
    assert.deepEqual(r.calls.map((c) => c.to), ['settings'], 'REGRESSION: the member saved onto a team the list refused');
    assert.equal(r.state.taken, 1, 'REGRESSION: the latest not taken');
    assert.deepEqual(r.said, [listChanged('team')]);
    assert.equal(r.state.open, true, 'the window stays open, drawn from the latest (JB2-5)');
    assert.deepEqual(r.state.settings.teams, latest.teams);
    assert.deepEqual(r.state.busy, [true, false]);
    const blind = await runAssign({ settings: TEAMS_START, to: WEST_TEAM, answers });
    assert.deepEqual(blind.said, [`Not assigned — ${STALE_ERROR}`], 'the latest unread: the refusal');

    const failed = await runAssign({ settings: TEAMS_START, to: WEST_TEAM, answers: { users: () => ({ ok: false, status: 404, error: 'gone' }) } });
    assert.deepEqual(failed.said, ['Team updated, but Ann was not — gone']);
    assert.equal(failed.state.settings.revs.teams, 'T2', 'REGRESSION: the landed list\'s token lost with the member\'s save — the next teams save refused');
    assert.deepEqual(failed.state.settings.teams[1].repIds, ['usr_a'], 'the list as landed');
    assert.equal(failed.state.open, true);
});

test('S7 — Assign, run as written (JB2-8): the member\'s save refused, the same team again, then another — the member is listed once, on one team', async () => {
    let s = TEAMS_START;
    const one = await runAssign({ settings: s, to: EAST_TEAM, answers: { users: () => ({ ok: false, status: 404, error: 'gone' }) } });
    s = one.state.settings;
    assert.deepEqual(s.teams[0].repIds, ['usr_b', 'usr_a'], 'the list landed');
    const two = await runAssign({ settings: s, to: s.teams[0] });
    s = two.state.settings;
    assert.deepEqual(two.calls.map((c) => c.to), ['users'], 'REGRESSION: the list already holds them — sent again, listing them twice');
    const three = await runAssign({ settings: s, to: s.teams[1], user: s.users.find((u) => u.id === 'usr_a') });
    s = three.state.settings;
    assert.deepEqual(three.calls[0].body.ifRevs, { teams: 'T2' }, 'the token the first click merged');
    const holding = s.teams.flatMap((t) => (t.repIds || []).filter((id) => id === 'usr_a').map(() => t.id));
    assert.deepEqual(holding, ['team_west'], 'REGRESSION (JB2-8): the member listed twice, or on two teams');
});

// ── S8 — the scanners' own reading ───────────────────────────────────────────

test('S8 — the scanners see what they are for, on made-up sources', () => {
    assert.equal(urlCount("// '/.netlify/functions/settings'\nconst a = '/.netlify/functions/settings';\n/* '/.netlify/functions/settings' */\nconst b = '/.netlify/functions/settings-x';\nconst c = <div>{/* '/.netlify/functions/settings' */}</div>;\n"), 1,
        'a string counts; a comment, a JSX comment and another function do not');
    const sends = (body) => sendFaults('src/made.jsx', `const C = ({ settings, setSettings }) => { const base = {}; const ref = {}; ${body} };`).out.length;
    assert.equal(sends('const f = async () => { await writeSettings({ teams: t }, { teams: settings.revs?.teams ?? null }); };'), 0, 'the render\'s token');
    assert.equal(sends('const f = async () => { const tr = settings.revs?.teams ?? null; await putSettings({ teams: t }, { teams: tr }); };'), 0, 'a const set from it');
    assert.equal(sends('const tr = settings.revs?.teams ?? null; const f = () => { x.onchange = async () => { await writeSettings({ teams: t }, { teams: tr }); }; };'), 0, 'in a function further out');
    assert.equal(sends('const f = async () => { await writeSettings({ teams: t }, { teams: base.rev }); };'), 0, 'a window\'s snapshot');
    assert.equal(sends("const f = async () => { await addToSettingsList('teams', g, { list: settings.teams, rev: settings.revs?.teams ?? null, setSettings }); };"), 0);
    for (const bad of [
        'const f = async () => { await putSettings({ teams: t }); };',
        'const f = async () => { await putSettings({ teams: t }, {}); };',
        'const f = async () => { await putSettings({ teams: t }, null); };',
        'const f = async () => { await writeSettings({ teams: t }, { teams: ref.current }); };',
        'const f = async () => { await writeSettings({ teams: t }, { teams: settings.revs?.territories ?? null }); };',
        'const f = async () => { await writeSettings({ teams: t }, { teams: w.revs.teams }); };',
        'const f = async () => { await writeSettings({ teams: t, territories: u }, { teams: base.rev }); };',
        'const f = async () => { let tr = settings.revs.teams; await writeSettings({ teams: t }, { teams: tr }); };',
        'const f = () => setSettings(prev => { writeSettings({ teams: t }, { teams: prev.revs.teams }); return prev; });',
        "const f = async () => { await addToSettingsList('teams', g, { list: settings.teams, rev: latest.revs?.teams ?? null, setSettings }); };",
        "const f = async () => { await addToSettingsList('teams', g, { list: settings.teams, rev: settings.revs?.teams ?? null }); };",
    ]) assert.ok(sends(bad) > 0, `not seen: ${bad}`);

    const refusals = (body) => refusalFaults('src/made.jsx', body).length;
    assert.equal(refusals('const f = async () => { try { await putSettings({}, {}); } catch (e) { if (e.stale) await takeLatestSettings(s); } };'), 0);
    assert.equal(refusals('const f = async () => { const w = await writeSettings({}, {}); if (w.stale) await takeLatestSettings(s); };'), 0);
    assert.equal(refusals("const f = async () => { const a = await addToSettingsList('teams', g, {}); if (a.twice) x(); };"), 0);
    for (const bad of [
        'const f = async () => { try { await putSettings({}, {}); } catch (e) { say(e.message); } };',
        'const f = async () => { await putSettings({}, {}); };',
        'const f = async () => { try { await putSettings({}, {}); } finally { done(); } };',
        'const f = async () => { const w = await writeSettings({}, {}); if (!w.ok) say(w.error); };',
        "const f = async () => { const a = await addToSettingsList('teams', g, {}); if (!a.ok) x(); };",
        "const f = async () => { const a = await addToSettingsList('teams', g, {}); if (a.twice) await takeLatestSettings(s); };",
    ]) assert.ok(refusals(bad) > 0, `not seen: ${bad}`);

    const updaters = (body) => updaterFaults('src/made.jsx', body).length;
    assert.equal(updaters('setSettings(prev => ({ ...prev, teams: t, revs: revsAfter(prev.revs, w.revs) }));'), 0);
    assert.equal(updaters('setSettings(prev => ({ ...prev, ...(x ? { teams: t, revs: revsAfter(prev.revs, r) } : {}) }));'), 0, 'a conditional spread');
    assert.equal(updaters('setSettings(prev => settingsAfterRemoval(prev, id, r));'), 0, 'the removal\'s own');
    assert.equal(updaters('setSettings(prev => ({ ...prev, users: [] }));'), 0);
    for (const bad of [
        'setSettings(prev => ({ ...prev, teams: t }));',
        'setSettings(prev => ({ ...prev, territories: t, revs: w.revs }));',
        'setSettings(prev => ({ ...prev, teams: t, revs: { ...prev.revs, ...w.revs } }));',
        'setSettings(p => ({ ...p, [key]: t }));',
        '_setSettings(prev => ({ ...prev, teams: t, revs: revsAfter(null, w.revs) }));',
    ]) assert.ok(updaters(bad) > 0, `not seen: ${bad}`);
});

test('S8 — the scanners read a panel\'s hook by the scope, on made-up sources: its opened, its panelStale, its landed (state §0.226)', () => {
    const HOOKED = 'const { opened, landed, panelStale, once } = usePanelRevs(settings, setSettings);';
    const inPanel = (body) => `const P = ({ settings, setSettings }) => { ${HOOKED} ${body} };`;
    const sends = (src) => sendFaults('src/made.jsx', src).out.length;
    assert.equal(sends(inPanel('const save = once(async () => { await putSettings({ teams: t }, opened); });')), 0, 'the hook\'s opened');
    assert.equal(sends(inPanel('const save = async () => { const payload = {}; await putSettings(payload, opened); };')), 0, 'any payload: withIfRevs picks the keys it sends');
    assert.equal(sends(inPanel('const save = useCallback(once(async () => { await putSettings({ [k]: v }, opened); }), [opened]);')), 0, 'under useCallback');
    assert.equal(sends(`function F({ settings, setSettings }) { ${HOOKED} const save = async () => { await writeSettings(p, opened); }; }`), 0, 'a function component');
    for (const bad of [
        `const A = ({ settings, setSettings }) => { ${HOOKED} }; const B = () => { const save = async () => { await putSettings(p, opened); }; };`,
        'const P = ({ settings, setSettings }) => { const [opened] = useState({}); const save = async () => { await putSettings(p, opened); }; };',
        inPanel('const save = async () => { await putSettings(p, settings.revs); };'),
        inPanel('const save = async () => { await putSettings({ teams: t }, { teams: opened.territories }); };'),
        'const P = ({ settings, setSettings, opened }) => { const save = async () => { await putSettings(p, opened); }; };',
        inPanel('const save = async (opened) => { await putSettings(p, opened); };'),
        inPanel('const save = async () => { const opened = settings.revs; await putSettings(p, opened); };'),
        'const P = ({ settings, setSettings }) => { const { opened } = usePanelState(settings, setSettings); const save = async () => { await putSettings(p, opened); }; };',
        'const P = ({ settings, setSettings, latest }) => { const { opened } = usePanelRevs(latest, setSettings); const save = async () => { await putSettings(p, opened); }; };',
        'const P = ({ settings, setSettings }) => { const { revs: opened } = usePanelRevs(settings, setSettings); const save = async () => { await putSettings(p, opened); }; };',
        'const P = ({ settings, setSettings }) => { let { opened } = usePanelRevs(settings, setSettings); const save = async () => { await putSettings(p, opened); }; };',
        `${HOOKED} const P = () => { const save = async () => { await putSettings(p, opened); }; };`,
        inPanel('const save = async () => { await putSettings(p, opened, x); };'),
    ]) assert.ok(sends(bad) > 0, `not seen: ${bad}`);

    const refusals = (src) => refusalFaults('src/made.jsx', src).length;
    const guardedPanel = (catchBody, e = 'e') => inPanel(`const save = once(async () => { try { await putSettings(p, opened); } catch (${e}) { ${catchBody} } }); useRegisterSave(ref, dirty, save);`);
    assert.equal(refusals(guardedPanel('if (e.stale && await panelStale(e)) throw e; say(e.message); throw e;')), 0, 'a guarded panel hands it to AdminView first');
    assert.equal(refusals(guardedPanel('if (err.stale && await panelStale(err, W)) { throw err; } throw err;', 'err')), 0, 'its own binding, its own words');
    assert.equal(refusals(inPanel('const save = async () => { try { await putSettings(p, opened); } catch (e) { if (e.stale) await panelStale(e, W); throw e; } };')), 0, 'unguarded: panelStale in place of takeLatestSettings');
    for (const bad of [
        'const P = () => { const panelStale = async () => true; const save = async () => { try { await putSettings(p, {}); } catch (e) { if (e.stale && await panelStale(e)) throw e; } }; };',
        'const P = ({ panelStale }) => { const save = async () => { try { await putSettings(p, {}); } catch (e) { if (e.stale && await panelStale(e)) throw e; } }; };',
        guardedPanel('say(e.message); if (e.stale && await panelStale(e)) throw e; throw e;'),
        guardedPanel('if (e.stale) await takeLatestSettings(setSettings); throw e;'),
        guardedPanel('if (e.stale && await panelStale(e)) throw new Error(e.message);'),
        guardedPanel('if (x.stale && await panelStale(x)) throw x; throw e;'),
        guardedPanel('if (e.stale && panelStale(e)) throw e; throw e;'),
        guardedPanel('if (e.stale || await panelStale(e)) throw e; throw e;'),
        guardedPanel('if (e.stale && await panelStale(e)) throw e; else say(e.message);'),
    ]) assert.ok(refusals(bad) > 0, `not seen: ${bad}`);

    const lands = (src) => updaterFaults('src/made.jsx', src).length + landFaults('src/made.jsx', src).length;
    assert.equal(lands(inPanel('const save = async () => { const answer = await putSettings({ [k]: v }, opened); setSettings(prev => ({ ...prev, [k]: v })); landed(answer); };')), 0, 'a computed key, its token landed after the send');
    assert.equal(lands(inPanel('const save = async () => { try { const answer = await putSettings(p, opened); setSettings((s) => ({ ...s, ...p })); landed(answer); } catch (e) { throw e; } };')), 0);
    for (const bad of [
        inPanel('const save = async () => { const answer = await putSettings({ [k]: v }, opened); setSettings(prev => ({ ...prev, [k]: v })); };'),
        inPanel('const save = async () => { landed(answer0); const answer = await putSettings({ [k]: v }, opened); setSettings(prev => ({ ...prev, [k]: v })); };'),
        inPanel('const save = async () => { const answer = await putSettings(p, opened); setSettings(prev => ({ ...prev, ...p })); landed(settings); };'),
        inPanel('const save = async () => { await putSettings(p, opened); setSettings(prev => ({ ...prev, ...p })); };'),
        inPanel('const save = async () => { const answer = await putSettings(p, opened); const later = () => landed(answer); later(); };'),
        'const P = ({ settings, setSettings }) => { const landed = () => {}; const save = async () => { const answer = await putSettings({ [k]: v }, {}); setSettings(prev => ({ ...prev, [k]: v })); landed(answer); }; };',
        inPanel('const save = async () => { const answer = await putSettings(p, opened); setSettings({ ...settings, ...p }); landed(answer); };'),
        inPanel('const save = async () => { let snapshot = settings; const answer = await putSettings(p, opened); landed(answer); };'),
    ]) assert.ok(lands(bad) > 0, `not seen: ${bad}`);
});

test('S8 — the scanners read the Sales Manager\'s own tokens, on made-up sources: its drafts\' setters, in that file alone (state §0.228); an updater\'s row built in a function inside it is that row, not the copy', () => {
    const DRAFTS = {
        tiers: 'const draftTiers = (next) => { if (tiersDraft === null) setOpened(o => ({ ...o, quotaData: settings.revs?.quotaData ?? null })); setTiersDraft(next); };',
        spiffs: 'const draftSpiffs = (next) => { if (spiffsDraft === null) setOpened(o => ({ ...o, spiffs: settings.revs?.spiffs ?? null })); setSpiffsDraft(next); };',
    };
    const manager = ({ state = 'const [opened, setOpened] = useState({});', tiers = DRAFTS.tiers, spiffs = DRAFTS.spiffs, save = 'const w = await writeSettings(patch, opened);', before = '' } = {}) =>
        `${before} export default function SalesManagerTab() { const { settings } = useApp(); const [tiersDraft, setTiersDraft] = useState(null); const [spiffsDraft, setSpiffsDraft] = useState(null); ${state} ${tiers} ${spiffs} const saveExtra = async (patch) => { ${save} }; }`;
    const sends = (src, file = SALES_MANAGER) => sendFaults(file, src).out.length;
    assert.equal(sends(manager()), 0, 'each draft\'s token, taken when it begins');
    const withTiers = (body) => manager({ tiers: `const draftTiers = (next) => { ${body} setTiersDraft(next); };` });
    for (const bad of [
        manager({ state: '', before: 'function Other() { const [opened, setOpened] = useState({}); }' }),
        manager({ save: 'setOpened(o => ({ ...o, spiffs: settings.revs?.spiffs ?? null })); const w = await writeSettings(patch, opened);' }),
        manager({ save: 'const w = await writeSettings(patch, settings.revs);' }),
        manager({ save: 'const w = await writeSettings({ teams: t }, { teams: opened.territories });' }),
        withTiers('setOpened(o => ({ ...o, quotaData: settings.revs?.quotaData ?? null }));'),
        withTiers('if (spiffsDraft === null) setOpened(o => ({ ...o, quotaData: settings.revs?.quotaData ?? null }));'),
        withTiers('if (tiersDraft === null) setOpened(o => ({ ...o, spiffs: settings.revs?.spiffs ?? null }));'),
        withTiers('if (tiersDraft === null) setOpened(o => ({ ...o, quotaData: o.quotaData ?? null }));'),
        withTiers('if (tiersDraft === null) setOpened(o => ({ ...o, quotaData: ref.current }));'),
        withTiers('if (tiersDraft === null) setOpened(settings.revs);'),
        withTiers('if (tiersDraft === null) setOpened(o => ({ quotaData: settings.revs?.quotaData ?? null }));'),
        withTiers(''),
        manager({ state: 'let [opened, setOpened] = useState({});' }),
        manager({ state: 'const [opened, setOpened] = useRef({});' }),
        manager({ state: 'const { opened, setOpened } = useDrafts();' }),
    ]) assert.ok(sends(bad) > 0, `not seen: ${bad}`);
    assert.ok(sends(manager(), 'src/made.jsx') > 0, 'REGRESSION: a stray useState `opened` accepted outside the Sales Manager — every panel\'s tokens are its hook\'s');

    const updaters = (body) => updaterFaults('src/made.jsx', body).length;
    assert.equal(updaters('setSettings(prev => ({ ...prev, users: (prev.users || []).map(u => u.id === id ? { ...u, [field]: value } : u) }));'), 0,
        'a member\'s row in a .map: its own computed field, not a list of the copy');
    for (const bad of [
        'setSettings(prev => { const next = { ...prev, [key]: t }; return next; });',
        'setSettings(prev => ({ ...prev, [key]: t, users: prev.users.map(u => ({ ...u })) }));',
        'setSettings(prev => ({ ...prev, users: prev.users.map(u => u), teams: t }));',
    ]) assert.ok(updaters(bad) > 0, `not seen: ${bad}`);
});

test('S8 — the suites list holds this file: the harness grades it', () => {
    const suites = read('scripts/mutate-import.mjs').match(/^const SUITES = '([^'\n]*)';$/m)?.[1].split(' ') ?? [];
    assert.ok(suites.includes('tests/settings-saves.test.mjs'), 'SUITES runs this file');
});

// ── S9 — usePanelRevs, run as written ───────────────────────────────────────

// The hook as written, its imports stripped, React's hooks stubbed as React holds them: each call's slot by its place
// in the render (a state, a ref, an effect), kept across renders; an effect runs after its render when its deps moved,
// its cleanup on unmount. The context is what the test provides — AdminView's { took, landed }, or none.
const hookRig = async (context = null) => {
    const { revsAfter } = await import('../src/utils/settingsRevs.js');
    const body = read(HOOK).replace(/^import .*\n/gm, '').replace(/^export /gm, '');
    const slots = [], cleanups = [];
    let at = 0, pending = [];
    const React = {
        createContext: (value) => ({ value }),
        useContext: () => context,
        useState: (init) => {
            const i = at++;
            if (!(i in slots)) slots[i] = { v: typeof init === 'function' ? init() : init };
            const slot = slots[i];
            return [slot.v, (next) => { slot.v = typeof next === 'function' ? next(slot.v) : next; }];
        },
        useRef: (init) => { const i = at++; if (!(i in slots)) slots[i] = { current: init }; return slots[i]; },
        useEffect: (fn, deps) => {
            const i = at++, was = slots[i];
            if (was && deps && deps.length === was.deps.length && deps.every((d, k) => Object.is(d, was.deps[k]))) return;
            slots[i] = { deps: deps || [] };
            pending.push(fn);
        },
    };
    const { usePanelRevs } = new Function('React', 'revsAfter', `${body}\nreturn { usePanelRevs };`)(React, revsAfter);
    return {
        render: (settings, setSettings) => {
            at = 0;
            const out = usePanelRevs(settings, setSettings);
            for (const fn of pending.splice(0)) { const c = fn(); if (typeof c === 'function') cleanups.push(c); }
            return out;
        },
        unmount: () => { for (const c of cleanups.splice(0)) c(); },
    };
};

test('S9 — usePanelRevs, run as written: opened is the tokens of the render the draft was seeded from; landed merges an answer key by key into the copy and into opened; reopen takes them again', async () => {
    let copy = { x: 1, revs: { a: 'A1', b: 'B1' } };
    const setSettings = (f) => { copy = f(copy); };
    const rig = await hookRig();
    const first = rig.render(copy, setSettings);
    assert.deepEqual(first.opened, { a: 'A1', b: 'B1' });
    assert.notEqual(first.opened, copy.revs, 'a copy of the tokens, not the app\'s own object');
    const later = rig.render({ x: 1, revs: { a: 'A2', b: 'B1', c: 'C2' } }, setSettings);
    assert.deepEqual(later.opened, { a: 'A1', b: 'B1' }, 'REGRESSION: the tokens read at send time — a draft seeded from the first render sent with a newer copy\'s, a lost update');

    later.landed({ success: true, revs: { a: 'A3', junk: 7 } });
    assert.deepEqual(copy, { x: 1, revs: { a: 'A3', b: 'B1' } }, 'REGRESSION: the copy\'s tokens replaced whole, or the answered one not merged');
    assert.deepEqual(rig.render(copy, setSettings).opened, { a: 'A3', b: 'B1' }, 'REGRESSION: opened not re-based on the save that landed — the panel\'s next save refused against its own');
    rig.render(copy, setSettings).landed({ success: true });
    assert.deepEqual(copy.revs, { a: 'A3', b: 'B1' }, 'an answer with no tokens keeps them');
    assert.deepEqual(rig.render(copy, setSettings).opened, { a: 'A3', b: 'B1' });

    rig.render({ revs: { a: 'A9' } }, setSettings).reopen();
    assert.deepEqual(rig.render(copy, setSettings).opened, { a: 'A9' }, 'reopen(): the render\'s tokens, whole');
    rig.render(copy, setSettings).reopen({ z: 'Z1' });
    assert.deepEqual(rig.render(copy, setSettings).opened, { z: 'Z1' }, 'reopen(revs): those, whole');
    rig.render({}, setSettings).reopen();
    assert.deepEqual(rig.render(copy, setSettings).opened, {}, 'a copy with no tokens: none');
});

test('S9 — usePanelRevs, run as written: AdminView\'s handler takes a stale refusal, told whether the panel is still open; a landed save clears the note only while open; no AdminView, no handler', async () => {
    const took = [], cleared = [];
    const rig = await hookRig({ took: async (e, words, isAlive) => { took.push({ e, words, isAlive }); return 'TAKEN'; }, landed: () => cleared.push(true) });
    let copy = { revs: { a: 'A1' } };
    const setSettings = (f) => { copy = f(copy); };
    const panel = rig.render(copy, setSettings);
    const e = new Error('stale');
    assert.equal(await panel.panelStale(e, 'W'), 'TAKEN', 'AdminView\'s answer, as it gave it');
    assert.equal(took.length, 1);
    assert.deepEqual([took[0].e, took[0].words, took[0].isAlive()], [e, 'W', true]);
    panel.landed({ revs: { a: 'A2' } });
    assert.deepEqual(cleared, [true], 'a save that lands clears the words above the panel');
    rig.unmount();
    assert.equal(took[0].isAlive(), false, 'REGRESSION (critic A2): a refusal answered after Back reads as the open panel\'s — that panel remounted, its draft lost');
    panel.landed({ revs: { a: 'A3' } });
    assert.deepEqual(cleared, [true], 'REGRESSION (critic A2): a save that landed after Back cleared the words of the panel open now');
    assert.deepEqual(copy.revs, { a: 'A3' }, 'the copy still takes the tokens — they are the org\'s');

    const bare = (await hookRig()).render({ revs: {} }, () => {});
    assert.equal(await bare.panelStale(new Error('stale')), false, 'no AdminView around it: the panel keeps its draft and says the server\'s words');
    assert.doesNotThrow(() => bare.landed({ revs: {} }));
});

test('S9 — usePanelRevs, run as written: once — a second save while one is out shares its outcome, across renders, a refusal too; cleared once it settles (JB3-10)', async () => {
    const rig = await hookRig();
    const gates = [], args = [];
    const save = (...a) => { args.push(a); return new Promise((resolve, reject) => gates.push({ resolve, reject })); };
    const first = rig.render({}, () => {}).once(save)('own Save');
    const second = rig.render({}, () => {}).once(save)('the guard');
    assert.equal(second, first, 'REGRESSION (JB3-10): the guard\'s Save sent while the panel\'s own is out — refused by it');
    assert.deepEqual(args, [['own Save']]);
    gates[0].resolve('landed');
    assert.equal(await first, 'landed');
    await tick();
    const third = rig.render({}, () => {}).once(save)();
    assert.notEqual(third, first, 'REGRESSION: the flight never cleared — every later save answers the first one\'s outcome');
    assert.equal(args.length, 2);
    assert.equal(rig.render({}, () => {}).once(save)(), third, 'a refusal is shared too');
    gates[1].reject(new Error('refused'));
    await assert.rejects(third, /refused/);
    await tick();
    rig.render({}, () => {}).once(save)();
    assert.equal(args.length, 3, 'cleared after a refusal');
    gates[2].resolve();
});

// ── S10 — a draft panel's save, run as written ──────────────────────────────

const CUSTOMER_TYPES = 'src/Tabs/settings/salesProcess/CustomerTypesDetail.jsx';
const FLAT_LIST = 'src/Tabs/settings/salesProcess/FlatListDetail.jsx';
const FEATURES = 'src/Tabs/settings/data/FeaturesDetail.jsx';
const PROPERTY_TYPES = 'src/Tabs/settings/dispatch/DispatchPropertyTypesDetail.jsx';
const staleRefusal = async (key) => {
    const { STALE_ERROR } = await import('../src/utils/settingsRevs.js');
    return Object.assign(new Error(STALE_ERROR), { stale: [key] });
};
// A panel's save as written, its hook and the sender stubbed: once hands the save itself back (the hook's own is S9's);
// putSettings answers `answer` or throws `refusal`; panelStale answers `took`. Today's direct send is kept so old code
// fails on what it sends, not on a missing name. Answers the steps in order, the words said, what went to AdminView,
// and what it threw.
const runPanelSave = async (file, component, handler, scope, { answer = { success: true, revs: {} }, refusal = null, took = false } = {}) => {
    const steps = [], said = [], handed = [];
    let copy = { revs: { k: 'NEWER' } };
    const opened = { k: 'OPENED' };
    let thrown = null;
    try {
        await runAs(handlerIn(read(file), component, handler), {
            once: (fn) => fn, opened,
            putSettings: async (...a) => { steps.push(['put', ...a]); if (refusal) throw refusal; return answer; },
            setSettings: (f) => { steps.push(['set']); copy = f(copy); },
            landed: (a) => steps.push(['landed', a]),
            panelStale: async (e, words) => { handed.push([e, words]); return took; },
            setSaving: (v) => steps.push(['saving', v]), setDirty: (v) => steps.push(['dirty', v]),
            setSaveError: (v) => said.push(v), setError: (v) => said.push(v),
            dbFetch: async (url, opts) => { steps.push(['dbFetch', url, JSON.parse(opts.body)]); return { ok: true, status: 200, json: async () => answer }; },
            requestOrg: () => 'org_A', stillOrg: () => true,
            ...scope,
        });
    } catch (e) { thrown = e; }
    return { steps, said: said.filter(Boolean), handed, thrown, opened, copy };
};
const stepOf = (r, kind) => r.steps.find((s) => s[0] === kind);
const kindsOf = (r) => r.steps.map((s) => s[0]);

test('S10 — Customer types\' save, run as written: the tokens it opened with; lands, its answer to landed after the mirror; stale — to AdminView, rethrown, no words; unread — the server\'s words, the draft kept; a 404\'s words', async () => {
    const tiers = [{ tier: 'SMB', hex: '#8a9a7a' }];
    const answer = { success: true, revs: { customerTypeTiers: 'T2' } };
    const run = (o) => runPanelSave(CUSTOMER_TYPES, 'CustomerTypesDetail', 'handleSave', { tiers }, o);
    const ok = await run({ answer });
    const put = stepOf(ok, 'put');
    assert.ok(put, 'REGRESSION: the save never went through the sender');
    assert.deepEqual(put[1], { customerTypeTiers: tiers });
    assert.equal(put[2], ok.opened, 'REGRESSION: the save names no tokens, or not the ones the panel opened with');
    const k = kindsOf(ok);
    assert.ok(k.indexOf('put') < k.indexOf('set') && k.indexOf('set') < k.indexOf('landed'), `the send, the mirror, then landed: ${k}`);
    assert.equal(stepOf(ok, 'landed')[1], answer, 'REGRESSION: landed handed something other than the send\'s answer');
    assert.deepEqual(ok.copy.customerTypeTiers, tiers);
    assert.deepEqual([ok.thrown, ok.said, ok.handed], [null, [], []]);
    assert.ok(ok.steps.some((s) => s[0] === 'dirty' && s[1] === false), 'saved: clean');

    const refusal = await staleRefusal('customerTypeTiers');
    const taken = await run({ refusal, took: true });
    assert.equal(taken.thrown, refusal, 'rethrown — the leave guard stays, and reads tookLatest');
    assert.deepEqual(taken.handed, [[refusal, undefined]], 'REGRESSION (J-B5): a stale refusal not handed to AdminView');
    assert.deepEqual(taken.said, [], 'REGRESSION: the old mount says words over the latest');
    assert.ok(!kindsOf(taken).includes('set') && !kindsOf(taken).includes('landed'), 'nothing of the refused draft reaches the copy');

    const unread = await run({ refusal, took: false });
    assert.equal(unread.thrown, refusal);
    assert.deepEqual(unread.said, [refusal.message], 'the latest unread: the server\'s words, the draft kept');
    assert.ok(!unread.steps.some((s) => s[0] === 'dirty' && s[1] === false), 'still dirty');

    const gone = await run({ refusal: new Error('Not in your organization.') });
    assert.deepEqual([gone.said, gone.handed, gone.thrown?.message], [['Not in your organization.'], [], 'Not in your organization.'], 'a refusal that is not stale: its words, never AdminView\'s');
});

test('S10 — a flat list\'s save (a function component, its key computed), run as written: the tokens it opened with; landed after the mirror; stale to AdminView', async () => {
    const items = ['Acme'];
    const run = (o) => runPanelSave(FLAT_LIST, 'FlatListDetail', 'handleSave', { items, settingsKey: 'competitors' }, o);
    const ok = await run({});
    const put = stepOf(ok, 'put');
    assert.ok(put && put[2] === ok.opened, 'REGRESSION: the list sent with no tokens, or not the ones it opened with');
    assert.deepEqual(put[1], { competitors: items });
    assert.deepEqual(ok.copy.competitors, items);
    assert.ok(kindsOf(ok).indexOf('landed') > kindsOf(ok).indexOf('set'), 'REGRESSION: the computed key\'s token never merged — the next save refused against its own');
    const refusal = await staleRefusal('competitors');
    const taken = await run({ refusal, took: true });
    assert.deepEqual([taken.thrown, taken.handed.length, taken.said], [refusal, 1, []]);
});

test('S10 — Features\' save, run as written (J-B12): the tokens it opened with; stale — the key words when a key went, by the payload; unread — the typed key cleared, never kept across the latest', async () => {
    const { PANEL_CHANGED, PANEL_CHANGED_KEY } = await import('../src/utils/settingsRevs.js');
    const base = {
        PANEL_CHANGED, PANEL_CHANGED_KEY,
        aiSettings: { model: 'm' }, flags: { 'deal-scoring': true },
        tabViz: { leadsEnabled: true, quotesEnabled: true, dispatchEnabled: false, repsCanUseDispatch: false },
        aiScoring: false, aiPrompts: true,
    };
    const run = async (keyAction, apiKeyInput, o) => {
        const key = [];
        const r = await runPanelSave(FEATURES, 'FeaturesDetail', 'handleSaveAi', { ...base, keyAction, apiKeyInput,
            setApiKeyInput: (v) => key.push(['input', v]), setKeyAction: (v) => key.push(['action', v]) }, o);
        return { ...r, key };
    };
    const answer = { success: true, anthropicApiKeySet: true, revs: { aiSettings: 'A2' } };
    const ok = await run('set', ' sk-new ', { answer });
    const put = stepOf(ok, 'put');
    assert.ok(put, 'REGRESSION: the save never went through the sender');
    assert.equal(put[2], ok.opened, 'REGRESSION: the save names no tokens, or not the ones the panel opened with');
    assert.equal(put[1].anthropicApiKey, 'sk-new');
    assert.equal(stepOf(ok, 'landed')?.[1], answer, 'the answer to landed');
    assert.deepEqual(ok.key, [['input', ''], ['action', null]], 'the plaintext dropped once saved');

    const refusal = await staleRefusal('aiSettings');
    const keyTaken = await run('set', 'sk-new', { refusal, took: true });
    assert.deepEqual(keyTaken.handed, [[refusal, PANEL_CHANGED_KEY]], 'REGRESSION (J-B12): a typed key gone with the old mount, and nothing asks for it again');
    assert.deepEqual([keyTaken.thrown, keyTaken.said], [refusal, []]);
    const cleared = await run('clear', '', { refusal, took: true });
    assert.equal(cleared.handed[0]?.[1], PANEL_CHANGED_KEY, 'a key cleared went with the save too');
    const keyUnread = await run('set', 'sk-new', { refusal, took: false });
    assert.deepEqual(keyUnread.key, [['input', ''], ['action', null]], 'REGRESSION (J-B12): the typed key kept across a refusal');
    assert.equal(keyUnread.said.length, 1);
    assert.ok(keyUnread.said[0].startsWith('Failed to save: ' + refusal.message) && keyUnread.said[0].endsWith('Enter the API key again.'), keyUnread.said[0]);
    assert.equal(keyUnread.thrown, refusal);

    const noKey = await run('set', '   ', { refusal, took: true });
    assert.equal(noKey.handed[0]?.[1], PANEL_CHANGED, 'REGRESSION (critic B2): \'set\' with an empty box sends no key — yet the words ask for one');
    assert.ok(!('anthropicApiKey' in stepOf(noKey, 'put')[1]));
    const noKeyUnread = await run(null, '', { refusal, took: false });
    assert.deepEqual([noKeyUnread.said, noKeyUnread.key], [['Failed to save: ' + refusal.message], []], 'no key sent: the server\'s words, nothing cleared');

    const forbidden = await run(null, '', { refusal: new Error('You need the Admin role to change these settings.') });
    assert.deepEqual([forbidden.handed, forbidden.said], [[], ['Failed to save: You need the Admin role to change these settings.']]);
});

// ── S10 — B-3b's saves, run as written (state §0.228) ──────────────────────

const deferred = () => { let resolve, reject; const p = new Promise((a, b) => { resolve = a; reject = b; }); return { p, resolve, reject }; };
// An optimistic panel's save as written (Pipelines' persist, the calendar's persistHolidays and Sync): one gate across
// calls; the app's copy as React holds it (a value set replaces it); the render's settings fixed; each send held until
// the test answers it; panelStale answers `took` — or, with `hold`, when the test answers it (st.answerStale), so the
// gate is read while AdminView reads the latest. The gate's release on a landed render is the [opened] effect's —
// pinned in S12, never run here. `extra(st)` adds a handler's own scope.
const optimisticRig = async (file, component, handler, sayer, extra = () => ({})) => {
    const { STILL_SAVING } = await import('../src/utils/settingsRevs.js');
    const settings = {
        pipelines: [{ id: 'p1', name: 'Sales' }], assignmentRules: [{ id: 'r1' }], customHolidays: [{ date: 'Jan 2', name: 'Ours' }],
        revs: { pipelines: 'R0', customHolidays: 'C0', other: 'O0' },
    };
    const st = { settings, copy: settings, opened: { ...settings.revs }, gate: { current: false }, sends: [], landed: [], handed: [], said: [], took: false,
        syncing: [], gets: [], org: 'org_A' };
    const fnSrc = handlerIn(read(file), component, handler);
    const scope = {
        STILL_SAVING, settings, opened: st.opened, inFlight: st.gate,
        setSettings: (f) => { st.copy = typeof f === 'function' ? f(st.copy) : f; },
        putSettings: (...args) => { const d = deferred(); st.sends.push({ args, ...d }); return d.p; },
        landed: (a) => st.landed.push(a),
        panelStale: async (e, words) => { st.handed.push([e, words]); if (!st.hold) return st.took; const d = deferred(); st.answerStale = d.resolve; return d.p; },
        [sayer]: (v) => { if (v) st.said.push(v); },
        ...extra(st),
    };
    st.call = (...args) => runAs(fnSrc, scope, ...args);
    return st;
};

test('S10 — Pipelines\' persist, run as written (JB3-8, J-B10): the tokens it opened with; one save in flight — a second change sends nothing and says so; the gate stays shut once it lands; a refusal puts back the keys it sent alone, never the tokens; a stale one goes to AdminView and puts nothing back', async () => {
    const { STILL_SAVING } = await import('../src/utils/settingsRevs.js');
    const run = () => optimisticRig(PIPELINES, 'PipelinesDetail', 'persist', 'setSaveError');
    const P1 = [{ id: 'p1', name: 'Sales 2' }];

    let st = await run();
    const first = st.call({ pipelines: P1 }, 'Pipeline rename');
    assert.equal(st.sends.length, 1);
    assert.deepEqual(st.sends[0].args[0], { pipelines: P1 });
    assert.equal(st.sends[0].args[1], st.opened, 'REGRESSION: the change sent with no tokens, or not the ones the panel opened with');
    assert.deepEqual(st.copy.pipelines, P1, 'optimistic: on screen at once');
    assert.deepEqual(await outcome(st.call({ assignmentRules: [] }, 'Assignment rule')), { v: false }, 'answered at once, nothing awaited');
    assert.equal(st.sends.length, 1,'REGRESSION (JB3-8): a second change sent while the first is out — it names the token the first is about to move, and is refused by it');
    assert.deepEqual(st.said, [`Assignment rule not saved — ${STILL_SAVING}`]);
    assert.deepEqual(st.copy.assignmentRules, st.settings.assignmentRules, 'the refused change never reaches the screen');
    const answer = { success: true, revs: { pipelines: 'R1' } };
    st.sends[0].resolve(answer);
    assert.equal(await first, true);
    assert.deepEqual(st.landed, [answer], 'REGRESSION: the landed save\'s tokens never merged');
    assert.equal(st.gate.current, true, 'REGRESSION (critic A8): the gate opened before the merged tokens are in a render — the next change built on the render before the landing');
    assert.deepEqual(await outcome(st.call({ assignmentRules: [] }, 'Assignment rule')), { v: false }, 'shut until the [opened] effect opens it');
    assert.equal(st.sends.length, 1);

    st = await run();
    const refused = st.call({ pipelines: P1 }, 'Pipeline rename');
    const A1 = [{ id: 'r2' }];
    st.copy = { ...st.copy, assignmentRules: A1, revs: { ...st.copy.revs, other: 'O1' } };   // meanwhile: another key set, another save's token merged
    st.sends[0].reject(new Error('Server error 500'));
    assert.equal(await refused, false);
    assert.deepEqual(st.copy.pipelines, st.settings.pipelines, 'the change put back');
    assert.equal(st.copy.assignmentRules, A1, 'REGRESSION (J-B10): a key it never sent put back — another change undone');
    assert.deepEqual(st.copy.revs, { pipelines: 'R0', customHolidays: 'C0', other: 'O1' }, 'REGRESSION (J-B10): the tokens put back — another save\'s token lost, the next save of that key refused');
    assert.deepEqual(st.said, ['Pipeline rename not saved — Server error 500']);
    assert.deepEqual(st.handed, [], 'no stale refusal: never AdminView\'s');
    assert.equal(st.gate.current, false, 'REGRESSION (JB3-8): a refusal leaves the gate shut');

    const refusal = await staleRefusal('pipelines');
    st = await run(); st.took = true;
    const taken = st.call({ pipelines: P1 }, 'Pipeline rename');
    st.sends[0].reject(refusal);
    assert.equal(await taken, false);
    assert.deepEqual(st.handed, [[refusal, undefined]], 'REGRESSION (J-B5): a stale refusal not handed to AdminView');
    assert.deepEqual(st.copy.pipelines, P1, 'REGRESSION (J-B5): the old mount\'s values put back over the latest AdminView took');
    assert.deepEqual([st.said, st.gate.current], [[], true], "no words from the old mount — AdminView says them; this mount's gate stays shut, the panel drawn again on the latest has its own (state §0.228)");

    st = await run();
    const unread = st.call({ pipelines: P1 }, 'Pipeline rename');
    st.sends[0].reject(refusal);
    assert.equal(await unread, false);
    assert.equal(st.handed.length, 1);
    assert.deepEqual([st.copy.pipelines, st.said], [st.settings.pipelines, [`Pipeline rename not saved — ${refusal.message}`]], 'the latest unread: put back, the server\'s words');
    assert.equal(st.gate.current, false, 'REGRESSION (JB3-8): the latest unread leaves the gate shut — every change after said to be still saving');

    // While AdminView reads the latest the gate stays shut (state §0.228): opened sooner, a change made then went out
    // with the old tokens. Unread, it opens once the keys are put back.
    st = await run(); st.hold = true;
    const held = st.call({ pipelines: P1 }, 'Pipeline rename');
    st.sends[0].reject(refusal);
    await until(() => st.answerStale);
    assert.equal(st.gate.current, true, 'REGRESSION (state §0.228): the gate opened before panelStale answered');
    assert.deepEqual(await outcome(st.call({ assignmentRules: [] }, 'Assignment rule')), { v: false }, 'answered at once, nothing awaited');
    assert.deepEqual([st.sends.length, st.said], [1, [`Assignment rule not saved — ${STILL_SAVING}`]], 'REGRESSION (state §0.228): a change sent while AdminView reads the latest — it names the old tokens');
    st.answerStale(false);
    assert.equal(await held, false);
    assert.deepEqual([st.copy.pipelines, st.copy.assignmentRules, st.gate.current], [st.settings.pipelines, st.settings.assignmentRules, false], 'unread: put back, the gate opened');
});

// Pipelines' Add pipeline and Add stage as written, persist answering `ok`: what each sets after the send, in order.
test("S10 — Pipelines' Add pipeline and Add stage, run as written (state §0.228): refused — still saving, or by the server — the form keeps what was typed and the selection stays; landed, the form cleared and closed", async () => {
    const PIPES = [{ id: 'new-biz', name: 'New Business', isDefault: true, stages: ['Prospecting', 'Closed Won', 'Closed Lost'] }];
    const run = async (handler, ok, scope) => {
        const st = { sent: [], calls: [] };
        const rec = (name) => (v) => st.calls.push([name, v]);
        await runAs(handlerIn(read(PIPELINES), 'PipelinesDetail', handler), {
            pipelines: PIPES, selected: PIPES[0], selectedId: 'new-biz', STAGE_TYPES: { 'Closed Won': 'Won', 'Closed Lost': 'Lost' },
            persist: async (patch, label) => { st.sent.push([patch, label]); return ok; },
            setSaving: rec('saving'), setSelectedId: rec('selected'), setNewName: rec('name'), setNewDefault: rec('default'), setNewErr: rec('err'),
            setShowNewForm: rec('form'), setNewStageName: rec('stageName'), setNewStageType: rec('stageType'), setStageErr: rec('stageErr'),
            setShowAddStage: rec('stageForm'),
            ...scope,
        });
        return st;
    };
    for (const [handler, scope, label, kept, cleared] of [
        ['handleAddPipeline', { newName: 'Renewals', newDefault: false }, 'Pipeline', [['saving', true], ['saving', false]],
            [['saving', true], ['saving', false], ['selected', 'renewals'], ['name', ''], ['default', false], ['err', ''], ['form', false]]],
        ['handleAddStage', { newStageName: 'Demo', newStageType: 'Open' }, 'Stage', [],
            [['stageName', ''], ['stageType', 'Open'], ['stageErr', ''], ['stageForm', false]]],
    ]) {
        const refused = await run(handler, false, scope);
        assert.deepEqual(refused.sent.map(([, l]) => l), [label], `${handler}: one send`);
        assert.deepEqual(refused.calls, kept, `${handler}: REGRESSION (state §0.228) — refused, the form cleared and closed: what was typed lost to a change said to be still saving`);
        const landed = await run(handler, true, scope);
        assert.deepEqual(landed.calls, cleared, `${handler}: landed, the form cleared and closed`);
    }
});

test('S10 — the calendar\'s persistHolidays, run as written: the tokens it opened with; refused while a Sync is out; the gate shut once it lands; a refusal puts back the holidays alone, never the tokens; a stale one, nothing', async () => {
    const { STILL_SAVING } = await import('../src/utils/settingsRevs.js');
    const run = () => optimisticRig(CALENDAR, 'CompanyCalendarDetail', 'persistHolidays', 'setCalError');
    const C1 = [{ date: 'Jan 2', name: 'Ours' }, { date: 'Mar 3', name: 'New' }];

    let st = await run();
    st.gate.current = true;   // a Sync out
    assert.deepEqual(await outcome(st.call({ customHolidays: C1 }, 'Holiday')), { v: false }, 'answered at once, nothing awaited');
    assert.deepEqual([st.sends.length, st.said, st.copy.customHolidays], [0, [`Holiday not saved — ${STILL_SAVING}`], st.settings.customHolidays], 'REGRESSION (JB3-8): an Add sent while a Sync is out');

    st = await run();
    const added = st.call({ customHolidays: C1 }, 'Holiday');
    assert.equal(st.sends[0].args[1], st.opened, 'REGRESSION: the holidays sent with no tokens, or not the ones the panel opened with');
    st.sends[0].resolve({ success: true, revs: { customHolidays: 'C1' } });
    assert.equal(await added, true);
    assert.deepEqual([st.landed.length, st.gate.current], [1, true], 'landed; the gate shut until the merged tokens are in a render');

    st = await run();
    const refused = st.call({ customHolidays: C1 }, 'Holiday');
    st.copy = { ...st.copy, pipelines: [], revs: { ...st.copy.revs, other: 'O1' } };
    st.sends[0].reject(new Error('gone'));
    assert.equal(await refused, false);
    assert.deepEqual([st.copy.customHolidays, st.copy.pipelines, st.copy.revs], [st.settings.customHolidays, [], { pipelines: 'R0', customHolidays: 'C0', other: 'O1' }],
        'REGRESSION (J-B10): a key it never sent, or the tokens, put back');
    assert.deepEqual([st.said, st.gate.current], [['Holiday not saved — gone'], false]);

    st = await run(); st.took = true;
    const refusal = await staleRefusal('customHolidays');
    const taken = st.call({ customHolidays: C1 }, 'Holiday');
    st.sends[0].reject(refusal);
    assert.equal(await taken, false);
    assert.deepEqual([st.handed, st.copy.customHolidays, st.said], [[[refusal, undefined]], C1, []], 'REGRESSION (J-B5): put back over the latest, or not handed on');
    assert.equal(st.gate.current, true, "this mount's gate stays shut — the panel drawn again on the latest has its own (state §0.228)");

    // The latest unread (critic m1b): the holidays put back, the server's words — and the gate shut until then: opened
    // while AdminView reads the latest, a holiday added meanwhile went out with the old tokens (state §0.228).
    st = await run(); st.hold = true;
    const unread = st.call({ customHolidays: C1 }, 'Holiday');
    st.sends[0].reject(refusal);
    await until(() => st.answerStale);
    assert.equal(st.gate.current, true, 'REGRESSION (state §0.228): the gate opened before panelStale answered');
    assert.deepEqual(await outcome(st.call({ customHolidays: [] }, 'Holiday')), { v: false }, 'answered at once, nothing awaited');
    assert.deepEqual([st.sends.length, st.said], [1, [`Holiday not saved — ${STILL_SAVING}`]], 'REGRESSION (state §0.228): a holiday sent while AdminView reads the latest — it names the old tokens');
    st.answerStale(false);
    assert.equal(await unread, false);
    assert.deepEqual(st.copy.customHolidays, st.settings.customHolidays, 'REGRESSION (critic m1b): the latest unread — a holiday the server refused left on screen');
    assert.deepEqual([st.copy.revs, st.said.at(-1), st.gate.current], [st.settings.revs, `Holiday not saved — ${refusal.message}`, false], 'the server\'s words; the gate opened');
});

test('S10 — the calendar\'s Sync, run as written (critic B7): both keys with the tokens it opened with; a refusal puts back those two keys alone, never the tokens; stale, nothing; the gate taken before the GET, opened by a refusal, a failed GET or a switch', async () => {
    const { STILL_SAVING } = await import('../src/utils/settingsRevs.js');
    const FRESH = [{ date: 'Jan 1', name: 'New Year' }];
    const run = () => optimisticRig(CALENDAR, 'CompanyCalendarDetail', 'handleSync', 'setSyncMsg', (st) => ({
        year: 2026, customHolidays: st.settings.customHolidays, console: { error: () => {} },
        setTimeout: () => {}, setSyncing: (v) => st.syncing.push(v),
        requestOrg: () => 'org_A', stillOrg: (o) => o === st.org,
        dbFetch: async (url) => {
            st.gets.push(url);
            return st.getFails ? { ok: false, status: 502, json: async () => ({ error: 'Holidays service down' }) }
                : { ok: true, status: 200, json: async () => ({ holidays: FRESH }) };
        },
    }));

    let st = await run();
    const synced = st.call();
    await until(() => st.sends.length);
    assert.deepEqual(st.sends[0].args[0], { customHolidays: st.settings.customHolidays, federalHolidays: FRESH });
    assert.equal(st.sends[0].args[1], st.opened, 'REGRESSION: Sync sends no tokens, or not the ones the panel opened with');
    st.sends[0].resolve({ success: true, revs: { customHolidays: 'C1', federalHolidays: 'F1' } });
    await synced;
    assert.equal(st.landed.length, 1, 'REGRESSION: Sync\'s tokens never merged — the next holiday save refused against its own');
    assert.ok(st.said.length === 1 && st.said[0].includes('Synced 1 federal holidays for 2026'), st.said.join(' | '));
    assert.deepEqual([st.syncing, st.gate.current], [[true, false], true]);

    st = await run(); st.gate.current = true;
    assert.deepEqual(await outcome(st.call()), { v: undefined }, 'answered at once, nothing awaited');
    assert.deepEqual([st.gets, st.sends.length, st.syncing, st.said], [[], 0, [], [`Not synced — ${STILL_SAVING}`]], 'REGRESSION (JB3-8): a Sync sent while a change is out');

    st = await run();
    const refused = st.call();
    await until(() => st.sends.length);
    assert.deepEqual(st.copy.federalHolidays, FRESH, 'optimistic');
    st.copy = { ...st.copy, pipelines: [], revs: { ...st.copy.revs, other: 'O1' } };   // meanwhile: another key set, another token merged
    st.sends[0].reject(new Error('gone'));
    await refused;
    assert.deepEqual(st.copy.customHolidays, st.settings.customHolidays);
    assert.equal(st.copy.federalHolidays, undefined, 'both keys back as the render held them');
    assert.deepEqual([st.copy.pipelines, st.copy.revs], [[], { pipelines: 'R0', customHolidays: 'C0', other: 'O1' }],
        'REGRESSION (critic B7, J-B10): a key it never sent, or the tokens, put back — the whole render\'s copy over the latest');
    assert.deepEqual([st.said, st.syncing, st.gate.current], [['Failed to sync — gone'], [true, false], false]);

    const refusal = await staleRefusal('customHolidays');
    st = await run(); st.took = true;
    const taken = st.call();
    await until(() => st.sends.length);
    st.sends[0].reject(refusal);
    await taken;
    assert.deepEqual(st.handed, [[refusal, undefined]], 'REGRESSION (J-B5): a stale Sync not handed to AdminView');
    assert.deepEqual([st.copy.federalHolidays, st.said, st.gate.current], [FRESH, [], true], "REGRESSION: put back over the latest, or the old mount's words; this mount's gate stays shut, the panel drawn again on the latest has its own (state §0.228)");

    st = await run();
    const unread = st.call();
    await until(() => st.sends.length);
    st.sends[0].reject(refusal);
    await unread;
    assert.deepEqual([st.copy.federalHolidays, st.said], [undefined, [`Failed to sync — ${refusal.message}`]], 'the latest unread: put back, the server\'s words');
    assert.equal(st.gate.current, false, 'REGRESSION (JB3-8): the latest unread leaves the gate shut — every change after said to be still saving');

    // While AdminView reads the latest the gate stays shut (state §0.228): a Sync run then would send the two keys with
    // the old tokens. Unread, the catch around it opens the gate.
    st = await run(); st.hold = true;
    const held = st.call();
    await until(() => st.sends.length);
    st.sends[0].reject(refusal);
    await until(() => st.answerStale);
    assert.equal(st.gate.current, true, 'REGRESSION (state §0.228): the gate opened before panelStale answered');
    assert.deepEqual(await outcome(st.call()), { v: undefined }, 'answered at once, nothing awaited');
    assert.deepEqual([st.gets.length, st.sends.length, st.said], [1, 1, [`Not synced — ${STILL_SAVING}`]], 'REGRESSION (state §0.228): a Sync run while AdminView reads the latest');
    st.answerStale(false);
    await held;
    assert.deepEqual([st.copy.federalHolidays, st.said.at(-1), st.gate.current], [undefined, `Failed to sync — ${refusal.message}`, false], 'unread: put back, the words, the gate opened');

    st = await run(); st.getFails = true;   // the holidays GET refused: nothing to send, the gate opened by the outer catch
    assert.deepEqual(await outcome(st.call()), { v: undefined }, 'answered at once, nothing awaited');
    assert.deepEqual([st.gets.length, st.sends.length, st.said, st.syncing, st.gate.current],
        [1, 0, ['Failed to sync — Holidays service down'], [true, false], false],
        'REGRESSION (JB3-8): a holidays GET that failed leaves the gate shut — every change after said to be still saving');

    st = await run(); st.org = 'org_B';
    assert.deepEqual(await outcome(st.call()), { v: undefined }, 'REGRESSION: the last org\'s holidays sent after a switch');
    assert.deepEqual([st.sends.length, st.gate.current], [0, false], 'REGRESSION: the gate held for a send that never goes — every change after said to be still saving');
});

// Edit brand's Save as written: the window's brand and its token (`base`); writeSettings answers `answer`; the latest,
// when given, is taken into the copy.
const BRAND_STUB = { preset: true };
const runBrandSave = async ({ answer, latest = null, base = { rev: 'B0' }, brand = { accent: '#123' } }) => {
    const { revsAfter, BRAND_CHANGED } = await import('../src/utils/settingsRevs.js');
    const st = { copy: { quoteBrand: { accent: '#old' }, revs: { quoteBrand: 'B0', other: 'O0' } }, sends: [], saving: [], said: [], brands: [], bases: [], closed: 0, taken: 0, order: [] };
    await runAs(handlerIn(read(EDIT_BRAND), 'EditBrandModal', 'handleSave'), {
        brand, base, BRAND_PRESET: BRAND_STUB, BRAND_CHANGED, revsAfter,
        writeSettings: async (...a) => { st.sends.push(a); st.order.push('send'); return answer; },
        takeLatestSettings: async (set) => {
            st.taken += 1;
            if (!latest) return null;
            set((prev) => ({ ...prev, quoteBrand: latest.quoteBrand, revs: latest.revs }));
            return latest;
        },
        setSettings: (f) => { st.copy = typeof f === 'function' ? f(st.copy) : f; },
        // Every setSaveError in order, a clearing one too (critic m2): `said` holds the words alone.
        setSaving: (v) => st.saving.push(v), setSaveError: (v) => { st.order.push(v === '' ? 'cleared' : 'said'); if (v) st.said.push(v); },
        setBrand: (v) => st.brands.push(v), setBase: (v) => st.bases.push(v),
        onClose: () => { st.closed += 1; },
    });
    return st;
};

test('S10 — Edit brand\'s Save, run as written (JB3-4): the token its window opened with; lands — the brand and its token into the copy, closed; stale — the latest re-seeds the brand and the token, the words, open; unread — the server\'s words, the edit kept, never optimistic', async () => {
    const { BRAND_CHANGED, STALE_ERROR } = await import('../src/utils/settingsRevs.js');
    const brand = { accent: '#123' };
    const ok = await runBrandSave({ brand, answer: { ok: true, status: 200, error: null, revs: { quoteBrand: 'B1' } } });
    assert.deepEqual(ok.sends, [[{ quoteBrand: brand }, { quoteBrand: 'B0' }]], 'REGRESSION (JB3-4): the brand sent with no token, or not the one its window opened with');
    assert.deepEqual(ok.copy, { quoteBrand: brand, revs: { quoteBrand: 'B1', other: 'O0' } }, 'REGRESSION: the brand landed without its token, or the held tokens replaced whole');
    assert.deepEqual([ok.closed, ok.saving[0], ok.said], [1, true, []]);
    assert.deepEqual(ok.order, ['cleared', 'send'], "REGRESSION (critic m2): the window's last words not cleared as a save starts — a refusal's words shown over the save out");

    const STALE = { ok: false, status: 409, error: STALE_ERROR, stale: ['quoteBrand'] };
    const theirs = { accent: '#999' };
    const taken = await runBrandSave({ brand, answer: STALE, latest: { quoteBrand: theirs, revs: { quoteBrand: 'BL' } } });
    assert.equal(taken.taken, 1, 'REGRESSION (JB3-4): the latest not taken');
    assert.deepEqual(taken.brands, [theirs], 'REGRESSION (JB3-4): the window keeps the refused edit over a brand that changed');
    assert.deepEqual(taken.bases, [{ rev: 'BL' }], 'REGRESSION (JB3-4): the window keeps the old token — its next Save refused again');
    assert.deepEqual(taken.said, [BRAND_CHANGED]);
    assert.deepEqual(taken.order, ['cleared', 'send', 'said']);
    assert.deepEqual([taken.closed, taken.saving.at(-1)], [0, false], 'stays open, Save offered again');
    assert.deepEqual(taken.copy.quoteBrand, theirs, 'the copy is the latest');
    const none = await runBrandSave({ brand, answer: STALE, latest: { quoteBrand: null, revs: {} } });
    assert.deepEqual([none.brands, none.bases], [[BRAND_STUB], [{ rev: null }]], 'no brand saved there: the preset, no token');
    const again = await runBrandSave({ brand, base: taken.bases[0], answer: { ok: true, status: 200, error: null, revs: { quoteBrand: 'B2' } } });
    assert.deepEqual(again.sends[0][1], { quoteBrand: 'BL' }, 'the next Save names the latest\'s token');

    const unread = await runBrandSave({ brand, answer: STALE });
    assert.deepEqual([unread.taken, unread.brands, unread.bases, unread.closed, unread.saving.at(-1)], [1, [], [], 0, false]);
    assert.deepEqual(unread.said, [`Brand not saved — ${STALE_ERROR}`], 'the latest unread: the server\'s words');
    assert.deepEqual(unread.copy.quoteBrand, { accent: '#old' }, 'REGRESSION (JB3-4): optimistic — the copy took a brand the server refused');
    const forbidden = await runBrandSave({ brand, answer: { ok: false, status: 403, error: 'You do not have permission to make this change.' } });
    assert.deepEqual([forbidden.taken, forbidden.said, forbidden.closed], [0, ['Brand not saved — You do not have permission to make this change.'], 0]);
});

// A declaration anywhere inside a component, as written — Escape's handler is inside the component's effect.
const declIn = (src, component, name) => {
    let out = null;
    walk(astOf(src).program, (n) => {
        if (!componentBody(n, component)) return;
        walk(n, (d) => { if (d.type === 'VariableDeclarator' && d.id.type === 'Identifier' && d.id.name === name && d.init) out = src.slice(d.init.start, d.init.end); });
    });
    assert.ok(out, `${component}'s ${name} not found`);
    return out;
};

test('S10 — Edit brand\'s window while its save is out, run as written (critic A5): close and Escape do nothing; after it, close asks about an edit, Escape closes', () => {
    const src = read(EDIT_BRAND);
    const close = handlerIn(src, 'EditBrandModal', 'close');
    const runClose = (saving, dirty) => {
        const st = { asked: [], closed: 0 };
        const onClose = () => { st.closed += 1; };
        runAs(close, { saving, dirty, onClose, showConfirm: (words, then, danger) => st.asked.push([words, then === onClose, danger]) });
        return st;
    };
    for (const dirty of [true, false]) {
        assert.deepEqual(runClose(true, dirty), { asked: [], closed: 0 }, `dirty ${dirty}: REGRESSION (critic A5) — closed while its save is out: its answer lands on nothing, a refusal unsaid`);
    }
    assert.deepEqual(runClose(false, true), { asked: [['Discard unsaved brand changes?', true, false]], closed: 0 });
    assert.deepEqual(runClose(false, false), { asked: [], closed: 1 });
    const onKey = declIn(src, 'EditBrandModal', 'onKey');
    const press = (saving, e) => { let closed = 0; runAs(onKey, { saving, close: () => { closed += 1; } }, e); return closed; };
    const ESC = { key: 'Escape', defaultPrevented: false };
    assert.equal(press(true, ESC), 0, 'REGRESSION (critic A5): Escape closes the window while its save is out');
    assert.equal(press(false, ESC), 1);
    assert.equal(press(false, { ...ESC, defaultPrevented: true }), 0, 'a layer above took it');
    assert.equal(press(false, { key: 'Enter', defaultPrevented: false }), 0);
});

// The Sales Manager's saveExtra as written: the drafts' tokens (`opened`); writeSettings answers `answer`; the latest,
// when given, is taken into the copy.
const runSaveExtra = async ({ patch = { spiffs: [{ id: 's1', name: 'Q4 push' }] }, label = 'SPIFFs', answer, latest = null, loaded = true }) => {
    const { revsAfter, listChanged } = await import('../src/utils/settingsRevs.js');
    const st = { copy: { spiffs: [], quotaData: {}, revs: { quotaData: 'Q0', spiffs: 'S0' } }, opened: { quotaData: 'QD', spiffs: 'SD' },
        sends: [], states: [], drafts: [], taken: 0, thrown: null, out: undefined };
    try {
        st.out = await runAs(handlerIn(read(SALES_MANAGER), 'SalesManagerTab', 'saveExtra'), {
            settingsLoaded: loaded, opened: st.opened, revsAfter, listChanged,
            writeSettings: async (...a) => { st.sends.push(a); return answer; },
            takeLatestSettings: async (set) => { st.taken += 1; if (!latest) return null; set((prev) => ({ ...prev, ...latest })); return latest; },
            setSettings: (f) => { st.copy = typeof f === 'function' ? f(st.copy) : f; },
            setSaveState: (v) => st.states.push(v),
            setTiersDraft: (v) => st.drafts.push(['tiers', v]), setSpiffsDraft: (v) => st.drafts.push(['spiffs', v]),
        }, patch, label);
    } catch (e) { st.thrown = e; }
    return st;
};

test('S10 — the Sales Manager\'s saveExtra, run as written (JB3-5): the tokens its draft began with; lands — the answered token merged; stale — the latest taken, that draft dropped, the list\'s words, thrown with tookLatest; unread, 403, the network, not loaded — the words, nothing dropped', async () => {
    const { listChanged, STALE_ERROR } = await import('../src/utils/settingsRevs.js');
    const ok = await runSaveExtra({ answer: { ok: true, status: 200, error: null, revs: { spiffs: 'S1' } } });
    assert.equal(ok.sends.length, 1);
    assert.equal(ok.sends[0][1], ok.opened, 'REGRESSION (JB3-5): the save names no tokens, or not those its draft began with');
    assert.equal(ok.out, true);
    assert.deepEqual(ok.copy.revs, { quotaData: 'Q0', spiffs: 'S1' }, 'REGRESSION: the answered token never merged, or the held ones replaced whole — the next SPIFF draft begins with the old one and is refused against its own');
    assert.deepEqual(ok.states, [{ status: 'saving', msg: '' }, { status: 'saved', msg: '' }]);
    assert.deepEqual([ok.drafts, ok.taken, ok.thrown], [[], 0, null]);

    const STALE = (key) => ({ ok: false, status: 409, error: STALE_ERROR, stale: [key] });
    const latest = { spiffs: [{ id: 's9', name: 'Theirs' }], revs: { spiffs: 'SL' } };
    const spiffs = await runSaveExtra({ answer: STALE('spiffs'), latest });
    assert.equal(spiffs.taken, 1, 'REGRESSION (JB3-5): the latest not taken');
    assert.deepEqual(spiffs.drafts, [['spiffs', null]], 'REGRESSION (JB3-5): the refused draft kept over the latest — or the other draft dropped too');
    assert.ok(spiffs.thrown, 'REGRESSION (JB3-5): stale returns false — the leave guard cannot say the latest was taken');
    assert.deepEqual([spiffs.thrown.message, spiffs.thrown.tookLatest, spiffs.thrown.stale], [listChanged('SPIFF'), true, ['spiffs']]);
    assert.equal('partial' in spiffs.thrown, false, 'REGRESSION (critic m6): one stale refusal thrown as partial — the guard says the ones saved before it stay saved, when none were');
    assert.deepEqual(spiffs.states.at(-1), { status: 'error', msg: listChanged('SPIFF') });
    assert.deepEqual(spiffs.copy.spiffs, latest.spiffs, 'the copy is the latest');
    const tiers = await runSaveExtra({ patch: { quotaData: { commissionTiers: [] } }, label: 'commission tiers', answer: STALE('quotaData'), latest: { quotaData: {}, revs: { quotaData: 'QL' } } });
    assert.deepEqual([tiers.drafts, tiers.thrown?.message, tiers.thrown?.tookLatest], [[['tiers', null]], listChanged('commission tier'), true]);

    const unread = await runSaveExtra({ answer: STALE('spiffs') });
    assert.deepEqual([unread.taken, unread.drafts, unread.thrown, unread.out], [1, [], null, false], 'the latest unread: the draft kept, nothing thrown');
    assert.deepEqual(unread.states.at(-1), { status: 'error', msg: `Not saved — ${STALE_ERROR}` });
    for (const [answer, msg] of [
        [{ ok: false, status: 403, error: 'x' }, 'Not saved — only Admins can change SPIFFs.'],
        [{ ok: false, status: 0, error: 'x' }, 'Not saved — network error while saving SPIFFs.'],
        [{ ok: false, status: 500, error: 'The server returned 500.' }, 'Not saved — The server returned 500.'],
    ]) {
        const r = await runSaveExtra({ answer });
        assert.deepEqual([r.out, r.taken, r.drafts, r.thrown, r.states.at(-1)], [false, 0, [], null, { status: 'error', msg }], `${answer.status}`);
    }
    const early = await runSaveExtra({ loaded: false, answer: null });
    assert.deepEqual([early.out, early.sends, early.states], [false, [], [{ status: 'error', msg: 'Not saved — this organization\'s settings have not loaded. Reload the page and try again.' }]]);
});

test('S10 — the Sales Manager\'s saveAdminDrafts, run as written (JB3-5): a part refused as stale after an earlier part landed is partial — the guard says those stay saved; refused first, or refused otherwise, it is not', async () => {
    const run = async ({ quotas = false, tiers = false, spiffs = false, fail = null }) => {
        const order = [];
        const part = (name) => async () => { order.push(name); if (fail && fail[0] === name) throw Object.assign(new Error(name), fail[1]); };
        let thrown = null;
        try {
            await runAs(handlerIn(read(SALES_MANAGER), 'SalesManagerTab', 'saveAdminDrafts'), {
                quotaDrafts: quotas ? { usr_a: {} } : {}, tiersDraft: tiers ? [] : null, spiffsDraft: spiffs ? [] : null,
                saveQuotas: part('quotas'), saveCommission: part('tiers'), saveSpiffBoard: part('spiffs'),
            });
        } catch (e) { thrown = e; }
        return { order, thrown };
    };
    const STALE = { tookLatest: true, stale: ['k'] };
    const a = await run({ quotas: true, tiers: true, spiffs: true, fail: ['tiers', STALE] });
    assert.deepEqual(a.order, ['quotas', 'tiers'], 'stops at the refusal');
    assert.deepEqual([a.thrown?.partial, a.thrown?.tookLatest], [true, true], 'REGRESSION (JB3-5): quotas landed, then the commission plan refused — the guard says nothing was saved');
    assert.equal((await run({ quotas: true, spiffs: true, fail: ['spiffs', STALE] })).thrown?.partial, true);
    assert.equal((await run({ tiers: true, spiffs: true, fail: ['spiffs', STALE] })).thrown?.partial, true);
    assert.equal((await run({ tiers: true, spiffs: true, fail: ['tiers', STALE] })).thrown?.partial, undefined, 'refused first: nothing landed before it');
    assert.equal((await run({ quotas: true, tiers: true, fail: ['tiers', {}] })).thrown?.partial, undefined, 'a refusal that took no latest: the guard\'s own words');
    const clean = await run({ quotas: true, tiers: true, spiffs: true });
    assert.deepEqual([clean.order, clean.thrown], [['quotas', 'tiers', 'spiffs'], null]);
});

// A component's const, as written, or null when it has none — today's names kept, so old code fails on what it sends,
// not on a missing name.
const declOrNull = (src, component, name) => {
    let out = null;
    walk(astOf(src).program, (n) => {
        const body = componentBody(n, component);
        if (!body) return;
        for (const st of body) {
            if (st.type !== 'VariableDeclaration') continue;
            for (const d of st.declarations) if (d.id.name === name && d.init) out = src.slice(d.init.start, d.init.end);
        }
    });
    return out;
};
// A function as written, its names bound from `scope` as it is built.
const fnAs = (fnSrc, scope) => {
    const names = Object.keys(scope);
    return new Function(...names, `return (${fnSrc});`)(...names.map((n) => scope[n]));
};
// The Sales Manager's saves as written, each over the ones it calls: saveExtra (writeSettings held until the test
// answers it; the latest, when given, taken into the copy), the cards' sends, their flights and their flags (recorded in
// st.flags; state §0.228), and
// saveAdminDrafts — the quotas' save a stand-in that lands.
const salesManagerRig = async ({ quotaDrafts = {}, tiersDraft = null, spiffsDraft = null, latest = null } = {}) => {
    const { revsAfter, listChanged } = await import('../src/utils/settingsRevs.js');
    const src = read(SALES_MANAGER);
    const st = { flags: [], sends: [], states: [], quotas: 0, copy: { quotaData: {}, spiffs: [], revs: { quotaData: 'Q0', spiffs: 'S0' } } };
    const scope = {
        settingsLoaded: true, opened: { quotaData: 'QD', spiffs: 'SD' }, revsAfter, listChanged, quotaDrafts, tiersDraft, spiffsDraft,
        settings: st.copy,
        writeSettings: (...args) => { const d = deferred(); st.sends.push({ args, ...d }); return d.p; },
        takeLatestSettings: async (set) => { if (!latest) return null; set((prev) => ({ ...prev, ...latest })); return latest; },
        setSettings: (f) => { st.copy = typeof f === 'function' ? f(st.copy) : f; },
        setSaveState: (v) => st.states.push(v), setTiersDraft: () => {}, setSpiffsDraft: () => {},
        requestOrg: () => 'org_A', stillOrg: () => true, refuse: (msg) => new Error(msg),
        saveQuotas: async () => { st.quotas += 1; },
        commissionSaving: { current: null }, spiffsSaving: { current: null },
        setCommissionSending: (v) => st.flags.push(['commission', v]), setSpiffsSending: (v) => st.flags.push(['spiffs', v]),
    };
    scope.saveExtra = fnAs(handlerIn(src, 'SalesManagerTab', 'saveExtra'), scope);
    for (const name of ['sendCommission', 'sendSpiffBoard']) {
        const fnSrc = declOrNull(src, 'SalesManagerTab', name);
        scope[name] = fnSrc ? fnAs(fnSrc, scope) : undefined;
    }
    for (const name of ['saveCommission', 'saveSpiffBoard']) scope[name] = st[name] = fnAs(handlerIn(src, 'SalesManagerTab', name), scope);
    st.saveAdminDrafts = fnAs(handlerIn(src, 'SalesManagerTab', 'saveAdminDrafts'), scope);
    return st;
};
const TIERS_DRAFT = [{ min: 0, rate: 5 }];
const SPIFFS_DRAFT = [{ id: 's1', name: 'Q4 push' }];
const LANDS = { ok: true, status: 200, error: null, revs: {} };

test("S10 — the Sales Manager's commission plan and SPIFF board, run as written (state §0.228): one flight each — a second save while one is out sends nothing and shares its outcome, a refusal too; cleared once it settles; the leave guard's save while a card's is out shares it", async () => {
    const { STALE_ERROR, listChanged } = await import('../src/utils/settingsRevs.js');
    for (const [card, drafts, words] of [['saveCommission', { tiersDraft: TIERS_DRAFT }, 'Commission plan not saved.'], ['saveSpiffBoard', { spiffsDraft: SPIFFS_DRAFT }, 'SPIFFs not saved.']]) {
        const st = await salesManagerRig(drafts);
        const first = st[card]();
        const second = st[card]();
        assert.equal(st.sends.length, 1, `${card}: REGRESSION (state §0.228) — a second save while one is out sent again, with the same draft-start token: refused by the first`);
        assert.equal(second, first, `${card}: the second save shares the first one's outcome`);
        st.sends[0].resolve(LANDS);
        assert.deepEqual([await first, await second], [undefined, undefined]);
        const third = st[card]();
        assert.notEqual(third, first, `${card}: REGRESSION — the flight never cleared: every later save answers the first one's outcome`);
        assert.equal(st.sends.length, 2);
        assert.equal(st[card](), third, `${card}: a refusal is shared too`);
        st.sends[1].resolve({ ok: false, status: 500, error: 'The server returned 500.' });
        await assert.rejects(third, (e) => e.message === words);
        st[card]();
        assert.equal(st.sends.length, 3, `${card}: cleared after a refusal`);
        st.sends[2].resolve(LANDS);
    }

    // The leave guard's "Save and continue" while a card's own Save is out: it shares that save — no second send, its
    // outcome the guard's (state §0.228). Sent again, the same draft and token was refused by the first, and the guard
    // said the change was not saved when it had landed.
    for (const [card, drafts, key, noun] of [['saveCommission', { tiersDraft: TIERS_DRAFT }, 'quotaData', 'commission tier'], ['saveSpiffBoard', { spiffsDraft: SPIFFS_DRAFT }, 'spiffs', 'SPIFF']]) {
        const st = await salesManagerRig(drafts);
        const own = st[card]();
        const guard = st.saveAdminDrafts();
        await tick();
        assert.equal(st.sends.length, 1, `${card}: REGRESSION (state §0.228) — the guard sent the draft again while the card's own save was out: refused by it, the guard says the change was not saved when it landed`);
        st.sends[0].resolve(LANDS);
        assert.deepEqual([await own, await guard], [undefined, undefined]);
        st[card]();
        assert.equal(st.sends.length, 2, `${card}: cleared once it settled`);
        st.sends[1].resolve(LANDS);

        const stale = await salesManagerRig({ ...drafts, latest: { [key]: key === 'spiffs' ? [] : {}, revs: { [key]: 'L1' } } });
        const own2 = stale[card]();
        const guard2 = stale.saveAdminDrafts();
        await tick();
        assert.equal(stale.sends.length, 1);
        stale.sends[0].resolve({ ok: false, status: 409, error: STALE_ERROR, stale: [key] });
        const [a, b] = await Promise.allSettled([own2, guard2]);
        assert.equal(b.reason, a.reason, `${card}: the guard reads the card's own refusal`);
        assert.deepEqual([b.reason.message, b.reason.tookLatest, 'partial' in b.reason], [listChanged(noun), true, false], `${card}: the latest taken, nothing landed before it`);
    }
});

test("S10 — the Sales Manager's saveAdminDrafts over saveExtra's own stale refusal, run as written (JB3-5, critic m6): quotas landed, then the commission plan refused — partial; nothing landed before it — not partial", async () => {
    const { STALE_ERROR, listChanged } = await import('../src/utils/settingsRevs.js');
    const latest = { quotaData: {}, revs: { quotaData: 'QL' } };
    const refusedAfter = async (st) => {
        const p = st.saveAdminDrafts();
        await until(() => st.sends.length);
        st.sends[0].resolve({ ok: false, status: 409, error: STALE_ERROR, stale: ['quotaData'] });
        return p.then(() => null, (e) => e);
    };
    const landedFirst = await salesManagerRig({ quotaDrafts: { usr_a: {} }, tiersDraft: TIERS_DRAFT, latest });
    const e1 = await refusedAfter(landedFirst);
    assert.equal(landedFirst.quotas, 1, 'the quotas saved first');
    assert.deepEqual([e1?.message, e1?.tookLatest, e1?.partial], [listChanged('commission tier'), true, true], 'REGRESSION (JB3-5): quotas landed, then the commission plan refused — the guard says nothing was saved');
    const refusedFirst = await salesManagerRig({ tiersDraft: TIERS_DRAFT, latest });
    const e2 = await refusedAfter(refusedFirst);
    assert.deepEqual([refusedFirst.quotas, e2?.message, e2?.tookLatest], [0, listChanged('commission tier'), true]);
    assert.equal('partial' in e2, false, 'REGRESSION (critic m6): refused with nothing landed before it, thrown as partial — the guard says the ones saved before it stay saved');
});

test('S10 — the Sales Manager\'s drafts\' setters, run as written (critic B9): each takes its list\'s token when its draft begins — from the render its first edit is built on — and never again while it is open', () => {
    const src = read(SALES_MANAGER);
    for (const [setter, draftName, setName, key, other] of [['draftTiers', 'tiersDraft', 'setTiersDraft', 'quotaData', 'spiffs'], ['draftSpiffs', 'spiffsDraft', 'setSpiffsDraft', 'spiffs', 'quotaData']]) {
        const fn = handlerIn(src, 'SalesManagerTab', setter);
        const run = (draft, revs, held) => {
            const st = { opened: held, drafts: [] };
            runAs(fn, { [draftName]: draft, settings: { revs }, setOpened: (f) => { st.opened = typeof f === 'function' ? f(st.opened) : f; }, [setName]: (v) => st.drafts.push(v) }, 'NEXT');
            return st;
        };
        const begins = run(null, { quotaData: 'Q1', spiffs: 'S1' }, { [other]: 'KEPT' });
        assert.deepEqual(begins.opened, { [other]: 'KEPT', [key]: key === 'spiffs' ? 'S1' : 'Q1' }, `${setter}: REGRESSION — the draft begins with no token, or the other draft's lost`);
        assert.deepEqual(begins.drafts, ['NEXT']);
        const open = run([], { quotaData: 'Q2', spiffs: 'S2' }, { [key]: 'BEGAN' });
        assert.deepEqual(open.opened, { [key]: 'BEGAN' }, `${setter}: REGRESSION (critic B9) — an open draft's token taken again: a save another tab landed since passes under its edits`);
        assert.deepEqual(open.drafts, ['NEXT']);
        assert.deepEqual(run(null, undefined, {}).opened, { [key]: null }, `${setter}: a copy with no token — none (null), checked`);
    }
});

// A component's top-level statement `<target> = …;` as written — run on every render — or null when it has none.
const assignIn = (src, component, target) => {
    let out = null;
    walk(astOf(src).program, (n) => {
        const body = componentBody(n, component);
        if (!body) return;
        for (const st of body) {
            const e = st.type === 'ExpressionStatement' ? st.expression : null;
            if (e && e.type === 'AssignmentExpression' && (chainOf(e.left) || []).join('.') === target) out = src.slice(st.start, st.end);
        }
    });
    return out;
};

test("S10 — the Sales Manager's cards locked through their own save, run as written (state §0.228): each card's flag set once when its save goes out, cleared once it settles — landed or refused; a second save while one is out sets nothing", async () => {
    for (const [card, drafts, key] of [['saveCommission', { tiersDraft: TIERS_DRAFT }, 'commission'], ['saveSpiffBoard', { spiffsDraft: SPIFFS_DRAFT }, 'spiffs']]) {
        const st = await salesManagerRig(drafts);
        const first = st[card]();
        st[card]();
        assert.deepEqual(st.flags, [[key, true]], `${card}: REGRESSION (state §0.228) — the card not locked by its own save: a claim's Approve flips the banner off saving mid-save, the card unlocks, and what is typed then is dropped when the save lands`);
        st.sends[0].resolve(LANDS);
        await first; await tick();
        assert.deepEqual(st.flags, [[key, true], [key, false]], `${card}: REGRESSION (state §0.228) — never unlocked once its save landed`);
        const second = st[card]();
        st.sends[1].resolve({ ok: false, status: 500, error: 'The server returned 500.' });
        await second.catch(() => {}); await tick();
        assert.deepEqual(st.flags.slice(2), [[key, true], [key, false]], `${card}: REGRESSION (state §0.228) — never unlocked once its save was refused: the draft kept and nothing can change it`);
    }
});

// A SPIFF's Remove as written (state §0.228): its × asks first — showConfirm keeps the answer for later — and the board
// is drawn again before it is answered. One ref across renders (the board's useRef), each render's
// `spiffBoard.current = …` run as written; the answer is the × of the render it was clicked on.
test("S10 — a SPIFF's Remove answered late, run as written (state §0.228): it reads the board as drawn when answered — never the list from when × was clicked; nothing while the board's save is out, or once the SPIFF is gone", () => {
    const src = read(SALES_MANAGER);
    const lockSrc = declOrNull(src, 'AdminTab', 'spiffsLocked');
    const drawSrc = assignIn(src, 'AdminTab', 'spiffBoard.current');
    const removeSrc = declOrNull(src, 'AdminTab', 'removeSpiff');
    const clicks = [];
    walk(astOf(src).program, (n) => {
        if (n.type !== 'JSXAttribute' || n.name.name !== 'onClick' || n.value?.type !== 'JSXExpressionContainer') return;
        const asks = (c) => callsNamed('showConfirm')(c) && c.arguments[0]?.type === 'TemplateLiteral' && c.arguments[0].quasis[0].value.cooked.startsWith('Remove SPIFF');
        if (has(n.value.expression, asks)) clicks.push(src.slice(n.value.expression.start, n.value.expression.end));
    });
    assert.equal(clicks.length, 1, "one SPIFF ×");
    const board = { current: null };
    const render = (list, { busy = false, sending = false } = {}) => {
        const edits = [];
        const editSpiffs = (next) => edits.push(next);
        const spiffsLocked = lockSrc ? fnAs(lockSrc, { busy, spiffsSending: sending }) : busy;
        if (drawSrc) fnAs(`() => { ${drawSrc} }`, { spiffBoard: board, spiffsLocked, spiffList: list, editSpiffs })();
        const removeSpiff = removeSrc ? fnAs(removeSrc, { spiffBoard: board }) : undefined;
        const click = (si) => {
            let answer = null;
            fnAs(clicks[0], { showConfirm: (words, then) => { answer = then; }, spiff: list[si], si, spiffList: list, editSpiffs, removeSpiff })();
            assert.equal(typeof answer, 'function', 'asked first');
            return answer;
        };
        return { edits, click };
    };
    const A = { id: 'a', name: 'A' }, B = { id: 'b', name: 'B' }, C = { id: 'c', name: 'C' };

    let clicked = render([A, B]);
    let answer = clicked.click(0);
    let drawn = render([{ ...A, name: 'A2' }, B, C]);   // meanwhile: C added, A renamed
    answer();
    assert.deepEqual(clicked.edits, [], 'REGRESSION (state §0.228): the answer edited the list from when × was clicked — C, added since, gone again, through the setter of that render (its draft-start check on the old draft)');
    assert.deepEqual(drawn.edits, [[B, C]], 'that SPIFF removed, by its id, from the board as drawn when answered, through its setter');

    for (const [lock, why] of [[{ sending: true }, "the board's own save out, the banner flipped off saving by a claim's Approve"], [{ busy: true }, 'a save out (busy)']]) {
        clicked = render([A, B]);
        answer = clicked.click(1);
        drawn = render([A, B], lock);
        answer();
        assert.deepEqual([clicked.edits, drawn.edits], [[], []], `REGRESSION (state §0.228): answered while ${why}, the draft edited under the save — it lands its own and drops the draft`);
    }

    clicked = render([A, B]);
    answer = clicked.click(0);
    drawn = render([B, C]);   // a save took the latest; A is not on it
    answer();
    assert.deepEqual([clicked.edits, drawn.edits], [[], []], 'gone from the board: nothing — no draft opened on the latest');

    const N = { name: 'Same' }, N2 = { name: 'Same' };
    clicked = render([N, N2, B]);
    answer = clicked.click(0);
    drawn = render([N, N2, B]);
    answer();
    assert.ok(drawn.edits.length === 1 && drawn.edits[0].length === 2 && drawn.edits[0][0] === N2 && drawn.edits[0][1] === B, 'no id: that entry removed, not its twin');

    assert.equal(declOrNull(src, 'AdminTab', 'spiffBoard'), 'React.useRef(null)', 'the board as drawn is one ref across renders');
});

// ── S11 — AdminView's stale handler and leave guard, run as written ─────────

const runPanelStale = async ({ latest = { revs: { k: 'L' } }, take = null, args = [] } = {}) => {
    const { PANEL_CHANGED } = await import('../src/utils/settingsRevs.js');
    const st = { taken: 0, sets: 0, dirty: [], notes: [], epoch: 0, slot: { current: () => {} } };
    const answer = runAs(handlerIn(read(ADMIN), 'AdminView', 'panelStale'), {
        PANEL_CHANGED, activeItem: { id: 'customer-types' },
        takeLatestSettings: take || (async () => { st.taken += 1; return latest; }),
        setSettings: () => { st.sets += 1; },
        settingsSaveRef: st.slot,
        setSettingsDirty: (v) => st.dirty.push(v),
        setPanelNote: (v) => st.notes.push(v),
        setPanelEpoch: (f) => { st.epoch = typeof f === 'function' ? f(st.epoch) : f; },
    }, ...args);
    return { st, answer };
};

test('S11 — AdminView\'s panelStale, run as written: read — the slot and App\'s flag cleared, the words, the remount, tookLatest; the asker gone — only tookLatest; unread — nothing, false; never settles after a switch', async () => {
    const { PANEL_CHANGED, PANEL_CHANGED_KEY } = await import('../src/utils/settingsRevs.js');
    const e = new Error('stale');
    const open = await runPanelStale({ args: [e, undefined, () => true] });
    assert.equal(await open.answer, true);
    assert.equal(e.tookLatest, true, 'REGRESSION (J-B11): the leave guard cannot tell the latest was taken');
    assert.equal(open.st.taken, 1);
    assert.equal(open.st.slot.current, null, 'REGRESSION: the guard still offers the old mount\'s save — its draft is gone');
    assert.deepEqual(open.st.dirty, [false], 'REGRESSION: App still thinks the page is unsaved');
    assert.deepEqual(open.st.notes, [{ id: 'customer-types', words: PANEL_CHANGED }], 'the words, above that panel (JB3-1)');
    assert.equal(open.st.epoch, 1, 'REGRESSION (J-B5): the panel not drawn again on the latest');
    const keyed = await runPanelStale({ args: [new Error('stale'), PANEL_CHANGED_KEY, () => true] });
    await keyed.answer;
    assert.equal(keyed.st.notes[0]?.words, PANEL_CHANGED_KEY, 'the panel\'s own words when it names them');

    const e2 = new Error('stale');
    const gone = await runPanelStale({ args: [e2, undefined, () => false] });
    assert.equal(await gone.answer, true, 'the latest was taken');
    assert.equal(e2.tookLatest, true);
    assert.deepEqual([gone.st.slot.current !== null, gone.st.dirty, gone.st.notes, gone.st.epoch], [true, [], [], 0],
        'REGRESSION (critic A2): the panel open now remounted, its draft lost, for a refusal answered after its asker left');

    const e3 = new Error('stale');
    const unread = await runPanelStale({ latest: null, args: [e3, undefined, () => true] });
    assert.equal(await unread.answer, false, 'unread: the panel keeps its draft and says the server\'s words');
    assert.deepEqual([e3.tookLatest, unread.st.slot.current !== null, unread.st.dirty, unread.st.notes, unread.st.epoch], [undefined, true, [], [], 0]);

    // The real read, cut by a switch: it never settles, and touches nothing.
    const { takeLatestSettings } = await import('../src/Tabs/settings/shared/saveSettings.js');
    await withServer(async ({ queue, setRequestOrg }) => {
        const h = held(); queue.push(h.answer);
        const e4 = new Error('stale');
        const cut = await runPanelStale({ take: takeLatestSettings, args: [e4, undefined, () => true] });
        await until(() => h.release);
        setRequestOrg('org_B'); h.release(200, { settings: { revs: { k: 'X' } } });
        assert.equal(await outcome(cut.answer), PENDING, 'REGRESSION (critic B1): the last org\'s refusal answered on the new org\'s screen');
        assert.deepEqual([e4.tookLatest, cut.st.sets, cut.st.dirty, cut.st.notes, cut.st.epoch], [undefined, 0, [], [], 0]);
    });
});

// A leave guard's save as written: the save it runs answers or throws `thrown`; answers what it set.
const refusedWith = (fields) => async () => { throw Object.assign(new Error('x'), fields); };
const GUARD_CASES = [[{ tookLatest: true }, 'stale'], [{ tookLatest: true, partial: true }, 'stale-partial'], [{ stale: ['k'] }, true], [{}, true]];

test('S11 — AdminView\'s guardSave, run as written: a refusal that took the latest says so — \'stale\', \'stale-partial\'; any other, true; a save that lands moves on. Back, another card and Discard', async () => {
    const runGuard = async (save) => {
        const st = { failed: [], saving: [], guard: [], dirty: [], went: 0 };
        await runAs(handlerIn(read(ADMIN), 'AdminView', 'guardSave'), {
            settingsSaveRef: { current: save }, leaveGuard: { go: () => { st.went += 1; } },
            setLeaveGuard: (v) => st.guard.push(v), setGuardSaving: (v) => st.saving.push(v),
            setGuardFailed: (v) => st.failed.push(v), setSettingsDirty: (v) => st.dirty.push(v),
        });
        return st;
    };
    for (const [fields, want] of GUARD_CASES) {
        const st = await runGuard(refusedWith(fields));
        assert.deepEqual(st.failed, [false, want], `${JSON.stringify(fields)}: REGRESSION (J-B11) — the dialog cannot say the page took the latest`);
        assert.deepEqual([st.went, st.guard, st.saving.at(-1)], [0, [], false], 'the dialog stays');
    }
    const landed = await runGuard(async () => {});
    assert.deepEqual([landed.went, landed.dirty, landed.guard, landed.failed], [1, [false], [null], [false]]);

    // Back and another card: the words go with the panel they were about, through the guard too. Discard forgets a
    // failed save's words (JB3-7b).
    const src = withoutComments(read(ADMIN));
    const program = astOf(src).program;
    for (const name of ['onBack', 'openItem']) {
        const fns = [];
        walk(program, (n) => { if (n.type === 'VariableDeclarator' && n.id.name === name && isFn(n.init)) fns.push(n.init); });
        assert.equal(fns.length, 1, `one ${name}`);
        let go = null;
        walk(fns[0], (n) => { if (n.type === 'ObjectProperty' && keyName(n) === 'go' && isFn(n.value)) go = src.slice(n.value.start, n.value.end); });
        assert.ok(go && go.includes('setPanelNote(null)'), `${name}: REGRESSION — leaving a dirty panel through the guard keeps its words for the next one`);
        assert.equal(count(src.slice(fns[0].start, fns[0].end), 'setPanelNote(null)'), 2, `${name}: REGRESSION — the words outlive the panel they were about`);
    }
    const discards = [];
    walk(program, (n) => { if (n.type === 'JSXAttribute' && n.name.name === 'onDiscard') discards.push(src.slice(n.value.start, n.value.end)); });
    assert.equal(discards.length, 2, 'the panel\'s dialog and the card list\'s');
    for (const d of discards) {
        const reset = d.indexOf('setGuardFailed(false)'), go = d.indexOf('go && go()');
        assert.ok(reset >= 0 && go > reset, `REGRESSION (JB3-7b): Discard keeps a failed save's words for the next dialog — ${d}`);
    }
});

// ── S12 — the pins ───────────────────────────────────────────────────────────

test('S12 — App\'s leave guard (navGuardSave), run as written: a refusal that took the latest says so — \'stale\', \'stale-partial\'; any other, true; a save that lands moves on', async () => {
    const run = async (save) => {
        const st = { failed: [], saving: [], shown: [], went: [] };
        await runAs(handlerIn(read('src/App.jsx'), 'App', 'navGuardSave'), {
            React: { useCallback: (fn) => fn },
            settingsSaveRef: { current: save }, pendingNavTab: 'reports',
            setNavGuardSaving: (v) => st.saving.push(v), setNavGuardFailed: (v) => st.failed.push(v),
            setSettingsDirty: () => {}, setShowNavGuard: (v) => st.shown.push(v),
            setActiveTab: (v) => st.went.push(v), setPendingNavTab: () => {},
        });
        return st;
    };
    for (const [fields, want] of GUARD_CASES) {
        const st = await run(refusedWith(fields));
        assert.deepEqual(st.failed, [false, want], `${JSON.stringify(fields)}: REGRESSION (J-B11) — the dialog cannot say the page took the latest`);
        assert.deepEqual([st.went, st.shown, st.saving.at(-1)], [[], [], false], 'the dialog stays');
    }
    const landed = await run(async () => {});
    assert.deepEqual([landed.went, landed.shown, landed.failed], [['reports'], [false], [false]]);
});

// Why a save is not one flight (null when it is): `const <name> = () => { if (!<ref>.current) { … <ref>.current =
// <send>(…).finally(() => { <ref>.current = null; … }); } return <ref>.current; }`, <ref> the component's own
// useRef(null) — a second save while one is out answers the first one's promise, and the flight clears once it settles
// (the quotas' — state §0.203; the commission plan's and the SPIFF board's — state §0.228).
const flightFault = (name, anc) => {
    const b = bindingOf(name, anc);
    const fn = b && b.kind === 'const' ? b.decl.init : null;
    if (!isFn(fn) || fn.body.type !== 'BlockStatement' || fn.body.body.length !== 2) return 'is not `if (!<ref>.current) {…} return <ref>.current;`';
    const [iff, ret] = fn.body.body;
    const t = iff.type === 'IfStatement' && !iff.alternate ? iff.test : null;
    const ref = t && t.type === 'UnaryExpression' && t.operator === '!' ? chainOf(t.argument) : null;
    if (!ref || ref.length !== 2 || ref[1] !== 'current') return 'never asks whether a save is out (if (!<ref>.current))';
    const r = ref[0];
    if (ret.type !== 'ReturnStatement' || !ret.argument || (chainOf(ret.argument) || []).join('.') !== `${r}.current`) return `does not answer the flight out (return ${r}.current)`;
    const rb = bindingOf(r, anc);
    const init = rb && rb.kind === 'const' ? rb.decl.init : null;
    const made = init && isCall(init) ? (init.callee.type === 'Identifier' ? init.callee.name : (chainOf(init.callee) || []).join('.')) : '';
    if (!['useRef', 'React.useRef'].includes(made) || init.arguments[0]?.type !== 'NullLiteral' || rb.scope !== b.scope) return `${r} is not the component's own useRef(null)`;
    let held = 0, clears = 0;
    walk(iff.consequent, (o) => {
        if (o.type !== 'AssignmentExpression' || (chainOf(o.left) || []).join('.') !== `${r}.current`) return;
        const v = o.right;
        if (!isCall(v) || !isMember(v.callee) || propName(v.callee) !== 'finally' || !isCall(v.callee.object) || !isFn(v.arguments[0])) return;
        held += 1;
        walk(v.arguments[0].body, (c) => { if (c.type === 'AssignmentExpression' && (chainOf(c.left) || []).join('.') === `${r}.current` && c.right.type === 'NullLiteral') clears += 1; });
    });
    if (held !== 1) return `does not hold its send as the flight (${r}.current = <send>(…).finally(…))`;
    if (clears !== 1) return `never clears the flight once it settles (${r}.current = null in its finally) — every later save answers the first one's outcome`;
    return null;
};

test('S12 — the pins: the dialog\'s words (J-B11, JB3-2), still saving (JB3-8), the brand changed (JB3-4), reopen where a draft re-seeds, one save at a time on every guarded file — the Sales Manager by its flights (JB3-10, state §0.228), Property types\' deps, JB3-6, JB3-7a', async () => {
    const { LEAVE_STALE, LEAVE_STALE_PART, STILL_SAVING, BRAND_CHANGED } = await import('../src/utils/settingsRevs.js');
    assert.equal(LEAVE_STALE, 'Another change landed first — the page now shows the latest. Your changes were not saved.', 'J-B11, verbatim');
    assert.equal(LEAVE_STALE_PART, 'Another change landed first — the page now shows the latest. That change was not saved; the ones saved before it stay saved.', 'JB3-5');
    assert.equal(STILL_SAVING, 'The last change is still saving — try again in a moment.', 'JB3-8, verbatim');
    assert.equal(BRAND_CHANGED, 'The brand changed since this window opened — it now shows the latest. Make your change again.', 'JB3-4, verbatim');
    const modal = withoutComments(read('src/Tabs/settings/shared/LeaveGuardModal.jsx'));
    assert.ok(modal.includes("const stale = failed === 'stale' || failed === 'stale-partial';"));
    assert.match(modal, /\{failed === 'stale-partial' \? LEAVE_STALE_PART\s*: stale \? LEAVE_STALE\s*: 'The save did not go through — the page behind this dialog shows why\. Your changes are still here\.'\}/, 'the three states');
    assert.match(modal, /\{!\(stale && !canSave\) && \(\s*<div style=\{\{[^}]*\}\}>\s*\{message\}\s*<\/div>\s*\)\}/, 'REGRESSION (critic A6): "Save them, or discard" said — or its box drawn empty — with nothing left to save');
    assert.ok(modal.includes("{stale && !canSave ? 'Continue' : 'Discard changes and continue'}"), 'JB3-2: nothing to discard — it continues');
    assert.match(modal, /\{canSave && \(\s*<button onClick=\{onSave\}/, 'Save offered on canSave alone (critic A4)');

    // reopen: in the effect that re-seeds the draft from the prop — Features' only while it is clean.
    const calleeText = (c) => (c.callee.type === 'Identifier' ? c.callee.name : (chainOf(c.callee) || []).join('.'));
    for (const [f, whenClean] of [[FEATURES, true], ['src/Tabs/settings/salesProcess/LeadScoringDetail.jsx', false], ['src/Tabs/settings/salesProcess/LeadVisibilityDetail.jsx', false]]) {
        const calls = [];
        walk(astOf(read(f)).program, (n, anc) => { if (callsNamed('reopen')(n)) calls.push({ n, anc }); });
        assert.equal(calls.length, 1, `${f}: one reopen`);
        const { n, anc } = calls[0];
        assert.equal(hookFault('reopen', anc), null, `${f}: reopen is the panel's own`);
        assert.equal(n.arguments.length, 0, `${f}: the render's tokens`);
        const effect = anc.findLast((a, i) => isFn(a) && i > 0 && isCall(anc[i - 1]) && /^(React\.)?useEffect$/.test(calleeText(anc[i - 1])) && anc[i - 1].arguments[0] === a);
        assert.ok(effect && anc.findLast(isFn) === effect, `${f}: REGRESSION — reopen outside the effect that re-seeds the draft: the draft the prop's, its tokens the old`);
        if (whenClean) assert.ok(anc.some((a) => a.type === 'IfStatement' && a.test.type === 'UnaryExpression' && a.test.operator === '!' && a.test.argument.name === 'dirty'), `${f}: only when the draft re-seeds (!dirty)`);
    }

    // One save at a time, on every converted file that registers with the leave guard (JB3-10): a draft panel's guard
    // save is `const <handler> = once(async …)` — under useCallback for Property types. The Sales Manager's guard runs
    // saveAdminDrafts, and each save it awaits is one flight of its own (flightFault) — the quotas' (state §0.203), the
    // commission plan's and the SPIFF board's (state §0.228): pressed while a card's own Save was out, the guard's sent
    // the same draft with the same draft-start token and was refused by it.
    let guarded = 0;
    for (const f of SITE_FILES) {
        walk(astOf(read(f)).program, (n, anc) => {
            if (!callsNamed('useRegisterSave')(n)) return;
            guarded += 1;
            const h = n.arguments[2];
            if (f === SALES_MANAGER) {
                assert.equal(h?.name, 'saveAdminDrafts', `${f}: the guard runs the page's drafts' save`);
                const b = bindingOf(h.name, anc);
                assert.ok(b && b.kind === 'const' && isFn(b.decl.init), `${f}: saveAdminDrafts is the component's own`);
                const awaited = [];
                walk(b.decl.init.body, (o) => { if (o.type === 'AwaitExpression' && isCall(o.argument) && o.argument.callee.type === 'Identifier') awaited.push(o.argument.callee.name); });
                assert.deepEqual(awaited, ['saveQuotas', 'saveCommission', 'saveSpiffBoard'], `${f}: the guard's save awaits the three cards' saves`);
                for (const name of awaited) {
                    const why = flightFault(name, [b.scope]);
                    assert.equal(why, null, `${f}: ${name} ${why} — REGRESSION (JB3-10, state §0.228): pressed while the card's own Save is out, the guard's sends the same draft with the same token, refused by it`);
                }
                return;
            }
            const b = h && h.type === 'Identifier' ? bindingOf(h.name, anc) : null;
            let init = b && b.kind === 'const' ? b.decl.init : null;
            if (isCall(init) && calleeName(init) === 'useCallback') init = init.arguments[0];
            assert.ok(['handleSave', 'handleSaveAi'].includes(h?.name), `${f}: the guard runs the panel's save`);
            assert.ok(isCall(init) && calleeName(init) === 'once' && isFn(init.arguments[0]) && init.arguments[0].async,
                `${f}:${n.loc.start.line}: REGRESSION (JB3-10) — the guard's save is not once(async …): pressed while the panel's own is out, it is refused by it`);
            assert.equal(hookFault('once', anc), null, `${f}: once is the panel's own — its flight held across renders`);
        });
    }
    assert.equal(guarded, B3A_FILES.length + 1, "every guarded file read — B-3a's panels and the Sales Manager");
    let deps = null;
    walk(astOf(read(PROPERTY_TYPES)).program, (n) => {
        if (n.type === 'VariableDeclarator' && n.id.name === 'handleSave' && isCall(n.init) && calleeName(n.init) === 'useCallback') deps = n.init.arguments[1];
    });
    assert.deepEqual(deps?.elements?.map((e) => e.name), ['types', 'setSettings', 'opened', 'landed', 'panelStale'], 'REGRESSION: a memo over an old opened — the save names the tokens of a mount before its last landing');

    // JB3-6: a Save waits for an edit, and for the save out. JB3-7a: Cancel clears App's unsaved flag too.
    const elements = (f) => {
        const src = read(f), out = [];
        walk(astOf(src).program, (n) => {
            if (n.type !== 'JSXOpeningElement') return;
            out.push(Object.fromEntries(n.attributes.filter((a) => a.type === 'JSXAttribute' && a.value?.type === 'JSXExpressionContainer')
                .map((a) => [a.name.name, src.slice(a.value.expression.start, a.value.expression.end)])));
        });
        return out;
    };
    assert.ok(elements(FLAT_LIST).some((e) => e.onClick === 'handleSave' && e.disabled === '!dirty || saving'), 'JB3-6: a flat list\'s own Save');
    for (const f of ['src/Tabs/settings/salesProcess/CustomFieldsDetail.jsx', 'src/Tabs/settings/salesProcess/FunnelStagesDetail.jsx']) {
        assert.ok(elements(f).some((e) => e.primaryAction === 'handleSave' && e.disablePrimary === '!dirty || saving'), `${f}: JB3-6`);
    }
    for (const f of ['src/Tabs/settings/quoting/ProductTypesDetail.jsx', 'src/Tabs/settings/dispatch/DispatchBlockTypesDetail.jsx', 'src/Tabs/settings/dispatch/DispatchJobTypesDetail.jsx']) {
        const cancels = [];
        walk(astOf(read(f)).program, (n) => { if (n.type === 'JSXAttribute' && n.name.name === 'onCancel') cancels.push(n.value.expression); });
        assert.equal(cancels.length, 1, `${f}: one Cancel`);
        assert.ok(has(cancels[0], (n) => callsNamed('setSettingsDirty')(n) && n.arguments[0]?.type === 'BooleanLiteral' && n.arguments[0].value === false),
            `${f}: REGRESSION (JB3-7a) — Cancel leaves App's unsaved flag set: the guard asks about edits that are gone`);
    }
});

// The J-B5 words show on the card they were said for, and on no other (the checker's problem 3): Back, another card
// and the guard's leave clear them, and the render checks the card too — a note kept past a path that forgets to
// clear it would sit above another panel, naming a change that panel never saw.
test('S11 — AdminView\'s note: drawn only above the card it was said for', () => {
    const src = withoutComments(read(ADMIN));
    assert.equal(count(src, '{panelNote && panelNote.id === activeItem.id && ('), 1, 'REGRESSION: the J-B5 words drawn above whatever card is open');
    assert.equal(count(src, 'setPanelNote({ id: activeItem?.id, words });'), 1, 'the note names its card');
});

test('S12 — B-3b\'s pins (state §0.228): the gate opens on the render that holds a landed save\'s tokens; Edit brand\'s window — its token from the panel, Save and Cancel held while saving; the Sales Manager\'s drafts begin through their setters', () => {
    // Pipelines and the calendar: `const inFlight = useRef(false)`, and `useEffect(() => { inFlight.current = false; },
    // [opened])` — opened moves only when landed merged an answer, so the next change names the tokens it answered
    // (critic A8).
    const calleeText = (c) => (c.callee.type === 'Identifier' ? c.callee.name : (chainOf(c.callee) || []).join('.'));
    for (const f of [PIPELINES, CALENDAR]) {
        const refs = [], releases = [];
        walk(astOf(read(f)).program, (n) => {
            if (n.type === 'VariableDeclarator' && n.id.name === 'inFlight' && isCall(n.init) && ['useRef', 'React.useRef'].includes(calleeText(n.init))) refs.push(n.init.arguments[0]?.value);
            if (!isCall(n) || !['useEffect', 'React.useEffect'].includes(calleeText(n))) return;
            const [fn, deps] = n.arguments;
            const body = fn?.body?.type === 'BlockStatement' ? fn.body.body : [];
            const opens = body.length === 1 && body[0].type === 'ExpressionStatement' && body[0].expression.type === 'AssignmentExpression'
                && (chainOf(body[0].expression.left) || []).join('.') === 'inFlight.current' && body[0].expression.right.value === false;
            if (opens) releases.push((deps?.elements || []).map((e) => e.name).join(','));
        });
        assert.deepEqual(refs, [false], `${f}: one gate, open at mount`);
        assert.deepEqual(releases, ['opened'], `${f}: REGRESSION (critic A8) — the gate opens before the merged tokens render, or never: the next change refused against its own save, or every change after the first said to be still saving`);
    }

    const tags = (f) => {
        const src = read(f), out = [];
        walk(astOf(src).program, (n) => {
            if (n.type !== 'JSXOpeningElement') return;
            out.push({ tag: n.name.name, ...Object.fromEntries(n.attributes.filter((a) => a.type === 'JSXAttribute' && a.value?.type === 'JSXExpressionContainer')
                .map((a) => [a.name.name, src.slice(a.value.expression.start, a.value.expression.end)])) });
        });
        return out;
    };
    const brand = tags(EDIT_BRAND);
    assert.ok(brand.some((e) => e.tag === 'button' && e.onClick === 'handleSave' && e.disabled === 'saving'), 'REGRESSION (critic A5): Save pressed again while its save is out');
    assert.ok(brand.some((e) => e.tag === 'button' && e.onClick === 'close' && e.disabled === 'saving'), 'REGRESSION (critic A5): Cancel offered while the save is out');
    const brandSrc = read(EDIT_BRAND);
    let seeded = null;
    walk(astOf(brandSrc).program, (n) => {
        if (n.type === 'VariableDeclarator' && n.id.type === 'ArrayPattern' && n.id.elements[0]?.name === 'base') seeded = brandSrc.slice(n.init.start, n.init.end);
    });
    assert.equal(seeded, 'React.useState(() => ({ rev: initialRev }))', 'REGRESSION (JB3-4): the window\'s token not the one it opened with');
    const opens = tags('src/Tabs/settings/quoting/QuoteTemplatesDetail.jsx').filter((e) => e.tag === 'EditBrandModal');
    assert.deepEqual(opens.map((e) => e.initialRev), ['settings?.revs?.quoteBrand ?? null'], 'REGRESSION (JB3-4): the window opens with no token — its Save checked against none, refused wherever a brand was saved');

    const admin = tags(SALES_MANAGER).filter((e) => 'setTiersDraft' in e || 'setSpiffsDraft' in e);
    assert.deepEqual(admin.map((e) => [e.tag, e.setTiersDraft, e.setSpiffsDraft]), [['AdminTab', 'draftTiers', 'draftSpiffs']],
        'REGRESSION (critic B9): an edit goes past the drafts\' setters — the draft begins with no token');
});

// The Sales Manager's commission plan and SPIFF board while a save is out (state §0.228): `cardFaults(src, title, lock)`
// reads the card — the `<div style={smCard2}>` around the eyebrow `title` — and each module-scope component of the file
// it draws. Every control in it — a native input, select, textarea or button, or a component (it draws its own) — sits
// in a `<fieldset disabled={<lock>}>` inside the card; anything else that answers an event (on…) is a fault — a disabled
// fieldset disables native controls alone — and so is a legend (a fieldset's first legend's controls stay enabled), a
// link, or a component not read. Returns { controls, faults }, the controls in source order.
const NATIVE_CONTROLS = new Set(['input', 'select', 'textarea', 'button']);
const jsxTag = (el) => (el.openingElement.name.type === 'JSXIdentifier' ? el.openingElement.name.name : null);
const jsxAttr = (el, name) => el.openingElement.attributes.find((a) => a.type === 'JSXAttribute' && a.name.name === name) || null;
const jsxExprName = (attr) => (attr?.value?.type === 'JSXExpressionContainer' && attr.value.expression.type === 'Identifier' ? attr.value.expression.name : null);
const onAttrs = (el) => el.openingElement.attributes.filter((a) => a.type === 'JSXAttribute' && /^on[A-Z]/.test(a.name.name)).map((a) => a.name.name);
const controlName = (el) => {
    const t = jsxTag(el);
    if (t === 'input') return `input ${jsxAttr(el, 'type')?.value?.value ?? '?'}`;
    if (t === 'button') return `button ${el.children.filter((c) => c.type === 'JSXText').map((c) => c.value).join('').trim()}`;
    const label = jsxAttr(el, 'label')?.value;
    return label?.type === 'StringLiteral' ? `${t} ${label.value}` : t;
};
const cardFaults = (src, title, lock) => {
    const ast = astOf(src);
    const cards = [];
    walk(ast.program, (n, anc) => {
        if (n.type !== 'JSXText' || n.value.trim() !== title) return;
        const card = anc.findLast((a) => a.type === 'JSXElement' && jsxTag(a) === 'div' && jsxExprName(jsxAttr(a, 'style')) === 'smCard2');
        if (card) cards.push(card);
    });
    if (cards.length !== 1) return { controls: [], faults: [`${cards.length} cards titled ${title}`] };
    const controls = [], faults = [], drawn = [];
    walk(cards[0], (n, anc) => {
        if (n.type !== 'JSXElement') return;
        const t = jsxTag(n);
        const locked = anc.some((a) => a.type === 'JSXElement' && jsxTag(a) === 'fieldset' && jsxExprName(jsxAttr(a, 'disabled')) === lock);
        if (t === null || t === 'legend' || t === 'a') { faults.push(`<${t ?? 'a member tag'}> in the card`); return; }
        if (NATIVE_CONTROLS.has(t) || /^[A-Z]/.test(t)) {
            controls.push(controlName(n));
            if (!locked) faults.push(`${controlName(n)}:${n.loc.start.line} not in <fieldset disabled={${lock}}>`);
            if (/^[A-Z]/.test(t) && !drawn.includes(t)) drawn.push(t);
        } else if (onAttrs(n).length) faults.push(`<${t}>:${n.loc.start.line} answers ${onAttrs(n).join(', ')} — a disabled fieldset does not hold it`);
    });
    for (let i = 0; i < drawn.length; i++) {
        const name = drawn[i];
        let fn = null;
        for (const st of ast.program.body) {
            if (st.type === 'FunctionDeclaration' && st.id?.name === name) fn = st;
            if (st.type === 'VariableDeclaration') for (const d of st.declarations) if (d.id.name === name && isFn(d.init)) fn = d.init;
        }
        if (!fn) { faults.push(`${name} is not this file's — not read`); continue; }
        walk(fn.body, (n) => {
            if (n.type !== 'JSXElement') return;
            const t = jsxTag(n);
            if (t === null || t === 'legend' || t === 'a') faults.push(`${name}: <${t ?? 'a member tag'}>`);
            else if (/^[A-Z]/.test(t)) { if (!drawn.includes(t)) drawn.push(t); }
            else if (!NATIVE_CONTROLS.has(t) && onAttrs(n).length) faults.push(`${name}: <${t}> answers ${onAttrs(n).join(', ')} — a disabled fieldset does not hold it`);
        });
    }
    return { controls, faults };
};

test("S12 — the Sales Manager's commission plan and SPIFF board locked while a save is out (state §0.228): every control in a disabled fieldset, by the AST; the card's lock — busy, or its own save out — run as written; its flag handed down", () => {
    // The scanner, on made-up sources.
    const made = (inner) => [
        'const C = () => (<div style={smCard2}><div style={eyebrow}>Board</div>' + inner + '</div>);',
        'const Seg = ({ on }) => <div role="group"><button onClick={on}>x</button></div>;',
        'function Bad({ on }) { return <span onClick={on}>x</span>; }',
    ].join(String.fromCharCode(10));
    assert.deepEqual(cardFaults(made('<fieldset disabled={lockA}><input type="number" onChange={f} onBlur={g}/><button onClick={g}>+ Add</button><select><option>o</option></select><Seg on={g}/></fieldset>'), 'Board', 'lockA'),
        { controls: ['input number', 'button + Add', 'select', 'Seg'], faults: [] }, 'every control in the fieldset: no fault');
    for (const [inner, why] of [
        ['<fieldset disabled={lockA}><input/></fieldset><button onClick={g}>New</button>', 'a control after the fieldset'],
        ['<Seg on={g}/><fieldset disabled={lockA}><input/></fieldset>', 'a component before it'],
        ['<fieldset><input/></fieldset>', 'a fieldset with no lock'],
        ['<fieldset disabled={lockB}><input/></fieldset>', "another card's lock"],
        ['<fieldset disabled={!lockA}><input/></fieldset>', 'the lock turned round'],
        ['<fieldset disabled={lockA}><div onClick={g}>Remove</div></fieldset>', 'a click on what a fieldset does not disable'],
        ['<fieldset disabled={lockA}><Bad on={g}/></fieldset>', 'a component whose click is no control'],
        ['<fieldset disabled={lockA}><legend><button onClick={g}>x</button></legend></fieldset>', 'a legend'],
        ['<fieldset disabled={lockA}><a href="#">x</a></fieldset>', 'a link'],
        ['<fieldset disabled={lockA}><Gone/></fieldset>', 'a component not read'],
    ]) assert.ok(cardFaults(made(inner), 'Board', 'lockA').faults.length > 0, `the scanner misses ${why}`);

    const src = read(SALES_MANAGER);
    for (const [title, lock, want] of [
        ['Commission Plan', 'tiersLocked', ['DraftActions Save plan', 'input number', 'button ×', 'button + Add Tier']],
        ['SPIFF Board', 'spiffsLocked', ['DraftActions Save SPIFFs', 'button + Add SPIFF', 'input text', 'select', 'input number', 'SpiffStatus', 'button ×', 'input text']],
    ]) {
        const { controls, faults } = cardFaults(src, title, lock);
        assert.deepEqual(faults, [], `${title}: REGRESSION (state §0.228) — a control not locked while a save is out: what is typed then is lost — the save out sends the draft it began with and drops the draft when it lands — and the leave guard says it was saved`);
        assert.deepEqual(controls, want, `${title}: the card's controls, each read here — a new one is listed once it is locked`);
    }

    // The locks, run as written: busy (the banner says a save is out, the quotas' included), or the card's own save
    // out — which holds it when another save (a claim's Approve) flips the banner off saving.
    for (const [lock, flag] of [['tiersLocked', 'commissionSending'], ['spiffsLocked', 'spiffsSending']]) {
        const init = declOrNull(src, 'AdminTab', lock);
        assert.ok(init, `AdminTab has no ${lock}`);
        const at = (busy, sending) => Boolean(fnAs(init, { busy, [flag]: sending }));
        assert.deepEqual([at(false, false), at(true, false), at(false, true), at(true, true)], [false, true, true, true],
            `${lock}: REGRESSION (state §0.228) — unlocked while a save is out, or locked with none`);
    }
    // Each flag: the page's own state, handed to AdminTab by name, read there.
    const ast = astOf(src);
    const params = [], handed = {}, states = {};
    walk(ast.program, (n) => {
        if (n.type === 'FunctionDeclaration' && n.id?.name === 'AdminTab') params.push(...n.params[0].properties.map(keyName));
        if (n.type === 'JSXOpeningElement' && n.name.name === 'AdminTab') {
            for (const a of n.attributes) if (a.type === 'JSXAttribute' && a.value?.type === 'JSXExpressionContainer') handed[a.name.name] = src.slice(a.value.expression.start, a.value.expression.end);
        }
        const body = componentBody(n, 'SalesManagerTab');
        if (body) for (const st of body) {
            if (st.type !== 'VariableDeclaration') continue;
            for (const d of st.declarations) if (d.id.type === 'ArrayPattern' && d.init) states[d.id.elements[0]?.name] = [d.id.elements[1]?.name, src.slice(d.init.start, d.init.end)];
        }
    });
    for (const [flag, setter] of [['commissionSending', 'setCommissionSending'], ['spiffsSending', 'setSpiffsSending']]) {
        assert.deepEqual(states[flag], [setter, 'useState(false)'], `${flag}: the page's own state, unlocked at mount`);
        assert.equal(handed[flag], flag, `${flag}: REGRESSION (state §0.228) — not handed to AdminTab: the card unlocks when the banner flips mid-save`);
        assert.ok(params.includes(flag), `${flag}: AdminTab reads it`);
    }
});
