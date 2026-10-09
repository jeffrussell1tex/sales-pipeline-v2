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
 * while it is unassigned, an Admin or a Manager (assertOwnership; §0.169).
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
import { withHistory } from '../../src/utils/aiScore.js';
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

        // ── Call Anthropic API ────────────────────────────────────────────────
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 600,
                messages: [{ role: 'user', content: prompt }],
            }),
        });

        if (!response.ok) {
            const err = await response.text();
            console.error('Anthropic API error:', response.status, err);
            return { statusCode: 502, headers, body: JSON.stringify({ error: 'AI scoring service unavailable' }) };
        }

        const aiResult = await response.json();
        const rawText = aiResult.content?.[0]?.text || '';

        // Parse JSON — strip any accidental markdown fences
        let parsed;
        try {
            const clean = rawText.replace(/```json|```/g, '').trim();
            parsed = JSON.parse(clean);
        } catch {
            console.error('Failed to parse AI response:', rawText);
            return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to parse AI response' }) };
        }

        // Validate and sanitize
        const scoreData = {
            score:          Math.max(0, Math.min(100, parseInt(parsed.score) || 50)),
            verdict:        ['Strong','On Track','At Risk','Critical'].includes(parsed.verdict) ? parsed.verdict : 'At Risk',
            headline:       (parsed.headline || '').slice(0, 120),
            signals:        (parsed.signals || []).slice(0, 5).map(s => ({
                text:      (s.text || '').slice(0, 100),
                sentiment: ['positive','warning','negative'].includes(s.sentiment) ? s.sentiment : 'warning',
            })),
            recommendation: (parsed.recommendation || '').slice(0, 150),
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
        await auditAs(orgId, auth.userId, {
            action: 'ai.deal_scored', entityType: 'opportunity', entityId: opportunityId, entityName: opp.opportunityName || opp.account || 'Unnamed',
            detail: `claude-haiku-4-5 · ${usingOrgKey ? 'the workspace’s key' : 'the site key'} · score ${scoreData.score} (${scoreData.verdict})`,
        });
        return { statusCode: 200, headers, body: JSON.stringify({ ...stored, usingOrgKey }) };

    } catch (err) {
        console.error('ai-score error:', err.message);
        return { statusCode: 500, headers, body: serverErrorBody(err, 'ai-score') };
    }
};
