// scripts/seed-qa-org.mjs — seed the QA test org (state §0.153; Jeff, 1 Oct:
// "Should we create a clean set of test data for a new test instance").
//
//   node --env-file=.env --import tsx scripts/seed-qa-org.mjs --org=org_…              dry run (the default)
//   node --env-file=.env --import tsx scripts/seed-qa-org.mjs --org=org_… --apply      insert the seed rows that are missing
//   node --env-file=.env --import tsx scripts/seed-qa-org.mjs --org=org_… --apply --reset
//                                                                                       …and put the seed's OWN rows back to its values
//
// The data is scripts/qa-seed-plan.mjs (pure; tests/qa-seed.test.mjs runs it).
// This file is the guarded writer, and it writes to the SHARED database (dev and
// prod share Neon `main`), so every guard fails closed:
//   1. --org is required, and Clerk must name that org exactly "Accelerep QA"
//      (--expect-name=… for another QA org) — a typo'd id never reaches a real org.
//   2. The roster is read from THIS org's users table (sync it in Settings →
//      Users first); a deal is owned by a real roster user or by nobody.
//   3. The org must hold no rows the seed did not write (ids without `_qa_`) in
//      the tables it fills — refused, and named, unless --allow-existing.
//   4. Every row's keys must be columns of its table — a renamed column stops
//      the run instead of being dropped silently.
//   5. The org's settings row must already exist, written by the APP, with
//      Dispatch on: an Admin turning it on under Settings → Features & AI saves
//      the whole settings object. This script never writes that row; a partial
//      one reads back blank wherever a key is missing (qa-seed-plan.mjs says how).
//   6. It NEVER deletes. --apply inserts missing seed rows only; --reset also
//      rewrites rows whose id carries `_qa_` in this org, and nothing else.
//      Settings are MERGED: a key Jeff already set in the org wins over the seed.
import { createClerkClient } from '@clerk/backend';
import { eq, and, like, notLike, inArray, count, desc } from 'drizzle-orm';
import { getTableColumns } from 'drizzle-orm';
import { buildQaSeed, QA_ID_MARK } from './qa-seed-plan.mjs';
import { todayYmd } from '../src/utils/invoices.js';

const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, ...v] = a.replace(/^--/, '').split('='); return [k, v.length ? v.join('=') : true]; }));
const orgId = typeof args.org === 'string' ? args.org.trim() : '';
const expectName = typeof args['expect-name'] === 'string' ? args['expect-name'] : 'Accelerep QA';
const APPLY = args.apply === true, RESET = args.reset === true, ALLOW_EXISTING = args['allow-existing'] === true;
const die = (msg) => { console.error(`\nREFUSED: ${msg}\n`); process.exit(1); };
// The seed's mark as a LIKE pattern. `_` is LIKE's one-character wildcard, so the
// mark's underscores are escaped (a backslash is Postgres's default LIKE escape):
// unescaped, '%_qa_%' matched any id with "qa" inside it, and the foreign-row
// guard below would have counted such a row as the seed's own.
const QA_ID_LIKE = `%${QA_ID_MARK.replace(/_/g, '\\_')}%`;

if (!/^org_[A-Za-z0-9]+$/.test(orgId)) die('pass the QA org id: --org=org_…');
if (RESET && !APPLY) die('--reset only makes sense with --apply');
if (!process.env.CLERK_SECRET_KEY) die('CLERK_SECRET_KEY is not set — run with node --env-file=.env');
if (!process.env.NETLIFY_DATABASE_URL) die('NETLIFY_DATABASE_URL is not set — run with node --env-file=.env');

// ── 1. Clerk must name the org ─────────────────────────────────────────────
const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
let clerkOrg;
try { clerkOrg = await clerk.organizations.getOrganization({ organizationId: orgId }); }
catch { die(`Clerk has no organization ${orgId}`); }
if (clerkOrg.name !== expectName) die(`${orgId} is "${clerkOrg.name}", not "${expectName}" — this script seeds the QA org only`);

const { db } = await import('../db/index.js');
const S = await import('../db/schema.js');

// ── 2. the roster ──────────────────────────────────────────────────────────
const roster = await db.select({ id: S.users.id, clerkUserId: S.users.clerkUserId, name: S.users.name, role: S.users.role, active: S.users.active })
    .from(S.users).where(eq(S.users.orgId, orgId));
const plan = buildQaSeed({ orgId, today: todayYmd(), roster: roster.filter(u => u.active !== false) });

const TABLES = [
    ['products', S.products], ['accounts', S.accounts], ['contacts', S.contacts], ['opportunities', S.opportunities],
    ['leads', S.leads], ['tasks', S.tasks], ['activities', S.activities], ['quotes', S.quotes],
    ['dispatchTechnicians', S.dispatchTechnicians], ['dispatchCustomers', S.dispatchCustomers],
    ['dispatchJobs', S.dispatchJobs], ['dispatchJobLineItems', S.dispatchJobLineItems], ['invoices', S.invoices],
];

