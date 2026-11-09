// tests/customer-docs.test.mjs
//
// A customer's document names the org that sent it, never the app (state §0.234; guide §18b117;
// docs/design/quote-branding). Until §0.234 every org's quote preview printed "ACCELEREP" and a San Francisco
// address, its PDF "ACCELEREP CRM", its email "Accelerep" and a link into the CRM, and the dispatch customer emails
// "an account on Accelerep". These hold it:
//   RULE    src/utils/orgIdentity.js, run: the Company profile's display name, else the org's Clerk name, never the
//           app's; the address lines and contact line; a reply address only when well formed; the From header as
//           the org on the verified address; a brand as a look only
//   GUARD   no customer-facing renderer carries the app's name or address in anything it prints — string literals,
//           template text and JSX text, read by the parser (comments may name it)
//   WIRING  the server reads the identity by the caller's org, never the body; the screen by the same rule; the
//           mailer sends the From name and the reply address; Edit brand edits no name or contact line
// The renders themselves (the PDF read back, the email's Resend request, two orgs apart) are
// tests/integration/quote-branding.itest.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from '@babel/parser';
import {
    orgIdentityOf, profileOfSettings, profileOfRow, contactLineOf, emailOrNull, mailFromAs, brandLook,
} from '../src/utils/orgIdentity.js';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8').replace(/\r\n/g, '\n');
const code = (src) => src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
const treeOf = (src) => parse(src, { sourceType: 'module', plugins: ['jsx'] });

// Every piece of text a node prints: string literals, template text, JSX text — never a comment.
const printed = (node) => {
    const out = [];
    const walk = (n) => {
        if (!n || typeof n !== 'object') return;
        if (Array.isArray(n)) { n.forEach(walk); return; }
        if (n.type === 'StringLiteral' || n.type === 'JSXText') out.push(n.value);
        if (n.type === 'TemplateElement') out.push(n.value.cooked ?? n.value.raw);
        for (const k of Object.keys(n)) {
            if (k === 'leadingComments' || k === 'trailingComments' || k === 'innerComments' || k === 'loc') continue;
            walk(n[k]);
        }
    };
    walk(node);
    return out;
};
// A top-level declaration's node by name (a const, a function, an export of either).
const declNode = (tree, name) => {
    for (const top of tree.program.body) {
        const d = top.type === 'ExportNamedDeclaration' ? top.declaration : top;
        if (!d) continue;
        if (d.type === 'FunctionDeclaration' && d.id?.name === name) return d;
        if (d.type === 'VariableDeclaration') for (const v of d.declarations) if (v.id?.name === name) return v;
    }
    assert.fail(`no top-level ${name}`);
};
// One method of an object literal held by a top-level const (send-email.mjs's emailTemplates).
const methodNode = (tree, holder, name) => {
    const obj = declNode(tree, holder).init;
    const m = obj.properties.find((p) => (p.key?.name || p.key?.value) === name);
    assert.ok(m, `${holder}.${name}`);
    return m;
};

// ── RULE ─────────────────────────────────────────────────────────────────────

test('RULE: the display name, else the Clerk name, else none — never the app\'s; address lines and contact as typed, tidied', () => {
    const full = { displayName: ' Alpha  Co ', address: '1 Alpha Way', city: 'Austin', state: 'TX', zip: '78701', phone: '512-555-0101', supportEmail: 'help@alpha.test' };
    assert.deepEqual(orgIdentityOf(full, 'Clerk Alpha'), { name: 'Alpha Co', addressLines: ['1 Alpha Way', 'Austin, TX 78701'], phone: '512-555-0101', email: 'help@alpha.test' });
    assert.equal(orgIdentityOf({ ...full, displayName: '   ' }, ' Clerk Alpha ').name, 'Clerk Alpha', 'REGRESSION (Q1): a blank display name hides the org\'s Clerk name');
    assert.equal(orgIdentityOf({}, '').name, '', 'no name anywhere: none, never a stand-in');
    assert.deepEqual(orgIdentityOf(null), { name: '', addressLines: [], phone: '', email: '' });
    assert.deepEqual(orgIdentityOf({ city: 'Austin' }).addressLines, ['Austin']);
    assert.deepEqual(orgIdentityOf({ state: 'TX', zip: '78701' }).addressLines, ['TX 78701']);
    assert.deepEqual(orgIdentityOf({ address: '1 Way', zip: '78701' }).addressLines, ['1 Way', '78701']);
    assert.equal(contactLineOf(orgIdentityOf(full)), '512-555-0101 · help@alpha.test');
    assert.equal(contactLineOf({ phone: '', email: 'a@b.co' }), 'a@b.co');
    assert.equal(contactLineOf(null), '');
});

