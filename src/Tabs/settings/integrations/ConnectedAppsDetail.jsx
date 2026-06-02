// settings/integrations/ConnectedAppsDetail.jsx
import React, { useState, useEffect } from 'react';
import { dbFetch } from '../../../utils/storage';
import { T } from '../shared/tokens.js';
import { UserAvatar } from '../shared/ui.jsx';
import { IntCrumb, IntTitle, IntBtn, IntModal, IntModalHeader, IntModalFooter } from './shared.jsx';

const AppTile = ({ name, color='#3a5a7a', size=36, emoji }) => (
    <span style={{
        display:'inline-flex', alignItems:'center', justifyContent:'center',
        width:size, height:size, borderRadius:6,
        background:color, color:'#fff',
        fontSize: emoji ? size*0.55 : size*0.38, fontWeight:700, fontFamily:T.sans,
        flexShrink:0, letterSpacing:0, userSelect:'none',
    }}>{emoji || name.slice(0,2).toUpperCase()}</span>
);

const StatusDot = ({ tone='ok', label }) => {
    const c = { ok:T.ok, warn:T.warn, danger:T.danger, muted:T.inkMuted }[tone] || T.ok;
    return (
        <span style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:11.5, color:c, fontFamily:T.sans }}>
            <span style={{ width:7, height:7, borderRadius:'50%', background:c, flexShrink:0 }}/>
            {label}
        </span>
    );
};

const INT_APPS = [
    // Connected
    { id:'slack',    name:'Slack',      category:'Messaging',    color:'#4a154b', emoji:'💬', connected:true,  tone:'ok',   traffic:'1,247 msgs/day',       desc:'Post deal updates, alerts, and digest to channels.' },
    { id:'gmail',    name:'Gmail',      category:'Email',        color:'#d93025', emoji:'✉',  connected:true,  tone:'ok',   traffic:'842 emails/day',        desc:'Sync sent/received emails to contact timelines.' },
    { id:'outlook',  name:'Outlook',    category:'Email',        color:'#0078d4', emoji:'📧', connected:true,  tone:'warn', traffic:'Token refresh in 6d',   desc:'Sync sent/received emails to contact timelines.' },
    { id:'zoom',     name:'Zoom',       category:'Video',        color:'#2d8cff', emoji:'📹', connected:true,  tone:'ok',   traffic:'34 meetings/week',      desc:'Log call recordings and transcripts to timelines.' },
    { id:'docusign', name:'DocuSign',   category:'eSign',        color:'#f4b100', emoji:'✍',  connected:true,  tone:'ok',   traffic:'12 envelopes/day',      desc:'Send quotes for signature and track status.' },
    { id:'linkedin', name:'LinkedIn',   category:'Prospecting',  color:'#0a66c2', emoji:'in', connected:true,  tone:'warn', traffic:'No traffic — verify scope', desc:'Auto-enrich leads with company & role data.' },
    // Popular not connected
    { id:'gcal',     name:'Google Calendar', category:'Calendar',   color:'#4285f4', emoji:'📅', connected:false, popular:true, desc:'Sync meetings with contacts automatically.' },
    { id:'snowflake',name:'Snowflake',  category:'Data warehouse',color:'#29b5e8', emoji:'❄',  connected:false, popular:true, desc:'Push Accelerep data to your data warehouse.' },
    { id:'clearbit', name:'Clearbit',   category:'Enrichment',   color:'#2869ff', emoji:'◈',  connected:false, popular:true, desc:'Real-time lead enrichment from Clearbit.' },
    // Catalog
    { id:'hubspot',  name:'HubSpot',    category:'CRM',          color:'#ff7a59', emoji:'🔶', connected:false, desc:'Bi-directional contact & deal sync.' },
    { id:'salesforce',name:'Salesforce',category:'CRM',          color:'#00a1e0', emoji:'☁',  connected:false, desc:'Mirror pipeline to Salesforce objects.' },
    { id:'intercom', name:'Intercom',   category:'Support',      color:'#6afdef', emoji:'💭', connected:false, desc:'Attach support tickets to accounts.' },
    { id:'zendesk',  name:'Zendesk',    category:'Support',      color:'#03363d', emoji:'Z',  connected:false, desc:'Surface open tickets in deal views.' },
    { id:'stripe',   name:'Stripe',     category:'Billing',      color:'#635bff', emoji:'💳', connected:false, desc:'Match invoices to closed-won deals.' },
    { id:'gong',     name:'Gong',       category:'Sales intel',  color:'#7c3aed', emoji:'🎙', connected:false, desc:'Surface call insights on contacts.' },
];

