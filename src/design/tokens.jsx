// src/design/tokens.jsx
// Accelerep V1 Design Tokens — locked. All subsequent screens derive from this file.
// Derived from the approved Home V1 (warm stone, ink-dark header, gold accent).
// DO NOT modify token values without a full design review.

export const T = {
  // ── Surfaces ────────────────────────────────────────────────────────────────
  bg:           '#f0ece4',   // warm stone — app background
  surface:      '#fbf8f3',   // cards, panels, modal backgrounds
  surface2:     '#f5efe3',   // hover fill, subtle tinted backgrounds
  surfaceInk:   '#2a2622',   // ink-dark — app header, inverse surfaces
  surfaceInkFg: '#e6ddd0',   // foreground text/icons on ink surfaces

  // ── Borders ─────────────────────────────────────────────────────────────────
  border:       '#e6ddd0',   // default border — warm stone
  borderStrong: '#d4c8b4',   // emphasized border, dividers

  // ── Text ────────────────────────────────────────────────────────────────────
  ink:          '#2a2622',   // primary text — near-black warm
  inkMid:       '#5a544c',   // secondary text — dark warm grey
  inkMuted:     '#8a8378',   // tertiary text — muted warm grey

  // ── Accent ──────────────────────────────────────────────────────────────────
  gold:         '#c8b99a',   // gold-tan — header accent bar, active nav underline
  goldInk:      '#7a6a48',   // darker gold — eyebrow labels, role badges

  // ── Semantic ────────────────────────────────────────────────────────────────
  // Use sparingly. These are signal colors — not brand colors.
  danger:       '#9c3a2e',   // delete, overdue, at-risk, error states
  warn:         '#b87333',   // warning, close date approaching, stalled
  ok:           '#4d6b3d',   // success, closed won, healthy, on-track
  info:         '#3a5a7a',   // informational, calendar events

  // ── Stage colors ─────────────────────────────────────────────────────────────
  // Deliberately desaturated — used as 2–3px left-border accents only.
  // Never fill a large surface with these.
  stages: {
    Prospecting:   '#b0a088',
    Qualification: '#c8a978',
    Discovery:     '#b07a55',
    Proposal:      '#b87333',
    Negotiation:   '#7a5a3c',
    Closing:       '#4d6b3d',
    'Closed Won':  '#3a5530',
    'Closed Lost': '#9c3a2e',
  },

  // ── Typography ───────────────────────────────────────────────────────────────
  // Plus Jakarta Sans is loaded via @fontsource in index.css (weights 400, 500, 600, 700).
  // Georgia / "Tiempos" is the editorial serif used for page titles, modal headings, italic accents.
  sans:  '"Plus Jakarta Sans", system-ui, sans-serif',
  serif: 'Georgia, "Tiempos", "Times New Roman", serif',

  // ── Radii ────────────────────────────────────────────────────────────────────
  // Flat-leaning, editorial. Avoid large border-radius (≥12px) from old design.
  radiusSm: 3,   // inputs, buttons, small chips
  radiusMd: 4,   // cards, containers
  radiusLg: 6,   // modals, large panels

  // ── Misc ─────────────────────────────────────────────────────────────────────
  textMin: 12,   // minimum readable font size — never go below this
};

// ── Eyebrow label style ────────────────────────────────────────────────────────
// Used for: section headers, column labels, category tags.
// Returns an inline style object — spread onto any element.
export const eyebrow = (color) => ({
  fontSize:      11,
  fontWeight:    600,
  color:         color || T.inkMuted,
  letterSpacing: 0.8,
  textTransform: 'uppercase',
});

// ── Warm avatar palette ───────────────────────────────────────────────────────
// Deterministic color assignment from name hash. Used by Avatar component.
export const AVATAR_PALETTE = [
  '#9c6b4a', '#7a5a3c', '#5a6e5a', '#6b5a7a',
  '#8a5a5a', '#5a7a8a', '#7a6b5a', '#4a6b5a',
];

// ── Engagement dot colors ─────────────────────────────────────────────────────
export const ENG_COLOR = {
  hot:   T.danger,
  warm:  T.warn,
  cool:  T.info,
  stale: T.inkMuted,
};

export default T;
