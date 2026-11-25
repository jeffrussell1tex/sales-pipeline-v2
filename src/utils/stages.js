// stages.js — an org's deal stages: the one list, the stage a deal is in, and what a save of the list is refused for
// (state §0.299; guide §18b142). Pure: the screens, the deals endpoint and the settings save read one rule. The order and
// the two closes are stageOrder.js's.
//
// A deal holds its stage by NAME, and the org's list (settings.funnelStages, Settings → Funnel stages) is where the names
// come from. Until §0.299 the Pipeline tab's board, funnel and stage filter drew a list written into the app — a stage an
// Admin added had no column and its deals left the board — and any stage at all was stored.
import { openStagesOf, funnelRowsOf, CLOSED_STAGES, commitFallbackStages, bestCaseFallbackStages } from './stageOrder.js';
import { nameKey } from './memberName.js';
import { DEFAULT_SETTINGS } from './settingsDefaults.js';

// The org's stages as the screens draw them: the open ones in order, then the two closes — always there, by these names:
// what is won and lost is told by them everywhere.
export const orgStages = (settings) => [...openStagesOf(settings), ...CLOSED_STAGES];

// The stage a deal that names none is made in.
export const firstStageOf = (settings) => openStagesOf(settings)[0];

// The stages a board draws: the org's (orgStages), and any other a deal it draws is in, before the closes — a deal is never
// left off.
export function stagesDrawn(stages, deals) {
    const own = stages.filter((s) => !CLOSED_STAGES.includes(s));
    const known = new Set(stages);
    const others = new Set();
    for (const d of deals || []) if (d && typeof d.stage === 'string' && d.stage && !known.has(d.stage)) others.add(d.stage);
    return [...own, ...others, ...CLOSED_STAGES];
}

// The stage of the list a name means — its own spelling (any case or spacing is one name, as a team's is) — or null.
export function stageNamed(list, name) {
    if (typeof name !== 'string' || !name.trim()) return null;
    return list.find((s) => s === name) ?? list.find((s) => nameKey(s) === nameKey(name)) ?? null;
}

// What a write stores for the stage a body sends: { stage } — null: none named, what is stored stands — or { refused }.
// `held` is the stage the deal has: never asked again, in any case or spacing — but the org's own spelling, named exactly, is
// a move onto it (a deal stored as "closed won" could never be won).
export const stageRefusal = (name) => `"${String(name ?? '').trim()}" is not one of your organization's stages — pick one from the list.`;
export function stageToStore(sent, list, held = null) {
    if (sent === undefined || sent === null || (typeof sent === 'string' && !sent.trim())) return { stage: null };
    if (typeof sent !== 'string') return { refused: stageRefusal(JSON.stringify(sent)) };
    if (list.includes(sent)) return { stage: sent };
    if (held && nameKey(sent) === nameKey(held)) return { stage: held };
    const own = stageNamed(list, sent);
    return own ? { stage: own } : { refused: stageRefusal(sent) };
}

// The rows of a write, each with the stage it stores: { rows }, or { status, error, field, ids } — every row refused, nothing
// written. priors: the stored row of each id (a save); create: a row naming no stage is made in the org's first. A save's
// blank stage is not named, and neither is one the org does not list on a row the caller may not write (mayAsk): the write
// answers that row forbidden or not found, and a refusal would tell of a deal they cannot read.
export function decideStages(rows, list, { priors = null, create = false, mayAsk = () => true } = {}) {
    const decided = rows.map((row) => {
        if (!create && !(row && typeof row === 'object' && 'stage' in row)) return { row, left: true };
        const asked = stageToStore(row?.stage, list, priors?.get(row?.id)?.stage ?? null);
        return asked.refused && !mayAsk(row) ? { row, stage: null } : { row, ...asked };
    });
    const bad = decided.filter((d) => d.refused);
    if (bad.length) return { status: 400, error: bad[0].refused, field: 'stage', ids: bad.map((d) => d.row.id) };
    return { rows: decided.map((d) => {
        if (d.left) return d.row;
        if (d.stage || create) return { ...d.row, stage: d.stage || list[0] };
        const { stage: _blank, ...rest } = d.row;
        return rest;
    }) };
}

