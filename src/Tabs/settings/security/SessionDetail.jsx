// settings/security/SessionDetail.jsx
import React, { useState, useEffect, useRef } from 'react';
import { dbFetch } from '../../../utils/storage';
import { T } from '../shared/tokens.js';
import { SecCrumb, SecTitle, SecBtn, SecCard, DropdownPanel, DropdownOption, PolicySelect } from './shared.jsx';

const SEC_SESSION = {
    idleTimeout: '480 minutes',
    sessionLifetime: '12 hours',
    concurrentSessions: '3 max',
    reauth: 'Required (last 5 minutes)',
    minLength: '12 characters',
    rotation: 'Every 90 days',
    history: 'Last 5 prevented',
    lockout: '5 failures',
    passwordComplexity: { mixedCase:true, number:true, symbol:true, blockCommon:true },
    ipAllowlist: [
        { cidr:'10.0.0.0/8',     label:'HQ VPN',         status:'Enforced' },
        { cidr:'52.84.124.0/22', label:'AWS prod NAT',    status:'Enforced' },
        { cidr:'203.0.113.42/32',label:'Vendor IP — Acme',status:'Logged'  },
    ],
};

const FL = ({ label: lbl, hint, children }) => (
    <div style={{ marginBottom:14 }}>
    <label style={{ display:'block', fontSize:11.5, fontWeight:600, color:T.inkMid, marginBottom:5, fontFamily:T.sans }}>{lbl}</label>
    {children}
    {hint && <div style={{ fontSize:11, color:T.inkMuted, marginTop:4, fontFamily:T.sans }}>{hint}</div>}
    </div>
    );

const MenuRow = ({ icon, label, sub, kbd, danger:isDanger, onClick, action }) => (
    <div onClick={() => action(onClick || (() => {}))}
    style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 10px', borderRadius:3, cursor:'pointer',
    color: isDanger ? T.danger : T.ink }}
    onMouseEnter={e => e.currentTarget.style.background = 'rgba(200,185,154,0.10)'}
    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
    <span style={{ width:16, textAlign:'center', fontSize:13, flexShrink:0 }}>{icon}</span>
    <div style={{ flex:1 }}>
    <div style={{ fontSize:12.5, fontWeight:500 }}>{label}</div>
    {sub && <div style={{ fontSize:10.5, color:T.inkMuted, marginTop:1 }}>{sub}</div>}
    </div>
    {kbd && <span style={{ fontSize:10.5, color:T.inkMuted, fontFamily:'ui-monospace,Menlo,monospace', flexShrink:0 }}>{kbd}</span>}
    </div>
    );

const GL = ({ children }) => (
    <div style={{ padding:'6px 10px 2px', fontSize:10, fontWeight:700, color:T.inkMuted, letterSpacing:0.7, textTransform:'uppercase', fontFamily:T.sans }}>{children}</div>
    );