test('RULE: the profile from the settings GET and from a stored row — a row\'s display name falls back to the company_name column', () => {
    const s = { companyDisplayName: 'D', companyAddress: 'A', companyCity: 'C', companyState: 'S', companyZip: 'Z', companyPhone: 'P', companySupportEmail: 'E' };
    assert.deepEqual(profileOfSettings(s), { displayName: 'D', address: 'A', city: 'C', state: 'S', zip: 'Z', phone: 'P', supportEmail: 'E' });
    assert.deepEqual(profileOfSettings(null), { displayName: undefined, address: undefined, city: undefined, state: undefined, zip: undefined, phone: undefined, supportEmail: undefined });
    assert.equal(profileOfRow({ companyName: 'Column Co', extra: { companyDisplayName: 'Display Co' } }).displayName, 'Display Co');
    assert.equal(profileOfRow({ companyName: 'Column Co', extra: { companyDisplayName: '  ' } }).displayName, 'Column Co', 'the GET\'s own fallback');
    assert.equal(profileOfRow({ extra: { companyPhone: '555' } }).phone, '555', 'the keys live in extra');
    assert.equal(profileOfRow(null).displayName, '');
});

test('RULE: a reply address only when well formed — a malformed one would make Resend refuse the whole email', () => {
    for (const ok of ['rep@alpha.test', ' rep@alpha.test ', 'first.last+q@sub.alpha.co']) assert.equal(emailOrNull(ok), ok.trim(), ok);
    for (const bad of ['not-an-address', 'a b@c.co', '<a@b.co>', 'a@b', '"a"@b.co', '', null, undefined]) assert.equal(emailOrNull(bad), null, String(bad));
});

test('RULE: the From header as the org, on the verified sender\'s address; no name — the sender as it stands', () => {
    assert.equal(mailFromAs('Sales Pipeline <noreply@x.test>', 'Alpha Co'), '"Alpha Co" <noreply@x.test>');
    assert.equal(mailFromAs('noreply@x.test', 'Alpha Co'), '"Alpha Co" <noreply@x.test>', 'a bare address');
    assert.equal(mailFromAs('Sales Pipeline <noreply@x.test>', 'Acme "Best" <HVAC>\r\nBcc: x@y.z'), '"Acme Best HVAC Bcc: x@y.z" <noreply@x.test>',
        'REGRESSION: a name that breaks the header — quotes, brackets, a line break');
    assert.equal(mailFromAs('Sales Pipeline <noreply@x.test>', ''), 'Sales Pipeline <noreply@x.test>');
    assert.equal(mailFromAs('Sales Pipeline <noreply@x.test>', '  \n '), 'Sales Pipeline <noreply@x.test>');
    assert.equal(mailFromAs('Sales Pipeline <noreply@x.test>', 'x'.repeat(90)), `"${'x'.repeat(70)}" <noreply@x.test>`, 'cut to 70');
});

test('RULE: a brand is a look — the name and contact line it held go, the rest kept, the stored copy untouched', () => {
    const stored = { primary: '#111', accent: '#222', companyName: 'Old', contactLine: 'old@x.test' };
    assert.deepEqual(brandLook(stored), { primary: '#111', accent: '#222' });
    assert.deepEqual(stored, { primary: '#111', accent: '#222', companyName: 'Old', contactLine: 'old@x.test' }, 'not changed in place');
    assert.deepEqual(brandLook(null), {});
});

