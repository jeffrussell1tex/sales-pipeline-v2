import { useState } from 'react';
import { dbStatusOf } from '../utils/fetchStatus';
import { dbFetch, dbWrite, requestOrg, stillOrg } from '../utils/storage';
import { isOpenDeal } from '../utils/contactDeals.js';

export function useAccounts(deps) {
    const { addAudit, showConfirm, softDelete, setUndoToast, showBlockedDelete } = deps;

    const [accounts, setAccounts] = useState([]);
    const [accountModalError, setAccountModalError] = useState(null);
    const [accountModalSaving, setAccountModalSaving] = useState(false);

    const loadAccounts = (setDbOffline) => {
        const askedOrg = requestOrg();   // an answer for an org switched away from is dropped (state §0.173)
        dbFetch('/.netlify/functions/accounts')
            .then(r => { if (!stillOrg(askedOrg)) return null; setDbOffline(dbStatusOf(r)); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
            .then(data => { if (data && stillOrg(askedOrg)) setAccounts(data.accounts || []); })
            .catch(err => console.error('Failed to load accounts:', err));
    };

    const getSubAccounts = (accountId) => (accounts || []).filter(a => (a.parentAccountId || a.parentId) === accountId);

    const getAccountDepth = (accountId) => {
        const acc = accounts.find(a => a.id === accountId);
        if (!acc || !acc.parentAccountId) return 0;
        const parent = accounts.find(a => a.id === acc.parentAccountId);
        if (!parent || !parent.parentAccountId) return 1;
        return 2;
    };

    const getTierFromDepth = (depth) => depth === 0 ? 'account' : depth === 1 ? 'business_unit' : 'site';

    const getAccountRollup = (acc) => {
        return acc;
    };

    // One delete path for accounts (state §0.178) — the Accounts tab's bulk Delete, an
    // Admin's (accounts.mjs deletes an account for an Admin only). An account with an
    // open deal is kept (Jeff: "Block it"), and accounts.mjs refuses one too. Its
    // sub-accounts are not deleted with it: the server promotes them to the top level,
    // the screen does the same, the confirm says so, and Undo puts them back under it.
    //
    // This hook's delete had no caller — the tab deleted with its own code, without the
    // open-deal check — and it would have deleted the sub-accounts the server keeps.
    // opts.onConfirm runs when the user confirms.
    const handleDeleteAccounts = (ids, opts = {}) => {
        const wanted = accounts.filter(a => (ids || []).includes(a.id));
        if (!wanted.length) return;
        const dealName = (o) => o.opportunityName || o.account || 'an open deal';
        // An account's open deals: by its id, or by its name where a deal has no id — the
        // rule accounts.mjs applies. The deals as they are now (§0.176).
        const openDealOf = (a) => (deps.opportunities || []).find(o =>
            isOpenDeal(o) && (o.accountId ? o.accountId === a.id : o.account === a.name));
        const kept = wanted.map(a => ({ a, deal: openDealOf(a) })).filter(k => k.deal);
        const going = wanted.filter(a => !kept.some(k => k.a.id === a.id));
        if (!going.length) {
            showBlockedDelete(
                kept.length === 1 ? `Cannot Delete "${kept[0].a.name}"` : `Cannot Delete ${kept.length} Accounts`,
                kept.length === 1
                    ? `This account has an open deal ("${dealName(kept[0].deal)}"). Close the deal, or move it to another account, before deleting.`
                    : `Each of these accounts has an open deal: ${kept.map(k => k.a.name).join(', ')}. Close the deals, or move them, before deleting.`
            );
            return;
        }
        const goingIds = going.map(a => a.id);
        const parentOf = (a) => a.parentAccountId || a.parentId || null;
        // The sub-accounts the server will promote, each with the account it stood under.
        const children = accounts.filter(a => goingIds.includes(parentOf(a)) && !goingIds.includes(a.id))
            .map(a => ({ id: a.id, parentId: parentOf(a) }));
        const what = going.length === 1 ? `"${going[0].name}"` : `${going.length} accounts`;
        const subLine = children.length
            ? `\n\n${children.length} sub-account${children.length === 1 ? '' : 's'} will move to the top level.` : '';
        const keptLine = kept.length ? `\n\nKept — open deals: ${kept.map(k => k.a.name).join(', ')}.` : '';
        showConfirm(`Delete ${what}? You'll have a few seconds to undo.${subLine}${keptLine}`, async () => {
            opts.onConfirm?.();
            const askedOrg = requestOrg();   // cut by an org switch, it stops (state §0.175)
            setAccounts(prev => prev.filter(a => !goingIds.includes(a.id)));
            const failed = [];
            for (const a of going) {
                if (!stillOrg(askedOrg)) return;   // the next DELETE would carry the new org's token
                const r = await dbWrite(`/.netlify/functions/accounts?id=${a.id}`, { method: 'DELETE' });
                if (!r.ok) failed.push({ a, error: r.error });
            }
            if (!stillOrg(askedOrg)) return;   // no Undo for the last org's rows on the new org's screen
            const deleted = going.filter(a => !failed.some(f => f.a.id === a.id));
            const deletedIds = deleted.map(a => a.id);
            const promoted = children.filter(c => deletedIds.includes(c.parentId));
            // The server promoted the deleted accounts' sub-accounts; the screen does the same.
            setAccounts(prev => prev.map(a => (promoted.some(c => c.id === a.id) ? { ...a, parentAccountId: null } : a)));
            if (failed.length) {
                // What did not delete is put back, and the first refusal is shown — the
                // server's open-deal refusal names the deal.
                setAccounts(prev => {
                    const have = new Set(prev.map(a => a.id));
                    return [...prev, ...failed.map(f => f.a).filter(a => !have.has(a.id))];
                });
                setUndoToast({ error: going.length === 1
                    ? `Account not deleted — ${failed[0].error}`
                    : `${failed.length} of ${going.length} accounts not deleted — ${failed[0].error}` });
                if (!deleted.length) return;   // nothing deleted, nothing to undo
            }
            softDelete(
                deleted.length === 1 ? `Account "${deleted[0].name}"` : `${deleted.length} accounts`,
                () => {},
                async () => {
                    setUndoToast(null);
                    setAccounts(prev => {
                        const have = new Set(prev.map(a => a.id));
                        const back = prev.map(a => {
                            const c = promoted.find(p => p.id === a.id);
                            return c ? { ...a, parentAccountId: c.parentId } : a;
                        });
                        return [...back, ...deleted.filter(a => !have.has(a.id))];
                    });
                    // Undo re-POSTs each account, then puts its sub-accounts back under it
                    // (the PUT merges over the stored row, §0.169); a refusal says so.
                    const notRestored = [];
                    for (const a of deleted) {
                        if (!stillOrg(askedOrg)) return;   // the next POST would carry the new org's token
                        const rr = await dbWrite('/.netlify/functions/accounts', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(a),
                        });
                        if (!rr.ok) { notRestored.push({ a, error: rr.error }); continue; }
                        for (const c of promoted.filter(p => p.parentId === a.id)) {
                            if (!stillOrg(askedOrg)) return;   // the next PUT would carry the new org's token
                            const rp = await dbWrite('/.netlify/functions/accounts', {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ id: c.id, parentAccountId: c.parentId }),
                            });
                            if (!rp.ok) notRestored.push({ a, error: rp.error });
                        }
                    }
                    if (!stillOrg(askedOrg)) return;
                    if (notRestored.length) {
                        // Undo did not take, or took in part: say so, and show the list as the
                        // server has it rather than a guess at it.
                        setUndoToast({ error: `Could not restore ${notRestored[0].a.name} — ${notRestored[0].error}` });
                        loadAccounts(() => {});
                    }
                }
            );
        });
    };

    const handleSaveAccount = async (
        formData,
        { editingAccount, editingSubAccount, parentAccountForSub,
          accountCreatedFromOppForm, pendingOppFormData,
          setShowAccountModal, setLastCreatedAccountName,
          setEditingOpp, setShowModal,
          setAccountCreatedFromOppForm, setPendingOppFormData,
          setOpportunities, setContacts }
    ) => {
        const askedOrg = requestOrg();   // after an org switch its answer changes nothing (state §0.175)
        setAccountModalError(null);
        setAccountModalSaving(true);
        try {
            let payload, method, auditAction, auditId, auditName, auditDetail;
            if (editingAccount) {
                payload = { ...formData, id: editingAccount.id };
                method = 'PUT'; auditAction = 'update'; auditId = editingAccount.id;
                auditName = formData.name || editingAccount.id; auditDetail = formData.industry || '';
            } else if (editingSubAccount) {
                payload = { ...formData, id: editingSubAccount.id, parentAccountId: editingSubAccount.parentAccountId || editingSubAccount.parentId };
                method = 'PUT'; auditAction = 'update'; auditId = editingSubAccount.id;
                auditName = formData.name || editingSubAccount.id; auditDetail = '';
            } else if (parentAccountForSub) {
                const newId = 'id_' + crypto.randomUUID();
                const parentDepth = getAccountDepth(parentAccountForSub.id);
                const forceTier = parentAccountForSub._forceTier || formData._forceTier;
                let tier;
                if (parentDepth >= 1) {
                    tier = 'site';
                } else if (forceTier === 'site') {
                    tier = 'site';
                } else {
                    tier = 'business_unit';
                }
                const { _forceTier: _drop, ...cleanFormData } = formData;
                payload = { ...cleanFormData, id: newId, parentAccountId: parentAccountForSub.id, accountTier: tier };
                method = 'POST'; auditAction = 'create'; auditId = newId;
                auditName = formData.name || newId; auditDetail = 'Sub-account of ' + parentAccountForSub.name;
            } else {
                const newId = 'id_' + crypto.randomUUID();
                payload = { ...formData, id: newId };
                method = 'POST'; auditAction = 'create'; auditId = newId;
                auditName = formData.name || newId; auditDetail = formData.industry || '';
            }
            const res = await dbFetch('/.netlify/functions/accounts', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            const data = await res.json();
            if (!stillOrg(askedOrg)) return;
            if (!res.ok) { setAccountModalError(data.error || 'Failed to save account. Please try again.'); setAccountModalSaving(false); return; }
            const saved = data.account || payload;
            if (method === 'PUT') {
                setAccounts(prev => prev.map(acc => acc.id === saved.id ? saved : acc));
                // Backend cascades a rename into opportunities.account / contacts.company;
                // mirror it in local state so the UI updates without a reload.
                if (data.renamed) {
                    setOpportunities && setOpportunities(prev => prev.map(o => o.accountId === saved.id ? { ...o, account: saved.name } : o));
                    setContacts && setContacts(prev => prev.map(c => c.accountId === saved.id ? { ...c, company: saved.name } : c));
                }
            } else {
                setAccounts(prev => [...prev, saved]);
                if (accountCreatedFromOppForm) {
                    setLastCreatedAccountName(formData.name);
                    setEditingOpp(pendingOppFormData);
                    setShowModal(true);
                    setAccountCreatedFromOppForm(false);
                    setPendingOppFormData(null);
                }
            }
            addAudit(auditAction, 'account', auditId, auditName, auditDetail);
            setShowAccountModal(false); setAccountModalError(null);
        } catch (err) {
            if (!stillOrg(askedOrg)) return;
            console.error('Failed to save account:', err);
            setAccountModalError('Failed to save account. Please check your connection and try again.');
        } finally {
            setAccountModalSaving(false);
        }
    };

    return {
        accounts,
        setAccounts,
        accountModalError,
        setAccountModalError,
        accountModalSaving,
        setAccountModalSaving,
        loadAccounts,
        getSubAccounts,
        getAccountRollup,
        handleDeleteAccounts,
        handleSaveAccount,
    };
}