const ConnectAppModal = ({ app, onClose }) => {
    const requiredScopes = ['Read contacts','Read & write calendar events','Send emails on your behalf'];
    const optionalScopes = ['Read email metadata','Access contact photos'];
    const [optOn, setOptOn] = useState([true, false]);
    return (
        <IntModal width={540} onClose={onClose}>
            <IntModalHeader onClose={onClose}
                left={<AppTile name={app?.name||'GC'} color={app?.color||'#4285f4'} emoji={app?.emoji} size={36}/>}
                title={`Connect ${app?.name||'app'}`}
                sub={`${app?.category||'Integration'} · by ${app?.name||'app'}`}/>
            <div style={{ flex:1, overflowY:'auto', padding:'18px 22px' }}>
                {/* Account row */}
                <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', background:T.surface2, borderRadius:6, border:`1px solid ${T.border}`, marginBottom:16 }}>
                    <UserAvatar name="Morgan Reyes" size={28}/>
                    <div style={{ flex:1 }}>
                        <div style={{ fontSize:13, fontWeight:600, color:T.ink }}>Morgan Reyes</div>
                        <div style={{ fontSize:11.5, color:T.inkMuted }}>morgan@accelerep.com</div>
                    </div>
                    <button style={{ fontSize:12, fontWeight:600, color:T.info, background:'none', border:'none', cursor:'pointer', fontFamily:T.sans }}>Switch →</button>
                </div>
                {/* Required scopes */}
                <div style={{ fontSize:10.5, fontWeight:700, color:T.inkMuted, letterSpacing:0.6, textTransform:'uppercase', marginBottom:8, fontFamily:T.sans }}>Required permissions</div>
                {requiredScopes.map((s,i) => (
                    <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom:`1px solid ${T.border}` }}>
                        <span style={{ fontSize:13, color:T.ok }}>✓</span>
                        <span style={{ flex:1, fontSize:13, color:T.ink }}>{s}</span>
                        <span style={{ padding:'2px 6px', borderRadius:10, background:'rgba(77,107,61,0.12)', color:T.ok, fontSize:10.5, fontWeight:700 }}>Required</span>
                    </div>
                ))}
                {/* Optional scopes */}
                <div style={{ fontSize:10.5, fontWeight:700, color:T.inkMuted, letterSpacing:0.6, textTransform:'uppercase', margin:'14px 0 8px', fontFamily:T.sans }}>Optional</div>
                {optionalScopes.map((s,i) => (
                    <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom:`1px solid ${T.border}` }}>
                        <span onClick={() => setOptOn(p=>{const n=[...p];n[i]=!n[i];return n;})}
                            style={{ width:14, height:14, border:`1.5px solid ${optOn[i]?T.ok:T.border}`, borderRadius:2, background:optOn[i]?T.ok:'transparent', cursor:'pointer', display:'inline-flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                            {optOn[i] && <span style={{ color:'#fff', fontSize:9, lineHeight:1 }}>✓</span>}
                        </span>
                        <span style={{ flex:1, fontSize:13, color:T.ink }}>{s}</span>
                        <span style={{ padding:'2px 6px', borderRadius:10, background:'rgba(184,115,51,0.10)', color:T.warn, fontSize:10.5, fontWeight:700 }}>Optional</span>
                    </div>
                ))}
                {/* Privacy callout */}
                <div style={{ marginTop:14, padding:'10px 14px', background:'rgba(58,90,122,0.07)', borderLeft:`3px solid ${T.info}`, borderRadius:4 }}>
                    <div style={{ fontSize:12, color:T.info, fontWeight:600, marginBottom:3 }}>Privacy note</div>
                    <div style={{ fontSize:11.5, color:T.inkMid, lineHeight:1.5 }}>Accelerep only reads data you explicitly grant. We never store email content — only metadata for timeline sync.</div>
                </div>
            </div>
            <IntModalFooter left="You'll be redirected to Google to authorize.">
                <IntBtn label="Cancel" onClick={onClose}/>
                <IntBtn label={`Authorize ${app?.name||'app'}`} primary onClick={onClose}/>
            </IntModalFooter>
        </IntModal>
    );
};

