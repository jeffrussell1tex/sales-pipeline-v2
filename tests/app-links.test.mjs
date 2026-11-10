// tests/app-links.test.mjs
//
// A link in a message to a member opens what the message is about (state §0.237; guide §18b120;
// docs/design/email-links — Jeff's Q1 "Whole class", Q2 "Switch, then open", Q3 "A notice", Q4 "Pipeline tab").
// Until §0.237 only an approval email's ?quote= was read: "View Deal →" (?deal=), "View All Tasks →" (?tab=tasks),
// "View Full Pipeline →" (?tab=reports) and every "Manage notification preferences" (/settings) opened Home; five deal
// emails, the deal texts and Slack's deal buttons linked the bare app; no link named its record's org.
//   RULE    src/utils/appLinks.js run — the link built, read (the older shapes too), kept across the sign-in screen
//           (the quote link's tests, moved here), cleaned from the address bar
//   GUARD   no sender in netlify/functions writes a link into the app by hand: no ?deal=, ?tab=, ?quote= or /settings;
//           every template handed a deal's or a task's id links that record, in its org
//   WIRING  App.jsx's one reader, the org switch, the notice; the profile panel's tab; every caller hands the org
// The templates rendered (their links read back) are tests/integration/app-links.itest.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import {
    appLink, readAppLink, takeAppLink, dropAppLink, withoutAppLink, isLinkId, APP_LINK_KEY, APP_LINK_KINDS, APP_LINK_WORDS,
} from '../src/utils/appLinks.js';
import { quoteLink } from '../src/utils/approvalNotices.js';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8').replace(/\r\n/g, '\n');
const code = (src) => src.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');
const BASE = 'https://salespipelinetracker.com';

// ── RULE ─────────────────────────────────────────────────────────────────────

test('RULE: a link names its kind, its record and its org — anything that could not be one is no link', () => {
    assert.equal(appLink(BASE, { kind: 'deal', id: 'opp_qa_01', org: 'org_3K6L' }), `${BASE}/?open=deal&id=opp_qa_01&org=org_3K6L`);
    assert.equal(appLink(BASE + '/', { kind: 'task', id: 'id_6f1c-22ab', org: 'org_A' }), `${BASE}/?open=task&id=id_6f1c-22ab&org=org_A`, 'a trailing slash once');
    assert.equal(appLink(BASE, { kind: 'tasks', org: 'org_A' }), `${BASE}/?open=tasks&org=org_A`, 'a place takes no id');
    assert.equal(appLink(BASE, { kind: 'notifications', id: 'ignored' }), `${BASE}/?open=notifications`, 'no org: none named');
    assert.equal(appLink(BASE, { kind: 'pipeline', org: 'bad org!' }), `${BASE}/?open=pipeline`, 'an org that could not be one is left off');
    assert.equal(appLink(BASE, { kind: 'deal', id: '<img src=x>' }), BASE, 'REGRESSION: a link to a record no id names');
    assert.equal(appLink(BASE, { kind: 'deal' }), BASE, 'no id: the app, never a link to nothing');
    assert.equal(appLink(BASE, { kind: 'settings' }), BASE, 'a kind no one reads');
    assert.equal(quoteLink(BASE, 'qt_9', 'org_A'), `${BASE}/?open=quote&id=qt_9&org=org_A`, 'the quote emails\' link, the same shape');
    for (const ok of ['opp_qa_01', 'id_6f1c', 'org_3K6LqEB6kPE9p4t96GBfsX9VNyb', 'a'.repeat(80)]) assert.equal(isLinkId(ok), true, ok);
    for (const bad of ['', 'a b', 'a/b', '"x"', 'a'.repeat(81), null, 5]) assert.equal(isLinkId(bad), false, String(bad));
});

test('RULE: what the address bar asks — the shape every message now sends, and the shapes already in inboxes', () => {
    assert.deepEqual(readAppLink('?open=deal&id=opp_1&org=org_A'), { kind: 'deal', id: 'opp_1', org: 'org_A' });
    assert.deepEqual(readAppLink('?open=notifications&org=org_A'), { kind: 'notifications', id: null, org: 'org_A' });
    assert.deepEqual(readAppLink('?open=tasks'), { kind: 'tasks', id: null, org: null });
    assert.deepEqual(readAppLink('?deal=opp_1'), { kind: 'deal', id: 'opp_1', org: null }, 'an older "View Deal →"');
    assert.deepEqual(readAppLink('?quote=qt_9'), { kind: 'quote', id: 'qt_9', org: null }, 'an approval email from before');
    assert.deepEqual(readAppLink('?tab=tasks'), { kind: 'tasks', id: null, org: null }, 'an older task digest or text');
    assert.deepEqual(readAppLink('?tab=reports'), { kind: 'pipeline', id: null, org: null }, 'an older weekly summary — the Pipeline tab (Q4)');
    for (const no of ['', '?calconnect=success', '?tab=settings', '?open=deal', '?open=deal&id=<x>', '?open=admin&id=1', '?deal=', '?deal=a b', undefined, null]) {
        assert.equal(readAppLink(no), null, String(no));
    }
});

