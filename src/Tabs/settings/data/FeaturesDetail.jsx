// settings/data/FeaturesDetail.jsx
import React, { useState, useEffect } from 'react';
import { dbFetch } from '../../../utils/storage';
import { T } from '../shared/tokens.js';
import { DataCard, DataCrumb, DataTitle, DataBtn, DataModal, DataModalHead, DataModalFoot } from './shared.jsx';

const FLAG_DEFS = [
    { id:'deal-scoring',      name:'Deal scoring',           desc:'Health score (0–100) on every opportunity based on activity, stage age, and close date.',   beta:false, new:false, live:true  },
    { id:'account-health-scores', name:'Account health scores', desc:'Aggregate health score per account rolled up from open opportunities.',                  beta:false, new:false, live:true  },
    { id:'territory-rules',   name:'Territory rules engine', desc:'Auto-assign accounts and opportunities to territories on create/update.',                    beta:false, new:false, live:true  },
    { id:'commit-categories', name:'Commit categories',      desc:'Pipeline / Best Case / Commit / Omit forecast buckets on every opportunity.',               beta:false, new:false, live:true  },
    { id:'writing-assist',    name:'Writing assist',         desc:'AI-assisted text drafting in notes, emails, and descriptions.',                             beta:true,  new:false, live:false },
    { id:'duplicate-merge',   name:'Smart duplicate merge',  desc:'Fuzzy match on account/contact create with merge UI to resolve conflicts.',                 beta:true,  new:false, live:false },
    { id:'meeting-summaries', name:'Meeting summaries',      desc:'Auto-summarize Zoom/Teams calls and post to the related record.',                           beta:true,  new:false, live:false },
    { id:'sentiment',         name:'Email sentiment',        desc:'Score reply sentiment on incoming email threads.',                                           beta:true,  new:true,  live:false },
    { id:'forecast-roll',     name:'Forecast rollup',        desc:'Hierarchical forecast with manager overrides and commit/best-case roll-up.',                beta:false, new:false, live:false },
    { id:'lead-routing',      name:'Lead routing',           desc:'Round-robin and skill-based lead distribution rules.',                                       beta:false, new:false, live:false },
    { id:'mobile-offline',    name:'Mobile offline mode',    desc:'Cache and sync recent records on iOS/Android when offline.',                                beta:false, new:false, live:false },
    { id:'mobile-voice',      name:'Mobile voice notes',     desc:'Dictate notes on the go with auto-transcription.',                                          beta:false, new:true,  live:false },
    { id:'quote-redlines',    name:'Quote redlines',         desc:'Track legal redline rounds on quote PDFs.',                                                  beta:false, new:false, live:false },
    { id:'esign-bulk',        name:'Bulk e-sign',            desc:'Send the same agreement to many counterparties at once.',                                   beta:false, new:false, live:false },
    { id:'public-api-v2',     name:'Public API v2',          desc:'New REST + webhooks; v1 deprecation in 90 days.',                                           beta:true,  new:false, live:false },
    { id:'graphql',           name:'GraphQL endpoint',       desc:'Read-only GraphQL on top of the v2 API.',                                                   beta:true,  new:false, live:false },
    { id:'audit-streaming',   name:'Audit log streaming',    desc:'Push audit events to Splunk / Datadog / S3.',                                               beta:false, new:false, live:false },
    { id:'workflows-loops',   name:'Workflow loops',         desc:'For-each automation steps over record collections.',                                         beta:true,  new:false, live:false },
];

