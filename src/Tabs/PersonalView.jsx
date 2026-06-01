// PersonalView.jsx
import React, { useState } from 'react';
import { dbFetch } from '../utils/storage';
import { T, eb } from './settings/shared/tokens.js';
import { StatusChip, NewBadge, SettingIcon, RToggle, RCheck } from './settings/shared/ui.jsx';
import { SETTINGS_ITEMS } from './settings/catalogue.js';

const PersonalCalendar = ({ settings }) => {
    const calConnected = settings.googleCalendarConnected || settings.calendarConnected || false;
    const [toggles, setToggles] = useState({ twoWay:true, autoLog:true, availability:true, privacyMode:false });
    return (
        <div>
            <div style={{ ...eb(T.inkMuted), marginBottom:10 }}>CONNECTED CALENDAR</div>
            <div style={{ padding:14, background:T.bg, border:`1px solid ${T.border}`, borderRadius:T.r, display:'flex', alignItems:'center', gap:12, marginBottom:18 }}>
                <div style={{ width:40, height:40, background:'#fff', border:`1px solid ${T.border}`, borderRadius:T.r, display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700, color:'#4285f4' }}>G</div>
                <div style={{ flex:1 }}>
                    <div style={{ fontSize:13.5, fontWeight:600, color:T.ink, fontFamily:T.sans }}>Google Calendar</div>
                    <div style={{ fontSize:11.5, color:T.inkMuted, fontFamily:T.sans }}>{calConnected ? 'Connected · syncing' : 'Not connected'}</div>
                </div>
                <StatusChip status={calConnected ? 'connected' : 'none'} detail={calConnected ? 'Connected' : 'Not connected'}/>
                <button style={{ padding:'5px 10px', fontSize:11, fontWeight:600, background:'transparent', color:T.inkMid, border:`1px solid ${T.border}`, borderRadius:T.r, cursor:'pointer', fontFamily:T.sans }}>
                    {calConnected ? 'Disconnect' : 'Connect'}
                </button>
            </div>
            <div style={{ ...eb(T.inkMuted), marginBottom:10 }}>SYNC OPTIONS</div>
            {[
                { key:'twoWay',       label:'Two-way event sync',                   sub:'Changes in Accelerep push to Google, and vice versa.' },
                { key:'autoLog',      label:'Auto-log meetings to opportunities',    sub:'Detects attendees and attaches to matching deals.' },
                { key:'availability', label:'Show availability on booking links',    sub:'Your calendar busy blocks hide those slots.' },
                { key:'privacyMode',  label:'Pull in free/busy only (no event titles)', sub:"Privacy mode — Accelerep can't read event details." },
            ].map((c, i) => (
                <div key={c.key} style={{ display:'flex', alignItems:'flex-start', gap:12, padding:'10px 0', borderBottom: i < 3 ? `1px dashed ${T.border}` : 'none' }}>
                    <RToggle on={toggles[c.key]} onChange={v => setToggles(p => ({ ...p, [c.key]: v }))}/>
                    <div style={{ flex:1 }}>
                        <div style={{ fontSize:12.5, fontWeight:600, color:T.ink, fontFamily:T.sans }}>{c.label}</div>
                        <div style={{ fontSize:11.5, color:T.inkMuted, marginTop:1, fontFamily:T.sans }}>{c.sub}</div>
                    </div>
                </div>
            ))}
        </div>
    );
};

