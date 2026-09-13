// ─────────────────────────────────────────────────────────────────
// Accelerep signal system — "Tonal & Form"
//
// This look adds NO new chroma. Signalling is carried by two things:
//   1. a three-step tonal ramp per semantic, where each step has ONE job
//   2. a fixed form language (fill vs outline, spine, dots, area fill)
//
// Because the signal lives in FORM, this file ships form constants
// alongside colors — and the migration must ship shared components
// (see README §2). Tokens alone will not hold this design.
// ─────────────────────────────────────────────────────────────────

// ── The ramps ────────────────────────────────────────────────────
// EACH STEP HAS EXACTLY ONE JOB. This is the rule that prevents the
// whole class of contrast bug in this palette:
//
//   tint → background fills ONLY. Never text, never a stroke.
//   base → strokes, sparkline lines, rules, mid-emphasis borders.
//          NEVER a fill behind light text (base + white ≈ 2.9:1).
//   deep → text on stone, and fills behind light text.
//
// Contrast: measured floor across this system is ≈7.9:1 (attend deep on its
// own tint over surface — the tightest case, and the one an earlier draft got
// wrong at 5.9:1 with #7a4a14). Solid-pill cases run higher. Assert both
// directions in a test — see README §6 — rather than trusting these notes.
const RAMP = {
  rise:     { tint: 'rgba(107,138,86,0.16)', base: '#6b8a56', deep: '#2f4a24' },
  fall:     { tint: 'rgba(156,58,46,0.14)',  base: '#9c3a2e', deep: '#6b1f16' },
  attend:   { tint: 'rgba(184,115,51,0.16)', base: '#b87333', deep: '#5f3a10' },
  critical: { tint: 'rgba(122,36,24,0.16)',  base: '#7a2418', deep: '#4a1109' },
  info:     { tint: 'rgba(58,74,88,0.12)',   base: '#3a4a58', deep: '#2b3a44' },
  neutral:  { tint: 'rgba(58,53,46,0.08)',   base: '#8a8378', deep: '#3a352e' },
};

// Flat aliases for the common case (text + tint), so call sites stay short.
const SIGNAL = {
  rise: RAMP.rise.deep,         riseTint: RAMP.rise.tint,         riseLine: RAMP.rise.base,
  fall: RAMP.fall.deep,         fallTint: RAMP.fall.tint,         fallLine: RAMP.fall.base,
  attend: RAMP.attend.deep,     attendTint: RAMP.attend.tint,     attendLine: RAMP.attend.base,
  critical: RAMP.critical.deep, criticalTint: RAMP.critical.tint, criticalLine: RAMP.critical.base,
  info: RAMP.info.deep,         infoTint: RAMP.info.tint,         infoLine: RAMP.info.base,
  neutral: RAMP.neutral.deep,   neutralTint: RAMP.neutral.tint,   neutralLine: RAMP.neutral.base,

  // ── Focus: the one "look here" ─────────────────────────────────
  // Tonal & Form deliberately uses near-black rather than a hue. The
  // attention comes from the solid fill against an otherwise unfilled
  // screen, not from color. AT MOST ONE per screen.
  focus: '#26221c', focusFg: '#f5efe3', focusTint: 'rgba(38,34,28,0.08)',
};

// ── The form language ────────────────────────────────────────────
// These are as much a part of the design as the colors. Changing one
// of them changes the system.
const FORM = {
  pillRadius:     2,          // signal pills are SQUARE-ish, not lozenges
  pillFill:       'deep',     // solid deep fill, light text
  pillFg:         '#fbf8f3',
  spineWidth:     3,          // px, inset left border on a flagged row
  severityDots:   3,          // dot sequence length
  severityMap:    { info: 1, attend: 2, critical: 3 },  // dots filled
  trendAreaFill:  true,       // sparklines get a tint area under the line
  trendBorder:    'deep',     // metric cards get a deep left border
  deltaBackground: 'none',    // trend deltas are bare text + arrow, no pill
};

