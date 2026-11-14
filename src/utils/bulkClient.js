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

import { failureWords, refusalWords } from './refusalWords.js';

export const BULK_CHUNK = 400;   // must match BULK_CHUNK in netlify/functions/_bulk.mjs

// An import cut by an org switch stops before its next chunk (state §0.175): the
// chunk would carry the new org's token and file the last org's rows in it. The
// caller hands in `stillOrg` — whether the org that started the import is still
// the org on screen; without one, nothing stops.
export const ORG_SWITCHED = 'Stopped: the organization changed before every row was sent.';

// A refused chunk is said in refusalWords' words (§0.249, docs/design/refusal-sweep Part 12): the server's, with the
// ref of its log line (serverErrorBody's requestId — what makes the Netlify function log for this exact failure
// findable), else "The server returned N.". It said "Bulk import failed (502)." — the receipt that draws it already
// says what did not save ("400 did not save."), so no prefix of its own.

// The owner names each chunk's answer says no member matched, or more than one did (_lib.mjs stampOwnerIds,
// rekeyBulkOwners: those rows were saved with no owner, or an overwrite kept its own) — kept across the chunks, each
// name once, for the receipt to say (state §0.216; Jeff, 29 Oct, Q11). They were dropped here, and no screen said them.
const ownerNames = () => ({ ambiguous: new Set(), unmatched: new Set() });
const addOwners = (names, body) => {
    for (const n of Array.isArray(body?.ambiguousOwners) ? body.ambiguousOwners : []) names.ambiguous.add(n);
    for (const n of Array.isArray(body?.unmatchedOwners) ? body.unmatchedOwners : []) names.unmatched.add(n);
};
const ownersOut = (names) => ({ ambiguousOwners: [...names.ambiguous], unmatchedOwners: [...names.unmatched] });

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
    const postNew = async (url, items, { onProgress, progressOffset = 0, progressTotal = items.length, stillOrg } = {}) => {
        const landed = [];
        const failed = [];
        const owners = ownerNames();
        let error = null, done = 0;

        for (let i = 0; i < items.length && !error; i += BULK_CHUNK) {
            if (stillOrg && !stillOrg()) { error = ORG_SWITCHED; break; }
            const chunk = items.slice(i, i + BULK_CHUNK);
            // A chunk whose request threw (offline) ends the import with the house words, keeping what landed before it
            // (§0.249, docs/design/refusal-sweep Part 12): it threw out of the loop, so earlier chunks' rows, written
            // server-side, never reached the screen, and the importer said the raw "Failed to fetch" (18b15).
            let r;
            try { r = await fetchFn(url, { method: 'POST', body: JSON.stringify(chunk) }); } catch (e) { error = failureWords(e); break; }
            const body = await readJson(r);

            if (!r.ok) { error = refusalWords(r, body); break; }   // the server's words with their ref, else its status (§0.249)
            addOwners(owners, body);

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
        return { landed, failed, error, attempted: items.length, ...ownersOut(owners) };
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
    const putBulk = async (url, items, { onProgress, progressOffset = 0, progressTotal = items.length, stillOrg } = {}) => {
        const appliedIds = [];
        const notFound = [];
        const forbidden = [];
        const owners = ownerNames();
        let updated = 0, discrepancy = 0, error = null, done = 0;

        for (let i = 0; i < items.length && !error; i += BULK_CHUNK) {
            if (stillOrg && !stillOrg()) { error = ORG_SWITCHED; break; }
            const chunk = items.slice(i, i + BULK_CHUNK);
            let r;   // as postNew's: a chunk whose request threw ends the run, keeping what was applied (§0.249)
            try { r = await fetchFn(url, { method: 'PUT', body: JSON.stringify(chunk) }); } catch (e) { error = failureWords(e); break; }
            const body = await readJson(r);

            if (!r.ok) { error = refusalWords(r, body); break; }   // as postNew's (§0.249)
            addOwners(owners, body);

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
        return { appliedIds, updated, notFound, forbidden, discrepancy, error, attempted: items.length, ...ownersOut(owners) };
    };

    return { postNew, putBulk };
}