// ── GUARD ────────────────────────────────────────────────────────────────────

// What the app is, as a customer must never read it from an org.
const APP = [/accelerep/i, /market street/i, /san francisco/i, /\(415\) 555/];
// A quote's documents carry no link into the app either (the customer has no account in it).
const APP_LINK = [/netlify\.app/i, /salespipelinetracker/i];

const RENDERERS = [
    // [file, what of it prints to a customer (null = the whole file), the patterns]
    ['src/Tabs/QuotesTab.jsx',                            null,                                   [...APP, ...APP_LINK]],   // the preview and the print fallback
    ['netlify/functions/quote-pdf.mjs',                   null,                                   [...APP, ...APP_LINK]],
    ['netlify/functions/_quotePdf.mjs',                   null,                                   [...APP, ...APP_LINK]],   // the PDF's layout (§0.235)
    ['netlify/functions/quote-email.mjs',                 null,                                   [...APP, ...APP_LINK]],
    ['netlify/functions/send-email.mjs',                  ['customerLayout'],                     [...APP, ...APP_LINK]],
    ['netlify/functions/send-email.mjs',                  ['emailTemplates.customerAppointmentConfirmed', 'emailTemplates.customerTechOnTheWay'], [...APP, ...APP_LINK]],
    ['netlify/functions/_customerNotify.mjs',             null,                                   APP],   // its status link is the app's own public page
    ['netlify/functions/dispatch-status.mjs',             null,                                   APP],
    ['netlify/functions/lead-intake.mjs',                 null,                                   APP],
    ['netlify/functions/_orgIdentity.mjs',                null,                                   [...APP, ...APP_LINK]],
    ['src/utils/orgIdentity.js',                          null,                                   [...APP, ...APP_LINK]],
    ['src/utils/customerNotifications.js',                null,                                   APP],   // the customer SMS
    ['src/Tabs/settings/quoting/EditBrandModal.jsx',      ['BRAND_PRESET', 'BrandPreviewDoc'],    [...APP, ...APP_LINK]],   // what an Admin is shown as the quote
    ['src/Tabs/settings/quoting/QuoteTemplatesDetail.jsx', ['QT_BRANDING', 'MiniQuoteDoc'],        [...APP, ...APP_LINK]],
];

// What one source prints that matches — the whole file, or the named declarations / `holder.method`s of it.
const hitsIn = (src, parts, patterns) => {
    const tree = treeOf(src);
    const nodes = parts === null ? [tree.program] : parts.map((p) => (p.includes('.') ? methodNode(tree, ...p.split('.')) : declNode(tree, p)));
    const hits = [];
    for (const text of nodes.flatMap(printed)) {
        for (const re of patterns) if (re.test(text)) hits.push(`${re} in ${JSON.stringify(text.slice(0, 80))}`);
    }
    return hits;
};

test('THE GUARD: no customer-facing renderer prints the app\'s name or address — or, on a quote, a link into the app', () => {
    const hits = RENDERERS.flatMap(([file, parts, patterns]) =>
        hitsIn(read(file), parts, patterns).map((h) => `${file}${parts ? ` (${parts.join(', ')})` : ''}: ${h}`));
    assert.deepEqual(hits, [], 'REGRESSION (§0.234): a customer would read the app\'s identity on an org\'s document');
});

