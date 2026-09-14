#!/usr/bin/env node
//
// migrate-blue-era.mjs — the blue-era modals onto the warm-stone tokens
// (state §0.136; Jeff: "The blue-era modals … roughly 400 off-brand Tailwind
// colours … one job. It is independent of the paused signal migration").
//
//   node scripts/migrate-blue-era.mjs            # dry run: every replacement, per file
//   node scripts/migrate-blue-era.mjs --apply    # write, re-parse, report what is left
//
// WHAT IT DOES
// ------------
// Parses each file (@babel/parser, like check-dupes) and rewrites every hex
// colour literal it can NAME — a string literal that is a hex, a string that
// carries one (`'1px solid #e2e8f0'`), a template quasi, a JSX attribute
// (`fill="#2563eb"`) — to the token it means, deciding the blue ones by ROLE
// (the CSS property the literal sits under, or the argument slot of a `btn(bg,
// fg)` helper): a blue BACKGROUND was a primary button and becomes the ink
// button (guide §16: near-black buttons); a blue text, border or outline
// becomes `T.info`. Tints (Tailwind's -50/-100 washes) become the token with
// an alpha suffix, the form the app already uses (`${T.danger}12`). The
// import is added when the file lacks it.
//
// WHAT IT LEAVES, on purpose — printed as "kept" so nobody thinks it was missed:
//   - `#1c1917`, the dark drag-handle header the guide allows;
//   - DATA palettes (a pipeline's stored default colour, the stage pill map,
//     the avatar initials map) — a value the app stores or keys on, not a style;
//   - rgba() literals (shadows, washes) and any hex outside the map (listed).
//
// WHY A SCRIPT AND NOT FIND-AND-REPLACE
// -------------------------------------
// The same hex means different things by role, a string may carry the hex
// inside other text, and a JSX attribute needs braces. The parser gives each
// literal its context; the dry run lists every decision by line; the apply
// re-parses the result and counts what remains — the §0.130 method.
import { parse } from '@babel/parser';
import fs from 'fs';
import path from 'path';

const APPLY = process.argv.includes('--apply');
const ROOT = process.cwd();

const FILES = [
    'src/components/layout/ModalLayer.jsx',
    'src/components/modals/LeadImportModal.jsx',
    'src/components/modals/OutlookImportModal.jsx',
    'src/components/modals/ContactModal.jsx',
    'src/components/modals/UserModal.jsx',
    'src/App.jsx',
];

