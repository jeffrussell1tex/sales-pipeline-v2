// netlify/functions/train-lead-model.mjs — POST: an Admin's "Train now"
// (state §0.132). Runs the nightly lead-scoring pass for the CALLER'S org only,
// with the org's minClosedRecords threshold set aside (`force`): the engine's
// own floor of 20 decided leads still applies, and the answer says which gate
// stopped it, so the panel can print "needs N more decided leads" instead of a
// silent no-op. Nothing is trained for any other org — orgId comes from the
// token, never the body.
//
// Admin-only: the panel that offers the button is Admin-only, and a rep must
// not be able to retrain the workspace's model. Never scheduled — the nightly
// batch (score-leads-batch.mjs) is the only timed caller of scoreOrg.
import { verifyAuth, requireRole } from './auth.mjs';
import { serverErrorBody, auditAs } from './_lib.mjs';
import { scoreOrg, MODEL_MIN_ROWS } from './score-leads-batch.mjs';

const HEADERS = {
    'Content-Type':                 'application/json',
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export const handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: HEADERS, body: '' };
    if (event.httpMethod !== 'POST') return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };

    const auth = await verifyAuth(event);
    if (auth.error) return { statusCode: auth.status || 401, headers: HEADERS, body: JSON.stringify({ error: auth.error }) };
    const forbidden = requireRole(auth, ['Admin'], HEADERS);
    if (forbidden) return forbidden;
    const { orgId } = auth;

    try {
        const r = await scoreOrg(orgId, { force: true });
        if (r.skipped) return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ ok: false, reason: 'scoring-off', minRows: MODEL_MIN_ROWS }) };
        // An Admin's Train now re-scores every lead in the org (§0.143).
        await auditAs(orgId, auth.userId, { action: 'lead_model.trained', entityType: 'lead_model', entityId: orgId, entityName: 'Lead scoring model', detail: r.modelTrained ? `trained on ${r.decided} decided leads · ${r.leadsUpdated} leads re-scored` : `not trained (${r.reason}) · ${r.leadsUpdated} leads re-scored on the rules` });
        return {
            statusCode: 200, headers: HEADERS,
            body: JSON.stringify({
                ok:           r.modelTrained,
                reason:       r.reason,
                decided:      r.decided,
                threshold:    r.threshold,
                minRows:      MODEL_MIN_ROWS,
                leadsUpdated: r.leadsUpdated,
                // The org's saved config after the run — the model on it when trained —
                // so the panel reflects the server's truth without a reload.
                leadScoring:  r.leadScoring,
            }),
        };
    } catch (err) {
        console.error('train-lead-model error:', err.message);
        return { statusCode: 500, headers: HEADERS, body: serverErrorBody(err, 'train-lead-model') };
    }
};
