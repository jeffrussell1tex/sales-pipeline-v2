import { useState, useRef } from 'react';
import { readList } from '../utils/listLoads.js';
import { dbFetch, dbWrite, requestOrg, stillOrg, stopped, NETWORK_ERROR } from '../utils/storage';
import { sentBody, shownRow } from '../utils/leaveOut.js';
import { dealBody } from '../utils/dealNotes.js';
import { failureWords, heardRefusal, landedBefore, maybeSaid, writeRefusal } from '../utils/refusalWords.js';

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

    // The latest load of the opportunities: an answer a later load overtook is dropped (state §0.207) — a merge's
    // reload landing after its Undo's put the merge back on screen, and the next whole-row save sent it.
    const loadGen = useRef(0);
    const loadOpportunities = () => readList('opportunities', {
            read: () => dbFetch('/.netlify/functions/opportunities'),
            gen: loadGen, report: deps.reportLoad,   // whether it was read (state §0.294)
            take: (loadedOpps) => {
                // Read when the answer lands (state §0.176): App fills these refs during
                // its render, after this hook has run, so a copy taken at the hook's top
                // is null on a mount's first render — and a remount with Clerk already
                // loaded (Vite's Fast Refresh) ran this load with it: "getQuarter is not
                // a function", and no deals until the next load.
                const { getQuarter, getQuarterLabel } = deps;
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
            },
    });

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
                const r = await dbWrite(`/.netlify/functions/opportunities?id=${encodeURIComponent(o.id)}`, { method: 'DELETE' });
                // Gone already in this org (404 'gone' — another tab's or member's delete came first, state §0.273): done — kept off, nothing said.
                if (!r.ok && !r.landed) failed.push({ o, error: r.error, unknown: r.unknown });
            }
            if (!stillOrg(askedOrg)) return;
            if (failed.length) {
                // What the server refused is put back, and the first refusal is shown. One whose answer proves nothing may
                // be gone (state §0.261, the unknown-save rule — Jeff's Q2: an answer that proves nothing keeps the change, said as maybe): kept off, said as maybe.
                const refused = failed.filter(f => !f.unknown), unsure = failed.filter(f => f.unknown);
                setOpportunities(prev => {
                    const have = new Set(prev.map(x => x.id));
                    return [...prev, ...refused.map(f => f.o).filter(x => !have.has(x.id))];
                });
                setUndoToast({ error: [
                    refused.length ? (going.length === 1 ? `Deal not deleted — ${refused[0].error}`
                        : `${refused.length} of ${going.length} deals not deleted — ${refused[0].error}`) : '',
                    unsure.length ? (going.length === 1 ? maybeSaid('The deal', 'deleted', unsure[0].error)
                        : maybeSaid(`${unsure.length} of ${going.length} deals`, 'deleted', unsure[0].error, true)) : '',
                ].filter(Boolean).join(' ') });
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
            // The member's day, for a close-date move the server records (state §0.239) — read only when the save
            // sends the close date, within a day of the server's.
            closeDateMovedOn: today,
            createdDate: prevOpp?.createdDate || today,
            stageChangedDate: stageChanged ? today : (prevOpp?.stageChangedDate || today),
            stageHistory: stageChanged
                ? [...(prevOpp?.stageHistory || []), stageHistoryEntry]
                : (prevOpp?.stageHistory || []),
            comments: prevOpp?.comments || [],   // shown until the server answers; never sent on an edit (dealBody, state §0.236)
            lostReason:   formData.lostReason   || prevOpp?.lostReason   || '',
            lostCategory: formData.lostCategory || prevOpp?.lostCategory || '',
            lostDate:     formData.lostDate     || prevOpp?.lostDate     || '',
            // The day a deal was won. The column existed and the endpoint passed it
            // through, but nothing ever wrote it, so every "days to close" read the
            // forecast date instead (0.68 batch 5b). Kept across edits of a won deal;
            // cleared if the deal is reopened.
            // A deal already won keeps its won date as stored, none included — never the day of a later edit; a deal won
            // in this save is won today, never on the date its copy held from an earlier win (state §0.240; the review);
            // a new deal as given.
            wonDate:      formData.stage === 'Closed Won'
                ? (!prevOpp ? (formData.wonDate || today) : prevOpp.stage === 'Closed Won' ? (prevOpp.wonDate || '') : today)
                : '',
        };

        if (formData.stage === 'Closed Lost' && (!prevOpp || prevOpp.stage !== 'Closed Lost')) {
            setOppModalError(null); setOppModalSaving(false);   // the deal window closes clean, as its onClose does
            setShowModal(false);
            // A new deal is given its id once, here: the dialog's retry sends the same
            // deal, never a second one (state §0.193).
            setLostReasonModal({ pendingFormData: (editingOpp && editingOpp.id) ? enrichedData : { ...enrichedData, id: enrichedData.id || ('id_' + crypto.randomUUID()) }, editingOpp });   // the window's id (§0.261)
            return;
        }

        const askedOrg = requestOrg();   // after an org switch its answer changes nothing (state §0.175)
        const dealName = enrichedData.opportunityName || enrichedData.account || 'The deal';   // what a maybe names (§0.261)
        if (editingOpp && editingOpp.id) {
            const updatedOpp = { ...enrichedData, id: editingOpp.id };
            setOppModalSaving(true); setOppModalError(null);
            dbFetch('/.netlify/functions/opportunities', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dealBody(sentBody(updatedOpp))) })   // the links nobody touched left out (§0.198); never the notes or the stage history — the server keeps the one and writes the other (§0.236)
                .then(async res => {
                    // The ok check first, the house words (state §0.245, docs/design/refusal-sweep 1c; Jeff's Q3): a 502's page
                    // said "…Please check your connection" though the server answered, and a refusal with no words a fallback.
                    // Only a 4xx in the server's words wrote nothing; any other refused answer may have saved (state §0.261, the unknown-save rule — Jeff's Q2: an answer that proves nothing keeps the change, said as maybe).
                    if (!res.ok) { const body = await res.json().catch(() => null); if (!stillOrg(askedOrg)) return; setOppModalError(writeRefusal(res, body, `"${dealName}"`).words); return; }
                    const data = await res.json().catch(() => ({}));
                    if (!stillOrg(askedOrg)) return;
                    setOpportunities(prev => prev.map(opp => opp.id === editingOpp.id ? (data.opportunity || shownRow(updatedOpp)) : opp));
                    if ('pipelineId' in sentBody(updatedOpp)) deps.onDealElsewhere?.(data.opportunity || shownRow(updatedOpp));   // a pipeline picked in this save (state §0.297)
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
                .catch(err => { if (!stillOrg(askedOrg)) return; console.error('Failed to update opportunity:', err); setOppModalError(maybeSaid(`"${dealName}"`, 'saved', failureWords(err))); })   // a throw proves nothing (§0.261)
                .finally(() => setOppModalSaving(false));
        } else {
            // The window's id, given when it opened (state §0.261, Part 6): a second press after an answer that proved nothing is
            // the same deal — answered already stored if the first landed.
            const newId = enrichedData.id || ('id_' + crypto.randomUUID());
            // No maker sent (state §0.250): who made the deal is the server's, the caller's member name.
            // A lead's convert names its lead (state §0.253): kept out of the body, and the lead marked Converted once the
            // deal lands — never before.
            const { fromLeadId, ...enrichedNew } = enrichedData;
            const newOpp = { ...enrichedNew, id: newId, pipelineId: enrichedNew.pipelineId || activePipeline.id };   // the pipeline picked in the window (state §0.297)
            setOppModalSaving(true); setOppModalError(null);
            dbFetch('/.netlify/functions/opportunities', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newOpp) })
                .then(async res => {
                    // As the edit's (§0.245, §0.261); already stored, an earlier press landed: the list read again.
                    let data = null;
                    if (!res.ok) {
                        const body = await res.json().catch(() => null); if (!stillOrg(askedOrg)) return;
                        if (!landedBefore(res.status, body)) { setOppModalError(writeRefusal(res, body, `"${dealName}"`).words); return; }
                        loadOpportunities();
                    } else data = await res.json().catch(() => ({}));
                    if (!stillOrg(askedOrg)) return;
                    if (data) setOpportunities(prev => [...prev, data.opportunity || newOpp]);
                    if (data) deps.onDealElsewhere?.(data.opportunity || newOpp);   // made in a pipeline that is not on screen: said (state §0.297) — not one an earlier press made, its pill since moved
                    addAudit('create', 'opportunity', newId, enrichedData.opportunityName || enrichedData.account || newId, enrichedData.account || '');
                    // SMS: deal assigned to rep on creation
                    if (enrichedData.salesRep) {
                        fireMentionSms({ type: 'dealAssigned', recordId: newId });
                    }
                    setShowModal(false); setOppModalError(null);
                    if (fromLeadId) deps.onLeadConverted?.(fromLeadId);
                })
                .catch(err => { if (!stillOrg(askedOrg)) return; console.error('Failed to save opportunity:', err); setOppModalError(maybeSaid(`"${dealName}"`, 'saved', failureWords(err))); })   // a throw proves nothing (§0.261)
                .finally(() => setOppModalSaving(false));
        }
    };

    // The reason dialog's save answers the dialog (state §0.193): { ok: true } once
    // stored, the dialog closed — or { ok: false, error } with the deal as it was, and
    // the dialog shows why and keeps the choice. A refusal went to the deal window's
    // oppModalError, and the deal window had closed when the dialog opened: the dialog
    // sat there without a word (prod, 9 Oct — a 409 for a rep name two members
    // shared), and the next deal window opened on a stale error.
    const completeLostSave = async (formData, editingOppRef, lostReason, lostCategory, activePipeline, currentUser, setLostReasonModal) => {
        const askedOrg = requestOrg();   // after an org switch its answer changes nothing (state §0.175)
        const stopped = () => ({ ok: false, error: '' });   // the org changed: the dialog is gone, nothing to say
        const today = [new Date().getFullYear(), String(new Date().getMonth()+1).padStart(2,'0'), String(new Date().getDate()).padStart(2,'0')].join('-');
        const prevOppRef = editingOppRef ? opportunities.find(o => o.id === editingOppRef.id) : null;
        const enriched = {
            ...formData,
            closeDateMovedOn: today,   // as the deal window's save (state §0.239)
            lostReason, lostCategory, lostDate: today,
            comments: prevOppRef?.comments || formData.comments || [],   // shown until the server answers; never sent (dealBody, §0.236)
            stageHistory: formData.stageHistory || prevOppRef?.stageHistory || [],
        };
        // The write is awaited and checked before anything else happens. Previously
        // both branches fired .catch(console.error) — which only sees a network
        // failure, never a 403/500 — and then called addAudit() unconditionally.
        // A rejected save therefore left the pipeline showing Closed Lost, the
        // AUDIT LOG ASSERTING it was lost, and the row in the database still open.
        // Closed Lost feeds revenue reporting, so a silent divergence there is the
        // worst of the six sites found in the hooks.
        // A deal seeded without an id (a lead's convert, an account's new deal) is new:
        // a PUT with no id answers 400, and the retry could never land.
        if (editingOppRef && editingOppRef.id) {
            const updatedOpp = { ...enriched, id: editingOppRef.id };
            const before = opportunities.find(o => o.id === editingOppRef.id);
            const shown = shownRow(updatedOpp);   // the copy this save shows — a refusal puts back only it (state §0.245, 1e)
            setOpportunities(prev => prev.map(opp => opp.id === editingOppRef.id ? shown : opp));
            const r = await dbWrite('/.netlify/functions/opportunities', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dealBody(sentBody(updatedOpp))) });   // as the deal window left it (§0.198); never the notes or the stage history (§0.236)
            if (!stillOrg(askedOrg)) return stopped();
            // An answer that proves nothing keeps the deal as sent (state §0.261, the unknown-save rule — Jeff's Q2: an answer that proves nothing keeps the change, said as maybe); the dialog says it, kept open for another press.
            if (!r.ok && r.unknown) return { ok: false, error: maybeSaid('It', 'saved as Closed Lost', r.error), unknown: true };
            if (!r.ok) {
                setOpportunities(prev => prev.map(o => (o === shown && before ? before : o)));   // never show what was not stored; nothing else is undone — a list read again since keeps what it holds
                return { ok: false, error: `Not saved as Closed Lost — ${r.error}` };   // the dialog says why; no audit
            }
            // The list takes the deal as stored — the account and id the server kept (a new
            // link is named after its account) — never the copy sent (state §0.198).
            if (r.data && r.data.opportunity) setOpportunities(prev => prev.map(o => (o.id === editingOppRef.id ? r.data.opportunity : o)));
            if ('pipelineId' in sentBody(updatedOpp)) deps.onDealElsewhere?.(r.data?.opportunity || shown);
            addAudit('update', 'opportunity', editingOppRef.id, enriched.opportunityName || enriched.account || editingOppRef.id, `Closed Lost: ${lostCategory || lostReason || ''}`);
        } else {
            const newId = formData.id || ('id_' + crypto.randomUUID());   // given when the dialog opened: a retry is the same deal
            const { fromLeadId, ...enrichedNew } = enriched;   // as the window's create (state §0.253)
            const newOpp = { ...enrichedNew, id: newId, pipelineId: enrichedNew.pipelineId || activePipeline.id };   // the pipeline picked in the window (state §0.297)
            setOpportunities(prev => [...prev, newOpp]);
            const r = await dbWrite('/.netlify/functions/opportunities', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newOpp) });
            if (!stillOrg(askedOrg)) return stopped();
            // Already stored: the dialog's earlier press landed — the list read again. One whose answer proves nothing keeps the
            // deal shown (state §0.261, the unknown-save rule — Jeff's Q2: an answer that proves nothing keeps the change, said as maybe), said in the dialog, its id kept for another press.
            if (!r.ok && r.unknown) return { ok: false, error: maybeSaid('It', 'saved as Closed Lost', r.error), unknown: true };
            if (!r.ok && !r.landed) {
                setOpportunities(prev => prev.filter(o => o.id !== newId));
                return { ok: false, error: `Not saved as Closed Lost — ${r.error}` };
            }
            if (r.landed) { setOpportunities(prev => prev.filter(o => o.id !== newId)); loadOpportunities(); }
            if (r.data && r.data.opportunity) setOpportunities(prev => prev.map(o => (o.id === newId ? r.data.opportunity : o)));
            if (!r.landed) deps.onDealElsewhere?.(r.data?.opportunity || newOpp);   // as the window's (state §0.297)
            addAudit('create', 'opportunity', newId, enriched.opportunityName || enriched.account || newId, `Closed Lost: ${lostCategory || lostReason || ''}`);
            if (fromLeadId) deps.onLeadConverted?.(fromLeadId);
        }
        setLostReasonModal(null);
        return { ok: true };
    };

    // A deal's team notes are saved the moment one is posted, edited or deleted
    // (state §0.177). They lived on the deal on screen until the deal was saved —
    // closing the modal instead lost them on reload.
    //
    // One operation at a time (state §0.236; Jeff's Q1, Q2): { op: 'add', text } | { op: 'edit', id, text } |
    // { op: 'delete', id }. The server applies it to the notes as stored and stamps who and when; the list takes
    // the notes the server answers — on a refusal too (a note deleted since, another's note), so the screen shows
    // what is stored. It sent the deal's whole list, built from this screen's copy: a copy older than the stored
    // list erased every note posted since.
    const NOTE_DONE = { add: 'posted', edit: 'saved', delete: 'deleted' };   // what a maybe says of each operation (§0.261)
    const saveDealNote = async (oppId, note) => {
        const askedOrg = requestOrg();   // after an org switch its answer changes nothing (state §0.175)
        let res, body = null;
        try {
            res = await dbFetch('/.netlify/functions/opportunities', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: oppId, note }),
            });
            try { body = await res.json(); } catch { body = null; }
        } catch {
            if (!stillOrg(askedOrg)) return stopped();
            return { ok: false, error: maybeSaid('The note', NOTE_DONE[note?.op] || 'saved', NETWORK_ERROR), unknown: true };   // a throw proves nothing (§0.261)
        }
        if (!stillOrg(askedOrg)) return stopped();   // the deal modal was remounted by the switch
        const notes = res.ok ? body?.opportunity?.comments : body?.comments;
        if (Array.isArray(notes)) setOpportunities(prev => prev.map(o => (o.id === oppId ? { ...o, comments: notes } : o)));
        // A delete of a note already gone (state §0.271): an earlier press landed — done, the notes as stored.
        if (!res.ok && note?.op === 'delete' && landedBefore(res.status, body)) return { ok: true, comments: notes };
        // Only a 4xx in the server's words wrote nothing; any other refused answer may have (state §0.261, the unknown-save rule — Jeff's Q2: an answer that proves nothing keeps the change, said as maybe). A post's note id is the
        // server's: the window holds Post after one (OpportunityModal), never a second note.
        if (!res.ok && !heardRefusal(res.status, body)) return { ok: false, error: maybeSaid('The note', NOTE_DONE[note?.op] || 'saved', body?.error || `The server returned ${res.status}.`), unknown: true, comments: notes };
        if (!res.ok) return { ok: false, error: body?.error || (res.status === 403 ? 'You do not have permission to make this change.' : `The server returned ${res.status}.`), comments: notes };
        return { ok: true, comments: notes };
    };

    return {
        opportunities,
        setOpportunities,
        saveDealNote,
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
