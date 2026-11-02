// planLinks.js — a service plan's covered job types as a list, and the legacy seed's plans (state §0.223 — batch 4b-3
// of OPEN_ITEMS §1 item 1, step D; Jeff, 2 Nov: "Start step D", every answer the Recommended —
// docs/design/links-batch-4b3/STEP-D.md, ANSWERS.md). Pure, so the rules run under node --test; the plans endpoint
// (netlify/functions/dispatch-service-plans.mjs) and its screen (DispatchServicePlansDetail.jsx) share them. A plan's
// links themselves — its visit template and covered job types, entries of the org's job templates and job types lists —
// are the house rule's (linkIds.js NOUNS, _links.mjs LISTS, checkLinks).
import { nameKey } from './memberName.js';

// A plan's covered job types as their list, whatever shape the value has: a list keeps its text ids, each once, in
// order; text — the shape the endpoint stored before §0.223, a JSON string inside the jsonb column (the census of
// 1 Nov) — is read for the list it holds; anything else holds none. So the screen, which filters a list, is never handed
// a string.
export function coveredJobTypesOf(value) {
    let list = value;
    if (typeof list === 'string') {
        try { list = JSON.parse(list); } catch { return []; }
    }
    if (!Array.isArray(list)) return [];
    return list.filter((id, i, all) => typeof id === 'string' && id !== '' && all.indexOf(id) === i);
}

// What a plan's write stores (JD2 — Jeff, 2 Nov: "Yes, for plans"): the list itself, never its JSON text (guide §18b62
// rule 4) — the link check has refused any value that is no list but none; none stores the empty list.
export const coveredToStore = (value) => (Array.isArray(value) ? coveredJobTypesOf(value) : []);

// A legacy service-agreement label as a plan's name: "gold_plus" reads "Gold Plus".
export const labelise = (v) => String(v || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

// The id the legacy button gave a label's plan before §0.223 — global, so another org's plan could hold it.
export const legacyPlanId = (tier) => 'plan_legacy_' + String(tier || '').toLowerCase().replace(/[^a-z0-9]+/g, '_');

// The legacy labels "Create N plans" makes a plan for (Q12, JD1 — Jeff, 2 Nov: "Name or old id; random"): { create,
// existing } — create: the labels no plan of this org stands for, one per name (labels of one name make one plan), each
// { tier, name }; existing: how many labels a plan already stands for. A plan stands for a label when it has the
// label's name (nameKey — case and spaces aside: every screen draws "Gold" and "gold" alike) or the id the legacy
// button gave it (a seeded plan renamed since); any plan, an inactive one too. plans: this org's plans as read.
export function legacyPlansToCreate(tiers, plans) {
    const names = new Set((plans || []).map((p) => nameKey(p?.name)).filter(Boolean));
    const ids = new Set((plans || []).map((p) => p?.id).filter(Boolean));
    const create = [];
    const making = new Set();
    let existing = 0;
    for (const tier of tiers || []) {
        const name = labelise(tier);
        const key = nameKey(name);
        if (!key) continue;
        if (names.has(key) || ids.has(legacyPlanId(tier))) { existing += 1; continue; }
        if (making.has(key)) continue;
        making.add(key);
        create.push({ tier, name });
    }
    return { create, existing };
}
