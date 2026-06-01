// settings/company/CompanyCalendarDetail.jsx
import React, { useState } from 'react';
import { dbFetch } from '../../../utils/storage';
import { T } from '../shared/tokens.js';
import { CSectionCard, DetailPageChrome } from '../shared/form.jsx';
import { LIcon } from '../shared/ui.jsx';
import { MONTHS_SHORT, MONTHS_FULL } from './constants.js';

const FEDERAL_HOLIDAYS = [
    { date:'Jan 1',  name:"New Year's Day",                source:'US · Federal', type:'observed' },
    { date:'Jan 20', name:'Martin Luther King Jr. Day',    source:'US · Federal', type:'observed' },
    { date:'Feb 17', name:"Presidents' Day",               source:'US · Federal', type:'observed' },
    { date:'May 26', name:'Memorial Day',                  source:'US · Federal', type:'observed' },
    { date:'Jun 19', name:'Juneteenth',                    source:'US · Federal', type:'observed' },
    { date:'Jul 4',  name:'Independence Day (obs.)',       source:'US · Federal', type:'observed' },
    { date:'Sep 1',  name:'Labor Day',                     source:'US · Federal', type:'observed' },
    { date:'Nov 27', name:'Thanksgiving',                  source:'US · Federal', type:'observed' },
    { date:'Dec 25', name:'Christmas Day',                 source:'US · Federal', type:'observed' },
];

