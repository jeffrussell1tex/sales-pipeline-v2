// settings/salesProcess/FunnelStagesDetail.jsx
import React, { useState } from 'react';
import { useRegisterSave } from '../shared/useRegisterSave.js';
import { T } from '../shared/tokens.js';
import { putSettings } from '../shared/saveSettings.js';
import { usePanelRevs } from '../shared/usePanelRevs.js';
import { CSectionCard } from '../shared/form.jsx';
import { SPTable } from './shared.jsx';
import { CategoryDetailChrome } from '../shared/CategoryDetailChrome.jsx';
import { useApp } from '../../../AppContext';
import { stagePalette } from '../../../utils/stageOrder.js';
import { STAGE_MAX, stagesRefused, stageRowsOf, stagesSent, dealsByStage, dealsIn, nameLocked, removable, renameWords, stageRenames, stagesToStore, renamedDeal, renamedViews, renamesLanded, addedRow, editedRow, removedRow, movedRow, typedWeight } from '../../../utils/stages.js';

const plain = { background:'none', border:'none', padding:'2px 5px', fontSize:13, lineHeight:1, color:T.inkMid, cursor:'pointer', fontFamily:T.sans };
const iconButton = (off) => (off ? { ...plain, color:T.border, cursor:'default' } : plain);
const nameInput = { width:'100%', padding:'4px 8px', fontSize:13, fontWeight:600, border:`1px solid ${T.border}`, borderRadius:T.r, background:T.surface, color:T.ink, fontFamily:T.sans, boxSizing:'border-box' };

// The Pipeline tab's saved views live in this browser (PipelineTab.jsx): a renamed stage's go with it.
const renameSavedViews = (orgId, renames) => {
    const key = 'pipelineSavedViews:' + (orgId || 'none');
    try { const held = localStorage.getItem(key); if (held) localStorage.setItem(key, JSON.stringify(renamedViews(JSON.parse(held), renames))); } catch { /* storage refused: the views keep the old name */ }
};