const ResetAiModal = ({ onClose }) => {
    const [confirm, setConfirm] = useState('');
    const [notify, setNotify]   = useState(true);
    const ready = confirm.trim().toUpperCase() === 'RESET';
    return (
        <DataModal width={540} onClose={onClose}>
            <DataModalHead onClose={onClose}
                title={<span style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <span style={{ width:32, height:32, borderRadius:4, background:'rgba(156,58,46,0.12)', color:T.danger, display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:16, fontWeight:700, flexShrink:0 }}>⚠</span>
                    Reset AI training data?
                </span>}
                sub="Permanently delete this workspace's prompts and outputs from the AI provider."/>
            <div style={{ flex:1, overflowY:'auto', padding:22 }}>
                <div style={{ background:T.surface2, border:`1px solid ${T.border}`, borderRadius:4, padding:'12px 14px', marginBottom:14, fontSize:12 }}>
                    {[
                        { label:'Workspace',       value:'accelerep · acme', mono:true },
                        { label:'Records to purge',value:'~84,200 prompts / outputs', bold:true },
                        { label:'Provider',        value:'Anthropic · Claude Sonnet 4.5', mono:true },
                        { label:'SLA',             value:'Up to 30 days to propagate' },
                    ].map((r,i) => (
                        <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: i<3?5:0 }}>
                            <span style={{ color:T.inkMid }}>{r.label}</span>
                            <span style={{ fontFamily:r.mono?'ui-monospace,Menlo,monospace':'inherit', fontWeight:r.bold?600:400, color:T.ink }}>{r.value}</span>
                        </div>
                    ))}
                </div>
                <div style={{ padding:'10px 12px', background:'rgba(156,58,46,0.08)', borderLeft:`3px solid ${T.danger}`, borderRadius:3, marginBottom:14, fontSize:12 }}>
                    <span style={{ fontWeight:700, color:T.danger }}>This cannot be undone.</span>
                    <span style={{ color:T.inkMid }}> Past AI suggestions referenced from records will continue to display, but the underlying training corpus will be erased.</span>
                </div>
                <div style={{ marginBottom:12 }}>
                    <label style={{ display:'block', fontSize:12, fontWeight:600, color:T.inkMid, marginBottom:6 }}>
                        Type <b style={{ fontFamily:'ui-monospace,Menlo,monospace', color:T.ink }}>RESET</b> to confirm
                    </label>
                    <input value={confirm} onChange={e=>setConfirm(e.target.value)} placeholder="RESET"
                        style={{ width:'100%', padding:'8px 10px', border:`1.5px solid ${ready?T.danger:T.border}`, borderRadius:T.r, fontSize:13, color:T.ink, fontFamily:'ui-monospace,Menlo,monospace', outline:'none', background:T.surface, boxSizing:'border-box' }}/>
                </div>
                <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:12.5, cursor:'pointer' }} onClick={()=>setNotify(v=>!v)}>
                    <span style={{ width:14, height:14, border:`1.5px solid ${notify?T.ok:T.border}`, borderRadius:2, background:notify?T.ok:'transparent', display:'inline-flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                        {notify && <span style={{ color:'#fff', fontSize:9 }}>✓</span>}
                    </span>
                    Open a tracking ticket and email the workspace owner
                </label>
            </div>
            <DataModalFoot>
                <DataBtn label="Cancel" onClick={onClose}/>
                <DataBtn label="Request reset" danger disabled={!ready} onClick={()=>{ if(ready) onClose(); }}/>
            </DataModalFoot>
        </DataModal>
    );
};

const FL = ({ label, children }) => (<div><label style={{ display:'block', fontSize:11.5, fontWeight:600, color:T.inkMid, marginBottom:5, fontFamily:T.sans }}>{label}</label>{children}</div>);

