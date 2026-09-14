// tests/blue-era-sweep.test.mjs
//
// The blue-era modals on the warm-stone tokens (state §0.136; Jeff: "The
// blue-era modals … roughly 400 off-brand Tailwind colours … one job"). Six
// files carried the Tailwind palette as literals — slate greys, #2563eb
// buttons, #fef2f2 washes. scripts/migrate-blue-era.mjs rewrote every one it
// could name to the token it means (549 literals), by ROLE for the blues, and
// kept three DATA palettes verbatim. These scans keep the files that way: a
// new off-brand hex in any of them fails here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const code = (src) => src.split(/\r?\n/).filter(l => !l.trim().startsWith('//')).join('\n');

const FILES = [
    'src/components/layout/ModalLayer.jsx',
    'src/components/modals/LeadImportModal.jsx',
    'src/components/modals/OutlookImportModal.jsx',
    'src/components/modals/ContactModal.jsx',
    'src/components/modals/UserModal.jsx',
    'src/App.jsx',
];
// The dark drag-handle header the guide allows, and the three data palettes
// (a pipeline's stored default colour, the stage pill map, the avatar map).
const ALLOWED_LINE = /#1c1917|avatarColors = \[|name: 'New Business', color: '#|^\s*\{ bg: '#[0-9a-f]{6}', text: '#|closed(Won|Lost)Color = \{ bg: '#/i;

test('the six blue-era files carry no colour literal outside the allowed lines, and each imports the token object', () => {
    for (const f of FILES) {
        const src = code(read(f));
        assert.match(src, /import \{ T \} from '[./]+tokens\.js';/, `${f} imports T`);
        const offenders = src.split('\n')
            .map((l, i) => ({ l, n: i + 1 }))
            .filter(({ l }) => /#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/.test(l) && !ALLOWED_LINE.test(l))
            .map(({ l, n }) => `${n}: ${l.trim().slice(0, 100)}`);
        assert.deepEqual(offenders, [], `${f} has hex colour literals again:\n${offenders.join('\n')}`);
        assert.ok(!/['"]white['"]/.test(src), `${f}: a named white is the surface token`);
    }
});

test('the blues went by role: a primary button is the ink button, a link or border is info; the washes carry an alpha', () => {
    const m = code(read('src/components/layout/ModalLayer.jsx'));
    assert.ok(m.includes("background: confirmModal.danger !== false ? T.danger : T.ink, color: T.surface"), 'the confirm button: danger or ink, never blue');
    assert.ok(m.includes("background: confirmModal.danger !== false ? `${T.danger}14` : `${T.info}14`"), 'the icon wash is a token with an alpha');
    assert.ok(m.includes("background: T.surface, color: T.inkMid"), 'Cancel is the surface with mid ink');
    const li = code(read('src/components/modals/LeadImportModal.jsx'));
    assert.ok(li.includes("style={btn(T.ink)}"), 'the primary button through the btn helper is ink');
    assert.ok(li.includes("style={btn(T.surface2,T.inkMid)}"), 'the secondary is surface2 / mid ink');
    assert.ok(li.includes("e.currentTarget.style.borderColor=T.info"), 'a drag-over border is info');
    const app = code(read('src/App.jsx'));
    assert.ok(app.includes('<rect width="100" height="100" rx="20" fill={T.ink}/>'), 'the sign-in mark is ink');
    assert.ok(app.includes("background: dbOffline === 'auth' ? T.warn : T.danger"), 'the offline banner');
    assert.ok(app.includes("const healthColor = health ? (health.score >= 70 ? T.ok : health.score >= 40 ? T.warn : T.danger) : T.inkMuted;"), 'the meeting-prep health colour');
});

test('LeadImportModal wears CsvImportModal’s chrome: the warm surface, radius 12, a border, the dark drag-handle header', () => {
    const li = code(read('src/components/modals/LeadImportModal.jsx'));
    assert.ok(li.includes("const modal    = { background:T.surface, borderRadius:'12px', border:`1px solid ${T.border}`,"), 'the shell');
    assert.ok(li.includes("const hdr      = { padding:'16px 20px', background:'#1c1917', color:T.surface, display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0, cursor:'grab', userSelect:'none' };"), 'the header band');
    assert.ok(li.includes("<h3 style={{ fontSize:'15px', fontWeight:'600', color:T.surface, margin:0 }}>Import Leads from CSV</h3>"), 'the title on the band');
    assert.ok(!li.includes('📥'), 'no emoji in the title');
});

test('the legacy .modal class the confirm dialogs still use paints the warm surface, not white', () => {
    const css = read('src/index.css');
    assert.ok(/\.modal \{\r?\n\s+background: #fbf8f3;/.test(css), '.modal background is T.surface’s value');
});

test('the migration script keeps the data palettes by what the line says, never by line number', () => {
    const s = code(read('scripts/migrate-blue-era.mjs'));
    assert.ok(s.includes('const EXCLUDE_PATTERNS = {') && !s.includes('EXCLUDE_LINES'), 'patterns, not line numbers');
    assert.ok(s.includes("const alpha = hex.length === 8 ? hex.slice(6) : null;"), 'an 8-digit hex keeps its own alpha');
    assert.ok(s.includes("const token = e.split ? (role === 'bg' ? 'ink' : 'info') : e.token;"), 'blue by role');
});
