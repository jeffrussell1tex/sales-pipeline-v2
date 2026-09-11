// tests/lead-intake.test.mjs
//
// The web-to-lead form (state §0.121; Jeff: "web-to-lead forms (an embeddable
// form that posts into your Leads module — SMBs ask for this constantly)" — "I
// agree with your recommendations"). The pure module is RUN; the public
// endpoint, the settings halves, the rewrite and the card are source scans
// (§18b23) — the endpoint's behaviour against the real database is
// tests/integration/lead-intake.itest.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    WEB_LEAD_SOURCE, TOKEN_RE, INTAKE_FIELDS, HONEYPOT_FIELD,
    cleanWebToLead, cleanIntake, webToLeadLinks,
} from '../src/utils/webToLead.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const code = (src) => src.split(/\r?\n/).filter(l => !l.trim().startsWith('//')).join('\n');
const TOK = 'AbCdEfGhIjKlMnOpQrStUvWxYz012345';   // 32 base64url chars, the minted shape

// ── the pure module ──────────────────────────────────────────────────────────

test('cleanWebToLead: off with no token by default; garbage is off; every key present', () => {
    for (const raw of [undefined, null, 'x', [], 7, {}]) {
        assert.deepEqual(cleanWebToLead(raw), { enabled: false, token: null, source: WEB_LEAD_SOURCE, thankYouUrl: null }, String(raw));
    }
});

test('cleanWebToLead: the stored token survives a save that does not carry it; a malformed token is never accepted', () => {
    const prev = { enabled: true, token: TOK };
    assert.equal(cleanWebToLead({ enabled: true }, prev).token, TOK, 'a save without the token keeps the stored one');
    assert.equal(cleanWebToLead({ enabled: false }, prev).token, TOK, 'turning off keeps it too — turning back on keeps the link');
    assert.equal(cleanWebToLead({ enabled: true, token: 'short' }, prev).token, TOK, 'a malformed token in the payload is ignored');
    assert.equal(cleanWebToLead({ enabled: true, token: 'short' }).token, null, 'and never stored on its own');
});

test('cleanWebToLead: a token is minted ONLY by a mint, only when on-with-none or on rotate', () => {
    let n = 0;
    const mint = () => { n++; return 'MintedToken_' + String(n).padStart(20, '0'); };
    assert.equal(cleanWebToLead({ enabled: true }).token, null, 'no mint (the GET, the client) → no token, ever');
    const first = cleanWebToLead({ enabled: true }, null, mint);
    assert.match(first.token, TOKEN_RE); assert.equal(n, 1);
    assert.equal(cleanWebToLead({ enabled: true }, first, mint).token, first.token, 'on with a token: kept, not re-minted');
    assert.equal(n, 1);
    assert.equal(cleanWebToLead({ enabled: false }, null, mint).token, null, 'off with none: nothing minted');
    const rotated = cleanWebToLead({ enabled: true, rotate: true }, first, mint);
    assert.notEqual(rotated.token, first.token, 'rotate replaces it'); assert.equal(n, 2);
    assert.equal(cleanWebToLead({ enabled: true }, first, () => 'bad token').token, first.token, 'a mint that returns a malformed token is ignored');
});

test('cleanWebToLead: source defaults, thank-you URL is https or nothing (never an open redirect from the payload)', () => {
    assert.equal(cleanWebToLead({ source: '  ' }).source, WEB_LEAD_SOURCE);
    assert.equal(cleanWebToLead({ source: 'Website' }).source, 'Website');
    assert.equal(cleanWebToLead({ thankYouUrl: 'https://example.com/thanks' }).thankYouUrl, 'https://example.com/thanks');
    assert.equal(cleanWebToLead({ thankYouUrl: 'http://example.com/thanks' }).thankYouUrl, null, 'http refused');
    assert.equal(cleanWebToLead({ thankYouUrl: 'javascript:alert(1)' }).thankYouUrl, null);
});

