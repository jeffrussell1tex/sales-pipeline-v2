// tests/account-parent.test.mjs
//
// An account's parent, and the tier that fits it (state §0.198; Jeff, 11 Oct — D3: "No self,
// no loops, no sites"; D21: "Keep what fits", which supersedes the depth reading of D3, D17
// and D18; D18: "Yes, make them 'account'"; D12: an account merged into another is no one's
// to pick; D1: a name typed in full that one account answers saves as it, two refuse).
//
// Before: the account rail's Parent list drew bare names, and a pick took the FIRST account
// of the clicked name — of UKG's two "Shell - Port Allen" under Shell (a business unit and a
// site), whichever the GET sent first, and editing one could make it its own parent; its own
// sub-accounts and sites were offered (a loop), and sites (a fourth level); a move kept the
// old tier, and the accounts under a moved account kept theirs; accounts.mjs stored any
// parent id. Batch 1's first build gave every tier from its depth: a site moved from one
// account to another became a business unit, and a delete's Undo did the same to UKG's
// "Shell - Port Allen" site. Then (area 9): a move tried the body's tier before the stored
// one, so a screen loaded before another session's move re-tiered a site; a delete's Undo
// re-fitted what it put back, so a legacy tier-'account' row came back a unit and a top-level
// unit an account; a move that made an account holding deals a site left the deals on it.
// Then (area 10): the restore mark was honoured from any writer, and a restore took any tier,
// a site as the parent, and a loop closed past PARENT_WALK; a delete and its promotion were two
// writes, and its Undo re-sent the screen's copies of the rows; an untouched Parent field sent
// the parent the rail opened with, which the server read as a move. Then (area 11): an Admin's
// marked PUT on any top-level account, naming no parent, made it a site over its own accounts
// and open deals, and the Undo did the same to a lifted account that had gained one; a delete
// another session's delete had beaten wrote the tiers it had read onto rows moved since; the
// Undo made the Admin who pressed it the owner of an unassigned account. Then (area 12): the
// Undo of a delete whose lifted sub-account was a site moved every deal on that site up to the
// parent, open or closed, its Site Name overwritten; a business unit was put back over a
// business unit added under it since; a restore kept the name of an owner whose id it dropped.
// Then (area 13): the Undo of a lifted account another session had moved since ran as a move,
// over that session's move, D22 moving its deals up; a refused re-save's toast named the parent
// put back, not the account refused; and the screen showed a restored row as the delete had
// answered it, its dropped owner still named, until a reload. (Area 12 also posted a restored
// row's created date back; area 13 took that out: the driver reads it in the process's own time
// zone, so it came back moved by the zone's offset wherever that is not UTC.)
//
// Here: the rule (src/utils/accountParent.js), RUN on UKG's Shell family — who may be a
// parent, the tier a move, a create, a clear and a delete leave (an account KEEPS its tier
// wherever it still fits), the words of a refusal and their order for twins, and
// accounts.mjs's answer (placeAccount) with what it writes and hands back to the screen —
// and the Parent Save through the shared resolver (src/utils/pickLink.js), run; the account
// rail, the accounts hook, accounts.mjs and the quick log pinned to them; the Undo's restore
// (restorePlace), what it re-sends (undoOfDeletes), the accounts a delete re-fits below what it
// lifts (liftedBelow) and the accounts a move makes sites (sitesMade, D22), run. Against a
// database: tests/integration/accounts.itest.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    PARENT_WALK, rankOf, isUnder, heightUnder, parentProblem, parentChoices, tierUnder, branchTiers, promotedTiers, parentRefusal, parentNote,
    typedParentRefusal, parentLeftOut, placeAccount, tierChanges, withTiers, parentsFirst, restorePlace, sitesMade, undoOfDeletes, UNKNOWN_TIER,
    liftedBelow, withRows, movedSinceDelete,
} from '../src/utils/accountParent.js';
import { resolveLink, linkRefusal, unarchived } from '../src/utils/pickLink.js';
import { pickerRows, rankMatches } from '../src/utils/searchMatch.js';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8').replace(/\r\n/g, '\n');
const between = (src, from, to) => { const a = src.indexOf(from); assert.ok(a >= 0, from); const b = src.indexOf(to, a + from.length); assert.ok(b > a, to); return src.slice(a, b); };
const byIdOf = (list) => new Map(list.map((a) => [a.id, a]));
const sorted = (set) => [...set].sort();
const tiersOf = (r) => (r.tiers ? Object.fromEntries([...r.tiers].sort()) : r);

// UKG's Shell family as stored: Shell, and under it two accounts named "Shell - Port Allen" —
// a business unit and a site; a site under the unit; a unit stored under the unit before the
// rule (a misfit: a unit under a unit); an account merged into Shell; and Dow with its unit.
const shell  = { id: 'k', name: 'Shell', accountTier: 'account', parentAccountId: null };
const unit   = { id: 'u', name: 'Shell - Port Allen', accountTier: 'business_unit', parentAccountId: 'k' };
const site   = { id: 's', name: 'Shell - Port Allen', accountTier: 'site', parentAccountId: 'k' };
const tank   = { id: 't', name: 'Port Allen Tank Farm', accountTier: 'site', parentAccountId: 'u' };
const moved  = { id: 'm', name: 'Moved Unit', accountTier: 'business_unit', parentAccountId: 'u' };
const merged = { id: 'x', name: 'Shell Oil', accountTier: 'account', parentAccountId: null, mergeArchived: true, mergedIntoId: 'k' };
const dow    = { id: 'd', name: 'Dow', accountTier: 'account', parentAccountId: null };
const dowBu  = { id: 'db', name: 'Dow Olefins', accountTier: 'business_unit', parentAccountId: 'd' };
const ALL = [shell, unit, site, tank, moved, merged, dow, dowBu];
const BY_ID = byIdOf(ALL);
// UKG's commonest shape (SELECT 11 Oct: 416 sites straight under a top-level account) and a
// tier-'account' row stored under an account before the rule (13 of them in UKG).
const evonik = { id: 'e', name: 'Evonik', accountTier: 'account', parentAccountId: null };
const laf    = { id: 'el', name: 'Evonik - Lafayette', accountTier: 'site', parentAccountId: 'e' };
const mobile = { id: 'em', name: 'Evonik - Mobile', accountTier: 'site', parentAccountId: 'e' };
const legacy = { id: 'lg', name: 'Shell Legacy Co', accountTier: 'account', parentAccountId: 'k' };
const UKG = [...ALL, evonik, laf, mobile, legacy];
const SITE_WORDS = "is a site — a site can't have accounts under it. Pick the account or business unit it belongs to.";
const BELOW = (name) => `“${name}” has accounts under it that would sit below a site — it can't go there.`;

// ── who may be a parent — run ───────────────────────────────────────────────

test('a parent is not the account itself, not one of its own sub-accounts or sites, not a site, not one merged away, not one its own branch would sit below a site under', () => {
    assert.equal(parentProblem(unit, 'u', BY_ID), 'self', 'editing one "Shell - Port Allen": not itself');
    assert.equal(parentProblem(unit, 'k', BY_ID), 'descendant', 'editing Shell: not its own unit (a loop)');
    assert.equal(parentProblem(moved, 'k', BY_ID), 'descendant', 'nor anything further down');
    assert.equal(parentProblem(site, 'db', BY_ID), 'site', "UKG's site twin: a site has no accounts under it");
    assert.equal(parentProblem(merged, 'db', BY_ID), 'archived', 'merged into Shell (D12)');
    assert.equal(parentProblem(unit, 'd', BY_ID), 'below-site', "Dow under Shell's unit would be a site, and Dow's own unit below a site");
    assert.equal(parentProblem(unit, 'db', BY_ID), null, "Dow's unit, a leaf, may: it would be a site");
    assert.equal(parentProblem(moved, null, BY_ID), null, 'a unit stored two levels down is a unit, not a site: tiers rule, not depth (D21)');
    assert.equal(parentProblem(null, 'd', BY_ID), 'missing');
    assert.equal(parentProblem(shell, 'd', BY_ID), null);
    assert.equal(parentProblem(unit, null, BY_ID), null, 'a new account has no sub-accounts');
    // one reason each, in a fixed order: self, descendant, site, merged away, too deep
    assert.equal(parentProblem(site, 's', BY_ID), 'self', 'itself before a site');
    assert.equal(parentProblem(tank, 'k', BY_ID), 'descendant', 'its own site: one under it before a site');
    assert.equal(parentProblem({ ...site, mergeArchived: true }, 'db', BY_ID), 'site', 'a site merged away: a site before merged away');
    assert.equal(parentProblem({ ...dowBu, mergeArchived: true }, 'u', BY_ID), 'archived', 'merged away before too deep');
    assert.equal(parentProblem(shell, 'd', BY_ID, 3), 'below-site', 'the height handed in is the one used');
    assert.equal(isUnder('t', 'k', BY_ID), true);
    assert.equal(isUnder('k', 't', BY_ID), false);
    assert.equal(heightUnder('k', BY_ID), 2, 'Shell: its unit, and the unit\'s site and unit');
    assert.equal(heightUnder('u', BY_ID), 1);
    assert.equal(heightUnder('t', BY_ID), 0);
    assert.equal(heightUnder(null, BY_ID), 0, 'a new account');
    assert.equal(heightUnder('k', undefined), 0);
    assert.deepEqual(['account', 'business_unit', 'site', 'region', null, undefined].map(rankOf), [0, 1, 2, null, null, null]);
});

test("UKG's two \"Shell - Port Allen\": the Parent list offers the unit, never the site — never either to itself, nor Shell's own to Shell — and never a parent its own branch is too deep for", () => {
    assert.deepEqual(sorted(parentChoices(ALL, null, BY_ID)), ['d', 'db', 'k', 'm', 'u'], 'a new account: every account but the site and the one merged away');
    assert.deepEqual(sorted(parentChoices(ALL, 'd', BY_ID)), ['k'], 'Dow, with a unit under it: only an account — under a unit its unit would sit below a site');
    assert.deepEqual(sorted(parentChoices(ALL, 'u', BY_ID)), ['d', 'k'], 'the unit, with a site under it: not itself, not what stands under it, not a unit');
    assert.deepEqual(sorted(parentChoices(ALL, 'k', BY_ID)), [], 'Shell, two levels under it: nowhere but the top');
    assert.deepEqual(sorted(parentChoices(ALL, 's', BY_ID)), ['d', 'db', 'k', 'm', 'u'], 'the site twin, a leaf: any account or unit, its unit twin among them');
    assert.deepEqual(sorted(parentChoices(undefined, null, BY_ID)), []);
    // the list as AccountPicker draws it, with the rule as its filterFn: "shell" typed while editing the unit
    const keep = (a) => parentChoices(ALL, 'u', BY_ID).has(a.id);
    const rows = pickerRows(ALL.filter((a) => !a.mergeArchived), 'shell - port allen', { keep, viaParents: false });
    assert.deepEqual(rows.shown, [], 'neither twin is offered to the unit');
    assert.ok(rows.unlisted === unit || rows.unlisted === site, 'so the list says why one is left out');
});

// ── the tier: keep what fits — run ──────────────────────────────────────────

