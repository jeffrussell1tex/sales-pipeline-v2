// _inboundText.mjs — the pure half of turning a received email into activity
// text (state §0.93, Jeff's steps 7 and 9: "All lines are truncated into one
// long running paragraph … it does not indicate that I included an attachment").
//
// email-inbound.mjs had collapsed EVERY run of whitespace — newlines included —
// into one space before storing the body, so the viewer built to show an email
// with its line breaks kept had nothing to keep. Attachments were not looked at.
// Reachable by `node --test` without a database, like _slackWebhook.mjs.

/**
 * Body text as it will be stored: CRLF → LF; runs of spaces and tabs → one
 * space; no space hugging a newline; at most one blank line in a row; trimmed.
 * Line breaks SURVIVE — that is the point.
 */
export function normaliseBodyText(raw) {
    return String(raw ?? '')
        .replace(/\r\n?/g, '\n')
        .replace(/[ \t\f\v\u00a0]+/g, ' ')
        .replace(/ ?\n ?/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

const ENTITIES = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'" };

/**
 * HTML → text with the block structure kept as line breaks: <br> and the end of
 * a paragraph, div, list item, table row, heading or blockquote each become a
 * newline before the tags are stripped; the common entities are decoded. A
 * data: URI (Resend's html_format: 'data_uri') is decoded first. Bounded work —
 * regex over the string, no parser.
 */
export function htmlToText(html) {
    let h = String(html ?? '');
    if (h.startsWith('data:')) {
        const comma = h.indexOf(',');
        const meta = h.slice(0, comma);
        const payload = h.slice(comma + 1);
        try { h = meta.includes('base64') ? Buffer.from(payload, 'base64').toString('utf8') : decodeURIComponent(payload); }
        catch { h = ''; }
    }
    return h
        .replace(/<(style|script)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|li|tr|h[1-6]|blockquote|pre|table)>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&(nbsp|amp|lt|gt|quot|#39|apos);/g, (m) => ENTITIES[m] ?? m);
}

/**
 * The names of an email's attachments, for the record — the files themselves
 * are not stored. Accepts what a provider is likely to hand over (an array of
 * objects with filename/name, or of strings) and returns [] for anything else.
 */
export function attachmentNamesOf(list) {
    if (!Array.isArray(list)) return [];
    return list
        .map(a => (typeof a === 'string' ? a : (a && (a.filename || a.name)) || ''))
        .map(s => String(s).trim())
        .filter(Boolean)
        .slice(0, 50);
}

/** The stored notes: "<subject> — <body>", then an Attachments line when there are any. */
export function notesOf({ subject, body, attachmentNames = [] }, max) {
    const head = subject ? subject + ' — ' : '';
    const tail = attachmentNames.length ? '\n\nAttachments: ' + attachmentNames.join(', ') : '';
    return (head + body + tail).slice(0, max);
}

// ── The envelope (state §0.105, handoff item 27) ─────────────────────────────

/** Every email address in a raw header value — display names, angle brackets and commas tolerated — lower-cased. */
export const emailAddressesIn = (s) =>
    (String(s || '').match(/[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}/gi) || []).map(a => a.toLowerCase());

/**
 * Resend's parsed `headers` as one lower-cased map, whichever of its two shapes
 * arrived (an object map, or an array of { name | key, value }). {} for anything else.
 */
export function headerMapOf(headers) {
    const map = {};
    if (Array.isArray(headers)) {
        for (const it of headers) {
            const name = String((it && (it.name || it.key)) || '').toLowerCase();
            if (name) map[name] = (it && it.value) || '';
        }
    } else if (headers && typeof headers === 'object') {
        for (const k of Object.keys(headers)) map[k.toLowerCase()] = headers[k];
    }
    return map;
}

const listOf = (v) => [].concat(v ?? []).map(r => (r && typeof r === 'object') ? (r.email || '') : r);
const fromTextOf = (v) => {
    if (!v) return '';
    if (typeof v === 'string') return v.trim();
    if (typeof v === 'object') {
        const name = String(v.name || '').trim(), email = String(v.email || '').trim();
        return name && email ? `${name} <${email}>` : (email || name);
    }
    return '';
};

/**
 * What the row records about who the email was between: `from` as the provider
 * gave it ("Name <addr>" when both are known), `to` and `cc` as address lists,
 * and the RFC Message-ID. The header To/Cc win when the fetched message carries
 * a headers map (Resend's structured `to` is the SMTP envelope — our own
 * dropbox); otherwise the structured fields of whichever payload there is. Every
 * field is present, empty when unknown, so the viewer and the row agree.
 */
export function envelopeOf({ full, mail } = {}) {
    const map = headerMapOf(full && full.headers);
    const src = full || mail || {};
    const to = map.to ? emailAddressesIn(map.to) : listOf(src.to).flatMap(emailAddressesIn);
    const cc = map.cc ? emailAddressesIn(map.cc) : listOf(src.cc).flatMap(emailAddressesIn);
    const from = fromTextOf(src.from) || fromTextOf(mail && mail.from);
    const messageId = String((full && full.message_id) || (mail && mail.message_id) || (map['message-id'] || '')).trim();
    return {
        from: from.slice(0, 500),
        to: [...new Set(to)].slice(0, 50),
        cc: [...new Set(cc)].slice(0, 50),
        messageId: messageId.slice(0, 500),
    };
}
