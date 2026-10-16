// tests/task-links.test.mjs
//
// A pick is saved as the record picked — New Task / Edit Task: its Account, its Opportunity
// and its contacts (state §0.198; Jeff, 11 Oct: D1 "One match saves, two refuse", D6 "No
// Create on tasks", D9 "Account · stage", D10 "Yes, fill it in", D12 "Yes, hide them", D16
// "Say so, allow removing").
//
// Before: the task rail held only the TEXT of Account and Opportunity and its Save took the
// first record of that exact text. UKG has two "Shell - Port Allen" under Shell, a business
// unit and a site, and the accounts GET orders by name only: picking the site could save the
// unit, a title-only edit moved a task off the later twin, a cleared field kept its old link,
// a name no record has was dropped without a word, and removing every contact kept the old
// contact, which came back as the Primary chip.
//
// Here: src/utils/taskLinks.js, run on the twins in both list orders — what the rail opens
// with, holds and saves — and the screens that ask it, pinned.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NO_TASK_SEED, contactLabel, contactChip, primaryContactId, taskSeed, taskLinks, chipLabel, UNLISTED_CONTACT } from '../src/utils/taskLinks.js';
import { HIDDEN_ACCOUNT, HIDDEN_DEAL, dealText, dealSubline } from '../src/utils/pickLink.js';
import { outOfList } from '../src/utils/railLinks.js';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8').replace(/\r\n/g, '\n');
const between = (src, from, to) => {
    const a = src.indexOf(from);
    assert.ok(a >= 0, `missing: ${from}`);
    const b = src.indexOf(to, a + from.length);
    assert.ok(b > a, `missing after it: ${to}`);
    return src.slice(a, b);
};

// ── UKG's two "Shell - Port Allen" under Shell: a business unit and a site ──────────
const SPA = 'Shell - Port Allen';
const shell = { id: 'k', name: 'Shell', accountTier: 'account', parentAccountId: null };
const unit = { id: 'u', name: SPA, accountTier: 'business_unit', parentAccountId: 'k' };
const site = { id: 's', name: SPA, accountTier: 'site', parentAccountId: 'k' };
const acetyls = { id: 'i', name: 'INEOS Acetyls', accountTier: 'business_unit', parentAccountId: null };
const BOTH = [[shell, unit, site, acetyls], [shell, site, unit, acetyls]];   // the GET orders by name only: either twin first
const REP = [shell, unit, acetyls];                                         // a rep's list: the site is another rep's
// A merge's twin: the one merged away keeps its row (mergeArchived), the survivor is live.
const gone = { id: 'x', name: 'Evonik - Lafayette', accountTier: 'site', parentAccountId: 'e', mergeArchived: true, mergedIntoId: 'y' };
const live = { id: 'y', name: 'Evonik - Lafayette', accountTier: 'site', parentAccountId: 'e' };
const MERGED = [[gone, live], [live, gone]];
// Two deals of one name, one on each twin; one named by its account only.
const onUnit = { id: 'd1', opportunityName: 'Turnaround 2027', account: SPA, accountId: 'u', stage: 'Proposal' };
const onSite = { id: 'd2', opportunityName: 'Turnaround 2027', account: SPA, accountId: 's', stage: 'Discovery' };
const byAccount = { id: 'd3', opportunityName: null, account: 'INEOS Acetyls', accountId: 'i', stage: 'Qualified' };
const DEALS = [[onUnit, onSite, byAccount], [onSite, onUnit, byAccount]];
// Contacts: two of one name, one other, one with no name, one merged away.
const pat1 = { id: 'c1', firstName: 'Pat', lastName: 'Smith', title: 'Plant Manager', company: SPA };
const pat2 = { id: 'c2', firstName: 'Pat', lastName: 'Smith', title: 'Buyer', company: 'Shell' };
const lee = { id: 'c3', firstName: 'Lee', lastName: 'Ng', title: 'EHS Lead' };
const nameless = { id: 'c4', firstName: null, lastName: null };
const oldCopy = { id: 'c5', firstName: 'Old', lastName: 'Copy', mergeArchived: true };
const CONTACTS = [pat1, pat2, lee, nameless, oldCopy];

const MANY_ACCOUNTS = `More than one account is named “${SPA}”. Pick the one you mean from the list — each row names its parent.`;
const MANY_DEALS = 'More than one deal is named “Turnaround 2027”. Pick the one you mean from the list — each row names its account and stage.';
const MANY_CONTACTS = 'More than one contact is named “Pat Smith”. Pick the one you mean from the list — each row names its title and company.';
const noAccount = (x) => `“${x}” isn't a saved account. Pick one from the list.`;   // no Create: a task offers none (D6)
const noDeal = (x) => `“${x}” isn't a saved deal. Pick one from the list.`;
const noContact = (x) => `“${x}” isn't a saved contact. Pick one from the list.`;

