// tests/rounded-scrollers.test.mjs
//
// A rounded box never scrolls itself: the box clips, and a box inside it scrolls (state §0.213).
//
// A box whose own style rounds its corners and scrolls (overflow, overflowX or overflowY auto or scroll) draws the
// native scrollbar square over its corners on that side: the New User window's 12 px right corners were square on
// its Primary Info tab (Jeff's question in §0.212's browser check, 27 Oct). The fix the search palette and the lead
// import window already had: the rounded box clips (overflow hidden) and a box inside it scrolls. At 3-5 px a
// scrollbar takes a few pixels off a corner, so the rule holds from 6 px (Jeff, 28 Oct: "The visible ones").
//
// THE GUARD: a parse of every file under src and of src/index.css. None of these stands but those named below with
// why, each reason pinned:
// - a box rounded 6 px or more (or by a radius it cannot read) that scrolls itself — its inline style laid over the
//   rules of a single class it names (`.modal`), its keys read in order as React sets them (a later `overflow` sets
//   both axes; a two-value `overflow` sets x then y; one axis hidden makes a visible other axis scroll);
// - a <textarea> — a scroller of its own — rounded 6 px or more: by its style, a class it names, or a `.class
//   textarea` rule of a box it sits in (`.form-group textarea` is 10 px);
// - a box rounded 6 px or more that holds a scroller or a textarea as its first or last element child and does not
//   clip both axes (in a block or flex box laid out in source order, an end child is where one reaches a corner);
// - a CSS selector whose rules round it 6 px or more and set an overflow to auto or scroll, in a media query too.
// And each box §0.213 made clip keeps its scroller inside it, bounded, its focus cue and its handles (SITES), and
// every .modal and .table-container holds its content in a box inside it that scrolls. A bound is what the layout
// needs: in a flex column a scroller shrinks to the box unless it cannot (flex 'none', a shrink of 0, a min height —
// a scroll container's own minimum is 0); in a block box it needs a height or a max height of its own.
// Not read: a style spread from another file, a prop or a call (a spread of a const in the file, or a ?: or && of
// object literals, is read); a const built by a call (useMemo); a second const of one name in a file (the first is
// read); a repeated key (React keeps its first place); a radius and an overflow set by two different CSS selectors
// for one element; a descendant selector but `.class textarea`; a class set by anything but a string, a template's
// text or a ?:'s strings; a grid or an `order` that puts a middle child at a corner.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { parse } from '@babel/parser';
import { T as TOKENS } from '../src/tokens.js';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8').replace(/\r\n/g, '\n');
const MIN = 6;

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
const kids = (n) => Object.keys(n).filter((k) => k !== 'loc').flatMap((k) => (Array.isArray(n[k]) ? n[k] : [n[k]])).filter((v) => v && typeof v.type === 'string');
const keyOf = (p) => p.key && (p.key.type === 'Identifier' ? p.key.name : p.key.type === 'StringLiteral' ? p.key.value : null);
const RADII = new Set(['borderRadius', 'borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius']);
const attr = (el, name) => el.openingElement.attributes.find((a) => a.type === 'JSXAttribute' && a.name.name === name);
const isTag = (n) => n.type === 'JSXElement' && /^[a-z]/.test(n.openingElement.name.name || '');

// The token values a file's `T` names: the shared tokens, with a file's own `const T = { ...TOKENS, r: 4 }` laid over.
const tokensOf = (ast) => {
    const t = { ...TOKENS };
    for (const s of ast.program.body) {
        if (s.type !== 'VariableDeclaration') continue;
        for (const d of s.declarations) {
            if (d.id.type !== 'Identifier' || d.id.name !== 'T' || d.init?.type !== 'ObjectExpression') continue;
            for (const p of d.init.properties) if (p.type === 'ObjectProperty' && p.value.type === 'NumericLiteral') t[keyOf(p)] = p.value.value;
        }
    }
    return t;
};
// A radius in px: the largest it can be; Infinity where it cannot be read (a box that might be rounded is counted).
const pxOfText = (s) => Math.max(0, ...[...String(s).matchAll(/(\d*\.?\d+)\s*(px|%|rem|em)?/g)].map((m) => (m[2] === '%' ? Infinity : m[2] === 'rem' || m[2] === 'em' ? +m[1] * 16 : +m[1])));
const px = (n, t) => {
    if (!n) return 0;
    switch (n.type) {
        case 'NumericLiteral': return n.value;
        case 'StringLiteral': return pxOfText(n.value);
        case 'TemplateLiteral': return Math.max(pxOfText(n.quasis.map((q) => q.value.cooked).join(' ')), ...n.expressions.map((e) => px(e, t)));
        case 'MemberExpression': return n.object.type === 'Identifier' && n.object.name === 'T' && !n.computed && typeof t[n.property.name] === 'number' ? t[n.property.name] : Infinity;
        case 'BinaryExpression': return n.operator === '+' ? px(n.left, t) + px(n.right, t) : Infinity;
        case 'ConditionalExpression': return Math.max(px(n.consequent, t), px(n.alternate, t));
        case 'LogicalExpression': return Math.max(px(n.left, t), px(n.right, t));
        default: return Infinity;
    }
};
// What a style value can be: its strings and numbers, every branch; '?' where it cannot be read.
const values = (n) => (!n ? [] : n.type === 'StringLiteral' ? [n.value]
    : n.type === 'NumericLiteral' ? [String(n.value)]
    : n.type === 'TemplateLiteral' && !n.expressions.length ? [n.quasis[0].value.cooked]
    : n.type === 'ConditionalExpression' ? [...values(n.consequent), ...values(n.alternate)]
    : n.type === 'LogicalExpression' ? [...values(n.left), ...values(n.right)] : ['?']);