// Lines that hold DATA, not style — matched by what the line SAYS, never by a
// line number (a second run after the import was added shifted every number
// by one and the first version of this list converted half a palette). Kept
// verbatim and reported.
const EXCLUDE_PATTERNS = {
    'src/App.jsx': [
        /name: 'New Business', color: '#/,          // a pipeline's stored default colour — data the settings row holds
        /^\s*\{ bg: '#[0-9a-f]{6}', text: '#/i,      // the stage pill palette
        /closed(Won|Lost)Color = \{ bg: '#/,         // …and its two closed entries
    ],
    'src/components/layout/ModalLayer.jsx': [
        /avatarColors = \[/,                          // the avatar initials palette
    ],
};
const isExcluded = (file, lineText) => (EXCLUDE_PATTERNS[file] || []).some(re => re.test(lineText));

// hex → { token } | { token, tint: 'xx' } | { split: true } (blue: bg → ink, else info) | { split: true, tint }
const MAP = {
    // slate / neutral
    '0f172a': { token: 'ink' }, '1e293b': { token: 'ink' }, '334155': { token: 'ink' }, '2a2622': { token: 'ink' },
    '475569': { token: 'inkMid' }, '64748b': { token: 'inkMid' }, '44403c': { token: 'inkMid' }, '57534e': { token: 'inkMid' },
    '94a3b8': { token: 'inkMuted' }, '78716c': { token: 'inkMuted' }, 'a8a29e': { token: 'inkMuted' },
    'e2e8f0': { token: 'border' }, 'ddd8cf': { token: 'border' }, 'e5e2db': { token: 'border' }, 'd6d3ce': { token: 'border' },
    'cbd5e1': { token: 'borderStrong' }, 'd1d5db': { token: 'borderStrong' },
    // the warm palette written as literals — the token's own value, by name
    'e6ddd0': { token: 'border' }, 'e8e3da': { token: 'border' }, '5a544c': { token: 'inkMid' }, '9c3a2e': { token: 'danger' },
    'f1f5f9': { token: 'surface2' }, 'f8fafc': { token: 'surface2' }, 'f1f3f5': { token: 'surface2' }, 'f8f9fa': { token: 'surface2' }, 'fafbfc': { token: 'surface2' },
    'ffffff': { token: 'surface' }, 'fff': { token: 'surface' }, 'f5f1eb': { token: 'surface' }, 'fafaf9': { token: 'surface' }, 'f8f6f2': { token: 'surface' }, 'fbf8f3': { token: 'surface' },
    'f0ece4': { token: 'bg' }, 'c8b99a': { token: 'gold' }, '7a6a48': { token: 'goldInk' },
    // red
    'dc2626': { token: 'danger' }, 'ef4444': { token: 'danger' }, 'b91c1c': { token: 'danger' }, '991b1b': { token: 'danger' }, 'f87171': { token: 'danger' },
    'fef2f2': { token: 'danger', tint: '14' }, 'fee2e2': { token: 'danger', tint: '14' }, 'fff5f5': { token: 'danger', tint: '14' },
    'fecaca': { token: 'danger', tint: '33' }, 'fca5a5': { token: 'danger', tint: '33' },
    // green
    '10b981': { token: 'ok' }, '059669': { token: 'ok' }, '047857': { token: 'ok' }, '065f46': { token: 'ok' }, '16a34a': { token: 'ok' }, '34d399': { token: 'ok' },
    'd1fae5': { token: 'ok', tint: '18' }, 'ecfdf5': { token: 'ok', tint: '18' },
    'a7f3d0': { token: 'ok', tint: '40' }, '86efac': { token: 'ok', tint: '40' },
    // amber
    'f59e0b': { token: 'warn' }, 'd97706': { token: 'warn' }, '92400e': { token: 'warn' }, '78350f': { token: 'warn' }, 'b45309': { token: 'warn' },
    'fef3c7': { token: 'warn', tint: '18' }, 'fffbeb': { token: 'warn', tint: '18' },
    'fde68a': { token: 'warn', tint: '40' }, 'fcd34d': { token: 'warn', tint: '40' },
    // blue — by role
    '2563eb': { split: true }, '1d4ed8': { split: true }, '3b82f6': { split: true }, '1e40af': { split: true }, '1e3a8a': { split: true }, '60a5fa': { split: true },
    '93c5fd': { token: 'info', tint: '40' }, 'dbeafe': { token: 'info', tint: '14' }, 'eff6ff': { token: 'info', tint: '14' }, 'bfdbfe': { token: 'info', tint: '14' },
};
const KEEP = new Set(['1c1917']);

const BG_KEYS = new Set(['background', 'backgroundColor', 'fill']);
const FG_KEYS = new Set(['color', 'borderColor', 'border', 'borderTop', 'borderBottom', 'borderLeft', 'borderRight', 'outline', 'stroke', 'borderTopColor', 'borderBottomColor', 'borderLeftColor', 'borderRightColor']);

const HEX_RE = /#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g;   // 8 digits: a hex carrying its own alpha ('#dc262614')

const keyName = (k) => (k?.type === 'Identifier' ? k.name : k?.type === 'StringLiteral' ? k.value : null);

/** The role a literal plays: 'bg', 'fg' or 'other', from its ancestors. */
function roleOf(ancestors, node) {
    const chain = [...ancestors, node];
    for (let i = chain.length - 2; i >= 0; i--) {
        const a = chain[i];
        const child = chain[i + 1];
        if (a.type === 'CallExpression' && a.callee?.type === 'Identifier' && a.callee.name === 'btn' && child) {
            const idx = a.arguments.indexOf(child);
            if (idx === 0) return 'bg';
            if (idx === 1) return 'fg';
        }
        if (a.type === 'ObjectProperty') {
            const k = keyName(a.key);
            if (BG_KEYS.has(k)) return 'bg';
            if (FG_KEYS.has(k)) return 'fg';
            return 'other';
        }
        // a hover handler: `e.currentTarget.style.background = '#…'`
        if (a.type === 'AssignmentExpression' && child === a.right && a.left?.type === 'MemberExpression') {
            const k = a.left.property?.name;
            if (BG_KEYS.has(k)) return 'bg';
            if (FG_KEYS.has(k)) return 'fg';
            return 'other';
        }
        if (a.type === 'JSXAttribute') {
            const k = a.name?.name;
            if (k === 'fill') return 'bg';
            if (k === 'stroke' || k === 'color') return 'fg';
            return 'other';
        }
    }
    return 'other';
}

/** { inner: '${T.x}' | '${T.x}14', exact: 'T.x' | '`${T.x}14`' } */
function tokenFor(hex, role) {
    // '#rrggbbaa': the colour by name, the alpha as written
    const alpha = hex.length === 8 ? hex.slice(6) : null;
    const e = MAP[(alpha ? hex.slice(0, 6) : hex).toLowerCase()];
    if (!e) return null;
    const token = e.split ? (role === 'bg' ? 'ink' : 'info') : e.token;
    if (alpha) return { inner: '${T.' + token + '}' + alpha, exact: '`${T.' + token + '}' + alpha + '`', label: `T.${token}${alpha}` };
    if (e.tint) return { inner: '${T.' + token + '}' + e.tint, exact: '`${T.' + token + '}' + e.tint + '`', label: `T.${token}${e.tint}` };
    return { inner: '${T.' + token + '}', exact: 'T.' + token, label: `T.${token}` };
}

function walk(node, ancestors, visit) {
    if (!node || typeof node.type !== 'string') return;
    visit(node, ancestors);
    const next = [...ancestors, node];
    for (const key of Object.keys(node)) {
        if (key === 'loc' || key === 'start' || key === 'end' || key === 'extra' || key === 'comments' || key === 'leadingComments' || key === 'trailingComments') continue;
        const v = node[key];
        if (Array.isArray(v)) v.forEach(c => c && typeof c.type === 'string' && walk(c, next, visit));
        else if (v && typeof v.type === 'string') walk(v, next, visit);
    }
}

function lineOf(src, idx) { return src.slice(0, idx).split('\n').length; }

function migrate(file) {
    const abs = path.join(ROOT, file);
    const src = fs.readFileSync(abs, 'utf8');
    const ast = parse(src, { sourceType: 'module', plugins: ['jsx'], errorRecovery: false });
    const lines = src.split('\n');
    const excludedLine = (line) => isExcluded(file, lines[line - 1] || '');
    const edits = [];       // { start, end, text, line, from, to }
    const kept = [];        // { line, hex, why }
    const unmapped = new Map();
    let lastImportEnd = 0, hasT = false;

    walk(ast.program, [], (node, ancestors) => {
        if (node.type === 'ImportDeclaration') {
            lastImportEnd = Math.max(lastImportEnd, node.end);
            if (/tokens\.js['"];?$/.test(src.slice(node.start, node.end)) && node.specifiers.some(s => s.imported?.name === 'T')) hasT = true;
            return;
        }
        if (node.type === 'StringLiteral') {
            const raw = src.slice(node.start, node.end);
            if (!HEX_RE.test(raw)) { HEX_RE.lastIndex = 0; return; }
            HEX_RE.lastIndex = 0;
            const line = lineOf(src, node.start);
            const inner = node.value;
            const hexes = [...inner.matchAll(HEX_RE)].map(m => m[0]);
            if (excludedLine(line)) { hexes.forEach(h => kept.push({ line, hex: h, why: 'data palette, kept' })); return; }
            const role = roleOf(ancestors, node);
            const parent = ancestors[ancestors.length - 1];
            const isJsxAttr = parent?.type === 'JSXAttribute';
            const exact = /^#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.test(inner);
            if (exact) {
                const h = inner.slice(1);
                if (KEEP.has(h.toLowerCase())) { kept.push({ line, hex: inner, why: 'the dark header, allowed' }); return; }
                const t = tokenFor(h, role);
                if (!t) { unmapped.set(inner.toLowerCase(), (unmapped.get(inner.toLowerCase()) || 0) + 1); return; }
                edits.push({ start: node.start, end: node.end, text: isJsxAttr ? `{${t.exact}}` : t.exact, line, from: inner, to: t.label, role });
                return;
            }
            // a string carrying a hex among other text → a template literal
            if (inner.includes('`') || inner.includes('${') || inner.includes('\\')) { kept.push({ line, hex: hexes.join(' '), why: 'string with backtick/escape — by hand' }); return; }
            let out = inner, changed = false, labels = [];
            for (const h of new Set(hexes)) {
                const key = h.slice(1);
                if (KEEP.has(key.toLowerCase())) { kept.push({ line, hex: h, why: 'the dark header, allowed' }); continue; }
                const t = tokenFor(key, role);
                if (!t) { unmapped.set(h.toLowerCase(), (unmapped.get(h.toLowerCase()) || 0) + 1); continue; }
                out = out.split(h).join(t.inner); changed = true; labels.push(`${h}→${t.label}`);
            }
            if (!changed) return;
            if (isJsxAttr) { kept.push({ line, hex: hexes.join(' '), why: 'JSX attribute with mixed text — by hand' }); return; }
            edits.push({ start: node.start, end: node.end, text: '`' + out + '`', line, from: inner, to: labels.join(', '), role });
            return;
        }
        if (node.type === 'TemplateElement') {
            const raw = node.value.raw;
            if (!HEX_RE.test(raw)) { HEX_RE.lastIndex = 0; return; }
            HEX_RE.lastIndex = 0;
            const line = lineOf(src, node.start);
            const hexes = [...raw.matchAll(HEX_RE)].map(m => m[0]);
            if (excludedLine(line)) { hexes.forEach(h => kept.push({ line, hex: h, why: 'data palette, kept' })); return; }
            const role = roleOf(ancestors, node);
            let out = raw, changed = false, labels = [];
            for (const h of new Set(hexes)) {
                const key = h.slice(1);
                if (KEEP.has(key.toLowerCase())) { kept.push({ line, hex: h, why: 'the dark header, allowed' }); continue; }
                const t = tokenFor(key, role);
                if (!t) { unmapped.set(h.toLowerCase(), (unmapped.get(h.toLowerCase()) || 0) + 1); continue; }
                out = out.split(h).join(t.inner); changed = true; labels.push(`${h}→${t.label}`);
            }
            if (!changed) return;
            edits.push({ start: node.start, end: node.end, text: out, line, from: raw.trim(), to: labels.join(', '), role });
        }
    });

    edits.sort((a, b) => b.start - a.start);
    let out = src;
    for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end);
    if (!hasT && edits.length) {
        const rel = path.posix.relative(path.posix.dirname(file.split(path.sep).join('/')), 'src/tokens.js');
        const spec = rel.startsWith('.') ? rel : './' + rel;
        const eol = src.includes('\r\n') ? '\r\n' : '\n';
        out = out.slice(0, lastImportEnd) + eol + `import { T } from '${spec}';` + out.slice(lastImportEnd);
    }
    // the result must still parse
    parse(out, { sourceType: 'module', plugins: ['jsx'] });
    const remaining = [...out.matchAll(HEX_RE)].map(m => ({ hex: m[0], line: lineOf(out, m.index) }));
    return { file, edits: edits.sort((a, b) => a.line - b.line), kept, unmapped, out, remaining, hasT, eolChanged: (src.includes('\r\n') !== out.includes('\r\n')) };
}

let total = 0;
for (const file of FILES) {
    const r = migrate(file);
    total += r.edits.length;
    console.log(`\n${file} — ${r.edits.length} replacement(s), ${r.kept.length} kept, ${r.remaining.length} hex left after${r.hasT ? '' : ', import added'}`);
    for (const e of r.edits) console.log(`  ${String(e.line).padStart(5)}  [${e.role}]  ${e.from.length > 44 ? e.from.slice(0, 44) + '…' : e.from}  →  ${e.to}`);
    for (const k of r.kept) console.log(`  ${String(k.line).padStart(5)}  kept  ${k.hex}  (${k.why})`);
    if (r.unmapped.size) console.log('  UNMAPPED: ' + [...r.unmapped].map(([h, n]) => `${h}×${n}`).join(' '));
    if (r.remaining.length) console.log('  left: ' + r.remaining.map(x => `${x.hex}@${x.line}`).join(' '));
    if (APPLY) {
        fs.writeFileSync(path.join(ROOT, file), r.out, 'utf8');
        const back = fs.readFileSync(path.join(ROOT, file), 'utf8');
        parse(back, { sourceType: 'module', plugins: ['jsx'] });
        console.log(`  written and re-parsed (${back.includes('\r\n') ? 'CRLF' : 'LF'})`);
    }
}
console.log(`\n${total} replacement(s) across ${FILES.length} files${APPLY ? ' — APPLIED' : ' — DRY RUN (add --apply)'}.`);