// The rail as it opens on a task (or a new task's prefill), then saved with the fields as given.
const open = (src, { editing = true, accounts = BOTH[0], opportunities = DEALS[0], contacts = CONTACTS } = {}) =>
    taskSeed(src, { editing, accounts, opportunities, contacts });
// What a Save links, without the flags that say which fields nobody touched — those are
// compared on their own (the pre-ship round's tests, below; `flags` reads them).
const linksOf = (r) => { if (!r || r.error) return r; const { untouched, ...links } = r; return links; };
const flags = (opened, over = {}, { accounts = BOTH[0], opportunities = DEALS[0], contacts = CONTACTS } = {}) =>
    taskLinks({ account: opened.account, deal: opened.deal, seed: opened.seed, contactText: '', chips: opened.chips, accounts, opportunities, contacts, ...over }).untouched;
const save = (opened, over = {}, { accounts = BOTH[0], opportunities = DEALS[0], contacts = CONTACTS } = {}) =>
    linksOf(taskLinks({ account: opened.account, deal: opened.deal, seed: opened.seed, contactText: '', chips: opened.chips, accounts, opportunities, contacts, ...over }));
const order = (list) => list.map((r) => r.id).join(' ');

// ── taskLinks.js — run ──────────────────────────────────────────────────────

test('the rail opens with each link as stored: named by its record, held by its id — in either order of the twins', () => {
    for (const accounts of BOTH) {
        for (const twin of [unit, site]) {
            const o = open({ accountId: twin.id, opportunityId: 'd2' }, { accounts });
            assert.deepEqual(o.account, { text: SPA, id: twin.id }, `the ${twin.accountTier} (${order(accounts)})`);
            assert.deepEqual(o.seed.account, o.account, 'the seed is the field as it opened');
            assert.deepEqual(o.deal, { text: 'Turnaround 2027', id: 'd2' });
            assert.deepEqual(o.seed.deal, o.deal);
        }
    }
    assert.deepEqual(open({}), { seed: { ...NO_TASK_SEED, chips: [] }, account: { text: '', id: '' }, deal: { text: '', id: '' }, chips: [] }, 'a task with no links');
    assert.deepEqual(open(null).seed, { ...NO_TASK_SEED, chips: [] });
    assert.deepEqual(open({ opportunityId: 'd3' }).deal, { text: 'INEOS Acetyls', id: 'd3' }, 'a deal with no name is named by its account (dealText)');
});

test('untouched: a title-only edit keeps each link exactly — either twin, either deal of one name, in either order', () => {
    for (const accounts of BOTH) {
        for (const opportunities of DEALS) {
            for (const [twin, d] of [[unit, onUnit], [site, onSite], [site, onUnit]]) {
                const o = open({ accountId: twin.id, opportunityId: d.id }, { accounts, opportunities });
                const r = save(o, {}, { accounts, opportunities });
                assert.equal(r.error, undefined);
                assert.equal(r.accountId, twin.id, `the ${twin.accountTier} stays (${order(accounts)})`);
                assert.equal(r.opportunityId, d.id, `the ${d.stage} deal stays (${order(opportunities)})`);
            }
        }
    }
});

test('a pick saves the row picked — the unit or the site, either deal; a pick re-spelled by case or spacing is still the pick', () => {
    for (const accounts of BOTH) {
        for (const twin of [unit, site]) {
            assert.equal(save(open({}, { editing: false, accounts }), { account: { text: SPA, id: twin.id } }, { accounts }).accountId, twin.id, `a new task (${order(accounts)})`);
            assert.equal(save(open({ accountId: 'i' }, { accounts }), { account: { text: SPA, id: twin.id } }, { accounts }).accountId, twin.id, `an edit, picked over another account (${order(accounts)})`);
        }
        const other = save(open({ accountId: 'u' }, { accounts }), { account: { text: SPA, id: 's' } }, { accounts });
        assert.equal(other.accountId, 's', 'the other twin picked over the stored one');
    }
    for (const opportunities of DEALS) {
        assert.equal(save(open({ opportunityId: 'd1' }, { opportunities }), { deal: { text: 'Turnaround 2027', id: 'd2' } }, { opportunities }).opportunityId, 'd2');
    }
    assert.equal(save(open({}), { account: { text: 'shell  PORT allen', id: 's' } }).accountId, 's', 'case and spacing');
});