test('a new account under a parent asks for no tier: the lowest rank above its parent — none an account, an account a business unit, a unit a site', () => {
    assert.equal(tierUnder(null, BY_ID), 'account');
    assert.equal(tierUnder('', BY_ID), 'account');
    assert.equal(tierUnder('k', BY_ID), 'business_unit');
    assert.equal(tierUnder('d', BY_ID), 'business_unit');
    assert.equal(tierUnder('u', BY_ID), 'site');
    assert.equal(tierUnder('m', BY_ID), 'site', 'a unit stored two levels down is a unit: a site under it');
    assert.equal(tierUnder('lg', byIdOf(UKG)), 'business_unit', 'a tier-account row under an account is an account: a unit under it');
    assert.equal(tierUnder('not_listed', BY_ID), 'business_unit', 'a parent the list does not hold reads as an account — accounts.mjs reads it from the org');
    assert.equal(tierUnder('s', BY_ID), 'site', 'never deeper than a site (the list never offers one)');
});

test('D21: a move keeps every tier that still fits — a site moved from one account to another stays a site; an account moved under an account becomes a business unit, its sites staying sites', () => {
    const U = byIdOf(UKG);
    assert.deepEqual(tiersOf(branchTiers(UKG, 's', 'd')), { s: 'site' }, "UKG's site twin moved from Shell to Dow: a site");
    assert.deepEqual(tiersOf(branchTiers(UKG, 'el', 'k')), { el: 'site' }, 'a site moved between accounts: a site');
    assert.deepEqual(tiersOf(branchTiers(UKG, 'e', 'k')), { e: 'business_unit', el: 'site', em: 'site' }, 'Evonik under Shell: a business unit, and its two sites still sites');
    assert.deepEqual(tiersOf(branchTiers(UKG, 'd', 'k')), { d: 'business_unit', db: 'site' }, "Dow under Shell: a unit, and Dow's unit, which no longer fits, a site");
    assert.deepEqual(tiersOf(branchTiers(UKG, 'u', 'd')), { m: 'site', t: 'site', u: 'business_unit' }, 'the unit under Dow: still a unit, its site a site, the misfit unit under it a site');
    assert.deepEqual(tiersOf(branchTiers(UKG, 's', 'u')), { s: 'site' }, 'the site twin under its unit twin');
    assert.deepEqual(tiersOf(branchTiers(UKG, 'db', 'k')), { db: 'business_unit' }, "Dow's unit under Shell: its stored tier fits");
    assert.deepEqual(tiersOf(branchTiers(UKG, 'db', 'k', 'site')), { db: 'business_unit' }, 'the stored tier first, where it fits — the body\'s other tier is not taken');
    assert.deepEqual(tiersOf(branchTiers(UKG, 's', 'd', 'business_unit')), { s: 'site' }, "UKG's site moved by a screen loaded when it was a unit: still a site — a stale body cannot re-tier it");
    assert.deepEqual(tiersOf(branchTiers(UKG, 'lg', 'd', 'site')), { lg: 'site' }, 'a stored tier that no longer fits gives way to the tier the write asks for, where that fits');
    assert.deepEqual(tiersOf(branchTiers(UKG, 'db', 'u', 'business_unit')), { db: 'site' }, 'asked for a unit under a unit: does not fit, nor does its stored unit — the lowest above, a site');
    assert.deepEqual(tiersOf(branchTiers(UKG, 'e', 'k', 'site')), { e: 'business_unit', el: 'site', em: 'site' }, "a site asked for an account with sites under it: no room below — its own branch decides");
    assert.deepEqual(tiersOf(branchTiers(UKG, 'lg', 'd')), { lg: 'business_unit' }, 'a tier-account row stored under an account, moved: re-fitted as a unit');
    assert.deepEqual(tiersOf(branchTiers(UKG, 'brand_new', 'k')), { brand_new: 'business_unit' }, 'an account not saved yet: only itself, the lowest above');
    assert.equal(U.get('lg').accountTier, 'account', 'untouched, the legacy row keeps its tier');
});

test('D21: a cleared parent makes an account, and what stands under it keeps its tier; a business unit with sites moved under a business unit is refused — the sites would sit below a site', () => {
    assert.deepEqual(tiersOf(branchTiers(ALL, 'u', null)), { m: 'business_unit', t: 'site', u: 'account' }, 'the unit lifted to the top: an account, its site still a site, its unit still a unit');
    assert.deepEqual(tiersOf(branchTiers(ALL, 'db', null)), { db: 'account' }, 'a cleared parent: an account (D3)');
    assert.deepEqual(tiersOf(branchTiers(ALL, 's', null, 'site')), { s: 'account' }, 'the top level is always an account, whatever is asked');
    assert.deepEqual(tiersOf(branchTiers(ALL, 'k', null)), { k: 'account', m: 'site', s: 'site', t: 'site', u: 'business_unit' }, 'Shell left at the top: the site twin still a site; only the misfit unit under a unit re-fitted');
    assert.deepEqual(branchTiers(ALL, 'u', 'db'), { problem: 'below-site', names: ['Port Allen Tank Farm', 'Moved Unit'] }, "the unit, with a site under it, under Dow's unit: refused, naming what would sit below a site");
    assert.deepEqual(branchTiers(ALL, 'k', 'd'), { problem: 'below-site', names: ['Port Allen Tank Farm', 'Moved Unit'] }, 'Shell under Dow: its unit a unit at best, and what stands under it below a site');
    assert.equal(parentRefusal('below-site', 'Dow', 'Shell'), BELOW('Shell'));
    assert.equal(parentRefusal('below-site', 'Dow', ''), "This account has accounts under it that would sit below a site — it can't go there.");
    const deep = Array.from({ length: 5 }, (_, i) => ({ id: `v${i}`, name: `Level ${i}`, accountTier: ['account', 'business_unit', 'site', 'site', 'site'][i], parentAccountId: i ? `v${i - 1}` : null }));
    assert.deepEqual(tiersOf(branchTiers(deep, 'v2', null)), { v2: 'account', v3: 'business_unit', v4: 'site' }, 'lifted, they fit — and a site with an account under it (stored before the rule) is re-fitted as a unit: nothing sits under a site');
    assert.deepEqual(branchTiers(deep, 'v1', null), { problem: 'below-site', names: ['Level 4'] }, 'a chain stored five deep, lifted from the second: still a level too many');
    const loop = [{ id: 'a', name: 'A', parentAccountId: 'b' }, { id: 'b', name: 'B', parentAccountId: 'a' }];
    assert.deepEqual(tiersOf(branchTiers(loop, 'a', null)), { a: 'account', b: 'business_unit' }, 'a loop already in the data ends the walk');
});

test('a chain is followed PARENT_WALK accounts up at most, and a loop already in the data ends every walk', () => {
    const l1 = { id: 'l1', name: 'Loop One', accountTier: 'business_unit', parentAccountId: 'l2' };
    const l2 = { id: 'l2', name: 'Loop Two', accountTier: 'business_unit', parentAccountId: 'l1' };
    const own = { id: 'me', name: 'Own Parent', accountTier: 'business_unit', parentAccountId: 'me' };
    const loop = byIdOf([l1, l2, own]);
    assert.equal(isUnder('l1', 'nobody', loop), false);
    assert.equal(isUnder('l1', 'l2', loop), true);
    assert.equal(heightUnder('l1', loop), 1, 'down the loop once');
    assert.equal(heightUnder('me', loop), 0);
    assert.equal(parentProblem(l1, null, loop), null, 'a unit in a loop is a unit: a new account may be a site under it');
    assert.equal(parentProblem(l1, 'l2', loop), 'descendant');
    assert.deepEqual(sorted(parentChoices([l1, l2, own], 'l1', loop)), [], 'its loop-mate is under it; the others are units, too deep for its own');
    const chain = Array.from({ length: 20 }, (_, i) => ({ id: `c${i}`, name: `Chain ${i}`, accountTier: 'business_unit', parentAccountId: i ? `c${i - 1}` : null }));
    assert.equal(PARENT_WALK, 16);
    assert.equal(isUnder('c19', 'c0', byIdOf(chain)), false, 'cut, not followed to the top');
    assert.equal(isUnder('c5', 'c0', byIdOf(chain)), true);
});

// ── D18: a delete lifts its sub-accounts to the top — run ───────────────────

test("D18: a deleted account's sub-accounts become accounts, and the accounts under them keep what fits; the Undo puts each back exactly as stored (restorePlace)", () => {
    assert.deepEqual(Object.fromEntries([...promotedTiers(ALL, 'k')].sort()), { m: 'business_unit', s: 'account', t: 'site', u: 'account' }, "Shell deleted: both twins accounts; the unit's site and unit keep their tiers");
    assert.deepEqual(Object.fromEntries([...promotedTiers(ALL, 'u')].sort()), { m: 'account', t: 'account' });
    assert.deepEqual([...promotedTiers(ALL, 'd')], [['db', 'account']]);
    assert.deepEqual([...promotedTiers(UKG, 'e')].sort(), [['el', 'account'], ['em', 'account']], 'a site lifted to the top is an account (D18)');
    assert.deepEqual([...promotedTiers(ALL, 't')], [], 'nothing under it: nothing lifted');
    assert.deepEqual([...promotedTiers(ALL, '')], []);
    // a fourth and fifth level stored before this rule: a delete is never refused, so the deepest is a site
    const deep = Array.from({ length: 6 }, (_, i) => ({ id: `v${i}`, name: `Level ${i}`, accountTier: 'business_unit', parentAccountId: i ? `v${i - 1}` : null }));
    assert.deepEqual(Object.fromEntries(promotedTiers(deep, 'v0')), { v1: 'account', v2: 'business_unit', v3: 'site', v4: 'site', v5: 'site' });
    const loop = [{ id: 'a', name: 'A', parentAccountId: 'b' }, { id: 'b', name: 'B', parentAccountId: 'a' }, { id: 'c', name: 'C', parentAccountId: 'b' }];
    assert.deepEqual(Object.fromEntries([...promotedTiers(loop, 'a')].sort()), { b: 'account', c: 'business_unit' }, 'the deleted account is not lifted, even where a loop leads back to it');
    // a lifted account moved back under Shell by hand (no restore): the tier it asks for where its
    // stored 'account' no longer fits, and what stands under it re-fitted
    const lifted = ALL.map((a) => (a.parentAccountId === 'k' ? { ...a, parentAccountId: null, accountTier: 'account' } : a));
    assert.deepEqual(tiersOf(branchTiers(lifted, 'u', 'k', 'business_unit')), { m: 'site', t: 'site', u: 'business_unit' }, 'the unit a unit again; its site a site; the misfit unit under it re-fitted as a site');
    assert.deepEqual(tiersOf(branchTiers(lifted, 's', 'k', 'site')), { s: 'site' }, "UKG's site twin back under Shell, asking for 'site': a site");
    assert.deepEqual(tiersOf(branchTiers(lifted, 's', 'k')), { s: 'business_unit' }, 'asked for nothing, a lifted account takes the lowest above');
    // the Undo itself: each lifted account put back as stored, exactly — nothing under it re-fitted
    const back = [...lifted, shell];
    assert.deepEqual(restorePlace(back, { selfId: 'u', selfName: 'Shell - Port Allen', parentId: 'k', tier: 'business_unit' }), { status: 400, error: "“Shell - Port Allen” has an account under it that can't stand under a business unit — it can't be put back as one." }, 'the misfit unit stored under it before the rule ranks no higher: nothing is put back over it (K2; none in today\'s data — SELECT 12 Oct)');
    assert.deepEqual([...restorePlace(back.filter((a) => a.id !== 'm'), { selfId: 'u', selfName: 'Shell - Port Allen', parentId: 'k', tier: 'business_unit' }).tiers], [['u', 'business_unit']], 'over its site alone: a business unit again, as stored');
    assert.deepEqual([...restorePlace(back, { selfId: 's', selfName: 'Shell - Port Allen', parentId: 'k', tier: 'site' }).tiers], [['s', 'site']], "UKG's site twin a site again");
    assert.deepEqual([...restorePlace([...UKG.filter((a) => a.id !== 'k'), shell], { selfId: 'lg', selfName: 'Shell Legacy Co', parentId: 'k', tier: 'account' }).tiers], [['lg', 'account']], "one of UKG's 13 tier-'account' rows under an account: an account again — the fit would make it a unit");
});