test('THE GUARD reads what prints, not what is said about it: a comment naming the app passes; a literal, template text or JSX text fails', () => {
    assert.deepEqual(hitsIn('// Accelerep once printed here\nconst a = 1;', null, APP), [], 'a comment is not printed');
    assert.equal(hitsIn("const a = 'ACCELEREP CRM';", null, APP).length, 1, 'a string literal');
    assert.equal(hitsIn('const a = `Generated by Accelerep · ${d}`;', null, APP).length, 1, 'template text');
    assert.equal(hitsIn('const C = () => <div>500 Market Street</div>;', null, APP).length, 1, 'JSX text');
    assert.equal(hitsIn("const ok = 'x';\nconst Bad = () => <b>Accelerep</b>;", ['ok'], APP).length, 0, 'only the parts named are read');
    assert.equal(hitsIn("const t = { a() { return 'x'; }, b() { return 'Accelerep'; } };", ['t.b'], APP).length, 1, 'a method of a held object');
    assert.equal(hitsIn("const u = 'https://accelerep.netlify.app';", null, APP_LINK).length, 1, 'a link into the app');
});

// ── WIRING ───────────────────────────────────────────────────────────────────

test('WIRING: the server reads who the org is by the caller\'s org, never from the body', () => {
    const pdf = code(read('netlify/functions/quote-pdf.mjs'));
    assert.ok(pdf.includes('const pdfBuffer = await buildPDF(quote, opportunity, lines, await orgIdentityFor(auth.orgId));'), 'the PDF: the caller\'s org');
    assert.ok(pdf.includes('const { quote, opportunity, lines } = body;') && !pdf.includes('companyProfile'),
        'REGRESSION (R2): the PDF takes a company profile from the request body again');
    const email = code(read('netlify/functions/quote-email.mjs'));
    assert.ok(email.includes('const org = await orgIdentityFor(orgId);'), 'the email: the caller\'s org');
    assert.ok(email.includes('fromName: org.name,') && email.includes('            replyTo,\n'), 'sent as the org, the reply to the rep');
    assert.ok(email.includes('replyTo = emailOrNull(senderRow?.email);') && email.includes('eq(users.clerkUserId, userId), eq(users.orgId, orgId)'),
        'the rep is the signed-in sender, in this org, by the Clerk id');
    assert.ok(!email.includes('APP_URL'), 'REGRESSION (§0.234): a link into the app in the customer\'s email');
    const notify = code(read('netlify/functions/_customerNotify.mjs'));
    assert.ok(notify.includes('const identity = await identityOfRow(orgId, srow);'), 'the visit emails: the job\'s org\'s row');
    assert.ok(notify.includes('await sendEmail({ to, ...tpl, fromName: identity.name, replyTo });') && notify.includes('const replyTo = emailOrNull(identity.email);'),
        'sent as the org, the reply to its support email (Q3)');
    const id = code(read('netlify/functions/_orgIdentity.mjs'));
    assert.ok(id.includes('await db.select().from(settings).where(eq(settings.orgId, orgId))'), 'the settings row by org');
    assert.ok(id.includes('.organizations.getOrganization({ organizationId: orgId });'), 'Clerk asked for this org alone');
    assert.ok(id.includes("return own.name ? own : orgIdentityOf(profile, await clerkOrgName(orgId));"), 'Clerk asked only when the profile names no one');
});

test('WIRING: the mailer sends the From name and the reply address it is handed — each only when usable', () => {
    const send = code(read('netlify/functions/send-email.mjs'));
    assert.ok(send.includes("const from   = mailFromAs(process.env.MAIL_FROM || 'Sales Pipeline <noreply@salespipeline.app>', fromName);"));
    assert.ok(send.includes('const reply  = emailOrNull(replyTo);') && send.includes('...(reply ? { reply_to: reply } : {}),'));
    const tree = treeOf(read('netlify/functions/send-email.mjs'));
    for (const t of ['customerAppointmentConfirmed', 'customerTechOnTheWay']) {
        const m = read('netlify/functions/send-email.mjs').slice(methodNode(tree, 'emailTemplates', t).start, methodNode(tree, 'emailTemplates', t).end);
        assert.ok(m.includes('const html = customerLayout(escHtml(subject), `') && m.includes('`, { name: companyName, contactLine });'), `${t}: the org's layout`);
    }
});