// ── 3. nobody else's rows ──────────────────────────────────────────────────
const foreign = [];
for (const [name, table] of TABLES) {
    const [{ n }] = await db.select({ n: count() }).from(table).where(and(eq(table.orgId, orgId), notLike(table.id, QA_ID_LIKE)));
    if (Number(n) > 0) foreign.push(`${name}: ${n}`);
}
if (foreign.length && !ALLOW_EXISTING) die(`the org already holds rows the seed did not write (${foreign.join(', ')}). Pass --allow-existing to seed beside them.`);

// ── 4. every key is a column ────────────────────────────────────────────────
for (const [name, table] of TABLES) {
    const cols = new Set(Object.keys(getTableColumns(table)));
    for (const row of plan.rows[name]) {
        const bad = Object.keys(row).filter(k => !cols.has(k));
        if (bad.length) die(`${name}.${row.id}: not columns of the table — ${bad.join(', ')}`);
    }
}

// ── 5. the settings row is the app's ───────────────────────────────────────
// The row the GET serves (newest first, as settings.mjs reads it). Refused when
// there is none, or Dispatch is off: both are fixed in the app, not here. And
// refused when it is partial: the Features screen's Save sends only its own
// switches, and the rest (stages, field visibility, quotas, KPIs) arrives with
// the autosave that follows it (useSettings.js) — a row without them means that
// did not happen, and seeding onto it would test a blank org.
const [existingSettings] = await db.select().from(S.settings).where(eq(S.settings.orgId, orgId)).orderBy(desc(S.settings.updatedAt)).limit(1);
if (!existingSettings) die(`${clerkOrg.name} has no settings row yet. Sign in to localhost:8888 as its Admin, turn on Dispatch under Settings → Features & AI (the app saves its whole settings then), and rerun.`);
if (existingSettings.extra?.dispatchEnabled !== true) die(`Dispatch is off in ${clerkOrg.name}. Turn it on under Settings → Features & AI and rerun: the seed's jobs and invoices need it.`);
if (!(existingSettings.extra?.funnelStages?.length || existingSettings.stages?.length) || !Object.keys(existingSettings.fieldVisibility || {}).length) die(`${clerkOrg.name}'s settings row has no stages or no field visibility: partial, which the app's own saves do not leave. Stop and look before seeding onto it.`);

// ── the report ──────────────────────────────────────────────────────────────
console.log(`\nAccelerep QA seed — ${clerkOrg.name} (${orgId}), today ${plan.today}${APPLY ? (RESET ? ' — APPLY + RESET' : ' — APPLY') : ' — DRY RUN (nothing is written)'}`);
console.log(`Roster: ${roster.length} — ${roster.map(u => `${u.name} (${u.role})`).join(', ')}`);
console.log(`Owners: deals of ${plan.roles.repA} and ${plan.roles.repB}; Manager ${plan.roles.manager || '— none on the roster'}; Technician ${plan.roles.technician || '— none: the first technician record is unlinked'}${foreign.length ? `; beside existing rows (${foreign.join(', ')})` : ''}`);

const mergedExtra = { ...plan.settings.extra, ...(existingSettings?.extra || {}) };
const added = Object.keys(plan.settings.extra).filter(k => !(k in (existingSettings?.extra || {})));
console.log(`settings: the app's row — ${added.length ? 'adds ' + added.join(', ') : 'nothing to add'} (keys already set are kept)`);

const pending = [];
for (const [name, table] of TABLES) {
    const rows = plan.rows[name];
    const have = new Set((await db.select({ id: table.id }).from(table).where(and(eq(table.orgId, orgId), inArray(table.id, rows.map(r => r.id))))).map(r => r.id));
    const fresh = rows.filter(r => !have.has(r.id));
    console.log(`${name.padEnd(22)} ${String(rows.length).padStart(3)} in the plan · ${String(fresh.length).padStart(3)} new · ${String(have.size).padStart(3)} already there${have.size ? (RESET ? ' (reset to the seed)' : ' (kept)') : ''}`);
    pending.push({ name, table, rows, fresh });
}
if (!APPLY) { console.log('\nDry run — nothing written. Re-run with --apply to write.\n'); process.exit(0); }

// ── 6. write: insert-only, or reset the seed's own rows ────────────────────
// Only when a key is missing: "nothing to add" writes nothing to the org's settings.
if (added.length) {
    await db.update(S.settings).set({ extra: mergedExtra, updatedAt: new Date() })
        .where(and(eq(S.settings.id, existingSettings.id), eq(S.settings.orgId, orgId)));
}
for (const { name, table, rows, fresh } of pending) {
    if (RESET) {
        for (const row of rows) {
            const { id, ...set } = row;
            await db.insert(table).values(row).onConflictDoUpdate({
                target: table.id, set: { ...set, updatedAt: new Date() },
                setWhere: and(eq(table.orgId, orgId), like(table.id, QA_ID_LIKE)),
            });
        }
    } else if (fresh.length) {
        await db.insert(table).values(fresh).onConflictDoNothing({ target: table.id });
    }
    console.log(`  wrote ${name}`);
}
console.log(`\nDone. Sign in to localhost:8888 and switch to ${clerkOrg.name}.\n`);
process.exit(0);
