// netlify/functions/train-deal-model.mjs — POST: an Admin's "Train now" for deal scoring (AI scoring batch 2A;
// docs/design/deal-score — Jeff, 17 Nov, Q5: "Train now re-runs it"). Runs the nightly pass for the CALLER'S org only:
// the model trained on the org's own closed deals (fitted from 20 teaching deals — the threshold is fixed), then every
// deal of the org scored again. The answer says where the org stands, so Settings can print "learning from N closed
// deals" instead of a silent no-op. Nothing is trained or scored for any other org — orgId comes from the token, never
// the body.
//
// Admin-only: the card that offers the button is an Admin's, and a rep must not retrain the workspace's model. Never
// scheduled — score-deals-batch.mjs is the only timed caller of scoreOrgDeals.
import { verifyAuth, requireRole } from './auth.mjs';
import { serverErrorBody, auditAs } from './_lib.mjs';
import { scoreOrgDeals } from './_dealScore.mjs';
import { MIN_TEACHING } from '../../src/utils/dealScore.js';

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
        const r = await scoreOrgDeals(orgId, { train: true });
        const m = r.model;
        const standing = !m ? 'no settings row — nothing trained'
            : m.trained ? `trained on ${m.n} closed deals · right on ${m.accuracy?.correct ?? 0} of ${m.accuracy?.total ?? 0} held out`
            : `not trained — ${m.n} of ${MIN_TEACHING} teaching deals`;
        await auditAs(orgId, auth.userId, { action: 'deal_model.trained', entityType: 'deal_model', entityId: orgId, entityName: 'Deal scoring model', detail: `${standing} · ${r.dealsUpdated} deals re-scored${r.modelWritten ? '' : ' · the model not written (another pass wrote it first)'}` });
        return {
            statusCode: 200, headers: HEADERS,
            body: JSON.stringify({
                ok:           !!m?.trained,
                // The org's model and standing as the server now holds it, so the card shows the truth without a reload.
                dealModel:    m || null,
                minTeaching:  MIN_TEACHING,
                dealsUpdated: r.dealsUpdated,
                modelWritten: r.modelWritten,
            }),
        };
    } catch (err) {
        console.error('train-deal-model error:', err.message);
        return { statusCode: 500, headers: HEADERS, body: serverErrorBody(err, 'train-deal-model') };
    }
};
