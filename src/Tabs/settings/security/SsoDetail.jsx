// settings/security/SsoDetail.jsx
import React, { useState } from 'react';
import { T, eb } from '../shared/tokens.js';
import { SecCrumb, SecTitle, SecBtn, SecCallout, SecCard } from './shared.jsx';

const SEC_SSO = {
    configured: false,
    provider: 'Okta',
    protocol: 'SAML 2.0',
    defaultRole: 'Sales Rep',
    sp: {
        entityId: 'https://accelerep.com/sso',
        acsUrl:   'https://api.accelerep.com/sso/acs',
    },
    idp: {
        ssoUrl:    'https://acme.okta.com/app/exk1zx.../sso/saml',
        entityId:  'http://www.okta.com/exk1zx9aA1bC2dE3F4',
        cert:      '-----BEGIN CERTIFICATE-----\n(paste your IdP X.509 certificate here)\n-----END CERTIFICATE-----',
    },
    attributeMap: [
        { idp:'NameID',     local:'email',     required:true  },
        { idp:'firstName',  local:'firstName', required:true  },
        { idp:'lastName',   local:'lastName',  required:true  },
        { idp:'department', local:'team',      required:false },
        { idp:'role',       local:'role',      required:false },
    ],
    jitProvisioning: 'On — create user on first SSO login',
    concurrentPassword: 'Disabled (SSO only)',
    verifiedDomains: ['accelerep.com','acme-corp.com'],
};

