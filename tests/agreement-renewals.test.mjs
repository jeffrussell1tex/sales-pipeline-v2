// tests/agreement-renewals.test.mjs
//
// The wiring around planVisits.js (state §0.110): the hourly job's renewal
// pass and its preference, the Slack switch, the report's blind spot for the
// dedupe rows, the recipient's toggle, the dispatch tab reading the recorded
// exceptions and stamping the grid date, the plans endpoint carrying
// renewalLeadDays, and the exceptions endpoint refusing another org's customer.
// Behaviour that spans Clerk-authed functions and React is pinned by source
// scan (§18b23); the arithmetic runs in plan-visits.test.mjs and the endpoint
// against the real test database in dispatch-plan-visits.itest.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SLACK_HOURLY_KEYS, slackAlertEnabled } from '../src/utils/slackAlerts.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const code = (src) => src.split(/\r?\n/).filter(l => !l.trim().startsWith('//')).join('\n');

test('pipeline-alerts: a renewal pass per org — recipients are that org\'s Admins and Managers, emailed behind their preference, Slack under the company switch, deduped on the customer', () => {
    const s = code(read('netlify/functions/pipeline-alerts.mjs'));
    assert.ok(s.includes("import { buildRenewalQueue }                          from '../../src/utils/planVisits.js';"), 'one arithmetic with the queue');
    assert.ok(s.includes('    agreementRenewal: { enabled: true  },'), 'the preference defaults on');
    assert.ok(s.includes("u.orgId === orgId && reachable(u) && (u.role === 'Admin' || u.role === 'Manager'));"), 'recipients are the org\'s Admins and Managers, active, with an address that is no placeholder (§0.306)');
    assert.ok(s.includes("if (wantsAlert(resolvedProfile, 'agreementRenewal')) {"), 'the email is behind the recipient\'s preference');
    assert.ok(s.includes("if (await wasRecentlyAlerted(orgId, u.name, cust.id, 'renewal')) { skipped++; continue; }"), 'one email per recipient per customer per DEDUP_DAYS');
    assert.ok(s.includes("sendSlackToOrg(orgId, slackTemplates.agreementRenewal(detail), 'agreementRenewal');"), 'the post carries its type, so the company switch applies');
    assert.ok(s.includes("wasRecentlyAlerted(orgId, '__org__', cust.id, 'renewal-slack')"), 'one post per customer per DEDUP_DAYS');
    const start = 'let renewalsSent = 0, renewalOrgsFailed = 0, renewalsUnread = false;';
    assert.ok(s.includes('} // end for loop') && s.includes(start) && s.indexOf(start) > s.indexOf('} // end for loop'), 'runs after the deal loop, so a failure there cannot stop the deal signals');
    // Since §0.311 each org on its own, and a failure said: counted, the run a 500 — never a 200 over it.
    assert.ok(s.includes("            renewalsUnread = true;\n            console.error('pipeline-alerts: agreement renewals failed:', err.message);") && s.indexOf("console.error('pipeline-alerts: agreement renewals failed:', err.message);") > s.indexOf(start), 'a read of every org\'s customers or plans that fails is said');
    assert.ok(s.includes('                } catch (err) {\n                    renewalOrgsFailed++;\n'), 'one org\'s pass that fails is counted (the next org said: failed-reads.test.mjs runs it)');
    const words = ['            unreadOrgs.size && `momentum not judged for ${unreadOrgs.size} org(s): their stages could not be read`,',
        "            overdueUnread && 'the overdue-task scan could not read the rules or the tasks: no org\\'s overdue rules ran',",
        "            renewalsUnread && 'the renewal scan could not read the customers or the plans: no org\\'s renewals were said',",
        '            renewalOrgsFailed && `renewals not said for ${renewalOrgsFailed} org(s): their pass failed`,'];
    assert.ok(words.every((w) => s.includes(w)) && words.every((w, i) => i === 0 || s.indexOf(words[i - 1]) < s.indexOf(w)), 'the run says each — the momentum words first, as they were, then the overdue scan\'s, then the renewals\'');
    assert.ok(s.includes("        ].filter(Boolean);\n        if (unsaid.length) return { statusCode: 500,"), 'only what failed, a 500');
});

test('slackAlerts: agreementRenewal is an hourly type the company can switch off', () => {
    assert.ok(SLACK_HOURLY_KEYS.includes('agreementRenewal'));
    assert.equal(slackAlertEnabled({ alerts: { agreementRenewal: false } }, 'agreementRenewal'), false);
    assert.equal(slackAlertEnabled({ alerts: {} }, 'agreementRenewal'), true, 'absent is on');
});

test('templates: the email and the Slack post exist and say when', () => {
    const e = code(read('netlify/functions/send-email.mjs'));
    assert.ok(e.includes('agreementRenewal({ recipientName, customerName, customerNumber, planName, expiry, daysLeft, expired, orgId }) {'));   // its footer's preferences link names the org (§0.237)
    assert.ok(e.includes("const when = expired ? `expired ${n} day${n === 1 ? '' : 's'} ago`"));
    const k = code(read('netlify/functions/send-slack.mjs'));
    assert.ok(k.includes('agreementRenewal: ({ customerName, customerNumber, planName, expiry, daysLeft, expired }) => {'));
    assert.ok(k.includes("url: APP_URL, action_id: 'view_dispatch'"));
});

