// src/utils/dealScore.js
//
// A deal's score: its chance of winning, 0-100 (AI scoring batch 2A; docs/design/deal-score — Jeff, 17 Nov, "All
// recommended": Q2 a chance of winning, Q3 in the health score's place, Q4 on the server, Q5 fixed at 20). Pure, so
// the server (src's _dealScore.mjs keeps it on the deal), the nightly pass, Train now and the suite run one rule.
//
// THE START (every org, from its first deal): the stage's funnel weight (settings.funnelStages; 30 for a stage the
// list does not hold — App.jsx getWinProbability's default), moved down by the health rules the app's health score has
// always applied: each rule's points off 100 become that share off the weight. A deal with nothing wrong scores its
// stage's weight; the bands read as the health score's did (Healthy at 75% of the weight or more, At Risk at 50%).
//
// THE LEARNED PART (an org with 20 teaching deals or more): a logistic regression on the org's own closed deals,
// each measured as it stood on its last open day — the activities, stage moves and close-date moves dated before
// that day, never the close itself (the plan's guardrail "Measured as the deal was"). Its share grows with the
// teaching deals: (n − 20) ÷ ((n − 20) + 30), none below 20 (the plan's curve).

import { calendarDays, daysSince, inDaysWords } from './dateLocal.js';
import { activityHealth } from './dealHealth.js';
import { activityContactIds } from './dealEngagement.js';
import { fitLogistic, predictLogistic, contributions, heldOutAccuracy } from './logistic.js';

export const WON = 'Closed Won';
export const LOST = 'Closed Lost';
const isClosed = (stage) => stage === WON || stage === LOST;

// The plan's constants (Q5: fixed — no Admin threshold).
export const MIN_TEACHING = 20;
export const SHARE_HALF = 30;
export const DEFAULT_STAGE_WEIGHT = 30;
// Won deals with a history an org needs before next steps compare a deal with its wins (AI scoring batch 3, Q1).
export const COMPARE_WINS = 10;

// The learned model's share of the score, for n teaching deals.
export function learnedShare(n) {
    const k = Number(n) - MIN_TEACHING;
    return Number.isFinite(k) && k > 0 ? k / (k + SHARE_HALF) : 0;
}

// A stage's funnel weight, 0-100, from the org's funnelStages.
export function stageWeightOf(stage, funnelStages) {
    const s = (Array.isArray(funnelStages) ? funnelStages : []).find((f) => (typeof f === 'string' ? f : f?.name) === stage);
    const w = Number(s?.weight);
    return s && typeof s === 'object' && Number.isFinite(w) ? Math.max(0, Math.min(100, w)) : DEFAULT_STAGE_WEIGHT;
}

const isDayText = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v);
const dayOf = (v) => (isDayText(v) ? v.slice(0, 10) : null);

// The health rules, as the app's health score applied them (App.jsx before batch 2A; state §0.240, §0.244), on `today` (a day). Each
// rule: { penalty, reason } — a reason with no penalty is said, and takes nothing.
// The deal window's day counts and the bell's are the member's; the server's are UTC's (OPEN_ITEMS §4.2, filed).
export function healthRules(deal, activities, today) {
    const rules = [];
    const acts = Array.isArray(activities) ? activities : [];
    if (acts.length) {
        // The last day logged; an activity whose day does not read says nothing of the days (state §0.240).
        const days = acts.map((a) => dayOf(a?.date)).filter(Boolean).sort();
        const activity = activityHealth(days.length ? daysSince(days[days.length - 1], today) : null);
        if (activity) rules.push(activity);
    } else {
        rules.push({ penalty: 30, reason: 'No activities logged for this opportunity' });
    }
    const stageDay = dayOf(deal?.stageChangedDate);
    const inStage = stageDay ? daysSince(stageDay, today) : null;
    if (inStage != null) {
        if (inStage > 60) rules.push({ penalty: 30, reason: 'Stuck in current stage for ' + inStage + ' days' });
        else if (inStage > 30) rules.push({ penalty: 15, reason: 'In current stage for ' + inStage + ' days' });
        else rules.push({ penalty: 0, reason: 'In current stage for ' + inStage + ' days' });
    }
    // Signed: today is 0, overdue only from the next morning.
    const closeDay = dayOf(deal?.forecastedCloseDate);
    const daysToClose = closeDay ? calendarDays(today, closeDay) : null;
    if (daysToClose != null) {
        if (daysToClose < 0) rules.push({ penalty: 35, reason: 'Close date is ' + Math.abs(daysToClose) + ' days overdue' });
        // The close day itself reads "today", never "in 0 days" (state §0.240).
        else if (daysToClose < 7 && acts.length === 0) rules.push({ penalty: 20, reason: 'Closing ' + inDaysWords(daysToClose) + ' with no activities' });
        else if (daysToClose < 14) rules.push({ penalty: 0, reason: daysToClose === 0 ? 'Close date is today' : 'Close date approaching in ' + daysToClose + (daysToClose === 1 ? ' day' : ' days') });
    }
    return rules;
}

