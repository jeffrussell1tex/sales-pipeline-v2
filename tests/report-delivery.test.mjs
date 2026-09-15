// tests/report-delivery.test.mjs
//
// Saved reports: sharing, scheduled email or Slack delivery, pin to Home
// (state §0.135; Jeff's §9 item). The pure module is RUN here — the allowlisted
// schedule, when a delivery is due in its own zone, the table / text / blocks
// / html a delivered report becomes — and the endpoint, the job, the profile
// allowlist, the library and Home are source scans (§18b23).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    DELIVERY_CADENCES, WEEKDAYS, MAX_DELIVERY_ROWS, isTimezone, cleanDelivery, deliveryHasChannel, localClock, deliveryDue,
    deliverySummary, deliveryTable, deliveryText, periodLabel, slackBlocksForReport, deliveryHtmlTable,
} from '../src/utils/reportDelivery.js';
import { runReport } from '../src/utils/reportQuery.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const code = (src) => src.split(/\r?\n/).filter(l => !l.trim().startsWith('//')).join('\n');

// ── the schedule ─────────────────────────────────────────────────────────────
test('cleanDelivery is an allowlist: only the schedule’s keys survive, each coerced; nothing that is not an object', () => {
    assert.equal(cleanDelivery(null), null);
    assert.equal(cleanDelivery('weekly'), null);
    assert.equal(cleanDelivery([1]), null);
    const d = cleanDelivery({ enabled: 'yes', cadence: 'hourly', hour: '27', weekday: 9, dayOfMonth: 31, timezone: 'Mars/Olympus', emailTo: ['usr_a', 'usr_a', 7, ' usr_b ', ''], slack: 1, orgId: 'org_B', ownerId: 'x', lastDeliveredAt: 5, lastError: 'e'.repeat(400) });
    assert.deepEqual(d, { enabled: false, cadence: 'weekly', hour: 8, weekday: 1, dayOfMonth: 1, timezone: 'UTC', emailTo: ['usr_a', 'usr_b'], slack: false, lastDeliveredAt: null, lastError: 'e'.repeat(300) });
    assert.ok(!('orgId' in d) && !('ownerId' in d), 'a body cannot smuggle a column through the schedule');
    const ok = cleanDelivery({ enabled: true, cadence: 'monthly', hour: 17, dayOfMonth: 15, timezone: 'America/Chicago', emailTo: ['usr_1'], slack: true, lastDeliveredAt: '2026-09-01T00:00:00.000Z' });
    assert.equal(ok.enabled, true); assert.equal(ok.cadence, 'monthly'); assert.equal(ok.hour, 17); assert.equal(ok.dayOfMonth, 15); assert.equal(ok.timezone, 'America/Chicago'); assert.equal(ok.slack, true); assert.equal(ok.lastDeliveredAt, '2026-09-01T00:00:00.000Z');
    assert.equal(DELIVERY_CADENCES.length, 3); assert.equal(WEEKDAYS[0], 'Sunday');
    assert.ok(isTimezone('UTC') && isTimezone('Europe/London') && !isTimezone('') && !isTimezone('Nowhere/Land') && !isTimezone(5));
});

test('a schedule with nobody to send to is not a schedule; the summary says what it is', () => {
    assert.equal(deliveryHasChannel(cleanDelivery({ enabled: true })), false);
    assert.equal(deliveryHasChannel(cleanDelivery({ enabled: true, slack: true })), true);
    assert.equal(deliveryHasChannel(cleanDelivery({ enabled: true, emailTo: ['usr_1'] })), true);
    assert.equal(deliverySummary(null), 'Not scheduled');
    assert.equal(deliverySummary({ enabled: true, cadence: 'weekly', hour: 8, weekday: 1, timezone: 'America/Chicago', emailTo: ['a', 'b'], slack: true }), 'Every week · Monday 08:00 America/Chicago · email to 2 · Slack');
    assert.equal(deliverySummary({ enabled: true, cadence: 'monthly', hour: 17, dayOfMonth: 15, timezone: 'UTC' }), 'Every month · day 15 17:00 UTC · no recipients');
    assert.equal(deliverySummary({ enabled: false, cadence: 'daily', hour: 6, timezone: 'UTC', slack: true }), 'Every day · 06:00 UTC · off');
});