// ─────────────────────────────────────────────────────────────────
// ⚠ SPINE COLLISION — read before touching any list or table
//
// `FORM.spineWidth` uses `inset 3px 0 0 <color>`. Several existing
// screens ALREADY use exactly that treatment to mean "selected row":
//   • dispatch-customers-b.jsx  — selected customer, tier-colored spine
//   • dispatch-customers-a.jsx  — selected lane row
//   • dispatch-customers-c.jsx  — every table row carries a tier spine
//   • the Contact / Account / Document rails — selection affordances
//
// If severity also claims the left spine, selection and severity become
// indistinguishable. Resolve this ONCE, globally, before migrating any
// list. Options, in preference order:
//   A. Severity keeps the left spine; selection moves to a background
//      tint + a heavier left spine (5px) in ink. (Recommended.)
//   B. Selection keeps the spine; severity moves to a right-edge spine.
//   C. Selection keeps the spine; severity relies on dots alone.
// Do not proceed on a per-screen basis — that guarantees inconsistency.
// ─────────────────────────────────────────────────────────────────
const SPINE_CONFLICT = {
  affected: [
    'dispatch-customers-a.jsx', 'dispatch-customers-b.jsx', 'dispatch-customers-c.jsx',
    'documents-surfaces.jsx', 'documents-rails.jsx', 'contact-account-rails.jsx',
  ],
  resolveFirst: true,
  recommended: 'A — severity owns the 3px left spine; selection becomes tint + 5px ink spine.',
};

// ─────────────────────────────────────────────────────────────────
// Migration map. Note the SHAPE column — this is what makes this
// migration different from a palette swap.
// ─────────────────────────────────────────────────────────────────
const SIGNAL_MIGRATION = [
  { from: 'TOKENS.ok · #4d6b3d', to: 'SIGNAL.rise (deep #2f4a24)',
    shape: 'Trend delta loses its pill background entirely — bare arrow + text. Sparkline gains a tint area fill and a base-colored line.',
    role: 'Positive trend → rise. A success/complete state → keep TOKENS.ok.' },
  { from: 'TOKENS.warn · #b87333', to: 'SIGNAL.attend (deep #5f3a10)',
    shape: 'Pill becomes solid deep fill, light text, radius 2. Row gains a 3px spine. Severity = 2 of 3 dots filled.',
    role: 'Warning wanting action → attend. Decorative ochre → gold/goldInk.' },
  { from: 'TOKENS.danger · #9c3a2e', to: 'SPLITS THREE WAYS',
    shape: 'Same form rules as attend; critical fills 3 of 3 dots.',
    role: 'Three jobs today.', split: [
      ['Negative trend / falling metric', 'SIGNAL.fall — bare delta, area fill'],
      ['Breach, past due, error event', 'SIGNAL.critical — solid pill, spine, 3 dots'],
      ['Destructive UI (delete, discard)', 'keep TOKENS.danger — unchanged'],
    ] },
  { from: '(nothing)', to: 'SIGNAL.info (deep #2b3a44)',
    shape: 'Severity = 1 of 3 dots filled. Solid pill like the others.',
    role: 'New. Notable but neither good nor bad — counts, system notices.' },
  { from: 'TOKENS.inkMuted · #8a8378 as a status color', to: 'SIGNAL.neutral (deep #3a352e)',
    shape: 'Neutral status may stay unfilled — outline or bare text — since "no signal" should not draw the eye.',
    role: 'Status → neutral. Ordinary tertiary label text → stays inkMuted.' },
];

// ─────────────────────────────────────────────────────────────────
// DO NOT TOUCH. A red that means "PDF" is not the red that means
// "breached." These are identity and rank scales, not signals.
//
// Form note: signal pills become solid-fill/radius-2; CATEGORICAL
// pills KEEP their current tinted, rounded treatment. That divergence
// is intentional — it makes a signal visually distinguishable from a
// label at a glance, which is the whole point of the system.
// ─────────────────────────────────────────────────────────────────
const SIGNAL_EXCLUSIONS = [
  { what: 'TOKENS.gold / goldInk',                    why: 'Brand accent. Untouched.' },
  { what: 'TOKENS.ink / inkMid / inkMuted (as text)', why: 'Type hierarchy, not signalling.' },
  { what: 'TOKENS.surfaceInk / surfaceInkFg',         why: 'App header band.' },
  { what: 'FILE_TYPES · documents-data.jsx',          why: 'CATEGORICAL. Format identity. Keep values AND keep tinted form.' },
  { what: 'CATEGORY_STYLE · documents-data.jsx',      why: 'CATEGORICAL. Contract/NDA/SOW are labels. Keep tinted form.' },
  { what: 'ENTITY_META · documents-data.jsx',          why: 'CATEGORICAL. Per-record-type identity.' },
  { what: 'SC_TIERS · dispatch-customers-data.jsx',   why: 'ORDINAL rank, not alert. See README §7 Q1.' },
  { what: 'STAGE_STYLES (pipeline stages)',           why: 'ORDINAL progression.' },
];

Object.assign(window, { RAMP, SIGNAL, FORM, SPINE_CONFLICT, SIGNAL_MIGRATION, SIGNAL_EXCLUSIONS });
