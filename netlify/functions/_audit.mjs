// _audit.mjs — what a deleted record leaves behind.
//
// WHY THIS EXISTS
// ---------------
// Every entity's DELETE branch had the same shape: `clear=true` was Admin-gated
// AND audited, while the per-id delete beneath it was neither. Six endpoints,
// six single-record deletes, zero audit records. A deal, account, lead, contact,
// task or activity could be removed and leave no trace whatsoever.
//
// A hard delete destroys the audit trail's subject, so the audit record has to
// carry enough to reconstruct what was lost. `entityId` alone is useless once the
// row is gone — nothing can resolve it back to a name.
//
// Pure and dependency-free: the endpoints all import db/index.js (TypeScript) and
// load only under `tsx`, outside the gates. Same reasoning as _bulk.mjs.

// Fields worth preserving per entity, in the order they read best. Deliberately
// short — this is a description for a human reading an audit log, not a backup.
const SNAPSHOT_FIELDS = {
    opportunity: ['account', 'stage', 'arr', 'salesRep', 'forecastedCloseDate'],
    account:     ['verticalMarket', 'city', 'state', 'accountOwner', 'phone'],
    lead:        ['company', 'status', 'email', 'assignedTo'],
    contact:     ['company', 'title', 'email', 'phone'],
    task:        ['status', 'dueDate', 'assignedTo', 'relatedTo'],
    activity:    ['type', 'date', 'relatedTo', 'createdBy'],
};

// The human-readable name of a row, per entity.
const NAME_FIELDS = {
    opportunity: ['opportunityName', 'account'],
    account:     ['name'],
    lead:        ['name', 'company', 'email'],
    contact:     ['firstName', 'lastName', 'email'],
    task:        ['title'],
    activity:    ['subject', 'type'],
};

export function entityName(entityType, row) {
    if (!row) return '(unknown)';
    const keys = NAME_FIELDS[entityType] || ['name'];
    if (entityType === 'contact') {
        const full = [row.firstName, row.lastName].filter(Boolean).join(' ').trim();
        return full || row.email || '(unnamed)';
    }
    for (const k of keys) {
        const v = row[k];
        if (v !== null && v !== undefined && String(v).trim() !== '') return String(v);
    }
    return '(unnamed)';
}

/**
 * A one-line reconstruction of the deleted row.
 *
 * Values are truncated and the whole string is capped, because an audit `detail`
 * column is not a place to put a 4,000-character notes field. Empty fields are
 * omitted rather than rendered as "notes: null", which would bury the fields that
 * do carry information.
 */
export function deletionSnapshot(entityType, row) {
    if (!row) return 'no row data captured';
    const fields = SNAPSHOT_FIELDS[entityType] || [];
    const parts = [];
    for (const k of fields) {
        const v = row[k];
        if (v === null || v === undefined || String(v).trim() === '') continue;
        parts.push(`${k}=${String(v).slice(0, 60)}`);
    }
    // No outer cap. Each value is already truncated at 60 characters and there
    // are at most five snapshot fields, so a total cap could never fire — the
    // mutation harness proved it by surviving its removal. A clause that cannot
    // fire is worse than none (0A0000.3).
    return parts.length ? parts.join(' · ') : 'no populated fields';
}

/**
 * The full audit payload for a single-record delete, ready for writeAudit().
 * Built here rather than inline at six call sites so the shape cannot drift.
 */
export function deletionAudit(entityType, row, { userId = null, byRole = null } = {}) {
    const name = entityName(entityType, row);
    const who = byRole ? ` by ${byRole}` : '';
    return {
        action:     `${entityType}.deleted`,
        entityType,
        entityId:   row?.id ?? 'unknown',
        entityName: name,
        detail:     `Deleted${who}: ${name} \u2014 ${deletionSnapshot(entityType, row)}`,
        userId,
    };
}