test("J3: a delete re-fits below what it lifts only a row stored before the rule — each with the chain it stands on, up to the deleted account, which the write holds it to (liftedBelow)", () => {
    assert.deepEqual(liftedBelow(ALL, 'k'), [], "Shell deleted: the unit's site and the unit under it still fit under the lifted unit — nothing below is written");
    assert.deepEqual(liftedBelow(UKG, 'e'), [], 'a site lifted: nothing under it');
    assert.deepEqual(liftedBelow(ALL, 't'), []);
    // the mechanics critic's shape (12 Oct): P, C (an account under it, stored before the rule), G (an account under C)
    const p = { id: 'p', name: 'P', accountTier: 'account', parentAccountId: null };
    const c = { id: 'c', name: 'C', accountTier: 'account', parentAccountId: 'p' };
    const g = { id: 'g', name: 'G', accountTier: 'account', parentAccountId: 'c' };
    const h = { id: 'h', name: 'H', accountTier: 'site', parentAccountId: 'g' };
    assert.deepEqual(liftedBelow([p, c, g, h], 'p'), [{ id: 'g', accountTier: 'business_unit', chain: ['c', 'p'] }], "C lifted, an account already: written by the lift itself; G no longer fits under it — a unit, while it stands under C under P; H's site still fits");
    const h2 = { ...h, accountTier: 'account' };
    assert.deepEqual(liftedBelow([p, c, g, h2], 'p'), [
        { id: 'g', accountTier: 'business_unit', chain: ['c', 'p'] },
        { id: 'h', accountTier: 'site', chain: ['g', 'c', 'p'] },
    ], 'a level further: its chain names each account up to the one deleted');
    assert.deepEqual(liftedBelow([h2, g, c, p], 'p').map((b) => b.id), ['g', 'h'], 'the walk order, whatever order the list holds them in');
    assert.deepEqual(liftedBelow([p, c, g, h], 'c'), [], 'C deleted: G lifted, an account already; H, a site under an account, still fits');
    assert.deepEqual(liftedBelow([p, c, g, h2], 'c'), [{ id: 'h', accountTier: 'business_unit', chain: ['g', 'c'] }], 'an account under the lifted G: a unit, held to G under C');
    const loop = [{ id: 'a', name: 'A', accountTier: 'account', parentAccountId: 'b' }, { id: 'b', name: 'B', accountTier: 'account', parentAccountId: 'a' }, { id: 'x', name: 'X', accountTier: 'account', parentAccountId: 'b' }];
    assert.deepEqual(liftedBelow(loop, 'a'), [{ id: 'x', accountTier: 'business_unit', chain: ['b', 'a'] }], 'a loop already in the data: the deleted account is not lifted, and the chain ends at it');
    assert.deepEqual(liftedBelow(undefined, 'p'), []);
    assert.deepEqual(liftedBelow([p, c, g], ''), []);
});

// ── the words — run ─────────────────────────────────────────────────────────

test('what the rail and the server say of a refused parent', () => {
    assert.equal(parentRefusal('missing', 'X'), 'Parent account not found.');
    assert.equal(parentRefusal('self', 'Shell - Port Allen'), "An account can't be its own parent.");
    assert.equal(parentRefusal('archived', 'Shell Oil'), '“Shell Oil” was merged into another account — pick the account it was merged into.');
    assert.equal(parentRefusal('descendant', 'Shell - Port Allen', 'Shell'), "“Shell - Port Allen” is under “Shell” — an account can't be moved under one of its own sub-accounts or sites.");
    assert.equal(parentRefusal('descendant', 'Shell - Port Allen', ''), "“Shell - Port Allen” is under this account — an account can't be moved under one of its own sub-accounts or sites.");
    assert.equal(parentRefusal('site', 'Shell - Port Allen'), `“Shell - Port Allen” ${SITE_WORDS}`);
    assert.equal(parentRefusal('site', ''), `That account ${SITE_WORDS}`);
    assert.equal(parentRefusal('below-site', 'Dow Olefins', 'Dow'), BELOW('Dow'));
    assert.equal(parentRefusal(null, 'Shell'), null);
});

test("the chip names a parent's own parent in the account picker's words", () => {
    assert.equal(parentNote(unit, BY_ID), ' · unit of Shell');
    assert.equal(parentNote(site, BY_ID), ' · site of Shell');
    assert.equal(parentNote({ id: 'q', name: 'Q', accountTier: 'account', parentAccountId: 'k' }, BY_ID), ' · in Shell');
    assert.equal(parentNote(shell, BY_ID), '');
    assert.equal(parentNote({ ...unit, parentAccountId: 'another_reps_account' }, BY_ID), '', 'a parent outside the list: no label');
    assert.equal(parentNote(null, BY_ID), '');
});

// ── the Parent field's Save — run ───────────────────────────────────────────

test("the Parent field's Save (D1): UKG's twins typed in full take the unit — the site is no parent; the row picked; a clear; a field nobody touched; a name only an account it may not stand under has is refused by its reason", () => {
    const eligibleFor = (selfId, list = ALL) => { const ok = parentChoices(list, selfId, byIdOf(list)); return (a) => ok.has(a.id); };
    const ask = (o) => resolveLink({ records: ALL, heldId: '', storedId: '', seededText: '', ...o });
    assert.deepEqual(ask({ text: 'shell port allen', eligible: eligibleFor('db') }), { how: 'typed', id: 'u', record: unit }, 'typed, not picked: the one account it may stand under');
    assert.deepEqual(ask({ text: 'shell port allen', eligible: eligibleFor(null) }), { how: 'typed', id: 'u', record: unit }, 'a new account the same');
    assert.equal(ask({ text: 'Shell - Port Allen', heldId: 'u', eligible: eligibleFor('db') }).id, 'u', 'picked: the row clicked');
    assert.deepEqual(ask({ text: '', storedId: 'k', heldId: 'k', seededText: 'Shell', eligible: eligibleFor('d') }), { how: 'empty', id: '', record: null }, 'cleared');
    assert.deepEqual(ask({ records: [dow], text: '', heldId: 'k', storedId: 'k', eligible: eligibleFor('d') }), { how: 'untouched', id: 'k', record: null }, "untouched: a parent outside a rep's list is kept (the chip it seeded)");
    assert.equal(ask({ text: 'Shell Oil', heldId: 'x', storedId: 'x', seededText: 'Shell Oil', eligible: eligibleFor('d') }).id, 'x', 'untouched: a parent merged away since is kept (D12)');
    const unit2 = { id: 'u2', name: 'Shell Port Allen', accountTier: 'business_unit', parentAccountId: 'd' };
    const two = [...ALL, unit2];
    assert.equal(ask({ records: two, text: 'Shell - Port Allen', eligible: eligibleFor(null, two) }).refusal, 'many', 'two it may stand under: pick one from the list');
    // editing the unit: neither twin — the unit is itself, the site a site
    const self = ask({ text: 'Shell - Port Allen', eligible: eligibleFor('u') });
    assert.equal(self.refusal, 'ineligible');
    assert.deepEqual(self.matches.map((a) => a.id), ['u', 's'], 'in the list order');
    const why = () => typedParentRefusal('Shell - Port Allen', ALL, 'u', BY_ID, 'Shell - Port Allen');
    assert.equal(linkRefusal(self, { why }), "An account can't be its own parent.", 'itself, the first reason');
    assert.equal(typedParentRefusal('port allen tank farm', ALL, null, BY_ID, 'New Co'), `“Port Allen Tank Farm” ${SITE_WORDS}`);
    assert.equal(typedParentRefusal('moved unit', ALL, 'k', BY_ID, 'Shell'), "“Moved Unit” is under “Shell” — an account can't be moved under one of its own sub-accounts or sites.");
    assert.equal(typedParentRefusal('dow olefins', ALL, 'u', BY_ID, 'Shell - Port Allen'), BELOW('Shell - Port Allen'), "a unit, with its site, under Dow's unit: too deep");
    assert.equal(typedParentRefusal('Chevron', ALL, null, BY_ID, 'New Co'), null, 'no account of the name: the shared words');
    assert.equal(typedParentRefusal('shell', ALL, 'd', BY_ID, 'Dow'), null, 'one it may stand under: no refusal');
    assert.equal(typedParentRefusal('Shell Oil', ALL, 'd', BY_ID, 'Dow'), null, 'merged away: not this rule\'s — the shared words name the account it was merged into');
    assert.equal(linkRefusal(ask({ text: 'Shell Oil', eligible: eligibleFor('d') })), '“Shell Oil” was merged into “Shell” — pick “Shell”.');
    assert.equal(typedParentRefusal(' - ', ALL, null, BY_ID, 'New Co'), null);
});

test('the reason for a name twins share is the same in either list order — self, then one under it, then a site, then merged away, then too deep — at the Save and on the list (F8)', () => {
    for (const rows of [ALL, [...ALL].reverse(), [shell, site, unit, tank, moved, dow, dowBu]]) {
        const byId = byIdOf(rows);
        assert.equal(typedParentRefusal('Shell - Port Allen', rows, 'u', byId, 'Shell - Port Allen'), "An account can't be its own parent.", 'editing the unit: itself, before the site twin');
        assert.equal(typedParentRefusal('Shell - Port Allen', rows, 's', byId, 'Shell - Port Allen'), null, 'editing the site: the unit twin takes it');
        assert.equal(typedParentRefusal('Shell - Port Allen', rows, 'd', byId, 'Dow'), `“Shell - Port Allen” ${SITE_WORDS}`, 'editing Dow: the site before the unit that is too deep for Dow');
        assert.equal(typedParentRefusal('Shell - Port Allen', rows, 'k', byId, 'Shell'), "“Shell - Port Allen” is under “Shell” — an account can't be moved under one of its own sub-accounts or sites.", 'editing Shell: one under it, before a site');
        for (const first of [unit, site]) {
            assert.equal(parentLeftOut(first, rows, 'u', byId, 'Shell - Port Allen'), "An account can't be its own parent.", `the list's line, handed the ${first.accountTier} twin`);
            assert.equal(parentLeftOut(first, rows, 'd', byId, 'Dow'), `“Shell - Port Allen” ${SITE_WORDS}`);
        }
    }
    assert.equal(parentLeftOut(tank, ALL, null, BY_ID, 'New Co'), `“Port Allen Tank Farm” ${SITE_WORDS}`, 'one account of the name: its reason');
    assert.equal(parentLeftOut(null, ALL, null, BY_ID, 'New Co'), 'Parent account not found.');
});

// ── where a write puts an account: accounts.mjs's answer — run ──────────────