// The start: the stage's weight, each rule's points off 100 taken as that share off it. → { score, weight, factors }
// where each factor is { text, effect } — effect in points of the score (negative takes away).
export function rulesScore(deal, activities, funnelStages, today) {
    const weight = stageWeightOf(deal?.stage, funnelStages);
    const rules = healthRules(deal, activities, today);
    const health = Math.max(0, 100 - rules.reduce((s, r) => s + r.penalty, 0));
    const score = Math.round((weight * health) / 100);
    const factors = rules.map((r) => ({ text: r.reason, effect: -Math.round((weight * r.penalty) / 100) }));
    return { score, weight, health, factors };
}

// How a score reads against its stage's weight — the health score's bands, carried over.
export function statusOf(score, weight) {
    const ratio = weight > 0 ? score / weight : score / 100;
    if (ratio >= 0.75) return 'Healthy';
    if (ratio >= 0.5) return 'At Risk';
    return 'Critical';
}

// ── What the screens show ───────────────────────────────────────────────────────────────────────────────────────

// A feature switch of Settings → Features: on unless the org turned it off (FeaturesDetail.jsx reads it the same way).
export const featureOn = (flags, flagId) => !(flags && typeof flags === 'object' && flags[flagId] === false);

const TONE = { Healthy: 'ok', 'At Risk': 'warn', Critical: 'danger' };

