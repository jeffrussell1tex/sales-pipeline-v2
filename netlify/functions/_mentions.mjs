// _mentions.mjs — the rules of the mention text (state §0.172): which record
// each event is about, and what a stage-change text says moved.
//
// Pure and dependency-free: mention-sms.mjs imports db/index.js and loads only
// under `tsx`, so its rules live here, where tests/audit-close.test.mjs and the
// mutation harness run them.

// Which record each event is about. An event not named here is refused.
export const MENTION_EVENTS = Object.freeze({
    dealAssigned:  'opportunity',
    stageChanged:  'opportunity',
    dealClosedWon: 'opportunity',
    taskAssigned:  'task',
});

// The move a stage-change text reports: the deal's own last recorded move, from
// the stage it left to the stage it is in. A stageHistory entry records the move
// INTO `stage` from `prevStage` (src/utils/lossAnalysis.js), and every stored
// history is a jsonb array. null when the last entry is not a move into the
// deal's current stage: no change on record, so no text. Until §0.172 the
// browser named both stages.
export function lastMoveOf(deal) {
    const history = Array.isArray(deal?.stageHistory) ? deal.stageHistory : [];
    const last = history.length ? history[history.length - 1] : null;
    if (!last || !deal.stage || last.stage !== deal.stage) return null;
    return { fromStage: last.prevStage || '—', toStage: deal.stage };
}
