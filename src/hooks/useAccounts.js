import { useState } from 'react';
import { dbFetch } from '../utils/storage';

export function useAccounts(deps) {
    const { addAudit, showConfirm, softDelete, setUndoToast, getQuarter, getQuarterLabel } = deps;

    const [accounts, setAccounts] = useState([]);
    const [accountModalError, setAccountModalError] = useState(null);
    const [accountModalSaving,
        setAccountModalSaving] = useState(false);

    const loadAccounts = (setDbOffline) => {
        dbFetch('/.netlify/functions/accounts')
            .then(r => { if (!r.ok) { setDbOffline(true); throw new Error('HTTP ' + r.status); } setDbOffline(false); return r.json(); })
            .then(data => setAccounts(data.accounts || []))
            .catch(err => console.error('Failed to load accounts:', err));
    };

    const getSubAccounts = (accountId) => (accounts || []).filter(a => (a.parentAccountId || a.parentId) === accountId);

    const getAccountRollup = (acc) => {
        // Rollup is computed in App.jsx using opportunities — keep as pass-through here
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
            alert(`Cannot delete "${account.name}" because it has active opportunities. Please close or reassign them first.`);
            return;
        }

        const subMsg = subs.length > 0 ? ` This will also delete ${subs.length} sub-account${subs.length > 1 ? 's' : ''}.` : '';
        showConfirm(`Are you sure you want to delete "${account.name}"?${subMsg}`, () => {
            const snapshot = [...accounts];
            setAccounts(accounts.filter(a => !allIds.includes(a.id)));
            allIds.forEach(id => {
                dbFetch(`/.netlify/functions/accounts?id=${id}`, { method: 'DELETE' })
                    .catch(err => console.error('Failed to delete account:', err));
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
                // Determine tier: _forceTier wins, then formData.accountTier, then infer from parent
                const parentIsBU = parentAccountForSub.accountTier === 'business_unit' || !!parentAccountForSub.parentAccountId;
                const forcedTier = parentAccountForSub._forceTier;
                const tier = forcedTier || formData.accountTier || (parentIsBU ? 'site' : 'business_unit');
                payload = { ...formData, id: newId, parentAccountId: parentAccountForSub.id, accountTier: tier };
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
                setAccounts(accounts.map(acc => acc.id === saved.id ? saved : acc));
            } else {
                setAccounts([...accounts, saved]);
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
