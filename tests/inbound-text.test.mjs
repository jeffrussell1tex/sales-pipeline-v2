// tests/inbound-text.test.mjs
//
// State §0.93, Jeff's steps 7 and 9 on the activity viewer: "All lines are
// truncated into one long running paragraph … it does not indicate that I
// included an attachment." The inbound function had collapsed every newline
// into a space before storing the body; attachments were never looked at. The
// pure half is exercised here; the scans pin the function's use of it and the
// rails' Escape guard (step 3: Escape closed the viewer AND the rail behind it).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normaliseBodyText, htmlToText, attachmentNamesOf, notesOf, envelopeOf, headerMapOf, emailAddressesIn } from '../netlify/functions/_inboundText.mjs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const code = (src) => src.split(/\r?\n/).filter(l => !l.trim().startsWith('//')).join('\n');

test('body text keeps its line breaks and loses only the noise', () => {
    assert.equal(normaliseBodyText('Jeff\r\n\r\nThis is a test\r\nIt is for you\r\n\r\nThanks,\r\nKaren'), 'Jeff\n\nThis is a test\nIt is for you\n\nThanks,\nKaren', 'CRLF → LF, paragraphs kept');
    assert.equal(normaliseBodyText('a   b\t\tc'), 'a b c', 'runs of spaces and tabs collapse');
    assert.equal(normaliseBodyText('a \n b'), 'a\nb', 'no space hugging a newline');
    assert.equal(normaliseBodyText('a\n\n\n\n\nb'), 'a\n\nb', 'at most one blank line');
    assert.equal(normaliseBodyText('\n\n  hello  \n\n'), 'hello', 'trimmed');
    assert.equal(normaliseBodyText('x\u00a0\u00a0y'), 'x y', 'non-breaking spaces are spaces');
    assert.equal(normaliseBodyText(null), '');
    assert.equal(normaliseBodyText(undefined), '');
    assert.equal(normaliseBodyText('Test email for logging'), 'Test email for logging', 'REGRESSION: a one-line body is untouched');
});

test('html keeps block structure as line breaks and decodes the common entities', () => {
    assert.equal(normaliseBodyText(htmlToText('<p>Hello<br>there</p><p>Second &amp; last &nbsp;bit</p>')), 'Hello\nthere\nSecond & last bit');
    assert.equal(normaliseBodyText(htmlToText('<div>one</div><div>two</div><ul><li>a</li><li>b</li></ul>')), 'one\ntwo\na\nb');
    assert.equal(normaliseBodyText(htmlToText('<style>p{}</style><script>x()</script><p>kept</p>')), 'kept', 'style and script bodies are dropped');
    assert.equal(normaliseBodyText(htmlToText('&lt;tag&gt; &quot;q&quot; it&#39;s')), '<tag> "q" it\'s');
    const dataUri = 'data:text/html;base64,' + Buffer.from('<p>from a data uri</p>').toString('base64');
    assert.equal(normaliseBodyText(htmlToText(dataUri)), 'from a data uri');
    assert.equal(htmlToText(null), '');
});

test('attachment names are recorded from whatever shape the provider hands over; the files are not', () => {
    assert.deepEqual(attachmentNamesOf([{ filename: 'quote.pdf', size: 1 }, { name: 'sheet.xlsx' }, 'notes.txt', { content: 'x' }, null, '']), ['quote.pdf', 'sheet.xlsx', 'notes.txt']);
    assert.deepEqual(attachmentNamesOf(undefined), []);
    assert.deepEqual(attachmentNamesOf('quote.pdf'), [], 'not an array');
    assert.equal(attachmentNamesOf(Array.from({ length: 80 }, (_, i) => `f${i}.pdf`)).length, 50, 'bounded');
});

test('the stored notes are subject — body, then an Attachments line, within the cap', () => {
    assert.equal(notesOf({ subject: 'Test email #4', body: 'Jeff\n\nline', attachmentNames: ['quote.pdf'] }, 4000), 'Test email #4 — Jeff\n\nline\n\nAttachments: quote.pdf');
    assert.equal(notesOf({ subject: null, body: 'no subject', attachmentNames: [] }, 4000), 'no subject');
    assert.equal(notesOf({ subject: 'S', body: 'x'.repeat(5000) }, 4000).length, 4000, 'capped');
});

test('email-inbound stores through the pure module, and the rails give the viewer first claim on Escape', () => {
    const s = code(read('netlify/functions/email-inbound.mjs'));
    assert.ok(s.includes("import { normaliseBodyText, htmlToText, attachmentNamesOf, notesOf, envelopeOf } from './_inboundText.mjs';"));
    assert.ok(s.includes('const text = normaliseBodyText(rawText);'), 'the body keeps its line breaks');
    assert.ok(!s.includes("replace(/\\s+/g, ' ')"), 'REGRESSION: the whitespace collapse is gone');
    assert.ok(s.includes('const attachmentNames = attachmentNamesOf(full ? full.attachments : mail.attachments);'));
    assert.ok(s.includes("notes: notesOf({ subject, body: text, attachmentNames }, NOTES_MAX) || 'Email (no body captured)',"));
    assert.ok(!s.includes('function htmlToText('), 'one htmlToText, in the pure module');
    for (const f of ['src/components/rails/ContactRail.jsx', 'src/components/rails/AccountRail.jsx', 'src/components/rails/TaskRail.jsx']) {
        const r = code(read(f));
        assert.ok(r.includes("const onKey = (e) => { if (e.key === 'Escape' && !isEditing && !viewingActivity) closeRail(); };"), f + ': the rail yields Escape to the viewer');
        assert.ok(r.includes('}, [isOpen, isEditing, viewingActivity]);'), f + ': and re-binds when the viewer opens or closes');
    }
});

