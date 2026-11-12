// settings/integrations/WebhooksDetail.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useLocalLayer } from '../../../hooks/useLocalLayer';
import { dbFetch, requestOrg, stillOrg } from '../../../utils/storage';
import { readRefusal, failureWords } from '../../../utils/refusalWords.js';
import { T } from '../shared/tokens.js';
import { IntCrumb, IntTitle, IntBtn, IntModal, IntModalHeader, IntModalFooter, MenuRow, useRowMenu } from './shared.jsx';

const WebhookRowMenu = ({ wh, onToggle, onDelete, onClose }) => {
    return (
        <div style={{ width:192, background:T.surface, border:`1px solid ${T.borderStrong}`, borderRadius:4,
            boxShadow:'0 8px 24px rgba(42,38,34,0.12)', padding:4, position:'relative' }}>
            <MenuRow icon={wh.active?'⏸':'▶'} label={wh.active?'Pause':'Resume'} onClick={onToggle} onClose={onClose}/>
            <MenuRow icon="🔁" label="Send test event" onClick={() => {}} onClose={onClose}/>
            <div style={{ height:1, background:T.border, margin:'2px 6px' }}/>
            <MenuRow icon="🗑" label="Delete endpoint" danger onClick={onDelete} onClose={onClose}/>
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

    // One close for Escape, the backdrop, × and Cancel (state §0.232): a name, a URL or an event changed asks "Discard
    // changes?"; nothing while it is created, nor once the signing secret shows — it closes only by "I've saved it".
    const requestClose = useLocalLayer(true, { onClose, dirty: step === 'form' && (!!(name.trim() || url.trim()) || [...checked].sort().join() !== 'opportunity.stage_changed,opportunity.won'), busy: saving || step !== 'form' });
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
        const askedOrg = requestOrg();   // after an org switch its answer changes nothing (state §0.175)
        try {
            const res  = await dbFetch('/.netlify/functions/webhooks', {
                method: 'POST',
                body: JSON.stringify({ name: name.trim(), targetUrl: url.trim(), eventTypes: [...checked] }),
            });
            // The ok check first (§0.243): a refusal reads its words (else its status), the endpoint's answer is parsed
            // as sent — then the org is checked, after every read, before anything is done.
            const why  = res.ok ? '' : await readRefusal(res);
            // The server answers 201 { webhook, secret } (webhooks.mjs POST). It was read as `subscription` from 11 May 2026
            // (5772f63) to §0.247: the list took undefined and its next draw threw (Jeff, 12 Nov: "Fix in this batch
            // (Recommended)"). Landed is landed: an answer that cannot be read, or names no endpoint, is still an endpoint
            // made — never Create again (a second one); the list is read again and a secret not read is said so.
            const data = res.ok ? await res.json().catch(() => null) : null;
            if (!stillOrg(askedOrg)) return;
            if (why) throw new Error(why);
            setSecret(typeof data?.secret === 'string' ? data.secret : '');
            if (onCreated) onCreated(data && data.webhook && data.webhook.id ? data.webhook : null);
            setStep('created');
        } catch (e) {
            setError(failureWords(e));
        } finally {
            setSaving(false);
        }
    };

    return (
        <IntModal width={620} onClose={requestClose}>
            <IntModalHeader onClose={requestClose}
                title={step==='form' ? 'New webhook endpoint' : secret ? 'Endpoint created — save your secret' : 'Endpoint created'}
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
                                <div style={{ fontSize:12, color:T.inkMid, marginTop:1 }}>{secret ? "Save your signing secret now — it won't be shown again." : 'Its signing secret could not be read.'}</div>
                            </div>
                        </div>
                        {/* A secret the answer did not give is said, never a placeholder to "save" (§0.247): it is not shown again. */}
                        {!secret ? (
                            <div role="alert" style={{ padding:'10px 14px', background:'rgba(156,58,46,0.08)', borderLeft:`3px solid ${T.danger}`, borderRadius:4, marginBottom:14, fontSize:12.5, color:T.danger, lineHeight:1.5 }}>
                                The endpoint was created, but its signing secret could not be read, and it is not shown again. Delete this endpoint and create it again to get a new secret.
                            </div>
                        ) : (
                        <div style={{ background:T.ink, borderRadius:6, padding:'14px 16px', marginBottom:14 }}>
                            <div style={{ fontSize:10, fontWeight:700, color:'rgba(200,185,154,0.7)', letterSpacing:0.6, textTransform:'uppercase', marginBottom:8 }}>Signing secret</div>
                            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                                <code style={{ fontFamily:'ui-monospace,Menlo,monospace', fontSize:11.5, color:'#a8f0c8', wordBreak:'break-all', flex:1 }}>{secret}</code>
                                <button onClick={() => { navigator.clipboard?.writeText(secret); setCopiedSec(true); setTimeout(()=>setCopiedSec(false),2000); }}
                                    style={{ padding:'5px 12px', background:copiedSec?'rgba(77,107,61,0.5)':'rgba(255,255,255,0.12)', color:'#fbf8f3', border:'1px solid rgba(255,255,255,0.18)', borderRadius:4, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:T.sans, flexShrink:0 }}>
                                    {copiedSec ? '✓ Copied' : 'Copy'}
                                </button>
                            </div>
                        </div>
                        )}
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
                        <IntBtn label="Cancel" onClick={requestClose}/>
                        <IntBtn label={saving?'Creating…':'Create endpoint'} primary onClick={handleCreate} disabled={saving||!name.trim()||!url.trim()}/>
                    </>
                ) : (
                    <IntBtn label={secret ? "I've saved it — close" : 'Close'} primary onClick={onClose}/>
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
    const { activeMenu, setActiveMenu, menuAt, toggleMenu } = useRowMenu('wh-btn-', 'wh-menu-');
    const [deleting,  setDeleting]  = React.useState(null);
    const menuRefs = React.useRef({});

    // Load from DB
    // A list that could not be read is no "0 endpoints" or "No webhook endpoints yet" (state §0.247,
    // docs/design/refusal-sweep Part 9): its counts read "—" until a load lands, after the banner's Close too.
    const [loadFailed, setLoadFailed] = React.useState(false);
    const load = React.useCallback(async () => {
        try {
            const res  = await dbFetch('/.netlify/functions/webhooks');
            if (!res.ok) throw new Error(await readRefusal(res));   // the server's words, else its status (§0.243)
            const data = await res.json();
            // The server's answer (webhooks.mjs GET) is { webhooks: [...], supportedEvents }. It was read as `subscriptions`
            // from 11 May 2026 (5772f63) to §0.247, so no endpoint was ever listed (Jeff, 12 Nov: "Fix in this batch
            // (Recommended)"). An answer without the list is a read that failed, never "No webhook endpoints yet" — thrown with
            // no words of its own, so failureWords says "Its answer could not be read."
            if (!Array.isArray(data?.webhooks)) throw new Error('');
            setWebhooks(data.webhooks);
            setLoadFailed(false);
        } catch (e) { setError(failureWords(e)); setLoadFailed(true); }
        finally { setLoading(false); }
    }, []);

    React.useEffect(() => { load(); }, []);

    // One request per endpoint at a time (§0.247 review fix): a Pause / Resume or Delete pressed while its endpoint's
    // request is out sends nothing — a second Delete said "Webhook not found." beside an endpoint the first had deleted.
    // The ref is the synchronous guard; busyIds draws it — the toggle waits, titled "Saving…", while its request is out.
    // The menu closes at the press, never when an answer lands (that closed a menu opened on another row meanwhile).
    const busyHooks = React.useRef(new Set());
    const [busyIds, setBusyIds] = React.useState([]);
    const handleToggle = async (wh) => {
        setActiveMenu(null);
        if (busyHooks.current.has(wh.id)) return;
        busyHooks.current.add(wh.id);
        setBusyIds([...busyHooks.current]);
        try {
            const res  = await dbFetch('/.netlify/functions/webhooks', {
                method: 'PUT',
                body: JSON.stringify({ id: wh.id, active: !wh.active }),
            });
            if (!res.ok) throw new Error(await readRefusal(res));
            // Landed is landed (§0.247 review fix): the PUT answers { success: true } (newSecret when rotated) and never a
            // row (webhooks.mjs), and the row became undefined — the next draw threw. Its body is not read (Jeff, 12 Nov:
            // "Fix in this batch (Recommended)" — the key it looked for is not the server's); the row as it is now takes
            // the flag, so a 200 whose body is not JSON is landed too.
            setWebhooks(prev => prev.map(w => w.id === wh.id ? { ...w, active: !wh.active } : w));
        } catch (e) { setError(failureWords(e)); }
        finally { busyHooks.current.delete(wh.id); setBusyIds([...busyHooks.current]); }
    };

    const handleDelete = async (wh) => {
        setActiveMenu(null);
        if (busyHooks.current.has(wh.id)) return;
        busyHooks.current.add(wh.id);
        setBusyIds([...busyHooks.current]);
        setDeleting(wh.id);
        try {
            const res = await dbFetch(`/.netlify/functions/webhooks?id=${wh.id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error(await readRefusal(res));
            setWebhooks(prev => prev.filter(w => w.id !== wh.id));
        } catch (e) { setError(failureWords(e)); }
        finally { busyHooks.current.delete(wh.id); setBusyIds([...busyHooks.current]); setDeleting(null); }
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
            {/* An endpoint made whose answer names none (or cannot be read): the list is read again, never handed undefined (§0.247). */}
            {showModal && <NewWebhookModal onClose={() => setShowModal(false)} onCreated={wh => { if (wh && !loadFailed) setWebhooks(prev => [wh, ...prev]); else load(); }}/>}
            <IntCrumb page="Webhooks" onBack={onBack}/>
            <IntTitle
                title="Webhooks"
                sub={loading ? 'Loading…' : loadFailed ? '— endpoints · — active · receive real-time CRM events' : `${webhooks.length} endpoint${webhooks.length!==1?'s':''} · ${activeCount} active · receive real-time CRM events`}
                actions={[
                    <a key="ref" href="/api-docs.html#webhooks" target="_blank" rel="noopener noreferrer" style={{ textDecoration:'none' }}><IntBtn label="Event reference ↗"/></a>,
                    <IntBtn key="new" label="+ New endpoint" primary onClick={() => setShowModal(true)}/>,
                ]}/>

            {/* Kept until its Close (§18b123 rule 4; §0.247 Part 8), never on a timer. */}
            {error && (
                <div role="alert" style={{ display:'flex', alignItems:'flex-start', gap:12, padding:'11px 16px', background:'rgba(156,58,46,0.08)', borderLeft:`3px solid ${T.danger}`, borderRadius:4, marginBottom:16, fontSize:12.5, color:T.danger }}>
                    <span style={{ flex:1, minWidth:0 }}>{error}</span>
                    <button onClick={() => setError(null)}
                        style={{ fontSize:11, color:T.inkMid, background:'none', border:'none', cursor:'pointer', fontWeight:600, fontFamily:T.sans, padding:0 }}>
                        Close
                    </button>
                </div>
            )}

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
                ) : webhooks.length === 0 && loadFailed ? (
                    <div style={{ padding:'40px', textAlign:'center', color:T.inkMuted, fontSize:13, fontFamily:T.sans }}>The endpoints could not be read. Reload the page to try again.</div>
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
                        const isBusy = busyIds.includes(wh.id);   // its Pause / Resume or Delete is out (§0.247 review fix)
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
                                <div onClick={() => handleToggle(wh)} aria-disabled={isBusy} title={isBusy ? 'Saving…' : undefined}
                                    style={{ width:30, height:18, borderRadius:9, background:wh.active?T.ok:T.border, position:'relative', cursor:isBusy?'not-allowed':'pointer', opacity:isBusy?0.5:1, transition:'background 120ms', flexShrink:0 }}>
                                    <span style={{ position:'absolute', top:2, left:wh.active?14:2, width:14, height:14, borderRadius:'50%', background:'#fbf8f3', boxShadow:'0 1px 2px rgba(0,0,0,0.15)', transition:'left 100ms' }}/>
                                </div>
                                {/* ⋯ menu */}
                                <div style={{ position:'relative' }}>
                                    <button id={'wh-btn-' + wh.id}
                                        onClick={(e) => toggleMenu(e, wh.id)}
                                        style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:24, height:24, borderRadius:3, fontSize:16, fontWeight:700, border:'none', cursor:'pointer', lineHeight:1, color:isMenuOpen?T.goldInk:T.inkMuted, background:isMenuOpen?'rgba(200,185,154,0.30)':'transparent' }}>⋯</button>
                                    {isMenuOpen && (
                                        <div id={'wh-menu-' + wh.id} style={{ position:'fixed', ...(menuAt || {}), zIndex:100 }}>
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
