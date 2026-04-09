import { useState } from 'react';
import { dbFetch } from '../utils/storage';

export function useAccounts(deps) {
    const { addAudit, showConfirm, softDelete, setUndoToast, getQuarter, getQuarterLabel, showBlockedDelete } = deps;

    const [accounts, setAccounts] = useState([]);
    const [accountModalError, setAccountModalError] = useState(null);
    const [accountModalSaving, setAccountModalSaving] = useState(false);

    const loadAccounts = (setDbOffline) => {
        dbFetch('/.netlify/functions/accounts')
            .then(r => { if (!r.ok) { setDbOffline(true); throw new Error('HTTP ' + r.status); } setDbOffline(false); return r.json(); })
            .then(data => setAccounts(data.accounts || []))
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

    const handleDeleteAccount = (accountId, opps) => {
        const opportunities = opps;
        const account = accounts.find(acc => acc.id === accountId);
        if (!account) return;

        const subs = getSubAccounts(accountId);
        const allIds = [accountId, ...subs.map(s => s.id)];
        const allNames = [account.name, ...subs.map(s => s.name)];

        const hasActiveOpportunities = (opportunities || []).some(opp => allNames.includes(opp.account));
        if (hasActiveOpportunities) {
            showBlockedDelete(
                `Cannot Delete "${account.name}"`,
                `This account has active opportunities linked to it. Please close or reassign those opportunities before deleting this account.`
            );
            return;
        }

        const subMsg = subs.length > 0 ? ` This will also delete ${subs.length} sub-account${subs.length > 1 ? 's' : ''}.` : '';
        showConfirm(`Are you sure you want to delete "${account.name}"?${subMsg}`, () => {
            // Snapshot captured inside confirm callback — fresh state at time of confirmation
            let snapshot;
            setAccounts(prev => {
                snapshot = prev.slice();
                return prev.filter(a => !allIds.includes(a.id));
            });

            // Fire deletes for all IDs and restore if any fail
            const deletePromises = allIds.map(id =>
                dbFetch(`/.netlify/functions/accounts?id=${id}`, { method: 'DELETE' })
                    .then(res => {
                        if (!res.ok) throw new Error('HTTP ' + res.status);
                    })
            );

            Promise.allSettled(deletePromises).then(results => {
                const anyFailed = results.some(r => r.status === 'rejected');
                if (anyFailed) {
                    console.error('One or more account deletes failed — restoring accounts');
                    setAccounts(snapshot);
                }
            });

            addAudit('delete', 'account', accountId, account.name, '');
            softDelete(
                `Account "${account.name}"`,
                () => {},
                () => { setAccounts(snapshot); setUndoToast(null); }
            );
        });
    };

    const handleDeleteSubAccount = (parentId, subAccountId, opportunities) => {
        handleDeleteAccount(subAccountId, opportunities);
    };

    const handleSaveAccount = async (
        formData,
        { editingAccount, editingSubAccount, parentAccountForSub,
          accountCreatedFromOppForm, pendingOppFormData,
          setShowAccountModal, setLastCreatedAccountName,
          setEditingOpp, setShowModal,
          setAccountCreatedFromOppForm, setPendingOppFormData }
    ) => {
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
                const newId = 'id_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
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
                const newId = 'id_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
                payload = { ...formData, id: newId };
                method = 'POST'; auditAction = 'create'; auditId = newId;
                auditName = formData.name || newId; auditDetail = formData.industry || '';
            }
            const res = await dbFetch('/.netlify/functions/accounts', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            const data = await res.json();
            if (!res.ok) { setAccountModalError(data.error || 'Failed to save account. Please try again.'); setAccountModalSaving(false); return; }
            const saved = data.account || payload;
            if (method === 'PUT') {
                setAccounts(prev => prev.map(acc => acc.id === saved.id ? saved : acc));
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
        handleDeleteAccount,
        handleDeleteSubAccount,
        handleSaveAccount,
    };
}
