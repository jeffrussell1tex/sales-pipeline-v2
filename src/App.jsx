import React, { useState, useEffect, useRef } from 'react';
import { useUser, useClerk, useAuth, useOrganization, useOrganizationList, SignIn } from '@clerk/clerk-react';
import { safeStorage, dbFetch } from './utils/storage';
import { initialOpportunities, stages, productOptions } from './utils/constants';
import CsvImportModal from './components/modals/CsvImportModal';
import { useSettings } from './hooks/useSettings';
import { useOpportunities } from './hooks/useOpportunities';
import { useAccounts } from './hooks/useAccounts';
import { useContacts } from './hooks/useContacts';
import { useTasks } from './hooks/useTasks';
import { useActivities } from './hooks/useActivities';
import { AppProvider, useApp } from './AppContext';
import SalesManagerTab from './Tabs/SalesManagerTab';
import ReportsTab from './Tabs/ReportsTab';
import ContactsTab from './Tabs/ContactsTab';
import LeadsTab from './Tabs/LeadsTab';
import AccountsTab from './Tabs/AccountsTab';
import OpportunitiesTab from './Tabs/OpportunitiesTab';
import PipelineTab from './Tabs/PipelineTab';
import TasksTab from './Tabs/TasksTab';
import HomeTab from './Tabs/HomeTab';
import ViewingContactPanel from './components/panels/ViewingContactPanel';
import ViewingAccountPanel from './components/panels/ViewingAccountPanel';
import ViewingTaskPanel from './components/panels/ViewingTaskPanel';
import SettingsTab from './Tabs/SettingsTab';
import LeadImportModal from './components/modals/LeadImportModal';
import OutlookImportModal from './components/modals/OutlookImportModal';
import PipelinesSettingsPanel from './components/modals/PipelinesSettingsPanel';
import LostReasonModal from './components/modals/LostReasonModal';
import ActivityModal from './components/modals/ActivityModal';
import OpportunityModal from './components/modals/OpportunityModal';
import ContactModal, { NestedNewContactForm, NestedNewAccountForm } from './components/modals/ContactModal';
import AccountModal from './components/modals/AccountModal';
import TaskModal from './components/modals/TaskModal';
import UserModal from './components/modals/UserModal';
import TaskItem from './components/ui/TaskItem';
import TimePicker from './components/ui/TimePicker';
import ViewingBar, { SliceDropdown } from './components/ui/ViewingBar';
import AnalyticsDashboard from './components/ui/AnalyticsDashboard';

function LeadForm({ lead, onSave, onClose, canSeeAll, allReps }) {
    const [form, setForm] = React.useState(lead || { firstName:'', lastName:'', company:'', title:'', email:'', phone:'', source:'', status:'New', score:50, estimatedARR:0, assignedTo:'', notes:'' });
    const set = (k, v) => setForm(f => ({...f, [k]: v}));
    return (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', zIndex:9999, display:'flex', alignItems:'flex-end', justifyContent:'center' }}>
            <div className="lead-form-modal" style={{ background:'#fff', borderRadius:'12px 12px 0 0', padding:'1.5rem', width:'100%', maxWidth:'480px', maxHeight:'90vh', overflowY:'auto', boxShadow:'0 20px 60px rgba(0,0,0,0.2)' }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.25rem' }}>
                    <h3 style={{ fontSize:'1rem', fontWeight:'800', color:'#0f172a' }}>{lead && lead.id ? 'Edit Lead' : 'New Lead'}</h3>
                    <button onClick={onClose} style={{ background:'none', border:'none', fontSize:'1.25rem', color:'#94a3b8', cursor:'pointer' }}>✕</button>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.75rem' }}>
                    {[['First Name','firstName'],['Last Name','lastName'],['Company','company'],['Title','title'],['Email','email'],['Phone','phone']].map(([label, key]) => (
                        <div key={key}>
                            <label style={{ fontSize:'0.6875rem', fontWeight:'700', color:'#64748b', display:'block', marginBottom:'0.25rem' }}>{label}</label>
                            <input value={form[key]||''} onChange={e => set(key, e.target.value)} style={{ width:'100%', padding:'0.4rem 0.625rem', border:'1px solid #e2e8f0', borderRadius:'6px', fontSize:'0.8125rem', fontFamily:'inherit' }} />
                        </div>
                    ))}
                    <div>
                        <label style={{ fontSize:'0.6875rem', fontWeight:'700', color:'#64748b', display:'block', marginBottom:'0.25rem' }}>Source</label>
                        <select value={form.source||''} onChange={e => set('source', e.target.value)} style={{ width:'100%', padding:'0.4rem 0.625rem', border:'1px solid #e2e8f0', borderRadius:'6px', fontSize:'0.8125rem', fontFamily:'inherit' }}>
                            <option value="">— select —</option>
                            {['Web Form','LinkedIn','Trade Show','Referral','CSV Import','Cold List','Email','Other'].map(s => <option key={s}>{s}</option>)}
                        </select>
                    </div>
                    <div>
                        <label style={{ fontSize:'0.6875rem', fontWeight:'700', color:'#64748b', display:'block', marginBottom:'0.25rem' }}>Status</label>
                        <select value={form.status||'New'} onChange={e => set('status', e.target.value)} style={{ width:'100%', padding:'0.4rem 0.625rem', border:'1px solid #e2e8f0', borderRadius:'6px', fontSize:'0.8125rem', fontFamily:'inherit' }}>
                            {['New','Contacted','Qualified','Working','Converted','Dead'].map(s => <option key={s}>{s}</option>)}
                        </select>
                    </div>
                    <div>
                        <label style={{ fontSize:'0.6875rem', fontWeight:'700', color:'#64748b', display:'block', marginBottom:'0.25rem' }}>Lead Score (0-100)</label>
                        <input type="number" min="0" max="100" value={form.score ?? ''} onChange={e => set('score', e.target.value === '' ? '' : e.target.value)} onBlur={e => set('score', Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))} style={{ width:'100%', padding:'0.4rem 0.625rem', border:'1px solid #e2e8f0', borderRadius:'6px', fontSize:'0.8125rem', fontFamily:'inherit' }} />
                    </div>
                    <div>
                        <label style={{ fontSize:'0.6875rem', fontWeight:'700', color:'#64748b', display:'block', marginBottom:'0.25rem' }}>Est. ARR ($)</label>
                        <input type="number" min="0" value={form.estimatedARR ?? ''} onChange={e => set('estimatedARR', e.target.value === '' ? '' : e.target.value)} onBlur={e => set('estimatedARR', parseInt(e.target.value) || 0)} style={{ width:'100%', padding:'0.4rem 0.625rem', border:'1px solid #e2e8f0', borderRadius:'6px', fontSize:'0.8125rem', fontFamily:'inherit' }} />
                    </div>
                    {canSeeAll && (
                        <div style={{ gridColumn:'span 2' }}>
                            <label style={{ fontSize:'0.6875rem', fontWeight:'700', color:'#64748b', display:'block', marginBottom:'0.25rem' }}>Assign To</label>
                            <select value={form.assignedTo||''} onChange={e => set('assignedTo', e.target.value)} style={{ width:'100%', padding:'0.4rem 0.625rem', border:'1px solid #e2e8f0', borderRadius:'6px', fontSize:'0.8125rem', fontFamily:'inherit' }}>
                                <option value="">— unassigned —</option>
                                {allReps.map(r => <option key={r.name} value={r.name}>{r.name}</option>)}
                            </select>
                        </div>
                    )}
                    <div style={{ gridColumn:'span 2' }}>
                        <label style={{ fontSize:'0.6875rem', fontWeight:'700', color:'#64748b', display:'block', marginBottom:'0.25rem' }}>Notes</label>
                        <textarea value={form.notes||''} onChange={e => set('notes', e.target.value)} rows={3} style={{ width:'100%', padding:'0.4rem 0.625rem', border:'1px solid #e2e8f0', borderRadius:'6px', fontSize:'0.8125rem', fontFamily:'inherit', resize:'vertical' }} />
                    </div>
                </div>
                <div style={{ display:'flex', gap:'0.5rem', marginTop:'1.25rem', justifyContent:'flex-end' }}>
                    <button onClick={onClose} style={{ padding:'0.45rem 1rem', border:'1px solid #e2e8f0', borderRadius:'6px', background:'#f8fafc', fontSize:'0.8125rem', fontWeight:'700', cursor:'pointer', fontFamily:'inherit', color:'#475569' }}>Cancel</button>
                    <button onClick={() => onSave(form)} style={{ padding:'0.45rem 1.25rem', border:'none', borderRadius:'6px', background:'#2563eb', color:'#fff', fontSize:'0.8125rem', fontWeight:'700', cursor:'pointer', fontFamily:'inherit' }}>Save Lead</button>
                </div>
            </div>
        </div>
    );
}





