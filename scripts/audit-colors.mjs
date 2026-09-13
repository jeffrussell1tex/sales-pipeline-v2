#!/usr/bin/env node
// scripts/audit-colors.mjs — Phase 1 of the "Tonal & Form" signal migration
// (docs/design/handoff-signal-tonal/README.md §4): enumerate every colour
// literal and every signal-token reference in src/, with the component it
// sits in, what it visually marks, its CURRENT FORM (pill radius, tint,
// border, spine) and a classification from the brief's fixed set:
//
//   trend · event · info · neutral-status · categorical · brand · type · destructive
//
// plus `?` where the line alone does not say. READ-ONLY over src/. Writes
//   docs/design/color-audit.csv   every row
//   docs/design/color-audit.md    the summaries and the signal rows
//
//   node scripts/audit-colors.mjs            # writes both files
//   node scripts/audit-colors.mjs --stdout   # prints the summary only
//
// The classification is a heuristic over the line's own text (and the two
// lines above it, because style objects wrap). It is a starting point for a
// human read, not a verdict — every `?` and every `destructive`/`event` split
// of T.danger is Jeff's call (brief hard rule 2).

import fs from 'fs';
import path from 'path';

import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC  = path.join(ROOT, 'src');
const OUT_DIR = path.join(ROOT, 'docs', 'design');
const STDOUT_ONLY = process.argv.includes('--stdout');

// ── Vocabulary ────────────────────────────────────────────────────────────
// The design system's own values (settings/shared/tokens.js and the per-file
// copies of it). A literal equal to one of these is the token by value.
const BRAND = {
    '#f0ece4': 'bg', '#fbf8f3': 'surface', '#f5efe3': 'surface2',
    '#e6ddd0': 'border', '#d4c8b4': 'borderStrong',
    '#2a2622': 'ink', '#5a544c': 'inkMid', '#8a8378': 'inkMuted',
    '#c8b99a': 'gold', '#7a6a48': 'goldInk',
    '#1c1917': 'dragHeader', '#fef4e6': 'avatarFg', '#ffffff': 'white', '#fff': 'white',
    '#f5f1eb': 'surface-alt', '#e5e2db': 'border-alt', '#ddd8cf': 'border-alt', '#26221c': 'ink-alt',
};
const SIGNAL_HEX = { '#4d6b3d': 'ok', '#b87333': 'warn', '#9c3a2e': 'danger', '#3a5a7a': 'info' };
const SIGNAL_RGB = { '77,107,61': 'ok', '184,115,51': 'warn', '156,58,46': 'danger', '58,90,122': 'info', '138,131,120': 'inkMuted', '58,53,46': 'inkMuted' };
// Pipeline stages (T.stages / STAGE_COLORS) and the lead-score bands — ORDINAL, excluded by the brief.
const ORDINAL_HEX = {
    '#b0a088': 'stage', '#c8a978': 'stage', '#b07a55': 'stage', '#7a5a3c': 'stage', '#3a5530': 'stage',
    '#b85a35': 'score', '#c89a6b': 'score', '#9aa89a': 'score', '#c9c0b0': 'score',
};
// Tailwind-family literals the guide (§16) already forbids. Listed so the audit
// can say where they still are; the brief's rule 8 keeps them OUT of scope.
const OFFBRAND = new Set(['#2563eb','#1e40af','#3b82f6','#60a5fa','#93c5fd','#dbeafe','#eff6ff','#ef4444','#dc2626','#b91c1c','#fecaca','#fef2f2','#f59e0b','#d97706','#fde68a','#fef3c7','#92400e','#10b981','#16a34a','#059669','#d1fae5','#22c55e','#e2e8f0','#94a3b8','#64748b','#1e293b','#f8fafc','#f1f5f9','#cbd5e1','#475569','#334155','#0f172a','#6b21a8','#f3e8ff','#a8a29e','#78716c','#57534e','#e7e5e4','#f5f5f4','#d6d3d1','#44403c','#292524','#fafaf9']);

const TOKEN_IDS = ['T', 'T2', 'T2b', 'T2c', 'T3', 'T4', 'TS', 'T_ACTIVITY'];
const TOKEN_RE  = new RegExp(`\\b(${TOKEN_IDS.join('|')})\\.(ok|warn|danger|info|inkMuted)\\b`, 'g');
const HEX_RE    = /#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g;
const RGB_RE    = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/g;

