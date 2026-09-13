// Shared V1 tokens — lock for all subsequent screens.
// Derived from the approved Home V1 (warm stone, ink-dark header, gold accent).

const TOKENS = {
  // Surfaces
  bg: '#f0ece4',            // app background
  surface: '#fbf8f3',       // cards, panels
  surface2: '#f5efe3',      // hover / subtle fill
  surfaceInk: '#2a2622',    // ink header & inverse surfaces
  surfaceInkFg: '#e6ddd0',  // foreground on ink
  // Lines
  border: '#e6ddd0',
  borderStrong: '#d4c8b4',
  // Text
  ink: '#2a2622',
  inkMid: '#5a544c',
  inkMuted: '#8a8378',
  // Accent
  gold: '#c8b99a',
  goldInk: '#7a6a48',
  // Semantic — use sparingly
  danger: '#9c3a2e',
  warn: '#b87333',
  ok: '#4d6b3d',
  info: '#3a5a7a',
  // Stage colors — deliberately desaturated, used as 2-3px accents only
  stages: {
    'Prospecting':   '#b0a088',
    'Qualification': '#c8a978',
    'Discovery':     '#b07a55',
    'Proposal':      '#b87333',
    'Negotiation':   '#7a5a3c',
    'Closing':       '#4d6b3d',
    'Closed Won':    '#3a5530',
    'Closed Lost':   '#9c3a2e',
  },
  // Type
  sans: '"Plus Jakarta Sans", system-ui, sans-serif',
  serif: 'Georgia, "Tiempos", serif',
  // Radii — flat-leaning, small radii feel editorial
  radiusSm: 3, radiusMd: 4, radiusLg: 6,
  // Min readable text
  textMin: 12,
};

// Label-style small caps used throughout (eyebrow labels, section heads)
const eyebrowStyle = (color) => ({
  fontSize: 11, fontWeight: 600, color: color || TOKENS.inkMuted,
  letterSpacing: 0.8, textTransform: 'uppercase',
});

Object.assign(window, { TOKENS, eyebrowStyle });
