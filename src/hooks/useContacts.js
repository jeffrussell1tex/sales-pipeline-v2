import { useState } from 'react';
import { dbFetch } from '../utils/storage';

export function useContacts(deps) {
    const { addAudit, showConfirm, softDelete, setUndoToast, getQuarter, getQuarterLabel, showBlockedDelete, opportunities } = deps;

    const [contacts, setContacts] = useState([]);
    const [contactModalError, setContactModalError] = useState(null);
    const [contactModalSaving,
        setContactModalSaving] = useState(false);

    const loadContacts = (setDbOffline) => {
        dbFetch('/.netlify/functions/contacts')
            .then(r => { if (!r.ok) { setDbOffline(true); throw new Error('HTTP ' + r.status); } setDbOffline(false); return r.json(); })
            .then(data => setContacts(data.contacts || []))
            .catch(err => console.error('Failed to load contacts:', err));
    };

    const handleDeleteContact = (contactId) => {
        // Read contact from current state synchronously before confirm dialog
        let contact;
        setContacts(prev => {
            contact = prev.find(c => c.id === contactId);
            return prev; // no change yet — just reading
        });

        // Fallback: read directly (state read above may not flush synchronously in all cases)
        if (!contact) {
            // Can't find it — nothing to delete
            return;
        }

        // Block delete if contact is linked to any active (non-closed) opportunity
        const fullName = ((contact.firstName || '') + ' ' + (contact.lastName || '')).trim();
        const closedStages = ['closed won', 'closed lost', 'won', 'lost'];
        const linkedActiveOpp = (opportunities || []).find(opp => {
            const isActive = !closedStages.includes((opp.stage || '').toLowerCase());
            if (!isActive) return false;
            // Match by contactIds array (primary) or contacts name string (legacy)
            const byId = opp.contactIds && opp.contactIds.includes(contactId);
            const byName = fullName && opp.contacts && opp.contacts.split(',')
                .map(s => s.trim().toLowerCase())
                .some(n => n.startsWith(fullName.toLowerCase()));
            return byId || byName;
        });
        if (linkedActiveOpp) {
            showBlockedDelete(
                `Cannot Delete "${fullName}"`,
                `This contact is linked to an active opportunity ("${linkedActiveOpp.opportunityName || linkedActiveOpp.account}"). Please remove them from that opportunity before deleting.`
            );
            return;
        }

        showConfirm('Are you sure you want to delete this contact?', () => {
            // Snapshot captured right when user confirms, inside the callback
            let snapshot;
            setContacts(prev => {
                snapshot = prev.slice();
                return prev.filter(c => c.id !== contactId);
            });

            dbFetch(`/.netlify/functions/contacts?id=${contactId}`, { method: 'DELETE' })
                .then(async res => {
                    if (!res.ok) {
                        // DB delete failed — restore the contact
                        console.error('Failed to delete contact on server, restoring. Status:', res.status);
                        setContacts(prev => {
                            if (prev.some(c => c.id === contactId)) return prev; // already restored
                            return [...prev, contact].sort((a, b) =>
                                (a.lastName || '').localeCompare(b.lastName || ''));
                        });
                    }
                })
                .catch(err => {
                    console.error('Failed to delete contact (network error), restoring:', err);
                    setContacts(prev => {
                        if (prev.some(c => c.id === contactId)) return prev;
                        return [...prev, contact].sort((a, b) =>
                            (a.lastName || '').localeCompare(b.lastName || ''));
                    });
                });

            addAudit('delete', 'contact', contactId,
                ((contact.firstName || '') + ' ' + (contact.lastName || '')).trim() || contactId,
                contact.company || '');

            softDelete(
                `Contact "${((contact.firstName || '') + ' ' + (contact.lastName || '')).trim()}"`,
                () => {},
                () => { setContacts(snapshot); setUndoToast(null); }
            );
        });
    };

    const handleSaveContact = async (contactData, { editingContact, setShowContactModal }) => {
        setContactModalError(null);
        setContactModalSaving(true);
        const fullName = ((contactData.firstName || '') + ' ' + (contactData.lastName || '')).trim();
        if (editingContact) {
            const payload = { ...contactData, id: editingContact.id };
            try {
                const res = await dbFetch('/.netlify/functions/contacts', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                const data = await res.json();
                if (!res.ok) { setContactModalError(data.error || 'Failed to save contact. Please try again.'); setContactModalSaving(false); return; }
                setContacts(prev => prev.map(c => c.id === editingContact.id ? (data.contact || payload) : c));
                addAudit('update', 'contact', editingContact.id, fullName || editingContact.id, contactData.company || '');
                setShowContactModal(false); setContactModalError(null);
            } catch (err) {
                console.error('Failed to update contact:', err);
                setContactModalError('Failed to save contact. Please check your connection and try again.');
            } finally { setContactModalSaving(false); }
        } else {
            const newId = 'id_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
            const newContact = { ...contactData, id: newId };
            try {
                const res = await dbFetch('/.netlify/functions/contacts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newContact) });
                const data = await res.json();
                if (!res.ok) { setContactModalError(data.error || 'Failed to save contact. Please try again.'); setContactModalSaving(false); return; }
                setContacts(prev => [...prev, data.contact || newContact]);
                addAudit('create', 'contact', newId, fullName || newId, contactData.company || '');
                setShowContactModal(false); setContactModalError(null);
            } catch (err) {
                console.error('Failed to save contact:', err);
                setContactModalError('Failed to save contact. Please check your connection and try again.');
            } finally { setContactModalSaving(false); }
        }
    };

    return {
        contacts,
        setContacts,
        contactModalError,
        setContactModalError,
        contactModalSaving,
        setContactModalSaving,
        loadContacts,
        handleDeleteContact,
        handleSaveContact,
    };
}