test('localClock reads the wall clock in the schedule’s zone, not the server’s', () => {
    // 2026-09-14 13:00 UTC is a Monday: 08:00 in Chicago (CDT), 22:00 Monday in Tokyo...
    const now = new Date('2026-09-14T13:00:00Z');
    assert.deepEqual(localClock(now, 'UTC'), { hour: 13, weekday: 1, day: 14 });
    assert.deepEqual(localClock(now, 'America/Chicago'), { hour: 8, weekday: 1, day: 14 });
    assert.deepEqual(localClock(now, 'Asia/Tokyo'), { hour: 22, weekday: 1, day: 14 });
    // 2026-09-14 03:00 UTC is Sunday evening in Chicago and Monday in Tokyo.
    const late = new Date('2026-09-14T03:00:00Z');
    assert.deepEqual(localClock(late, 'America/Chicago'), { hour: 22, weekday: 0, day: 13 });
    assert.deepEqual(localClock(late, 'Asia/Tokyo'), { hour: 12, weekday: 1, day: 14 });
    assert.deepEqual(localClock(late, 'Not/AZone'), localClock(late, 'UTC'), 'an unknown zone reads as UTC, never throws');
});

test('deliveryDue: the hour in the zone, the weekday or the day of month for the cadence, and never twice in one window', () => {
    const monday13z = new Date('2026-09-14T13:00:00Z');   // Monday 08:00 Chicago
    const weekly = { enabled: true, cadence: 'weekly', hour: 8, weekday: 1, timezone: 'America/Chicago', emailTo: ['usr_1'] };
    assert.equal(deliveryDue(weekly, monday13z).due, true);
    assert.equal(deliveryDue({ ...weekly, hour: 9 }, monday13z).due, false, 'not the hour');
    assert.equal(deliveryDue({ ...weekly, weekday: 2 }, monday13z).due, false, 'not the day');
    assert.equal(deliveryDue({ ...weekly, enabled: false }, monday13z).due, false, 'off');
    assert.equal(deliveryDue({ ...weekly, emailTo: [] }, monday13z).due, false, 'no recipients');
    assert.equal(deliveryDue(weekly, monday13z, '2026-09-13T13:00:00Z').due, false, 'sent yesterday: still inside the weekly window');
    assert.equal(deliveryDue(weekly, monday13z, '2026-09-07T13:00:00Z').due, true, 'sent a week ago: due again');
    assert.equal(deliveryDue({ ...weekly, lastDeliveredAt: '2026-09-14T12:30:00Z' }, monday13z).due, false, 'the stamp on the schedule itself counts');
    const daily = { enabled: true, cadence: 'daily', hour: 13, timezone: 'UTC', slack: true };
    assert.equal(deliveryDue(daily, monday13z).due, true);
    assert.equal(deliveryDue(daily, monday13z, '2026-09-14T12:59:00Z').due, false, 'a minute ago is this window');
    assert.equal(deliveryDue(daily, monday13z, '2026-09-13T13:00:00Z').due, true, '24h ago is the next window');
    assert.equal(deliveryDue(daily, new Date('2026-09-14T14:00:00Z')).due, false, 'the next hour is not the hour');
    const monthly = { enabled: true, cadence: 'monthly', hour: 8, dayOfMonth: 14, timezone: 'America/Chicago', slack: true };
    assert.equal(deliveryDue(monthly, monday13z).due, true);
    assert.equal(deliveryDue({ ...monthly, dayOfMonth: 15 }, monday13z).due, false);
    assert.equal(deliveryDue(monthly, monday13z, '2026-08-20T13:00:00Z').due, false, 'sent 25 days ago: this month’s window');
    assert.equal(deliveryDue(monthly, monday13z, '2026-08-14T13:00:00Z').due, true, 'a month ago: due');
    assert.equal(deliveryDue(null, monday13z).due, false);
});

// ── what a delivered report becomes ──────────────────────────────────────────
const opps = [
    { id: 'o1', stage: 'Proposal',   salesRep: 'Karen', arr: '40000', forecastedCloseDate: '2026-10-15', createdDate: '2026-08-01' },
    { id: 'o2', stage: 'Closed Won', salesRep: 'Karen', arr: '60000', wonDate: '2026-07-10', createdDate: '2026-05-01' },
    { id: 'o3', stage: 'Discovery',  salesRep: 'Ryan',  arr: '25000', forecastedCloseDate: '2026-11-01', createdDate: '2026-09-01' },
];
const result = runReport({ source: 'Opportunities', dims: [{ id: 'owner' }], metrics: [{ id: 'revenue' }, { id: 'deals' }], period: 'all' }, { opportunities: opps, accounts: [], leads: [], activities: [], settings: {} }, { fiscalStart: 10, today: new Date('2026-09-14T15:00:00Z') });

