// settings/salesProcess/PipelinesDetail.jsx
import React, { useState } from 'react';
import { putSettings } from '../shared/saveSettings.js';
import { T } from '../shared/tokens.js';
import { CSectionCard } from '../shared/form.jsx';
import { LIcon } from '../shared/ui.jsx';
import { SPTable, SPDrag } from './shared.jsx';
import { CategoryDetailChrome } from '../shared/CategoryDetailChrome.jsx';

const STAGE_COLORS = {
    'Prospecting':'#e07b4a','Qualification':'#d4a847','Discovery':'#8aab5a',
    'Proposal':'#4a8abd','Negotiation':'#7a5abd','Closing':'#4aad8a',
    'Closed Won':'#4d6b3d','Closed Lost':'#9c3a2e',
};

const DEFAULT_PIPELINES = [
    { id:'new-biz',  name:'New business', isDefault:true,
      stages:['Prospecting','Qualification','Discovery','Proposal','Negotiation','Closing','Closed Won','Closed Lost'],
      active:147, value:'$4.8M', teams:['SMB West','SMB East','Mid-Market'] },
    { id:'renewal',  name:'Renewals', isDefault:false,
      stages:['Upcoming','Engaged','Negotiating','Renewed','Churned'],
      active:62, value:'$2.1M', teams:['Customer Success'] },
    { id:'exp',      name:'Expansion', isDefault:false,
      stages:['Identified','Qualified','Proposal','Commit','Won','Lost'],
      active:38, value:'$890k', teams:['Account Management'] },
];

const STAGE_PROBS = { 'Prospecting':10,'Qualification':25,'Discovery':40,'Proposal':60,'Negotiation':80,'Closing':90,'Closed Won':100,'Closed Lost':0 };

const STAGE_TYPES = { 'Closed Won':'Won','Closed Lost':'Lost' };

const DEFAULT_ASSIGNMENT_RULES = [
    { team:'SMB West',           members:8,  defaultPipeline:'New business' },
    { team:'SMB East',           members:9,  defaultPipeline:'New business' },
    { team:'Mid-Market',         members:6,  defaultPipeline:'New business' },
    { team:'Customer Success',   members:5,  defaultPipeline:'Renewals' },
    { team:'Account Management', members:7,  defaultPipeline:'Expansion' },
];

