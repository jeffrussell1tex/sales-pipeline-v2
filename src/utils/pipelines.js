// pipelines.js — an org's pipelines, its default one, and the one a deal counts in (state §0.297; guide §18b140). Pure:
// the screens, the deals endpoint and the settings save read one rule.
//
// A deal names its pipeline by an id of the org's settings list (settings.extra.pipelines). Each reader had its own idea of
// the list, of "the default" (the id 'default', the first, the one marked) and of a deal naming none of them — hidden from
// every screen that draws a pipeline (Jeff, 1 Oct: "Leave the data; fix the product").
import { nameKey } from './memberName.js';

// What an org that stored no list has — the seed every new workspace's settings are (settingsDefaults.js DEFAULT_SETTINGS;
// held equal by tests/pipelines.test.mjs).
export const FALLBACK_PIPELINE = Object.freeze({ id: 'default', name: 'New Business', color: '#2563eb' });

// A pipeline made without a colour takes one by its place. Hex, whole: the deal window draws it with an alpha after it.
export const PIPELINE_COLORS = Object.freeze(['#3a5a7a', '#4d6b3d', '#b87333', '#7a5a3c', '#6b4d7a', '#9c6a1e']);
const HEX = /^#[0-9a-f]{6}$/i;

const isEntry = (p) => !!p && typeof p === 'object' && !Array.isArray(p) && typeof p.id === 'string' && p.id.trim() !== '';
export const entriesOf = (list) => (Array.isArray(list) ? list : []).filter(isEntry);
export const pipelineName = (p) => (p && typeof p.name === 'string' && p.name.trim() ? p.name.trim() : 'Unnamed pipeline');

// The org's pipelines, as the screens draw them: the stored entries with an id, the first of each id, each with a name and a
// colour; the one fallback when the list holds none (never stored, null, [], no list). Never empty.
export function pipelinesOf(list) {
    const seen = new Set();
    const own = entriesOf(list).filter((p) => !seen.has(p.id) && seen.add(p.id));
    if (!own.length) return [{ ...FALLBACK_PIPELINE }];
    return own.map((p, i) => ({ ...p, name: pipelineName(p), color: HEX.test(p.color || '') ? p.color : PIPELINE_COLORS[i % PIPELINE_COLORS.length] }));
}

// The default pipeline: the one marked, else the first.
export function defaultPipelineOf(list) {
    const own = pipelinesOf(list);
    return own.find((p) => p.isDefault === true) || own[0];
}

// The pipeline a deal counts in, as a reader over many deals: (deal) => id — its own while the org has it, else the default.
// What is stored is never changed by it.
export function pipelineReader(list) {
    const ids = new Set(pipelinesOf(list).map((p) => p.id));
    const fallback = defaultPipelineOf(list).id;
    return (deal) => (ids.has(deal?.pipelineId) ? deal.pipelineId : fallback);
}
export const pipelineIdOf = (deal, list) => pipelineReader(list)(deal);

// What each pipeline holds, counted from the deals: Map(id → { open, value, won, lost, strays, byStage }) — strays: the open
// deals that count in the default one because the org has no pipeline of the id they name.
export function pipelineCounts(deals, list, isOpen) {
    const of = pipelineReader(list);
    const counts = new Map(pipelinesOf(list).map((p) => [p.id, { open: 0, value: 0, won: 0, lost: 0, strays: 0, byStage: {} }]));
    for (const d of deals || []) {
        const c = counts.get(of(d));
        if (isOpen(d)) {
            c.open += 1;
            if (d.pipelineId !== of(d)) c.strays += 1;
            c.value += Number(d.arr) || 0;
            c.byStage[d.stage] = (c.byStage[d.stage] || 0) + 1;
        } else if (/won/i.test(String(d?.stage || ''))) c.won += 1;
        else c.lost += 1;
    }
    return counts;
}

// The list a save sends with its default marked on one entry, and one alone: the one named, while the list has it. Read by
// place otherwise, a drag moved the default.
export function withDefaultMarked(list, defaultId) {
    const own = entriesOf(list);
    const id = own.some((p) => p.id === defaultId) ? defaultId : (own[0] && own[0].id);
    let marked = false;
    return (Array.isArray(list) ? list : []).map((p) => {
        if (!isEntry(p)) return p;
        const isDefault = !marked && p.id === id;
        if (isDefault) marked = true;
        return { ...p, isDefault };
    });
}

// ── The settings save ─────────────────────────────────────────────────────────────────────────────────────────────
export const KEEP_ONE_PIPELINE = 'Keep at least one pipeline.';
export const PIPELINE_NEEDS_NAME = 'Give each pipeline a name.';
export const pipelineNameTaken = (name) => `Another pipeline is named "${name}".`;

// What a pipelines list a body sends is refused for, beside its shape (linkIds.js listShapeRefused), or null: a list of none
// where the org holds one; a pipeline with no name, or the name of another (any case or spacing), that the stored list does
// not hold so already — by its id. { status: 400, error, field }.
export function pipelinesRefused(sent, stored) {
    const no = (error) => ({ status: 400, error, field: 'pipelines' });
    const own = entriesOf(sent), held = entriesOf(stored);
    if (!own.length) return held.length ? no(KEEP_ONE_PIPELINE) : null;
    const asHeld = (p) => held.some((h) => h.id === p.id && h.name === p.name);
    const text = (p) => (typeof p.name === 'string' ? p.name.trim() : '');
    if (own.some((p) => !asHeld(p) && !text(p))) return no(PIPELINE_NEEDS_NAME);
    const taken = own.find((p) => !asHeld(p) && own.some((q) => q !== p && text(q) && nameKey(text(q)) === nameKey(text(p))));
    return taken ? no(pipelineNameTaken(text(taken))) : null;
}

// The pipelines a save drops: those the org has now — the fallback too, where it stored none — and the list sent does not.
export function removedPipelines(sent, stored) {
    const kept = new Set(pipelinesOf(sent).map((p) => p.id));
    return pipelinesOf(stored).filter((p) => !kept.has(p.id));
}

// What a drop is refused with while open deals name what it drops: { [id]: how many }. null: nothing in the way.
export function inUseWords(removed, openById) {
    const held = removed.filter((p) => openById[p.id] > 0);
    if (!held.length) return null;
    const said = held.map((p) => `"${pipelineName(p)}" still has ${openById[p.id]} open deal${openById[p.id] === 1 ? '' : 's'}`).join('; ');
    return `${said}. Move them to another pipeline, or close them, first.`;
}
