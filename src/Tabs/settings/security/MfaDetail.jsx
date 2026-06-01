// settings/security/MfaDetail.jsx
import React, { useState, useEffect } from 'react';
import { dbFetch } from '../../../utils/storage';
import { T } from '../shared/tokens.js';
import { SecCrumb, SecTitle, SecBtn, SecCallout, SecCard } from './shared.jsx';

const OnOffTile = ({ label, sub, on }) => (
    <div style={{ padding:'12px 14px', border:`1px solid ${on?T.ok:T.border}`, borderRadius:6,
        background: on ? 'rgba(77,107,61,0.07)' : T.bg,
        display:'flex', alignItems:'flex-start', gap:10 }}>
        <span style={{
            width:16, height:16, borderRadius:3, border:`1.5px solid ${on?T.ok:T.border}`,
            background:on?T.ok:'transparent', display:'inline-flex', alignItems:'center', justifyContent:'center',
            flexShrink:0, marginTop:1,
        }}>
            {on && <span style={{ color:'#fff', fontSize:10, lineHeight:1 }}>✓</span>}
        </span>
        <div>
            <div style={{ fontSize:12.5, fontWeight:600, color:T.ink, fontFamily:T.sans }}>{label}</div>
            {sub && <div style={{ fontSize:11, color:T.inkMuted, marginTop:2, fontFamily:T.sans }}>{sub}</div>}
        </div>
    </div>
);