// A deal's kept score as a screen draws it (Jeff, 17 Nov: Q8 "Win chance"), or null — a closed deal, a deal the server
// has not scored yet, or anything that is not a score. tone: the T token the dot takes (ok | warn | danger).
export function dealScoreView(deal) {
    const s = deal?.dealScore;
    const score = Number(s?.score);
    if (!s || typeof s !== 'object' || !Number.isFinite(score)) return null;
    const status = TONE[s.status] ? s.status : statusOf(score, Number(s.weight) || DEFAULT_STAGE_WEIGHT);
    const factors = (Array.isArray(s.factors) ? s.factors : []).filter((f) => f && typeof f.text === 'string' && f.text);
    return {
        score,
        status,
        tone: TONE[status],
        percent: `${score}%`,
        words: `Win chance ${score}% — ${status} for ${deal?.stage || 'its stage'}`,
        factors,
        learned: Number.isFinite(Number(s.learned)),
    };
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// Where the org's model stands, in Settings' words (the plan's guardrail: "learning from 37 closed deals", and the
// accuracy on deals held out — never on the deals it trained on). `model` is settings.dealModel, or none.
export function standingWords(model, at = (iso) => new Date(iso).toLocaleDateString()) {
    if (!model || typeof model !== 'object') return 'Not looked at yet — the nightly pass, or Train now, reads this workspace’s closed deals.';
    const n = Number(model.n) || 0;
    const left = Number(model.leftOut) || 0;
    const leftWords = left ? ` ${plural(left, 'closed deal does', 'closed deals do')} not teach: nothing about ${left === 1 ? 'it' : 'them'} is known from before the close (no activity, no stage move — an import, say).` : '';
    if (!model.trained) {
        const why = n >= MIN_TEACHING ? ' — they hold only one outcome; it needs wins and losses' : ` — the model starts at ${MIN_TEACHING}`;
        return `Learning from ${plural(n, 'closed deal', 'closed deals')}${why}.${leftWords} Until then each deal’s win chance is its stage’s weight, moved down by the health rules.`;
    }
    const a = model.accuracy || {};
    const share = Math.round(learnedShare(n) * 100);
    return `Trained on ${plural(n, 'closed deal', 'closed deals')} · right on ${a.correct ?? 0} of ${a.total ?? 0} it did not train on · the model makes ${share}% of each score, the stage and health rules the rest${model.trainedAt ? ` · last trained ${at(model.trainedAt)}` : ''}.${leftWords}`;
}

// Toward next steps compared with this workspace's wins (AI scoring batch 3, Q1) — none before the first nightly pass
// or Train now that counts them.
export function comparisonWords(model) {
    if (!model || typeof model !== 'object' || !Number.isFinite(Number(model.wonTeaching))) return null;
    const w = Number(model.wonTeaching);
    return w >= COMPARE_WINS
        ? `${plural(w, 'won deal', 'won deals')} with a history — enough for Claude's next steps to compare a deal with this workspace's wins.`
        : `${w} of ${COMPARE_WINS} won deals with a history so far — once there are ${COMPARE_WINS}, Claude's next steps compare a deal with this workspace's wins.`;
}

// What Train now said (train-deal-model.mjs's answer).
export function trainDealWords(answer) {
    const d = answer || {};
    const scored = Number.isFinite(Number(d.dealsUpdated)) ? ` ${plural(Number(d.dealsUpdated), 'deal', 'deals')} re-scored.` : '';
    if (!d.dealModel) return { ok: false, text: `Nothing was trained — this workspace has no settings saved yet.${scored}` };
    if (d.modelWritten === false) return { ok: false, text: `Another pass trained the model first — this shows what it wrote.${scored}` };
    return { ok: !!d.ok, text: `${d.ok ? 'Trained.' : 'Not trained yet.'} ${standingWords(d.dealModel)}${scored}` };
}

// Two kept scores are the same score when they differ only in when they were made — compared key by key, in any key
// order: the database hands a jsonb object back with its keys in its own order (by length, then name), never the order
// a score was built in, so text compared made every stored score read as changed and every pass rewrote every deal
// (found in §0.256's browser check).
const canonical = (v) => (Array.isArray(v) ? v.map(canonical)
    : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical(v[k])])) : v);
export function sameDealScore(a, b) {
    if (a == null || b == null) return a == null && b == null;
    // The band-change notes (2C) are when it moved, not what it is — left out as the time is.
    const { scoredAt: _a, previousStatus: _pa, statusChangedAt: _ca, ...x } = a;
    const { scoredAt: _b, previousStatus: _pb, statusChangedAt: _cb, ...y } = b;
    return JSON.stringify(canonical(x)) === JSON.stringify(canonical(y));
}

// ── The band's moves (AI scoring batch 2C; docs/design/deal-score/DESIGN-2C.md — Jeff, 17 Nov, Q1: "A fall into
// Critical") ───────────────────────────────────────────────────────────────────────────────────────────────────

// The score a write keeps, with the band's last move noted: a new band records the one it left and when; the same band
// carries the last move on. A deal with no score (closed) keeps none.
export function withBandChange(prev, next, now = new Date()) {
    if (!next) return next;
    if (prev && typeof prev === 'object' && prev.status && prev.status !== next.status) {
        return { ...next, previousStatus: prev.status, statusChangedAt: now.toISOString() };
    }
    if (prev && typeof prev === 'object' && prev.status === next.status && prev.statusChangedAt) {
        return { ...next, previousStatus: prev.previousStatus ?? null, statusChangedAt: prev.statusChangedAt };
    }
    return next;
}

// Whether a deal's win chance fell into Critical from a better band since `sinceMs` — the alert's rule. A deal already
// Critical, or first scored Critical, did not fall.
export function fellToCritical(dealScore, sinceMs) {
    const s = dealScore;
    if (!s || s.status !== 'Critical') return false;
    if (s.previousStatus !== 'Healthy' && s.previousStatus !== 'At Risk') return false;
    const at = Date.parse(s.statusChangedAt || '');
    return Number.isFinite(at) && at > sinceMs;
}