test("accounts.mjs's answer (placeAccount), on the org's own rows: the parent checked, then the tier — a create's the body's where it fits, a move's its stored where it fits, else the body's, the whole branch re-fitted (D3, D21); UKG's twins in both list orders", () => {
    const tiers = (r) => (r.tiers ? Object.fromEntries([...r.tiers].sort()) : r);
    for (const rows of [UKG, [...UKG].reverse()]) {
        const place = (o, list = rows) => placeAccount(list, o);
        // a create: the tier the body asks for where it fits, else the lowest above the parent; with no parent nothing is read
        assert.deepEqual(tiers(place({ selfId: 'new', selfName: 'New Co', parentId: 'k' })), { new: 'business_unit' });
        assert.deepEqual(tiers(place({ selfId: 'new', selfName: 'New Co', parentId: 'k', tier: 'site' })), { new: 'site' }, 'a site straight under an account, as 416 of UKG\'s stand: kept');
        assert.deepEqual(tiers(place({ selfId: 'new', selfName: 'New Co', parentId: 'k', tier: 'account' })), { new: 'business_unit' }, 'an account asked under an account: does not fit');
        assert.deepEqual(tiers(place({ selfId: 'new', selfName: 'New Co', parentId: 'u' })), { new: 'site' }, "under UKG's unit twin: a site");
        assert.deepEqual(tiers(place({ selfId: 'new', selfName: 'New Co', parentId: 'u', tier: 'business_unit' })), { new: 'site' });
        assert.deepEqual(tiers(place({ selfId: 'new', selfName: 'New Co', parentId: null }, [])), { new: 'account' }, 'no parent: an account');
        assert.deepEqual(tiers(place({ selfId: 'new', selfName: 'New Co', parentId: '', tier: 'business_unit' }, [])), { new: 'account' }, 'the top level is always an account');
        assert.deepEqual(place({ selfId: 'new', selfName: 'New Co', parentId: 's' }), { status: 400, error: `“Shell - Port Allen” ${SITE_WORDS}` }, "UKG's site twin is no parent");
        assert.deepEqual(place({ selfId: 'new', selfName: 'New Co', parentId: 'x' }), { status: 400, error: '“Shell Oil” was merged into another account — pick the account it was merged into.' });
        assert.deepEqual(place({ selfId: 'new', selfName: 'New Co', parentId: 'acc_of_another_org' }), { status: 404, error: 'Parent account not found.' }, "another org's id is not in this org's rows: the answer a missing one gets, so nothing leaks");
        // a move: the account and everything under it
        assert.deepEqual(tiers(place({ selfId: 's', selfName: 'Shell - Port Allen', parentId: 'd', branch: true })), { s: 'site' }, "UKG's site moved from Shell to Dow: a site");
        assert.deepEqual(tiers(place({ selfId: 's', selfName: 'Shell - Port Allen', parentId: 'd', branch: true, tier: 'business_unit' })), { s: 'site' }, "a stale body's tier: the stored site fits, and stays");
        assert.deepEqual(tiers(place({ selfId: 'lg', selfName: 'Shell Legacy Co', parentId: 'd', branch: true, tier: 'site' })), { lg: 'site' }, "the body's tier where the stored one no longer fits");
        assert.deepEqual(tiers(place({ selfId: 'e', selfName: 'Evonik', parentId: 'k', branch: true })), { e: 'business_unit', el: 'site', em: 'site' }, 'an account under an account: a unit, its sites still sites');
        assert.deepEqual(tiers(place({ selfId: 'd', selfName: 'Dow', parentId: 'k', branch: true, tier: 'account' })), { d: 'business_unit', db: 'site' }, "Dow under Shell: a unit, and Dow's unit a site");
        assert.deepEqual(tiers(place({ selfId: 'u', selfName: 'Shell - Port Allen', parentId: null, branch: true, tier: 'business_unit' })), { m: 'business_unit', t: 'site', u: 'account' }, 'a cleared parent: an account, what stands under it as it was');
        assert.deepEqual(place({ selfId: 'u', selfName: 'Shell - Port Allen', parentId: 'u', branch: true }), { status: 400, error: "An account can't be its own parent." });
        assert.deepEqual(place({ selfId: 'k', selfName: 'Shell', parentId: 't', branch: true }), { status: 400, error: "“Port Allen Tank Farm” is under “Shell” — an account can't be moved under one of its own sub-accounts or sites." }, 'no loop');
        assert.deepEqual(place({ selfId: 'k', selfName: 'Shell', parentId: 'd', branch: true }), { status: 400, error: BELOW('Shell') }, 'never a fourth level');
        assert.deepEqual(place({ selfId: 'u', selfName: 'Shell - Port Allen', parentId: 'db', branch: true }), { status: 400, error: BELOW('Shell - Port Allen') }, 'a unit with a site under it, under a unit: refused');
        assert.deepEqual(tiers(place({ selfId: 's', selfName: 'Shell - Port Allen', parentId: 'u', branch: true })), { s: 'site' }, 'the site twin under its unit twin');
        assert.deepEqual(tiers(place({ selfId: 'lg', selfName: 'Shell Legacy Co', parentId: 'd', branch: true, tier: 'account' })), { lg: 'business_unit' }, 'a tier-account row under an account, moved: re-fitted');
    }
    // a create is never a branch: a row already naming the new id as its parent is under it (no parent of it), and is not re-tiered
    const dangling = [...ALL, { id: 'orphan', name: 'Orphan', accountTier: 'site', parentAccountId: 'new' }];
    assert.deepEqual(placeAccount(dangling, { selfId: 'new', selfName: 'New Co', parentId: 'orphan' }).status, 400, 'its own sub-account: a loop');
    assert.deepEqual([...placeAccount(dangling, { selfId: 'new', selfName: 'New Co', parentId: 'u' }).tiers], [['new', 'site']], 'its dangling row is no branch of a create');
    // a loop already in the data: the walk ends, and the answer comes
    const loop = [{ id: 'l1', name: 'Loop One', accountTier: 'business_unit', parentAccountId: 'l2' }, { id: 'l2', name: 'Loop Two', accountTier: 'business_unit', parentAccountId: 'l1' }];
    assert.deepEqual([...placeAccount(loop, { selfId: 'new', parentId: 'l1' }).tiers], [['new', 'site']], 'under a unit in a loop: a site');
    assert.deepEqual(placeAccount(loop, { selfId: 'l1', selfName: 'Loop One', parentId: null, branch: true }).tiers.get('l2'), 'business_unit');
    assert.deepEqual(placeAccount(undefined, { selfId: 'new', parentId: 'k' }), { status: 404, error: 'Parent account not found.' });
    // a chain stored five deep, its second level's parent cleared: no parent to check, and still refused — there is no room
    const deep = Array.from({ length: 5 }, (_, i) => ({ id: `v${i}`, name: `Level ${i}`, accountTier: ['account', 'business_unit', 'site', 'site', 'site'][i], parentAccountId: i ? `v${i - 1}` : null }));
    assert.deepEqual(placeAccount(deep, { selfId: 'v1', selfName: 'Level 1', parentId: null, branch: true }), { status: 400, error: BELOW('Level 1') });
});

test('what accounts.mjs writes after a move or a delete — only the tiers that change — and the screen takes back', () => {
    const moved = placeAccount(ALL, { selfId: 'd', selfName: 'Dow', parentId: 'k', branch: true });
    assert.deepEqual(tierChanges(ALL, moved.tiers, 'd'), [{ id: 'db', accountTier: 'site' }], 'Dow itself is written with its own row');
    const cleared = placeAccount(ALL, { selfId: 'u', parentId: null, branch: true });
    assert.deepEqual(tierChanges(ALL, cleared.tiers, 'u'), [], 'a cleared parent: nothing under it changes');
    const twinMoved = placeAccount(UKG, { selfId: 's', parentId: 'd', branch: true, tier: 'site' });
    assert.deepEqual(tierChanges(UKG, twinMoved.tiers, 's'), [], 'a site moved between accounts: nothing re-tiered');
    assert.equal(twinMoved.tiers.get('s'), 'site');
    assert.deepEqual(tierChanges(ALL, promotedTiers(ALL, 'k')), [
        { id: 'u', accountTier: 'account' }, { id: 's', accountTier: 'account' },
    ], 'Shell deleted (D18): both twins accounts; what stands under the unit keeps its tier');
    assert.deepEqual(tierChanges(ALL, null), []);
    assert.deepEqual(tierChanges(ALL, new Map()), []);
    assert.deepEqual(tierChanges(undefined, moved.tiers), []);
    // the screen
    const after = withTiers(ALL, [{ id: 'db', accountTier: 'site' }]);
    assert.deepEqual(after.find((a) => a.id === 'db'), { ...dowBu, accountTier: 'site' });
    assert.equal(after.find((a) => a.id === 'd'), dow, 'every other row as it was');
    assert.equal(withTiers(ALL, []), ALL, 'no answer: the same list');
    assert.equal(withTiers(ALL, undefined), ALL);
    assert.deepEqual(withTiers(ALL, [{ id: 'nobody', accountTier: 'site' }, { id: 'k' }, null]), ALL, 'an answer naming no row of the list, or no tier, changes nothing');
    assert.deepEqual(withTiers(undefined, [{ id: 'k', accountTier: 'site' }]), []);
});

