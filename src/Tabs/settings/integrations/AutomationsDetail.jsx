// settings/integrations/AutomationsDetail.jsx
import React, { useState, useEffect } from 'react';
import { dbFetch } from '../../../utils/storage';
import { T } from '../shared/tokens.js';
import { IntCrumb, IntTitle, IntBtn, IntModal, IntModalHeader, IntModalFooter } from './shared.jsx';

const TRIGGER_EVENTS = [
    { value:'opportunity.created',       label:'Opportunity created',      group:'Pipeline' },
    { value:'opportunity.stage_changed', label:'Stage changed',            group:'Pipeline' },
    { value:'opportunity.won',           label:'Deal won',                 group:'Pipeline' },
    { value:'opportunity.lost',          label:'Deal lost',                group:'Pipeline' },
    { value:'lead.created',              label:'Lead created',             group:'Leads'    },
    { value:'lead.converted',            label:'Lead converted',           group:'Leads'    },
    { value:'task.overdue',              label:'Task overdue',             group:'Tasks'    },
    { value:'task.completed',            label:'Task completed',           group:'Tasks'    },
];

const ACTION_TYPES = [
    { value:'create_task',  label:'Create task',       icon:'✅' },
    { value:'send_email',   label:'Send email',        icon:'✉️' },
    { value:'webhook',      label:'Fire webhook',      icon:'⚡' },
    { value:'update_field', label:'Update field',      icon:'✏️' },
];

const CONDITION_OPERATORS = [
    { value:'eq',       label:'equals'           },
    { value:'neq',      label:'does not equal'   },
    { value:'contains', label:'contains'         },
    { value:'gt',       label:'greater than'     },
    { value:'lt',       label:'less than'        },
    { value:'exists',   label:'is not empty'     },
];

const fmtRunAge = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    const m = Math.round((Date.now() - d) / 60000);
    if (m < 1)    return 'just now';
    if (m < 60)   return m + 'm ago';
    if (m < 1440) return Math.round(m/60) + 'h ago';
    return d.toLocaleDateString('en-US', { month:'short', day:'numeric' });
};

