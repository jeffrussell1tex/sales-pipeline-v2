// tests/plate-row.test.mjs
//
// Home's "On your plate" row (state §0.137; Jeff's screenshot, 15 Sep: the
// stage name wrapped under the amount in a 68px column and, being one
// unbreakable word, ran across the title column — "Negotiation/Review" over
// "Follow-up · ZZFX Ashgrove Holdings"). The label column is wide enough for
// the longest stage name on its own line, and the line is guarded with an
// ellipsis so nothing can bleed whatever a stage is called. Source scan (§18b23).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const code = (src) => src.split(/\r?\n/).filter(l => !l.trim().startsWith('//')).join('\n');

test('the plate row’s label column holds the whole stage name on its own line and never bleeds into the title', () => {
    const s = code(read('src/Tabs/HomeTab.jsx'));
    const row = s.slice(s.indexOf('function PlateRow('), s.indexOf('function PlateRow(') + 4000);
    assert.ok(row.includes("<div style={{ width: '136px', flexShrink: 0, minWidth: 0 }}>"), 'the column is 136px — room for "Negotiation/Review" and "Evaluation (Demo)"');
    assert.ok(!row.includes("width: '68px'"), 'the 68px column is gone');
    assert.ok(row.includes("<span style={{ display: 'block', color: sc.text || T.inkMuted, overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.stage}</span>"), 'the stage is its own line, in its stage colour, clipped with an ellipsis rather than overflowing');
    assert.ok(row.includes("overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={`${fmtArr(item.arr)} · ${item.stage}`}>"), 'the whole amount · stage line is guarded and readable in full on hover');
    assert.ok(row.includes("<div style={{ flex: 1, minWidth: 0 }}>"), 'the title column still shrinks instead of pushing the button out');
});