export const FunnelStagesDetail = ({ settings, setSettings, onBack, setSettingsDirty, settingsSaveRef }) => {
    const { opportunities, setOpportunities, loadOpportunities, activeOrgId } = useApp();   // the deals, read before this page is drawn (PanelGate, state §0.299)
    // Each stage's weight is what the app reads (Q7): a stored stage holds name and weight. A workspace with none saved shows
    // the app's own (Jeff, 17 Nov, Q7).
    const saved = stageRowsOf(settings?.funnelStages);
    const [rows, setRows]     = useState(saved);
    const [dirty, setDirty]   = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState('');
    const added = React.useRef(0);
    const unproven = React.useRef([]);   // the saves whose answer proved nothing: what each sent, and renamed

    const counts = dealsByStage(opportunities);
    const change = (fn) => { setRows(fn); setDirty(true); };
    const update = (key, field, val) => change(prev => editedRow(prev, key, field, val));
    const addStage = () => { const n = added.current += 1; change(prev => addedRow(prev, n)); };
    // Not while a save is out: what it sent is what the page shows when it lands (the controls below wait too).
    const handleCancel = () => { if (saving) return; setRows(saved); setDirty(false); setSaveError(''); };
    // The tokens as this panel opened (state §0.226): its save sends them, a landed save merges what it answered, and a
    // save refused because another landed first remounts the panel on the latest (J-B5).
    const { opened, landed, panelStale, once } = usePanelRevs(settings, setSettings);
    // A rename of another's landed first, or one of this page's own did unanswered: the deals are read again, and this browser's
    // saved views follow the page's own where the latest list shows it landed (state §0.302).
    const afterLatest = async () => {
        loadOpportunities();
        const list = await new Promise(done => setSettings(prev => { done(prev?.funnelStages); return prev; }));
        const ours = renamesLanded(unproven.current, list);
        if (ours.length) renameSavedViews(activeOrgId, ours);
    };
    const save = async () => {
        const stages = stagesSent(rows, settings?.funnelStages);
        // The server's own rule, said before anything is sent (state §0.299; src/utils/stages.js).
        const words = stagesRefused(stages, settings?.funnelStages)?.error;
        if (words) { setSaveError(words); throw new Error(words); }
        setSaving(true);
        try {
            const answer = await putSettings({ funnelStages: stages }, opened);
            // The app's copy follows the save (state §0.170): set before it, a refused save showed anyway.
            const kept = stagesToStore(stages, settings?.funnelStages), renames = stageRenames(stages, settings?.funnelStages);
            setSettings(prev => ({ ...prev, funnelStages: kept }));
            // What the save renamed on the server, in the app's copy of the deals and this browser's saved views (state §0.302).
            if (renames.length) {
                setOpportunities(prev => prev.map(d => renamedDeal(d, renames)));
                renameSavedViews(activeOrgId, renames);
            }
            unproven.current = [];
            landed(answer);
            setRows(stageRowsOf(kept));
            setSaveError('');
            setDirty(false);
        } catch (e) {
            // Another save landed first (state §0.226): AdminView takes the latest and remounts this panel, its words above
            // it. Unread, the server's words below and the draft kept.
            if (e.stale && await panelStale(e)) throw e;
            if (e.unknown) unproven.current = [...unproven.current, { list: stagesToStore(stages, settings?.funnelStages), renames: stageRenames(stages, settings?.funnelStages) }];
            // Keep the panel dirty: the change was not saved, or may not have been (an answer that proved nothing, said as
            // maybe — state §0.264); clearing the
            // flag here is what made a 403 look like success.
            setSaveError(e.message);
            // Clear the spinner BEFORE rethrowing — the `setSaving(false)` after
            // this try/catch is skipped by the throw, and the panel would sit on
            // "Saving…" for the rest of the session.
            setSaving(false);
            // Rethrow so the navigation guard knows the save failed. The panel
            // already keeps itself dirty and shows the error; without this the
            // guard's `await save()` resolves and it navigates away.
            throw e;
        }
        setSaving(false);
    };
    const handleSave = once(async () => {
        try { await save(); } catch (e) { if (e.tookLatest) await afterLatest(); throw e; }
    });
    // Sync dirty state to app-level nav guard
    React.useEffect(() => { if (setSettingsDirty) setSettingsDirty(dirty); return () => { if (setSettingsDirty) setSettingsDirty(false); }; }, [dirty]);
    useRegisterSave(settingsSaveRef, dirty, handleSave);

    const openStages = rows.filter(r => !r.close);
    const palette = stagePalette(openStages.map(r => r.key));
    const colorOf = (r) => palette[r.close ? r.name : r.key];

    return (
        <CategoryDetailChrome error={saveError}
            crumb="Funnel stages" title="Funnel stages"
            subtitle="Stage names, order and default win probability"
            statusDetail={`${rows.length} stages`}
            onBack={onBack} dirty={dirty} onCancel={handleCancel}
            primaryAction={handleSave} primaryLabel={saving ? 'Saving…' : 'Save changes'}
            disablePrimary={!dirty || saving}
        >
            <fieldset disabled={saving} style={{ display:'grid', gridTemplateColumns:'minmax(0,1fr) 380px', gap:20, border:'none', padding:0, margin:0, minWidth:0 }}>
                {/* Left: stage table */}
                <div>
                    <CSectionCard
                        title="Deal stages"
                        description="The stages a deal moves through, in order. A deal's own forecast category says whether it is commit or best case; with none set, the last two open stages are commit and the one before them best case. Renaming a stage renames it on its deals, in their history, and in the automations and saved reports that name it. A stage with deals in it is not removed — move them first."
                        headAction={<button onClick={addStage} style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'5px 11px', background:'transparent', border:`1px solid ${T.border}`, color:T.ink, fontSize:12, fontWeight:500, borderRadius:T.r, cursor:'pointer', fontFamily:T.sans }}>+ Add stage</button>}
                    >
                        <SPTable
                            columns={[
                                { key:'order',  label:'Order',         w:'64px' },
                                { key:'name',   label:'Stage',         w:'1.6fr' },
                                { key:'weight', label:'Default prob.', w:'110px', align:'right' },
                                { key:'type',   label:'Type',          w:'60px' },
                                { key:'deals',  label:'Deals',         w:'60px', align:'right' },
                                { key:'remove', label:'',              w:'76px', align:'right' },
                            ]}
                            rows={rows.map((s, i) => {
                                const fixed = s.close;
                                const n = dealsIn(s, counts);
                                const locked = nameLocked(s);
                                const words = renameWords(s, counts);
                                const called = s.name || 'the new stage';
                                const up = movedRow(rows, i, -1) !== rows, down = movedRow(rows, i, 1) !== rows;
                                return {
                                    key: s.key,
                                    order: fixed ? null : (
                                        <span style={{ display:'inline-flex' }}>
                                            <button aria-label={`Move ${called} up`} disabled={!up} onClick={() => change(prev => movedRow(prev, i, -1))} style={iconButton(!up)}>↑</button>
                                            <button aria-label={`Move ${called} down`} disabled={!down} onClick={() => change(prev => movedRow(prev, i, 1))} style={iconButton(!down)}>↓</button>
                                        </span>
                                    ),
                                    name: <span style={{ display:'flex', alignItems:'center', gap:8 }}>
                                        <span style={{ width:12, height:12, borderRadius:'50%', background:colorOf(s), flexShrink:0 }}/>
                                        {locked
                                            ? <b style={{ fontFamily:T.sans }}>{s.name}</b>
                                            : <input aria-label={s.was ? `Name of ${s.was}` : 'Name of the new stage'} value={s.name} maxLength={STAGE_MAX} placeholder="Stage name" autoFocus={!s.was} onChange={e => update(s.key, 'name', e.target.value)} style={nameInput}/>}
                                        {words && <span style={{ fontSize:11, color:T.inkMuted, fontFamily:T.sans, flexShrink:0, maxWidth:150 }}>{words}</span>}
                                    </span>,
                                    weight: <input type="number" min="0" max="100" aria-label={`Default probability of ${called}`} value={s.weight}
                                        onChange={e => update(s.key, 'weight', typedWeight(e.target.value))}
                                        style={{ width:60, padding:'3px 6px', fontSize:12, border:`1px solid ${T.border}`, borderRadius:T.r, background:T.surface, color:T.ink, fontFamily:'ui-monospace,Menlo,monospace', textAlign:'right' }}/>,
                                    type: <span style={{ fontSize:12, color:T.inkMid, fontFamily:T.sans }}>{!s.close ? 'Open' : s.name === 'Closed Won' ? 'Won' : 'Lost'}</span>,
                                    deals: <span style={{ fontSize:12, color:T.inkMid, fontVariantNumeric:'tabular-nums' }}>{n}</span>,
                                    remove: removable(s, counts) ? <button aria-label={`Remove ${called}`} onClick={() => change(prev => removedRow(prev, s.key))} style={{ ...plain, fontSize:12 }}>Remove</button> : null,
                                };
                            })}
                        />
                    </CSectionCard>
                </div>

                {/* Right: live probability curve */}
                <div>
                    <div style={{ position:'sticky', top:20, background:T.surface, border:`1px solid ${T.border}`, borderRadius:T.r+4, overflow:'hidden' }}>
                        <div style={{ padding:'14px 16px', background:'#2a2622', color:'#fbf8f3' }}>
                            <div style={{ fontSize:10, fontWeight:700, color:T.gold, letterSpacing:0.8, textTransform:'uppercase', marginBottom:5, fontFamily:T.sans }}>Probability curve</div>
                            <div style={{ fontSize:13, color:'#fbf8f3', lineHeight:1.5, fontFamily:T.sans }}>Each open stage's default probability, in order.</div>
                        </div>
                        <div style={{ padding:'16px 16px 8px' }}>
                            <svg width="100%" height="160" viewBox="0 0 320 160" preserveAspectRatio="none">
                                {[0,25,50,75,100].map((v,i) => (
                                    <line key={i} x1="30" x2="310" y1={136 - i*28} y2={136-i*28} stroke={T.border} strokeWidth="1" strokeDasharray="3 3"/>
                                ))}
                                {openStages.length > 1 && (
                                    <path
                                        d={openStages.map((s,i) => {
                                            const x = 30 + (i/(openStages.length-1))*280;
                                            const y = 136 - (s.weight/100)*112;
                                            return `${i===0?'M':'L'}${x} ${y}`;
                                        }).join(' ')}
                                        stroke={T.goldInk} strokeWidth="2" fill="none"
                                    />
                                )}
                                {openStages.map((s,i) => {
                                    const x = 30 + (i/(Math.max(openStages.length-1,1)))*280;
                                    const y = 136 - (s.weight/100)*112;
                                    return <circle key={s.key} cx={x} cy={y} r="4" fill={colorOf(s)}/>;
                                })}
                                {[0,25,50,75,100].map((v,i) => (
                                    <text key={i} x="22" y={140-i*28} fontSize="9" fill={T.inkMuted} textAnchor="end">{v}%</text>
                                ))}
                            </svg>
                            <div style={{ display:'flex', justifyContent:'space-between', fontSize:9, color:T.inkMuted, padding:'0 4px 8px', fontFamily:T.sans }}>
                                {openStages.map(s => <span key={s.key}>{(s.name || 'New').split(' ')[0]}</span>)}
                            </div>
                        </div>
                        <div style={{ padding:'12px 14px', background:'rgba(77,107,61,0.08)', borderTop:`1px solid ${T.border}` }}>
                            <div style={{ fontSize:11.5, color:T.inkMid, lineHeight:1.55, fontFamily:T.sans }}>
                                <b style={{ color:T.ink }}>Forecast math.</b> A deal moved to a stage, on the board or in its window, takes that stage's default unless the rep set their own; a deal won or lost takes the close's. Weighted pipeline is each deal's revenue times its probability — its stage's default where it has none.
                            </div>
                        </div>
                    </div>
                </div>
            </fieldset>
        </CategoryDetailChrome>
    );
};