export const PipelinesDetail = ({ settings, setSettings, onBack }) => {
    const [selectedId, setSelectedId]   = useState('new-biz');
    const [showNewForm, setShowNewForm] = useState(false);
    const [newName, setNewName]         = useState('');
    const [newDefault, setNewDefault]   = useState(false);
    const [newErr, setNewErr]           = useState('');
    const [saving, setSaving]           = useState(false);
    // Every save here was `await dbFetch(...)` inside a catch that only logged.
    // dbFetch resolves for ANY response (guide 18b1), so the catch fires on a
    // network failure only — and PUT /settings has been Admin-only since SVR-2,
    // so a non-admin's 403 landed in the success path. The panel updated on
    // screen, nothing reached the database, and it reverted on reload.
    //
    // CategoryDetailChrome already renders an `error` prop; this panel simply
    // never passed one.
    const [saveError, setSaveError] = useState('');

    // Optimistic update, then revert on failure so what is on screen always
    // matches what is stored. putSettings throws a readable Error on non-2xx.
    const persist = async (patch, label) => {
        let snapshot;
        setSettings(prev => { snapshot = prev; return { ...prev, ...patch }; });
        setSaveError('');
        try {
            await putSettings(patch);
            return true;
        } catch (e) {
            setSettings(snapshot);
            setSaveError(`${label} not saved — ${e.message}`);
            return false;
        }
    };
    const [editingTeam, setEditingTeam] = useState(null);
    const [showAddStage, setShowAddStage] = useState(false);
    const [newStageName, setNewStageName] = useState('');
    const [newStageType, setNewStageType] = useState('Open');
    const [stageErr, setStageErr]         = useState('');
    // Pipeline drag state
    const [dragPipelineIdx, setDragPipelineIdx] = useState(null);
    const [dragOverPipelineIdx, setDragOverPipelineIdx] = useState(null);
    // Stage drag state
    const [dragStageIdx, setDragStageIdx] = useState(null);
    const [dragOverStageIdx, setDragOverStageIdx] = useState(null);
    // Stage kebab state
    const [openKebab, setOpenKebab]       = useState(null); // stage name
    const [renamingStage, setRenamingStage] = useState(null); // stage name
    const [renameVal, setRenameVal]         = useState('');
    const [confirmDelete, setConfirmDelete] = useState(null); // stage name
    // Pipeline kebab + delete state
    const [openPipelineKebab, setOpenPipelineKebab]     = useState(null); // pipeline id
    const [confirmDeletePipeline, setConfirmDeletePipeline] = useState(null); // pipeline id
    const [blockedDeletePipeline, setBlockedDeletePipeline] = useState(null); // { name, reason }

    const pipelines = settings?.pipelines?.length ? settings.pipelines : DEFAULT_PIPELINES;
    const selected  = pipelines.find(p => p.id === selectedId) || pipelines[0];

    const assignmentRules = settings?.assignmentRules?.length
        ? settings.assignmentRules
        : DEFAULT_ASSIGNMENT_RULES;

    // ── New pipeline ──────────────────────────────────────────
    const handleAddPipeline = async () => {
        if (!newName.trim()) { setNewErr('Pipeline name is required.'); return; }
        if (pipelines.some(p => p.name.toLowerCase() === newName.trim().toLowerCase())) {
            setNewErr('A pipeline with that name already exists.'); return;
        }
        const newPipeline = {
            id:        newName.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
            name:      newName.trim(),
            isDefault: newDefault,
            stages:    ['Prospecting', 'Proposal', 'Closed Won', 'Closed Lost'],
            active:    0, value: '$0',
            teams:     [],
        };
        // If set as default, clear default flag on existing ones
        const updated = newDefault
            ? [...pipelines.map(p => ({ ...p, isDefault: false })), newPipeline]
            : [...pipelines, newPipeline];
        setSaving(true);
        await persist({ pipelines: updated }, 'Pipeline');
        setSaving(false);
        setSelectedId(newPipeline.id);
        setNewName(''); setNewDefault(false); setNewErr(''); setShowNewForm(false);
    };

    // ── Assignment rule edit ──────────────────────────────────
    const handleAssignmentChange = async (teamName, newPipelineName) => {
        const updated = assignmentRules.map(r =>
            r.team === teamName ? { ...r, defaultPipeline: newPipelineName } : r
        );
        setEditingTeam(null);
        await persist({ assignmentRules: updated }, 'Assignment rule');
    };

    // ── Add stage to selected pipeline ───────────────────────
    const handleAddStage = async () => {
        if (!newStageName.trim()) { setStageErr('Stage name is required.'); return; }
        const currentStages = selected?.stages || [];
        if (currentStages.some(s => s.toLowerCase() === newStageName.trim().toLowerCase())) {
            setStageErr('A stage with that name already exists in this pipeline.'); return;
        }
        // Insert before terminal stages (Closed Won / Closed Lost)
        const terminals = currentStages.filter(s => STAGE_TYPES[s]);
        const opens     = currentStages.filter(s => !STAGE_TYPES[s]);
        const newStage  = newStageName.trim();
        const updatedStages = newStageType === 'Open'
            ? [...opens, newStage, ...terminals]
            : [...opens, ...terminals.filter(s => STAGE_TYPES[s] !== newStageType), newStage, ...terminals.filter(s => STAGE_TYPES[s] === newStageType)];

        const updatedPipelines = pipelines.map(p =>
            p.id === selectedId ? { ...p, stages: updatedStages } : p
        );
        await persist({ pipelines: updatedPipelines }, 'Stage');
        setNewStageName(''); setNewStageType('Open'); setStageErr(''); setShowAddStage(false);
    };

    // ── Pipeline drag-to-reorder ─────────────────────────────
    const handlePipelineDrop = async (fromIdx, toIdx) => {
        if (fromIdx === toIdx) return;
        const reordered = [...pipelines];
        const [moved] = reordered.splice(fromIdx, 1);
        reordered.splice(toIdx, 0, moved);
        await persist({ pipelines: reordered }, 'Pipeline order');
    };

    // ── Delete pipeline ──────────────────────────────────────
    const handleDeletePipeline = (pipelineId) => {
        const pipeline = pipelines.find(p => p.id === pipelineId);
        if (!pipeline) return;
        if (pipeline.isDefault) {
            setBlockedDeletePipeline({ name: pipeline.name, reason: 'This is the default pipeline. Set another pipeline as default before deleting it.' });
            setOpenPipelineKebab(null);
            return;
        }
        if ((pipeline.active || 0) > 0) {
            setBlockedDeletePipeline({ name: pipeline.name, reason: `This pipeline has ${pipeline.active} open deal${pipeline.active !== 1 ? 's' : ''}. Move or close all deals before deleting.` });
            setOpenPipelineKebab(null);
            return;
        }
        setConfirmDeletePipeline(pipelineId);
        setOpenPipelineKebab(null);
    };

    const handleConfirmDeletePipeline = async () => {
        const updated = pipelines.filter(p => p.id !== confirmDeletePipeline);
        const wasSelected = selectedId === confirmDeletePipeline;
        setConfirmDeletePipeline(null);
        if (wasSelected) setSelectedId(updated[0]?.id || null);
        // Restore the selection too if the delete did not land, or the panel shows
        // a different pipeline than the one still in the database.
        if (!await persist({ pipelines: updated }, 'Pipeline deletion') && wasSelected) {
            setSelectedId(confirmDeletePipeline);
        }
    };

    // ── Export JSON ───────────────────────────────────────────
    const handleExportJSON = () => {
        const exportData = {
            exportedAt: new Date().toISOString(),
            pipelines: pipelines.map(p => ({
                id: p.id, name: p.name, isDefault: p.isDefault,
                stages: p.stages, teams: p.teams,
                activeDeals: p.active, pipelineValue: p.value,
            })),
            assignmentRules,
        };
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `accelerep-pipelines-${new Date().toISOString().slice(0,10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // ── Stage drag-to-reorder ─────────────────────────────────
    const handleStageDrop = async (fromIdx, toIdx) => {
        if (fromIdx === toIdx) return;
        const stages = [...(selected?.stages || [])];
        const [moved] = stages.splice(fromIdx, 1);
        stages.splice(toIdx, 0, moved);
        const updatedPipelines = pipelines.map(p =>
            p.id === selectedId ? { ...p, stages } : p
        );
        await persist({ pipelines: updatedPipelines }, 'Stage order');
    };

    // ── Stage rename ──────────────────────────────────────────
    const handleRenameStage = async () => {
        if (!renameVal.trim() || renameVal.trim() === renamingStage) { setRenamingStage(null); return; }
        const stages = (selected?.stages || []).map(s => s === renamingStage ? renameVal.trim() : s);
        const updatedPipelines = pipelines.map(p =>
            p.id === selectedId ? { ...p, stages } : p
        );
        setRenamingStage(null); setRenameVal(''); setOpenKebab(null);
        await persist({ pipelines: updatedPipelines }, 'Stage rename');
    };

    // ── Stage delete ──────────────────────────────────────────
    const handleDeleteStage = async (stageName) => {
        const stages = (selected?.stages || []).filter(s => s !== stageName);
        const updatedPipelines = pipelines.map(p =>
            p.id === selectedId ? { ...p, stages } : p
        );
        setConfirmDelete(null); setOpenKebab(null);
        await persist({ pipelines: updatedPipelines }, 'Stage deletion');
    };

    const selStyle = { padding:'4px 8px', fontSize:12, border:`1px solid ${T.border}`, borderRadius:T.r, background:T.surface, color:T.ink, fontFamily:T.sans, cursor:'pointer', outline:'none' };

    return (
        <CategoryDetailChrome
            error={saveError}
            crumb="Pipelines" title="Pipelines"
            subtitle="Manage multiple pipelines and their stages"
            statusDetail={`${pipelines.length} pipelines · ${pipelines.reduce((a,p) => a + (p.stages?.length||0), 0)} stages`}
            updatedBy="Admin" updatedAt="3 weeks ago"
            onBack={onBack} dirty={false}
            rightActions={
                <div style={{ display:'flex', gap:8 }}>
                    <button onClick={handleExportJSON} style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'7px 14px', background:T.surface, color:T.ink, border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}
                        onMouseEnter={e => e.currentTarget.style.background = T.surface2}
                        onMouseLeave={e => e.currentTarget.style.background = T.surface}>
                        <LIcon name="download" size={13}/> Export JSON
                    </button>
                    <button onClick={() => { setShowNewForm(v => !v); setNewErr(''); }}
                        style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'7px 14px', background: showNewForm ? T.surface2 : T.ink, color: showNewForm ? T.ink : '#fbf8f3', border: showNewForm ? `1px solid ${T.borderStrong}` : 'none', borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>
                        + New pipeline
                    </button>
                </div>
            }
        >
            {/* New pipeline inline form */}
            {showNewForm && (
                <div style={{ background:T.surface, border:`1px solid ${T.borderStrong}`, borderRadius:T.r+2, padding:16, marginBottom:16, boxShadow:'0 2px 12px rgba(42,38,34,0.08)' }}>
                    <div style={{ fontSize:13, fontWeight:700, color:T.ink, marginBottom:12, fontFamily:T.sans }}>New pipeline</div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 180px auto auto', gap:10, alignItems:'flex-end' }}>
                        <div>
                            <label style={{ fontSize:11, fontWeight:600, color:T.inkMid, display:'block', marginBottom:4, fontFamily:T.sans }}>Pipeline name</label>
                            <input value={newName} onChange={e => { setNewName(e.target.value); setNewErr(''); }}
                                placeholder="e.g. Partner deals"
                                onKeyDown={e => { if (e.key==='Enter') handleAddPipeline(); if (e.key==='Escape') { setShowNewForm(false); setNewErr(''); } }}
                                autoFocus
                                style={{ padding:'7px 10px', background:T.surface, border:`1px solid ${newErr ? T.danger : T.border}`, borderRadius:T.r, fontSize:12.5, color:T.ink, fontFamily:T.sans, outline:'none', width:'100%', boxSizing:'border-box' }}/>
                        </div>
                        <div style={{ display:'flex', alignItems:'center', gap:8, paddingBottom:2 }}>
                            <input type="checkbox" id="new-default-chk" checked={newDefault} onChange={e => setNewDefault(e.target.checked)} style={{ cursor:'pointer' }}/>
                            <label htmlFor="new-default-chk" style={{ fontSize:12.5, color:T.ink, cursor:'pointer', fontFamily:T.sans, whiteSpace:'nowrap' }}>Set as default</label>
                        </div>
                        <button onClick={handleAddPipeline} disabled={saving}
                            style={{ padding:'7px 16px', background: saving ? T.borderStrong : T.ink, color:'#fbf8f3', border:'none', borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor: saving ? 'default' : 'pointer', fontFamily:T.sans }}>
                            {saving ? 'Saving…' : 'Create'}
                        </button>
                        <button onClick={() => { setShowNewForm(false); setNewName(''); setNewErr(''); }}
                            style={{ padding:'7px 12px', background:'transparent', color:T.inkMid, border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>
                            Cancel
                        </button>
                    </div>
                    {newErr && <div style={{ fontSize:11.5, color:T.danger, marginTop:8, fontFamily:T.sans }}>{newErr}</div>}
                    <div style={{ fontSize:11.5, color:T.inkMuted, marginTop:newErr ? 4 : 8, fontFamily:T.sans }}>
                        New pipelines start with 4 default stages. You can add, remove, and reorder stages after creation.
                    </div>
                </div>
            )}

            {/* Blocked-delete modal */}
            {blockedDeletePipeline && (
                <div style={{ position:'fixed', inset:0, background:'rgba(42,38,34,0.5)', zIndex:500, display:'flex', alignItems:'center', justifyContent:'center' }}
                    onClick={() => setBlockedDeletePipeline(null)}>
                    <div onClick={e => e.stopPropagation()} style={{ background:T.surface, borderRadius:T.r+4, padding:28, maxWidth:400, width:'90%', boxShadow:'0 8px 32px rgba(42,38,34,0.2)', fontFamily:T.sans }}>
                        <div style={{ fontSize:16, fontWeight:700, color:T.ink, marginBottom:8 }}>Cannot delete "{blockedDeletePipeline.name}"</div>
                        <div style={{ fontSize:13, color:T.inkMid, lineHeight:1.6, marginBottom:20 }}>{blockedDeletePipeline.reason}</div>
                        <button onClick={() => setBlockedDeletePipeline(null)}
                            style={{ padding:'8px 20px', background:T.ink, color:'#fbf8f3', border:'none', borderRadius:T.r, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>
                            Got it
                        </button>
                    </div>
                </div>
            )}

            {/* Confirm-delete modal */}
            {confirmDeletePipeline && (() => {
                const p = pipelines.find(pp => pp.id === confirmDeletePipeline);
                return (
                    <div style={{ position:'fixed', inset:0, background:'rgba(42,38,34,0.5)', zIndex:500, display:'flex', alignItems:'center', justifyContent:'center' }}
                        onClick={() => setConfirmDeletePipeline(null)}>
                        <div onClick={e => e.stopPropagation()} style={{ background:T.surface, borderRadius:T.r+4, padding:28, maxWidth:400, width:'90%', boxShadow:'0 8px 32px rgba(42,38,34,0.2)', fontFamily:T.sans }}>
                            <div style={{ fontSize:16, fontWeight:700, color:T.ink, marginBottom:8 }}>Delete "{p?.name}"?</div>
                            <div style={{ fontSize:13, color:T.inkMid, lineHeight:1.6, marginBottom:20 }}>
                                This pipeline has no open deals and can be safely deleted. This action cannot be undone.
                            </div>
                            <div style={{ display:'flex', gap:10 }}>
                                <button onClick={handleConfirmDeletePipeline}
                                    style={{ padding:'8px 20px', background:T.danger, color:'#fff', border:'none', borderRadius:T.r, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>
                                    Delete pipeline
                                </button>
                                <button onClick={() => setConfirmDeletePipeline(null)}
                                    style={{ padding:'8px 20px', background:'transparent', color:T.inkMid, border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}

            <div style={{ display:'grid', gridTemplateColumns:'420px 1fr', gap:20 }}>
                {/* Left: pipeline list */}
                <div>
                    <CSectionCard title="Pipelines" description="Drag to reorder. The default pipeline is used for new opportunities when no pipeline is selected.">
                        {pipelines.map((p,i) => (
                            <div key={p.id}
                                draggable
                                onDragStart={() => setDragPipelineIdx(i)}
                                onDragOver={e => { e.preventDefault(); setDragOverPipelineIdx(i); }}
                                onDragEnd={() => { setDragPipelineIdx(null); setDragOverPipelineIdx(null); }}
                                onDrop={e => { e.preventDefault(); handlePipelineDrop(dragPipelineIdx, i); setDragPipelineIdx(null); setDragOverPipelineIdx(null); }}
                                onClick={() => setSelectedId(p.id)}
                                style={{ padding:'14px 16px', border:`1.5px solid ${selectedId===p.id ? T.goldInk : dragOverPipelineIdx===i ? T.goldInk : T.border}`, background: selectedId===p.id ? 'rgba(200,185,154,0.1)' : dragOverPipelineIdx===i ? 'rgba(200,185,154,0.06)' : T.surface, borderRadius:T.r+2, marginBottom:10, cursor:'grab', transition:'all 120ms', opacity: dragPipelineIdx===i ? 0.5 : 1 }}>
                                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
                                    <SPDrag/>
                                    <div style={{ fontSize:14, fontWeight:700, color:T.ink, fontFamily:T.sans }}>{p.name}</div>
                                    {p.isDefault && <span style={{ fontSize:9.5, fontWeight:700, color:T.goldInk, background:'rgba(200,185,154,0.3)', padding:'2px 6px', borderRadius:2, letterSpacing:0.3, fontFamily:T.sans }}>DEFAULT</span>}
                                    <div style={{ flex:1 }}/>
                                    <span style={{ fontSize:11, color:T.inkMuted, fontFamily:T.sans }}>{p.active} open · {p.value}</span>
                                    {/* Pipeline kebab */}
                                    <div style={{ position:'relative' }} onClick={e => e.stopPropagation()}>
                                        <button onClick={() => setOpenPipelineKebab(openPipelineKebab===p.id ? null : p.id)}
                                            style={{ background:'none', border:'none', cursor:'pointer', color:T.inkMuted, fontSize:16, padding:'0 2px', lineHeight:1 }}>⋯</button>
                                        {openPipelineKebab === p.id && (
                                            <div style={{ position:'absolute', right:0, top:'100%', zIndex:300, background:T.surface, border:`1px solid ${T.border}`, borderRadius:T.r+2, boxShadow:'0 4px 16px rgba(42,38,34,0.12)', minWidth:160, overflow:'hidden' }}>
                                                <button onClick={() => { setSelectedId(p.id); setOpenPipelineKebab(null); }}
                                                    style={{ display:'block', width:'100%', padding:'10px 14px', background:'none', border:'none', textAlign:'left', fontSize:13, color:T.ink, cursor:'pointer', fontFamily:T.sans }}
                                                    onMouseEnter={e => e.currentTarget.style.background = T.surface2}
                                                    onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                                                    View stages
                                                </button>
                                                {!p.isDefault && (
                                                    <button onClick={async () => {
                                                        const updated = pipelines.map(pp => ({ ...pp, isDefault: pp.id === p.id }));
                                                        setOpenPipelineKebab(null);
                                                        await persist({ pipelines: updated }, 'Default pipeline');
                                                    }}
                                                        style={{ display:'block', width:'100%', padding:'10px 14px', background:'none', border:'none', borderTop:`1px solid ${T.border}`, textAlign:'left', fontSize:13, color:T.ink, cursor:'pointer', fontFamily:T.sans }}
                                                        onMouseEnter={e => e.currentTarget.style.background = T.surface2}
                                                        onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                                                        Set as default
                                                    </button>
                                                )}
                                                <button onClick={() => handleDeletePipeline(p.id)}
                                                    style={{ display:'block', width:'100%', padding:'10px 14px', background:'none', border:'none', borderTop:`1px solid ${T.border}`, textAlign:'left', fontSize:13, color:T.danger, cursor:'pointer', fontFamily:T.sans }}
                                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(156,58,46,0.06)'}
                                                    onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                                                    Delete pipeline
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div style={{ display:'flex', gap:2 }}>
                                    {(p.stages||[]).map((s,si) => (
                                        <div key={si} style={{ flex:1, padding:'5px 4px', fontSize:9.5, fontWeight:600, background: STAGE_COLORS[s] ? `${STAGE_COLORS[s]}22` : T.surface2, color:STAGE_COLORS[s]||T.inkMid, borderTop:`2px solid ${STAGE_COLORS[s]||T.border}`, textAlign:'center', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontFamily:T.sans }}>
                                            {s}
                                        </div>
                                    ))}
                                </div>
                                <div style={{ marginTop:8, fontSize:11, color:T.inkMuted, fontFamily:T.sans }}>
                                    Used by {(p.teams||[]).map((t,ti) => <span key={ti}><b style={{ color:T.inkMid }}>{t}</b>{ti < p.teams.length-1 ? ' · ' : ''}</span>)}
                                    {(p.teams||[]).length === 0 && <span style={{ color:T.inkMuted, fontStyle:'italic' }}>No teams assigned yet</span>}
                                </div>
                            </div>
                        ))}
                    </CSectionCard>
                </div>

                {/* Right: selected pipeline stages + assignment */}
                <div>
                    <CSectionCard
                        title={`${selected?.name} — stages`}
                        description="The stage flow for this pipeline. Probability feeds forecast & Sales Manager dashboards."
                        headAction={
                            <button onClick={() => { setShowAddStage(v => !v); setStageErr(''); setNewStageName(''); }}
                                style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'5px 11px', background: showAddStage ? T.surface2 : 'transparent', border:`1px solid ${T.border}`, color:T.ink, fontSize:12, fontWeight:500, borderRadius:T.r, cursor:'pointer', fontFamily:T.sans }}>
                                + Add stage
                            </button>
                        }
                    >
                        {/* Add stage inline form */}
                        {showAddStage && (
                            <div style={{ display:'grid', gridTemplateColumns:'1fr 120px auto auto', gap:8, alignItems:'flex-end', padding:'10px 12px', background:T.surface2, border:`1px solid ${T.borderStrong}`, borderRadius:T.r+1, marginBottom:12 }}>
                                <div>
                                    <label style={{ fontSize:10.5, fontWeight:600, color:T.inkMid, display:'block', marginBottom:3, fontFamily:T.sans }}>Stage name</label>
                                    <input value={newStageName} onChange={e => { setNewStageName(e.target.value); setStageErr(''); }}
                                        placeholder="e.g. Due diligence"
                                        autoFocus
                                        onKeyDown={e => { if (e.key==='Enter') handleAddStage(); if (e.key==='Escape') { setShowAddStage(false); setStageErr(''); } }}
                                        style={{ padding:'6px 10px', background:T.surface, border:`1px solid ${stageErr ? T.danger : T.border}`, borderRadius:T.r, fontSize:12.5, color:T.ink, fontFamily:T.sans, outline:'none', width:'100%', boxSizing:'border-box' }}/>
                                    {stageErr && <div style={{ fontSize:10.5, color:T.danger, marginTop:3, fontFamily:T.sans }}>{stageErr}</div>}
                                </div>
                                <div>
                                    <label style={{ fontSize:10.5, fontWeight:600, color:T.inkMid, display:'block', marginBottom:3, fontFamily:T.sans }}>Type</label>
                                    <select value={newStageType} onChange={e => setNewStageType(e.target.value)} style={{ ...selStyle, width:'100%' }}>
                                        <option>Open</option>
                                        <option>Won</option>
                                        <option>Lost</option>
                                    </select>
                                </div>
                                <button onClick={handleAddStage}
                                    style={{ padding:'6px 14px', background:T.ink, color:'#fbf8f3', border:'none', borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>
                                    Add
                                </button>
                                <button onClick={() => { setShowAddStage(false); setStageErr(''); setNewStageName(''); }}
                                    style={{ padding:'6px 10px', background:'transparent', color:T.inkMid, border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:12.5, cursor:'pointer', fontFamily:T.sans }}>
                                    Cancel
                                </button>
                            </div>
                        )}
                        {/* Stage table with drag + kebab */}
                        <div style={{ border:`1px solid ${T.border}`, borderRadius:T.r+2, overflow:'hidden' }}>
                            {/* Header */}
                            <div style={{ display:'grid', gridTemplateColumns:'28px 1.6fr 120px 90px 90px 70px 28px', padding:'9px 14px', borderBottom:`1px solid ${T.border}`, background:T.surface2, gap:10 }}>
                                {['','Stage','Default prob.','Type','Avg days','Open',''].map((h,i) => (
                                    <div key={i} style={{ fontSize:10.5, fontWeight:700, color:T.inkMuted, letterSpacing:0.6, textTransform:'uppercase', textAlign: i>=2&&i<=5 ? 'right' : 'left', fontFamily:T.sans }}>{h}</div>
                                ))}
                            </div>
                            {(selected?.stages||[]).map((s,i) => (
                                <div key={s}
                                    draggable
                                    onDragStart={() => setDragStageIdx(i)}
                                    onDragOver={e => { e.preventDefault(); setDragOverStageIdx(i); }}
                                    onDragEnd={() => { setDragStageIdx(null); setDragOverStageIdx(null); }}
                                    onDrop={e => { e.preventDefault(); handleStageDrop(dragStageIdx, i); setDragStageIdx(null); setDragOverStageIdx(null); }}
                                    style={{ display:'grid', gridTemplateColumns:'28px 1.6fr 120px 90px 90px 70px 28px', padding:'11px 14px', gap:10, borderBottom: i<(selected?.stages||[]).length-1 ? `1px solid ${T.border}` : 'none', alignItems:'center', background: dragOverStageIdx===i ? 'rgba(200,185,154,0.06)' : T.surface, opacity: dragStageIdx===i ? 0.4 : 1, cursor:'grab', position:'relative', transition:'background 80ms', fontSize:13, fontFamily:T.sans }}>
                                    <div style={{ cursor:'grab', color:T.inkMuted, fontSize:14, letterSpacing:-2 }}>⋮⋮</div>
                                    <div>
                                        {renamingStage === s ? (
                                            <input autoFocus value={renameVal} onChange={e => setRenameVal(e.target.value)}
                                                onKeyDown={e => { if (e.key==='Enter') handleRenameStage(); if (e.key==='Escape') { setRenamingStage(null); setRenameVal(''); } }}
                                                onBlur={handleRenameStage}
                                                style={{ padding:'3px 8px', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:13, fontWeight:600, color:T.ink, fontFamily:T.sans, outline:'none', width:'90%' }}/>
                                        ) : (
                                            <span style={{ display:'inline-flex', alignItems:'center', gap:8 }}>
                                                <span style={{ width:8, height:8, borderRadius:'50%', background:STAGE_COLORS[s]||T.border, display:'inline-block', flexShrink:0 }}/>
                                                <b style={{ fontFamily:T.sans }}>{s}</b>
                                            </span>
                                        )}
                                    </div>
                                    <div style={{ textAlign:'right' }}><span style={{ fontFamily:'ui-monospace,Menlo,monospace', fontSize:12 }}>{STAGE_PROBS[s] !== undefined ? `${STAGE_PROBS[s]}%` : '—'}</span></div>
                                    <div style={{ textAlign:'right' }}><span style={{ fontSize:12, color: STAGE_TYPES[s]==='Won' ? T.ok : STAGE_TYPES[s]==='Lost' ? T.danger : T.inkMid, fontFamily:T.sans }}>{STAGE_TYPES[s]||'Open'}</span></div>
                                    <div style={{ textAlign:'right' }}><span style={{ color:T.inkMuted, fontFamily:T.sans }}>{STAGE_TYPES[s] ? '—' : `${5+i*2}d`}</span></div>
                                    <div style={{ textAlign:'right' }}><span style={{ color:T.inkMuted, fontFamily:T.sans }}>{STAGE_TYPES[s] ? '—' : `${Math.max(5, 42-i*5)}`}</span></div>
                                    {/* Kebab */}
                                    <div style={{ position:'relative' }}>
                                        <button onClick={e => { e.stopPropagation(); setOpenKebab(openKebab===s ? null : s); setConfirmDelete(null); setRenamingStage(null); }}
                                            style={{ background:'none', border:'none', cursor:'pointer', color:T.inkMuted, fontSize:16, padding:0, lineHeight:1, fontFamily:T.sans }}>⋯</button>
                                        {openKebab === s && (
                                            <div onClick={e => e.stopPropagation()}
                                                style={{ position:'absolute', right:0, top:'100%', zIndex:200, background:T.surface, border:`1px solid ${T.border}`, borderRadius:T.r+2, boxShadow:'0 4px 16px rgba(42,38,34,0.12)', minWidth:140, overflow:'hidden' }}>
                                                {confirmDelete === s ? (
                                                    <div style={{ padding:'12px 14px' }}>
                                                        <div style={{ fontSize:12, color:T.ink, marginBottom:8, fontFamily:T.sans }}>Delete <b>{s}</b>?</div>
                                                        <div style={{ display:'flex', gap:6 }}>
                                                            <button onClick={() => handleDeleteStage(s)}
                                                                style={{ flex:1, padding:'5px 0', background:T.danger, color:'#fff', border:'none', borderRadius:T.r, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>Delete</button>
                                                            <button onClick={() => setConfirmDelete(null)}
                                                                style={{ flex:1, padding:'5px 0', background:'transparent', color:T.inkMid, border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:12, cursor:'pointer', fontFamily:T.sans }}>Cancel</button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <>
                                                        <button onClick={() => { setRenamingStage(s); setRenameVal(s); setOpenKebab(null); }}
                                                            style={{ display:'block', width:'100%', padding:'10px 14px', background:'none', border:'none', textAlign:'left', fontSize:13, color:T.ink, cursor:'pointer', fontFamily:T.sans }}
                                                            onMouseEnter={e => e.currentTarget.style.background = T.surface2}
                                                            onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                                                            Rename
                                                        </button>
                                                        <button onClick={() => setConfirmDelete(s)}
                                                            style={{ display:'block', width:'100%', padding:'10px 14px', background:'none', border:'none', borderTop:`1px solid ${T.border}`, textAlign:'left', fontSize:13, color:T.danger, cursor:'pointer', fontFamily:T.sans }}
                                                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(156,58,46,0.06)'}
                                                            onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                                                            Delete stage
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CSectionCard>

                    <CSectionCard title="Assignment rules" description="Which teams and pipelines are paired. Reps see their assigned pipelines by default.">
                        <SPTable
                            columns={[
                                { key:'team',    label:'Team',    w:'2fr' },
                                { key:'members', label:'Members', w:'100px', align:'right' },
                                { key:'default', label:'Default', w:'200px' },
                                { key:'edit',    label:'',        w:'50px', align:'right' },
                            ]}
                            rows={assignmentRules.map(r => ({
                                team:    <span style={{ fontFamily:T.sans, fontWeight:500, color:T.ink }}>{r.team}</span>,
                                members: <span style={{ fontFamily:'ui-monospace,Menlo,monospace', fontSize:12 }}>{r.members}</span>,
                                default: editingTeam === r.team ? (
                                    <select autoFocus value={r.defaultPipeline}
                                        onChange={e => handleAssignmentChange(r.team, e.target.value)}
                                        onBlur={() => setEditingTeam(null)}
                                        style={selStyle}>
                                        {pipelines.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                                    </select>
                                ) : (
                                    <span style={{ fontSize:12, color:T.inkMid, fontFamily:T.sans }}>{r.defaultPipeline}</span>
                                ),
                                edit: <button onClick={e => { e.stopPropagation(); setEditingTeam(r.team); }}
                                    style={{ background:'none', border:'none', color:T.goldInk, fontWeight:600, cursor:'pointer', fontSize:12, fontFamily:T.sans, padding:0 }}>
                                    {editingTeam === r.team ? 'Done' : 'Edit'}
                                </button>,
                            }))}
                        />
                    </CSectionCard>
                </div>
            </div>
        </CategoryDetailChrome>
    );
};
