# Signal system "Tonal & Form" — application-wide migration brief

> Supersedes the earlier Deep Pigment brief (`handoff-signal-palette/`).
> Tonal & Form was selected instead. Ignore that folder.

The chosen look is **artboard 3 · Tonal & Form** in the mock. It adds no new
chroma at all: each semantic gets a tint/base/deep ramp, and the signalling
work is handed to *form* — solid fill vs. outline, a spine on the row, severity
dots, an area fill under the trend line.

**This is not a palette swap, and the brief is not interchangeable with one.**
Read §1 and §2 before writing any code; §3 contains a spine collision that must
be resolved globally before the first list is migrated.

---

## 0 · What's in here

```
handoff-signal-tonal/
├── README.md                          ← you are here
├── Signal Palette.html                ← runnable mock: before-state + all 3 looks
└── src/
    ├── tokens-signal-tonal.jsx        ← THE DELIVERABLE: RAMP, SIGNAL, FORM,
    │                                     SPINE_CONFLICT, migration map, exclusions
    ├── tokens.jsx                     ← existing design system, unchanged
    ├── common.jsx                     ← Icon, Avatar
    ├── signal-palette-shared.jsx      ← the specimens (trend cards, events, pills, table)
    ├── signal-palette-exploration.jsx ← mock-only canvas
    └── design-canvas.jsx              ← mock-only
```

In `signal-palette-shared.jsx` the components take a `look` prop; the
`look === 'tonal'` branches are the reference implementation of every form rule
described below. Read those branches, not the other two.

---

## 1 · Why this migration is harder than a color swap

A palette swap changes values. This changes **component structure**:

| | Colour swap | Tonal & Form |
|---|---|---|
| Status pill | same shape, darker text | tinted-outline → **solid deep fill, light text, radius 2** |
| Flagged row | tinted background | **3px inset left spine** |
| Severity | one colored dot | **1/2/3 filled dots of 3** |
| Trend delta | pill with tint background | **bare arrow + text, no background** |
| Sparkline | line only | **line in `base` + area fill in `tint`** |
| Metric card | plain border | **deep left border** |

So the migration cannot be driven from the token file. If you swap colors and
leave the markup, you get a slightly darker version of today's screen and none
of the design.

---

## 2 · Ship primitives, not tokens

**The single most important instruction in this document.** Build these four
components once, in the design system, then migrate call sites *to the
components*:

```
<SignalPill      severity="critical">Breached</SignalPill>
<SignalRow       severity="attend">…</SignalRow>     // owns the spine
<SeverityDots    severity="attend"/>                  // 1|2|3 of 3
<TrendCard label value delta direction series/>       // owns delta + sparkline form
```

Rationale: a color migration survives on find-and-replace discipline, because
a wrong value is visible. A *form* migration erodes silently — the first
hand-rolled `borderRadius: 999` pill someone adds next sprint is indisponible
from the system, and within a quarter the language is gone. The component
boundary is what makes the design durable. Do not migrate a single screen until
these exist.

---

## 3 · ⚠ Resolve the spine collision first

`FORM.spineWidth` claims `inset 3px 0 0 <color>` on a row. **Several existing
screens already use exactly that treatment to mean "selected."** Affected files
are listed in `SPINE_CONFLICT.affected` — the dispatch customer lists, the
document surfaces, and the Contact/Account rails. `dispatch-customers-c.jsx`
puts a tier-colored spine on *every* row.

If severity also claims the left spine, selection and severity become
indistinguishable. Pick one resolution and apply it globally **before**
migrating any list:

- **A (recommended)** — severity owns the 3px left spine; selection becomes a
  background tint plus a heavier 5px spine in ink.
- **B** — selection keeps the spine; severity moves to a right-edge spine.
- **C** — selection keeps the spine; severity relies on dots alone.

Resolving this per-screen guarantees an inconsistent app. Decide once.

---

## 4 · Copy-paste this prompt to Claude Code

