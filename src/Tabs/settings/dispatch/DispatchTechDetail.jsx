// settings/dispatch/DispatchTechDetail.jsx
import React, { useState, useEffect } from 'react';
import { dbFetch } from '../../../utils/storage';
import { T } from '../shared/tokens.js';
import { SPDetailPageChrome } from '../salesProcess/shared.jsx';

const DspKebabBtn = ({ id, openId, onOpen }) => (
    <button onClick={e => onOpen(e, id)}
        style={{ background:'none', border:'none', cursor:'pointer', color:T.inkMuted, fontSize:16, fontWeight:700, padding:'0 2px', lineHeight:1, fontFamily:T.sans }}
        onMouseEnter={e=>e.currentTarget.style.color=T.ink}
        onMouseLeave={e=>e.currentTarget.style.color=T.inkMuted}>⋯</button>
);

const DspKebabMenu = ({ id, items, openId, rect, onClose }) => {
    if (openId !== id || !rect) return null;
    return (
        <>
            <div style={{ position:'fixed', inset:0, zIndex:9998 }} onClick={onClose}/>
            <div style={{ position:'fixed', top:rect.top, right:rect.right, zIndex:9999,
                background:T.surface, border:`1px solid ${T.border}`, borderRadius:T.r+2,
                boxShadow:'0 4px 16px rgba(42,38,34,0.12)', minWidth:148, overflow:'hidden' }}>
                {items.map((item, i) => (
                    item === 'divider' ? (
                        <div key={i} style={{ height:1, background:T.border }}/>
                    ) : (
                        <button key={i} disabled={item.disabled}
                            onClick={() => { if (!item.disabled) { item.action(); onClose(); } }}
                            style={{ display:'block', width:'100%', padding:'9px 14px', background:'none', border:'none',
                                borderTop: i>0 ? `1px solid ${T.border}` : 'none',
                                textAlign:'left', fontSize:13, cursor:item.disabled?'default':'pointer', fontFamily:T.sans,
                                color:item.danger ? T.danger : item.disabled ? T.inkMuted : T.ink, opacity:item.disabled?0.5:1 }}
                            onMouseEnter={e=>{ if(!item.disabled) e.currentTarget.style.background=T.surface2; }}
                            onMouseLeave={e=>e.currentTarget.style.background='none'}>
                            {item.label}
                            {item.disabled && item.disabledReason && (
                                <div style={{ fontSize:10.5, color:T.inkMuted, marginTop:2 }}>{item.disabledReason}</div>
                            )}
                        </button>
                    )
                ))}
            </div>
        </>
    );
};

const useDspKebab = () => {
    const [openId, setOpenId] = React.useState(null);
    const [rect,   setRect]   = React.useState(null);

    const open = React.useCallback((e, id) => {
        e.stopPropagation();
        if (openId === id) { setOpenId(null); setRect(null); return; }
        const r = e.currentTarget.getBoundingClientRect();
        setRect({ top: r.bottom + 4, right: window.innerWidth - r.right });
        setOpenId(id);
    }, [openId]);

    const close = React.useCallback(() => { setOpenId(null); setRect(null); }, []);

    // Convenience wrappers that bind the hook state — still module-scope components under the hood
    const KebabBtn  = React.useCallback(({ id }) => <DspKebabBtn  id={id} openId={openId} onOpen={open}/>,  [openId, open]);
    const KebabMenu = React.useCallback(({ id, items }) => <DspKebabMenu id={id} items={items} openId={openId} rect={rect} onClose={close}/>, [openId, rect, close]);

    return { openId, open, close, KebabBtn, KebabMenu };
};