test("D18's Undo as the server answers it: a create keeps the tier it asks for where it fits; the Undo's restore puts back the parent and tier EXACTLY as stored — legacy shapes included — checked only for the tier, the org, a site and loops (D21: \"Undo puts the stored tiers back\")", () => {
    // Shell deleted: its two lifted to the top, with the tiers the delete wrote
    const gone = ALL.filter((a) => a.id !== 'k').map((a) => (a.parentAccountId === 'k' ? { ...a, parentAccountId: null } : a));
    const lifted = withTiers(gone, tierChanges(ALL, promotedTiers(ALL, 'k')));
    assert.deepEqual(lifted.filter((a) => ['u', 's', 't', 'm'].includes(a.id)).map((a) => [a.id, a.accountTier]), [['u', 'account'], ['s', 'account'], ['t', 'site'], ['m', 'business_unit']]);
    assert.deepEqual([...placeAccount(lifted, { selfId: 'k', selfName: 'Shell', parentId: null, tier: 'account' }).tiers], [['k', 'account']], 'Shell posted back: an account');
    const restored = [...lifted, shell];
    const unitBack = placeAccount(restored, { selfId: 'u', selfName: 'Shell - Port Allen', parentId: 'k', branch: true, tier: unit.accountTier });
    assert.equal(unitBack.tiers.get('u'), 'business_unit', 'the unit under Shell again: a unit');
    assert.deepEqual(tierChanges(restored, unitBack.tiers, 'u'), [{ id: 'm', accountTier: 'site' }], 'its site never moved; the misfit unit under it is re-fitted');
    const siteBack = placeAccount(restored, { selfId: 's', selfName: 'Shell - Port Allen', parentId: 'k', branch: true, tier: site.accountTier });
    assert.deepEqual([...siteBack.tiers], [['s', 'site']], "UKG's site twin back under Shell: a site again, not a unit (D21)");
    // the site itself deleted, straight under Shell, and Undo posting its stored row back
    assert.deepEqual([...placeAccount(ALL.filter((a) => a.id !== 's'), { selfId: 's', selfName: 'Shell - Port Allen', parentId: 'k', tier: 'site' }).tiers], [['s', 'site']], "Undo of deleting UKG's site under Shell: tier 'site'");
    assert.deepEqual([...placeAccount([], { selfId: 'bu', selfName: 'Top Unit', parentId: null, tier: 'business_unit' }).tiers], [['bu', 'account']], 'a business unit asked for at the top by a create: an account — the top level is always one');
    // the restore (a delete's Undo): as stored — Accelerep Test's two business units at the top, UKG's 13 tier-'account' rows under an account
    assert.deepEqual([...restorePlace([], { selfId: 'bu', selfName: 'Top Unit', parentId: null, tier: 'business_unit' }).tiers], [['bu', 'business_unit']], 'a business unit stored at the top, put back: a business unit');
    assert.deepEqual([...restorePlace(UKG, { selfId: 'lg2', selfName: 'Shell Legacy Two', parentId: 'k', tier: 'account' }).tiers], [['lg2', 'account']], 'a tier-account row under an account, put back: an account');
    assert.deepEqual(restorePlace(ALL, { selfId: 'q', selfName: 'Quay', parentId: 's', tier: 'site' }), { status: 400, error: `“Shell - Port Allen” ${SITE_WORDS}` }, 'a site is no parent, even for a restore: no account stands under one (SELECT 12 Oct, none of 829), so no Undo needs it');
    assert.deepEqual(restorePlace(ALL, { selfId: 'q', selfName: 'Quay', parentId: 'acc_of_another_org', tier: 'site' }), { status: 404, error: 'Parent account not found.' }, "another org's id is not in this org's rows: the 404 a missing one gets");
    assert.deepEqual(restorePlace(ALL, { selfId: 'u', selfName: 'Shell - Port Allen', parentId: 'u', tier: 'business_unit' }), { status: 400, error: "An account can't be its own parent." }, 'no loop: not itself');
    assert.deepEqual(restorePlace(ALL, { selfId: 'k', selfName: 'Shell', parentId: 't', tier: 'account' }), { status: 400, error: "“Port Allen Tank Farm” is under “Shell” — an account can't be moved under one of its own sub-accounts or sites." }, 'no loop: not one of its own');
    assert.deepEqual(restorePlace(ALL, { selfId: 'q', selfName: 'Quay', parentId: 'x', tier: 'site' }), { status: 400, error: '“Shell Oil” was merged into another account — pick the account it was merged into.' }, 'a parent merged away since is no live account');
    assert.deepEqual(restorePlace(undefined, { selfId: 'q', parentId: 'k', tier: 'site' }), { status: 404, error: 'Parent account not found.' });
    // a site is put back only with no account under it — whatever the parent, none included (J1; the critics, 12 Oct)
    const keptUnit = { id: 'kk', name: 'K Unit', accountTier: 'business_unit', parentAccountId: 'kx' };
    const liftedK = { id: 'kx', name: 'K', accountTier: 'account', parentAccountId: null };
    assert.deepEqual(restorePlace([shell, liftedK, keptUnit], { selfId: 'kx', selfName: 'K', parentId: 'k', tier: 'site' }), { status: 400, error: BELOW('K') }, 'a lifted account that gained a unit before its Undo: not a site again over it');
    assert.deepEqual(restorePlace([shell, liftedK, keptUnit], { selfId: 'kx', selfName: 'K', parentId: null, tier: 'site' }), { status: 400, error: BELOW('K') }, 'nor at the top');
    assert.deepEqual(restorePlace([shell, liftedK, keptUnit], { selfId: 'kx', selfName: 'K', parentId: 'k', tier: 'business_unit' }), { status: 400, error: "“K” has an account under it that can't stand under a business unit — it can't be put back as one." }, 'nor a business unit over a unit added under it since (K2)');
    assert.deepEqual([...restorePlace([shell, liftedK, { ...keptUnit, accountTier: 'site' }], { selfId: 'kx', selfName: 'K', parentId: 'k', tier: 'business_unit' }).tiers], [['kx', 'business_unit']], 'a business unit over a site is put back as stored (legacy shapes keep what ranks above them)');
    assert.deepEqual([...restorePlace([shell, liftedK], { selfId: 'kx', selfName: 'K', parentId: 'k', tier: 'site' }).tiers], [['kx', 'site']], 'with nothing under it: a site again');
    assert.deepEqual([...restorePlace([shell, { ...liftedK, parentAccountId: 'kx' }], { selfId: 'kx', selfName: 'K', parentId: 'k', tier: 'site' }).tiers], [['kx', 'site']], 'a row naming itself as its parent is no account under it');
    // several deleted together: each one's parent is posted back before it, whatever order they were deleted in
    const zeta = { id: 'z', name: 'Zeta Corp', accountTier: 'account', parentAccountId: null };
    const alpha = { id: 'a1', name: 'Alpha Plant', accountTier: 'business_unit', parentAccountId: 'z' };
    const beta = { id: 'b1', name: 'Beta Tank', accountTier: 'site', parentAccountId: 'a1' };
    assert.deepEqual(parentsFirst([alpha, beta, zeta]).map((a) => a.id), ['z', 'a1', 'b1'], 'in name order the plant came before its parent: Zeta goes first');
    assert.deepEqual(parentsFirst([beta, alpha, zeta]).map((a) => a.id), ['z', 'a1', 'b1']);
    assert.deepEqual(parentsFirst([zeta, dow]).map((a) => a.id), ['z', 'd'], 'unrelated: as listed');
    assert.deepEqual(parentsFirst([unit, tank]).map((a) => a.id), ['u', 't'], "a parent the list doesn't hold (Shell, not deleted) moves nothing");
    assert.deepEqual(parentsFirst([{ id: 'l1', name: 'Loop One', parentAccountId: 'l2' }, { id: 'l2', name: 'Loop Two', parentAccountId: 'l1' }]).map((a) => a.id), ['l2', 'l1'], 'a loop already in the data: each once');
    assert.deepEqual(parentsFirst(undefined), []);
});

test("K2: a restore is refused over an account under it that would not rank below the tier put back — any tier, not only a site (the critics' PROBE5-A: a unit added under a lifted unit); what ranks above it stands — the legacy shapes the Undo restores", () => {
    const x = { id: 'x', name: 'X', accountTier: 'account', parentAccountId: null };
    const k = { id: 'kx', name: 'K', accountTier: 'account', parentAccountId: null };   // lifted by X's delete
    const under = (tier) => ({ id: 'kk', name: 'KK', accountTier: tier, parentAccountId: 'kx' });
    const OVER = (words) => `“K” has an account under it that can't stand under ${words} — it can't be put back as one.`;
    const back = (tier, kid) => restorePlace([x, k, ...(kid ? [kid] : [])], { selfId: 'kx', selfName: 'K', parentId: 'x', tier });
    assert.deepEqual(back('business_unit', under('business_unit')), { status: 400, error: OVER('a business unit') }, 'PROBE5-A: a business unit is not put back over a business unit added under it since');
    assert.deepEqual(back('business_unit', under('account')), { status: 400, error: OVER('a business unit') }, 'nor over an account');
    assert.deepEqual(back('business_unit', under(null)), { status: 400, error: OVER('a business unit') }, 'a row with no tier the rule knows reads as an account');
    assert.deepEqual(back('business_unit', under('garbage')), { status: 400, error: OVER('a business unit') });
    assert.deepEqual([...back('business_unit', under('site')).tiers], [['kx', 'business_unit']], 'over a site: a business unit, as stored');
    assert.deepEqual(back('account', under('account')), { status: 400, error: OVER('an account') }, "a tier-'account' row is not put back over an account");
    assert.deepEqual([...back('account', under('business_unit')).tiers], [['kx', 'account']], "over a unit: one of UKG's tier-'account' rows, as stored");
    assert.deepEqual([...back('account', under('site')).tiers], [['kx', 'account']], 'over a site: as stored');
    for (const tier of ['account', 'business_unit', 'site']) assert.deepEqual(back('site', under(tier)), { status: 400, error: BELOW('K') }, `a site over ${tier}: refused in a move's words`);
    for (const tier of ['account', 'business_unit', 'site']) assert.deepEqual([...back(tier, null).tiers], [['kx', tier]], `${tier} over nothing: as stored`);
    assert.deepEqual([...back('business_unit', { ...under('business_unit'), id: 'kx' }).tiers], [['kx', 'business_unit']], 'a row naming itself as its parent is no account under it');
    assert.deepEqual([...back('business_unit', { ...under('business_unit'), parentAccountId: 'x' }).tiers], [['kx', 'business_unit']], "a sibling is no account under it");
    // the rule the server holds (accounts.mjs runs restorePlace for a POST and a PUT alike)
    const src = read('src/utils/accountParent.js');
    assert.ok(src.includes("    if (selfId && rowsOf(rows).some((a) => a.parentAccountId === selfId && a.id !== selfId && (rankOf(a.accountTier) ?? 0) <= rankOf(tier))) return { status: 400, error: overRefusal(tier, selfName) };\n    return { tiers: new Map([[selfId, tier]]) };\n}"), 'after the parent checks, whatever the parent');
});

test("K3: an owner id a restore drops takes the owner's name with it — and a restore carries no created date, the column's default (the Undo's moment) standing: area 13 took K4's round trip out, since the driver reads a `timestamp without time zone` in the process's own time zone (state §0.91) and a date read back and written again moved by its offset (accounts.mjs)", () => {
    const src = read('netlify/functions/accounts.mjs');
    const post = between(src, '// Single insert', "if (event.httpMethod === 'PUT') {");
    assert.ok(post.includes("            if (data.restore === true && mayRestore && data.ownerId && !newRow.ownerId) newRow.accountOwner = null;\n"), 'an owner id the restore dropped: no owner name either (a row stored with a name and no id keeps it)');
    assert.ok(!/storedDate|createdAt/.test(src), "no created date read from a body, a restore's included, and none written back: the column dates every row");
});

test("L2 and L5: a delete's Undo never runs as a move — accounts.mjs refuses an Admin's marked PUT for a row another session moved since the delete, in movedSinceDelete's words; and the screen takes each account the Undo posted back whole, as the server wrote it (withRows), not only its tier", () => {
    assert.equal(movedSinceDelete('Itest K Site'), '“Itest K Site” was moved since the delete — not put back.');
    assert.equal(movedSinceDelete('  K  '), '“K” was moved since the delete — not put back.', 'the name trimmed, as every refusal quotes it');
    assert.equal(movedSinceDelete(''), 'This account was moved since the delete — not put back.');
    assert.equal(movedSinceDelete(undefined), 'This account was moved since the delete — not put back.');
    // the screen: the row the DELETE answered (its owner as stored), and the one the restore wrote (an owner gone since dropped: K3)
    const shown = [shell, { ...dow, ownerId: 'usr_gone', accountOwner: 'Pat Gone' }, dowBu];
    const written = { ...dow, ownerId: null, accountOwner: null, orgId: 'org_a' };
    const after = withRows(shown, [written]);
    assert.equal(after.find((a) => a.id === 'd'), written, 'the row as the server wrote it, whole — not only its tier');
    assert.equal(after[0], shell, 'every other row as it was');
    assert.equal(after[2], dowBu);
    assert.deepEqual(after.map((a) => a.id), ['k', 'd', 'db'], 'in place: nothing added, nothing dropped');
    assert.equal(withRows(shown, []), shown, 'no answer: the same list');
    assert.equal(withRows(shown, undefined), shown);
    assert.deepEqual(withRows(shown, [{ id: 'nobody', name: 'Nobody' }, { name: 'No Id' }, null]), shown, 'an answer naming no row of the list, or no id, changes nothing');
    assert.deepEqual(withRows(undefined, [written]), []);
});