export const FeaturesDetail = ({ settings, setSettings, onBack, setSettingsDirty, settingsSaveRef }) => {
    const [flags,      setFlags]      = React.useState({});      // { [flagId]: boolean }
    const [tabViz,     setTabViz]     = React.useState({ leadsEnabled: true, quotesEnabled: true, dispatchEnabled: false });
    const [aiSettings, setAiSettings] = React.useState({});
    const [loading,    setLoading]    = React.useState(true);
    const [saving,     setSaving]     = React.useState(false);
    const [dirty,      setDirty]      = React.useState(false);
    const [showReset,  setShowReset]  = React.useState(false);
    const [error,      setError]      = React.useState(null);
    const [filterCat,  setFilterCat]  = React.useState('All');


    // ── Initialise from settings prop (same pattern as all other panels) ───────
    const AI_DEFAULTS = {
        model: 'claude-sonnet-4-6',
        fallback: 'claude-haiku-4-5-20251001',
        region: 'US · us-east-2',
        tokenBudget: 25000000,
        trainingOptIn: false,
        zeroRetention: true,
        piiRedaction: true,
        byok: false,
        byokProvider: '',
        dpaSignedAt: '',
        auditLogging: 'All AI requests · 13mo retention',
        blockList: '',
        budgetExceed: 'Throttle to 1 req/s',
        availableTo: 'All roles',
    };
    React.useEffect(() => {
        if (!settings) return;
        // Don't overwrite local state while user has unsaved changes
        if (!dirty) {
            setFlags(settings.featureFlags || {});
            setTabViz({
                leadsEnabled:   settings.leadsEnabled  !== false,
                quotesEnabled:  settings.quotesEnabled !== false,
                dispatchEnabled: settings.dispatchEnabled === true,
            });
            setAiSettings(settings.aiSettings || AI_DEFAULTS);
        }
        setLoading(false);
    }, [settings]);

    // ── Toggle a flag — marks dirty, saved via Save changes button ──────────────
    const handleToggle = (flagId, isLive) => {
        if (!isLive) return; // coming-soon flags are not togglable
        setFlags(prev => ({ ...prev, [flagId]: !(prev[flagId] !== false) }));
        setDirty(true);
    };

    // ── Toggle tab visibility — marks dirty, saved via Save changes button ──────
    const handleTabVizToggle = (key) => {
        setTabViz(prev => ({ ...prev, [key]: !prev[key] }));
        setDirty(true);
    };

    // ── Save all — AI settings + feature flags + tab visibility ─────────────────
    const handleSaveAi = async () => {
        setSaving(true);
        try {
            const res = await dbFetch('/.netlify/functions/settings', {
                method: 'PUT',
                body: JSON.stringify({
                    aiSettings,
                    featureFlags: flags,
                    leadsEnabled:   tabViz.leadsEnabled,
                    quotesEnabled:  tabViz.quotesEnabled,
                    dispatchEnabled: tabViz.dispatchEnabled,
                }),
            });
            if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
            setSettings(prev => ({
                ...prev,
                aiSettings,
                featureFlags: flags,
                leadsEnabled:   tabViz.leadsEnabled,
                quotesEnabled:  tabViz.quotesEnabled,
                dispatchEnabled: tabViz.dispatchEnabled,
            }));
            setDirty(false);
        } catch (e) {
            setError('Failed to save: ' + e.message);
        } finally {
            setSaving(false);
        }
    };
    // Sync dirty state to app-level nav guard
    React.useEffect(() => { if (setSettingsDirty) setSettingsDirty(dirty); return () => { if (setSettingsDirty) setSettingsDirty(false); }; }, [dirty]);
    React.useEffect(() => {
        if (!settingsSaveRef) return;
        settingsSaveRef.current = dirty ? handleSaveAi : null;
        return () => { if (settingsSaveRef) settingsSaveRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dirty]);

    // ── Export config ─────────────────────────────────────────
    const handleExportConfig = () => {
        const payload = JSON.stringify({ featureFlags: flags, aiSettings }, null, 2);
        const blob = new Blob([payload], { type: 'application/json' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url; a.download = 'accelerep-feature-config.json';
        document.body.appendChild(a); a.click();
        document.body.removeChild(a); URL.revokeObjectURL(url);
    };

    const isOn = (flagId) => flags[flagId] !== false;
    const onCount  = FLAG_DEFS.filter(f => isOn(f.id)).length;
    const betaOn   = FLAG_DEFS.filter(f => f.beta && isOn(f.id)).length;
    const aiRegion = aiSettings.region || 'US · us-east-2';

    const selSt = { width:'100%', padding:'8px 10px', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:13, color:T.ink, fontFamily:T.sans, outline:'none', background:T.surface, appearance:'none', cursor:'pointer' };
    const inpSt = { width:'100%', padding:'8px 10px', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:13, color:T.ink, fontFamily:'ui-monospace,Menlo,monospace', outline:'none', background:T.surface, boxSizing:'border-box' };

    const CAT_FILTERS = ['All', 'Live', 'Coming soon', 'Beta'];
    const visibleFlags = FLAG_DEFS.filter(f => {
        if (filterCat === 'Live')        return f.live;
        if (filterCat === 'Coming soon') return !f.live;
        if (filterCat === 'Beta')        return f.beta;
        return true;
    });

    if (loading) return (
        <div style={{ fontFamily:T.sans }}>
            <DataCrumb page="Features & AI" onBack={onBack}/>
            <div style={{ padding:'60px 0', textAlign:'center', color:T.inkMuted, fontSize:13 }}>Loading…</div>
        </div>
    );

    return (
        <div style={{ fontFamily:T.sans }}>
            {showReset && <ResetAiModal onClose={() => setShowReset(false)}/>}

            <DataCrumb page="Features & AI" onBack={onBack}/>
            <DataTitle
                title="Features & AI"
                sub="App-wide feature flags and AI controls (model, Residency, Training, redaction)"
                badge={`${onCount} of ${FLAG_DEFS.length} on · AI · ${aiRegion}`}
                dirty={dirty}
                actions={[
                    <DataBtn key="exp" label="Export config" onClick={handleExportConfig}/>,
                    <DataBtn key="sav" label={saving ? 'Saving…' : 'Save changes'} primary disabled={saving || !dirty} onClick={handleSaveAi}/>,
                ]}
            />

            {error && (
                <div style={{ padding:'11px 16px', background:'rgba(156,58,46,0.08)', borderLeft:`3px solid ${T.danger}`, borderRadius:4, marginBottom:16, fontSize:12.5, color:T.danger }}>{error}</div>
            )}

            {betaOn > 0 && (
                <div style={{ padding:'11px 16px', background:'rgba(58,90,122,0.08)', borderLeft:`3px solid ${T.info}`, borderRadius:4, marginBottom:16, fontSize:12.5, color:T.inkMid }}>
                    <b style={{ color:T.info }}>Beta features active.</b> Workspace has {betaOn} beta flag{betaOn>1?'s':''} enabled. Behavior may change between releases.
                </div>
            )}

            {/* ── Tab visibility ── */}
            <DataCard title="Tab visibility" desc="Show or hide top-level navigation tabs for all users in this workspace.">
                {[
                    { key: 'leadsEnabled',   name: 'Leads tab',     desc: 'Show the Leads tab in the top navigation bar.' },
                    { key: 'quotesEnabled',  name: 'Quotes tab',    desc: 'Show the Quotes tab in the top navigation bar.' },
                    { key: 'dispatchEnabled', name: 'Dispatch tab',  desc: 'Show the Dispatch scheduling tab. For field-service businesses that dispatch technicians to jobs.' },
                ].map((item, i, arr) => {
                    const on = tabViz[item.key];
                    return (
                        <div key={item.key} style={{ display:'flex', alignItems:'center', gap:14, padding:'12px 0', borderBottom: i < arr.length-1 ? `1px solid ${T.border}` : 'none' }}>
                            <div onClick={() => handleTabVizToggle(item.key)}
                                style={{ width:30, height:18, borderRadius:9, background: on ? T.ok : T.border, position:'relative', flexShrink:0, cursor:'pointer', transition:'background 120ms' }}>
                                <span style={{ position:'absolute', top:2, left: on ? 14 : 2, width:14, height:14, borderRadius:'50%', background:'#fbf8f3', boxShadow:'0 1px 2px rgba(0,0,0,0.15)', transition:'left 100ms' }}/>
                            </div>
                            <div style={{ flex:1 }}>
                                <div style={{ fontSize:13, fontWeight:600, color:T.ink, fontFamily:T.sans, display:'flex', alignItems:'center', gap:6 }}>
                                    {item.name}
                                    <span style={{ padding:'1px 6px', borderRadius:10, background:'rgba(77,107,61,0.12)', color:T.ok, fontSize:10.5, fontWeight:700 }}>Live</span>
                                </div>
                                <div style={{ fontSize:11.5, color:T.inkMuted, marginTop:2, fontFamily:T.sans }}>{item.desc}</div>
                            </div>
                            <div style={{ fontSize:11, color:T.inkMid, fontFamily:'ui-monospace,Menlo,monospace', textAlign:'right', minWidth:80 }}>
                                {on ? 'Visible' : 'Hidden'}
                            </div>
                        </div>
                    );
                })}
            </DataCard>

            {/* ── Feature flags ── */}
            <DataCard title={`Feature flags (${onCount} / ${FLAG_DEFS.length} on)`} desc="Toggle workspace-wide features. Live flags take effect immediately. Coming soon flags are stored but not yet active.">
                <div style={{ display:'flex', gap:6, marginBottom:12 }}>
                    {CAT_FILTERS.map(cat => (
                        <span key={cat} onClick={() => setFilterCat(cat)}
                            style={{ padding:'4px 10px', borderRadius:3, background:filterCat===cat?T.ink:T.surface2, color:filterCat===cat?'#fbf8f3':T.inkMid, fontSize:11.5, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>
                            {cat}
                        </span>
                    ))}
                </div>
                {visibleFlags.map((flag, i) => {
                    const on = isOn(flag.id);
                    return (
                        <div key={flag.id} style={{ display:'flex', alignItems:'center', gap:14, padding:'12px 0', borderBottom: i < visibleFlags.length-1 ? `1px solid ${T.border}` : 'none', opacity: flag.live ? 1 : 0.72 }}>
                            {/* Toggle — disabled for coming-soon */}
                            <div onClick={() => handleToggle(flag.id, flag.live)} title={flag.live ? (on ? 'Click to disable' : 'Click to enable') : 'Coming soon'}
                                style={{ width:30, height:18, borderRadius:9, background: on ? (flag.live ? T.ok : T.border) : T.border, position:'relative', flexShrink:0, cursor: flag.live ? 'pointer' : 'not-allowed', transition:'background 120ms' }}>
                                <span style={{ position:'absolute', top:2, left: on ? 14 : 2, width:14, height:14, borderRadius:'50%', background:'#fbf8f3', boxShadow:'0 1px 2px rgba(0,0,0,0.15)', transition:'left 100ms' }}/>
                            </div>
                            <div style={{ flex:1 }}>
                                <div style={{ fontSize:13, fontWeight:600, color:T.ink, fontFamily:T.sans, display:'flex', alignItems:'center', gap:6 }}>
                                    {flag.name}
                                    {flag.live && <span style={{ padding:'1px 6px', borderRadius:10, background:'rgba(77,107,61,0.12)', color:T.ok, fontSize:10.5, fontWeight:700 }}>Live</span>}
                                    {!flag.live && <span style={{ padding:'1px 6px', borderRadius:10, background:'rgba(138,131,120,0.12)', color:T.inkMuted, fontSize:10.5, fontWeight:700 }}>Coming soon</span>}
                                    {flag.beta && <span style={{ padding:'1px 6px', borderRadius:10, background:'rgba(58,90,122,0.10)', color:T.info, fontSize:10.5, fontWeight:700 }}>Beta</span>}
                                    {flag.new  && <span style={{ padding:'1px 6px', borderRadius:10, background:'rgba(184,115,51,0.10)', color:T.warn, fontSize:10.5, fontWeight:700 }}>New</span>}
                                </div>
                                <div style={{ fontSize:11.5, color:T.inkMuted, marginTop:2, fontFamily:T.sans }}>{flag.desc}</div>
                            </div>
                            <div style={{ fontSize:11, color:T.inkMid, fontFamily:'ui-monospace,Menlo,monospace', textAlign:'right', minWidth:80 }}>
                                {flag.live ? (on ? 'Enabled' : 'Disabled') : '—'}
                            </div>
                        </div>
                    );
                })}
            </DataCard>

            {/* ── AI model & access ── */}
            <DataCard title="AI · Model & access" desc="Which model powers AI features and which roles can use them.">
                <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:16 }}>
                    <FL label="Model">
                        <select style={selSt} value={aiSettings.model || 'claude-sonnet-4-6'} onChange={e => { setAiSettings(p => ({...p, model:e.target.value})); setDirty(true); }}>
                            <option value="claude-sonnet-4-6">claude-sonnet-4-6</option>
                            <option value="claude-opus-4-6">claude-opus-4-6</option>
                            <option value="claude-haiku-4-5-20251001">claude-haiku-4-5-20251001</option>
                        </select>
                    </FL>
                    <FL label="Fallback">
                        <select style={selSt} value={aiSettings.fallback || 'claude-haiku-4-5-20251001'} onChange={e => { setAiSettings(p => ({...p, fallback:e.target.value})); setDirty(true); }}>
                            <option value="claude-haiku-4-5-20251001">claude-haiku-4-5-20251001</option>
                            <option value="claude-sonnet-4-6">claude-sonnet-4-6</option>
                        </select>
                    </FL>
                    <FL label="Available to">
                        <select style={selSt} value={aiSettings.availableTo || 'All roles'} onChange={e => { setAiSettings(p => ({...p, availableTo:e.target.value})); setDirty(true); }}>
                            <option>All roles</option>
                            <option>Admin + Manager only</option>
                            <option>Admin only</option>
                        </select>
                    </FL>
                    <FL label="Daily token budget">
                        <input style={inpSt} value={(aiSettings.tokenBudget || 25000000).toLocaleString()} onChange={e => { setAiSettings(p => ({...p, tokenBudget: parseInt(e.target.value.replace(/,/g,''))||25000000})); setDirty(true); }}/>
                    </FL>
                    <FL label="On budget exceed">
                        <select style={selSt} value={aiSettings.budgetExceed || 'Throttle to 1 req/s'} onChange={e => { setAiSettings(p => ({...p, budgetExceed:e.target.value})); setDirty(true); }}>
                            <option>Throttle to 1 req/s</option>
                            <option>Block all AI requests</option>
                            <option>Allow with warning</option>
                        </select>
                    </FL>
                </div>
            </DataCard>

            {/* ── AI Data Residency & Training ── */}
            <DataCard title="AI · Data Residency & Training" desc="Where requests are processed and whether your data trains the model.">
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
                    {[
                        { id:'us', region:'US · us-east-2', latency:'+0ms'            },
                        { id:'eu', region:'EU · eu-west-1', latency:'+82ms (from US)'  },
                    ].map(r => {
                        const sel = aiRegion === r.region;
                        return (
                            <div key={r.id} onClick={() => { setAiSettings(p => ({...p, region:r.region})); setDirty(true); }}
                                style={{ border:`1px solid ${sel?T.goldInk:T.border}`, background:sel?'rgba(200,185,154,0.10)':T.surface, borderRadius:6, padding:'12px 14px', cursor:'pointer', transition:'border-color 100ms' }}>
                                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                                    <span style={{ width:14, height:14, borderRadius:'50%', border:`1.5px solid ${sel?T.goldInk:T.inkMuted}`, position:'relative', flexShrink:0 }}>
                                        {sel && <span style={{ position:'absolute', inset:3, borderRadius:'50%', background:T.goldInk }}/>}
                                    </span>
                                    <span style={{ fontSize:13, fontWeight:600, color:T.ink }}>{r.region}</span>
                                </div>
                                <div style={{ fontSize:11.5, color:T.inkMuted, marginTop:4, marginLeft:22 }}>Latency: {r.latency}</div>
                            </div>
                        );
                    })}
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                    {[
                        { key:'trainingOptIn',  invert:true,  label:'Training opt-out',        desc:'Your prompts and outputs do not train the model.' },
                        { key:'zeroRetention',  invert:false, label:'Zero data retention',     desc:'AI provider stores no request data after response.' },
                        { key:'piiRedaction',   invert:false, label:'PII redaction',            desc:'Personal email, phone, SSN replaced with placeholders pre-prompt.' },
                        { key:'byok',           invert:false, label:'BYOK (bring your own key)',desc: aiSettings.byok ? `Active · ${aiSettings.byokProvider||''}` : 'Use your own model API key for AI requests.' },
                    ].map(t => {
                        const rawVal = aiSettings[t.key] ?? (t.key === 'zeroRetention' || t.key === 'piiRedaction' ? true : false);
                        const on = t.invert ? !rawVal : rawVal;
                        return (
                            <div key={t.key} onClick={() => { setAiSettings(p => ({...p, [t.key]: !p[t.key]})); setDirty(true); }}
                                style={{ border:`1px solid ${T.border}`, borderRadius:4, padding:'12px 14px', background: on ? 'rgba(77,107,61,0.07)' : T.surface, display:'flex', alignItems:'flex-start', gap:10, cursor:'pointer' }}>
                                <span style={{ width:18, height:18, borderRadius:3, border:`1.5px solid ${on?T.ok:T.border}`, background:on?T.ok:'transparent', display:'inline-flex', alignItems:'center', justifyContent:'center', color:'#fbf8f3', fontSize:11, fontWeight:700, flexShrink:0, marginTop:1 }}>
                                    {on ? '✓' : ''}
                                </span>
                                <div>
                                    <div style={{ fontSize:12.5, fontWeight:600, color:T.ink }}>{t.label}</div>
                                    <div style={{ fontSize:11.5, color:T.inkMuted, marginTop:2 }}>{t.desc}</div>
                                </div>
                            </div>
                        );
                    })}
                </div>
                {/* BYOK key input — shown when BYOK is enabled */}
                {aiSettings.byok && (
                    <div style={{ marginTop:12, display:'flex', flexDirection:'column', gap:6 }}>
                        <label style={{ fontSize:11.5, fontWeight:600, color:T.inkMid, fontFamily:T.sans }}>
                            Your Anthropic API key
                        </label>
                        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                            <input
                                type="password"
                                value={aiSettings.byokProvider || ''}
                                onChange={e => { setAiSettings(p => ({...p, byokProvider: e.target.value})); setDirty(true); }}
                                placeholder="sk-ant-..."
                                style={{ flex:1, padding:'8px 10px', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:13, color:T.ink, fontFamily:'ui-monospace,Menlo,monospace', outline:'none', background:T.surface, boxSizing:'border-box' }}
                            />
                            {aiSettings.byokProvider && (
                                <span style={{ fontSize:11, color:T.ok, fontWeight:600, fontFamily:T.sans, whiteSpace:'nowrap' }}>✓ Key set</span>
                            )}
                        </div>
                        <div style={{ fontSize:11, color:T.inkMuted, fontFamily:T.sans }}>
                            Your key is encrypted with AES-256-GCM before storage. It is never logged or transmitted in plaintext.
                        </div>
                    </div>
                )}
            </DataCard>

            {/* ── AI governance ── */}
            <DataCard title="AI · Governance" desc="Compliance metadata and danger-zone actions.">
                <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:16, marginBottom:16 }}>
                    <FL label="DPA signed">
                        <input style={{ ...inpSt, cursor:'text' }} value={aiSettings.dpaSignedAt || ''} placeholder="YYYY-MM-DD" onChange={e => { setAiSettings(p => ({...p, dpaSignedAt:e.target.value})); setDirty(true); }}/>
                    </FL>
                    <FL label="Audit logging">
                        <select style={selSt} value={aiSettings.auditLogging || 'All AI requests · 13mo retention'} onChange={e => { setAiSettings(p => ({...p, auditLogging:e.target.value})); setDirty(true); }}>
                            <option>All AI requests · 13mo retention</option>
                            <option>Errors only</option>
                            <option>Disabled</option>
                        </select>
                    </FL>
                    <FL label="Block list (regex, comma-separated)">
                        <input style={inpSt} value={aiSettings.blockList || ''} placeholder="e.g. \bSSN\b, \bpassword\b" onChange={e => { setAiSettings(p => ({...p, blockList:e.target.value})); setDirty(true); }}/>
                    </FL>
                </div>
                <div style={{ padding:'14px 16px', background:'rgba(156,58,46,0.06)', borderLeft:`3px solid ${T.danger}`, borderRadius:4 }}>
                    <div style={{ fontSize:13, fontWeight:700, color:T.danger, marginBottom:4 }}>Reset training data</div>
                    <div style={{ fontSize:12.5, color:T.inkMid, marginBottom:10 }}>Removes any data your workspace has contributed to model training. Takes up to 30 days at the provider.</div>
                    <DataBtn label="Request reset" danger onClick={() => setShowReset(true)}/>
                </div>
            </DataCard>
        </div>
    );
};