export const CompanyCalendarDetail = ({ settings, setSettings, onBack }) => {
    const now = new Date();
    const [year, setYear]         = useState(now.getFullYear());
    const [showForm, setShowForm] = useState(false);
    const [saving, setSaving]     = useState(false);
    const [formMonth, setFormMonth] = useState(String(now.getMonth()));
    const [formDay,   setFormDay]   = useState(String(now.getDate()));
    const [formName,  setFormName]  = useState('');
    const [formError, setFormError] = useState('');
    const [syncing, setSyncing]     = useState(false);
    const [syncMsg, setSyncMsg]     = useState('');

    const handleSync = async () => {
        setSyncing(true);
        setSyncMsg('');
        try {
            const res  = await dbFetch(`/.netlify/functions/holidays?year=${year}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || `Server error ${res.status}`);
            if (!data || !data.holidays) throw new Error('No holidays in response');
            // Merge: keep custom holidays, replace all observed/federal entries with fresh API data
            const fresh = data.holidays; // observed entries from API
            const preserved = customHolidays; // user-added custom entries survive
            const merged = [...fresh, ...preserved].sort((a, b) => {
                const toMs = s => { try { return new Date(`${s} ${year}`).getTime(); } catch { return 0; } };
                return toMs(a.date) - toMs(b.date);
            });
            // Store fresh federal list separately so FEDERAL_HOLIDAYS const stays in sync
            setSettings(prev => ({ ...prev, customHolidays: preserved, federalHolidays: fresh }));
            await dbFetch('/.netlify/functions/settings', { method:'PUT', body: JSON.stringify({ customHolidays: preserved, federalHolidays: fresh }) });
            setSyncMsg(`✓ Synced ${fresh.length} federal holidays for ${year}`);
            setTimeout(() => setSyncMsg(''), 4000);
        } catch (err) {
            console.error('sync holidays error', err);
            setSyncMsg(`Failed to sync — ${err.message}`);
            setTimeout(() => setSyncMsg(''), 6000);
        }
        setSyncing(false);
    };

    const customHolidays = settings?.customHolidays || [];
    const federalHolidays = settings?.federalHolidays?.length ? settings.federalHolidays : FEDERAL_HOLIDAYS;
    const allHolidays    = [...federalHolidays, ...customHolidays].sort((a, b) => {
        const toDate = s => { try { return new Date(`${s} ${year}`); } catch { return new Date(0); } };
        return toDate(a.date) - toDate(b.date);
    });

    const resetForm = () => { setFormName(''); setFormMonth(String(now.getMonth())); setFormDay('1'); setFormError(''); setShowForm(false); };

    const handleAddHoliday = async () => {
        if (!formName.trim()) { setFormError('Name is required.'); return; }
        const day = parseInt(formDay);
        const month = parseInt(formMonth);
        if (!day || day < 1 || day > 31) { setFormError('Enter a valid day.'); return; }
        const dateStr = `${MONTHS_SHORT[month]} ${day}`;
        const newHoliday = { date: dateStr, name: formName.trim(), source: 'Custom', type: 'custom' };
        const updated = [...customHolidays, newHoliday];
        setSaving(true);
        setSettings(prev => ({ ...prev, customHolidays: updated }));
        try {
            await dbFetch('/.netlify/functions/settings', { method:'PUT', body: JSON.stringify({ customHolidays: updated }) });
        } catch(e) { console.error('save holiday', e); }
        setSaving(false);
        resetForm();
    };

    const handleDeleteHoliday = async (holiday) => {
        const updated = customHolidays.filter(h => !(h.date === holiday.date && h.name === holiday.name));
        setSettings(prev => ({ ...prev, customHolidays: updated }));
        try {
            await dbFetch('/.netlify/functions/settings', { method:'PUT', body: JSON.stringify({ customHolidays: updated }) });
        } catch(e) { console.error('delete holiday', e); }
    };

    // Build 12-month grid
    const MonthGrid = ({ m }) => {
        const first = new Date(year, m, 1).getDay();
        const days  = new Date(year, m + 1, 0).getDate();
        const cells = [];
        for (let i = 0; i < first; i++) cells.push({ empty:true });
        for (let d = 1; d <= days; d++) {
            const dateStr = `${MONTHS_SHORT[m]} ${d}`;
            const hit = allHolidays.find(h => h.date === dateStr);
            cells.push({ d, hit });
        }
        const DAYS = ['S','M','T','W','T','F','S'];
        return (
            <div style={{ minWidth:0 }}>
                <div style={{ fontSize:10.5, fontWeight:700, color:T.ink, marginBottom:5, fontFamily:T.sans }}>{MONTHS_SHORT[m]} <span style={{ color:T.inkMuted, fontWeight:500 }}>{year}</span></div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:1, fontSize:9, color:T.inkMuted, marginBottom:2 }}>
                    {DAYS.map((d,i) => <div key={i} style={{ textAlign:'center', padding:'1px 0', fontFamily:T.sans }}>{d}</div>)}
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:1 }}>
                    {cells.map((c,ci) => (
                        <div key={ci} style={{ aspectRatio:'1', textAlign:'center', fontSize:9.5, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:2, fontFamily:T.sans,
                            color: c.hit ? (c.hit.type === 'custom' ? T.goldInk : T.ink) : T.inkMid,
                            fontWeight: c.hit ? 700 : 400,
                            background: c.hit ? (c.hit.type === 'custom' ? 'rgba(200,185,154,0.35)' : 'rgba(77,107,61,0.18)') : 'transparent',
                        }}>
                            {c.empty ? '' : c.d}
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    const fedCount    = federalHolidays.length;
    const customCount = allHolidays.filter(h => h.type === 'custom').length;
    const inpStyle    = { padding:'7px 10px', background:T.surface, border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:12.5, color:T.ink, fontFamily:T.sans, outline:'none', width:'100%', boxSizing:'border-box' };
    const selStyle    = { ...inpStyle, appearance:'none', cursor:'pointer',
        backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238a8378' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
        backgroundRepeat:'no-repeat', backgroundPosition:'right 8px center', paddingRight:26 };

    return (
        <DetailPageChrome
            crumb="Company calendar" title="Company calendar"
            subtitle="Shared org-wide holidays and events"
            statusDetail={`${allHolidays.length} holidays · ${year}`}
            updatedBy={settings?.updatedBy || 'Admin'} updatedAt="2 months ago"
            onBack={onBack} dirty={false} onCancel={onBack} disablePrimary={true}
            primaryAction={() => {}} primaryLabel=""
            rightActions={
                <button onClick={() => { setShowForm(v => !v); }}
                    style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'7px 14px', background:T.ink, color:'#fbf8f3', border:'none', borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>
                    + Add holiday
                </button>
            }
        >
            {/* Add holiday inline form */}
            {showForm && (
                <div style={{ background:T.surface, border:`1px solid ${T.borderStrong}`, borderRadius:T.r+2, padding:16, marginBottom:14, boxShadow:'0 2px 12px rgba(42,38,34,0.1)' }}>
                    <div style={{ fontSize:13, fontWeight:700, color:T.ink, marginBottom:12, fontFamily:T.sans }}>Add custom holiday</div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 80px 1fr auto auto', gap:10, alignItems:'flex-end' }}>
                        <div>
                            <label style={{ fontSize:11, fontWeight:600, color:T.inkMid, display:'block', marginBottom:4, fontFamily:T.sans }}>Month</label>
                            <select value={formMonth} onChange={e => setFormMonth(e.target.value)} style={selStyle}>
                                {MONTHS_FULL.map((m,i) => <option key={i} value={String(i)}>{m}</option>)}
                            </select>
                        </div>
                        <div>
                            <label style={{ fontSize:11, fontWeight:600, color:T.inkMid, display:'block', marginBottom:4, fontFamily:T.sans }}>Day</label>
                            <input type="number" min="1" max="31" value={formDay} onChange={e => { setFormDay(e.target.value); setFormError(''); }} style={inpStyle}/>
                        </div>
                        <div>
                            <label style={{ fontSize:11, fontWeight:600, color:T.inkMid, display:'block', marginBottom:4, fontFamily:T.sans }}>Name</label>
                            <input type="text" placeholder="e.g. Company offsite" value={formName} onChange={e => { setFormName(e.target.value); setFormError(''); }}
                                style={inpStyle} onKeyDown={e => { if (e.key === 'Enter') handleAddHoliday(); if (e.key === 'Escape') resetForm(); }}/>
                        </div>
                        <button onClick={handleAddHoliday} disabled={saving}
                            style={{ padding:'7px 16px', background: saving ? T.borderStrong : T.ink, color:'#fbf8f3', border:'none', borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor: saving ? 'default' : 'pointer', fontFamily:T.sans, whiteSpace:'nowrap', alignSelf:'flex-end' }}>
                            {saving ? 'Saving…' : 'Save'}
                        </button>
                        <button onClick={resetForm}
                            style={{ padding:'7px 12px', background:'transparent', color:T.inkMid, border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:T.sans, alignSelf:'flex-end' }}>
                            Cancel
                        </button>
                    </div>
                    {formError && <div style={{ fontSize:11.5, color:T.danger, marginTop:8, fontFamily:T.sans }}>{formError}</div>}
                </div>
            )}

            {/* Year strip */}
            <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:14, padding:'12px 16px', background:T.surface, border:`1px solid ${T.border}`, borderRadius:T.r, flexWrap:'wrap' }}>
                <div style={{ display:'inline-flex', background:T.surface2, border:`1px solid ${T.border}`, borderRadius:20, padding:2 }}>
                    {[year-1, year, year+1].map(y => (
                        <div key={y} onClick={() => setYear(y)} style={{ padding:'5px 14px', fontSize:12.5, fontWeight:600, cursor:'pointer', borderRadius:20, fontFamily:T.sans,
                            color: y === year ? '#fbf8f3' : T.inkMid,
                            background: y === year ? T.ink : 'transparent' }}>{y}</div>
                    ))}
                </div>
                <div style={{ width:1, height:20, background:T.border }}/>
                <div style={{ display:'flex', gap:18 }}>
                    {[{ k:'Total holidays', v:String(allHolidays.length), c:T.ink },{ k:'Federal (US)', v:String(fedCount), c:T.ok },{ k:'Custom', v:String(customCount), c:T.goldInk }].map((s,i) => (
                        <div key={i}>
                            <div style={{ fontSize:10, fontWeight:600, color:T.inkMuted, letterSpacing:0.5, textTransform:'uppercase', fontFamily:T.sans }}>{s.k}</div>
                            <div style={{ fontSize:15, fontWeight:700, color:s.c, fontFamily:T.serif, fontStyle:'italic' }}>{s.v}</div>
                        </div>
                    ))}
                </div>
                <div style={{ flex:1 }}/>
                <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:4 }}>
                    <button onClick={handleSync} disabled={syncing}
                        style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'7px 14px', background: syncing ? T.borderStrong : T.surface, color: syncing ? T.inkMuted : T.ink, border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor: syncing ? 'default' : 'pointer', fontFamily:T.sans, transition:'all 120ms' }}>
                        <LIcon name="refresh" size={13} color={syncing ? T.inkMuted : T.ink}/> {syncing ? 'Syncing…' : 'Sync federal holidays'}
                    </button>
                    {syncMsg && <div style={{ fontSize:11, color: syncMsg.startsWith('✓') ? T.ok : T.danger, fontFamily:T.sans, fontWeight:600 }}>{syncMsg}</div>}
                </div>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 440px', gap:20 }}>
                {/* Calendar grid */}
                <CSectionCard title={`Calendar ${year}`} description="Federal holidays auto-sync from the US holiday list. Custom entries are highlighted in gold.">
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14 }}>
                        {Array.from({ length:12 }).map((_,m) => <MonthGrid key={m} m={m}/>)}
                    </div>
                    <div style={{ marginTop:14, display:'flex', gap:18, fontSize:11, color:T.inkMuted, fontFamily:T.sans }}>
                        <span style={{ display:'inline-flex', alignItems:'center', gap:5 }}>
                            <span style={{ width:10, height:10, background:'rgba(77,107,61,0.4)', borderRadius:2, display:'inline-block' }}/>Observed holiday
                        </span>
                        <span style={{ display:'inline-flex', alignItems:'center', gap:5 }}>
                            <span style={{ width:10, height:10, background:'rgba(200,185,154,0.7)', borderRadius:2, display:'inline-block' }}/>Custom company event
                        </span>
                    </div>
                </CSectionCard>

                <div>
                    {/* Holiday list */}
                    <CSectionCard title="Holidays & events" description={null}>
                        <div style={{ maxHeight:520, overflowY:'auto', border:`1px solid ${T.border}`, borderRadius:T.r }}>
                            {allHolidays.length === 0 && (
                                <div style={{ padding:'2rem', textAlign:'center', color:T.inkMuted, fontSize:13, fontStyle:'italic', fontFamily:T.sans }}>No holidays yet.</div>
                            )}
                            {allHolidays.map((h,i) => (
                                <div key={`${h.date}-${h.name}`} style={{ padding:'10px 12px', display:'flex', alignItems:'center', gap:10, borderBottom: i < allHolidays.length-1 ? `1px solid ${T.border}` : 'none', background: h.type === 'custom' ? 'rgba(200,185,154,0.08)' : T.surface }}>
                                    <div style={{ width:46, fontFamily:T.serif, fontStyle:'italic', fontSize:13, fontWeight:700, color:T.ink, flexShrink:0 }}>{h.date}</div>
                                    <div style={{ flex:1, minWidth:0 }}>
                                        <div style={{ fontSize:12.5, fontWeight:600, color:T.ink, fontFamily:T.sans }}>{h.name}</div>
                                        <div style={{ fontSize:10.5, color:T.inkMuted, marginTop:1, fontFamily:T.sans }}>{h.source}</div>
                                    </div>
                                    {h.type === 'custom' ? (
                                        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                                            <span style={{ fontSize:9.5, fontWeight:700, color:T.goldInk, background:'rgba(200,185,154,0.35)', padding:'2px 6px', borderRadius:2, letterSpacing:0.3, fontFamily:T.sans }}>CUSTOM</span>
                                            <button onClick={() => handleDeleteHoliday(h)} title="Remove"
                                                style={{ background:'none', border:'none', cursor:'pointer', color:T.inkMuted, fontSize:15, lineHeight:1, padding:'0 2px', fontFamily:T.sans }}
                                                onMouseEnter={e => e.currentTarget.style.color = T.danger}
                                                onMouseLeave={e => e.currentTarget.style.color = T.inkMuted}>×</button>
                                        </div>
                                    ) : (
                                        <LIcon name="lock" size={12} color={T.inkMuted}/>
                                    )}
                                </div>
                            ))}
                        </div>
                    </CSectionCard>

                    {/* Connected sources */}
                    <CSectionCard title="Connected holiday sources" description="Auto-populate federal holidays by region. Manually added custom events stay on top.">
                        {[
                            { name:'United States · Federal',  on:true,  count:'9 holidays' },
                            { name:'Canada · Federal',         on:false, count:'—' },
                            { name:'United Kingdom · Bank',    on:false, count:'—' },
                            { name:`Google Calendar · ${settings?.companySupportEmail || 'holidays@accelerep.com'}`, on:!!(settings?.googleCalendarConnected), count: settings?.googleCalendarConnected ? 'Synced recently' : '—' },
                        ].map((s,i) => (
                            <div key={i} style={{ padding:'10px 12px', display:'flex', alignItems:'center', gap:10, borderBottom: i < 3 ? `1px solid ${T.border}` : 'none' }}>
                                <div style={{ width:8, height:8, borderRadius:'50%', background: s.on ? T.ok : T.border, flexShrink:0 }}/>
                                <div style={{ flex:1, fontSize:12.5, color:T.ink, fontWeight:500, fontFamily:T.sans }}>{s.name}</div>
                                <div style={{ fontSize:11, color:T.inkMuted, fontFamily:T.sans }}>{s.count}</div>
                                <span style={{ fontSize:11, fontWeight:600, color: s.on ? T.inkMid : T.goldInk, cursor:'pointer', fontFamily:T.sans }}>{s.on ? 'Disconnect' : 'Connect'}</span>
                            </div>
                        ))}
                    </CSectionCard>
                </div>
            </div>
        </DetailPageChrome>
    );
};
