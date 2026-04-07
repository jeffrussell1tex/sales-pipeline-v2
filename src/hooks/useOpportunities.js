import { useState } from 'react';
import { dbFetch } from '../utils/storage';

// Fire-and-forget SMS for deal assignments and stage changes.
// Calls mention-sms.mjs which resolves assignee prefs server-side.
async function fireMentionSms(payload) {
    try {
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
    const { addAudit, showConfirm, softDelete, setUndoToast, getQuarter, getQuarterLabel } = deps;

    const [opportunities, setOpportunities] = useState([]);
    const [oppModalError, setOppModalError] = useState(null);
    const [oppModalSaving, setOppModalSaving] = useState(false);

    const loadOpportunities = (setDbOffline) => {
        dbFetch('/.netlify/functions/opportunities')
            .then(r => { if (!r.ok) { setDbOffline(true); throw new Error('HTTP ' + r.status); } setDbOffline(false); return r.json(); })
            .then(data => {
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

    const handleDelete = (id) => {
        // Capture opp reference before confirm so it's available in callback
        let opp;
        setOpportunities(prev => { opp = prev.find(o => o.id === id); return prev; });
        if (!opp) return;

        showConfirm('Are you sure you want to delete this opportunity?', () => {
            let snapshot;
            // Functional update: snapshot + filter in one atomic operation
            setOpportunities(prev => {
                snapshot = prev.slice();
                return prev.filter(o => o.id !== id);
            });

            dbFetch(`/.netlify/functions/opportunities?id=${id}`, { method: 'DELETE' })
                .then(async res => {
                    if (!res.ok) {
                        console.error('Failed to delete opportunity on server, restoring. Status:', res.status);
                        setOpportunities(prev => {
                            if (prev.some(o => o.id === id)) return prev;
                            return snapshot;
                        });
                    }
                })
                .catch(err => {
                    console.error('Failed to delete opportunity (network error), restoring:', err);
                    setOpportunities(prev => {
                        if (prev.some(o => o.id === id)) return prev;
                        return snapshot;
                    });
                });

            addAudit('delete', 'opportunity', id, opp.opportunityName || opp.account || id, opp.account);
            softDelete(
                `Opportunity "${opp.opportunityName || opp.account}"`,
                () => {},
                () => { setOpportunities(snapshot); setUndoToast(null); }
            );
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
        };

        if (formData.stage === 'Closed Lost' && (!prevOpp || prevOpp.stage !== 'Closed Lost')) {
            setShowModal(false);
            setLostReasonModal({ pendingFormData: enrichedData, editingOpp });
            return;
        }

        if (editingOpp && editingOpp.id) {
            const updatedOpp = { ...enrichedData, id: editingOpp.id };
            setOppModalSaving(true); setOppModalError(null);
            dbFetch('/.netlify/functions/opportunities', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updatedOpp) })
                .then(async res => {
                    const data = await res.json();
                    if (!res.ok) { setOppModalError(data.error || 'Failed to save opportunity. Please try again.'); return; }
                    setOpportunities(prev => prev.map(opp => opp.id === editingOpp.id ? (data.opportunity || updatedOpp) : opp));
                    addAudit('update', 'opportunity', editingOpp.id, enrichedData.opportunityName || enrichedData.account || editingOpp.id, enrichedData.account || '');
                    // SMS: rep reassigned
                    if (enrichedData.salesRep && prevOpp?.salesRep !== enrichedData.salesRep) {
                        fireMentionSms({ type: 'dealAssigned', assigneeName: enrichedData.salesRep, assignedBy: currentUser, dealName: enrichedData.opportunityName || enrichedData.account, account: enrichedData.account });
                    }
                    // SMS: stage changed
                    if (stageChanged && enrichedData.salesRep) {
                        if (enrichedData.stage === 'Closed Won') {
                            fireMentionSms({ type: 'dealClosedWon', assigneeName: enrichedData.salesRep, assignedBy: currentUser, dealName: enrichedData.opportunityName || enrichedData.account, account: enrichedData.account, arr: enrichedData.arr });
                        } else {
                            fireMentionSms({ type: 'stageChanged', assigneeName: enrichedData.salesRep, assignedBy: currentUser, dealName: enrichedData.opportunityName || enrichedData.account, fromStage: prevOpp?.stage, toStage: enrichedData.stage });
                        }
                    }
                    setShowModal(false); setOppModalError(null);
                })
                .catch(err => { console.error('Failed to update opportunity:', err); setOppModalError('Failed to save opportunity. Please check your connection and try again.'); })
                .finally(() => setOppModalSaving(false));
        } else {
            const newId = 'id_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
            const newOpp = { ...enrichedData, id: newId, pipelineId: activePipeline.id, createdBy: currentUser || '' };
            setOppModalSaving(true); setOppModalError(null);
            dbFetch('/.netlify/functions/opportunities', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newOpp) })
                .then(async res => {
                    const data = await res.json();
                    if (!res.ok) { setOppModalError(data.error || 'Failed to save opportunity. Please try again.'); return; }
                    setOpportunities(prev => [...prev, data.opportunity || newOpp]);
                    addAudit('create', 'opportunity', newId, enrichedData.opportunityName || enrichedData.account || newId, enrichedData.account || '');
                    // SMS: deal assigned to rep on creation
                    if (enrichedData.salesRep) {
                        fireMentionSms({ type: 'dealAssigned', assigneeName: enrichedData.salesRep, assignedBy: currentUser, dealName: enrichedData.opportunityName || enrichedData.account, account: enrichedData.account });
                    }
                    setShowModal(false); setOppModalError(null);
                })
                .catch(err => { console.error('Failed to save opportunity:', err); setOppModalError('Failed to save opportunity. Please check your connection and try again.'); })
                .finally(() => setOppModalSaving(false));
        }
    };

    const completeLostSave = (formData, editingOppRef, lostReason, lostCategory, activePipeline, currentUser, setLostReasonModal) => {
        const today = [new Date().getFullYear(), String(new Date().getMonth()+1).padStart(2,'0'), String(new Date().getDate()).padStart(2,'0')].join('-');
        const prevOppRef = editingOppRef ? opportunities.find(o => o.id === editingOppRef.id) : null;
        const enriched = {
            ...formData,
            lostReason, lostCategory, lostDate: today,
            comments: prevOppRef?.comments || formData.comments || [],
            stageHistory: formData.stageHistory || prevOppRef?.stageHistory || [],
        };
        if (editingOppRef) {
            const updatedOpp = { ...enriched, id: editingOppRef.id };
            setOpportunities(prev => prev.map(opp => opp.id === editingOppRef.id ? updatedOpp : opp));
            dbFetch('/.netlify/functions/opportunities', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updatedOpp) })
                .catch(err => console.error('Failed to save lost opportunity:', err));
            addAudit('update', 'opportunity', editingOppRef.id, enriched.opportunityName || enriched.account || editingOppRef.id, `Closed Lost: ${lostCategory || lostReason || ''}`);
        } else {
            const newId = 'id_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
            const newOpp = { ...enriched, id: newId, pipelineId: activePipeline.id };
            setOpportunities(prev => [...prev, newOpp]);
            dbFetch('/.netlify/functions/opportunities', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newOpp) })
                .catch(err => console.error('Failed to save lost opportunity:', err));
            addAudit('create', 'opportunity', newId, enriched.opportunityName || enriched.account || newId, `Closed Lost: ${lostCategory || lostReason || ''}`);
        }
        setLostReasonModal(null);
    };

    return {
        opportunities,
        setOpportunities,
        oppModalError,
        setOppModalError,
        oppModalSaving,
        setOppModalSaving,
        loadOpportunities,
        handleDelete,
        handleSave,
        completeLostSave,
    };
}
