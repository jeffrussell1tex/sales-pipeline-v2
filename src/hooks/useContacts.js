import { useState, useRef } from 'react';
import { dbStatusOf } from '../utils/fetchStatus';
import { dbFetch, dbWrite, requestOrg, stillOrg } from '../utils/storage';
import { activeDealsOf } from '../utils/contactDeals.js';
import { sentBody, shownRow } from '../utils/leaveOut.js';
import { failureWords, landedBefore, maybeSaid, writeRefusal } from '../utils/refusalWords.js';
import { isRestoring, undoWhileOut, stillRestoringWords } from '../utils/restoring.js';

export function useContacts(deps) {
    const { addAudit, showConfirm, softDelete, setUndoToast, showBlockedDelete } = deps;

    const [contacts, setContacts] = useState([]);
    const [contactModalError, setContactModalError] = useState(null);
    const [contactModalSaving,
        setContactModalSaving] = useState(false);

    // The latest load of the contacts: an answer a later load overtook is dropped (state §0.207) — a merge's
    // reload landing after its Undo's put the merge back on screen, and the next whole-row save sent it.
    const loadGen = useRef(0);
    const loadContacts = (setDbOffline) => {
        const askedOrg = requestOrg();   // an answer for an org switched away from is dropped (state §0.173)
        const gen = ++loadGen.current;
        dbFetch('/.netlify/functions/contacts')
            .then(r => { if (!stillOrg(askedOrg)) return null; setDbOffline(dbStatusOf(r)); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
            .then(data => (gen === loadGen.current ? data : null))   // a later load overtook it
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
            // One its own Undo is still re-POSTing is not deleted under it (state §0.273): said, and nothing sent.
            const stillOut = going.filter(c => isRestoring('contact', c.id));
            if (stillOut.length) { setUndoToast({ error: stillRestoringWords(stillOut.map(nameOf)) }); return; }
            setContacts(prev => prev.filter(c => !goingIds.includes(c.id)));
            const failed = [];
            const goneIds = [];   // gone already (§0.273): done, never in this press's Undo
            if (opts.admin && !kept.length && goingIds.length === contacts.length) {
                const r = await dbWrite('/.netlify/functions/contacts?clear=true', { method: 'DELETE' });
                if (!stillOrg(askedOrg)) return;
                if (!r.ok) failed.push(...going.map(c => ({ c, error: r.error, unknown: r.unknown })));
            } else {
                for (const c of going) {
                    if (!stillOrg(askedOrg)) return;   // the next DELETE would carry the new org's token
                    const r = await dbWrite(`/.netlify/functions/contacts?id=${encodeURIComponent(c.id)}`, { method: 'DELETE' });
                    // Gone already in this org (404 'gone' — another tab's or member's delete came first, state §0.273): done, nothing said,
                    // and not in this press's Undo — it wrote nothing, and a re-POST would bring back what someone else deleted.
                    if (!r.ok && r.landed) { goneIds.push(c.id); continue; }
                    if (!r.ok) failed.push({ c, error: r.error, unknown: r.unknown });
                }
                if (!stillOrg(askedOrg)) return;   // no Undo for the last org's rows on the new org's screen
            }
            let failNote = null;   // said on the Undo toast too (state §0.240): softDelete's toast replaced it at once
            if (failed.length) {
                // What the server refused is put back, and the first refusal is shown — the server's open-deal refusal
                // names the deal. One whose answer proves nothing may be gone (state §0.261, the unknown-save rule — Jeff's Q2: an answer that proves nothing keeps the change, said as maybe): kept off, said as maybe.
                const refused = failed.filter(f => !f.unknown), unsure = failed.filter(f => f.unknown);
                setContacts(prev => {
                    const have = new Set(prev.map(c => c.id));
                    return [...prev, ...refused.map(f => f.c).filter(c => !have.has(c.id))];
                });
                failNote = [
                    refused.length ? (going.length === 1 ? `Contact not deleted — ${refused[0].error}`
                        : `${refused.length} of ${going.length} contacts not deleted — ${refused[0].error}`) : '',
                    unsure.length ? (going.length === 1 ? maybeSaid('The contact', 'deleted', unsure[0].error)
                        : maybeSaid(`${unsure.length} of ${going.length} contacts`, 'deleted', unsure[0].error, true)) : '',
                ].filter(Boolean).join(' ');
                setUndoToast({ error: failNote });
                if (failed.length === going.length) return;   // nothing deleted, nothing to undo
            }
            const deleted = going.filter(c => !failed.some(f => f.c.id === c.id) && !goneIds.includes(c.id));
            if (!deleted.length) return;   // each one gone already (§0.273): nothing this press deleted, nothing to undo
            softDelete(
                deleted.length === 1 ? `Contact "${nameOf(deleted[0])}"` : `${deleted.length} contacts`,
                () => {},
                undoWhileOut('contact', deleted.map(c => c.id), async () => {   // its rows marked out until it ends (§0.273)
                    setUndoToast(null);
                    setContacts(prev => {
                        const have = new Set(prev.map(c => c.id));
                        return [...prev, ...deleted.filter(c => !have.has(c.id))];
                    });
                    // Undo re-POSTs each, marked a restore (state §0.236; Jeff's Q4): the server keeps the owner it
                    // was stored with, by id — never the member pressing Undo. A refused restore takes it off the
                    // screen again and says so.
                    const notRestored = [];
                    for (const c of deleted) {
                        if (!stillOrg(askedOrg)) return;   // the next POST would carry the new org's token
                        const rr = await dbWrite('/.netlify/functions/contacts', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ ...c, restore: true }),
                        });
                        // Already stored (a 409 'idInUse') is back (§0.261).
                        if (!rr.ok && !rr.landed) notRestored.push({ c, error: rr.error, unknown: rr.unknown });
                    }
                    if (!stillOrg(askedOrg)) return;
                    if (notRestored.length) {
                        // One whose answer proves nothing may be back (state §0.261, the unknown-save rule — Jeff's Q2: an answer that proves nothing keeps the change, said as maybe): kept, said as maybe.
                        const gone = notRestored.filter(n => !n.unknown).map(n => n.c.id);
                        setContacts(prev => prev.filter(c => !gone.includes(c.id)));   // undo did not take
                        const first = notRestored[0];
                        setUndoToast({ error: first.unknown
                            ? maybeSaid(notRestored.length === 1 ? nameOf(first.c) : `${notRestored.length} contacts`, 'restored', first.error, notRestored.length > 1)
                            : notRestored.length === 1
                                ? `Could not restore ${nameOf(first.c)} — ${first.error}`
                                : `${notRestored.length} contacts could not be restored — ${first.error}` });
                    }
                })
            );
            if (failNote) setUndoToast(t => (t ? { ...t, error: failNote } : t));
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
                const res = await dbFetch('/.netlify/functions/contacts', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sentBody(payload)) });   // the Company nobody touched left out (§0.198)
                // The ok check first, the house words (state §0.248, docs/design/refusal-sweep Part 10; Jeff's Q3).
                // Only a 4xx in the server's words wrote nothing; any other refused answer may have saved (state §0.261, the unknown-save rule — Jeff's Q2: an answer that proves nothing keeps the change, said as maybe).
                if (!res.ok) { const body = await res.json().catch(() => null); if (!stillOrg(askedOrg)) return; setContactModalError(writeRefusal(res, body, `"${fullName || 'The contact'}"`).words); setContactModalSaving(false); return; }
                const data = await res.json().catch(() => ({}));   // a landed answer that cannot be read: saved, the copy sent shown
                if (!stillOrg(askedOrg)) return;
                setContacts(prev => prev.map(c => c.id === editingContact.id ? (data.contact || shownRow(payload)) : c));
                addAudit('update', 'contact', editingContact.id, fullName || editingContact.id, contactData.company || '');
                setShowContactModal(false); setContactModalError(null);
            } catch (err) {
                if (!stillOrg(askedOrg)) return;
                console.error('Failed to update contact:', err);
                setContactModalError(maybeSaid(`"${fullName || 'The contact'}"`, 'saved', failureWords(err)));   // a throw proves nothing (state §0.261, the unknown-save rule — Jeff's Q2: an answer that proves nothing keeps the change, said as maybe)
            } finally { setContactModalSaving(false); }
        } else {
            // The rail's id, given when it opened (state §0.261, Part 6): a second press after an answer that proved nothing
            // is the same contact — answered already stored if the first landed.
            const newId = contactData.id || ('id_' + crypto.randomUUID());
            const newContact = { ...contactData, id: newId };
            try {
                const res = await dbFetch('/.netlify/functions/contacts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newContact) });
                // As the edit's (§0.248, §0.261); a second press answered already stored landed with the first: the list read again.
                let data = null;
                if (!res.ok) {
                    const body = await res.json().catch(() => null); if (!stillOrg(askedOrg)) return;
                    if (!landedBefore(res.status, body)) { setContactModalError(writeRefusal(res, body, `"${fullName || 'The contact'}"`).words); setContactModalSaving(false); return; }
                    loadContacts(() => {});
                } else data = await res.json().catch(() => ({}));
                if (!stillOrg(askedOrg)) return;
                if (data) setContacts(prev => [...prev, data.contact || newContact]);
                addAudit('create', 'contact', newId, fullName || newId, contactData.company || '');
                setShowContactModal(false); setContactModalError(null);
            } catch (err) {
                if (!stillOrg(askedOrg)) return;
                console.error('Failed to save contact:', err);
                setContactModalError(maybeSaid(`"${fullName || 'The contact'}"`, 'saved', failureWords(err)));   // a throw proves nothing (state §0.261, the unknown-save rule — Jeff's Q2: an answer that proves nothing keeps the change, said as maybe)
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
