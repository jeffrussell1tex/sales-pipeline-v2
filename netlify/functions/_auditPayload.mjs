// _auditPayload.mjs — the pure half of audit streaming (state §0.87).
//
// Everything here can be reached by `node --test` without a database: what a
// valid destination is, what a secret looks like, what gets sent, how it is
// signed, what the delivery state becomes after an attempt, and what the list
// shows. _auditStream.mjs (delivery) and audit-stream.mjs (the endpoint) are
// thin over these.
import { createHmac } from 'crypto';

export const DEST_FORMATS = Object.freeze(['JSON', 'NDJSON']);
export const MAX_CONSECUTIVE_FAILURES = 10;   // then the destination pauses itself
export const DELIVERY_TIMEOUT_MS = 4000;       // per destination, per audit write
export const SIGNATURE_HEADER = 'X-Accelerep-Signature';
export const NAME_MAX = 120;

// ── destination validation ───────────────────────────────────────────────────

// Hosts a customer's destination must never name: the function's own network.
// An https URL to 10.0.0.5 would turn the streamer into a probe of whatever
// sits beside it. Hostnames that merely RESOLVE to a private address are not
// caught here (that needs DNS at delivery time); the literal forms are.
export function isPrivateHost(host) {
    const h = String(host || '').toLowerCase().replace(/^\[|\]$/g, '');
    if (!h) return true;
    if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;
    const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (v4) {
        const [a, b] = [Number(v4[1]), Number(v4[2])];
        if (a === 10 || a === 127 || a === 0) return true;
        if (a === 169 && b === 254) return true;
        if (a === 172 && b >= 16 && b <= 31) return true;
        if (a === 192 && b === 168) return true;
        if (a === 100 && b >= 64 && b <= 127) return true;   // CGNAT
        return false;
    }
    if (h.includes(':')) {
        if (h === '::1' || h === '::') return true;
        if (/^f[cd][0-9a-f]{2}:/.test(h)) return true;        // fc00::/7 unique local
        if (/^fe[89ab][0-9a-f]:/.test(h)) return true;        // fe80::/10 link local
        if (h.startsWith('::ffff:')) return isPrivateHost(h.slice(7));
    }
    return false;
}

/**
 * { ok:true, value:{ name, url, fmt } } or { ok:false, error }.
 * https only, no credentials in the URL, no private host, a name of 1–120
 * characters, a format from DEST_FORMATS (default JSON).
 */
export function validateDestination(input = {}) {
    const name = String(input.name ?? '').trim();
    if (!name) return { ok: false, error: 'Destination name is required.' };
    if (name.length > NAME_MAX) return { ok: false, error: `Destination name must be ${NAME_MAX} characters or fewer.` };
    const raw = String(input.url ?? '').trim();
    if (!raw) return { ok: false, error: 'Endpoint URL is required.' };
    let u;
    try { u = new URL(raw); } catch { return { ok: false, error: 'Endpoint URL is not a valid URL.' }; }
    if (u.protocol !== 'https:') return { ok: false, error: 'Endpoint URL must use https://.' };
    if (u.username || u.password) return { ok: false, error: 'Endpoint URL must not carry credentials.' };
    if (isPrivateHost(u.hostname)) return { ok: false, error: 'Endpoint URL must be a public host.' };
    const fmt = input.fmt === undefined || input.fmt === null || input.fmt === '' ? 'JSON' : String(input.fmt).toUpperCase();
    if (!DEST_FORMATS.includes(fmt)) return { ok: false, error: `Format must be one of ${DEST_FORMATS.join(', ')}.` };
    return { ok: true, value: { name, url: u.toString(), fmt } };
}

// ── secrets ──────────────────────────────────────────────────────────────────

export const SECRET_RE = /^ast_[0-9a-f]{48}$/;
/** 'ast_' + 48 hex. `randomHex` is injectable for tests; the default is Node's CSPRNG. */
export function newSecret(randomHex = (n) => cryptoRandomHex(n)) {
    return 'ast_' + randomHex(24);
}
function cryptoRandomHex(bytes) {
    // Lazy import keeps this module free of a top-level dependency on
    // crypto.randomBytes for callers that only need the pure helpers.
    return globalThis.crypto.getRandomValues(new Uint8Array(bytes)).reduce((s, b) => s + b.toString(16).padStart(2, '0'), '');
}
export const secretHintOf = (secret) => String(secret || '').slice(-4);