test('recommendation-log: the report never lists the renewal dedupe rows', () => {
    const s = code(read('netlify/functions/recommendation-log.mjs'));
    assert.ok(s.includes("import { eq, and, desc, gte, lte, notLike } from 'drizzle-orm';"));   // lte since AI scoring batch 3 (a next step's window)
    // The GET's own filter, read in its block: since AI scoring batch 3 the outcome pass (judgePending) writes the same
    // line, and a whole-file match passed with the GET's taken away (the full harness, 17 Nov).
    const getAt = s.indexOf("if (event.httpMethod === 'GET') {"), baseAt = s.indexOf('const base = [', getAt);
    assert.ok(getAt > -1 && baseAt > getAt);
    const base = s.slice(baseAt, s.indexOf('];', baseAt));
    assert.ok(base.includes("notLike(recommendationLog.actionType, 'renewal%'),"), 'both the per-rep and the org-wide read exclude them');
});

test('AppHeader: the recipient\'s toggle exists, is labelled, and shows only to Admins and Managers', () => {
    const s = code(read('src/components/layout/AppHeader.jsx'));
    assert.ok(s.includes("        agreementRenewal:   { enabled: true,  mode: 'instant' },"));
    assert.ok(s.includes("        agreementRenewal: 'Maintenance agreement expiring (Dispatch)',"));
    assert.ok(s.includes("if (alertType === 'agreementRenewal' && !isManager && !isAdmin) return null;"));
});

test('DispatchTab: the queue reads the recorded exceptions, a deferred visit stamps its grid date, the renewals and actions are wired', () => {
    const s = code(read('src/Tabs/DispatchTab.jsx'));
    assert.ok(s.includes("import { planVisitState, buildVisitQueue, buildRenewalQueue, renewedExpiry } from '../utils/planVisits.js';"));
    assert.ok(!/^const planVisitState = /m.test(s) && !/^const buildVisitQueue = /m.test(s), 'the local copies are gone — one arithmetic');
    assert.ok(s.includes("dbFetch('/.netlify/functions/dispatch-plan-visits'),"), 'the exceptions load with the rest of dispatch');
    assert.ok(s.includes("['service plans', plansRes], ['plan visits', visitsRes],"), 'a failed load is reported, not an empty list');
    assert.ok(s.includes('() => buildVisitQueue(customers, servicePlans, jobs, todayYmd, planVisits),'), 'the queue honours skips and deferrals');
    assert.ok(s.includes('const st = planVisitState(c, plan, jobs, todayStr, planVisits);'), 'so do the customer list\'s overdue counts');
    assert.ok(s.includes('            planDueDate:   row.occurrence || row.due,'), 'a job for a deferred occurrence stamps the grid date');
    assert.ok(s.includes('() => buildRenewalQueue(customers, servicePlans, todayYmd),'));
    assert.ok(s.includes('<ServiceDueView rows={visitQueue} renewals={renewalQueue} exceptions={exceptionVisits} today={todayYmd}'));
    // Jeff deferred the test visit three weeks out and it "became unviewable": a
    // deferral past the lead window is 'upcoming', which the queue excludes by
    // design — so every exception the queue does not show is listed under it, with undo.
    assert.ok(s.includes("const hidden = (exceptions || []).filter(e => e.visit.action === 'skipped' || !queued.has(exceptionKey(e)));"),
        'skips and out-of-window deferrals are listed under the queue');
    assert.ok(s.includes("{deferred ? 'Undo deferral' : 'Undo skip'}"), 'each can be undone from the list');
    assert.ok(s.includes('onSkip={skipVisit} onDefer={deferVisit} onUndo={undoVisit} onRenew={renewAgreement}'));
    // Each action writes first and adopts the server's row; a refusal is shown above the queue.
    // Moved pins (state §0.248, docs/design/refusal-sweep Part 11): the ok check first, the server's words with their ref
    // (readRefusal) — it said "(HTTP N)"; a failure that never reached the server said too (failureWords).
    // Moved in §0.263 (the unknown-save rule, Part 4): only the server's own refusal (r.heard) says "not"; any other
    // answer, and a throw, may have written — said by maybeSaid.
    assert.ok(s.includes("if (stillOrg(askedOrg)) setVisitActionError(r.heard ? `The visit was not ${action} — ${r.words}` : maybeSaid('The visit', action, r.words));"));
    assert.ok(s.includes("if (stillOrg(askedOrg)) setVisitActionError(r.heard ? `The agreement was not renewed — ${r.words}` : maybeSaid('The agreement', 'renewed', r.words));"));
    for (const [from, to] of [['    const recordVisit = async (', '    const skipVisit '], ['    const renewAgreement = (row) => {', '    const startBridgeJob = ']]) {
        const fn = s.slice(s.indexOf(from), s.indexOf(to));
        assert.ok(fn.length > 200 && fn.includes('const r = await writeRefusalOf(res);') && fn.includes('failureWords(e)'), `${from.trim()}: the refusal's words, and a failure's`);
    }
    assert.ok(s.includes('const next = renewedExpiry(row.customer, todayYmd, 12);'), 'renewal keeps the anniversary');
    assert.ok(s.includes('planVisits={planVisits}'), 'the customer list receives the exceptions');
});