function FunnelView({ pipelineFilteredOpps, funnelExpandedStage, setFunnelExpandedStage, handleEdit, handleDelete }) {
    const { stages, settings } = useApp();
    const stageColors = ['#6366f1','#8b5cf6','#0ea5e9','#f59e0b','#f97316','#10b981','#16a34a','#ef4444'];
    return (
        <div style={{ padding: '1.25rem 1.5rem' }}>
            {stages.map((stage, idx) => {
                const stageOpps = pipelineFilteredOpps.filter(o => o.stage === stage);
                const stageARR = stageOpps.reduce((s, o) => s + (parseFloat(o.arr) || 0), 0);
                const maxCount = Math.max(...stages.map(s2 => pipelineFilteredOpps.filter(o => o.stage === s2).length), 1);
                const barPct = stageOpps.length === 0 ? 4 : Math.max(8, Math.round((stageOpps.length / maxCount) * 100));
                const color = stageColors[idx % stageColors.length];
                const isExpanded = funnelExpandedStage === stage;
                const stDef = (settings.funnelStages || []).find(s2 => s2.name === stage);
                return (
                    <div key={stage}>
                        <div
                            onClick={() => setFunnelExpandedStage(isExpanded ? null : stage)}
                            style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.375rem', cursor: 'pointer', padding: '0.25rem 0.5rem', borderRadius: '6px' }}
                            onMouseEnter={e => { e.currentTarget.style.background = '#f1f5f9'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                            <div style={{ width: '170px', flexShrink: 0, textAlign: 'right', paddingRight: '0.75rem' }}>
                                <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{stage}</div>
                                <div style={{ fontSize: '0.6875rem', color: color, fontWeight: '700' }}>{Math.round(stageARR/1000)}K - {stageOpps.length} deal{stageOpps.length !== 1 ? 's' : ''}</div>
                            </div>
                            <div style={{ flex: 1, height: '38px', display: 'flex', alignItems: 'center' }}>
                                <div style={{ width: barPct + '%', height: '100%', borderRadius: '5px', background: color, opacity: stageOpps.length === 0 ? 0.15 : 0.85, display: 'flex', alignItems: 'center', paddingLeft: '0.625rem', minWidth: '28px' }}>
                                    {stageOpps.length > 0 && <span style={{ fontSize: '0.6875rem', fontWeight: '800', color: '#fff' }}>{stageOpps.length}</span>}
                                </div>
                            </div>
                            <div style={{ width: '80px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                {stDef && <span style={{ fontSize: '0.6875rem', color: '#94a3b8' }}>{stDef.weight}% prob</span>}
                                <span style={{ fontSize: '0.625rem', color: '#94a3b8' }}>{isExpanded ? '▲' : '▼'}</span>
                            </div>
                        </div>
                        {isExpanded && stageOpps.length > 0 && (
                            <div style={{ marginLeft: '170px', marginBottom: '0.75rem', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', background: '#fff' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 90px 110px 110px', padding: '0.375rem 0.75rem', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em', gap: '0.75rem' }}>
                                    <span>Opportunity</span>
                                    <span>Account</span>
                                    <span style={{ textAlign: 'right' }}>ARR</span>
                                    <span style={{ textAlign: 'center' }}>Close Date</span>
                                    <span style={{ textAlign: 'center' }}>Actions</span>
                                </div>
                                {stageOpps.map(opp => (
                                    <div key={opp.id}
                                        style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 90px 110px 110px', padding: '0.5rem 0.75rem', borderBottom: '1px solid #f1f5f9', fontSize: '0.8125rem', alignItems: 'center', gap: '0.75rem' }}
                                        onMouseEnter={e => { e.currentTarget.style.background = '#f8fafc'; }}
                                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                                        <span style={{ fontWeight: '600', color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opp.opportunityName || opp.account}</span>
                                        <span style={{ color: '#64748b', fontSize: '0.75rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opp.account}</span>
                                        <span style={{ fontWeight: '700', color: '#2563eb', fontSize: '0.75rem', textAlign: 'right', whiteSpace: 'nowrap' }}>${(parseFloat(opp.arr)||0).toLocaleString()}</span>
                                        <span style={{ color: '#94a3b8', fontSize: '0.6875rem', whiteSpace: 'nowrap', textAlign: 'center' }}>{opp.forecastedCloseDate ? new Date(opp.forecastedCloseDate + 'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'2-digit'}) : '—'}</span>
                                        <div style={{ display: 'flex', gap: '0.375rem', justifyContent: 'center' }}>
                                            <button className="action-btn" onClick={e => { e.stopPropagation(); handleEdit(opp); }} style={{ padding: '0.15rem 0.5rem', fontSize: '0.6875rem' }}>Edit</button>
                                            <button className="action-btn delete" onClick={e => { e.stopPropagation(); handleDelete(opp.id); }} style={{ padding: '0.15rem 0.5rem', fontSize: '0.6875rem' }}>Del</button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                        {isExpanded && stageOpps.length === 0 && (
                            <div style={{ marginLeft: '170px', marginBottom: '0.75rem', padding: '0.75rem', background: '#f8fafc', borderRadius: '8px', fontSize: '0.75rem', color: '#94a3b8', textAlign: 'center', border: '1px dashed #e2e8f0' }}>No deals in this stage</div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

function KanbanView({ pipelineFilteredOpps, kanbanDragging, kanbanDragOver, setKanbanDragging, setKanbanDragOver, handleEdit, handleDelete }) {
    const { stages, opportunities, setOpportunities, currentUser, calculateDealHealth } = useApp();
    const stageColors = ['#6366f1','#8b5cf6','#0ea5e9','#f59e0b','#f97316','#10b981','#16a34a','#ef4444'];

    const handleKanbanDrop = (toStage) => {
        if (!kanbanDragging || kanbanDragging.fromStage === toStage) {
            setKanbanDragging(null); setKanbanDragOver(null); return;
        }
        const today = [new Date().getFullYear(), String(new Date().getMonth()+1).padStart(2,'0'), String(new Date().getDate()).padStart(2,'0')].join('-');
        const updatedOpp = opportunities.find(o => o.id === kanbanDragging.oppId);
        if (!updatedOpp) return;
        const newOpp = {
            ...updatedOpp, stage: toStage, stageChangedDate: today,
            stageHistory: [...(updatedOpp.stageHistory||[]), { stage: toStage, date: today, prevStage: updatedOpp.stage, author: currentUser||'', timestamp: new Date().toISOString() }]
        };
        setOpportunities(prev => prev.map(o => o.id === kanbanDragging.oppId ? newOpp : o));
        dbFetch('/.netlify/functions/opportunities', { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(newOpp) }).catch(console.error);
        setKanbanDragging(null); setKanbanDragOver(null);
    };

    return (
        <div style={{ padding: '1rem 1.25rem 1.5rem' }}>
            <div className="spt-kanban-wrap" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                {stages.filter(s => s !== 'Closed Lost').map((stage, idx) => {
                    const color = stageColors[idx % stageColors.length];
                    const colOpps = pipelineFilteredOpps.filter(o => o.stage === stage);
                    const colARR = colOpps.reduce((s, o) => s + (parseFloat(o.arr)||0), 0);
                    const isDragOver = kanbanDragOver === stage;
                    return (
                        <div key={stage}
                            onDragOver={e => { e.preventDefault(); setKanbanDragOver(stage); }}
                            onDragLeave={e => { setKanbanDragOver(null); }}
                            onDrop={() => handleKanbanDrop(stage)}
                            style={{ width: '200px', flexShrink: 0, flexGrow: 1, minWidth: '160px', maxWidth: '240px', background: isDragOver ? '#eff6ff' : '#f8fafc', border: isDragOver ? '1px solid #93c5fd' : '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden', transition: 'all 0.15s' }}>
                            <div style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid #e2e8f0', borderTop: '3px solid ' + color, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span style={{ fontSize: '0.6875rem', fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{stage}</span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexShrink: 0 }}>
                                    <span style={{ fontSize: '0.6rem', fontWeight: '700', background: '#e2e8f0', color: '#64748b', borderRadius: '10px', padding: '0.1rem 0.35rem' }}>{colOpps.length}</span>
                                    <span style={{ fontSize: '0.6rem', fontWeight: '700', color: color }}>{Math.round(colARR/1000)}K</span>
                                </div>
                            </div>
                            <div style={{ padding: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', minHeight: '80px' }}>
                                {colOpps.map(opp => {
                                    const health = calculateDealHealth(opp);
                                    const healthColor = health.score >= 70 ? '#10b981' : health.score >= 40 ? '#f59e0b' : '#ef4444';
                                    const isDragging = kanbanDragging && kanbanDragging.oppId === opp.id;
                                    return (
                                        <div key={opp.id}
                                            draggable
                                            onDragStart={() => setKanbanDragging({ oppId: opp.id, fromStage: stage })}
                                            onDragEnd={() => { setKanbanDragging(null); setKanbanDragOver(null); }}
                                            style={{ background: '#fff', borderRadius: '7px', border: '1px solid #e2e8f0', padding: '0.5rem 0.625rem', cursor: 'grab', opacity: isDragging ? 0.5 : 1, boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}
                                            onMouseEnter={e => { e.currentTarget.style.borderColor = '#2563eb'; }}
                                            onMouseLeave={e => { e.currentTarget.style.borderColor = '#e2e8f0'; }}>
                                            <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#1e293b', marginBottom: '0.2rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{opp.opportunityName || opp.account}</div>
                                            <div style={{ fontSize: '0.6375rem', color: '#64748b', marginBottom: '0.25rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{opp.account}</div>
                                            {opp.salesRep && <div style={{ fontSize: '0.6rem', color: '#94a3b8', marginBottom: '0.25rem' }}>{'\u{1F464} ' + opp.salesRep}</div>}
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                <span style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#2563eb' }}>{Math.round((parseFloat(opp.arr)||0)/1000)}K</span>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: healthColor, flexShrink: 0 }}></div>
                                                    <span style={{ fontSize: '0.6rem', color: '#94a3b8' }}>{opp.forecastedCloseDate ? opp.forecastedCloseDate.slice(5) : '-'}</span>
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', gap: '0.25rem', marginTop: '0.375rem' }}>
                                                <button className="action-btn" onClick={() => handleEdit(opp)} style={{ flex: 1, padding: '0.15rem 0', fontSize: '0.6rem', textAlign: 'center' }}>Edit</button>
                                                <button className="action-btn delete" onClick={() => handleDelete(opp.id)} style={{ flex: 1, padding: '0.15rem 0', fontSize: '0.6rem', textAlign: 'center' }}>Del</button>
                                            </div>
                                        </div>
                                    );
                                })}
                                {colOpps.length === 0 && (
                                    <div style={{ fontSize: '0.6875rem', color: '#cbd5e1', textAlign: 'center', padding: '1rem 0', fontStyle: 'italic' }}>Drop here</div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}


function QuotaRepCard({ u, quotaMode, quarters, dotBg, dotTxt, inputSt, updateRepField, compactInput }) {
    const initials = (name) => (name||'').split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase();
    const cardStyle = { background:'#fff', border:'1px solid #e2e8f0', borderRadius:'10px', overflow:'hidden' };
    const topStyle  = { display:'flex', alignItems:'center', gap:'10px', padding:'0.75rem 1rem', borderBottom:'1px solid #f1f5f9' };
    const bodyStyle = { padding:'0.875rem 1rem', display:'flex', flexDirection:'column', gap:'8px' };
    const lblStyle  = { fontSize:'0.625rem', fontWeight:'700', color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:'3px' };
    const qGridStyle = { display:'grid', gridTemplateColumns:'1fr 1fr', gap:'6px' };

    // Use local state for the input values so typing feels instant.
    // Only persist to DB on blur (when user leaves the field) to avoid
    // writing partial/zero values on every keystroke.
    const [localAnnual, setLocalAnnual] = React.useState(u.annualQuota != null ? String(u.annualQuota) : '');
    const [localQ, setLocalQ] = React.useState(() => {
        const out = {};
        ['q1','q2','q3','q4'].forEach(q => { out[q] = u[q+'Quota'] != null ? String(u[q+'Quota']) : ''; });
        return out;
    });

    // Sync local state when the user record updates from outside (e.g. initial DB load)
    React.useEffect(() => { setLocalAnnual(u.annualQuota != null ? String(u.annualQuota) : ''); }, [u.annualQuota]);
    React.useEffect(() => {
        setLocalQ(prev => {
            const out = { ...prev };
            ['q1','q2','q3','q4'].forEach(q => { out[q] = u[q+'Quota'] != null ? String(u[q+'Quota']) : ''; });
            return out;
        });
    }, [u.q1Quota, u.q2Quota, u.q3Quota, u.q4Quota]);

    const commitAnnual = (rawVal) => {
        const val = parseFloat(rawVal);
        if (!isNaN(val) && val >= 0) updateRepField(u.id, 'annualQuota', val);
    };
    const commitQ = (qKey, rawVal) => {
        const val = parseFloat(rawVal);
        if (!isNaN(val) && val >= 0) updateRepField(u.id, qKey + 'Quota', val);
    };

    // compactInput mode — renders only the input(s), no card wrapper
    // Used by the Option C list layout where the card chrome is handled by the row
    if (compactInput) {
        if (quotaMode === 'annual') {
            return (
                <input type="number" value={localAnnual} placeholder="0"
                    onChange={e => setLocalAnnual(e.target.value)}
                    onBlur={e => { e.target.style.borderColor='#e2e8f0'; commitAnnual(e.target.value); }}
                    onFocus={e => e.target.style.borderColor='#2563eb'}
                    style={inputSt} />
            );
        }
        return (
            <div style={{ display:'flex', flexDirection:'column', gap:'4px' }}>
                {[['Q1','Q2'],['Q3','Q4']].map((pair, pi) => (
                    <div key={pi} style={{ display:'flex', gap:'4px' }}>
                        {pair.map(q => {
                            const qKey = q.toLowerCase();
                            return (
                                <div key={q} style={{ display:'flex', flexDirection:'column', gap:'1px' }}>
                                    <div style={{ fontSize:'0.5rem', fontWeight:'700', color:'#94a3b8', textTransform:'uppercase' }}>{q}</div>
                                    <input type="number" value={localQ[qKey]||''} placeholder="0"
                                        onChange={e => setLocalQ(prev => ({ ...prev, [qKey]: e.target.value }))}
                                        onBlur={e => { e.target.style.borderColor='#e2e8f0'; commitQ(qKey, e.target.value); }}
                                        onFocus={e => e.target.style.borderColor='#2563eb'}
                                        style={inputSt} />
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div style={cardStyle}>
            <div style={topStyle}>
                <div style={{ width:'32px', height:'32px', borderRadius:'50%', background:dotBg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.6875rem', fontWeight:'700', color:dotTxt, flexShrink:0 }}>
                    {initials(u.name)}
                </div>
                <div style={{ minWidth:0 }}>
                    <div style={{ fontSize:'0.8125rem', fontWeight:'700', color:'#1e293b', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{u.name}</div>
                    <div style={{ fontSize:'0.6875rem', color:'#94a3b8', marginTop:'1px' }}>{u.team || u.territory || 'No team'}</div>
                </div>
            </div>
            <div style={bodyStyle}>
                {quotaMode === 'annual' ? (
                    <div>
                        <div style={lblStyle}>Annual quota</div>
                        <input type="number" value={localAnnual} placeholder="0"
                            onChange={e => setLocalAnnual(e.target.value)}
                            onBlur={e => { e.target.style.borderColor='#e2e8f0'; commitAnnual(e.target.value); }}
                            onFocus={e => e.target.style.borderColor='#2563eb'}
                            style={inputSt} />
                    </div>
                ) : (
                    <div style={qGridStyle}>
                        {quarters.map(q => {
                            const qKey = q.toLowerCase();
                            return (
                                <div key={q}>
                                    <div style={lblStyle}>{q}</div>
                                    <input type="number" value={localQ[qKey]||''} placeholder="0"
                                        onChange={e => setLocalQ(prev => ({ ...prev, [qKey]: e.target.value }))}
                                        onBlur={e => { e.target.style.borderColor='#e2e8f0'; commitQ(qKey, e.target.value); }}
                                        onFocus={e => e.target.style.borderColor='#2563eb'}
                                        style={{ ...inputSt, fontSize:'0.8125rem' }} />
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}

function App() {
    // Clerk auth — powered by @clerk/clerk-react
    const { user: clerkUser, isLoaded: clerkLoaded } = useUser();
    const { signOut } = useClerk();
    const { getToken } = useAuth();
    const { organization, isLoaded: orgLoaded } = useOrganization();
    const { userMemberships, setActive, isLoaded: orgListLoaded } = useOrganizationList({
        userMemberships: { infinite: true },
    });

    // Auto-activate the user's first org if none is active
    React.useEffect(() => {
        if (!orgListLoaded || !clerkLoaded) return;
        if (organization) return; // already active
        const firstMembership = userMemberships?.data?.[0];
        if (firstMembership?.organization?.id) {
            setActive({ organization: firstMembership.organization.id });
        }
    }, [orgListLoaded, clerkLoaded, organization, userMemberships?.data]);

    // Guard: prevents settings useEffect from writing to DB before DB data has loaded.
    // Without this, the effect fires on mount with localStorage/default values and
    // overwrites the DB — the #1 cause of data loss / "self-deleting" content.
    // settingsReady managed by useSettings hook

    // Make getToken available to dbFetch utility
    // organizationId in getToken ensures Clerk includes org_id in the JWT
    useEffect(() => {
        window.__getClerkToken = () => getToken({ organizationId: organization?.id });
    }, [getToken, organization]);
    const clerkUserMeta = clerkUser?.publicMetadata || {};
    const currentUser = clerkUser
        ? (((clerkUser.firstName || '') + ' ' + (clerkUser.lastName || '')).trim() || clerkUser.emailAddresses?.[0]?.emailAddress || 'User')
        : '';
    const [userRole, setUserRole] = React.useState('User');

    React.useEffect(() => {
        if (clerkUser) {
            const meta = clerkUser.publicMetadata || {};
            setUserRole(meta.role || 'User');
            window.clerkCurrentUser = currentUser;
            window.clerkUserRole = meta.role || 'User';
            window.clerkManagedReps = meta.managedReps || [];
        }
    }, [clerkUser]);
    const [activeTab, setActiveTab] = useState('home');

    // ── Quick-log panel (pipeline floating button) ──
    const [quickLogOpen, setQuickLogOpen] = useState(false);
    const [quickLogForm, setQuickLogForm] = useState({ type: 'Call', notes: '', opportunityId: '', contactId: '', contactSearch: '', addToCalendar: false });
    const [quickLogContactResults, setQuickLogContactResults] = useState([]);

    // ── Follow-up task prompt (shown after saving an activity) ──
    const [followUpPrompt, setFollowUpPrompt] = useState(null); // { opportunityId, opportunityName }

    // ── Mobile: track viewport for pipeline list view ──
    const [isMobile, setIsMobile] = useState(() => window.innerWidth < 640);
    useEffect(() => {
        const onResize = () => setIsMobile(window.innerWidth < 640);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    // ── Phase 1: Custom Hooks ─────────────────────────────────────────
    const {
        settings, setSettings, settingsReady,
        loadSettings, handleUpdateFiscalYearStart, handleAddTaskType,
    } = useSettings();

    // Dependency refs — populated after showConfirm/softDelete/addAudit are defined below
    const _addAuditRef    = useRef(null);
    const _showConfirmRef = useRef(null);
    const _softDeleteRef  = useRef(null);
    const _setUndoRef     = useRef(null);
    const _getQuarterRef    = useRef(null);
    const _getQuarterLabelRef = useRef(null);
    const _deps = {
        get addAudit()         { return _addAuditRef.current; },
        get showConfirm()      { return _showConfirmRef.current; },
        get softDelete()       { return _softDeleteRef.current; },
        get setUndoToast()     { return _setUndoRef.current; },
        get getQuarter()       { return _getQuarterRef.current; },
        get getQuarterLabel()  { return _getQuarterLabelRef.current; },
    };

    const {
        opportunities, setOpportunities,
        oppModalError, setOppModalError,
        oppModalSaving, setOppModalSaving,
        loadOpportunities,
        handleDelete, handleSave, completeLostSave,
    } = useOpportunities(_deps);

    const {
        accounts, setAccounts,
        accountModalError, setAccountModalError,
        accountModalSaving,
        setAccountModalSaving,
        loadAccounts, getSubAccounts,
        handleDeleteAccount, handleDeleteSubAccount, handleSaveAccount,
    } = useAccounts(_deps);

    const {
        contacts, setContacts,
        contactModalError, setContactModalError,
        contactModalSaving,
        setContactModalSaving,
        loadContacts,
        handleDeleteContact, handleSaveContact,
    } = useContacts(_deps);

    const {
        tasks, setTasks,
        taskModalError, setTaskModalError,
        taskModalSaving,
        setTaskModalSaving,
        calendarAddingTaskId, calendarAddFeedback,
        loadTasks,
        handleDeleteTask, handleSaveTask,
        handleCompleteTask, handleAddTaskToCalendar,
    } = useTasks(_deps);

    const {
        activities, setActivities,
        activityModalError, setActivityModalError,
        activityModalSaving,
        setActivityModalSaving,
        loadActivities,
        handleDeleteActivity, handleSaveActivity,
    } = useActivities({ showConfirm: (...a) => _showConfirmRef.current?.(...a) });

    const [leads, setLeads] = React.useState([]);
    const [showModal, setShowModal] = useState(false);
    const [showSpiffClaimModal, setShowSpiffClaimModal] = useState(false);
    const [spiffClaimContext, setSpiffClaimContext] = useState(null); // { opp }
    const [spiffClaims, setSpiffClaims] = useState(() => {
        try { return JSON.parse(safeStorage.getItem('spiffClaims') || '[]'); } catch { return []; }
    });
    const [showAccountModal, setShowAccountModal] = useState(false);
    const [showUserModal, setShowUserModal] = useState(false);
    const [showTaskModal, setShowTaskModal] = useState(false);
    const [showContactModal, setShowContactModal] = useState(false);
    const [showProfilePanel, setShowProfilePanel] = useState(false);
    const [profilePanelTab, setProfilePanelTab] = useState('profile');
    const [myProfile, setMyProfile] = useState(null);
    const [profileSaving, setProfileSaving] = useState(false);
    const [profileForm, setProfileForm] = useState({ firstName: '', lastName: '', email: '', phone: '', title: '' });
    const [editingOpp, setEditingOpp] = useState(null);
    const [editingAccount, setEditingAccount] = useState(null);
    const [editingSubAccount, setEditingSubAccount] = useState(null);
    const [parentAccountForSub, setParentAccountForSub] = useState(null);
    const [editingUser, setEditingUser] = useState(null);
    const [editingTask, setEditingTask] = useState(null);
    const [editingContact, setEditingContact] = useState(null);
    const [lastCreatedAccountName, setLastCreatedAccountName] = useState(null);
    const [accountCreatedFromOppForm, setAccountCreatedFromOppForm] = useState(false);
    const [pendingOppFormData, setPendingOppFormData] = useState(null);
    const [lastCreatedRepName, setLastCreatedRepName] = useState(null);
    const [expandedAccounts, setExpandedAccounts] = useState({});
    const [expandedIndustry, setExpandedIndustry] = useState(null);
    const [accountsSortDir, setAccountsSortDir] = useState('asc');
    const [accountsViewMode, setAccountsViewMode] = useState('compact');
    const [selectedAccounts, setSelectedAccounts] = useState([]);
    const [viewingContact, setViewingContact] = useState(null);
    const [contactShowAllDeals, setContactShowAllDeals] = useState(false);
    const [contactsSortBy, setContactsSortBy] = useState('lastName');
    const [selectedContacts, setSelectedContacts] = useState([]);
    useEffect(() => { setContactShowAllDeals(false); }, [viewingContact]);
    const [viewingAccount, setViewingAccount] = useState(null);
    const [accShowAllClosed, setAccShowAllClosed] = useState(false);
    const [accShowAllContacts, setAccShowAllContacts] = useState(false);
    useEffect(() => { setAccShowAllClosed(false); setAccShowAllContacts(false); }, [viewingAccount]);
    const [quotaForecastFilter, setQuotaForecastFilter] = useState([]);
    const [commissionsFilter, setCommissionsFilter] = useState([]);
    const [reportOppSortField, setReportOppSortField] = useState('closeDate');
    const [reportOppSortDir, setReportOppSortDir] = useState('asc');
    const [notesPopover, setNotesPopover] = useState(null); // { opp, type: 'notes'|'comments', rect }
    const [undoToast, setUndoToast] = useState(null); // { label, restore, timerId }
    const [auditSearch, setAuditSearch] = useState('');
    const [auditEntityFilter, setAuditEntityFilter] = useState('all');
    const [auditActionFilter, setAuditActionFilter] = useState('all');
    const [pipelineSortField, setPipelineSortField] = useState('closeDate');
    const [pipelineSortDir, setPipelineSortDir] = useState('asc');
    const [activePipelineId, setActivePipelineId] = useState('default');
    // Shared Viewing bar — persists across Home / Pipeline / Opportunities / Tasks
    const [viewingRep, setViewingRep] = useState(null);
    const [viewingTeam, setViewingTeam] = useState(null);
    const [viewingTerritory, setViewingTerritory] = useState(null);
    // Activity Feed state
    const [feedFilter, setFeedFilter] = useState('all');
    const [feedLastRead, setFeedLastRead] = useState(() => {
        try { return safeStorage.getItem('feedLastRead') || new Date(0).toISOString(); } catch(e) { return new Date(0).toISOString(); }
    });
    const [viewingTask, setViewingTask] = useState(null);
    const [taskReminderPopup, setTaskReminderPopup] = useState(null);
    const [taskReminderSnoozeH, setTaskReminderSnoozeH] = useState(0);
    const [taskReminderSnoozeM, setTaskReminderSnoozeM] = useState(15);
    const [dbOffline, setDbOffline] = useState(false);
    const [taskDuePopup, setTaskDuePopup] = useState(null);
    const [taskDueQueue, setTaskDueQueue] = useState([]);
    const [taskDueSnoozeH, setTaskDueSnoozeH] = useState(0);
    const [taskDueSnoozeM, setTaskDueSnoozeM] = useState(15);
    const [dismissedDueTodayAlerts, setDismissedDueTodayAlerts] = useState([]);
    const [dismissedReminders, setDismissedReminders] = useState([]);
    const [confirmModal, setConfirmModal] = useState(null);
    const [lostReasonModal, setLostReasonModal] = useState(null); // { pendingFormData, editingOpp }

    const showConfirm = (message, onConfirm, danger = true) => {
        setConfirmModal({ message, onConfirm, danger });
    };

    // ── Audit log helper ───────────────────────────────────────
    const addAudit = (action, entity, entityId, label, detail = '') => {
        const entry = {
            id: Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            action,
            entityType: entity,
            entityId,
            entityName: label,
            detail,
            userName: currentUser || 'Unknown',
            timestamp: new Date().toISOString(),
        };
        dbFetch('/.netlify/functions/audit-log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(entry)
        }).catch(err => console.error('Failed to save audit entry:', err));
    };

    // ── Soft delete with undo toast ────────────────────────────────
    const softDelete = (label, deleteFunc, restoreFunc) => {
        // Execute delete immediately
        deleteFunc();
        // Clear any previous toast
        if (undoToast) clearTimeout(undoToast.timerId);
        const timerId = setTimeout(() => setUndoToast(null), 10000);
        setUndoToast({ label, restore: restoreFunc, timerId });
    };

    // Populate hook dependency refs now that the functions are defined
    _addAuditRef.current       = addAudit;
    _showConfirmRef.current    = showConfirm;
    _softDeleteRef.current     = softDelete;
    _setUndoRef.current        = setUndoToast;
    // Note: getQuarter/getQuarterLabel refs populated below after those functions are defined

    // Dynamic stages from settings funnel stages
    const stages = (settings.funnelStages && settings.funnelStages.length > 0)
        ? settings.funnelStages.filter(s => s.name.trim()).map(s => s.name)
        : ['Qualification', 'Discovery', 'Evaluation (Demo)', 'Proposal', 'Negotiation/Review', 'Contracts', 'Closed Won', 'Closed Lost'];

    const [settingsView, setSettingsView] = useState('menu'); // menu, fiscal-year, logo, users, pain-points, vertical-markets

    const [tasksExpandedSections, setTasksExpandedSections] = useState({
        inProcess: false,
        today: true,
        thisWeek: false,
        thisMonth: false,
        all: false,
        completed: false
    });
    const [newPainPointInput, setNewPainPointInput] = useState('');
    const [newVerticalMarketInput, setNewVerticalMarketInput] = useState('');
    
    // Activity Timeline & History
    // activities managed by useActivities hook
    const [showActivityModal, setShowActivityModal] = useState(false);
    const [editingActivity, setEditingActivity] = useState(null);
    const [showShortcuts, setShowShortcuts] = useState(false);
    const [activityInitialContext, setActivityInitialContext] = useState(null);
    
    // Notifications
    const [notifications, setNotifications] = useState([]);
    const [showNotifications, setShowNotifications] = useState(false);
    const [globalSearch, setGlobalSearch] = useState('');
    const [showSearchResults, setShowSearchResults] = useState(false);
    
    // Outlook Email Import
    const [showOutlookImportModal, setShowOutlookImportModal] = useState(false);
    
    // CSV Import
    const [showCsvImportModal, setShowCsvImportModal] = useState(false);
    const [showLeadImportModal, setShowLeadImportModal] = useState(false);
    const [csvImportType, setCsvImportType] = useState('contacts');

    // Calendar strip state
    const [calendarEvents, setCalendarEvents] = useState([]);
    const [calendarLoading, setCalendarLoading] = useState(false);
    const [calendarError, setCalendarError] = useState(null);
    const [calendarConnected, setCalendarConnected] = useState(false);

    // Calendar view state
    const [calView, setCalView] = useState('week'); // 'week' | 'month'
    const [calOffset, setCalOffset] = useState(0);  // week/month offset from today
    const [showCalConfig, setShowCalConfig] = useState(false);
    const [calShowGcal, setCalShowGcal] = useState(true);
    const [calShowCalls, setCalShowCalls] = useState(true);
    const [calShowMeetings, setCalShowMeetings] = useState(true);
    const [calShowWeekends, setCalShowWeekends] = useState(true);
    const [calRepFilter, setCalRepFilter] = useState('all'); // 'all' or a rep name
    const [calProvider, setCalProvider] = useState('google'); // 'google' | 'microsoft' | 'yahoo' | 'apple'

    // Log from Calendar state
    const [logFromCalOpen, setLogFromCalOpen] = useState(false);
    const [logFromCalDateFrom, setLogFromCalDateFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().split('T')[0]; });
    const [logFromCalDateTo, setLogFromCalDateTo] = useState(() => [new Date().getFullYear(), String(new Date().getMonth()+1).padStart(2,'0'), String(new Date().getDate()).padStart(2,'0')].join('-'));
    const [logFromCalEvents, setLogFromCalEvents] = useState([]);
    const [logFromCalLoading, setLogFromCalLoading] = useState(false);
    const [logFromCalError, setLogFromCalError] = useState(null);
    const [loggedCalendarIds, setLoggedCalendarIds] = useState(new Set());
    const [logFromCalLinkingId, setLogFromCalLinkingId] = useState(null);
    const [logFromCalOppMap, setLogFromCalOppMap] = useState({});

    // Meeting prep panel state
    const [meetingPrepEvent, setMeetingPrepEvent] = useState(null); // the calendar event being prepped
    const [meetingPrepOpen, setMeetingPrepOpen] = useState(false);
    const [meetingPrepOppId, setMeetingPrepOppId] = useState(null); // optional forced opp ID (e.g. from task)

    // Loading states for import/export operations
    const [exportingCSV, setExportingCSV] = useState(null); // tracks which CSV is exporting by key
    const [exportingBackup, setExportingBackup] = useState(false);
    const [restoringBackup, setRestoringBackup] = useState(false);

    // Quota & Commission

      useEffect(() => {
    if (!clerkUser) return; // Don't load until authenticated
    const loadData = async () => {
const checkOk = (r) => { if (!r.ok) { setDbOffline(true); throw new Error('HTTP ' + r.status); } setDbOffline(false); return r; };

// ── Data loading delegated to hooks ──────────────────────────────
loadOpportunities(setDbOffline);
loadAccounts(setDbOffline);
loadContacts(setDbOffline);
loadTasks(setDbOffline);
loadActivities(setDbOffline);

dbFetch('/.netlify/functions/leads')
    .then(checkOk).then(r => r.json())
    .then(data => setLeads(data.leads || []))
    .catch(err => console.error('Failed to load leads:', err));

// Settings + users loading delegated to useSettings hook
loadSettings(clerkUser);

// Load current user's own profile (notification prefs, etc.)
dbFetch('/.netlify/functions/users?me=true')
    .then(r => r.ok ? r.json() : null)
    .then(data => {
        if (data?.user) {
            setMyProfile(data.user);
            setProfileForm({
                firstName: data.user.firstName || '',
                lastName:  data.user.lastName  || '',
                email:     data.user.email     || '',
                phone:     data.user.phone     || '',
                title:     data.user.title     || '',
            });
        }
    })
    .catch(() => {});
    };
    loadData();
}, [clerkUser]);

           

    // ── Global keyboard shortcuts ─────────────────────────────
    useEffect(() => {
        const handler = (e) => {
            const tag = document.activeElement?.tagName?.toLowerCase();
            const isTyping = tag === 'input' || tag === 'textarea' || tag === 'select' || document.activeElement?.isContentEditable;

            // Escape — close topmost open thing
            if (e.key === 'Escape') {
                if (showShortcuts) { setShowShortcuts(false); return; }
                if (showActivityModal) { setShowActivityModal(false); return; }
                if (showModal) { setShowModal(false); setEditingOpp(null); return; }
                if (showAccountModal) { setShowAccountModal(false); setEditingAccount(null); return; }
                if (showContactModal) { setShowContactModal(false); setEditingContact(null); return; }
                if (showTaskModal) { setShowTaskModal(false); setEditingTask(null); return; }
                if (showUserModal) { setShowUserModal(false); setEditingUser(null); return; }
                if (showProfilePanel) { setShowProfilePanel(false); return; }
                if (confirmModal) { setConfirmModal(null); return; }
                if (notesPopover) { setNotesPopover(null); return; }
                if (undoToast) { clearTimeout(undoToast.timerId); setUndoToast(null); return; }
                if (showNotifications) { setShowNotifications(false); return; }
                if (showSearchResults) { setShowSearchResults(false); setGlobalSearch(''); return; }
                return;
            }

            // Don't fire shortcuts while typing
            if (isTyping) return;
            // Don't fire if any modal is open (except ? for help)
            const anyModalOpen = showModal || showAccountModal || showContactModal || showTaskModal || showUserModal || showActivityModal || confirmModal;

            if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
                e.preventDefault();
                setShowShortcuts(v => !v);
                return;
            }

            if (anyModalOpen) return;

            switch (e.key) {
                case 'n': case 'N':
                    e.preventDefault();
                    setEditingOpp(null); setShowModal(true);
                    break;
                case 'a': case 'A':
                    e.preventDefault();
                    setEditingAccount(null); setShowAccountModal(true);
                    break;
                case 'c': case 'C':
                    e.preventDefault();
                    setEditingContact(null); setShowContactModal(true);
                    break;
                case 't': case 'T':
                    e.preventDefault();
                    setEditingTask(null); setShowTaskModal(true);
                    break;
                case '1':
                    e.preventDefault(); setActiveTab('home'); break;
                case '2':
                    e.preventDefault(); setActiveTab('pipeline'); break;
                case '3':
                    e.preventDefault(); setActiveTab('opportunities'); break;
                case '4':
                    e.preventDefault(); setActiveTab('tasks'); break;
                case '5':
                    e.preventDefault(); setActiveTab('accounts'); break;
                case '6':
                    e.preventDefault(); setActiveTab('contacts'); break;
                case '7':
                    e.preventDefault(); setActiveTab('leads'); break;
                case '8':
                    e.preventDefault(); setActiveTab('reports'); break;
                case 'o': case 'O':
                    if (!['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) {
                        e.preventDefault(); setActiveTab('pipeline'); setTimeout(() => { setEditingOpp(null); setShowModal(true); }, 100);
                    }
                    break;
                case '/':
                    if (!e.metaKey && !e.ctrlKey && !['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) {
                        e.preventDefault();
                        setShowSearchResults(false);
                        setTimeout(() => { const el = document.querySelector('.global-search-input'); if (el) { el.focus(); el.select(); } }, 50);
                    }
                    break;
                case 'f': case 'F':
                    if (e.metaKey || e.ctrlKey) return; // let browser search through
                    e.preventDefault();
                    setShowSearchResults(false);
                    setTimeout(() => { const el = document.querySelector('.global-search-input'); if (el) { el.focus(); el.select(); } }, 50);
                    break;
                default: break;
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [showModal, showAccountModal, showContactModal, showTaskModal, showUserModal, showActivityModal,
        confirmModal, notesPopover, undoToast, showNotifications, showSearchResults, showShortcuts]);



    // Settings save effect managed by useSettings hook

    useEffect(() => {
        try { safeStorage.setItem('spiffClaims', JSON.stringify(spiffClaims)); } catch(e) {}
    }, [spiffClaims]);







    // Auto-fetch calendar events when the home tab is active and calendar is not yet loaded.
    // This removes the need for the user to manually click "Connect Google Calendar" every session.
    useEffect(() => {
        if (activeTab === 'home' && !calendarConnected && !calendarLoading && !calendarError) {
            fetchCalendarEvents();
        }
    }, [activeTab]);

    // Security: determine user role
    // Role derived from Clerk user metadata (set via Clerk dashboard)
    // Roles: Admin | Manager | User | ReadOnly
    const isAdmin = userRole === 'Admin';
    const isManager = userRole === 'Manager';
    const isReadOnly = userRole === 'ReadOnly';
    const canEdit = !isReadOnly;
    const canSeeAll = isAdmin || isManager;
    const canManageSettings = isAdmin;
    const canManageUsers = isAdmin;
    const canDeleteData = isAdmin || isManager;
    // Manager can see only reps assigned to them (stored in Clerk publicMetadata.managedReps)
    const managedReps = new Set(clerkUserMeta.managedReps || []);
    const isRepVisible = (repName) => {
        if (isAdmin) return true;
        if (isManager) return managedReps.size === 0 || managedReps.has(repName);
        return !repName || repName === currentUser;
    };

    // Field-level visibility helper
    const canViewField = (fieldKey) => {
        const fv = settings.fieldVisibility || {};
        const fieldRules = fv[fieldKey];
        if (!fieldRules) return true; // not configured = visible
        const role = userRole || 'User';
        return fieldRules[role] !== false;
    };

    // Filtered data based on role
    // ── Pipeline helpers ──────────────────────────────────────────────
    const allPipelines = (settings.pipelines && settings.pipelines.length > 0)
        ? settings.pipelines
        : [{ id: 'default', name: 'New Business', color: '#2563eb' }];
    const activePipeline = allPipelines.find(p => p.id === activePipelineId) || allPipelines[0];

    // Shared Viewing bar helpers — build option lists for Rep/Team/Territory
    const allRepNames = [...new Set((settings.users || []).filter(u => u.userType !== 'Manager' && u.userType !== 'Admin').map(u => u.name).filter(Boolean))].sort();
    const allTeamNames = [...new Set((settings.users || []).filter(u => u.team).map(u => u.team))].sort();
    const allTerritoryNames = [...new Set((settings.users || []).filter(u => u.territory).map(u => u.territory))].sort();
    const hasViewingSlicing = canSeeAll && (allRepNames.length > 1 || allTeamNames.length > 0 || allTerritoryNames.length > 0 || allPipelines.length > 1);

    // Apply Viewing bar rep/team/territory filter on top of role-based access
    const applyViewingFilter = (opps) => {
        if (viewingRep) return opps.filter(o => o.salesRep === viewingRep || o.assignedTo === viewingRep);
        if (viewingTeam) {
            const names = new Set((settings.users || []).filter(u => u.team === viewingTeam).map(u => u.name));
            return opps.filter(o => names.has(o.salesRep) || names.has(o.assignedTo));
        }
        if (viewingTerritory) {
            const names = new Set((settings.users || []).filter(u => u.territory === viewingTerritory).map(u => u.name));
            return opps.filter(o => names.has(o.salesRep) || names.has(o.assignedTo));
        }
        return opps;
    };

    const visibleOpportunities = applyViewingFilter(
        (opportunities || [])
        .filter(opp => isRepVisible(opp.salesRep))
        .filter(opp => (opp.pipelineId || 'default') === activePipeline.id)
    );
    const visibleAccounts = (accounts || [])
        .filter(acc => isRepVisible(acc.accountOwner))
        .filter(acc => !acc.parentId);
    const visibleContacts = (contacts || []).filter(c => isRepVisible(c.assignedRep));
    const visibleTasks = (() => {
        let base = (tasks || []).filter(t => isRepVisible(t.assignedTo));
        if (viewingRep) base = base.filter(t => t.assignedTo === viewingRep);
        else if (viewingTeam) {
            const names = new Set((settings.users || []).filter(u => u.team === viewingTeam).map(u => u.name));
            base = base.filter(t => names.has(t.assignedTo));
        } else if (viewingTerritory) {
            const names = new Set((settings.users || []).filter(u => u.territory === viewingTerritory).map(u => u.name));
            base = base.filter(t => names.has(t.assignedTo));
        }
        return base;
    })();
    const visibleActivities = (activities || []).filter(a => {
        if (!a.opportunityId) return true;
        const opp = (opportunities || []).find(o => o.id === a.opportunityId);
        return !opp || isRepVisible(opp.salesRep);
    });

    const totalARR = visibleOpportunities.reduce((sum, opp) => sum + (parseFloat(opp.arr) || 0), 0);
    const activeOpps = visibleOpportunities.length;
    const avgARR = activeOpps > 0 ? totalARR / activeOpps : 0;
    
    // Calculate forecasted revenue by quarter
    const getQuarter = (dateString) => {
        const date = new Date(dateString);
        const month = date.getMonth() + 1; // 1-12
        const fiscalStart = parseInt(settings.fiscalYearStart) || 10;
        // How many months into the fiscal year is this date?
        // monthsIn = 0 means first month of FY, 1 = second, etc.
        const monthsIn = ((month - fiscalStart + 12) % 12);
        if (monthsIn < 3) return 'Q1';
        if (monthsIn < 6) return 'Q2';
        if (monthsIn < 9) return 'Q3';
        return 'Q4';
    };

    const getQuarterLabel = (quarter, dateString) => {
        const date = new Date(dateString);
        const month = date.getMonth() + 1;
        const year = date.getFullYear();
        const fiscalStart = parseInt(settings.fiscalYearStart) || 10;
        // Fiscal year number = calendar year of the fiscal year END
        // If fiscal starts Oct, then Oct 2025 → FY2026, Jan 2026 → FY2026
        // monthsIn tells how far into the FY we are
        const monthsIn = ((month - fiscalStart + 12) % 12);
        // The fiscal year "ends" 12 - fiscalStart months after Jan 1
        // If monthsIn puts us in the first part of the FY that spans into next cal year:
        // fiscalStart > 1 means the FY starts partway through the calendar year
        // months before fiscalStart belong to FY that started in PREVIOUS calendar year
        let fiscalYear;
        if (fiscalStart === 1) {
            fiscalYear = year; // Jan start = simple calendar year
        } else if (month >= fiscalStart) {
            fiscalYear = year + 1; // e.g. Oct 2025 → FY2026
        } else {
            fiscalYear = year; // e.g. Jan 2026 → FY2026 (same year as end)
        }
        return `FY${fiscalYear} ${quarter}`;
    };

    // Populate getQuarter refs now that the functions are defined
    _getQuarterRef.current      = getQuarter;
    _getQuarterLabelRef.current = getQuarterLabel;




    // KPI color helper - returns CSS class and tolerance color based on value
    const getKpiColor = (kpiId, value) => {
        const kpiDefs = settings.kpiConfig || [];
        const kpi = kpiDefs.find(k => k.id === kpiId);
        if (!kpi) return { className: 'primary', toleranceColor: null };
        const className = kpi.color || 'primary';
        if (kpi.tolerances && kpi.tolerances.length > 0) {
            const sorted = [...kpi.tolerances].sort((a, b) => b.min - a.min);
            for (const t of sorted) {
                if (value >= t.min) return { className, toleranceColor: t.color, toleranceLabel: t.label };
            }
            return { className, toleranceColor: sorted[sorted.length - 1].color };
        }
        return { className, toleranceColor: null };
    };

    const handleAddNew = () => {
        setEditingOpp(null);
        setShowModal(true);
    };

    const handleAddAccountFromOpportunity = (currentFormData) => {
        setShowModal(false);
        setShowAccountModal(true);
        setAccountCreatedFromOppForm(true);
        setPendingOppFormData(currentFormData || null);
        setEditingAccount(null);
        setEditingSubAccount(null);
        setParentAccountForSub(null);
        setLastCreatedAccountName(null);
    };

    const handleAddUser = () => {
        setEditingUser(null);
        setShowUserModal(true);
    };

    const handleEditUser = (user) => {
        setEditingUser(user);
        setShowUserModal(true);
    };

    const handleDeleteUser = (userId) => {
        showConfirm('Are you sure you want to delete this user?', async () => {
            try {
                await dbFetch(`/.netlify/functions/users?id=${userId}`, { method: 'DELETE' });
                setSettings(prev => ({
                    ...prev,
                    users: (prev.users || []).filter(u => u.id !== userId)
                }));
            } catch (err) {
                console.error('Failed to delete user:', err);
            }
        });
    };

    const [userModalError, setUserModalError] = useState(null);
    const [userModalSaving, setUserModalSaving] = useState(false);

    const handleSaveUser = async (userData) => {
        setUserModalError(null);
        setUserModalSaving(true);
        if (editingUser) {
            const payload = { ...userData, id: editingUser.id, email: userData.email || editingUser.email || '' };
            try {
                const res = await dbFetch('/.netlify/functions/users', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
                const data = await res.json();
                if (!res.ok) {
                    setUserModalError(data.error || 'Failed to save user. Please try again.');
                    setUserModalSaving(false);
                    return;
                }
                // Success — update state and close
                if (data.user) {
                    setSettings(prev => ({
                        ...prev,
                        users: (prev.users || []).map(u => u.id === data.user.id ? data.user : u)
                    }));
                }
                setShowUserModal(false);
                setEditingUser(null);
                setUserModalError(null);
            } catch (err) {
                console.error('Failed to update user:', err);
                setUserModalError('Failed to save user. Please check your connection and try again.');
            } finally {
                setUserModalSaving(false);
            }
        } else {
            const newId = 'usr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
            const payload = { ...userData, id: newId, email: userData.email || '' };
            try {
                const res = await dbFetch('/.netlify/functions/users', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
                const data = await res.json();
                if (!res.ok) {
                    setUserModalError(data.error || 'Failed to save user. Please try again.');
                    setUserModalSaving(false);
                    return;
                }
                // Success — add to state and close
                const savedUser = data.user || payload;
                setSettings(prev => ({
                    ...prev,
                    users: [...(prev.users || []), savedUser]
                }));
                if (showModal) {
                    setLastCreatedRepName(savedUser.name || payload.name);
                }
                setShowUserModal(false);
                setUserModalError(null);
            } catch (err) {
                console.error('Failed to create user:', err);
                setUserModalError('Failed to save user. Please check your connection and try again.');
            } finally {
                setUserModalSaving(false);
            }
        }
    };

    // handleUpdateFiscalYearStart managed by useSettings hook

    const toggleAccountExpanded = (accountId) => {
        setExpandedAccounts({
            ...expandedAccounts,
            [accountId]: !expandedAccounts[accountId]
        });
    };

    const handleAddTask = () => {
        setEditingTask(null);
        setShowTaskModal(true);
    };

    const handleEditTask = (task) => {
        setEditingTask(task);
        setShowTaskModal(true);
    };

    // handleDeleteTask managed by useTasks hook


    // handleSaveTask managed by useTasks hook

    // handleCompleteTask managed by useTasks hook

    // handleAddTaskType managed by useSettings hook


    // handleAddTaskToCalendar managed by useTasks hook

    const handleAddContact = () => {
        setEditingContact(null);
        setShowContactModal(true);
    };

    const handleEditContact = (contact) => {
        setEditingContact(contact);
        setShowContactModal(true);
    };

    // handleDeleteContact managed by useContacts hook


    // handleSaveContact managed by useContacts hook

    const handleEdit = (opp) => {
        setEditingOpp(opp);
        setShowModal(true);
    };

    // handleDelete (opportunities) managed by useOpportunities hook


        // handleSave managed by useOpportunities hook

    // completeLostSave managed by useOpportunities hook

    const handleAddAccount = () => {
        setEditingAccount(null);
        setEditingSubAccount(null);
        setParentAccountForSub(null);
        setShowAccountModal(true);
    };

    const handleAddSubAccount = (parentAccount) => {
        setEditingAccount(null);
        setEditingSubAccount(null);
        setParentAccountForSub(parentAccount);
        setShowAccountModal(true);
    };
    // getSubAccounts managed by useAccounts hook

    const handleEditAccount = (account, isSubAccount = false) => {
        if (isSubAccount) {
            setEditingSubAccount(account);
            setEditingAccount(null);
        } else {
            setEditingAccount(account);
            setEditingSubAccount(null);
        }
        setParentAccountForSub(null);
        setShowAccountModal(true);
    };

    // handleDeleteAccount managed by useAccounts hook

    // handleDeleteSubAccount managed by useAccounts hook


    // handleSaveAccount managed by useAccounts hook

    // Stage color palette - unique color for each stage
    const stageColorPalette = [
        { bg: '#dbeafe', text: '#1e40af' },   // blue
        { bg: '#e9d5ff', text: '#7c3aed' },   // purple
        { bg: '#d1fae5', text: '#059669' },   // green
        { bg: '#fed7aa', text: '#c2410c' },   // orange
        { bg: '#fecaca', text: '#dc2626' },   // red
        { bg: '#fef3c7', text: '#d97706' },   // amber
        { bg: '#cffafe', text: '#0e7490' },   // cyan
        { bg: '#fce7f3', text: '#be185d' },   // pink
    ];
    const closedWonColor = { bg: '#d1fae5', text: '#047857' };
    const closedLostColor = { bg: '#fee2e2', text: '#b91c1c' };

    const getStageColor = (stage) => {
        if (stage === 'Closed Won') return closedWonColor;
        if (stage === 'Closed Lost') return closedLostColor;
        const openStages = stages.filter(s => s !== 'Closed Won' && s !== 'Closed Lost');
        const idx = openStages.indexOf(stage);
        if (idx >= 0) return stageColorPalette[idx % stageColorPalette.length];
        return stageColorPalette[0];
    };

    // ── CSV Export utility ──────────────────────────────────────────────
    const exportToCSV = (filename, headers, rows, exportKey = 'default') => {
        setExportingCSV(exportKey);
        try {
            const escape = (v) => {
                if (v === null || v === undefined) return '';
                const s = String(v).replace(/"/g, '""');
                return /[",\n\r]/.test(s) ? `"${s}"` : s;
            };
            const lines = [
                headers.map(escape).join(','),
                ...rows.map(row => row.map(escape).join(','))
            ];
            const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement('a');
            a.href = url;
            a.download = filename;
            a.click();
            URL.revokeObjectURL(url);
        } finally {
            setTimeout(() => setExportingCSV(null), 1000);
        }
    };

    const getStageClass = (stage) => {
        // Keep for backward compat but prefer getStageColor for inline styles
        const stageMap = {
            'Qualification': 'stage-qualification',
            'Discovery': 'stage-discovery',
            'Evaluation (Demo)': 'stage-evaluation',
            'Proposal': 'stage-proposal',
            'Negotiation/Review': 'stage-negotiation',
            'Contracts': 'stage-contracts',
            'Closed Won': 'stage-won',
            'Closed Lost': 'stage-lost'
        };
        if (stageMap[stage]) return stageMap[stage];
        const idx = stages.indexOf(stage);
        const classes = ['stage-qualification', 'stage-discovery', 'stage-evaluation', 'stage-proposal', 'stage-negotiation', 'stage-contracts', 'stage-won', 'stage-lost'];
        if (idx >= 0 && idx < classes.length) return classes[idx];
        return 'stage-qualification';
    };

    // Account hierarchy rollup helper — returns combined stats for a parent + all its sub-accounts
    const getAccountRollup = (acc) => {
        const subs = getSubAccounts(acc.id);
        const names = [acc.name.toLowerCase(), ...subs.map(s => s.name.toLowerCase())];
        const allOpps = opportunities.filter(o => o.account && names.includes(o.account.toLowerCase()));
        const openOpps = allOpps.filter(o => o.stage !== 'Closed Won' && o.stage !== 'Closed Lost');
        const wonOpps = allOpps.filter(o => o.stage === 'Closed Won');
        const pipeline = openOpps.reduce((s, o) => s + (parseFloat(o.arr) || 0), 0);
        const wonArr = wonOpps.reduce((s, o) => s + (parseFloat(o.arr) || 0) + (parseFloat(o.implementationCost) || 0), 0);
        const allContacts = contacts.filter(c => c.company && names.includes(c.company.toLowerCase()));
        const hasSubs = subs.length > 0;
        return { allOpps, openOpps, wonOpps, pipeline, wonArr, allContacts, hasSubs, subCount: subs.length };
    };
    // Activity Management Handlers
    const handleAddActivity = (opportunityId = null, contactId = null) => {
        setEditingActivity(null);
        setActivityInitialContext({ opportunityId, contactId });
        setShowActivityModal(true);
    };

    const handleEditActivity = (activity) => {
        setEditingActivity(activity);
        setShowActivityModal(true);
    };

    // handleDeleteActivity managed by useActivities hook


    // handleSaveActivity managed by useActivities hook

    // ── Calendar strip auto-fetch (hoisted so useEffect can call it) ──────────
    const fetchCalendarEvents = async () => {
        setCalendarLoading(true);
        setCalendarError(null);
        try {
            const now = new Date();
            const weekStart = new Date(now);
            weekStart.setHours(0, 0, 0, 0);
            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekStart.getDate() + 7);
            const res = await fetch('/.netlify/functions/calendar-events?timeMin=' + weekStart.toISOString() + '&timeMax=' + weekEnd.toISOString());
            if (!res.ok) throw new Error('Failed to load calendar');
            const data = await res.json();
            setCalendarEvents(data.events || []);
            setCalendarConnected(true);
        } catch (err) {
            setCalendarError(err.message);
            setCalendarConnected(false);
        } finally {
            setCalendarLoading(false);
        }
    };

    // Log from Calendar handlers
    const fetchLogFromCalEvents = async () => {
        setLogFromCalLoading(true);
        setLogFromCalError(null);
        try {
            const res = await fetch('/.netlify/functions/calendar-events?timeMin=' + logFromCalDateFrom + 'T00:00:00Z&timeMax=' + logFromCalDateTo + 'T23:59:59Z');
            if (!res.ok) throw new Error('Failed to load calendar events');
            const data = await res.json();
            setLogFromCalEvents(data.events || []);
            setLogFromCalOpen(true);
        } catch (err) {
            setLogFromCalError(err.message);
        } finally {
            setLogFromCalLoading(false);
        }
    };

    const handleLogFromCalendar = async (ev, opportunityId) => {
        const eventDate = ev.start?.date || (ev.start?.dateTime ? ev.start.dateTime.split('T')[0] : [new Date().getFullYear(), String(new Date().getMonth()+1).padStart(2,'0'), String(new Date().getDate()).padStart(2,'0')].join('-'));
        const relatedOpp = opportunityId ? (opportunities || []).find(o => o.id === opportunityId) : null;
        const activityData = {
            type: 'Meeting',
            date: eventDate,
            notes: [ev.summary || '', ev.description || ''].filter(Boolean).join('\n'),
            opportunityId: opportunityId || '',
            companyName: relatedOpp?.account || '',
            addToCalendar: false,
        };
        await handleSaveActivity(activityData, { editingActivity, currentUser, opportunities, setShowActivityModal, setFollowUpPrompt, setQuickLogOpen, setQuickLogForm, setQuickLogContactResults });
        setLoggedCalendarIds(prev => new Set([...prev, ev.id]));
        setLogFromCalOppMap(prev => ({ ...prev, [ev.id]: opportunityId || '' }));
        setLogFromCalLinkingId(null);
    };

    // Deal Health Calculation
    const calculateDealHealth = (opportunity) => {
        if (!opportunity) return { score: 0, status: 'unknown', color: 'gray', reasons: [] };
        
        let score = 100;
        const reasons = [];
        const now = new Date();
        
        // Check last activity
        const oppActivities = activities.filter(a => a.opportunityId === opportunity.id);
        if (oppActivities.length > 0) {
            const lastActivity = new Date(Math.max(...oppActivities.map(a => new Date(a.date + 'T12:00:00'))));
            const daysSinceActivity = Math.floor((now - lastActivity) / (1000 * 60 * 60 * 24));
            
            if (daysSinceActivity > 30) { score -= 40; reasons.push('No activity in over 30 days (' + daysSinceActivity + ' days)'); }
            else if (daysSinceActivity > 14) { score -= 25; reasons.push('No activity in over 14 days (' + daysSinceActivity + ' days)'); }
            else if (daysSinceActivity > 7) { score -= 10; reasons.push('No activity in over 7 days (' + daysSinceActivity + ' days)'); }
            else { reasons.push('Recent activity ' + daysSinceActivity + ' day' + (daysSinceActivity !== 1 ? 's' : '') + ' ago'); }
        } else {
            score -= 30;
            reasons.push('No activities logged for this opportunity');
        }
        
        // Check time in current stage
        if (opportunity.stageChangedDate) {
            const stageDate = new Date(opportunity.stageChangedDate);
            const daysInStage = Math.floor((now - stageDate) / (1000 * 60 * 60 * 24));
            
            if (daysInStage > 60) { score -= 30; reasons.push('Stuck in current stage for ' + daysInStage + ' days'); }
            else if (daysInStage > 30) { score -= 15; reasons.push('In current stage for ' + daysInStage + ' days'); }
            else { reasons.push('In current stage for ' + daysInStage + ' days'); }
        }
        
        // Check close date proximity
        if (opportunity.forecastedCloseDate) {
            const closeDate = new Date(opportunity.forecastedCloseDate);
            const daysToClose = Math.floor((closeDate - now) / (1000 * 60 * 60 * 24));
            
            if (daysToClose < 0) { score -= 35; reasons.push('Close date is ' + Math.abs(daysToClose) + ' days overdue'); }
            else if (daysToClose < 7 && oppActivities.length === 0) { score -= 20; reasons.push('Closing in ' + daysToClose + ' days with no activities'); }
            else if (daysToClose < 14) { reasons.push('Close date approaching in ' + daysToClose + ' days'); }
        }
        
        // Determine status and color
        let status, color;
        if (score >= 75) {
            status = 'Healthy';
            color = 'var(--accent-success)';
        } else if (score >= 50) {
            status = 'At Risk';
            color = 'var(--accent-warning)';
        } else {
            status = 'Critical';
            color = 'var(--accent-danger)';
        }
        
        return { score, status, color, reasons };
    };

    // Win Probability Helper (used by analytics)
    const getWinProbability = (stage) => {
        const fStage = (settings.funnelStages || []).find(s => s.name === stage);
        if (fStage) return fStage.weight / 100;
        return 0.3;
    };

    // Notification Generation
    useEffect(() => {
        const generateNotifications = () => {
            const newNotifications = [];
            const now = new Date();
            
            opportunities.forEach(opp => {
                // Stale deal alerts
                const oppActivities = activities.filter(a => a.opportunityId === opp.id);
                if (oppActivities.length > 0) {
                    const lastActivity = new Date(Math.max(...oppActivities.map(a => new Date(a.date + 'T12:00:00'))));
                    const daysSinceActivity = Math.floor((now - lastActivity) / (1000 * 60 * 60 * 24));
                    
                    if (daysSinceActivity > 14 && opp.stage !== 'Closed Won' && opp.stage !== 'Closed Lost') {
                        newNotifications.push({
                            id: `stale-${opp.id}`,
                            type: 'warning',
                            message: `${opp.account} - ${daysSinceActivity} days since last activity`,
                            opportunityId: opp.id,
                            date: now.toISOString()
                        });
                    }
                }
                
                // Close date reminders
                if (opp.forecastedCloseDate && opp.stage !== 'Closed Won' && opp.stage !== 'Closed Lost') {
                    const closeDate = new Date(opp.forecastedCloseDate + 'T12:00:00');
                    const daysToClose = Math.floor((closeDate - now) / (1000 * 60 * 60 * 24));
                    
                    if (daysToClose >= 0 && daysToClose <= 7) {
                        newNotifications.push({
                            id: `closing-${opp.id}`,
                            type: 'info',
                            message: `${opp.account} closing in ${daysToClose} days`,
                            opportunityId: opp.id,
                            date: now.toISOString()
                        });
                    } else if (daysToClose < 0) {
                        newNotifications.push({
                            id: `overdue-${opp.id}`,
                            type: 'danger',
                            message: `${opp.account} is ${Math.abs(daysToClose)} days overdue`,
                            opportunityId: opp.id,
                            date: now.toISOString()
                        });
                    }
                }
            });
            
            // Task reminders
            tasks.forEach(task => {
                if (!task.completed && task.dueDate) {
                    const dueDate = new Date(task.dueDate + 'T12:00:00');
                    const daysUntilDue = Math.floor((dueDate - now) / (1000 * 60 * 60 * 24));
                    
                    if (daysUntilDue === 0) {
                        newNotifications.push({
                            id: `task-${task.id}`,
                            type: 'warning',
                            message: `Task due today: ${task.title}`,
                            taskId: task.id,
                            date: now.toISOString()
                        });
                    }
                }
            });
            
            setNotifications(newNotifications);
        };
        
        generateNotifications();
        const interval = setInterval(generateNotifications, 60000); // Check every minute
        
        return () => clearInterval(interval);
    }, [opportunities, activities, tasks]);

    // Task reminder popup checker
    useEffect(() => {
        const checkReminders = () => {
            const now = new Date();
            const nowDate = now.toISOString().split('T')[0];
            const nowHour = now.getHours();
            const nowMin = now.getMinutes();
            
            tasks.forEach(task => {
                if (task.completed || !task.reminderDate || !task.reminderTime) return;
                if (dismissedReminders.includes(task.id)) return;
                
                const rDate = task.reminderDate;
                const rTime = task.reminderTime;
                
                if (rDate !== nowDate) return;
                
                // Parse reminder time (could be "9:00 AM", "14:00", etc)
                let rHour, rMin;
                const ampmMatch = rTime.match(/(\d+):(\d+)\s*(AM|PM)/i);
                if (ampmMatch) {
                    rHour = parseInt(ampmMatch[1]);
                    rMin = parseInt(ampmMatch[2]);
                    const isPM = ampmMatch[3].toUpperCase() === 'PM';
                    if (isPM && rHour !== 12) rHour += 12;
                    if (!isPM && rHour === 12) rHour = 0;
                } else {
                    const parts = rTime.split(':');
                    rHour = parseInt(parts[0]) || 0;
                    rMin = parseInt(parts[1]) || 0;
                }
                
                if (nowHour === rHour && Math.abs(nowMin - rMin) <= 1) {
                    // Fire reminder
                    setTaskReminderPopup(task);
                    setDismissedReminders(prev => [...prev, task.id]);
                    
                    // Play audio chime
                    try {
                        const ctx = new (window.AudioContext || window.webkitAudioContext)();
                        const playTone = (freq, start, dur) => {
                            const osc = ctx.createOscillator();
                            const gain = ctx.createGain();
                            osc.connect(gain);
                            gain.connect(ctx.destination);
                            osc.type = 'sine';
                            osc.frequency.value = freq;
                            gain.gain.setValueAtTime(0.3, ctx.currentTime + start);
                            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + start + dur);
                            osc.start(ctx.currentTime + start);
                            osc.stop(ctx.currentTime + start + dur);
                        };
                        playTone(523, 0, 0.2);
                        playTone(659, 0.2, 0.2);
                        playTone(784, 0.4, 0.3);
                        playTone(784, 0.8, 0.2);
                        playTone(659, 1.0, 0.2);
                        playTone(784, 1.2, 0.4);
                    } catch(e) {}
                }
            });
        };
        
        checkReminders();
        const interval = setInterval(checkReminders, 30000); // Check every 30 seconds
        return () => clearInterval(interval);
    }, [tasks, dismissedReminders]);

    // Task due-today popup checker
    useEffect(() => {
        const checkDueToday = () => {
            const todayStr = [new Date().getFullYear(), String(new Date().getMonth()+1).padStart(2,'0'), String(new Date().getDate()).padStart(2,'0')].join('-');
            const dueTodayTasks = tasks.filter(task => {
                if (task.completed) return false;
                const status = task.status || (task.completed ? 'Completed' : 'Open');
                if (status === 'Completed') return false;
                if (!task.dueDate) return false;
                if (dismissedDueTodayAlerts.includes(task.id)) return false;
                return task.dueDate === todayStr;
            });
            if (dueTodayTasks.length === 0) return;
            // Queue all due-today tasks and show the first one
            setTaskDueQueue(dueTodayTasks.slice(1));
            setTaskDuePopup(dueTodayTasks[0]);
            setDismissedDueTodayAlerts(prev => [...prev, ...dueTodayTasks.map(t => t.id)]);
            // Play a distinct alert sound (two-tone urgent chime)
            try {
                const ctx = new (window.AudioContext || window.webkitAudioContext)();
                const playTone = (freq, start, dur, vol) => {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.connect(gain); gain.connect(ctx.destination);
                    osc.type = 'sine'; osc.frequency.value = freq;
                    gain.gain.setValueAtTime(vol || 0.3, ctx.currentTime + start);
                    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + start + dur);
                    osc.start(ctx.currentTime + start);
                    osc.stop(ctx.currentTime + start + dur);
                };
                playTone(440, 0,   0.15, 0.35);
                playTone(440, 0.2, 0.15, 0.35);
                playTone(550, 0.45, 0.25, 0.4);
                playTone(660, 0.75, 0.35, 0.45);
            } catch(e) {}
        };
        checkDueToday();
        const interval = setInterval(checkDueToday, 60000);
        return () => clearInterval(interval);
    }, [tasks, dismissedDueTodayAlerts]);

    const handleLogout = () => signOut();

    if (!clerkLoaded || !orgLoaded) {
        return (
            <div className="login-page">
                <div className="login-card" style={{ textAlign: 'center', padding: '3rem' }}>
                    <div style={{ color: '#94a3b8', fontSize: '0.875rem' }}>Loading…</div>
                </div>
            </div>
        );
    }

    if (!clerkUser) {
        return (
            <div className="login-page">
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: '2rem' }}>
                    <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
                        <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style={{ width: '56px', height: '56px', display: 'block', margin: '0 auto 0.75rem' }}>
                            <rect width="100" height="100" rx="20" fill="#2563eb"/>
                            <path d="M25 65 L25 45 L35 45 L35 65Z M42 65 L42 35 L52 35 L52 65Z M59 65 L59 50 L69 50 L69 65Z" fill="white"/>
                            <path d="M22 40 L45 25 L68 32 L80 20" stroke="#34d399" strokeWidth="4" fill="none" strokeLinecap="round"/>
                            <circle cx="80" cy="20" r="4" fill="#34d399"/>
                        </svg>
                        <h1 style={{ color: '#fff', fontSize: '1.5rem', fontWeight: '700', margin: '0 0 0.25rem' }}>Sales Pipeline Tracker</h1>
                        <p style={{ color: '#94a3b8', fontSize: '0.875rem', margin: 0 }}>Sign in to continue</p>
                    </div>
                    <SignIn routing="hash" />
                </div>
            </div>
        );
    }

    if (!organization) {
        return (
            <div className="login-page">
                <div className="login-card" style={{ textAlign: 'center', padding: '3rem', maxWidth: '420px', margin: '10vh auto' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🏢</div>
                    <h2 style={{ color: '#1e293b', fontSize: '1.25rem', fontWeight: '700', marginBottom: '0.75rem' }}>No Organization Found</h2>
                    <p style={{ color: '#64748b', fontSize: '0.875rem', lineHeight: 1.6, marginBottom: '1.5rem' }}>
                        You haven't been added to a company yet. Contact your administrator to be invited to your organization.
                    </p>
                    <button onClick={() => signOut()} style={{ padding: '0.5rem 1.5rem', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer', fontSize: '0.875rem', color: '#475569' }}>
                        Sign Out
                    </button>
                </div>
            </div>
        );
    }


    // ── AppContext value ─────────────────────────────────────────────
    const appContextValue = {
        // Data
        settings, setSettings,
        opportunities, setOpportunities,
        accounts, setAccounts,
        contacts, setContacts,
        tasks, setTasks,
        activities, setActivities,
        leads, setLeads,
        // Auth
        currentUser,
        userRole,
        clerkUser,
        canSeeAll: userRole === 'Admin' || userRole === 'Manager',
        // Utility functions
        getQuarter,
        getQuarterLabel,
        getStageColor,
        calculateDealHealth,
        exportToCSV,
        showConfirm,
        softDelete,
        addAudit,
        canViewField,
        isRepVisible,
        // Derived
        stages,
        dbOffline,
        // Hook handlers
        handleDelete,
        handleSave,
        completeLostSave,
        handleDeleteAccount,
        handleDeleteSubAccount,
        handleSaveAccount,
        handleDeleteContact,
        handleDeleteAccount,
        handleDeleteSubAccount,
        getSubAccounts,
        handleSaveContact,
        handleDeleteTask,
        handleSaveTask,
        handleCompleteTask,
        handleAddTaskToCalendar,
        handleDeleteActivity,
        handleSaveActivity,
        handleUpdateFiscalYearStart,
        handleAddTaskType,
        loadOpportunities,
        loadAccounts,
        loadContacts,
        loadTasks,
        loadActivities,
        // Detail panel state
        viewingContact, setViewingContact,
        viewingAccount, setViewingAccount,
        viewingTask, setViewingTask,
        contactShowAllDeals, setContactShowAllDeals,
        accShowAllClosed, setAccShowAllClosed,
        accShowAllContacts, setAccShowAllContacts,
        // Viewing/filtering (managers)
        viewingRep, setViewingRep,
        viewingTeam, setViewingTeam,
        viewingTerritory, setViewingTerritory,
        // UI state
        exportingCSV, setExportingCSV,
        setUndoToast,
        getKpiColor,
        // Calendar log-from-cal
        logFromCalOpen, setLogFromCalOpen,
        logFromCalDateFrom, setLogFromCalDateFrom,
        logFromCalDateTo, setLogFromCalDateTo,
        logFromCalEvents, setLogFromCalEvents,
        logFromCalLoading, setLogFromCalLoading,
        logFromCalError, setLogFromCalError,
        loggedCalendarIds, setLoggedCalendarIds,
        logFromCalLinkingId, setLogFromCalLinkingId,
        logFromCalOppMap, setLogFromCalOppMap,
        fetchLogFromCalEvents,
        meetingPrepEvent, setMeetingPrepEvent,
        meetingPrepOpen, setMeetingPrepOpen,
        meetingPrepOppId, setMeetingPrepOppId,
        calendarEvents, setCalendarEvents, calendarConnected, setCalendarConnected, calendarLoading, setCalendarLoading, calendarError, setCalendarError,
        fetchCalendarEvents,
        // Navigation
        activeTab, setActiveTab,
        activePipelineId, setActivePipelineId,
        allRepNames,
        allTeamNames,
        allTerritoryNames,
        // SPIFF
        spiffClaims, setSpiffClaims,
        // Derived/filtered lists
        visibleOpportunities,
        visibleAccounts,
        visibleContacts,
        visibleTasks,
        activePipeline,
        allPipelines,
    };

    return (
        <AppProvider value={appContextValue}>
        <div className="app-container">
            <header className="header">
                <div className="header-inner" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', position: 'relative' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', minWidth: 0 }}>
                        {settings.logoUrl ? (
                            <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-start', gap:'0.25rem' }}>
                                <img 
                                    src={settings.logoUrl} 
                                    alt="Company Logo" 
                                    className="header-logo"
                                    style={{ 
                                        height: '64px', 
                                        width: 'auto',
                                        maxWidth: '220px',
                                        objectFit: 'contain',
                                        filter: 'brightness(0) invert(1)',
                                    }} 
                                />
                                <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', flexWrap:'wrap', paddingLeft:'2px' }}>
                                    <span style={{ fontSize:'0.75rem', color:'rgba(255,255,255,0.65)' }}>
                                        {new Date().toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' })}
                                    </span>
                                    <span style={{ color:'rgba(255,255,255,0.35)', fontSize:'0.75rem' }}>·</span>
                                    <span style={{ fontSize:'0.6rem', fontWeight:'700', textTransform:'uppercase', letterSpacing:'0.06em', background:'rgba(255,255,255,0.15)', color:'#fff', padding:'0.15rem 0.5rem', borderRadius:'999px', border:'1px solid rgba(255,255,255,0.25)', lineHeight:'1.4' }}>
                                        {(() => { const q = getQuarter(new Date().toISOString()); return getQuarterLabel(q, new Date().toISOString()); })()}
                                    </span>
                                </div>
                            </div>
                        ) : (
                            <div>
                                <h1>Sales Pipeline Tracker</h1>
                                <p style={{ display:'flex', alignItems:'center', gap:'0.625rem', flexWrap:'wrap' }}>
                                    <span style={{ fontSize:'0.75rem', color:'rgba(255,255,255,0.65)' }}>
                                        {new Date().toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' })}
                                    </span>
                                    <span style={{ color:'rgba(255,255,255,0.35)' }}>·</span>
                                    <span style={{ fontSize:'0.6rem', fontWeight:'700', textTransform:'uppercase', letterSpacing:'0.06em', background:'rgba(255,255,255,0.15)', color:'#fff', padding:'0.15rem 0.5rem', borderRadius:'999px', border:'1px solid rgba(255,255,255,0.25)', lineHeight:'1.4' }}>
                                        {(() => { const q = getQuarter(new Date().toISOString()); return getQuarterLabel(q, new Date().toISOString()); })()}
                                    </span>
                                </p>
                            </div>
                        )}
                    </div>
                    <div className="header-actions" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.375rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ position: 'relative' }}>
                        <div
                            onClick={() => {
                                setShowProfilePanel(v => !v);
                                setProfilePanelTab('profile');
                                if (!myProfile) {
                                    setProfileForm({
                                        firstName: currentUser.split(' ')[0] || '',
                                        lastName:  currentUser.split(' ').slice(1).join(' ') || '',
                                        email:     clerkUser?.emailAddresses?.[0]?.emailAddress || '',
                                        phone:     '',
                                        title:     '',
                                    });
                                }
                            }}
                            title="My profile & settings"
                            style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '0.5rem',
                            padding: '0.375rem 0.5rem 0.375rem 0.875rem',
                            background: showProfilePanel ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.12)',
                            borderRadius: '20px',
                            border: showProfilePanel ? '1px solid rgba(255,255,255,0.4)' : '1px solid rgba(255,255,255,0.2)',
                            cursor: 'pointer',
                            transition: 'all 0.15s',
                        }}>
                            <div style={{
                                width: '28px',
                                height: '28px',
                                borderRadius: '50%',
                                background: isAdmin ? '#7c3aed' : isManager ? '#059669' : isReadOnly ? '#94a3b8' : '#2563eb',
                                color: 'white',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '0.75rem',
                                fontWeight: '700'
                            }}>
                                {currentUser.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                            </div>
                            <div style={{ lineHeight: 1.2 }}>
                                <div style={{ fontSize: '0.8125rem', fontWeight: '600', color: '#fff' }}>{currentUser}</div>
                                <div style={{ fontSize: '0.625rem', color: isAdmin ? '#c4b5fd' : isManager ? '#6ee7b7' : isReadOnly ? '#cbd5e1' : '#93c5fd', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    {userRole === 'User' ? 'Sales Rep' : userRole === 'ReadOnly' ? 'Read-Only' : userRole}
                                </div>
                            </div>
                            <button
                                onClick={e => { e.stopPropagation(); handleLogout(); }}
                                title="Sign out"
                                style={{
                                    background: 'none',
                                    border: '1px solid rgba(255,255,255,0.25)',
                                    color: 'rgba(255,255,255,0.7)',
                                    cursor: 'pointer',
                                    fontSize: '0.6875rem',
                                    fontWeight: '600',
                                    padding: '0.25rem 0.5rem',
                                    borderRadius: '4px',
                                    marginLeft: '0.25rem',
                                    fontFamily: 'inherit',
                                    transition: 'all 0.2s'
                                }}
                                onMouseEnter={e => { e.target.style.background = '#ef4444'; e.target.style.color = 'white'; e.target.style.borderColor = '#ef4444'; }}
                                onMouseLeave={e => { e.target.style.background = 'none'; e.target.style.color = 'rgba(255,255,255,0.7)'; e.target.style.borderColor = 'rgba(255,255,255,0.25)'; }}
                            >
                                Logout
                            </button>
                        </div>

                        {/* ── Profile Panel ─────────────────────────────────── */}
                        {showProfilePanel && (() => {
                            const DEFAULT_PREFS = {
                                stageChanged:       { enabled: true,  mode: 'instant' },
                                dealAssigned:       { enabled: true,  mode: 'instant' },
                                opportunityCreated: { enabled: true,  mode: 'instant' },
                                opportunityUpdated: { enabled: false, mode: 'digest'  },
                                dealClosed:         { enabled: true,  mode: 'instant' },
                                commentAdded:       { enabled: true,  mode: 'instant' },
                                taskDigest:         { enabled: true,  mode: 'digest'  },
                                overdueTaskNudge:   { enabled: true,  mode: 'digest'  },
                            };
                            const ALERT_LABELS = {
                                stageChanged:       'Deal stage changed',
                                dealAssigned:       'Deal assigned to me',
                                opportunityCreated: 'New opportunity created',
                                opportunityUpdated: 'Opportunity updated',
                                dealClosed:         'Deal closed (Won or Lost)',
                                commentAdded:       'Comment added to deal',
                                taskDigest:         'Daily task digest',
                                overdueTaskNudge:   'Overdue task reminder',
                            };
                            const prefs = myProfile?.notificationPrefs || DEFAULT_PREFS;
                            const digestTime = myProfile?.digestTime || '08:00';

                            const saveProfile = async (updates) => {
                                setProfileSaving(true);
                                const updated = { ...(myProfile || {}), ...updates };
                                setMyProfile(updated);
                                try {
                                    // Find user's DB record id
                                    const myDbUser = (settings.users || []).find(u => u.name === currentUser);
                                    if (myDbUser) {
                                        await dbFetch('/.netlify/functions/users?me=true', {
                                            method: 'PUT',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ ...myDbUser, ...updates }),
                                        });
                                    }
                                } catch (err) {
                                    console.error('Failed to save profile:', err);
                                } finally {
                                    setProfileSaving(false);
                                }
                            };

                            const togglePref = (alertType, field, value) => {
                                const newPrefs = { ...prefs, [alertType]: { ...(prefs[alertType] || DEFAULT_PREFS[alertType]), [field]: value } };
                                saveProfile({ notificationPrefs: newPrefs });
                            };

                            const panelTabBtn = (tab, label) => (
                                <button onClick={() => setProfilePanelTab(tab)} style={{
                                    padding: '0.5rem 1rem', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                                    fontSize: '0.8125rem', fontWeight: '600', borderRadius: '6px',
                                    background: profilePanelTab === tab ? '#2563eb' : 'transparent',
                                    color: profilePanelTab === tab ? '#fff' : '#64748b',
                                    transition: 'all 0.15s',
                                }}>{label}</button>
                            );

                            return (
                                <>
                                <div style={{ position: 'fixed', inset: 0, zIndex: 1099 }} onClick={() => setShowProfilePanel(false)} />
                                <div className="spt-profile-panel" style={{
                                    position: 'absolute', top: 'calc(100% + 8px)', right: 0,
                                    width: '420px', background: '#fff', borderRadius: '12px',
                                    border: '1px solid #e2e8f0', boxShadow: '0 12px 40px rgba(0,0,0,0.15)',
                                    zIndex: 1100, overflow: 'hidden',
                                }} onClick={e => e.stopPropagation()}>

                                    {/* Header */}
                                    <div style={{ background: '#1a1a2e', padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
                                        <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: isAdmin ? '#7c3aed' : isManager ? '#059669' : '#2563eb', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.125rem', fontWeight: '700', flexShrink: 0 }}>
                                            {currentUser.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                                        </div>
                                        <div>
                                            <div style={{ color: '#fff', fontWeight: '700', fontSize: '0.9375rem' }}>{currentUser}</div>
                                            <div style={{ color: '#8b92a9', fontSize: '0.75rem', marginTop: '2px' }}>{clerkUser?.emailAddresses?.[0]?.emailAddress}</div>
                                            <div style={{ marginTop: '4px' }}>
                                                <span style={{ background: isAdmin ? '#7c3aed' : isManager ? '#059669' : '#2563eb', color: '#fff', fontSize: '0.6rem', fontWeight: '700', padding: '2px 8px', borderRadius: '999px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                    {userRole === 'User' ? 'Sales Rep' : userRole}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Tabs */}
                                    <div style={{ display: 'flex', gap: '0.25rem', padding: '0.75rem 1rem 0', borderBottom: '1px solid #e2e8f0' }}>
                                        {panelTabBtn('profile', '👤 Profile')}
                                        {panelTabBtn('notifications', '🔔 Notifications')}
                                    </div>

                                    <div style={{ padding: '1.25rem 1.5rem', maxHeight: '460px', overflowY: 'auto' }}>

                                        {/* ── Profile Tab ─────────────────────────────── */}
                                        {profilePanelTab === 'profile' && (() => {
                                            const inputStyle = { width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.875rem', fontFamily: 'inherit', boxSizing: 'border-box' };
                                            const labelStyle = { fontSize: '0.75rem', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '4px' };
                                            return (
                                                <div>
                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem', marginBottom: '0.875rem' }}>
                                                        <div><label style={labelStyle}>First Name</label><input style={inputStyle} value={profileForm.firstName} onChange={e => setProfileForm(p => ({ ...p, firstName: e.target.value }))} /></div>
                                                        <div><label style={labelStyle}>Last Name</label><input style={inputStyle} value={profileForm.lastName} onChange={e => setProfileForm(p => ({ ...p, lastName: e.target.value }))} /></div>
                                                    </div>
                                                    <div style={{ marginBottom: '0.875rem' }}><label style={labelStyle}>Work Email</label><input style={inputStyle} type="email" value={profileForm.email} onChange={e => setProfileForm(p => ({ ...p, email: e.target.value }))} /></div>
                                                    <div style={{ marginBottom: '0.875rem' }}><label style={labelStyle}>Phone</label><input style={inputStyle} type="tel" value={profileForm.phone} onChange={e => setProfileForm(p => ({ ...p, phone: e.target.value }))} /></div>
                                                    <div style={{ marginBottom: '1.25rem' }}><label style={labelStyle}>Title</label><input style={inputStyle} value={profileForm.title} onChange={e => setProfileForm(p => ({ ...p, title: e.target.value }))} /></div>
                                                    <div style={{ padding: '0.75rem', background: '#f8fafc', borderRadius: '6px', fontSize: '0.75rem', color: '#64748b', marginBottom: '1rem' }}>
                                                        🔑 Password is managed via Clerk. <a href="https://accounts.clerk.dev" target="_blank" rel="noreferrer" style={{ color: '#2563eb' }}>Change password →</a>
                                                    </div>
                                                    <button
                                                        onClick={() => saveProfile({ firstName: profileForm.firstName, lastName: profileForm.lastName, email: profileForm.email, phone: profileForm.phone, title: profileForm.title })}
                                                        disabled={profileSaving}
                                                        style={{ width: '100%', padding: '0.625rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: '600', fontSize: '0.875rem', cursor: 'pointer', fontFamily: 'inherit' }}>
                                                        {profileSaving ? 'Saving…' : 'Save Profile'}
                                                    </button>
                                                </div>
                                            );
                                        })()}

                                        {/* ── Notifications Tab ───────────────────────── */}
                                        {profilePanelTab === 'notifications' && (
                                            <div>
                                                <p style={{ fontSize: '0.8125rem', color: '#64748b', margin: '0 0 1rem', lineHeight: 1.5 }}>
                                                    Choose which alerts you receive and whether they're sent immediately or bundled into a daily digest.
                                                </p>

                                                {/* Digest time picker */}
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '1rem' }}>
                                                    <div>
                                                        <div style={{ fontWeight: '600', fontSize: '0.8125rem', color: '#1e293b' }}>Daily digest time</div>
                                                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>When to send your daily digest email (UTC)</div>
                                                    </div>
                                                    <input
                                                        type="time"
                                                        value={digestTime}
                                                        onChange={e => saveProfile({ digestTime: e.target.value })}
                                                        style={{ padding: '0.375rem 0.5rem', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.875rem', fontFamily: 'inherit', background: '#fff' }}
                                                    />
                                                </div>

                                                {/* Alert rows */}
                                                {Object.entries(ALERT_LABELS).map(([alertType, label]) => {
                                                    const pref = prefs[alertType] || DEFAULT_PREFS[alertType];
                                                    const isDigestOnly = alertType === 'taskDigest' || alertType === 'overdueTaskNudge';
                                                    return (
                                                        <div key={alertType} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.625rem 0', borderBottom: '1px solid #f1f3f5' }}>
                                                            <div style={{ flex: 1 }}>
                                                                <div style={{ fontSize: '0.8125rem', fontWeight: '600', color: '#1e293b' }}>{label}</div>
                                                                {isDigestOnly && <div style={{ fontSize: '0.6875rem', color: '#94a3b8', marginTop: '1px' }}>Digest only</div>}
                                                            </div>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                {/* Enabled toggle */}
                                                                <button
                                                                    onClick={() => togglePref(alertType, 'enabled', !pref.enabled)}
                                                                    style={{
                                                                        width: '36px', height: '20px', borderRadius: '999px', border: 'none', cursor: 'pointer',
                                                                        background: pref.enabled ? '#2563eb' : '#d1d5db',
                                                                        position: 'relative', transition: 'background 0.2s', flexShrink: 0,
                                                                    }}
                                                                    title={pref.enabled ? 'Disable' : 'Enable'}
                                                                >
                                                                    <span style={{ position: 'absolute', top: '2px', left: pref.enabled ? '18px' : '2px', width: '16px', height: '16px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s', display: 'block' }} />
                                                                </button>

                                                                {/* Mode selector — only show for non-digest-only alerts */}
                                                                {!isDigestOnly && pref.enabled && (
                                                                    <select
                                                                        value={pref.mode}
                                                                        onChange={e => togglePref(alertType, 'mode', e.target.value)}
                                                                        style={{ fontSize: '0.75rem', padding: '0.2rem 0.375rem', border: '1px solid #e2e8f0', borderRadius: '4px', fontFamily: 'inherit', background: '#fff', cursor: 'pointer' }}
                                                                    >
                                                                        <option value="instant">Instant</option>
                                                                        <option value="digest">Digest</option>
                                                                    </select>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                                <button
                                                    onClick={() => saveProfile({ notificationPrefs: prefs, digestTime })}
                                                    disabled={profileSaving}
                                                    style={{ width: '100%', padding: '0.625rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: '600', fontSize: '0.875rem', cursor: 'pointer', fontFamily: 'inherit', marginTop: '1rem' }}>
                                                    {profileSaving ? 'Saving…' : 'Save Notification Settings'}
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    {profileSaving && (
                                        <div style={{ padding: '0.5rem 1.5rem', background: '#f0fdf4', borderTop: '1px solid #bbf7d0', fontSize: '0.75rem', color: '#059669', fontWeight: '600' }}>
                                            ✓ Saving preferences…
                                        </div>
                                    )}
                                </div>
                                </>
                            );
                        })()}
                        </div>
                        <button
                            onClick={() => setShowShortcuts(v => !v)}
                            title="Keyboard shortcuts"
                            style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.25)', borderRadius: '50%',
                                width: '40px', height: '40px', cursor: 'pointer', fontSize: '1rem', fontWeight: '800',
                                transition: 'all 0.2s ease', fontFamily: 'inherit', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.25)'; e.currentTarget.style.transform = 'scale(1.1)'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.15)'; e.currentTarget.style.transform = 'scale(1)'; }}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="2" y="6" width="20" height="13" rx="2"/>
                                <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h.01M18 14h.01M10 14h4"/>
                            </svg>
                        </button>
                        <div style={{ position: 'relative' }}>
                        <button
                            onClick={() => setShowNotifications(!showNotifications)}
                            style={{
                                background: notifications.length > 0 ? '#ef4444' : '#f1f3f5',
                                color: notifications.length > 0 ? 'white' : '#64748b',
                                border: 'none',
                                borderRadius: '50%',
                                width: '40px',
                                height: '40px',
                                cursor: 'pointer',
                                fontSize: '1.2rem',
                                fontWeight: '700',
                                position: 'relative',
                                transition: 'all 0.2s ease'
                            }}
                            onMouseEnter={e => e.target.style.transform = 'scale(1.1)'}
                            onMouseLeave={e => e.target.style.transform = 'scale(1)'}
                        >
                            🔔
                            {notifications.length > 0 && (
                                <span style={{
                                    position: 'absolute',
                                    top: '-5px',
                                    right: '-5px',
                                    background: '#f59e0b',
                                    color: 'white',
                                    borderRadius: '50%',
                                    width: '20px',
                                    height: '20px',
                                    fontSize: '0.7rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}>
                                    {notifications.length}
                                </span>
                            )}
                        </button>
                        {showNotifications && (
                            <div style={{
                                position: 'absolute',
                                top: '50px',
                                right: '0',
                                background: '#ffffff',
                                border: '1px solid #e2e8f0',
                                borderRadius: '8px',
                                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                                minWidth: '350px',
                                maxWidth: '400px',
                                maxHeight: '500px',
                                overflowY: 'auto',
                                zIndex: 1000
                            }}>
                                <div style={{
                                    padding: '1rem',
                                    borderBottom: '1px solid #e2e8f0',
                                    fontWeight: '700',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                }}>
                                    <span>Notifications ({notifications.length})</span>
                                    <button
                                        onClick={() => setShowNotifications(false)}
                                        style={{
                                            background: 'none',
                                            border: 'none',
                                            cursor: 'pointer',
                                            fontSize: '1.2rem',
                                            color: '#64748b'
                                        }}
                                    >
                                        ×
                                    </button>
                                </div>
                                {notifications.length === 0 ? (
                                    <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
                                        No notifications
                                    </div>
                                ) : (
                                    <div>
                                        {notifications.map(notif => (
                                            <div key={notif.id} style={{
                                                padding: '1rem',
                                                borderBottom: '1px solid #e2e8f0',
                                                cursor: 'pointer',
                                                transition: 'background 0.2s'
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.background = '#f1f3f5'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                            onClick={() => {
                                                if (notif.opportunityId) {
                                                    setActiveTab('pipeline');
                                                    setShowNotifications(false);
                                                }
                                            }}
                                            >
                                                <div style={{
                                                    display: 'flex',
                                                    alignItems: 'start',
                                                    gap: '0.5rem'
                                                }}>
                                                    <span style={{ fontSize: '1.2rem' }}>
                                                        {notif.type === 'danger' ? '🔴' : notif.type === 'warning' ? '⚠️' : 'ℹ️'}
                                                    </span>
                                                    <div style={{ flex: 1 }}>
                                                        <div style={{ fontSize: '0.875rem', color: '#1e293b' }}>
                                                            {notif.message}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                    </div>
                    {/* Global Search - centered command bar */}
                    <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', zIndex: 200 }}>
                        <div style={{ display: 'flex', alignItems: 'center', background: '#f1f5f9', borderRadius: '999px', border: '1px solid #e2e8f0', padding: '0.35rem 1rem', gap: '0.5rem', width: '340px', transition: 'box-shadow 0.15s, border-color 0.15s' }}
                            onFocusCapture={e => { e.currentTarget.style.borderColor = '#93c5fd'; e.currentTarget.style.background = '#fff'; }}
                            onBlurCapture={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.background = '#f1f5f9'; }}>
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#94a3b8" strokeWidth="1.5" style={{ flexShrink: 0 }}><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L13 13" strokeLinecap="round"/></svg>
                            <input
                                className="global-search-input"
                                type="text"
                                placeholder="Search accounts, contacts, deals..."
                                value={globalSearch}
                                onChange={e => { setGlobalSearch(e.target.value); setShowSearchResults(e.target.value.length > 0); }}
                                onFocus={() => { if (globalSearch.length > 0) setShowSearchResults(true); }}
                                style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.8125rem', color: '#1e293b', flex: 1, padding: 0, fontFamily: 'inherit' }}
                            />
                            {globalSearch ? (
                                <button onClick={() => { setGlobalSearch(''); setShowSearchResults(false); }}
                                    style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '0.8125rem', padding: 0, lineHeight: 1, flexShrink: 0 }}>✕</button>
                            ) : (
                                <span style={{ fontSize: '0.625rem', color: '#94a3b8', background: '#fff', border: '0.5px solid #e2e8f0', borderRadius: '3px', padding: '1px 5px', lineHeight: 1.4, flexShrink: 0 }}>/</span>
                            )}
                        </div>
                        {showSearchResults && globalSearch.length > 0 && (
                            <>
                            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 }} onClick={() => setShowSearchResults(false)} />
                            <div className="spt-search-results" style={{ position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: '0.375rem', width: '400px', maxHeight: '420px', overflowY: 'auto', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 9999 }} onClick={e => e.stopPropagation()}>
                                {(() => {
                                    const q = globalSearch.toLowerCase();
                                    const matchedAccounts = accounts.filter(a => (a.name || '').toLowerCase().includes(q) || (a.accountOwner || '').toLowerCase().includes(q)).slice(0, 5);
                                    const matchedContacts = contacts.filter(c => ((c.firstName || '') + ' ' + (c.lastName || '')).toLowerCase().includes(q) || (c.company || '').toLowerCase().includes(q) || (c.email || '').toLowerCase().includes(q)).slice(0, 5);
                                    const matchedOpps = opportunities.filter(o => (o.opportunityName || '').toLowerCase().includes(q) || (o.account || '').toLowerCase().includes(q)).slice(0, 5);
                                    const total = matchedAccounts.length + matchedContacts.length + matchedOpps.length;
                                    if (total === 0) return (<div style={{ padding: '1.5rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.8125rem' }}>No results found</div>);
                                    return (<>
                                        {matchedAccounts.length > 0 && (<div>
                                            <div style={{ padding: '0.5rem 0.75rem', fontSize: '0.625rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', background: '#f8fafc', borderBottom: '1px solid #f1f3f5' }}>Accounts</div>
                                            {matchedAccounts.map(a => { const openDeals = opportunities.filter(o => (o.account||'').toLowerCase() === (a.name||'').toLowerCase() && o.stage !== 'Closed Won' && o.stage !== 'Closed Lost').length; return (<div key={'sa-'+a.id} style={{ padding: '0.4rem 0.75rem', cursor: 'pointer', borderBottom: '1px solid #f9fafb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} onClick={() => { setGlobalSearch(''); setShowSearchResults(false); setActiveTab('accounts'); setTimeout(() => setViewingAccount(a), 100); }} onMouseEnter={e => e.currentTarget.style.background='#f1f5f9'} onMouseLeave={e => e.currentTarget.style.background='transparent'}><div><div style={{ fontSize: '0.8125rem', fontWeight: '600', color: '#1e293b' }}>{a.name}</div>{a.accountOwner && <div style={{ fontSize: '0.6875rem', color: '#94a3b8' }}>{a.accountOwner}{openDeals > 0 ? ` · ${openDeals} open deal${openDeals>1?'s':''}` : ''}</div>}</div><span style={{ fontSize: '0.625rem', color: '#94a3b8' }}>Account</span></div>); })}
                                        </div>)}
                                        {matchedContacts.length > 0 && (<div>
                                            <div style={{ padding: '0.5rem 0.75rem', fontSize: '0.625rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', background: '#f8fafc', borderBottom: '1px solid #f1f3f5' }}>Contacts</div>
                                            {matchedContacts.map(c => (<div key={'sc-'+c.id} style={{ padding: '0.4rem 0.75rem', cursor: 'pointer', borderBottom: '1px solid #f9fafb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} onClick={() => { setGlobalSearch(''); setShowSearchResults(false); setActiveTab('contacts'); setTimeout(() => setViewingContact(c), 100); }} onMouseEnter={e => e.currentTarget.style.background='#f1f5f9'} onMouseLeave={e => e.currentTarget.style.background='transparent'}><div><div style={{ fontSize: '0.8125rem', fontWeight: '600', color: '#1e293b' }}>{c.firstName} {c.lastName}</div><div style={{ fontSize: '0.6875rem', color: '#94a3b8' }}>{[c.title, c.company].filter(Boolean).join(' · ')}</div></div><span style={{ fontSize: '0.625rem', color: '#94a3b8' }}>Contact</span></div>))}
                                        </div>)}
                                        {matchedOpps.length > 0 && (<div>
                                            <div style={{ padding: '0.5rem 0.75rem', fontSize: '0.625rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', background: '#f8fafc', borderBottom: '1px solid #f1f3f5' }}>Opportunities</div>
                                            {matchedOpps.map(o => (<div key={'so-'+o.id} style={{ padding: '0.4rem 0.75rem', cursor: 'pointer', borderBottom: '1px solid #f9fafb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} onClick={() => { setGlobalSearch(''); setShowSearchResults(false); setActiveTab('pipeline'); setTimeout(() => { setEditingOpp(o); setShowModal(true); }, 150); }} onMouseEnter={e => e.currentTarget.style.background='#f1f5f9'} onMouseLeave={e => e.currentTarget.style.background='transparent'}><div><div style={{ fontSize: '0.8125rem', fontWeight: '600', color: '#1e293b' }}>{o.opportunityName || o.account || 'Unnamed'}</div><div style={{ fontSize: '0.6875rem', color: '#94a3b8' }}>{o.account} · {o.stage}</div></div><span style={{ fontSize: '0.625rem', color: '#94a3b8' }}>${(o.arr||0).toLocaleString()}</span></div>))}
                                        </div>)}
                                    </>);
                                })()}
                            </div>
                            </>
                        )}
                    </div>
                    </div>
                </div>
            </header>

            {/* ── DB OFFLINE BANNER ── */}
            {dbOffline && (
                <div style={{ background:'#dc2626', color:'#fff', padding:'0.5rem 1.25rem', display:'flex', alignItems:'center', justifyContent:'space-between', fontSize:'0.8125rem', fontWeight:'600', zIndex:9999 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'0.625rem' }}>
                        <span style={{ fontSize:'1rem' }}>⚠️</span>
                        <span>Database connection lost — changes may not be saving. Check your connection and refresh.</span>
                    </div>
                    <button onClick={() => setDbOffline(false)} style={{ background:'rgba(255,255,255,0.2)', border:'none', color:'#fff', borderRadius:'4px', padding:'2px 8px', cursor:'pointer', fontSize:'0.75rem', fontWeight:'700', fontFamily:'inherit' }}>✕</button>
                </div>
            )}

            <nav className="nav-tabs">
                <button 
                    className={`nav-tab ${activeTab === 'home' ? 'active' : ''}`}
                    onClick={() => setActiveTab('home')}
                >
                    HOME
                </button>
                <button 
                    className={`nav-tab ${activeTab === 'pipeline' ? 'active' : ''}`}
                    onClick={() => setActiveTab('pipeline')}
                >
                    PIPELINE
                </button>
                <button 
                    className={`nav-tab ${activeTab === 'opportunities' ? 'active' : ''}`}
                    onClick={() => setActiveTab('opportunities')}
                >
                    OPPORTUNITIES
                </button>
                <button 
                    className={`nav-tab ${activeTab === 'tasks' ? 'active' : ''}`}
                    onClick={() => setActiveTab('tasks')}
                    style={{ position: 'relative' }}
                >
                    TASKS
                    {(() => {
                        const now = new Date(); now.setHours(0,0,0,0);
                        const overdueCount = visibleTasks.filter(t => {
                            const s = t.status || (t.completed ? 'Completed' : 'Open');
                            return (s === 'Open' || s === 'In-Process') && t.dueDate && new Date(t.dueDate + 'T12:00:00') < now;
                        }).length;
                        return overdueCount > 0 ? (
                            <span style={{ position: 'absolute', top: '3px', right: '3px', background: '#ef4444', color: '#fff', borderRadius: '999px', fontSize: '0.5rem', fontWeight: '800', minWidth: '14px', height: '14px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px', lineHeight: 1 }}>
                                {overdueCount > 99 ? '99+' : overdueCount}
                            </span>
                        ) : null;
                    })()}
                    {(opportunities || []).reduce((acc, opp) => acc + (opp.comments || []).filter(c => c.timestamp > feedLastRead && c.author !== currentUser && (c.mentions || []).includes(currentUser)).length, 0) > 0 && (
                        <span style={{ position: 'absolute', top: '4px', right: '4px', background: '#ef4444', color: '#fff', borderRadius: '999px', fontSize: '0.5rem', fontWeight: '800', minWidth: '13px', height: '13px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 2px', lineHeight: 1 }}>!</span>
                    )}
                </button>
                <button 
                    className={`nav-tab ${activeTab === 'accounts' ? 'active' : ''}`}
                    onClick={() => setActiveTab('accounts')}
                >
                    ACCOUNTS
                </button>
                <button 
                    className={`nav-tab ${activeTab === 'contacts' ? 'active' : ''}`}
                    onClick={() => setActiveTab('contacts')}
                >
                    CONTACTS
                </button>
                <button 
                    className={`nav-tab ${activeTab === 'leads' ? 'active' : ''}`}
                    onClick={() => setActiveTab('leads')}
                >
                    LEADS
                </button>
                <button 
                    className={`nav-tab ${activeTab === 'reports' ? 'active' : ''}`}
                    onClick={() => setActiveTab('reports')}
                >
                    REPORTS
                </button>
                {(isAdmin || isManager) && (
                    <button
                        className={`nav-tab ${activeTab === 'salesManager' ? 'active' : ''}`}
                        onClick={() => setActiveTab('salesManager')}
                    >
                        SALES MANAGER
                    </button>
                )}
                {isAdmin && (
                    <button 
                        className={`nav-tab ${activeTab === 'settings' ? 'active' : ''}`}
                        onClick={() => setActiveTab('settings')}
                    >
                        SETTINGS
                    </button>
                )}
                {isReadOnly && (
                    <div style={{ display: 'flex', alignItems: 'center', marginLeft: 'auto', padding: '0 0.75rem', fontSize: '0.6875rem', color: 'rgba(255,255,255,0.6)', fontWeight: '600', fontStyle: 'italic' }}>
                        👁 View Only Mode
                    </div>
                )}
            </nav>

            {activeTab === 'home' && (
                <HomeTab
                    setEditingOpp={setEditingOpp}
                    setShowModal={setShowModal}
                    setEditingTask={setEditingTask}
                    setShowTaskModal={setShowTaskModal}
                    setActivityInitialContext={setActivityInitialContext}
                    setEditingActivity={setEditingActivity}
                    setShowActivityModal={setShowActivityModal}
                    setShowOutlookImportModal={setShowOutlookImportModal}
                />
            )}

            {activeTab === 'pipeline' && (
                <PipelineTab
                    setEditingOpp={setEditingOpp}
                    setShowModal={setShowModal}
                    setActivityInitialContext={setActivityInitialContext}
                    setEditingActivity={setEditingActivity}
                    setShowActivityModal={setShowActivityModal}
                    setSpiffClaimContext={setSpiffClaimContext}
                    setShowSpiffClaimModal={setShowSpiffClaimModal}
                    setLostReasonModal={setLostReasonModal}
                />
            )}

            {activeTab === 'opportunities' && (
                <OpportunitiesTab
                    setEditingOpp={setEditingOpp}
                    setShowModal={setShowModal}
                    setActivityInitialContext={setActivityInitialContext}
                    setEditingActivity={setEditingActivity}
                    setShowActivityModal={setShowActivityModal}
                    setEditingTask={setEditingTask}
                    setShowTaskModal={setShowTaskModal}
                    setSpiffClaimContext={setSpiffClaimContext}
                    setShowSpiffClaimModal={setShowSpiffClaimModal}
                    setLostReasonModal={setLostReasonModal}
                    setCsvImportType={setCsvImportType}
                    setShowCsvImportModal={setShowCsvImportModal}
                />
            )}

            {activeTab === 'tasks' && (
                <TasksTab
                    setEditingTask={setEditingTask}
                    setShowTaskModal={setShowTaskModal}
                    setActivityInitialContext={setActivityInitialContext}
                    setEditingActivity={setEditingActivity}
                    setShowActivityModal={setShowActivityModal}
                    setShowOutlookImportModal={setShowOutlookImportModal}
                    viewingTask={viewingTask}
                    setViewingTask={setViewingTask}
                    feedFilter={feedFilter}
                    setFeedFilter={setFeedFilter}
                    feedLastRead={feedLastRead}
                    setFeedLastRead={setFeedLastRead}
                />
            )}

            {activeTab === 'accounts' && (
                <AccountsTab
                    setEditingAccount={setEditingAccount}
                    setEditingSubAccount={setEditingSubAccount}
                    setParentAccountForSub={setParentAccountForSub}
                    setShowAccountModal={setShowAccountModal}
                    setCsvImportType={setCsvImportType}
                    setShowCsvImportModal={setShowCsvImportModal}
                    expandedAccounts={expandedAccounts}
                    setExpandedAccounts={setExpandedAccounts}
                    viewingAccount={viewingAccount}
                    setViewingAccount={setViewingAccount}
                    accShowAllClosed={accShowAllClosed}
                    setAccShowAllClosed={setAccShowAllClosed}
                    accShowAllContacts={accShowAllContacts}
                    setAccShowAllContacts={setAccShowAllContacts}
                    accountsSortDir={accountsSortDir}
                    setAccountsSortDir={setAccountsSortDir}
                    accountsViewMode={accountsViewMode}
                    setAccountsViewMode={setAccountsViewMode}
                    selectedAccounts={selectedAccounts}
                    setSelectedAccounts={setSelectedAccounts}
                />
            )}

 
            {activeTab === 'contacts' && (
                <ContactsTab
                    setEditingContact={setEditingContact}
                    setShowContactModal={setShowContactModal}
                    setCsvImportType={setCsvImportType}
                    setShowCsvImportModal={setShowCsvImportModal}
                    contactsSortBy={contactsSortBy}
                    setContactsSortBy={setContactsSortBy}
                    viewingContact={viewingContact}
                    setViewingContact={setViewingContact}
                    contactShowAllDeals={contactShowAllDeals}
                    setContactShowAllDeals={setContactShowAllDeals}
                    selectedContacts={selectedContacts}
                    setSelectedContacts={setSelectedContacts}
                />
            )}




            {activeTab === 'leads' && (
                <LeadsTab
                    leads={leads}
                    setLeads={setLeads}
                    setEditingOpp={setEditingOpp}
                    setShowModal={setShowModal}
                    onImportClick={() => setShowLeadImportModal(true)}
                />
            )}


            {activeTab === 'reports' && <ReportsTab />}


            {activeTab === 'salesManager' && <SalesManagerTab />}


            {activeTab === 'settings' && isAdmin && (
                <SettingsTab
                    setShowUserModal={setShowUserModal}
                    setEditingUser={setEditingUser}
                    setCsvImportType={setCsvImportType}
                    setShowCsvImportModal={setShowCsvImportModal}
                />
            )}

            {/* ════ MEETING PREP PANEL ════ */}
            {meetingPrepOpen && meetingPrepEvent && (() => {
                const ev = meetingPrepEvent;
                const evTitle = ev.summary || 'Untitled Event';
                const evDate = ev.start?.date || (ev.start?.dateTime ? ev.start.dateTime.split('T')[0] : '');
                const evTime = ev.start?.dateTime ? new Date(ev.start.dateTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : 'All day';
                const evEnd = ev.end?.dateTime ? new Date(ev.end.dateTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : null;

                // Use forced opp ID if provided (e.g. from task), otherwise fuzzy-match by title
                const titleWords = evTitle.toLowerCase().split(/[\s\-–—,]+/).filter(w => w.length > 2);
                const matchedOpp = meetingPrepOppId
                    ? (opportunities || []).find(o => o.id === meetingPrepOppId)
                    : (opportunities || []).find(o => {
                        const haystack = ((o.opportunityName || '') + ' ' + (o.account || '')).toLowerCase();
                        return titleWords.some(w => haystack.includes(w));
                    });

                // Get contacts linked to this account
                const matchedContacts = matchedOpp
                    ? (contacts || []).filter(c => c.company?.toLowerCase() === (matchedOpp.account || '').toLowerCase() || c.accountId === (matchedOpp.accountId || ''))
                        .slice(0, 5)
                    : [];

                // Get account
                const matchedAccount = matchedOpp
                    ? (accounts || []).find(a => a.name?.toLowerCase() === (matchedOpp.account || '').toLowerCase())
                    : null;

                // Get recent activities
                const recentActivities = matchedOpp
                    ? (activities || []).filter(a => a.opportunityId === matchedOpp.id)
                        .sort((a, b) => new Date(b.date + 'T12:00:00') - new Date(a.date + 'T12:00:00'))
                        .slice(0, 5)
                    : [];

                // Get open tasks
                const openTasks = matchedOpp
                    ? (tasks || []).filter(t => t.opportunityId === matchedOpp.id && (t.status || (t.completed ? 'Completed' : 'Open')) !== 'Completed')
                        .sort((a, b) => new Date(a.dueDate || '9999') - new Date(b.dueDate || '9999'))
                        .slice(0, 5)
                    : [];

                // Deal health
                const health = matchedOpp ? calculateDealHealth(matchedOpp) : null;
                const healthColor = health ? (health.score >= 70 ? '#10b981' : health.score >= 40 ? '#f59e0b' : '#ef4444') : '#94a3b8';
                const healthBg = health ? (health.score >= 70 ? '#d1fae5' : health.score >= 40 ? '#fef3c7' : '#fee2e2') : '#f1f5f9';

                return (
                    <>
                        {/* Backdrop */}
                        <div onClick={() => { setMeetingPrepOpen(false); setMeetingPrepOppId(null); }}
                            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', zIndex: 9000 }} />

                        {/* Slide-in panel */}
                        <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: '420px', background: '#fff', zIndex: 9001, boxShadow: '-4px 0 24px rgba(0,0,0,0.12)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>

                            {/* Header */}
                            <div style={{ background: 'linear-gradient(135deg, #1e40af, #2563eb)', padding: '1.25rem 1.5rem', color: '#fff', flexShrink: 0 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div style={{ fontSize: '0.625rem', fontWeight: '700', color: '#93c5fd', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.375rem' }}>Meeting Prep</div>
                                    <button onClick={() => setMeetingPrepOpen(false)}
                                        style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', borderRadius: '6px', width: '28px', height: '28px', cursor: 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✕</button>
                                </div>
                                <div style={{ fontWeight: '800', fontSize: '1rem', lineHeight: 1.3, marginBottom: '0.375rem' }}>{evTitle}</div>
                                <div style={{ fontSize: '0.8125rem', color: '#bfdbfe' }}>
                                    {evDate} · {evTime}{evEnd ? ' – ' + evEnd : ''}{ev.attendeeCount > 0 ? ` · ${ev.attendeeCount} attendees` : ''}
                                </div>
                            </div>

                            <div style={{ flex: 1, padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', overflowY: 'auto' }}>

                                {/* Opportunity match */}
                                {matchedOpp ? (
                                    <div>
                                        <div style={{ fontSize: '0.625rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>Linked Opportunity</div>
                                        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.75rem 1rem' }}>
                                            <div style={{ fontWeight: '700', fontSize: '0.9375rem', color: '#1e293b', marginBottom: '0.25rem' }}>{matchedOpp.opportunityName || matchedOpp.account}</div>
                                            <div style={{ fontSize: '0.8125rem', color: '#64748b' }}>{matchedOpp.account} · {matchedOpp.stage}</div>
                                            <div style={{ fontWeight: '700', fontSize: '0.875rem', color: '#2563eb', marginTop: '0.25rem' }}>${(matchedOpp.arr || 0).toLocaleString()} ARR</div>
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '0.75rem 1rem', fontSize: '0.8125rem', color: '#92400e' }}>
                                        No matching opportunity found. Link this event to a deal by logging it as an activity.
                                    </div>
                                )}

                                {/* Deal Health */}
                                {health && (
                                    <div>
                                        <div style={{ fontSize: '0.625rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>Deal Health</div>
                                        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.75rem 1rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                                                <span style={{ fontWeight: '800', fontSize: '1.5rem', color: healthColor }}>{health.score}</span>
                                                <span style={{ background: healthBg, color: healthColor, fontSize: '0.75rem', fontWeight: '700', padding: '0.2rem 0.625rem', borderRadius: '999px' }}>{health.score >= 70 ? 'Healthy' : health.score >= 40 ? 'At Risk' : 'Critical'}</span>
                                            </div>
                                            <div style={{ height: '6px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden', marginBottom: '0.5rem' }}>
                                                <div style={{ height: '100%', width: health.score + '%', background: healthColor, borderRadius: '3px', transition: 'width 0.4s ease' }} />
                                            </div>
                                            {health.reasons.slice(0, 2).map((r, i) => (
                                                <div key={i} style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>· {r}</div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Account details */}
                                {matchedAccount && (
                                    <div>
                                        <div style={{ fontSize: '0.625rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>Account</div>
                                        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.75rem 1rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                            {[
                                                ['Industry', matchedAccount.industry],
                                                ['Owner', matchedAccount.accountOwner],
                                                ['Size', matchedAccount.employeeCount ? matchedAccount.employeeCount + ' employees' : null],
                                                ['Website', matchedAccount.website],
                                            ].filter(([, v]) => v).map(([label, value]) => (
                                                <div key={label}>
                                                    <div style={{ fontSize: '0.625rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
                                                    <div style={{ fontSize: '0.8125rem', color: '#1e293b', fontWeight: '500', marginTop: '0.1rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Contacts */}
                                {matchedOpp && (
                                    <div>
                                        <div style={{ fontSize: '0.625rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>Contacts</div>
                                        {matchedContacts.length === 0 ? (
                                            <div style={{ fontSize: '0.8125rem', color: '#94a3b8', fontStyle: 'italic' }}>No contacts found for this account</div>
                                        ) : (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                                                {matchedContacts.map(c => (
                                                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.5rem 0.75rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
                                                        <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: '700', color: '#2563eb', flexShrink: 0 }}>
                                                            {(c.firstName?.[0] || '') + (c.lastName?.[0] || '')}
                                                        </div>
                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                            <div style={{ fontSize: '0.8125rem', fontWeight: '600', color: '#1e293b' }}>{c.firstName} {c.lastName}</div>
                                                            <div style={{ fontSize: '0.6875rem', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{[c.title, c.email].filter(Boolean).join(' · ')}</div>
                                                        </div>
                                                        {c.phone && <div style={{ fontSize: '0.6875rem', color: '#94a3b8', flexShrink: 0 }}>{c.phone}</div>}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Recent Activities */}
                                {matchedOpp && (
                                    <div>
                                        <div style={{ fontSize: '0.625rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>Recent Activities</div>
                                        {recentActivities.length === 0 ? (
                                            <div style={{ fontSize: '0.8125rem', color: '#94a3b8', fontStyle: 'italic' }}>No activities logged yet</div>
                                        ) : (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                                                {recentActivities.map(a => (
                                                    <div key={a.id} style={{ display: 'flex', gap: '0.625rem', alignItems: 'flex-start', padding: '0.5rem 0.75rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
                                                        <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#2563eb', background: '#eff6ff', padding: '0.15rem 0.375rem', borderRadius: '4px', whiteSpace: 'nowrap', flexShrink: 0 }}>{a.type}</div>
                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                            <div style={{ fontSize: '0.75rem', color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.notes || '—'}</div>
                                                            <div style={{ fontSize: '0.6875rem', color: '#94a3b8', marginTop: '0.1rem' }}>{a.date}</div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Open Tasks */}
                                {matchedOpp && (
                                    <div>
                                        <div style={{ fontSize: '0.625rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>Open Tasks</div>
                                        {openTasks.length === 0 ? (
                                            <div style={{ fontSize: '0.8125rem', color: '#94a3b8', fontStyle: 'italic' }}>No open tasks</div>
                                        ) : (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                                                {openTasks.map(t => (
                                                    <div key={t.id} style={{ display: 'flex', gap: '0.625rem', alignItems: 'center', padding: '0.5rem 0.75rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px' }}>
                                                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: t.priority === 'High' ? '#ef4444' : t.priority === 'Low' ? '#10b981' : '#f59e0b', flexShrink: 0 }} />
                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                            <div style={{ fontSize: '0.8125rem', fontWeight: '600', color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</div>
                                                            <div style={{ fontSize: '0.6875rem', color: '#94a3b8' }}>Due {t.dueDate || '—'}</div>
                                                        </div>
                                                        <span style={{ fontSize: '0.6875rem', color: '#64748b', background: '#e2e8f0', padding: '0.1rem 0.375rem', borderRadius: '4px', flexShrink: 0 }}>{t.type}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Footer actions */}
                            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                                <button onClick={() => { setMeetingPrepOpen(false); handleAddActivity(matchedOpp?.id || null); }}
                                    style={{ flex: 1, padding: '0.5rem', border: 'none', borderRadius: '8px', background: '#2563eb', color: '#fff', fontSize: '0.8125rem', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>
                                    + Log Activity
                                </button>
                                <button onClick={() => { setMeetingPrepOpen(false); setEditingTask({ opportunityId: matchedOpp?.id || '', relatedTo: matchedOpp?.id || '' }); setShowTaskModal(true); }}
                                    style={{ flex: 1, padding: '0.5rem', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#f8fafc', color: '#475569', fontSize: '0.8125rem', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>
                                    + Add Task
                                </button>
                            </div>
                        </div>
                    </>
                );
            })()}

            {showModal && (
                <OpportunityModal
                    opportunity={editingOpp}
                    accounts={accounts}
                    contacts={contacts}
                    settings={settings}
                    pipelines={allPipelines}
                    activePipelineId={activePipeline.id}
                    currentUser={currentUser}
                    activities={activities}
                    onSaveActivity={(activityData) => {
                        const newId = 'id_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
                        setActivities(prev => [...prev, { ...activityData, id: newId, createdAt: new Date().toISOString(), author: currentUser || '' }]);
                    }}
                    onDeleteActivity={(activityId) => {
                        setActivities(prev => prev.filter(a => a.id !== activityId));
                    }}
                    onSaveComment={(oppId, comment) => {
                        setOpportunities(prev => {
                            const updated = prev.map(o =>
                                o.id === oppId ? { ...o, comments: [...(o.comments || []), comment] } : o
                            );
                            setEditingOpp(updated.find(o => o.id === oppId) || null);
                            return updated;
                        });
                    }}
                    onEditComment={(oppId, commentId, newText) => {
                        setOpportunities(prev => {
                            const updated = prev.map(o =>
                                o.id === oppId ? { ...o, comments: (o.comments || []).map(c =>
                                    c.id === commentId ? { ...c, text: newText, edited: true, editedAt: new Date().toISOString() } : c
                                )} : o
                            );
                            setEditingOpp(updated.find(o => o.id === oppId) || null);
                            return updated;
                        });
                    }}
                    onDeleteComment={(oppId, commentId) => {
                        setOpportunities(prev => {
                            const updated = prev.map(o =>
                                o.id === oppId ? { ...o, comments: (o.comments || []).filter(c => c.id !== commentId) } : o
                            );
                            setEditingOpp(updated.find(o => o.id === oppId) || null);
                            return updated;
                        });
                    }}
                    onClose={() => { setShowModal(false); setOppModalError(null); setOppModalSaving(false); }}
                    onDismissError={() => setOppModalError(null)}
                    onSave={(formData) => handleSave(formData, editingOpp, activePipeline, currentUser, setShowModal, setLostReasonModal)}
                    errorMessage={oppModalError}
                    saving={oppModalSaving}
                    onAddAccount={handleAddAccountFromOpportunity}
                    lastCreatedAccountName={lastCreatedAccountName}
                    lastCreatedRepName={lastCreatedRepName}
                    onSaveNewContact={(data) => {
                        const newId = 'id_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
                        const nc = { ...data, id: newId, createdAt: new Date().toISOString() };
                        setContacts(prev => [...prev, nc]);
                        dbFetch('/.netlify/functions/contacts', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(nc)
                        }).catch(err => console.error('Failed to save inline contact:', err));
                        return nc;
                    }}
                    onSaveNewAccount={(data) => {
                        const newId = 'id_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
                        const na = { ...data, id: newId };
                        setAccounts(prev => [...prev, na]);
                        dbFetch('/.netlify/functions/accounts', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(na)
                        }).catch(err => console.error('Failed to save inline account:', err));
                        return na;
                    }}
                    onAddContact={() => {
                        setShowContactModal(true);
                        setEditingContact(null);
                    }}
                    onAddRep={() => {
                        setShowUserModal(true);
                        setEditingUser(null);
                    }}
                />
            )}

            {showAccountModal && (
                <AccountModal
                    account={editingAccount || editingSubAccount}
                    isSubAccount={!!parentAccountForSub || !!editingSubAccount}
                    settings={settings}
                    onClose={() => { setShowAccountModal(false); setAccountModalError(null); setAccountModalSaving(false); }}
                    onDismissError={() => setAccountModalError(null)}
                    onSave={(formData) => handleSaveAccount(formData, { editingAccount, editingSubAccount, parentAccountForSub, accountCreatedFromOppForm, pendingOppFormData, setShowAccountModal, setLastCreatedAccountName, setEditingOpp, setShowModal, setAccountCreatedFromOppForm, setPendingOppFormData })}
                    onAddRep={() => { setShowUserModal(true); setEditingUser(null); }}
                    existingAccounts={accounts}
                    errorMessage={accountModalError}
                    saving={accountModalSaving}
                />
            )}

            {showUserModal && (
                <UserModal
                    user={editingUser}
                    settings={settings}
                    onClose={() => { setShowUserModal(false); setUserModalError(null); setUserModalSaving(false); }}
                    onDismissError={() => setUserModalError(null)}
                    onSave={handleSaveUser}
                    errorMessage={userModalError}
                    saving={userModalSaving}
                />
            )}

            {showTaskModal && (
                <TaskModal
                    task={editingTask}
                    taskTypes={settings.taskTypes || ['Call', 'Meeting', 'Email']}
                    opportunities={opportunities}
                    accounts={accounts}
                    contacts={contacts}
                    settings={settings}
                    onClose={() => { setShowTaskModal(false); setTaskModalError(null); setTaskModalSaving(false); }}
                    onDismissError={() => setTaskModalError(null)}
                    onSave={(taskData) => handleSaveTask(taskData, { editingTask, setShowTaskModal, opportunities })}
                    errorMessage={taskModalError}
                    saving={taskModalSaving}
                    onAddTaskType={handleAddTaskType}
                    onSaveNewContact={(data) => {
                        const newId = 'id_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
                        const nc = { ...data, id: newId, createdAt: new Date().toISOString() };
                        setContacts(prev => [...prev, nc]);
                        dbFetch('/.netlify/functions/contacts', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(nc)
                        }).catch(err => console.error('Failed to save inline contact:', err));
                        return nc;
                    }}
                    onSaveNewAccount={(data) => {
                        const newId = 'id_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
                        const na = { ...data, id: newId };
                        setAccounts(prev => [...prev, na]);
                        dbFetch('/.netlify/functions/accounts', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(na)
                        }).catch(err => console.error('Failed to save inline account:', err));
                        return na;
                    }}
                    onAddOpportunity={() => {
                        setShowModal(true);
                        setEditingOpp(null);
                    }}
                    onAddContact={() => {
                        setShowContactModal(true);
                        setEditingContact(null);
                    }}
                    onAddAccount={() => {
                        setShowAccountModal(true);
                        setEditingAccount(null);
                    }}
                />
            )}

            <ViewingTaskPanel
                    setEditingTask={setEditingTask} setShowTaskModal={setShowTaskModal}
                    setEditingOpp={setEditingOpp} setShowModal={setShowModal}
                    setEditingContact={setEditingContact} setShowContactModal={setShowContactModal}
                    setEditingAccount={setEditingAccount} setEditingSubAccount={setEditingSubAccount} setShowAccountModal={setShowAccountModal}
                    setEditingActivity={setEditingActivity} setShowActivityModal={setShowActivityModal} setActivityInitialContext={setActivityInitialContext}
                />

            {showContactModal && (
                <ContactModal
                    contact={editingContact}
                    contacts={contacts}
                    accounts={accounts}
                    settings={settings}
                    onClose={() => { setShowContactModal(false); setContactModalError(null); setContactModalSaving(false); }}
                    onDismissError={() => setContactModalError(null)}
                    onSave={(contactData) => handleSaveContact(contactData, { editingContact, setShowContactModal })}
                    errorMessage={contactModalError}
                    saving={contactModalSaving}
                    onSaveNewContact={(newContactData) => {
                        const newId = 'id_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
                        const nc = { ...newContactData, id: newId, createdAt: new Date().toISOString() };
                        setContacts(prev => [...prev, nc]);
                        dbFetch('/.netlify/functions/contacts', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(nc)
                        }).catch(err => console.error('Failed to save inline contact:', err));
                        return nc;
                    }}
                    onAddAccount={() => {
                        setShowAccountModal(true);
                        setEditingAccount(null);
                        setEditingSubAccount(null);
                        setParentAccountForSub(null);
                    }}
                />
            )}

            <ViewingAccountPanel
                    setEditingOpp={setEditingOpp} setShowModal={setShowModal}
                    setEditingContact={setEditingContact} setShowContactModal={setShowContactModal}
                    setEditingAccount={setEditingAccount} setEditingSubAccount={setEditingSubAccount} setShowAccountModal={setShowAccountModal}
                    setEditingTask={setEditingTask} setShowTaskModal={setShowTaskModal}
                    setEditingActivity={setEditingActivity} setShowActivityModal={setShowActivityModal} setActivityInitialContext={setActivityInitialContext}
                    setShowSpiffClaimModal={setShowSpiffClaimModal} setSpiffClaimContext={setSpiffClaimContext}
                    setShowCsvImportModal={setShowCsvImportModal} setShowLeadImportModal={setShowLeadImportModal} setShowOutlookImportModal={setShowOutlookImportModal}
                    setShowShortcuts={setShowShortcuts}
                />

            <ViewingContactPanel
                    setEditingOpp={setEditingOpp} setShowModal={setShowModal}
                    setEditingContact={setEditingContact} setShowContactModal={setShowContactModal}
                    setEditingAccount={setEditingAccount} setEditingSubAccount={setEditingSubAccount} setShowAccountModal={setShowAccountModal}
                    setEditingTask={setEditingTask} setShowTaskModal={setShowTaskModal}
                    setEditingActivity={setEditingActivity} setShowActivityModal={setShowActivityModal} setActivityInitialContext={setActivityInitialContext}
                    setShowSpiffClaimModal={setShowSpiffClaimModal} setSpiffClaimContext={setSpiffClaimContext}
                />

            {/* Notes Popover */}
            {/* ── Keyboard Shortcuts Overlay ───────────────────────── */}
            {showShortcuts && (
                <div onClick={() => setShowShortcuts(false)} style={{
                    position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', zIndex: 9998,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    backdropFilter: 'blur(2px)', animation: 'fadeIn 0.15s ease'
                }}>
                    <div onClick={e => e.stopPropagation()} style={{
                        background: '#fff', borderRadius: '16px', width: '540px', maxWidth: '95vw',
                        maxHeight: '85vh', overflowY: 'auto',
                        boxShadow: '0 25px 60px rgba(0,0,0,0.25)', animation: 'slideUp 0.18s ease'
                    }}>
                        {/* Header */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '1.25rem 1.5rem', borderBottom: '1px solid #f1f5f9' }}>
                            <div>
                                <div style={{ fontSize: '1rem', fontWeight: '800', color: '#0f172a' }}>⌨ Keyboard Shortcuts</div>
                                <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.125rem' }}>Press <kbd style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '4px', padding: '0.1rem 0.375rem', fontSize: '0.6875rem', fontFamily: 'monospace', fontWeight: '700' }}>?</kbd> to toggle this panel</div>
                            </div>
                            <button onClick={() => setShowShortcuts(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '1.25rem', lineHeight: 1, padding: '0.25rem' }}>✕</button>
                        </div>
                        {/* Sections */}
                        {[
                            { section: 'Navigation', icon: '🧭', shortcuts: [
                                { keys: ['1'], desc: 'Home' },
                                { keys: ['2'], desc: 'Pipeline' },
                                { keys: ['3'], desc: 'Opportunities' },
                                { keys: ['4'], desc: 'Tasks' },
                                { keys: ['5'], desc: 'Accounts' },
                                { keys: ['6'], desc: 'Contacts' },
                                { keys: ['7'], desc: 'Leads' },
                                { keys: ['8'], desc: 'Reports' },
                            ]},
                            { section: 'Create', icon: '✏️', shortcuts: [
                                { keys: ['O'], desc: 'New Opportunity' },
                                { keys: ['A'], desc: 'New Account' },
                                { keys: ['C'], desc: 'New Contact' },
                                { keys: ['T'], desc: 'New Task' },
                            ]},
                            { section: 'Search & UI', icon: '🔍', shortcuts: [
                                { keys: ['/'], desc: 'Focus search bar' },
                                { keys: ['Esc'], desc: 'Close modal or popover' },
                            ]},
                        ].map(group => (
                            <div key={group.section} style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #f8fafc' }}>
                                <div style={{ fontSize: '0.6875rem', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.625rem' }}>
                                    {group.icon} {group.section}
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                                    {group.shortcuts.map(sc => (
                                        <div key={sc.desc} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <span style={{ fontSize: '0.8125rem', color: '#475569' }}>{sc.desc}</span>
                                            <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0, marginLeft: '1rem' }}>
                                                {sc.keys.map(k => (
                                                    <kbd key={k} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderBottom: '2px solid #d1d5db', borderRadius: '6px', padding: '0.2rem 0.5rem', fontSize: '0.75rem', fontFamily: 'monospace', fontWeight: '700', color: '#1e293b', minWidth: '28px', textAlign: 'center' }}>{k}</kbd>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                        <div style={{ padding: '0.75rem 1.5rem', background: '#f8fafc', borderRadius: '0 0 16px 16px' }}>
                            <div style={{ fontSize: '0.6875rem', color: '#94a3b8', textAlign: 'center' }}>
                                Shortcuts are disabled while typing in a field
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Undo Toast ───────────────────────────────────────── */}
            {undoToast && (
                <div style={{ position: 'fixed', bottom: '1.5rem', left: '50%', transform: 'translateX(-50%)', zIndex: 10050,
                    background: '#1e293b', color: '#fff', borderRadius: '10px', padding: '0.75rem 1.25rem',
                    display: 'flex', alignItems: 'center', gap: '1rem', boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
                    minWidth: '320px', maxWidth: '480px' }}>
                    <span style={{ fontSize: '0.875rem', flex: 1 }}>
                        🗑 <strong>{undoToast.label}</strong> deleted
                    </span>
                    <button onClick={() => { clearTimeout(undoToast.timerId); undoToast.restore(); }}
                        style={{ padding: '0.3rem 0.875rem', background: '#3b82f6', color: '#fff', border: 'none',
                            borderRadius: '6px', fontWeight: '700', cursor: 'pointer', fontSize: '0.8125rem', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                        ↩ Undo
                    </button>
                    <button onClick={() => { clearTimeout(undoToast.timerId); setUndoToast(null); }}
                        style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1rem', padding: '0 0.25rem', lineHeight: 1 }}>✕</button>
                </div>
            )}

            {notesPopover && (() => {
                const { opp, type, rect } = notesPopover;
                const popH = 300;
                const spaceBelow = window.innerHeight - rect.bottom;
                const top = spaceBelow >= popH + 12 ? rect.bottom + 6 : rect.top - popH - 6;
                const left = Math.min(rect.left, window.innerWidth - 360);
                const avatarColors = ['#2563eb','#10b981','#f59e0b','#8b5cf6','#ec4899','#0891b2','#ef4444'];
                const getColor = (name) => avatarColors[(name||'A').charCodeAt(0) % avatarColors.length];
                const getInitials = (name) => (name||'?').split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
                return (
                    <>
                        <div onClick={() => setNotesPopover(null)} style={{ position: 'fixed', inset: 0, zIndex: 998 }} />
                        <div style={{ position: 'fixed', top, left, zIndex: 999, background: '#fff', borderRadius: '10px', boxShadow: '0 8px 32px rgba(0,0,0,0.16)', border: '1px solid #e2e8f0', width: '340px', maxHeight: '300px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                            <div style={{ padding: '0.625rem 0.875rem', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc', borderRadius: '10px 10px 0 0' }}>
                                <div style={{ fontWeight: '700', fontSize: '0.75rem', color: '#1e293b' }}>
                                    {type === 'notes' ? '📝 Notes' : '💬 Team Notes'} · <span style={{ color: '#64748b', fontWeight: '500' }}>{opp.opportunityName || opp.account}</span>
                                </div>
                                <button onClick={() => setNotesPopover(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '1rem', lineHeight: 1, padding: '0 0.25rem' }}>✕</button>
                            </div>
                            <div style={{ overflowY: 'auto', padding: '0.75rem 0.875rem', flex: 1 }}>
                                {type === 'notes' ? (
                                    <p style={{ margin: 0, fontSize: '0.8125rem', color: '#334155', lineHeight: '1.6', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{opp.notes}</p>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                                        {(opp.comments || []).slice().sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp)).map(c => (
                                            <div key={c.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                                                <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: getColor(c.author), color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.5625rem', fontWeight: '800', flexShrink: 0 }}>{getInitials(c.author)}</div>
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ display: 'flex', gap: '0.375rem', alignItems: 'baseline', marginBottom: '0.125rem' }}>
                                                        <span style={{ fontWeight: '700', fontSize: '0.75rem', color: '#1e293b' }}>{c.author}</span>
                                                        <span style={{ fontSize: '0.6875rem', color: '#94a3b8' }}>{new Date(c.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                                                    </div>
                                                    <p style={{ margin: 0, fontSize: '0.8125rem', color: '#334155', lineHeight: '1.5', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{c.text}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div style={{ padding: '0.5rem 0.875rem', borderTop: '1px solid #f1f5f9', background: '#f8fafc', borderRadius: '0 0 10px 10px' }}>
                                <button onClick={() => { setNotesPopover(null); setEditingOpp(notesPopover.opp); setShowModal(true); }}
                                    style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
                                    Open full opportunity →
                                </button>
                            </div>
                        </div>
                    </>
                );
            })()}

            {showActivityModal && (
                <ActivityModal
                    key={editingActivity?.id || ('new-activity-' + (showActivityModal ? 'open' : 'closed'))}
                    activity={editingActivity}
                    opportunities={opportunities}
                    contacts={contacts}
                    accounts={accounts}
                    onClose={() => { setShowActivityModal(false); setActivityModalError(null); setActivityModalSaving(false); }}
                    onDismissError={() => setActivityModalError(null)}
                    onSave={(activityData) => handleSaveActivity(activityData, { editingActivity, currentUser, opportunities, setShowActivityModal, setFollowUpPrompt, setQuickLogOpen, setQuickLogForm, setQuickLogContactResults })}
                    errorMessage={activityModalError}
                    saving={activityModalSaving}
                    initialContext={activityInitialContext}
                    onSaveNewContact={(data) => {
                        const newId = 'id_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
                        const nc = { ...data, id: newId, createdAt: new Date().toISOString() };
                        setContacts(prev => [...prev, nc]);
                        dbFetch('/.netlify/functions/contacts', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(nc)
                        }).catch(err => console.error('Failed to save inline contact:', err));
                        return nc;
                    }}
                    onSaveNewAccount={(data) => {
                        const newId = 'id_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
                        const na = { ...data, id: newId };
                        setAccounts(prev => [...prev, na]);
                        dbFetch('/.netlify/functions/accounts', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(na)
                        }).catch(err => console.error('Failed to save inline account:', err));
                        return na;
                    }}
                    onAddContact={() => {
                        setShowContactModal(true);
                        setEditingContact(null);
                    }}
                    onAddAccount={() => {
                        setShowAccountModal(true);
                        setEditingAccount(null);
                        setEditingSubAccount(null);
                        setParentAccountForSub(null);
                    }}
                    onAddOpportunity={() => {
                        setShowModal(true);
                        setEditingOpp(null);
                    }}
                />
            )}

            {showCsvImportModal && (
                <CsvImportModal
                    importType={csvImportType}
                    contacts={contacts}
                    accounts={accounts}
                    onClose={() => setShowCsvImportModal(false)}
                    onImportContacts={async (newContacts) => {
                        // Save records in batches to avoid overwhelming Netlify concurrency limits
                        const saveBatch = async (url, items, progressOffset = 0, progressTotal = items.length) => {
                            const BATCH_SIZE = 20;
                            let failed = 0;
                            let done = 0;
                            for (let i = 0; i < items.length; i += BATCH_SIZE) {
                                const batch = items.slice(i, i + BATCH_SIZE);
                                const results = await Promise.allSettled(batch.map(async (item) => {
                                    const r = await dbFetch(url, { method: 'POST', body: JSON.stringify(item) });
                                    if (!r || !r.ok) throw new Error('failed');
                                }));
                                failed += results.filter(r => r.status === 'rejected').length;
                                done += batch.length;
                                if (typeof window.__importProgressCb === 'function') {
                                    window.__importProgressCb(progressOffset + done, progressTotal);
                                }
                            }
                            return failed;
                        };

                        const contactsWithIds = newContacts.map((c) => ({
                            ...c,
                            id: crypto.randomUUID(),
                            createdAt: new Date().toISOString()
                        }));

                        // Step 1: Auto-add new companies to accounts FIRST in batches
                        const existingNames = accounts.map(a => a.name.toLowerCase());
                        const newCompanies = [...new Set(
                            newContacts.map(c => c.company).filter(c => c && !existingNames.includes(c.toLowerCase()))
                        )];
                        if (newCompanies.length > 0) {
                            const newAccts = newCompanies.map((name) => ({
                                id: crypto.randomUUID(), name,
                                verticalMarket: '', address: '', city: '', state: '',
                                zip: '', country: '', website: '', phone: '', accountOwner: '',
                            }));
                            setAccounts(prev => [...prev, ...newAccts]);
                            await saveBatch('/.netlify/functions/accounts', newAccts);
                        }

                        // Step 2: Save contacts in batches — only after accounts confirmed saved
                        setContacts(prev => [...prev, ...contactsWithIds]);
                        const contactsFailed = await saveBatch('/.netlify/functions/contacts', contactsWithIds, 0, contactsWithIds.length);
                        if (contactsFailed > 0) {
                            throw new Error(`${contactsFailed} of ${contactsWithIds.length} contacts failed to save. The rest imported successfully — try re-importing the failed records.`);
                        }
                        // Modal handles its own close via Done button
                    }}
                    onImportAccounts={async (newAccounts) => {
                        const BATCH_SIZE = 20;
                        const accountsWithIds = newAccounts.map((a) => ({ ...a, id: crypto.randomUUID() }));
                        setAccounts(prev => [...prev, ...accountsWithIds]);
                        let accountsFailed = 0;
                        for (let i = 0; i < accountsWithIds.length; i += BATCH_SIZE) {
                            const batch = accountsWithIds.slice(i, i + BATCH_SIZE);
                            const results = await Promise.allSettled(batch.map(async (account) => {
                                const r = await dbFetch('/.netlify/functions/accounts', {
                                    method: 'POST', body: JSON.stringify(account)
                                });
                                if (!r || !r.ok) throw new Error('failed');
                            }));
                            accountsFailed += results.filter(r => r.status === 'rejected').length;
                        }
                        if (accountsFailed > 0) {
                            throw new Error(`${accountsFailed} of ${accountsWithIds.length} accounts failed to save. The rest imported successfully — try re-importing the failed records.`);
                        }
                        // Modal handles its own close via Done button
                    }}
                />
            )}

            {showOutlookImportModal && (
                <OutlookImportModal
                    contacts={contacts}
                    opportunities={opportunities}
                    activities={activities}
                    onClose={() => setShowOutlookImportModal(false)}
                    onImport={async (newActivities) => {
                        const startId = Date.now();
                        const activitiesWithIds = newActivities.map((a, i) => ({
                            ...a,
                            id: 'id_' + (startId + i) + '_' + Math.random().toString(36).slice(2, 7),
                            createdAt: new Date().toISOString()
                        }));
                        setActivities([...activities, ...activitiesWithIds]);
                        // Save all imported activities — await all so we can catch partial failures
                        const activitySaveResults = await Promise.allSettled(
                            activitiesWithIds.map(activity =>
                                dbFetch('/.netlify/functions/activities', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify(activity)
                                })
                            )
                        );
                        const activityFailed = activitySaveResults.filter(r => r.status === 'rejected').length;
                        if (activityFailed > 0) {
                            console.error(`${activityFailed} of ${activitiesWithIds.length} activities failed to save. Try re-importing the failed records.`);
                        }
                        setShowOutlookImportModal(false);
                    }}
                />
            )}

            {showLeadImportModal && (
                <LeadImportModal
                    existingLeads={leads}
                    onClose={() => setShowLeadImportModal(false)}
                    onImport={async (newLeads) => {
                        const resp = await dbFetch('/.netlify/functions/leads', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(newLeads),
                        });
                        if (!resp.ok) throw new Error('Import failed');
                        const data = await resp.json();
                        const imported = data.leads || [];
                        setLeads(prev => [...prev, ...imported]);
                        // Modal handles its own close via Done button
                    }}
                />
            )}

            {/* Lost Reason Modal */}
            {lostReasonModal && (
                <LostReasonModal
                    oppName={lostReasonModal.pendingFormData.opportunityName || lostReasonModal.pendingFormData.account}
                    onSave={(category, reason) => completeLostSave(lostReasonModal.pendingFormData, lostReasonModal.editingOpp, reason, category, activePipeline, currentUser, setLostReasonModal)}
                    onSkip={() => completeLostSave(lostReasonModal.pendingFormData, lostReasonModal.editingOpp, '', '', activePipeline, currentUser, setLostReasonModal)}
                />
            )}

            {confirmModal && (
                <div className="modal-overlay" onClick={() => setConfirmModal(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '420px', padding: '2rem' }}>
                        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: confirmModal.danger !== false ? '#fef2f2' : '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
                                <span style={{ fontSize: '1.5rem' }}>{confirmModal.danger !== false ? '\u26A0\uFE0F' : '\u2139\uFE0F'}</span>
                            </div>
                            <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1.125rem', fontWeight: '700', color: '#1e293b' }}>Confirm Action</h3>
                            <p style={{ color: '#64748b', fontSize: '0.9rem', margin: 0, lineHeight: '1.5', whiteSpace: 'pre-line' }}>{confirmModal.message}</p>
                        </div>
                        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
                            <button
                                onClick={() => setConfirmModal(null)}
                                style={{ padding: '0.625rem 1.5rem', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#ffffff', color: '#64748b', fontWeight: '600', fontSize: '0.875rem', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}
                                onMouseEnter={e => e.target.style.background = '#f8f9fa'}
                                onMouseLeave={e => e.target.style.background = '#ffffff'}
                            >Cancel</button>
                            <button
                                onClick={() => { const fn = confirmModal.onConfirm; setConfirmModal(null); fn(); }}
                                style={{ padding: '0.625rem 1.5rem', border: 'none', borderRadius: '6px', background: confirmModal.danger !== false ? '#ef4444' : '#2563eb', color: 'white', fontWeight: '600', fontSize: '0.875rem', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}
                                onMouseEnter={e => e.target.style.opacity = '0.9'}
                                onMouseLeave={e => e.target.style.opacity = '1'}
                            >{confirmModal.danger !== false ? 'Delete' : 'Confirm'}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Task Reminder Popup */}
            {taskReminderPopup && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    onClick={() => setTaskReminderPopup(null)}
                >
                    <div style={{ background: '#ffffff', borderRadius: '12px', padding: '0', width: '420px', maxWidth: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', overflow: 'hidden' }}
                        onClick={e => e.stopPropagation()}
                    >
                        <div style={{ background: '#f59e0b', padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <span style={{ fontSize: '1.5rem' }}>🔔</span>
                            <div>
                                <div style={{ fontWeight: '700', fontSize: '1rem', color: '#ffffff' }}>Task Reminder</div>
                                <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.85)', fontWeight: '500' }}>
                                    {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </div>
                            </div>
                        </div>
                        <div style={{ padding: '1.25rem' }}>
                            <div style={{ fontSize: '1.0625rem', fontWeight: '700', color: '#1e293b', marginBottom: '0.75rem' }}>
                                {taskReminderPopup.title}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', marginBottom: '1rem' }}>
                                {taskReminderPopup.type && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <span style={{ fontSize: '0.75rem', color: '#64748b', width: '55px' }}>Type:</span>
                                        <span style={{ fontSize: '0.8125rem', fontWeight: '600', color: '#1e293b', background: '#f1f5f9', padding: '0.125rem 0.5rem', borderRadius: '4px' }}>{taskReminderPopup.type}</span>
                                    </div>
                                )}
                                {taskReminderPopup.dueDate && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <span style={{ fontSize: '0.75rem', color: '#64748b', width: '55px' }}>Due:</span>
                                        <span style={{ fontSize: '0.8125rem', fontWeight: '600', color: new Date(taskReminderPopup.dueDate + 'T12:00:00') < new Date() ? '#ef4444' : '#1e293b' }}>
                                            {new Date(taskReminderPopup.dueDate + 'T12:00:00').toLocaleDateString()}
                                        </span>
                                    </div>
                                )}
                                {taskReminderPopup.assignedTo && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <span style={{ fontSize: '0.75rem', color: '#64748b', width: '55px' }}>Assigned:</span>
                                        <span style={{ fontSize: '0.8125rem', fontWeight: '600', color: '#1e293b' }}>{taskReminderPopup.assignedTo}</span>
                                    </div>
                                )}
                                {taskReminderPopup.notes && (
                                    <div style={{ marginTop: '0.375rem', fontSize: '0.8125rem', color: '#475569', background: '#f8fafc', borderRadius: '6px', padding: '0.5rem 0.625rem', border: '1px solid #e2e8f0', lineHeight: '1.4' }}>
                                        {taskReminderPopup.notes}
                                    </div>
                                )}
                            </div>
                            {/* Snooze selector */}
                            <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', marginBottom:'0.625rem', padding:'0.5rem 0.75rem', background:'#f8fafc', borderRadius:'8px', border:'1px solid #e2e8f0' }}>
                                <span style={{ fontSize:'0.6875rem', fontWeight:'700', color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.05em', flexShrink:0 }}>Snooze</span>
                                <select value={taskReminderSnoozeH} onChange={e => setTaskReminderSnoozeH(Number(e.target.value))}
                                    style={{ padding:'3px 6px', border:'1px solid #e2e8f0', borderRadius:'6px', fontSize:'0.8125rem', fontFamily:'inherit', color:'#1e293b', background:'#fff' }}>
                                    {[0,1,2,3,4,5,6,8,12,24].map(h => <option key={h} value={h}>{h}h</option>)}
                                </select>
                                <select value={taskReminderSnoozeM} onChange={e => setTaskReminderSnoozeM(Number(e.target.value))}
                                    style={{ padding:'3px 6px', border:'1px solid #e2e8f0', borderRadius:'6px', fontSize:'0.8125rem', fontFamily:'inherit', color:'#1e293b', background:'#fff' }}>
                                    {[0,5,10,15,20,30,45].map(m => <option key={m} value={m}>{m}m</option>)}
                                </select>
                                <button onClick={() => {
                                        const task = taskReminderPopup;
                                        const ms = (taskReminderSnoozeH * 60 + taskReminderSnoozeM) * 60 * 1000;
                                        if (ms <= 0) return;
                                        setTaskReminderPopup(null);
                                        setTimeout(() => setTaskReminderPopup(task), ms);
                                    }}
                                    style={{ padding:'4px 14px', background:'#f59e0b', color:'#fff', border:'none', borderRadius:'6px', fontWeight:'700', fontSize:'0.75rem', cursor:'pointer', fontFamily:'inherit', flexShrink:0 }}>
                                    Snooze
                                </button>
                            </div>
                            <div style={{ display: 'flex', gap: '0.75rem' }}>
                                <button
                                    onClick={() => {
                                        const task = taskReminderPopup;
                                        setTaskReminderPopup(null);
                                        setActiveTab('tasks');
                                        setTimeout(() => {
                                            setEditingTask(task);
                                            setShowTaskModal(true);
                                        }, 150);
                                    }}
                                    style={{ flex: 1, padding: '0.625rem 1rem', background: '#2563eb', color: '#ffffff', border: 'none', borderRadius: '6px', fontWeight: '600', fontSize: '0.875rem', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}
                                    onMouseEnter={e => e.target.style.background = '#1d4ed8'}
                                    onMouseLeave={e => e.target.style.background = '#2563eb'}
                                >Open Task</button>
                                <button
                                    onClick={() => setTaskReminderPopup(null)}
                                    style={{ flex: 1, padding: '0.625rem 1rem', background: '#ffffff', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '6px', fontWeight: '600', fontSize: '0.875rem', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}
                                    onMouseEnter={e => { e.target.style.background = '#f8fafc'; e.target.style.color = '#475569'; }}
                                    onMouseLeave={e => { e.target.style.background = '#ffffff'; e.target.style.color = '#64748b'; }}
                                >Dismiss</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Task Due Today Popup */}
            {taskDuePopup && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10001, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    onClick={() => {
                        if (taskDueQueue.length > 0) {
                            setTaskDuePopup(taskDueQueue[0]);
                            setTaskDueQueue(prev => prev.slice(1));
                        } else {
                            setTaskDuePopup(null);
                        }
                    }}
                >
                    <div style={{ background: '#ffffff', borderRadius: '16px', padding: '0', width: '440px', maxWidth: '90vw', boxShadow: '0 24px 64px rgba(0,0,0,0.35)', overflow: 'hidden', animation: 'slideUp 0.25s ease' }}
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Red header */}
                        <div style={{ background: 'linear-gradient(135deg, #dc2626, #ef4444)', padding: '1.125rem 1.5rem', display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
                            <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.375rem', flexShrink: 0 }}>⏰</div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: '800', fontSize: '1rem', color: '#ffffff', letterSpacing: '-0.01em' }}>Task Due Today</div>
                                <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.8)', fontWeight: '500', marginTop: '1px' }}>
                                    {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                                    {taskDueQueue.length > 0 && <span style={{ marginLeft: '0.5rem', background: 'rgba(255,255,255,0.25)', padding: '0.1rem 0.4rem', borderRadius: '999px', fontSize: '0.6875rem', fontWeight: '700' }}>+{taskDueQueue.length} more</span>}
                                </div>
                            </div>
                        </div>

                        {/* Body */}
                        <div style={{ padding: '1.375rem 1.5rem' }}>
                            <div style={{ fontSize: '1.125rem', fontWeight: '800', color: '#1e293b', marginBottom: '1rem', lineHeight: '1.3' }}>
                                {taskDuePopup.title}
                            </div>

                            {/* Detail rows */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.25rem' }}>
                                {taskDuePopup.type && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                                        <span style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', width: '60px', flexShrink: 0 }}>Type</span>
                                        <span style={{ fontSize: '0.8125rem', fontWeight: '600', color: '#1e293b', background: '#f1f5f9', padding: '0.2rem 0.625rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>{taskDuePopup.type}</span>
                                    </div>
                                )}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                                    <span style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', width: '60px', flexShrink: 0 }}>Due</span>
                                    <span style={{ fontSize: '0.8125rem', fontWeight: '700', color: '#dc2626', background: '#fef2f2', padding: '0.2rem 0.625rem', borderRadius: '6px', border: '1px solid #fecaca' }}>
                                        {new Date(taskDuePopup.dueDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                                        {taskDuePopup.dueTime && <span style={{ marginLeft: '0.375rem' }}>at {taskDuePopup.dueTime}</span>}
                                    </span>
                                </div>
                                {taskDuePopup.assignedTo && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                                        <span style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', width: '60px', flexShrink: 0 }}>Assigned</span>
                                        <span style={{ fontSize: '0.8125rem', fontWeight: '600', color: '#1e293b' }}>{taskDuePopup.assignedTo}</span>
                                    </div>
                                )}
                                {taskDuePopup.account && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                                        <span style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', width: '60px', flexShrink: 0 }}>Account</span>
                                        <span style={{ fontSize: '0.8125rem', fontWeight: '600', color: '#1e293b' }}>{taskDuePopup.account}</span>
                                    </div>
                                )}
                                {taskDuePopup.notes && (
                                    <div style={{ marginTop: '0.25rem', fontSize: '0.8125rem', color: '#475569', background: '#f8fafc', borderRadius: '8px', padding: '0.625rem 0.75rem', border: '1px solid #e2e8f0', lineHeight: '1.5' }}>
                                        {taskDuePopup.notes}
                                    </div>
                                )}
                            </div>

                            {/* Snooze selector */}
                            <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', marginBottom:'0.875rem', padding:'0.5rem 0.75rem', background:'#f8fafc', borderRadius:'8px', border:'1px solid #e2e8f0' }}>
                                <span style={{ fontSize:'0.6875rem', fontWeight:'700', color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.05em', flexShrink:0 }}>Snooze</span>
                                <select value={taskDueSnoozeH} onChange={e => setTaskDueSnoozeH(Number(e.target.value))}
                                    style={{ padding:'3px 6px', border:'1px solid #e2e8f0', borderRadius:'6px', fontSize:'0.8125rem', fontFamily:'inherit', color:'#1e293b', background:'#fff' }}>
                                    {[0,1,2,3,4,5,6,8,12,24].map(h => <option key={h} value={h}>{h}h</option>)}
                                </select>
                                <select value={taskDueSnoozeM} onChange={e => setTaskDueSnoozeM(Number(e.target.value))}
                                    style={{ padding:'3px 6px', border:'1px solid #e2e8f0', borderRadius:'6px', fontSize:'0.8125rem', fontFamily:'inherit', color:'#1e293b', background:'#fff' }}>
                                    {[0,5,10,15,20,30,45].map(m => <option key={m} value={m}>{m}m</option>)}
                                </select>
                                <button onClick={() => {
                                        const task = taskDuePopup;
                                        const ms = (taskDueSnoozeH * 60 + taskDueSnoozeM) * 60 * 1000;
                                        if (ms <= 0) return;
                                        if (taskDueQueue.length > 0) { setTaskDuePopup(taskDueQueue[0]); setTaskDueQueue(prev => prev.slice(1)); } else { setTaskDuePopup(null); }
                                        setTimeout(() => setTaskDuePopup(task), ms);
                                    }}
                                    style={{ padding:'4px 14px', background:'#f59e0b', color:'#fff', border:'none', borderRadius:'6px', fontWeight:'700', fontSize:'0.75rem', cursor:'pointer', fontFamily:'inherit', flexShrink:0 }}>
                                    Snooze
                                </button>
                            </div>

                            {/* Action buttons */}
                            <div style={{ display: 'flex', gap: '0.75rem' }}>
                                <button
                                    onClick={() => {
                                        const task = taskDuePopup;
                                        if (taskDueQueue.length > 0) {
                                            setTaskDuePopup(taskDueQueue[0]);
                                            setTaskDueQueue(prev => prev.slice(1));
                                        } else {
                                            setTaskDuePopup(null);
                                        }
                                        setActiveTab('tasks');
                                        setTimeout(() => { setEditingTask(task); setShowTaskModal(true); }, 150);
                                    }}
                                    style={{ flex: 1, padding: '0.7rem 1rem', background: 'linear-gradient(135deg, #dc2626, #ef4444)', color: '#ffffff', border: 'none', borderRadius: '8px', fontWeight: '700', fontSize: '0.875rem', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s', boxShadow: '0 2px 8px rgba(220,38,38,0.3)' }}
                                    onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 12px rgba(220,38,38,0.45)'}
                                    onMouseLeave={e => e.currentTarget.style.boxShadow = '0 2px 8px rgba(220,38,38,0.3)'}
                                >Open Task</button>
                                <button
                                    onClick={() => {
                                        if (taskDueQueue.length > 0) {
                                            setTaskDuePopup(taskDueQueue[0]);
                                            setTaskDueQueue(prev => prev.slice(1));
                                        } else {
                                            setTaskDuePopup(null);
                                        }
                                    }}
                                    style={{ flex: 1, padding: '0.7rem 1rem', background: '#ffffff', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '8px', fontWeight: '600', fontSize: '0.875rem', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}
                                    onMouseEnter={e => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.color = '#475569'; }}
                                    onMouseLeave={e => { e.currentTarget.style.background = '#ffffff'; e.currentTarget.style.color = '#64748b'; }}
                                >{taskDueQueue.length > 0 ? `Dismiss · Next (${taskDueQueue.length})` : 'Dismiss'}</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ════ SPIFF CLAIM MODAL ════ */}
            {showSpiffClaimModal && spiffClaimContext && (() => {
                const { opp } = spiffClaimContext;
                const activeSpiffsList = (settings.spiffs||[]).filter(s => s.active);
                const existingClaims = spiffClaims.filter(c => c.opportunityId === opp.id);
                const claimedSpiffIds = new Set(existingClaims.map(c => c.spiffId));
                const claimableSpiffs = activeSpiffsList.filter(s => !claimedSpiffIds.has(s.id));
                const dealArr = parseFloat(opp.arr) || 0;
                const calcClaimAmt = (spiff) => {
                    const amt = parseFloat(spiff.amount) || 0;
                    if (spiff.type === 'flat') return amt;
                    if (spiff.type === 'pct') return dealArr * amt / 100;
                    return 0; // multiplier shown separately
                };
                return (
                <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:10100, display:'flex', alignItems:'center', justifyContent:'center', padding:'1rem' }}
                    onClick={() => setShowSpiffClaimModal(false)}>
                    <div style={{ background:'#fff', borderRadius:'14px', padding:'1.5rem', width:'100%', maxWidth:'480px', boxShadow:'0 20px 60px rgba(0,0,0,0.25)' }}
                        onClick={e => e.stopPropagation()}>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'1rem' }}>
                            <div>
                                <div style={{ fontWeight:'800', fontSize:'1rem', color:'#1e293b' }}>⚡ Claim SPIFF</div>
                                <div style={{ fontSize:'0.75rem', color:'#64748b', marginTop:'2px' }}>{opp.opportunityName || opp.account} · ${dealArr.toLocaleString()} ARR</div>
                            </div>
                            <button onClick={() => setShowSpiffClaimModal(false)} style={{ background:'none', border:'none', fontSize:'1.25rem', color:'#94a3b8', cursor:'pointer', lineHeight:1 }}>×</button>
                        </div>

                        {existingClaims.length > 0 && (
                            <div style={{ marginBottom:'1rem' }}>
                                <div style={{ fontSize:'0.6875rem', fontWeight:'700', color:'#64748b', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:'0.375rem' }}>Already Claimed</div>
                                {existingClaims.map(c => {
                                    const sp = activeSpiffsList.find(s => s.id === c.spiffId) || {};
                                    return (
                                        <div key={c.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0.5rem 0.75rem', background:'#f8fafc', borderRadius:'6px', marginBottom:'4px', fontSize:'0.8125rem' }}>
                                            <span style={{ fontWeight:'600', color:'#1e293b' }}>{sp.name || 'SPIFF'}</span>
                                            <div style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
                                                <span style={{ fontWeight:'700', color:'#059669' }}>${Math.round(c.amount).toLocaleString()}</span>
                                                <span style={{ fontSize:'0.625rem', padding:'2px 6px', borderRadius:'999px', fontWeight:'700',
                                                    background: c.status==='approved'?'#d1fae5':c.status==='rejected'?'#fee2e2':c.status==='paid'?'#dbeafe':'#fef3c7',
                                                    color: c.status==='approved'?'#065f46':c.status==='rejected'?'#dc2626':c.status==='paid'?'#1e40af':'#92400e' }}>
                                                    {c.status.toUpperCase()}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {claimableSpiffs.length === 0 ? (
                            <div style={{ textAlign:'center', padding:'2rem', color:'#94a3b8', fontSize:'0.875rem', background:'#f8fafc', borderRadius:'8px' }}>
                                All active SPIFFs have already been claimed for this deal.
                            </div>
                        ) : (
                            <div>
                                <div style={{ fontSize:'0.6875rem', fontWeight:'700', color:'#64748b', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:'0.5rem' }}>Select SPIFFs to Claim</div>
                                <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem', maxHeight:'300px', overflowY:'auto' }}>
                                    {claimableSpiffs.map(spiff => {
                                        const estAmt = calcClaimAmt(spiff);
                                        return (
                                            <div key={spiff.id} style={{ border:'1px solid #e2e8f0', borderRadius:'8px', padding:'0.75rem', background:'#fff' }}>
                                                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'0.375rem' }}>
                                                    <div style={{ fontWeight:'600', fontSize:'0.875rem', color:'#1e293b' }}>{spiff.name || 'Unnamed SPIFF'}</div>
                                                    <div style={{ fontWeight:'700', color:'#7c3aed', fontSize:'0.875rem' }}>
                                                        {spiff.type === 'multiplier' ? `${spiff.amount}× multiplier` : `$${Math.round(estAmt).toLocaleString()}`}
                                                    </div>
                                                </div>
                                                <div style={{ fontSize:'0.6875rem', color:'#94a3b8', marginBottom:'0.625rem' }}>
                                                    {spiff.type==='flat'?`$${parseFloat(spiff.amount||0).toLocaleString()} flat bonus`:spiff.type==='pct'?`${spiff.amount}% of deal ARR`:`Commission multiplier ${spiff.amount}×`}
                                                    {spiff.condition && <span> · {spiff.condition}</span>}
                                                </div>
                                                <button onClick={() => {
                                                    const newClaim = {
                                                        id: 'claim_' + Date.now() + '_' + Math.random().toString(36).slice(2,7),
                                                        spiffId: spiff.id,
                                                        spiffName: spiff.name || 'Unnamed SPIFF',
                                                        opportunityId: opp.id,
                                                        opportunityName: opp.opportunityName || opp.account,
                                                        account: opp.account,
                                                        repName: opp.salesRep || opp.assignedTo || currentUser,
                                                        amount: spiff.type === 'multiplier' ? 0 : Math.round(estAmt),
                                                        multiplier: spiff.type === 'multiplier' ? parseFloat(spiff.amount)||1 : null,
                                                        spiffType: spiff.type,
                                                        dealArr,
                                                        status: 'pending',
                                                        claimedAt: new Date().toISOString(),
                                                        approvedAt: null,
                                                        approvedBy: null,
                                                        paidAt: null,
                                                        note: '',
                                                    };
                                                    setSpiffClaims(prev => [...prev, newClaim]);
                                                }}
                                                style={{ width:'100%', padding:'0.375rem', background:'#7c3aed', color:'#fff', border:'none', borderRadius:'6px', fontSize:'0.75rem', fontWeight:'700', cursor:'pointer', fontFamily:'inherit' }}>
                                                    Submit Claim
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                );
            })()}

            {/* ════ QUICK-LOG FLOATING BUTTON (home, pipeline, opportunities tabs) ════ */}
            {(activeTab === 'pipeline' || activeTab === 'home' || activeTab === 'opportunities') && (
                <div style={{ position: 'fixed', bottom: '1.5rem', right: '1.5rem', zIndex: 9990, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
                    {quickLogOpen && (
                        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.18)', padding: '1rem', width: '300px', display: 'flex', flexDirection: 'column', gap: '0.625rem' }}
                            onClick={e => e.stopPropagation()}>
                            <div style={{ fontSize: '0.75rem', fontWeight: '800', color: '#0f172a' }}>⚡ Quick Log Activity</div>

                            {/* Activity type pills */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.375rem' }}>
                                {['Call','Email','Meeting','Demo','Follow-up','Note'].map(t => (
                                    <button key={t} onClick={() => setQuickLogForm(f => ({ ...f, type: t }))}
                                        style={{ padding: '0.3rem 0.25rem', borderRadius: '6px', border: '1px solid ' + (quickLogForm.type === t ? '#2563eb' : '#e2e8f0'), background: quickLogForm.type === t ? '#eff6ff' : '#f8fafc', color: quickLogForm.type === t ? '#2563eb' : '#64748b', fontSize: '0.6875rem', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>
                                        {quickLogForm.type === t ? '✓ ' : ''}{t}
                                    </button>
                                ))}
                            </div>

                            {/* Contact typeahead */}
                            <div style={{ position: 'relative' }}>
                                <div style={{ fontSize: '0.625rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Contact</div>
                                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                    <input
                                        value={quickLogForm.contactSearch}
                                        onChange={e => {
                                            const q = e.target.value;
                                            setQuickLogForm(f => ({ ...f, contactSearch: q, contactId: '' }));
                                            if (q.trim().length < 1) { setQuickLogContactResults([]); return; }
                                            const ql = q.toLowerCase();
                                            const matches = (contacts || []).filter(c =>
                                                ((c.firstName || '') + ' ' + (c.lastName || '')).toLowerCase().includes(ql) ||
                                                (c.company || '').toLowerCase().includes(ql) ||
                                                (c.email || '').toLowerCase().includes(ql)
                                            ).slice(0, 6);
                                            setQuickLogContactResults(matches);
                                        }}
                                        onFocus={e => {
                                            if (quickLogForm.contactSearch.trim().length > 0 && quickLogContactResults.length === 0) {
                                                const ql = quickLogForm.contactSearch.toLowerCase();
                                                setQuickLogContactResults((contacts || []).filter(c =>
                                                    ((c.firstName || '') + ' ' + (c.lastName || '')).toLowerCase().includes(ql) ||
                                                    (c.company || '').toLowerCase().includes(ql)
                                                ).slice(0, 6));
                                            }
                                        }}
                                        placeholder="Search contacts…"
                                        style={{ width: '100%', fontSize: '0.75rem', border: '1px solid ' + (quickLogForm.contactId ? '#10b981' : '#e2e8f0'), borderRadius: '6px', padding: '0.35rem 1.75rem 0.35rem 0.5rem', background: quickLogForm.contactId ? '#f0fdf4' : '#f8fafc', color: '#1e293b', fontFamily: 'inherit', outline: 'none' }}
                                    />
                                    {quickLogForm.contactId ? (
                                        <button onClick={() => { setQuickLogForm(f => ({ ...f, contactId: '', contactSearch: '' })); setQuickLogContactResults([]); }}
                                            style={{ position: 'absolute', right: '0.375rem', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '0.875rem', lineHeight: 1, padding: '0.1rem' }}>×</button>
                                    ) : quickLogForm.contactSearch.length > 0 ? (
                                        <button onClick={() => { setQuickLogForm(f => ({ ...f, contactSearch: '' })); setQuickLogContactResults([]); }}
                                            style={{ position: 'absolute', right: '0.375rem', background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', fontSize: '0.875rem', lineHeight: 1, padding: '0.1rem' }}>×</button>
                                    ) : (
                                        <span style={{ position: 'absolute', right: '0.5rem', color: '#cbd5e1', fontSize: '0.7rem', pointerEvents: 'none' }}>👤</span>
                                    )}
                                </div>
                                {/* Dropdown results */}
                                {quickLogContactResults.length > 0 && !quickLogForm.contactId && (
                                    <div style={{ position: 'absolute', top: 'calc(100% + 2px)', left: 0, right: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 10, overflow: 'hidden' }}>
                                        {quickLogContactResults.map((c, idx) => {
                                            const fullName = [c.firstName, c.lastName].filter(Boolean).join(' ');
                                            const sub = [c.title, c.company].filter(Boolean).join(' · ');
                                            return (
                                                <div key={c.id}
                                                    onClick={() => {
                                                        setQuickLogForm(f => ({ ...f, contactId: c.id, contactSearch: fullName }));
                                                        setQuickLogContactResults([]);
                                                    }}
                                                    style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', borderBottom: idx < quickLogContactResults.length - 1 ? '1px solid #f1f5f9' : 'none', background: '#fff' }}
                                                    onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                                                    onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                                                    <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#1e293b' }}>{fullName || '—'}</div>
                                                    {sub && <div style={{ fontSize: '0.6875rem', color: '#94a3b8', marginTop: '0.1rem' }}>{sub}</div>}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                                {/* No results hint */}
                                {quickLogForm.contactSearch.length > 1 && quickLogContactResults.length === 0 && !quickLogForm.contactId && (
                                    <div style={{ position: 'absolute', top: 'calc(100% + 2px)', left: 0, right: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.5rem 0.75rem', fontSize: '0.75rem', color: '#94a3b8', zIndex: 10 }}>
                                        No contacts found
                                    </div>
                                )}
                            </div>

                            {/* Link to deal */}
                            <div>
                                <div style={{ fontSize: '0.625rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Deal</div>
                                <select value={quickLogForm.opportunityId} onChange={e => setQuickLogForm(f => ({ ...f, opportunityId: e.target.value }))}
                                    style={{ width: '100%', fontSize: '0.75rem', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '0.35rem 0.5rem', background: '#f8fafc', color: '#1e293b', fontFamily: 'inherit' }}>
                                    <option value="">— Link to deal (optional) —</option>
                                    {(visibleOpportunities || []).filter(o => o.stage !== 'Closed Won' && o.stage !== 'Closed Lost').map(o => <option key={o.id} value={o.id}>{o.opportunityName || o.account}</option>)}
                                </select>
                            </div>

                            {/* Notes */}
                            <textarea value={quickLogForm.notes} onChange={e => setQuickLogForm(f => ({ ...f, notes: e.target.value }))}
                                placeholder="Notes…" rows={2}
                                style={{ fontSize: '0.75rem', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '0.35rem 0.5rem', background: '#f8fafc', color: '#1e293b', fontFamily: 'inherit', resize: 'none' }} />

                            {/* Add to Calendar */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.375rem 0', borderTop: '1px solid #f1f5f9' }}>
                                <input
                                    type="checkbox"
                                    id="quickLogCal"
                                    checked={!!quickLogForm.addToCalendar}
                                    onChange={e => setQuickLogForm(f => ({ ...f, addToCalendar: e.target.checked }))}
                                    style={{ width: '14px', height: '14px', accentColor: '#2563eb', cursor: 'pointer', flexShrink: 0 }}
                                />
                                <label htmlFor="quickLogCal" style={{ fontSize: '0.6875rem', fontWeight: '600', color: '#475569', cursor: 'pointer', userSelect: 'none' }}>
                                    📅 Add to Google Calendar
                                </label>
                            </div>

                            {/* Actions */}
                            <div style={{ display: 'flex', gap: '0.375rem' }}>
                                <button onClick={() => { setQuickLogOpen(false); setQuickLogForm({ type: 'Call', notes: '', opportunityId: '', contactId: '', contactSearch: '', addToCalendar: false }); setQuickLogContactResults([]); }}
                                    style={{ flex: 1, padding: '0.35rem', borderRadius: '6px', border: '1px solid #e2e8f0', background: '#f8fafc', color: '#64748b', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>
                                    Cancel
                                </button>
                                <button onClick={() => {
                                    const linkedOpp = quickLogForm.opportunityId ? (opportunities || []).find(o => o.id === quickLogForm.opportunityId) : null;
                                    handleSaveActivity({
                                        type: quickLogForm.type,
                                        notes: quickLogForm.notes,
                                        date: [new Date().getFullYear(), String(new Date().getMonth()+1).padStart(2,'0'), String(new Date().getDate()).padStart(2,'0')].join('-'),
                                        opportunityId: quickLogForm.opportunityId || null,
                                        opportunityName: linkedOpp?.opportunityName || linkedOpp?.account || '',
                                        companyName: linkedOpp?.account || '',
                                        contactId: quickLogForm.contactId || null,
                                        contactName: quickLogForm.contactSearch || '',
                                        salesRep: currentUser,
                                        addToCalendar: !!quickLogForm.addToCalendar,
                                    }, { editingActivity: null, currentUser, opportunities, setShowActivityModal, setFollowUpPrompt, setQuickLogOpen, setQuickLogForm, setQuickLogContactResults });
                                }} style={{ flex: 1, padding: '0.35rem', borderRadius: '6px', border: 'none', background: '#2563eb', color: '#fff', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>
                                    Save
                                </button>
                            </div>
                        </div>
                    )}
                    <button onClick={() => setQuickLogOpen(v => !v)}
                        style={{ width: '52px', height: '52px', borderRadius: '50%', background: quickLogOpen ? '#1d4ed8' : 'linear-gradient(135deg,#2563eb,#7c3aed)', color: '#fff', border: 'none', boxShadow: '0 4px 20px rgba(37,99,235,0.5)', fontSize: '1.375rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s', lineHeight: '1' }}
                        title="Quick-log an activity">
                        {quickLogOpen ? '✕' : '⚡'}
                    </button>
                </div>
            )}

            {/* ════ FOLLOW-UP TASK PROMPT (persists across tabs) ════ */}
            {followUpPrompt && (
                <div style={{ position: 'fixed', bottom: '5.5rem', right: '1.5rem', zIndex: 9991, background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.16)', padding: '1rem', width: '260px' }}
                    onClick={e => e.stopPropagation()}>
                    <div style={{ fontSize: '0.8125rem', fontWeight: '700', color: '#0f172a', marginBottom: '0.375rem' }}>✅ Activity logged!</div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '0.75rem' }}>Create a follow-up task for <strong>{followUpPrompt.opportunityName}</strong>?</div>
                    <div style={{ display: 'flex', gap: '0.375rem' }}>
                        <button onClick={() => setFollowUpPrompt(null)}
                            style={{ flex: 1, padding: '0.35rem', borderRadius: '6px', border: '1px solid #e2e8f0', background: '#f8fafc', color: '#64748b', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>
                            Skip
                        </button>
                        <button onClick={() => {
                            setEditingTask({ relatedTo: followUpPrompt.opportunityId, opportunityId: followUpPrompt.opportunityId, type: 'Follow-up', dueDate: new Date(Date.now() + 86400000).toISOString().split('T')[0] });
                            setShowTaskModal(true);
                            setFollowUpPrompt(null);
                        }} style={{ flex: 1, padding: '0.35rem', borderRadius: '6px', border: 'none', background: '#2563eb', color: '#fff', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>
                            + Add Task
                        </button>
                    </div>
                </div>
            )}

        </div>
        </AppProvider>
    );
}

// CSV Import Modal with Field Mapping

export default App;
// build Wed, Mar  4, 2026  2:57:23 PM
