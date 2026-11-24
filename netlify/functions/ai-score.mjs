/**
 * ai-score.mjs — Claude explains a deal's win chance, via Anthropic API (AI scoring batch 2B, state §0.257: the number
 * is the server's — src/utils/dealScore.js; Claude's own 0-100 retired, Jeff 17 Nov)
 *
 * POST /.netlify/functions/ai-score
 * Body: { opportunityId, forceRefresh }
 *
 * Returns:
 *   { headline, signals, recommendation, model, scoredAt, explains: { score, status, scoredAt }, history }
 *   — the explanation as the deal keeps it; Claude's own earlier scores in `history` (state §0.188; src/utils/aiScore.js).
 *   A closed deal: 400 { code: 'closed' }, nothing sent.
 *
 * Requires:
 *   the org's own Anthropic key (Settings → Features & AI) — with none, or one that cannot be read, nothing is sent: a
 *   503 with code 'no_key' or 'key_unreadable' (_aiKey.mjs, state §0.293)
 *
 * The score is cached on the opportunity record (aiScore JSONB column)
 * and returned immediately on subsequent requests unless forceRefresh=true.
 *
 * Feature gate: checks settings.aiScoringEnabled before running.
 * If false, returns { disabled: true }.
 *
 * Who: a writer (requireWrite), on a deal they may edit — its rep, anyone
 * while it is unassigned, an Admin or a Manager (assertOwnership; §0.169) —
 * in a role the org's "Available to" names (src/utils/aiModels.js; §0.238).
 *
 * The model: the Admin's choice (aiSettings.model, read through modelOf — a
 * stored id off the list is the default, Haiku 5.5), asked once more on the
 * fallback when the first answer is busy, missing, refused or unreadable
 * (src/utils/aiCall.js; state §0.238). The score keeps the model that answered;
 * one audit row each way names every attempt.
 */

import { db } from '../../db/index.js';
import { opportunities, activities, settings, contacts } from '../../db/schema.js';
import { eq, and, inArray } from 'drizzle-orm';
import { verifyAuth, requireWrite } from './auth.mjs';
import { serverErrorBody, auditAs, assertOwnership } from './_lib.mjs';
// The org's own key, or none (state §0.293) — one helper for every Anthropic call.
import { resolveAnthropicKey } from './_aiKey.mjs';
// The score's shape, the server's and the deal window's (state §0.188).
import { withHistory, cutAtWord } from '../../src/utils/aiScore.js';
// The Admin's model and who may ask (state §0.238); one attempt's request and what its answer means.
import { modelOf, fallbackOf, modelLabel, mayUseAi, aiAccessWords, AI_KEY_WORDS } from '../../src/utils/aiModels.js';
import { MIN_ATTEMPT_MS, attemptTime, scoreRequestBody, attemptOutcome, causeWords } from '../../src/utils/aiCall.js';
// A deal's people and who was engaged, by contact id — the deal window's own rule (state §0.192).
import { activityContactIds, dealCommittee, engagedContacts, engagedLabel, personLabel } from '../../src/utils/dealEngagement.js';
// The number is the deal's win chance, the server's (AI scoring batch 2B, state §0.257 — Jeff, 17 Nov, Q1: Claude's own
// number retires now); Claude explains it. It is worked out again here, so Claude explains the number as it stands.
import { rescoreDeals } from './_dealScore.mjs';
// Each next action Claude gives is logged, and the nightly pass judges whether the deal moved after it (AI scoring
// batch 3 — Jeff, 17 Nov, Q1, Q2; recommendation-log.mjs judgePending).
import { recommendationLog } from '../../db/schema.js';
import { isExplanation } from '../../src/utils/aiScore.js';

