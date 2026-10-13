// tests/open-states.test.mjs
//
// A control that opens a screen no longer drawn (state §0.190 — §0.189's found (a); Jeff:
// "fix the Add contact one when you have the chance").
//
// The contact, account and task modals and the contact and account panels gave way to the
// rails, and their open-states stayed behind. The Contacts tab's Company view "Add contact"
// set showContactModal, which nothing drew: it opened nothing, and held the body's scroll
// lock and the number shortcuts off until an Escape cleared it. And the header's search
// results set App's own viewingAccount and viewingContact, which nothing drew either: the
// context's setViewingAccount and setViewingContact open the rails, and App handed the
// header its own setters of those names — the page then stayed scroll-locked until a
// reload, Escape or no. "Add contact" opens the contact rail now, the header is handed the
// context's openers, and the states nothing drew are gone.
//
// THE GUARD: every open-state the two hooks keep — show…, viewing…, …Modal, …Popup,
// …Popover, …Prompt — is drawn and opened, or recorded with its reason (KNOWN). Drawn: read
// inside JSX somewhere under src, or in a render guard (`if (!x) return null`), directly or
// through one local (`const isOpen = !!x`). Opened: its setter called with something other
// than false, null or undefined somewhere under src — for a name App's context gives a
// meaning of its own, in App.jsx alone, the one place the hook's setter is in reach. App's
// context gives no hook name a meaning of its own but those recorded (CONTEXT_OWN), and App
// hands no component the hook's setter under such a name — the trap that sent the header's
// search results nowhere.
//
// Its reach: "drawn" counts a state handed on as a prop where it is handed; "opened" is by
// the setter's name.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { parse } from '@babel/parser';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8').replace(/\r\n/g, '\n');
const walk = (node, visit, anc = []) => {
    if (!node || typeof node.type !== 'string') return;
    visit(node, anc);
    const here = [...anc, node];
    for (const k of Object.keys(node)) {
        if (k === 'loc' || k === 'start' || k === 'end' || k === 'extra') continue;
        const v = node[k];
        if (Array.isArray(v)) v.forEach((c) => walk(c, visit, here));
        else if (v && typeof v.type === 'string') walk(v, visit, here);
    }
};
const parseJsx = (src) => parse(src, { sourceType: 'module', plugins: ['jsx'] });
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

const HOOKS = ['src/hooks/useModalState.js', 'src/hooks/useUIState.js'];
const OPEN = /^(show[A-Z]|viewing[A-Z])|(Modal|Popup|Popover|Prompt)$/;
const statesOf = (src) => [...src.matchAll(/const \[(\w+), (set\w+)\] = use(?:OrgBound)?State\(/g)].map((m) => ({ name: m[1], setter: m[2] }));

// A name read, not a member's property or an object's key.
const isRead = (n, anc) => {
    const parent = anc[anc.length - 1];
    if (parent && parent.type === 'MemberExpression' && parent.property === n && !parent.computed) return false;
    if (parent && parent.type === 'ObjectProperty' && parent.key === n && !parent.computed && !parent.shorthand) return false;
    return true;
};
const readsOf = (node) => {
    const out = new Set();
    walk(node, (m, a) => { if (m.type === 'Identifier' && isRead(m, a)) out.add(m.name); });
    return out;
};
const returnsNull = (s) => (s.type === 'ReturnStatement' && s.argument && s.argument.type === 'NullLiteral')
    || (s.type === 'BlockStatement' && s.body.some(returnsNull));

// What a set of files draws, and which setters they call to open something.
const scan = (files) => {
    const drawn = new Set();
    const opened = new Map();   // setter → the files that call it to open
    for (const [file, src] of files) {
        const guarded = new Set();    // read in a render guard: if (…) return null
        const derived = new Map();    // a local → the names its initializer reads
        walk(parseJsx(src), (n, anc) => {
            if (n.type === 'Identifier' && isRead(n, anc) && anc.some((a) => a.type === 'JSXExpressionContainer')) drawn.add(n.name);
            if (n.type === 'IfStatement' && returnsNull(n.consequent)) for (const r of readsOf(n.test)) guarded.add(r);
            if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.init) {
                derived.set(n.id.name, new Set([...(derived.get(n.id.name) || []), ...readsOf(n.init)]));
            }
            if ((n.type === 'CallExpression' || n.type === 'OptionalCallExpression') && n.callee.type === 'Identifier' && /^set[A-Z]/.test(n.callee.name)) {
                const arg = n.arguments[0];
                const closes = !arg || arg.type === 'NullLiteral' || (arg.type === 'BooleanLiteral' && !arg.value)
                    || (arg.type === 'Identifier' && arg.name === 'undefined');
                if (!closes) opened.set(n.callee.name, [...(opened.get(n.callee.name) || []), file]);
            }
        });
        // Through a local only in a guard (`const isOpen = !!x; if (!isOpen) return null`): a
        // local read in JSX is not followed — App's context object, handed to the provider,
        // holds every state, drawn or not.
        for (const name of guarded) { drawn.add(name); for (const r of derived.get(name) || []) drawn.add(r); }
    }
    return { drawn, opened };
};

