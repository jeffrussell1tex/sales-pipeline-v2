// settings/company/FiscalYearDetail.jsx
import React, { useState, useEffect } from 'react';
import { dbFetch } from '../../../utils/storage';
import { putSettings } from '../shared/saveSettings.js';
import { T } from '../shared/tokens.js';
import { CField, CSelect, CSectionCard, DetailPageChrome } from '../shared/form.jsx';
import { LIcon } from '../shared/ui.jsx';
import { MONTHS_SHORT, MONTHS_FULL, QUARTER_COLORS, QUARTER_INKS } from './constants.js';

const FiscalRibbon = ({ startMonth }) => {
    const quarters = [];
    for (let q = 0; q < 4; q++) {
        const start = (startMonth + q * 3) % 12;
        quarters.push({ label:`Q${q+1}`, months:[start,(start+1)%12,(start+2)%12], start });
    }
    return (
        <div>
            <div style={{ display:'flex', gap:2, marginBottom:6 }}>
                {Array.from({ length:12 }).map((_, m) => {
                    const q = quarters.findIndex(qq => qq.months.includes(m));
                    return (
                        <div key={m} style={{ flex:1, padding:'20px 0 12px', textAlign:'center', background:QUARTER_COLORS[q], borderTop:`2px solid ${QUARTER_INKS[q]}`, position:'relative' }}>
                            <div style={{ fontSize:10, fontWeight:600, color:T.inkMid, fontFamily:T.sans }}>{MONTHS_SHORT[m]}</div>
                            {quarters[q].start === m && (
                                <div style={{ position:'absolute', top:4, left:5, fontSize:9, fontWeight:700, color:QUARTER_INKS[q], letterSpacing:0.4, fontFamily:T.sans }}>{quarters[q].label}</div>
                            )}
                            {m === 0 && (
                                <div style={{ position:'absolute', bottom:-14, left:'50%', transform:'translateX(-50%)', fontSize:8, color:T.inkMuted, fontWeight:600, letterSpacing:0.3, whiteSpace:'nowrap', fontFamily:T.sans }}>CAL YR START</div>
                            )}
                        </div>
                    );
                })}
            </div>
            <div style={{ marginTop:22, display:'flex', alignItems:'center', gap:14, fontSize:11, color:T.inkMuted, flexWrap:'wrap', fontFamily:T.sans }}>
                {quarters.map((q, i) => (
                    <div key={i} style={{ display:'inline-flex', alignItems:'center', gap:5 }}>
                        <div style={{ width:10, height:10, background:QUARTER_COLORS[i], border:`1px solid ${QUARTER_INKS[i]}` }}/>
                        <span><b style={{ color:T.ink }}>{q.label}</b> · {MONTHS_SHORT[q.start]}–{MONTHS_SHORT[(q.start+2)%12]}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

export const FiscalYearDetail = ({ settings, setSettings, onBack, setSettingsDirty, settingsSaveRef }) => {
    const savedStart = (parseInt(settings?.fiscalYearStart) || 10) - 1; // DB is 1-indexed, UI is 0-indexed
    const [startMonth, setStartMonth] = useState(savedStart);
    const [dirty, setDirty]   = useState(false);
    const [saveError, setSaveError] = useState('');
    const [saving, setSaving] = useState(false);

    const handleCancel = () => { setStartMonth(savedStart); setDirty(false); };
    const handleSave = async () => {
        setSaving(true);
        const dbValue = startMonth + 1; // convert 0-indexed UI to 1-indexed DB (matches AppContext)
        setSettings(prev => ({ ...prev, fiscalYearStart: dbValue }));
        try {
            // Was a bare dbFetch with no res.ok check, then setDirty(false)
            // OUTSIDE the try — so a 403 cleared the flag and reported success.
            // putSettings throws on non-2xx; the rethrow lets the navigation
            // guard know the save did not land.
            await putSettings({ fiscalYearStart: dbValue });
            setSaveError('');
            setDirty(false);
        } catch (e) {
            setSaveError(e.message);
            setSaving(false);
            throw e;
        }
        setSaving(false);
    };
    // Sync dirty state to app-level nav guard
    React.useEffect(() => { if (setSettingsDirty) setSettingsDirty(dirty); return () => { if (setSettingsDirty) setSettingsDirty(false); }; }, [dirty]);
    React.useEffect(() => {
        if (!settingsSaveRef) return;
        settingsSaveRef.current = dirty ? handleSave : null;
        return () => { if (settingsSaveRef) settingsSaveRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dirty]);

    // Compute current period display
    const now = new Date();
    const calYear = now.getFullYear();
    const fyEndMonth = (startMonth + 11) % 12;
    const fyEndYear  = startMonth <= fyEndMonth ? calYear : calYear + 1;
    const fyStartYear = startMonth > now.getMonth() ? calYear - 1 : calYear;
    const fyLabel = `FY${String(fyStartYear + 1).slice(-2)}`;
    const currentQ = Math.floor(((now.getMonth() - startMonth + 12) % 12) / 3) + 1;
    const qStartM  = (startMonth + (currentQ - 1) * 3) % 12;
    const qEndM    = (qStartM + 2) % 12;
    const nextQStartM = (qStartM + 3) % 12;
    const nextQDate = new Date(calYear, nextQStartM, 1);
    const fyEndDate = new Date(fyEndYear, fyEndMonth + 1, 0);
    const daysToNextQ = Math.round((nextQDate - now) / 86400000);
    const daysToFYEnd = Math.round((fyEndDate - now) / 86400000);

    return (
        <DetailPageChrome
            error={saveError}
            crumb="Fiscal year" title="Fiscal year"
            subtitle="Quarter starts and fiscal year alignment"
            statusDetail={`Q1 starts ${MONTHS_SHORT[startMonth]} 1`}
            onBack={onBack} dirty={dirty} onCancel={handleCancel}
            primaryAction={handleSave} primaryLabel={saving ? 'Saving…' : 'Save changes'}
        >
            <div style={{ display:'grid', gridTemplateColumns:'1fr 360px', gap:20 }}>
                {/* LEFT */}
                <div>
                    <CSectionCard title="Fiscal calendar" description={'Choose the month your fiscal year begins. Pipeline, forecast, and every report that says "this quarter" or "this FY" derives from this setting.'}>
                        <div style={{ display:'flex', gap:20, alignItems:'flex-start', marginBottom:24, flexWrap:'wrap' }}>
                            <CField label="Fiscal year starts">
                                <CSelect value={String(startMonth)} onChange={v => { setStartMonth(parseInt(v)); setDirty(true); }}
                                    options={MONTHS_FULL.map((m, i) => ({ value:String(i), label:m }))}/>
                            </CField>
                        </div>
                        <div style={{ fontSize:11, fontWeight:700, color:T.inkMuted, textTransform:'uppercase', letterSpacing:0.8, marginBottom:10, fontFamily:T.sans }}>Current quarter map · Calendar {calYear}</div>
                        <FiscalRibbon startMonth={startMonth}/>
                    </CSectionCard>

                    <CSectionCard title="Current period" description={"What Accelerep considers 'today' for every fiscal calculation."}>
                        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14 }}>
                            {[
                                { k:'Current fiscal year', v:fyLabel,              sub:`${MONTHS_SHORT[startMonth]} 1, ${fyStartYear} → ${MONTHS_SHORT[fyEndMonth]} ${fyEndDate.getDate()}, ${fyEndYear}` },
                                { k:'Current quarter',     v:`Q${currentQ} ${fyLabel}`, sub:`${MONTHS_SHORT[qStartM]}–${MONTHS_SHORT[qEndM]}` },
                                { k:'Next quarter start',  v:MONTHS_SHORT[nextQStartM]+' 1', sub:`in ${daysToNextQ} days` },
                                { k:'Fiscal year-end',     v:`${MONTHS_SHORT[fyEndMonth]} ${fyEndDate.getDate()}`, sub:`in ${daysToFYEnd} days` },
                            ].map((c, i) => (
                                <div key={i} style={{ padding:'12px 14px', background:T.surface2, borderRadius:T.r, border:`1px solid ${T.border}` }}>
                                    <div style={{ fontSize:10, fontWeight:600, color:T.inkMuted, letterSpacing:0.5, textTransform:'uppercase', marginBottom:4, fontFamily:T.sans }}>{c.k}</div>
                                    <div style={{ fontSize:17, fontWeight:700, color:T.ink, fontFamily:T.serif, fontStyle:'italic' }}>{c.v}</div>
                                    <div style={{ fontSize:11, color:T.inkMid, marginTop:3, fontFamily:T.sans }}>{c.sub}</div>
                                </div>
                            ))}
                        </div>
                    </CSectionCard>

                    <CSectionCard title="Reporting adjustments" description="Advanced — how weeks and months roll up inside a quarter. Default 3-4-4 is standard for retail; 4-4-5 is common for financial services.">
                        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
                            {[
                                { k:'3-4-4', on:true,  hint:'Standard calendar-month quarter' },
                                { k:'4-4-5', on:false, hint:'13-week quarter, weekly alignment' },
                                { k:'4-5-4', on:false, hint:'Retail 4-5-4 calendar' },
                            ].map((o, i) => (
                                <div key={i} style={{ padding:'12px 14px', border:`1.5px solid ${o.on ? T.goldInk : T.border}`, borderRadius:T.r, background: o.on ? 'rgba(200,185,154,0.12)' : T.surface, position:'relative' }}>
                                    <div style={{ fontSize:14, fontWeight:700, color:T.ink, fontFamily:T.serif }}>{o.k}</div>
                                    <div style={{ fontSize:11.5, color:T.inkMid, marginTop:3, fontFamily:T.sans }}>{o.hint}</div>
                                    {o.on && <div style={{ position:'absolute', top:8, right:10, fontSize:10, fontWeight:700, color:T.goldInk, letterSpacing:0.4, fontFamily:T.sans }}>● ACTIVE</div>}
                                </div>
                            ))}
                        </div>
                    </CSectionCard>
                </div>

                {/* RIGHT — impact panel */}
                <div>
                    <div style={{ position:'sticky', top:20, background:T.surface, border:`1px solid ${T.border}`, borderRadius:8, overflow:'hidden' }}>
                        <div style={{ padding:'14px 16px', background:'#2a2622', color:'#fbf8f3' }}>
                            <div style={{ fontSize:10, fontWeight:700, color:T.gold, letterSpacing:0.8, textTransform:'uppercase', marginBottom:6, fontFamily:T.sans }}>What this controls</div>
                            <div style={{ fontSize:13, color:'#fbf8f3', lineHeight:1.5, fontFamily:T.sans }}>
                                Changing fiscal year realigns <b style={{ color:T.gold }}>6 areas</b> of the app. Preview before saving.
                            </div>
                        </div>
                        <div style={{ padding:4 }}>
                            {[
                                { name:'Pipeline & Forecast',     items:'"This quarter" / "This FY" filters' },
                                { name:'Sales Manager dashboard', items:'Quota attainment windows' },
                                { name:'Opportunity close date',  items:'Auto-calculated quarter badge' },
                                { name:'Reports & dashboards',    items:'12 reports use fiscal periods' },
                                { name:'Automations',             items:'3 rules scheduled per quarter' },
                                { name:'Leaderboards',            items:'Team rankings reset boundary' },
                            ].map((item, i) => (
                                <div key={i} style={{ padding:'11px 12px', borderBottom: i < 5 ? `1px solid ${T.border}` : 'none', display:'flex', alignItems:'flex-start', gap:10 }}>
                                    <LIcon name="link" size={13} color={T.goldInk} style={{ marginTop:2, flexShrink:0 }}/>
                                    <div>
                                        <div style={{ fontSize:12.5, fontWeight:600, color:T.ink, fontFamily:T.sans }}>{item.name}</div>
                                        <div style={{ fontSize:11, color:T.inkMuted, marginTop:2, fontFamily:T.sans }}>{item.items}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div style={{ padding:'10px 12px', borderTop:`1px solid ${T.border}`, background:T.surface2 }}>
                            <div style={{ fontSize:11, color:T.inkMuted, lineHeight:1.5, fontFamily:T.sans }}>
                                <LIcon name="info" size={11} color={T.inkMuted}/>{' '}
                                Historical reports stay stable. Existing reports keep the fiscal year they were generated with.
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </DetailPageChrome>
    );
};