const EnforceMfaModal = ({ onClose }) => {
    const [confirm, setConfirm] = useState('');
    const [notify, setNotify]   = useState(false);
    const ready = confirm.trim().toUpperCase() === 'ENFORCE';
    return (
        <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(42,38,34,0.40)', zIndex:700, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:T.sans }}>
            <div onClick={e=>e.stopPropagation()}
                style={{ background:T.surface, borderRadius:8, width:520, boxShadow:'0 20px 56px rgba(20,16,12,0.28)', overflow:'hidden' }}>
                {/* Header */}
                <div style={{ padding:'20px 22px 16px', borderBottom:`1px solid ${T.border}`, display:'flex', alignItems:'flex-start', gap:12 }}>
                    <div style={{ width:32, height:32, borderRadius:5, background:T.warn, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>⚠</div>
                    <div>
                        <div style={{ fontSize:15, fontWeight:700, color:T.ink }}>Enforce MFA for all users?</div>
                        <div style={{ fontSize:12.5, color:T.inkMid, marginTop:3 }}>This action affects 22 users immediately.</div>
                    </div>
                </div>
                {/* Body */}
                <div style={{ padding:'18px 22px' }}>
                    {/* Impact breakdown */}
                    <div style={{ background:T.surface2, border:`1px solid ${T.border}`, borderRadius:6, padding:'12px 16px', marginBottom:18 }}>
                        <div style={{ fontSize:13, color:T.inkMid, marginBottom:6 }}>
                            <b style={{ color:T.ok }}>14 users</b> are already enrolled — no impact.
                        </div>
                        <div style={{ fontSize:13, color:T.inkMid, marginBottom:6 }}>
                            <b style={{ color:T.warn }}>8 users</b> will be prompted to enroll on their next sign-in.
                        </div>
                        <div style={{ fontSize:13, color:T.inkMid }}>
                            <b>1 user</b> (<span style={{ fontFamily:'ui-monospace,Menlo,monospace', fontSize:12 }}>kirim@accelerep.com</span>) was never invited — they'll need a fresh invite.
                        </div>
                    </div>
                    {/* Type to confirm */}
                    <div style={{ marginBottom:12 }}>
                        <label style={{ display:'block', fontSize:12, fontWeight:600, color:T.inkMid, marginBottom:6 }}>
                            Type <b style={{ fontFamily:'ui-monospace,Menlo,monospace', color:T.ink }}>ENFORCE</b> to confirm
                        </label>
                        <input value={confirm} onChange={e=>setConfirm(e.target.value)}
                            placeholder="ENFORCE"
                            style={{ width:'100%', padding:'8px 10px', border:`1.5px solid ${ready?T.warn:T.border}`, borderRadius:T.r, fontSize:13, color:T.ink, fontFamily:'ui-monospace,Menlo,monospace', outline:'none', background:T.surface, boxSizing:'border-box' }}/>
                    </div>
                    {/* Notify checkbox */}
                    <div style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer' }} onClick={()=>setNotify(v=>!v)}>
                        <span style={{ width:14, height:14, border:`1.5px solid ${notify?T.ok:T.border}`, borderRadius:2, background:notify?T.ok:'transparent', display:'inline-flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                            {notify && <span style={{ color:'#fff', fontSize:9 }}>✓</span>}
                        </span>
                        <span style={{ fontSize:13, color:T.inkMid }}>Send notification email to affected users now</span>
                    </div>
                </div>
                {/* Footer */}
                <div style={{ padding:'12px 22px', borderTop:`1px solid ${T.border}`, background:T.surface2, display:'flex', alignItems:'center', justifyContent:'flex-end', gap:8 }}>
                    <SecBtn label="Cancel" onClick={onClose}/>
                    <SecBtn label="Enforce MFA" warn disabled={!ready} onClick={()=>{ if(ready) onClose(); }}/>
                </div>
            </div>
        </div>
    );
};

export const MfaDetail = ({ onBack }) => {
    const [showEnforce, setShowEnforce] = React.useState(false);
    const [mfaData,     setMfaData]     = React.useState(null);
    const [loading,     setLoading]     = React.useState(true);
    const [error,       setError]       = React.useState(null);

    // ── Load real MFA enrollment from Clerk via backend ───────────
    React.useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                const res  = await dbFetch('/.netlify/functions/clerk-mfa-status');
                const data = await res.json();
                if (cancelled) return;
                if (!res.ok) throw new Error(data.error || 'Failed to load MFA status');
                setMfaData(data);
            } catch (e) {
                if (!cancelled) setError(e.message);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        load();
        return () => { cancelled = true; };
    }, []);

    // Fall back to empty state while loading
    const enrolled        = mfaData?.enrolled        ?? 0;
    const total           = mfaData?.total           ?? 0;
    const notEnrolled     = mfaData?.notEnrolled     ?? [];
    const byRole          = mfaData?.byRole          ?? [];
    const notEnrolledCount = total - enrolled;
    const enrollPct       = total > 0 ? Math.round(enrolled / total * 100) : 0;

    return (
        <div style={{ fontFamily:T.sans }}>
            {showEnforce && <EnforceMfaModal onClose={()=>setShowEnforce(false)}/>}
            <SecCrumb page="Multi-factor auth" onBack={onBack}/>
            <SecTitle
                title="Multi-factor auth"
                sub="Enforce a second factor on sign-in · managed via Clerk"
                badge={loading ? 'Loading…' : `${enrolled}/${total} enrolled · ${enrollPct}%`}
                updatedAt="MFA factors configured in Clerk Dashboard"
                actions={[
                    <SecBtn key="rem" label="Send reminders" disabled={loading || notEnrolledCount === 0}/>,
                    <div key="enf" title="MFA policy is set in Clerk Dashboard" style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'6px 14px', background:'rgba(138,131,120,0.12)', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:13, fontWeight:600, color:T.inkMuted, fontFamily:T.sans, cursor:'default', userSelect:'none' }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                        Managed in Clerk
                    </div>,
                ]}/>

            {/* Clerk dashboard link callout */}
            <SecCallout tone="info"
                text={<>MFA policy (required / optional) and allowed factors are configured in your <a href="https://dashboard.clerk.com" target="_blank" rel="noopener noreferrer" style={{ color:T.info, fontWeight:600 }}>Clerk Dashboard</a> under User &amp; Authentication → Multi-factor. Enrollment data below is live from Clerk.</>}
            />

            {error && (
                <div style={{ padding:'11px 16px', background:'rgba(156,58,46,0.08)', borderLeft:`3px solid ${T.danger}`, borderRadius:4, marginBottom:16, fontSize:12.5, color:T.danger, fontFamily:T.sans }}>
                    {error}
                </div>
            )}

            {/* Not-enrolled callout */}
            {!loading && notEnrolledCount > 0 && (
                <SecCallout tone="warn"
                    text={<>MFA is not fully enrolled. <b>{notEnrolledCount} user{notEnrolledCount !== 1 ? 's' : ''} haven't set up a second factor.</b> Require MFA in Clerk Dashboard to lock down sign-in.</>}
                    actions={[
                        <a key="dash" href="https://dashboard.clerk.com" target="_blank" rel="noopener noreferrer">
                            <SecBtn label="Open Clerk Dashboard →"/>
                        </a>,
                    ]}
                />
            )}

            {/* ── Enrollment by role ── */}
            <SecCard title={loading ? 'Enrollment by role' : `Enrollment by role (${enrolled}/${total} · ${enrollPct}%)`}>
                {loading ? (
                    <div style={{ padding:'24px 0', textAlign:'center', fontSize:12.5, color:T.inkMuted, fontFamily:T.sans }}>Loading enrollment data…</div>
                ) : byRole.length === 0 ? (
                    <div style={{ padding:'24px 0', textAlign:'center', fontSize:12.5, color:T.inkMuted, fontFamily:T.sans }}>No users found in this organization.</div>
                ) : (
                    <div style={{ border:`1px solid ${T.border}`, borderRadius:6, overflow:'hidden' }}>
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 80px', gap:8, padding:'7px 14px', background:T.surface2, borderBottom:`1px solid ${T.border}` }}>
                            {['ROLE','ENROLLMENT',''].map((h,i) => (
                                <div key={i} style={{ fontSize:10, fontWeight:700, color:T.inkMuted, letterSpacing:0.6, textTransform:'uppercase', fontFamily:T.sans }}>{h}</div>
                            ))}
                        </div>
                        {byRole.map((r, i) => {
                            const pct  = r.total > 0 ? Math.round(r.enrolled / r.total * 100) : 0;
                            const full = pct === 100;
                            const pending = r.total - r.enrolled;
                            return (
                                <div key={r.role} style={{ display:'grid', gridTemplateColumns:'1fr 1fr 80px', gap:8, padding:'10px 14px', borderBottom:i<byRole.length-1?`1px solid ${T.border}`:'none', alignItems:'center' }}>
                                    <span style={{ fontSize:13, fontWeight:600, color:T.ink, fontFamily:T.sans }}>{r.role}</span>
                                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                                        <div style={{ width:100, height:6, background:T.border, borderRadius:3, overflow:'hidden', flexShrink:0 }}>
                                            <div style={{ width:`${pct}%`, height:'100%', background: full ? T.ok : T.warn, borderRadius:3 }}/>
                                        </div>
                                        <span style={{ fontSize:11.5, color:T.inkMid, fontFamily:'ui-monospace,Menlo,monospace' }}>{r.enrolled}/{r.total}</span>
                                        <span style={{ display:'inline-block', padding:'2px 7px', borderRadius:10, fontSize:11, fontWeight:700,
                                            background: full ? 'rgba(77,107,61,0.12)' : 'rgba(184,115,51,0.12)',
                                            color: full ? T.ok : T.warn }}>
                                            {full ? 'Complete' : `${pending} pending`}
                                        </span>
                                    </div>
                                    <a href="https://dashboard.clerk.com" target="_blank" rel="noopener noreferrer" style={{ fontSize:12, color:T.info, textDecoration:'none', fontFamily:T.sans }}>Manage →</a>
                                </div>
                            );
                        })}
                    </div>
                )}
            </SecCard>

            {/* ── Not yet enrolled ── */}
            <SecCard title={`Not yet enrolled (${notEnrolledCount})`} desc="Users who have not set up any MFA factor. Manage enrollment in Clerk Dashboard.">
                {loading ? (
                    <div style={{ padding:'24px 0', textAlign:'center', fontSize:12.5, color:T.inkMuted, fontFamily:T.sans }}>Loading…</div>
                ) : notEnrolled.length === 0 ? (
                    <div style={{ padding:'18px 0', textAlign:'center', fontSize:12.5, color:T.ok, fontFamily:T.sans }}>
                        ✓ All users have MFA enrolled.
                    </div>
                ) : (
                    <div style={{ border:`1px solid ${T.border}`, borderRadius:6, overflow:'hidden' }}>
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 120px 80px', gap:8, padding:'7px 14px', background:T.surface2, borderBottom:`1px solid ${T.border}` }}>
                            {['USER','ROLE','NAME',''].map((h,i) => (
                                <div key={i} style={{ fontSize:10, fontWeight:700, color:T.inkMuted, letterSpacing:0.6, textTransform:'uppercase', fontFamily:T.sans }}>{h}</div>
                            ))}
                        </div>
                        {notEnrolled.map((u, i) => (
                            <div key={u.userId} style={{ display:'grid', gridTemplateColumns:'1fr 1fr 120px 80px', gap:8, padding:'9px 14px', borderBottom:i<notEnrolled.length-1?`1px solid ${T.border}`:'none', alignItems:'center' }}>
                                <span style={{ fontFamily:'ui-monospace,Menlo,monospace', fontSize:12, color:T.ink, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{u.email}</span>
                                <span style={{ fontSize:12.5, color:T.inkMid, fontFamily:T.sans }}>{u.role}</span>
                                <span style={{ fontSize:12.5, color:T.inkMid, fontFamily:T.sans }}>{u.name}</span>
                                <a href="https://dashboard.clerk.com" target="_blank" rel="noopener noreferrer"
                                    style={{ fontSize:12, color:T.info, textDecoration:'none', fontFamily:T.sans }}>Manage →</a>
                            </div>
                        ))}
                    </div>
                )}
            </SecCard>

            {/* ── Allowed factors — informational note ── */}
            <SecCard title="Allowed factors" desc="Factor configuration is managed in Clerk Dashboard → User & Authentication → Multi-factor.">
                <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10 }}>
                    <OnOffTile label="Authenticator (TOTP)" sub="Google Authenticator, 1Password, Authy" on={true}/>
                    <OnOffTile label="Security key / Passkey" sub="WebAuthn, biometrics" on={true}/>
                    <OnOffTile label="SMS code" sub="Discouraged — NIST advises against" on={false}/>
                    <OnOffTile label="Email code" sub="Lowest assurance factor" on={false}/>
                </div>
                <div style={{ marginTop:12, fontSize:12, color:T.inkMuted, fontFamily:T.sans }}>
                    To change which factors are allowed, visit your <a href="https://dashboard.clerk.com" target="_blank" rel="noopener noreferrer" style={{ color:T.info }}>Clerk Dashboard</a>.
                </div>
            </SecCard>
        </div>
    );
};
