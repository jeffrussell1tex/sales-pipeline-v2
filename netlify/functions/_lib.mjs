// _lib.mjs — shared helpers for Netlify functions.
import { randomUUID } from 'crypto';

// Browser origins allowed to call the API. Kept in sync with the Clerk
// authorizedParties list in auth.mjs. Exported for the CORS follow-up; any
// origin not on this list already fails Clerk auth.
export const ALLOWED_ORIGINS = [
    'https://salespipelinetracker.com',
    'https://sales-pipeline-v2.netlify.app',
    'https://accelerep.netlify.app',
    'http://localhost:5173',
    'http://localhost:8888',
];
const PRIMARY_ORIGIN = 'https://salespipelinetracker.com';

// Echo the caller's origin only if allow-listed; otherwise the primary domain.
export function allowOrigin(event) {
    const origin = event?.headers?.origin || event?.headers?.Origin || '';
    return ALLOWED_ORIGINS.includes(origin) ? origin : PRIMARY_ORIGIN;
}

// Standardized 500 body: logs the real error server-side with a correlation id
// and returns ONLY a generic message + that id to the client, so DB driver text
// and stack traces never leak. Returns the JSON string for use as a 500 body.
export function serverErrorBody(err, label = 'function') {
    const requestId = randomUUID();
    console.error(`[${label}] error ${requestId}:`, err?.message, err?.stack);
    return JSON.stringify({ error: 'Internal server error', requestId });
}
