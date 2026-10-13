// src/components/rails/AccountPicker.jsx
// The shared account picker: New Contact's and Log Activity's Company, the deal window's
// Account, New Task's Account and an account's Parent. Search the accounts and pick one,
// or, where the host allows it (allowCreate), create a new account inline when no account
// has the name typed — so a "company" is always a real, linkable account record.
// A pick hands the host the RECORD picked (onSelectAccount; in the deal window a site's
// row calls onSelectSite with the site and its account), and the host saves that record's
// id. A name typed and not picked is the Save's to decide, through resolveLink
// (src/utils/pickLink.js): one account of that name is it, two or more are refused, never
// the first of the name (state §0.198; Jeff, 11 Oct: "One match saves, two refuse").
// Create failures are reported via onError so the host can notify.
import React, { useState, useMemo } from 'react';
import { dbFetch, requestOrg, stillOrg } from '../../utils/storage';
import { useApp } from '../../AppContext';
import { pickerRows, searchKey } from '../../utils/searchMatch.js';
import { unarchived, parentLabel, siteLine, linkRefusal, resolveLink } from '../../utils/pickLink.js';
import { T } from '../../tokens.js';

// The host's say (state §0.198): allowCreate false where a name must be an account that
// exists (New Task's Account, D6: "No Create on tasks"; an account's Parent); leftOut, the
// host's sentence for a name its filterFn leaves out (Parent: itself, one under it, a
// site), else the deal window's (a site of an account the user can't open, D11, or of none
// a deal takes); dropUp, the list opens above the field (New Task's, at the rail's foot).
// The list shuts when the field loses the focus, as New Task's Account and the Parent field
// did; a press on a row, on Create or on the list's foot keeps the focus in the field, so a
// click still lands.
export default function AccountPicker({ value, onChange, onSelectAccount, onSelectSite, onError, placeholder, filterFn, allowCreate = true, leftOut = null, dropUp = false }) {
    // accounts + setAccounts come from context so this drops into any component under
    // AppProvider (rails AND prop-driven modals) with no prop-threading, and stays a
    // single source of truth — a newly created account appears everywhere at once.
    const { accounts, setAccounts } = useApp();
    const [open, setOpen] = useState(false);
    const [creating, setCreating] = useState(false);

    // The shared matcher (state §0.194): every word typed, punctuation ignored, best first,
    // the cut announced; a unit's and a site's row names its parent. An account merged into
    // another is not listed (D12, Jeff, 11 Oct: "Yes, hide them"); a record already linked
    // to one keeps its link, which its host's Save keeps. In the deal window (filterFn and
    // onSelectSite) a site whose own name matches is listed after the accounts (first when
    // its whole name is typed) and picks its parent. A name a listed account has, in any
    // tier, offers no Create: its row is offered, or, when the list cannot offer it, a line
    // says why — the host's leftOut, else a site of an account the user can't open, or of one
    // no deal takes (siteLine). A host with no Create says instead that no account has the
    // name. A name only an account merged into another has offers no Create either — it would
    // make the duplicate the merge removed — and the foot names the account it was merged
    // into (resolveLink's 'merged'). Only punctuation typed offers nothing. The rows, `exact`
    // and `unlisted` are worked out over the accounts listed, the ones resolveLink matches a
    // typed name against, so Create is offered exactly where a Save would find no account of
    // the name, merged away or not.
    const typedKey = searchKey(value);
    const listed = useMemo(() => unarchived(accounts), [accounts]);
    const byId = useMemo(() => new Map(listed.map(a => [a.id, a])), [listed]);
    const { shown, more, exact, unlisted } = open && typedKey
        ? pickerRows(listed, value, { keep: filterFn, viaParents: !!onSelectSite, byId })
        : { shown: [], more: 0, exact: null, unlisted: null };
    const lookup = open && typedKey && !exact ? resolveLink({ text: value, records: accounts }) : null;
    const merged = lookup && lookup.refusal === 'merged' ? lookup : null;

    const pick = (acc, via = null) => {
        onChange(via ? via.name : acc.name);
        if (via) onSelectSite(acc, via);
        else if (onSelectAccount) onSelectAccount(acc);
        setOpen(false);
    };

    const createAccount = async () => {
        const name = (value || '').trim();
        if (!name || creating) return;
        setCreating(true);
        onError && onError(null);
        const askedOrg = requestOrg();   // after an org switch its answer changes nothing (state §0.175)
        try {
            const newAccount = { id: 'id_' + crypto.randomUUID(), name, accountTier: 'account' };
            const res = await dbFetch('/.netlify/functions/accounts', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newAccount),
            });
            const data = await res.json().catch(() => ({}));
            if (!stillOrg(askedOrg)) return;
            if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
            const saved = data.account || newAccount;
            setAccounts && setAccounts(prev => [...prev, saved]);
            pick(saved);
        } catch (e) {
            if (!stillOrg(askedOrg)) return;
            onError && onError(`Couldn't create account "${name}". ${e.message || 'Please try again.'}`);
        } finally {
            setCreating(false);
        }
    };

    return (
        <div style={{ position: 'relative' }}>
            <input
                value={value || ''}
                onChange={e => { onChange(e.target.value); setOpen(true); }}
                onFocus={() => setOpen(true)}
                onBlur={() => setTimeout(() => setOpen(false), 200)}
                placeholder={placeholder}
                style={{ width: '100%', padding: '8px 10px', border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 13, background: T.surface, color: T.ink, fontFamily: T.sans, boxSizing: 'border-box', outline: 'none' }}
            />
            {open && !!typedKey && (shown.length > 0 || !exact || !!unlisted) && (
                <div style={{ position: 'absolute', [dropUp ? 'bottom' : 'top']: '100%', left: 0, right: 0, background: '#fff', border: `1px solid ${T.border}`, borderRadius: T.r, marginTop: dropUp ? 0 : 2, marginBottom: dropUp ? 2 : 0, maxHeight: 200, overflowY: 'auto', zIndex: 300, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                    {shown.map(({ account: a, parent, via }) => (
                        <div key={a.id} onMouseDown={e => e.preventDefault()} onClick={() => pick(a, via)}
                            style={{ padding: '7px 10px', fontSize: 13, cursor: 'pointer', borderBottom: `1px solid ${T.border}`, color: T.ink }}
                            onMouseEnter={e => e.currentTarget.style.background = T.bg}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                            {a.name}
                            {parent && <span style={{ color: T.inkMuted }}>{` · ${parentLabel(a, parent)}`}</span>}
                        </div>
                    ))}
                    {/* The count, a name the list cannot offer and why, and Create (or, where the host
                        offers none, that no account has the name) stay in view at the list's foot as
                        it scrolls (state §0.194). */}
                    <div onMouseDown={e => e.preventDefault()} style={{ position: 'sticky', bottom: 0, background: 'inherit' }}>
                        {more > 0 && <div onMouseDown={e => e.preventDefault()} style={{ padding: '6px 10px', fontSize: 11, color: T.inkMuted, fontFamily: T.sans }}>{more} more — keep typing</div>}
                        {unlisted && <div style={{ padding: '6px 10px', fontSize: 12, color: T.inkMuted, fontFamily: T.sans }}>{leftOut ? leftOut(unlisted) : siteLine(unlisted, accounts)}</div>}
                        {!exact && (
                            merged ? (
                                <div style={{ padding: '6px 10px', fontSize: 12, color: T.inkMuted, fontFamily: T.sans }}>{linkRefusal(merged)}</div>
                            ) : allowCreate ? (
                                <div onMouseDown={e => e.preventDefault()} onClick={createAccount}
                                    style={{ padding: '8px 10px', fontSize: 13, cursor: creating ? 'default' : 'pointer', color: T.info, fontWeight: 600, background: T.surface2 }}
                                    onMouseEnter={e => { if (!creating) e.currentTarget.style.background = T.bg; }}
                                    onMouseLeave={e => e.currentTarget.style.background = T.surface2}>
                                    {creating ? 'Creating\u2026' : `\u2795 ${shown.length ? 'None of these \u2014 create' : 'Create'} \u201c${(value || '').trim()}\u201d as a new account`}
                                </div>
                            ) : (
                                <div style={{ padding: '6px 10px', fontSize: 12, color: T.inkMuted, fontFamily: T.sans }}>{linkRefusal({ refusal: 'none', text: value || '' })}</div>
                            )
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