test('cleanIntake: trims and caps, reads only the intake fields, maps message to notes', () => {
    const r = cleanIntake({ firstName: '  Ada ', lastName: 'Lovelace', company: 'Analytical', email: 'ada@example.com', phone: ' 555 ', message: 'Hi', ownerId: 'usr_x', assignedTo: 'Someone', orgId: 'org_x', status: 'Qualified' });
    assert.equal(r.ok, true);
    assert.deepEqual(r.lead, { firstName: 'Ada', lastName: 'Lovelace', company: 'Analytical', email: 'ada@example.com', phone: '555', notes: 'Hi' });
    assert.ok(!('ownerId' in r.lead) && !('assignedTo' in r.lead) && !('orgId' in r.lead) && !('status' in r.lead), 'nothing the visitor did not ask about is read');
    assert.equal(cleanIntake({ firstName: 'x'.repeat(300), email: 'a@b.co' }).lead.firstName.length, 255, 'capped to the column');
    assert.deepEqual(INTAKE_FIELDS.map(f => f.key), ['firstName', 'lastName', 'company', 'email', 'phone', 'message']);
});

test('cleanIntake: refuses a submission with no way to reach the person, or no name/company, or a bad email; the honeypot is spam', () => {
    assert.equal(cleanIntake({ firstName: 'Ada' }).ok, false, 'no email, no phone');
    assert.equal(cleanIntake({ email: 'ada@example.com' }).ok, false, 'no name, no company');
    assert.equal(cleanIntake({ firstName: 'Ada', email: 'not-an-email' }).ok, false);
    assert.equal(cleanIntake({ firstName: 'Ada', phone: '555' }).ok, true, 'a phone is enough');
    assert.equal(cleanIntake({ company: 'Acme', email: 'x@acme.co' }).ok, true, 'a company is enough');
    const spam = cleanIntake({ firstName: 'Bot', email: 'b@ot.io', [HONEYPOT_FIELD]: 'http://spam' });
    assert.equal(spam.ok, false); assert.equal(spam.spam, true);
    assert.equal(cleanIntake(null).ok, false); assert.equal(cleanIntake('x').ok, false);
});

test('webToLeadLinks: the hosted URL, the POST URL and an iframe embed; nothing without a token', () => {
    const l = webToLeadLinks('https://app.example.com/', TOK);
    assert.equal(l.formUrl, `https://app.example.com/lead-form/${TOK}`);
    assert.equal(l.postUrl, `https://app.example.com/.netlify/functions/lead-intake?t=${TOK}`);
    assert.ok(l.embed.startsWith(`<iframe src="${l.formUrl}"`));
    assert.deepEqual(webToLeadLinks('https://app.example.com', null), { formUrl: null, embed: null, postUrl: null });
});

// ── the public endpoint, by source ───────────────────────────────────────────