test('a name typed and not picked: two records refuse with the exact words — never the first — and a pick typed over is asked again', () => {
    for (const accounts of BOTH) {
        assert.deepEqual(save(open({}, { editing: false, accounts }), { account: { text: SPA, id: '' } }, { accounts }), { error: MANY_ACCOUNTS }, `nothing saved (${order(accounts)})`);
        assert.deepEqual(save(open({ accountId: 'i' }, { accounts }), { account: { text: SPA, id: 'i' } }, { accounts }), { error: MANY_ACCOUNTS }, 'INEOS Acetyls held, the twins typed over it');
    }
    for (const opportunities of DEALS) {
        assert.deepEqual(save(open({}, { opportunities }), { deal: { text: 'Turnaround 2027', id: '' } }, { opportunities }), { error: MANY_DEALS });
    }
});

test('exactly one record of the name typed saves as itself, read as searchKey reads it (D1)', () => {
    assert.equal(save(open({}), { account: { text: 'Ineos - Acetyls', id: '' } }).accountId, 'i', '"Ineos - Acetyls" is INEOS Acetyls');
    assert.equal(save(open({}), { account: { text: 'shell', id: '' } }).accountId, 'k', 'the parent itself, not its units');
    assert.equal(save(open({}), { deal: { text: 'ineos acetyls', id: '' } }).opportunityId, 'd3', 'a deal named by its account');
});

test('a name no record has is refused — the task offers no Create (D6); only punctuation is typed, not empty', () => {
    assert.deepEqual(save(open({}), { account: { text: '  Chevron Pascagoula ', id: '' } }), { error: noAccount('Chevron Pascagoula') });
    assert.deepEqual(save(open({}), { account: { text: '-', id: '' } }), { error: noAccount('-') });
    assert.deepEqual(save(open({}), { deal: { text: 'No Such Deal', id: '' } }), { error: noDeal('No Such Deal') });
});

test('cleared: an emptied field saves no link — the stored one is not kept', () => {
    const o = open({ accountId: 's', opportunityId: 'd2' });
    const r = save(o, { account: { text: '', id: 's' }, deal: { text: '   ', id: 'd2' } });
    assert.deepEqual([r.accountId, r.opportunityId], ['', ''], 'the field shows nothing, so nothing is saved');
});

test("D16: a link outside the caller's list opens with no name, held by id; untouched it is kept, and its × removes it", () => {
    const opportunities = [onUnit, byAccount];   // a rep's deals: the site's deal is another rep's
    const o = open({ accountId: 's', opportunityId: 'd2' }, { accounts: REP, opportunities });
    assert.deepEqual(o.account, { text: '', id: 's' }, 'no name the field could show');
    assert.deepEqual(o.deal, { text: '', id: 'd2' });
    assert.ok(outOfList(o.account.id, REP) && outOfList(o.deal.id, opportunities), 'the rail shows "An account you can\'t open" / "A deal you can\'t open"');
    assert.deepEqual([HIDDEN_ACCOUNT, HIDDEN_DEAL], ["An account you can't open", "A deal you can't open"]);
    const kept = save(o, {}, { accounts: REP, opportunities });
    assert.deepEqual([kept.accountId, kept.opportunityId], ['s', 'd2'], 'untouched: kept exactly');
    const removed = save(o, { account: { text: '', id: '' }, deal: { text: '', id: '' } }, { accounts: REP, opportunities });
    assert.deepEqual([removed.accountId, removed.opportunityId], ['', ''], 'the × (the held id cleared): the link removed');
    const repicked = save(o, { account: { text: 'INEOS Acetyls', id: 'i' } }, { accounts: REP, opportunities });
    assert.equal(repicked.accountId, 'i', 'removed, then another account picked');
    assert.equal(repicked.opportunityId, 'd2', 'the other field untouched');
});