test('WIRING: the screen draws the org by the same rule, and Edit brand edits no name or contact line', () => {
    const tab = code(read('src/Tabs/QuotesTab.jsx'));
    assert.ok(tab.includes('const orgIdentity = useMemo(() => orgIdentityOf(profileOfSettings(settings), organization?.name),'), 'the preview\'s identity');
    assert.ok(tab.includes('<QuotePDFPreview quote={activeQuote} opp={configuratorOpp} products={products || []} org={orgIdentity} />'));
    assert.ok(tab.includes("{['Customer signature', `${org?.name || 'Company'} signature`].map(s => ("), 'the signature line is the org\'s');
    const brand = read('src/Tabs/settings/quoting/EditBrandModal.jsx');
    const preset = printed(declNode(treeOf(brand), 'BRAND_PRESET'));
    assert.ok(!/companyName|contactLine/.test(brand.slice(brand.indexOf('export const BRAND_PRESET'), brand.indexOf('};', brand.indexOf('export const BRAND_PRESET')))), 'REGRESSION (Q2): the preset names a company again');
    assert.ok(preset.length > 0);
    assert.ok(!brand.includes("set('companyName'") && !brand.includes("set('contactLine'"), 'REGRESSION (Q2): Edit brand edits a name or contact line again');
    assert.ok(brand.includes('const look = brandLook(brand);') && brand.includes('const w = await writeSettings({ quoteBrand: look }, { quoteBrand: base.rev });'), 'a save stores the look alone');
    const tpl = code(read('src/Tabs/settings/quoting/QuoteTemplatesDetail.jsx'));
    assert.ok(tpl.includes('const orgIdentity  = orgIdentityOf(profileOfSettings(settings), organization?.name);'));
    assert.ok(tpl.includes("org={orgIdentity} onOpenProfile={onOpenPanel ? () => { setShowEditBrand(false); onOpenPanel('company-profile'); } : null}/>}"), 'Edit brand names the org and opens Company profile');
    assert.ok(read('src/Tabs/AdminView.jsx').includes('onOpenPanel={(to) => { const it = SETTINGS_ITEMS.find(i => i.id === to); if (it) openItem(it); }}/>;'),
        'through AdminView\'s own leave guard');
});

test('the PDF renders where it is deployed: pdfkit stays outside the quote-pdf bundle, so it finds its own font metrics', () => {
    // Bundled, pdfkit's fs.readFileSync(__dirname + '/data/Helvetica.afm') looked in the function's folder and every
    // quote PDF answered 500 before drawing a line (9 Nov 2026: localhost, ENOENT; dev, 500) — the Quotes tab fell
    // back to its print copy. The block, as netlify.toml must hold it:
    const toml = read('netlify.toml');
    const block = toml.slice(toml.indexOf('[functions."quote-pdf"]'), toml.indexOf('\n\n', toml.indexOf('[functions."quote-pdf"]')));
    assert.ok(toml.includes('[functions."quote-pdf"]'), 'REGRESSION (§0.234): the quote PDF\'s function block is gone');
    assert.ok(block.includes('  node_bundler = "esbuild"') && block.includes('  external_node_modules = ["pdfkit"]'),
        'REGRESSION (§0.234): pdfkit bundled into the quote PDF again — no standard font, every PDF a 500');
    // Since §0.235 pdfkit is imported by the layout the handler imports; the block's external applies to the whole bundle.
    assert.ok(read('netlify/functions/quote-pdf.mjs').includes("import { buildPDF } from './_quotePdf.mjs';")
        && read('netlify/functions/_quotePdf.mjs').includes("import PDFDocument from 'pdfkit';"), 'the module the block keeps whole, through the layout');
});

test('the suites: this file is graded by the harness', () => {
    const suites = read('scripts/mutate-import.mjs').match(/^const SUITES = '([^'\n]*)';$/m)?.[1].split(' ') ?? [];
    assert.ok(suites.includes('tests/customer-docs.test.mjs'), 'SUITES runs this file');
});
