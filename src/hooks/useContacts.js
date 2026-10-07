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

    // One delete path for contacts (state §0.178) — every screen's Delete comes here:
    // the Contacts tab's row menus (the people list and the company view) and its
    // bulk Delete. A contact on an open deal is kept — the deal would name a contact
    // that is gone (Jeff: "Block it") — and contacts.mjs refuses one too, since a rep
    // sees only some deals. The rest go after a confirm, one DELETE each, and Undo is
    // offered once they have landed.
    //
    // This hook's delete had no caller: the row menu deleted at once, without a
    // confirm and without the open-deal check, and the bulk Delete skipped the check.
    //
    // opts.admin: the caller is an Admin — every contact in the org going, none kept,
    // clears them in one request. opts.onConfirm runs when the user confirms.
    const handleDeleteContacts = (ids, opts = {}) => {
        const wanted = contacts.filter(c => (ids || []).includes(c.id));
        if (!wanted.length) return;
        const nameOf = (c) => [c.firstName, c.lastName].filter(Boolean).join(' ') || 'Contact';
        const dealName = (o) => o.opportunityName || o.account || 'an open deal';
        // The deals as they are now — App fills deps.opportunities after this hook has run (§0.176).
        const kept = wanted.map(c => ({ c, deal: activeDealsOf(c, deps.opportunities)[0] })).filter(k => k.deal);
        const going = wanted.filter(c => !kept.some(k => k.c.id === c.id));
        if (!going.length) {
            showBlockedDelete(
                kept.length === 1 ? `Cannot Delete "${nameOf(kept[0].c)}"` : `Cannot Delete ${kept.length} Contacts`,
                kept.length === 1
                    ? `This contact is on an open deal ("${dealName(kept[0].deal)}"). Remove them from the deal, or close it, before deleting.`
                    : `Each of these contacts is on an open deal: ${kept.map(k => nameOf(k.c)).join(', ')}. Remove them from their deals, or close the deals, before deleting.`
            );
            return;
        }
        const what = going.length === 1 ? `"${nameOf(going[0])}"` : `${going.length} contacts`;
        const keptLine = kept.length ? `\n\nKept — on open deals: ${kept.map(k => nameOf(k.c)).join(', ')}.` : '';
        showConfirm(`Delete ${what}? You'll have a few seconds to undo.${keptLine}`, async () => {
            opts.onConfirm?.();
            const askedOrg = requestOrg();   // cut by an org switch, it stops (state §0.175)
            const goingIds = going.map(c => c.id);
            setContacts(prev => prev.filter(c => !goingIds.includes(c.id)));
            const failed = [];
            if (opts.admin && !kept.length && goingIds.length === contacts.length) {
                const r = await dbWrite('/.netlify/functions/contacts?clear=true', { method: 'DELETE' });
                if (!stillOrg(askedOrg)) return;
                if (!r.ok) failed.push(...going.map(c => ({ c, error: r.error })));
            } else {
                for (const c of going) {
                    if (!stillOrg(askedOrg)) return;   // the next DELETE would carry the new org's token
                    const r = await dbWrite(`/.netlify/functions/contacts?id=${c.id}`, { method: 'DELETE' });
                    if (!r.ok) failed.push({ c, error: r.error });
                }
                if (!stillOrg(askedOrg)) return;   // no Undo for the last org's rows on the new org's screen
            }
            if (failed.length) {
                // What did not delete is put back, and the first refusal is shown — the server's
                // open-deal refusal names the deal.
                setContacts(prev => {
                    const have = new Set(prev.map(c => c.id));
                    return [...prev, ...failed.map(f => f.c).filter(c => !have.has(c.id))];
                });
                setUndoToast({ error: going.length === 1
                    ? `Contact not deleted — ${failed[0].error}`
                    : `${failed.length} of ${going.length} contacts not deleted — ${failed[0].error}` });
                if (failed.length === going.length) return;   // nothing deleted, nothing to undo
            }
            const deleted = going.filter(c => !failed.some(f => f.c.id === c.id));
            softDelete(
                deleted.length === 1 ? `Contact "${nameOf(deleted[0])}"` : `${deleted.length} contacts`,
                () => {},
                async () => {
                    setUndoToast(null);
                    setContacts(prev => {
                        const have = new Set(prev.map(c => c.id));
                        return [...prev, ...deleted.filter(c => !have.has(c.id))];
                    });
                    // Undo re-POSTs each; a refused restore takes it off the screen again and says so.
                    const notRestored = [];
                    for (const c of deleted) {
                        if (!stillOrg(askedOrg)) return;   // the next POST would carry the new org's token
                        const rr = await dbWrite('/.netlify/functions/contacts', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(c),
                        });
                        if (!rr.ok) notRestored.push({ c, error: rr.error });
                    }
                    if (!stillOrg(askedOrg)) return;
                    if (notRestored.length) {
                        const gone = notRestored.map(n => n.c.id);
                        setContacts(prev => prev.filter(c => !gone.includes(c.id)));   // undo did not take
                        setUndoToast({ error: notRestored.length === 1
                            ? `Could not restore ${nameOf(notRestored[0].c)} — ${notRestored[0].error}`
                            : `${notRestored.length} contacts could not be restored — ${notRestored[0].error}` });
                    }
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
        handleDeleteContacts,
        handleSaveContact,
    };
}
