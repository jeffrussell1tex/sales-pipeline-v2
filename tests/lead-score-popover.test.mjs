// tests/lead-score-popover.test.mjs
//
// The lead score's "Why this score" popover (state §0.128). Jeff, 13 Sep: "When I
// click on a lead score the review gets truncated ... and a side slider is added
// to the window ... only ... in these single line categories (call today, needs
// first touch, and working)." Those rows scroll sideways (overflow: auto); the
// popover was position: absolute under the badge, so the row clipped it and grew
// a scrollbar to hold it. Now: the popover rule — a fixed popover placed from the
// badge's rect by the pure popoverPlacement, closed by an outside click, a scroll
// or a resize (a fixed box does not follow the page).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { popoverPlacement } from '../src/utils/popoverPlacement.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const count = (hay, needle) => hay.split(needle).length - 1;
const vp = { width: 1200, height: 800 };

test('popoverPlacement: below the trigger when it fits, above it otherwise; left-aligned and kept inside the viewport', () => {
    assert.deepEqual(popoverPlacement({ top: 100, bottom: 126, left: 80, right: 116 }, { width: 232, height: 300, viewport: vp }), { left: 80, top: 132 }, 'below, 6 px gap');
    assert.deepEqual(popoverPlacement({ top: 600, bottom: 626, left: 80, right: 116 }, { width: 232, height: 300, viewport: vp }), { left: 80, bottom: 206 }, 'no room below: above the trigger (800 - 600 + 6)');
    assert.deepEqual(popoverPlacement({ top: 100, bottom: 126, left: 2, right: 38 }, { width: 232, height: 300, viewport: vp }), { left: 8, top: 132 }, 'never off the left edge');
    assert.deepEqual(popoverPlacement({ top: 100, bottom: 126, left: 1100, right: 1136 }, { width: 232, height: 300, viewport: vp }), { left: 960, top: 132 }, 'never off the right edge (1200 - 232 - 8)');
    assert.deepEqual(popoverPlacement({ top: 4, bottom: 30, left: 80, right: 116 }, { width: 232, height: 900, viewport: vp }), { left: 80, top: 8 }, 'fits neither way and taller than the viewport: pinned to the top margin — its head shows, not its feet');
    assert.deepEqual(popoverPlacement({ top: 300, bottom: 326, left: 80, right: 116 }, { width: 232, height: 600, viewport: vp }), { left: 80, top: 192 }, 'fits neither way: as high as needed for the bottom edge to stay on screen (800 - 600 - 8)');
    assert.deepEqual(popoverPlacement({ top: 700, bottom: 726, left: 80, right: 116 }, { width: 232, height: 300, viewport: vp }), { left: 80, bottom: 106 }, 'room above only: above');
    assert.deepEqual(popoverPlacement(null, { width: 232, height: 300, viewport: vp }), { left: 8, top: 6 }, 'a missing rect is the origin, not a throw');
    assert.deepEqual(popoverPlacement({ top: 100, bottom: 126, left: 80, right: 116 }, { width: 232, height: 300, gap: 10, margin: 20, viewport: vp }), { left: 80, top: 136 }, 'gap and margin are parameters');
});

test('LeadScore: the popover is position: fixed, placed from the badge, closed by an outside click, a scroll or a resize', () => {
    const s = read('src/Tabs/LeadsTab.jsx');
    assert.ok(s.includes("import { popoverPlacement } from '../utils/popoverPlacement.js';"), 'the pure placement');
    const start = s.indexOf('const LeadScore = ({ lead, score, size = ');
    const block = s.slice(start, s.indexOf('const LeadStatusPill', start));
    assert.ok(block.includes("const [at, setAt] = useState(null);"), 'viewport px, not a CSS offset');
    assert.ok(block.includes("setAt(popoverPlacement(badgeRef.current.getBoundingClientRect(), { width: 232, height: 300 }));"), 'placed from the badge rect at open');
    assert.ok(block.includes("style={{ position: 'fixed', ...at, zIndex: 60, width: 232,"), 'REGRESSION: absolute under the badge is clipped by the Triage rows and grows their scrollbar');
    assert.equal(count(block, "position: 'absolute', top: '100%'"), 0, 'the absolute popover is gone');
    assert.ok(block.includes("window.addEventListener('scroll', close, true);"), 'a scroll closes it — a fixed box does not follow the page');
    assert.ok(block.includes("window.addEventListener('resize', close);"));
    assert.ok(block.includes("const onDoc = (e) => { if (!wrapRef.current?.contains(e.target)) close(); };"), 'an outside click closes it (the badge and the popover are inside the wrapper)');
    assert.ok(block.includes("window.removeEventListener('scroll', close, true);"), 'listeners come off');
    assert.ok(block.includes('<div ref={wrapRef} style={{ position: \'relative\', display: \'inline-block\' }}>'));
    assert.ok(block.includes('onClick={canExplain ? toggle : undefined}'));
});
