// tests/border-sides.test.mjs
//
// A changing border is written side by side, never as a shorthand over a side set apart
// from it (state §0.179).
//
// React re-sets only the style properties whose values changed. A style that set a
// changing `border` and, beside it, one side of its own (a Kanban card's stage edge, a
// lead card's accent, a dispatch job's priority edge, a crew's colour edge, a saved-view
// chip's divider) lost that side the first time the shorthand changed — a card ticked, a
// card hovered, a job or crew selected — until the element was drawn again (observed: a
// Kanban card's 2-px stage edge went to 1-px ink when ticked; a lead card's 3-px accent
// went at the first hover). React's own warning: "Updating border borderTop".
//
// THE GUARD: a parse of every style object under src — a changing border property must
// not overlap another border property it is not a part of. (A part changing under a fixed
// whole is fine: `border: 'none'` beside a changing `borderBottom`.) Style objects merged
// by spreading are not followed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { parse } from '@babel/parser';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');

const SIDES = ['Top', 'Right', 'Bottom', 'Left'];
const PARTS = ['Color', 'Width', 'Style'];
// The longhands a border property sets.
const expand = (k) => {
    if (k === 'border') return SIDES.flatMap((s) => PARTS.map((p) => `border${s}${p}`));
    const all = k.match(/^border(Color|Width|Style)$/);
    if (all) return SIDES.map((s) => `border${s}${all[1]}`);
    const side = k.match(/^border(Top|Right|Bottom|Left)$/);
    if (side) return PARTS.map((p) => `border${side[1]}${p}`);
    if (/^border(Top|Right|Bottom|Left)(Color|Width|Style)$/.test(k)) return [k];
    return null;
};
const keyOf = (p) => p.key && (p.key.type === 'Identifier' ? p.key.name : p.key.type === 'StringLiteral' ? p.key.value : null);
const isT = (x) => x.type === 'MemberExpression' && x.object.type === 'Identifier' && x.object.name === 'T';
// A value that cannot change between renders: a literal, a token, or a template of tokens.
const isFixed = (n) => n.type === 'StringLiteral' || n.type === 'NumericLiteral' || isT(n) || (n.type === 'TemplateLiteral' && n.expressions.every(isT));

// Every style object where a changing border property overwrites part of another.
const clashes = (file, src) => {
    const ast = parse(src, { sourceType: 'module', plugins: ['jsx'] });
    const out = [];
    const visit = (n) => {
        if (!n || typeof n.type !== 'string') return;
        if (n.type === 'ObjectExpression') {
            const props = n.properties.filter((p) => p.type === 'ObjectProperty' && expand(keyOf(p) || ''));
            for (const K of props) {
                if (isFixed(K.value)) continue;
                const eK = expand(keyOf(K));
                for (const L of props) {
                    if (L === K) continue;
                    const eL = expand(keyOf(L));
                    if (eK.some((x) => eL.includes(x)) && !eK.every((x) => eL.includes(x))) {
                        out.push(`${file}:${K.loc.start.line} ${keyOf(K)} over ${keyOf(L)}`);
                    }
                }
            }
        }
        for (const k of Object.keys(n)) {
            if (k === 'loc') continue;
            const v = n[k];
            if (Array.isArray(v)) v.forEach(visit); else if (v && typeof v.type === 'string') visit(v);
        }
    };
    visit(ast.program);
    return out;
};

const srcFiles = () => {
    const out = [];
    const walk = (dir) => {
        for (const e of readdirSync(new URL(dir, ROOT), { withFileTypes: true })) {
            const p = dir + e.name;
            if (e.isDirectory()) walk(p + '/');
            else if (/\.jsx?$/.test(e.name)) out.push(p);
        }
    };
    walk('src/');
    return out;
};

test('THE GUARD — no style under src lets a changing border shorthand overwrite a side set apart from it', () => {
    const files = srcFiles();
    assert.ok(files.length > 150, 'the walk sees the tree');
    assert.deepEqual(files.flatMap((f) => clashes(f, read(f))), []);
});

test('the guard finds the shapes as they were, and passes the fixed ones and a part under a fixed whole', () => {
    const was = 'const s = { border: `1px solid ${isSelected ? T.ink : T.border}`, borderTop: `2px solid ${stage}` };';
    assert.deepEqual(clashes('was.jsx', was), ['was.jsx:1 border over borderTop'], 'the Kanban card before §0.179');
    const hover = 'const s = { border:`1px solid ${hov ? T.borderStrong : T.border}`, borderLeft:`3px solid ${accent}` };';
    assert.equal(clashes('hover.jsx', hover).length, 1, 'the lead card before §0.179');
    const colour = "const s = { borderColor: on ? T.ink : T.border, borderTop: '2px solid #c8a978' };";
    assert.deepEqual(clashes('colour.jsx', colour), ['colour.jsx:1 borderColor over borderTop'], 'borderColor is a shorthand too');
    // Two that overlap in part, both changing: each can undo the other, so both are named.
    const both = 'const s = { borderColor: on ? T.ink : T.border, borderTop: `2px solid ${stage}` };';
    assert.equal(clashes('both.jsx', both).length, 2);
    const fixed = 'const edge = `1px solid ${isSelected ? T.ink : T.border}`; const s = { borderTop: `2px solid ${stage}`, borderRight: edge, borderBottom: edge, borderLeft: edge };';
    assert.deepEqual(clashes('fixed.jsx', fixed), [], 'side by side');
    const part = "const s = { border: 'none', borderBottom: active ? `2px solid ${T.ink}` : '2px solid transparent' };";
    assert.deepEqual(clashes('part.jsx', part), [], 'a part changing under a fixed whole is drawn as meant');
});

test('the six places it held are side by side now', () => {
    const k = read('src/components/KanbanView.jsx');
    assert.ok(k.includes('const edge = `1px solid ${isSelected ? T.ink : T.border}`;') && k.includes('borderRight: edge, borderBottom: edge, borderLeft: edge,'), 'Kanban card');
    const d = read('src/Tabs/DispatchTab.jsx');
    assert.ok(d.includes('const edge = `1.5px solid ${isSel ? T.goldInk : T.border}`;') && d.includes('borderTop: edge, borderRight: edge, borderBottom: edge,'), 'dispatch job');
    const l = read('src/Tabs/LeadsTab.jsx');
    assert.ok(l.includes('borderTop:edge, borderRight:edge, borderBottom:edge, borderLeft:`3px solid ${accent}`'), 'lead card');
    const p = read('src/Tabs/PipelineTab.jsx');
    assert.ok(p.includes("borderTop: edge, borderBottom: edge, borderLeft: edge,") && p.includes("borderRight: onDelete ? 'none' : edge,"), 'saved-view chip');
    assert.ok(p.includes("borderTop: edge, borderRight: edge, borderBottom: edge,\r\n                borderLeft: `1px solid ${active ? 'rgba(255,255,255,0.2)' : T.border}`,") || p.includes("borderTop: edge, borderRight: edge, borderBottom: edge,\n                borderLeft: `1px solid ${active ? 'rgba(255,255,255,0.2)' : T.border}`,"), 'its delete');
    const c = read('src/Tabs/settings/dispatch/DispatchCrewsDetail.jsx');
    assert.ok(c.includes('const crewEdge = (selected) => `1.5px solid ${selected ? T.goldInk : T.border}`;'), 'crew');
});