// ── Classifiers ───────────────────────────────────────────────────────────
const RX = {
    destructive: /\b(delete|remove|discard|revoke|destroy|purge|wipe|trash|unlink|disconnect|clear all|reset all|danger ?btn|ondelete|confirmdelete|handledelete|deleting|removing)\b|onDelete|handleDelete|confirmDelete|setConfirmDelete|deleteMode/i,
    trend:       /\b(delta|trend|spark|sparkline|attain|attainment|vs (lq|last|prior|target)|growth|velocity|pct|percent|change|up|down|rise|fall|gain|drop|momentum|forecast|accuracy|acc(?:uracy)?color|comparison|good\b)\b|[↑↓▲▼]|Arrow/i,
    event:       /\b(overdue|breach|breached|error|errors|fail|failed|failure|expired|expiring|expires|expiry|lapse|lapsed|stuck|silent|at risk|risk|warning|warn(?:ing)?s?\b|alert|blocked|blocker|missing|invalid|required|conflict|clash|over|overhours|urgent|emergency|late|due|unpaid|rejected|declined|refused|denied|lost|unmatched|unknown|problem|issue|dirty|unsaved|unsupported|unavailable|offline|stale|dead|slipped|slip)\b|error|fail|invalid|expired|overdue/i,
    categorical: /\b(stage|source|type|tier|category|categories|role|skill|team|crew|kind|priority|persona|segment|industry|vehicle|plan|badge|file|ext|format|entity|tag|label|swatch|color ?picker|palette|legend|series|chart|bar|donut|pie|sector)\b/i,
    neutral:     /\b(status|state|pending|inactive|active|disabled|enabled|none|unassigned|draft|open|closed|done|complete|completed|connected|not connected|won|scheduled|in progress|paused|archived|queued|running|ok\b|healthy|linked|synced)\b/i,
    infoish:     /\b(info|note|notice|hint|tip|help|learn|link|docs|documentation|read more|breadcrumb|crumb|meeting|calendar|count|counts|total|new\b)\b/i,
    muted_status:/\b(status|state|pending|inactive|disabled|none|unassigned|n\/a|empty|no (data|deals|jobs|results|rows|items|activity|notes|tasks|leads|quotes|customers|records)|nothing|—|not set|unset|never)\b/i,
};

const nameOfComponent = (lines, i) => {
    for (let k = i; k >= 0; k--) {
        const m = lines[k].match(/^\s*(?:export\s+)?(?:default\s+)?(?:const|function|let)\s+([A-Z][A-Za-z0-9_]*)\b/);
        if (m && !/^T[0-9A-Za-z_]*$/.test(m[1]) && !/^[A-Z0-9_]+$/.test(m[1])) return m[1];   // skip token objects and CONSTANT maps
    }
    return path.basename(lines.file || '');
};

