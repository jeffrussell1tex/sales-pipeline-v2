// tests/meeting-prep.test.mjs
//
// Meeting prep, back on the contact, the account and the deal (state §0.187 — §0.186's
// found (c); Jeff: "It also used to be able to be opened via an action button on a
// contact, account, or deal", then "can we have the prep for account, contact, and deal").
//
// Before: the meeting prep panel opened from the Home tab's calendar alone, and only for an
// event the calendar had matched to a deal. The Prep a contact, an account and a deal once
// had went missing many sessions before (Jeff: "it got missed many sessions ago"). Each has
// one again — the contact rail's quick actions, the account rail's strip beside Edit, the
// deal window's header — and each opens the panel on a deal: the record's one open deal,
// or, on a contact or an account with more than one, the deal picked from the list its Prep
// offers (DealPrepPicker; Jeff: "offer the list of deals").
//
// The panel opens on top: App drew it inside .app-container, a stacking context at z-index
// 1, so it opened under the rail or the deal window its Prep was pressed in (Jeff: "the prep
// panels were opening underneath and not visible unless you click away from them").
// tests/escape-order.test.mjs keeps every layer that must sit over a rail out of that
// container. And what the pane showed next: the panel's account details widened past its
// edge (Jeff: "cut off with ...."), the account rail's Edit overflowed beside Prep, and the
// Pipeline list's Revenue and Close ran together (Jeff: "the revenue and close columns are
// also crammed together now").
//
// Pinned by source — node --test renders no JSX; each was proved in the pane (§0.187).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from '@babel/parser';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8').replace(/\r\n/g, '\n');
const between = (src, from, to) => { const a = src.indexOf(from); assert.ok(a >= 0, from); const b = src.indexOf(to, a + from.length); assert.ok(b > a, to); return src.slice(a, b); };
const count = (src, s) => src.split(s).length - 1;

test('openMeetingPrep: the meeting named for the record, today, on the deal — handed to every rail and modal', () => {
    const app = read('src/App.jsx');
    const fn = between(app, '    const openMeetingPrep = (title, dealId) => {', '\n    };');
    assert.ok(fn.includes('setMeetingPrepEvent({ summary: title, start: { date: todayLocal() }, attendeeCount: 0 });'), 'named for the record, today — the local day (src/utils/dateLocal.js)');
    assert.ok(fn.includes('setMeetingPrepOppId(dealId);'), 'on the deal');
    assert.ok(fn.includes('setMeetingPrepOpen(true);'));
    assert.ok(between(app, '    const appContextValue = {', '\n    };').includes('        openMeetingPrep,'), 'in the context');
});

test('the contact rail: Prep opens the one open deal, offers the list when there are more, and the list opens the deal picked', () => {
    const src = read('src/components/rails/ContactRail.jsx');
    const prep = between(src, "{/* Meeting prep on this contact's open deal", '</button>');
    assert.ok(prep.includes('{openOpps.length > 0 && ('), 'no open deal, no Prep');
    assert.ok(prep.includes('if (openOpps.length > 1) { setShowPrepPick(v => !v); setShowTemplates(false); return; }'), 'more than one: the list — the email templates closed');
    assert.ok(prep.includes('if (openMeetingPrep) openMeetingPrep(`Meeting with ${fullName}`, openOpps[0].id);'), 'one: the panel on it');
    assert.ok(prep.includes("📋 Prep{openOpps.length > 1 ? ' ▾' : ''}"), 'a list says so');
    assert.ok(src.includes('{!isEditing && contact && showPrepPick && openOpps.length > 1 && (\n                <DealPrepPicker deals={openOpps}'), 'the list: the open deals');
    assert.ok(src.includes('onPick={(d) => { setShowPrepPick(false); if (openMeetingPrep) openMeetingPrep(`Meeting with ${fullName}`, d.id); }}/>'), 'the deal picked');
    assert.ok(src.includes('    useEffect(() => { setShowPrepPick(false); }, [contactRailId]);'), 'closed when the rail shows another contact');
    assert.ok(src.includes('onClick={() => { setShowTemplates(v => !v); setShowPrepPick(false); }}'), 'Email ▾ closes the list: one list at a time');
    assert.ok(between(src, 'export default function ContactRail', '} = useApp();').includes('        openMeetingPrep,'), 'from the context');
});

