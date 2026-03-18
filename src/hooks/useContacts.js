import { useState } from 'react';
import { dbFetch } from '../utils/storage';

export function useContacts(deps) {
    const { addAudit, showConfirm, softDelete, setUndoToast, getQuarter, getQuarterLabel } = deps;

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
        const contact = contacts.find(c => c.id === contactId);
        if (!contact) return;
        showConfirm('Are you sure you want to delete this contact?', () => {
            const snapshot = [...contacts];
            setContacts(contacts.filter(c => c.id !== contactId));
            dbFetch(`/.netlify/functions/contacts?id=${contactId}`, { method: 'DELETE' })
                .catch(err => console.error('Failed to delete contact:', err));
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
                setContacts(contacts.map(c => c.id === editingContact.id ? (data.contact || payload) : c));
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
                setContacts([...contacts, data.contact || newContact]);
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
