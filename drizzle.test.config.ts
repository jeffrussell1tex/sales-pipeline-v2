import { defineConfig } from 'drizzle-kit';

// drizzle.test.config.ts — schema push for the TEST database ONLY.
//
// Usage:
//     npx drizzle-kit push --config=drizzle.test.config.ts
//
// WHY THIS FILE EXISTS
// --------------------
// The default drizzle.config.ts reads NETLIFY_DATABASE_URL, which points at the
// shared main branch that dev AND production both use. `drizzle-kit push` alters
// schema, so aiming it there changes both environments in a single command. The
// test database is a separate Neon endpoint and needs its own target.
//
// It cannot be done from the shell on this machine. Under MINGW64 the node
// wrapper reports "stdout is not a tty" and writes nothing to a pipe, so
//
//     export NETLIFY_DATABASE_URL="$(node --env-file=.env -p '...')"
//
// captures an empty string and drizzle-kit reports `url: ''` — while looking as
// though the override was applied. The env file is therefore loaded here, in
// process, where that wrapper is not involved.
try {
    // Node 20.12+. Throws if .env is absent, which is fine — the check below
    // then reports the real problem rather than a missing-file stack trace.
    (process as NodeJS.Process & { loadEnvFile?: (p: string) => void }).loadEnvFile?.('.env');
} catch {
    /* .env is optional; DATABASE_URL_TEST may already be exported */
}

const url = process.env.DATABASE_URL_TEST || '';
if (!url) {
    throw new Error(
        'DATABASE_URL_TEST is not set. Refusing to fall back to a default database — ' +
        'the default is the branch dev and production share.'
    );
}

// GUARD RAIL. The whole risk this file manages is pointing a schema-altering
// command at live data. The app database and the test database are different
// Neon endpoints, so the host is a reliable discriminator: if the test variable
// ever resolves to the app's endpoint, something is misconfigured and the push
// must not proceed.
const APP_DB_HOST_FRAGMENT = 'ep-soft-morning';
const host = new URL(url).host;
if (host.includes(APP_DB_HOST_FRAGMENT)) {
    throw new Error(
        `Refusing to push: ${host} is the SHARED APP database (dev + production), ` +
        'not the test branch. Check DATABASE_URL_TEST in .env.'
    );
}
console.log('drizzle-kit target:', host);

export default defineConfig({
    schema: './db/schema.ts',
    out: './drizzle',
    dialect: 'postgresql',
    dbCredentials: { url },
});
