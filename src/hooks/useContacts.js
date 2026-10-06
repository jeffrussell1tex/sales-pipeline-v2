import { useState } from 'react';
import { dbStatusOf } from '../utils/fetchStatus';
import { dbFetch, dbWrite, requestOrg, stillOrg } from '../utils/storage';
import { activeDealsOf } from '../utils/contactDeals.js';

export function useContacts(deps) {
    const { addAudit, showConfirm, softDelete, setUndoToast, showBlockedDelete } = deps;

    const [contacts, setContacts] = useState([]);
    const [contactModalError, setContactModalError] = useState(null);
    const [contactModalSaving,
        setContactModalSaving] = useState(false);

    const loadContacts = (setDbOffline) => {
        const askedOrg = requestOrg();   // an answer for an org switched away from is dropped (state §0.173)
        dbFetch('/.netlify/functions/contacts')
            .then(r => { if (!stillOrg(askedOrg)) return null; setDbOffline(dbStatusOf(r)); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
            .then(data => { if (data && stillOrg(askedOrg)) setContacts(data.contacts || []); })
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

        // Block delete if the contact has an open deal — the rail's list (state §0.176).
        // By name it matched any name beginning with the contact's: a deal naming "Grace Kimball" blocked deleting "Grace Kim".
        const fullName = ((contact.firstName || '') + ' ' + (contact.lastName || '')).trim();
        // The deals as they are now: App fills deps.opportunities after this hook has
        // run in a render, so a copy taken at the hook's top is the render before's
        // list — a deal saved in the last render was not in it.
        const linkedActiveOpp = activeDealsOf(contact, deps.opportunities)[0];
        if (linkedActiveOpp) {
            showBlockedDelete(
                `Cannot Delete "${fullName}"`,
                `This contact is linked to an active opportunity ("${linkedActiveOpp.opportunityName || linkedActiveOpp.account}"). Please remove them from that opportunity before deleting.`
            );
            return;
        }

        showConfirm('Are you sure you want to delete this contact?', () => {
            const askedOrg = requestOrg();   // after an org switch its answers change nothing (state §0.175)
            // Snapshot captured right when user confirms, inside the callback
            let snapshot;
            setContacts(prev => {
                snapshot = prev.slice();
                return prev.filter(c => c.id !== contactId);
            });

            dbFetch(`/.netlify/functions/contacts?id=${contactId}`, { method: 'DELETE' })
                .then(async res => {
                    if (!stillOrg(askedOrg)) return;
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
                    if (!stillOrg(askedOrg)) return;
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
                () => {
                    setContacts(snapshot);
                    setUndoToast(null);
                    // Re-insert the deleted contact back to the DB
                    // Undo restores the row in the UI immediately, then re-POSTs it.
                    // This used .catch() alone, which never fires on a 403/500 — so a
                    // rejected restore left the contact visible but deleted in the
                    // database, and the divergence only surfaced on the next reload.
                    dbWrite('/.netlify/functions/contacts', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(contact),
                    }).then(r => {
                        if (r.ok || !stillOrg(askedOrg)) return;
                        setContacts(prev => prev.filter(c => c.id !== contact.id));   // undo did not take
                        setUndoToast({ error: `Could not restore the contact — ${r.error}` });
                    });
                }
            );
        });
    };

    const handleSaveContact = async (contactData, { editingContact, setShowContactModal }) => {
        const askedOrg = requestOrg();   // after an org switch its answer changes nothing (state §0.175)
        setContactModalError(null);
        setContactModalSaving(true);
        const fullName = ((contactData.firstName || '') + ' ' + (contactData.lastName || '')).trim();
        if (editingContact) {
            const payload = { ...contactData, id: editingContact.id };
            try {
                const res = await dbFetch('/.netlify/functions/contacts', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                const data = await res.json();
                if (!stillOrg(askedOrg)) return;
                if (!res.ok) { setContactModalError(data.error || 'Failed to save contact. Please try again.'); setContactModalSaving(false); return; }
                setContacts(prev => prev.map(c => c.id === editingContact.id ? (data.contact || payload) : c));
                addAudit('update', 'contact', editingContact.id, fullName || editingContact.id, contactData.company || '');
                setShowContactModal(false); setContactModalError(null);
            } catch (err) {
                if (!stillOrg(askedOrg)) return;
                console.error('Failed to update contact:', err);
                setContactModalError('Failed to save contact. Please check your connection and try again.');
            } finally { setContactModalSaving(false); }
        } else {
            const newId = 'id_' + crypto.randomUUID();
            const newContact = { ...contactData, id: newId };
            try {
                const res = await dbFetch('/.netlify/functions/contacts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newContact) });
                const data = await res.json();
                if (!stillOrg(askedOrg)) return;
                if (!res.ok) { setContactModalError(data.error || 'Failed to save contact. Please try again.'); setContactModalSaving(false); return; }
                setContacts(prev => [...prev, data.contact || newContact]);
                addAudit('create', 'contact', newId, fullName || newId, contactData.company || '');
                setShowContactModal(false); setContactModalError(null);
            } catch (err) {
                if (!stillOrg(askedOrg)) return;
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