test('lead-intake.mjs: token-only authority, a turned-off form is a 404, the insert is the org\'s and UNASSIGNED', () => {
    const s = code(read('netlify/functions/lead-intake.mjs'));
    assert.ok(!s.includes("from './auth.mjs'"), 'no Clerk auth — this is the public surface');
    assert.ok(!s.includes('apiKeys'), 'and not an API-key surface either (api-surface.test.mjs pins the same)');
    assert.ok(s.includes("        .where(sql`${settings.extra}->'webToLead'->>'token' = ${token}`);"), 'the token finds the settings row');
    assert.ok(s.includes('    if (!cfg.enabled || cfg.token !== token) return null;'), 'a turned-off form, or a token that does not normalise to itself, is not found');
    assert.ok(s.includes("    if (!TOKEN_RE.test(token)) return null;"), 'a malformed token is not even looked up');
    assert.ok(s.includes('            assignedTo: null,       // UNASSIGNED — the claim-request pool. Never from the caller.\n            ownerId:    null,'), 'unassigned, unowned — never from the payload');
    assert.ok(s.includes('        const [inserted] = await db.insert(leads).values({ ...base, ...scored, orgId: org.orgId }).returning();'), 'the org comes from the settings row the token found');
    assert.equal((s.match(/db\.insert\(/g) || []).length, 1, 'exactly one write');
    assert.ok(!s.includes('db.update(') && !s.includes('db.delete('), 'and nothing else');
});

test('lead-intake.mjs: the honeypot returns thanks with NO row; a 404 body never says why; the form page may be framed', () => {
    const s = code(read('netlify/functions/lead-intake.mjs'));
    const spam = s.indexOf('        if (!clean.ok && clean.spam) return thanks();');
    const insert = s.indexOf('await db.insert(leads)');
    assert.ok(spam > 0 && spam < insert, 'the honeypot exit comes before the insert');
    assert.ok(s.includes("    if (!TOKEN_RE.test(token)) return null;") && s.includes('const notFound = () => ({'), 'one 404 for malformed, unknown and turned-off');
    assert.ok(s.includes(`    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'",`), 'embeddable by design — no frame-ancestors at all');
    assert.ok(!s.includes('frame-ancestors'), "frame-ancestors * refuses file: and data: parents (Chrome: '*' matches only network schemes) — a customer's local test page");
    assert.ok(!s.includes("'X-Frame-Options'"), 'no frame denial on this surface');
    assert.ok(s.includes("    'X-Robots-Tag':            'noindex, nofollow',") && s.includes("'Cache-Control':           'no-store',"));
    assert.ok(s.includes('    if (raw.length > BODY_CAP) return { tooLarge: true };') && s.includes('const BODY_CAP    = 16 * 1024;'));
    assert.ok(s.includes('        if (rateLimited(token)) return fail(429,'), 'a per-token rate limit');
    assert.ok(s.includes("            ? { statusCode: 303, headers: { ...htmlHeaders, Location: org.cfg.thankYouUrl }, body: '' }"), 'a redirect only to the CONFIGURED https URL');
    assert.ok(s.includes("        }), 'webLead').catch(() => false);"), 'the Slack post is under the org\'s webLead switch and can never fail the submission');
});

// ── the settings halves, the rewrite, the alert type, the card ───────────────

test('settings.mjs carries webToLead in BOTH halves (18b12); the PUT alone mints', () => {
    const s = code(read('netlify/functions/settings.mjs'));
    assert.ok(s.includes('                webToLead: cleanWebToLead(row.extra?.webToLead),'), 'GET — normalised, no mint');
    assert.ok(s.includes("                webToLead: 'webToLead' in data ? cleanWebToLead(data.webToLead, existingExtra.webToLead, () => randomBytes(24).toString('base64url')) : existingExtra.webToLead || {},"), 'PUT — read-then-merge, the stored token carried, minted server-side');
    assert.ok(s.includes("import { randomBytes } from 'crypto';"));
});

test('netlify.toml: /lead-form/:token rewrites to the function ABOVE the SPA catch-all', () => {
    const t = read('netlify.toml');
    const form = t.indexOf('from = "/lead-form/:token"');
    const to = t.indexOf('to = "/.netlify/functions/lead-intake/:token"');
    const catchAll = t.indexOf('from = "/*"');
    assert.ok(form > 0 && to > form && catchAll > to, 'the rewrite exists and precedes the catch-all');
});

test('the Slack switch exists and the template is wired; the card lives in Connected apps and never mints', () => {
    const alerts = code(read('src/utils/slackAlerts.js'));
    assert.ok(alerts.includes("    Object.freeze({ key: 'webLead',        kind: 'event',  label: 'New lead from the web form' }),"));
    const slack = code(read('netlify/functions/send-slack.mjs'));
    assert.ok(slack.includes('    webLead: ({ name, company, email, phone, message }) => ({'));
    const card = code(read('src/Tabs/settings/integrations/ConnectedAppsDetail.jsx'));
    assert.ok(card.includes('const WebFormCard = ({ form, isAdmin, busy, note, onSave }) => {'), 'module scope, data as props');
    assert.ok(card.includes("                setWebForm(cleanWebToLead(data.settings?.webToLead));"), 'read from the settings load');
    assert.ok(card.includes('            await putSettings({ webToLead: { ...(webForm || {}), ...patch } });'), 'saved through the settings PUT');
    assert.ok(card.includes("            const res  = await dbFetch('/.netlify/functions/settings');\n            const data = await res.json();\n            if (!res.ok) throw new Error(data.error || 'Saved, but the form settings could not be re-read');"), 're-read to learn the minted token');
    assert.ok(card.includes("            note('webform', `Not saved — ${e.message}`);"), 'the outcome on the card (§18b32)');
    assert.ok(!card.includes('randomBytes') && !card.includes('randomUUID'), 'the client never mints');
    assert.ok(card.includes("<WebFormCard form={webForm} isAdmin={isAdmin} busy={busy === 'webform'} note={notes.webform} onSave={saveWebForm}/>"));
    assert.ok(card.includes('        + (webForm?.enabled && webForm.token ? 1 : 0);'), 'counted as live');
});