const NewAutomationModal = ({ onClose, onCreated }) => {
    const [step,    setStep]    = React.useState(1); // 1=trigger 2=conditions 3=actions 4=review
    const [name,    setName]    = React.useState('');
    const [trigger, setTrigger] = React.useState('opportunity.stage_changed');
    const [conditions, setConds] = React.useState([]); // [{field,operator,value}]
    const [actions,    setActs]  = React.useState([{ type:'create_task', params:{ title:'', dueOffsetDays:1, priority:'Medium' } }]);
    const [saving,  setSaving]  = React.useState(false);
    const [error,   setError]   = React.useState('');

    const inp = { padding:'7px 10px', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:12.5, color:T.ink, fontFamily:T.sans, outline:'none', background:T.surface, width:'100%', boxSizing:'border-box' };
    const sel = { ...inp, appearance:'none', cursor:'pointer' };

    const addCond = () => setConds(p => [...p, { field:'stage', operator:'eq', value:'' }]);
    const delCond = (i) => setConds(p => p.filter((_,j) => j!==i));
    const setCond = (i, k, v) => setConds(p => p.map((c,j) => j===i ? {...c,[k]:v} : c));

    const addAction = () => setActs(p => [...p, { type:'create_task', params:{ title:'', dueOffsetDays:1, priority:'Medium' } }]);
    const delAction = (i) => setActs(p => p.filter((_,j) => j!==i));
    const setAction = (i, k, v) => setActs(p => p.map((a,j) => j===i ? (k==='type' ? { type:v, params:{} } : {...a, params:{...a.params,[k]:v}}) : a));

    const steps = ['Trigger','Conditions','Actions','Review'];

    const handleSave = async () => {
        if (!name.trim()) { setError('Name is required'); return; }
        if (actions.length === 0) { setError('Add at least one action'); return; }
        setSaving(true); setError('');
        try {
            const res  = await dbFetch('/.netlify/functions/automations', {
                method: 'POST',
                body: JSON.stringify({ name: name.trim(), triggerEvent: trigger, conditions, actions }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to create');
            if (onCreated) onCreated(data.automation);
            onClose();
        } catch(e) {
            setError(e.message);
        } finally {
            setSaving(false);
        }
    };

    const ActionEditor = ({ action, idx }) => (
        <div style={{ background:T.surface2, border:`1px solid ${T.border}`, borderRadius:6, padding:'14px 16px', marginBottom:10 }}>
            <div style={{ display:'flex', gap:10, alignItems:'center', marginBottom:10 }}>
                <select value={action.type} onChange={e => setAction(idx,'type',e.target.value)} style={{ ...sel, flex:1 }}>
                    {ACTION_TYPES.map(a => <option key={a.value} value={a.value}>{a.icon} {a.label}</option>)}
                </select>
                {actions.length > 1 && <button onClick={() => delAction(idx)} style={{ background:'none', border:'none', color:T.danger, cursor:'pointer', fontSize:16, padding:0 }}>×</button>}
            </div>
            {action.type === 'create_task' && (
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                    <div><label style={{ display:'block', fontSize:10.5, fontWeight:600, color:T.inkMid, marginBottom:3 }}>Task title</label>
                        <input value={action.params.title||''} onChange={e => setAction(idx,'title',e.target.value)} placeholder="e.g. Follow up with {account}" style={inp}/></div>
                    <div><label style={{ display:'block', fontSize:10.5, fontWeight:600, color:T.inkMid, marginBottom:3 }}>Due in (days)</label>
                        <input type="number" min="0" value={action.params.dueOffsetDays??1} onChange={e => setAction(idx,'dueOffsetDays',Number(e.target.value))} style={inp}/></div>
                    <div><label style={{ display:'block', fontSize:10.5, fontWeight:600, color:T.inkMid, marginBottom:3 }}>Priority</label>
                        <select value={action.params.priority||'Medium'} onChange={e => setAction(idx,'priority',e.target.value)} style={sel}>
                            {['Low','Medium','High'].map(p => <option key={p}>{p}</option>)}</select></div>
                    <div><label style={{ display:'block', fontSize:10.5, fontWeight:600, color:T.inkMid, marginBottom:3 }}>Assign to (rep name)</label>
                        <input value={action.params.assignedTo||''} onChange={e => setAction(idx,'assignedTo',e.target.value)} placeholder="leave blank = use deal rep" style={inp}/></div>
                </div>
            )}
            {action.type === 'send_email' && (
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    <div><label style={{ display:'block', fontSize:10.5, fontWeight:600, color:T.inkMid, marginBottom:3 }}>To (email)</label>
                        <input value={action.params.to||''} onChange={e => setAction(idx,'to',e.target.value)} placeholder="rep@example.com or leave blank to use record email" style={inp}/></div>
                    <div><label style={{ display:'block', fontSize:10.5, fontWeight:600, color:T.inkMid, marginBottom:3 }}>Subject</label>
                        <input value={action.params.subject||''} onChange={e => setAction(idx,'subject',e.target.value)} style={inp}/></div>
                    <div><label style={{ display:'block', fontSize:10.5, fontWeight:600, color:T.inkMid, marginBottom:3 }}>Body</label>
                        <textarea value={action.params.body||''} onChange={e => setAction(idx,'body',e.target.value)} rows={3} style={{ ...inp, resize:'vertical' }}/></div>
                </div>
            )}
            {action.type === 'webhook' && (
                <div><label style={{ display:'block', fontSize:10.5, fontWeight:600, color:T.inkMid, marginBottom:3 }}>Endpoint URL</label>
                    <input value={action.params.url||''} onChange={e => setAction(idx,'url',e.target.value)} placeholder="https://hooks.example.com/..." style={{ ...inp, fontFamily:'ui-monospace,Menlo,monospace', fontSize:11.5 }}/></div>
            )}
            {action.type === 'update_field' && (
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
                    <div><label style={{ display:'block', fontSize:10.5, fontWeight:600, color:T.inkMid, marginBottom:3 }}>Entity</label>
                        <select value={action.params.entity||'opportunity'} onChange={e => setAction(idx,'entity',e.target.value)} style={sel}>
                            <option value="opportunity">Opportunity</option>
                        </select></div>
                    <div><label style={{ display:'block', fontSize:10.5, fontWeight:600, color:T.inkMid, marginBottom:3 }}>Field</label>
                        <input value={action.params.field||''} onChange={e => setAction(idx,'field',e.target.value)} placeholder="forecastCategory" style={inp}/></div>
                    <div><label style={{ display:'block', fontSize:10.5, fontWeight:600, color:T.inkMid, marginBottom:3 }}>Value</label>
                        <input value={action.params.value||''} onChange={e => setAction(idx,'value',e.target.value)} placeholder="commit" style={inp}/></div>
                </div>
            )}
        </div>
    );

    return (
        <IntModal width={680} onClose={onClose}>
            <IntModalHeader onClose={onClose} title="New automation" sub="Define a trigger, optional conditions, and what actions to run."/>
            {/* Stepper */}
            <div style={{ display:'flex', borderBottom:`1px solid ${T.border}`, padding:'0 22px', flexShrink:0 }}>
                {steps.map((s,i) => { const n=i+1, active=step===n, done=step>n; return (
                    <div key={s} onClick={() => done && setStep(n)}
                        style={{ display:'flex', alignItems:'center', gap:7, padding:'10px 14px 10px 0', fontSize:12, fontWeight:600, cursor:done?'pointer':'default',
                            color:active?T.ink:done?T.ok:T.inkMuted, borderBottom:active?`2px solid ${T.goldInk}`:'2px solid transparent' }}>
                        <span style={{ width:19, height:19, borderRadius:'50%', border:`1.5px solid ${active?T.goldInk:done?T.ok:T.border}`,
                            display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:10,
                            background:done?T.ok:'transparent', color:done?'#fff':active?T.goldInk:T.inkMuted }}>
                            {done?'✓':n}
                        </span>{s}
                    </div>
                );})}
            </div>
            <div style={{ flex:1, overflowY:'auto', padding:'18px 22px' }}>
                {/* Step 1: Trigger */}
                {step === 1 && (<>
                    <div style={{ marginBottom:14 }}>
                        <label style={{ display:'block', fontSize:11, fontWeight:600, color:T.inkMid, marginBottom:4 }}>Automation name</label>
                        <input value={name} onChange={e=>{setName(e.target.value);setError('');}} placeholder="e.g. New lead → create follow-up task" style={inp} autoFocus/>
                    </div>
                    <div style={{ fontSize:11, fontWeight:600, color:T.inkMid, marginBottom:10 }}>Trigger event</div>
                    {['Pipeline','Leads','Tasks'].map(group => (
                        <div key={group} style={{ marginBottom:14 }}>
                            <div style={{ fontSize:10, fontWeight:700, color:T.inkMuted, letterSpacing:0.6, textTransform:'uppercase', marginBottom:6, fontFamily:T.sans }}>{group}</div>
                            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                                {TRIGGER_EVENTS.filter(e => e.group===group).map(ev => (
                                    <div key={ev.value} onClick={() => setTrigger(ev.value)}
                                        style={{ padding:'10px 14px', border:`1.5px solid ${trigger===ev.value?T.goldInk:T.border}`,
                                            borderRadius:6, cursor:'pointer', background:trigger===ev.value?'rgba(200,185,154,0.10)':T.surface,
                                            display:'flex', alignItems:'center', gap:8 }}>
                                        <span style={{ width:8, height:8, borderRadius:'50%', background:trigger===ev.value?T.goldInk:T.border, flexShrink:0 }}/>
                                        <div>
                                            <div style={{ fontSize:12.5, fontWeight:600, color:T.ink }}>{ev.label}</div>
                                            <div style={{ fontFamily:'ui-monospace,Menlo,monospace', fontSize:10, color:T.inkMuted }}>{ev.value}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </>)}
                {/* Step 2: Conditions */}
                {step === 2 && (<>
                    <div style={{ fontSize:13, fontWeight:600, color:T.ink, marginBottom:4 }}>Conditions <span style={{ fontSize:12, fontWeight:400, color:T.inkMuted }}>(optional — all must match)</span></div>
                    <div style={{ fontSize:12, color:T.inkMid, marginBottom:14 }}>Leave empty to run on every <code style={{ fontFamily:'ui-monospace,Menlo,monospace', fontSize:11 }}>{trigger}</code> event.</div>
                    {conditions.map((c,i) => (
                        <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr 160px 1fr 28px', gap:8, marginBottom:8, alignItems:'center' }}>
                            <input value={c.field} onChange={e => setCond(i,'field',e.target.value)} placeholder="Field (e.g. stage, arr)" style={inp}/>
                            <select value={c.operator} onChange={e => setCond(i,'operator',e.target.value)} style={sel}>
                                {CONDITION_OPERATORS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                            <input value={c.value} onChange={e => setCond(i,'value',e.target.value)} placeholder="Value" style={inp} disabled={c.operator==='exists'}/>
                            <button onClick={() => delCond(i)} style={{ background:'none', border:'none', color:T.danger, cursor:'pointer', fontSize:18, padding:0 }}>×</button>
                        </div>
                    ))}
                    <button onClick={addCond} style={{ fontSize:12.5, fontWeight:600, color:T.info, background:'none', border:`1px dashed ${T.border}`, borderRadius:T.r, padding:'7px 14px', cursor:'pointer', fontFamily:T.sans, width:'100%', marginTop:4 }}>
                        + Add condition
                    </button>
                </>)}
                {/* Step 3: Actions */}
                {step === 3 && (<>
                    <div style={{ fontSize:13, fontWeight:600, color:T.ink, marginBottom:12 }}>Actions <span style={{ fontSize:12, fontWeight:400, color:T.inkMuted }}>(run in order)</span></div>
                    {actions.map((a,i) => <ActionEditor key={i} action={a} idx={i}/>)}
                    <button onClick={addAction} style={{ fontSize:12.5, fontWeight:600, color:T.info, background:'none', border:`1px dashed ${T.border}`, borderRadius:T.r, padding:'7px 14px', cursor:'pointer', fontFamily:T.sans, width:'100%' }}>
                        + Add action
                    </button>
                </>)}
                {/* Step 4: Review */}
                {step === 4 && (<>
                    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
                        <div style={{ background:T.surface2, borderRadius:6, padding:'14px 18px' }}>
                            <div style={{ fontSize:10.5, fontWeight:700, color:T.inkMuted, letterSpacing:0.6, textTransform:'uppercase', marginBottom:8 }}>Automation</div>
                            <div style={{ fontSize:15, fontWeight:700, color:T.ink }}>{name || <span style={{ color:T.inkMuted, fontStyle:'italic' }}>Untitled</span>}</div>
                        </div>
                        <div style={{ background:T.surface2, borderRadius:6, padding:'14px 18px' }}>
                            <div style={{ fontSize:10.5, fontWeight:700, color:T.inkMuted, letterSpacing:0.6, textTransform:'uppercase', marginBottom:8 }}>Trigger</div>
                            <span style={{ fontFamily:'ui-monospace,Menlo,monospace', fontSize:12.5, color:T.info }}>{trigger}</span>
                        </div>
                        {conditions.length > 0 && (
                            <div style={{ background:T.surface2, borderRadius:6, padding:'14px 18px' }}>
                                <div style={{ fontSize:10.5, fontWeight:700, color:T.inkMuted, letterSpacing:0.6, textTransform:'uppercase', marginBottom:8 }}>Conditions</div>
                                {conditions.map((c,i) => (
                                    <div key={i} style={{ fontSize:12.5, color:T.ink, marginBottom:4, fontFamily:'ui-monospace,Menlo,monospace' }}>
                                        {c.field} {c.operator} {c.value}
                                    </div>
                                ))}
                            </div>
                        )}
                        <div style={{ background:T.surface2, borderRadius:6, padding:'14px 18px' }}>
                            <div style={{ fontSize:10.5, fontWeight:700, color:T.inkMuted, letterSpacing:0.6, textTransform:'uppercase', marginBottom:8 }}>Actions ({actions.length})</div>
                            {actions.map((a,i) => (
                                <div key={i} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                                    <span style={{ fontSize:12, width:16, textAlign:'center' }}>{ACTION_TYPES.find(t=>t.value===a.type)?.icon||'⚡'}</span>
                                    <span style={{ fontSize:12.5, color:T.ink, fontWeight:600 }}>{ACTION_TYPES.find(t=>t.value===a.type)?.label}</span>
                                    {a.type==='create_task' && a.params?.title && <span style={{ fontSize:12, color:T.inkMuted }}>— "{a.params.title}"</span>}
                                    {a.type==='send_email'  && a.params?.to    && <span style={{ fontSize:12, color:T.inkMuted }}>→ {a.params.to}</span>}
                                    {a.type==='webhook'     && a.params?.url   && <span style={{ fontSize:11, color:T.inkMuted, fontFamily:'ui-monospace,Menlo,monospace' }}>{a.params.url}</span>}
                                </div>
                            ))}
                        </div>
                        {error && <div style={{ fontSize:12, color:T.danger }}>{error}</div>}
                    </div>
                </>)}
            </div>
            <IntModalFooter>
                {step > 1 && <IntBtn label="← Back" onClick={() => setStep(s=>s-1)}/>}
                <div style={{ flex:1 }}/>
                {step < 4
                    ? <IntBtn label="Next →" primary onClick={() => { if(step===1&&!name.trim()){setError('Name is required');return;} setError(''); setStep(s=>s+1); }}/>
                    : <IntBtn label={saving?'Saving…':'Create automation'} primary onClick={handleSave} disabled={saving}/>
                }
            </IntModalFooter>
        </IntModal>
    );
};

export const AutomationsDetail = ({ onBack }) => {
    const [automationList, setAutomationList] = React.useState([]);
    const [loading,        setLoading]        = React.useState(true);
    const [error,          setError]          = React.useState(null);
    const [showModal,      setShowModal]      = React.useState(false);
    const [activeMenu,     setActiveMenu]     = React.useState(null); // rule id
    const [runsFor,        setRunsFor]        = React.useState(null); // { rule, runs }
    const [runsLoading,    setRunsLoading]    = React.useState(false);
    const [filter,         setFilter]         = React.useState('All');

    const load = React.useCallback(async () => {
        try {
            const res  = await dbFetch('/.netlify/functions/automations');
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setAutomationList(data.automations || []);
        } catch(e) { setError(e.message); }
        finally { setLoading(false); }
    }, []);

    React.useEffect(() => { load(); }, []);

    // Outside-click closes row menu
    React.useEffect(() => {
        if (!activeMenu) return;
        const close = (e) => {
            const menu = document.getElementById('auto-menu-' + activeMenu);
            const btn  = document.getElementById('auto-btn-'  + activeMenu);
            if (menu && menu.contains(e.target)) return;
            if (btn  && btn.contains(e.target))  return;
            setActiveMenu(null);
        };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, [activeMenu]);

    const handleToggle = async (rule) => {
        setAutomationList(prev => prev.map(r => r.id===rule.id ? {...r, active:!r.active} : r));
        setActiveMenu(null);
        try {
            const res = await dbFetch('/.netlify/functions/automations', {
                method: 'PUT',
                body: JSON.stringify({ id: rule.id, active: !rule.active }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setAutomationList(prev => prev.map(r => r.id===rule.id ? data.automation : r));
        } catch(e) { setError(e.message); load(); }
    };

    const handleDelete = async (rule) => {
        setAutomationList(prev => prev.filter(r => r.id !== rule.id));
        setActiveMenu(null);
        try {
            const res = await dbFetch(`/.netlify/functions/automations?id=${rule.id}`, { method: 'DELETE' });
            if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
        } catch(e) { setError(e.message); load(); }
    };

    const handleViewRuns = async (rule) => {
        setActiveMenu(null);
        setRunsLoading(true);
        setRunsFor({ rule, runs: [] });
        try {
            const res  = await dbFetch(`/.netlify/functions/automations?runs=${rule.id}`);
            const data = await res.json();
            setRunsFor({ rule, runs: data.runs || [] });
        } catch(e) { setError(e.message); }
        finally { setRunsLoading(false); }
    };

    const activeCount  = automationList.filter(r => r.active).length;
    const failingCount = 0; // future: track error rate from runs

    const visible = automationList.filter(r => {
        if (filter === 'Active') return  r.active;
        if (filter === 'Paused') return !r.active;
        return true;
    });

    const triggerLabel = (ev) => TRIGGER_EVENTS.find(t => t.value===ev)?.label || ev;

    return (
        <div style={{ fontFamily:T.sans }}>
            {showModal && <NewAutomationModal onClose={() => setShowModal(false)} onCreated={rule => setAutomationList(prev => [rule, ...prev])}/>}

            {/* Run history slide-over */}
            {runsFor && (
                <div onClick={() => setRunsFor(null)} style={{ position:'fixed', inset:0, background:'rgba(42,38,34,0.4)', zIndex:600, display:'flex', alignItems:'flex-start', justifyContent:'flex-end' }}>
                    <div onClick={e => e.stopPropagation()} style={{ width:460, height:'100%', background:T.surface, boxShadow:'-8px 0 32px rgba(42,38,34,0.16)', display:'flex', flexDirection:'column', overflow:'hidden' }}>
                        <div style={{ padding:'16px 20px', borderBottom:`1px solid ${T.border}`, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                            <div>
                                <div style={{ fontSize:14, fontWeight:700, color:T.ink }}>{runsFor.rule.name}</div>
                                <div style={{ fontSize:11.5, color:T.inkMuted, marginTop:2 }}>Run history · last 50</div>
                            </div>
                            <button onClick={() => setRunsFor(null)} style={{ background:'none', border:'none', fontSize:20, color:T.inkMuted, cursor:'pointer', padding:0 }}>×</button>
                        </div>
                        <div style={{ flex:1, overflowY:'auto', padding:'12px 0' }}>
                            {runsLoading ? (
                                <div style={{ padding:32, textAlign:'center', color:T.inkMuted, fontSize:13 }}>Loading…</div>
                            ) : runsFor.runs.length === 0 ? (
                                <div style={{ padding:32, textAlign:'center', color:T.inkMuted, fontSize:13 }}>No runs yet. This automation fires when the trigger event occurs in your CRM.</div>
                            ) : runsFor.runs.map((run, i) => (
                                <div key={run.id} style={{ padding:'10px 20px', borderBottom:`1px solid ${T.border}`, display:'flex', alignItems:'center', gap:12 }}>
                                    <span style={{ width:8, height:8, borderRadius:'50%', flexShrink:0,
                                        background: run.status==='success'?T.ok : run.status==='skipped'?T.inkMuted : T.danger }}/>
                                    <div style={{ flex:1, minWidth:0 }}>
                                        <div style={{ fontSize:12.5, fontWeight:600, color:T.ink, textTransform:'capitalize' }}>{run.status}</div>
                                        {run.error && <div style={{ fontSize:11, color:T.danger, marginTop:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{run.error}</div>}
                                        {run.triggeredBy && <div style={{ fontSize:11, color:T.inkMuted, marginTop:1 }}>Triggered by: {run.triggeredBy}</div>}
                                    </div>
                                    <div style={{ fontSize:11, color:T.inkMuted, flexShrink:0 }}>{fmtRunAge(run.createdAt)}</div>
                                    <div style={{ fontSize:11, color:T.inkMid, flexShrink:0 }}>{run.actionsExecuted} action{run.actionsExecuted!==1?'s':''}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            <IntCrumb page="Automations" onBack={onBack}/>
            <IntTitle
                title="Automations"
                sub={loading ? 'Loading…' : `${automationList.length} rule${automationList.length!==1?'s':''} · ${activeCount} active`}
                actions={[
                    <IntBtn key="new" label="+ New automation" primary onClick={() => setShowModal(true)}/>,
                ]}/>

            {error && <div style={{ padding:'10px 14px', background:'rgba(156,58,46,0.08)', borderLeft:`3px solid ${T.danger}`, borderRadius:4, marginBottom:16, fontSize:12.5, color:T.danger }}>{error}</div>}

            {/* Rules table */}
            <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:8, overflow:'hidden' }}>
                <div style={{ padding:'12px 16px 10px', borderBottom:`1px solid ${T.border}`, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <div style={{ fontSize:13.5, fontWeight:700, color:T.ink }}>Rules</div>
                    <div style={{ display:'flex', gap:0, background:T.bg, border:`1px solid ${T.border}`, borderRadius:T.r+2, padding:2 }}>
                        {['All','Active','Paused'].map(f => (
                            <button key={f} onClick={() => setFilter(f)}
                                style={{ padding:'4px 10px', fontSize:12, fontWeight:600, border:'none', borderRadius:T.r, cursor:'pointer', fontFamily:T.sans, background:filter===f?T.ink:'transparent', color:filter===f?'#fbf8f3':T.inkMid }}>
                                {f}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Column headers */}
                <div style={{ display:'grid', gridTemplateColumns:'50px 1fr 180px 100px 90px 80px 36px', gap:8, padding:'8px 16px', background:T.surface2, borderBottom:`1px solid ${T.border}` }}>
                    {['ON','NAME','TRIGGER','RUNS','LAST RUN','STATUS',''].map((h,i) => (
                        <div key={i} style={{ fontSize:10, fontWeight:700, color:T.inkMuted, letterSpacing:0.6, textTransform:'uppercase', fontFamily:T.sans }}>{h}</div>
                    ))}
                </div>

                {loading ? (
                    <div style={{ padding:40, textAlign:'center', color:T.inkMuted, fontSize:13 }}>Loading automations…</div>
                ) : visible.length === 0 ? (
                    <div style={{ padding:'48px 32px', textAlign:'center', fontFamily:T.sans }}>
                        <div style={{ fontSize:28, marginBottom:10, opacity:0.3 }}>⚡</div>
                        <div style={{ fontSize:13.5, fontWeight:600, color:T.ink, marginBottom:6 }}>
                            {filter !== 'All' ? `No ${filter.toLowerCase()} automations` : 'No automations yet'}
                        </div>
                        <div style={{ fontSize:12.5, color:T.inkMuted, marginBottom:20 }}>
                            Create trigger-based rules that fire actions automatically when CRM events occur.
                        </div>
                        {filter === 'All' && (
                            <button onClick={() => setShowModal(true)}
                                style={{ padding:'8px 20px', background:T.ink, color:'#fbf8f3', border:'none', borderRadius:T.r, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>
                                + Create first automation
                            </button>
                        )}
                    </div>
                ) : visible.map((rule, i) => {
                    const isMenuOpen = activeMenu === rule.id;
                    return (
                        <div key={rule.id} style={{ display:'grid', gridTemplateColumns:'50px 1fr 180px 100px 90px 80px 36px', gap:8,
                            padding:'11px 16px', borderBottom:i<visible.length-1?`1px solid ${T.border}`:'none',
                            alignItems:'center', opacity:rule.active?1:0.65 }}>
                            {/* Active toggle */}
                            <div onClick={() => handleToggle(rule)}
                                style={{ width:30, height:18, borderRadius:9, background:rule.active?T.ok:T.border, position:'relative', cursor:'pointer', transition:'background 120ms' }}>
                                <span style={{ position:'absolute', top:2, left:rule.active?14:2, width:14, height:14, borderRadius:'50%', background:'#fbf8f3', boxShadow:'0 1px 2px rgba(0,0,0,0.15)', transition:'left 100ms' }}/>
                            </div>
                            {/* Name */}
                            <div>
                                <div style={{ fontSize:13, fontWeight:600, color:T.ink }}>{rule.name}</div>
                                <div style={{ fontSize:11, color:T.inkMuted, marginTop:1 }}>
                                    {rule.conditions?.length > 0 ? `${rule.conditions.length} condition${rule.conditions.length!==1?'s':''} · ` : ''}
                                    {rule.actions?.length || 0} action{(rule.actions?.length||0)!==1?'s':''}
                                </div>
                            </div>
                            {/* Trigger */}
                            <span style={{ fontFamily:'ui-monospace,Menlo,monospace', fontSize:10.5, color:T.info, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                                {rule.triggerEvent}
                            </span>
                            {/* Run count */}
                            <div style={{ fontSize:12.5, color:T.inkMid }}>{rule.runCount || 0}</div>
                            {/* Last run */}
                            <div style={{ fontSize:11.5, color:T.inkMuted }}>{fmtRunAge(rule.lastRunAt)}</div>
                            {/* Status */}
                            <span style={{ display:'inline-block', padding:'2px 7px', borderRadius:10, fontSize:11, fontWeight:700,
                                background:rule.active?'rgba(77,107,61,0.12)':'rgba(138,131,120,0.12)',
                                color:rule.active?T.ok:T.inkMuted }}>
                                {rule.active ? 'Active' : 'Paused'}
                            </span>
                            {/* ⋯ menu */}
                            <div style={{ position:'relative' }}>
                                <button id={'auto-btn-' + rule.id}
                                    onClick={() => setActiveMenu(isMenuOpen ? null : rule.id)}
                                    style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:24, height:24,
                                        borderRadius:3, fontSize:15, fontWeight:700, border:'none', cursor:'pointer', lineHeight:1,
                                        color:isMenuOpen?T.goldInk:T.inkMuted, background:isMenuOpen?'rgba(200,185,154,0.30)':'transparent' }}>⋯</button>
                                {isMenuOpen && (
                                    <div id={'auto-menu-' + rule.id} style={{ position:'absolute', right:0, ...(i >= visible.length - 3 ? { bottom:'100%', marginBottom:4 } : { top:'100%', marginTop:4 }), zIndex:100,
                                        width:188, background:T.surface, border:`1px solid ${T.borderStrong}`,
                                        borderRadius:4, padding:4, boxShadow:'0 8px 24px rgba(42,38,34,0.12)', fontFamily:T.sans }}>
                                        <div style={{ position:'absolute', top:-6, right:10, width:12, height:12,
                                            background:T.surface, border:`1px solid ${T.borderStrong}`,
                                            borderRight:'none', borderBottom:'none', transform:'rotate(45deg)' }}/>
                                        {[
                                            { icon:rule.active?'⏸':'▶', label:rule.active?'Pause':'Resume', fn:() => handleToggle(rule) },
                                            { icon:'📋', label:'View run history', fn:() => handleViewRuns(rule) },
                                            null,
                                            { icon:'🗑', label:'Delete', fn:() => handleDelete(rule), danger:true },
                                        ].map((item,idx) => item===null ? (
                                            <div key={idx} style={{ height:1, background:T.border, margin:'2px 6px' }}/>
                                        ) : (
                                            <div key={idx} onClick={item.fn}
                                                style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', borderRadius:3, cursor:'pointer', color:item.danger?T.danger:T.ink }}
                                                onMouseEnter={e => e.currentTarget.style.background='rgba(200,185,154,0.10)'}
                                                onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                                                <span style={{ fontSize:12, width:14, textAlign:'center' }}>{item.icon}</span>
                                                <span style={{ fontSize:12.5, fontWeight:500 }}>{item.label}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            <div style={{ marginTop:16, padding:'12px 16px', background:'rgba(58,90,122,0.07)', borderLeft:`3px solid ${T.info}`, borderRadius:4, fontSize:12.5, color:T.inkMid }}>
                <b style={{ color:T.info }}>Supported triggers:</b> opportunity created/stage changed/won/lost, lead created/converted, task overdue/completed.
                Actions: create task, send email, fire webhook, update field. Run history is logged per execution.
            </div>
        </div>
    );
};