// The four forecast categories a deal may be given, and the lane each puts it in.
export const FORECAST_CATEGORIES = Object.freeze([
    { value: 'commit',    label: 'Commit',    lane: 'commit',   hint: 'High confidence — counts in commit',       words: 'Rep is confident this deal closes this period.' },
    { value: 'best_case', label: 'Best Case', lane: 'best',     hint: 'Upside — possible but not certain',        words: 'Best Case — upside if everything goes right.' },
    { value: 'pipeline',  label: 'Pipeline',  lane: 'pipeline', hint: 'Too early to call',                        words: 'Pipeline — tracking but not yet forecastable.' },
    { value: 'omit',      label: 'Omit',      lane: 'omit',     hint: 'Left out of commit and best case',         words: 'Left out of commit and best case.' },
]);
// A category's text as it is read: in any case, spaces, hyphens and underscores one (a rule's was stored as typed, until
// §0.301); none is null.
const categoryKey = (v) => (typeof v === 'string' ? v.trim().toLowerCase().replace(/[\s_-]+/g, '_') : '') || null;
// A deal's own, as it is read: one of the four, a word that is none of them, or null for none.
export const categoryOf = (deal) => categoryKey(deal?.forecastCategory);
const listed = (key) => FORECAST_CATEGORIES.find((c) => c.value === key);
// What a screen calls it: the four by their names, any other word as stored; null for none.
export const categoryLabel = (deal) => { const key = categoryOf(deal); return key ? listed(key)?.label ?? deal.forecastCategory.trim() : null; };
// What a rule stores for the value it was given: { value }, none when blank; {} for a word that is none of the four.
export const categoryToStore = (v) => {
    if (v === undefined || v === null || (typeof v === 'string' && !v.trim())) return { value: null };
    const one = listed(categoryKey(v));
    return one ? { value: one.value } : {};
};

// Where an open deal stands in the forecast — Home, the Pipeline tab, its List and Reports read this one rule (state §0.301;
// Jeff, 25 Nov: "yes"): its own forecast category; with none, its stage — the last two open ones are commit, the one before
// them best case, every other, one off the list too, pipeline. A category that is none of the four is pipeline; a closed deal
// stands nowhere. (deal) => 'commit' | 'best' | 'pipeline' | 'omit' | null.
export function laneReader(settings) {
    const open = openStagesOf(settings);
    const commit = new Set(commitFallbackStages(open)), best = new Set(bestCaseFallbackStages(open));
    return (deal) => {
        if (!deal || CLOSED_STAGES.includes(deal.stage)) return null;
        const own = categoryOf(deal);
        if (own) return listed(own)?.lane ?? 'pipeline';
        return commit.has(deal.stage) ? 'commit' : best.has(deal.stage) ? 'best' : 'pipeline';
    };
}
// What the deal window says under the four: the one chosen, or where a deal with none counts.
export function categoryWords(deal, settings) {
    const own = categoryOf(deal);
    if (own) return listed(own)?.words ?? `"${deal.forecastCategory.trim()}" is none of the four — counted as Pipeline.`;
    const lane = laneReader(settings)(deal);
    return lane ? `Not set — counted by its stage: ${FORECAST_CATEGORIES.find((c) => c.lane === lane).label}.` : 'Not set.';
}
export const commitStagesOf = (settings) => commitFallbackStages(openStagesOf(settings));

// Whether a deal in a stage is one to quote: any open one — off the list too — past the org's first; where it has one, that
// one. (stage) => boolean.
export function quoteReader(settings) {
    const open = openStagesOf(settings);
    return (stage) => !CLOSED_STAGES.includes(stage) && (open.length < 2 || stage !== open[0]);
}

