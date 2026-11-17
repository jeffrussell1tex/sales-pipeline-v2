// stageOrder.js — the org's pipeline stages, for every report that ranks or colours them.
//
// WHY THIS IS ITS OWN MODULE
// --------------------------
// ReportsTab carried six hardcoded stage lists, none of them the app's stages
// (Qualification, Discovery, Evaluation (Demo), Proposal, Negotiation/Review,
// Contracts): they named "Prospecting", "Negotiation" and "Closing", which no
// deal can be in, and omitted three real stages. In the Pipeline tab's
// conversion funnel a deal in Evaluation (Demo), Negotiation/Review, Contracts
// or Closed Lost ranked −1 and was counted as "Prospecting" (0.68 item 5). The
// org's stages are `settings.funnelStages` (name + weight, editable in
// Settings) and, absent those, `constants.stages`. Colours are assigned by
// position so a renamed or added stage still gets one.
import { stages as defaultStages } from './constants.js';

export const CLOSED_STAGES = Object.freeze(['Closed Won', 'Closed Lost']);
const isOpen = (name) => !!name && !CLOSED_STAGES.includes(name);

/** The org's OPEN stages in order: settings.funnelStages names, else the app defaults. */
export function openStagesOf(settings) {
    const fromSettings = (settings?.funnelStages || []).map(s => (typeof s === 'string' ? s : s?.name)).filter(isOpen);
    if (fromSettings.length) return [...new Set(fromSettings)];
    return defaultStages.filter(isOpen);
}

const PALETTE = ['#c8a978', '#b07a55', '#b87333', '#a06a3c', '#7a5a3c', '#4d6b3d', '#3a5a7a', '#5a4a7a'];
export const WON_COLOR = '#3a5530';
export const LOST_COLOR = '#9c3a2e';

/** { stageName: colour } for the open stages by position, plus the two closes. */
export function stagePalette(openStages) {
    const out = {};
    (openStages || []).forEach((s, i) => { out[s] = PALETTE[i % PALETTE.length]; });
    out['Closed Won'] = WON_COLOR;
    out['Closed Lost'] = LOST_COLOR;
    return out;
}

// The Funnel stages panel's rows (AI scoring batch 2A — Jeff, 17 Nov, Q7: the panel saved `prob`, which nothing reads;
// every reader — the deal window's default probability, the deal score's start — reads `weight`). Each stored stage
// as the panel edits it: its weight (an old `prob` read as one, else 30 — the deal score's default), its type (Won and
// Lost by the close's name, else Open) and its colour (by position, as stagePalette gives it).
export function funnelRowsOf(list) {
    const named = (Array.isArray(list) ? list : []).map((s) => (typeof s === 'string' ? { name: s } : s)).filter((s) => s && typeof s.name === 'string' && s.name);
    let open = 0;
    return named.map((s) => {
        const w = Number(s.weight ?? s.prob);
        const type = s.type === 'Won' || s.type === 'Lost' || s.type === 'Open' ? s.type : s.name === 'Closed Won' ? 'Won' : s.name === 'Closed Lost' ? 'Lost' : 'Open';
        const color = typeof s.color === 'string' && s.color ? s.color : type === 'Won' ? WON_COLOR : type === 'Lost' ? LOST_COLOR : PALETTE[open % PALETTE.length];
        if (type === 'Open') open += 1;
        const { prob: _p, ...rest } = s;
        return { ...rest, weight: Number.isFinite(w) ? Math.max(0, Math.min(100, Math.round(w))) : 30, type, color };
    });
}

/** The last two open stages: a deal there with no forecast category counts as commit. */
export const commitFallbackStages = (openStages) => (openStages || []).slice(-2);
/** The stage before those: no forecast category there counts as best case. */
export const bestCaseFallbackStages = (openStages) => (openStages || []).slice(-3, -2);