export const ConnectedAppsDetail = ({ onBack }) => {
    const [connectModal,  setConnectModal]  = React.useState(null);
    const [slackModal,    setSlackModal]    = React.useState(false);
    const [catFilter,     setCatFilter]     = React.useState('All');
    const [connectedApps, setConnectedApps] = React.useState({});  // { [appId]: boolean }
    const [slackConfig,   setSlackConfig]   = React.useState({});  // { webhookUrl, channel, enabled }
    const [loading,       setLoading]       = React.useState(true);
    const [error,         setError]         = React.useState(null);
    const [disconnecting, setDisconnecting] = React.useState(null);

    // ── Load real connected state from settings ────────────────
    React.useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                const res  = await dbFetch('/.netlify/functions/settings');
                const data = await res.json();
                if (cancelled) return;
                if (!res.ok) throw new Error(data.error || 'Failed to load settings');
                setConnectedApps(data.settings?.connectedApps || {});
                setSlackConfig(data.settings?.slackConfig     || {});
            } catch (e) {
                if (!cancelled) setError(e.message);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        load();
        return () => { cancelled = true; };
    }, []);

    // ── Persist connected state ────────────────────────────────
    const saveConnectedApps = async (next) => {
        setConnectedApps(next);
        try {
            await dbFetch('/.netlify/functions/settings', {
                method: 'PUT',
                body: JSON.stringify({ connectedApps: next }),
            });
        } catch (e) {
            console.error('saveConnectedApps error:', e.message);
        }
    };

    const handleDisconnect = async (appId) => {
        setDisconnecting(appId);
        const next = { ...connectedApps, [appId]: false };
        await saveConnectedApps(next);
        setDisconnecting(null);
    };

    const handleMarkConnected = async (appId) => {
        const next = { ...connectedApps, [appId]: true };
        await saveConnectedApps(next);
    };

    // ── Slack config save ──────────────────────────────────────
    const handleSaveSlack = async (config) => {
        setSlackConfig(config);
        const nextApps = { ...connectedApps, slack: true };
        setConnectedApps(nextApps);
        try {
            await dbFetch('/.netlify/functions/settings', {
                method: 'PUT',
                body: JSON.stringify({ slackConfig: config, connectedApps: nextApps }),
            });
        } catch (e) {
            console.error('saveSlackConfig error:', e.message);
        }
        setSlackModal(false);
    };

    // Build display lists — merge INT_APPS with real connected state
    const isConnected = (app) => {
        // Google Calendar uses its own connection table — check settings flag
        if (app.id === 'gcal') return connectedApps['gcal'] === true;
        return connectedApps[app.id] === true;
    };

    const liveApps   = INT_APPS.map(a => ({ ...a, connected: isConnected(a) }));
    const connected  = liveApps.filter(a => a.connected);
    const popular    = liveApps.filter(a => !a.connected && (a.popular || ['gcal','snowflake','clearbit'].includes(a.id)));
    const catalog    = liveApps.filter(a => !a.connected && !popular.find(p => p.id === a.id));
    const cats       = ['All', ...new Set(catalog.map(a => a.category))];

    const slackConnected = connectedApps['slack'] === true && slackConfig?.webhookUrl;

    if (loading) return (
        <div style={{ fontFamily:T.sans }}>
            <IntCrumb page="Connected apps" onBack={onBack}/>
            <div style={{ padding:'60px 0', textAlign:'center', color:T.inkMuted, fontSize:13 }}>Loading…</div>
        </div>
    );

    return (
        <div style={{ fontFamily:T.sans }}>
            {connectModal && <ConnectAppModal app={connectModal} onClose={()=>setConnectModal(null)}/>}
            {slackModal   && <SlackConfigModal existing={slackConfig} onClose={()=>setSlackModal(false)} onSave={handleSaveSlack}/>}

            <IntCrumb page="Connected apps" onBack={onBack}/>
            <IntTitle title="Connected apps"
                sub={`${connected.length} connected · browse and manage your integration catalog`}
                actions={[
                    <IntBtn key="mkt" label="Browse marketplace"/>,
                    <IntBtn key="req" label="+ Request integration" primary/>,
                ]}/>

            {error && <div style={{ padding:'11px 16px', background:'rgba(156,58,46,0.08)', borderLeft:`3px solid ${T.danger}`, borderRadius:4, marginBottom:16, fontSize:12.5, color:T.danger }}>{error}</div>}

            {/* ── Slack callout — prominent if not yet configured ── */}
            {!slackConnected && (
                <div style={{ padding:'14px 16px', background:'rgba(74,21,75,0.06)', borderLeft:`3px solid #4a154b`, borderRadius:4, marginBottom:20, display:'flex', alignItems:'center', gap:14 }}>
                    <AppTile name="Slack" color="#4a154b" emoji="💬" size={32}/>
                    <div style={{ flex:1 }}>
                        <div style={{ fontSize:13, fontWeight:600, color:T.ink }}>Connect Slack to get pipeline alerts in your channel</div>
                        <div style={{ fontSize:11.5, color:T.inkMuted, marginTop:2 }}>Stale deal alerts, stuck stage warnings, close date nudges, and weekly digests — all posted to Slack alongside email.</div>
                    </div>
                    <IntBtn label="Configure Slack" primary onClick={() => setSlackModal(true)}/>
                </div>
            )}

            {/* ── Section 1: Connected ── */}
            {connected.length > 0 && (
                <div style={{ marginBottom:24 }}>
                    <div style={{ fontSize:14, fontWeight:700, color:T.ink, marginBottom:12 }}>Connected ({connected.length})</div>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:14 }}>
                        {connected.map(app => (
                            <div key={app.id} style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:8, padding:16, display:'flex', flexDirection:'column', gap:10 }}>
                                <div style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
                                    <AppTile name={app.name} color={app.color} emoji={app.emoji} size={36}/>
                                    <div style={{ flex:1, minWidth:0 }}>
                                        <div style={{ fontSize:13.5, fontWeight:700, color:T.ink }}>{app.name}</div>
                                        <div style={{ fontSize:11, color:T.inkMuted }}>{app.category}</div>
                                    </div>
                                    <span style={{ padding:'2px 7px', borderRadius:10, background:'rgba(77,107,61,0.12)', color:T.ok, fontSize:10.5, fontWeight:700 }}>Live</span>
                                </div>
                                <div style={{ fontSize:12, color:T.inkMid, lineHeight:1.4 }}>{app.desc}</div>
                                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', paddingTop:8, borderTop:`1px solid ${T.border}` }}>
                                    <StatusDot tone="ok" label="Connected"/>
                                    <div style={{ display:'flex', gap:8 }}>
                                        {app.id === 'slack' && (
                                            <button onClick={() => setSlackModal(true)}
                                                style={{ fontSize:12, fontWeight:600, color:T.info, background:'none', border:'none', cursor:'pointer', fontFamily:T.sans }}>Configure</button>
                                        )}
                                        <button onClick={() => handleDisconnect(app.id)} disabled={disconnecting === app.id}
                                            style={{ fontSize:12, fontWeight:600, color:T.danger, background:'none', border:'none', cursor:'pointer', fontFamily:T.sans, opacity: disconnecting === app.id ? 0.5 : 1 }}>
                                            {disconnecting === app.id ? 'Disconnecting…' : 'Disconnect'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Section 2: Popular / not connected ── */}
            <div style={{ marginBottom:24 }}>
                <div style={{ fontSize:14, fontWeight:700, color:T.ink, marginBottom:10 }}>Popular</div>
                <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:8, overflow:'hidden' }}>
                    {/* Slack row — special because it has its own config flow */}
                    {!slackConnected && (
                        <div style={{ display:'flex', alignItems:'center', gap:14, padding:'12px 16px', borderBottom:`1px solid ${T.border}` }}>
                            <AppTile name="Slack" color="#4a154b" emoji="💬" size={32}/>
                            <div style={{ flex:1 }}>
                                <div style={{ fontSize:13, fontWeight:600, color:T.ink }}>Slack</div>
                                <div style={{ fontSize:11.5, color:T.inkMuted }}>Post deal updates, alerts, and digest to channels.</div>
                            </div>
                            <span style={{ fontSize:11.5, color:T.inkMuted, marginRight:8 }}>Messaging</span>
                            <IntBtn label="Configure →" primary onClick={() => setSlackModal(true)}/>
                        </div>
                    )}
                    {popular.map((app, i) => (
                        <div key={app.id} style={{ display:'flex', alignItems:'center', gap:14, padding:'12px 16px', borderBottom: i < popular.length-1 ? `1px solid ${T.border}` : 'none' }}>
                            <AppTile name={app.name} color={app.color} emoji={app.emoji} size={32}/>
                            <div style={{ flex:1 }}>
                                <div style={{ fontSize:13, fontWeight:600, color:T.ink }}>{app.name}</div>
                                <div style={{ fontSize:11.5, color:T.inkMuted }}>{app.desc}</div>
                            </div>
                            <span style={{ fontSize:11.5, color:T.inkMuted, marginRight:8 }}>{app.category}</span>
                            <button onClick={() => setConnectModal(app)}
                                style={{ padding:'6px 14px', background:T.ink, color:'#fbf8f3', border:'none', borderRadius:T.r, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>Connect</button>
                        </div>
                    ))}
                </div>
            </div>

            {/* ── Section 3: All apps catalog ── */}
            <div>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                    <div style={{ fontSize:14, fontWeight:700, color:T.ink }}>All apps</div>
                    <div style={{ display:'flex', gap:4 }}>
                        {cats.map(c => (
                            <button key={c} onClick={() => setCatFilter(c)}
                                style={{ padding:'3px 10px', fontSize:11.5, fontWeight:600, borderRadius:10, border:`1px solid ${catFilter===c?T.ink:T.border}`, background:catFilter===c?T.ink:'transparent', color:catFilter===c?'#fbf8f3':T.inkMid, cursor:'pointer', fontFamily:T.sans }}>{c}</button>
                        ))}
                    </div>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:10 }}>
                    {catalog.filter(a => catFilter==='All' || a.category===catFilter).map(app => (
                        <div key={app.id}
                            onClick={() => app.id === 'slack' ? setSlackModal(true) : setConnectModal(app)}
                            style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:6, padding:'12px 14px', display:'flex', alignItems:'center', gap:10, cursor:'pointer' }}
                            onMouseEnter={e => e.currentTarget.style.borderColor = T.borderStrong}
                            onMouseLeave={e => e.currentTarget.style.borderColor = T.border}>
                            <AppTile name={app.name} color={app.color} emoji={app.emoji} size={28}/>
                            <div style={{ flex:1, minWidth:0 }}>
                                <div style={{ fontSize:12.5, fontWeight:600, color:T.ink, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{app.name}</div>
                                <div style={{ fontSize:11, color:T.inkMuted }}>{app.category}</div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
