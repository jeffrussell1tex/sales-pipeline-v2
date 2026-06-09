// src/components/rails/AccountPicker.jsx
// Shared company/account picker used by ActivityRail and ContactRail. Search existing
// accounts and pick one, or create a new account inline when nothing matches — so a
// "company" is always a real, linkable account record rather than free text.
// The host resolves the selected name to an accountId on save (or uses onSelectAccount
// for the full record). Create failures are reported via onError so the host can notify.
import React, { useState } from 'react';
import { dbFetch } from '../../utils/storage';

const T = {
    surface: '#fbf8f3', surface2: '#f5efe3', surface3: '#f0ece4',
    border: '#e6ddd0', ink: '#2a2622', ink3: '#8a8378', info: '#3a5a7a',
    r: 3, sans: "'Plus Jakarta Sans', system-ui, sans-serif",
};

export default function AccountPicker({ accounts, setAccounts, value, onChange, onSelectAccount, onError, placeholder }) {
    const [open, setOpen] = useState(false);
    const [creating, setCreating] = useState(false);

    const q = (value || '').trim().toLowerCase();
    const list = accounts || [];
    const filtered = q ? list.filter(a => (a.name || '').toLowerCase().includes(q)) : list;
    const exact = q ? list.find(a => (a.name || '').toLowerCase() === q) : null;

    const pick = (acc) => {
        onChange(acc.name);
        onSelectAccount && onSelectAccount(acc);
        setOpen(false);
    };

    const createAccount = async () => {
        const name = (value || '').trim();
        if (!name || creating) return;
        setCreating(true);
        onError && onError(null);
        try {
            const newAccount = { id: 'id_' + crypto.randomUUID(), name, accountTier: 'account' };
            const res = await dbFetch('/.netlify/functions/accounts', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newAccount),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
            const saved = data.account || newAccount;
            setAccounts && setAccounts(prev => [...prev, saved]);
            pick(saved);
        } catch (e) {
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
            {open && q.length > 0 && (filtered.length > 0 || !exact) && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: `1px solid ${T.border}`, borderRadius: T.r, marginTop: 2, maxHeight: 200, overflowY: 'auto', zIndex: 300, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                    {filtered.slice(0, 8).map((a) => (
                        <div key={a.id} onMouseDown={e => e.preventDefault()} onClick={() => pick(a)}
                            style={{ padding: '7px 10px', fontSize: 13, cursor: 'pointer', borderBottom: `1px solid ${T.border}`, color: T.ink }}
                            onMouseEnter={e => e.currentTarget.style.background = T.surface3}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                            {a.name}
                        </div>
                    ))}
                    {!exact && (
                        <div onMouseDown={e => e.preventDefault()} onClick={createAccount}
                            style={{ padding: '8px 10px', fontSize: 13, cursor: creating ? 'default' : 'pointer', color: T.info, fontWeight: 600, background: T.surface2 }}
                            onMouseEnter={e => { if (!creating) e.currentTarget.style.background = T.surface3; }}
                            onMouseLeave={e => e.currentTarget.style.background = T.surface2}>
                            {creating ? 'Creating\u2026' : `\u2795 Create \u201c${(value || '').trim()}\u201d as a new account`}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