test('D12: a typed name never lands on the account merged away; a task already on it keeps it; a new task from its rail opens on the account it was merged into, by id (F4)', () => {
    for (const accounts of MERGED) {
        assert.equal(save(open({}, { accounts }), { account: { text: 'Evonik - Lafayette', id: '' } }, { accounts }).accountId, 'y', `the live one (${order(accounts)})`);
        assert.equal(save(open({ accountId: 'x' }, { accounts }), {}, { accounts }).accountId, 'x', 'an edit: the link it has, untouched');
        const fresh = open({ accountId: 'x' }, { editing: false, accounts });
        assert.deepEqual([fresh.account, fresh.seed.account], [{ text: 'Evonik - Lafayette', id: 'y' }, { text: 'Evonik - Lafayette', id: 'y' }], 'a new task: the one it was merged into, by id');
        assert.equal(save(fresh, {}, { accounts }).accountId, 'y', 'saved as it, untouched');
    }
    const shellOil = { id: 'so', name: 'Shell Oil Co', accountTier: 'account', parentAccountId: null, mergeArchived: true, mergedIntoId: 'k' };
    const fromOil = open({ accountId: 'so' }, { editing: false, accounts: [...BOTH[1], shellOil] });
    assert.deepEqual(fromOil.account, { text: 'Shell', id: 'k' }, 'a survivor of another name: named as itself — never the merged-away name');
    assert.equal(save(fromOil, {}, { accounts: [...BOTH[1], shellOil] }).accountId, 'k', 'an untouched Save links it (it was refused)');
    const outOfList = open({ accountId: 'so' }, { editing: false, accounts: [unit, site, shellOil] });
    assert.deepEqual([outOfList.account, outOfList.seed.account], [{ text: '', id: '' }, { text: '', id: '' }], 'the one it was merged into out of the list: nothing — a task holds no account name of its own');
    assert.deepEqual(save(open({}, { accounts: [...BOTH[0], shellOil] }), { account: { text: 'shell oil co', id: '' } }, { accounts: [...BOTH[0], shellOil] }), { error: '“shell oil co” was merged into “Shell” — pick “Shell”.' }, 'its name typed: refused, naming the account it was merged into (F9)');
});

test("D10: a new task from an account's own rail opens with that account picked, by id — the twin, never the first of its name", () => {
    for (const accounts of BOTH) {
        for (const twin of [unit, site]) {
            const o = open({ accountId: twin.id }, { editing: false, accounts });
            assert.deepEqual(o.account, { text: SPA, id: twin.id });
            assert.equal(save(o, {}, { accounts }).accountId, twin.id, `untouched (${order(accounts)})`);
        }
    }
});

test('the contact follows the chips: the Primary one, else the first; every chip removed is no contact', () => {
    assert.equal(primaryContactId([]), '');
    assert.equal(primaryContactId(null), '');
    assert.equal(primaryContactId([contactChip(lee, false), contactChip(pat1, true)]), 'c1');
    assert.equal(primaryContactId([contactChip(lee, false), contactChip(pat1, false)]), 'c3');
    const o = open({ contacts: [contactChip(pat1, true), contactChip(lee, false)], contactId: 'c1' });
    assert.deepEqual(o.chips.map((c) => c.id), ['c1', 'c3'], 'the chips as stored');
    assert.deepEqual(save(o, { chips: [] }), { accountId: '', opportunityId: '', contacts: [], contactId: '' }, 'every chip removed: no contact — the old contactId is not kept');
    const second = save(o, { chips: [{ ...contactChip(lee, false), primary: true }] });
    assert.deepEqual([second.contacts.map((c) => c.id), second.contactId], [['c3'], 'c3'], 'the first removed, the one left is the contact');
});

test("a task from before chips: its one contact opens as the Primary chip — unnamed when the caller's list does not hold it — and an untouched Save keeps it", () => {
    assert.deepEqual(open({ contactId: 'c3' }).chips, [{ id: 'c3', name: 'Lee Ng', title: 'EHS Lead', primary: true }]);
    const unlisted = open({ contactId: 'c9' });
    assert.deepEqual(unlisted.chips, [{ id: 'c9', name: '', title: '', primary: true }], 'the rail names it "Contact not in your list"');
    assert.equal(save(unlisted).contactId, 'c9', 'untouched: kept');
    assert.equal(save(unlisted, { chips: [] }).contactId, '', 'its × removes it');
    assert.deepEqual(open({ contactId: 'c3' }, { editing: false }).chips, [contactChip(lee, true)], "D19: a new task from a contact's rail opens with the contact");
});

