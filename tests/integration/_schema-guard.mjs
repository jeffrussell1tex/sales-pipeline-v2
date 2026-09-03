// tests/integration/_schema-guard.mjs
//
// Fails ONE readable line instead of eighteen forty-line stack traces when the
// test database schema has drifted behind db/schema.ts.
//
// WHY THIS EXISTS (SESSION_HANDOFF section 5, and section 6 of the session before it)
// `test:int` targets DATABASE_URL_TEST -- a DIFFERENT Neon endpoint from the
// app's. Nothing keeps the two in step: `drizzle-kit push` runs against whichever
// config you name, and the test database is easy to forget because it has no UI
// and nobody looks at it.
//
// It has now drifted twice in two sessions. Both times the symptom was the same:
// every seeded suite died inside before() with a Postgres 42703 wrapped in the
// full Drizzle query, repeated once per test, and the actual instruction --
// "push the schema" -- appeared nowhere in several hundred lines of output.
//
// The check is deliberately CHEAP AND SPECIFIC. It asks the information schema
// whether the named columns exist. It does not compare the whole schema, because
// a full comparison is a second implementation of drizzle-kit that would drift
// on its own and start lying about a database that is fine.
//
// Add a column here when a schema change lands that the integration suites
// depend on. One line, and the next person gets a sentence instead of a wall.

import { sql } from 'drizzle-orm';

// [table, column] pairs the suites need. Newest first -- the most recently added
// column is the one most likely to be missing.
const REQUIRED = [
    ['audit_stream_destinations', 'id'],   // §0.87: audit streaming destinations (db/apply-audit-stream.mjs --test)
    ['coaching_notes', 'id'],      // §0.82: coaching notes in their own table
    ['users',          'team_joined_at'],   // §0.82: the first-day floor for team notes
    // Phase 2: ownership keys on ids. Every object-level authorization check
    // reads these, so a test database without them refuses every owned record
    // and the suites fail as 403s rather than as a missing column.
    ['accounts',      'owner_id'],
    ['contacts',      'owner_id'],
    ['opportunities', 'owner_id'],
    ['tasks',         'owner_id'],
    ['leads',         'owner_id'],
    ['activities',    'owner_id'],
    ['users', 'clerk_user_id'],   // identity split: users.id is app-owned, Clerk's id is an attribute
];

export async function assertTestSchema(db) {
    let present;
    try {
        const res = await db.execute(sql`
            SELECT table_name, column_name
              FROM information_schema.columns
             WHERE table_schema = 'public'
        `);
        const rows = Array.isArray(res) ? res : (res?.rows ?? []);
        present = new Set(rows.map((r) => `${r.table_name}.${r.column_name}`));
    } catch (e) {
        throw new Error(
            `Could not read the test database schema: ${e.message}\n` +
            `  Is DATABASE_URL_TEST set, and is that database reachable?`
        );
    }

    const missing = REQUIRED.filter(([t, c]) => !present.has(`${t}.${c}`));
    if (missing.length === 0) return;

    throw new Error(
        `\n\n  THE TEST DATABASE SCHEMA IS BEHIND db/schema.ts.\n\n` +
        `  Missing: ${missing.map(([t, c]) => `${t}.${c}`).join(', ')}\n\n` +
        `  Fix it with:\n\n` +
        `      npx drizzle-kit push --config=drizzle.test.config.ts\n\n` +
        `  That config exists because the app database and the test database are\n` +
        `  DIFFERENT Neon endpoints, and it refuses to run against the app one by\n` +
        `  host. Pushing to DATABASE_URL from the shell here does not work: under\n` +
        `  MINGW64 the node wrapper writes nothing to a pipe, so the URL captures\n` +
        `  as an empty string and drizzle-kit reports url: '' while appearing to\n` +
        `  have been overridden.\n\n` +
        `  Nothing below this line ran.\n`
    );
}