// The public API's win_chance (2C, Q2): the kept score's number, band, stage weight and time — none for a closed deal
// or one not yet scored.
export const winChanceOf = (s) => (s && typeof s === 'object' && Number.isFinite(Number(s.score))
    ? { score: Number(s.score), status: s.status || null, stage_weight: Number.isFinite(Number(s.weight)) ? Number(s.weight) : null, scored_at: s.scoredAt || null }
    : null);

// The manager is copied when the win chance is below a quarter of its stage's usual.
export const managerCopied = (dealScore) => Number(dealScore?.score) < Number(dealScore?.weight) / 4;

// What the alert says, by every channel.
export function fallWords(dealScore, dealName, stage) {
    const pct = `${dealScore.score}%`;
    return {
        subject: `Win chance fell to Critical: ${dealName} — ${pct} (the stage's usual is ${dealScore.weight}%)`,
        log: `Win chance ${pct} (Critical, was ${dealScore.previousStatus})`,
        why: (Array.isArray(dealScore.factors) ? dealScore.factors : []).find((f) => f && f.text && Number(f.effect) < 0)?.text || 'Its win chance has fallen',
        band: `Critical for ${stage}`,
    };
}

// The app's deals with the scores an answer handed back (an activity's save moves its deal's score on the server —
// activities.mjs answers `dealScores: { [dealId]: score | null }`). The same list when nothing in it moved.
export function withDealScores(deals, scores) {
    if (!Array.isArray(deals) || !scores || typeof scores !== 'object' || Array.isArray(scores)) return deals;
    let moved = false;
    const out = deals.map((d) => {
        if (!d || !Object.prototype.hasOwnProperty.call(scores, d.id)) return d;
        moved = true;
        return { ...d, dealScore: scores[d.id] };
    });
    return moved ? out : deals;
}

// ── The learned part ────────────────────────────────────────────────────────────────────────────────────────────

// The day a closed deal was last open: the day of its last move into a closed stage, else its won or lost date.
// null when none reads — such a deal cannot be measured as it was, and does not teach.
export function lastOpenDay(deal) {
    const history = Array.isArray(deal?.stageHistory) ? deal.stageHistory : [];
    for (let i = history.length - 1; i >= 0; i--) {
        if (isClosed(history[i]?.stage) && dayOf(history[i]?.date)) return dayOf(history[i].date);
    }
    return dayOf(deal?.stage === WON ? deal?.wonDate : deal?.lostDate);
}

// What the deal held strictly before `asOf`: its activities, its stage moves, its close-date moves, and the stage it
// stood in. Nothing dated on or after the day counts — the close's own save writes its stage, close date and often an
// activity on that day.
export function dealAsOf(deal, activities, asOf) {
    const before = (d) => !!d && d < asOf;
    const acts = (activities || []).filter((a) => before(dayOf(a?.date)));
    const moves = (Array.isArray(deal?.stageHistory) ? deal.stageHistory : []).filter((h) => before(dayOf(h?.date)) && !isClosed(h?.stage));
    const closeMoves = (Array.isArray(deal?.closeDateHistory) ? deal.closeDateHistory : []).filter((h) => before(dayOf(h?.date)));
    const lastMove = moves[moves.length - 1];
    const stage = isClosed(deal?.stage) ? (lastMove?.stage || exitStage(deal)) : deal?.stage;
    const stageSince = lastMove ? dayOf(lastMove.date) : (isClosed(deal?.stage) ? dayOf(deal?.createdDate) : (dayOf(deal?.stageChangedDate) || dayOf(deal?.createdDate)));
    return { acts, moves, closeMoves, stage, stageSince };
}
function exitStage(deal) {
    const h = Array.isArray(deal?.stageHistory) ? deal.stageHistory : [];
    for (let i = h.length - 1; i >= 0; i--) if (isClosed(h[i]?.stage)) return h[i]?.prevStage || null;
    return null;
}

// Whether a closed deal teaches: something about it is known from before its close — an activity or a stage move
// dated before its last open day (Jeff, 17 Nov: DESIGN.md §6, R2). An imported closed deal with neither does not.
export function teaches(deal, activities) {
    if (!isClosed(deal?.stage)) return false;
    const asOf = lastOpenDay(deal);
    if (!asOf) return false;
    const { acts, moves } = dealAsOf(deal, activities, asOf);
    return acts.length > 0 || moves.length > 0;
}