// The stage a closed deal is reopened in: the one it was closed from in this window (`left`) — while the org has it, or it is
// the one the deal is stored in (`held`); else the one its latest close left, while the org has it; else the last open one.
export function reopenStage(stages, { left = null, held = null, history = [] } = {}) {
    const open = stages.filter((s) => !CLOSED_STAGES.includes(s));
    if (left && (open.includes(left) || left === held)) return left;
    const closing = [...(Array.isArray(history) ? history : [])].reverse().find((h) => h && CLOSED_STAGES.includes(h.stage));
    return open.includes(closing?.prevStage) ? closing.prevStage : open[open.length - 1];
}

// ── The settings save ─────────────────────────────────────────────────────────────────────────────────────────────
export const STAGE_MAX = 100;   // opportunities.stage is varchar(100) (db/schema.ts)
export const STAGES_A_LIST = 'Send the stages as a list.';
export const STAGE_NEEDS_NAME = 'Give each stage a name.';
export const STAGE_TOO_LONG = `A stage's name is ${STAGE_MAX} characters at most.`;
export const KEEP_ONE_STAGE = 'Keep at least one open stage.';
export const KEEP_THE_CLOSES = 'Closed Won and Closed Lost keep their names — every deal won or lost is told by them.';
export const STAGE_WEIGHT = 'Give each stage a default probability from 0 to 100.';
export const stageNameTaken = (name) => `Another stage is named "${name}".`;
export const stageReadsClosed = (name) => `"${name}" would read as a closed deal — name an open stage something else.`;

const exactName = (s) => (typeof s === 'string' ? s : s && typeof s === 'object' && typeof s.name === 'string' ? s.name : '');
const nameOf = (s) => exactName(s).trim();
// A name some screen tells a closed deal by (contactDeals.js; the deal window's "Closed…").
const readsClosed = (name) => /^closed/i.test(name) || ['won', 'lost'].includes(nameKey(name));
const wholePercent = (v) => Number.isInteger(v) && v >= 0 && v <= 100;
// How many times the stored list holds each exact name — the two closes once at least: they are always the org's.
const heldNames = (stored) => {
    const held = new Map(CLOSED_STAGES.map((c) => [c, 1]));
    const seen = {};
    for (const s of Array.isArray(stored) ? stored : []) { const n = exactName(s); seen[n] = (seen[n] || 0) + 1; held.set(n, seen[n]); }
    return held;
};

// What a stages list a save sends is refused for, or null: { status: 400, error, field }. A name the stored list holds,
// exactly, stands whatever it is — as often as it holds it, and no more: the page sends the whole list, and one such name
// would refuse every save of it.
export function stagesRefused(sent, stored = []) {
    const no = (error) => ({ status: 400, error, field: 'funnelStages' });
    if (!Array.isArray(sent)) return no(STAGES_A_LIST);
    const held = heldNames(stored);
    const all = sent.map((s) => { const n = exactName(s), left = held.get(n) || 0; held.set(n, left - 1); return { name: nameOf(s), anew: left < 1, weight: s?.weight }; });
    if (all.some((s) => !s.name)) return no(STAGE_NEEDS_NAME);
    if (all.some((s) => s.anew && s.name.length > STAGE_MAX)) return no(STAGE_TOO_LONG);
    if (!CLOSED_STAGES.every((c) => sent.some((s) => s && s.name === c))) return no(KEEP_THE_CLOSES);
    const taken = all.find((s, i) => s.anew && all.some((o, j) => (j < i || (j > i && !o.anew)) && nameKey(o.name) === nameKey(s.name)));
    if (taken) return no(stageNameTaken(taken.name));
    const open = all.filter((s) => !CLOSED_STAGES.includes(s.name));
    if (!open.length) return no(KEEP_ONE_STAGE);
    const closed = open.find((s) => s.anew && readsClosed(s.name));
    if (closed) return no(stageReadsClosed(closed.name));
    return all.every((s) => wholePercent(s.weight)) ? null : no(STAGE_WEIGHT);
}

