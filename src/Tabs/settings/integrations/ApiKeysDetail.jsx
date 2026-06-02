// settings/integrations/ApiKeysDetail.jsx
import React, { useState, useEffect, useRef } from 'react';
import { dbFetch } from '../../../utils/storage';
import { T } from '../shared/tokens.js';
import { IntCrumb, IntTitle, IntBtn, IntModal, IntModalHeader, IntModalFooter, MenuRow } from './shared.jsx';

const NewApiKeyModal = ({ onClose, onCreated }) => {
    const [step,    setStep]    = React.useState('form'); // form | creating | reveal
    const [name,    setName]    = React.useState('');
    const [env,     setEnv]     = React.useState('live');
    const [scopes,  setScopes]  = React.useState(new Set(['read']));
    const [error,   setError]   = React.useState('');
    const [result,  setResult]  = React.useState(null); // { key, plaintextKey }
    const [copied,  setCopied]  = React.useState(false);

    const ALL_SCOPES = ['read','leads:write','contacts:write','opportunities:write','quotes:write','webhooks:write'];

    const toggleScope = (s) => setScopes(prev => {
        const n = new Set(prev);
        if (s === 'read') return n; // read is always included
        n.has(s) ? n.delete(s) : n.add(s);
        return n;
    });

    const handleCreate = async () => {
        if (!name.trim()) { setError('Key name is required'); return; }
        setStep('creating');
        setError('');
        try {
            const res  = await dbFetch('/.netlify/functions/api-keys', {
                method: 'POST',
                body: JSON.stringify({ name: name.trim(), scopes: [...scopes] }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to create key');
            setResult(data);
            if (onCreated) onCreated(data.key);
            setStep('reveal');
        } catch (e) {
            setError(e.message);
            setStep('form');
        }
    };

    const handleCopy = () => {
        if (!result?.plaintextKey) return;
        navigator.clipboard?.writeText(result.plaintextKey);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const inp = { padding:'8px 10px', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:13,
        color:T.ink, fontFamily:T.sans, outline:'none', width:'100%', boxSizing:'border-box', background:T.surface };

    return (
        <IntModal width={580} onClose={onClose}>
            <IntModalHeader onClose={onClose}
                title={step === 'reveal' ? 'Key created — copy it now' : 'Create API key'}
                sub={step !== 'reveal' ? 'Keys give programmatic access to Accelerep data. Stored as SHA-256 hash.' : undefined}/>
            <div style={{ flex:1, overflowY:'auto', padding:'18px 22px' }}>
                {step === 'form' && (
                    <>
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 120px', gap:12, marginBottom:14 }}>
                            <div>
                                <label style={{ display:'block', fontSize:11, fontWeight:600, color:T.inkMid, marginBottom:4 }}>Key name</label>
                                <input value={name} onChange={e => { setName(e.target.value); setError(''); }}
                                    placeholder="e.g. Production pipeline sync"
                                    onKeyDown={e => e.key === 'Enter' && handleCreate()}
                                    autoFocus style={inp}/>
                            </div>
                            <div>
                                <label style={{ display:'block', fontSize:11, fontWeight:600, color:T.inkMid, marginBottom:4 }}>Environment</label>
                                <select value={env} onChange={e => setEnv(e.target.value)}
                                    style={{ ...inp, appearance:'none', cursor:'pointer' }}>
                                    <option value="live">Live</option>
                                    <option value="test">Test</option>
                                </select>
                            </div>
                        </div>
                        <div style={{ marginBottom:14 }}>
                            <label style={{ display:'block', fontSize:11, fontWeight:600, color:T.inkMid, marginBottom:6 }}>
                                Scopes <span style={{ color:T.inkMuted, fontWeight:400 }}>(read is always included)</span>
                            </label>
                            <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                                {ALL_SCOPES.map(s => {
                                    const on = scopes.has(s);
                                    const locked = s === 'read';
                                    return (
                                        <span key={s} onClick={() => !locked && toggleScope(s)}
                                            style={{ display:'inline-flex', alignItems:'center', gap:5,
                                                padding:'4px 10px', borderRadius:4, fontSize:11.5,
                                                fontFamily:'ui-monospace,Menlo,monospace',
                                                border:`1px solid ${on ? T.info : T.border}`,
                                                background: on ? 'rgba(58,90,122,0.10)' : 'transparent',
                                                color: on ? T.info : T.inkMuted,
                                                cursor: locked ? 'default' : 'pointer' }}>
                                            {on && <span style={{ fontSize:9 }}>✓</span>}
                                            {s}
                                        </span>
                                    );
                                })}
                            </div>
                        </div>
                        {error && <div style={{ fontSize:12, color:T.danger, marginBottom:10, fontFamily:T.sans }}>{error}</div>}
                    </>
                )}

                {step === 'creating' && (
                    <div style={{ padding:'40px 0', textAlign:'center', color:T.inkMuted, fontSize:13, fontFamily:T.sans }}>
                        Generating key…
                    </div>
                )}

                {step === 'reveal' && result && (
                    <>
                        <div style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px',
                            background:'rgba(77,107,61,0.08)', border:`1px solid rgba(77,107,61,0.2)`,
                            borderRadius:6, marginBottom:16 }}>
                            <span style={{ fontSize:22, color:T.ok }}>✓</span>
                            <div>
                                <div style={{ fontSize:13.5, fontWeight:700, color:T.ok }}>Key created — <b>{result.key?.name}</b></div>
                                <div style={{ fontSize:12, color:T.inkMid, marginTop:1 }}>Copy it now. You won't be able to see it again.</div>
                            </div>
                        </div>

                        {/* Full key in dark panel */}
                        <div style={{ background:T.ink, borderRadius:6, padding:'14px 16px', marginBottom:14 }}>
                            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
                                <code style={{ fontFamily:'ui-monospace,Menlo,monospace', fontSize:11.5, color:'#a8f0c8',
                                    wordBreak:'break-all', flex:1, lineHeight:1.6 }}>
                                    {result.plaintextKey}
                                </code>
                                <button onClick={handleCopy}
                                    style={{ padding:'6px 14px', background: copied ? 'rgba(77,107,61,0.5)' : 'rgba(255,255,255,0.12)',
                                        color:'#fbf8f3', border:'1px solid rgba(255,255,255,0.18)', borderRadius:4,
                                        fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:T.sans, flexShrink:0,
                                        transition:'background 150ms' }}>
                                    {copied ? '✓ Copied' : 'Copy'}
                                </button>
                            </div>
                        </div>

                        {/* Warning */}
                        <div style={{ padding:'10px 14px', background:'rgba(184,115,51,0.09)',
                            borderLeft:`3px solid ${T.warn}`, borderRadius:4, marginBottom:14 }}>
                            <div style={{ fontSize:12, color:T.warn, fontWeight:600, marginBottom:2 }}>Store this key securely</div>
                            <div style={{ fontSize:12, color:T.inkMid, lineHeight:1.5 }}>
                                Never commit to source control. Use environment variables or a secrets manager (Vault, 1Password, AWS SSM).
                                This key is stored as a SHA-256 hash — Accelerep cannot recover it.
                            </div>
                        </div>

                        {/* Curl snippet */}
                        <div style={{ background:'rgba(42,38,34,0.04)', border:`1px solid ${T.border}`, borderRadius:4, padding:'10px 14px' }}>
                            <div style={{ fontSize:10, fontWeight:700, color:T.inkMuted, letterSpacing:0.5, textTransform:'uppercase', marginBottom:6 }}>Test with curl</div>
                            <code style={{ fontFamily:'ui-monospace,Menlo,monospace', fontSize:11.5, color:T.inkMid, lineHeight:1.6, display:'block', whiteSpace:'pre-wrap' }}>
                                {`curl -H "Authorization: Bearer ${(result.plaintextKey||'').slice(0,18)}..." \
  https://api.accelerep.com/v1/opportunities`}
                            </code>
                        </div>
                    </>
                )}
            </div>
            <IntModalFooter>
                {step === 'form' && (
                    <>
                        <IntBtn label="Cancel" onClick={onClose}/>
                        <IntBtn label="Create key" primary onClick={handleCreate} disabled={!name.trim()}/>
                    </>
                )}
                {step === 'creating' && <IntBtn label="Creating…" primary disabled/>}
                {step === 'reveal'   && <IntBtn label="I've stored it — close" primary onClick={onClose}/>}
            </IntModalFooter>
        </IntModal>
    );
};

const DOCS_RESOURCES = [
    { label:'Accounts',      tag:'accounts'      },
    { label:'Contacts',      tag:'contacts'      },
    { label:'Opportunities', tag:'opportunities' },
    { label:'Quotes',        tag:'quotes'        },
    { label:'Webhooks',      tag:'webhooks'      },
    { label:'Leads',         tag:'leads'         },
];

const SDK_LIST = [
    { lang:'TypeScript', ver:'v3.2.0', cmd:'npm i @accelerep/sdk',          url:'https://www.npmjs.com/package/@accelerep/sdk' },
    { lang:'Python',     ver:'v2.8.1', cmd:'pip install accelerep',          url:'https://pypi.org/project/accelerep/' },
    { lang:'Ruby',       ver:'v1.4.0', cmd:'gem install accelerep',          url:'https://rubygems.org/gems/accelerep' },
    { lang:'Go',         ver:'v0.9.3', cmd:'go get github.com/accelerep/go', url:'https://pkg.go.dev/github.com/accelerep/go' },
];

const DocsPopoverB = ({ keys = [], onClose, btnRef }) => {
    const ref    = React.useRef(null);
    const posRef = React.useRef(false);
    const [pos,     setPos]     = React.useState(null);
    const [tab,     setTab]     = React.useState(() => { try { return localStorage.getItem('accelerep.docs.lang') || 'cURL'; } catch { return 'cURL'; } });
    const [copied,  setCopied]  = React.useState(false);
    const [activeKey, setActiveKey] = React.useState(() => keys.find(k => !k.revokedAt) || null);
    const [showKeyPicker, setShowKeyPicker] = React.useState(false);

    const activeKeys = keys.filter(k => !k.revokedAt);

    React.useEffect(() => {
        if (!activeKey && activeKeys.length > 0) setActiveKey(activeKeys[0]);
    }, [keys]);

    React.useLayoutEffect(() => {
        if (!btnRef?.current || !ref.current || posRef.current) return;
        posRef.current = true;
        const r   = btnRef.current.getBoundingClientRect();
        const vw  = window.innerWidth;
        const vh  = window.innerHeight;
        const mH  = ref.current.offsetHeight || 540;
        const GAP = 8; const EDGE = 8;
        const top = (r.bottom + GAP + mH > vh - EDGE)
            ? Math.max(EDGE, r.top - mH - GAP) : r.bottom + GAP;
        const right = Math.max(EDGE, vw - r.right);
        setPos({ top, right });
    }, []);

    React.useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, []);

    const keyPrefix = activeKey?.keyPrefix || 'spt_live_••••••••';
    const snippets = {
        'cURL':   `curl https://salespipelinetracker.com/.netlify/functions/opportunities \
  -H "Authorization: Bearer ${keyPrefix}..." \
  -H "Accept: application/json"`,
        'JS':     `const res = await fetch(
  'https://salespipelinetracker.com/.netlify/functions/opportunities',
  { headers: { 'Authorization': 'Bearer ${keyPrefix}...' } }
);
const data = await res.json();`,
        'Python': `import requests
res = requests.get(
    'https://salespipelinetracker.com/.netlify/functions/opportunities',
    headers={'Authorization': 'Bearer ${keyPrefix}...'}
)
data = res.json()`,
    };

    const setLang = (l) => {
        setTab(l);
        try { localStorage.setItem('accelerep.docs.lang', l); } catch {}
    };

    const handleCopy = () => {
        navigator.clipboard?.writeText(snippets[tab]).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    // Hidden measurement div before position is known
    if (!pos) return (
        <div ref={ref} style={{ position:'fixed', top:-9999, left:-9999, visibility:'hidden', pointerEvents:'none', width:440 }}>
            <div style={{ height:540 }}/>
        </div>
    );

    return (
        <>
            <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:399, background:'transparent' }}/>
            <div ref={ref} style={{ position:'fixed', zIndex:400, top:pos.top, right:pos.right,
                width:440, background:T.surface, border:`1px solid ${T.borderStrong}`,
                borderRadius:4, boxShadow:'0 8px 28px rgba(42,38,34,0.14), 0 2px 4px rgba(42,38,34,0.06)',
                fontFamily:T.sans, overflow:'hidden' }}>
                {/* Caret */}
                <div style={{ position:'absolute', top:-6, right:18, width:12, height:12,
                    background:T.surface, border:`1px solid ${T.borderStrong}`,
                    borderRight:'none', borderBottom:'none', transform:'rotate(45deg)' }}/>

                {/* Header */}
                <div style={{ padding:'13px 16px 10px', borderBottom:`1px solid ${T.border}` }}>
                    <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:4 }}>
                        <span style={{ fontSize:14, fontWeight:700, color:T.ink }}>API quick reference</span>
                        <span style={{ flex:1 }}/>
                        <span style={{ fontSize:10.5, color:T.inkMuted, fontFamily:'ui-monospace,Menlo,monospace' }}>v1 · salespipelinetracker.com</span>
                    </div>
                    <div style={{ fontSize:11, color:T.inkMid, lineHeight:1.5 }}>
                        Copy a starter snippet, browse SDKs, or jump to a resource.
                    </div>
                </div>

                {/* Code block */}
                <div style={{ padding:'12px 16px 6px' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:5, marginBottom:6 }}>
                        <span style={{ fontSize:9.5, fontWeight:800, color:T.inkMuted, letterSpacing:0.7, textTransform:'uppercase' }}>Quick start</span>
                        <span style={{ flex:1 }}/>
                        {['cURL','JS','Python'].map(l => (
                            <span key={l} onClick={() => setLang(l)} style={{
                                padding:'3px 8px', borderRadius:10, fontSize:10.5, fontWeight:600, cursor:'pointer',
                                background: tab===l ? T.ink : 'transparent',
                                color: tab===l ? '#fbf8f3' : T.inkMid,
                                border:`1px solid ${tab===l ? T.ink : T.border}`,
                            }}>{l}</span>
                        ))}
                    </div>
                    <div style={{ background:T.ink, color:'#f3ede0', borderRadius:3, padding:'12px 14px',
                        fontFamily:'ui-monospace,Menlo,monospace', fontSize:11.5, lineHeight:1.55,
                        whiteSpace:'pre', overflowX:'auto', position:'relative' }}>
                        {snippets[tab]}
                        <span onClick={handleCopy} style={{ position:'absolute', top:8, right:8, fontSize:10,
                            padding:'3px 8px', background:'rgba(243,237,224,0.10)', color:'#f3ede0',
                            borderRadius:2, cursor:'pointer', fontWeight:600, transition:'background 100ms' }}>
                            {copied ? '✓ Copied' : 'Copy'}
                        </span>
                    </div>
                    {/* Key picker */}
                    <div style={{ marginTop:6, padding:'6px 10px', background:T.surface2,
                        border:`1px solid ${T.border}`, borderRadius:3, fontSize:10.5,
                        color:T.inkMid, display:'flex', alignItems:'center', gap:6, position:'relative' }}>
                        {activeKeys.length === 0 ? (
                            <span>No active keys — <span style={{ color:T.info, cursor:'pointer', fontWeight:600 }}>create one</span> to use this snippet</span>
                        ) : (<>
                            <span>Key:</span>
                            <span style={{ fontFamily:'ui-monospace,Menlo,monospace', fontSize:10.5,
                                background:T.surface, padding:'1px 6px', borderRadius:2,
                                border:`1px solid ${T.border}`, color:T.ink, fontWeight:600 }}>
                                {activeKey?.name || keyPrefix}
                            </span>
                            <span style={{ flex:1 }}/>
                            <span onClick={() => setShowKeyPicker(p => !p)}
                                style={{ color:T.inkMid, cursor:'pointer', fontWeight:600 }}>Change ▾</span>
                            {showKeyPicker && (
                                <div onClick={e => e.stopPropagation()}
                                    style={{ position:'absolute', bottom:'100%', right:0, marginBottom:4, zIndex:10,
                                        background:T.surface, border:`1px solid ${T.borderStrong}`, borderRadius:4,
                                        padding:4, boxShadow:'0 4px 16px rgba(42,38,34,0.12)', minWidth:200 }}>
                                    {activeKeys.map(k => (
                                        <div key={k.id} onClick={() => { setActiveKey(k); setShowKeyPicker(false); }}
                                            style={{ padding:'7px 10px', borderRadius:3, cursor:'pointer',
                                                background: activeKey?.id===k.id ? T.surface2 : 'transparent',
                                                fontSize:12, color:T.ink, fontWeight: activeKey?.id===k.id ? 600 : 400 }}
                                            onMouseEnter={e => e.currentTarget.style.background = T.surface2}
                                            onMouseLeave={e => e.currentTarget.style.background = activeKey?.id===k.id ? T.surface2 : 'transparent'}>
                                            {k.name}
                                            <span style={{ display:'block', fontFamily:'ui-monospace,Menlo,monospace', fontSize:10, color:T.inkMuted }}>{k.keyPrefix}...</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>)}
                    </div>
                </div>

                {/* SDKs */}
                <div style={{ padding:'8px 16px 4px', borderTop:`1px solid ${T.border}`, marginTop:8 }}>
                    <div style={{ fontSize:9.5, fontWeight:800, color:T.inkMuted, letterSpacing:0.7, textTransform:'uppercase', padding:'6px 0 6px' }}>Official SDKs</div>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:6 }}>
                        {SDK_LIST.map(s => (
                            <a key={s.lang} href={s.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration:'none' }}>
                                <div style={{ border:`1px solid ${T.border}`, borderRadius:3, padding:'8px 10px', background:T.surface, cursor:'pointer' }}
                                    onMouseEnter={e => e.currentTarget.style.background = T.surface2}
                                    onMouseLeave={e => e.currentTarget.style.background = T.surface}>
                                    <div style={{ display:'flex', alignItems:'baseline', gap:6, marginBottom:2 }}>
                                        <span style={{ fontSize:12, fontWeight:700, color:T.ink }}>{s.lang}</span>
                                        <span style={{ fontSize:9.5, color:T.inkMuted, fontFamily:'ui-monospace,Menlo,monospace' }}>{s.ver}</span>
                                        <span style={{ flex:1 }}/>
                                        <span style={{ fontSize:10, color:T.inkMuted }}>↗</span>
                                    </div>
                                    <div style={{ fontFamily:'ui-monospace,Menlo,monospace', fontSize:10.5, color:T.inkMid, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{s.cmd}</div>
                                </div>
                            </a>
                        ))}
                    </div>
                </div>

                {/* Jump-to */}
                <div style={{ padding:'8px 16px 10px', borderTop:`1px solid ${T.border}`, marginTop:8 }}>
                    <div style={{ display:'flex', alignItems:'center', marginBottom:6 }}>
                        <span style={{ fontSize:9.5, fontWeight:800, color:T.inkMuted, letterSpacing:0.7, textTransform:'uppercase' }}>Jump to</span>
                    </div>
                    <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                        {DOCS_RESOURCES.map(r => (
                            <a key={r.label} href={`/api-docs.html#${r.tag}`} target="_blank" rel="noopener noreferrer" style={{ textDecoration:'none' }}>
                                <span style={{ display:'inline-block', padding:'4px 9px', background:T.surface2,
                                    border:`1px solid ${T.border}`, borderRadius:12,
                                    fontSize:11, color:T.ink, fontWeight:600, cursor:'pointer' }}>
                                    {r.label}
                                </span>
                            </a>
                        ))}
                    </div>
                </div>

                {/* Footer */}
                <div style={{ padding:'10px 16px', borderTop:`1px solid ${T.border}`, background:T.surface2,
                    display:'flex', alignItems:'center', gap:10 }}>
                    <a href="/api-docs.html" target="_blank" rel="noopener noreferrer" style={{ fontSize:11, color:T.inkMuted, fontWeight:600, textDecoration:'none' }}>OpenAPI ↗</a>
                    <a href="/api-docs.html" target="_blank" rel="noopener noreferrer" style={{ fontSize:11, color:T.inkMuted, fontWeight:600, textDecoration:'none' }}>Postman ↗</a>
                    <span style={{ fontSize:11, color:T.inkMuted, fontWeight:400 }}>Changelog</span>
                    <span style={{ flex:1 }}/>
                    <a href="/api-docs.html" target="_blank" rel="noopener noreferrer"
                        style={{ padding:'6px 14px', background:T.ink, color:'#fbf8f3',
                            border:'none', borderRadius:T.r, fontSize:12.5, fontWeight:600,
                            cursor:'pointer', fontFamily:T.sans, textDecoration:'none', display:'inline-block' }}>
                        Open full docs ↗
                    </a>
                </div>
            </div>
        </>
    );
};

const RevokeKeyModal = ({ keyRecord, onClose, onRevoked }) => {
    const [confirming, setConfirming] = React.useState(false);
    const [error,      setError]      = React.useState('');

    const handleRevoke = async () => {
        setConfirming(true); setError('');
        try {
            const res = await dbFetch(`/.netlify/functions/api-keys?id=${keyRecord.id}`, { method: 'DELETE' });
            if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
            if (onRevoked) onRevoked(keyRecord.id);
            onClose();
        } catch(e) { setError(e.message); setConfirming(false); }
    };

    return (
        <IntModal width={460} onClose={onClose}>
            <IntModalHeader onClose={onClose} title="Revoke API key?" sub="This cannot be undone. Any services using this key will stop working immediately."/>
            <div style={{ padding:'18px 22px' }}>
                <div style={{ padding:'12px 14px', background:T.surface2, borderRadius:6, marginBottom:14 }}>
                    <div style={{ fontSize:13, fontWeight:700, color:T.ink, marginBottom:2 }}>{keyRecord.name}</div>
                    <div style={{ fontFamily:'ui-monospace,Menlo,monospace', fontSize:11, color:T.inkMuted }}>{keyRecord.keyPrefix}••••••••</div>
                </div>
                {error && <div style={{ fontSize:12, color:T.danger, marginBottom:10 }}>{error}</div>}
            </div>
            <IntModalFooter>
                <IntBtn label="Cancel" onClick={onClose}/>
                <button onClick={handleRevoke} disabled={confirming}
                    style={{ padding:'7px 16px', background:T.danger, color:'#fbf8f3', border:'none', borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>
                    {confirming ? 'Revoking…' : 'Revoke key'}
                </button>
            </IntModalFooter>
        </IntModal>
    );
};

const ApiKeyRowMenu = ({ keyRecord, onClose, onRevoke, onCopyPrefix }) => {
    const [copied, setCopied] = React.useState(false);
    return (
        <div style={{ width:192, background:T.surface, border:`1px solid ${T.borderStrong}`, borderRadius:4,
            boxShadow:'0 8px 24px rgba(42,38,34,0.12)', padding:4, fontFamily:T.sans }}>
            <div style={{ position:'absolute', top:-6, right:10, width:12, height:12,
                background:T.surface, border:`1px solid ${T.borderStrong}`,
                borderRight:'none', borderBottom:'none', transform:'rotate(45deg)' }}/>
            <MenuRow icon="📋" label={copied ? '✓ Copied' : 'Copy prefix'} onClick={() => {
                navigator.clipboard?.writeText(keyRecord.keyPrefix || '');
                setCopied(true);
            }} onClose={onClose}/>
            <div style={{ height:1, background:T.border, margin:'2px 6px' }}/>
            <MenuRow icon="🗑" label="Revoke key" danger onClick={onRevoke} onClose={onClose}/>
        </div>
    );
};

export const ApiKeysDetail = ({ onBack }) => {
    const [keys,       setKeys]       = React.useState([]);
    const [loading,    setLoading]    = React.useState(true);
    const [error,      setError]      = React.useState(null);
    const [filter,     setFilter]     = React.useState('Active');
    const [showModal,  setShowModal]  = React.useState(false);
    const [showDocs,   setShowDocs]   = React.useState(false);
    const [activeMenu, setActiveMenu] = React.useState(null); // key id
    const [revoking,   setRevoking]   = React.useState(null); // key record
    const docsBtnRef = React.useRef(null);

    const load = React.useCallback(async () => {
        try {
            const res  = await dbFetch('/.netlify/functions/api-keys');
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setKeys(data.keys || []);
        } catch(e) { setError(e.message); }
        finally { setLoading(false); }
    }, []);

    React.useEffect(() => { load(); }, []);

    // Outside click closes row menu
    React.useEffect(() => {
        if (!activeMenu) return;
        const close = (e) => {
            const menu = document.getElementById('key-menu-' + activeMenu);
            const btn  = document.getElementById('key-btn-'  + activeMenu);
            if (menu && menu.contains(e.target)) return;
            if (btn  && btn.contains(e.target))  return;
            setActiveMenu(null);
        };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, [activeMenu]);

    const fmtDate = (iso) => {
        if (!iso) return '—';
        const d = new Date(iso);
        const diffD = Math.round((Date.now() - d) / 86400000);
        if (diffD < 1) return 'today';
        if (diffD < 7) return diffD + 'd ago';
        if (diffD < 30) return Math.round(diffD/7) + 'w ago';
        return d.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
    };

    const activeCount  = keys.filter(k => !k.revokedAt).length;
    const revokedCount = keys.filter(k =>  k.revokedAt).length;

    const visible = keys.filter(k => {
        if (filter === 'Active')  return !k.revokedAt;
        if (filter === 'Revoked') return  k.revokedAt;
        return true;
    });

    return (
        <div style={{ fontFamily:T.sans }}>
            {showModal && <NewApiKeyModal onClose={() => setShowModal(false)} onCreated={k => { setKeys(prev => [k, ...prev]); }}/>}
            {revoking  && <RevokeKeyModal keyRecord={revoking} onClose={() => setRevoking(null)} onRevoked={id => { setKeys(prev => prev.map(k => k.id===id ? {...k, revokedAt: new Date().toISOString()} : k)); }}/>}

            <IntCrumb page="API keys" onBack={onBack}/>
            <IntTitle
                title="API keys"
                sub={loading ? 'Loading…' : `${activeCount} active key${activeCount!==1?'s':''} · workspace REST API credentials`}
                actions={[
                    <div key="docs" style={{ position:'relative' }}>
                        <button ref={docsBtnRef}
                            onClick={() => setShowDocs(o => !o)}
                            style={{ padding:'6px 12px', background:showDocs?T.surface2:T.surface,
                                border:`1px solid ${showDocs?T.goldInk:T.borderStrong}`,
                                color:showDocs?T.goldInk:T.ink, borderRadius:T.r, fontSize:12.5,
                                fontWeight:600, cursor:'pointer', fontFamily:T.sans,
                                display:'inline-flex', alignItems:'center', gap:4 }}>
                            View docs <span style={{ fontSize:10 }}>↗</span>
                        </button>
                        {showDocs && <DocsPopoverB keys={keys} onClose={() => setShowDocs(false)} btnRef={docsBtnRef}/>}
                    </div>,
                    <IntBtn key="new" label="+ Create key" primary onClick={() => setShowModal(true)}/>,
                ]}/>

            {error && <div style={{ padding:'10px 14px', background:'rgba(156,58,46,0.08)', borderLeft:`3px solid ${T.danger}`, borderRadius:4, marginBottom:16, fontSize:12.5, color:T.danger }}>{error}</div>}

            <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:8, overflow:'hidden', marginBottom:18 }}>
                <div style={{ padding:'12px 16px 10px', borderBottom:`1px solid ${T.border}`, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <div style={{ fontSize:13.5, fontWeight:700, color:T.ink }}>
                        Keys {!loading && <span style={{ fontSize:12, fontWeight:400, color:T.inkMuted }}>({keys.length})</span>}
                    </div>
                    <div style={{ display:'flex', gap:0, background:T.bg, border:`1px solid ${T.border}`, borderRadius:T.r+2, padding:2 }}>
                        {['Active','Revoked','All'].map(f => (
                            <button key={f} onClick={() => setFilter(f)}
                                style={{ padding:'4px 10px', fontSize:12, fontWeight:600, border:'none', borderRadius:T.r, cursor:'pointer', fontFamily:T.sans, background:filter===f?T.ink:'transparent', color:filter===f?'#fbf8f3':T.inkMid }}>{f}</button>
                        ))}
                    </div>
                </div>
                {/* Column headers */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 200px 160px 130px 90px 32px', gap:8, padding:'8px 16px', background:T.surface2, borderBottom:`1px solid ${T.border}` }}>
                    {['NAME','KEY PREFIX','SCOPES','CREATED','STATUS',''].map((h,i) => (
                        <div key={i} style={{ fontSize:10, fontWeight:700, color:T.inkMuted, letterSpacing:0.6, textTransform:'uppercase', fontFamily:T.sans }}>{h}</div>
                    ))}
                </div>

                {loading ? (
                    <div style={{ padding:40, textAlign:'center', color:T.inkMuted, fontSize:13 }}>Loading keys…</div>
                ) : visible.length === 0 ? (
                    <div style={{ padding:'48px 32px', textAlign:'center', fontFamily:T.sans }}>
                        <div style={{ fontSize:13.5, fontWeight:600, color:T.ink, marginBottom:6 }}>
                            {filter === 'Active' ? 'No active keys' : filter === 'Revoked' ? 'No revoked keys' : 'No keys yet'}
                        </div>
                        <div style={{ fontSize:12.5, color:T.inkMuted, marginBottom:16 }}>Create an API key to authenticate backend services.</div>
                        {filter !== 'Revoked' && (
                            <button onClick={() => setShowModal(true)}
                                style={{ padding:'7px 18px', background:T.ink, color:'#fbf8f3', border:'none', borderRadius:T.r, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>
                                + Create first key
                            </button>
                        )}
                    </div>
                ) : visible.map((k, i) => {
                    const revoked   = !!k.revokedAt;
                    const isMenuOpen = activeMenu === k.id;
                    return (
                        <div key={k.id} style={{ display:'grid', gridTemplateColumns:'1fr 200px 160px 130px 90px 32px', gap:8,
                            padding:'11px 16px', borderBottom:i<visible.length-1?`1px solid ${T.border}`:'none',
                            alignItems:'center', opacity:revoked?0.55:1, position:'relative' }}>
                            {/* Name */}
                            <div>
                                <div style={{ fontSize:13, fontWeight:600, color:T.ink }}>{k.name}</div>
                                <div style={{ fontSize:11, color:T.inkMuted }}>
                                    {k.createdAt ? `Created ${fmtDate(k.createdAt)}` : ''}
                                    {k.lastUsedAt ? ` · last used ${fmtDate(k.lastUsedAt)}` : ''}
                                </div>
                            </div>
                            {/* Key prefix */}
                            <div style={{ fontFamily:'ui-monospace,Menlo,monospace', fontSize:11.5, color:T.ink }}>
                                {k.keyPrefix || '—'}<span style={{ color:T.inkMuted }}>••••••••</span>
                            </div>
                            {/* Scopes */}
                            <div style={{ display:'flex', flexWrap:'wrap', gap:3 }}>
                                {(k.scopes||['read']).slice(0,2).map(s => (
                                    <span key={s} style={{ padding:'1px 5px', borderRadius:3, background:'rgba(58,90,122,0.10)', color:T.info, fontSize:10, fontFamily:'ui-monospace,Menlo,monospace' }}>{s}</span>
                                ))}
                                {(k.scopes||[]).length > 2 && <span style={{ fontSize:10, color:T.inkMuted }}>+{k.scopes.length-2}</span>}
                            </div>
                            {/* Created date */}
                            <div style={{ fontSize:12, color:T.inkMid }}>{fmtDate(k.createdAt)}</div>
                            {/* Status */}
                            <span style={{ display:'inline-block', padding:'2px 7px', borderRadius:10, fontSize:11, fontWeight:700,
                                background: revoked ? 'rgba(156,58,46,0.10)' : 'rgba(77,107,61,0.12)',
                                color: revoked ? T.danger : T.ok }}>
                                {revoked ? 'Revoked' : 'Active'}
                            </span>
                            {/* ⋯ menu */}
                            {!revoked && (
                                <div style={{ position:'relative' }}>
                                    <button id={'key-btn-' + k.id}
                                        onClick={() => setActiveMenu(isMenuOpen ? null : k.id)}
                                        style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:24, height:24,
                                            borderRadius:3, fontSize:15, fontWeight:700, border:'none', cursor:'pointer', lineHeight:1,
                                            color:isMenuOpen?T.goldInk:T.inkMuted, background:isMenuOpen?'rgba(200,185,154,0.30)':'transparent' }}>⋯</button>
                                    {isMenuOpen && (
                                        <div id={'key-menu-' + k.id} style={{ position:'absolute', right:0, ...(i >= visible.length - 3 ? { bottom:'100%', marginBottom:4 } : { top:'100%', marginTop:4 }), zIndex:100 }}>
                                            <ApiKeyRowMenu
                                                keyRecord={k}
                                                onClose={() => setActiveMenu(null)}
                                                onRevoke={() => { setRevoking(k); setActiveMenu(null); }}
                                                onCopyPrefix={() => setActiveMenu(null)}
                                            />
                                        </div>
                                    )}
                                </div>
                            )}
                            {revoked && <div/>}
                        </div>
                    );
                })}
            </div>

            <div style={{ padding:'12px 16px', background:'rgba(58,90,122,0.07)', borderLeft:`3px solid ${T.info}`, borderRadius:4, fontSize:12.5, color:T.inkMid }}>
                <b style={{ color:T.info }}>Security:</b> Keys are hashed with SHA-256 before storage. Only the prefix is shown after creation.
                To rotate a key: create a new one, update your services, then revoke the old one.
                Rate limit: <code style={{ fontFamily:'ui-monospace,Menlo,monospace' }}>1,000 req/min</code> per key.
            </div>
        </div>
    );
};