const ConfigureSsoModal = ({ onClose }) => {
    const [step, setStep] = useState(2);
    const steps = ['Provider','Service info','IdP info','Test'];
    const SP = SEC_SSO.sp;

    return (
        <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(42,38,34,0.40)', zIndex:700, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:T.sans }}>
            <div onClick={e=>e.stopPropagation()}
                style={{ background:T.surface, borderRadius:8, width:720, maxHeight:760, display:'flex', flexDirection:'column', overflow:'hidden', boxShadow:'0 20px 56px rgba(20,16,12,0.28)' }}>
                {/* Header */}
                <div style={{ padding:'18px 22px 14px', borderBottom:`1px solid ${T.border}`, flexShrink:0, display:'flex', alignItems:'flex-start', justifyContent:'space-between' }}>
                    <div>
                        <div style={{ fontSize:17, fontWeight:700, color:T.ink, letterSpacing:-0.2 }}>Configure single sign-on</div>
                        <div style={{ fontSize:12.5, color:T.inkMuted, marginTop:2 }}>Connect your identity provider in 4 steps.</div>
                    </div>
                    <button onClick={onClose} style={{ background:'none', border:'none', color:T.inkMuted, fontSize:20, cursor:'pointer', lineHeight:1 }}>×</button>
                </div>
                {/* Stepper */}
                <div style={{ display:'flex', padding:'0 22px', borderBottom:`1px solid ${T.border}`, flexShrink:0 }}>
                    {steps.map((s,i) => {
                        const n = i+1; const done = step>n; const active = step===n;
                        return (
                            <div key={s} style={{ display:'flex', alignItems:'center', gap:6, padding:'10px 14px 10px 0', fontSize:12.5, fontWeight:600,
                                color: active ? T.ink : done ? T.ok : T.inkMuted,
                                borderBottom: active ? `2px solid ${T.goldInk}` : '2px solid transparent', cursor: done?'pointer':'default' }}
                                onClick={()=>{ if(done) setStep(n); }}>
                                <span style={{ width:20, height:20, borderRadius:'50%', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:11,
                                    border:`1.5px solid ${active?T.goldInk:done?T.ok:T.border}`,
                                    background: done ? T.ok : 'transparent',
                                    color: done ? '#fff' : active ? T.goldInk : T.inkMuted }}>
                                    {done ? '✓' : n}
                                </span>
                                {s}
                            </div>
                        );
                    })}
                </div>
                {/* Body */}
                <div style={{ flex:1, overflowY:'auto', padding:'18px 22px' }}>
                    <div style={{ ...eb(T.inkMuted), marginBottom:12 }}>STEP 2 — SERVICE PROVIDER INFO</div>
                    <div style={{ fontSize:12.5, color:T.inkMid, marginBottom:16 }}>Copy these values into your Okta SAML application configuration.</div>
                    {/* Copy pairs */}
                    {[
                        { label:'Entity ID / Audience', value: SP.entityId },
                        { label:'ACS / Reply URL',       value: SP.acsUrl   },
                    ].map((row,i) => (
                        <div key={i} style={{ display:'grid', gridTemplateColumns:'160px 1fr 80px', gap:10, alignItems:'center', marginBottom:10 }}>
                            <label style={{ fontSize:12.5, fontWeight:600, color:T.inkMid, fontFamily:T.sans }}>{row.label}</label>
                            <input readOnly value={row.value} style={{ padding:'7px 10px', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:12.5, color:T.ink, fontFamily:'ui-monospace,Menlo,monospace', outline:'none', background:T.bg }}/>
                            <button onClick={()=>navigator.clipboard?.writeText(row.value)}
                                style={{ padding:'7px 12px', background:T.surface, border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>Copy</button>
                        </div>
                    ))}
                    {/* NameID format */}
                    <div style={{ display:'grid', gridTemplateColumns:'160px 240px', gap:10, alignItems:'center', marginTop:10 }}>
                        <label style={{ fontSize:12.5, fontWeight:600, color:T.inkMid, fontFamily:T.sans }}>NameID Format</label>
                        <select style={{ padding:'7px 10px', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:13, color:T.ink, fontFamily:T.sans, outline:'none', background:T.surface, appearance:'none', cursor:'pointer' }}>
                            <option>EmailAddress</option>
                            <option>Persistent</option>
                            <option>Transient</option>
                        </select>
                    </div>
                    {/* Info callout */}
                    <div style={{ marginTop:16, padding:'10px 14px', background:'rgba(58,90,122,0.07)', borderLeft:`3px solid ${T.info}`, borderRadius:4 }}>
                        <span style={{ fontSize:12.5, color:T.info, fontWeight:600 }}>Tip. </span>
                        <span style={{ fontSize:12.5, color:T.inkMid }}>You can also download the SP metadata XML and upload it directly to Okta.</span>
                    </div>
                </div>
                {/* Footer */}
                <div style={{ padding:'12px 22px', borderTop:`1px solid ${T.border}`, background:T.surface2, display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
                    <SecBtn label="Back" onClick={()=>setStep(s=>Math.max(1,s-1))}/>
                    <div style={{ display:'flex', gap:8 }}>
                        <SecBtn label="Download SP metadata"/>
                        <SecBtn label="Continue" primary onClick={()=>setStep(s=>Math.min(4,s+1))}/>
                    </div>
                </div>
            </div>
        </div>
    );
};

export const SsoDetail = ({ onBack }) => {
    const [provider, setProvider] = useState(SEC_SSO.provider);
    const [showWizard, setShowWizard] = useState(false);
    const [idpSsoUrl, setIdpSsoUrl] = useState(SEC_SSO.idp.ssoUrl);
    const [idpEntityId, setIdpEntityId] = useState(SEC_SSO.idp.entityId);
    const [idpCert, setIdpCert] = useState(SEC_SSO.idp.cert);
    const providers = ['Okta','Azure AD','Google','OneLogin','Generic'];
    const inp = { padding:'8px 10px', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:13, color:T.ink, fontFamily:'ui-monospace,Menlo,monospace', outline:'none', width:'100%', boxSizing:'border-box', background:T.surface };

    return (
        <div style={{ fontFamily:T.sans }}>
            {showWizard && <ConfigureSsoModal onClose={()=>setShowWizard(false)}/>}
            <SecCrumb page="Single sign-on (SSO)" onBack={onBack}/>
            <SecTitle
                title="Single sign-on (SSO)"
                sub="SAML 2.0 / OIDC identity provider"
                badge={SEC_SSO.configured ? 'Active · 412 logins / 30d' : undefined}
                updatedAt={SEC_SSO.configured ? 'Last edited by Morgan' : 'Last edited never by —'}
                actions={[
                    <SecBtn key="dl" label="Download metadata"/>,
                    <SecBtn key="tl" label="Test login" disabled/>,
                    <div key="act" title="SSO is available on the Enterprise plan" style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'6px 14px', background:'rgba(138,131,120,0.12)', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:13, fontWeight:600, color:T.inkMuted, fontFamily:T.sans, cursor:'default', userSelect:'none' }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                        Enterprise plan
                    </div>,
                ]}/>

            {/* Not configured callout */}
            {!SEC_SSO.configured && (
                <SecCallout tone="warn" text={
                    <><b>SSO is not configured.</b> Workspaces with 10+ users should set up SSO so deactivating an IdP user revokes Accelerep access.</>
                } actions={[
                    <span key="ent" style={{ fontSize:12, color:T.inkMuted, fontFamily:T.sans, fontStyle:'italic' }}>Available on Enterprise plan · <a href="mailto:sales@accelerep.com" style={{ color:T.info, textDecoration:'none' }}>contact us</a></span>
                ]}/>
            )}

            {/* Provider preset */}
            <SecCard title="Provider" desc="Pick a preset or use a generic SAML / OIDC provider.">
                <div style={{ display:'grid', gridTemplateColumns:'repeat(5, 1fr)', gap:8, marginBottom:16 }}>
                    {providers.map(p => (
                        <button key={p} onClick={()=>setProvider(p)}
                            style={{ padding:'10px 8px', border:`1.5px solid ${provider===p?T.goldInk:T.border}`, borderRadius:6, background:provider===p?'rgba(200,185,154,0.12)':T.surface, cursor:'pointer', fontSize:13, fontWeight:600, color:T.ink, fontFamily:T.sans, transition:'border-color 100ms, background 100ms' }}>
                            {p}
                        </button>
                    ))}
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                    {[{label:'Protocol',value:'SAML 2.0'},{label:'Default role for new users',value:'Sales Rep'}].map((f,i) => (
                        <div key={i}>
                            <label style={{ display:'block', fontSize:11.5, fontWeight:600, color:T.inkMid, marginBottom:5 }}>{f.label}</label>
                            <select defaultValue={f.value} style={{ ...inp, fontFamily:T.sans, appearance:'none', cursor:'pointer', backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='11' height='11' viewBox='0 0 24 24' fill='none' stroke='%238a8378' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat:'no-repeat', backgroundPosition:'right 10px center', paddingRight:28 }}>
                                <option>{f.value}</option>
                            </select>
                        </div>
                    ))}
                </div>
            </SecCard>

            {/* Service provider */}
            <SecCard title="Service provider (Accelerep)" desc="Paste these values into your IdP.">
                {[
                    { label:'Entity ID', value:SEC_SSO.sp.entityId },
                    { label:'ACS URL',   value:SEC_SSO.sp.acsUrl   },
                ].map((row,i) => (
                    <div key={i} style={{ display:'grid', gridTemplateColumns:'120px 1fr', gap:12, alignItems:'center', marginBottom:10 }}>
                        <label style={{ fontSize:12.5, fontWeight:600, color:T.inkMid }}>{row.label}</label>
                        <input readOnly value={row.value} style={{ ...inp, background:T.bg }} onClick={e=>e.currentTarget.select()}/>
                    </div>
                ))}
            </SecCard>

            {/* Identity provider */}
            <SecCard title="Identity provider" desc="From your IdP application.">
                <div style={{ display:'grid', gridTemplateColumns:'120px 1fr', gap:12, alignItems:'center', marginBottom:10 }}>
                    <label style={{ fontSize:12.5, fontWeight:600, color:T.inkMid }}>SSO URL</label>
                    <input value={idpSsoUrl} onChange={e=>setIdpSsoUrl(e.target.value)} style={inp}/>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'120px 1fr', gap:12, alignItems:'center', marginBottom:10 }}>
                    <label style={{ fontSize:12.5, fontWeight:600, color:T.inkMid }}>IdP entity ID</label>
                    <input value={idpEntityId} onChange={e=>setIdpEntityId(e.target.value)} style={inp}/>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'120px 1fr', gap:12, alignItems:'flex-start', marginBottom:4 }}>
                    <label style={{ fontSize:12.5, fontWeight:600, color:T.inkMid, paddingTop:8 }}>X.509 certificate</label>
                    <textarea value={idpCert} onChange={e=>setIdpCert(e.target.value)} rows={4}
                        style={{ ...inp, fontFamily:'ui-monospace,Menlo,monospace', fontSize:11.5, resize:'vertical', lineHeight:1.5 }}/>
                </div>
            </SecCard>

            {/* Attribute mapping */}
            <SecCard title="Attribute mapping" desc="Map IdP claims to Accelerep user fields.">
                <div style={{ border:`1px solid ${T.border}`, borderRadius:6, overflow:'hidden' }}>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 120px 60px', gap:8, padding:'7px 14px', background:T.surface2, borderBottom:`1px solid ${T.border}` }}>
                        {['IDP ATTRIBUTE','ACCELEREP FIELD','REQUIRED',''].map((h,i) => (
                            <div key={i} style={{ fontSize:10, fontWeight:700, color:T.inkMuted, letterSpacing:0.6, textTransform:'uppercase', fontFamily:T.sans }}>{h}</div>
                        ))}
                    </div>
                    {SEC_SSO.attributeMap.map((row,i) => (
                        <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr 1fr 120px 60px', gap:8, padding:'9px 14px', borderBottom:i<SEC_SSO.attributeMap.length-1?`1px solid ${T.border}`:'none', alignItems:'center' }}>
                            <span style={{ fontFamily:'ui-monospace,Menlo,monospace', fontSize:12.5, color:T.ink }}>{row.idp}</span>
                            <span style={{ fontFamily:'ui-monospace,Menlo,monospace', fontSize:12.5, color:T.inkMid }}>{row.local}</span>
                            <span style={{ display:'inline-block', padding:'2px 7px', borderRadius:10, fontSize:11, fontWeight:700,
                                background: row.required?'rgba(77,107,61,0.12)':'rgba(184,115,51,0.10)',
                                color: row.required?T.ok:T.warn }}>
                                {row.required?'Required':'Optional'}
                            </span>
                            <button style={{ fontSize:12.5, color:T.info, background:'none', border:'none', cursor:'pointer', fontFamily:T.sans }}>Edit</button>
                        </div>
                    ))}
                </div>
            </SecCard>

            {/* Provisioning & domains */}
            <SecCard title="Provisioning & domains" desc="Just-in-time creation and verified domains.">
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:16 }}>
                    {[
                        { label:'JIT provisioning',        value:SEC_SSO.jitProvisioning   },
                        { label:'Concurrent password login',value:SEC_SSO.concurrentPassword },
                    ].map((f,i) => (
                        <div key={i}>
                            <label style={{ display:'block', fontSize:11.5, fontWeight:600, color:T.inkMid, marginBottom:5 }}>{f.label}</label>
                            <select defaultValue={f.value} style={{ width:'100%', padding:'8px 10px', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:13, color:T.ink, fontFamily:T.sans, outline:'none', appearance:'none', cursor:'pointer', background:T.surface }}>
                                <option>{f.value}</option>
                            </select>
                        </div>
                    ))}
                </div>
                <div style={{ fontSize:11.5, fontWeight:600, color:T.inkMid, textTransform:'uppercase', letterSpacing:0.5, marginBottom:8, fontFamily:T.sans }}>Verified domains</div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                    {SEC_SSO.verifiedDomains.map(d => (
                        <span key={d} style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'4px 10px', background:'rgba(58,90,122,0.08)', border:`1px solid rgba(58,90,122,0.18)`, borderRadius:4, fontFamily:'ui-monospace,Menlo,monospace', fontSize:12.5, color:T.info }}>
                            {d}
                            <span style={{ cursor:'pointer', color:T.inkMuted, fontSize:14, lineHeight:1 }}>×</span>
                        </span>
                    ))}
                    <button style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'4px 10px', border:`1.5px dashed ${T.border}`, borderRadius:4, background:'transparent', fontSize:12.5, color:T.inkMuted, cursor:'pointer', fontFamily:T.sans }}>+ Add domain</button>
                </div>
            </SecCard>
        </div>
    );
};
