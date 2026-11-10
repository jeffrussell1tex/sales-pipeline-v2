/**
 * ai-score.mjs — AI-powered deal health scoring via Anthropic API
 *
 * POST /.netlify/functions/ai-score
 * Body: { opportunityId }
 *
 * Returns:
 *   { score, verdict, headline, signals, recommendation, scoredAt, history }
 *   — the score as the deal keeps it, its earlier scores in `history` (state §0.188)
 *
 * Requires:
 *   ANTHROPIC_API_KEY in Netlify environment variables
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
// The org's BYOK key, else the site's — one helper for every Anthropic call
// (state §0.141; this file carried its own copy of the decrypt before).
import { resolveAnthropicKey } from './_aiKey.mjs';
// The score's shape, the server's and the deal window's (state §0.188).
import { withHistory, cutAtWord } from '../../src/utils/aiScore.js';
// The Admin's model and who may ask (state §0.238); one attempt's request and what its answer means.
import { modelOf, fallbackOf, modelLabel, mayUseAi, aiAccessWords } from '../../src/utils/aiModels.js';
import { MIN_ATTEMPT_MS, attemptTime, scoreRequestBody, attemptOutcome, causeWords } from '../../src/utils/aiCall.js';
// A deal's people and who was engaged, by contact id — the deal window's own rule (state §0.192).
import { activityContactIds, dealCommittee, engagedContacts, engagedLabel, personLabel } from '../../src/utils/dealEngagement.js';

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

        // Prefer org-level BYOK key; fall back to shared env var
        const [orgSettingsRow] = await db.select({ extra: settings.extra })
            .from(settings)
            .where(eq(settings.orgId, orgId))
            .limit(1);
        const { apiKey, usingOrgKey } = resolveAnthropicKey(orgSettingsRow?.extra);

        // "Available to" (state §0.238 — Jeff, 9 Nov: decision 2; Q3 "Asking Claude only"): a role it leaves
        // out asks nothing of Claude and is not handed the cached score either; the score a deal keeps still
        // shows on every screen. Absent reads as All roles; a value the list does not hold, as Admin only.
        const aiSettings = orgSettingsRow?.extra?.aiSettings;
        if (!mayUseAi(auth.userRole, aiSettings)) return { statusCode: 403, headers, body: JSON.stringify({ error: aiAccessWords(aiSettings), code: 'ai_role' }) };

        if (!apiKey) return { statusCode: 503, headers, body: JSON.stringify({ error: 'No Anthropic API key configured. Add your key in Settings → AI Features, or contact your administrator.' }) };

        // ── Check feature gate (reuse orgSettingsRow fetched above) ─────────
        const aiEnabled = orgSettingsRow?.extra?.aiScoringEnabled ?? false;
        if (!aiEnabled) return { statusCode: 200, headers, body: JSON.stringify({ disabled: true }) };

        // ── Return cached score if fresh (< 24h) and not forcing refresh ──────
        const cached = opp.aiScore;
        if (!forceRefresh && cached?.scoredAt) {
            const age = Date.now() - new Date(cached.scoredAt).getTime();
            if (age < 24 * 60 * 60 * 1000) {
                return { statusCode: 200, headers, body: JSON.stringify({ ...cached, fromCache: true }) };
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

        const prompt = `You are an expert B2B sales analyst. Score this sales opportunity and provide coaching.

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

Analyze this deal and respond with ONLY a valid JSON object — no markdown, no explanation, just the JSON:

{
  "score": <integer 0-100>,
  "verdict": <"Strong" | "On Track" | "At Risk" | "Critical">,
  "headline": <one sentence, max 120 chars, specific to this deal>,
  "signals": [
    { "text": <specific observation, max 100 chars>, "sentiment": <"positive" | "warning" | "negative"> }
  ],
  "recommendation": <one concrete next action, max 150 chars>
}

Scoring guide:
- 80-100: Strong — active, multi-threaded, on pace
- 60-79: On Track — progressing but has minor gaps
- 40-59: At Risk — stalling signals, needs attention  
- 0-39: Critical — multiple red flags, at risk of being lost

Provide 3-5 signals. Be specific — reference actual days, stage names, contact names from the data. Avoid generic statements.`;

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
        const keyWords = usingOrgKey ? 'the workspace’s key' : 'the site key';
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
        const scoreData = {
            // A score of 0 is a score (it read as 50); only one that is not a number reads as 50.
            score:          Number.isFinite(parseInt(parsed.score, 10)) ? Math.max(0, Math.min(100, parseInt(parsed.score, 10))) : 50,
            verdict:        ['Strong','On Track','At Risk','Critical'].includes(parsed.verdict) ? parsed.verdict : 'At Risk',
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
            detail: `${kept.model} · ${keyWords} · score ${scoreData.score} (${scoreData.verdict})${fellBack}${noAction}`,
        });
        return { statusCode: 200, headers, body: JSON.stringify({ ...stored, usingOrgKey }) };

    } catch (err) {
        console.error('ai-score error:', err.message);
        return { statusCode: 500, headers, body: serverErrorBody(err, 'ai-score') };
    }
};