test('deliveryTable / deliveryText: the engine’s result as a header, formatted rows, a total row, and a cap that says how many more', () => {
    const t = deliveryTable(result);
    assert.deepEqual(t.header, ['Owner', 'Revenue', '# of deals']);
    assert.deepEqual(t.body, [['Karen', '$100K', '2'], ['Ryan', '$25K', '1']], 'money the way the engine formats it for a chart');
    assert.deepEqual(t.totals, ['Total', '$125K', '3']);
    assert.equal(t.more, 0); assert.equal(t.count, 3);
    const text = deliveryText(t);
    assert.match(text, /^Owner\s+Revenue\s+# of deals\n-+/);
    assert.match(text, /Karen\s+\$100K\s+2/);
    assert.match(text, /Total\s+\$125K\s+3/);
    const big = { ...result, rows: Array.from({ length: MAX_DELIVERY_ROWS + 4 }, (_, i) => ({ keys: [`Rep ${i}`], values: { revenue: 1, deals: 1 } })) };
    const bt = deliveryTable(big);
    assert.equal(bt.body.length, MAX_DELIVERY_ROWS); assert.equal(bt.more, 4);
    assert.match(deliveryText(bt), /… 4 more rows in the app$/);
    assert.equal(deliveryText(deliveryTable(null)), 'Nothing in this period.');
    assert.equal(periodLabel('Q3'), 'Q3'); assert.equal(periodLabel('FY'), 'This fiscal year'); assert.equal(periodLabel(undefined), 'All time'); assert.equal(periodLabel('q3'), 'All time', 'an unknown key reads as all time, like the engine');
});

test('slackBlocksForReport is Block Kit — a header, a context line, the table in a code block, a button to the app; the html table escapes every cell', () => {
    const t = deliveryTable(result);
    const msg = slackBlocksForReport({ name: 'Pipeline by rep', source: 'Opportunities', period: 'all', ownerName: 'Jeff', table: t, url: 'https://accelerep.netlify.app' });
    assert.equal(msg.text, 'Pipeline by rep — Opportunities · All time');
    assert.equal(msg.blocks[0].type, 'header'); assert.equal(msg.blocks[0].text.text, 'Pipeline by rep');
    assert.equal(msg.blocks[1].type, 'context'); assert.match(msg.blocks[1].elements[0].text, /Opportunities · All time · saved by Jeff · 3 rows in the period/);
    assert.equal(msg.blocks[2].type, 'section'); assert.match(msg.blocks[2].text.text, /^```Owner/);
    assert.equal(msg.blocks[3].type, 'actions'); assert.equal(msg.blocks[3].elements[0].url, 'https://accelerep.netlify.app');
    assert.equal(slackBlocksForReport({ name: 'x', table: t }).blocks.length, 3, 'no url, no button');
    const html = deliveryHtmlTable(deliveryTable({ ...result, rows: [{ keys: ['<b>Karen</b>'], values: { revenue: 1, deals: 1 } }] }));
    assert.ok(html.includes('&lt;b&gt;Karen&lt;/b&gt;') && !html.includes('<b>Karen'), 'a group key is data, never markup');
    assert.equal(deliveryHtmlTable(deliveryTable(null)), '<p>Nothing in this period.</p>');
});

// ── the endpoint ─────────────────────────────────────────────────────────────
test('saved-reports: GET is own + shared (an Admin reads the org); PUT is read-then-merge, the owner never changes; delivery is validated and its recipients are THIS org’s roster', () => {
    const s = code(read('netlify/functions/saved-reports.mjs'));
    assert.ok(s.includes(": and(eq(savedReports.orgId, orgId), or(eq(savedReports.ownerId, userId), eq(savedReports.isShared, true)));"), 'own + shared');
    assert.ok(s.includes("? eq(savedReports.orgId, orgId)\n                : and("), 'an Admin reads the whole org');
    assert.ok(s.includes('const existing = await rowOf(data.id);\n            if (!existing) return notFound;\n            if (!mayTouch(existing)) return forbiddenOwner;'), 'PUT reads first');
    assert.ok(s.includes('ownerId:   existing.ownerId,'), 'the owner is the stored one, never the caller');
    assert.ok(s.includes("isShared:  'isShared' in data ? data.isShared === true : existing.isShared === true,"));
    assert.ok(s.includes('config:    configFor(data.config, existing.config, delivery),'));
    assert.ok(s.includes('const d = cleanDelivery(bodyDelivery);'), 'the schedule is the allowlisted shape');
    assert.ok(s.includes('const roster = await db.select({ id: users.id }).from(users).where(eq(users.orgId, orgId));') && s.includes('d.emailTo = d.emailTo.filter(id => ids.has(id));'), 'recipients: this org’s roster only');
    assert.ok(s.includes('d.lastDeliveredAt = prior?.lastDeliveredAt ?? null;'), 'the job’s stamp survives a client save');
    assert.ok(s.includes("if (event.httpMethod === 'POST' && params.action === 'deliver') {") && s.includes("const result = await deliverReport(row, { now: new Date(), trigger: 'manual' });"), 'Send now is the job’s own path');
    assert.ok(!s.includes('onConflictDoUpdate'), 'no upsert on PUT any more');
    assert.ok(s.includes(".where(and(eq(savedReports.id, id), eq(savedReports.orgId, orgId)))\n                .returning();"), 'the update is by id AND org');
});

test('report-deliveries: hourly, heartbeat-wrapped, every read by the row’s org, the owner’s scope, the stamp by id and org', () => {
    const s = code(read('netlify/functions/report-deliveries.mjs'));
    assert.ok(s.includes("export const handler = withHeartbeat('report-deliveries', run);"));
    assert.ok(s.includes('.where(and(eq(users.orgId, row.orgId), eq(users.clerkUserId, row.ownerId)));'), 'the owner on ITS org’s roster');
    assert.ok(s.includes('.where(and(eq(users.orgId, orgId), inArray(users.id, ids)));'), 'recipients resolved in the org');
    assert.ok(s.includes('const all = canSeeAll(owner?.role);'), 'the server’s rule: a Manager sees the org');
    assert.ok(s.includes(': db.select().from(table).where(and(eq(table.orgId, orgId), eq(table.ownerId, owner.id))));'), 'a rep’s report runs over the rep’s rows');
    assert.ok(s.includes("const { due: isDue } = deliveryDue(d, now);"), 'the pure module decides what is due');
    assert.ok(s.includes('.where(and(eq(savedReports.id, row.id), eq(savedReports.orgId, row.orgId)));'), 'the stamp is org-scoped');
    assert.ok(s.includes("if (d.slack) {\n        const posted = await sendSlackToOrg(row.orgId, slackBlocksForReport("), 'Slack through the org sender');
    const toml = read('netlify.toml');
    assert.ok(toml.includes('[functions."report-deliveries"]') && /report-deliveries"\]\r?\nschedule = "0 \* \* \* \*"/.test(toml), 'scheduled hourly');
    const jobs = code(read('src/utils/jobHealth.js'));
    assert.ok(jobs.includes("Object.freeze({ job: 'report-deliveries', label: 'Report delivery',  cron: '0 * * * *', cadenceMs: 3600000 }),"), 'in the registry the Jobs tile reads');
    const email = code(read('netlify/functions/send-email.mjs'));
    assert.ok(email.includes('reportDelivery({ name, source, period, ownerName, tableHtml, count, url, cadence, trigger }) {'), 'the email template');
});

test('the pin list is a self-editable profile key, packed as strings only', () => {
    const self = code(read('netlify/functions/_selfProfile.mjs'));
    assert.ok(self.includes("    'pinnedReports',"), 'a member may set their own pins');
    const u = code(read('netlify/functions/users.mjs'));
    assert.ok(u.includes("pinnedReports:    Array.isArray(data.pinnedReports) ? data.pinnedReports.filter(x => typeof x === 'string').slice(0, 50) : null,"), 'packed into the profile blob, strings only, capped');
});

// ── the library and Home ─────────────────────────────────────────────────────
test('the library: cards are one module-scope component; Share / Pin / Deliver / delete gated as the endpoint gates; a partial PUT adopts the server’s row; the pin rides my profile', () => {
    const s = code(read('src/Tabs/ReportsTab.jsx'));
    assert.ok(s.includes('const LibraryCard = ({ r, mayTouch, pinned, currentUser, onOpen, onPin, onShare, onDeliver, onDelete }) => {'), 'module scope, data as props');
    assert.ok(s.includes('const DeliveryDialog = ({ report, users, slackConfigured, currentUserId, busy, note, onSave, onSendNow, onClose }) => {'));
    assert.ok(s.includes("const mayTouch = (r) => userRole === 'Admin' || r.ownerId === clerkUserId;"), 'the owner or an Admin — the endpoint’s rule, on the card');
    assert.ok(s.includes("{mayTouch && <button onClick={stop(onShare)}") && s.includes("{mayTouch && !r.config?.templateId && <button onClick={stop(onDeliver)}"), 'Share and Deliver only for those who may; no delivery for a template');
    assert.ok(s.includes("body: JSON.stringify({ id, ...patch }) });") && s.includes('if (data.report) setSavedReportsList(prev => prev.map(r => r.id === data.report.id ? data.report : r));'), 'a partial PUT; the list adopts the server’s row');
    assert.ok(s.includes("body: JSON.stringify({ id: myProfile.id, pinnedReports: next }) });"), 'the pin is a self-profile write');
    assert.ok(s.includes("'/.netlify/functions/saved-reports?action=deliver&id=' + encodeURIComponent(deliveryFor.id)"), 'Send now');
    assert.ok(s.includes('<SectionS title="Your reports"') && s.includes('<SectionS title="Shared with you"'), 'mine and shared-with-me, apart');
    assert.ok(s.includes("slackConfigured={!!settings?.connectedApps?.slack}"), 'Slack offered only when connected');
    assert.ok(s.includes("localStorage.getItem('tab:reports:openReport')") && s.includes("localStorage.removeItem('tab:reports:openReport')"), 'Home’s open request, consumed once');
    const home = code(read('src/Tabs/HomeTab.jsx'));
    assert.ok(home.includes("if (!orgId || !currentUserId) { setHomeReports([]); return undefined; }"), 'the load keys on an active org and a resolved caller (§18b38)');
    assert.ok(home.includes("const ids = Array.isArray(myProfile?.pinnedReports) ? myProfile.pinnedReports : [];"));
    assert.ok(home.includes("result: r.config?.templateId ? null : runReport({ source: r.source, dims: r.dims || [], metrics: r.metrics || [], period: r.filters?.period || 'all', from: r.filters?.from || '', to: r.filters?.to || '', where: r.filters?.where || [], limit: 8 }, data, { fiscalStart }),"), 'run over what the viewer sees, the whole definition (§0.139)');
    assert.ok(home.includes("<ReportChart result={result} chartType={chartType}/>"));
    assert.ok(home.includes("localStorage.setItem('tab:reports:openReport', r.id);"));
    const app = code(read('src/App.jsx'));
    assert.ok(app.includes('setMyProfile, // the pin list on it is edited from the report library (state §0.135)'), 'the setter is in the context');
});

// ── the two tab preferences that reset (Jeff, 14 Sep) ────────────────────────
test('the Tasks date range and the Dispatch board range persist like scope, validated on read; the board anchor does not', () => {
    const t = code(read('src/Tabs/TasksTab.jsx'));
    assert.ok(t.includes("const [range,  setRangeRaw] = useState(() => { const v = localStorage.getItem('tab:tasks:range'); return TASK_RANGES.includes(v) ? v : 'week'; });"));
    assert.ok(t.includes("const setRange = v => { setRangeRaw(v); localStorage.setItem('tab:tasks:range', v); };"));
    assert.ok(t.includes("const TASK_RANGES = ['today', 'week', 'month', 'all'];"), 'the same four the pills offer');
    const d = code(read('src/Tabs/DispatchTab.jsx'));
    assert.ok(d.includes("const [boardRange,   setBoardRangeRaw] = useState(() => { const v = localStorage.getItem('tab:dispatch:boardRange'); return ['today', 'week', 'month'].includes(v) ? v : 'today'; });"));
    assert.ok(d.includes("const setBoardRange = (r) => { setBoardRangeRaw(r); localStorage.setItem('tab:dispatch:boardRange', r); };"));
    assert.ok(d.includes("const [boardAnchor,  setBoardAnchor]  = useState(() => new Date());"), 'the anchor re-anchors on today');
    assert.ok(!d.includes("localStorage.setItem('tab:dispatch:boardAnchor'"), 'a stored week would strand a returning dispatcher');
});