// ── payloads and bodies ──────────────────────────────────────────────────────

/** One audit row as the customer receives it. Snake case, no internals. */
export function auditPayloadOf(row, { deliveryId, sentAt }) {
    return {
        type:        'audit',
        delivery_id: deliveryId,
        sent_at:     sentAt,
        id:          row?.id ?? null,
        org_id:      row?.orgId ?? null,
        action:      row?.action ?? null,
        entity_type: row?.entityType ?? null,
        entity_id:   row?.entityId ?? null,
        entity_name: row?.entityName ?? null,
        detail:      row?.detail ?? null,
        actor_id:    row?.userId ?? null,
        actor_name:  row?.userName ?? null,
        timestamp:   row?.timestamp instanceof Date ? row.timestamp.toISOString() : (row?.timestamp ?? null),
    };
}

/** The event "Send test event" delivers. The same headers and signature as a real row. */
export function testPayloadOf(orgId, dest, { deliveryId, sentAt }) {
    return {
        type:        'audit.test',
        delivery_id: deliveryId,
        sent_at:     sentAt,
        org_id:      orgId,
        destination: { id: dest?.id ?? null, name: dest?.name ?? null },
        message:     'Accelerep audit streaming test — if you can verify the signature on this request, real audit events will arrive the same way.',
    };
}

/** JSON, or one NDJSON line (the payload followed by a newline). */
export function bodyFor(payload, fmt) {
    const json = JSON.stringify(payload);
    return fmt === 'NDJSON' ? json + '\n' : json;
}

/** 'sha256=<hex>' — HMAC-SHA256 over the EXACT body bytes, keyed by the destination's secret. */
export function signBody(secret, body) {
    return 'sha256=' + createHmac('sha256', String(secret)).update(String(body), 'utf8').digest('hex');
}

export function deliveryHeaders({ signature, deliveryId, sentAt, type, fmt }) {
    return {
        'Content-Type':          fmt === 'NDJSON' ? 'application/x-ndjson' : 'application/json',
        [SIGNATURE_HEADER]:      signature,
        'X-Accelerep-Event':     type,
        'X-Accelerep-Delivery':  deliveryId,
        'X-Accelerep-Timestamp': sentAt,
        'User-Agent':            'Accelerep-AuditStream/1.0',
    };
}

// ── delivery state ───────────────────────────────────────────────────────────

export const isDelivered = (status) => Number.isInteger(status) && status >= 200 && status < 300;

/**
 * The column patch after one attempt. Success resets the failure count and
 * stamps delivery; a failure counts, and the tenth consecutive one pauses the
 * destination with the reason in lastError — a dead endpoint costs at most ten
 * slow writes. `at` is the attempt instant (a Date).
 */
export function nextDeliveryState(dest, { status, error = null, at }) {
    const attempt = at instanceof Date ? at : new Date(at);
    if (isDelivered(status)) {
        return {
            failures: 0, lastStatus: status, lastError: null, lastAttemptAt: attempt,
            lastDeliveredAt: attempt, deliveredCount: (dest?.deliveredCount || 0) + 1, updatedAt: attempt,
        };
    }
    const failures = (dest?.failures || 0) + 1;
    const pause = failures >= MAX_CONSECUTIVE_FAILURES;
    const reason = error || (status ? `Endpoint answered ${status}` : 'No response');
    return {
        failures, lastStatus: status ?? 0,
        lastError: pause ? `Paused after ${MAX_CONSECUTIVE_FAILURES} consecutive failures — last: ${reason}` : reason,
        lastAttemptAt: attempt, updatedAt: attempt,
        ...(pause ? { paused: true } : {}),
    };
}

// ── the list ─────────────────────────────────────────────────────────────────

export function statusOf(row) {
    if (!row) return 'Unknown';
    if (row.paused) return 'Paused';
    if (row.lastAttemptAt && !isDelivered(row.lastStatus)) return 'Failing';
    if (row.lastDeliveredAt) return 'Active';
    return 'Never delivered';
}

/** What the client sees: never the secret, never the ciphertext. */
export function destinationView(row) {
    if (!row) return null;
    const { secret, ...rest } = row;
    return { ...rest, secretHint: row.secretHint || null, status: statusOf(row) };
}