const PersonalNotifications = ({ settings, setSettings }) => {
    const prefs = settings.notificationPreferences || {};
    const channels = [
        { key:'mentions',  name:'@Mentions in comments',       email:true, push:true, inapp:true },
        { key:'approvals', name:'Quote approval requests',      email:true, push:false, inapp:true },
        { key:'quoteOpen', name:'Quote viewed by customer',     email:true, push:false, inapp:true },
        { key:'leads',     name:'New lead assigned',            email:false, push:true, inapp:true },
        { key:'tasks',     name:'Task due soon',                email:false, push:true, inapp:true },
        { key:'digest',    name:'Daily digest',                 email:true, push:false, inapp:false },
    ];
    const [local, setLocal] = useState(() => {
        const out = {};
        channels.forEach(c => { out[c.key] = { email: prefs[c.key]?.email ?? c.email, push: prefs[c.key]?.push ?? c.push, inapp: prefs[c.key]?.inapp ?? c.inapp }; });
        return out;
    });
    const toggle = (key, field) => setLocal(p => ({ ...p, [key]: { ...p[key], [field]: !p[key][field] } }));
    return (
        <div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 60px 60px 60px', gap:8, ...eb(T.inkMuted), marginBottom:10 }}>
                <span>EVENT</span><span style={{ textAlign:'center' }}>EMAIL</span><span style={{ textAlign:'center' }}>PUSH</span><span style={{ textAlign:'center' }}>IN-APP</span>
            </div>
            {channels.map((c, i) => (
                <div key={c.key} style={{ display:'grid', gridTemplateColumns:'1fr 60px 60px 60px', gap:8, padding:'10px 0', borderBottom: i < channels.length-1 ? `1px dashed ${T.border}` : 'none', alignItems:'center' }}>
                    <span style={{ fontSize:12.5, color:T.ink, fontFamily:T.sans }}>{c.name}</span>
                    <RCheck on={local[c.key]?.email} onChange={() => toggle(c.key, 'email')}/>
                    <RCheck on={local[c.key]?.push}  onChange={() => toggle(c.key, 'push')}/>
                    <RCheck on={local[c.key]?.inapp} onChange={() => toggle(c.key, 'inapp')}/>
                </div>
            ))}
            <div style={{ marginTop:16, padding:12, background:T.bg, border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:11.5, color:T.inkMid, fontFamily:T.sans }}>
                Quiet hours: <strong>mute push 7pm – 8am</strong> (your local time).{' '}
                <span style={{ color:T.info, fontWeight:600, cursor:'pointer' }}>Edit →</span>
            </div>
            <div style={{ marginTop:14, display:'flex', justifyContent:'flex-end' }}>
                <button onClick={() => {
                    const updated = { ...settings, notificationPreferences: local };
                    setSettings(updated);
                    dbFetch('/.netlify/functions/settings', { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(updated) }).catch(console.error);
                }} style={{ padding:'7px 14px', fontSize:12, fontWeight:600, background:T.ink, color:T.surface, border:'none', borderRadius:T.r, cursor:'pointer', fontFamily:T.sans }}>
                    Save preferences
                </button>
            </div>
        </div>
    );
};

const PersonalSignature = ({ currentUser }) => {
    const templates = [
        { name:'Intro — cold outreach', uses:42, open:38 },
        { name:'Follow-up · no response', uses:28, open:24 },
        { name:'Quote sent · check-in', uses:12, open:67 },
    ];
    return (
        <div>
            <div style={{ ...eb(T.inkMuted), marginBottom:10 }}>EMAIL SIGNATURE</div>
            <div style={{ padding:16, border:`1px solid ${T.border}`, borderRadius:T.r, background:T.bg, marginBottom:14, fontFamily:T.sans }}>
                <div style={{ fontSize:13, color:T.ink, marginBottom:6, fontWeight:600 }}>{currentUser}</div>
                <div style={{ fontSize:12, color:T.inkMid, marginBottom:2 }}>Account Executive · Accelerep</div>
                <div style={{ fontSize:12, color:T.inkMid, marginBottom:8 }}>Accelerep · {(currentUser||'').toLowerCase().replace(' ','.')}@accelerep.com</div>
                <div style={{ fontSize:11, color:T.inkMuted, fontStyle:'italic' }}>"The best way to predict revenue is to make it happen."</div>
            </div>
            <div style={{ display:'flex', gap:8, marginBottom:22 }}>
                <button style={{ padding:'7px 14px', fontSize:12, fontWeight:600, background:T.ink, color:T.surface, border:'none', borderRadius:T.r, cursor:'pointer', fontFamily:T.sans }}>Edit signature</button>
                <button style={{ padding:'7px 14px', fontSize:12, fontWeight:600, background:'transparent', color:T.inkMid, border:`1px solid ${T.border}`, borderRadius:T.r, cursor:'pointer', fontFamily:T.sans }}>Append to all sent mail</button>
            </div>
            <div style={{ ...eb(T.inkMuted), marginBottom:10 }}>YOUR EMAIL TEMPLATES · {templates.length}</div>
            {templates.map((t, i) => (
                <div key={t.name} style={{ display:'grid', gridTemplateColumns:'1fr 100px 100px 60px', gap:12, padding:'10px 0', borderBottom: i < templates.length-1 ? `1px dashed ${T.border}` : 'none', alignItems:'center' }}>
                    <div style={{ fontSize:12.5, fontWeight:600, color:T.ink, fontFamily:T.sans }}>{t.name}</div>
                    <div style={{ fontSize:11.5, color:T.inkMid, fontFamily:T.sans }}>{t.uses} uses</div>
                    <div style={{ fontSize:11.5, color:T.inkMid, fontFamily:T.sans }}>{t.open}% open rate</div>
                    <div style={{ fontSize:11.5, color:T.info, fontWeight:600, textAlign:'right', cursor:'pointer', fontFamily:T.sans }}>Edit →</div>
                </div>
            ))}
            <button style={{ marginTop:14, padding:'7px 12px', fontSize:12, fontWeight:600, width:'100%', background:'transparent', color:T.inkMid, border:`1px dashed ${T.borderStrong}`, borderRadius:T.r, cursor:'pointer', fontFamily:T.sans }}>+ New template</button>
        </div>
    );
};