const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export const handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
    if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    // The attempts share the function's time from here (state §0.238 — src/utils/aiCall.js BUDGET_MS).
    const startedAt = Date.now();

    const auth = await verifyAuth(event);
    if (auth.error) return { statusCode: auth.status || 401, headers, body: JSON.stringify({ error: auth.error }) };
    const { orgId } = auth;

    // A score is written to the deal and the deal goes to the model, so scoring
    // is a writer's, on a deal they may edit (state §0.169): any member could
    // score any deal in the org — a Technician or a read-only member, a rep
    // another rep's — and read its cached score.
    const forbidden = requireWrite(auth, event, headers);
    if (forbidden) return forbidden;

    try {
        const body = JSON.parse(event.body || '{}');
        const { opportunityId, forceRefresh } = body;
        if (!opportunityId) return { statusCode: 400, headers, body: JSON.stringify({ error: 'opportunityId required' }) };

        // ── Load opportunity ──────────────────────────────────────────────────
        const [opp] = await db.select().from(opportunities)
            .where(and(eq(opportunities.id, opportunityId), eq(opportunities.orgId, orgId)));
        if (!opp) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Opportunity not found' }) };
        // The deal's rep — anyone, while it is unassigned — or an Admin or a
        // Manager: the edit policy. Asked before the key and the switch, so a
        // deal that is not yours is refused whatever the org's setup.
        const notYours = await assertOwnership({ table: opportunities, entity: 'opportunity', id: opportunityId, orgId, userId: auth.userId, userRole: auth.userRole, headers, row: opp });
        if (notYours) return notYours;

        // The org's own key, from its own settings row.
        const [orgSettingsRow] = await db.select({ extra: settings.extra })
            .from(settings)
            .where(eq(settings.orgId, orgId))
            .limit(1);
        const { apiKey, keyProblem } = resolveAnthropicKey(orgSettingsRow?.extra);

        // "Available to" (state §0.238 — Jeff, 9 Nov: decision 2; Q3 "Asking Claude only"): a role it leaves
        // out asks nothing of Claude and is not handed the cached score either; the score a deal keeps still
        // shows on every screen. Absent reads as All roles; a value the list does not hold, as Admin only.
        const aiSettings = orgSettingsRow?.extra?.aiSettings;
        if (!mayUseAi(auth.userRole, aiSettings)) return { statusCode: 403, headers, body: JSON.stringify({ error: aiAccessWords(aiSettings), code: 'ai_role' }) };

        // ── Check feature gate (reuse orgSettingsRow fetched above) ─────────
        // Before the key, as report-prompt.mjs asks (state §0.293): with the switch off, a missing key is not why.
        const aiEnabled = orgSettingsRow?.extra?.aiScoringEnabled ?? false;
        if (!aiEnabled) return { statusCode: 200, headers, body: JSON.stringify({ disabled: true }) };

        if (!apiKey) return { statusCode: 503, headers, body: JSON.stringify({ error: AI_KEY_WORDS[keyProblem], code: keyProblem }) };

        // ── The win chance Claude explains (2B): the deal's, as it stands now ─────────────────────────────────────────
        // A closed deal has none — nothing is sent. One that could not be worked out is said so, nothing sent.
        if (opp.stage === 'Closed Won' || opp.stage === 'Closed Lost') return { statusCode: 400, headers, body: JSON.stringify({ error: 'A closed deal has no win chance to explain.', code: 'closed' }) };
        // A failure is that too (state §0.292) — never last night's score, explained and kept as the one that stands.
        const scores = await rescoreDeals(orgId, [opportunityId], { orThrow: true }).catch(() => ({}));
        const win = scores[opportunityId] || null;
        if (!win || !Number.isFinite(Number(win.score))) return { statusCode: 503, headers, body: JSON.stringify({ error: 'The deal\'s win chance could not be worked out just now — try again in a minute.', code: 'no_win_chance' }) };

        // ── Return the cached explanation if fresh (< 24h) and not forcing refresh ──────
        // Only an explanation (2B): a score of Claude's own from before is no answer now (Q1), and is asked again. One that
        // explained another number still answers — the tab says the number moved, and Refresh asks (Q3).
        const cached = opp.aiScore;
        if (!forceRefresh && isExplanation(cached) && cached?.scoredAt) {
            const age = Date.now() - new Date(cached.scoredAt).getTime();
            if (age < 24 * 60 * 60 * 1000) {
                return { statusCode: 200, headers, body: JSON.stringify({ ...cached, fromCache: true, winChance: win }) };
            }
        }

        // ── Load activities for this opportunity ──────────────────────────────
        const oppActivities = await db.select()
            .from(activities)
            .where(and(eq(activities.opportunityId, opportunityId), eq(activities.orgId, orgId)));

        oppActivities.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        const recentActs = oppActivities.slice(0, 10);

        // ── Build scoring prompt ──────────────────────────────────────────────
        const today = new Date().toISOString().split('T')[0];
        const daysSince = (d) => d ? Math.floor((Date.now() - new Date(d + 'T12:00:00').getTime()) / 86400000) : null;

        const dealAge        = daysSince(opp.createdDate);
        const daysInStage    = daysSince(opp.stageChangedDate || opp.createdDate);
        const daysSilent     = recentActs[0]?.date ? daysSince(recentActs[0].date) : dealAge;
        const closeDate      = opp.forecastedCloseDate;
        const daysToClose    = closeDate
            ? Math.floor((new Date(closeDate + 'T12:00:00').getTime() - Date.now()) / 86400000)
            : null;
        const stageHistory   = (opp.stageHistory || []).map(h => `${h.prevStage || '?'} → ${h.stage} on ${h.date}`).join('; ');
        const activitySummary = recentActs.map(a => `${a.date}: ${a.type}${a.outcome ? ' (' + a.outcome + ')' : ''}${a.notes ? ' — ' + a.notes.slice(0, 80) : ''}`).join('\n');
        // The deal's people, and who its activities were logged with — by contact id (state
        // §0.192). This read activity.contactName, which no activity has, and told the model
        // "Contacts engaged: none" for every deal. Exactly the ids the deal and its activities
        // name are looked up, in this org only: an id from anywhere else names nobody. Each
        // engaged person carries their last touch and count (Jeff, 9 Oct).
        const namedIds = [...new Set([
            ...(Array.isArray(opp.contactIds) ? opp.contactIds : []),
            ...oppActivities.flatMap(activityContactIds),
        ].filter((id) => typeof id === 'string' && id))];
        const contactsIn = (ids) => db.select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName, title: contacts.title, mergedIntoId: contacts.mergedIntoId })
            .from(contacts)
            .where(and(eq(contacts.orgId, orgId), inArray(contacts.id, ids)));
        let directory = namedIds.length ? await contactsIn(namedIds) : [];
        // A duplicate merged into a contact merged on again: follow the chain, in this org,
        // as far as contactIndex does (five steps), so one person is never two.
        for (let n = 0; n < 5; n++) {
            const have = new Set(directory.map((c) => c.id));
            const next = [...new Set(directory.map((c) => c.mergedIntoId).filter((id) => id && !have.has(id)))];
            if (!next.length) break;
            directory = directory.concat(await contactsIn(next));
        }
        const listedPeople = dealCommittee(opp, directory, oppActivities).filter((p) => p.name);
        const engagedPeople = engagedContacts(oppActivities, directory).filter((p) => p.name);

        // The win chance and what made it (2B): its number, its band against the stage's weight, the rules part and the
        // model's part with its share, and every factor with its effect in points — the facts Claude explains from.
        const winLines = [
            `- Win chance: ${win.score}% — ${win.status} for ${opp.stage} (the stage's usual is ${win.weight}%)`,
            `- From the stage and the health rules: ${win.rules}%${Number.isFinite(Number(win.learned)) ? `; from this company's own closed deals: ${win.learned}%, weighted ${Math.round(Number(win.share) * 100)}% of the number` : ' (this company has too few closed deals for its own model yet)'}`,
            ...(Array.isArray(win.factors) ? win.factors : []).filter((f) => f && f.text).map((f) => `- Factor: ${f.text}${Number(f.effect) ? ` (${f.effect > 0 ? '+' : ''}${f.effect} points)` : ''}`),
        ].join('\n');
        const prompt = `You are an expert B2B sales analyst. This deal's win chance has already been worked out by the app. Explain it to the deal's rep and coach them. Do not give your own score or change the number.

WIN CHANCE (fixed):
${winLines}

DEAL DATA:
- Name: ${opp.opportunityName || opp.account || 'Unnamed'}
- Account: ${opp.account || '—'}
- Stage: ${opp.stage}
- ARR: $${parseFloat(opp.arr || 0).toLocaleString()}
- Deal age: ${dealAge !== null ? dealAge + ' days' : 'unknown'}
- Days in current stage: ${daysInStage !== null ? daysInStage + ' days' : 'unknown'}
- Days since last activity: ${daysSilent !== null ? daysSilent + ' days' : 'unknown'}
- Forecasted close: ${closeDate || 'not set'}${daysToClose !== null ? ` (${daysToClose > 0 ? daysToClose + ' days away' : Math.abs(daysToClose) + ' days PAST DUE'})` : ''}
- Contacts listed: ${listedPeople.length ? listedPeople.map(personLabel).join(', ') : 'none'}
- Contacts engaged: ${engagedPeople.length ? engagedPeople.map(engagedLabel).join(', ') : 'none'}
- Stage history: ${stageHistory || 'none'}
- Next steps: ${opp.nextSteps || 'none logged'}
- Notes: ${(opp.notes || '').slice(0, 200) || 'none'}

RECENT ACTIVITIES (last 10, newest first):
${activitySummary || 'No activities logged'}

Explain the win chance above and respond with ONLY a valid JSON object — no markdown, no explanation, just the JSON:

{
  "headline": <one sentence, max 120 chars: why this deal stands at its win chance>,
  "signals": [
    { "text": <one factor behind the number, in plain words, max 100 chars>, "sentiment": <"positive" | "warning" | "negative"> }
  ],
  "recommendation": <one concrete next action that would move the factor costing the most points, max 150 chars>
}

Provide 3-5 signals, each tied to a factor above. Be specific — reference actual days, stage names and contact names from the data. Avoid generic statements. Never state a different percentage or score.`;

        // ── Ask Claude: the Admin's model, then once more on the fallback (state §0.238) ──────
        // The same key and prompt both times. An attempt that is busy, finds no such model, refuses, stops
        // short or answers what does not read goes to the fallback; a refused key or request does not — the
        // second would fail alike (src/utils/aiCall.js attemptOutcome).
        const model = modelOf(aiSettings);
        const fallback = fallbackOf(aiSettings);
        const ask = async (m) => {
            try {
                const response = await fetch('https://api.anthropic.com/v1/messages', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': apiKey,
                        'anthropic-version': '2023-06-01',
                    },
                    body: JSON.stringify(scoreRequestBody(m, prompt)),
                    signal: AbortSignal.timeout(attemptTime(Date.now() - startedAt)),
                });
                if (!response.ok) return attemptOutcome({ status: response.status, text: await response.text().catch(() => '') });
                // A body that is not JSON is unreadable; a body still arriving when the time runs out is busy (the catch below).
                return attemptOutcome({ status: 200, json: await response.json().catch((e) => { if (e?.name === 'TimeoutError' || e?.name === 'AbortError') throw e; return null; }) });
            } catch (thrown) {
                return attemptOutcome({ thrown });
            }
        };
        const attempts = [{ model, outcome: await ask(model) }];
        // Once, where the cause allows and the function's time still holds an attempt (else the row names the one).
        if (!attempts[0].outcome.ok && attempts[0].outcome.retry && attemptTime(Date.now() - startedAt) >= MIN_ATTEMPT_MS) attempts.push({ model: fallback, outcome: await ask(fallback) });
        const last = attempts[attempts.length - 1];
        // The answer kept (state §0.240): the last that read, else the last that read but brought no next action — never
        // worse than one blank answer (Jeff, 10 Nov: "Keep score, no action"); none read, none kept.
        const kept = [...attempts].reverse().find((a) => a.outcome.ok) || [...attempts].reverse().find((a) => a.outcome.parsed) || null;
        const keyWords = 'the workspace’s key';
        const entityName = opp.opportunityName || opp.account || 'Unnamed';

        if (!kept) {
            // The deal still left the app, so the log says so — every attempt, its model and why it failed
            // (guide §18b42; OPEN_ITEMS §4.2: the cause reached only the console). Never the key.
            const tried = attempts.map((a) => `${a.model}: ${a.outcome.detail}`).join(' · ');
            console.error('ai-score: no score —', tried);
            await auditAs(orgId, auth.userId, {
                action: 'ai.deal_score_failed', entityType: 'opportunity', entityId: opportunityId, entityName,
                detail: `${keyWords} · ${tried}`,
            });
            return { statusCode: 502, headers, body: JSON.stringify({ error: causeWords(last.outcome.cause, modelLabel(last.model)), cause: last.outcome.cause }) };
        }
        const parsed = kept.outcome.parsed;

        // Validate and sanitize — each text ended at a whole word (state §0.238; OPEN_ITEMS §4.2).
        // Claude's explanation of the win chance (2B) — no number of its own; the number it explained kept beside it.
        const scoreData = {
            headline:       cutAtWord(parsed.headline, 120),
            // A signal with no words is dropped (state §0.240): it drew an empty chip.
            signals:        (Array.isArray(parsed.signals) ? parsed.signals : []).map(s => ({
                text:      cutAtWord(s?.text, 100),
                sentiment: ['positive','warning','negative'].includes(s?.sentiment) ? s.sentiment : 'warning',
            })).filter(s => s.text).slice(0, 5),
            recommendation: cutAtWord(parsed.recommendation, 150),
            // The model whose answer is kept — the chosen one, or the fallback after it failed.
            model:          kept.model,
            scoredAt:       new Date().toISOString(),
            // The win chance it explained, as it stood (Q3: a number moved since is said, and Refresh asks again).
            explains:       { score: Number(win.score), status: win.status || null, scoredAt: win.scoredAt || null },
        };

        // ── Cache score on opportunity record ─────────────────────────────────
        // The score it replaces heads its history (state §0.188): the deal window
        // showed a history nothing kept.
        const stored = withHistory(cached, scoreData);
        try {
            await db.update(opportunities)
                .set({ aiScore: stored, updatedAt: new Date() })
                .where(and(eq(opportunities.id, opportunityId), eq(opportunities.orgId, orgId)));
        } catch (cacheErr) {
            console.error('Failed to cache AI score:', cacheErr.message);
            // Non-fatal — still return the score
        }

        // The deal's data left the app for the model — the log says so, on the deal (§0.143).
        // The model that answered, and the one that failed first when it fell back (state §0.238).
        // Every attempt not kept, in order: the one before the kept answer 'after', the one after it 'then' (state §0.240 —
        // a blank first answer kept when the fallback failed).
        const fellBack = attempts.filter((a) => a !== kept).map((a) => ` · ${a === attempts[0] ? 'after' : 'then'} ${a.model}: ${a.outcome.detail}`).join('');
        const noAction = kept.outcome.ok ? '' : ' · kept with no next action';
        await auditAs(orgId, auth.userId, {
            action: 'ai.deal_scored', entityType: 'opportunity', entityId: opportunityId, entityName,
            detail: `${kept.model} · ${keyWords} · explained ${scoreData.explains.score}% (${scoreData.explains.status})${fellBack}${noAction}`,
        });
        // The next action Claude gave, logged once for this explanation (a cached answer gives none): the deal's rep, its stage,
        // the words and the win chance then. A failure to log leaves the explanation standing.
        if (kept.outcome.ok && scoreData.recommendation) {
            try {
                await db.insert(recommendationLog).values({
                    id: `nxs_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, orgId,
                    repName: opp.salesRep || 'Unassigned', actionType: 'next_step', opportunityId, dealName: entityName,
                    arrAtRisk: opp.arr ?? null, stage: opp.stage, signal: `${scoreData.recommendation} (win chance ${scoreData.explains.score}%)`,
                    outcome: 'pending', dismissedAt: new Date(),
                });
            } catch (e) { console.warn('ai-score: next step not logged —', e.message); }
        }

        // The win chance it explained rides along (a transport field, never kept in aiScore): the deal on screen takes it.
        return { statusCode: 200, headers, body: JSON.stringify({ ...stored, winChance: win }) };

    } catch (err) {
        console.error('ai-score error:', err.message);
        return { statusCode: 500, headers, body: serverErrorBody(err, 'ai-score') };
    }
};