// ── item 27 (state §0.105): the envelope — From, To, Cc, Message-ID ──────────

test('headerMapOf: both header shapes lower-cased into one map; garbage is {}', () => {
    assert.deepEqual(headerMapOf({ To: 'a@x.com', 'Message-ID': '<1@x>' }), { to: 'a@x.com', 'message-id': '<1@x>' });
    assert.deepEqual(headerMapOf([{ name: 'Cc', value: 'b@x.com' }, { key: 'To', value: 'a@x.com' }, { name: '' }]), { cc: 'b@x.com', to: 'a@x.com' });
    assert.deepEqual(headerMapOf(null), {});
    assert.deepEqual(headerMapOf('nope'), {});
});

test('emailAddressesIn: display names, angle brackets, commas — lower-cased addresses only', () => {
    assert.deepEqual(emailAddressesIn('Carl Client <Carl@Client.test>, "Dora" <dora@other.test>'), ['carl@client.test', 'dora@other.test']);
    assert.deepEqual(emailAddressesIn(''), []);
    assert.deepEqual(emailAddressesIn(undefined), []);
});

test('envelopeOf: the fetched message\'s HEADER To/Cc win over its envelope fields; From keeps the display name; Message-ID from the message', () => {
    const full = {
        from: { name: 'Ada Rep', email: 'ada@alpha.test' },
        to: [{ email: 'log-org-abc@inbound.test' }],          // the SMTP envelope — our dropbox — must NOT be the stored To
        headers: { To: 'Carl Client <carl@client.test>', Cc: 'dora@other.test, Ada Rep <ada@alpha.test>' },
        message_id: '<m1@alpha>',
    };
    assert.deepEqual(envelopeOf({ full, mail: { from: 'ignored@x.test' } }), {
        from: 'Ada Rep <ada@alpha.test>', to: ['carl@client.test'], cc: ['dora@other.test', 'ada@alpha.test'], messageId: '<m1@alpha>',
    });
});

test('envelopeOf: without a headers map the structured fields of the payload are the record; a flat payload works the same; everything present when unknown', () => {
    const full = { from: 'Ada Rep <ada@alpha.test>', to: ['carl@client.test', { email: 'x@y.test' }], cc: [], message_id: '<m2@alpha>' };
    assert.deepEqual(envelopeOf({ full }), { from: 'Ada Rep <ada@alpha.test>', to: ['carl@client.test', 'x@y.test'], cc: [], messageId: '<m2@alpha>' });
    const mail = { from: 'ada@alpha.test', to: ['log-org@inbound.test'], cc: ['carl@client.test'], message_id: '<m3@itest>' };
    assert.deepEqual(envelopeOf({ full: null, mail }), { from: 'ada@alpha.test', to: ['log-org@inbound.test'], cc: ['carl@client.test'], messageId: '<m3@itest>' });
    assert.deepEqual(envelopeOf({}), { from: '', to: [], cc: [], messageId: '' }, 'every field present, empty');
    assert.deepEqual(envelopeOf({ mail: { to: ['A@X.test', 'a@x.test'] } }).to, ['a@x.test'], 'de-duplicated, lower-cased');
    assert.equal(envelopeOf({ full: { headers: { 'Message-Id': '<h@x>' } } }).messageId, '<h@x>', 'a Message-ID only in the headers map is still found');
});

test('email-inbound stores the envelope on the row, from envelopeOf, beside the owner (item 27)', () => {
    const s = code(read('netlify/functions/email-inbound.mjs'));
    assert.ok(s.includes("import { normaliseBodyText, htmlToText, attachmentNamesOf, notesOf, envelopeOf } from './_inboundText.mjs';"));
    assert.ok(s.includes('        const envelope = envelopeOf({ full, mail });'), 'one envelope, from the fetched message and the payload');
    assert.ok(s.includes('            emailFrom: envelope.from || null,'), 'From is stored');
    assert.ok(s.includes('            emailTo: envelope.to,'), 'To is stored');
    assert.ok(s.includes('            emailCc: envelope.cc,'), 'Cc is stored');
    assert.ok(s.includes('            emailMessageId: envelope.messageId || null,'), 'REGRESSION: the Message-ID is stored — it was only ever hashed into the row id');
    const schema = read('db/schema.ts');
    for (const col of ["emailFrom:      text('email_from')", "emailTo:        jsonb('email_to')", "emailCc:        jsonb('email_cc')", "emailMessageId: text('email_message_id')"]) {
        assert.ok(schema.includes(col), `schema: ${col}`);
    }
    const apply = read('db/apply-email-headers.mjs');
    assert.ok(!/\b(DROP|ALTER COLUMN|TRUNCATE|DELETE)\b/.test(code(apply)), 'additive only (guide §18c)');
    assert.equal((code(apply).match(/ADD COLUMN IF NOT EXISTS/g) || []).length, 4, 'four nullable ADD COLUMNs');
    assert.ok(read('tests/integration/_schema-guard.mjs').includes("['activities', 'email_message_id'],"), 'the test-schema guard names the new column');
    const san = code(read('netlify/functions/activities.mjs'));
    assert.ok(!/email(From|To|Cc|MessageId)/.test(san), 'activities.mjs sanitize() never names the envelope, so a PUT from the editor cannot blank it');
});