test('a contact typed and not picked: one is added once — Primary only when alone — two or none refuse, the empty box matches no one, and one merged away is never typed (D12)', () => {
    assert.equal(contactLabel(nameless), '');
    assert.equal(contactLabel({ firstName: 'Lee' }), 'Lee');
    const added = save(open({}), { contactText: 'lee  NG', chips: [contactChip(pat1, true)] });
    assert.deepEqual(added.contacts.map((c) => [c.id, c.primary]), [['c1', true], ['c3', false]], 'added after the chips, not Primary');
    assert.equal(added.contactId, 'c1');
    const alone = save(open({}), { contactText: 'Lee Ng' });
    assert.deepEqual(alone.contacts, [contactChip(lee, true)], 'the only contact: Primary');
    assert.equal(alone.contactId, 'c3');
    assert.deepEqual(save(open({}), { contactText: 'Lee Ng', chips: [contactChip(lee, true)] }).contacts, [contactChip(lee, true)], 'a contact already chosen is not added twice');
    assert.deepEqual(save(open({}), { contactText: 'Pat Smith' }), { error: MANY_CONTACTS });
    assert.deepEqual(save(open({}), { contactText: 'Old Copy' }), { error: '“Old Copy” was merged into another contact.' }, 'merged away: not a typed match — and said so (F9)');
    assert.deepEqual(save(open({}), { contactText: 'Old Copy' }, { contacts: [...CONTACTS.slice(0, 4), { ...oldCopy, mergedIntoId: 'c3' }] }), { error: '“Old Copy” was merged into “Lee Ng” — pick “Lee Ng”.' }, 'the contact it was merged into, named');
    assert.deepEqual(save(open({}), { contactText: 'Nobody Here' }), { error: noContact('Nobody Here') });
    for (const blank of ['', '   ']) {
        const r = save(open({}), { contactText: blank });
        assert.deepEqual([r.contacts, r.contactId], [[], ''], `"${blank}" matches no one — not the contact with no name`);
    }
});

test('the first refusal is the field drawn first: Opportunity, then the contact box, then Account', () => {
    const bad = { account: { text: 'Nope Co', id: '' }, deal: { text: 'No Such Deal', id: '' }, contactText: 'Nobody Here' };
    assert.deepEqual(save(open({}), bad), { error: noDeal('No Such Deal') });
    assert.deepEqual(save(open({}), { ...bad, deal: { text: '', id: '' } }), { error: noContact('Nobody Here') });
    assert.deepEqual(save(open({}), { ...bad, deal: { text: '', id: '' }, contactText: '' }), { error: noAccount('Nope Co') });
});

test("D9: each deal row reads its name, and under it '<account> · <stage>'", () => {
    assert.deepEqual([onUnit, onSite].map((d) => [dealText(d), dealSubline(d)]),
        [['Turnaround 2027', 'Shell - Port Allen · Proposal'], ['Turnaround 2027', 'Shell - Port Allen · Discovery']]);
});

// ── the screens — pinned ────────────────────────────────────────────────────