test('service plans: renewalLeadDays is read, created and updated; the panel offers it', () => {
    const f = code(read('netlify/functions/dispatch-service-plans.mjs'));
    assert.ok(f.includes('renewalLeadDays: row.renewalLeadDays ?? row.renewal_lead_days ?? null,'));
    assert.ok(f.includes('renewalLeadDays: Number.isFinite(parseInt(data.renewalLeadDays, 10)) ? Math.max(0, parseInt(data.renewalLeadDays, 10)) : null,'));
    assert.ok(f.includes("if ('renewalLeadDays' in data) {"));
    const p = code(read('src/Tabs/settings/dispatch/DispatchServicePlansDetail.jsx'));
    assert.ok(p.includes('<Field label="Renewal reminder"'));
    assert.ok(p.includes("onChange={e => set('renewalLeadDays', e.target.value)}"));
    // Moved in §0.291: the new plan's draft goes on past the default — every field the form shows, so what another member set
    // since is told from what this one typed.
    assert.ok(p.includes("leadDays: 14, renewalLeadDays: 60, anchorMode: 'fixed', description: null, visitTemplateId: null, includedHours: null, responseHours: null, price: null, billingPeriod: 'annual', discountPercent: null }); setError(''); }}"), 'a new plan starts at the default');
    // Each field the form sets is in that draft (the custom interval apart: the resend reads it as stored).
    const form = p.slice(p.indexOf('const PlanForm = ('), p.indexOf('export const DispatchServicePlansDetail = ('));
    assert.ok(p.includes('const PlanForm = (') && p.includes('export const DispatchServicePlansDetail = ('));
    const from = p.indexOf("setDraft({ id: 'plan_' + crypto.randomUUID(), _isNew: true,");
    assert.ok(from > -1);
    const seed = p.slice(from, p.indexOf('})', from));
    const shown = [...new Set([...form.matchAll(/\bset\('(\w+)'/g)].map((m) => m[1]))];
    assert.equal(shown.length, 15, `the form's fields: ${shown}`);
    assert.deepEqual(shown.filter((k) => !new RegExp(`[ {]${k}: `).test(seed)), ['intervalDays'], 'a field the form shows and a new plan leaves out');
    const schema = code(read('db/schema.ts'));
    assert.ok(schema.includes("renewalLeadDays:  integer('renewal_lead_days'),"));
    assert.ok(schema.includes("export const dispatchPlanVisits = pgTable('dispatch_plan_visits', {"));
    assert.ok(schema.includes("uniqueIndex('dispatch_plan_visits_occurrence_uq').on(t.orgId, t.customerId, t.planId, t.dueDate),"));
});

test('dispatch-plan-visits: one row per occurrence, the customer must be this org\'s, dates are validated, behind the one Dispatch gate', () => {
    const s = code(read('netlify/functions/dispatch-plan-visits.mjs'));
    assert.ok(s.includes("import { dispatchGate } from './_dispatchGate.mjs';"));
    assert.ok(s.includes('const gate = await dispatchGate(auth, event, headers);') && s.includes('if (gate.response) return gate.response;'), 'the one Dispatch gate (§0.152)');
    assert.ok(s.includes('const linked = await checkLinks(PLAN_VISIT_LINKS, data, null, orgId);') && s.includes("const PLAN_VISIT_LINKS = [{ key: 'customerId', kind: 'customer' }, { key: 'planId', kind: 'plan' }];"),
        'another org\'s customer — or plan — is a 404 in batch 4\'s words, never a row (§0.201)');
    assert.ok(s.includes('.where(and(eq(dispatchCustomers.id, data.customerId), eq(dispatchCustomers.orgId, orgId)));'), 'the customer lookup is org-scoped');
    assert.ok(s.includes('target: [dispatchPlanVisits.orgId, dispatchPlanVisits.customerId, dispatchPlanVisits.planId, dispatchPlanVisits.dueDate],'), 'a second decision about the same occurrence replaces the first');
    assert.ok(s.includes("if (!isYmd(data.dueDate)) return { statusCode: 400,"));
    assert.ok(s.includes("if (data.action === 'deferred' && (!isYmd(deferredTo) || deferredTo === data.dueDate)) {"));
    assert.ok(s.includes('.where(and(eq(dispatchPlanVisits.id, id), eq(dispatchPlanVisits.orgId, orgId)))'), 'DELETE is org-scoped');
});