test("a restore refuses a tier the rule does not know, and walks the parent's WHOLE chain for a loop — one longer than PARENT_WALK included (H1)", () => {
    assert.deepEqual(restorePlace([], { selfId: 'q', selfName: 'Quay', parentId: null, tier: 'garbage' }), { status: 400, error: UNKNOWN_TIER }, 'a made-up tier: refused');
    assert.deepEqual(restorePlace(ALL, { selfId: 'q', selfName: 'Quay', parentId: 'k', tier: null }), { status: 400, error: UNKNOWN_TIER }, 'no tier at all');
    assert.equal(UNKNOWN_TIER, 'That is not an account tier — an account, a business unit or a site.');
    for (const tier of ['account', 'business_unit', 'site']) assert.deepEqual([...restorePlace([], { selfId: 'q', tier }).tiers], [['q', tier]], `${tier}: put back as stored`);
    // the server critic's chain (12 Oct): Chain 0 at the top, 1 … 17 each under the one before —
    // Chain 0 put back under Chain 17 would close a loop eighteen accounts round
    const chain = Array.from({ length: 18 }, (_, i) => ({ id: `c${i}`, name: `Chain ${i}`, accountTier: 'business_unit', parentAccountId: i ? `c${i - 1}` : null }));
    assert.equal(isUnder('c17', 'c0', byIdOf(chain)), false, 'the walk the Parent list takes stops at PARENT_WALK');
    assert.deepEqual(restorePlace(chain, { selfId: 'c0', selfName: 'Chain 0', parentId: 'c17', tier: 'account' }), { status: 400, error: "“Chain 17” is under “Chain 0” — an account can't be moved under one of its own sub-accounts or sites." }, "a restore's walks it all: refused");
    assert.equal(restorePlace(chain, { selfId: 'c0', selfName: 'Chain 0', parentId: 'c16', tier: 'account' }).status, 400);
    assert.equal(restorePlace(chain, { selfId: 'c1', selfName: 'Chain 1', parentId: 'c17', tier: 'business_unit' }).status, 400, 'from the middle too');
    assert.deepEqual([...restorePlace(chain, { selfId: 'c17', selfName: 'Chain 17', parentId: 'c16', tier: 'business_unit' }).tiers], [['c17', 'business_unit']], 'the chain itself is put back as it stood');
    const loop = [{ id: 'l1', name: 'Loop One', accountTier: 'business_unit', parentAccountId: 'l2' }, { id: 'l2', name: 'Loop Two', accountTier: 'business_unit', parentAccountId: 'l1' }];
    assert.deepEqual([...restorePlace(loop, { selfId: 'new', selfName: 'New', parentId: 'l1', tier: 'site' }).tiers], [['new', 'site']], 'a loop already in the data ends the walk');
    assert.equal(restorePlace(loop, { selfId: 'l1', selfName: 'Loop One', parentId: 'l2', tier: 'business_unit' }).status, 400, 'and is refused where it would be closed again');
});

test("a delete's Undo re-sends what the server answered, never the screen's copies: each row deleted as stored, each sub-account it promoted as stored before — one deleted in the same go posted back under the parent it had (undoOfDeletes, H2)", () => {
    // Shell deleted: the server answers its row, and its two "Shell - Port Allen" as stored before the write
    const shellAnswer = { deleted: shell, children: [{ id: 'u', parentAccountId: 'k', accountTier: 'business_unit' }, { id: 's', parentAccountId: 'k', accountTier: 'site' }] };
    assert.deepEqual(undoOfDeletes([shellAnswer]), { deleted: [shell], promoted: [{ id: 'u', parentId: 'k', tier: 'business_unit' }, { id: 's', parentId: 'k', tier: 'site' }] }, "the site twin comes back a site — the server's tier, whatever the screen held");
    // Shell and its unit deleted in one go, Shell first: the unit's own answer holds it as Shell's delete left it (lifted, an account)
    const unitLifted = { ...unit, parentAccountId: null, accountTier: 'account' };
    const unitAnswer = { deleted: unitLifted, children: [{ id: 't', parentAccountId: 'u', accountTier: 'site' }, { id: 'm', parentAccountId: 'u', accountTier: 'business_unit' }] };
    const both = undoOfDeletes([shellAnswer, unitAnswer]);
    assert.deepEqual(both.deleted.map((a) => [a.id, a.parentAccountId, a.accountTier]), [['k', null, 'account'], ['u', 'k', 'business_unit']], 'the unit posted back under Shell, a unit — as it stood before the go');
    assert.deepEqual(both.promoted.map((c) => c.id), ['s', 't', 'm'], 'the unit is posted back, not re-saved; its own sub-accounts are re-saved under it');
    assert.deepEqual(parentsFirst(both.deleted).map((a) => a.id), ['k', 'u'], 'Shell posted back first');
    // the other order: the unit first, then Shell — no answer names the unit twice
    const other = undoOfDeletes([{ deleted: unit, children: unitAnswer.children }, { deleted: shell, children: [{ id: 's', parentAccountId: 'k', accountTier: 'site' }] }]);
    assert.deepEqual(other.deleted.map((a) => [a.id, a.parentAccountId, a.accountTier]), [['u', 'k', 'business_unit'], ['k', null, 'account']]);
    assert.deepEqual(parentsFirst(other.deleted).map((a) => a.id), ['k', 'u']);
    // the first answer that names a sub-account holds it as it stood before the go
    const later = undoOfDeletes([shellAnswer, { deleted: dow, children: [{ id: 's', parentAccountId: 'd', accountTier: 'account' }] }]);
    assert.deepEqual(later.promoted.find((c) => c.id === 's'), { id: 's', parentId: 'k', tier: 'site' });
    assert.deepEqual(undoOfDeletes([]), { deleted: [], promoted: [] });
    assert.deepEqual(undoOfDeletes(undefined), { deleted: [], promoted: [] });
    assert.deepEqual(undoOfDeletes([{}, null]), { deleted: [], promoted: [] }, 'an answer with nothing in it puts nothing back');
});

test('D22: the accounts a move makes sites, each with the account it then stands under — the moved one or one under it; a site that stays a site, a clear, a create are none; a name another account shares is no one\'s by name', () => {
    // Dow under Shell: Dow a unit, Dow's unit a site — its deals go up to Dow
    const dow = placeAccount(UKG, { selfId: 'd', selfName: 'Dow', parentId: 'k', branch: true });
    assert.deepEqual(sitesMade(UKG, dow.tiers, { selfId: 'd', selfName: 'Dow', parentId: 'k' }), [{ id: 'db', name: 'Dow Olefins', storedName: 'Dow Olefins', alone: true, parentId: 'd', parentName: 'Dow' }]);
    assert.deepEqual(sitesMade(UKG, dow.tiers, { selfId: 'd', selfName: 'Dow Chemical', parentId: 'k' })[0].parentName, 'Dow Chemical', 'the account above as this save names it');
    // the moved account itself made a site: under UKG's unit twin, renamed in the same save
    const lg = placeAccount(UKG, { selfId: 'lg', selfName: 'Shell Legacy Co', parentId: 'u', branch: true });
    assert.equal(lg.tiers.get('lg'), 'site');
    assert.deepEqual(sitesMade(UKG, lg.tiers, { selfId: 'lg', selfName: 'Shell Legacy Plant', parentId: 'u' }), [{ id: 'lg', name: 'Shell Legacy Plant', storedName: 'Shell Legacy Co', alone: true, parentId: 'u', parentName: 'Shell - Port Allen' }], 'Site Name the name it is saved under; a deal saved by name alone carries the stored one');
    // a unit sharing UKG's twins' name made a site: no deal is its by name
    const twin = { id: 'u3', name: 'Shell - Port Allen', accountTier: 'business_unit', parentAccountId: 'd' };
    const withTwin = [...UKG, twin];
    const moved = placeAccount(withTwin, { selfId: 'u3', selfName: 'Shell - Port Allen', parentId: 'u', branch: true });
    assert.deepEqual(sitesMade(withTwin, moved.tiers, { selfId: 'u3', selfName: 'Shell - Port Allen', parentId: 'u' }).map((s) => [s.id, s.alone]), [['u3', false]]);
    // none: a site moved between accounts stays a site; a clear makes an account; no tiers
    const siteMoved = placeAccount(UKG, { selfId: 's', selfName: 'Shell - Port Allen', parentId: 'd', branch: true });
    assert.deepEqual(sitesMade(UKG, siteMoved.tiers, { selfId: 's', selfName: 'Shell - Port Allen', parentId: 'd' }), [], 'a site already: nothing made');
    assert.deepEqual(sitesMade(UKG, placeAccount(UKG, { selfId: 'u', parentId: null, branch: true }).tiers, { selfId: 'u', parentId: null }), []);
    assert.deepEqual(sitesMade(UKG, null), []);
    assert.deepEqual(sitesMade(undefined, dow.tiers), []);
});

test('D12: the quick log offers no contact merged into another — the one it was merged into is', () => {
    const dana = { id: 'c1', firstName: 'Dana', lastName: 'Whitaker', company: 'Northwind' };
    const mergedAway = { id: 'c9', firstName: 'Dana', lastName: 'Whitaker', company: 'Northwind', mergeArchived: true, mergedIntoId: 'c1' };
    const nameOf = (c) => (c.firstName || '') + ' ' + (c.lastName || '');
    assert.deepEqual(rankMatches(unarchived([mergedAway, dana]), 'dana', nameOf, (c) => [c.company, c.email]).map((c) => c.id), ['c1']);
    assert.deepEqual(rankMatches(unarchived([mergedAway]), 'whitaker', nameOf), [], 'alone, still not offered');
    assert.deepEqual(rankMatches(unarchived(undefined), 'dana', nameOf), []);
    const ql = read('src/components/layout/QuickLogFab.jsx');
    assert.ok(ql.includes("import { unarchived } from '../../utils/pickLink.js';"));
    assert.ok(ql.includes('setQuickLogContactResults(rankMatches(unarchived(contacts), q,'), 'the quick log lists what the matcher ranks of the live contacts');
});

// ── the sites — pinned ─────────────────────────────────────────────────────