test('the task rail: the seed taken once, each link field held by its id, and the Save through taskLinks', () => {
    const r = read('src/components/rails/TaskRail.jsx');
    assert.ok(r.includes("import { NO_TASK_SEED, taskSeed, taskLinks, contactChip, chipLabel } from '../../utils/taskLinks.js';"));
    assert.ok(r.includes('    const seedRef = useRef(NO_TASK_SEED);'));
    const seeding = between(r, '        const src = isNew ?', '    }, [taskRailId, taskRailMode]);');
    assert.ok(seeding.includes('        const opened = taskSeed(src, { editing: !isNew, accounts, opportunities, contacts });\n        seedRef.current = opened.seed;\n'), 'taken once, when the rail opens');
    for (const line of ['setOppSearch(opened.deal.text);', 'setOppHeldId(opened.deal.id);', 'setSelectedContacts(opened.chips);', 'setAccountSearch(opened.account.text);', 'setAccountHeldId(opened.account.id);']) {
        assert.ok(seeding.includes(`        ${line}\n`), line);
    }
    assert.ok(r.includes('const src = isNew ? { ...EMPTY_TASK, ...(editingTask || {}) } : { ...EMPTY_TASK, ...(task || {}) };'), "a new task opens from editingTask (an account's or a contact's rail)");
    const saving = between(r, 'const handleSave = async () => {', 'const editingTaskForSave');
    assert.ok(saving.includes([
        '        const links = taskLinks({',
        '            account: { text: accountSearch, id: accountHeldId },',
        '            deal:    { text: oppSearch,     id: oppHeldId },',
        '            seed: seedRef.current, contactText: contactSearch, chips: selectedContacts,',
        '            accounts, opportunities, contacts,',
        '        });',
        '        if (links.error) { refuse(links.error); return; }',
    ].join('\n')), 'a refusal saves nothing and says why, scrolled into view (F10)');
    assert.ok(saving.includes("if (!formData.title?.trim()) { refuse('Task title is required.'); return; }"));
    assert.equal(r.split('setSaveError(links.error)').length - 1, 0, 'no refusal set without the scroll');
    // F10: the banner sits at the top of the body and Account is the last field: each refusal scrolls it into view
    assert.ok(r.includes('    const errorRef = useRef(null);\n    const [refusals, setRefusals] = useState(0);\n    const refuse = (why) => { setSaveError(why); setRefusals(n => n + 1); };\n'));
    assert.ok(r.includes("    useEffect(() => {\n        if (refusals || taskModalError) errorRef.current?.scrollIntoView?.({ block: 'nearest' });\n    }, [refusals, taskModalError]);\n"), "each refusal — the same words twice too — and the server's");
    assert.ok(r.indexOf('}, [refusals, taskModalError]);') < r.indexOf('if (!isOpen) return null;'), 'a hook, before the rail returns early');
    assert.ok(r.includes('{(taskModalError || saveError) && (\n                    <div ref={errorRef} style={{ background:'), 'the banner is what is scrolled to');
    // F10 (checked): the deal list already shut on blur, and its rows and count hold the focus
    const ta = between(r, 'function Typeahead(', '\n}\n');
    assert.ok(ta.includes('onFocus={() => setOpen(true)}\n                onBlur={() => setTimeout(() => setOpen(false), 200)}'), 'the same 200 ms as the account picker');
    assert.ok(ta.includes('onMouseDown={e => e.preventDefault()}\n                            onClick={() => { onSelect(s); setOpen(false); }}'), 'a press on a row keeps the focus, so the click lands');
    assert.ok(ta.includes("{more > 0 && <div onMouseDown={e => e.preventDefault()} style={{ position: 'sticky'"));
    const lines = saving.split('\n');
    for (const line of ['            opportunityId: links.opportunityId,', '            contacts:      links.contacts,', '            contactId:     links.contactId,', '            accountId:     links.accountId,']) {
        assert.ok(lines.includes(line), `as taskLinks decides, with no fallback to the stored link: ${line.trim()}`);
    }
    assert.ok(!/\.find\([^\n]*===\s*(accountSearch|oppSearch|contactSearch)\b/.test(r), 'no link is the first record of a name');
    assert.ok(!/\b(oppNames|accountNames|contactNames)\b/.test(r), 'no list of names to pick from');
});

test("the task rail's fields: Account is the shared picker with no Create (D6); deal rows (D9); D16 for both; D12; typing is an unsaved change", () => {
    const r = read('src/components/rails/TaskRail.jsx');
    assert.ok(r.includes("import AccountPicker from './AccountPicker';") && r.includes("import HiddenLink from './HiddenLink';"));
    assert.ok(r.includes([
        '                            <FieldGroup label="Account" wide>',
        '                                {/* The shared account picker (D6: "No Create on tasks"): a unit\'s and a site\'s row',
    ].join('\n')), 'wide, so the parent label fits');
    assert.ok(r.includes([
        '                                {outOfList(accountHeldId, accounts)',
        "                                    ? <HiddenLink hidden={HIDDEN_ACCOUNT} title=\"Remove the account\" onRemove={() => { setAccountHeldId(''); setDirty(true); }} />",
        '                                    : <AccountPicker value={accountSearch} onChange={v => { setAccountSearch(v); setDirty(true); }} onSelectAccount={a => setAccountHeldId(a.id)} allowCreate={false} dropUp placeholder="Search accounts…" />}',
    ].join('\n')), "Account: a link the user can't open said so, with an ×; else the picker, the row picked held, no Create, opening upward");
    assert.ok(r.includes([
        '                                {outOfList(oppHeldId, opportunities)',
        "                                    ? <HiddenLink hidden={HIDDEN_DEAL} title=\"Remove the deal\" onRemove={() => { setOppHeldId(''); setDirty(true); }} />",
        '                                    : <Typeahead value={oppSearch} onChange={v => { setOppSearch(v); setDirty(true); }} suggestions={dealOptions} textOf={dealText} lineOf={dealSubline} onSelect={o => { setOppSearch(dealText(o)); setOppHeldId(o.id); setDirty(true); }} placeholder="Search opportunities…" />}',
    ].join('\n')), 'Opportunity: the deals as rows, the row picked held, account · stage under each');
    assert.ok(r.includes('    const dealOptions = (opportunities || []).filter(o => !!dealText(o));'));
    const ta = between(r, 'function Typeahead(', '\n}\n');
    assert.ok(ta.includes('function Typeahead({ value, onChange, suggestions, onSelect, placeholder, dropUp, textOf = (s) => s, lineOf = null }) {'));
    assert.ok(ta.includes('<div key={s?.id || i}'));
    assert.ok(ta.includes('>{textOf(s)}{lineOf && lineOf(s) ? <div style={{ fontSize: 11, color: T.inkMuted, marginTop: 1 }}>{lineOf(s)}</div> : null}</div>'), 'each row: its name, and its grey line');
    assert.ok(r.includes('<span>{chipLabel(c, contacts)}</span>') && !r.includes('UNLISTED_CONTACT'), "a chip the caller's list does not hold says so — and only such a chip (chipLabel)");
    assert.ok(r.includes('onChange={e => { setContactSearch(e.target.value); setShowContactSugg(true); setDirty(true); }}'), 'contact text typed is an unsaved change');
    assert.ok(r.includes('.filter(c => !alreadyIds.has(c.id) && !isMergeArchived(c)), contactSearch,'), 'no contact merged away offered (D12)');
    assert.ok(r.includes('const newEntry = contactChip(c, selectedContacts.length === 0);'), 'a contact picked: the one chip shape');
});

test("the task rail's view: a link the caller's list does not hold is said so (D16)", () => {
    const r = read('src/components/rails/TaskRail.jsx');
    assert.ok(r.includes('    const dealHidden    = outOfList(task?.opportunityId, opportunities);\n    const accountHidden = outOfList(task?.accountId, accounts);'));
    assert.ok(r.includes('{(relOpp || relContact || relAccount || dealHidden || accountHidden) && ('));
    assert.ok(r.includes('{dealHidden && <ReadRow label="Opportunity" value={<span style={{ color: T.inkMuted }}>{HIDDEN_DEAL}</span>} wide />}'));
    assert.ok(r.includes('{accountHidden && <ReadRow label="Account" value={<span style={{ color: T.inkMuted }}>{HIDDEN_ACCOUNT}</span>} />}'));
});

test("Complete with notes logs the activity on the task's account, by id — not by a name the activities endpoint drops", () => {
    const r = read('src/components/rails/TaskRail.jsx');
    const done = between(r, 'const activityData = {', '};');
    assert.ok(done.includes("                accountId:     task.accountId     || '',"));
    assert.ok(!/\bcompany\s*:/.test(done), 'no company name');
    const kept = between(read('netlify/functions/activities.mjs'), 'const sanitize = (d) => {', '    };');
    assert.ok(kept.includes('accountId:     d.accountId     || null,') && !/company/i.test(kept), 'the endpoint stores the account by id and keeps no company name');
});

test("an account's own rail: + Add Task opens New Task with that account picked, by id (D10)", () => {
    const a = read('src/components/rails/AccountRail.jsx');
    assert.ok(between(a, 'export default function AccountRail', '} = useApp();').includes('setTaskRailMode, setEditingTask,'));
    assert.ok(a.includes("onClick={() => { setEditingTask && setEditingTask({ accountId: account?.id || '' }); setTaskRailId('new'); setTaskRailMode('new'); }}"));
});

test('taskLinks.js is pure: it imports only pickLink.js', () => {
    const src = read('src/utils/taskLinks.js');
    assert.deepEqual([...src.matchAll(/^import .* from '(.+)';$/gm)].map((m) => m[1]), ['./pickLink.js']);
    assert.ok(!/\b(React|window|document|localStorage|fetch)\b/.test(src.replace(/\/\/.*$/gm, '')), 'no React, no DOM, no network');
});

test('the suites: this file is graded by the harness', () => {
    // The SUITES value itself, never the whole harness: a comment there naming this file met the old pin (§0.204 review P1).
    const suites = read('scripts/mutate-import.mjs').match(/^const SUITES = '([^'\n]*)';$/m)?.[1].split(' ') ?? [];
    assert.ok(suites.includes('tests/task-links.test.mjs'), 'SUITES runs this file');
});