> You are migrating the Accelerep CRM to a new signal system called
> **Tonal & Form**. I'm attaching `handoff-signal-tonal/`.
>
> **This is a form migration, not a palette swap.** The colors are only half of
> it; the shapes are the design. Do not treat this as a find-and-replace.
>
> **Read first, in this order:** `src/tokens.jsx`; `src/tokens-signal-tonal.jsx`
> (the `RAMP`, `SIGNAL` and `FORM` objects, `SPINE_CONFLICT`, the migration map,
> and the exclusion list); then `README.md` §1–3. Open `Signal Palette.html`,
> look at artboard 3, and read the `look === 'tonal'` branches in
> `src/signal-palette-shared.jsx` — those are the reference implementation.
>
> **Phase 0 — Resolve the spine collision. Decide nothing alone.**
> Read `SPINE_CONFLICT`. Report every file that currently uses
> `inset 3px 0 0` (or an equivalent left-border) to mean "selected", propose a
> resolution (the recommendation is A), and **stop for my approval.** Migrate no
> lists until this is settled.
>
> **Phase 1 — Audit only. Change no files.**
> Enumerate every color literal (hex, `rgb()`, `rgba()`) and every reference to
> `TOKENS.ok`, `TOKENS.warn`, `TOKENS.danger`, `TOKENS.inkMuted`. Write
> `color-audit.md`: file, line, value, component, what it visually marks, and a
> classification from exactly this set — `trend`, `event`, `info`,
> `neutral-status`, `categorical`, `brand`, `type`, `destructive`. Add a second
> column recording the **current form** (pill radius, background treatment,
> border) so I can see the shape change per site. Stop and show me the audit.
>
> **Phase 2 — Land tokens + primitives.**
> Add `RAMP`, `SIGNAL` and `FORM` to the design system, then build the four
> primitives from README §2: `SignalPill`, `SignalRow`, `SeverityDots`,
> `TrendCard`. Match the `look === 'tonal'` reference exactly. Include a
> visual test page rendering all severities of each. Change no existing call
> sites in this phase.
>
> **Phase 3 — Migrate call sites to the primitives, one commit per batch:**
> trends → events → status pills → adopt `info` → remainder. After each batch,
> list what changed and what you deliberately left alone.
>
> **Hard rules:**
> 1. **Each ramp step has exactly one job.** `tint` = background fills only,
>    never text or strokes. `base` = strokes, sparkline lines, rules — **never
>    a fill behind light text** (`base` + white measures ≈2.9:1). `deep` = text
>    on stone, and fills behind light text. Violating this is the main
>    contrast bug available in this palette.
> 2. **Never collapse `TOKENS.danger`.** Falling metric → `SIGNAL.fall`;
>    breach/past-due/error → `SIGNAL.critical`; destructive action (delete,
>    discard) → leave `TOKENS.danger` untouched. Ambiguous → leave it and flag.
> 3. **Honour `SIGNAL_EXCLUSIONS` exactly** — `FILE_TYPES`, `CATEGORY_STYLE`,
>    `ENTITY_META`, `SC_TIERS`, `STAGE_STYLES`, `gold`/`goldInk`, the ink text
>    ramp. These are categorical, ordinal or brand. **And keep their current
>    tinted, rounded pill form**: signal pills become solid/radius-2 while
>    categorical pills stay tinted/rounded, so a signal is distinguishable from
>    a label at a glance. That divergence is intentional — don't "fix" it.
> 4. **Status text may not sit on `inkMuted`** (≈2.8:1). Move status uses to
>    `SIGNAL.neutral`. Leave non-status tertiary label text alone.
> 5. **At most one focus treatment per screen.** `SIGNAL.focus` is near-black by
>    design — the attention comes from a solid fill on an otherwise unfilled
>    screen, not from hue. Two focus treatments on one screen means neither
>    works; flag it rather than shipping it.
> 6. **No new hex literals in components.** If you need a value that isn't in
>    `RAMP`/`SIGNAL`, stop and ask.
> 7. **Contrast is an automated test, not a judgement.** Implement §6 and make
>    it pass. Note it runs in *both* directions here: `deep` on stone, and
>    `pillFg` on `deep`.
> 8. Don't refactor anything else. No prop renames, no restructuring, no
>    "while I was here" cleanups. Signal system only.
>
> **Definition of done:** spine collision resolved and approved;
> `color-audit.md` approved; tokens + four primitives landed with a visual test
> page; five batches committed separately; contrast test passing both
> directions; and `MIGRATION-NOTES.md` recording every exclusion honoured, every
> ambiguous site flagged, and the spine resolution chosen.