test("the account rail: its Parent field is the shared picker, fed the accounts it may stand under, with no Create; a parent it can't open is said so, with an ×; its Save asks resolveLink", () => {
    const src = read('src/components/rails/AccountRail.jsx');
    assert.ok(src.includes("import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';"));
    assert.ok(src.includes("import AccountPicker from './AccountPicker';"));
    assert.ok(src.includes("import HiddenLink from './HiddenLink';"));
    assert.ok(src.includes("import { parentChoices, parentNote, parentLeftOut, typedParentRefusal } from '../../utils/accountParent.js';"));
    // unarchived joins it (state §0.206): the rail's People list and CONTACTS leave a merged-away contact out.
    assert.ok(src.includes("import { resolveLink, linkRefusal, unarchived, HIDDEN_ACCOUNT } from '../../utils/pickLink.js';"));
    assert.ok(src.includes('    const selfId = isNew ? null : accountRailId;'));
    assert.ok(src.includes('    const accountsById = useMemo(() => new Map((accounts || []).map(a => [a.id, a])), [accounts]);'));
    assert.ok(src.includes('    const parentIds = useMemo(() => parentChoices(accounts, selfId, accountsById), [accounts, accountsById, selfId]);'));
    assert.ok(src.indexOf('const parentIds = useMemo(') < src.indexOf('if (!isOpen) return null;'), 'a hook, before the rail returns early');
    const field = between(src, '<FieldGroup label="Parent Account" wide>', '</FieldGroup>');
    assert.equal(field.split('<AccountPicker').length - 1, 1, 'the shared picker');
    assert.ok(!field.includes('<Typeahead'), 'not the bare-name list');
    assert.ok(field.includes('                                        if (!formData.parentAccountId) return ('), 'the picker while no parent is held');
    assert.ok(field.includes('value={parentSearch}'));
    assert.ok(field.includes('onChange={v => { setParentSearch(v); setDirty(true); }}'), 'typing is a change');
    assert.ok(field.includes("onSelectAccount={acc => hc('parentAccountId', acc.id)}"), 'the row clicked, by its id');
    assert.ok(field.includes('filterFn={a => parentIds.has(a.id)}'), 'only an account it may stand under is listed');
    assert.ok(field.includes('allowCreate={false}'), 'a parent is an account that exists');
    assert.ok(field.includes('leftOut={a => parentLeftOut(a, accounts, selfId, accountsById, formData.name)}'), "a name it leaves out says why — every account of the name, in the rule's order (F8)");
    assert.ok(field.includes('const parent = accountsById.get(formData.parentAccountId);'));
    const hidden = field.indexOf('                                        if (!parent) return (\n                                            <HiddenLink hidden={HIDDEN_ACCOUNT} title="Remove the parent account"\n');
    assert.ok(hidden > field.indexOf('const parent = accountsById.get(formData.parentAccountId);'), "a parent outside a rep's list: said so (D16), not drawn as a nameless chip");
    assert.ok(field.includes("onRemove={() => { hc('parentAccountId', null); setParentSearch(''); }} />"), 'with an × that removes it');
    assert.ok(field.includes('<span>{parent.name}<span style={{ color: T.inkMuted }}>{parentNote(parent, accountsById)}</span></span>'), "the chip names its parent's parent");
    assert.ok(!src.includes('find(a => a.name === v)'), 'no pick by name');
    // the Save
    const save = between(src, 'const handleSave = async () => {', 'const handleDiscard = () => {');
    assert.ok(save.includes("        if (parentLink.how === 'untouched') delete saveData.parentAccountId;\n        else saveData.parentAccountId = parentLink.id || null;\n"), "H7: a Parent field nobody touched sends no parent — the server keeps the one it stores (a stale rail neither moves it back nor is refused)");
    assert.ok(save.includes('const parentLink = resolveLink({\n            text: parentSearch,\n'));
    assert.ok(save.includes("            heldId: formData.parentAccountId || '',\n"));
    assert.ok(save.includes('            storedId: seededParentRef.current.id,\n') && save.includes('            seededText: seededParentRef.current.text,\n'), 'a field nobody touched keeps its stored link (D1)');
    assert.ok(save.includes('            records: accounts || [],\n'), 'the whole list: a held parent merged away is found');
    assert.ok(save.includes('            eligible: (a) => parentIds.has(a.id),\n'));
    assert.ok(save.includes("                field: 'Parent Account',\n"));
    assert.ok(save.includes('                why: () => typedParentRefusal(parentSearch, accounts, selfId, accountsById, saveData.name),\n'), 'a name only an account it may not stand under has: why');
    const named = save.indexOf("setSaveError('Account name is required.')");
    const refused = save.indexOf('if (parentLink.refusal) {');
    const kept = save.indexOf('saveData.parentAccountId = parentLink.id || null;');
    assert.ok(named > 0 && refused > named && kept > refused, 'refused, or resolved');
    assert.ok(kept < save.indexOf('checkDuplicate(saveData.name)') && kept < save.indexOf('await handleSaveAccount('), 'before the save');
    assert.ok(save.slice(refused, kept).includes('            return;\n'), 'a refusal saves nothing');
    // the seed
    assert.ok(src.includes("    const seededParentRef = useRef({ id: '', text: '' });"));
    assert.ok(src.includes("        setParentSearch(parentAcct?.name || '');\n        seededParentRef.current = { id: src.parentAccountId || '', text: parentAcct?.name || '' };\n"), 'taken when the rail seeds the field, once');
    assert.ok(src.includes("            setParentSearch(snap.parentSearch);\n            seededParentRef.current = { id: '', text: '' };"), 'a new account restored after Open existing has nothing stored');
    // the view
    const view = between(src, '{account?.parentAccountId && (() => {', '})()}');
    assert.ok(view.includes('const parent = accountsById.get(account.parentAccountId);'));
    assert.ok(view.includes('<>{parent.name}<span style={{ color: T.inkMuted }}>{parentNote(parent, accountsById)}</span></>'));
    assert.ok(view.includes(': <span style={{ color: T.inkMuted }}>{HIDDEN_ACCOUNT}</span>} />;'), 'D16 in the view too: not a missing row');
});