// ── the pre-ship round (12 Oct): the chips as they opened are left out, and named ──────

test("REGRESSION (the pre-ship audit): a task from before chips, its contact outside the caller's list — the chips as they opened are said untouched, so an edit leaves the contacts out and no chip without a name is stored", () => {
    const unlisted = open({ contactId: 'c9' });
    assert.deepEqual(unlisted.seed.chips, [{ id: 'c9', name: '', title: '', primary: true }], 'the chips as they opened, in the seed');
    assert.deepEqual(flags(unlisted), { account: true, deal: true, contacts: true }, 'a title-only edit: every link left out — contacts null stays null, contactId c9 stays');
    assert.equal(flags(unlisted, { chips: [] }).contacts, false, 'its × removes it: sent');
    const two = open({ contacts: [contactChip(pat1, true), contactChip(lee, false)], contactId: 'c1' });
    assert.equal(flags(two).contacts, true);
    assert.equal(flags(two, { chips: [contactChip(lee, false), contactChip(pat1, true)] }).contacts, false, 'reordered: sent');
    assert.equal(flags(two, { chips: [contactChip(pat1, false), contactChip(lee, true)] }).contacts, false, 'the Primary moved: sent');
    assert.equal(flags(open({ contacts: [contactChip(pat1, true)], contactId: 'c1' }), { contactText: 'Lee Ng' }).contacts, false, 'a contact typed to be added: sent');
    assert.equal(flags(two, { contactText: 'Lee Ng' }).contacts, true, 'a contact typed that is already a chip adds nothing');
    assert.deepEqual(flags(open({ accountId: 'u', opportunityId: 'd1' }), { account: { text: SPA, id: 's' } }), { account: false, deal: true, contacts: true }, 'the other twin picked: the Account is sent');
    assert.deepEqual(flags(open({}, { editing: false })), { account: true, deal: true, contacts: true }, 'a new task is untouched too — the rail leaves nothing out of a new one');
});

