// settings/salesProcess/DealScoringDetail.jsx — Settings → Sales process → Deal scoring (AI scoring batch 2A;
// docs/design/deal-score — Jeff, 17 Nov: "All recommended"). Where the workspace's deal model stands — learning from N
// closed deals, or trained, with its accuracy on deals it did not train on — and an Admin's Train now. It saves no
// setting: the model is the server's (settings.dealModel, written only by the nightly pass and Train now), the
// threshold is fixed (Q5), and the switch that shows the score is Settings → Features → Deal scoring (Q6).
import React, { useState } from 'react';
import { T } from '../shared/tokens.js';
import { CSectionCard } from '../shared/form.jsx';
import { CategoryDetailChrome } from '../shared/CategoryDetailChrome.jsx';
import { useApp } from '../../../AppContext';
import { dbFetch, requestOrg, stillOrg } from '../../../utils/storage';
import { failureWords } from '../../../utils/refusalWords.js';
// Only the server's own refusal is "not"; any other answer may have written (state §0.264, the unknown-save rule, Part 5).
import { maybeSaid, writeRefusalOf, refusalError, unknownOf } from '../../../utils/refusalWords.js';
import { standingWords, trainDealWords, featureOn, MIN_TEACHING, comparisonWords } from '../../../utils/dealScore.js';
import { funnelRowsOf } from '../../../utils/stageOrder.js';

const RULES = [
    ['No activity in over 7, 14 or 30 days', '10, 25 or 40 points'],
    ['No activities logged', '30 points'],
    ['In its stage over 30 or 60 days', '15 or 30 points'],
    ['Close date passed', '35 points'],
    ['Closing within a week with no activities', '20 points'],
];

export const DealScoringDetail = ({ settings, setSettings, onBack }) => {
    const { userRole, loadOpportunities } = useApp();
    const isAdmin = userRole === 'Admin';
    const model = settings?.dealModel || null;
    const on = featureOn(settings?.featureFlags, 'deal-scoring');
    const stages = funnelRowsOf(settings?.funnelStages).filter((s) => s.type === 'Open');

    // Train now: the server runs the nightly pass for THIS org and answers with the model as it now holds it, which
    // becomes the settings prop, so the standing below reads the server's truth. The ok check before the body; a refusal
    // in the server's words, a failure in plain words; after an org switch nothing is said.
    const [training, setTraining] = useState(false);
    const [trainMsg, setTrainMsg] = useState(null);
    const handleTrainNow = async () => {
        if (training) return;
        setTraining(true); setTrainMsg(null);
        const askedOrg = requestOrg();
        try {
            const res = await dbFetch('/.netlify/functions/train-deal-model', { method: 'POST' });
            if (!stillOrg(askedOrg)) return;
            if (!res.ok) { const r = await writeRefusalOf(res); throw refusalError(r.words, r.heard); }   // may have trained (state §0.264)
            const answer = await res.json().catch(() => null);
            if (!stillOrg(askedOrg)) return;
            if (!answer) { setTrainMsg({ ok: false, text: 'Its answer could not be read. Reload the page to see whether a model was trained.' }); return; }
            if (answer.dealModel) setSettings(prev => ({ ...prev, dealModel: answer.dealModel }));
            setTrainMsg(trainDealWords(answer));
            // The pass scored every deal of the org on the server; the deals on screen take those scores now, not at the
            // next sign-in (found in §0.256's browser check: the answer carries the model, never the deals).
            if (typeof loadOpportunities === 'function') loadOpportunities(() => {});
        } catch (e) {
            if (!stillOrg(askedOrg)) return;
            // Only the server's own refusal is "Not trained"; any other answer may have trained it (state §0.264, Part 5).
            setTrainMsg({ ok: false, text: unknownOf(e) ? maybeSaid('The model', 'trained', failureWords(e)) : `Not trained — ${failureWords(e)}` });
        } finally { setTraining(false); }
    };

    return (
        <CategoryDetailChrome
            crumb="Deal scoring" title="Deal scoring"
            subtitle="Each open deal's chance of winning — its stage, its health, and what this workspace has won and lost"
            statusDetail={model?.trained ? 'Learning' : 'Rules'}
            onBack={onBack}
        >
            <div style={{ display: 'grid', gap: 16, maxWidth: 820 }}>
                {!on && (
                    <div style={{ padding: '10px 12px', borderLeft: `3px solid ${T.warn}`, background: `${T.warn}14`, borderRadius: 4, fontSize: 12.5, color: T.ink, fontFamily: T.sans }}>
                        Deal scoring is off in Settings → Features: no screen shows a win chance. Deals are still scored, so turning it on shows a current number.
                    </div>
                )}

                <CSectionCard title="Where this workspace stands" description={`The model learns from this workspace's own Closed Won and Closed Lost deals — never another's. It starts at ${MIN_TEACHING} closed deals that teach, and its part of each score grows as more close.`}>
                    <div style={{ padding: '10px 12px', background: T.surface2, border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 12.5, color: T.inkMid, lineHeight: 1.55, fontFamily: T.sans }}>
                        {standingWords(model)}
                        {comparisonWords(model) && <div style={{ marginTop: 6 }}>{comparisonWords(model)}</div>}
                    </div>
                    {isAdmin && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
                            <button onClick={handleTrainNow} disabled={training}
                                style={{ padding: '6px 14px', background: training ? T.surface2 : T.ink, color: training ? T.inkMuted : T.surface, border: 'none', borderRadius: T.r, fontSize: 12, fontWeight: 700, cursor: training ? 'default' : 'pointer', fontFamily: T.sans }}>
                                {training ? 'Training…' : 'Train now'}
                            </button>
                            <span style={{ fontSize: 11.5, color: T.inkMuted, fontFamily: T.sans }}>
                                Runs the nightly pass for this workspace now: the model trained on its closed deals, then every deal scored again.
                            </span>
                        </div>
                    )}
                    {trainMsg && (
                        <div style={{ marginTop: 10, padding: '8px 12px', borderLeft: `3px solid ${trainMsg.ok ? T.ok : T.danger}`, background: trainMsg.ok ? `${T.ok}14` : `${T.danger}14`, borderRadius: 4, fontSize: 12, color: T.ink, fontFamily: T.sans }}>
                            {trainMsg.text}
                        </div>
                    )}
                </CSectionCard>

                <CSectionCard title="How a deal's win chance starts" description="Every workspace starts here, and keeps it as part of each score: the stage's weight from Settings → Funnel stages, less a share for each health rule a deal breaks.">
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '6px 16px', fontSize: 12.5, color: T.inkMid, fontFamily: T.sans }}>
                        {RULES.map(([rule, points]) => (
                            <React.Fragment key={rule}>
                                <span>{rule}</span>
                                <span style={{ color: T.ink, fontVariantNumeric: 'tabular-nums' }}>{points}</span>
                            </React.Fragment>
                        ))}
                    </div>
                    <div style={{ marginTop: 10, fontSize: 12, color: T.inkMuted, lineHeight: 1.55, fontFamily: T.sans }}>
                        The points come off 100 and that share comes off the stage's weight: a deal in a {stages.find((s) => s.name === 'Proposal')?.weight ?? 60}% stage with no activities logged reads {Math.round((stages.find((s) => s.name === 'Proposal')?.weight ?? 60) * 0.7)}%. A deal reads Healthy at three quarters of its stage's weight or more, At Risk at half, Critical below.
                    </div>
                </CSectionCard>
            </div>
        </CategoryDetailChrome>
    );
};
