// _auditClientEntries.mjs — the entries the app's own screens write to the audit
// log, and nothing else (state §0.191). Pure: the unit suite runs it, and scans
// every addAudit call in src/ against it.
//
// Before it, audit-log.mjs's POST took any action and entity type a member sent
// (only quote events were refused, §0.156): a rep could post "user.role" or
// "settings.updated" with their own name on it, and the log — the evidence trail
// for every other control — read it as the app's. Now the POST takes only the
// pairs App.jsx's addAudit is called with. A new call site adds its pair here, or
// the scan in tests/audit-client-entries.test.mjs fails.
//
// Two gates: a CRM entry needs the CRM write roles (requireWrite), as before; a
// Dispatch entry needs the Dispatch module's own gate (dispatchGate) — the
// Dispatcher who schedules a crew may record it, though requireWrite refuses a
// Dispatcher every CRM write.
export const CLIENT_AUDIT_ENTRIES = Object.freeze({
    crm: Object.freeze({
        create: Object.freeze(['opportunity', 'account', 'contact', 'task']),
        update: Object.freeze(['opportunity', 'account', 'contact', 'task']),
        merge:  Object.freeze(['account', 'contact']),
    }),
    dispatch: Object.freeze({
        'dispatch.schedule':            Object.freeze(['dispatch_job']),
        'dispatch.schedule.override':   Object.freeze(['dispatch_job']),
        'dispatch.schedule.bulk':       Object.freeze(['dispatch_job']),
        'dispatch.reschedule':          Object.freeze(['dispatch_job']),
        'dispatch.reschedule.override': Object.freeze(['dispatch_job']),
        'dispatch.crew.hold':           Object.freeze(['dispatch_job']),
        'dispatch.crew.release':        Object.freeze(['dispatch_job']),
        'dispatch.timeoff.unassign':    Object.freeze(['dispatch_technician']),
    }),
});

// 'crm' | 'dispatch' | null. Exact strings: the app sends them exactly so, and a
// near-miss ("Update", " update") is not the app's entry.
export function clientAuditKind(action, entityType) {
    for (const kind of ['crm', 'dispatch']) {
        const types = Object.hasOwn(CLIENT_AUDIT_ENTRIES[kind], action) ? CLIENT_AUDIT_ENTRIES[kind][action] : null;
        if (types && types.includes(entityType)) return kind;
    }
    return null;
}