test('the account rail: the same, in the strip beside Edit — the actions take their width, the counts share the rest', () => {
    const src = read('src/components/rails/AccountRail.jsx');
    const strip = between(src, "{ label: 'CONTACTS',", "setAccountRailMode('edit')");
    assert.ok(strip.includes("<div key={label} style={{ flex: 1, padding: '8px 0'"), 'each count shares the width');
    assert.ok(strip.includes("<div style={{ flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '0 12px' }}>"),
        'the actions take what they need: with Prep beside it, Edit had overflowed the rail');
    assert.ok(strip.includes('{openOpps.length > 0 && ('), 'no open deal, no Prep');
    assert.ok(strip.includes('if (openOpps.length > 1) { setShowPrepPick(v => !v); return; }'), 'more than one: the list');
    assert.ok(strip.includes('if (openMeetingPrep) openMeetingPrep(`Meeting with ${account.name}`, openOpps[0].id);'), 'one: the panel on it');
    assert.ok(strip.includes("📋 Prep{openOpps.length > 1 ? ' ▾' : ''}"));
    assert.ok(src.includes('{!isEditing && account && showPrepPick && openOpps.length > 1 && (\n                <DealPrepPicker deals={openOpps}'), 'the list: the open deals');
    assert.ok(src.includes('onPick={(d) => { setShowPrepPick(false); if (openMeetingPrep) openMeetingPrep(`Meeting with ${account.name}`, d.id); }}/>'), 'the deal picked');
    assert.ok(src.includes('    useEffect(() => { setShowPrepPick(false); }, [accountRailId]);'), 'closed when the rail shows another account');
    assert.ok(between(src, 'export default function AccountRail', '} = useApp();').includes('        openMeetingPrep,'), 'from the context');
});

test('the deal window: Prep in its header opens the panel on this deal — a saved one; a new deal has nothing to prep', () => {
    const src = read('src/components/modals/OpportunityModal.jsx');
    assert.ok(src.includes('    const { openMeetingPrep } = useApp();'), 'from the context');
    const btn = between(src, '{/* Meeting prep on this deal (state §0.187) */}', '</button>');
    assert.ok(btn.includes('{opportunity && openMeetingPrep && ('));
    assert.ok(btn.includes("onClick={() => openMeetingPrep(`Meeting with ${opportunity.account || opportunity.opportunityName || 'the customer'}`, opportunity.id)}"));
});

test('the list of deals: each open deal a row — its name, stage and amount — and a row opens that deal', () => {
    const src = read('src/components/rails/DealPrepPicker.jsx');
    assert.ok(src.includes('Prep for which deal?'));
    assert.ok(src.includes('{deals.map(d => ('));
    assert.ok(src.includes('<button key={d.id} type="button" onClick={() => onPick(d)}'), 'a row: that deal');
    assert.ok(src.includes("{d.opportunityName || d.account || 'Untitled deal'}"));
    assert.ok(src.includes("{[d.stage, d.arr ? `$${Number(d.arr).toLocaleString()}` : null].filter(Boolean).join(' · ')}"), 'the amount: arr (tests/deal-fields.test.mjs)');
    assert.ok(/overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'/.test(src), 'a long name is cut off with "…"');
    const ast = parse(src, { sourceType: 'module', plugins: ['jsx'] });
    assert.deepEqual(ast.program.body.filter((n) => n.type === 'ExportDefaultDeclaration').map((n) => n.declaration.id && n.declaration.id.name), ['DealPrepPicker'], 'module scope');
});

test('the panel is drawn once, outside .app-container, inside its own boundary', () => {
    const app = read('src/App.jsx');
    assert.equal(count(app, '<MeetingPrepPanel />'), 1);
    assert.ok(app.includes('        <LayerBoundary onCrash={() => { setMeetingPrepOpen(false); setMeetingPrepOppId(null); }}>\n        <MeetingPrepPanel />\n        </LayerBoundary>'),
        'its own boundary, at the top of App\'s render beside ModalLayer\'s — tests/escape-order.test.mjs reads that it is outside .app-container');
});

test('the panel\'s account details: a long value is cut off with "…", not widened past the panel', () => {
    const src = read('src/components/layout/MeetingPrepPanel.jsx');
    const grid = between(src, '{/* Account details */}', '))}');
    assert.ok(grid.includes("display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '0.5rem' }}>"),
        'minmax(0, …): a 1fr column grows to its longest word, a website, past the panel\'s edge');
    assert.ok(grid.includes("overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>"));
});

test('the Pipeline list: Close stands apart from Revenue — the header and every row', () => {
    const src = read('src/components/ListView.jsx');
    assert.ok(src.includes("            <div style={{ textAlign: 'right' }}>Revenue</div>\n"), 'Revenue sits right');
    assert.ok(src.includes('            <div style={{ paddingLeft: 16 }}>Close</div>'), 'the header');
    assert.ok(src.includes("fontWeight: overdue ? 600 : 400, paddingLeft: 16 }}>\n                {relativeDay(opp.forecastedCloseDate)}"), 'each row');
});
