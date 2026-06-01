// settings/integrations/WebhooksDetail.jsx
import React, { useState, useEffect, useRef } from 'react';
import { dbFetch } from '../../../utils/storage';
import { T } from '../shared/tokens.js';
import { IntCrumb, IntTitle, IntBtn, IntModal, IntModalHeader, IntModalFooter } from './shared.jsx';

const WebhookRowMenu = ({ wh, onToggle, onDelete, onClose }) => {
    const MR = ({ icon, label, danger:isDanger, onClick }) => (
        <div onClick={() => { onClick(); onClose(); }}
            style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', borderRadius:3,
                cursor:'pointer', color:isDanger?T.danger:T.ink, fontFamily:T.sans }}
            onMouseEnter={e => e.currentTarget.style.background='rgba(200,185,154,0.10)'}
            onMouseLeave={e => e.currentTarget.style.background='transparent'}>
            <span style={{ width:14, textAlign:'center', fontSize:13 }}>{icon}</span>
            <span style={{ fontSize:12.5, fontWeight:500 }}>{label}</span>
        </div>
    );
    return (
        <div style={{ width:192, background:T.surface, border:`1px solid ${T.borderStrong}`, borderRadius:4,
            boxShadow:'0 8px 24px rgba(42,38,34,0.12)', padding:4, position:'relative' }}>
            <div style={{ position:'absolute', top:-6, right:10, width:12, height:12,
                background:T.surface, border:`1px solid ${T.borderStrong}`,
                borderRight:'none', borderBottom:'none', transform:'rotate(45deg)' }}/>
            <MR icon={wh.active?'⏸':'▶'} label={wh.active?'Pause':'Resume'} onClick={onToggle}/>
            <MR icon="🔁" label="Send test event" onClick={() => {}}/>
            <div style={{ height:1, background:T.border, margin:'2px 6px' }}/>
            <MR icon="🗑" label="Delete endpoint" danger onClick={onDelete}/>
        </div>
    );
};

