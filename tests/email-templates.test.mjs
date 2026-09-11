// tests/email-templates.test.mjs
//
// Email templates for reps, mailto-based (state §0.122 — the second half of
// the recommendation Jeff agreed to: "email templates for reps; web-to-lead
// forms"). The pure module is RUN; the settings halves, the catalogue, the
// panel and the rail's picker are source scans (§18b23).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MERGE_FIELDS, MERGE_KEYS, LIMITS, cleanEmailTemplates, mergeContext, renderTemplate, mailtoHref, renderForContact } from '../src/utils/emailTemplates.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const code = (src) => src.split(/\r?\n/).filter(l => !l.trim().startsWith('//')).join('\n');

// ── the pure module ──────────────────────────────────────────────────────────

test('cleanEmailTemplates: garbage is an empty library; blanks and duplicates dropped; strings trimmed and capped', () => {
    for (const raw of [undefined, null, 'x', {}, 7]) assert.deepEqual(cleanEmailTemplates(raw), [], String(raw));
    const out = cleanEmailTemplates([
        { id: 'a', name: '  Intro ', subject: ' Hi {{firstName}} ', body: 'x'.repeat(6000) },
        { id: 'a', name: 'Duplicate id' },
        { id: '', name: 'No id' },
        { id: 'b', name: '' },
        'junk', null,
        { id: 'c', name: 'Bare', subject: 7 },
    ]);
    assert.deepEqual(out.map(t => t.id), ['a', 'c']);
    assert.equal(out[0].name, 'Intro'); assert.equal(out[0].subject, 'Hi {{firstName}}');
    assert.equal(out[0].body.length, LIMITS.body, 'capped');
    assert.deepEqual(out[1], { id: 'c', name: 'Bare', subject: '7', body: '' }, 'every key present');
});

test('mergeContext: every merge key present, from the contact, the rep and the org; missing values are empty', () => {
    const ctx = mergeContext({ contact: { firstName: 'Dana', lastName: 'W', company: 'Northwind', title: 'Ops' }, rep: { name: 'Karen Russell', email: 'k@x.co', phone: '555' }, org: { companyDisplayName: 'Acme' } });
    assert.deepEqual(Object.keys(ctx).sort(), [...MERGE_KEYS].sort());
    assert.equal(ctx.fullName, 'Dana W'); assert.equal(ctx.repName, 'Karen Russell'); assert.equal(ctx.companyName, 'Acme');
    const empty = mergeContext({});
    for (const k of MERGE_KEYS) assert.equal(empty[k], '', k);
    assert.equal(mergeContext({ org: { companyName: 'Legal Co' } }).companyName, 'Legal Co', 'the legal name when no display name');
    assert.equal(MERGE_FIELDS.length, MERGE_KEYS.length);
});

test('renderTemplate: replaces known fields (spaces inside the braces tolerated), leaves an unknown field as typed', () => {
    const ctx = mergeContext({ contact: { firstName: 'Dana' }, rep: { name: 'Karen' } });
    assert.equal(renderTemplate('Hi {{firstName}}, — {{ repName }}', ctx), 'Hi Dana, — Karen');
    assert.equal(renderTemplate('{{lastName}}|', ctx), '|', 'a known field with no value renders empty');
    assert.equal(renderTemplate('{{nope}} {{firstName}}', ctx), '{{nope}} Dana', 'an unknown field is left visible, not silently dropped');
    assert.equal(renderTemplate(null, ctx), '');
    assert.deepEqual(renderForContact({ subject: 'S {{firstName}}', body: 'B {{repName}}' }, ctx), { subject: 'S Dana', body: 'B Karen' });
});

test('mailtoHref: the address, then URL-encoded subject and body; nothing when both are empty', () => {
    assert.equal(mailtoHref('a@b.co', 'Hi & bye', 'Line 1\nLine 2'), 'mailto:a@b.co?subject=Hi%20%26%20bye&body=Line%201%0ALine%202');
    assert.equal(mailtoHref(' a@b.co ', '', ''), 'mailto:a@b.co');
    assert.equal(mailtoHref('a@b.co', 'Only subject', ''), 'mailto:a@b.co?subject=Only%20subject');
});

// ── the settings halves, the catalogue, the panel, the rail ──────────────────

test('settings.mjs carries emailTemplates in BOTH halves (18b12), normalised', () => {
    const s = code(read('netlify/functions/settings.mjs'));
    assert.ok(s.includes('                emailTemplates: cleanEmailTemplates(row.extra?.emailTemplates),'), 'GET');
    assert.ok(s.includes("                emailTemplates: 'emailTemplates' in data ? cleanEmailTemplates(data.emailTemplates) : existingExtra.emailTemplates || [],"), 'PUT read-then-merge');
});

test('the catalogue lists the panel, the card counts it, AdminView routes it', () => {
    const cat = code(read('src/Tabs/settings/catalogue.js'));
    assert.ok(cat.includes("{ id:'email-templates',  scope:'workspace', category:'Sales process', name:'Email templates',"), 'a catalogue row, no typed count');
    const cards = code(read('src/utils/settingsCards.js'));
    assert.ok(cards.includes("    if (item.id === 'email-templates') statusDetail = countOrNull(len(settings?.emailTemplates), 'template');"));
    const av = code(read('src/Tabs/AdminView.jsx'));
    assert.ok(av.includes("if (id === 'email-templates') return <EmailTemplatesDetail settings={settings} setSettings={setSettings} onBack={onBack} setSettingsDirty={setSettingsDirty} settingsSaveRef={settingsSaveRef}/>;"));
    const panel = code(read('src/Tabs/settings/salesProcess/EmailTemplatesDetail.jsx'));
    assert.ok(panel.includes('const TemplateEditor = ({ tpl, onChange, onDelete }) => {'), 'the editor is module scope, data as props (focus)');
    assert.ok(panel.includes('            await putSettings({ emailTemplates: clean });'), 'saved through the settings PUT');
    assert.ok(panel.includes("            setSaveError(e.message);\n            setSaving(false);\n            throw e;"), 'a refused save is shown and rethrown (the nav guard)');
});

test('the contact rail: a template renders for THAT contact, opens the rep\'s own client, and logs the Email with the template named', () => {
    const rail = code(read('src/components/rails/ContactRail.jsx'));
    assert.ok(rail.includes("import { cleanEmailTemplates, mergeContext, renderForContact, mailtoHref } from '../../utils/emailTemplates.js';"));
    assert.ok(rail.includes('const TemplatePicker = ({ contact, templates, ctx, onPick, onBlank }) => ('), 'module scope, data as props');
    assert.ok(rail.includes('    const emailTemplates = cleanEmailTemplates(settings?.emailTemplates);'));
    assert.ok(rail.includes('    const mergeCtx = mergeContext({ contact, rep: myProfile, org: settings });'), 'the rep is the roster profile, the org the settings');
    assert.ok(rail.includes('                const r = renderForContact(t, ctx);\n                return (\n                    <a key={t.id} href={mailtoHref(contact.email, r.subject, r.body)}'), 'a real mailto: link per template — the browser hands it to the mail client');
    assert.ok(rail.includes("onClick={() => onPick(t, r)}"));
    assert.ok(rail.includes("openCommLog('Email', { notes: `Template: ${t.name}${r.subject ? ` — ${r.subject}` : ''}` });"), 'the logged activity names the template and subject');
    assert.ok(rail.includes('    const openCommLog = (type, extra = {}) => {'), 'the existing comm-log prompt, extended, not duplicated');
    assert.ok(rail.includes('            ...extra,\n        });'), 'extra rides into the activity prefill');
});
