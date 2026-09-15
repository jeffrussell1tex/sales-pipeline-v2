// tests/audit-coverage.test.mjs
//
// Every write path writes the audit log (state §0.143; Jeff, with the log's
// last 24 hours on screen — fourteen rows for a day of saved reports,
// schedules, deliveries and Claude readings: "change audit so that it shows
// all the things that you think it should"). Before: fifteen functions wrote
// audit rows and twenty-nine that change or send things wrote none. Now the
// guard below fails the moment a function that writes the database, sends
// something out, or hands data to a model has no audit call — an allowlist
// names the few that are exempt and WHY. Source scans throughout (§18b23);
// the writer itself hits the database.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const FN = new URL('../netlify/functions/', import.meta.url);
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const src = (name) => readFileSync(new URL(name, FN), 'utf8');
const code = (s) => s.split(/\r?\n/).filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');
const audits = (name) => (code(src(name)).match(/\b(?:auditAs|writeAudit)\(/g) || []).length;

// Files that write the database (or send) and are EXEMPT from the guard — each with its reason.
const EXEMPT = {
    'auth.mjs':                'authentication, no record of its own',
    'crypto.mjs':              'cipher.update is not a database write',
    'audit-log.mjs':           'IS the log — its POST writes the row directly',
    'users-sync.mjs':          'writes its own audit row (users.synced) directly',
    'public-api.mjs':          'read-only API keyed access; its update is the key-usage stamp',
    'calendar-oauth-start.mjs': 'OAuth state, no caller action of record',
    'email-inbound.mjs':       'Resend’s webhook — no caller; the activity it writes is the record',
    'dispatch-automations.mjs': 'the rules engine — its run history is the record',
    'pipeline-alerts.mjs':     'a scheduled job — the heartbeat is its record',
    'task-reminders.mjs':      'a scheduled job — the heartbeat is its record',
    'score-leads-batch.mjs':   'a scheduled job — the heartbeat is its record',
};
// Functions that write NO table but hand data to a model or send it out — they must audit too.
const MUST_AUDIT_ANYWAY = ['report-prompt.mjs', 'ai-score.mjs', 'quote-email.mjs', 'invite-user.mjs'];

test('THE GUARD — every function that writes the database audits, unless the allowlist says why not', () => {
    const files = readdirSync(FN).filter(f => f.endsWith('.mjs') && !f.startsWith('_'));
    const silent = [];
    for (const f of files) {
        const s = code(src(f));
        const writes = /\.(insert|update|delete)\(/.test(s);
        const must = MUST_AUDIT_ANYWAY.includes(f);
        if (!writes && !must) continue;
        if (EXEMPT[f]) continue;
        if (audits(f) === 0) silent.push(f);
    }
    assert.deepEqual(silent, [], `these write and never audit — add auditAs()/writeAudit() or an EXEMPT entry with a reason:\n  ${silent.join('\n  ')}`);
    for (const f of Object.keys(EXEMPT)) assert.ok(files.includes(f), `EXEMPT names a file that does not exist: ${f}`);
});

test('_lib.auditAs names the caller: the log’s Actor column reads userName, and a bare Clerk id is what a row without it shows', () => {
    const lib = code(read('netlify/functions/_lib.mjs'));
    assert.ok(lib.includes('export async function auditAs(orgId, clerkUserId, fields) {'));
    assert.ok(lib.includes('try { userName = clerkUserId ? await getCallerName(clerkUserId, orgId) : null; } catch { userName = null; }'), 'the name lookup never throws into the write path');
    assert.ok(lib.includes('return writeAudit(orgId, { ...fields, userId: clerkUserId || null, userName });'));
});

// ── the actions, per file — the literal strings the log will carry ───────────
const ACTIONS = {
    'saved-reports.mjs':            ['saved_report.created', 'saved_report.updated', 'saved_report.shared', 'saved_report.unshared', 'saved_report.scheduled', 'saved_report.sent_now', 'saved_report.deleted'],
    'report-deliveries.mjs':        ['report_delivery.sent', 'report_delivery.failed'],
    'report-prompt.mjs':            ['ai.report_prompt'],
    'ai-score.mjs':                 ['ai.deal_scored'],
    'quotes.mjs':                   ['quote.created', 'quote.updated', 'quote.submitted', 'quote.approved', 'quote.rejected', 'quote.sent', 'quote.accepted', 'quote.deleted'],
    'quote-email.mjs':              ['quote.emailed'],
    'products.mjs':                 ['product.created', 'product.updated', 'product.deactivated'],
    'automations.mjs':              ['automation.created', 'automation.updated', 'automation.deleted'],
    'webhooks.mjs':                 ['webhook.created', 'webhook.updated', 'webhook.secret_rotated', 'webhook.deleted'],
    'api-keys.mjs':                 ['apikey.created', 'apikey.revoked'],
    'documents.mjs':                ['document.created', 'document.version_added', 'document.version_restored', 'document.linked', 'document.updated', 'document.unlinked', 'document.deleted'],
    'dashboard-configs.mjs':        ['dashboard.updated'],
    'export-dsr.mjs':               ['dsr.created', 'dsr.updated', 'dsr.deleted'],
    'export-runs.mjs':              ['export.run'],
    'export-schedules.mjs':         ['export_schedule.created', 'export_schedule.updated', 'export_schedule.deleted'],
    'spiff-claims.mjs':             ['spiff_claim.submitted', 'spiff_claim.updated', 'spiff_claim.approved', 'spiff_claim.rejected', 'spiff_claim.paid', 'spiff_claim.deleted'],
    'calendar-connections.mjs':     ['calendar.disconnected'],
    'recommendation-log.mjs':       ['recommendation.dismissed'],
    'backup.mjs':                   ['backup.created', 'backup.schedule_set', 'backup.restored'],
    'merge.mjs':                    ['account.merged', 'contact.merged', 'account.merge_undone', 'contact.merge_undone'],
    'invite-user.mjs':              ['user.invited'],
    'lead-intake.mjs':              ['lead.received'],
    'train-lead-model.mjs':         ['lead_model.trained'],
    'dispatch-jobs.mjs':            ['dispatch_job.created', 'dispatch_job.updated', 'dispatch_job.deleted', 'dispatch_job.line_item_added', 'dispatch_job.line_item_removed'],
    'dispatch-technicians.mjs':     ['dispatch_technician.created', 'dispatch_technician.updated', 'dispatch_technician.deleted'],
    'dispatch-vehicles.mjs':        ['dispatch_vehicle.created', 'dispatch_vehicle.updated', 'dispatch_vehicle.deleted'],
    'dispatch-equipment.mjs':       ['dispatch_equipment.created', 'dispatch_equipment.updated', 'dispatch_equipment.deleted', 'dispatch_equipment.checked_out', 'dispatch_equipment.checked_in'],
    'dispatch-customers.mjs':       ['dispatch_customer.created', 'dispatch_customer.updated', 'dispatch_customer.deleted', 'dispatch_location.created', 'dispatch_location.updated', 'dispatch_location.deleted'],
    'dispatch-service-plans.mjs':   ['dispatch_plan.created', 'dispatch_plan.updated', 'dispatch_plan.deleted'],
    'dispatch-schedule-blocks.mjs': ['dispatch_block.created', 'dispatch_block.updated', 'dispatch_block.deleted'],
    'dispatch-plan-visits.mjs':     ['dispatch_visit.logged', 'dispatch_visit.deleted'],
};

test('every action the batch adds is a literal in its file (the log carries these words; a template string would hide them from this pin)', () => {
    for (const [file, actions] of Object.entries(ACTIONS)) {
        const s = code(src(file));
        for (const a of actions) {
            assert.ok(s.includes(`'${a}'`), `${file} carries '${a}'`);
            assert.ok(a.length <= 50, `${a} fits varchar(50)`);
        }
    }
});

test('the two AI calls and the job say what left the app and as whom', () => {
    const p = code(src('report-prompt.mjs'));
    assert.ok(p.includes("action: 'ai.report_prompt', entityType: 'ai_reading', entityId: 'report-prompt', entityName: prompt.slice(0, 120),"), 'the sentence is the entity');
    assert.ok(p.includes("detail: `${REPORT_PROMPT_MODEL} · ${usingOrgKey ? 'the workspace’s key' : 'the site key'} · ${outcome}`"), 'which key, what happened');
    const a = code(src('ai-score.mjs'));
    assert.ok(a.includes("action: 'ai.deal_scored', entityType: 'opportunity', entityId: opportunityId, entityName: opp.opportunityName || opp.account || 'Unnamed',"), 'a deal handed to the model is logged on the deal');
    const j = code(src('report-deliveries.mjs'));
    assert.ok(j.includes("if (trigger === 'schedule') await writeAudit(row.orgId, {"), 'the job audits its own sends; Send now is the endpoint’s event');
    assert.ok(j.includes("userId: null, userName: 'Report delivery job',"), 'the job is named as the actor');
});

test('saved reports: the schedule event carries the schedule in words; a share is its own event; Send now records where it went', () => {
    const s = code(src('saved-reports.mjs'));
    assert.ok(s.includes("import { serverErrorBody, auditAs } from './_lib.mjs';"));
    assert.ok(s.includes("import { cleanDelivery, deliverySummary } from '../../src/utils/reportDelivery.js';"));
    assert.ok(s.includes("const action = 'delivery' in data ? 'saved_report.scheduled' : ('isShared' in data && !('name' in data) && !('dims' in data)) ? (data.isShared ? 'saved_report.shared' : 'saved_report.unshared') : 'saved_report.updated';"));
    assert.ok(s.includes("detail: action === 'saved_report.scheduled' ? deliverySummary(updated.config?.delivery) : null"));
    assert.ok(s.includes("action: 'saved_report.sent_now', entityType: 'saved_report', entityId: row.id, entityName: row.name,"));
});

test('the log’s categories know the new entity types', () => {
    const ui = code(read('src/Tabs/settings/audit/AuditDetail.jsx'));
    for (const t of ['saved_report', 'report_delivery', 'product', 'document', 'dashboard', 'spiff_claim', 'recommendation', 'dispatch_job', 'dispatch_customer', 'dispatch_technician', 'lead_model']) assert.ok(ui.includes(`${t}:'data'`), `${t} → data`);
    for (const t of ['ai_reading', 'dsr', 'export_schedule', 'backup', 'calendar_connection']) assert.ok(ui.includes(`${t}:'security'`), `${t} → security`);
    assert.ok(ui.includes("automation:'admin'"));
});
