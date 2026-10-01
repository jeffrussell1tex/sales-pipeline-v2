// _dispatchGate.mjs — the ONE gate in front of the Dispatch module (§0.152,
// guide §18b46). Every dispatch-* endpoint, invoices.mjs and quote-to-job.mjs
// (its POST) call it where they used to call requireWrite.
//
// Before it, each endpoint gated on requireWrite alone — "any non-ReadOnly role
// has full write access to all dispatch-* records" — so a sales rep scheduled
// crews and raised invoices, and a workspace with Dispatch turned OFF still
// answered every dispatch endpoint (only quote-to-job read the switch). Jeff:
// reps "should not have dispatch power"; a Dispatcher role runs it.
//
// This file is the one read the gate needs — the org's settings.extra — and the
// decision is _dispatchDecision.mjs (pure; the unit suite runs it), which reads
// dispatchAccessOf (src/utils/roles.js — the client's tab, nav and quote card
// read the same function).
//
// The read is by orgId only, and a FAILED read answers 500 — it never defaults:
// this decides who may touch the module, so a failed read must not pick a fail
// direction. The gate returns that 500 rather than throwing, because every
// caller invokes it before its own try/catch.
//
// Returns { response } — return it as-is — or { access, extra } to proceed; the
// extra saves a caller that needs another org setting (quote-to-job's product
// types) a second read.
import { db } from '../../db/index.js';
import { settings as settingsTable } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { dispatchDecision } from './_dispatchDecision.mjs';

export async function orgExtraOf(orgId) {
    if (!orgId) throw new Error('_dispatchGate: orgId is required');
    const [row] = await db.select({ extra: settingsTable.extra }).from(settingsTable).where(eq(settingsTable.orgId, orgId)).limit(1);
    return row?.extra && typeof row.extra === 'object' ? row.extra : {};
}

export async function dispatchGate(auth, event, headers, opts = {}) {
    let extra;
    try {
        extra = await orgExtraOf(auth?.orgId);
    } catch (err) {
        console.error('dispatchGate: the workspace settings could not be read', err?.message);
        return { response: { statusCode: 500, headers, body: JSON.stringify({ error: 'Server error: the workspace settings could not be read' }) } };
    }
    return dispatchDecision(auth, event, headers, extra, opts);
}