// The names App's context gives a value of its own (`name: something else`).
const contextOwn = (app) => {
    const own = [];
    walk(parseJsx(app), (n) => {
        if (n.type !== 'VariableDeclarator' || n.id.type !== 'Identifier' || n.id.name !== 'appContextValue' || !n.init || n.init.type !== 'ObjectExpression') return;
        for (const p of n.init.properties) {
            if (p.type !== 'ObjectProperty' || p.computed || p.key.type !== 'Identifier') continue;
            if (!(p.value.type === 'Identifier' && p.value.name === p.key.name)) own.push(p.key.name);
        }
    });
    return own;
};
// The props a file hands a component under a name, its value the same-named binding.
const rawHandOffs = (src, names) => {
    const out = [];
    walk(parseJsx(src), (n) => {
        if (n.type !== 'JSXAttribute' || n.name.type !== 'JSXIdentifier' || !names.has(n.name.name)) return;
        const v = n.value && n.value.type === 'JSXExpressionContainer' ? n.value.expression : null;
        if (v && v.type === 'Identifier' && v.name === n.name.name) out.push(n.name.name);
    });
    return out;
};

// Drawn, never opened — each with its reason. A recorded one opened, or no longer drawn, fails.
const KNOWN = {
    notesPopover: 'ModalLayer draws the notes popover on it and nothing has opened it since c3842cf (12 Mar 2026), when the side detail panel replaced the pipeline table\'s notes and comments cells that set it (§0.190\'s found (b))',
};
// Hook names App's context gives a meaning of its own, each with the state it stands for
// and why. An open-state among them is recorded unopened (KNOWN): only App reaches its setter.
const CONTEXT_OWN = {
    setActiveTab: { state: 'activeTab', why: 'the context\'s is navigateTo, the guarded tab switch that asks before leaving unsaved work (§0.170)' },
};

const openStates = () => HOOKS.flatMap((f) => statesOf(read(f))).filter((s) => OPEN.test(s.name));

test('THE GUARD: every open-state is drawn, and opened — or recorded with its reason', () => {
    const states = openStates();
    assert.ok(states.length >= 25, `the open-states found (${states.length})`);
    const files = srcFiles().map((f) => [f, read(f)]);
    assert.ok(files.length > 150, `the files walked (${files.length})`);
    const { drawn, opened } = scan(files);
    const appOnly = scan(files.filter(([f]) => f === 'src/App.jsx')).opened;
    const own = new Set(contextOwn(read('src/App.jsx')));
    const isOpened = (s) => (own.has(s.setter) ? appOnly.has(s.setter) : opened.has(s.setter));
    const undrawn = states.filter((s) => !drawn.has(s.name)).map((s) => s.name);
    assert.deepEqual(undrawn, [], 'an open-state nothing draws: what opens it opens nothing — open the screen that replaced it, and retire the state');
    const unopened = states.filter((s) => !isOpened(s)).map((s) => s.name);
    assert.deepEqual(unopened.sort(), Object.keys(KNOWN).sort(), 'drawn and never opened: give it a way in, or record why (KNOWN)');
});

test('THE GUARD: App\'s context gives no hook name a meaning of its own but those recorded, and App hands none of them on raw', () => {
    const app = read('src/App.jsx');
    const hookNames = new Set(HOOKS.flatMap((f) => statesOf(read(f))).flatMap((s) => [s.name, s.setter]));
    const own = contextOwn(app).filter((n) => hookNames.has(n));
    assert.deepEqual(own.sort(), Object.keys(CONTEXT_OWN).sort(), 'the same name, two meanings: one for the context, another for App');
    for (const [setter, { state }] of Object.entries(CONTEXT_OWN)) {
        if (OPEN.test(state)) assert.ok(state in KNOWN, `${setter}: ${state} is recorded unopened`);
    }
    for (const f of ['src/App.jsx', 'src/components/layout/ModalLayer.jsx']) {
        assert.deepEqual(rawHandOffs(read(f), new Set(own)), [], `${f} hands a component the hook's setter under a name the context gives another meaning`);
    }
});

