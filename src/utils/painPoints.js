// src/utils/painPoints.js
//
// An org's pain points library (`settings.painPoints`) comes in two shapes: the app's default, and any org that has
// never saved the library in Settings, hold a flat list of names; the Settings panel saves categories,
// `[{ cat, items }]`. Every reader takes it through here (state §0.227): the panel read `g.items` of a name and threw
// on its first render, so an org on the default could not open Pain points library at all.

// The category the loose names are drawn under — the deal window's name for a flat list.
export const LOOSE_PAIN_POINTS = 'Pain Points';

// The library as categories. A category keeps its name and the names it holds; every loose name goes in one category,
// `LOOSE_PAIN_POINTS` (joined to a category of that name, in any case, where the list has one). A category with no
// name gives its names to the loose ones. Anything else — a blank name, a number, null — is left out. Fresh arrays
// and objects: the caller may edit them.
export function painPointGroups(list) {
    if (!Array.isArray(list)) return [];
    const groups = [];
    const loose = [];
    const named = (s) => typeof s === 'string' && s.trim() !== '';
    for (const entry of list) {
        if (named(entry)) { loose.push(entry); continue; }
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
        const items = Array.isArray(entry.items) ? entry.items.filter(named) : [];
        if (!named(entry.cat)) { loose.push(...items); continue; }
        groups.push({ ...entry, items });
    }
    if (loose.length) {
        const home = groups.find((g) => g.cat.trim().toLowerCase() === LOOSE_PAIN_POINTS.toLowerCase());
        if (home) home.items.push(...loose);
        else groups.push({ cat: LOOSE_PAIN_POINTS, items: loose });
    }
    return groups;
}

// How many pain points the library holds — the names, never the categories.
export function painPointCount(list) {
    return painPointGroups(list).reduce((n, g) => n + g.items.length, 0);
}