// A tab's sessionStorage, and one a privacy setting has shut.
const memStore = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); } }; };
const deadStore = { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('QuotaExceededError'); }, removeItem() { throw new Error('SecurityError'); } };

test('RULE: a link outlives the sign-in screen — kept in the tab through Clerk\'s reload of "/", used once, replaced by a new link (the quote link\'s, §0.158, now every link\'s)', () => {
    const tab = memStore();
    const q = { kind: 'quote', id: 'qt_6f1c-22ab', org: null };
    assert.deepEqual(takeAppLink('?quote=qt_6f1c-22ab', tab), q, 'opened signed out: read from the URL…');
    assert.deepEqual(JSON.parse(tab.getItem(APP_LINK_KEY)), q, '…and kept');
    assert.deepEqual(takeAppLink('', tab), q, 'after sign-in the URL is "/": the kept link answers');
    assert.deepEqual(takeAppLink('?calconnect=success&from=home', tab), q, 'another parameter leaves it be');
    dropAppLink(tab);
    assert.equal(takeAppLink('', tab), null, 'used: dropped — a later visit opens nothing');
    takeAppLink('?open=deal&id=opp_1&org=org_A', tab);
    assert.deepEqual(takeAppLink('?open=task&id=t_2', tab), { kind: 'task', id: 't_2', org: null }, 'a new link replaces a kept one');
    assert.equal(takeAppLink('?quote=%3Cimg%20src%3Dx%3E', tab), null, 'an id that could not be a record\'s is refused…');
    assert.equal(takeAppLink('', tab), null, '…and the kept one goes with it');
    takeAppLink('?open=tasks', tab);
    assert.equal(takeAppLink('?open=admin', tab), null, 'a kind no one reads, the same');
    assert.equal(takeAppLink('', tab), null);
    assert.equal(takeAppLink(`?deal=${'a'.repeat(81)}`, tab), null);
    assert.equal(takeAppLink('?deal=', tab), null, 'an empty link');
    assert.deepEqual(takeAppLink('?open=deal&id=d_9', null), { kind: 'deal', id: 'd_9', org: null }, 'no storage: the URL still opens it');
    assert.deepEqual(takeAppLink('?open=deal&id=d_9', deadStore), { kind: 'deal', id: 'd_9', org: null }, 'storage that throws: the same');
    assert.equal(takeAppLink('', deadStore), null);
    dropAppLink(deadStore);
    assert.equal(takeAppLink(undefined, tab), null);
    const forged = memStore(); forged.setItem(APP_LINK_KEY, JSON.stringify({ kind: 'deal', id: '<x>' }));
    assert.equal(takeAppLink('', forged), null, 'a kept link that does not read is no link');
    forged.setItem(APP_LINK_KEY, '{not json');
    assert.equal(takeAppLink('', forged), null);
});