// A style's properties in order — a spread of a const in the file, or of a ?: or && of object literals, laid in.
const propsOf = (obj, consts) => obj.properties.flatMap((p) => (p.type === 'ObjectProperty' ? [p] : p.type === 'SpreadElement' ? spreadProps(p.argument, consts) : []));
const spreadProps = (a, consts) => (a.type === 'Identifier' && consts.get(a.name) ? propsOf(consts.get(a.name), consts)
    : a.type === 'ObjectExpression' ? propsOf(a, consts)
    : a.type === 'ConditionalExpression' ? [...spreadProps(a.consequent, consts), ...spreadProps(a.alternate, consts)]
    : a.type === 'LogicalExpression' ? spreadProps(a.right, consts) : []);
// An element's own style properties: an inline object, or a const of the file named as the style.
const ownProps = (el, consts = new Map()) => {
    const e = attr(el, 'style')?.value?.expression;
    return e?.type === 'ObjectExpression' ? propsOf(e, consts) : e?.type === 'Identifier' && consts.get(e.name) ? propsOf(consts.get(e.name), consts) : [];
};
const SCROLL = (v) => v === 'auto' || v === 'scroll' || v === '?';
const CLIP = (v) => v === 'hidden' || v === 'clip';
// An overflow state from CSS-like declarations in order: [axis, value-list].
const overflowOf = (decls) => {
    let x = null, y = null;
    for (const [k, vs] of decls) {
        if (k === 'overflow') {
            const two = vs.map((v) => v.trim().split(/\s+/));
            x = two.map((p) => p[0]); y = two.map((p) => p[1] ?? p[0]);
        } else if (k === 'overflowX') x = vs;
        else if (k === 'overflowY') y = vs;
    }
    // One axis neither visible nor clip makes a visible other axis compute to auto (CSS Overflow).
    const vis = (a) => !a || a.every((v) => v === 'visible');
    if (!vis(x) && x.some((v) => !CLIP(v) || v === 'hidden') && vis(y)) y = ['auto'];
    if (!vis(y) && y.some((v) => !CLIP(v) || v === 'hidden') && vis(x)) x = ['auto'];
    return { x: x || [], y: y || [] };
};
// The radius a style sets and how it overflows, its keys read in order: a later key wins.
const styleOf = (props, t, base = { radius: 0, decls: [] }) => {
    let radius = base.radius;
    const decls = [...base.decls];
    for (const p of props) {
        const k = keyOf(p);
        if (k === 'overflow' || k === 'overflowX' || k === 'overflowY') decls.push([k, values(p.value)]);
        else if (k === 'borderRadius') radius = px(p.value, t);
        else if (RADII.has(k)) radius = Math.max(radius, px(p.value, t));
    }
    const { x, y } = overflowOf(decls);
    return { radius, sx: x.some(SCROLL), sy: y.some(SCROLL), scrolls: x.some(SCROLL) || y.some(SCROLL), clips: x.length > 0 && y.length > 0 && x.every(CLIP) && y.every(CLIP) };
};
const hits = (s) => s.radius >= MIN && s.scrolls;