const NewWebhookModal = ({ onClose, onCreated }) => {
    const [step,    setStep]    = React.useState('form'); // form | created
    const [name,    setName]    = React.useState('');
    const [url,     setUrl]     = React.useState('');
    const [checked, setChecked] = React.useState(new Set(['opportunity.stage_changed','opportunity.won']));
    const [saving,  setSaving]  = React.useState(false);
    const [error,   setError]   = React.useState('');
    const [secret,  setSecret]  = React.useState('');
    const [copiedSec, setCopiedSec] = React.useState(false);

    // Event types must match WEBHOOK_EVENTS from webhooks.mjs exactly
    const eventGroups = [
        { group:'Pipeline',  events:['opportunity.created','opportunity.stage_changed','opportunity.won','opportunity.lost'] },
        { group:'Leads',     events:['lead.created','lead.converted'] },
        { group:'Tasks',     events:['task.overdue','task.completed'] },
        { group:'Other',     events:['spiff.claimed'] },
    ];
    const toggle = (ev) => setChecked(p => { const n=new Set(p); n.has(ev)?n.delete(ev):n.add(ev); return n; });
    const inp = { padding:'8px 10px', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:13, color:T.ink, fontFamily:T.sans, outline:'none', width:'100%', boxSizing:'border-box', background:T.surface };

    const handleCreate = async () => {
        if (!name.trim()) { setError('Name is required'); return; }
        if (!url.trim())  { setError('Endpoint URL is required'); return; }
        if (checked.size === 0) { setError('Select at least one event'); return; }
        setSaving(true); setError('');
        try {
            const res  = await dbFetch('/.netlify/functions/webhooks', {
                method: 'POST',
                body: JSON.stringify({ name: name.trim(), targetUrl: url.trim(), eventTypes: [...checked] }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to create');
            setSecret(data.secret || '');
            if (onCreated) onCreated(data.subscription);
            setStep('created');
        } catch (e) {
            setError(e.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <IntModal width={620} onClose={onClose}>
            <IntModalHeader onClose={onClose}
                title={step==='form' ? 'New webhook endpoint' : 'Endpoint created — save your secret'}
                sub={step==='form' ? "Accelerep will POST a signed JSON payload to your URL on each event." : undefined}/>
            <div style={{ flex:1, overflowY:'auto', padding:'18px 22px' }}>
                {step === 'form' ? (
                    <>
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
                            <div>
                                <label style={{ display:'block', fontSize:11, fontWeight:600, color:T.inkMid, marginBottom:4 }}>Name</label>
                                <input value={name} onChange={e=>{setName(e.target.value);setError('');}} placeholder="e.g. Pipeline → Zapier" style={inp} autoFocus/>
                            </div>
                            <div>
                                <label style={{ display:'block', fontSize:11, fontWeight:600, color:T.inkMid, marginBottom:4 }}>Signing</label>
                                <div style={{ ...inp, background:T.surface2, color:T.inkMid, cursor:'default' }}>HMAC-SHA256 (always on)</div>
                            </div>
                        </div>
                        <div style={{ marginBottom:14 }}>
                            <label style={{ display:'block', fontSize:11, fontWeight:600, color:T.inkMid, marginBottom:4 }}>Endpoint URL</label>
                            <input value={url} onChange={e=>{setUrl(e.target.value);setError('');}} placeholder="https://hooks.example.com/accelerep" style={{ ...inp, fontFamily:'ui-monospace,Menlo,monospace', fontSize:12 }}/>
                        </div>
                        <div style={{ fontSize:11, fontWeight:600, color:T.inkMid, marginBottom:8 }}>
                            Events <span style={{ color:T.inkMuted, fontWeight:400 }}>({checked.size} selected)</span>
                        </div>
                        {eventGroups.map(({ group, events }) => (
                            <div key={group} style={{ marginBottom:12 }}>
                                <div style={{ fontSize:10.5, fontWeight:700, color:T.inkMuted, letterSpacing:0.5, textTransform:'uppercase', padding:'5px 0', borderBottom:`1px solid ${T.border}`, marginBottom:4, fontFamily:T.sans }}>{group}</div>
                                {events.map(ev => (
                                    <div key={ev} onClick={()=>toggle(ev)}
                                        style={{ display:'flex', alignItems:'center', gap:10, padding:'7px 4px', cursor:'pointer', borderBottom:`1px solid ${T.border}` }}
                                        onMouseEnter={e=>e.currentTarget.style.background=T.surface2}
                                        onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                                        <span style={{ width:14, height:14, border:`1.5px solid ${checked.has(ev)?T.ok:T.border}`, borderRadius:2, background:checked.has(ev)?T.ok:'transparent', display:'inline-flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                                            {checked.has(ev) && <span style={{ color:'#fff', fontSize:9 }}>✓</span>}
                                        </span>
                                        <span style={{ fontFamily:'ui-monospace,Menlo,monospace', fontSize:12, color:T.ink }}>{ev}</span>
                                    </div>
                                ))}
                            </div>
                        ))}
                        {error && <div style={{ fontSize:12, color:T.danger, marginTop:8, fontFamily:T.sans }}>{error}</div>}
                    </>
                ) : (
                    <>
                        <div style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', background:'rgba(77,107,61,0.08)', border:`1px solid rgba(77,107,61,0.2)`, borderRadius:6, marginBottom:16 }}>
                            <span style={{ fontSize:22, color:T.ok }}>✓</span>
                            <div>
                                <div style={{ fontSize:13.5, fontWeight:700, color:T.ok }}>Endpoint created</div>
                                <div style={{ fontSize:12, color:T.inkMid, marginTop:1 }}>Save your signing secret now — it won't be shown again.</div>
                            </div>
                        </div>
                        <div style={{ background:T.ink, borderRadius:6, padding:'14px 16px', marginBottom:14 }}>
                            <div style={{ fontSize:10, fontWeight:700, color:'rgba(200,185,154,0.7)', letterSpacing:0.6, textTransform:'uppercase', marginBottom:8 }}>Signing secret</div>
                            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                                <code style={{ fontFamily:'ui-monospace,Menlo,monospace', fontSize:11.5, color:'#a8f0c8', wordBreak:'break-all', flex:1 }}>{secret || 'whsec_••••••••••••••••'}</code>
                                <button onClick={() => { navigator.clipboard?.writeText(secret); setCopiedSec(true); setTimeout(()=>setCopiedSec(false),2000); }}
                                    style={{ padding:'5px 12px', background:copiedSec?'rgba(77,107,61,0.5)':'rgba(255,255,255,0.12)', color:'#fbf8f3', border:'1px solid rgba(255,255,255,0.18)', borderRadius:4, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:T.sans, flexShrink:0 }}>
                                    {copiedSec ? '✓ Copied' : 'Copy'}
                                </button>
                            </div>
                        </div>
                        <div style={{ padding:'10px 14px', background:'rgba(184,115,51,0.09)', borderLeft:`3px solid ${T.warn}`, borderRadius:4, fontSize:12, color:T.inkMid, lineHeight:1.5 }}>
                            Verify the <code style={{ fontFamily:'ui-monospace,Menlo,monospace' }}>X-SPT-Signature</code> header on every incoming request.
                            Use HMAC-SHA256(secret, rawBody) and compare with <code>sha256=...</code>.
                        </div>
                    </>
                )}
            </div>
            <IntModalFooter>
                {step === 'form' ? (
                    <>
                        <IntBtn label="Cancel" onClick={onClose}/>
                        <IntBtn label={saving?'Creating…':'Create endpoint'} primary onClick={handleCreate} disabled={saving||!name.trim()||!url.trim()}/>
                    </>
                ) : (
                    <IntBtn label="I've saved it — close" primary onClick={onClose}/>
                )}
            </IntModalFooter>
        </IntModal>
    );
};

export const WebhooksDetail = ({ onBack }) => {
    const [webhooks,  setWebhooks]  = React.useState([]);
    const [loading,   setLoading]   = React.useState(true);
    const [error,     setError]     = React.useState(null);
    const [showModal, setShowModal] = React.useState(false);
    const [activeMenu, setActiveMenu] = React.useState(null);
    const [deleting,  setDeleting]  = React.useState(null);
    const menuRefs = React.useRef({});

    // Load from DB
    const load = React.useCallback(async () => {
        try {
            const res  = await dbFetch('/.netlify/functions/webhooks');
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setWebhooks(data.subscriptions || []);
        } catch (e) { setError(e.message); }
        finally { setLoading(false); }
    }, []);

    React.useEffect(() => { load(); }, []);

    // Outside click closes menu
    React.useEffect(() => {
        if (!activeMenu) return;
        const onDoc = (e) => {
            const btn = document.getElementById('wh-btn-' + activeMenu);
            const menu = document.getElementById('wh-menu-' + activeMenu);
            if (btn && !btn.contains(e.target) && menu && !menu.contains(e.target)) setActiveMenu(null);
        };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [activeMenu]);

    const handleToggle = async (wh) => {
        try {
            const res  = await dbFetch('/.netlify/functions/webhooks', {
                method: 'PUT',
                body: JSON.stringify({ id: wh.id, active: !wh.active }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setWebhooks(prev => prev.map(w => w.id === wh.id ? data.subscription : w));
        } catch (e) { setError(e.message); }
        setActiveMenu(null);
    };

    const handleDelete = async (wh) => {
        setDeleting(wh.id);
        try {
            const res = await dbFetch(`/.netlify/functions/webhooks?id=${wh.id}`, { method: 'DELETE' });
            if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
            setWebhooks(prev => prev.filter(w => w.id !== wh.id));
        } catch (e) { setError(e.message); }
        finally { setDeleting(null); setActiveMenu(null); }
    };

    const fmtDate = (iso) => {
        if (!iso) return '—';
        const d = new Date(iso);
        const diffMin = Math.round((Date.now() - d) / 60000);
        if (diffMin < 1)    return 'just now';
        if (diffMin < 60)   return diffMin + 'm ago';
        if (diffMin < 1440) return Math.round(diffMin/60) + 'h ago';
        return d.toLocaleDateString('en-US', { month:'short', day:'numeric' });
    };

    const activeCount  = webhooks.filter(w => w.active).length;
    const failingCount = webhooks.filter(w => w.active && w.lastStatus && w.lastStatus >= 400).length;

    return (
        <div style={{ fontFamily:T.sans }}>
            {showModal && <NewWebhookModal onClose={() => setShowModal(false)} onCreated={sub => { setWebhooks(prev => [sub, ...prev]); }}/>}
            <IntCrumb page="Webhooks" onBack={onBack}/>
            <IntTitle
                title="Webhooks"
                sub={loading ? 'Loading…' : `${webhooks.length} endpoint${webhooks.length!==1?'s':''} · ${activeCount} active · receive real-time CRM events`}
                actions={[
                    <a key="ref" href="/api-docs.html#webhooks" target="_blank" rel="noopener noreferrer" style={{ textDecoration:'none' }}><IntBtn label="Event reference ↗"/></a>,
                    <IntBtn key="new" label="+ New endpoint" primary onClick={() => setShowModal(true)}/>,
                ]}/>

            {error && <div style={{ padding:'11px 16px', background:'rgba(156,58,46,0.08)', borderLeft:`3px solid ${T.danger}`, borderRadius:4, marginBottom:16, fontSize:12.5, color:T.danger }}>{error}</div>}

            {/* Failing callout */}
            {failingCount > 0 && (
                <div style={{ padding:'12px 16px', background:'rgba(156,58,46,0.07)', borderLeft:`3px solid ${T.danger}`, borderRadius:6, marginBottom:18, display:'flex', alignItems:'center', gap:14 }}>
                    <span style={{ fontSize:18, color:T.danger }}>⚠</span>
                    <div style={{ flex:1 }}>
                        <div style={{ fontSize:13, fontWeight:700, color:T.danger }}>{failingCount} endpoint{failingCount!==1?'s':''} failing</div>
                        <div style={{ fontSize:12, color:T.inkMid, marginTop:2 }}>Check your endpoint URL and verify signatures are being accepted.</div>
                    </div>
                </div>
            )}

            {/* Endpoints table */}
            <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:8, overflow:'hidden', marginBottom:18 }}>
                <div style={{ padding:'12px 16px 8px', borderBottom:`1px solid ${T.border}` }}>
                    <div style={{ fontSize:13.5, fontWeight:700, color:T.ink }}>Endpoints</div>
                </div>
                {/* Column headers */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 200px 120px 120px 90px 36px', gap:8, padding:'8px 16px', background:T.surface2, borderBottom:`1px solid ${T.border}` }}>
                    {['ENDPOINT','EVENTS','LAST FIRED','HTTP STATUS','ACTIVE',''].map((h,i) => (
                        <div key={i} style={{ fontSize:10, fontWeight:700, color:T.inkMuted, letterSpacing:0.6, textTransform:'uppercase', fontFamily:T.sans }}>{h}</div>
                    ))}
                </div>

                {loading ? (
                    <div style={{ padding:'40px', textAlign:'center', color:T.inkMuted, fontSize:13, fontFamily:T.sans }}>Loading endpoints…</div>
                ) : webhooks.length === 0 ? (
                    <div style={{ padding:'48px', textAlign:'center', fontFamily:T.sans }}>
                        <div style={{ fontSize:24, marginBottom:8, opacity:0.3 }}>⚡</div>
                        <div style={{ fontSize:13.5, fontWeight:600, color:T.ink, marginBottom:4 }}>No webhook endpoints yet</div>
                        <div style={{ fontSize:12.5, color:T.inkMuted, marginBottom:16 }}>Create an endpoint to start receiving real-time CRM events.</div>
                        <button onClick={() => setShowModal(true)}
                            style={{ padding:'8px 20px', background:T.ink, color:'#fbf8f3', border:'none', borderRadius:T.r, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>
                            + Create first endpoint
                        </button>
                    </div>
                ) : (
                    webhooks.map((wh, i) => {
                        const isFailing = wh.active && wh.lastStatus && wh.lastStatus >= 400;
                        const isMenuOpen = activeMenu === wh.id;
                        return (
                            <div key={wh.id} style={{ display:'grid', gridTemplateColumns:'1fr 200px 120px 120px 90px 36px', gap:8,
                                padding:'11px 16px', borderBottom:i<webhooks.length-1?`1px solid ${T.border}`:'none',
                                alignItems:'center', background:isFailing?'rgba(156,58,46,0.03)':'transparent',
                                opacity:deleting===wh.id?0.5:1, position:'relative' }}>
                                {/* Name + URL */}
                                <div>
                                    <div style={{ fontSize:13, fontWeight:600, color:T.ink }}>{wh.name}</div>
                                    <div style={{ fontFamily:'ui-monospace,Menlo,monospace', fontSize:10.5, color:T.inkMuted, marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{wh.targetUrl}</div>
                                </div>
                                {/* Event types */}
                                <div style={{ display:'flex', flexWrap:'wrap', gap:3 }}>
                                    {(wh.eventTypes||[]).slice(0,2).map(ev => (
                                        <span key={ev} style={{ padding:'1px 5px', borderRadius:3, background:'rgba(58,90,122,0.09)', color:T.info, fontSize:10, fontFamily:'ui-monospace,Menlo,monospace' }}>{ev}</span>
                                    ))}
                                    {(wh.eventTypes||[]).length > 2 && <span style={{ fontSize:10, color:T.inkMuted }}>+{wh.eventTypes.length-2}</span>}
                                </div>
                                {/* Last fired */}
                                <div style={{ fontSize:12, color:T.inkMid }}>{fmtDate(wh.lastFiredAt)}</div>
                                {/* Last HTTP status */}
                                <div>
                                    {wh.lastStatus ? (
                                        <span style={{ fontFamily:'ui-monospace,Menlo,monospace', fontSize:12, fontWeight:700,
                                            color: wh.lastStatus < 300 ? T.ok : wh.lastStatus < 500 ? T.warn : T.danger }}>
                                            {wh.lastStatus}
                                        </span>
                                    ) : <span style={{ color:T.inkMuted, fontSize:12 }}>—</span>}
                                </div>
                                {/* Active toggle */}
                                <div onClick={() => handleToggle(wh)}
                                    style={{ width:30, height:18, borderRadius:9, background:wh.active?T.ok:T.border, position:'relative', cursor:'pointer', transition:'background 120ms', flexShrink:0 }}>
                                    <span style={{ position:'absolute', top:2, left:wh.active?14:2, width:14, height:14, borderRadius:'50%', background:'#fbf8f3', boxShadow:'0 1px 2px rgba(0,0,0,0.15)', transition:'left 100ms' }}/>
                                </div>
                                {/* ⋯ menu */}
                                <div style={{ position:'relative' }}>
                                    <button id={'wh-btn-' + wh.id}
                                        onClick={() => setActiveMenu(isMenuOpen ? null : wh.id)}
                                        style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:24, height:24, borderRadius:3, fontSize:16, fontWeight:700, border:'none', cursor:'pointer', lineHeight:1, color:isMenuOpen?T.goldInk:T.inkMuted, background:isMenuOpen?'rgba(200,185,154,0.30)':'transparent' }}>⋯</button>
                                    {isMenuOpen && (
                                        <div id={'wh-menu-' + wh.id} style={{ position:'absolute', right:0, ...(i >= webhooks.length - 3 ? { bottom:'100%', marginBottom:4 } : { top:'100%', marginTop:4 }), zIndex:100 }}>
                                            <WebhookRowMenu wh={wh} onClose={() => setActiveMenu(null)} onToggle={() => handleToggle(wh)} onDelete={() => handleDelete(wh)}/>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* Security note */}
            <div style={{ padding:'12px 16px', background:'rgba(58,90,122,0.07)', borderLeft:`3px solid ${T.info}`, borderRadius:4, fontSize:12.5, color:T.inkMid, lineHeight:1.6 }}>
                <b style={{ color:T.info }}>Signature verification:</b> Every request includes <code style={{ fontFamily:'ui-monospace,Menlo,monospace' }}>X-SPT-Signature: sha256=...</code> and <code style={{ fontFamily:'ui-monospace,Menlo,monospace' }}>X-SPT-Event</code> headers.
                Compute HMAC-SHA256(secret, rawBody) and compare to verify authenticity. <a href="/api-docs.html#wh-verify" target="_blank" style={{ color:T.info }}>See verification guide →</a>
            </div>
        </div>
    );
};
