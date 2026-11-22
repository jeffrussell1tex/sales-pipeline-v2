import { useState, useRef } from 'react';
import { dbStatusOf } from '../utils/fetchStatus';
import { dbFetch, dbWrite, requestOrg, stillOrg } from '../utils/storage';
import { isOpenDeal } from '../utils/contactDeals.js';
import { tierUnder, branchTiers, parentRefusal, withTiers, withRows, parentsFirst, undoOfDeletes } from '../utils/accountParent.js';
import { isMergeArchived } from '../utils/pickLink.js';
import { isRestoring, undoWhileOut, stillRestoringWords } from '../utils/restoring.js';
import { refusalWords, failureWords, heardRefusal, landedBefore, maybeSaid } from '../utils/refusalWords.js';

// The accounts by id, as the tier rule reads them.
const byIdOf = (list) => new Map((list || []).map(a => [a.id, a]));

export function useAccounts(deps) {
    const { addAudit, showConfirm, softDelete, setUndoToast, showBlockedDelete } = deps;

    const [accounts, setAccounts] = useState([]);
    const [accountModalError, setAccountModalError] = useState(null);
    const [accountModalSaving, setAccountModalSaving] = useState(false);

    // The latest load of the accounts: an answer a later load overtook is dropped (state §0.207) — a merge's
    // reload landing after its Undo's put the merge back on screen, and the next whole-row save sent it.
    const loadGen = useRef(0);
    const loadAccounts = (setDbOffline) => {
        const askedOrg = requestOrg();   // an answer for an org switched away from is dropped (state §0.173)
        const gen = ++loadGen.current;
        dbFetch('/.netlify/functions/accounts')
            .then(r => { if (!stillOrg(askedOrg)) return null; setDbOffline(dbStatusOf(r)); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
            .then(data => (gen === loadGen.current ? data : null))   // a later load overtook it
            .then(data => { if (data && stillOrg(askedOrg)) setAccounts(data.accounts || []); })
            .catch(err => console.error('Failed to load accounts:', err));
    };

    // An account's sub-accounts as the screens list them — the Accounts tab's badge and drawer, the account rail's
    // Sub-Accounts, App's rollup: one merged away is left out (state §0.206 — Jeff: "Hide them"). The record is
    // kept, in `accounts` too (its merge's Undo, the links that resolve through it).
    const getSubAccounts = (accountId) => (accounts || []).filter(a => (a.parentAccountId || a.parentId) === accountId && !isMergeArchived(a));

    // An account's tier fits its parent (state §0.198; D3, D21 "Keep what fits"): accountParent.js
    // tierUnder and branchTiers, below — the rule accounts.mjs applies again from the org's own
    // rows. The copy of it this hook held is gone.

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
        // The sub-accounts the server will promote that the screens list (state §0.210; Jeff, 18 Oct: "Count what you
        // see"): the confirm counts the live ones — the server also lifts one merged away, which no list shows. What
        // the Undo puts back is what the server answers (below), never these.
        const children = accounts.filter(a => goingIds.includes(parentOf(a)) && !goingIds.includes(a.id) && !isMergeArchived(a));
        const what = going.length === 1 ? `"${going[0].name}"` : `${going.length} accounts`;
        const subLine = children.length
            ? `\n\n${children.length} sub-account${children.length === 1 ? '' : 's'} will move to the top level.` : '';
        const keptLine = kept.length ? `\n\nKept — open deals: ${kept.map(k => k.a.name).join(', ')}.` : '';
        showConfirm(`Delete ${what}? You'll have a few seconds to undo.${subLine}${keptLine}`, async () => {
            opts.onConfirm?.();
            // One its own Undo is still re-POSTing is not deleted under it (state §0.273): its DELETE would find nothing, then
            // the Undo would land it again — live on the server, off this screen. Said, and nothing sent.
            const stillOut = going.filter(a => isRestoring('account', a.id));
            if (stillOut.length) { setUndoToast({ error: stillRestoringWords(stillOut.map(a => a.name)) }); return; }
            const askedOrg = requestOrg();   // cut by an org switch, it stops (state §0.175)
            setAccounts(prev => prev.filter(a => !goingIds.includes(a.id)));
            const failed = [];
            const send = (id) => dbWrite(`/.netlify/functions/accounts?id=${encodeURIComponent(id)}`, { method: 'DELETE' });   // the one sender (§0.274)
            let goneBefore = false;   // one gone already (§0.273): its delete lifted its sub-accounts — the list read again
            const lifted = [];   // what the server lifted, with the tiers it gave them (D18)
            const answers = [];  // what each delete answered: the row and its sub-accounts as stored
            for (const a of going) {
                if (!stillOrg(askedOrg)) return;   // the next DELETE would carry the new org's token
                const r = await send(a.id);
                // Gone already in this org (404 'gone' — another tab's or member's delete came first, state §0.273): done, nothing said,
                // and not in this press's Undo — it wrote nothing, and a re-POST would bring back what someone else deleted.
                if (!r.ok && r.landed) { goneBefore = true; continue; }
                // Merged away since this list was read (state §0.282, code 'merged'): refused, said — never put back as live.
                if (!r.ok) failed.push({ a, error: r.error, unknown: r.unknown, merged: r.code === 'merged' });
                else lifted.push(...(r.data?.retiered || []));
                if (r.ok) answers.push(r.data || {});
            }
            // One refused as merged into an account this same press deleted (the review): that merge can no longer be undone,
            // so the server deletes it as any account — sent again once, its answer taken as the others' (its loop checks
            // the org before each send).
            if (failed.some(f => f.merged) && answers.length) {
                for (const f of failed.filter(f => f.merged)) {
                    if (!stillOrg(askedOrg)) return;
                    const again = await send(f.a.id);
                    if (again.ok) { f.retried = true; lifted.push(...(again.data?.retiered || [])); answers.push(again.data || {}); }
                    else if (again.landed) { f.retried = true; goneBefore = true; }
                }
                failed.splice(0, failed.length, ...failed.filter(f => !f.retried));
            }
            if (!stillOrg(askedOrg)) return;   // no Undo for the last org's rows on the new org's screen
            if (goneBefore) loadAccounts(() => {});   // the sub-accounts another delete lifted, as the server has them (§0.273)
            // What the Undo re-sends is what the server answered, never this screen's copies (state
            // §0.198): each row deleted as stored, and each sub-account it promoted as stored
            // before — accountParent.js undoOfDeletes.
            const { deleted, promoted } = undoOfDeletes(answers);
            // The server promoted the deleted accounts' sub-accounts; the screen does the same.
            setAccounts(prev => prev.map(a => (promoted.some(c => c.id === a.id) ? { ...a, parentAccountId: null } : a)));
            // ...and gives them, and the accounts under them, the tiers the server wrote (D18).
            setAccounts(prev => withTiers(prev, lifted));
            let failNote = null;   // said on the Undo toast too (state §0.240): softDelete's toast replaced it at once
            if (failed.length) {
                // What the server refused is put back, and the first refusal is shown — the server's open-deal refusal
                // names the deal. One whose answer proves nothing may be gone (state §0.261, the unknown-save rule —
                // Jeff's Q2: kept as done, said): it stays off the list, said as maybe; a reload shows it if it stayed.
                const refused = failed.filter(f => !f.unknown), unsure = failed.filter(f => f.unknown);
                setAccounts(prev => {
                    const have = new Set(prev.map(a => a.id));
                    return [...prev, ...refused.filter(f => !f.merged).map(f => f.a).filter(a => !have.has(a.id))];
                });
                // One merged away since: the list read again — it leaves the list, and the account it lives on in shows as stored.
                if (failed.some(f => f.merged)) loadAccounts(() => {});
                // Said apart (the review): a merged refusal's row leaves the list, so its own words say why.
                const heard = refused.filter(f => !f.merged), merged = refused.filter(f => f.merged);
                failNote = [
                    heard.length ? (going.length === 1 ? `Account not deleted — ${heard[0].error}`
                        : `${heard.length} of ${going.length} accounts not deleted — ${heard[0].error}`) : '',
                    merged.length ? (going.length === 1 ? `Account not deleted — ${merged[0].error}`
                        : `${merged.length} of ${going.length} accounts not deleted — ${merged[0].error}`) : '',
                    unsure.length ? (going.length === 1 ? maybeSaid('The account', 'deleted', unsure[0].error)
                        : maybeSaid(`${unsure.length} of ${going.length} accounts`, 'deleted', unsure[0].error, true)) : '',
                ].filter(Boolean).join(' ');
                setUndoToast({ error: failNote });
                if (!deleted.length) return;   // nothing deleted, nothing to undo
            }
            if (!deleted.length) return;   // each one gone already (§0.273): nothing this press deleted, nothing to undo
            softDelete(
                deleted.length === 1 ? `Account "${deleted[0].name}"` : `${deleted.length} accounts`,
                () => {},
                undoWhileOut('account', deleted.map(a => a.id), async () => {   // its rows marked out until it ends (§0.273)
                    setUndoToast(null);
                    setAccounts(prev => {
                        const have = new Set(prev.map(a => a.id));
                        const back = prev.map(a => {
                            const c = promoted.find(p => p.id === a.id);
                            return c ? { ...a, parentAccountId: c.parentId, ...(c.tier ? { accountTier: c.tier } : {}) } : a;
                        });
                        return [...back, ...deleted.filter(a => !have.has(a.id))];
                    });
                    // Undo puts each account it deleted, and each sub-account it promoted, back
                    // EXACTLY as it was stored (D21: "Undo puts the stored tiers back") — the stored
                    // row the server answered re-POSTed, its owner with it, then the sub-accounts it
                    // promoted back under it with the tier each had there (the PUT merges over the
                    // stored row, §0.169) — every write marked a restore, which accounts.mjs writes
                    // as sent for an Admin, checking only the tier, that the parent is this org's
                    // live account and no site, that no loop forms, and that no account under it
                    // would not rank below it; a sub-account another session moved since the delete
                    // is refused, never moved back. It moves no deal. A refusal says so, naming the
                    // account refused, and the list is read again: the Undo may have taken in part.
                    // Each account posted back is shown as the server wrote it (an owner it dropped
                    // shows dropped). What the delete re-fitted further down, and each row's created
                    // date (the Undo's), are not put back (OPEN_ITEMS §4.2).
                    const notRestored = [];
                    const restored = [];   // the tiers the server gave back (D18, D21)
                    const answered = [];   // each account posted back, as the server wrote it
                    let reread = false;    // one stored already (state §0.261: a 409 'idInUse' — it is there): the list read again
                    // Parents first: an account deleted with its own sub-account is posted back
                    // before it, since accounts.mjs now checks that a parent exists (state §0.198).
                    for (const a of parentsFirst(deleted)) {
                        if (!stillOrg(askedOrg)) return;   // the next POST would carry the new org's token
                        const rr = await dbWrite('/.netlify/functions/accounts', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ ...a, restore: true }),
                        });
                        // A restore answered that the account is already stored (landed) is back — read again below. One
                        // whose answer proves nothing may be back (state §0.261): said as maybe, the list read again.
                        if (!rr.ok && rr.landed) reread = true;
                        else if (!rr.ok) { notRestored.push({ a, error: rr.error, unknown: rr.unknown }); continue; }
                        if (rr.data?.account) answered.push(rr.data.account);
                        for (const c of promoted.filter(p => p.parentId === a.id)) {
                            if (!stillOrg(askedOrg)) return;   // the next PUT would carry the new org's token
                            const rp = await dbWrite('/.netlify/functions/accounts', {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ id: c.id, parentAccountId: c.parentId, accountTier: c.tier, restore: true }),
                            });
                            if (!rp.ok) notRestored.push({ a: accounts.find(x => x.id === c.id) || { id: c.id, name: 'a sub-account' }, error: rp.error, unknown: rp.unknown });
                            else restored.push(...(rp.data?.account ? [rp.data.account] : []), ...(rp.data?.retiered || []));
                        }
                    }
                    if (!stillOrg(askedOrg)) return;
                    setAccounts(prev => withTiers(prev, restored));
                    setAccounts(prev => withRows(prev, answered));
                    if (notRestored.length) {
                        // Undo did not take, or took in part: say so, and show the list as the
                        // server has it rather than a guess at it. An answer that proves nothing is said as maybe (§0.261).
                        const first = notRestored[0];
                        setUndoToast({ error: first.unknown ? maybeSaid(first.a.name, 'restored', first.error) : `Could not restore ${first.a.name} — ${first.error}` });
                    }
                    // A press that found one gone read the list again (§0.273); that read can answer after this Undo put
                    // its rows back, and wipe them off — this read, later, overtakes it (loadGen).
                    // A press refused as merged away read it again too (§0.282, the review) — the same race.
                    if (notRestored.length || reread || goneBefore || failed.some(f => f.merged)) loadAccounts(() => {});
                })
            );
            if (failNote) setUndoToast(t => (t ? { ...t, error: failNote } : t));
        });
    };

    const handleSaveAccount = async (
        formData,
        { editingAccount, editingSubAccount, parentAccountForSub,
          setShowAccountModal,
          setOpportunities, setContacts }
    ) => {
        const askedOrg = requestOrg();   // after an org switch its answer changes nothing (state §0.175)
        setAccountModalError(null);
        setAccountModalSaving(true);
        try {
            let payload, method, auditAction, auditId, auditName, auditDetail;
            if (editingAccount) {
                payload = { ...formData, id: editingAccount.id };
                // Moved under another parent, or its parent cleared (state §0.198; D3, D21): it
                // keeps its tier where that still fits under the new parent, else takes the
                // lowest rank above it (cleared: an account), and every account under it keeps
                // what still fits — refused here, before anything is sent, when any would sit
                // below a site. accounts.mjs applies the rule again from the org's own rows and
                // answers with what it wrote.
                // A payload with no parent leaves it as stored — the rail sends none when its
                // Parent field was not touched (state §0.198): no move.
                if ('parentAccountId' in formData && (formData.parentAccountId || null) !== (editingAccount.parentAccountId || null)) {
                    const moved = branchTiers(accounts, editingAccount.id, formData.parentAccountId || null, formData.accountTier);
                    if (moved.problem) {
                        setAccountModalError(parentRefusal('below-site', null, formData.name || editingAccount.name));
                        return;
                    }
                    payload.accountTier = moved.tiers.get(editingAccount.id);
                }
                method = 'PUT'; auditAction = 'update'; auditId = editingAccount.id;
                auditName = formData.name || editingAccount.id; auditDetail = formData.industry || '';
            } else if (editingSubAccount) {
                payload = { ...formData, id: editingSubAccount.id, parentAccountId: editingSubAccount.parentAccountId || editingSubAccount.parentId };
                method = 'PUT'; auditAction = 'update'; auditId = editingSubAccount.id;
                auditName = formData.name || editingSubAccount.id; auditDetail = '';
            } else if (parentAccountForSub) {
                // The rail's id, given when it opened (state §0.261, Part 6): a second press after an answer that proved
                // nothing is the same account — the server answers 'idInUse' if the first landed.
                const newId = formData.id || ('id_' + crypto.randomUUID());
                // Its tier is the lowest above its parent's (D3, D21): a business unit under an
                // account, a site under a business unit — the rule accounts.mjs applies too.
                const tier = tierUnder(parentAccountForSub.id, byIdOf(accounts));
                payload = { ...formData, id: newId, parentAccountId: parentAccountForSub.id, accountTier: tier };
                method = 'POST'; auditAction = 'create'; auditId = newId;
                auditName = formData.name || newId; auditDetail = 'Sub-account of ' + parentAccountForSub.name;
            } else {
                const newId = formData.id || ('id_' + crypto.randomUUID());   // as a sub-account's (§0.261)
                payload = { ...formData, id: newId };
                method = 'POST'; auditAction = 'create'; auditId = newId;
                auditName = formData.name || newId; auditDetail = formData.industry || '';
            }
            const res = await dbFetch('/.netlify/functions/accounts', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            // The ok check first, the house words (state §0.248, docs/design/refusal-sweep Part 10; Jeff's Q3): the server's
            // words with their ref, else "The server returned N." — a 502's page was said as a lost connection.
            // The unknown-save rule (state §0.261; Jeff's Q1, Q2): only a 4xx in the server's words wrote nothing — any other
            // refused answer may have saved, said so with the rail kept open; a create's second press answered that its id
            // is already stored here (landedBefore) landed with the first: the list read again, the rail closed as saved.
            let data;
            if (!res.ok) {
                const body = await res.json().catch(() => null);
                if (!stillOrg(askedOrg)) return;
                if (method === 'POST' && landedBefore(res.status, body)) {
                    loadAccounts(() => {});
                    addAudit(auditAction, 'account', auditId, auditName, auditDetail);
                    setShowAccountModal(false); setAccountModalError(null);
                    return;
                }
                const why = refusalWords(res, body);
                setAccountModalError(heardRefusal(res.status, body) ? why : maybeSaid(`"${auditName}"`, 'saved', why)); setAccountModalSaving(false); return;
            }
            data = await res.json().catch(() => ({}));   // a landed answer that cannot be read: saved, the copy sent shown
            if (!stillOrg(askedOrg)) return;
            const saved = data.account || payload;
            if (method === 'PUT') {
                setAccounts(prev => prev.map(acc => acc.id === saved.id ? saved : acc));
                // The accounts under a moved one, with the tiers the server gave them (D17).
                setAccounts(prev => withTiers(prev, data.retiered));
                // The deals of an account the move made a site, moved up to the account it stands
                // under, Site Name the site (D22): as the server wrote them.
                const liftedDeals = new Map((Array.isArray(data.liftedDeals) ? data.liftedDeals : []).map(d => [d.id, d]));
                if (liftedDeals.size) setOpportunities && setOpportunities(prev => prev.map(o => (liftedDeals.has(o.id) ? { ...o, ...liftedDeals.get(o.id) } : o)));
                // Backend cascades a rename into opportunities.account / contacts.company;
                // mirror it in local state so the UI updates without a reload.
                if (data.renamed) {
                    setOpportunities && setOpportunities(prev => prev.map(o => o.accountId === saved.id ? { ...o, account: saved.name } : o));
                    setContacts && setContacts(prev => prev.map(c => c.accountId === saved.id ? { ...c, company: saved.name } : c));
                }
            } else {
                setAccounts(prev => [...prev, saved]);
            }
            addAudit(auditAction, 'account', auditId, auditName, auditDetail);
            setShowAccountModal(false); setAccountModalError(null);
        } catch (err) {
            if (!stillOrg(askedOrg)) return;
            console.error('Failed to save account:', err);
            // A throw proves nothing (state §0.261): the save may have landed — the rail kept, its id kept for a second press.
            setAccountModalError(maybeSaid(`"${formData.name || 'The account'}"`, 'saved', failureWords(err)));
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