test('the guard finds the shape as it was, and counts a render guard as drawing', () => {
    const hook = 'const [showContactModal, setShowContactModal] = useOrgBoundState(resets, false); const [viewingAccount, setViewingAccount] = useOrgBoundState(resets, null); const [showPanel, setShowPanel] = useOrgBoundState(resets, false); const [mergeModal, setMergeModal] = useOrgBoundState(resets, null);';
    const tab = 'function T() { return (<button onClick={() => { setShowContactModal(true); }}>Add contact</button>); }';
    const header = 'function H({ setViewingAccount }) { return (<div onClick={() => setViewingAccount(a)} />); }';
    const panel = 'function P() { const { showPanel } = useApp(); const isOpen = !!showPanel; if (!isOpen) return null; return <aside />; }';
    const merge = 'function M() { const { mergeModal } = useApp(); if (!mergeModal || !a) return null; return <div />; }';
    const escape = 'function A() { if (showContactModal) { setShowContactModal(false); return; } const appContextValue = { showContactModal, viewingAccount }; return <Ctx.Provider value={appContextValue} />; }';
    const states = statesOf(hook);
    const { drawn, opened } = scan([['t.jsx', tab], ['h.jsx', header], ['p.jsx', panel], ['m.jsx', merge], ['a.jsx', escape]]);
    assert.deepEqual(states.filter((s) => !drawn.has(s.name)).map((s) => s.name), ['showContactModal', 'viewingAccount'], 'opened, and drawn by nothing — an Escape clearing a flag draws nothing, nor does the context object handed to the provider');
    assert.ok(drawn.has('showPanel') && drawn.has('mergeModal'), 'a render guard draws, directly or through a local');
    assert.ok(opened.has('setShowContactModal') && opened.has('setViewingAccount'));
    const app = "function App() { const appContextValue = { setViewingAccount: (a) => open(a), setViewingTask, showConfirm }; return <AppHeader setViewingAccount={setViewingAccount} />; }";
    assert.deepEqual(contextOwn(app), ['setViewingAccount']);
    assert.deepEqual(rawHandOffs(app, new Set(['setViewingAccount'])), ['setViewingAccount'], 'the raw hand-off is found');
    assert.deepEqual(rawHandOffs('<AppHeader setViewingAccount={openAccountRail} />', new Set(['setViewingAccount'])), [], 'an opener under that name is not');
    assert.deepEqual([...scan([['x.jsx', 'function X() { setFoo(false); setBar(null); setBaz(); setQux(undefined); setOn(true); setList(l => l); setMaybe?.({ a: 1 }); setNot?.(null); }']]).opened.keys()].sort(), ['setList', 'setMaybe', 'setOn'], 'false, null, nothing and undefined close; an optional call opens too');
});

// ── the two ways in, as they are now ────────────────────────────────────────

test('the Company view\'s "Add contact" opens the contact rail, as the list\'s "New contact" does', () => {
    const tab = read('src/Tabs/ContactsTab.jsx');
    assert.ok(tab.includes("    const handleAddContact  = () => { setContactRailId('new'); setContactRailMode('new'); };"), 'a new contact, in the rail');
    assert.ok(tab.includes('                            onAddContact={handleAddContact}'), 'handed to the Company view');
    const pane = tab.slice(tab.indexOf('function CompanyTwoPane({'), tab.indexOf('\nfunction ', tab.indexOf('function CompanyTwoPane({') + 10));
    assert.ok(pane.includes('    onAddContact,\n'), 'the Company view takes it');
    assert.ok(pane.includes('                                onClick={onAddContact}'), 'its "Add contact" calls it');
    assert.ok(!/setShowContactModal|setEditingContact/.test(pane), 'nothing of the modal the rail replaced');
});