test('useAccounts: a new account under a parent takes the lowest tier above it; a moved one asks to keep its own, with everything under it re-fitted — the tiers the server writes and answers with, and the deals it moved up (D22); a delete\'s Undo puts the stored rows back, marked a restore (D3, D18, D21)', () => {
    const src = read('src/hooks/useAccounts.js');
    assert.ok(src.includes("import { tierUnder, branchTiers, parentRefusal, withTiers, withRows, parentsFirst, undoOfDeletes } from '../utils/accountParent.js';"));
    assert.ok(src.includes('const byIdOf = (list) => new Map((list || []).map(a => [a.id, a]));'));
    assert.ok(!src.includes('getAccountDepth') && !src.includes('getTierFromDepth') && !src.includes('_forceTier'), 'one rule, not a copy');
    const save = between(src, 'const handleSaveAccount = async (', 'return {\n        accounts,');
    const edit = between(save, 'if (editingAccount) {', '} else if (editingSubAccount) {');
    assert.ok(edit.includes("if ('parentAccountId' in formData && (formData.parentAccountId || null) !== (editingAccount.parentAccountId || null)) {"), 'only a move — a payload naming no parent leaves it as stored (H7)');
    assert.ok(edit.includes('const moved = branchTiers(accounts, editingAccount.id, formData.parentAccountId || null, formData.accountTier);'), 'its own tier asked for first: kept where it fits (D21)');
    assert.ok(edit.includes("if (moved.problem) {\n                        setAccountModalError(parentRefusal('below-site', null, formData.name || editingAccount.name));\n                        return;\n                    }"), 'refused before anything is sent');
    assert.ok(edit.includes('payload.accountTier = moved.tiers.get(editingAccount.id);'));
    const sub = between(save, '} else if (parentAccountForSub) {', '} else {');
    assert.ok(sub.includes('const tier = tierUnder(parentAccountForSub.id, byIdOf(accounts));'));
    assert.ok(sub.includes('payload = { ...formData, id: newId, parentAccountId: parentAccountForSub.id, accountTier: tier };'));
    const after = save.indexOf('setAccounts(prev => withTiers(prev, data.retiered));');
    assert.ok(after > save.indexOf('setAccounts(prev => prev.map(acc => acc.id === saved.id ? saved : acc));'), 'the accounts under a moved one, as the server wrote them');
    assert.ok(after > save.indexOf('if (!stillOrg(askedOrg)) return;'), 'only for the org that asked');
    const deals = save.indexOf("if (liftedDeals.size) setOpportunities && setOpportunities(prev => prev.map(o => (liftedDeals.has(o.id) ? { ...o, ...liftedDeals.get(o.id) } : o)));");
    assert.ok(deals > after, 'the deals of an account the move made a site, as the server moved them (D22)');
    assert.ok(save.includes('const liftedDeals = new Map((Array.isArray(data.liftedDeals) ? data.liftedDeals : []).map(d => [d.id, d]));'));
    const del = between(src, 'const handleDeleteAccounts = (ids, opts = {}) => {', 'const handleSaveAccount');
    assert.ok(del.includes('const children = accounts.filter(a => goingIds.includes(parentOf(a)) && !goingIds.includes(a.id) && !isMergeArchived(a));'), "the screen's live sub-accounts: the confirm counts them (state §0.210)");
    assert.ok(!/children\.(filter|map|find|some)\(/.test(del), "the screen's copies are never what the Undo re-sends (H2)");
    assert.ok(del.includes('if (!r.ok) failed.push({ a, error: r.error });\n                else lifted.push(...(r.data?.retiered || []));'), 'the tiers the server gave what it lifted (D18)');
    assert.ok(del.includes('                if (r.ok) answers.push(r.data || {});\n'), 'what each delete answered: the row and its sub-accounts as stored');
    assert.ok(del.includes('const { deleted, promoted } = undoOfDeletes(answers);'), 'H2: the Undo re-sends what the server answered');
    assert.ok(del.indexOf('setAccounts(prev => withTiers(prev, lifted));') > del.indexOf('setAccounts(prev => prev.map(a => (promoted.some(c => c.id === a.id) ? { ...a, parentAccountId: null } : a)));'));
    assert.ok(del.includes('for (const a of parentsFirst(deleted)) {'), 'Undo: an account deleted with its own sub-account is posted back first');
    assert.ok(del.includes('                            body: JSON.stringify({ ...a, restore: true }),\n'), 'Undo: the stored row posted back, marked a restore — its parent and tier as stored');
    assert.ok(del.includes('if (rr.data?.account) answered.push(rr.data.account);'), 'Undo: the account posted back, as the server wrote it (L5)');
    assert.ok(del.includes('body: JSON.stringify({ id: c.id, parentAccountId: c.parentId, accountTier: c.tier, restore: true }),'), 'Undo: each lifted account back under its parent with its stored tier, marked a restore (D21)');
    assert.ok(del.includes('return c ? { ...a, parentAccountId: c.parentId, ...(c.tier ? { accountTier: c.tier } : {}) } : a;'), 'and the screen shows it so at once');
    assert.ok(del.includes('else restored.push(...(rp.data?.account ? [rp.data.account] : []), ...(rp.data?.retiered || []));'), "and each re-saved parent's branch, as the server re-fitted it");
    const back = del.indexOf('setAccounts(prev => withTiers(prev, restored));');
    assert.ok(back > del.indexOf("method: 'PUT',") && back < del.indexOf('if (notRestored.length) {'), 'once the Undo has run, before what did not take is reloaded');
    const rows = del.indexOf('                    setAccounts(prev => withRows(prev, answered));\n');
    assert.ok(rows > back && rows < del.indexOf('if (notRestored.length) {'), 'L5: each account posted back shown as the server wrote it — an owner the restore dropped shows dropped, without a reload');
    assert.ok(del.includes("if (!rp.ok) notRestored.push({ a: accounts.find(x => x.id === c.id) || { id: c.id, name: 'a sub-account' }, error: rp.error });"), "L4: a refused re-save's toast names the account refused — its name the screen's row's — not the parent put back");
    assert.ok(del.includes('setUndoToast({ error: `Could not restore ${notRestored[0].a.name} — ${notRestored[0].error}` });\n                        loadAccounts(() => {});'), 'a refusal says so, and the list is read again: the Undo may have taken in part');
});

test("accounts.mjs: a parent is checked against THIS org's rows when a create names one and when a save moves it — after the ownership check, before the write; the tiers fit, written to this org's rows only and handed back; a save that leaves the parent keeps the stored tier", () => {
    const src = read('netlify/functions/accounts.mjs');
    assert.ok(src.includes("import { eq, asc, and, or, isNull, inArray } from 'drizzle-orm';"));
    assert.ok(src.includes("import { placeAccount, restorePlace, liftedBelow, tierChanges, sitesMade, movedSinceDelete } from '../../src/utils/accountParent.js';"));
    assert.ok(src.includes('    stampOwnerId, stampOwnerIds, ownerIdForUpdate, rekeyBulkOwners, ambiguousOwnerResponse, rosterUserById,\n'), "J6: a restore's owner is read in this org's roster");
    const rule = between(src, "// ── An account's parent and tier", 'export const handler');
    assert.ok(!/readScope|getCallerId|crmReadScope/.test(rule), "the org's rows decide, never the caller's read scope");
    const tree = between(src, 'const orgTreeOf = (orgId) => db.select({', ';\n');
    assert.ok(tree.includes('}).from(accounts).where(eq(accounts.orgId, orgId))'), 'this org only');
    const write = between(src, 'function tierWrites(orgId, changes) {', '\n}\n');
    assert.ok(write.includes('return db.update(accounts).set({ accountTier: tier }).where(and(eq(accounts.orgId, orgId), inArray(accounts.id, ids)));'), "this org's rows only — statements, sent in the write they follow");
    assert.ok(!write.includes('await '), 'never written on their own');
    // D22: the deals of an account a move makes a site, up to the account above, in this org
    const lifts = between(src, 'const dealLifts = (orgId, made) => made.map((s) => db.update(opportunities)', '.returning({');
    assert.ok(lifts.includes('.set({ accountId: s.parentId, account: s.parentName, site: s.name, updatedAt: new Date() })'), 'the account above, its name, Site Name the site');
    assert.ok(lifts.includes('.where(and(eq(opportunities.orgId, orgId), s.alone'), "this org's deals only");
    assert.ok(lifts.includes('? or(eq(opportunities.accountId, s.id), and(isNull(opportunities.accountId), eq(opportunities.account, s.storedName)))'), 'by its id, or by its name where a deal has none');
    assert.ok(lifts.includes(': eq(opportunities.accountId, s.id)))'), 'a name another account shares: by id only');
    assert.ok(src.includes('const refusedPlace = (placed, headers) => ({ statusCode: placed.status, headers, body: JSON.stringify({ error: placed.error }) });'));
    assert.ok(src.includes("    const mayRestore = userRole === 'Admin';\n"), 'H1: the restore mark is honoured for an Admin alone — only an Admin deletes');
    assert.ok(src.indexOf("const mayRestore = userRole === 'Admin';") > src.indexOf('    if (forbidden) return forbidden;\n'), 'beside the write gate');
    const post = between(src, '// Single insert', "if (event.httpMethod === 'PUT') {");
    assert.ok(post.includes('const placed = data.restore === true && mayRestore\n'), "a delete's Undo posts the stored row back marked a restore — an Admin's; anyone else's marked POST is placed as any create");
    assert.ok(post.includes('? restorePlace(await orgTreeOf(orgId), { selfId: asked.id, selfName: asked.name, parentId: asked.parentAccountId, tier: asked.accountTier })'), "restored: the parent and tier as stored, checked for the org, loops and a site over accounts — the org's rows read whatever the parent (J1)");
    assert.ok(post.includes(': placeAccount(asked.parentAccountId ? await orgTreeOf(orgId) : [], { selfId: asked.id, selfName: asked.name, parentId: asked.parentAccountId, tier: data.accountTier });'), 'a create: the tier the body asks for, kept where it fits');
    assert.ok(post.includes('            if (placed.error) return refusedPlace(placed, headers);\n            const territoryAssign = data.restore === true && mayRestore ? null : await resolveTerritory(orgId, sanitize(data));'), 'refused before anything is written; a restore meets no territory rule (J6)');
    assert.ok(post.includes('            const newRow = data.restore === true && mayRestore\n                ? { ...sanitize(data), ownerId: (await rosterUserById(data.ownerId, orgId))?.id ?? null, accountTier: placed.tiers.get(asked.id) }\n                : await stampOwnerId('), "J6: a restore keeps the owner id it was stored with where that is a member of THIS org, else none — never the caller's — and no created date (area 13: the column's default); a create is stamped as before");
    assert.ok(post.includes('{ ...sanitize(data), accountTier: placed.tiers.get(asked.id), ...(territoryAssign || {}) }'), "the rule's tier, never the body's unchecked");
    const put = between(src, 'const clean = sanitize({ ...prior, ...data });', "if (event.httpMethod === 'DELETE') {");
    const owned = put.indexOf('if (forbiddenPut) return forbiddenPut;');
    const move = put.indexOf('if ((clean.parentAccountId || null) !== (prior.parentAccountId || null)) {');
    assert.ok(owned > 0 && move > owned, 'after the ownership check: a caller who may not save learns nothing of the parent');
    const marked = put.indexOf('            const marked = data.restore === true && mayRestore && data.parentAccountId;\n');
    const refusedMoved = put.indexOf("            if (marked && prior.parentAccountId) return refusedPlace({ status: 409, error: movedSinceDelete(clean.name) }, headers);\n");
    const restore = put.indexOf('            const restored = marked\n                ? restorePlace(');
    assert.ok(marked > owned && refusedMoved > marked && restore > refusedMoved && restore < move, "a restore — an Admin's mark, the body naming a parent (J1) — after the ownership check too, before a move is asked; one for a row that has a parent now, moved by another session since the delete, refused 409 before the org's rows are read or anything is written (L2: the Undo never runs as a move)");
    assert.ok(put.includes('                ? restorePlace(await orgTreeOf(orgId), { selfId: clean.id, selfName: clean.name, parentId: clean.parentAccountId, tier: clean.accountTier })\n                : null;\n'), "the parent and tier as sent, checked for the org, loops and a site over accounts; nothing re-fitted, no deal moved");
    assert.ok(put.includes("                : null;\n            if (restored) {\n                if (restored.error) return refusedPlace(restored, headers);\n            } else if ((clean.parentAccountId"), 'a refused restore answers; one taken is written as sent — nothing re-fitted, and no deal moved: K1, a site put back keeps its deals, whenever they came onto it');
    assert.ok(!put.includes('openDealOfAccount(') && !src.includes('heldOpen'), 'K1: a save reads no open deal — the restore moves none (the delete alone reads them, to keep an account an open deal holds)');
    assert.ok(put.includes('made = sitesMade(tree, placed.tiers, { selfId: clean.id, selfName: clean.name, parentId: clean.parentAccountId });'), 'a move: the accounts it makes sites (D22)');
    assert.ok(put.includes('const territoryAssignPut = restored ? null : await resolveTerritory(orgId, clean);'), 'J6: a restore taken meets no territory rule — the row comes back as stored; any other save meets them as before');
    assert.ok(move < put.indexOf('const mergedPut = { ...clean, ...(territoryAssignPut || {}) };'), 'before the row is built');
    assert.ok(put.includes('const placed = placeAccount(tree, { selfId: clean.id, selfName: clean.name, parentId: clean.parentAccountId, tier: data.accountTier, branch: true });'), "the body's tier first, then the stored one (D21)");
    assert.ok(put.includes('                if (placed.error) return refusedPlace(placed, headers);\n                clean.accountTier = placed.tiers.get(clean.id);\n                retiered = tierChanges(tree, placed.tiers, clean.id);\n'), 'refused, or the branch re-fitted');
    assert.ok(put.includes('            } else {\n                clean.accountTier = sanitize(prior).accountTier;\n            }'), "the parent as stored: the tier as stored, whatever the body says (a screen loaded before another session's move)");
    const batch = between(put, 'const [[upserted], ...lifts] = await db.batch([', ']);');
    assert.ok(batch.includes('db.insert(accounts).values({ ...mergedPut, orgId })'), 'one write: the account,');
    assert.ok(batch.includes('...dealLifts(orgId, made),\n'), 'the deals moved up (D22),');
    assert.ok(batch.includes('...tierWrites(orgId, retiered),\n'), 'and the tiers re-fitted under it — all or nothing');
    assert.ok(put.includes('const liftedDeals = lifts.slice(0, made.length).flat();'));
    assert.ok(put.includes('JSON.stringify({ account: upserted, renamed, retiered, liftedDeals })'), 'and handed back for the screen');
    const del = between(src, "if (event.httpMethod === 'DELETE') {", 'return { statusCode: 405');
    const unknown = del.indexOf("if (!target) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };");
    const read1 = del.indexOf('const tree = await orgTreeOf(orgId);');
    const delWrite = del.indexOf('const [storedKids, gone, ...written] = await db.batch([');
    assert.ok(unknown > del.indexOf('const holding = target ? await openDealOfAccount(orgId, target) : null;') && unknown < read1, 'an unknown id: 404 before anything is read or written');
    assert.ok(read1 > 0 && read1 < delWrite, 'what a lift re-fits below the lifted accounts is worked out before the write');
    assert.ok(del.includes('const below = liftedBelow(tree, id);'), 'J3: only the rows below a lifted account whose tier changes, each with the chain it stands on');
    assert.ok(!del.includes('tierWrites('), 'J3: no tier written by an id read before the write');
    const one = between(del, 'const [storedKids, gone, ...written] = await db.batch([', '            ]);');
    assert.ok(one.startsWith('const [storedKids, gone, ...written] = await db.batch([\n                db.select({ id: accounts.id, parentAccountId: accounts.parentAccountId, accountTier: accounts.accountTier })\n                    .from(accounts).where(and(eq(accounts.parentAccountId, id), eq(accounts.orgId, orgId))),\n                db.delete(accounts).where(and(eq(accounts.id, id), eq(accounts.orgId, orgId))).returning(),\n'), "J3: each sub-account as stored — its parent and its tier, this org's alone — read in the batch before the delete; then the delete");
    assert.ok(one.includes('                ...below.map((b) => db.update(accounts).set({ accountTier: b.accountTier })\n                    .where(and(eq(accounts.orgId, orgId), eq(accounts.id, b.id), standsOn(orgId, b.chain)))\n                    .returning({ id: accounts.id, accountTier: accounts.accountTier })),\n'), 'J3: each account below re-fitted in this org, only while it stands on its chain');
    assert.ok(one.endsWith("                db.update(accounts)\n                    .set({ parentAccountId: null, accountTier: 'account' })\n                    .where(and(eq(accounts.parentAccountId, id), eq(accounts.orgId, orgId)))\n                    .returning({ id: accounts.id }),\n"), 'J3: the lift last — one update of what still names the deleted account, each an account (D18); after a delete that took nothing it lifts nothing');
    const stands = between(src, 'const standsOn = (orgId, [parentId, ...up]) => and(eq(accounts.parentAccountId, parentId), up.length\n', ';\n');
    assert.ok(stands.includes('    ? inArray(accounts.parentAccountId, db.select({ id: accounts.id }).from(accounts).where(and(eq(accounts.orgId, orgId), eq(accounts.id, parentId), standsOn(orgId, up))))\n    : undefined)'), "J3: its parent, and that one's own chain up to the deleted account, read in the statement, in this org");
    assert.equal(del.split('db.delete(accounts)').length - 1, 2, 'the clear, and the one delete in the batch — none of its own');
    assert.ok(del.includes("const promoted = written[written.length - 1];\n            const [deletedRow] = gone;\n            // Gone before this write (another session's delete, which lifted its sub-accounts\n            // itself): nothing was written — a 404, as for any id not found.\n            if (!deletedRow) return { statusCode: 404"), "404 when the batch's delete took nothing");
    assert.ok(del.includes("const retiered = [...children.filter((c) => c.accountTier !== 'account').map((c) => ({ id: c.id, accountTier: 'account' })), ...written.slice(0, -1).flat()];"), 'what it wrote, for the screen: the lifted that were not accounts, and each row below it re-fitted');
    assert.ok(del.includes('const children = storedKids.filter((c) => promotedIds.has(c.id));'), 'the sub-accounts the promotion took, as stored before');
    assert.ok(del.includes('JSON.stringify({ success: true, deleted: deletedRow, children, promoted: promoted.length, retiered })'), 'the row as stored and its sub-accounts as stored before: the Undo re-sends exactly these');
});

test('accountParent.js is pure: it imports only pickLink.js (netlify/functions/accounts.mjs imports it, so the server runs the rail\'s own rule)', () => {
    const src = read('src/utils/accountParent.js');
    assert.deepEqual([...src.matchAll(/^import .* from '(.+)';$/gm)].map((m) => m[1]), ['./pickLink.js']);
    assert.ok(!/\b(React|window|document|localStorage|fetch)\b/.test(src.replace(/\/\/.*$/gm, '')), 'no React, no DOM, no network');
    assert.ok(!/depthOf|getTierFromDepth/.test(src), 'no tier from a depth (D21)');
});

test('the suites: this file is graded by the harness', () => {
    // The SUITES value itself, never the whole harness: a comment there naming this file met the old pin (§0.204 review P1).
    const suites = read('scripts/mutate-import.mjs').match(/^const SUITES = '([^'\n]*)';$/m)?.[1].split(' ') ?? [];
    assert.ok(suites.includes('tests/account-parent.test.mjs'), 'SUITES runs this file');
});
