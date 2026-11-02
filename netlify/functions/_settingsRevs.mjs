// The settings row's writes in SQL (state §0.224 — batch 4b-3, step B). Every writer of `settings.extra` writes only
// the keys it means to change, merged into the row as it stands at the write — never a whole `extra` from an earlier
// read — and sets a new revision token for each (src/utils/settingsRevs.js). The tokens are merged NESTED, from the
// row's own in the same statement: a top-level merge of `revs` alone would wipe or put back other keys' tokens, and a
// jsonb_set on a path whose parent may be missing silently writes nothing.
import { randomBytes } from 'crypto';
import { sql } from 'drizzle-orm';
import { settings } from '../../db/schema.js';
import { settingsSeeds, SEEDED_KEYS } from '../../src/utils/settingsDefaults.js';

/** A new revision token: random, so only the write that made it can hold it. */
export const mintRev = () => randomBytes(16).toString('base64url');

// The row's extra as an object — one that is not (none is, census C1) reads as {}, as the whole rewrite repaired it.
const extraObj = sql`(case when jsonb_typeof(${settings.extra}) = 'object' then ${settings.extra} else '{}'::jsonb end)`;

/** `{ revs: <the row's tokens> || <the new> }` — to be merged last. */
export const revsBumped = (newRevs) =>
    sql`jsonb_build_object('revs', (case when jsonb_typeof(${settings.extra}->'revs') = 'object' then ${settings.extra}->'revs' else '{}'::jsonb end) || ${JSON.stringify(newRevs)}::jsonb)`;

/** The key's stored token is the one read (none read: none stored). */
export const revUnchanged = (key, read) => sql`(${settings.extra}->'revs'->>${key}::text) is not distinct from ${read}::text`;

// The seeded defaults under the row (state §0.170 — a key the workspace has never saved reads as the default). An
// older row keeps its stages and pain points in their own columns: those, not the default, when they hold any
// (J-B3 — the GET's own rule, settings.mjs).
function seedsUnder() {
    const seeds = settingsSeeds();
    const fromColumn = (column, key) => sql`jsonb_build_object(${key}::text, (case when jsonb_typeof(${column}) = 'array' and jsonb_array_length(${column}) > 0 then ${column} else ${JSON.stringify(seeds[key])}::jsonb end))`;
    const rest = Object.fromEntries(SEEDED_KEYS.filter((k) => k !== 'funnelStages' && k !== 'painPoints').map((k) => [k, seeds[k]]));
    return sql`(${JSON.stringify(rest)}::jsonb || ${fromColumn(settings.stages, 'funnelStages')} || ${fromColumn(settings.painPoints, 'painPoints')})`;
}

/**
 * The settings PUT's `extra` on update: the seeded defaults, under the row as stored less the keys the PUT no longer
 * keeps (state §0.171), under this save's keys, its tokens merged last. jsonb `||` takes the right side, so a stored key
 * — even null — beats its default, and the save beats both.
 */
export function extraMerged(patch, dropped, newRevs) {
    const kept = dropped.reduce((acc, k) => sql`(${acc} - ${k}::text)`, extraObj);
    return sql`((${seedsUnder()} || ${kept}) || ${JSON.stringify(patch)}::jsonb) || ${revsBumped(newRevs)}`;
}

/** Another writer's `extra`: the row as it stands, this write's keys, their tokens. */
export const extraPatched = (patch, newRevs) =>
    sql`(${extraObj} || ${JSON.stringify(patch)}::jsonb) || ${revsBumped(newRevs)}`;