const median = (xs) => {
    const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
    if (!s.length) return null;
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// The org's usual: each open stage's median days spent (from stage moves: a stage's days run from the move into it to
// the next move), and the median revenue of its closed deals. Read from the org's deals alone.
export function orgUsual(deals) {
    const spent = {};
    for (const d of deals || []) {
        const h = (Array.isArray(d?.stageHistory) ? d.stageHistory : []).filter((e) => dayOf(e?.date));
        for (let i = 0; i + 1 < h.length; i++) {
            const n = calendarDays(dayOf(h[i].date), dayOf(h[i + 1].date));
            if (n != null && n >= 0 && h[i].stage && !isClosed(h[i].stage)) (spent[h[i].stage] = spent[h[i].stage] || []).push(n);
        }
    }
    const stageDays = {};
    for (const [stage, xs] of Object.entries(spent)) stageDays[stage] = median(xs);
    const revenue = median((deals || []).filter((d) => isClosed(d?.stage)).map((d) => Number(d?.arr)).filter((v) => Number.isFinite(v) && v > 0));
    return { stageDays, revenue };
}

// The features, in order, and the words a factor says for each (a positive pull raises the chance).
export const FEATURES = Object.freeze([
    { key: 'stageWeight',   up: 'Further along the funnel',                          down: 'Early in the funnel' },
    { key: 'stageDays',     up: 'Moving through this stage faster than usual here',   down: 'In this stage longer than usual here' },
    { key: 'pace',          up: 'Earlier stages went faster than usual here',         down: 'Earlier stages went slower than usual here' },
    { key: 'recent14',      up: 'Activity in the last 14 days',                       down: 'Little activity in the last 14 days' },
    { key: 'recent30',      up: 'Activity in the last 30 days',                       down: 'Little activity in the last 30 days' },
    { key: 'meetings30',    up: 'Meetings in the last 30 days',                       down: 'No meetings in the last 30 days' },
    { key: 'engaged30',     up: 'Several people engaged in the last 30 days',         down: 'Few people engaged in the last 30 days' },
    { key: 'silence',       up: 'Recent contact',                                     down: 'Days since the last activity' },
    { key: 'revenue',       up: 'Revenue near what this org usually wins',            down: 'Revenue far from what this org usually closes' },
    { key: 'closeMoves',    up: 'Close date held steady',                             down: 'Close date moved' },
]);

// A meeting, by its type's words — the org's own activity types vary (Settings), so the type is read, not listed.
const isMeeting = (a) => /meet|demo|visit|presentation|onsite|on-site/i.test(String(a?.type || ''));

// One deal's features as it stood on `asOf` (a day): the deal's own activities, the org's usual and funnel.
export function dealFeatures(deal, activities, asOf, usual, funnelStages) {
    const { acts, moves, closeMoves, stage, stageSince } = dealAsOf(deal, activities, asOf);
    const daysBack = (a) => calendarDays(dayOf(a.date), asOf);
    const within = (n) => acts.filter((a) => { const d = daysBack(a); return d != null && d <= n; });
    const recent30 = within(30);
    const inStage = stageSince ? Math.max(0, calendarDays(stageSince, asOf) ?? 0) : null;
    const usualDays = usual?.stageDays?.[stage];
    const ratio = (days, base) => Math.min(5, days / Math.max(1, base || 30));
    // Earlier stages' pace: each finished stage's days against its usual, averaged.
    const paces = [];
    for (let i = 0; i + 1 < moves.length; i++) {
        const n = calendarDays(dayOf(moves[i].date), dayOf(moves[i + 1].date));
        if (n != null && n >= 0) paces.push(ratio(n, usual?.stageDays?.[moves[i].stage]));
    }
    const last = acts.map((a) => dayOf(a.date)).sort().pop();
    const silence = last ? Math.min(60, Math.max(0, calendarDays(last, asOf) ?? 60)) : 60;
    const arr = Number(deal?.arr);
    const revenue = Number.isFinite(arr) && arr > 0 && usual?.revenue > 0 ? Math.min(3, Math.abs(Math.log(arr / usual.revenue))) : 0;
    const engaged = new Set(recent30.flatMap(activityContactIds));
    return [
        stageWeightOf(stage, funnelStages) / 100,
        inStage == null ? 1 : -ratio(inStage, usualDays),
        paces.length ? -(paces.reduce((s, p) => s + p, 0) / paces.length) : -1,
        Math.log1p(within(14).length),
        Math.log1p(recent30.length),
        Math.log1p(recent30.filter(isMeeting).length),
        Math.min(5, engaged.size),
        -silence / 60,
        -revenue,
        -Math.min(5, closeMoves.length),
    ];
}

// Train the org's model on its closed deals. `activitiesByDeal`: the org's activities by deal id. → the model a
// settings key keeps, never null: { n, trained, accuracy, usual, fit?, trainedAt, checkedAt, leftOut }.
//   n          teaching deals (closed, something known before the close)
//   leftOut    closed deals that do not teach
//   trained    whether a fit was made (n ≥ 20, and both outcomes among them)
//   accuracy   { correct, total } on deals held out of training (5-fold), when trained
export function trainDealModel(deals, activitiesByDeal, funnelStages, now = new Date()) {
    const closed = (deals || []).filter((d) => isClosed(d?.stage));
    const teaching = closed.filter((d) => teaches(d, activitiesByDeal[d.id] || []));
    const usual = orgUsual(deals);
    const at = now.toISOString();
    // Won deals with a history (AI scoring batch 3, Q1): the comparisons from wins come once an org has COMPARE_WINS.
    const base = { n: teaching.length, leftOut: closed.length - teaching.length, wonTeaching: teaching.filter((d) => d.stage === WON).length, trained: false, usual, checkedAt: at };
    if (teaching.length < MIN_TEACHING) return base;
    const rows = teaching.map((d) => ({ id: d.id, features: dealFeatures(d, activitiesByDeal[d.id] || [], lastOpenDay(d), usual, funnelStages), label: d.stage === WON ? 1 : 0 }));
    const fit = fitLogistic(rows);
    if (!fit) return base;
    return { ...base, trained: true, fit, accuracy: heldOutAccuracy(rows), featureKeys: FEATURES.map((f) => f.key), trainedAt: at };
}

// The model's factors for one deal: the three largest pulls, in words, with their effect in points.
function learnedFactors(model, features, share) {
    const pulls = contributions(model.fit, features).map((c, j) => ({ c, j }));
    return pulls.filter((p) => Math.abs(p.c) >= 0.15).sort((a, b) => Math.abs(b.c) - Math.abs(a.c)).slice(0, 3)
        .map(({ c, j }) => ({ text: c > 0 ? FEATURES[j].up : FEATURES[j].down, effect: Math.round(c * 10 * share), learned: true }));
}

// A deal's score on `today` (a day): the start, blended with the org's model by its share. null for a closed deal —
// its outcome is known. → { score, status, weight, rules, learned, share, factors, scoredAt, modelTrainedAt }
export function scoreDeal(deal, activities, { funnelStages, model, today, now = new Date() }) {
    if (!deal || isClosed(deal.stage)) return null;
    const start = rulesScore(deal, activities, funnelStages, today);
    const usable = model?.trained && model?.fit && Array.isArray(model.featureKeys) && model.featureKeys.length === FEATURES.length;
    const share = usable ? learnedShare(model.n) : 0;
    let learned = null;
    let factors = start.factors;
    if (usable && share > 0) {
        const features = dealFeatures(deal, activities, nextDay(today), model.usual, funnelStages);
        const p = predictLogistic(model.fit, features);
        if (p != null && Number.isFinite(p)) {
            learned = Math.round(p * 100);
            factors = [...learnedFactors(model, features, share), ...start.factors];
        }
    }
    const score = learned == null ? start.score : Math.round((1 - share) * start.score + share * learned);
    return {
        score,
        status: statusOf(score, start.weight),
        weight: start.weight,
        rules: start.score,
        learned,
        share: learned == null ? 0 : Math.round(share * 100) / 100,
        factors,
        scoredAt: now.toISOString(),
        modelTrainedAt: learned == null ? null : (model.trainedAt || null),
    };
}

// An open deal is measured as of the end of today: everything dated today counts. A day plus one calendar day — day
// arithmetic on the day's own parts, never an instant read back as a day.
export function nextDay(day) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day || ''));
    if (!m) return day;
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + 1));
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