test("a stored chip with no name is named from the caller's list; a chip reads its name, the listed contact's email or 'Unknown contact', and 'Contact not in your list' only when the list does not hold it", () => {
    const o = open({ contacts: [{ id: 'c3', name: '', title: '', primary: true }], contactId: 'c3' });
    assert.deepEqual(o.chips, [{ id: 'c3', name: 'Lee Ng', title: '', primary: true }], 'named from the list: the chip an earlier Save stored without one');
    assert.deepEqual(o.seed.chips, [{ id: 'c3', name: 'Lee Ng', title: '', primary: true }], 'the seed holds them as named');
    assert.deepEqual(open({ contacts: [{ id: 'c9', name: '', title: '', primary: true }], contactId: 'c9' }).chips, [{ id: 'c9', name: '', title: '', primary: true }], 'not in the list: as stored');
    assert.deepEqual(open({ contacts: [{ id: 'c3', name: 'Lee N.', title: 'EHS', primary: true }] }).chips[0].name, 'Lee N.', 'a chip with a name keeps it');
    assert.equal(chipLabel({ id: 'c3', name: 'Lee Ng' }, CONTACTS), 'Lee Ng');
    assert.equal(chipLabel({ id: 'c9', name: '' }, CONTACTS), UNLISTED_CONTACT);
    assert.equal(UNLISTED_CONTACT, 'Contact not in your list');
    const mail = { id: 'm1', firstName: '', lastName: '', email: 'ops@acme.test' };
    assert.equal(chipLabel({ id: 'm1', name: '' }, [...CONTACTS, mail]), 'ops@acme.test', 'a listed contact with no name: its email — it read as not listed');
    assert.equal(chipLabel({ id: 'm2', name: '' }, [...CONTACTS, { id: 'm2' }]), 'Unknown contact', "no name, no email: the activity rail's words");
    assert.equal(chipLabel(null, CONTACTS), UNLISTED_CONTACT);
});

test('the flags say touched for every field the user changed — held, typed, emptied, removed — so a change is never left out (the fix review)', () => {
    const o = open({ accountId: 'u', opportunityId: 'd1', contacts: [contactChip(lee, true)], contactId: 'c3' });
    assert.deepEqual(flags(o), { account: true, deal: true, contacts: true });
    assert.equal(flags(o, { deal: { text: dealText(onSite), id: 'd2' } }).deal, false, 'the other deal picked');
    assert.equal(flags(o, { deal: { text: 'ineos acetyls', id: '' } }).deal, false, 'a deal typed');
    assert.equal(flags(o, { deal: { text: '', id: '' } }).deal, false, 'the deal emptied');
    assert.equal(flags(o, { account: { text: '', id: '' } }).account, false, 'the Account emptied');
    assert.equal(flags(o, { account: { text: 'INEOS Acetyls', id: '' } }).account, false, 'an Account typed');
    assert.equal(flags(o, { account: { text: SPA, id: 's' } }).account, false, 'the other twin picked');
    assert.equal(flags(o, { chips: [] }).contacts, false, 'the chip removed');
    assert.equal(flags(o, { chips: [contactChip(pat1, true)] }).contacts, false, 'a chip swapped for another, Primary as it was: sent (the re-check)');
    const idless = open({ contacts: [contactChip(lee, true), { name: 'Dana' }], contactId: 'c3' });
    assert.equal(flags(idless).contacts, true);
    assert.equal(flags(idless, { chips: [contactChip(lee, true)] }).contacts, false, 'a chip with no id removed: a change (it was compared without it)');
});
