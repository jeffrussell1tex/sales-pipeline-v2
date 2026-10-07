import { useState } from 'react';
import { dbStatusOf } from '../utils/fetchStatus';
import { dbFetch, dbWrite, requestOrg, stillOrg, stopped } from '../utils/storage';

// Fire-and-forget SMS for deal assignments and stage changes. The event and
// the deal's id only: mention-sms.mjs texts the deal's owner, words the text
// from the saved deal and signs it with the caller's name (state §0.172).
async function fireMentionSms(payload) {
    try {
        // dbfetch-ignore: an SMS notification must never block or fail the save
        // it accompanies. Deliberate fire-and-forget.
        await dbFetch('/.netlify/functions/mention-sms', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
    } catch (err) {
        console.warn('mention-sms (non-blocking):', err.message);
    }
}

export function useOpportunities(deps) {
    const { addAudit, showConfirm, softDelete, setUndoToast } = deps;

    const [opportunities, setOpportunities] = useState([]);
    const [oppModalError, setOppModalError] = useState(null);
    const [oppModalSaving, setOppModalSaving] = useState(false);

    const loadOpportunities = (setDbOffline) => {
        // This org's deals only (state §0.173): an answer for an org switched away
        // from is dropped.
        const askedOrg = requestOrg();
        dbFetch('/.netlify/functions/opportunities')
            .then(r => { if (!stillOrg(askedOrg)) return null; setDbOffline(dbStatusOf(r)); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
            .then(data => {
                if (!data || !stillOrg(askedOrg)) return;
                // Read when the answer lands (state §0.176): App fills these refs during
                // its render, after this hook has run, so a copy taken at the hook's top
                // is null on a mount's first render — and a remount with Clerk already
                // loaded (Vite's Fast Refresh) ran this load with it: "getQuarter is not
                // a function", and no deals until the next load.
                const { getQuarter, getQuarterLabel } = deps;
                const loadedOpps = data.opportunities || [];
                const updatedOpps = loadedOpps.map(opp => {
                    const normalized = {
                        ...opp,
                        arr: parseFloat(opp.arr) || 0,
                        implementationCost: parseFloat(opp.implementationCost) || 0,
                        probability: opp.probability !== undefined && opp.probability !== ''
                            ? parseFloat(opp.probability)
                            : opp.probability,
                    };
                    if (!normalized.closeQuarter && normalized.forecastedCloseDate) {
                        const quarter = getQuarter(normalized.forecastedCloseDate);
                        const quarterLabel = getQuarterLabel(quarter, normalized.forecastedCloseDate);
                        return { ...normalized, closeQuarter: quarterLabel };
                    }
                    return normalized;
                });
                setOpportunities(updatedOpps);
            })
            .catch(err => console.error('Failed to load opportunities:', err));
    };

    // Deleting deals (state §0.178) — the Pipeline's Delete (N), an Admin's: the server
    // deletes a deal for an Admin only. Confirmed, one DELETE each, and no Undo (Jeff:
    // "Confirm, no Undo"): a deal re-POSTed is a new deal to the server — the rep's
    // "new opportunity" email, the opportunity.created webhook and the automations —
    // and the Pipeline's dialog has always said it cannot be undone.
    //
    // The Delete (N) handed the old handleDelete the deal instead of its id and read
    // .catch off its answer: no deal could be deleted from the app since 20 Apr, and
    // that handler's Undo put the row back on screen only. opts.onConfirm runs when the
    // user confirms.
    const handleDeleteDeals = (ids, opts = {}) => {
        const going = opportunities.filter(o => (ids || []).includes(o.id));
        if (!going.length) return;
        const what = going.length === 1 ? `"${going[0].opportunityName || going[0].account || 'this deal'}"` : `${going.length} deals`;
        showConfirm(`Delete ${what}? This cannot be undone.`, async () => {
            opts.onConfirm?.();
            const askedOrg = requestOrg();   // cut by an org switch, it stops (state §0.175)
            const goingIds = going.map(o => o.id);
            setOpportunities(prev => prev.filter(o => !goingIds.includes(o.id)));
            const failed = [];
            for (const o of going) {
                if (!stillOrg(askedOrg)) return;   // the next DELETE would carry the new org's token
                const r = await dbWrite(`/.netlify/functions/opportunities?id=${o.id}`, { method: 'DELETE' });
                if (!r.ok) failed.push({ o, error: r.error });
            }
            if (!stillOrg(askedOrg)) return;
            if (failed.length) {
                // What did not delete is put back, and the first refusal is shown.
                setOpportunities(prev => {
                    const have = new Set(prev.map(x => x.id));
                    return [...prev, ...failed.map(f => f.o).filter(x => !have.has(x.id))];
                });
                setUndoToast({ error: going.length === 1
                    ? `Deal not deleted — ${failed[0].error}`
                    : `${failed.length} of ${going.length} deals not deleted — ${failed[0].error}` });
            }
        });
    };

    const handleSave = (formData, editingOpp, activePipeline, currentUser,
                        setShowModal, setLostReasonModal) => {
        const today = [new Date().getFullYear(), String(new Date().getMonth()+1).padStart(2,'0'), String(new Date().getDate()).padStart(2,'0')].join('-');
        const prevOpp = editingOpp ? opportunities.find(o => o.id === editingOpp.id) : null;
        const stageChanged = prevOpp && prevOpp.stage !== formData.stage;

        const stageHistoryEntry = stageChanged ? {
            stage: formData.stage, date: today, prevStage: prevOpp.stage,
            author: currentUser || '', timestamp: new Date().toISOString()
        } : null;

        const enrichedData = {
            ...formData,
            createdDate: prevOpp?.createdDate || today,
            stageChangedDate: stageChanged ? today : (prevOpp?.stageChangedDate || today),
            stageHistory: stageChanged
                ? [...(prevOpp?.stageHistory || []), stageHistoryEntry]
                : (prevOpp?.stageHistory || []),
            comments: prevOpp?.comments || [],
            lostReason:   formData.lostReason   || prevOpp?.lostReason   || '',
            lostCategory: formData.lostCategory || prevOpp?.lostCategory || '',
            lostDate:     formData.lostDate     || prevOpp?.lostDate     || '',
            // The day a deal was won. The column existed and the endpoint passed it
            // through, but nothing ever wrote it, so every "days to close" read the
            // forecast date instead (0.68 batch 5b). Kept across edits of a won deal;
            // cleared if the deal is reopened.
            wonDate:      formData.stage === 'Closed Won'
                ? ((prevOpp?.stage === 'Closed Won' && prevOpp?.wonDate) ? prevOpp.wonDate : (formData.wonDate || today))
                : '',
        };

        if (formData.stage === 'Closed Lost' && (!prevOpp || prevOpp.stage !== 'Closed Lost')) {
            setShowModal(false);
            setLostReasonModal({ pendingFormData: enrichedData, editingOpp });
            return;
        }

        const askedOrg = requestOrg();   // after an org switch its answer changes nothing (state §0.175)
        if (editingOpp && editingOpp.id) {
            const updatedOpp = { ...enrichedData, id: editingOpp.id };
            setOppModalSaving(true); setOppModalError(null);
            dbFetch('/.netlify/functions/opportunities', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updatedOpp) })
                .then(async res => {
                    const data = await res.json();
                    if (!stillOrg(askedOrg)) return;
                    if (!res.ok) { setOppModalError(data.error || 'Failed to save opportunity. Please try again.'); return; }
                    setOpportunities(prev => prev.map(opp => opp.id === editingOpp.id ? (data.opportunity || updatedOpp) : opp));
                    addAudit('update', 'opportunity', editingOpp.id, enrichedData.opportunityName || enrichedData.account || editingOpp.id, enrichedData.account || '');
                    // SMS: rep reassigned
                    if (enrichedData.salesRep && prevOpp?.salesRep !== enrichedData.salesRep) {
                        fireMentionSms({ type: 'dealAssigned', recordId: editingOpp.id });
                    }
                    // SPIFF: offer a claim on any Closed Won save that still has
                    // an unclaimed active SPIFF. deps.onDealWon no-ops when there
                    // is nothing to claim.
                    if (enrichedData.stage === 'Closed Won') {
                        deps.onDealWon?.({ ...updatedOpp, id: editingOpp.id });
                    }
                    // SMS: stage changed
                    if (stageChanged && enrichedData.salesRep) {
                        if (enrichedData.stage === 'Closed Won') {
                            fireMentionSms({ type: 'dealClosedWon', recordId: editingOpp.id });
                        } else {
                            fireMentionSms({ type: 'stageChanged', recordId: editingOpp.id });
                        }
                    }
                    setShowModal(false); setOppModalError(null);
                })
                .catch(err => { if (!stillOrg(askedOrg)) return; console.error('Failed to update opportunity:', err); setOppModalError('Failed to save opportunity. Please check your connection and try again.'); })
                .finally(() => setOppModalSaving(false));
        } else {
            const newId = 'id_' + crypto.randomUUID();
            const newOpp = { ...enrichedData, id: newId, pipelineId: activePipeline.id, createdBy: currentUser || '' };
            setOppModalSaving(true); setOppModalError(null);
            dbFetch('/.netlify/functions/opportunities', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newOpp) })
                .then(async res => {
                    const data = await res.json();
                    if (!stillOrg(askedOrg)) return;
                    if (!res.ok) { setOppModalError(data.error || 'Failed to save opportunity. Please try again.'); return; }
                    setOpportunities(prev => [...prev, data.opportunity || newOpp]);
                    addAudit('create', 'opportunity', newId, enrichedData.opportunityName || enrichedData.account || newId, enrichedData.account || '');
                    // SMS: deal assigned to rep on creation
                    if (enrichedData.salesRep) {
                        fireMentionSms({ type: 'dealAssigned', recordId: newId });
                    }
                    setShowModal(false); setOppModalError(null);
                })
                .catch(err => { if (!stillOrg(askedOrg)) return; console.error('Failed to save opportunity:', err); setOppModalError('Failed to save opportunity. Please check your connection and try again.'); })
                .finally(() => setOppModalSaving(false));
        }
    };

    const completeLostSave = async (formData, editingOppRef, lostReason, lostCategory, activePipeline, currentUser, setLostReasonModal) => {
        const askedOrg = requestOrg();   // after an org switch its answer changes nothing (state §0.175)
        const today = [new Date().getFullYear(), String(new Date().getMonth()+1).padStart(2,'0'), String(new Date().getDate()).padStart(2,'0')].join('-');
        const prevOppRef = editingOppRef ? opportunities.find(o => o.id === editingOppRef.id) : null;
        const enriched = {
            ...formData,
            lostReason, lostCategory, lostDate: today,
            comments: prevOppRef?.comments || formData.comments || [],
            stageHistory: formData.stageHistory || prevOppRef?.stageHistory || [],
        };
        // The write is awaited and checked before anything else happens. Previously
        // both branches fired .catch(console.error) — which only sees a network
        // failure, never a 403/500 — and then called addAudit() unconditionally.
        // A rejected save therefore left the pipeline showing Closed Lost, the
        // AUDIT LOG ASSERTING it was lost, and the row in the database still open.
        // Closed Lost feeds revenue reporting, so a silent divergence there is the
        // worst of the six sites found in the hooks.
        if (editingOppRef) {
            const updatedOpp = { ...enriched, id: editingOppRef.id };
            const snapshot = opportunities;
            setOpportunities(prev => prev.map(opp => opp.id === editingOppRef.id ? updatedOpp : opp));
            const r = await dbWrite('/.netlify/functions/opportunities', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updatedOpp) });
            if (!stillOrg(askedOrg)) return;
            if (!r.ok) {
                setOpportunities(snapshot);                       // never show what was not stored
                setOppModalError(`Not saved as Closed Lost — ${r.error}`);
                return;                                            // keep the modal open, no audit
            }
            addAudit('update', 'opportunity', editingOppRef.id, enriched.opportunityName || enriched.account || editingOppRef.id, `Closed Lost: ${lostCategory || lostReason || ''}`);
        } else {
            const newId = 'id_' + crypto.randomUUID();
            const newOpp = { ...enriched, id: newId, pipelineId: activePipeline.id };
            setOpportunities(prev => [...prev, newOpp]);
            const r = await dbWrite('/.netlify/functions/opportunities', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newOpp) });
            if (!stillOrg(askedOrg)) return;
            if (!r.ok) {
                setOpportunities(prev => prev.filter(o => o.id !== newId));
                setOppModalError(`Not saved as Closed Lost — ${r.error}`);
                return;
            }
            addAudit('create', 'opportunity', newId, enriched.opportunityName || enriched.account || newId, `Closed Lost: ${lostCategory || lostReason || ''}`);
        }
        setLostReasonModal(null);
    };

    // A deal's team notes are saved the moment one is posted, edited or deleted
    // (state §0.177). They lived on the deal on screen until the deal was saved —
    // closing the modal instead lost them on reload. The PUT merges over the stored
    // row (§0.169), so it sends the notes alone.
    const saveDealComments = async (oppId, comments) => {
        const askedOrg = requestOrg();   // after an org switch its answer changes nothing (state §0.175)
        const r = await dbWrite('/.netlify/functions/opportunities', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: oppId, comments }),
        });
        if (!stillOrg(askedOrg)) return stopped();   // the deal modal was remounted by the switch
        if (!r.ok) return { ok: false, error: r.error };
        setOpportunities(prev => prev.map(o => (o.id === oppId ? { ...o, comments } : o)));
        return { ok: true };
    };

    return {
        opportunities,
        setOpportunities,
        saveDealComments,
        oppModalError,
        setOppModalError,
        oppModalSaving,
        setOppModalSaving,
        loadOpportunities,
        handleDeleteDeals,
        handleSave,
        completeLostSave,
    };
}