const PersonalApiTokens = () => (
    <div>
        <div style={{ ...eb(T.inkMuted), marginBottom:10 }}>PERSONAL API TOKENS</div>
        <div style={{ padding:24, background:T.bg, border:`1px dashed ${T.borderStrong}`, borderRadius:T.r, textAlign:'center' }}>
            <div style={{ fontSize:13, color:T.inkMid, marginBottom:10, fontFamily:T.sans }}>No tokens yet. Create one to call the Accelerep API on your behalf.</div>
            <button style={{ padding:'8px 16px', fontSize:12, fontWeight:600, background:T.ink, color:T.surface, border:'none', borderRadius:T.r, cursor:'pointer', fontFamily:T.sans }}>+ Generate token</button>
        </div>
        <div style={{ marginTop:14, fontSize:11.5, color:T.inkMuted, lineHeight:1.55, fontFamily:T.sans }}>
            Personal tokens carry <strong>your</strong> permissions. For server-to-server keys, ask your admin about workspace API keys in Settings → Integrations.
        </div>
    </div>
);

export const PersonalView = ({ settings, setSettings, currentUser, isAdmin }) => {
    const items = SETTINGS_ITEMS.filter(i => i.scope === 'personal');
    const [active, setActive] = useState(items[0]);
    return (
        <div style={{ display:'grid', gridTemplateColumns:'260px 1fr', gap:24, padding:'0 0 40px' }}>
            {/* Side rail */}
            <div style={{ paddingTop:4 }}>
                <div style={{ ...eb(T.inkMuted), marginBottom:10 }}>MY ACCOUNT</div>
                {items.map(it => (
                    <div key={it.id} onClick={() => setActive(it)} style={{ padding:'10px 12px', borderRadius:T.r+1, cursor:'pointer', display:'flex', alignItems:'center', gap:10, background: active?.id === it.id ? T.surface : 'transparent', border: active?.id === it.id ? `1px solid ${T.border}` : '1px solid transparent', marginBottom:4, transition:'background 80ms' }}>
                        <SettingIcon category={it.category} size={28}/>
                        <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontSize:12.5, fontWeight:600, color:T.ink, display:'flex', alignItems:'center', gap:5, fontFamily:T.sans }}>
                                {it.name} {it.isNew && <NewBadge/>}
                            </div>
                            <div style={{ fontSize:11, color:T.inkMuted, marginTop:1, fontFamily:T.sans }}>{it.statusDetail}</div>
                        </div>
                    </div>
                ))}
                {isAdmin && (
                    <>
                        <div style={{ height:1, background:T.border, margin:'14px 0 10px' }}/>
                        <div style={{ ...eb(T.inkMuted), marginBottom:8 }}>WORKSPACE</div>
                        <div style={{ padding:'10px 12px', borderRadius:T.r+1, display:'flex', alignItems:'center', gap:10, border:`1px dashed ${T.borderStrong}`, cursor:'pointer' }}
                            onClick={() => document.dispatchEvent(new CustomEvent('accelerep:settings:showAdmin'))}>
                            <div style={{ width:28, height:28, borderRadius:T.r+1, background:T.ink, color:T.gold, fontSize:11, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center' }}>A</div>
                            <div style={{ flex:1 }}>
                                <div style={{ fontSize:12, fontWeight:600, color:T.ink, fontFamily:T.sans }}>Admin settings →</div>
                                <div style={{ fontSize:10.5, color:T.inkMuted, fontFamily:T.sans }}>Opens the workspace console</div>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* Detail panel */}
            {active && (
                <div>
                    <div style={{ marginBottom:14 }}>
                        <div style={{ fontSize:20, fontWeight:700, color:T.ink, marginBottom:4, fontFamily:T.sans }}>{active.name}</div>
                        <div style={{ fontSize:13, color:T.inkMid, fontFamily:T.sans }}>{active.desc}</div>
                    </div>
                    <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:6, padding:20 }}>
                        {active.id === 'my-calendar'      && <PersonalCalendar settings={settings}/>}
                        {active.id === 'my-notifications' && <PersonalNotifications settings={settings} setSettings={setSettings}/>}
                        {active.id === 'my-signature'     && <PersonalSignature currentUser={currentUser}/>}
                        {active.id === 'my-api'           && <PersonalApiTokens/>}
                    </div>
                </div>
            )}
        </div>
    );
};
