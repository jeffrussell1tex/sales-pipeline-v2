// _dispatchDecision.mjs — the Dispatch gate's decision, pure (no db, no Clerk).
//
// _dispatchGate.mjs reads the org's settings.extra and hands it here; the unit
// suite (tests/dispatch-gate.test.mjs) RUNS this with every role and switch, so
// the mutation harness proves the decision itself rather than a scan of it
// (the gate imports db/index.js, which `npm test` cannot load).
//
// Returns { response } — a ready 403 — or { access, extra } to proceed:
//   the module OFF          403 for everyone, whatever the role
//   'full'                  proceed (Admin, Manager, Dispatcher; a rep where the org opens it)
//   'tech'                  a read proceeds; a write only where the endpoint opts in
//   'read'                  a read proceeds; a write is 403 (ReadOnly)
//   'none', module on       403 — a rep whose org keeps reps out, or a value no rule knows
// Each refusal names its rule: the body is the only way to tell them apart.
import { dispatchAccessOf } from '../../src/utils/roles.js';

const MUTATING = ['POST', 'PUT', 'PATCH', 'DELETE'];
const refuse = (headers, error) => ({ statusCode: 403, headers, body: JSON.stringify({ error }) });

export const DISPATCH_OFF_MESSAGE  = 'Dispatch is not enabled for this workspace. Turn it on under Settings → Features & AI first.';
export const DISPATCH_REPS_MESSAGE = 'Forbidden: Dispatch is not open to sales reps in this workspace';
export const DISPATCH_TECH_MESSAGE = 'Forbidden: technicians may only update their own assigned jobs';
export const DISPATCH_READ_MESSAGE = 'Forbidden: read-only role';
export const DISPATCH_UNKNOWN_MESSAGE = 'Forbidden: unrecognised role for Dispatch';

export function dispatchDecision(auth, event, headers, extra, { allowTechnician = false } = {}) {
    const ex = extra && typeof extra === 'object' ? extra : {};
    if (!ex.dispatchEnabled) return { response: refuse(headers, DISPATCH_OFF_MESSAGE) };
    const access = dispatchAccessOf(auth?.userRole, ex);
    const mutating = MUTATING.includes(event?.httpMethod);
    if (access === 'full') return { access, extra: ex };
    if (access === 'tech') {
        if (mutating && !allowTechnician) {
            console.warn('dispatchGate: technician write blocked', event?.httpMethod, 'for user', auth?.userId);
            return { response: refuse(headers, DISPATCH_TECH_MESSAGE) };
        }
        return { access, extra: ex };
    }
    if (access === 'read') {
        if (mutating) return { response: refuse(headers, DISPATCH_READ_MESSAGE) };
        return { access, extra: ex };
    }
    console.warn('dispatchGate: blocked', JSON.stringify(auth?.userRole), event?.httpMethod, 'for user', auth?.userId);
    return { response: refuse(headers, auth?.userRole === 'User' ? DISPATCH_REPS_MESSAGE : DISPATCH_UNKNOWN_MESSAGE) };
}
