/**
 * report-prompt.mjs — a report prompt read by Claude (state §0.141; Jeff: "if
 * Claude is enabled by the admin can we have it use Claude as a default and
 * if Claude isnt available use deterministic").
 *
 * POST /.netlify/functions/report-prompt   body: { prompt, today? }
 *
 * Answers 200 with ONE of:
 *   { readBy: 'claude', model, usingOrgKey, definition, name, notes }
 *   { unavailable: true, reason: 'off' | 'no_key' | 'refused' | 'unreadable' | 'error' }
 * so the client always knows whether to run its own reader
 * (src/utils/reportPrompt.js) — the same shape either way (guide §18b41 item 5).
 *
 * What leaves the app: the prompt SENTENCE, the builder's vocabulary (field
 * ids and labels), today's date and the fiscal year start, the org's stage
 * names and the roster's display names (so "Karen's deals in Proposal" can
 * become filters). Never a row of CRM data — this function reads no CRM table.
 *
 * Gates, in order: Clerk auth; the org's switch settings.extra
 * .aiReportPromptsEnabled (an Admin's, Settings → Features → AI); a key
 * (_aiKey.mjs: the org's BYOK key, else the site's). Every read is by the
 * caller's org. What Claude returns is NOT trusted as a definition: it is
 * passed through the same allowlists a saved report passes through
 * (validateReading — resolveDefinition, resolveWhere) and every dropped id
 * is named in `notes`. The pure half lives in _reportPromptShape.mjs so the
 * tests can run it.
 *
 * The model is Claude Opus 5 at low effort — a sentence into a small JSON
 * object; roughly a cent and a half a reading at list price, on the org's key
 * when they have one. Raw fetch, like ai-score.mjs (no SDK dependency in the
 * function bundle).
 */
import { db } from '../../db/index.js';
import { settings as settingsTable, users } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { verifyAuth } from './auth.mjs';
import { serverErrorBody } from './_lib.mjs';
import { resolveAnthropicKey } from './_aiKey.mjs';
import { REPORT_PROMPT_MODEL, MAX_PROMPT_CHARS, SET_REPORT_TOOL, systemPromptFor, validateReading } from './_reportPromptShape.mjs';
import { promptVocabulary } from '../../src/utils/reportPrompt.js';
import { openStagesOf } from '../../src/utils/stageOrder.js';

const headers = {
    'Content-Type':                 'application/json',
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};
const answer = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) });
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export const handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
    if (event.httpMethod !== 'POST') return answer(405, { error: 'Method not allowed' });

    const auth = await verifyAuth(event);
    if (auth.error) return answer(auth.status || 401, { error: auth.error });
    const { orgId } = auth;

    try {
        let body = {};
        try { body = JSON.parse(event.body || '{}'); } catch { return answer(400, { error: 'Invalid JSON' }); }
        const prompt = typeof body.prompt === 'string' ? body.prompt.trim().slice(0, MAX_PROMPT_CHARS) : '';
        if (!prompt) return answer(400, { error: 'prompt required' });
        const today = DAY_RE.test(body.today || '') ? body.today : new Date().toISOString().slice(0, 10);

        // The org's switch and the org's key — by THIS org's settings row only.
        const [row] = await db.select({ extra: settingsTable.extra, fiscalYearStart: settingsTable.fiscalYearStart, stages: settingsTable.stages })
            .from(settingsTable).where(eq(settingsTable.orgId, orgId)).limit(1);
        if (!(row?.extra?.aiReportPromptsEnabled === true)) return answer(200, { unavailable: true, reason: 'off' });
        const { apiKey, usingOrgKey } = resolveAnthropicKey(row?.extra);
        if (!apiKey) return answer(200, { unavailable: true, reason: 'no_key' });

        const fiscalStart = parseInt(row?.fiscalYearStart) || 10;
        const stages = openStagesOf({ funnelStages: row?.extra?.funnelStages || row?.stages || [] });
        const roster = await db.select({ name: users.name, active: users.active }).from(users).where(eq(users.orgId, orgId));
        const people = [...new Set(roster.filter(u => u.active !== false && u.name).map(u => String(u.name).trim()).filter(Boolean))].slice(0, 200);

        const system = systemPromptFor({ vocabulary: promptVocabulary(), today, fiscalStart, stages, people });
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
            body: JSON.stringify({
                model: REPORT_PROMPT_MODEL,
                max_tokens: 1024,
                output_config: { effort: 'low' },
                system,
                tools: [SET_REPORT_TOOL],
                tool_choice: { type: 'auto', disable_parallel_tool_use: true },
                messages: [{ role: 'user', content: `Sentence: ${prompt}` }],
            }),
        });
        if (!response.ok) {
            const text = await response.text().catch(() => '');
            console.error('report-prompt: Anthropic API error', response.status, text.slice(0, 300));
            return answer(200, { unavailable: true, reason: 'error', status: response.status });
        }
        const result = await response.json();
        if (result?.stop_reason === 'refusal') return answer(200, { unavailable: true, reason: 'refused' });
        const call = Array.isArray(result?.content) ? result.content.find(b => b?.type === 'tool_use' && b?.name === SET_REPORT_TOOL.name) : null;
        if (!call || !call.input || typeof call.input !== 'object') return answer(200, { unavailable: true, reason: 'unreadable' });

        // One line per reading in the function log: what the model said BEFORE
        // the allowlists — the only way to tell a model that omitted a filter
        // from a validator that dropped one (observed on dev, 15 Sep).
        console.log(`report-prompt: model input ${JSON.stringify(call.input).slice(0, 1500)}`);
        const { definition, name, notes } = validateReading(call.input, prompt);
        return answer(200, { readBy: 'claude', model: REPORT_PROMPT_MODEL, usingOrgKey, definition, name, notes });
    } catch (err) {
        console.error('report-prompt error:', err.message);
        return { statusCode: 500, headers, body: serverErrorBody(err, 'report-prompt') };
    }
};