// The CSS: each selector's largest radius and its overflow declarations in order (media queries too).
const cssRules = (css) => {
    const by = new Map();
    const rules = (text) => {
        let i = 0;
        while (i < text.length) {
            const open = text.indexOf('{', i);
            if (open < 0) return;
            let depth = 1, j = open + 1;
            while (j < text.length && depth) { if (text[j] === '{') depth++; else if (text[j] === '}') depth--; j++; }
            const selector = text.slice(i, open).trim(), body = text.slice(open + 1, j - 1);
            if (selector.startsWith('@')) rules(body);
            else for (const sel of selector.split(',').map((s) => s.trim().replace(/\s+/g, ' ')).filter(Boolean)) {
                const r = by.get(sel) || { radius: 0, decls: [] };
                for (const decl of body.split(';')) {
                    const [prop, ...rest] = decl.split(':'), v = rest.join(':').replace(/!important/, '').trim(), k = (prop || '').trim();
                    if (/^border(-(top|bottom)-(left|right))?-radius$/.test(k)) r.radius = Math.max(r.radius, pxOfText(v));
                    const m = k.match(/^overflow(-([xy]))?$/);
                    if (m) r.decls.push([m[2] ? `overflow${m[2].toUpperCase()}` : 'overflow', [v]]);
                }
                by.set(sel, r);
            }
            i = j;
        }
    };
    rules(css.replace(/\/\*[\s\S]*?\*\//g, ''));
    return by;
};
const CSS = cssRules(read('src/index.css'));
const cssRounded = (rulesBy) => [...rulesBy].filter(([, r]) => { const { x, y } = overflowOf(r.decls); return r.radius >= MIN && (x.some(SCROLL) || y.some(SCROLL)); }).map(([s]) => s);
// The classes an element names: a string's words, a template's text, a ?:'s strings.
const classesOf = (el) => {
    const v = attr(el, 'className')?.value;
    const texts = !v ? [] : v.type === 'StringLiteral' ? [v.value] : v.type === 'JSXExpressionContainer' ? strs(v.expression) : [];
    return texts.flatMap((s) => s.split(/\s+/)).filter(Boolean);
};
const strs = (n) => (!n ? [] : n.type === 'StringLiteral' ? [n.value] : n.type === 'TemplateLiteral' ? n.quasis.map((q) => q.value.cooked)
    : n.type === 'ConditionalExpression' ? [...strs(n.consequent), ...strs(n.alternate)] : n.type === 'LogicalExpression' ? strs(n.right) : []);
// An element's style: its classes' rules (single-class selectors, and `.class textarea` of a box a textarea sits in)
// under its own style, as the cascade lays them.
const elementStyle = (el, consts, t, rulesBy = CSS, around = []) => {
    const base = { radius: 0, decls: [] };
    const lay = (r) => { if (r) { base.radius = Math.max(base.radius, r.radius); base.decls.push(...r.decls); } };
    if (el.openingElement.name.name === 'textarea') for (const c of around) lay(rulesBy.get(`.${c} textarea`));
    for (const c of classesOf(el)) lay(rulesBy.get(`.${c}`));
    return styleOf(ownProps(el, consts), t, base);
};

// Every breach of the rule in a file.
const breaches = (file, src, rulesBy = CSS) => {
    const ast = parse(src, { sourceType: 'module', plugins: ['jsx'] });
    const t = tokensOf(ast);
    const consts = new Map();
    const collect = (n) => {
        if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.init?.type === 'ObjectExpression' && !consts.has(n.id.name)) consts.set(n.id.name, n.init);
        for (const c of kids(n)) collect(c);
    };
    collect(ast.program);
    const out = [];
    const hit = (n, kind) => out.push({ file, line: n.loc.start.line, kind, text: src.slice(n.start, n.end) });
    const visit = (n, around) => {
        if (n.type === 'ObjectExpression' && hits(styleOf(propsOf(n, consts), t))) hit(n, 'scrolls itself');
        let inside = around;
        if (isTag(n)) {
            const s = elementStyle(n, consts, t, rulesBy, around);
            // Its own style alone is judged where it is written (the object above); here, what its classes add.
            if (hits(s) && !hits(styleOf(ownProps(n, consts), t))) hit(n, 'scrolls itself (its class)');
            if (n.openingElement.name.name === 'textarea' && s.radius >= MIN) hit(n, 'a rounded textarea');
            inside = [...around, ...classesOf(n)];
            // A scroller reaches a corner as the box's first or last element; one between others does not.
            const els = n.children.filter(isTag);
            const holds = [els[0], els[els.length - 1]].filter(Boolean).some((c) => c.openingElement.name.name === 'textarea' || elementStyle(c, consts, t, rulesBy, inside).scrolls);
            if (s.radius >= MIN && holds && !s.clips && !s.scrolls) hit(n, 'holds a scroller and does not clip');
        }
        for (const c of kids(n)) visit(c, inside);
    };
    visit(ast.program, []);
    return out;
};

// Rounded scrollers that stand, each for its reason (pinned below), each for the one kind of breach it excuses.
const NAMED = [
    { file: 'src/components/layout/AppHeader.jsx', anchor: "top: isMobile ? 0 : 56, right: isMobile ? 0 : 16", kind: 'scrolls itself',
        reason: "the profile panel: its height is auto, so it never scrolls down — it is the clipping box of its tab body, which scrolls; it scrolls sideways only if a row is wider than the panel (the org chip once was: it wraps since); on a phone its radius is 0 (index.css .spt-profile-panel)" },
];
const isNamed = (h) => NAMED.some((n) => n.file === h.file && n.kind === h.kind && h.text.includes(n.anchor));

test('THE GUARD — no rounded box under src scrolls itself (6 px and up), and one that holds a scroller clips', () => {
    const files = srcFiles();
    assert.ok(files.length > 150, 'the walk sees the tree');
    const all = files.flatMap((f) => breaches(f, read(f)));
    assert.deepEqual(all.filter((h) => !isNamed(h)).map((h) => `${h.file}:${h.line} ${h.kind}`), [], 'a rounded box that scrolls itself, or holds a scroller unclipped, paints a scrollbar square over its corners');
    for (const n of NAMED) assert.ok(all.some((h) => isNamed(h) && h.file === n.file && h.text.includes(n.anchor)), `${n.file}: the named box (${n.reason.slice(0, 40)}…) — gone, or breaching another way`);
    assert.deepEqual(cssRounded(CSS), [], 'and no CSS class rounds a box that scrolls itself');
});

test('the named boxes are as their reasons say', () => {
    const h = read('src/components/layout/AppHeader.jsx');
    const at = h.indexOf("top: isMobile ? 0 : 56, right: isMobile ? 0 : 16");
    assert.ok(at > 0, 'the profile panel');
    const line = h.slice(h.lastIndexOf('\n', at) + 1, h.indexOf('\n', at));
    assert.ok(line.includes('className="spt-profile-panel"') && line.includes("bottom: isMobile ? 0 : 'auto'") && !/maxHeight|[^-]height:/.test(line), 'the profile panel: no height and no max height — it grows with what it holds');
    assert.ok(line.includes("overflow: 'auto'"), 'it clips its tab body (an overflow of auto, which it never needs down) — visible, the tab body would square its corners');
    assert.ok(line.includes('borderRadius: isMobile ? 0 : 6'), 'square on a phone');
    assert.ok(read('src/index.css').includes('.spt-profile-panel'), 'its phone rules');
});

// What a box's scrollers need to scroll in it, by its layout: why one cannot, or null.
const last = (props, k) => { let out = null; for (const p of props) if (keyOf(p) === k) out = values(p.value); return out; };
const isNum = (v) => /^\d*\.?\d+$/.test(v);
const shrinkOfFlex = (v) => {
    const w = v.trim().split(/\s+/);
    if (w[0] === 'none') return 0;
    if (w.length >= 2 && isNum(w[1])) return +w[1];
    return w.length >= 2 || isNum(w[0]) || w[0] === 'auto' || w[0] === 'initial' ? 1 : NaN;
};
const layoutOf = (props) => {
    const d = last(props, 'display'), f = last(props, 'flexDirection');
    return d && f && d.every((v) => v === 'flex') && f.every((v) => v === 'column') ? 'column' : 'block';
};
const boundsHeight = (props) => (last(props, 'height') || []).some((v) => v !== 'auto') || (last(props, 'maxHeight') || []).some((v) => v !== 'none');
const setsY = (props) => props.some((p) => (keyOf(p) === 'overflowY' || keyOf(p) === 'overflow') && values(p.value).some((v) => SCROLL(v.trim().split(/\s+/).pop())));
const unboundBy = (props, layout, boxProps) => {
    if (layout === 'column') {
        let shrink = 1;
        for (const p of props) {
            const k = keyOf(p), vs = values(p.value);
            if (k === 'flex') shrink = Math.min(...vs.map(shrinkOfFlex));
            else if (k === 'flexShrink') shrink = Math.min(...vs.map((v) => (isNum(v) ? +v : NaN)));
            else if (k === 'minHeight' && vs.some((v) => !['0', '0px', 'auto'].includes(v))) return 'holds a min height, so it cannot shrink to the box';
        }
        return shrink > 0 ? null : 'cannot shrink to the box (flex none, or a shrink of 0)';
    }
    const hv = last(props, 'height'), mv = last(props, 'maxHeight');
    if (mv && !mv.includes('none')) return null;
    if (hv && !hv.includes('auto')) return hv.some((v) => v.endsWith('%')) && !(last(boxProps, 'height') || []).some((v) => v !== 'auto') ? 'takes a height in % of a box whose height is not set' : null;
    return 'has no height or max height of its own';
};
// Each breach of §0.213's shape at a box: [] when it rounds, clips and holds what scrolls as its layout lets it.
const siteBreaches = (box, t, { textarea = false, rulesBy = CSS } = {}) => {
    const out = [];
    const st = elementStyle(box, new Map(), t, rulesBy);
    if (st.radius < MIN) out.push('is not rounded');
    if (!st.clips) out.push('no longer clips — the scrollbar or a square background inside it paints over its corners');
    const children = box.children.filter((c) => c.type === 'JSXElement');
    if (textarea) {
        const ta = children.find((c) => c.openingElement.name.name === 'textarea');
        if (!ta) return [...out, 'holds no textarea'];
        const own = ownProps(ta);
        const v = (k) => last(own, k);
        if (!(v('border')?.length === 1 && v('border')[0] === 'none' && v('borderRadius')?.length === 1 && v('borderRadius')[0] === '0')) out.push("'s textarea rounds or borders itself — it scrolls, and its corners square inside the box");
        return out;
    }
    const boxProps = ownProps(box), layout = layoutOf(boxProps);
    const scrollers = children.map((c) => ownProps(c)).filter((props) => styleOf(props, t).scrolls);
    if (!scrollers.length) return [...out, 'holds nothing that scrolls — what does not fit is cut off'];
    const ys = scrollers.filter(setsY);
    if (boundsHeight(boxProps) && !ys.length) out.push('bounds its height and holds nothing that scrolls down — what does not fit is cut off');
    for (const props of ys) { const why = unboundBy(props, layout, boxProps); if (why) out.push(`'s scroller ${why} — it runs past the box, which cuts it off`); }
    return out;
};

// Each box §0.213 made clip: found by an anchor in its style (`box`) or in its scroller's (`inner`).
const SITES = [
    { file: 'src/components/modals/UserModal.jsx', box: "boxShadow: '0 12px 40px rgba(0,0,0,0.18)'", what: 'the New User window' },
    { file: 'src/components/modals/UserModal.jsx', box: 'boxShadow: notesFocused ?', what: 'its Notes box', textarea: true },
    { file: 'src/components/layout/ModalLayer.jsx', box: "animation: 'slideUp 0.18s ease'", what: 'the Keyboard Shortcuts panel' },
    { file: 'src/components/layout/ModalLayer.jsx', box: "background: 'rgba(255,255,255,0.08)'", what: 'a refused-notes box' },
    { file: 'src/components/layout/AppHeader.jsx', box: "maxHeight: isMobile ? '100%' : 500", what: 'the Notifications dropdown' },
    { file: 'src/Tabs/settings/people/TeamsDetail.jsx', box: "width:520, maxHeight:'90vh'", what: 'the team editor' },
    { file: 'src/Tabs/settings/people/TerritoriesDetail.jsx', box: "width:460, maxHeight:'88vh'", what: 'the territory editor' },
    { file: 'src/components/modals/CsvImportModal.jsx', box: 'height: size.h', what: 'the CSV import window' },
    { file: 'src/components/modals/CsvImportModal.jsx', inner: "maxHeight: '298px'", what: 'the CSV preview table' },
    { file: 'src/components/modals/CsvImportModal.jsx', inner: "maxHeight: '258px'", what: 'the CSV invite list' },
    { file: 'src/components/modals/CsvImportModal.jsx', box: "maxWidth: 560, margin: '0 auto 20px'", what: 'the CSV not-invited list' },
    { file: 'src/components/modals/LeadImportModal.jsx', inner: "{ overflowX:'auto' }", what: 'the lead import preview' },
    { file: 'src/components/modals/LeadImportModal.jsx', inner: "outlineOffset:'-2px'", what: 'the lead import paste box', textarea: true },
    { file: 'src/components/layout/QuickLogFab.jsx', inner: "...inputStyle, border: 'none'", what: 'the Quick Log notes', textarea: true },
    { file: 'src/Tabs/DispatchTab.jsx', inner: 'maxHeight:238', what: "Dispatch's filter popover" },
];
const findSite = (s) => {
    const src = read(s.file);
    const ast = parse(src, { sourceType: 'module', plugins: ['jsx'] });
    const t = tokensOf(ast);
    const found = [];
    const visit = (n, parent) => {
        if (n.type === 'JSXElement') {
            const e = attr(n, 'style')?.value?.expression;
            const text = e ? src.slice(e.start, e.end) : '';
            if (s.box && text.includes(s.box)) found.push(n);
            if (s.inner && text.includes(s.inner)) found.push(parent);
            for (const c of n.children) if (c.type === 'JSXElement') visit(c, n); else visit(c, parent);
            for (const a of n.openingElement.attributes) visit(a, parent);
            return;
        }
        for (const c of kids(n)) visit(c, parent);
    };
    visit(ast.program, null);
    return { found, t };
};

test('each box §0.213 made clip still clips, round, around a scroller its layout bounds — or a textarea of no border or radius', () => {
    for (const s of SITES) {
        const { found, t } = findSite(s);
        assert.equal(found.length, 1, `${s.what} (${s.file}): found once`);
        assert.ok(found[0], `${s.what}: its box`);
        assert.deepEqual(siteBreaches(found[0], t, { textarea: s.textarea }).map((w) => `REGRESSION: ${s.what} ${w}`), [], s.what);
    }
});

test("the focus cues, the New User window's handles and the handles' touch action came with them", () => {
    const um = read('src/components/modals/UserModal.jsx');
    assert.ok(um.includes("<div onFocus={() => setNotesFocused(true)} onBlur={() => setNotesFocused(false)}") && um.includes("boxShadow: notesFocused ? '0 0 0 3px rgba(28,25,23,0.07)' : 'none'"),
        "REGRESSION: the Notes box drops .form-group's focus ring — its box clips the textarea's own");
    assert.ok(read('src/components/modals/LeadImportModal.jsx').includes("outlineOffset:'-2px'"), "REGRESSION: the paste box's focus outline straddles its edge, and its box cuts off the outer half");
    const end = um.indexOf('                </form>\n');
    assert.ok(end > 0 && um.slice(end).startsWith('                </form>\n            <ResizeHandles getResizeHandleProps={getResizeHandleProps} />\n            </div>\n'),
        "REGRESSION: the window's resize handles sit outside its scroller — they lie over the scrollbar's arrows, and a press there resizes");
    assert.ok(um.includes("<div style={{ height: '100%', overflowY: 'auto', padding: '1.5rem', position: 'relative' }}>"), 'the scroller places them');

    // The handles, run as written: each zone keeps the hook's style (touchAction 'none') under its own. In a scroller,
    // a touch on a handle would otherwise pan it while it resizes (the New User window, state §0.213).
    const src = read('src/hooks/ResizeHandles.jsx');
    const ast = parse(src, { sourceType: 'module', plugins: ['jsx'] });
    const decl = {};
    const zones = [];
    const visit = (n) => {
        if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier') decl[n.id.name] = n.init;
        if (n.type === 'JSXElement' && n.openingElement.name.name === 'div') zones.push(n);
        for (const c of kids(n)) visit(c);
    };
    visit(ast.program);
    assert.ok(decl.C && decl.s && decl.zone, 'C, s and zone are declared');
    const text = (n) => src.slice(n.start, n.end);
    const zone = new Function('getResizeHandleProps', `const C = ${text(decl.C)}; const s = ${text(decl.s)}; return ${text(decl.zone)};`)(
        (d) => ({ onMouseDown: () => d, onTouchStart: () => d, style: { touchAction: 'none' } }));
    assert.equal(zones.length, 4, 'four zones');
    const seen = new Set();
    for (const z of zones) {
        const a = z.openingElement.attributes;
        assert.ok(a.length === 1 && a[0].type === 'JSXSpreadAttribute' && a[0].argument.type === 'CallExpression' && a[0].argument.callee.name === 'zone',
            'a zone takes its props from zone() alone — a style written after them replaces the hook\'s');
        const p = new Function('zone', `return ${text(a[0].argument)};`)(zone);
        assert.equal(p.style.touchAction, 'none', "REGRESSION: a resize handle's style replaces the hook's touchAction 'none' — in the New User window a touch resize also scrolls the form beneath it");
        assert.ok(p.style.position === 'absolute' && p.style.width === 20 && /resize$/.test(p.style.cursor) && typeof p.onTouchStart === 'function', 'and the zone is as it was, with the hook\'s handlers');
        seen.add(p.onMouseDown());
    }
    assert.deepEqual([...seen].sort(), ['ne', 'nw', 'se', 'sw'], 'one zone per corner');
});

test('every .modal and .table-container holds its content in a box inside it that scrolls — they clip what does not fit', () => {
    const css = read('src/index.css');
    const rule = (sel) => css.slice(css.indexOf(`        ${sel} {`), css.indexOf('}', css.indexOf(`        ${sel} {`)));
    assert.ok(/overflow: hidden;/.test(rule('.modal')) && /display: flex;/.test(rule('.modal')) && /flex-direction: column;/.test(rule('.modal')) && /max-height: 90vh;/.test(rule('.modal')),
        'REGRESSION: .modal no longer clips, or lays its inner box out as a column under its max height');
    assert.ok(/overflow: hidden;/.test(rule('.table-container')), 'REGRESSION: .table-container no longer clips');
    let seen = 0;
    for (const f of srcFiles()) {
        const src = read(f);
        if (!/\b(modal|table-container)\b/.test(src)) continue;
        const ast = parse(src, { sourceType: 'module', plugins: ['jsx'] });
        const t = tokensOf(ast);
        const visit = (n) => {
            if (n.type === 'JSXElement') {
                const cls = classesOf(n).find((c) => c === 'modal' || c === 'table-container');
                if (cls) {
                    seen++;
                    const where = `${f}:${n.loc.start.line} a .${cls}`;
                    const own = ownProps(n);
                    assert.ok(!own.some((p) => /^overflow/.test(keyOf(p))), `${where} sets an overflow of its own — the class clips`);
                    const inner = n.children.find((c) => c.type === 'JSXElement');
                    const props = inner ? ownProps(inner) : [];
                    assert.ok(styleOf(props, t).scrolls, `${where} whose first box does not scroll — what does not fit is cut off`);
                    if (cls === 'modal') {
                        const pad = own.find((p) => keyOf(p) === 'padding');
                        assert.ok(pad && pad.value.type === 'NumericLiteral' && pad.value.value === 0, `${where} keeps a padding of its own — it insets its scroller from the edge; the box inside carries it`);
                        assert.ok(setsY(props), `${where} whose first box does not scroll down — what passes the dialog's max height is cut off`);
                        const why = unboundBy(props, 'column', own);
                        assert.equal(why, null, `REGRESSION: ${where} whose scroller ${why} — it runs past the dialog's max height, cut off`);
                    }
                }
            }
            for (const c of kids(n)) visit(c);
        };
        visit(ast.program);
    }
    assert.equal(seen, 4, 'the three .modal boxes (confirm, prompt, coaching note) and the Catalog form');
});

test('the guard finds the shapes as they were, and passes a clipped box, a small radius and a later overflow', () => {
    const at = (src, css = '') => breaches('x.jsx', src, cssRules(css)).map((h) => `${h.kind}:${h.line}`);
    assert.deepEqual(at("const a = { borderRadius: '12px', border: '1px solid', padding: '1.5rem', overflowY: 'auto' };"), ['scrolls itself:1'], 'REGRESSION: the New User window before §0.213');
    assert.deepEqual(at("const a = { borderRadius: isMobile ? '0' : '16px', overflowY: 'auto' };"), ['scrolls itself:1'], 'the largest branch counts');
    assert.deepEqual(at("const T = { ...TOKENS, r: 4 };\nconst a = { borderRadius: T.r + 2, overflowY: 'auto' };"), ['scrolls itself:2'], "a file's own T (Dispatch's r is 4)");
    assert.deepEqual(at("const a = { borderRadius: size.r, overflow: 'auto' };"), ['scrolls itself:1'], 'a radius it cannot read is counted');
    assert.deepEqual(at("const a = { borderRadius: 8, overflowX: dir };"), ['scrolls itself:1'], 'an overflow it cannot read is counted');
    assert.deepEqual(at("const a = { borderRadius: 8, overflow: 'hidden auto' };"), ['scrolls itself:1'], 'a two-value overflow: x then y');
    assert.deepEqual(at("const a = { borderRadius: 8, maxHeight: 200, overflowX: 'hidden' };"), ['scrolls itself:1'], 'one axis hidden makes the other scroll');
    assert.deepEqual(at("const a = { borderRadius: 8, ...(open ? { overflowY: 'auto' } : {}) };"), ['scrolls itself:1'], 'a ?: of object literals spread in');
    assert.deepEqual(at("const s = { borderRadius: 12, overflowY: 'auto' };\nconst x = <div style={s} />;"), ['scrolls itself:1'], 'a const named as the style: judged once, where it is written');
    assert.deepEqual(at("const s = { border: '1px solid', borderRadius: '8px' };\nconst x = <textarea style={{ ...s, resize: 'vertical' }} />;"), ['a rounded textarea:2'], 'REGRESSION: a rounded textarea scrolls itself (the Quick Log notes before §0.213)');
    assert.deepEqual(at("const x = <div className=\"fg\"><label /><textarea style={{ minHeight: 80 }} /></div>;", '.fg textarea { border-radius: 10px; }'), ['a rounded textarea:1'], 'a textarea rounded by a `.class textarea` rule of the box it sits in (.form-group textarea)');
    assert.deepEqual(at("const x = <div className=\"fg\"><label /><textarea style={{ borderRadius: 0 }} /></div>;", '.fg textarea { border-radius: 10px; }'), [], '…which its own radius overrides');
    assert.deepEqual(at("const x = <div style={{ borderRadius: 12 }}><div style={{ maxHeight: 300, overflowY: 'auto' }} /></div>;"), ['holds a scroller and does not clip:1'], 'REGRESSION: a rounded box holding a scroller unclipped (a fixed site whose scroller is its first or last child, its clip dropped)');
    assert.deepEqual(at("const x = <div style={{ borderRadius: 8 }}><textarea style={{ border: 'none', borderRadius: 0 }} /></div>;"), ['holds a scroller and does not clip:1'], 'and holding a textarea');
    assert.deepEqual(at("const x = <div className=\"card\" style={{ maxHeight: 300, overflowY: 'auto' }} />;", '.card { border-radius: 12px; }'), ['scrolls itself (its class):1'], 'a class radius under an inline scroll: the style laid over the class');
    assert.deepEqual(at("const x = <div className=\"card\" />;", '.card { border-radius: 12px; overflow-y: auto; }'), ['scrolls itself (its class):1'], 'a class that rounds and scrolls');
    assert.deepEqual(at("const x = <div className=\"card\" style={{ padding: 0 }}><div style={{ overflowY: 'auto', flex: 1 }} /></div>;", '.card { border-radius: 12px; }'), ['holds a scroller and does not clip:1'], 'a class-rounded box holding a scroller unclipped');
    assert.deepEqual(at("const x = <div className=\"card\" style={{ padding: 0 }}><div style={{ overflowY: 'auto', flex: 1 }} /></div>;", '.card { border-radius: 12px; overflow: hidden; }'), [], 'the class clips (.modal as fixed)');
    assert.deepEqual(at("const x = <div style={{ borderRadius: 12, overflow: 'hidden' }}><div style={{ maxHeight: 300, overflowY: 'auto' }} /></div>;"), [], 'the box that clips');
    assert.deepEqual(at("const a = { borderRadius: 6, overflowY: 'auto', overflow: 'hidden' };"), [], 'a later overflow wins, as React sets it');
    assert.deepEqual(at("const a = { borderRadius: 5, overflowY: 'auto' };"), [], 'under 6 px: a few pixels');
    assert.deepEqual(at("const a = { borderRadius: 12, overflowY: 'auto', overflow: 'hidden', overflowX: 'auto' };"), ['scrolls itself:1'], 'an axis set again after');
    const css = (s) => cssRounded(cssRules(s));
    assert.deepEqual(css('.a { border-radius: 12px; overflow-y: auto; }'), ['.a'], 'a CSS class');
    assert.deepEqual(css('.b { border-radius: 8px; } @media (max-width: 640px) { .b { overflow-x: auto; } }'), ['.b'], 'REGRESSION: rounded in one rule, scrolling in a media query (.table-container before §0.213)');
    assert.deepEqual(css('.c { border-radius: 16px; overflow: hidden; } .c-inner { overflow-y: auto; }'), [], 'the class that clips');
    assert.deepEqual(css('.d { border-radius: 4px; overflow: auto; } /* .e { border-radius: 9px; overflow: auto } */'), [], 'under 6 px, and a comment');

    // A NAMED box is excused for its own kind of breach alone: dropping its clip on the tab body is caught.
    const named = (h) => NAMED.some((n) => n.kind === h.kind && h.text.includes(n.anchor));
    const panel = (overflow) => `const x = <div style={{ top: isMobile ? 0 : 56, right: isMobile ? 0 : 16, borderRadius: 6, overflow: '${overflow}' }}><div /><div style={{ maxHeight: 560, overflowY: 'auto' }} /></div>;`;
    assert.deepEqual(breaches('x.jsx', panel('auto'), cssRules('')).filter((h) => !named(h)).map((h) => h.kind), [], 'the panel as it stands');
    assert.deepEqual(breaches('x.jsx', panel('visible'), cssRules('')).filter((h) => !named(h)).map((h) => h.kind), ['holds a scroller and does not clip'], 'REGRESSION: the panel neither clips nor scrolls — its tab body squares its corners, and is no longer excused');

    // The bound a box's scroller needs, by the box's layout.
    const site = (src) => {
        const ast = parse(src, { sourceType: 'module', plugins: ['jsx'] });
        let box = null;
        const find = (n) => { if (!box && n.type === 'JSXElement') box = n; for (const c of kids(n)) find(c); };
        find(ast.program);
        return siteBreaches(box, TOKENS, { rulesBy: cssRules('') }).map((w) => w.split(' — ')[0]);
    };
    const column = (inner, extra = '') => site(`const x = <div style={{ borderRadius: 8, maxHeight: 500, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}><div style={{ flexShrink: 0 }} /><div style={{ ${inner} }} />${extra}</div>;`);
    assert.deepEqual(column("overflowY: 'auto', flex: '1 1 auto', minHeight: 0"), [], 'a flex share in a column');
    assert.deepEqual(column("overflowY: 'auto'"), [], 'no flex key: a scroller shrinks to the box (its own minimum is 0)');
    assert.deepEqual(column("overflowY: 'auto', flex: 'none'"), ["'s scroller cannot shrink to the box (flex none, or a shrink of 0)"], 'REGRESSION: flex none');
    assert.deepEqual(column("overflowY: 'auto', flex: '0 0 auto'"), ["'s scroller cannot shrink to the box (flex none, or a shrink of 0)"], 'REGRESSION: a shrink of 0');
    assert.deepEqual(column("overflowY: 'auto', flex: '1 1 auto', flexShrink: 0"), ["'s scroller cannot shrink to the box (flex none, or a shrink of 0)"], 'REGRESSION: flexShrink 0 copied from the header');
    assert.deepEqual(column("overflowY: 'auto', flex: grow"), ["'s scroller cannot shrink to the box (flex none, or a shrink of 0)"], 'a flex it cannot read fails closed');
    assert.deepEqual(column("overflowY: 'auto', minHeight: 400"), ["'s scroller holds a min height, so it cannot shrink to the box"], 'a min height');
    assert.deepEqual(column("flex: 1", "<div style={{ overflowX: 'auto' }} />"), ['bounds its height and holds nothing that scrolls down'], 'REGRESSION: the body stops scrolling while a row still scrolls sideways (the CSV window)');
    const block = (outer, inner) => site(`const x = <div style={{ borderRadius: 12, overflow: 'hidden', ${outer} }}><div style={{ ${inner} }} /></div>;`);
    assert.deepEqual(block('height: 520', "height: '100%', overflowY: 'auto'"), [], 'a height of 100% in a box whose height is set');
    assert.deepEqual(block('height: 520', "overflowY: 'auto'"), ["'s scroller has no height or max height of its own"], 'REGRESSION: the New User window\'s scroller without its height');
    assert.deepEqual(block('maxHeight: 520', "height: '100%', overflowY: 'auto'"), ["'s scroller takes a height in % of a box whose height is not set"], 'a % of a max height is no bound');
    assert.deepEqual(block('padding: 0', "maxHeight: 298, overflowY: 'auto'"), [], 'a max height of its own');
    assert.deepEqual(block('padding: 0', "overflowY: 'auto'"), ["'s scroller has no height or max height of its own"], 'REGRESSION: a list that lost its max height');
    assert.deepEqual(block('padding: 0', "overflowX: 'auto'"), [], 'a sideways scroller is as tall as it holds');
    assert.deepEqual(block('padding: 0', "padding: 4"), ['holds nothing that scrolls'], 'REGRESSION: nothing scrolls');
});

test('the suites: this file is graded by the harness', () => {
    const suites = read('scripts/mutate-import.mjs').match(/^const SUITES = '([^'\n]*)';$/m)?.[1].split(' ') ?? [];
    assert.ok(suites.includes('tests/rounded-scrollers.test.mjs'), 'SUITES runs this file');
});