---

## 5 · The mapping table

| Today | Becomes | Shape also changes to |
|---|---|---|
| `TOKENS.ok` `#4d6b3d` | `SIGNAL.rise` `#2f4a24` | Bare delta (no pill); sparkline area fill in tint, line in base |
| `TOKENS.warn` `#b87333` | `SIGNAL.attend` `#5f3a10` | Solid pill, light text, radius 2; 3px row spine; 2 of 3 dots |
| `TOKENS.danger` `#9c3a2e` | **splits three ways** | `fall` → bare delta · `critical` → solid pill + spine + 3 dots · destructive → **unchanged** |
| — (new) | `SIGNAL.info` `#2b3a44` | Solid pill; 1 of 3 dots |
| `inkMuted` as *status* | `SIGNAL.neutral` `#3a352e` | May stay unfilled — "no signal" shouldn't draw the eye |

---

## 6 · Contrast gate (required, both directions)

```js
const srgb = c => { c /= 255; return c <= 0.03928 ? c/12.92 : ((c+0.055)/1.055)**2.4; };
const lum  = ([r,g,b]) => 0.2126*srgb(r) + 0.7152*srgb(g) + 0.0722*srgb(b);
const ratio = (a,b) => { const [x,y] = [lum(a),lum(b)].sort((m,n)=>n-m); return (x+0.05)/(y+0.05); };
const over  = (fg, a, bg) => fg.map((c,i) => Math.round(c*a + bg[i]*(1-a)));

// 1. deep as text, on stone and on its own tint over stone
//    assert ratio(RAMP.x.deep, surface) >= 4.5
//    assert ratio(RAMP.x.deep, over(baseRGB, tintAlpha, surfaceRGB)) >= 7.0
//    ↑ the tint case is the TIGHTEST in this system. Test it explicitly for
//      every semantic; do not infer it from the solid-pill result.
// 2. INVERTED — light pill text on a deep fill
//    assert ratio(FORM.pillFg, RAMP.x.deep) >= 4.5
// 3. NEGATIVE test — base must NOT be usable as a fill behind pillFg.
//    assert ratio(FORM.pillFg, RAMP.x.base) < 4.5   // documents the trap
```

For reference: this look measures ≈**7.9:1 at the floor**, rising to ~14:1, and
is the only one of the three explored that clears AA everywhere without
adjustment — and the only one that clears **AAA**. The tightest case is
`attend.deep` used as *text* on `attend.tint` (table flags, inline severity
labels), which is why `deep` bottoms out at `#5f3a10`: an earlier draft used
`#7a4a14` and measured 5.90:1 there, still AA but not the AAA the system
claims. Sample the **tinted-text** cases, not just the solid pills — the solid
pills were passing in that draft and hid the problem.

The before-state palette fails outright — lowest status pill ≈2.83:1, secondary
buttons ≈3.58:1. Test 3 is deliberately a *negative* assertion, encoding rule 1
so a future edit can't quietly use `base` as a fill.

---

## 7 · Open questions

1. **`SC_TIERS`** — contract tier is ordinal and on the exclusion list. But it
   currently owns a per-row spine in `dispatch-customers-c.jsx`, which
   collides with §3. Should tier drop to a swatch/badge and cede the spine to
   severity?
2. **Radius 2 across the app** — signal pills going square-ish is a visible
   identity shift. Confirm you want it everywhere, or only in dense
   list/table contexts.
3. **Destructive vs. critical** — keep delete/discard on `#9c3a2e`, or move to
   `SIGNAL.critical` so all "stop" reds match?
4. **Dark header** — signals inside the `surfaceInk` band need contrast checked
   against `#2a2622`, not stone. Any signal colors on the dark band today?
5. **Charts** — do reporting charts have their own series palette? Categorical
   series colors shouldn't come from `RAMP`; that's a separate exercise.
6. **Scope** — whole app in one pass, or start with Dispatch and Reports where
   trends and events are densest?