// The list as it is stored: a name named anew with no space round it; one the stored list holds, as its deals hold it.
export function stagesToStore(sent, stored = []) {
    const held = heldNames(stored);
    return sent.map((s) => (held.has(s.name) ? { ...s } : { ...s, name: nameOf(s) }));
}

// The stages a save drops: those the org has now and the list sent does not, by their exact names — a rename drops the name
// the deals hold.
export function removedStages(sent, stored) {
    const kept = new Set(orgStages({ funnelStages: sent }));
    return orgStages({ funnelStages: stored }).filter((s) => !kept.has(s));
}

// What a drop is refused with while deals are in what it drops: { [stage]: how many } — every deal, for a stage has no other
// to count in. null: nothing in the way.
export const dealsByStage = (deals) => (deals || []).reduce((n, d) => (d && d.stage ? { ...n, [d.stage]: (n[d.stage] || 0) + 1 } : n), {});
export function stagesInUseWords(removed, byStage) {
    const held = removed.filter((s) => byStage[s] > 0);
    if (!held.length) return null;
    const said = held.map((s) => `"${s}" still has ${byStage[s]} deal${byStage[s] === 1 ? '' : 's'}`).join('; ');
    return `${said}. Move them to another stage first.`;
}

// ── The page (Settings → Funnel stages) ───────────────────────────────────────────────────────────────────────────
// The rows the page edits: each stored stage once, with the name it is stored by (`was` — none for one added here) and a key
// of its own; the open ones in order — the app's, where the list names none, as every screen then draws — then the two
// closes, there whatever the list holds.
export function stageRowsOf(list) {
    const seen = new Set();
    const named = (from) => funnelRowsOf(from).filter((s) => s.name.trim() && !seen.has(s.name) && seen.add(s.name));
    const isOpen = (s) => !CLOSED_STAGES.includes(s.name);
    const own = named(list), open = own.filter(isOpen);
    const close = (name, weight) => own.find((s) => s.name === name) || { name, weight };
    return [...(open.length ? open : named(DEFAULT_SETTINGS.funnelStages).filter(isOpen)), close('Closed Won', 100), close('Closed Lost', 0)]
        .map((s, i) => ({ ...s, was: s.name, key: `st_${i}`, close: !isOpen(s) }));
}
// A row added on the page, before the closes (n: how many were added before it); one edited; one taken out; one a place up
// (-1) or down (+1) among the open ones — the two closes stay last.
export const addedRow = (rows, n) => [...rows.filter((r) => !r.close), { name: '', weight: 50, was: null, key: `new_${n}`, close: false }, ...rows.filter((r) => r.close)];
export const editedRow = (rows, key, field, val) => rows.map((r) => (r.key === key ? { ...r, [field]: val } : r));
export const removedRow = (rows, key) => rows.filter((r) => r.key !== key);
export function movedRow(rows, i, by) {
    const j = i + by;
    const open = (r) => !!r && !r.close;
    if (!open(rows[i]) || !open(rows[j])) return rows;
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
}
// How many deals are in a row's stage; whether its name is fixed — the two closes' always, one deals are in while it is what
// they hold — and whether it may be taken out.
export const dealsIn = (row, byStage) => (row.was ? byStage[row.was] || 0 : 0);
export const nameLocked = (row, byStage) => row.close || (dealsIn(row, byStage) > 0 && row.name === row.was);
export const removable = (row, byStage) => !row.close && dealsIn(row, byStage) === 0;
// What a typed default probability is: a whole number from 0 to 100.
export const typedWeight = (v) => Math.max(0, Math.min(100, parseInt(v, 10) || 0));
// What a save sends: the rows without what only the page reads. What a stage is — open, won, lost — is told by its name.
export const stagesSent = (rows, stored) => stagesToStore(rows.map(({ was: _was, key: _key, close: _close, type: _type, color: _color, ...s }) => s), stored);
