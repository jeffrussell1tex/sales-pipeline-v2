// settings/company/FiscalYearDetail.jsx
import React, { useState, useEffect } from 'react';
import { useRegisterSave } from '../shared/useRegisterSave.js';
import { dbFetch } from '../../../utils/storage';
import { putSettings } from '../shared/saveSettings.js';
import { T } from '../shared/tokens.js';
import { CField, CSelect, CSectionCard, DetailPageChrome } from '../shared/form.jsx';
import { LIcon } from '../shared/ui.jsx';
import { MONTHS_SHORT, MONTHS_FULL, QUARTER_COLORS, QUARTER_INKS } from './constants.js';
import { fiscalStartOf, currentQuarter } from '../../../utils/quarters.js';
import { fiscalRange } from '../../../utils/reportPeriod.js';
import { isoLocal } from '../../../utils/dateLocal.js';
import { cleanQuotaPeriods } from '../../../utils/quotaPlan.js';
import { fiscalYearDetail } from '../../../utils/settingsCards.js';

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
    // The month every screen reads (state §0.203): January when none is set — it showed
    // October, so picking October changed nothing and saved nothing.
    const savedStart = fiscalStartOf(settings?.fiscalYearStart) - 1; // DB is 1-indexed, UI is 0-indexed
    const startNeverSet = fiscalYearDetail(settings?.fiscalYearStart) === null;   // the Settings card's own test: no month 1–12 saved
    // How each rep's yearly quota is broken down — quarters or months (state §0.203).
    const savedPeriods = cleanQuotaPeriods(settings?.quotaPeriods);
    // With no month saved the select names none (state §0.203): it showed January — the month
    // every screen then reads — and January could not be saved, picking the month shown being no change.
    const savedPick = startNeverSet ? null : savedStart;
    // A pick is held only once made (undefined until then, and again after a save): the page
    // follows this org's saved settings — a copy taken at open went stale when they were read
    // again, and the page then showed one month and saved the old one as a change.
    const [picked, setPicked] = useState(undefined);
    const [pickedPeriods, setPickedPeriods] = useState(undefined);
    const startMonth = picked ?? savedPick;
    const shownStart = startMonth ?? savedStart;   // what the page draws: January until a month is picked
    const periods = pickedPeriods ?? savedPeriods;
    const [saveError, setSaveError] = useState('');
    const [saving, setSaving] = useState(false);
    // Unsaved is what differs from the saved settings — a pick back to them is no change.
    const startChanged = picked !== undefined && picked !== savedPick;
    const periodsChanged = pickedPeriods !== undefined && pickedPeriods !== savedPeriods;
    const dirty = startChanged || periodsChanged;

    const handleCancel = () => { setPicked(undefined); setPickedPeriods(undefined); };
    const handleSave = async () => {
        // Only what changed (Jeff, 15 Oct: "Send only what changed"): a page opened before
        // another Admin's change must not put the old value back.
        const payload = {};
        if (startChanged) payload.fiscalYearStart = startMonth + 1; // 0-indexed UI to the 1-indexed DB (matches AppContext)
        if (periodsChanged) payload.quotaPeriods = periods;
        if (!Object.keys(payload).length) return;
        setSaving(true);
        try {
            // Was a bare dbFetch with no res.ok check, then setDirty(false)
            // OUTSIDE the try — so a 403 cleared the flag and reported success.
            // putSettings throws on non-2xx; the rethrow lets the navigation
            // guard know the save did not land.
            await putSettings(payload);
            // The app's copy follows the save (state §0.170): set before it, a
            // refused save moved every quarter in the app anyway, until a reload.
            setSettings(prev => ({ ...prev, ...payload }));
            setPicked(undefined); setPickedPeriods(undefined);   // the page follows the saved settings again
            setSaveError('');
        } catch (e) {
            setSaveError(e.message);
            setSaving(false);
            throw e;
        }
        setSaving(false);
    };
    // Sync dirty state to app-level nav guard
    React.useEffect(() => { if (setSettingsDirty) setSettingsDirty(dirty); return () => { if (setSettingsDirty) setSettingsDirty(false); }; }, [dirty]);
    useRegisterSave(settingsSaveRef, dirty, handleSave);

    // The current period from quarters.js, the reader every screen uses (state §0.203).
    const fiscalStart = shownStart + 1;
    const cq = currentQuarter(fiscalStart);
    const fy = fiscalRange(cq.fiscalYear, 'FY', fiscalStart);
    const day = (iso) => new Date(iso + 'T12:00:00');
    const short = (iso) => `${MONTHS_SHORT[day(iso).getMonth()]} ${day(iso).getDate()}`;
    // At noon, as `day`: from midnight, a spring-forward on the way read a day short.
    const nextQStart = new Date(day(cq.to).getFullYear(), day(cq.to).getMonth(), day(cq.to).getDate() + 1, 12);
    const daysTo = (d) => Math.round((d - day(isoLocal(new Date()))) / 86400000);
    const savedQ = currentQuarter(savedStart + 1);

    return (
        <DetailPageChrome
            error={saveError}
            crumb="Fiscal year" title="Fiscal year"
            subtitle="Quarter starts and fiscal year alignment"
            statusDetail={`Q1 starts ${MONTHS_SHORT[shownStart]} 1`}
            onBack={onBack} dirty={dirty} onCancel={handleCancel}
            primaryAction={handleSave} primaryLabel={saving ? 'Saving…' : 'Save changes'}
        >
            <div style={{ display:'grid', gridTemplateColumns:'1fr 360px', gap:20 }}>
                {/* LEFT */}
                <div>
                    <CSectionCard title="Fiscal calendar" description={'Choose the month your fiscal year begins. Pipeline, forecast, and every report that says "this quarter" or "this FY" derives from this setting.'}>
                        <div style={{ display:'flex', gap:20, alignItems:'flex-start', marginBottom:24, flexWrap:'wrap' }}>
                            <CField label="Fiscal year starts">
                                <CSelect value={startMonth === null ? '' : String(startMonth)} onChange={v => setPicked(v === '' ? undefined : parseInt(v, 10))}
                                    options={[...(startNeverSet ? [{ value:'', label:'Not set — January' }] : []), ...MONTHS_FULL.map((m, i) => ({ value:String(i), label:m }))]}/>
                            </CField>
                        </div>
                        {startNeverSet && !startChanged && (
                            <div style={{ fontSize:11.5, color:T.inkMid, marginTop:-12, marginBottom:16, fontFamily:T.sans }}>
                                Not set yet — every screen reads a January start until you save a month.
                            </div>
                        )}
                        {startChanged && (shownStart === savedStart ? (
                            <div style={{ fontSize:11.5, color:T.inkMid, marginTop:-12, marginBottom:16, fontFamily:T.sans }}>
                                Saving records {MONTHS_FULL[shownStart]} — every screen reads it already, so nothing moves.
                            </div>
                        ) : (
                            <div style={{ fontSize:11.5, color:T.warn, marginTop:-12, marginBottom:16, fontFamily:T.sans }}>
                                Quota plans are kept by fiscal year. Moving the start changes which months each year's plan covers, and today becomes {cq.label} (it is {savedQ.label} now).
                            </div>
                        ))}
                        <div style={{ fontSize:11, fontWeight:700, color:T.inkMuted, textTransform:'uppercase', letterSpacing:0.8, marginBottom:10, fontFamily:T.sans }}>Current quarter map · Calendar {new Date().getFullYear()}</div>
                        <FiscalRibbon startMonth={shownStart}/>
                    </CSectionCard>

                    <CSectionCard title="Current period" description={"What Accelerep considers 'today' for every fiscal calculation."}>
                        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14 }}>
                            {[
                                { k:'Current fiscal year', v:`FY${cq.fiscalYear}`, sub:`${short(fy.from)}, ${fy.from.slice(0,4)} → ${short(fy.to)}, ${fy.to.slice(0,4)}` },
                                { k:'Current quarter',     v:cq.label,               sub:`${short(cq.from)} – ${short(cq.to)}` },
                                { k:'Next quarter start',  v:`${MONTHS_SHORT[nextQStart.getMonth()]} 1`, sub:`in ${daysTo(nextQStart)} days` },
                                { k:'Fiscal year-end',     v:short(fy.to),           sub:`in ${daysTo(day(fy.to))} days` },
                            ].map((c, i) => (
                                <div key={i} style={{ padding:'12px 14px', background:T.surface2, borderRadius:T.r, border:`1px solid ${T.border}` }}>
                                    <div style={{ fontSize:10, fontWeight:600, color:T.inkMuted, letterSpacing:0.5, textTransform:'uppercase', marginBottom:4, fontFamily:T.sans }}>{c.k}</div>
                                    <div style={{ fontSize:17, fontWeight:700, color:T.ink, fontFamily:T.serif, fontStyle:'italic' }}>{c.v}</div>
                                    <div style={{ fontSize:11, color:T.inkMid, marginTop:3, fontFamily:T.sans }}>{c.sub}</div>
                                </div>
                            ))}
                        </div>
                    </CSectionCard>

                    <CSectionCard title="Quota periods" description="How each rep's yearly quota is broken down on the Sales Manager tab. Each rep's periods may ramp and must add up to their yearly quota; attainment is shown by quarter and year.">
                        <CField label="Break yearly quotas into">
                            <CSelect value={periods} onChange={v => setPickedPeriods(cleanQuotaPeriods(v))}
                                options={[{ value:'quarters', label:'Quarters (4 a year)' }, { value:'months', label:'Months (12 a year)' }]}/>
                        </CField>
                        {periodsChanged && (
                            <div style={{ fontSize:11.5, color:T.inkMid, marginTop:8, fontFamily:T.sans }}>
                                Switching changes no saved figure. {periods === 'months' ? 'Each rep\'s months start as their quarters split three ways until saved.' : 'Each rep\'s quarters stay as saved.'}
                            </div>
                        )}
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
