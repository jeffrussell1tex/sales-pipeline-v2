/**
 * ai-score.mjs — AI-powered deal health scoring via Anthropic API
 *
 * POST /.netlify/functions/ai-score
 * Body: { opportunityId }
 *
 * Returns:
 *   { score, verdict, headline, signals, recommendation, scoredAt }
 *
 * Requires:
 *   ANTHROPIC_API_KEY in Netlify environment variables
 *
 * The score is cached on the opportunity record (aiScore JSONB column)
 * and returned immediately on subsequent requests unless forceRefresh=true.
 *
 * Feature gate: checks settings.aiScoringEnabled before running.
 * If false, returns { disabled: true }.
 */

import { db } from '../../db/index.js';
import { opportunities, activities, settings } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { verifyAuth } from './auth.mjs';

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

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return { statusCode: 503, headers, body: JSON.stringify({ error: 'ANTHROPIC_API_KEY is not configured' }) };

    try {
        const body = JSON.parse(event.body || '{}');
        const { opportunityId, forceRefresh } = body;
        if (!opportunityId) return { statusCode: 400, headers, body: JSON.stringify({ error: 'opportunityId required' }) };

        // ── Check feature gate ────────────────────────────────────────────────
        const [orgSettings] = await db.select({ extra: settings.extra })
            .from(settings)
            .where(eq(settings.orgId, orgId))
            .limit(1);
        const aiEnabled = orgSettings?.extra?.aiScoringEnabled ?? false;
        if (!aiEnabled) return { statusCode: 200, headers, body: JSON.stringify({ disabled: true }) };

        // ── Load opportunity ──────────────────────────────────────────────────
        const [opp] = await db.select().from(opportunities)
            .where(and(eq(opportunities.id, opportunityId), eq(opportunities.orgId, orgId)));
        if (!opp) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Opportunity not found' }) };

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
        const engagedContacts = [...new Set(oppActivities.map(a => a.contactName).filter(Boolean))];

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
- Contacts listed: ${opp.contacts || 'none'}
- Contacts engaged: ${engagedContacts.length > 0 ? engagedContacts.join(', ') : 'none'}
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
        try {
            await db.update(opportunities)
                .set({ aiScore: scoreData, updatedAt: new Date() })
                .where(and(eq(opportunities.id, opportunityId), eq(opportunities.orgId, orgId)));
        } catch (cacheErr) {
            console.error('Failed to cache AI score:', cacheErr.message);
            // Non-fatal — still return the score
        }

        return { statusCode: 200, headers, body: JSON.stringify(scoreData) };

    } catch (err) {
        console.error('ai-score error:', err.message);
        return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
};
