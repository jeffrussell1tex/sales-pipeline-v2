// src/components/rails/AccountPicker.jsx
// Shared company/account picker used by ActivityRail and ContactRail. Search existing
// accounts and pick one, or create a new account inline when nothing matches — so a
// "company" is always a real, linkable account record rather than free text.
// The host resolves the selected name to an accountId on save (or uses onSelectAccount
// for the full record). Create failures are reported via onError so the host can notify.
import React, { useState, useMemo } from 'react';
import { dbFetch, requestOrg, stillOrg } from '../../utils/storage';
import { useApp } from '../../AppContext';
import { pickerRows, searchKey } from '../../utils/searchMatch.js';
import { T } from '../../tokens.js';


export default function AccountPicker({ value, onChange, onSelectAccount, onSelectSite, onError, placeholder, filterFn }) {
    // accounts + setAccounts come from context so this drops into any component under
    // AppProvider (rails AND prop-driven modals) with no prop-threading, and stays a
    // single source of truth — a newly created account appears everywhere at once.
    const { accounts, setAccounts } = useApp();
    const [open, setOpen] = useState(false);
    const [creating, setCreating] = useState(false);

    // The shared matcher (state §0.194): every word typed, punctuation ignored, best first,
    // the cut announced; a unit's and a site's row names its parent. In the deal window
    // (filterFn and onSelectSite) a site whose own name matches is listed after the
    // accounts (first when its whole name is typed) and picks its parent. A name any
    // account has, in any tier, offers no Create: its row is offered, or, when the list
    // cannot offer it (a site whose account is outside the list), a line says so. Only
    // punctuation typed offers nothing.
    const typedKey = searchKey(value);
    const byId = useMemo(() => new Map((accounts || []).map(a => [a.id, a])), [accounts]);
    const { shown, more, exact, unlisted } = open && typedKey
        ? pickerRows(accounts, value, { keep: filterFn, viaParents: !!onSelectSite, byId })
        : { shown: [], more: 0, exact: null, unlisted: null };

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
                placeholder={placeholder}
                style={{ width: '100%', padding: '8px 10px', border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 13, background: T.surface, color: T.ink, fontFamily: T.sans, boxSizing: 'border-box', outline: 'none' }}
            />
            {open && !!typedKey && (shown.length > 0 || !exact || !!unlisted) && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: `1px solid ${T.border}`, borderRadius: T.r, marginTop: 2, maxHeight: 200, overflowY: 'auto', zIndex: 300, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                    {shown.map(({ account: a, parent, via }) => (
                        <div key={a.id} onMouseDown={e => e.preventDefault()} onClick={() => pick(a, via)}
                            style={{ padding: '7px 10px', fontSize: 13, cursor: 'pointer', borderBottom: `1px solid ${T.border}`, color: T.ink }}
                            onMouseEnter={e => e.currentTarget.style.background = T.bg}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                            {a.name}
                            {parent && <span style={{ color: T.inkMuted }}>{` · ${a.accountTier === 'site' ? 'site of' : a.accountTier === 'business_unit' ? 'unit of' : 'in'} ${parent.name}`}</span>}
                        </div>
                    ))}
                    {/* The count, a name the list cannot offer (the deal window leaves out only sites), and
                        Create stay in view at the list's foot as it scrolls (state §0.194). */}
                    <div onMouseDown={e => e.preventDefault()} style={{ position: 'sticky', bottom: 0, background: 'inherit' }}>
                        {more > 0 && <div onMouseDown={e => e.preventDefault()} style={{ padding: '6px 10px', fontSize: 11, color: T.inkMuted, fontFamily: T.sans }}>{more} more — keep typing</div>}
                        {unlisted && <div style={{ padding: '6px 10px', fontSize: 12, color: T.inkMuted, fontFamily: T.sans }}>{`\u201c${unlisted.name}\u201d is a site \u2014 pick the account it belongs to`}</div>}
                        {!exact && (
                            <div onMouseDown={e => e.preventDefault()} onClick={createAccount}
                                style={{ padding: '8px 10px', fontSize: 13, cursor: creating ? 'default' : 'pointer', color: T.info, fontWeight: 600, background: T.surface2 }}
                                onMouseEnter={e => { if (!creating) e.currentTarget.style.background = T.bg; }}
                                onMouseLeave={e => e.currentTarget.style.background = T.surface2}>
                                {creating ? 'Creating\u2026' : `\u2795 ${shown.length ? 'None of these \u2014 create' : 'Create'} \u201c${(value || '').trim()}\u201d as a new account`}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