export const DispatchTechDetail = ({ settings, setSettings, onBack, setSettingsDirty, settingsSaveRef }) => {
    const users = (settings?.users || []).filter(u => u.dispatchEnabled);
    const skills = settings?.dispatchSkills || [];
    const certs  = settings?.dispatchCerts  || [];
    const licenses = settings?.dispatchLicenses || ['Apprentice','Journeyman','Master','Lead'];
    const vehicles = settings?.dispatchVehicles || [];
    const crews  = settings?.dispatchCrews  || [];

    const [filter, setFilter] = useState('All techs');
    const [dirty, setDirty] = useState(false);
    const techKebab = useDspKebab();

    const handleSave = async () => {};
    React.useEffect(() => { if (setSettingsDirty) setSettingsDirty(dirty); return () => { if (setSettingsDirty) setSettingsDirty(false); }; }, [dirty]);

    const activeTechs = users.filter(u => u.dispatchEnabled);
    const overHours   = users.filter(u => (u.hoursThisWeek||0) > (u.hoursCap||40));
    const certsExp30  = users.filter(u => (u.dispatchCerts||[]).some(c => c.expiresIn <= 30));

    const getStatus = (u) => {
        if ((u.hoursThisWeek||0) > (u.hoursCap||40)) return { label: 'Over hours', color: T.danger };
        if (u.status === 'training') return { label: 'Training', color: T.info };
        if (u.status === 'pto')     return { label: 'PTO', color: T.inkMuted };
        return { label: 'Active', color: T.ok };
    };

    const saveUserDispatch = async (userId, updates) => {
        const updatedUsers = (settings?.users || []).map(u =>
            (u.id === userId || u.name === userId) ? { ...u, ...updates } : u
        );
        setSettings(prev => ({ ...prev, users: updatedUsers }));
        try { await dbFetch('/.netlify/functions/settings', { method: 'PUT', body: JSON.stringify({ users: updatedUsers }) }); }
        catch(e) { console.error('save tech profile', e); }
    };

    return (
        <SPDetailPageChrome crumb="Dispatch · Tech profiles" title="Tech profiles"
            subtitle="Dispatcher view of every user with dispatch enabled. Edit skills, certs, license, vehicle, and hours cap in one place."
            onBack={onBack} dirty={false} onCancel={onBack}
            disablePrimary={true} primaryLabel="Auto-saved"
            primaryAction={() => {}}
            extraActions={
                <>
                    <button style={{ padding:'7px 14px', background:T.surface, border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:12.5, fontWeight:500, color:T.inkMid, cursor:'pointer', fontFamily:T.sans }}>Export CSV</button>
                    <button style={{ padding:'7px 14px', background:T.ink, color:'#fbf8f3', border:'none', borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>+ Enable dispatch for user</button>
                </>
            }>

            {/* Source-of-truth banner */}
            <div style={{ background: `${T.goldInk}0e`, border: `1px solid ${T.goldInk}30`, borderRadius: T.r, padding: '10px 14px', marginBottom: 16, fontSize: 12.5, color: T.inkMid, fontFamily: T.sans, display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 14 }}>↺</span>
                User identity (name, email, role) lives in <strong style={{ color: T.ink }}>People & Teams → Users</strong>. This page edits only the dispatch fields — changes here sync both ways.
            </div>

            {/* Quick-stat strip */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 16 }}>
                {[
                    { label: 'Active', value: activeTechs.length, color: T.ok },
                    { label: 'Over hours this week', value: overHours.length, color: overHours.length > 0 ? T.danger : T.inkMuted },
                    { label: 'In training', value: users.filter(u=>u.status==='training').length, color: T.info },
                    { label: 'Certs expiring 30d', value: certsExp30.length, color: certsExp30.length > 0 ? T.warn : T.inkMuted },
                    { label: 'Avg utilization', value: users.length > 0 ? Math.round(users.reduce((a,u)=>(a+(u.hoursThisWeek||0)/(u.hoursCap||40)),0)/users.length*100)+'%' : '—', color: T.ink },
                ].map((s,i) => (
                    <div key={i} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r+2, padding: '12px 14px' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: T.inkMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4, fontFamily: T.sans }}>{s.label}</div>
                        <div style={{ fontSize: 22, fontWeight: 700, color: s.color, fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>{s.value}</div>
                    </div>
                ))}
            </div>

            {/* Filter chips */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                {['All techs', 'By crew', 'By skill', 'By license', 'Status any'].map(f => (
                    <span key={f} onClick={() => setFilter(f)}
                        style={{ padding: '4px 10px', borderRadius: 3, background: filter===f ? T.ink : T.surface2, color: filter===f ? '#fbf8f3' : T.inkMid, fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans }}>
                        {f}
                    </span>
                ))}
            </div>

            {users.length === 0 ? (
                <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r+2, padding: '3rem', textAlign: 'center', color: T.inkMuted, fontSize: 13, fontStyle: 'italic', fontFamily: T.sans }}>
                    No dispatch-enabled users. Enable dispatch for a user in People & Teams → their profile.
                </div>
            ) : (
                <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r+2, overflow: 'hidden' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 100px 100px 1.5fr 1fr 90px 100px 100px 28px', gap: 10, padding: '8px 14px', background: T.surface2, fontSize: 10, fontWeight: 700, color: T.inkMuted, textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: T.sans }}>
                        <div>Tech</div><div>Status</div><div>License</div><div>Skills</div><div>Certs</div><div>Hours</div><div>Vehicle</div><div>Crew</div><div/>
                    </div>
                    {users.map((u, i) => {
                        const st = getStatus(u);
                        const userSkills = (u.dispatchSkills||[]).map(id => skills.find(s=>s.id===id)).filter(Boolean);
                        const userCerts  = (u.dispatchCerts||[]);
                        const hoursUsed  = u.hoursThisWeek||0;
                        const hoursCap   = u.hoursCap||40;
                        const over       = hoursUsed > hoursCap;
                        const userCrew   = crews.find(c => (c.members||[]).includes(u.id||u.name));
                        return (
                            <div key={u.id||u.name} style={{ display: 'grid', gridTemplateColumns: '1.5fr 100px 100px 1.5fr 1fr 90px 100px 100px 28px', gap: 10, padding: '11px 14px', alignItems: 'center', fontSize: 12.5, fontFamily: T.sans, borderTop: i>0 ? `1px solid ${T.border}` : 'none' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <div style={{ width: 30, height: 30, borderRadius: '50%', background: T.ink, color: '#fbf8f3', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                        {(u.name||'?').split(' ').map(w=>w[0]).join('').slice(0,2)}
                                    </div>
                                    <div>
                                        <div style={{ fontWeight: 700, color: T.ink }}>{u.name}</div>
                                    </div>
                                </div>
                                <div><span style={{ fontSize: 10.5, padding: '2px 7px', borderRadius: 3, background: `${st.color}18`, color: st.color, fontWeight: 700 }}>{st.label}</span></div>
                                <div>
                                    <select value={u.dispatchLicense || licenses[0] || 'Apprentice'}
                                        onChange={e => saveUserDispatch(u.id||u.name, { dispatchLicense: e.target.value })}
                                        style={{ padding: '3px 7px', border: `1px solid ${T.borderStrong}`, borderRadius: T.r, fontSize: 11.5, fontFamily: T.sans, outline: 'none', background: T.surface }}>
                                        {licenses.map(l => <option key={l}>{l}</option>)}
                                    </select>
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                                    {userSkills.slice(0,3).map(s => (
                                        <span key={s.id} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 8, background: `${s.color}14`, color: s.color, fontWeight: 600, border: `1px solid ${s.color}30` }}>{s.name}</span>
                                    ))}
                                    {userSkills.length > 3 && <span style={{ fontSize: 10, color: T.inkMuted }}>+{userSkills.length-3}</span>}
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                                    {userCerts.map(c => {
                                        const cert = certs.find(ct => ct.id === c.id || ct.name === c.id);
                                        const expiring = (c.expiresIn||0) <= 30;
                                        return cert ? (
                                            <span key={c.id} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 3, background: expiring?`${T.warn}18`:T.surface2, color: expiring?T.warn:T.inkMid, fontWeight: 600, border: `1px solid ${expiring?T.warn:T.border}` }}>
                                                {expiring ? '⚠ ' : ''}{cert.name}
                                            </span>
                                        ) : null;
                                    })}
                                </div>
                                <div>
                                    <div style={{ fontSize: 10.5, fontFamily: 'ui-monospace,Menlo,monospace', color: over?T.danger:T.inkMid, marginBottom: 2 }}>{hoursUsed}/{hoursCap}h</div>
                                    <div style={{ height: 3, background: T.surface2, borderRadius: 2, overflow: 'hidden' }}>
                                        <div style={{ height: '100%', width: `${Math.min(hoursUsed/hoursCap,1)*100}%`, background: over?T.danger:(hoursUsed>=hoursCap*0.9?T.warn:T.ok) }}/>
                                    </div>
                                </div>
                                <div style={{ fontSize: 11.5, color: T.inkMid }}>{u.vehicle || '—'}</div>
                                <div style={{ fontSize: 11.5, color: T.inkMid }}>{userCrew?.name || '—'}</div>
                                <><techKebab.KebabBtn id={u.id||u.name}/><techKebab.KebabMenu id={u.id||u.name} items={[{label:'View in People & Teams',action:()=>{}},{label:'Disable dispatch',danger:true,action:()=>saveUserDispatch(u.id||u.name,{dispatchEnabled:false})}]}/></>
                            </div>
                        );
                    })}
                </div>
            )}
        </SPDetailPageChrome>
    );
};
