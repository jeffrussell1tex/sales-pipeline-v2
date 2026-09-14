// src/tokens.js — THE design-token object. One copy, imported everywhere.
//
// Until 14 Sep 2026 every non-Settings file declared its own copy of this object
// (24 files; ReportsTab eight) — a value changed here reached none of them.
// The colours never drifted; the font stacks and one radius had. Now:
//   - every file imports { T } from this module (Settings through
//     settings/shared/tokens.js, the Documents feature through documents/atoms.jsx,
//     both re-exports of this object);
//   - Dispatch alone keeps radius 4: `const T = { ...TOKENS, r: 4 }` in DispatchTab;
//   - the serif stack is Georgia — the "Source Serif 4" / "Tiempos" spellings some
//     copies carried were never loaded, so every screen rendered Georgia already.
// tests/single-token-file.test.mjs pins all of this.
export const T = {
    // Surfaces
    bg: '#f0ece4',            // app background
    surface: '#fbf8f3',       // cards, panels
    surface2: '#f5efe3',      // hover / subtle fill
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
    tint: 'rgba(200,185,154,0.20)',   // gold wash
    // The ink header band and its foreground
    surfaceInk: '#2a2622',
    surfaceInkFg: '#e6ddd0',
    // Semantic — use sparingly
    danger: '#9c3a2e',
    warn: '#b87333',
    ok: '#4d6b3d',
    info: '#3a5a7a',
    // Pipeline stage colours — desaturated, 2–3px accents only
    stages: {
        'Prospecting':        '#b0a088',
        'Qualification':      '#c8a978',
        'Discovery':          '#b07a55',
        'Evaluation (Demo)':  '#b07a55',
        'Proposal':           '#b87333',
        'Negotiation':        '#7a5a3c',
        'Negotiation/Review': '#7a5a3c',
        'Contracts':          '#4d6b3d',
        'Closing':            '#4d6b3d',
        'Closed Won':         '#3a5530',
        'Closed Lost':        '#9c3a2e',
    },
    // Type
    sans: '"Plus Jakarta Sans", system-ui, sans-serif',
    serif: 'Georgia, serif',
    mono: '"ui-monospace", "Menlo", monospace',
    // Radii — flat-leaning
    r: 3, rSm: 3, rMd: 4, rLg: 6,
};