// The FORM column: what shape the colour sits in, read from the line and the
// two above it (inline style objects wrap).
const formOf = (ctx) => {
    const f = [];
    const r = ctx.match(/borderRadius:\s*(['"]?)([^,}'"]+)\1/);
    if (r) {
        const v = r[2].trim();
        if (/^999$/.test(v)) f.push('pill r999');
        else if (/50%/.test(v)) f.push('dot');
        else if (/^(8|10|12|14|16|20)$/.test(v)) f.push(`pill r${v}`);
        else if (/^2$/.test(v)) f.push('r2');
        else f.push(`r ${v}`);
    }
    const spine = ctx.match(/inset\s+(\d)px\s+0\s+0|borderLeft:\s*`?(\d)px/);
    if (spine) f.push(`spine ${spine[1] || spine[2]}px`);
    if (/background:\s*(?:['"`]rgba\(|`\$\{[^}]+\}[0-9a-f]{2}`|[A-Za-z.]+\s*\+\s*['"][0-9a-f]{2}|c\.bg|s\.bg|[a-z]+\.bg|[a-z]+\.fill|[a-z]+\.tint)/i.test(ctx)) f.push('tint bg');
    else if (/background:\s*(T\d*[a-z_]*\.(?:ok|warn|danger|info|ink|goldInk)|['"]?#|c\b|color\b|[a-z]+\.color)/i.test(ctx)) f.push('solid bg');
    if (/\bborder:\s*`?\d(?:\.\d)?px/.test(ctx)) f.push('1px border');
    if (/\bcolor:\s*/.test(ctx) && !/background/i.test(ctx)) f.push('text');
    else if (/\bcolor:\s*/.test(ctx)) f.push('text');
    if (/\b(stroke|fill)=|stroke:|fill:/.test(ctx)) f.push('svg');
    if (/boxShadow/.test(ctx) && !spine) f.push('shadow');
    return f.length ? f.join(' · ') : '—';
};

// The token names themselves (`T.warn`, `T.ok`, `STATUS_STYLES.ok`) must not
// feed the word lists — "warn" is not evidence of a warning, it is the value.
const STRIP_RE = new RegExp(`\\b[A-Za-z_][A-Za-z0-9_]*\\.(ok|warn|danger|info|inkMuted|inkMid|ink|gold|goldInk)\\b|#[0-9a-fA-F]{3,8}\\b|rgba?\\([^)]*\\)`, 'g');
const classify = (kind, value, rawCtx) => {
    // kind: 'token' | 'hex' | 'rgb'; value: the literal or token name
    const ctx = rawCtx.replace(STRIP_RE, ' ');
    const lower = ctx.toLowerCase();
    if (kind === 'hex' && BRAND[value]) return value === '#8a8378' ? (RX.muted_status.test(lower) ? 'neutral-status' : 'type') : 'brand';
    if (kind === 'hex' && ORDINAL_HEX[value]) return 'categorical';
    if (kind === 'hex' && OFFBRAND.has(value)) {
        // still say what it is doing, so the off-brand set can be triaged later
        if (RX.destructive.test(ctx)) return 'destructive';
        if (RX.event.test(lower)) return 'event';
        if (RX.trend.test(lower)) return 'trend';
        if (/#(e2e8f0|94a3b8|64748b|1e293b|f8fafc|f1f5f9|cbd5e1|475569|334155|0f172a|a8a29e|78716c|57534e|e7e5e4|f5f5f4|d6d3d1|44403c|292524|fafaf9)/.test(value)) return 'brand';
        return '?';
    }
    const isMuted = (kind === 'token' && value.endsWith('.inkMuted')) || (kind === 'rgb' && SIGNAL_RGB[value] === 'inkMuted');
    // inkMuted is judged on ITS OWN line only — the lines above are usually
    // unrelated label text and would flag ordinary captions as status.
    if (isMuted) return RX.muted_status.test(lower.split('\n').pop()) ? 'neutral-status' : 'type';
    const isSignal = kind === 'token' || (kind === 'hex' && SIGNAL_HEX[value]) || (kind === 'rgb' && SIGNAL_RGB[value]);
    if (isSignal) {
        const sig = kind === 'token' ? value.split('.')[1] : (SIGNAL_HEX[value] || SIGNAL_RGB[value]);
        if (RX.destructive.test(ctx)) return 'destructive';
        if (RX.trend.test(lower) && !/\bwarn(ing)?\b|\berror\b|\boverdue\b/.test(lower)) return 'trend';
        if (RX.event.test(lower)) return 'event';
        if (RX.categorical.test(lower)) return 'categorical';
        if (RX.neutral.test(lower)) return 'neutral-status';
        if (sig === 'info' && RX.infoish.test(lower)) return 'info';
        if (sig === 'info') return 'info?';
        return '?';
    }
    // any other literal: a one-off colour
    if (RX.destructive.test(ctx)) return 'destructive';
    if (/^(#000|#000000|rgba?\(0,0,0|rgba?\(42,38,34|rgba?\(0, 0, 0)/.test(value) || /shadow|overlay|backdrop/i.test(lower)) return 'brand';
    if (RX.categorical.test(lower)) return 'categorical';
    return '?';
};

// ── Walk ──────────────────────────────────────────────────────────────────
const files = [];
const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p); else if (/\.(jsx?|mjs)$/.test(e.name)) files.push(p);
} };
walk(SRC);
files.sort();

const rows = [];
const tokenDefs = [];      // files that declare their own T-family object
for (const abs of files) {
    const rel = path.relative(ROOT, abs).replace(/\\/g, '/');
    const text = fs.readFileSync(abs, 'utf8');
    const lines = text.split(/\r?\n/);
    lines.file = rel;
    lines.forEach((line, i) => {
        const defm = line.match(/^\s*(?:export\s+)?const\s+(T[0-9A-Za-z_]*)\s*=\s*\{/);
        if (defm) tokenDefs.push({ file: rel, line: i + 1, name: defm[1] });
    });
    // Which lines are INSIDE a token-object literal (so their hexes are definitions, not uses)
    const inDef = new Array(lines.length).fill(false);
    let depth = 0, open = false;
    lines.forEach((line, i) => {
        if (!open && /^\s*(?:export\s+)?const\s+(T[0-9A-Za-z_]*)\s*=\s*\{/.test(line)) { open = true; depth = 0; }
        if (open) {
            inDef[i] = true;
            depth += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
            if (depth <= 0 && /\}/.test(line)) open = false;
        }
    });

    lines.forEach((line, i) => {
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;                          // comments
        const ctx = [lines[i - 2] || '', lines[i - 1] || '', line].join('\n');
        const comp = nameOfComponent(lines, i);
        const push = (kind, value, display) => rows.push({
            file: rel, line: i + 1, component: comp, kind, value: display,
            marks: line.trim().replace(/\s+/g, ' ').slice(0, 150),
            form: formOf(ctx),
            cls: inDef[i] ? 'token-def' : classify(kind, value, ctx),
            offbrand: kind === 'hex' && OFFBRAND.has(value) ? 'yes' : '',
        });
        let m;
        TOKEN_RE.lastIndex = 0;
        while ((m = TOKEN_RE.exec(line))) push('token', `${m[1]}.${m[2]}`, `${m[1]}.${m[2]}`);
        HEX_RE.lastIndex = 0;
        while ((m = HEX_RE.exec(line))) {
            const v = m[0].toLowerCase();
            if (/[0-9a-f]{6}[0-9a-f]{2}$/.test(v) && v.length === 9) { push('hex', v.slice(0, 7), v); continue; } // #rrggbbaa → classify by rgb
            push('hex', v, v);
        }
        RGB_RE.lastIndex = 0;
        while ((m = RGB_RE.exec(line))) push('rgb', `${m[1]},${m[2]},${m[3]}`, m[0].replace(/\s+/g, ''));
    });
}

// ── Summaries ─────────────────────────────────────────────────────────────
const uses = rows.filter(r => r.cls !== 'token-def');
const count = (arr, key) => arr.reduce((m, r) => (m[r[key]] = (m[r[key]] || 0) + 1, m), {});
const CLASSES = ['trend', 'event', 'info', 'info?', 'neutral-status', 'categorical', 'brand', 'type', 'destructive', '?'];

const byClass = count(uses, 'cls');
const signalRows = uses.filter(r => r.kind === 'token' ? !r.value.endsWith('.inkMuted') : (SIGNAL_HEX[r.value.slice(0, 7)] || (r.kind === 'rgb' && SIGNAL_RGB[r.value.match(/\d+,\d+,\d+/)?.[0]] && SIGNAL_RGB[r.value.match(/\d+,\d+,\d+/)[0]] !== 'inkMuted')));
const mutedRows  = uses.filter(r => (r.kind === 'token' && r.value.endsWith('.inkMuted')) || r.value === '#8a8378' || /rgba?\((138,131,120|58,53,46)/.test(r.value));
const offRows    = uses.filter(r => r.offbrand === 'yes');
const otherRows  = uses.filter(r => !signalRows.includes(r) && !mutedRows.includes(r) && !offRows.includes(r) && !(r.kind === 'hex' && (BRAND[r.value.slice(0,7)] || ORDINAL_HEX[r.value.slice(0,7)])));

const perFile = {};
for (const r of uses) {
    const f = perFile[r.file] || (perFile[r.file] = { total: 0 });
    f.total++; f[r.cls] = (f[r.cls] || 0) + 1;
}

const md = [];
md.push('# Colour audit — Phase 1 of the "Tonal & Form" signal migration');
md.push('');
md.push(`Generated by \`node scripts/audit-colors.mjs\` over \`src/\` (${files.length} files). READ-ONLY: this audit changed no source file. The full row set is \`docs/design/color-audit.csv\` (${uses.length} uses; ${rows.length - uses.length} lines inside token-object definitions are excluded from every table below).`);
md.push('');
md.push('**How to read the classification.** It is a heuristic over each line\'s own text and the two lines above it. `trend` / `event` / `destructive` on a signal token are the three-way split of the brief\'s hard rule 2 — the heuristic proposes, Jeff decides. `?` means the line alone does not say what the colour marks. `info?` is `T.info` used somewhere that is not obviously an information notice (the app already has a `T.info` slate, `#3a5a7a`, that the brief\'s `SIGNAL.info` would replace).');
md.push('');
md.push('**The FORM column** is read the same way: `pill r999` (lozenge), `pill r10`/`r12` (rounded), `r2` (already square-ish), `dot`, `tint bg` (a translucent fill), `solid bg`, `1px border`, `spine Npx` (a left border or inset shadow), `text`, `svg`.');
md.push('');

md.push('## 1. Totals by classification (every use, all literals and tokens)');
md.push('');
md.push('| Classification | Uses |'); md.push('|---|---:|');
for (const c of CLASSES) if (byClass[c]) md.push(`| ${c} | ${byClass[c]} |`);
md.push(`| **all** | **${uses.length}** |`);
md.push('');

md.push('## 2. The signal tokens and their literal twins');
md.push('');
md.push('`T.ok` / `T.warn` / `T.danger` / `T.info` (and the ReportsTab copies `T2`, `T2b`, `T2c`, `T3`, `T4`, `TS`, `T_ACTIVITY`), plus the same colours written as `#4d6b3d` / `#b87333` / `#9c3a2e` / `#3a5a7a` or as `rgba(77,107,61|184,115,51|156,58,46|58,90,122, …)` tints.');
md.push('');
const sigBy = {};
for (const r of signalRows) {
    const sig = r.kind === 'token' ? r.value.split('.')[1] : (SIGNAL_HEX[r.value.slice(0, 7)] || SIGNAL_RGB[r.value.match(/\d+,\d+,\d+/)?.[0]]);
    const k = `${sig}`; sigBy[k] = sigBy[k] || {}; sigBy[k][r.cls] = (sigBy[k][r.cls] || 0) + 1; sigBy[k].total = (sigBy[k].total || 0) + 1;
}
md.push('| Signal | total | trend | event | destructive | neutral-status | categorical | info | info? | ? |');
md.push('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
for (const s of ['ok', 'warn', 'danger', 'info']) { const b = sigBy[s] || {}; md.push(`| ${s} | ${b.total || 0} | ${b.trend || 0} | ${b.event || 0} | ${b.destructive || 0} | ${b['neutral-status'] || 0} | ${b.categorical || 0} | ${b.info || 0} | ${b['info?'] || 0} | ${b['?'] || 0} |`); }
md.push('');
md.push('### 2a. Shape of the signal sites today');
md.push('');
md.push('The brief\'s §1 table says the SHAPE changes per site. This is what the shapes are now (each site counted once, by its most specific feature).');
md.push('');
const shapeOf = (f) => /spine/.test(f) ? 'spine (left border / inset)' : /pill r999|r 999px/.test(f) ? 'lozenge pill (r999)' : /pill r(8|10|12|14|16|20)/.test(f) ? 'rounded pill (r8–r20)' : /\bdot\b/.test(f) ? 'dot' : /svg/.test(f) ? 'svg stroke/fill' : /r2\b|r 2px/.test(f) ? 'square-ish (r2)' : /tint bg/.test(f) ? 'tinted box (r3–r6)' : /solid bg/.test(f) ? 'solid box' : /1px border/.test(f) ? 'outlined box' : /text/.test(f) ? 'bare text' : 'none stated on the line';
const shapeBy = {};
for (const r of signalRows) { const s = shapeOf(r.form); shapeBy[s] = (shapeBy[s] || 0) + 1; }
md.push('| Shape today | Sites |'); md.push('|---|---:|');
for (const [f, n] of Object.entries(shapeBy).sort((a, b) => b[1] - a[1])) md.push(`| ${f} | ${n} |`);
md.push('');

md.push('## 3. `inkMuted` as a status colour (brief hard rule 4)');
md.push('');
const mutedStatus = mutedRows.filter(r => r.cls === 'neutral-status');
md.push(`${mutedRows.length} uses of \`inkMuted\` (token or literal). ${mutedStatus.length} of them sit on a line that names a status (\`status\`, \`pending\`, \`none\`, \`unassigned\`, an empty-state phrase); the rest are tertiary label text and stay as they are. The ${mutedStatus.length} are listed in §8.`);
md.push('');

md.push('## 4. Off-brand literals (guide §16 already forbids; brief rule 8 keeps them out of THIS migration)');
md.push('');
const offBy = {};
for (const r of offRows) { const f = offBy[r.file] || (offBy[r.file] = { n: 0, vals: new Set() }); f.n++; f.vals.add(r.value); }
md.push('| File | Uses | Distinct values |'); md.push('|---|---:|---|');
for (const [f, v] of Object.entries(offBy).sort((a, b) => b[1].n - a[1].n)) md.push(`| \`${f}\` | ${v.n} | ${[...v.vals].sort().join(' ')} |`);
md.push('');

md.push('## 5. Where the token object is declared (the migration\'s real surface)');
md.push('');
md.push('`settings/shared/tokens.js` is imported only by the Settings panels. Every other area declares its own copy, so a value changed in the shared file reaches none of them — which is exactly why the brief says to ship PRIMITIVES (components every file imports by name), not token edits.');
md.push('');
md.push('| File | Line | Object |'); md.push('|---|---:|---|');
for (const d of tokenDefs) md.push(`| \`${d.file}\` | ${d.line} | \`${d.name}\` |`);
md.push('');

md.push('## 6. Per-file counts');
md.push('');
md.push('| File | all | trend | event | destructive | neutral-status | categorical | info | brand | type | ? |');
md.push('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
for (const [f, c] of Object.entries(perFile).sort((a, b) => b[1].total - a[1].total)) md.push(`| \`${f}\` | ${c.total} | ${c.trend || 0} | ${c.event || 0} | ${c.destructive || 0} | ${c['neutral-status'] || 0} | ${c.categorical || 0} | ${(c.info || 0) + (c['info?'] || 0)} | ${c.brand || 0} | ${c.type || 0} | ${c['?'] || 0} |`);
md.push('');

const esc = (s) => String(s).replace(/\|/g, '\\|').replace(/`/g, '\u02cb');
const table = (list) => {
    md.push('| File | Line | Component | Value | Class | Form | What it marks (the line) |');
    md.push('|---|---:|---|---|---|---|---|');
    for (const r of list) md.push(`| ${esc(r.file)} | ${r.line} | ${esc(r.component)} | \`${esc(r.value)}\` | ${r.cls} | ${esc(r.form)} | ${esc(r.marks)} |`);
    md.push('');
};

md.push(`## 7. Every signal site (${signalRows.length} rows)`);
md.push('');
table(signalRows);

md.push(`## 8. \`inkMuted\` flagged as a status colour (${mutedStatus.length} rows)`);
md.push('');
table(mutedStatus);

md.push(`## 9. Every other colour literal that is neither brand, ordinal, signal nor off-brand (${otherRows.length} rows)`);
md.push('');
md.push('One-off colours. Most are categorical maps (sources, file types, quote types, crew colours) or shadows; each is a candidate for the exclusion list or for a later, separate cleanup — not for this migration.');
md.push('');
table(otherRows);

const csv = ['file,line,component,kind,value,class,offbrand,form,marks'];
for (const r of rows) csv.push([r.file, r.line, r.component, r.kind, r.value, r.cls, r.offbrand, r.form, r.marks].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));

const summary = md.slice(0, md.findIndex(l => l.startsWith('## 6.')));
if (STDOUT_ONLY) { console.log(summary.join('\n')); }
else {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(path.join(OUT_DIR, 'color-audit.md'), md.join('\n') + '\n');
    fs.writeFileSync(path.join(OUT_DIR, 'color-audit.csv'), csv.join('\n') + '\n');
    console.log(summary.join('\n'));
    console.log(`\nWrote docs/design/color-audit.md (${md.length} lines) and docs/design/color-audit.csv (${rows.length} rows).`);
}