const IpRangeModal = ({ existing, onClose, onSave }) => {
    const [cidr,    setCidr]    = React.useState(existing?.cidr    || '');
    const [label,   setLabel]   = React.useState(existing?.label   || '');
    const [status,  setStatus]  = React.useState(existing?.status  || 'Enforced');
    const [cidrErr, setCidrErr] = React.useState('');

    const inpSt = { width:'100%', padding:'8px 10px', border:`1px solid ${T.border}`, borderRadius:T.r,
        fontSize:13, color:T.ink, fontFamily:'ui-monospace,Menlo,monospace', outline:'none',
        background:T.surface, boxSizing:'border-box' };

    // Basic CIDR validation
    const validateCidr = (v) => {
        const cidrRe = /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$|^([0-9a-fA-F:]+)\/\d{1,3}$/;
        if (!v.trim()) return 'CIDR is required';
        if (!cidrRe.test(v.trim())) return 'Enter a valid CIDR range e.g. 10.0.0.0/8';
        return '';
    };

    const handleSave = () => {
        const err = validateCidr(cidr);
        if (err) { setCidrErr(err); return; }
        onSave({ cidr: cidr.trim(), label: label.trim() || cidr.trim(), status, hits: existing?.hits || '0' });
    };

    return (
        <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(42,38,34,0.40)', zIndex:800,
            display:'flex', alignItems:'center', justifyContent:'center', fontFamily:T.sans }}>
            <div onClick={e => e.stopPropagation()}
                style={{ background:T.surface, borderRadius:8, width:480, display:'flex', flexDirection:'column',
                    overflow:'hidden', boxShadow:'0 20px 56px rgba(20,16,12,0.28)' }}>
                {/* Header */}
                <div style={{ padding:'16px 20px', borderBottom:`1px solid ${T.border}`, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <div>
                        <div style={{ fontSize:16, fontWeight:700, color:T.ink }}>{existing ? 'Edit IP range' : 'Add IP range'}</div>
                        <div style={{ fontSize:12, color:T.inkMuted, marginTop:2 }}>CIDR notation — e.g. 10.0.0.0/8 or 203.0.113.42/32</div>
                    </div>
                    <button onClick={onClose} style={{ background:'none', border:'none', color:T.inkMuted, fontSize:20, cursor:'pointer', lineHeight:1 }}>×</button>
                </div>
                {/* Body */}
                <div style={{ padding:'18px 20px' }}>
                    <FL label="CIDR range" hint="IPv4 or IPv6 in CIDR notation">
                        <input value={cidr} onChange={e => { setCidr(e.target.value); setCidrErr(''); }}
                            placeholder="e.g. 10.0.0.0/8"
                            style={{ ...inpSt, borderColor: cidrErr ? T.danger : T.border }}/>
                        {cidrErr && <div style={{ fontSize:11.5, color:T.danger, marginTop:4, fontFamily:T.sans }}>{cidrErr}</div>}
                    </FL>
                    <FL label="Label" hint="Friendly name shown in the table">
                        <input value={label} onChange={e => setLabel(e.target.value)}
                            placeholder="e.g. HQ VPN, AWS prod NAT"
                            style={{ ...inpSt, fontFamily:T.sans }}/>
                    </FL>
                    <FL label="Status">
                        <div style={{ display:'flex', gap:10 }}>
                            {['Enforced','Logged'].map(s => (
                                <div key={s} onClick={() => setStatus(s)}
                                    style={{ flex:1, padding:'10px 14px', border:`1.5px solid ${status===s ? T.goldInk : T.border}`,
                                        borderRadius:6, background:status===s?'rgba(200,185,154,0.12)':T.surface, cursor:'pointer' }}>
                                    <div style={{ fontSize:13, fontWeight:600, color:T.ink }}>{s}</div>
                                    <div style={{ fontSize:11, color:T.inkMuted, marginTop:2 }}>
                                        {s === 'Enforced' ? 'Block sign-ins from outside this range' : 'Record attempts but allow sign-in'}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </FL>
                </div>
                {/* Footer */}
                <div style={{ padding:'12px 20px', borderTop:`1px solid ${T.border}`, background:T.surface2,
                    display:'flex', gap:8, justifyContent:'flex-end' }}>
                    <SecBtn label="Cancel" onClick={onClose}/>
                    <SecBtn label={existing ? 'Save changes' : 'Add range'} primary onClick={handleSave}/>
                </div>
            </div>
        </div>
    );
};

const IpRowMenu = ({ row, onEdit, onRemove, onToggleEnforced }) => {
    const [open, setOpen] = React.useState(false);
    const ref    = React.useRef(null);
    const btnRef = React.useRef(null);
    const [pos,  setPos]  = React.useState({ top:0, right:0 });

    React.useEffect(() => {
        if (!open) return;
        const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target) && btnRef.current && !btnRef.current.contains(e.target)) setOpen(false); };
        const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('mousedown', onDoc);
        document.addEventListener('keydown', onKey);
        return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
    }, [open]);

    const openMenu = () => {
        if (btnRef.current) {
            const r = btnRef.current.getBoundingClientRect();
            setPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
        }
        setOpen(o => !o);
    };

    const action = (fn) => { fn(); setOpen(false); };

    return (
        <div style={{ position:'relative' }}>
            <button ref={btnRef} onClick={openMenu}
                style={{ display:'inline-flex', alignItems:'center', justifyContent:'center',
                    width:22, height:22, borderRadius:3, fontSize:16, fontWeight:700,
                    cursor:'pointer', border:'none', lineHeight:1,
                    color: open ? T.goldInk : T.inkMuted,
                    background: open ? 'rgba(200,185,154,0.30)' : 'transparent' }}>
                ⋯
            </button>
            {open && (
                <div ref={ref} style={{ position:'fixed', top:pos.top, right:pos.right, zIndex:9999,
                    width:196, background:T.surface, border:`1px solid ${T.borderStrong}`, borderRadius:4,
                    boxShadow:'0 8px 24px rgba(42,38,34,0.12), 0 2px 4px rgba(42,38,34,0.06)', padding:4, fontFamily:T.sans }}>
                    {/* Pointer */}
                    <div style={{ position:'absolute', top:-6, right:10, width:12, height:12,
                        background:T.surface, border:`1px solid ${T.borderStrong}`,
                        borderRight:'none', borderBottom:'none', transform:'rotate(45deg)' }}/>
                    <MenuRow icon="✎" label="Edit range" kbd="↵" onClick={() => onEdit && onEdit(row)} action={action}/>
                    <MenuRow icon="⊕" label="Duplicate" kbd="⌘D" onClick={() => {}} action={action}/>
                    <MenuRow icon="◑"
                        label={row.status === 'Enforced' ? 'Switch to logged-only' : 'Enforce'}
                        sub={row.status === 'Enforced' ? 'Record attempts only' : 'Block sign-ins outside'}
                        onClick={() => onToggleEnforced && onToggleEnforced(row)} action={action}/>
                    <MenuRow icon="⌕" label={`View ${row.hits || '0'} sign-ins`}  onClick={() => {}} action={action}/>
                    <div style={{ height:1, background:T.border, margin:'2px 6px' }}/>
                    <MenuRow icon="🗑" label="Remove" danger onClick={() => onRemove && onRemove(row)} action={action}/>
                </div>
            )}
        </div>
    );
};