test('the header\'s search results open the rails — App hands the header the context\'s openers', () => {
    const app = read('src/App.jsx');
    assert.ok(app.includes("    const openContactRail = (c) => { if (c) { setContactRailId(c.id); setContactRailMode('view'); } else { setContactRailId(null); } };"));
    assert.ok(app.includes("    const openAccountRail = (a) => { if (a) { setRailStack(a.parentAccountId ? [{ type: 'account', id: a.parentAccountId, mode: 'view' }] : []); setAccountRailId(a.id); setAccountRailMode('view'); } else { setAccountRailId(null); setRailStack([]); } };"));
    assert.ok(app.includes('        setViewingContact: openContactRail,\n        setViewingAccount: openAccountRail,'), 'the context\'s');
    assert.ok(app.includes('                setViewingAccount={openAccountRail}\n                setViewingContact={openContactRail}'), 'and the header\'s');
    const header = read('src/components/layout/AppHeader.jsx');
    assert.ok(header.includes('if (stillOrg(askedOrg)) setViewingAccount(a);') && header.includes('if (stillOrg(askedOrg)) setViewingContact(c);'), 'what the results call');
    assert.ok(/export default function AppHeader\(\{[\s\S]*?setViewingAccount, setViewingContact,[\s\S]*?\}\) \{/.test(header), 'from its props');
});

// ── D8 and D20: the copies nothing reached are deleted ──────────────────────
//
// Jeff, 11 Oct 2026. D8 ("Delete them (Recommended)"): three copies of a link nobody could
// make, each matching a record by its name — ContactModal (the contact rail replaced it; App
// imported it and drew nothing), the Outlook import (ModalLayer drew it on
// showOutlookImportModal, which nothing set — KNOWN recorded it, §0.186's found (b)), and the
// deal form's created-account branch (useAccounts reopened the deal window on
// accountCreatedFromOppForm, which nothing set, and handed it the new account's NAME, which
// OpportunityModal typed into Account). D20 ("Delete them too (Recommended)"): the Tasks tab's
// TaskViewRail, drawn on viewingTask, which nothing opened (KNOWN recorded it, §0.190's found
// (a)) — the state and the pieces only that panel used went with it; the deal window's
// NestedNewContactForm, showAccountSuggestions and the four props it took and never read
// (onSaveNewContact, onSaveNewAccount, onAddContact, onOpenNestedAccount), with ModalLayer's
// handlers that only fed them; App's handleAddSubAccount, which nothing called; and
// AccountRail's editingAccount, editingSubAccount and parentAccountForSub, taken from the
// context and never read — nothing else read them either, so the states went too. A name of
// theirs coming back fails here. The deal window's "+ New Contact" button stays (OPEN_ITEMS).
const GONE_FILES = ['src/components/modals/ContactModal.jsx', 'src/components/modals/OutlookImportModal.jsx'];
// Gone from the whole of src.
const GONE_NAMES = [
    // D8
    'ContactModal', 'NestedNewAccountForm', 'OutlookImportModal', 'showOutlookImportModal', 'setShowOutlookImportModal',
    'accountCreatedFromOppForm', 'setAccountCreatedFromOppForm', 'lastCreatedAccountName', 'setLastCreatedAccountName',
    'pendingOppFormData', 'setPendingOppFormData',
    // D20
    'TaskViewRail', 'viewingTask', 'NestedNewContactForm', 'showAccountSuggestions', 'setShowAccountSuggestions',
    'onSaveNewContact', 'onSaveNewAccount', 'onOpenNestedAccount', 'handleAddSubAccount',
    'setEditingAccount', 'setEditingSubAccount', 'setParentAccountForSub',
];
// Gone from one file: each is an ordinary name elsewhere — another tab's Avatar, the Contacts
// tab's onAddContact, the account save's own options (useAccounts' editingAccount).
const GONE_IN = {
    'src/Tabs/TasksTab.jsx': ['ContactPicker', 'ContactRowMenu', 'RailField', 'StatusPill', 'TypePill', 'STATUS_STYLES', 'Avatar', 'fmtLongDate'],
    'src/components/modals/OpportunityModal.jsx': ['onAddContact'],
    'src/components/layout/ModalLayer.jsx': ['onAddContact'],
    'src/components/rails/AccountRail.jsx': ['editingAccount', 'editingSubAccount', 'parentAccountForSub'],
};
// The names a file binds, reads or hands on — an identifier, a JSX tag or prop, the last part
// of an import's path — never a comment, a string, a member's property, or an object's key
// (the account save is still handed `editingAccount: …` as an option).
const namesIn = (src) => {
    const out = new Set();
    walk(parseJsx(src), (n, anc) => {
        const p = anc[anc.length - 1];
        if (n.type === 'Identifier' || n.type === 'JSXIdentifier') {
            if (p && /^(ObjectProperty|ObjectMethod|ClassMethod|ClassProperty)$/.test(p.type) && p.key === n && !p.computed && !p.shorthand) return;
            if (p && /^(MemberExpression|OptionalMemberExpression)$/.test(p.type) && p.property === n && !p.computed) return;
            out.add(n.name);
        }
        if (n.type === 'ImportDeclaration') out.add(n.source.value.split('/').pop().replace(/\.jsx?$/, ''));
    });
    return out;
};
const goneOf = (file) => [...GONE_NAMES, ...(GONE_IN[file] || [])];
const goneIn = (src, file = '') => [...namesIn(src)].filter((n) => goneOf(file).includes(n)).sort();

test('D8 and D20: the copies nothing reached are deleted, and nothing under src names them', () => {
    for (const f of GONE_FILES) assert.ok(!existsSync(new URL(f, ROOT)), `${f} is deleted`);
    const files = srcFiles();
    assert.ok(files.length > 150, `the files walked (${files.length})`);
    for (const f of Object.keys(GONE_IN)) assert.ok(files.includes(f), `${f} is walked`);
    const hits = files.map((f) => [f, read(f)])
        .filter(([f, src]) => goneOf(f).some((n) => src.includes(n)))   // only a file that mentions one is parsed
        .flatMap(([f, src]) => goneIn(src, f).map((n) => `${f}: ${n}`));
    assert.deepEqual(hits, [], 'a name of a deleted copy is back: a contact opens in the contact rail, a task in the task rail, and a record is linked by the id picked (D1)');
});

test('the guard finds the names as they were — an import, a destructure, a prop, a render — and none in a comment, a string, a key or inside another name', () => {
    const was = `import ContactModal, { NestedNewContactForm, NestedNewAccountForm } from './components/modals/ContactModal';
function A() { const { accountCreatedFromOppForm } = useApp(); return <>{showOutlookImportModal && <OutlookImportModal />}</>; }`;
    assert.deepEqual(goneIn(was), ['ContactModal', 'NestedNewAccountForm', 'NestedNewContactForm', 'OutlookImportModal', 'accountCreatedFromOppForm', 'showOutlookImportModal']);
    const deal = `function O({ onClose, onSaveNewAccount, onAddContact }) { const [showAccountSuggestions, setShowAccountSuggestions] = useState(false);
    return <M onSaveNewContact={(d) => d} onOpenNestedAccount={f} />; }`;
    assert.deepEqual(goneIn(deal, 'src/components/modals/OpportunityModal.jsx'), ['onAddContact', 'onOpenNestedAccount', 'onSaveNewAccount', 'onSaveNewContact', 'setShowAccountSuggestions', 'showAccountSuggestions']);
    assert.deepEqual(goneIn(deal, 'src/Tabs/ContactsTab.jsx'), ['onOpenNestedAccount', 'onSaveNewAccount', 'onSaveNewContact', 'setShowAccountSuggestions', 'showAccountSuggestions'], "the Contacts tab's onAddContact is its own");
    const tab = 'function T() { const { viewingTask } = useApp(); return <div>{viewingTask && <TaskViewRail task={viewingTask} />}<Avatar name="x" /></div>; }';
    assert.deepEqual(goneIn(tab, 'src/Tabs/TasksTab.jsx'), ['Avatar', 'TaskViewRail', 'viewingTask']);
    assert.deepEqual(goneIn(tab, 'src/components/modals/OpportunityModal.jsx'), ['TaskViewRail', 'viewingTask'], "another file's Avatar is its own");
    const rail = 'function R() { const { editingAccount, setEditingAccount } = useApp(); handleSaveAccount(d, { editingAccount: null, parentAccountForSub: p }); return x.editingSubAccount; }';
    assert.deepEqual(goneIn(rail, 'src/components/rails/AccountRail.jsx'), ['editingAccount', 'setEditingAccount'], 'an option handed by its key, or a property read, is not the context value');
    assert.deepEqual(goneIn('function R() { handleSaveAccount(d, { editingAccount: isNew ? null : account, editingSubAccount: null }); }', 'src/components/rails/AccountRail.jsx'), []);
    assert.deepEqual(goneIn('// ContactModal replaced by ContactRail\nconst x = <div>{/* OutlookImportModal */}</div>;\nconst s = "viewingTask";'), [], 'a comment or a string names nothing');
    assert.deepEqual(goneIn("import ContactRail from '../rails/ContactRail';\nconst setShowContactModal = () => {};\nconst viewingTasks = [];"), [], 'a name that holds one is another name');
});
