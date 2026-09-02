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

/** The last two open stages: a deal there with no forecast category counts as commit. */
export const commitFallbackStages = (openStages) => (openStages || []).slice(-2);
/** The stage before those: no forecast category there counts as best case. */
export const bestCaseFallbackStages = (openStages) => (openStages || []).slice(-3, -2);