test('RULE: a used link leaves the address bar — its parameters alone; a member is told, in words, what they cannot open', () => {
    assert.equal(withoutAppLink('https://x.test/?open=deal&id=d1&org=o1&calconnect=success'), '/?calconnect=success');
    assert.equal(withoutAppLink('https://x.test/?deal=d1&tab=tasks&quote=q1'), '/');
    for (const k of ['deal', 'task', 'quote', 'org']) assert.match(APP_LINK_WORDS[k], /isn't available to you|not a member/);
    assert.deepEqual([...APP_LINK_KINDS], ['deal', 'task', 'quote', 'tasks', 'pipeline', 'notifications']);
});

// ── THE GUARD ────────────────────────────────────────────────────────────────

const FN_DIR = 'netlify/functions/';
const fnFiles = () => readdirSync(new URL(FN_DIR, ROOT)).filter((f) => f.endsWith('.mjs')).map((f) => FN_DIR + f);
// A link into the app written by hand: a parameter or path only appLink may write.
const HAND = [/[?&]deal=/, /[?&]tab=(tasks|reports)/, /[?&]quote=/, /\/settings["'`]/];

export const handLinksIn = (src) => code(src).split('\n').flatMap((l, i) => HAND.filter((re) => re.test(l)).map((re) => `${i + 1}: ${re} — ${l.trim().slice(0, 100)}`));

test('THE GUARD: no sender writes a link into the app by hand — no ?deal=, ?tab=, ?quote= or /settings; appLink alone builds one', () => {
    const hits = fnFiles().flatMap((f) => handLinksIn(read(f)).map((h) => `${f}:${h}`));
    assert.deepEqual(hits, [], 'REGRESSION (§0.237): a message links the app by hand — a link the app\'s reader may not read');
});

test('THE GUARD reads what it is for: a hand-written ?deal=, ?tab=tasks or /settings link fails; appLink and a comment pass', () => {
    assert.equal(handLinksIn('const h = `<a href="${appUrl}?deal=${id}">`;').length, 1);
    assert.equal(handLinksIn('const t = `View: ${appUrl}?tab=tasks`;').length, 1);
    assert.equal(handLinksIn('const f = `<a href="${appUrl}/settings">`;').length, 1);
    assert.equal(handLinksIn('const q = `${base}/?quote=${id}`;').length, 1);
    assert.equal(handLinksIn("const h = `${appLink(appUrl, { kind: 'deal', id, org })}`;").length, 0);
    assert.equal(handLinksIn('// the older ?deal= links are read too').length, 0, 'a comment');
});

// Each template that is handed a deal's id (`opportunityId`) or a task's (`taskId`) links that record, in its org.
const templatesOf = (src, holder) => {
    const start = src.indexOf(`export const ${holder} = {`);
    assert.ok(start >= 0, holder);
    const body = src.slice(start);
    const out = [];
    for (const m of body.matchAll(/^    (\w+)(?:\(|: \()\{([^}]*)\}\)?\s*(?:=>\s*\(?\{|\{)/gm)) {
        const end = body.indexOf('\n    },', m.index) >= 0 ? body.indexOf('\n    }', m.index + m[0].length) : body.length;
        out.push({ name: m[1], params: m[2], text: body.slice(m.index, end) });
    }
    return out;
};

test('THE GUARD: every template handed a deal or a task links it — by appLink, naming its org', () => {
    const misses = [];
    for (const [file, holder] of [['netlify/functions/send-email.mjs', 'emailTemplates'], ['netlify/functions/send-sms.mjs', 'smsTemplates'], ['netlify/functions/send-slack.mjs', 'slackTemplates']]) {
        const all = templatesOf(read(file), holder);
        assert.ok(all.length >= 8, `${file}: the templates read (${all.length})`);
        for (const t of all) {
            const takesDeal = /\bopportunityId\b/.test(t.params), takesTask = /\btaskId\b/.test(t.params);
            if (!takesDeal && !takesTask) continue;
            if (!/\borgId\b/.test(t.params)) misses.push(`${holder}.${t.name}: handed a record and no org`);
            const linksIt = takesDeal ? /kind: 'deal', id: opportunityId, org: orgId|dealUrl\(opportunityId, orgId\)/.test(t.text) : /kind: 'task', id: taskId, org: orgId/.test(t.text);
            if (!linksIt) misses.push(`${holder}.${t.name}: handed a ${takesDeal ? 'deal' : 'task'} and does not link it`);
        }
    }
    assert.deepEqual(misses, [], 'REGRESSION (§0.237): a message about a record that opens Home');
});

// ── WIRING ───────────────────────────────────────────────────────────────────

test('WIRING: App.jsx reads every link once, waits for the profile in an org, switches to the link\'s org where the member belongs, and says what cannot open', () => {
    const a = code(read('src/App.jsx'));
    assert.ok(a.includes('if (appLinkRef.current === undefined) appLinkRef.current = takeAppLink(window.location.search);'), 'read once, from the URL or the tab');
    assert.ok(!a.includes('takeQuoteLink') && !a.includes('quoteLinkRef'), 'one reader — the quote link\'s folded in');
    assert.ok(a.includes('if (!link || !clerkUser || !organization?.id || !roleKnown) return;'), 'it waits for the profile in an org');
    assert.ok(a.includes("const member = (userMemberships?.data || []).some(m => m.organization?.id === link.org);"), 'a member of the link\'s org, by Clerk\'s own list');
    assert.ok(a.includes('if (!member) { doneWithAppLink(); offerUndo({ notice: APP_LINK_WORDS.org }); return; }'), 'REGRESSION (Q2): an org the member is not in, entered or said nothing');
    assert.ok(a.includes('            appLinkSwitchRef.current = link.org;\n            setActive({ organization: link.org });'), 'switched to, once');
    assert.ok(a.includes("if (!deal) { offerUndo({ notice: APP_LINK_WORDS.deal }); return; }"), 'REGRESSION (Q3): a deal they cannot open, a blank Home');
    assert.ok(a.includes("const deal = await linkedRecord('opportunities', 'opportunities', link.id);\n                if (!stillOrg(askedOrg)) return;"), 'the server\'s own list decides; a switch drops the answer');
    assert.ok(a.includes("if (link.kind === 'pipeline') { setActiveTab('pipeline'); return; }"), 'the weekly summary (Q4)');
    assert.ok(a.includes("if (link.kind === 'notifications') { setProfileTabAsk('notifications'); setShowProfilePanel(true); return; }"));
    const h = code(read('src/components/layout/AppHeader.jsx'));
    assert.ok(h.includes('if (showProfilePanel && profileTabAsk) { setProfilePanelTab(profileTabAsk); setProfileTabAsk(null); }'), 'the panel opens on the tab asked for');
});

test('WIRING: every sender hands its record\'s org — the deal emails\' helper, the alerts, the digests, the texts, Slack, the quotes', () => {
    assert.ok(read('netlify/functions/opportunities.mjs').includes('...emailTemplates[alertType]({ ...templateArgs, orgId }),'));
    const pa = code(read('netlify/functions/pipeline-alerts.mjs'));
    const calls = [...pa.matchAll(/(?:emailTemplates|smsTemplates|slackTemplates)\.(?:dealSilent|dealStuck|closeDateLapsed|managerDealAlert|dealMomentum|scoreDrop)\(\{([^\n]*)/g)];
    assert.ok(calls.length >= 18, `the alerts' deal calls (${calls.length})`);
    for (const c of calls) assert.ok(/\borgId\b/.test(c[1]) && /opportunityId: opp\.id/.test(c[1]), `REGRESSION: ${c[0].slice(0, 60)} without its deal and org`);
    const dg = code(read('netlify/functions/digest.mjs'));
    assert.equal((dg.match(/orgId: user\.orgId/g) || []).length >= 4, true, 'the task emails and texts name the org');
    assert.ok(dg.includes("{ kind: 'notifications', org: mgr.orgId }"), 'the weekly digest\'s preferences link');
    const ms = code(read('netlify/functions/mention-sms.mjs'));
    assert.ok(ms.includes("{ kind: 'task', id: record.id, org: orgId }") && ms.includes('opportunityId: record.id, orgId });'), 'the mention texts open their record');
    assert.ok(code(read('netlify/functions/task-reminders.mjs')).includes('taskId:    task.id,'), 'the reminder opens its task');
    const sl = read('netlify/functions/send-slack.mjs');
    assert.ok(sl.includes('        ctx.opportunityId = after?.id; ctx.orgId = orgId;'), 'Slack\'s deal posts');
    assert.ok(sl.includes("const dealUrl = (opportunityId, orgId) => appLink(APP_URL, { kind: 'deal', id: opportunityId, org: orgId });"), 'a Slack deal button: its deal, in its org');
    assert.ok(read('netlify/functions/_approvalMail.mjs').includes('url: quoteLink(appUrl(), quote.id, orgId) };'), 'the quote emails name the org');
    assert.ok(read('netlify/functions/quote-reminders.mjs').includes('url: quoteLink(appUrl(), q.id, org),'));
    const se = code(read('netlify/functions/send-email.mjs'));
    assert.ok(se.includes("<p><a href=\"${appLink(appUrl, { kind: 'notifications', org })}\">Manage notification preferences</a></p>"), 'the members\' footer opens the Notifications tab');
    assert.ok(se.includes('function layout(title, bodyHtml, { org = null } = {}) {'));
});

test('the suites: this file is graded by the harness', () => {
    const suites = read('scripts/mutate-import.mjs').match(/^const SUITES = '([^'\n]*)';$/m)?.[1].split(' ') ?? [];
    assert.ok(suites.includes('tests/app-links.test.mjs'), 'SUITES runs this file');
});
