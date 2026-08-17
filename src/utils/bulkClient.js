// bulkClient.js — the client half of 18b8. Chunked POST and PUT for the CSV
// importer, over an injected fetch.
//
// WHY THIS IS ITS OWN MODULE
// --------------------------
// These two helpers lived at module scope in ModalLayer.jsx, which imports React,
// so neither could be reached by `node --test` — and chunk size, accumulation
// across chunks and the never-throw contract are all invisible in the return
// value. A single request and four chunked ones respond identically. Same
// reasoning as netlify/functions/_bulk.mjs, which is the server half of exactly
// this rule and takes an injected `client` for exactly this reason.
//
// makeBulkClient takes the fetch function rather than importing dbFetch, so the
// recording stub in tests/bulk-client.test.mjs goes in through the front door: no
// module mocks, no --experimental flag, no window.

export const BULK_CHUNK = 400;   // must match BULK_CHUNK in netlify/functions/_bulk.mjs

// Pull the most useful message out of an error response.
// serverErrorBody returns a requestId; surfacing it is what makes the Netlify
// function log for this exact failure findable.
const errorFrom = (status, body, fallback) => {
    if (body?.error) return body.requestId ? `${body.error} (ref ${body.requestId})` : body.error;
    return `${fallback} (${status}).`;
};

// dbFetch returns a Response and NEVER throws on 4xx/5xx (guide 18b1), so every
// path here checks res.ok. A body that is not JSON is not an exception either —
// a proxy 502 is HTML.
const readJson = async (r) => {
    try { return await r.json(); } catch { return null; }
};

export function makeBulkClient(fetchFn) {
    if (typeof fetchFn !== 'function') {
        throw new TypeError('makeBulkClient requires a fetch function');
    }

    const report = (onProgress, offset, done, total) => {
        if (typeof onProgress === 'function') onProgress(offset + done, total);
    };

    // ── POST new records, reporting EXACTLY which ones landed ────────────────
    //
    // Never throws. Guide 18b15: an early chunk that succeeded has to reach state
    // before the failure is reported, and throwing from inside the loop discards
    // it. The caller commits `landed` first and raises second.
    const postNew = async (url, items, { onProgress, progressOffset = 0, progressTotal = items.length } = {}) => {
        const landed = [];
        const failed = [];
        let error = null, done = 0;

        for (let i = 0; i < items.length && !error; i += BULK_CHUNK) {
            const chunk = items.slice(i, i + BULK_CHUNK);
            const r = await fetchFn(url, { method: 'POST', body: JSON.stringify(chunk) });
            const body = await readJson(r);

            if (!r.ok) { error = errorFrom(r.status, body, 'Bulk import failed'); break; }

            if (Array.isArray(body?.insertedIds)) {
                const ids = new Set(body.insertedIds);
                for (const row of chunk) (ids.has(row.id) ? landed : failed).push(row);
            } else {
                // Older deploy with no insertedIds — fall back to the count.
                const n = body?.inserted ?? chunk.length;
                landed.push(...chunk.slice(0, n));
                failed.push(...chunk.slice(n));
            }

            done += chunk.length;
            report(onProgress, progressOffset, done, progressTotal);
        }
        // `attempted` is the caller's whole list. Rows in chunks after a fatal
        // error were never sent, and reporting only `failed` would omit them.
        return { landed, failed, error, attempted: items.length };
    };

    // ── PUT overwrites, reporting exactly which ids the server accepted ──────
    //
    // Never throws — the previous version threw from inside its own loop, so a
    // failure on chunk 3 discarded the accumulated counts from chunks 1 and 2
    // even though those rows were already written server-side. That is the exact
    // shape 18b15 forbids for postNew; it was live here.
    //
    // `appliedIds` is the point of this function. bulkUpsert partitions each
    // chunk into notFound / forbidden / eligible and reports the first two as id
    // arrays, so the ids that actually took are (sent − notFound − forbidden).
    // The caller applies local state from exactly those and nothing else.
    //
    // If that derivation disagrees with the server's own `updated` count, the
    // chunk's ids are EXCLUDED rather than guessed at, and counted as a
    // discrepancy. Applying an ambiguous set is how the UI came to show records
    // that were never written; the honest answer is that this chunk's outcome is
    // unknown and a refresh will settle it.
    const putBulk = async (url, items, { onProgress, progressOffset = 0, progressTotal = items.length } = {}) => {
        const appliedIds = [];
        const notFound = [];
        const forbidden = [];
        let updated = 0, discrepancy = 0, error = null, done = 0;

        for (let i = 0; i < items.length && !error; i += BULK_CHUNK) {
            const chunk = items.slice(i, i + BULK_CHUNK);
            const r = await fetchFn(url, { method: 'PUT', body: JSON.stringify(chunk) });
            const body = await readJson(r);

            if (!r.ok) { error = errorFrom(r.status, body, 'Bulk update failed'); break; }

            const chunkNotFound  = Array.isArray(body?.notFound)  ? body.notFound  : [];
            const chunkForbidden = Array.isArray(body?.forbidden) ? body.forbidden : [];
            const chunkUpdated   = body?.updated || 0;

            const rejected = new Set([...chunkNotFound, ...chunkForbidden]);
            const applied  = chunk.map(row => row.id).filter(id => !rejected.has(id));

            notFound.push(...chunkNotFound);
            forbidden.push(...chunkForbidden);
            updated += chunkUpdated;

            if (applied.length === chunkUpdated) {
                appliedIds.push(...applied);
            } else {
                discrepancy += Math.abs(applied.length - chunkUpdated);
            }

            done += chunk.length;
            report(onProgress, progressOffset, done, progressTotal);
        }
        return { appliedIds, updated, notFound, forbidden, discrepancy, error, attempted: items.length };
    };

    return { postNew, putBulk };
}