export const SessionDetail = ({ onBack }) => {
    const { passwordComplexity } = SEC_SESSION;

    // ── Local policy state — loaded from settings, saved on "Save policy" ──
    const [policy, setPolicy] = React.useState({
        idleTimeout:        SEC_SESSION.idleTimeout,
        sessionLifetime:    SEC_SESSION.sessionLifetime,
        concurrentSessions: SEC_SESSION.concurrentSessions,
        reauth:             SEC_SESSION.reauth,
        minLength:          SEC_SESSION.minLength,
        rotation:           SEC_SESSION.rotation,
        history:            SEC_SESSION.history,
        lockout:            SEC_SESSION.lockout,
        passwordComplexity: SEC_SESSION.passwordComplexity,
        ipAllowlist:        SEC_SESSION.ipAllowlist || [],
    });
    const [dirty,      setDirty]      = React.useState(false);
    const [saving,     setSaving]     = React.useState(false);
    const [loading,    setLoading]    = React.useState(true);
    const [toast,      setToast]      = React.useState(null);
    const [showAddIp,  setShowAddIp]  = React.useState(false);
    const [editingIp,  setEditingIp]  = React.useState(null); // null = add, row = edit

    const showToast = (msg, err) => { setToast({ msg, err }); setTimeout(() => setToast(null), 3000); };

    // Load real policy from settings on mount
    React.useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                const res  = await dbFetch('/.netlify/functions/settings');
                const data = await res.json();
                if (cancelled) return;
                if (res.ok && data.settings?.sessionPolicy) {
                    setPolicy(p => ({ ...p, ...data.settings.sessionPolicy }));
                }
            } catch (e) { /* use defaults */ } finally {
                if (!cancelled) setLoading(false);
            }
        };
        load();
        return () => { cancelled = true; };
    }, []);

    const set = (key, val) => { setPolicy(p => ({ ...p, [key]: val })); setDirty(true); };

    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await dbFetch('/.netlify/functions/settings', {
                method: 'PUT',
                body: JSON.stringify({ sessionPolicy: policy }),
            });
            if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
            setDirty(false);
            showToast('Policy saved.');
        } catch (e) {
            showToast(e.message, true);
        } finally { setSaving(false); }
    };

    const handleRevert = async () => {
        setLoading(true);
        try {
            const res  = await dbFetch('/.netlify/functions/settings');
            const data = await res.json();
            if (res.ok && data.settings?.sessionPolicy) setPolicy(p => ({ ...p, ...data.settings.sessionPolicy }));
        } catch(e) {} finally { setDirty(false); setLoading(false); }
    };

    const handleToggleEnforced = (row) => {
        const next = policy.ipAllowlist.map(r => r.cidr === row.cidr
            ? { ...r, status: r.status === 'Enforced' ? 'Logged' : 'Enforced' }
            : r
        );
        set('ipAllowlist', next);
    };

    const handleRemoveIp = (row) => {
        set('ipAllowlist', policy.ipAllowlist.filter(r => r.cidr !== row.cidr));
    };

    // GroupLabel shorthand
    const handleSaveIp = (row) => {
        if (editingIp) {
            // Edit existing
            set('ipAllowlist', policy.ipAllowlist.map(r => r.cidr === editingIp.cidr ? row : r));
        } else {
            // Add new — check for duplicate CIDR
            if (policy.ipAllowlist.find(r => r.cidr === row.cidr)) {
                showToast('That CIDR already exists in the allowlist.', true);
                return;
            }
            set('ipAllowlist', [...policy.ipAllowlist, row]);
        }
        setShowAddIp(false);
        setEditingIp(null);
    };

    return (
        <div style={{ fontFamily:T.sans }}>
            {/* Add / Edit IP range modal */}
            {showAddIp && (
                <IpRangeModal
                    existing={editingIp}
                    onClose={() => { setShowAddIp(false); setEditingIp(null); }}
                    onSave={handleSaveIp}
                />
            )}
            {/* Toast */}
            {toast && (
                <div style={{ position:'fixed', bottom:24, right:24, zIndex:9999, padding:'10px 18px',
                    background: toast.err ? T.danger : T.ok, color:'#fbf8f3', borderRadius:6,
                    fontSize:13, fontWeight:600, boxShadow:'0 4px 16px rgba(0,0,0,0.2)', fontFamily:T.sans }}>
                    {toast.msg}
                </div>
            )}

            <SecCrumb page="Session & password" onBack={onBack}/>
            <SecTitle
                title="Session & password policy"
                sub="Idle timeout, password rules, IP allowlist"
                badge={loading ? 'Loading…' : `${dirty ? 'Unsaved changes · ' : ''}Strong policy · 8h idle · 90-day rotation`}
                updatedAt="Changes saved to your workspace settings"
                dirty={dirty}
                actions={[
                    <SecBtn key="rev" label="Revert" onClick={handleRevert} disabled={!dirty || saving}/>,
                    <SecBtn key="sav" label={saving ? 'Saving…' : 'Save policy'} primary onClick={handleSave} disabled={!dirty || saving}/>,
                ]}/>

            {/* ── Session ── */}
            <SecCard title="Session">
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:4 }}>

                    <PolicySelect label="Idle timeout" value={policy.idleTimeout} width={300}>
                        <GL>Idle timeout</GL>
                        <DropdownOption label="15 minutes"  sub="Strict — high-security workspaces" onClick={() => set('idleTimeout','15 minutes')} selected={policy.idleTimeout==='15 minutes'}/>
                        <DropdownOption label="30 minutes"  sub="SOC 2 baseline" onClick={() => set('idleTimeout','30 minutes')} selected={policy.idleTimeout==='30 minutes'}/>
                        <DropdownOption label="60 minutes"  onClick={() => set('idleTimeout','60 minutes')} selected={policy.idleTimeout==='60 minutes'}/>
                        <DropdownOption label="2 hours"     onClick={() => set('idleTimeout','2 hours')} selected={policy.idleTimeout==='2 hours'}/>
                        <DropdownOption label="4 hours"     recommended onClick={() => set('idleTimeout','4 hours')} selected={policy.idleTimeout==='4 hours'}/>
                        <DropdownOption label="8 hours (480 minutes)" sub="Current — full workday" onClick={() => set('idleTimeout','480 minutes')} selected={policy.idleTimeout==='480 minutes'}/>
                        <DropdownOption label="Never" danger blocked sub="Not allowed — workspace requires idle timeout"/>
                        <div style={{ height:1, background:T.border, margin:'2px 6px' }}/>
                        <div style={{ padding:'6px 10px 10px', display:'flex', alignItems:'center', gap:8 }}>
                            <span style={{ fontSize:11, color:T.inkMid, flexShrink:0 }}>Custom</span>
                            <input type="number" placeholder="e.g. 90" min={1}
                                style={{ flex:1, padding:'6px 8px', border:`1px solid ${T.border}`, borderRadius:4, fontSize:12, color:T.inkMuted, fontFamily:'ui-monospace,Menlo,monospace', outline:'none', background:T.surface }}
                                onBlur={e => { if(e.target.value) set('idleTimeout', e.target.value + ' minutes'); }}/>
                            <span style={{ fontSize:11, color:T.inkMid, flexShrink:0 }}>min</span>
                        </div>
                    </PolicySelect>

                    <PolicySelect label="Absolute session lifetime" value={policy.sessionLifetime} width={300}>
                        <GL>Absolute session lifetime</GL>
                        <DropdownOption label="4 hours"  sub="Re-auth twice per shift" onClick={() => set('sessionLifetime','4 hours')} selected={policy.sessionLifetime==='4 hours'}/>
                        <DropdownOption label="8 hours"  sub="Re-auth at start of next day" onClick={() => set('sessionLifetime','8 hours')} selected={policy.sessionLifetime==='8 hours'}/>
                        <DropdownOption label="12 hours" sub="Current" onClick={() => set('sessionLifetime','12 hours')} selected={policy.sessionLifetime==='12 hours'}/>
                        <DropdownOption label="24 hours" recommended onClick={() => set('sessionLifetime','24 hours')} selected={policy.sessionLifetime==='24 hours'}/>
                        <DropdownOption label="3 days"   onClick={() => set('sessionLifetime','3 days')} selected={policy.sessionLifetime==='3 days'}/>
                        <DropdownOption label="7 days"   sub="Maximum allowed by workspace policy" onClick={() => set('sessionLifetime','7 days')} selected={policy.sessionLifetime==='7 days'}/>
                        <DropdownOption label="30 days"  danger blocked sub="Blocked — exceeds workspace cap of 7 days"/>
                    </PolicySelect>

                    <PolicySelect label="Concurrent sessions per user" value={policy.concurrentSessions} width={260}>
                        <GL>Concurrent sessions per user</GL>
                        <DropdownOption label="1 only"     sub="New sign-in revokes the old one" onClick={() => set('concurrentSessions','1 only')} selected={policy.concurrentSessions==='1 only'}/>
                        <DropdownOption label="2 max"      onClick={() => set('concurrentSessions','2 max')} selected={policy.concurrentSessions==='2 max'}/>
                        <DropdownOption label="3 max"      sub="Current" onClick={() => set('concurrentSessions','3 max')} selected={policy.concurrentSessions==='3 max'}/>
                        <DropdownOption label="5 max"      onClick={() => set('concurrentSessions','5 max')} selected={policy.concurrentSessions==='5 max'}/>
                        <DropdownOption label="10 max"     onClick={() => set('concurrentSessions','10 max')} selected={policy.concurrentSessions==='10 max'}/>
                        <DropdownOption label="Unlimited"  sub="Not recommended for shared accounts" onClick={() => set('concurrentSessions','Unlimited')} selected={policy.concurrentSessions==='Unlimited'}/>
                    </PolicySelect>

                    <PolicySelect label="Re-auth for sensitive actions" value={policy.reauth} width={320}>
                        <GL>Re-auth for sensitive actions</GL>
                        <DropdownOption label="Always"                      sub="Every privileged click" onClick={() => set('reauth','Always')} selected={policy.reauth==='Always'}/>
                        <DropdownOption label="Required (last 1 minute)"    onClick={() => set('reauth','Required (last 1 minute)')} selected={policy.reauth==='Required (last 1 minute)'}/>
                        <DropdownOption label="Required (last 5 minutes)"   sub="Current — SOC 2 default" onClick={() => set('reauth','Required (last 5 minutes)')} selected={policy.reauth==='Required (last 5 minutes)'}/>
                        <DropdownOption label="Required (last 15 minutes)"  recommended onClick={() => set('reauth','Required (last 15 minutes)')} selected={policy.reauth==='Required (last 15 minutes)'}/>
                        <DropdownOption label="Required (last 1 hour)"      onClick={() => set('reauth','Required (last 1 hour)')} selected={policy.reauth==='Required (last 1 hour)'}/>
                        <DropdownOption label="Never" danger sub="Disables step-up auth on quote send, role edit" onClick={() => set('reauth','Never')} selected={policy.reauth==='Never'}/>
                        <div style={{ height:1, background:T.border, margin:'2px 6px' }}/>
                        <GL>What counts as sensitive</GL>
                        <div style={{ padding:'4px 10px 10px', fontSize:11, color:T.inkMid, lineHeight:1.5 }}>
                            Quote send · Role edit · API key create · MFA disable · Mass export · IP allowlist edit · Audit rule change
                        </div>
                    </PolicySelect>
                </div>
            </SecCard>

            {/* ── Password ── */}
            <SecCard title="Password">
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>

                    <PolicySelect label="Minimum length" value={policy.minLength} width={260}>
                        <GL>Minimum length</GL>
                        <DropdownOption label="8 characters"  sub="Below NIST recommendation" onClick={() => set('minLength','8 characters')} selected={policy.minLength==='8 characters'}/>
                        <DropdownOption label="10 characters" onClick={() => set('minLength','10 characters')} selected={policy.minLength==='10 characters'}/>
                        <DropdownOption label="12 characters" sub="Current — NIST 800-63B" onClick={() => set('minLength','12 characters')} selected={policy.minLength==='12 characters'}/>
                        <DropdownOption label="14 characters" recommended onClick={() => set('minLength','14 characters')} selected={policy.minLength==='14 characters'}/>
                        <DropdownOption label="16 characters" onClick={() => set('minLength','16 characters')} selected={policy.minLength==='16 characters'}/>
                        <DropdownOption label="20 characters" sub="Strong; consider passphrase guidance" onClick={() => set('minLength','20 characters')} selected={policy.minLength==='20 characters'}/>
                    </PolicySelect>

                    <PolicySelect label="Rotation" value={policy.rotation} width={300}>
                        <GL>Password rotation</GL>
                        <DropdownOption label="Never"          recommended sub="NIST: rotate only on suspicion of compromise" onClick={() => set('rotation','Never')} selected={policy.rotation==='Never'}/>
                        <DropdownOption label="Every 180 days" onClick={() => set('rotation','Every 180 days')} selected={policy.rotation==='Every 180 days'}/>
                        <DropdownOption label="Every 120 days" onClick={() => set('rotation','Every 120 days')} selected={policy.rotation==='Every 120 days'}/>
                        <DropdownOption label="Every 90 days"  sub="Current — required by SOC 2 type II" onClick={() => set('rotation','Every 90 days')} selected={policy.rotation==='Every 90 days'}/>
                        <DropdownOption label="Every 60 days"  onClick={() => set('rotation','Every 60 days')} selected={policy.rotation==='Every 60 days'}/>
                        <DropdownOption label="Every 30 days"  sub="Aggressive — leads to weaker passwords" onClick={() => set('rotation','Every 30 days')} selected={policy.rotation==='Every 30 days'}/>
                    </PolicySelect>

                    <PolicySelect label="History (reuse prevention)" value={policy.history} width={260}>
                        <GL>Reuse prevention</GL>
                        <DropdownOption label="None"              sub="Any prior password OK" onClick={() => set('history','None')} selected={policy.history==='None'}/>
                        <DropdownOption label="Last 3 prevented"  onClick={() => set('history','Last 3 prevented')} selected={policy.history==='Last 3 prevented'}/>
                        <DropdownOption label="Last 5 prevented"  sub="Current" onClick={() => set('history','Last 5 prevented')} selected={policy.history==='Last 5 prevented'}/>
                        <DropdownOption label="Last 10 prevented" recommended onClick={() => set('history','Last 10 prevented')} selected={policy.history==='Last 10 prevented'}/>
                        <DropdownOption label="Last 24 prevented" onClick={() => set('history','Last 24 prevented')} selected={policy.history==='Last 24 prevented'}/>
                    </PolicySelect>

                    <PolicySelect label="Lockout after failed attempts" value={policy.lockout} width={300}>
                        <GL>Lockout after failed attempts</GL>
                        <DropdownOption label="3 failures"  sub="Strict — admin unlock required" onClick={() => set('lockout','3 failures')} selected={policy.lockout==='3 failures'}/>
                        <DropdownOption label="5 failures"  sub="Current — auto-unlock after 15 min" onClick={() => set('lockout','5 failures')} selected={policy.lockout==='5 failures'}/>
                        <DropdownOption label="10 failures" recommended onClick={() => set('lockout','10 failures')} selected={policy.lockout==='10 failures'}/>
                        <DropdownOption label="25 failures" onClick={() => set('lockout','25 failures')} selected={policy.lockout==='25 failures'}/>
                        <DropdownOption label="No lockout"  danger sub="Brute-force window opens" onClick={() => set('lockout','No lockout')} selected={policy.lockout==='No lockout'}/>
                        <div style={{ height:1, background:T.border, margin:'2px 6px' }}/>
                        <GL>After lockout</GL>
                        <DropdownOption label="Auto-unlock after 15 min" selected sub="Current" onClick={() => {}}/>
                        <DropdownOption label="Auto-unlock after 1 hour" onClick={() => {}}/>
                        <DropdownOption label="Admin unlock only" onClick={() => {}}/>
                    </PolicySelect>
                </div>

                <div style={{ fontSize:10.5, fontWeight:700, color:T.inkMuted, letterSpacing:0.7, textTransform:'uppercase', marginBottom:10, fontFamily:T.sans }}>Complexity</div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:10 }}>
                    {[
                        { key:'mixedCase', label:'Mixed case' },
                        { key:'number',    label:'Number' },
                        { key:'symbol',    label:'Symbol' },
                        { key:'blockCommon', label:'Block common' },
                    ].map(({ key, label }) => (
                        <div key={key} onClick={() => set('passwordComplexity', { ...policy.passwordComplexity, [key]: !policy.passwordComplexity?.[key] })}
                            style={{ padding:'12px 14px', border:`1px solid ${policy.passwordComplexity?.[key] ? T.ok : T.border}`,
                                borderRadius:6, background: policy.passwordComplexity?.[key] ? 'rgba(77,107,61,0.07)' : T.bg,
                                display:'flex', alignItems:'flex-start', gap:10, cursor:'pointer' }}>
                            <span style={{ width:16, height:16, borderRadius:3, border:`1.5px solid ${policy.passwordComplexity?.[key] ? T.ok : T.border}`,
                                background: policy.passwordComplexity?.[key] ? T.ok : 'transparent', display:'inline-flex', alignItems:'center', justifyContent:'center',
                                flexShrink:0, marginTop:1 }}>
                                {policy.passwordComplexity?.[key] && <span style={{ color:'#fff', fontSize:10, lineHeight:1 }}>✓</span>}
                            </span>
                            <div style={{ fontSize:12.5, fontWeight:600, color:T.ink, fontFamily:T.sans }}>{label}</div>
                        </div>
                    ))}
                </div>
            </SecCard>

            {/* ── IP allowlist ── */}
            <SecCard title="IP allowlist" desc="Restrict sign-in to these CIDR ranges. Empty = no restriction."
                headAction={<SecBtn label="+ Add range" onClick={() => { setEditingIp(null); setShowAddIp(true); }}/>}>
                <div style={{ border:`1px solid ${T.border}`, borderRadius:6, overflow:'hidden' }}>
                    <div style={{ display:'grid', gridTemplateColumns:'160px 1fr 100px 80px 36px', gap:8, padding:'7px 14px',
                        background:T.surface2, borderBottom:`1px solid ${T.border}` }}>
                        {['CIDR','LABEL','STATUS','HITS 30d',''].map((h,i) => (
                            <div key={i} style={{ fontSize:10, fontWeight:700, color:T.inkMuted, letterSpacing:0.6, textTransform:'uppercase', fontFamily:T.sans,
                                textAlign: i===3 ? 'right' : 'left' }}>{h}</div>
                        ))}
                    </div>
                    {policy.ipAllowlist.length === 0 && (
                        <div style={{ padding:'20px 14px', fontSize:12.5, color:T.inkMuted, fontFamily:T.sans, textAlign:'center' }}>
                            No ranges — all IPs allowed.
                        </div>
                    )}
                    {policy.ipAllowlist.map((row, i) => (
                        <div key={row.cidr} style={{ display:'grid', gridTemplateColumns:'160px 1fr 100px 80px 36px', gap:8, padding:'10px 14px',
                            borderBottom:i<policy.ipAllowlist.length-1?`1px solid ${T.border}`:'none', alignItems:'center' }}>
                            <span style={{ fontFamily:'ui-monospace,Menlo,monospace', fontSize:12.5, color:T.ink }}>{row.cidr}</span>
                            <span style={{ fontSize:13, color:T.inkMid }}>{row.label}</span>
                            <span style={{ display:'inline-block', padding:'2px 7px', borderRadius:10, fontSize:11, fontWeight:700,
                                background:row.status==='Enforced'?'rgba(77,107,61,0.12)':'rgba(184,115,51,0.10)',
                                color:row.status==='Enforced'?T.ok:T.warn }}>
                                {row.status}
                            </span>
                            <span style={{ fontFamily:'ui-monospace,Menlo,monospace', fontSize:11.5, color:T.inkMid, textAlign:'right' }}>{row.hits || '—'}</span>
                            <IpRowMenu row={row}
                                onEdit={r => { setEditingIp(r); setShowAddIp(true); }}
                                onRemove={handleRemoveIp}
                                onToggleEnforced={handleToggleEnforced}/>
                        </div>
                    ))}
                </div>
            </SecCard>
        </div>
    );
};
