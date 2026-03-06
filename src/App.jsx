import React, { useState, useEffect, useRef } from 'react';
import { useUser, useClerk, useAuth, SignIn } from '@clerk/clerk-react';
import { safeStorage, dbFetch } from './utils/storage';
import { initialOpportunities, stages, productOptions } from './utils/constants';
import CsvImportModal from './components/modals/CsvImportModal';
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
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center' }}>
            <div style={{ background:'#fff', borderRadius:'12px', padding:'1.5rem', width:'480px', maxHeight:'90vh', overflowY:'auto', boxShadow:'0 20px 60px rgba(0,0,0,0.2)' }}>
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


function LeadsTab({ leads, setLeads, settings, currentUser, canSeeAll, setEditingOpp, setShowModal }) {
    const stageColors = { 'New':'#94a3b8','Contacted':'#0ea5e9','Qualified':'#8b5cf6','Working':'#f59e0b','Converted':'#10b981','Dead':'#ef4444' };
    const scoreBg = s => s >= 70 ? '#fee2e2' : s >= 40 ? '#fef3c7' : '#dbeafe';
    const scoreColor = s => s >= 70 ? '#dc2626' : s >= 40 ? '#d97706' : '#2563eb';
    const statusStyle = { New:{bg:'#eff6ff',color:'#2563eb'}, Contacted:{bg:'#f0fdf4',color:'#16a34a'}, Qualified:{bg:'#fdf4ff',color:'#9333ea'}, Working:{bg:'#fff7ed',color:'#ea580c'}, Converted:{bg:'#d1fae5',color:'#047857'}, Dead:{bg:'#f1f5f9',color:'#94a3b8'} };

    // Role-based filtering
    const visibleLeads = canSeeAll
        ? leads
        : leads.filter(l => !l.assignedTo || l.assignedTo === currentUser);

    const reps = (settings.users || []).filter(u => u.role === 'Rep' || u.role === 'User');
    const allReps = (settings.users || []).filter(u => u.name);

    // Local state via ref trick — use window globals scoped to leads tab
    const [leadFilter, setLeadFilter] = React.useState('all');
    const [leadView, setLeadView] = React.useState('list');
    const [leadKanbanOpen, setLeadKanbanOpen] = React.useState(true);
    const [selectedLeads, setSelectedLeads] = React.useState([]);
    const [assignTarget, setAssignTarget] = React.useState('');
    const [newLead, setNewLead] = React.useState(null);
    const [editingLead, setEditingLead] = React.useState(null);

    const filtered = visibleLeads.filter(l => {
        if (leadFilter === 'all') return true;
        if (leadFilter === 'hot') return (l.score || 0) >= 70;
        if (leadFilter === 'unassigned') return !l.assignedTo;
        return l.status === leadFilter;
    });

    const counts = {
        all: visibleLeads.length,
        hot: visibleLeads.filter(l => (l.score||0) >= 70).length,
        New: visibleLeads.filter(l => l.status === 'New').length,
        Working: visibleLeads.filter(l => l.status === 'Working').length,
        unassigned: canSeeAll ? visibleLeads.filter(l => !l.assignedTo).length : 0,
        Converted: visibleLeads.filter(l => l.status === 'Converted').length,
    };

    const totalARR = visibleLeads.reduce((s, l) => s + (l.estimatedARR || 0), 0);
    const convRate = visibleLeads.length ? Math.round((counts.Converted / visibleLeads.length) * 100) : 0;

    const saveLead = async (lead) => {
        const isNew = !lead.id;
        const saved = isNew
            ? { ...lead, id: 'lead_' + Date.now(), createdAt: new Date().toISOString(), status: lead.status || 'New' }
            : lead;
        setLeads(prev => isNew ? [...prev, saved] : prev.map(l => l.id === saved.id ? saved : l));
        await dbFetch('/.netlify/functions/leads', { method: isNew ? 'POST' : 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(saved) }).catch(console.error);
        setNewLead(null); setEditingLead(null);
    };

    const deleteLead = async (id) => {
        setLeads(prev => prev.filter(l => l.id !== id));
        await dbFetch('/.netlify/functions/leads?id=' + id, { method: 'DELETE' }).catch(console.error);
    };

    const convertLead = (lead) => {
        // Mark lead converted and open new opportunity modal pre-filled
        const updated = { ...lead, status: 'Converted', convertedAt: new Date().toISOString() };
        saveLead(updated);
        const prefill = { account: lead.company, opportunityName: lead.company + ' — ' + (lead.source || 'Lead'), salesRep: lead.assignedTo || currentUser, notes: lead.notes || '' };
        setEditingOpp(prefill);
        setShowModal(true);
    };

    const bulkAssign = async () => {
        if (!assignTarget || selectedLeads.length === 0) return;
        const updated = leads.map(l => selectedLeads.includes(l.id) ? { ...l, assignedTo: assignTarget } : l);
        setLeads(updated);
        for (const l of updated.filter(l => selectedLeads.includes(l.id))) {
            await dbFetch('/.netlify/functions/leads', { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(l) }).catch(console.error);
        }
        setSelectedLeads([]); setAssignTarget('');
    };

    const repLoad = allReps.map(rep => ({
        ...rep,
        count: visibleLeads.filter(l => l.assignedTo === rep.name && l.status !== 'Converted' && l.status !== 'Dead').length
    })).sort((a, b) => a.count - b.count);
    const maxLoad = Math.max(...repLoad.map(r => r.count), 1);

    const repColors = ['#2563eb','#7c3aed','#10b981','#f59e0b','#ef4444','#0ea5e9','#ec4899'];



    return (
        <div className="tab-page">
            {(newLead !== null) && <LeadForm lead={newLead} onSave={saveLead} onClose={() => setNewLead(null)} canSeeAll={canSeeAll} allReps={allReps} />}
            {editingLead && <LeadForm lead={editingLead} onSave={saveLead} onClose={() => setEditingLead(null)} canSeeAll={canSeeAll} allReps={allReps} />}

            {/* KPI ROW */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:'0.75rem', padding:'1rem 1.25rem 0' }}>
                {[
                    { label:'Total Leads', value: visibleLeads.length, sub: counts.New + ' new', accent:'#2563eb' },
                    { label:'Hot Leads', value: counts.hot, sub:'Score 70+', accent:'#ef4444' },
                    { label: canSeeAll ? 'Unassigned' : 'My Leads', value: canSeeAll ? counts.unassigned : visibleLeads.length, sub: canSeeAll ? 'Need distribution' : 'Assigned to you', accent:'#f59e0b' },
                    { label:'Converted', value: counts.Converted, sub: convRate + '% rate', accent:'#10b981' },
                    { label:'Est. Pipeline', value: '$' + (totalARR >= 1000000 ? (totalARR/1000000).toFixed(1)+'M' : Math.round(totalARR/1000)+'K'), sub:'from leads', accent:'#7c3aed' },
                ].map(kpi => (
                    <div key={kpi.label} style={{ background:'#fff', border:'1px solid #e2e8f0', borderLeft:'3px solid '+kpi.accent, borderRadius:'10px', padding:'0.875rem 1rem' }}>
                        <div style={{ fontSize:'0.6rem', fontWeight:'700', color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'0.3rem' }}>{kpi.label}</div>
                        <div style={{ fontSize:'1.4rem', fontWeight:'800', color:'#1e293b', lineHeight:1 }}>{kpi.value}</div>
                        <div style={{ fontSize:'0.6875rem', color:'#64748b', marginTop:'0.2rem' }}>{kpi.sub}</div>
                    </div>
                ))}
            </div>

            {/* MAIN LAYOUT */}
            <div style={{ display:'grid', gridTemplateColumns: canSeeAll ? '1fr 300px' : '1fr', gap:'1rem', padding:'1rem 1.25rem' }}>

                {/* LEFT: LEAD LIST */}
                <div>
                    <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:'12px', overflow:'hidden' }}>
                        {/* TOOLBAR */}
                        <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', padding:'0.625rem 1rem', borderBottom:'1px solid #e2e8f0', flexWrap:'wrap' }}>
                            <span style={{ fontSize:'0.75rem', fontWeight:'800', color:'#0f172a', marginRight:'0.25rem' }}>Leads</span>
                            <div style={{ width:'1px', height:'16px', background:'#e2e8f0' }}></div>
                            {[
                                { key:'all', label:'All', count: counts.all },
                                { key:'hot', label:'🔥 Hot', count: counts.hot },
                                { key:'New', label:'New', count: counts.New },
                                { key:'Working', label:'Working', count: counts.Working },
                                ...(canSeeAll ? [{ key:'unassigned', label:'Unassigned', count: counts.unassigned }] : []),
                            ].map(f => (
                                <button key={f.key} onClick={() => setLeadFilter(f.key)} style={{ padding:'0.2rem 0.6rem', borderRadius:'999px', border:'1px solid '+(leadFilter===f.key?'#2563eb':'#e2e8f0'), background:leadFilter===f.key?'#2563eb':'#f8fafc', color:leadFilter===f.key?'#fff':'#64748b', fontSize:'0.6875rem', fontWeight:'600', cursor:'pointer', fontFamily:'inherit' }}>
                                    {f.label} <span style={{ opacity:0.75 }}>{f.count}</span>
                                </button>
                            ))}
                            <div style={{ marginLeft:'auto', display:'flex', gap:'0.5rem', alignItems:'center' }}>
                                <button onClick={() => setNewLead({})} style={{ padding:'0.3rem 0.75rem', border:'none', borderRadius:'6px', background:'#2563eb', color:'#fff', fontSize:'0.6875rem', fontWeight:'700', cursor:'pointer', fontFamily:'inherit' }}>+ New Lead</button>
                            </div>
                        </div>

                        {/* LIST VIEW */}
                        <div style={{ overflowX:'auto' }}>
                                <table style={{ width:'100%', borderCollapse:'collapse' }}>
                                    <thead>
                                        <tr>
                                            {canSeeAll && <th style={{ padding:'0.5rem 0.75rem', textAlign:'left', fontSize:'0.6rem', fontWeight:'700', color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.06em', background:'#f8fafc', borderBottom:'1px solid #e2e8f0', width:'36px' }}><input type="checkbox" style={{ width:'14px', height:'14px', accentColor:'#2563eb' }} onChange={e => setSelectedLeads(e.target.checked ? filtered.map(l=>l.id) : [])} /></th>}
                                            {['Score','Name / Company','Source','Status', ...(canSeeAll?['Assigned To']:[]), 'Est. ARR','Actions'].map(h => (
                                                <th key={h} style={{ padding:'0.5rem 0.75rem', textAlign:'left', fontSize:'0.6rem', fontWeight:'700', color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.06em', background:'#f8fafc', borderBottom:'1px solid #e2e8f0', whiteSpace:'nowrap' }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filtered.length === 0 && (
                                            <tr><td colSpan={99} style={{ textAlign:'center', padding:'2rem', color:'#94a3b8', fontSize:'0.875rem' }}>No leads found</td></tr>
                                        )}
                                        {filtered.map(lead => {
                                            const sc = lead.score || 0;
                                            const st = lead.status || 'New';
                                            const ss = statusStyle[st] || statusStyle.New;
                                            const isUnassigned = !lead.assignedTo;
                                            return (
                                                <tr key={lead.id} style={{ background: isUnassigned && canSeeAll ? '#fffbeb' : 'transparent' }}
                                                    onMouseEnter={e => e.currentTarget.style.background = isUnassigned && canSeeAll ? '#fef9c3' : '#f8fafc'}
                                                    onMouseLeave={e => e.currentTarget.style.background = isUnassigned && canSeeAll ? '#fffbeb' : 'transparent'}>
                                                    {canSeeAll && <td style={{ padding:'0.625rem 0.75rem', borderBottom:'1px solid #f1f5f9' }}><input type="checkbox" style={{ width:'14px', height:'14px', accentColor:'#2563eb' }} checked={selectedLeads.includes(lead.id)} onChange={e => setSelectedLeads(prev => e.target.checked ? [...prev, lead.id] : prev.filter(i=>i!==lead.id))} /></td>}
                                                    <td style={{ padding:'0.625rem 0.75rem', borderBottom:'1px solid #f1f5f9' }}>
                                                        <div style={{ width:'32px', height:'32px', borderRadius:'50%', background:scoreBg(sc), color:scoreColor(sc), display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.6875rem', fontWeight:'800' }}>{sc}</div>
                                                    </td>
                                                    <td style={{ padding:'0.625rem 0.75rem', borderBottom:'1px solid #f1f5f9' }}>
                                                        <div style={{ fontWeight:'600', color:'#1e293b', fontSize:'0.8125rem' }}>{[lead.firstName, lead.lastName].filter(Boolean).join(' ') || '—'}</div>
                                                        <div style={{ fontSize:'0.75rem', color:'#64748b' }}>{[lead.company, lead.title].filter(Boolean).join(' · ') || '—'}</div>
                                                    </td>
                                                    <td style={{ padding:'0.625rem 0.75rem', borderBottom:'1px solid #f1f5f9' }}>
                                                        <span style={{ padding:'0.1rem 0.4rem', borderRadius:'4px', fontSize:'0.6rem', fontWeight:'700', background:'#f1f5f9', color:'#64748b' }}>{lead.source || '—'}</span>
                                                    </td>
                                                    <td style={{ padding:'0.625rem 0.75rem', borderBottom:'1px solid #f1f5f9' }}>
                                                        <span style={{ padding:'0.15rem 0.5rem', borderRadius:'999px', fontSize:'0.625rem', fontWeight:'700', textTransform:'uppercase', letterSpacing:'0.05em', background:ss.bg, color:ss.color }}>{st}</span>
                                                    </td>
                                                    {canSeeAll && (
                                                        <td style={{ padding:'0.625rem 0.75rem', borderBottom:'1px solid #f1f5f9' }}>
                                                            {lead.assignedTo ? (
                                                                <div style={{ display:'flex', alignItems:'center', gap:'0.375rem' }}>
                                                                    <div style={{ width:'22px', height:'22px', borderRadius:'50%', background:'#2563eb', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.55rem', fontWeight:'800', color:'#fff' }}>{lead.assignedTo.slice(0,2).toUpperCase()}</div>
                                                                    <span style={{ fontSize:'0.75rem', color:'#475569' }}>{lead.assignedTo}</span>
                                                                </div>
                                                            ) : (
                                                                <button onClick={() => setEditingLead(lead)} style={{ padding:'0.15rem 0.5rem', border:'1px solid #f59e0b', borderRadius:'4px', background:'none', color:'#d97706', fontSize:'0.625rem', fontWeight:'700', cursor:'pointer', fontFamily:'inherit' }}>⚡ Assign</button>
                                                            )}
                                                        </td>
                                                    )}
                                                    <td style={{ padding:'0.625rem 0.75rem', borderBottom:'1px solid #f1f5f9', fontSize:'0.75rem', fontWeight:'700', color:'#2563eb' }}>
                                                        {lead.estimatedARR ? '$' + (lead.estimatedARR >= 1000 ? Math.round(lead.estimatedARR/1000)+'K' : lead.estimatedARR) : '—'}
                                                    </td>
                                                    <td style={{ padding:'0.625rem 0.75rem', borderBottom:'1px solid #f1f5f9' }}>
                                                        <div style={{ display:'flex', gap:'0.3rem' }}>
                                                            <button onClick={() => setEditingLead(lead)} style={{ padding:'0.15rem 0.5rem', border:'1px solid #e2e8f0', borderRadius:'4px', background:'#fff', fontSize:'0.6rem', fontWeight:'700', cursor:'pointer', color:'#475569', fontFamily:'inherit' }}>Edit</button>
                                                            {lead.status !== 'Converted' && (
                                                                <button onClick={() => convertLead(lead)} style={{ padding:'0.15rem 0.5rem', border:'1px solid #10b981', borderRadius:'4px', background:'none', fontSize:'0.6rem', fontWeight:'700', cursor:'pointer', color:'#10b981', fontFamily:'inherit' }}>→ Opp</button>
                                                            )}
                                                            <button onClick={() => deleteLead(lead.id)} style={{ padding:'0.15rem 0.5rem', border:'1px solid #fecaca', borderRadius:'4px', background:'none', fontSize:'0.6rem', fontWeight:'700', cursor:'pointer', color:'#ef4444', fontFamily:'inherit' }}>Del</button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                        </div>

                        {/* KANBAN VIEW - always visible below list */}
                        <div style={{ borderTop:'1px solid #e2e8f0' }}>
                            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0.625rem 1rem', background:'#f8fafc', cursor:'pointer' }} onClick={() => setLeadKanbanOpen(o => !o)}>
                                <span style={{ fontSize:'0.6875rem', fontWeight:'800', color:'#475569', textTransform:'uppercase', letterSpacing:'0.06em' }}>🗂 Kanban View</span>
                                <span style={{ fontSize:'0.75rem', color:'#94a3b8' }}>{leadKanbanOpen ? '▲' : '▼'}</span>
                            </div>
                            {leadKanbanOpen && (
                            <div style={{ overflowX:'auto', padding:'0.75rem' }}>
                                <div style={{ display:'flex', gap:'0.625rem', minWidth:'max-content' }}>
                                    {Object.entries(stageColors).map(([stage, color]) => {
                                        const colLeads = filtered.filter(l => (l.status || 'New') === stage);
                                        return (
                                            <div key={stage} style={{ width:'190px', flexShrink:0, background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:'10px', overflow:'hidden' }}>
                                                <div style={{ padding:'0.5rem 0.75rem', borderTop:'3px solid '+color, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                                                    <span style={{ fontSize:'0.6875rem', fontWeight:'800', color:'#475569', textTransform:'uppercase', letterSpacing:'0.04em' }}>{stage}</span>
                                                    <span style={{ fontSize:'0.6rem', fontWeight:'700', background:'#e2e8f0', color:'#64748b', borderRadius:'10px', padding:'0.1rem 0.35rem' }}>{colLeads.length}</span>
                                                </div>
                                                <div style={{ padding:'0.5rem', display:'flex', flexDirection:'column', gap:'0.375rem', minHeight:'60px' }}>
                                                    {colLeads.map(lead => (
                                                        <div key={lead.id} onClick={() => setEditingLead(lead)} style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:'6px', padding:'0.5rem 0.625rem', cursor:'pointer', transition:'all 0.1s' }}
                                                            onMouseEnter={e => { e.currentTarget.style.borderColor='#2563eb'; e.currentTarget.style.boxShadow='0 2px 8px rgba(37,99,235,0.1)'; }}
                                                            onMouseLeave={e => { e.currentTarget.style.borderColor='#e2e8f0'; e.currentTarget.style.boxShadow='none'; }}>
                                                            <div style={{ fontSize:'0.75rem', fontWeight:'600', color:'#1e293b', marginBottom:'0.15rem' }}>{[lead.firstName, lead.lastName].filter(Boolean).join(' ') || lead.company || '—'}</div>
                                                            <div style={{ fontSize:'0.625rem', color:'#64748b', marginBottom:'0.25rem' }}>{lead.company || '—'}</div>
                                                            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                                                                <span style={{ fontSize:'0.6rem', background:'#f1f5f9', color:'#64748b', padding:'0.1rem 0.3rem', borderRadius:'3px', fontWeight:'600' }}>{lead.source || '—'}</span>
                                                                <div style={{ width:'20px', height:'20px', borderRadius:'50%', background:scoreBg(lead.score||0), color:scoreColor(lead.score||0), display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.5rem', fontWeight:'800' }}>{lead.score||0}</div>
                                                            </div>
                                                            {canSeeAll && lead.assignedTo && <div style={{ fontSize:'0.6rem', color:'#94a3b8', marginTop:'0.2rem' }}>{lead.assignedTo}</div>}
                                                        </div>
                                                    ))}
                                                    {colLeads.length === 0 && <div style={{ fontSize:'0.6875rem', color:'#cbd5e1', textAlign:'center', padding:'0.75rem 0', fontStyle:'italic' }}>Empty</div>}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                            )}
                        </div>

                        {/* BULK ACTION BAR */}
                        {canSeeAll && selectedLeads.length > 0 && (
                            <div style={{ display:'flex', alignItems:'center', gap:'0.75rem', padding:'0.625rem 1rem', background:'#eff6ff', borderTop:'1px solid #bfdbfe' }}>
                                <span style={{ fontSize:'0.8125rem', fontWeight:'700', color:'#1d4ed8' }}>{selectedLeads.length} selected</span>
                                <div style={{ width:'1px', height:'16px', background:'#bfdbfe' }}></div>
                                <span style={{ fontSize:'0.75rem', color:'#64748b', fontWeight:'600' }}>Assign to:</span>
                                <select value={assignTarget} onChange={e => setAssignTarget(e.target.value)} style={{ fontSize:'0.75rem', border:'1px solid #bfdbfe', borderRadius:'6px', padding:'0.2rem 0.5rem', background:'#fff', color:'#1e293b', fontFamily:'inherit' }}>
                                    <option value="">— pick rep —</option>
                                    {allReps.map(r => <option key={r.name} value={r.name}>{r.name}</option>)}
                                </select>
                                <button onClick={bulkAssign} style={{ padding:'0.25rem 0.625rem', border:'none', borderRadius:'6px', background:'#2563eb', color:'#fff', fontSize:'0.6875rem', fontWeight:'700', cursor:'pointer', fontFamily:'inherit' }}>Assign</button>
                                <button onClick={() => { setSelectedLeads([]); setAssignTarget(''); }} style={{ marginLeft:'auto', background:'none', border:'none', color:'#64748b', fontSize:'0.75rem', cursor:'pointer', fontWeight:'600', fontFamily:'inherit' }}>Clear ✕</button>
                            </div>
                        )}
                    </div>
                </div>

                {/* RIGHT PANEL — managers/admins only */}
                {canSeeAll && (
                    <div style={{ display:'flex', flexDirection:'column', gap:'0.75rem' }}>

                        {/* DISTRIBUTE */}
                        <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:'12px', overflow:'hidden' }}>
                            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0.625rem 1rem', borderBottom:'1px solid #e2e8f0' }}>
                                <span style={{ fontSize:'0.6875rem', fontWeight:'800', color:'#0f172a', textTransform:'uppercase', letterSpacing:'0.06em' }}>⚡ Distribute Leads</span>
                                {counts.unassigned > 0 && <span style={{ fontSize:'0.6875rem', color:'#ef4444', fontWeight:'700', background:'#fee2e2', padding:'0.1rem 0.4rem', borderRadius:'4px' }}>{counts.unassigned} unassigned</span>}
                            </div>
                            {repLoad.length === 0 && <div style={{ padding:'1rem', fontSize:'0.8125rem', color:'#94a3b8', textAlign:'center' }}>No reps configured</div>}
                            {repLoad.map((rep, idx) => (
                                <div key={rep.name} style={{ display:'flex', alignItems:'center', gap:'0.625rem', padding:'0.5rem 1rem', borderBottom:'1px solid #f1f5f9' }}>
                                    <div style={{ width:'28px', height:'28px', borderRadius:'50%', background:repColors[idx % repColors.length], display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.6875rem', fontWeight:'800', color:'#fff', flexShrink:0 }}>{rep.name.slice(0,2).toUpperCase()}</div>
                                    <div style={{ flex:1, minWidth:0 }}>
                                        <div style={{ fontSize:'0.8125rem', fontWeight:'600', color:'#1e293b' }}>{rep.name}</div>
                                        <div style={{ height:'4px', background:'#f1f5f9', borderRadius:'2px', marginTop:'0.25rem' }}>
                                            <div style={{ height:'4px', borderRadius:'2px', background:'linear-gradient(to right,#2563eb,#7c3aed)', width: Math.round((rep.count / maxLoad) * 100) + '%', transition:'width 0.3s' }}></div>
                                        </div>
                                    </div>
                                    <span style={{ fontSize:'0.75rem', fontWeight:'700', color:'#2563eb', background:'#eff6ff', padding:'0.1rem 0.4rem', borderRadius:'4px', flexShrink:0 }}>{rep.count}</span>
                                </div>
                            ))}
                            <div style={{ padding:'0.75rem 1rem', borderTop:'1px solid #f1f5f9', display:'flex', gap:'0.5rem' }}>
                                <button onClick={() => {
                                    const unassigned = leads.filter(l => !l.assignedTo && l.status !== 'Converted' && l.status !== 'Dead');
                                    if (unassigned.length === 0 || repLoad.length === 0) return;
                                    const updated = [...leads];
                                    unassigned.forEach((lead, i) => {
                                        const rep = repLoad[i % repLoad.length];
                                        const idx = updated.findIndex(l => l.id === lead.id);
                                        if (idx >= 0) updated[idx] = { ...updated[idx], assignedTo: rep.name };
                                    });
                                    setLeads(updated);
                                    updated.filter(l => !leads.find(ol => ol.id === l.id && ol.assignedTo === l.assignedTo)).forEach(l => dbFetch('/.netlify/functions/leads', { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(l) }).catch(console.error));
                                }} style={{ flex:1, padding:'0.4rem 0', border:'none', borderRadius:'6px', background:'#2563eb', color:'#fff', fontSize:'0.6875rem', fontWeight:'700', cursor:'pointer', fontFamily:'inherit' }}>⚡ Auto-assign All</button>
                            </div>
                        </div>

                        {/* SOURCE BREAKDOWN */}
                        <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:'12px', overflow:'hidden' }}>
                            <div style={{ padding:'0.625rem 1rem', borderBottom:'1px solid #e2e8f0' }}>
                                <span style={{ fontSize:'0.6875rem', fontWeight:'800', color:'#0f172a', textTransform:'uppercase', letterSpacing:'0.06em' }}>Lead Sources</span>
                            </div>
                            {(() => {
                                const sourceCounts = {};
                                visibleLeads.forEach(l => { const s = l.source || 'Other'; sourceCounts[s] = (sourceCounts[s]||0) + 1; });
                                const total = visibleLeads.length || 1;
                                const srcColors = ['#2563eb','#7c3aed','#0ea5e9','#f59e0b','#10b981','#ef4444','#94a3b8'];
                                return Object.entries(sourceCounts).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([src, cnt], i) => (
                                    <div key={src} style={{ display:'flex', alignItems:'center', gap:'0.5rem', padding:'0.375rem 1rem' }}>
                                        <div style={{ width:'8px', height:'8px', borderRadius:'50%', background:srcColors[i%srcColors.length], flexShrink:0 }}></div>
                                        <span style={{ fontSize:'0.75rem', color:'#475569', flex:1 }}>{src}</span>
                                        <div style={{ flex:2, height:'4px', background:'#f1f5f9', borderRadius:'2px' }}>
                                            <div style={{ height:'4px', borderRadius:'2px', background:srcColors[i%srcColors.length], width:Math.round((cnt/total)*100)+'%' }}></div>
                                        </div>
                                        <span style={{ fontSize:'0.75rem', fontWeight:'700', color:'#1e293b' }}>{Math.round((cnt/total)*100)}%</span>
                                    </div>
                                ));
                            })()}
                            {visibleLeads.length === 0 && <div style={{ padding:'1rem', fontSize:'0.8125rem', color:'#94a3b8', textAlign:'center' }}>No lead data yet</div>}
                        </div>

                    </div>
                )}
            </div>
        </div>
    );
}


function FunnelView({ stages, pipelineFilteredOpps, funnelExpandedStage, setFunnelExpandedStage, settings, handleEdit, handleDelete }) {
    const stageColors = ['#6366f1','#8b5cf6','#0ea5e9','#f59e0b','#f97316','#10b981','#16a34a','#ef4444'];
    return (
        <div style={{ padding: '1.25rem 1.5rem' }}>
            {stages.map((stage, idx) => {
                const stageOpps = pipelineFilteredOpps.filter(o => o.stage === stage);
                const stageARR = stageOpps.reduce((s, o) => s + (o.arr || 0), 0);
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
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto auto auto', padding: '0.375rem 0.75rem', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em', gap: '0.5rem' }}>
                                    <span>Opportunity</span><span>Account</span><span style={{ textAlign: 'right' }}>ARR</span><span>Close</span><span>Actions</span>
                                </div>
                                {stageOpps.map(opp => (
                                    <div key={opp.id}
                                        style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto auto auto', padding: '0.5rem 0.75rem', borderBottom: '1px solid #f1f5f9', fontSize: '0.8125rem', alignItems: 'center', gap: '0.5rem' }}
                                        onMouseEnter={e => { e.currentTarget.style.background = '#f8fafc'; }}
                                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                                        <span style={{ fontWeight: '600', color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{opp.opportunityName || opp.account}</span>
                                        <span style={{ color: '#64748b', fontSize: '0.75rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{opp.account}</span>
                                        <span style={{ fontWeight: '700', color: '#2563eb', fontSize: '0.75rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{Math.round((opp.arr||0)/1000)}K</span>
                                        <span style={{ color: '#94a3b8', fontSize: '0.6875rem', whiteSpace: 'nowrap' }}>{opp.forecastedCloseDate || '-'}</span>
                                        <div style={{ display: 'flex', gap: '0.375rem' }}>
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

function KanbanView({ stages, pipelineFilteredOpps, kanbanDragging, kanbanDragOver, setKanbanDragging, setKanbanDragOver, opportunities, setOpportunities, currentUser, calculateDealHealth, handleEdit, handleDelete }) {
    const stageColors = ['#6366f1','#8b5cf6','#0ea5e9','#f59e0b','#f97316','#10b981','#16a34a','#ef4444'];

    const handleKanbanDrop = (toStage) => {
        if (!kanbanDragging || kanbanDragging.fromStage === toStage) {
            setKanbanDragging(null); setKanbanDragOver(null); return;
        }
        const today = new Date().toISOString().split('T')[0];
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
        <div style={{ overflowX: 'auto', padding: '1rem 1.25rem 1.5rem' }}>
            <div style={{ display: 'flex', gap: '0.75rem', minWidth: 'max-content' }}>
                {stages.filter(s => s !== 'Closed Lost').map((stage, idx) => {
                    const color = stageColors[idx % stageColors.length];
                    const colOpps = pipelineFilteredOpps.filter(o => o.stage === stage);
                    const colARR = colOpps.reduce((s, o) => s + (o.arr||0), 0);
                    const isDragOver = kanbanDragOver === stage;
                    return (
                        <div key={stage}
                            onDragOver={e => { e.preventDefault(); setKanbanDragOver(stage); }}
                            onDragLeave={e => { setKanbanDragOver(null); }}
                            onDrop={() => handleKanbanDrop(stage)}
                            style={{ width: '200px', flexShrink: 0, background: isDragOver ? '#eff6ff' : '#f8fafc', border: isDragOver ? '1px solid #93c5fd' : '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden', transition: 'all 0.15s' }}>
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
                                                <span style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#2563eb' }}>{Math.round((opp.arr||0)/1000)}K</span>
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

function App() {
    // Clerk auth — powered by @clerk/clerk-react
    const { user: clerkUser, isLoaded: clerkLoaded } = useUser();
    const { signOut } = useClerk();
    const { getToken } = useAuth();

    // Make getToken available to dbFetch utility
    useEffect(() => {
        window.__getClerkToken = getToken;
    }, [getToken]);
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
    const [opportunities, setOpportunities] = useState([]);
    const [accounts, setAccounts] = useState([]);
    const [tasks, setTasks] = useState([]);
    const [contacts, setContacts] = useState([]);
    const [leads, setLeads] = React.useState([]);
    const [settings, setSettings] = useState(() => {
        try {
            const saved = safeStorage.getItem('salesSettings');
            if (saved) {
                try { return JSON.parse(saved); } catch(e) {}
            }
        } catch(e) {}
        return {
            fiscalYearStart: 10,
            users: [],
            logoUrl: '',
            taskTypes: ['Call', 'Meeting', 'Email'],
            // auditLog moved to dedicated audit_log DB table
            quotaData: {
                type: 'annual',
                annualQuota: 0,
                q1Quota: 0, q2Quota: 0, q3Quota: 0, q4Quota: 0,
                commissionTiers: [
                    { id: '1', minPercent: 0, maxPercent: 50, rate: 5, label: '0-50%' },
                    { id: '2', minPercent: 50, maxPercent: 100, rate: 8, label: '50-100%' },
                    { id: '3', minPercent: 100, maxPercent: 120, rate: 10, label: '100-120%' },
                    { id: '4', minPercent: 120, maxPercent: 999, rate: 15, label: '120%+' }
                ]
            },
            pipelines: [
                { id: 'default', name: 'New Business', color: '#2563eb' }
            ],
            painPoints: ['High Turnover', 'Scheduling Complexity', 'Compliance Issues', 'Manual Processes', 'Poor Visibility', 'Budget Constraints', 'Integration Challenges'],
            verticalMarkets: ['Manufacturing', 'Healthcare', 'Energy & Utilities', 'Oil & Gas', 'Transportation', 'Government', 'Retail', 'Hospitality', 'Construction', 'Mining'],
            funnelStages: [
                { name: 'Qualification', weight: 10 },
                { name: 'Discovery', weight: 20 },
                { name: 'Evaluation (Demo)', weight: 40 },
                { name: 'Proposal', weight: 60 },
                { name: 'Negotiation/Review', weight: 75 },
                { name: 'Contracts', weight: 90 },
                { name: 'Closed Won', weight: 100 },
                { name: 'Closed Lost', weight: 0 }
            ],
            fieldVisibility: {
                arr:           { Admin: true, Manager: true, User: true,  ReadOnly: true  },
                implCost:      { Admin: true, Manager: true, User: true,  ReadOnly: true  },
                probability:   { Admin: true, Manager: true, User: true,  ReadOnly: true  },
                weightedValue: { Admin: true, Manager: true, User: true,  ReadOnly: true  },
                dealAge:       { Admin: true, Manager: true, User: true,  ReadOnly: true  },
                timeInStage:   { Admin: true, Manager: true, User: true,  ReadOnly: true  },
                activities:    { Admin: true, Manager: true, User: true,  ReadOnly: true  },
                notes:         { Admin: true, Manager: true, User: true,  ReadOnly: true  },
                nextSteps:     { Admin: true, Manager: true, User: true,  ReadOnly: true  },
                closeDate:     { Admin: true, Manager: true, User: true,  ReadOnly: true  },
            },
            kpiConfig: [
                { id: 'totalPipelineARR', name: 'Total Pipeline ARR', color: 'primary', tolerances: [{ label: 'On Track', min: 100000, color: '#16a34a' }, { label: 'Warning', min: 50000, color: '#f59e0b' }, { label: 'Critical', min: 0, color: '#ef4444' }] },
                { id: 'activeOpps', name: 'Active Opportunities', color: 'success', tolerances: [{ label: 'Good', min: 10, color: '#16a34a' }, { label: 'Low', min: 5, color: '#f59e0b' }, { label: 'Critical', min: 0, color: '#ef4444' }] },
                { id: 'avgARR', name: 'Avg ARR', color: 'warning', tolerances: [{ label: 'Strong', min: 50000, color: '#16a34a' }, { label: 'Average', min: 20000, color: '#f59e0b' }, { label: 'Low', min: 0, color: '#ef4444' }] },
                { id: 'nextQForecast', name: 'Next Quarter Forecast', color: 'info', tolerances: [{ label: 'On Track', min: 100000, color: '#16a34a' }, { label: 'Behind', min: 50000, color: '#f59e0b' }, { label: 'At Risk', min: 0, color: '#ef4444' }] },
                { id: 'openTasks', name: 'Open Tasks', color: 'primary', tolerances: [] },
                { id: 'quota', name: 'Annual Quota', color: 'info', tolerances: [] },
                { id: 'closedWon', name: 'Closed Won', color: 'success', tolerances: [] },
                { id: 'attainment', name: 'Attainment', color: 'warning', tolerances: [{ label: 'Exceeding', min: 100, color: '#16a34a' }, { label: 'On Track', min: 70, color: '#f59e0b' }, { label: 'Behind', min: 0, color: '#ef4444' }] }
            ]
        };
    });
    const [showModal, setShowModal] = useState(false);
    const [showAccountModal, setShowAccountModal] = useState(false);
    const [showUserModal, setShowUserModal] = useState(false);
    const [showTaskModal, setShowTaskModal] = useState(false);
    const [showContactModal, setShowContactModal] = useState(false);
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
    const [viewingContact, setViewingContact] = useState(null);
    const [contactShowAllDeals, setContactShowAllDeals] = useState(false);
    useEffect(() => { setContactShowAllDeals(false); }, [viewingContact]);
    const [viewingAccount, setViewingAccount] = useState(null);
    const [accShowAllClosed, setAccShowAllClosed] = useState(false);
    const [accShowAllContacts, setAccShowAllContacts] = useState(false);
    useEffect(() => { setAccShowAllClosed(false); setAccShowAllContacts(false); }, [viewingAccount]);
    const [contactsSortBy, setContactsSortBy] = useState('lastName');
    const [accountsSortDir, setAccountsSortDir] = useState('asc');
    const [accountsViewMode, setAccountsViewMode] = useState('compact');
    const [quotaForecastFilter, setQuotaForecastFilter] = useState([]);
    const [commissionsFilter, setCommissionsFilter] = useState([]);
    const [pipelineView, setPipelineView] = useState(() => localStorage.getItem('pipelineView') || 'funnel');
    const [funnelExpandedStage, setFunnelExpandedStage] = useState(null);
    const [kanbanDragging, setKanbanDragging] = useState(null);
    const [kanbanDragOver, setKanbanDragOver] = useState(null);
    const [pipelineQuarterFilter, setPipelineQuarterFilter] = useState([]);
    const [pipelineRepFilter, setPipelineRepFilter] = useState([]);
    const [pipelineTeamFilter, setPipelineTeamFilter] = useState([]);
    const [pipelineTerritoryFilter, setPipelineTerritoryFilter] = useState([]);
    const [commissionReportFilter, setCommissionReportFilter] = useState('Annual');
    const [reportsRep, setReportsRep] = useState(null);
    const [reportsTeam, setReportsTeam] = useState(null);
    const [reportsTerritory, setReportsTerritory] = useState(null);
    const [reportSubTab, setReportSubTab] = useState('pipeline');
    const [actPeriod, setActPeriod] = useState('Last 30 Days');
    const [reportOppSortField, setReportOppSortField] = useState('closeDate');
    const [reportOppSortDir, setReportOppSortDir] = useState('asc');
    const [pipelineStageFilter, setPipelineStageFilter] = useState([]);
    const [oppQuarterFilter, setOppQuarterFilter] = useState([]);
    const [oppStageFilter, setOppStageFilter] = useState([]);
    const [oppRepFilter, setOppRepFilter] = useState([]);
    const [oppTeamFilter, setOppTeamFilter] = useState([]);
    const [oppTerritoryFilter, setOppTerritoryFilter] = useState([]);
    const [oppSortField, setOppSortField] = useState('closeDate');
    const [oppSortDir, setOppSortDir] = useState('asc');
    const [inlineEdit, setInlineEdit] = useState(null); // { oppId, field, value }
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
    const [selectedContacts, setSelectedContacts] = useState([]);
    const [selectedAccounts, setSelectedAccounts] = useState([]);
    const [selectedOpps, setSelectedOpps] = useState([]);
    const [bulkAction, setBulkAction] = useState({ stage: '', rep: '' });
    const [tasksSubView, setTasksSubView] = useState('tasks');
    const [completedDateFrom, setCompletedDateFrom] = useState('');
    const [completedDateTo, setCompletedDateTo] = useState('');
    // Activity Feed state
    const [feedFilter, setFeedFilter] = useState('all');
    const [feedLastRead, setFeedLastRead] = useState(() => {
        try { return safeStorage.getItem('feedLastRead') || new Date(0).toISOString(); } catch(e) { return new Date(0).toISOString(); }
    });
    const [viewingTask, setViewingTask] = useState(null);
    const [taskReminderPopup, setTaskReminderPopup] = useState(null);
    const [taskDuePopup, setTaskDuePopup] = useState(null);
    const [taskDueQueue, setTaskDueQueue] = useState([]);
    const [dismissedDueTodayAlerts, setDismissedDueTodayAlerts] = useState([]);
    const [dismissedReminders, setDismissedReminders] = useState([]);
    const [healthPopover, setHealthPopover] = useState(null);
    const [confirmModal, setConfirmModal] = useState(null);
    const [lostReasonModal, setLostReasonModal] = useState(null); // { pendingFormData, editingOpp }
    const [expandedOppActivities, setExpandedOppActivities] = useState({}); // oppId -> bool

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
        setAuditEntries(prev => [{ id: entry.id, ts: entry.timestamp, user: entry.userName, action: entry.action, entity: entry.entityType, label: entry.entityName, detail: entry.detail }, ...prev].slice(0, 500));
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

    // Dynamic stages from settings funnel stages
    const stages = (settings.funnelStages && settings.funnelStages.length > 0)
        ? settings.funnelStages.filter(s => s.name.trim()).map(s => s.name)
        : ['Qualification', 'Discovery', 'Evaluation (Demo)', 'Proposal', 'Negotiation/Review', 'Contracts', 'Closed Won', 'Closed Lost'];

    const [settingsView, setSettingsView] = useState('menu'); // menu, fiscal-year, logo, users, pain-points, vertical-markets
    const [auditEntries, setAuditEntries] = useState([]);
    const [auditLoading, setAuditLoading] = useState(false);
    const [tasksExpandedSections, setTasksExpandedSections] = useState({
        inProcess: false,
        today: true,
        thisWeek: false,
        thisMonth: false,
        all: false,
        completed: false
    });
    const [taskViewMode, setTaskViewMode] = useState('card');
    const [taskStatusFilter, setTaskStatusFilter] = useState([]);
    const [newPainPointInput, setNewPainPointInput] = useState('');
    const [newVerticalMarketInput, setNewVerticalMarketInput] = useState('');
    
    // Activity Timeline & History
    const [activities, setActivities] = useState([]);
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
    const [csvImportType, setCsvImportType] = useState('contacts');

    // Quota & Commission

      useEffect(() => {
    if (!clerkUser) return; // Don't load until authenticated
    const loadData = async () => {
const token = await getToken().catch(() => '');
const authHeaders = token ? { 'Authorization': 'Bearer ' + token } : {};
const checkOk = (r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r; };
const authFetch = (url) => fetch(url, { headers: authHeaders });

authFetch('/.netlify/functions/opportunities')
.then(checkOk).then(r => r.json())
.then(data => {
    const loadedOpps = data.opportunities || [];
    const updatedOpps = loadedOpps.map(opp => {
        const normalized = {
            ...opp,
            arr: parseFloat(opp.arr) || 0,
            implementationCost: parseFloat(opp.implementationCost) || 0,
            probability: opp.probability !== undefined && opp.probability !== '' ? parseFloat(opp.probability) : opp.probability,
        };
        if (!normalized.closeQuarter && normalized.forecastedCloseDate) {
            const quarter = getQuarter(normalized.forecastedCloseDate);
            const quarterLabel = getQuarterLabel(quarter, normalized.forecastedCloseDate);
            return { ...normalized, closeQuarter: quarterLabel };
        }
        return normalized;
    });
    setOpportunities(updatedOpps);
})
.catch(err => console.error('Failed to load opportunities:', err));

authFetch('/.netlify/functions/accounts')
    .then(checkOk).then(r => r.json())
    .then(data => setAccounts(data.accounts || []))
    .catch(err => console.error('Failed to load accounts:', err));

authFetch('/.netlify/functions/contacts')
    .then(checkOk).then(r => r.json())
    .then(data => setContacts(data.contacts || []))
    .catch(err => console.error('Failed to load contacts:', err));

authFetch('/.netlify/functions/leads')
    .then(checkOk).then(r => r.json())
    .then(data => setLeads(data.leads || []))
    .catch(err => console.error('Failed to load leads:', err));


authFetch('/.netlify/functions/tasks')
    .then(checkOk).then(r => r.json())
    .then(data => setTasks(data.tasks || []))
    .catch(err => console.error('Failed to load tasks:', err));

authFetch('/.netlify/functions/activities')
    .then(checkOk).then(r => r.json())
    .then(data => setActivities(data.activities || []))
    .catch(err => console.error('Failed to load activities:', err));

authFetch('/.netlify/functions/settings')
    .then(checkOk).then(r => r.json())
    .then(data => {
        if (data.settings) {
            setSettings(prev => ({
                ...prev,
                ...data.settings,
                taskTypes: data.settings.taskTypes || prev.taskTypes || ['Call', 'Meeting', 'Email'],
                quotaData: data.settings.quotaData ? { ...prev.quotaData, ...data.settings.quotaData } : prev.quotaData,
                funnelStages: data.settings.funnelStages || prev.funnelStages,
                users: data.settings.users || prev.users || [],
            }));
        }
    })
    .catch(err => console.error('Failed to load settings:', err));
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
                    e.preventDefault(); setActiveTab('tasks'); break;
                case '4':
                    e.preventDefault(); setActiveTab('accounts'); break;
                case '5':
                    e.preventDefault(); setActiveTab('contacts'); break;
                case '6':
                    e.preventDefault(); setActiveTab('analytics'); break;
                case '7':
                    e.preventDefault(); setActiveTab('reports'); break;
                case 'f': case 'F':
                    if (e.metaKey || e.ctrlKey) return; // let browser search through
                    e.preventDefault();
                    setShowSearchResults(true);
                    setTimeout(() => document.querySelector('.global-search-input')?.focus(), 50);
                    break;
                default: break;
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [showModal, showAccountModal, showContactModal, showTaskModal, showUserModal, showActivityModal,
        confirmModal, notesPopover, undoToast, showNotifications, showSearchResults, showShortcuts]);



    useEffect(() => {
    // Settings saved to DB (source of truth); localStorage copy kept for offline fallback
    try { safeStorage.setItem('salesSettings', JSON.stringify(settings)); } catch(e) {}
    dbFetch('/.netlify/functions/settings', {
method: 'PUT',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify(settings)
    }).catch(err => console.error('Failed to save settings:', err));
}, [settings]);







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

    const totalARR = visibleOpportunities.reduce((sum, opp) => sum + (opp.arr || 0), 0);
    const activeOpps = visibleOpportunities.length;
    const avgARR = activeOpps > 0 ? totalARR / activeOpps : 0;
    
    // Calculate forecasted revenue by quarter
    const getQuarter = (dateString) => {
        const date = new Date(dateString);
        const month = date.getMonth() + 1;
        const fiscalStart = settings.fiscalYearStart || 10;
        
        // Calculate quarters based on fiscal year start
        const q1Start = fiscalStart;
        const q2Start = (fiscalStart + 3) > 12 ? (fiscalStart + 3 - 12) : (fiscalStart + 3);
        const q3Start = (fiscalStart + 6) > 12 ? (fiscalStart + 6 - 12) : (fiscalStart + 6);
        const q4Start = (fiscalStart + 9) > 12 ? (fiscalStart + 9 - 12) : (fiscalStart + 9);
        
        // Determine quarter
        if (fiscalStart <= 3) {
            // Fiscal year starts Q1-Q1 (Jan-Mar)
            if (month >= fiscalStart && month < q2Start) return 'Q1';
            if (month >= q2Start && month < q3Start) return 'Q2';
            if (month >= q3Start && month < q4Start) return 'Q3';
            return 'Q4';
        } else if (fiscalStart <= 6) {
            // Fiscal year starts Q2 (Apr-Jun)
            if (month >= fiscalStart && month < q2Start) return 'Q1';
            if (month >= q2Start && month < q3Start) return 'Q2';
            if (month >= q3Start && month < q4Start) return 'Q3';
            return 'Q4';
        } else if (fiscalStart <= 9) {
            // Fiscal year starts Q3 (Jul-Sep)
            if (month >= fiscalStart && month < q4Start) return 'Q1';
            if (month >= q4Start || month < q2Start) return 'Q2';
            if (month >= q2Start && month < q3Start) return 'Q3';
            return 'Q4';
        } else {
            // Fiscal year starts Q4 (Oct-Dec)
            if (month >= q1Start || month < q2Start) return 'Q1';
            if (month >= q2Start && month < q3Start) return 'Q2';
            if (month >= q3Start && month < q4Start) return 'Q3';
            return 'Q4';
        }
    };

    const getQuarterLabel = (quarter, dateString) => {
        const date = new Date(dateString);
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const fiscalStart = settings.fiscalYearStart || 10;
        
        // Determine fiscal year
        let fiscalYear;
        if (month >= fiscalStart) {
            fiscalYear = year + 1;
        } else {
            fiscalYear = year;
        }
        
        return `FY${fiscalYear} ${quarter}`;
    };

    const quarterlyData = {};
    visibleOpportunities.forEach(opp => {
        if (opp.forecastedCloseDate) {
            const quarter = getQuarter(opp.forecastedCloseDate);
            const quarterLabel = getQuarterLabel(quarter, opp.forecastedCloseDate);
            
            if (!quarterlyData[quarterLabel]) {
                quarterlyData[quarterLabel] = 0;
            }
            quarterlyData[quarterLabel] += (opp.arr + opp.implementationCost);
        }
    });

    const sortedQuarters = Object.entries(quarterlyData)
        .sort((a, b) => {
            const dateA = visibleOpportunities.find(o => {
                const q = getQuarter(o.forecastedCloseDate);
                const ql = getQuarterLabel(q, o.forecastedCloseDate);
                return ql === a[0];
            });
            const dateB = visibleOpportunities.find(o => {
                const q = getQuarter(o.forecastedCloseDate);
                const ql = getQuarterLabel(q, o.forecastedCloseDate);
                return ql === b[0];
            });
            return new Date(dateA?.forecastedCloseDate) - new Date(dateB?.forecastedCloseDate);
        });

    const nextQuarter = sortedQuarters.length > 0 ? sortedQuarters[0] : null;

    // ── Pipeline-tab filtered opps (drives KPIs + table + summary panel) ──
    const pipelineFilteredOpps = (() => {
        const opts = window.__pipelineFilterOptions || [];
        return visibleOpportunities
            .filter(opp => {
                if (pipelineQuarterFilter.length === 0) return true;
                return pipelineQuarterFilter.some(key => { const opt = opts.find(o => o.key === key); return opt && opt.match(opp); });
            })
            .filter(opp => {
                if (pipelineStageFilter.length === 0) return true;
                if (pipelineStageFilter.includes('__allOpen__')) return opp.stage !== 'Closed Won' && opp.stage !== 'Closed Lost';
                return pipelineStageFilter.includes(opp.stage);
            })
            .filter(opp => pipelineRepFilter.length === 0 || pipelineRepFilter.includes(opp.salesRep) || pipelineRepFilter.includes(opp.assignedTo))
            .filter(opp => {
                if (pipelineTeamFilter.length === 0) return true;
                const u = (settings.users||[]).find(u => u.name===(opp.salesRep||opp.assignedTo));
                return u && pipelineTeamFilter.includes(u.team);
            })
            .filter(opp => {
                if (pipelineTerritoryFilter.length === 0) return true;
                const u = (settings.users||[]).find(u => u.name===(opp.salesRep||opp.assignedTo));
                return u && pipelineTerritoryFilter.includes(u.territory);
            });
    })();
    const pipelineTotalARR = pipelineFilteredOpps.reduce((sum, o) => sum + (o.arr || 0), 0);
    const pipelineActiveOpps = pipelineFilteredOpps.length;
    const pipelineAvgARR = pipelineActiveOpps > 0 ? pipelineTotalARR / pipelineActiveOpps : 0;
    const pipelineNextQtr = (() => {
        const qData = {};
        pipelineFilteredOpps.forEach(opp => {
            if (opp.forecastedCloseDate) {
                const ql = getQuarterLabel(getQuarter(opp.forecastedCloseDate), opp.forecastedCloseDate);
                qData[ql] = (qData[ql] || 0) + (opp.arr || 0);
            }
        });
        const sorted = Object.entries(qData).sort((a, b) => {
            const da = pipelineFilteredOpps.find(o => getQuarterLabel(getQuarter(o.forecastedCloseDate), o.forecastedCloseDate) === a[0]);
            const db = pipelineFilteredOpps.find(o => getQuarterLabel(getQuarter(o.forecastedCloseDate), o.forecastedCloseDate) === b[0]);
            return new Date(da?.forecastedCloseDate) - new Date(db?.forecastedCloseDate);
        });
        return sorted.length > 0 ? sorted[0] : null;
    })();

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
        showConfirm('Are you sure you want to delete this user?', () => {
            setSettings({
                ...settings,
                users: settings.users.filter(u => u.id !== userId)
            });
        });
    };

    const handleSaveUser = (userData) => {
        if (editingUser) {
            setSettings({
                ...settings,
                users: settings.users.map(u => 
                    u.id === editingUser.id ? { ...userData, id: editingUser.id } : u
                )
            });
        } else {
            const newId = String(Math.max(...(settings.users.length ? settings.users.map(u => parseInt(u.id) || 0) : [0]), 0) + 1).padStart(3, '0');
            const newUser = { ...userData, id: newId };
            setSettings({
                ...settings,
                users: [...settings.users, newUser]
            });
            if (showModal) {
                setLastCreatedRepName(newUser.name);
            }
        }
        setShowUserModal(false);
    };

    const handleUpdateFiscalYearStart = (month) => {
        setSettings({
            ...settings,
            fiscalYearStart: parseInt(month)
        });
    };

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

    const handleDeleteTask = (taskId) => {
        const task = tasks.find(t => t.id === taskId);
        if (!task) return;
        showConfirm('Are you sure you want to delete this task?', () => {
            const snapshot = [...tasks];
           setTasks(tasks.filter(t => t.id !== taskId));
dbFetch(`/.netlify/functions/tasks?id=${taskId}`, { method: 'DELETE' })
    .catch(err => console.error('Failed to delete task:', err));
            addAudit('delete', 'task', taskId, task.title || task.subject || taskId, '');
            softDelete(
                `Task "${task.title || task.subject || 'Untitled'}"`,
                () => {},
                () => { setTasks(snapshot); setUndoToast(null); }
            );
        });
    };

    const handleSaveTask = (taskData) => {
        if (editingTask) {
    setTasks(tasks.map(t => 
    t.id === editingTask.id ? { ...taskData, id: editingTask.id } : t
));
dbFetch('/.netlify/functions/tasks', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...taskData, id: editingTask.id })
}).catch(err => console.error('Failed to update task:', err));
            addAudit('update', 'task', editingTask.id, taskData.title || editingTask.id, taskData.type || '');
        } else {
            const newId = String(Math.max(...(tasks.length ? tasks.map(t => parseInt(t.id) || 0) : [0]), 0) + 1).padStart(3, '0');
            const newTask = { ...taskData, id: newId };
setTasks([...tasks, newTask]);
dbFetch('/.netlify/functions/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(newTask)
}).catch(err => console.error('Failed to save task:', err));
            addAudit('create', 'task', newId, taskData.title || newId, taskData.type || '');
        }
        setShowTaskModal(false);
    };

    const handleCompleteTask = (taskId, newStatus) => {
        setTasks(tasks.map(t => {
            if (t.id !== taskId) return t;
            if (newStatus !== undefined) {
                return { ...t, status: newStatus, completed: newStatus === 'Completed', completedDate: newStatus === 'Completed' ? new Date().toISOString().split('T')[0] : t.completedDate };
            }
            // Legacy toggle
            const wasCompleted = t.completed || t.status === 'Completed';
            return { ...t, completed: !wasCompleted, status: wasCompleted ? 'Open' : 'Completed', completedDate: wasCompleted ? t.completedDate : new Date().toISOString().split('T')[0] };
        }));
    };

    const handleAddTaskType = (newType) => {
        if (newType && !(settings.taskTypes || []).includes(newType)) {
            setSettings(prev => ({ ...prev, taskTypes: [...(prev.taskTypes || []), newType] }));
        }
    };

    const handleAddContact = () => {
        setEditingContact(null);
        setShowContactModal(true);
    };

    const handleEditContact = (contact) => {
        setEditingContact(contact);
        setShowContactModal(true);
    };

    const handleDeleteContact = (contactId) => {
        const contact = contacts.find(c => c.id === contactId);
        if (!contact) return;
        showConfirm('Are you sure you want to delete this contact?', () => {
            const snapshot = [...contacts];
            setContacts(contacts.filter(c => c.id !== contactId));
dbFetch(`/.netlify/functions/contacts?id=${contactId}`, { method: 'DELETE' })
    .catch(err => console.error('Failed to delete contact:', err));
            addAudit('delete', 'contact', contactId, ((contact.firstName||'') + ' ' + (contact.lastName||'')).trim() || contactId, contact.company || '');
            softDelete(
                `Contact "${((contact.firstName||'') + ' ' + (contact.lastName||'')).trim()}"`,
                () => {},
                () => { setContacts(snapshot); setUndoToast(null); }
            );
        });
    };

    const handleSaveContact = (contactData) => {
        if (editingContact) {
    setContacts(contacts.map(c => 
    c.id === editingContact.id ? { ...contactData, id: editingContact.id } : c
));
dbFetch('/.netlify/functions/contacts', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...contactData, id: editingContact.id })
}).catch(err => console.error('Failed to update contact:', err));
            addAudit('update', 'contact', editingContact.id, ((contactData.firstName||'') + ' ' + (contactData.lastName||'')).trim() || editingContact.id, contactData.company || '');
        } else {
            const newId = String(Math.max(...(contacts.length ? contacts.map(c => parseInt(c.id) || 0) : [0]), 0) + 1).padStart(3, '0');
            const newContact = { ...contactData, id: newId };
setContacts([...contacts, newContact]);
dbFetch('/.netlify/functions/contacts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(newContact)
}).catch(err => console.error('Failed to save contact:', err));
            addAudit('create', 'contact', newId, ((contactData.firstName||'') + ' ' + (contactData.lastName||'')).trim() || newId, contactData.company || '');
        }
        setShowContactModal(false);
    };

    const handleEdit = (opp) => {
        setEditingOpp(opp);
        setShowModal(true);
    };

    const handleDelete = (id) => {
        const opp = opportunities.find(o => o.id === id);
        if (!opp) return;
        showConfirm('Are you sure you want to delete this opportunity?', () => {
            const snapshot = [...opportunities];
            setOpportunities(opportunities.filter(o => o.id !== id));
dbFetch(`/.netlify/functions/opportunities?id=${id}`, { method: 'DELETE' })
    .then(r => r.json())
    .catch(err => console.error('Failed to delete opportunity:', err));
            addAudit('delete', 'opportunity', id, opp.opportunityName || opp.account || id, opp.account);
            softDelete(
                `Opportunity "${opp.opportunityName || opp.account}"`,
                () => {},  // already deleted above
                () => { setOpportunities(snapshot); setUndoToast(null); }
            );
        });
    };

    const handleSave = (formData) => {
        const today = new Date().toISOString().split('T')[0];
        const prevOpp = editingOpp ? opportunities.find(o => o.id === editingOpp.id) : null;
        const stageChanged = prevOpp && prevOpp.stage !== formData.stage;

        // Build stage history entry if stage changed
        const stageHistoryEntry = stageChanged ? {
            stage: formData.stage,
            date: today,
            prevStage: prevOpp.stage,
            author: currentUser || '',
            timestamp: new Date().toISOString()
        } : null;

        const enrichedData = {
            ...formData,
            createdDate: prevOpp?.createdDate || today,
            stageChangedDate: stageChanged ? today : (prevOpp?.stageChangedDate || today),
            stageHistory: stageChanged
                ? [...(prevOpp?.stageHistory || []), stageHistoryEntry]
                : (prevOpp?.stageHistory || []),
            comments: prevOpp?.comments || [],
            lostReason: formData.lostReason || prevOpp?.lostReason || '',
            lostCategory: formData.lostCategory || prevOpp?.lostCategory || '',
            lostDate: formData.lostDate || prevOpp?.lostDate || ''
        };

        // Intercept Closed Lost to prompt for reason
        if (formData.stage === 'Closed Lost' && (!prevOpp || prevOpp.stage !== 'Closed Lost')) {
            setShowModal(false);
            setLostReasonModal({ pendingFormData: enrichedData, editingOpp });
            return;
        }

        if (editingOpp && editingOpp.id) {
            const updatedOpp = { ...enrichedData, id: editingOpp.id };
            setOpportunities(opportunities.map(opp =>
                opp.id === editingOpp.id ? updatedOpp : opp
            ));
            dbFetch('/.netlify/functions/opportunities', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedOpp)
            }).catch(err => console.error('Failed to update opportunity:', err));
            addAudit('update', 'opportunity', editingOpp.id, enrichedData.opportunityName || enrichedData.account || editingOpp.id, enrichedData.account || '');
        } else {
            const newId = String(Math.max(...(opportunities.length ? opportunities.map(o => parseInt(o.id) || 0) : [0]), 0) + 1).padStart(3, '0');
            const newOpp = { ...enrichedData, id: newId, pipelineId: activePipeline.id, createdBy: currentUser || '' };
            setOpportunities([...opportunities, newOpp]);
            dbFetch('/.netlify/functions/opportunities', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newOpp)
            }).catch(err => console.error('Failed to save opportunity:', err));
            addAudit('create', 'opportunity', newId, enrichedData.opportunityName || enrichedData.account || newId, enrichedData.account || '');
        }
        setShowModal(false);
    };

    const completeLostSave = (formData, editingOppRef, lostReason, lostCategory) => {
        const today = new Date().toISOString().split('T')[0];
        const prevOppRef = editingOppRef ? opportunities.find(o => o.id === editingOppRef.id) : null;
        const enriched = {
            ...formData,
            lostReason, lostCategory, lostDate: today,
            comments: prevOppRef?.comments || formData.comments || [],
            stageHistory: formData.stageHistory || prevOppRef?.stageHistory || []
        };
        if (editingOppRef) {
            const updatedOpp = { ...enriched, id: editingOppRef.id };
            setOpportunities(opportunities.map(opp =>
                opp.id === editingOppRef.id ? updatedOpp : opp
            ));
            dbFetch('/.netlify/functions/opportunities', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedOpp)
            }).catch(err => console.error('Failed to save lost opportunity:', err));
            addAudit('update', 'opportunity', editingOppRef.id, enriched.opportunityName || enriched.account || editingOppRef.id, `Closed Lost: ${lostCategory || lostReason || ''}`);
        } else {
            const newId = String(Math.max(...(opportunities.length ? opportunities.map(o => parseInt(o.id) || 0) : [0]), 0) + 1).padStart(3, '0');
            const newOpp = { ...enriched, id: newId, pipelineId: activePipeline.id };
            setOpportunities([...opportunities, newOpp]);
            dbFetch('/.netlify/functions/opportunities', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newOpp)
            }).catch(err => console.error('Failed to save lost opportunity:', err));
            addAudit('create', 'opportunity', newId, enriched.opportunityName || enriched.account || newId, `Closed Lost: ${lostCategory || lostReason || ''}`);
        }
        setLostReasonModal(null);
    };

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
    const getSubAccounts = (accountId) => (accounts || []).filter(a => a.parentId === accountId);

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

    const handleDeleteAccount = (accountId) => {
        const account = accounts.find(acc => acc.id === accountId);
        if (!account) return;

        const subs = getSubAccounts(accountId);
        const allIds = [accountId, ...subs.map(s => s.id)];
        const allNames = [account.name, ...subs.map(s => s.name)];

        const hasActiveOpportunities = opportunities.some(opp => allNames.includes(opp.account));
        if (hasActiveOpportunities) {
            alert(`Cannot delete "${account.name}" because it has active opportunities. Please close or reassign them first.`);
            return;
        }

        const subMsg = subs.length > 0 ? ` This will also delete ${subs.length} sub-account${subs.length > 1 ? 's' : ''}.` : '';
        showConfirm(`Are you sure you want to delete "${account.name}"?${subMsg}`, () => {
            const snapshot = [...accounts];
            setAccounts(accounts.filter(a => !allIds.includes(a.id)));
            allIds.forEach(id => {
                dbFetch(`/.netlify/functions/accounts?id=${id}`, { method: 'DELETE' })
                    .catch(err => console.error('Failed to delete account:', err));
            });
            addAudit('delete', 'account', accountId, account.name, '');
            softDelete(
                `Account "${account.name}"`,
                () => {},
                () => { setAccounts(snapshot); setUndoToast(null); }
            );
        });
    };

    const handleDeleteSubAccount = (parentId, subAccountId) => {
        // Sub-account is now a flat account row — delegate to handleDeleteAccount
        handleDeleteAccount(subAccountId);
    };

    const handleSaveAccount = (formData) => {
        if (editingAccount) {
            const updatedAccount = { ...formData, id: editingAccount.id };
            setAccounts(accounts.map(acc => acc.id === editingAccount.id ? updatedAccount : acc));
            dbFetch('/.netlify/functions/accounts', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedAccount)
            }).catch(err => console.error('Failed to update account:', err));
            addAudit('update', 'account', editingAccount.id, formData.name || editingAccount.id, formData.industry || '');
        } else if (editingSubAccount) {
            const updatedSub = { ...formData, id: editingSubAccount.id, parentId: editingSubAccount.parentId };
            setAccounts(accounts.map(acc => acc.id === editingSubAccount.id ? updatedSub : acc));
            dbFetch('/.netlify/functions/accounts', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedSub)
            }).catch(err => console.error('Failed to update sub-account:', err));
            addAudit('update', 'account', editingSubAccount.id, formData.name || editingSubAccount.id, '');
        } else if (parentAccountForSub) {
            const newId = String(Math.max(...(accounts.length ? accounts.map(a => parseInt(a.id) || 0) : [0]), 0) + 1).padStart(3, '0');
            const newSub = { ...formData, id: newId, parentId: parentAccountForSub.id };
            setAccounts([...accounts, newSub]);
            dbFetch('/.netlify/functions/accounts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newSub)
            }).catch(err => console.error('Failed to save sub-account:', err));
            addAudit('create', 'account', newId, formData.name || newId, 'Sub of ' + parentAccountForSub.name);
        } else {
            const newId = String(Math.max(...(accounts.length ? accounts.map(a => parseInt(a.id) || 0) : [0]), 0) + 1).padStart(3, '0');
            const newAccount = { ...formData, id: newId };
            setAccounts([...accounts, newAccount]);
            dbFetch('/.netlify/functions/accounts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newAccount)
            }).catch(err => console.error('Failed to save account:', err));
            addAudit('create', 'account', newId, formData.name || newId, formData.industry || '');
            if (accountCreatedFromOppForm) {
                setLastCreatedAccountName(formData.name);
                setEditingOpp(pendingOppFormData);
                setShowModal(true);
                setAccountCreatedFromOppForm(false);
                setPendingOppFormData(null);
            }
        }
        setShowAccountModal(false);
    };

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
    const exportToCSV = (filename, headers, rows) => {
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
        const pipeline = openOpps.reduce((s, o) => s + (o.arr || 0), 0);
        const wonArr = wonOpps.reduce((s, o) => s + (o.arr || 0) + (o.implementationCost || 0), 0);
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

    const handleDeleteActivity = (activityId) => {
        showConfirm('Are you sure you want to delete this activity?', () => {
         setActivities(activities.filter(a => a.id !== activityId));
dbFetch(`/.netlify/functions/activities?id=${activityId}`, { method: 'DELETE' })
    .catch(err => console.error('Failed to delete activity:', err));
        });
    };

    const handleSaveActivity = (activityData) => {
        if (editingActivity) {
setActivities(activities.map(a => 
    a.id === editingActivity.id ? { ...activityData, id: editingActivity.id } : a
));
dbFetch('/.netlify/functions/activities', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...activityData, id: editingActivity.id })
}).catch(err => console.error('Failed to update activity:', err));
        } else {
    const newId = String(Math.max(...(activities.length ? activities.map(a => parseInt(a.id) || 0) : [0]), 0) + 1).padStart(3, '0');
    const newActivity = { ...activityData, id: newId, createdAt: new Date().toISOString(), author: currentUser || '' };
    setActivities([...activities, newActivity]);
    dbFetch('/.netlify/functions/activities', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newActivity) }).catch(err => console.error('Failed to save activity:', err));
}
        setShowActivityModal(false);
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
            const lastActivity = new Date(Math.max(...oppActivities.map(a => new Date(a.date))));
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
                    const lastActivity = new Date(Math.max(...oppActivities.map(a => new Date(a.date))));
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
                    const closeDate = new Date(opp.forecastedCloseDate);
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
                    const dueDate = new Date(task.dueDate);
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
            const todayStr = new Date().toISOString().split('T')[0];
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

    const [loginError, setLoginError] = useState('');

    const handleLogout = () => signOut();

    if (!clerkLoaded) {
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

    // Feed pre-computation (avoids IIFE-in-JSX Babel issues)
    const feedAvatarColors = ['#2563eb','#10b981','#f59e0b','#8b5cf6','#ec4899','#0891b2','#ef4444'];
    const feedGetAvatarColor = (name) => feedAvatarColors[(name||'A').charCodeAt(0) % feedAvatarColors.length];
    const feedGetInitials = (name) => (name||'?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    const feedActTypeIcon = { Call: '📞', Email: '✉️', Meeting: '🤝', Demo: '🖥️', 'Proposal Sent': '📄', 'Follow-up': '🔄', Other: '📝' };
    const feedExtractMentions = (text) => {
        if (!text) return [];
        const allUsers = (settings?.users || []).map(u => u.name).filter(Boolean);
        const found = [];
        const parts = text.split('@');
        for (let i = 1; i < parts.length; i++) {
            for (const name of [...allUsers].sort((a, b) => b.length - a.length)) {
                if (parts[i].startsWith(name)) { found.push(name); break; }
            }
        }
        return [...new Set(found)];
    };
    const allFeedItems = [];
    (activities || []).forEach(act => {
        const feedOpp = (opportunities || []).find(o => o.id === act.opportunityId);
        allFeedItems.push({ id: 'act_' + act.id, type: 'activity', icon: feedActTypeIcon[act.type] || '📝', actor: act.author || act.salesRep || '', label: act.type, detail: act.notes || '', opp: feedOpp, timestamp: act.createdAt || act.date || '', mentions: [] });
    });
    (opportunities || []).forEach(opp => {
        (opp.comments || []).forEach(c => {
            const mentions = (c.mentions && c.mentions.length > 0) ? c.mentions : feedExtractMentions(c.text);
            allFeedItems.push({ id: c.id, type: 'comment', icon: '💬', actor: c.author || '', label: 'left a note', detail: c.text || '', opp, timestamp: c.timestamp || '', mentions });
        });
        (opp.stageHistory || []).forEach(sh => {
            const stageIcon = sh.stage === 'Closed Won' ? '🏆' : sh.stage === 'Closed Lost' ? '❌' : '📊';
            allFeedItems.push({ id: 'stage_' + opp.id + '_' + sh.timestamp, type: 'stage', icon: stageIcon, actor: sh.author || '', label: 'moved to ' + sh.stage, detail: '', opp, timestamp: sh.timestamp || sh.date || '', mentions: [] });
        });
        if (opp.createdDate) {
            allFeedItems.push({ id: 'created_' + opp.id, type: 'created', icon: '✨', actor: opp.createdBy || opp.salesRep || '', label: 'created deal', detail: '$' + (opp.arr||0).toLocaleString() + ' ARR', opp, timestamp: opp.createdDate || '', mentions: [] });
        }
    });
    allFeedItems.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const feedFiltered = allFeedItems.filter(item => {
        if (feedFilter === 'all') return true;
        if (feedFilter === 'mentions') return (item.mentions || []).includes(currentUser);
        if (feedFilter === 'activities') return item.type === 'activity';
        if (feedFilter === 'comments') return item.type === 'comment';
        if (feedFilter === 'stages') return item.type === 'stage' || item.type === 'created';
        return true;
    });
    const feedFilterButtons = [
        { key: 'all', label: 'All' },
        { key: 'mentions', label: '@ Mentions' },
        { key: 'activities', label: '📞 Activities' },
        { key: 'comments', label: '💬 Notes' },
        { key: 'stages', label: '📊 Deal Events' }
    ];
    const feedTimeAgo = (ts) => {
        if (!ts) return '';
        const now = new Date(), t = new Date(ts), diff = now - t;
        const mins = Math.floor(diff / 60000), hrs = Math.floor(diff / 3600000), days = Math.floor(diff / 86400000);
        if (mins < 1) return 'just now';
        if (mins < 60) return mins + 'm ago';
        if (hrs < 24) return hrs + 'h ago';
        if (days < 7) return days + 'd ago';
        return t.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    return (
        <div className="app-container">
            <header className="header">
                <div className="header-inner" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', minWidth: 0 }}>
                        {settings.logoUrl && (
                            <img 
                                src={settings.logoUrl} 
                                alt="Company Logo" 
                                className="header-logo"
                                style={{ 
                                    height: '75px', 
                                    width: 'auto',
                                    maxWidth: '225px',
                                    objectFit: 'contain'
                                }} 
                            />
                        )}
                        <div>
                            <h1>Sales Pipeline Tracker</h1>
                            <p style={{ display:'flex', alignItems:'center', gap:'0.625rem', flexWrap:'wrap' }}>
                                <span>Real-time opportunity tracking and analytics</span>
                                <span style={{ color:'#cbd5e1' }}>·</span>
                                <span style={{ fontSize:'0.75rem', color:'#64748b' }}>
                                    {new Date().toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric' })}
                                </span>
                                <span style={{ fontSize:'0.6rem', fontWeight:'700', textTransform:'uppercase', letterSpacing:'0.06em', background:'#eff6ff', color:'#2563eb', padding:'0.15rem 0.5rem', borderRadius:'999px', border:'1px solid #bfdbfe', lineHeight:'1.4' }}>
                                    {(() => { const q = getQuarter(new Date().toISOString()); return getQuarterLabel(q, new Date().toISOString()); })()}
                                </span>
                            </p>
                        </div>
                    </div>
                    <div className="header-actions" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.375rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '0.5rem',
                            padding: '0.375rem 0.5rem 0.375rem 0.875rem',
                            background: '#f1f3f5',
                            borderRadius: '20px',
                            border: '1px solid #e2e8f0'
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
                                <div style={{ fontSize: '0.8125rem', fontWeight: '600', color: '#1e293b' }}>{currentUser}</div>
                                <div style={{ fontSize: '0.625rem', color: isAdmin ? '#7c3aed' : isManager ? '#059669' : isReadOnly ? '#94a3b8' : '#2563eb', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    {userRole === 'User' ? 'Sales Rep' : userRole === 'ReadOnly' ? 'Read-Only' : userRole}
                                </div>
                            </div>
                            <button
                                onClick={handleLogout}
                                title="Sign out"
                                style={{
                                    background: 'none',
                                    border: '1px solid #e2e8f0',
                                    color: '#64748b',
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
                                onMouseLeave={e => { e.target.style.background = 'none'; e.target.style.color = '#64748b'; e.target.style.borderColor = '#e2e8f0'; }}
                            >
                                Logout
                            </button>
                        </div>
                        <button
                            onClick={() => setShowShortcuts(v => !v)}
                            title="Keyboard shortcuts (?)"
                            style={{ background: '#f1f3f5', color: '#64748b', border: 'none', borderRadius: '50%',
                                width: '40px', height: '40px', cursor: 'pointer', fontSize: '1rem', fontWeight: '800',
                                transition: 'all 0.2s ease', fontFamily: 'inherit' }}
                            onMouseEnter={e => { e.currentTarget.style.background = '#e2e8f0'; e.currentTarget.style.transform = 'scale(1.1)'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = '#f1f3f5'; e.currentTarget.style.transform = 'scale(1)'; }}>
                            ?
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
                    {/* Global Search - second row */}
                    <div style={{ position: 'relative' }}>
                        <div style={{ display: 'flex', alignItems: 'center', background: '#f1f3f5', borderRadius: '20px', border: '1px solid #e2e8f0', padding: '0.3rem 0.75rem', gap: '0.375rem' }}>
                            <span style={{ color: '#94a3b8', fontSize: '0.8125rem', flexShrink: 0 }}>🔍</span>
                            <input
                                type="text"
                                placeholder="Search accounts, contacts, deals..."
                                value={globalSearch}
                                onChange={e => { setGlobalSearch(e.target.value); setShowSearchResults(e.target.value.length > 0); }}
                                onFocus={() => { if (globalSearch.length > 0) setShowSearchResults(true); }}
                                style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.8125rem', color: '#1e293b', width: '220px', padding: '0.125rem 0', fontFamily: 'inherit' }}
                            />
                            {globalSearch && (
                                <button onClick={() => { setGlobalSearch(''); setShowSearchResults(false); }}
                                    style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '0.8125rem', padding: 0, lineHeight: 1 }}>✕</button>
                            )}
                        </div>
                        {showSearchResults && globalSearch.length > 0 && (
                            <>
                            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 }} onClick={() => setShowSearchResults(false)} />
                            <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '0.375rem', width: '380px', maxHeight: '420px', overflowY: 'auto', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 1000 }} onClick={e => e.stopPropagation()}>
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
                                            {matchedAccounts.map(a => (<div key={'sa-'+a.id} style={{ padding: '0.4rem 0.75rem', cursor: 'pointer', borderBottom: '1px solid #f9fafb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} onClick={() => { setGlobalSearch(''); setShowSearchResults(false); setActiveTab('accounts'); setTimeout(() => setViewingAccount(a), 100); }} onMouseEnter={e => e.currentTarget.style.background='#f1f5f9'} onMouseLeave={e => e.currentTarget.style.background='transparent'}><div><div style={{ fontSize: '0.8125rem', fontWeight: '600', color: '#1e293b' }}>{a.name}</div>{a.accountOwner && <div style={{ fontSize: '0.6875rem', color: '#94a3b8' }}>{a.accountOwner}</div>}</div><span style={{ fontSize: '0.625rem', color: '#94a3b8' }}>Account</span></div>))}
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
                <div className="tab-page">
                    <div className="tab-page-header">
                        <div className="tab-page-header-bar"></div>
                        <div>
                            <h2>Dashboard</h2>
                            <p>Your sales pipeline at a glance</p>
                        </div>
                    </div>
                    <ViewingBar
                        allPipelines={allPipelines} activePipeline={activePipeline} setActivePipelineId={setActivePipelineId}
                        canSeeAll={canSeeAll} allRepNames={allRepNames} allTeamNames={allTeamNames} allTerritoryNames={allTerritoryNames}
                        viewingRep={viewingRep} setViewingRep={setViewingRep}
                        viewingTeam={viewingTeam} setViewingTeam={setViewingTeam}
                        viewingTerritory={viewingTerritory} setViewingTerritory={setViewingTerritory}
                        visibleCount={visibleOpportunities.length} totalCount={(opportunities||[]).filter(o => (o.pipelineId||'default') === activePipeline.id).length} countLabel="opportunities"
                        isAdmin={isAdmin}
                    />
                    <div className="kpi-grid">
                        {(() => { const kc = getKpiColor('totalPipelineARR', totalARR); return (
                        <div className={`kpi-card home-style accent-blue ${kc.className}`} style={kc.toleranceColor ? { borderLeftColor: kc.toleranceColor } : {}}>
                            <div className="kpi-label">Total Pipeline ARR</div>
                            <div className="kpi-value">${totalARR.toLocaleString()}</div>
                        </div>); })()}
                        {(() => { const kc = getKpiColor('activeOpps', activeOpps); return (
                        <div className={`kpi-card home-style accent-purple ${kc.className}`} style={kc.toleranceColor ? { borderLeftColor: kc.toleranceColor } : {}}>
                            <div className="kpi-label">Active Opportunities</div>
                            <div className="kpi-value">{activeOpps}</div>
                        </div>); })()}
                        {(() => { const openCount = visibleTasks.filter(t => (t.status || (t.completed ? 'Completed' : 'Open')) !== 'Completed').length; const kc = getKpiColor('openTasks', openCount); return (
                        <div className={`kpi-card home-style accent-amber ${kc.className}`} style={kc.toleranceColor ? { borderLeftColor: kc.toleranceColor } : {}}>
                            <div className="kpi-label">Open Tasks</div>
                            <div className="kpi-value">{openCount}</div>
                        </div>); })()}
                        {(() => { const fv = nextQuarter ? nextQuarter[1] : 0; const kc = getKpiColor('nextQForecast', fv); return (
                        <div className={`kpi-card home-style accent-green ${kc.className}`} style={kc.toleranceColor ? { borderLeftColor: kc.toleranceColor } : {}}>
                            <div className="kpi-label">{nextQuarter ? nextQuarter[0] : 'Next Quarter'} Forecast</div>
                            <div className="kpi-value">${nextQuarter ? nextQuarter[1].toLocaleString() : '0'}</div>
                        </div>); })()}
                    </div>

                    {/* ── CROSS-PIPELINE SUMMARY (only when multiple pipelines) ── */}
                    {allPipelines.length > 1 && (() => {
                        const allVisibleOpps = canSeeAll ? (opportunities||[]) : (opportunities||[]).filter(o => !o.salesRep || o.salesRep === currentUser);
                        return (
                            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.07)', marginBottom: '1.5rem', overflow: 'hidden' }}>
                                <div style={{ padding: '0.875rem 1.5rem', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <div style={{ fontSize: '0.6875rem', fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em' }}>All Pipelines</div>
                                    <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Org total across all pipelines</div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${allPipelines.length}, 1fr)`, gap: 0 }}>
                                    {allPipelines.map((p, idx) => {
                                        const pOpps = allVisibleOpps.filter(o => (o.pipelineId||'default') === p.id);
                                        const active = pOpps.filter(o => o.stage !== 'Closed Won' && o.stage !== 'Closed Lost');
                                        const won    = pOpps.filter(o => o.stage === 'Closed Won');
                                        const pipelineARR = active.reduce((s,o) => s+(o.arr||0), 0);
                                        const wonARR = won.reduce((s,o) => s+(o.arr||0)+(o.implementationCost||0), 0);
                                        const isCurrent = p.id === activePipeline.id;
                                        return (
                                            <div key={p.id} onClick={() => setActivePipelineId(p.id)} style={{
                                                padding: '1rem 1.5rem', cursor: 'pointer', transition: 'background 0.15s',
                                                borderRight: idx < allPipelines.length-1 ? '1px solid #f1f5f9' : 'none',
                                                background: isCurrent ? '#fafbff' : '#fff',
                                                borderTop: isCurrent ? `3px solid ${p.color}` : '3px solid transparent',
                                            }}
                                            onMouseEnter={e => { if (!isCurrent) e.currentTarget.style.background = '#f8fafc'; }}
                                            onMouseLeave={e => { if (!isCurrent) e.currentTarget.style.background = '#fff'; }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                                                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: p.color, flexShrink: 0 }} />
                                                    <span style={{ fontWeight: '800', fontSize: '0.875rem', color: '#1e293b' }}>{p.name}</span>
                                                    {isCurrent && <span style={{ fontSize: '0.5625rem', fontWeight: '700', background: p.color, color: '#fff', padding: '0.0625rem 0.375rem', borderRadius: '999px' }}>ACTIVE</span>}
                                                </div>
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                                    <div>
                                                        <div style={{ fontSize: '0.625rem', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Active ARR</div>
                                                        <div style={{ fontSize: '1.125rem', fontWeight: '800', color: '#1e293b' }}>${pipelineARR >= 1000000 ? (pipelineARR/1000000).toFixed(1)+'M' : pipelineARR >= 1000 ? Math.round(pipelineARR/1000)+'K' : pipelineARR.toLocaleString()}</div>
                                                        <div style={{ fontSize: '0.6875rem', color: '#64748b', marginTop: '0.125rem' }}>{active.length} deal{active.length!==1?'s':''}</div>
                                                    </div>
                                                    <div>
                                                        <div style={{ fontSize: '0.625rem', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Closed Won</div>
                                                        <div style={{ fontSize: '1.125rem', fontWeight: '800', color: '#10b981' }}>${wonARR >= 1000000 ? (wonARR/1000000).toFixed(1)+'M' : wonARR >= 1000 ? Math.round(wonARR/1000)+'K' : wonARR.toLocaleString()}</div>
                                                        <div style={{ fontSize: '0.6875rem', color: '#64748b', marginTop: '0.125rem' }}>{won.length} deal{won.length!==1?'s':''}</div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })()}

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.5rem', marginBottom: '1.5rem' }}>
                        <div className="table-container">
                            <div className="table-header">
                                <h2>UPCOMING TASKS</h2>
                                <button className="btn" onClick={() => setActiveTab('tasks')}>View All</button>
                            </div>
                            <div style={{ padding: '1.5rem' }}>
                                {visibleTasks.filter(t => (t.status || (t.completed ? 'Completed' : 'Open')) !== 'Completed').sort((a, b) => new Date(a.dueDate || '9999') - new Date(b.dueDate || '9999')).slice(0, 5).length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                                        No open tasks
                                    </div>
                                ) : (
                                    <div style={{ display: 'grid', gap: '0.75rem' }}>
                                        {visibleTasks.filter(t => (t.status || (t.completed ? 'Completed' : 'Open')) !== 'Completed').sort((a, b) => new Date(a.dueDate || '9999') - new Date(b.dueDate || '9999')).slice(0, 5).map(task => (
                                            <div key={task.id} style={{
                                                padding: '0.75rem',
                                                border: '1px solid #e2e8f0',
                                                borderRadius: '6px',
                                                background: '#f1f3f5'
                                            }}>
                                                <div style={{ fontWeight: '600', fontSize: '0.875rem', marginBottom: '0.25rem' }}>
                                                    {task.title}
                                                </div>
                                                <div style={{ fontSize: '0.8125rem', color: '#64748b' }}>
                                                    {task.type} • Due: {new Date(task.dueDate).toLocaleDateString()}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="table-container">
                            <div className="table-header">
                                <h2>PIPELINE BY QUARTER</h2>
                                <button className="btn" onClick={() => setActiveTab('analytics')}>View All</button>
                            </div>
                            <div style={{ padding: '1.5rem' }}>
                                {(() => {
                                    // Get current fiscal year quarters
                                    const currentDate = new Date();
                                    const currentYear = currentDate.getFullYear();
                                    const currentMonth = currentDate.getMonth() + 1;
                                    const fiscalStart = settings.fiscalYearStart || 10;
                                    
                                    // Determine current fiscal year
                                    let currentFiscalYear;
                                    if (currentMonth >= fiscalStart) {
                                        currentFiscalYear = currentYear + 1;
                                    } else {
                                        currentFiscalYear = currentYear;
                                    }

                                    // Calculate quarterly data for current fiscal year only
                                    const quarterlyData = {};
                                    opportunities.forEach(opp => {
                                        if (opp.forecastedCloseDate) {
                                            const quarter = getQuarter(opp.forecastedCloseDate);
                                            const quarterLabel = getQuarterLabel(quarter, opp.forecastedCloseDate);
                                            
                                            // Only include if it's in the current fiscal year
                                            if (quarterLabel.startsWith(`FY${currentFiscalYear}`)) {
                                                if (!quarterlyData[quarterLabel]) {
                                                    quarterlyData[quarterLabel] = {
                                                        count: 0,
                                                        totalValue: 0,
                                                        sortKey: new Date(opp.forecastedCloseDate).getTime()
                                                    };
                                                }
                                                quarterlyData[quarterLabel].count++;
                                                quarterlyData[quarterLabel].totalValue += (opp.arr + opp.implementationCost);
                                            }
                                        }
                                    });

                                    const sortedQuarters = Object.entries(quarterlyData)
                                        .sort((a, b) => a[1].sortKey - b[1].sortKey);
                                    
                                    const maxValue = sortedQuarters.length > 0 ? Math.max(...sortedQuarters.map(([_, data]) => data.totalValue)) : 1;

                                    return sortedQuarters.length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                                            No opportunities in FY{currentFiscalYear}
                                        </div>
                                    ) : (
                                        <div style={{ display: 'grid', gap: '1.25rem' }}>
                                            {sortedQuarters.map(([quarter, data]) => (
                                                <div key={quarter}>
                                                    <div style={{ 
                                                        display: 'flex', 
                                                        justifyContent: 'space-between',
                                                        alignItems: 'center',
                                                        marginBottom: '0.5rem'
                                                    }}>
                                                        <div>
                                                            <div style={{ 
                                                                fontSize: '0.875rem',
                                                                fontWeight: '700',
                                                                color: '#1e293b'
                                                            }}>
                                                                {quarter}
                                                            </div>
                                                            <div style={{ 
                                                                fontSize: '0.75rem',
                                                                color: '#64748b'
                                                            }}>
                                                                {data.count} opportunities
                                                            </div>
                                                        </div>
                                                        <div style={{ 
                                                            fontSize: '1rem', 
                                                            fontWeight: '800', 
                                                            color: '#f59e0b' 
                                                        }}>
                                                            ${data.totalValue.toLocaleString()}
                                                        </div>
                                                    </div>
                                                    <div style={{
                                                        height: '8px',
                                                        background: '#f1f3f5',
                                                        borderRadius: '4px',
                                                        overflow: 'hidden'
                                                    }}>
                                                        <div style={{
                                                            height: '100%',
                                                            width: `${(data.totalValue / maxValue) * 100}%`,
                                                            background: 'linear-gradient(90deg, var(--accent-primary), var(--accent-warning))',
                                                            transition: 'width 0.5s ease'
                                                        }} />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>
                    </div>

                    {/* Rep Leaderboard — managers/admins only, 2+ reps */}
                    {canSeeAll && (() => {
                        const lbReps = [...new Set([
                            ...(settings.users || []).filter(u => u.name).map(u => u.name),
                            ...visibleOpportunities.filter(o => o.salesRep).map(o => o.salesRep)
                        ])].sort();
                        if (lbReps.length < 2) return null;

                        const lbData = lbReps.map(rep => {
                            const repOpps = visibleOpportunities.filter(o => (o.salesRep || o.assignedTo) === rep);
                            const won = repOpps.filter(o => o.stage === 'Closed Won');
                            const open = repOpps.filter(o => o.stage !== 'Closed Won' && o.stage !== 'Closed Lost');
                            const wonRev = won.reduce((s, o) => s + (o.arr||0) + (o.implementationCost||0), 0);
                            const pipeline = open.reduce((s, o) => s + (o.arr||0) + (o.implementationCost||0), 0);
                            const total = repOpps.filter(o => o.stage === 'Closed Won' || o.stage === 'Closed Lost').length;
                            const winRate = total > 0 ? Math.round(won.length / total * 100) : null;
                            return { rep, wonRev, pipeline, wonDeals: won.length, openDeals: open.length, winRate };
                        }).sort((a, b) => b.wonRev - a.wonRev);

                        const maxWonRev = Math.max(...lbData.map(r => r.wonRev), 1);
                        const medals = ['🥇','🥈','🥉'];
                        const rankColors = ['#f59e0b','#94a3b8','#d97706'];

                        return (
                            <div className="table-container" style={{ marginBottom: '1.5rem' }}>
                                <div className="table-header">
                                    <h2>🏆 REP LEADERBOARD</h2>
                                    <button className="btn" onClick={() => setActiveTab('reports')}>Full Report</button>
                                </div>
                                <div style={{ padding: '1.25rem 1.5rem' }}>
                                    {/* Column headers */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1.5rem 1fr 2fr 5rem 5rem 5rem', gap: '0.75rem', alignItems: 'center', padding: '0 0.25rem 0.5rem', borderBottom: '1px solid #f1f5f9', marginBottom: '0.75rem' }}>
                                        <div></div>
                                        <div style={{ fontSize: '0.625rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Rep</div>
                                        <div style={{ fontSize: '0.625rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Won Revenue</div>
                                        <div style={{ fontSize: '0.625rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>Deals Won</div>
                                        <div style={{ fontSize: '0.625rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>Pipeline</div>
                                        <div style={{ fontSize: '0.625rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>Win Rate</div>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                                        {lbData.map(({ rep, wonRev, pipeline, wonDeals, openDeals, winRate }, i) => (
                                            <div key={rep} style={{ display: 'grid', gridTemplateColumns: '1.5rem 1fr 2fr 5rem 5rem 5rem', gap: '0.75rem', alignItems: 'center', padding: '0.625rem 0.25rem', borderRadius: '8px', background: i === 0 ? '#fffbeb' : 'transparent', transition: 'background 0.15s' }}
                                                onMouseEnter={e => { if (i > 0) e.currentTarget.style.background = '#f8fafc'; }}
                                                onMouseLeave={e => { if (i > 0) e.currentTarget.style.background = 'transparent'; }}>
                                                <div style={{ fontSize: '1rem', textAlign: 'center' }}>{medals[i] || <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#94a3b8' }}>{i+1}</span>}</div>
                                                <div style={{ fontWeight: '700', fontSize: '0.875rem', color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rep}</div>
                                                <div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                        <div style={{ flex: 1, height: '8px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                                                            <div style={{ height: '100%', width: (wonRev/maxWonRev*100) + '%', background: i === 0 ? 'linear-gradient(to right,#f59e0b,#10b981)' : 'linear-gradient(to right,#2563eb,#7c3aed)', borderRadius: '4px', transition: 'width 0.5s ease' }}></div>
                                                        </div>
                                                        <span style={{ fontSize: '0.8125rem', fontWeight: '700', color: '#1e293b', whiteSpace: 'nowrap', minWidth: '70px', textAlign: 'right' }}>${wonRev.toLocaleString()}</span>
                                                    </div>
                                                </div>
                                                <div style={{ textAlign: 'right', fontSize: '0.8125rem', fontWeight: '600', color: '#1e293b' }}>{wonDeals} <span style={{ fontSize: '0.6875rem', color: '#94a3b8', fontWeight: '400' }}>({openDeals} open)</span></div>
                                                <div style={{ textAlign: 'right', fontSize: '0.8125rem', color: '#64748b' }}>${Math.round(pipeline/1000)}K</div>
                                                <div style={{ textAlign: 'right' }}>
                                                    {winRate !== null
                                                        ? <span style={{ fontSize: '0.8125rem', fontWeight: '700', color: winRate >= 60 ? '#10b981' : winRate >= 40 ? '#f59e0b' : '#ef4444' }}>{winRate}%</span>
                                                        : <span style={{ fontSize: '0.75rem', color: '#cbd5e1' }}>—</span>}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        );
                    })()}

                    <div className="table-container">
                        <div className="table-header">
                            <h2>RECENT OPPORTUNITIES</h2>
                            <button className="btn" onClick={() => setActiveTab('pipeline')}>View All</button>
                        </div>
                        <div style={{ padding: '1.5rem' }}>
                            {visibleOpportunities.slice(0, 5).length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                                    No opportunities yet
                                </div>
                            ) : (
                                <div style={{ display: 'grid', gap: '0.75rem' }}>
                                    {visibleOpportunities.slice(0, 5).map(opp => (
                                        <div key={opp.id} style={{
                                            padding: '0.75rem',
                                            border: '1px solid #e2e8f0',
                                            borderRadius: '6px',
                                            background: '#f1f3f5'
                                        }}>
                                            <div style={{ fontWeight: '600', fontSize: '0.875rem', marginBottom: '0.25rem' }}>
                                                {opp.account} - {opp.site}
                                            </div>
                                            <div style={{ fontSize: '0.8125rem', color: '#64748b' }}>
                                                ${opp.arr.toLocaleString()} ARR • {opp.stage}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'pipeline' && (
                <div className="tab-page" onClick={() => healthPopover && setHealthPopover(null)}>
                    {/* ════ HORIZONTAL SUMMARY PANEL ════ */}
                    <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'visible', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>

                        {/* ── Panel header: title + all filters ── */}
                        {(() => {
                            const todayDate = new Date();
                            const currentQ2 = getQuarter(todayDate.toISOString().split('T')[0]);
                            const currentQL2 = getQuarterLabel(currentQ2, todayDate.toISOString().split('T')[0]);
                            const qNum2 = parseInt(currentQ2.replace('Q', ''));
                            const nextQ2 = 'Q' + (qNum2 < 4 ? qNum2 + 1 : 1);
                            const nextMonth2 = new Date(todayDate);
                            nextMonth2.setMonth(todayDate.getMonth() + 3);
                            const nextQL2 = getQuarterLabel(nextQ2, nextMonth2.toISOString().split('T')[0]);
                            const timeFilterOpts = [
                                { key: 'currentQ', label: 'Current Qtr', match: (opp) => opp.closeQuarter === currentQL2 },
                                { key: 'currentNextQ', label: 'Cur + Next', match: (opp) => opp.closeQuarter === currentQL2 || opp.closeQuarter === nextQL2 },
                                { key: 'annual', label: 'Annual', match: (opp) => { const fy = currentQL2.split(' ')[0]; return opp.closeQuarter && opp.closeQuarter.startsWith(fy); }},
                                { key: 'Q1', label: 'Q1', match: (opp) => opp.closeQuarter && opp.closeQuarter.includes('Q1') },
                                { key: 'Q2', label: 'Q2', match: (opp) => opp.closeQuarter && opp.closeQuarter.includes('Q2') },
                                { key: 'Q3', label: 'Q3', match: (opp) => opp.closeQuarter && opp.closeQuarter.includes('Q3') },
                                { key: 'Q4', label: 'Q4', match: (opp) => opp.closeQuarter && opp.closeQuarter.includes('Q4') },
                            ];
                            window.__pipelineFilterOptions = timeFilterOpts;
                            const allReps2 = canSeeAll ? [...new Set([
                                ...(settings.users||[]).filter(u => u.name).map(u => u.name),
                                ...visibleOpportunities.filter(o => o.salesRep).map(o => o.salesRep)
                            ])].sort() : [];
                            const allTeams2 = canSeeAll ? [...new Set((settings.users||[]).filter(u => u.team).map(u => u.team))].sort() : [];
                            const allTerritories2 = canSeeAll ? [...new Set((settings.users||[]).filter(u => u.territory).map(u => u.territory))].sort() : [];
                            const anyActive2 = pipelineQuarterFilter.length > 0 || pipelineStageFilter.length > 0 ||
                                pipelineRepFilter.length > 0 || pipelineTeamFilter.length > 0 || pipelineTerritoryFilter.length > 0;
                            const PD = ({ label, icon, options, selected, onToggle, onClear, renderOption }) => {
                                const [open, setOpen] = React.useState(false);
                                const ref = React.useRef(null);
                                React.useEffect(() => {
                                    if (!open) return;
                                    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
                                    document.addEventListener('mousedown', h);
                                    return () => document.removeEventListener('mousedown', h);
                                }, [open]);
                                const isActive = selected.length > 0;
                                const activeLabels = selected.map(s => options.find(o => (o.key || o) === s)).filter(Boolean).map(o => o.label || o);
                                const btnLabel = isActive ? (activeLabels.length === 1 ? `${label}: ${activeLabels[0]}` : `${label}: ${activeLabels.length}`) : label;
                                return (
                                    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
                                        <button onClick={() => setOpen(o => !o)} style={{
                                            display: 'flex', alignItems: 'center', gap: '0.3rem',
                                            padding: '0.2rem 0.5rem', borderRadius: '6px', cursor: 'pointer',
                                            fontFamily: 'inherit', fontSize: '0.6875rem', fontWeight: '700',
                                            transition: 'all 0.15s', whiteSpace: 'nowrap',
                                            border: '1px solid ' + (isActive ? '#2563eb' : '#e2e8f0'),
                                            background: isActive ? '#2563eb' : '#f8fafc',
                                            color: isActive ? '#fff' : '#64748b',
                                        }}>
                                            {icon && <span style={{ fontSize: '0.75rem' }}>{icon}</span>}
                                            <span>{btnLabel}</span>
                                            <span style={{ fontSize: '0.5rem', opacity: 0.6 }}>{open ? '▲' : '▼'}</span>
                                        </button>
                                        {open && (
                                            <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 400,
                                                background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px',
                                                boxShadow: '0 8px 24px rgba(0,0,0,0.12)', minWidth: '170px', overflow: 'hidden' }}>
                                                <div onClick={() => { onClear(); setOpen(false); }}
                                                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem',
                                                        padding: '0.5rem 0.75rem', cursor: 'pointer', fontSize: '0.8125rem',
                                                        color: !isActive ? '#2563eb' : '#1e293b', fontWeight: !isActive ? '700' : '400',
                                                        background: !isActive ? '#eff6ff' : 'transparent', borderBottom: '1px solid #f1f5f9' }}>
                                                    <span style={{ width: '14px', textAlign: 'center', fontSize: '0.75rem' }}>{!isActive ? '✓' : ''}</span>
                                                    <span>All</span>
                                                </div>
                                                {options.map(opt => {
                                                    const key = opt.key || opt;
                                                    const checked = selected.includes(key);
                                                    return (
                                                        <div key={key} onClick={() => onToggle(key)}
                                                            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem',
                                                                padding: '0.5rem 0.75rem', cursor: 'pointer', fontSize: '0.8125rem',
                                                                color: checked ? '#2563eb' : '#1e293b', fontWeight: checked ? '700' : '400',
                                                                background: checked ? '#eff6ff' : 'transparent', transition: 'background 0.1s' }}>
                                                            <span style={{ width: '14px', textAlign: 'center', fontSize: '0.75rem' }}>{checked ? '✓' : ''}</span>
                                                            {renderOption ? renderOption(opt, checked) : <span>{opt.label || opt}</span>}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                );
                            };
                            return (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.625rem 1rem', borderBottom: '1px solid #f1f5f9', flexWrap: 'wrap' }}>
                                    {/* Title */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginRight: '0.5rem', flexShrink: 0 }}>
                                        <div style={{ width: '3px', height: '18px', background: 'linear-gradient(to bottom, #2563eb, #7c3aed)', borderRadius: '2px' }} />
                                        <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#0f172a' }}>Pipeline KPIs</span>
                                    </div>
                                    {/* Divider */}
                                    <div style={{ width: '1px', height: '16px', background: '#e2e8f0', flexShrink: 0 }} />
                                    <span style={{ fontSize: '0.6rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', flexShrink: 0 }}>Filter by</span>

                                    {/* Pipeline selector */}
                                    {allPipelines.length > 1 && (
                                        <SliceDropdown label="Pipeline" icon="🔀"
                                            options={allPipelines.map(p => p.name)}
                                            selected={activePipeline.name}
                                            colorMap={Object.fromEntries(allPipelines.map(p => [p.name, p.color]))}
                                            activeColor={activePipeline.color}
                                            onSelect={name => { const p = allPipelines.find(pl => pl.name === name); if (p) setActivePipelineId(p.id); }}
                                            alwaysActive />
                                    )}

                                    {/* Time */}
                                    <PD label="Time" icon="⏱" options={timeFilterOpts}
                                        selected={pipelineQuarterFilter}
                                        onToggle={key => setPipelineQuarterFilter(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])}
                                        onClear={() => setPipelineQuarterFilter([])} />

                                    {/* Stage */}
                                    <PD label="Stage" icon="📊" options={[{key:'__allOpen__', label:'All Open'}, ...stages]}
                                        selected={pipelineStageFilter}
                                        onToggle={s => {
                                            if (s === '__allOpen__') {
                                                setPipelineStageFilter(prev => prev.includes('__allOpen__') ? [] : ['__allOpen__']);
                                            } else {
                                                setPipelineStageFilter(prev => {
                                                    const without = prev.filter(x => x !== '__allOpen__');
                                                    return without.includes(s) ? without.filter(x => x !== s) : [...without, s];
                                                });
                                            }
                                        }}
                                        onClear={() => setPipelineStageFilter([])}
                                        renderOption={(opt, checked) => {
                                            const s = opt.key || opt;
                                            if (s === '__allOpen__') return <span style={{ fontWeight:'700', color:'#2563eb' }}>All Open</span>;
                                            const sc = getStageColor(s);
                                            return <span style={{ display:'flex', alignItems:'center', gap:'0.375rem' }}>
                                                <span style={{ width:'8px', height:'8px', borderRadius:'50%', background: sc.text, flexShrink:0 }}></span>
                                                <span>{s}</span>
                                            </span>;
                                        }} />

                                    {/* Rep */}
                                    {allReps2.length >= 2 && (
                                        <PD label="Rep" icon="👤" options={allReps2}
                                            selected={pipelineRepFilter}
                                            onToggle={r => setPipelineRepFilter(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r])}
                                            onClear={() => setPipelineRepFilter([])} />
                                    )}

                                    {/* Team */}
                                    {allTeams2.length > 0 && (
                                        <PD label="Team" icon="👥" options={allTeams2}
                                            selected={pipelineTeamFilter}
                                            onToggle={t => setPipelineTeamFilter(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])}
                                            onClear={() => setPipelineTeamFilter([])} />
                                    )}

                                    {/* Territory */}
                                    {allTerritories2.length > 0 && (
                                        <PD label="Territory" icon="📍" options={allTerritories2}
                                            selected={pipelineTerritoryFilter}
                                            onToggle={t => setPipelineTerritoryFilter(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])}
                                            onClear={() => setPipelineTerritoryFilter([])} />
                                    )}

                                    {/* Clear all */}
                                    {anyActive2 && (
                                        <button onClick={() => { setPipelineQuarterFilter([]); setPipelineStageFilter([]); setPipelineRepFilter([]); setPipelineTeamFilter([]); setPipelineTerritoryFilter([]); }}
                                            style={{ padding: '0.2rem 0.45rem', borderRadius: '4px', border: '1px solid #fca5a5', background: '#fff', color: '#ef4444', fontSize: '0.625rem', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>
                                            ✕ Clear
                                        </button>
                                    )}

                                    {/* Deal count — right side */}
                                    <span style={{ marginLeft: 'auto', fontSize: '0.6875rem', color: '#94a3b8', fontWeight: '600', flexShrink: 0 }}>{pipelineFilteredOpps.length} deals</span>
                                </div>
                            );
                        })()}

                        {/* Two-column body: KPIs left | Stage bars right */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1px 1fr' }}>

                            {/* LEFT: 2×2 KPI tile grid */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.625rem', padding: '0.875rem 1rem' }}>
                                {[
                                    { label: 'Total Pipeline ARR', value: '$' + (pipelineTotalARR >= 1000000 ? (pipelineTotalARR/1000000).toFixed(1)+'M' : pipelineTotalARR >= 1000 ? Math.round(pipelineTotalARR/1000)+'K' : pipelineTotalARR.toLocaleString()), kpiId: 'totalPipelineARR', rawVal: pipelineTotalARR, accent: '#2563eb' },
                                    { label: 'Active Opportunities', value: String(pipelineActiveOpps), kpiId: 'activeOpps', rawVal: pipelineActiveOpps, accent: '#10b981' },
                                    { label: 'Avg ARR', value: '$' + (pipelineAvgARR >= 1000000 ? (pipelineAvgARR/1000000).toFixed(1)+'M' : Math.round(pipelineAvgARR/1000)+'K'), kpiId: 'avgARR', rawVal: pipelineAvgARR, accent: '#f59e0b' },
                                    { label: (pipelineNextQtr ? pipelineNextQtr[0] : 'Next Qtr') + ' Forecast', value: '$' + ((pipelineNextQtr?pipelineNextQtr[1]:0) >= 1000000 ? ((pipelineNextQtr?pipelineNextQtr[1]:0)/1000000).toFixed(1)+'M' : Math.round((pipelineNextQtr?pipelineNextQtr[1]:0)/1000)+'K'), kpiId: 'nextQForecast', rawVal: pipelineNextQtr ? pipelineNextQtr[1] : 0, accent: '#7c3aed' },
                                ].map(({ label, value, kpiId, rawVal, accent }) => {
                                    const kc = getKpiColor(kpiId, rawVal);
                                    const borderColor = kc.toleranceColor || accent;
                                    return (
                                        <div key={label} style={{
                                            background: '#f8fafc', border: '1px solid #f1f5f9',
                                            borderLeft: `3px solid ${borderColor}`,
                                            borderRadius: '8px', padding: '0.5rem 0.75rem'
                                        }}>
                                            <div style={{ fontSize: '0.575rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.3rem' }}>{label}</div>
                                            <div style={{ fontSize: '1.125rem', fontWeight: '800', color: '#1e293b', letterSpacing: '-0.02em', lineHeight: 1 }}>{value}</div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Vertical divider */}
                            <div style={{ background: '#f1f5f9' }}></div>

                            {/* RIGHT: Stage funnel bars */}
                            {(() => {
                                const openOpps = pipelineFilteredOpps.filter(o => o.stage !== 'Closed Won' && o.stage !== 'Closed Lost');
                                const stageGroups = stages
                                    .filter(s => s !== 'Closed Won' && s !== 'Closed Lost')
                                    .map(s => ({
                                        stage: s,
                                        count: openOpps.filter(o => o.stage === s).length,
                                        arr: openOpps.filter(o => o.stage === s).reduce((sum, o) => sum + (o.arr || 0), 0)
                                    }))
                                    .filter(g => g.count > 0);
                                const maxArr = stageGroups.reduce((m, g) => Math.max(m, g.arr), 1);
                                return (
                                    <div style={{ padding: '0.875rem 1rem' }}>
                                        <div style={{ fontSize: '0.575rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.625rem' }}>By Stage</div>
                                        {stageGroups.length === 0 ? (
                                            <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>No open opportunities</div>
                                        ) : (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                {stageGroups.map(g => {
                                                    const sc = getStageColor(g.stage);
                                                    const pct = Math.round((g.arr / maxArr) * 100);
                                                    return (
                                                        <div key={g.stage}>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.2rem' }}>
                                                                <span style={{ fontSize: '0.6375rem', fontWeight: '600', color: sc.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '55%' }}>{g.stage}</span>
                                                                <span style={{ fontSize: '0.575rem', color: '#94a3b8', fontWeight: '500', flexShrink: 0 }}>{g.count} · ${g.arr >= 1000 ? Math.round(g.arr/1000)+'K' : g.arr}</span>
                                                            </div>
                                                            <div style={{ height: '5px', background: '#f1f5f9', borderRadius: '3px', overflow: 'hidden' }}>
                                                                <div style={{ height: '5px', background: sc.text, borderRadius: '3px', width: pct + '%', opacity: 0.75 }} />
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}

                        </div>
                    </div>
                    {/* ════ END SUMMARY PANEL ════ */}

                    {/* ════ VIEW TOGGLE ════ */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem', borderTop: '1px solid #e2e8f0', background: '#f8fafc' }}>
                        <span style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginRight: '0.25rem' }}>View:</span>
                        {[{key:'funnel',label:'🔻 Funnel'},{key:'kanban',label:'🗂 Kanban'},{key:'table',label:'☰ Table'}].map(v => (
                            <button key={v.key} onClick={() => { setPipelineView(v.key); localStorage.setItem('pipelineView', v.key); setFunnelExpandedStage(null); }}
                                style={{ padding: '0.3rem 0.75rem', border: '1px solid ' + (pipelineView === v.key ? '#2563eb' : '#e2e8f0'), borderRadius: '6px', background: pipelineView === v.key ? '#2563eb' : '#fff', color: pipelineView === v.key ? '#fff' : '#64748b', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}>
                                {v.label}
                            </button>
                        ))}
                    </div>

                    {/* ════ FUNNEL VIEW ════ */}
                    {pipelineView === 'funnel' && (
                        <FunnelView
                            stages={stages}
                            pipelineFilteredOpps={pipelineFilteredOpps}
                            funnelExpandedStage={funnelExpandedStage}
                            setFunnelExpandedStage={setFunnelExpandedStage}
                            settings={settings}
                            handleEdit={handleEdit}
                            handleDelete={handleDelete}
                        />
                    )}

                    {/* ════ KANBAN VIEW ════ */}
                    {pipelineView === 'kanban' && (
                        <KanbanView
                            stages={stages}
                            pipelineFilteredOpps={pipelineFilteredOpps}
                            kanbanDragging={kanbanDragging}
                            kanbanDragOver={kanbanDragOver}
                            setKanbanDragging={setKanbanDragging}
                            setKanbanDragOver={setKanbanDragOver}
                            opportunities={opportunities}
                            setOpportunities={setOpportunities}
                            currentUser={currentUser}
                            calculateDealHealth={calculateDealHealth}
                            handleEdit={handleEdit}
                            handleDelete={handleDelete}
                        />
                    )}


                    {/* ════ FULL-WIDTH TABLE ════ */}
                    {pipelineView === 'table' && (
                    <div className="table-container">
                        {/* ── Opportunities header: title + New button + count + CSV ── */}
                        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0.625rem 1rem', borderBottom:'1px solid #e2e8f0', gap:'0.5rem' }}>
                            <h2 style={{ margin:0, fontSize:'0.75rem', fontWeight:'800', color:'#0f172a', textTransform:'uppercase', letterSpacing:'0.05em' }}>Opportunities</h2>
                            <div style={{ display:'flex', gap:'0.5rem', alignItems:'center' }}>
                                <span style={{ fontSize:'0.6875rem', color:'#94a3b8', fontWeight:'600' }}>{pipelineFilteredOpps.length} deals</span>
                                <button className="btn btn-secondary" style={{ padding:'0.3rem 0.625rem', fontSize:'0.6875rem' }} onClick={() => {
                                    exportToCSV(
                                        `pipeline-${new Date().toISOString().slice(0,10)}.csv`,
                                        ['Account','Site','Stage','ARR','Impl Cost','Total Value','Close Date','Quarter','Rep','Team','Territory','Probability','Deal Health','Notes','Next Steps'],
                                        pipelineFilteredOpps.map(o => [
                                            o.account, o.site, o.stage,
                                            o.arr||0, o.implementationCost||0, (o.arr||0)+(o.implementationCost||0),
                                            o.forecastedCloseDate, o.closeQuarter, o.salesRep||o.assignedTo,
                                            (settings.users||[]).find(u=>u.name===(o.salesRep||o.assignedTo))?.team||'',
                                            (settings.users||[]).find(u=>u.name===(o.salesRep||o.assignedTo))?.territory||'',
                                            o.probability||'', calculateDealHealth(o).score,
                                            o.notes||'', o.nextSteps||''
                                        ])
                                    );
                                }}>📤 Export</button>
                                <button className="btn" onClick={handleAddNew} style={{ padding:'0.3rem 0.75rem', fontSize:'0.6875rem', fontWeight:'700' }}>+ New</button>
                            </div>
                        </div>
                        {selectedOpps.length > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.625rem 1.5rem', background: '#eff6ff', borderBottom: '1px solid #bfdbfe', flexWrap: 'wrap' }}>
                                <span style={{ fontWeight: '700', fontSize: '0.8125rem', color: '#1d4ed8' }}>
                                    {selectedOpps.length} selected
                                </span>
                                <div style={{ width: '1px', height: '18px', background: '#bfdbfe' }} />
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                                    <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '600' }}>Stage:</span>
                                    <select value={bulkAction.stage} onChange={e => setBulkAction(a => ({ ...a, stage: e.target.value }))}
                                        style={{ fontSize: '0.75rem', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '0.2rem 0.5rem', background: '#fff', color: '#1e293b', cursor: 'pointer' }}>
                                        <option value="">— pick stage —</option>
                                        {stages.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                    {bulkAction.stage && (
                                        <button onClick={() => {
                                            const today = new Date().toISOString().split('T')[0];
                                            setOpportunities(prev => prev.map(o => selectedOpps.includes(o.id) ? {
                                                ...o, stage: bulkAction.stage, stageChangedDate: today,
                                                stageHistory: [...(o.stageHistory||[]), { stage: bulkAction.stage, date: today, prevStage: o.stage, author: currentUser||'', timestamp: new Date().toISOString() }]
                                            } : o));
                                            setSelectedOpps([]); setBulkAction({ stage: '', rep: '' });
                                        }} style={{ padding: '0.2rem 0.625rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>
                                            Apply
                                        </button>
                                    )}
                                </div>
                                <div style={{ width: '1px', height: '18px', background: '#bfdbfe' }} />
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                                    <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '600' }}>Assign to:</span>
                                    <select value={bulkAction.rep} onChange={e => setBulkAction(a => ({ ...a, rep: e.target.value }))}
                                        style={{ fontSize: '0.75rem', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '0.2rem 0.5rem', background: '#fff', color: '#1e293b', cursor: 'pointer' }}>
                                        <option value="">— pick rep —</option>
                                        {[...new Set((settings.users||[]).filter(u=>u.userType!=='Admin'&&u.userType!=='Manager').map(u=>u.name).filter(Boolean))].sort().map(n => <option key={n} value={n}>{n}</option>)}
                                    </select>
                                    {bulkAction.rep && (
                                        <button onClick={() => {
                                           setSelectedOpps([]); setBulkAction({ stage: '', rep: '' });
                                        }} style={{ padding: '0.2rem 0.625rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>
                                            Apply
                                        </button>
                                    )}
 
                                </div>
                                <div style={{ width: '1px', height: '18px', background: '#bfdbfe' }} />
                                <button onClick={() => {
                                   showConfirm('Delete ' + selectedOpps.length + '...', () => {
    const idsToDelete = [...selectedOpps];
    const snapshot = [...opportunities];
    setOpportunities(prev => prev.filter(o => !idsToDelete.includes(o.id)));
    setSelectedOpps([]);
    idsToDelete.forEach(id => {
        dbFetch(`/.netlify/functions/opportunities?id=${id}`, { method: 'DELETE' })
            .catch(err => console.error('Failed to delete opportunity:', err));
    });
    softDelete(
        `${idsToDelete.length} opportunit${idsToDelete.length === 1 ? 'y' : 'ies'}`,
        () => {},
        () => { setOpportunities(snapshot); setUndoToast(null); }
    );
});
                                }} style={{ padding: '0.2rem 0.625rem', background: '#ef4444', color: 'white', border: 'none', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>
                                    🗑 Delete
                                </button>
                                <button onClick={() => { setSelectedOpps([]); setBulkAction({ stage: '', rep: '' }); }}
                                    style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#64748b', fontSize: '0.75rem', cursor: 'pointer', fontFamily: 'inherit', fontWeight: '600' }}>
                                    Clear selection ✕
                                </button>
                            </div>
                        )}

                        <div className="table-wrapper">
                            {/* Stale deals warning banner */}
                            {(() => {
                                const staleDeals = pipelineFilteredOpps.filter(opp => {
                                    if (opp.stage === 'Closed Won' || opp.stage === 'Closed Lost') return false;
                                    if (!opp.stageChangedDate) return false;
                                    const days = Math.floor((new Date() - new Date(opp.stageChangedDate)) / 86400000);
                                    return days > 30;
                                });
                                const noActivityDeals = pipelineFilteredOpps.filter(opp => {
                                    if (opp.stage === 'Closed Won' || opp.stage === 'Closed Lost') return false;
                                    return activities.filter(a => a.opportunityId === opp.id).length === 0;
                                });
                                if (staleDeals.length === 0 && noActivityDeals.length === 0) return null;
                                return (
                                    <div style={{ padding: '0.625rem 1rem', background: '#fffbeb', border: '1px solid #fde68a', borderBottom: '1px solid #fde68a', display: 'flex', gap: '1.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                        <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#92400e' }}>⚠ Pipeline Attention</span>
                                        {staleDeals.length > 0 && (
                                            <span style={{ fontSize: '0.75rem', color: '#b45309' }}>
                                                <strong>{staleDeals.length}</strong> deal{staleDeals.length > 1 ? 's' : ''} stuck in stage &gt;30 days
                                                {staleDeals.length <= 3 && ': ' + staleDeals.map(o => o.account || o.opportunityName).join(', ')}
                                            </span>
                                        )}
                                        {staleDeals.length > 0 && noActivityDeals.length > 0 && <span style={{ color: '#fbbf24' }}>·</span>}
                                        {noActivityDeals.length > 0 && (
                                            <span style={{ fontSize: '0.75rem', color: '#b45309' }}>
                                                <strong>{noActivityDeals.length}</strong> open deal{noActivityDeals.length > 1 ? 's' : ''} with no activities logged
                                            </span>
                                        )}
                                    </div>
                                );
                            })()}
                            <table>
                                <thead>
                                    <tr>
                                        <th style={{ width: '36px' }}>
                                            <input type="checkbox"
                                                checked={pipelineFilteredOpps.length > 0 && selectedOpps.length === pipelineFilteredOpps.length}
                                                onChange={e => setSelectedOpps(e.target.checked ? pipelineFilteredOpps.map(o => o.id) : [])}
                                                style={{ width: '15px', height: '15px', cursor: 'pointer', accentColor: '#2563eb' }}
                                            />
                                        </th>
                                        <th>Health</th>
                                        <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => { if (pipelineSortField === 'salesRep') setPipelineSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setPipelineSortField('salesRep'); setPipelineSortDir('asc'); } }}>Sales Rep {pipelineSortField === 'salesRep' ? (pipelineSortDir === 'asc' ? <span style={{color:'#2563eb',fontSize:'0.7rem'}}>▲</span> : <span style={{color:'#2563eb',fontSize:'0.7rem'}}>▼</span>) : <span style={{color:'#cbd5e1',fontSize:'0.7rem'}}>▼</span>}</th>
                                        <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => { if (pipelineSortField === 'account') setPipelineSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setPipelineSortField('account'); setPipelineSortDir('asc'); } }}>Account {pipelineSortField === 'account' ? (pipelineSortDir === 'asc' ? <span style={{color:'#2563eb',fontSize:'0.7rem'}}>▲</span> : <span style={{color:'#2563eb',fontSize:'0.7rem'}}>▼</span>) : <span style={{color:'#cbd5e1',fontSize:'0.7rem'}}>▼</span>}</th>
                                        <th>Opportunity Name</th>
                                        <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => { if (pipelineSortField === 'stage') setPipelineSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setPipelineSortField('stage'); setPipelineSortDir('asc'); } }}>Stage {pipelineSortField === 'stage' ? (pipelineSortDir === 'asc' ? <span style={{color:'#2563eb',fontSize:'0.7rem'}}>▲</span> : <span style={{color:'#2563eb',fontSize:'0.7rem'}}>▼</span>) : <span style={{color:'#cbd5e1',fontSize:'0.7rem'}}>▼</span>}</th>
                                        {canViewField('arr') && <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => { if (pipelineSortField === 'arr') setPipelineSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setPipelineSortField('arr'); setPipelineSortDir('desc'); } }}>ARR {pipelineSortField === 'arr' ? (pipelineSortDir === 'asc' ? <span style={{color:'#2563eb',fontSize:'0.7rem'}}>▲</span> : <span style={{color:'#2563eb',fontSize:'0.7rem'}}>▼</span>) : <span style={{color:'#cbd5e1',fontSize:'0.7rem'}}>▼</span>}</th>}
                                        {canViewField('implCost') && <th>Impl. Cost</th>}
                                        {canViewField('probability') && <th>Prob %</th>}
                                        {canViewField('weightedValue') && <th>Weighted Value</th>}
                                        {canViewField('dealAge') && <th>Deal Age</th>}
                                        {canViewField('timeInStage') && <th>Time in Stage</th>}
                                        {canViewField('activities') && <th>Activities</th>}
                                        <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => { if (pipelineSortField === 'closeDate') setPipelineSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setPipelineSortField('closeDate'); setPipelineSortDir('asc'); } }}>Close Date {pipelineSortField === 'closeDate' ? (pipelineSortDir === 'asc' ? <span style={{color:'#2563eb',fontSize:'0.7rem'}}>▲</span> : <span style={{color:'#2563eb',fontSize:'0.7rem'}}>▼</span>) : <span style={{color:'#cbd5e1',fontSize:'0.7rem'}}>▼</span>}</th>
                                        <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => { if (pipelineSortField === 'closeQuarter') setPipelineSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setPipelineSortField('closeQuarter'); setPipelineSortDir('asc'); } }}>Close Quarter {pipelineSortField === 'closeQuarter' ? (pipelineSortDir === 'asc' ? <span style={{color:'#2563eb',fontSize:'0.7rem'}}>▲</span> : <span style={{color:'#2563eb',fontSize:'0.7rem'}}>▼</span>) : <span style={{color:'#cbd5e1',fontSize:'0.7rem'}}>▼</span>}</th>
                                        {canViewField('nextSteps') && <th>Next Steps</th>}
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {pipelineFilteredOpps
                                        .filter(opp => {
                                            if (pipelineQuarterFilter.length === 0) return true;
                                            const opts = window.__pipelineFilterOptions || [];
                                            return pipelineQuarterFilter.some(key => {
                                                const opt = opts.find(o => o.key === key);
                                                return opt && opt.match(opp);
                                            });
                                        })
                                        .filter(opp => {
                                            if (pipelineStageFilter.length === 0) return true;
                                            if (pipelineStageFilter.includes('__allOpen__')) return opp.stage !== 'Closed Won' && opp.stage !== 'Closed Lost';
                                            return pipelineStageFilter.includes(opp.stage);
                                        })
                                        .filter(opp => {
                                            if (pipelineRepFilter.length === 0) return true;
                                            return pipelineRepFilter.includes(opp.salesRep) || pipelineRepFilter.includes(opp.assignedTo);
                                        })
                                        .filter(opp => {
                                            if (pipelineTeamFilter.length === 0) return true;
                                            const rep = opp.salesRep || opp.assignedTo;
                                            const userRec = (settings.users || []).find(u => u.name === rep);
                                            return userRec && pipelineTeamFilter.includes(userRec.team);
                                        })
                                        .filter(opp => {
                                            if (pipelineTerritoryFilter.length === 0) return true;
                                            const rep = opp.salesRep || opp.assignedTo;
                                            const userRec = (settings.users || []).find(u => u.name === rep);
                                            return userRec && pipelineTerritoryFilter.includes(userRec.territory);
                                        })
                                        .sort((a, b) => {
                                            const dir = pipelineSortDir === 'asc' ? 1 : -1;
                                            switch (pipelineSortField) {
                                                case 'salesRep': return dir * (a.salesRep || '').localeCompare(b.salesRep || '');
                                                case 'account': return dir * (a.account || '').localeCompare(b.account || '');
                                                case 'stage': {
                                                    const order = ['Qualification','Discovery','Evaluation (Demo)','Proposal','Negotiation/Review','Contracts','Closed Won','Closed Lost'];
                                                    return dir * (order.indexOf(a.stage) - order.indexOf(b.stage));
                                                }
                                                case 'arr': return dir * ((a.arr || 0) - (b.arr || 0));
                                                case 'closeDate': return dir * (new Date(a.forecastedCloseDate || '9999') - new Date(b.forecastedCloseDate || '9999'));
                                                case 'closeQuarter': return dir * (a.closeQuarter || '').localeCompare(b.closeQuarter || '');
                                                default: return dir * (new Date(a.forecastedCloseDate || '9999') - new Date(b.forecastedCloseDate || '9999'));
                                            }
                                        })
                                        .map((opp, oppIdx) => {
                                            const health = calculateDealHealth(opp);
                                            return (
                                        <React.Fragment key={opp.id}>
                                        <tr style={{ background: selectedOpps.includes(opp.id) ? '#eff6ff' : oppIdx % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                                            <td onClick={e => e.stopPropagation()} style={{ width: '36px' }}>
                                                <input type="checkbox"
                                                    checked={selectedOpps.includes(opp.id)}
                                                    onChange={e => setSelectedOpps(prev => e.target.checked ? [...prev, opp.id] : prev.filter(id => id !== opp.id))}
                                                    style={{ width: '15px', height: '15px', cursor: 'pointer', accentColor: '#2563eb' }}
                                                />
                                            </td>
                                            <td style={{ position: 'relative' }}>
                                                <div style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '0.5rem',
                                                    cursor: 'pointer'
                                                }} onClick={(e) => { e.stopPropagation(); setHealthPopover(healthPopover === opp.id ? null : opp.id); }}>
                                                    <div style={{
                                                        width: '12px',
                                                        height: '12px',
                                                        borderRadius: '50%',
                                                        background: health.color
                                                    }} />
                                                    <span style={{ 
                                                        fontSize: '0.8125rem',
                                                        fontWeight: '600',
                                                        color: health.color
                                                    }}>
                                                        {health.status}
                                                    </span>
                                                </div>
                                                {healthPopover === opp.id && (
                                                    <div style={{
                                                        position: 'absolute', top: '100%', left: 0, zIndex: 1000,
                                                        background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px',
                                                        boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: '0.875rem 1rem',
                                                        minWidth: '280px', marginTop: '0.25rem'
                                                    }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.625rem' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                                                                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: health.color }} />
                                                                <span style={{ fontWeight: '700', fontSize: '0.875rem', color: health.color }}>{health.status}</span>
                                                                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>({health.score}/100)</span>
                                                            </div>
                                                            <button onClick={(e) => { e.stopPropagation(); setHealthPopover(null); }}
                                                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '1rem', padding: 0, lineHeight: 1 }}>×</button>
                                                        </div>
                                                        {health.reasons.map((reason, ri) => (
                                                            <div key={ri} style={{
                                                                display: 'flex', alignItems: 'flex-start', gap: '0.375rem',
                                                                padding: '0.3rem 0', fontSize: '0.8125rem', color: '#475569', lineHeight: 1.4
                                                            }}>
                                                                <span style={{ color: reason.includes('No activity in over') || reason.includes('overdue') || reason.includes('Stuck') || reason.includes('No activities logged') ? '#ef4444' : reason.includes('approaching') || reason.includes('In current stage for') ? '#f59e0b' : '#10b981', flexShrink: 0 }}>
                                                                    {reason.includes('No activity in over') || reason.includes('overdue') || reason.includes('Stuck') || reason.includes('No activities logged') ? '⚠' : reason.includes('approaching') || reason.includes('In current stage for') ? '○' : '✓'}
                                                                </span>
                                                                <span>{reason}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </td>
                                            <td style={{ whiteSpace: 'nowrap' }}>{opp.salesRep || '-'}</td>
                                            <td>{opp.account}</td>
                                            <td><span style={{ cursor: 'pointer', color: '#2563eb', fontWeight: '600' }} onClick={(e) => { e.stopPropagation(); setEditingOpp(opp); setShowModal(true); }}>{opp.opportunityName || '-'}</span></td>
                                            <td onClick={e => e.stopPropagation()}>
                                                {inlineEdit && inlineEdit.oppId === opp.id && inlineEdit.field === 'stage' ? (
                                                    <select autoFocus
                                                        value={inlineEdit.value}
                                                        onChange={e => {
                                                            const newStage = e.target.value;
                                                            const today = new Date().toISOString().split('T')[0];
                                                            const prevStageVal = opp.stage;
                                                            const updatedOpp = {
                                                                ...opp, stage: newStage,
                                                                stageChangedDate: today,
                                                                stageHistory: [...(opp.stageHistory || []), { stage: newStage, date: today, prevStage: opp.stage, author: currentUser || '', timestamp: new Date().toISOString() }]
                                                            };
                                                            setOpportunities(prev => prev.map(o => o.id === opp.id ? updatedOpp : o));
                                                            dbFetch('/.netlify/functions/opportunities', {
                                                                method: 'PUT',
                                                                headers: { 'Content-Type': 'application/json' },
                                                                body: JSON.stringify(updatedOpp)
                                                            }).catch(err => console.error('Failed to save stage change:', err));
                                                            addAudit('update', 'opportunity', opp.id, opp.opportunityName || opp.account || opp.id, `Stage: ${prevStageVal} → ${newStage}`);
                                                            setInlineEdit(null);
                                                        }}
                                                        onBlur={() => setInlineEdit(null)}
                                                        onKeyDown={e => { if (e.key === 'Escape') setInlineEdit(null); }}
                                                        style={{ fontSize: '0.6875rem', fontWeight: '600', border: '1.5px solid #2563eb', borderRadius: '6px', padding: '0.1rem 0.25rem', outline: 'none', background: '#fff', cursor: 'pointer', color: '#1e293b' }}>
                                                        {stages.map(s => <option key={s} value={s}>{s}</option>)}
                                                    </select>
                                                ) : (
                                                    <span title="Click to change stage"
                                                        onClick={() => setInlineEdit({ oppId: opp.id, field: 'stage', value: opp.stage })}
                                                        style={{ background: getStageColor(opp.stage).text + '22', color: getStageColor(opp.stage).text, padding: '0.125rem 0.5rem', borderRadius: '999px', fontSize: '0.6875rem', fontWeight: '600', whiteSpace: 'nowrap', display: 'inline-block', cursor: 'pointer', transition: 'opacity 0.1s' }}
                                                        onMouseEnter={e => e.currentTarget.style.opacity = '0.75'}
                                                        onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
                                                        {opp.stage} ✎
                                                    </span>
                                                )}
                                            </td>
{canViewField('arr') && (
                                            <td onClick={e => e.stopPropagation()}>
                                                {inlineEdit && inlineEdit.oppId === opp.id && inlineEdit.field === 'arr' ? (
                                                    <input autoFocus type="number" min="0"
                                                        defaultValue={opp.arr}
                                                        onBlur={e => {
                                                            const val = Math.max(0, parseInt(e.target.value) || 0);
                                                            setOpportunities(prev => prev.map(o => o.id === opp.id ? { ...o, arr: val } : o));
                                                            setInlineEdit(null);
                                                        }}
                                                        onKeyDown={e => {
                                                            if (e.key === 'Enter') e.target.blur();
                                                            if (e.key === 'Escape') setInlineEdit(null);
                                                        }}
                                                        style={{ width: '90px', fontSize: '0.8125rem', fontWeight: '600', border: '1.5px solid #2563eb', borderRadius: '6px', padding: '0.1rem 0.35rem', outline: 'none', color: '#1e293b' }}
                                                    />
                                                ) : (
                                                    <span title="Click to edit ARR"
                                                        onClick={() => setInlineEdit({ oppId: opp.id, field: 'arr', value: opp.arr })}
                                                        style={{ cursor: 'pointer', display: 'inline-block', transition: 'opacity 0.1s' }}
                                                        onMouseEnter={e => e.currentTarget.style.opacity = '0.65'}
                                                        onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
                                                        ${opp.arr.toLocaleString()} ✎
                                                    </span>
                                                )}
                                            </td>
)}
{canViewField('implCost') && (
                                            <td onClick={e => e.stopPropagation()}>
                                                {inlineEdit && inlineEdit.oppId === opp.id && inlineEdit.field === 'implementationCost' ? (
                                                    <input autoFocus type="number" min="0"
                                                        defaultValue={opp.implementationCost}
                                                        onBlur={e => {
                                                            const val = Math.max(0, parseInt(e.target.value) || 0);
                                                            setOpportunities(prev => prev.map(o => o.id === opp.id ? { ...o, implementationCost: val } : o));
                                                            setInlineEdit(null);
                                                        }}
                                                        onKeyDown={e => {
                                                            if (e.key === 'Enter') e.target.blur();
                                                            if (e.key === 'Escape') setInlineEdit(null);
                                                        }}
                                                        style={{ width: '90px', fontSize: '0.8125rem', fontWeight: '600', border: '1.5px solid #2563eb', borderRadius: '6px', padding: '0.1rem 0.35rem', outline: 'none', color: '#1e293b' }}
                                                    />
                                                ) : (
                                                    <span title="Click to edit Impl. Cost"
                                                        onClick={() => setInlineEdit({ oppId: opp.id, field: 'implementationCost', value: opp.implementationCost })}
                                                        style={{ cursor: 'pointer', display: 'inline-block', transition: 'opacity 0.1s' }}
                                                        onMouseEnter={e => e.currentTarget.style.opacity = '0.65'}
                                                        onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
                                                        ${opp.implementationCost.toLocaleString()} ✎
                                                    </span>
                                                )}
                                            </td>
)}
{canViewField('probability') && (
                                            <td style={{ whiteSpace: 'nowrap' }}>
                                                {(() => {
                                                    const stageDefault = (settings.funnelStages || []).find(s => s.name === opp.stage);
                                                    const defaultProb = stageDefault ? stageDefault.weight : null;
                                                    const effectiveProb = (opp.probability !== null && opp.probability !== undefined) ? opp.probability : defaultProb;
                                                    const isOverridden = opp.probability !== null && opp.probability !== undefined && opp.probability !== defaultProb;
                                                    return (
                                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                                                            <span style={{ fontWeight: '600', color: isOverridden ? '#f59e0b' : '#475569' }}>
                                                                {effectiveProb !== null ? effectiveProb + '%' : '—'}
                                                            </span>
                                                            {isOverridden && <span title="Rep override" style={{ fontSize: '0.625rem', color: '#f59e0b' }}>✎</span>}
                                                        </span>
                                                    );
                                                })()}
                                            </td>
)}
{canViewField('weightedValue') && (
                                            <td style={{ whiteSpace: 'nowrap' }}>
                                                {(() => {
                                                    const stageDefault = (settings.funnelStages || []).find(s => s.name === opp.stage);
                                                    const defaultProb = stageDefault ? stageDefault.weight / 100 : 0.3;
                                                    const prob = (opp.probability !== null && opp.probability !== undefined) ? opp.probability / 100 : defaultProb;
                                                    const total = (opp.arr || 0) + (opp.implementationCost || 0);
                                                    return '$' + Math.round(total * prob).toLocaleString();
                                                })()}
                                            </td>
)}
{canViewField('dealAge') && (
                                            <td style={{ whiteSpace: 'nowrap' }}>
                                                {(() => {
                                                    if (!opp.createdDate) return <span style={{ color: '#94a3b8' }}>—</span>;
                                                    const days = Math.floor((new Date() - new Date(opp.createdDate)) / 86400000);
                                                    const color = days > 90 ? '#ef4444' : days > 60 ? '#f59e0b' : '#475569';
                                                    return <span style={{ color, fontWeight: days > 60 ? '700' : '500' }}>{days}d</span>;
                                                })()}
                                            </td>
)}
{canViewField('timeInStage') && (
                                            <td style={{ whiteSpace: 'nowrap' }}>
                                                {(() => {
                                                    if (!opp.stageChangedDate) return <span style={{ color: '#94a3b8' }}>—</span>;
                                                    const days = Math.floor((new Date() - new Date(opp.stageChangedDate)) / 86400000);
                                                    const isOpen = opp.stage !== 'Closed Won' && opp.stage !== 'Closed Lost';
                                                    const color = isOpen && days > 30 ? '#ef4444' : isOpen && days > 14 ? '#f59e0b' : '#475569';
                                                    return <span style={{ color, fontWeight: (isOpen && days > 14) ? '700' : '500' }}>{days}d</span>;
                                                })()}
                                            </td>
)}
{canViewField('activities') && (
                                            <td style={{ whiteSpace: 'nowrap' }}>
                                                {(() => {
                                                    const count = activities.filter(a => a.opportunityId === opp.id).length;
                                                    const isOpen = opp.stage !== 'Closed Won' && opp.stage !== 'Closed Lost';
                                                    if (count === 0 && isOpen) {
                                                        return <span style={{ color: '#ef4444', fontWeight: '700', fontSize: '0.75rem' }}>⚠ None</span>;
                                                    }
                                                    if (count === 0) return <span style={{ color: '#94a3b8' }}>0</span>;
                                                    const lastAct = activities.filter(a => a.opportunityId === opp.id).sort((a,b) => new Date(b.date) - new Date(a.date))[0];
                                                    const daysSince = lastAct ? Math.floor((new Date() - new Date(lastAct.date)) / 86400000) : null;
                                                    return (
                                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                                                            <span style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', padding: '0.1rem 0.45rem', borderRadius: '999px', fontSize: '0.6875rem', fontWeight: '700' }}>{count}</span>
                                                            {daysSince !== null && isOpen && (
                                                                <span style={{ fontSize: '0.625rem', color: daysSince > 14 ? '#ef4444' : '#94a3b8' }}>{daysSince}d ago</span>
                                                            )}
                                                        </span>
                                                    );
                                                })()}
                                            </td>
)}
                                            <td style={{ whiteSpace: 'nowrap' }}>
                                                {new Date(opp.forecastedCloseDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                            </td>
                                            <td style={{ whiteSpace: 'nowrap' }}>
                                                {opp.closeQuarter || '-'}
                                            </td>
{canViewField('nextSteps') && (
                                            <td style={{ 
                                                minWidth: '200px',
                                                maxWidth: '300px',
                                                whiteSpace: 'normal',
                                                lineHeight: '1.4'
                                            }}>
                                                <div style={{ color: '#64748b', fontSize: '0.8125rem' }}>
                                                    {opp.nextSteps || '-'}
                                                </div>
                                            </td>
)}
                                            <td style={{ whiteSpace: 'nowrap' }}>
                                                <div className="action-buttons">
                                                    <button className="action-btn" onClick={() => {
                                                        setActivityInitialContext({ opportunityId: opp.id, opportunityName: opp.opportunityName || opp.account, companyName: opp.account });
                                                        setEditingActivity(null);
                                                        setShowActivityModal(true);
                                                    }}>+ Activity</button>
                                                    <button className="action-btn" onClick={() => {
                                                        setEditingTask({ relatedTo: opp.id, opportunityId: opp.id });
                                                        setShowTaskModal(true);
                                                    }}>+ Task</button>
                                                    <button className="action-btn" onClick={() => handleEdit(opp)}>Edit</button>
                                                    <button className="action-btn delete" onClick={() => handleDelete(opp.id)}>Delete</button>
                                                </div>
                                            </td>
                                        </tr>
                                        {/* Activity log expand panel */}
                                        {expandedOppActivities[opp.id] !== false && (() => {
                                            const oppActs = activities.filter(a => a.opportunityId === opp.id)
                                                .sort((a, b) => new Date(b.date) - new Date(a.date));
                                            if (oppActs.length === 0) return null;
                                            return (
                                                <tr key={opp.id + '-acts'} style={{ background: '#f8fafc' }}>
                                                    <td colSpan={99} style={{ padding: '0.5rem 1rem 0.5rem 2.5rem', borderBottom: '2px solid #e2e8f0' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.375rem' }}>
                                                            <span style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Activity Log</span>
                                                            <span style={{ fontSize: '0.625rem', background: '#dbeafe', color: '#1e40af', padding: '0.1rem 0.4rem', borderRadius: '999px', fontWeight: '700' }}>{oppActs.length}</span>
                                                        </div>
                                                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                            {oppActs.slice(0, 5).map(a => (
                                                                <div key={a.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '0.25rem 0.625rem', fontSize: '0.75rem', color: '#475569', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                                                                    <span style={{ background: '#dbeafe', color: '#1e40af', padding: '0.05rem 0.35rem', borderRadius: '3px', fontSize: '0.625rem', fontWeight: '700', flexShrink: 0 }}>{a.type}</span>
                                                                    <span style={{ color: '#94a3b8', flexShrink: 0 }}>{a.date ? new Date(a.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}</span>
                                                                    {a.notes && <span style={{ color: '#64748b', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.notes}</span>}
                                                                </div>
                                                            ))}
                                                            {oppActs.length > 5 && <span style={{ fontSize: '0.75rem', color: '#94a3b8', alignSelf: 'center' }}>+{oppActs.length - 5} more</span>}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })()}
                                        {opp.stage === 'Closed Lost' && opp.lostCategory && (
                                            <tr style={{ background: '#fff5f5' }}>
                                                <td colSpan={99} style={{ padding: '0.375rem 1rem 0.375rem 2rem', borderBottom: '1px solid #fecaca' }}>
                                                    <span style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginRight: '0.5rem' }}>Loss Reason:</span>
                                                    <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#b91c1c', background: '#fee2e2', padding: '0.1rem 0.5rem', borderRadius: '4px', marginRight: '0.5rem' }}>{opp.lostCategory}</span>
                                                    {opp.lostReason && <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{opp.lostReason}</span>}
                                                </td>
                                            </tr>
                                        )}
                                        </React.Fragment>
                                    );
                                })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    )}
                </div>
            )}

            {activeTab === 'opportunities' && (() => {
                // ── Opp-tab filtered set (driven by opp-tab filters below) ──
                const todayOpp = new Date();
                const currentQOpp = getQuarter(todayOpp.toISOString().split('T')[0]);
                const currentQLOpp = getQuarterLabel(currentQOpp, todayOpp.toISOString().split('T')[0]);
                const qNumOpp = parseInt(currentQOpp.replace('Q', ''));
                const nextQOpp = 'Q' + (qNumOpp < 4 ? qNumOpp + 1 : 1);
                const nextMonthOpp = new Date(todayOpp);
                nextMonthOpp.setMonth(todayOpp.getMonth() + 3);
                const nextQLOpp = getQuarterLabel(nextQOpp, nextMonthOpp.toISOString().split('T')[0]);
                const oppTimeFilterOpts = [
                    { key: 'currentQ',    label: 'Current Qtr',  match: o => o.closeQuarter === currentQLOpp },
                    { key: 'currentNextQ',label: 'Cur + Next',   match: o => o.closeQuarter === currentQLOpp || o.closeQuarter === nextQLOpp },
                    { key: 'annual',      label: 'Annual',       match: o => { const fy = currentQLOpp.split(' ')[0]; return o.closeQuarter && o.closeQuarter.startsWith(fy); }},
                    { key: 'Q1', label: 'Q1', match: o => o.closeQuarter && o.closeQuarter.includes('Q1') },
                    { key: 'Q2', label: 'Q2', match: o => o.closeQuarter && o.closeQuarter.includes('Q2') },
                    { key: 'Q3', label: 'Q3', match: o => o.closeQuarter && o.closeQuarter.includes('Q3') },
                    { key: 'Q4', label: 'Q4', match: o => o.closeQuarter && o.closeQuarter.includes('Q4') },
                ];
                const oppAllReps = canSeeAll ? [...new Set([
                    ...(settings.users||[]).filter(u => u.name).map(u => u.name),
                    ...visibleOpportunities.filter(o => o.salesRep).map(o => o.salesRep)
                ])].sort() : [];
                const oppAllTeams = canSeeAll ? [...new Set((settings.users||[]).filter(u => u.team).map(u => u.team))].sort() : [];
                const oppAllTerritories = canSeeAll ? [...new Set((settings.users||[]).filter(u => u.territory).map(u => u.territory))].sort() : [];
                const oppAnyActive = oppQuarterFilter.length > 0 || oppStageFilter.length > 0 ||
                    oppRepFilter.length > 0 || oppTeamFilter.length > 0 || oppTerritoryFilter.length > 0;

                const oppFilteredOpps = visibleOpportunities
                    .filter(opp => {
                        if (oppQuarterFilter.length === 0) return true;
                        return oppQuarterFilter.some(key => { const opt = oppTimeFilterOpts.find(o => o.key === key); return opt && opt.match(opp); });
                    })
                    .filter(opp => {
                if (oppStageFilter.length === 0) return true;
                if (oppStageFilter.includes('__allOpen__')) return opp.stage !== 'Closed Won' && opp.stage !== 'Closed Lost';
                return oppStageFilter.includes(opp.stage);
            })
                    .filter(opp => oppRepFilter.length === 0 || oppRepFilter.includes(opp.salesRep) || oppRepFilter.includes(opp.assignedTo))
                    .filter(opp => {
                        if (oppTeamFilter.length === 0) return true;
                        const u = (settings.users||[]).find(u => u.name === (opp.salesRep||opp.assignedTo));
                        return u && oppTeamFilter.includes(u.team);
                    })
                    .filter(opp => {
                        if (oppTerritoryFilter.length === 0) return true;
                        const u = (settings.users||[]).find(u => u.name === (opp.salesRep||opp.assignedTo));
                        return u && oppTerritoryFilter.includes(u.territory);
                    });

                // ── Reusable multi-select dropdown ──
                const OppDD = ({ label, icon, options, selected, onToggle, onClear, renderOption }) => {
                    const [open, setOpen] = React.useState(false);
                    const ref = React.useRef(null);
                    React.useEffect(() => {
                        if (!open) return;
                        const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
                        document.addEventListener('mousedown', h);
                        return () => document.removeEventListener('mousedown', h);
                    }, [open]);
                    const isActive = selected.length > 0;
                    const activeLabels = selected.map(s => options.find(o => (o.key||o) === s)).filter(Boolean).map(o => o.label||o);
                    const btnLabel = isActive ? (activeLabels.length === 1 ? `${label}: ${activeLabels[0]}` : `${label}: ${activeLabels.length}`) : label;
                    return (
                        <div ref={ref} style={{ position:'relative', flexShrink:0 }}>
                            <button onClick={() => setOpen(o => !o)} style={{
                                display:'flex', alignItems:'center', gap:'0.3rem',
                                padding:'0.25rem 0.5rem', borderRadius:'6px', cursor:'pointer',
                                fontFamily:'inherit', fontSize:'0.6875rem', fontWeight:'700',
                                transition:'all 0.15s', whiteSpace:'nowrap',
                                border:'1px solid ' + (isActive ? '#2563eb' : '#e2e8f0'),
                                background: isActive ? '#2563eb' : '#f8fafc',
                                color: isActive ? '#fff' : '#64748b',
                            }}>
                                {icon && <span style={{ fontSize:'0.75rem' }}>{icon}</span>}
                                <span>{btnLabel}</span>
                                <span style={{ fontSize:'0.5rem', opacity:0.6 }}>{open ? '▲' : '▼'}</span>
                            </button>
                            {open && (
                                <div style={{ position:'absolute', top:'calc(100% + 4px)', left:0, zIndex:400,
                                    background:'#fff', border:'1px solid #e2e8f0', borderRadius:'10px',
                                    boxShadow:'0 8px 24px rgba(0,0,0,0.12)', minWidth:'170px', overflow:'hidden' }}>
                                    <div onClick={() => { onClear(); setOpen(false); }}
                                        style={{ display:'flex', alignItems:'center', gap:'0.5rem',
                                            padding:'0.5rem 0.75rem', cursor:'pointer', fontSize:'0.8125rem',
                                            color: !isActive ? '#2563eb' : '#1e293b', fontWeight: !isActive ? '700' : '400',
                                            background: !isActive ? '#eff6ff' : 'transparent', borderBottom:'1px solid #f1f5f9' }}>
                                        <span style={{ width:'14px', textAlign:'center', fontSize:'0.75rem' }}>{!isActive ? '✓' : ''}</span>
                                        <span>All</span>
                                    </div>
                                    {options.map(opt => {
                                        const key = opt.key || opt;
                                        const checked = selected.includes(key);
                                        return (
                                            <div key={key} onClick={() => onToggle(key)}
                                                style={{ display:'flex', alignItems:'center', gap:'0.5rem',
                                                    padding:'0.5rem 0.75rem', cursor:'pointer', fontSize:'0.8125rem',
                                                    color: checked ? '#2563eb' : '#1e293b', fontWeight: checked ? '700' : '400',
                                                    background: checked ? '#eff6ff' : 'transparent', transition:'background 0.1s' }}>
                                                <span style={{ width:'14px', textAlign:'center', fontSize:'0.75rem' }}>{checked ? '✓' : ''}</span>
                                                {renderOption ? renderOption(opt, checked) : <span>{opt.label || opt}</span>}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                };

                return (
                <div className="tab-page" onClick={() => healthPopover && setHealthPopover(null)}>
                    <div className="table-container">
                        {/* ── Header: filters left, actions right ── */}
                        <div style={{ display:'flex', alignItems:'center', gap:'0.375rem', padding:'0.625rem 1rem', borderBottom:'1px solid #e2e8f0', flexWrap:'wrap' }}>
                            <div style={{ width:'3px', height:'18px', background:'linear-gradient(to bottom, #2563eb, #7c3aed)', borderRadius:'2px', flexShrink:0, marginRight:'0.25rem' }} />
                            <span style={{ fontSize:'0.6875rem', fontWeight:'800', color:'#0f172a', marginRight:'0.5rem', flexShrink:0 }}>Filter:</span>

                            {/* Pipeline */}
                            {allPipelines.length > 1 && (
                                <SliceDropdown label="Pipeline" icon="🔀"
                                    options={allPipelines.map(p => p.name)}
                                    selected={activePipeline.name}
                                    colorMap={Object.fromEntries(allPipelines.map(p => [p.name, p.color]))}
                                    activeColor={activePipeline.color}
                                    onSelect={name => { const p = allPipelines.find(pl => pl.name === name); if (p) setActivePipelineId(p.id); }}
                                    alwaysActive />
                            )}

                            <OppDD label="Time" icon="⏱" options={oppTimeFilterOpts}
                                selected={oppQuarterFilter}
                                onToggle={k => setOppQuarterFilter(prev => prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k])}
                                onClear={() => setOppQuarterFilter([])} />

                            <OppDD label="Stage" icon="📊" options={[{key:'__allOpen__', label:'All Open'}, ...stages]}
                                selected={oppStageFilter}
                                onToggle={s => {
                                    if (s === '__allOpen__') {
                                        setOppStageFilter(prev => prev.includes('__allOpen__') ? [] : ['__allOpen__']);
                                    } else {
                                        setOppStageFilter(prev => {
                                            const without = prev.filter(x => x !== '__allOpen__');
                                            return without.includes(s) ? without.filter(x => x !== s) : [...without, s];
                                        });
                                    }
                                }}
                                onClear={() => setOppStageFilter([])}
                                renderOption={(opt, checked) => {
                                    const s = opt.key || opt;
                                    if (s === '__allOpen__') return <span style={{ fontWeight:'700', color:'#2563eb' }}>All Open</span>;
                                    const sc = getStageColor(s);
                                    return <span style={{ display:'flex', alignItems:'center', gap:'0.375rem' }}>
                                        <span style={{ width:'8px', height:'8px', borderRadius:'50%', background:sc.text, flexShrink:0 }}></span>
                                        <span>{s}</span>
                                    </span>;
                                }} />

                            {oppAllReps.length >= 2 && (
                                <OppDD label="Rep" icon="👤" options={oppAllReps}
                                    selected={oppRepFilter}
                                    onToggle={r => setOppRepFilter(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r])}
                                    onClear={() => setOppRepFilter([])} />
                            )}

                            {oppAllTeams.length > 0 && (
                                <OppDD label="Team" icon="👥" options={oppAllTeams}
                                    selected={oppTeamFilter}
                                    onToggle={t => setOppTeamFilter(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])}
                                    onClear={() => setOppTeamFilter([])} />
                            )}

                            {oppAllTerritories.length > 0 && (
                                <OppDD label="Territory" icon="📍" options={oppAllTerritories}
                                    selected={oppTerritoryFilter}
                                    onToggle={t => setOppTerritoryFilter(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])}
                                    onClear={() => setOppTerritoryFilter([])} />
                            )}

                            {oppAnyActive && (
                                <button onClick={() => { setOppQuarterFilter([]); setOppStageFilter([]); setOppRepFilter([]); setOppTeamFilter([]); setOppTerritoryFilter([]); }}
                                    style={{ padding:'0.2rem 0.5rem', borderRadius:'4px', border:'1px solid #e2e8f0', background:'#fff', color:'#94a3b8', fontSize:'0.625rem', fontWeight:'600', cursor:'pointer', fontFamily:'inherit' }}>
                                    ✕ Clear all
                                </button>
                            )}

                            {/* Right side: count + CSV + New */}
                            <div style={{ display:'flex', gap:'0.5rem', alignItems:'center', marginLeft:'auto', flexShrink:0 }}>
                                <span style={{ fontSize:'0.6875rem', color:'#94a3b8', fontWeight:'600' }}>{oppFilteredOpps.length} deals</span>
                                <button className="btn btn-secondary" style={{ padding:'0.3rem 0.625rem', fontSize:'0.6875rem' }} onClick={() => {
                                    exportToCSV(
                                        `opportunities-${new Date().toISOString().slice(0,10)}.csv`,
                                        ['Account','Site','Stage','ARR','Impl Cost','Total Value','Close Date','Quarter','Rep','Team','Territory','Probability','Deal Health','Notes','Next Steps'],
                                        oppFilteredOpps.map(o => [
                                            o.account, o.site, o.stage,
                                            o.arr||0, o.implementationCost||0, (o.arr||0)+(o.implementationCost||0),
                                            o.forecastedCloseDate, o.closeQuarter, o.salesRep||o.assignedTo,
                                            (settings.users||[]).find(u=>u.name===(o.salesRep||o.assignedTo))?.team||'',
                                            (settings.users||[]).find(u=>u.name===(o.salesRep||o.assignedTo))?.territory||'',
                                            o.probability||'', calculateDealHealth(o).score,
                                            o.notes||'', o.nextSteps||''
                                        ])
                                    );
                                }}>📤 Export</button>
                                <button className="btn" onClick={handleAddNew} style={{ padding:'0.3rem 0.75rem', fontSize:'0.6875rem', fontWeight:'700' }}>+ New</button>
                            </div>
                        </div>

                        {/* Bulk actions bar */}
                        {selectedOpps.length > 0 && (
                            <div style={{ display:'flex', alignItems:'center', gap:'0.75rem', padding:'0.625rem 1.5rem', background:'#eff6ff', borderBottom:'1px solid #bfdbfe', flexWrap:'wrap' }}>
                                <span style={{ fontWeight:'700', fontSize:'0.8125rem', color:'#1d4ed8' }}>{selectedOpps.length} selected</span>
                                <div style={{ width:'1px', height:'18px', background:'#bfdbfe' }} />
                                <div style={{ display:'flex', alignItems:'center', gap:'0.375rem' }}>
                                    <span style={{ fontSize:'0.75rem', color:'#64748b', fontWeight:'600' }}>Stage:</span>
                                    <select value={bulkAction.stage} onChange={e => setBulkAction(a => ({...a, stage: e.target.value}))}
                                        style={{ fontSize:'0.75rem', border:'1px solid #bfdbfe', borderRadius:'6px', padding:'0.2rem 0.5rem', background:'#fff', color:'#1e293b', cursor:'pointer' }}>
                                        <option value="">— pick stage —</option>
                                        {stages.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                    {bulkAction.stage && (
                                        <button onClick={() => {
                                            const today = new Date().toISOString().split('T')[0];
                                            setOpportunities(prev => prev.map(o => selectedOpps.includes(o.id) ? {
                                                ...o, stage: bulkAction.stage, stageChangedDate: today,
                                                stageHistory: [...(o.stageHistory||[]), { stage: bulkAction.stage, date: today, prevStage: o.stage, author: currentUser||'', timestamp: new Date().toISOString() }]
                                            } : o));
                                            setSelectedOpps([]); setBulkAction({ stage:'', rep:'' });
                                        }} style={{ padding:'0.2rem 0.625rem', background:'#2563eb', color:'#fff', border:'none', borderRadius:'6px', fontSize:'0.75rem', fontWeight:'700', cursor:'pointer', fontFamily:'inherit' }}>Apply</button>
                                    )}
                                </div>
                                <div style={{ width:'1px', height:'18px', background:'#bfdbfe' }} />
                                <div style={{ display:'flex', alignItems:'center', gap:'0.375rem' }}>
                                    <span style={{ fontSize:'0.75rem', color:'#64748b', fontWeight:'600' }}>Assign to:</span>
                                    <select value={bulkAction.rep} onChange={e => setBulkAction(a => ({...a, rep: e.target.value}))}
                                        style={{ fontSize:'0.75rem', border:'1px solid #bfdbfe', borderRadius:'6px', padding:'0.2rem 0.5rem', background:'#fff', color:'#1e293b', cursor:'pointer' }}>
                                        <option value="">— pick rep —</option>
                                        {[...new Set((settings.users||[]).filter(u=>u.userType!=='Admin'&&u.userType!=='Manager').map(u=>u.name).filter(Boolean))].sort().map(n => <option key={n} value={n}>{n}</option>)}
                                    </select>
                                    {bulkAction.rep && (
                                        <button onClick={() => {
                                            setOpportunities(prev => prev.map(o => selectedOpps.includes(o.id) ? {...o, salesRep: bulkAction.rep} : o));
                                            setSelectedOpps([]); setBulkAction({ stage:'', rep:'' });
                                        }} style={{ padding:'0.2rem 0.625rem', background:'#2563eb', color:'#fff', border:'none', borderRadius:'6px', fontSize:'0.75rem', fontWeight:'700', cursor:'pointer', fontFamily:'inherit' }}>Apply</button>
                                    )}
                                </div>
                                <div style={{ width:'1px', height:'18px', background:'#bfdbfe' }} />
                                <button onClick={() => {
                                   showConfirm('Delete ' + selectedOpps.length + '...', () => {
    const idsToDelete = [...selectedOpps];
    const snapshot = [...opportunities];
    setOpportunities(prev => prev.filter(o => !idsToDelete.includes(o.id)));
    setSelectedOpps([]);
    idsToDelete.forEach(id => {
        dbFetch(`/.netlify/functions/opportunities?id=${id}`, { method: 'DELETE' })
            .catch(err => console.error('Failed to delete opportunity:', err));
    });
    softDelete(
        `${idsToDelete.length} opportunit${idsToDelete.length === 1 ? 'y' : 'ies'}`,
        () => {},
        () => { setOpportunities(snapshot); setUndoToast(null); }
    );
});
                                }} style={{ padding:'0.2rem 0.625rem', background:'#ef4444', color:'white', border:'none', borderRadius:'6px', fontSize:'0.75rem', fontWeight:'700', cursor:'pointer', fontFamily:'inherit' }}>🗑 Delete</button>
                                <button onClick={() => { setSelectedOpps([]); setBulkAction({ stage:'', rep:'' }); }}
                                    style={{ marginLeft:'auto', background:'none', border:'none', color:'#64748b', fontSize:'0.75rem', cursor:'pointer', fontFamily:'inherit', fontWeight:'600' }}>Clear selection ✕</button>
                            </div>
                        )}

                        <div className="table-wrapper">
                            {/* Stale deals warning banner */}
                            {(() => {
                                const staleDeals = oppFilteredOpps.filter(opp => {
                                    if (opp.stage === 'Closed Won' || opp.stage === 'Closed Lost') return false;
                                    if (!opp.stageChangedDate) return false;
                                    return Math.floor((new Date() - new Date(opp.stageChangedDate)) / 86400000) > 30;
                                });
                                const noActivityDeals = oppFilteredOpps.filter(opp => {
                                    if (opp.stage === 'Closed Won' || opp.stage === 'Closed Lost') return false;
                                    return activities.filter(a => a.opportunityId === opp.id).length === 0;
                                });
                                if (staleDeals.length === 0 && noActivityDeals.length === 0) return null;
                                return (
                                    <div style={{ padding:'0.625rem 1rem', background:'#fffbeb', border:'1px solid #fde68a', borderBottom:'1px solid #fde68a', display:'flex', gap:'1.25rem', flexWrap:'wrap', alignItems:'center' }}>
                                        <span style={{ fontSize:'0.75rem', fontWeight:'700', color:'#92400e' }}>⚠ Pipeline Attention</span>
                                        {staleDeals.length > 0 && <span style={{ fontSize:'0.75rem', color:'#b45309' }}><strong>{staleDeals.length}</strong> deal{staleDeals.length > 1 ? 's' : ''} stuck in stage &gt;30 days{staleDeals.length <= 3 && ': ' + staleDeals.map(o => o.account||o.opportunityName).join(', ')}</span>}
                                        {staleDeals.length > 0 && noActivityDeals.length > 0 && <span style={{ color:'#fbbf24' }}>·</span>}
                                        {noActivityDeals.length > 0 && <span style={{ fontSize:'0.75rem', color:'#b45309' }}><strong>{noActivityDeals.length}</strong> open deal{noActivityDeals.length > 1 ? 's' : ''} with no activities logged</span>}
                                    </div>
                                );
                            })()}
                            <table>
                                <thead>
                                    <tr>
                                        <th style={{ width:'36px' }}>
                                            <input type="checkbox"
                                                checked={oppFilteredOpps.length > 0 && selectedOpps.length === oppFilteredOpps.length}
                                                onChange={e => setSelectedOpps(e.target.checked ? oppFilteredOpps.map(o => o.id) : [])}
                                                style={{ width:'15px', height:'15px', cursor:'pointer', accentColor:'#2563eb' }} />
                                        </th>
                                        <th>Health</th>
                                        <th>Opp ID</th>
                                        <th style={{ cursor:'pointer', userSelect:'none' }} onClick={() => { if (oppSortField==='salesRep') setOppSortDir(d => d==='asc'?'desc':'asc'); else { setOppSortField('salesRep'); setOppSortDir('asc'); } }}>Sales Rep {oppSortField==='salesRep' ? (oppSortDir==='asc' ? <span style={{color:'#2563eb',fontSize:'0.7rem'}}>▲</span> : <span style={{color:'#2563eb',fontSize:'0.7rem'}}>▼</span>) : <span style={{color:'#cbd5e1',fontSize:'0.7rem'}}>▼</span>}</th>
                                        <th style={{ cursor:'pointer', userSelect:'none' }} onClick={() => { if (oppSortField==='account') setOppSortDir(d => d==='asc'?'desc':'asc'); else { setOppSortField('account'); setOppSortDir('asc'); } }}>Account {oppSortField==='account' ? (oppSortDir==='asc' ? <span style={{color:'#2563eb',fontSize:'0.7rem'}}>▲</span> : <span style={{color:'#2563eb',fontSize:'0.7rem'}}>▼</span>) : <span style={{color:'#cbd5e1',fontSize:'0.7rem'}}>▼</span>}</th>
                                        <th>Opportunity Name</th>
                                        <th style={{ cursor:'pointer', userSelect:'none' }} onClick={() => { if (oppSortField==='stage') setOppSortDir(d => d==='asc'?'desc':'asc'); else { setOppSortField('stage'); setOppSortDir('asc'); } }}>Stage {oppSortField==='stage' ? (oppSortDir==='asc' ? <span style={{color:'#2563eb',fontSize:'0.7rem'}}>▲</span> : <span style={{color:'#2563eb',fontSize:'0.7rem'}}>▼</span>) : <span style={{color:'#cbd5e1',fontSize:'0.7rem'}}>▼</span>}</th>
                                        {canViewField('arr') && <th style={{ cursor:'pointer', userSelect:'none' }} onClick={() => { if (oppSortField==='arr') setOppSortDir(d => d==='asc'?'desc':'asc'); else { setOppSortField('arr'); setOppSortDir('desc'); } }}>ARR {oppSortField==='arr' ? (oppSortDir==='asc' ? <span style={{color:'#2563eb',fontSize:'0.7rem'}}>▲</span> : <span style={{color:'#2563eb',fontSize:'0.7rem'}}>▼</span>) : <span style={{color:'#cbd5e1',fontSize:'0.7rem'}}>▼</span>}</th>}
                                        {canViewField('implCost') && <th>Impl. Cost</th>}
                                        {canViewField('probability') && <th>Prob %</th>}
                                        {canViewField('weightedValue') && <th>Weighted Value</th>}
                                        {canViewField('dealAge') && <th>Deal Age</th>}
                                        {canViewField('timeInStage') && <th>Time in Stage</th>}
                                        {canViewField('activities') && <th>Activities</th>}
                                        <th style={{ cursor:'pointer', userSelect:'none' }} onClick={() => { if (oppSortField==='closeDate') setOppSortDir(d => d==='asc'?'desc':'asc'); else { setOppSortField('closeDate'); setOppSortDir('asc'); } }}>Close Date {oppSortField==='closeDate' ? (oppSortDir==='asc' ? <span style={{color:'#2563eb',fontSize:'0.7rem'}}>▲</span> : <span style={{color:'#2563eb',fontSize:'0.7rem'}}>▼</span>) : <span style={{color:'#cbd5e1',fontSize:'0.7rem'}}>▼</span>}</th>
                                        <th style={{ cursor:'pointer', userSelect:'none' }} onClick={() => { if (oppSortField==='closeQuarter') setOppSortDir(d => d==='asc'?'desc':'asc'); else { setOppSortField('closeQuarter'); setOppSortDir('asc'); } }}>Close Quarter {oppSortField==='closeQuarter' ? (oppSortDir==='asc' ? <span style={{color:'#2563eb',fontSize:'0.7rem'}}>▲</span> : <span style={{color:'#2563eb',fontSize:'0.7rem'}}>▼</span>) : <span style={{color:'#cbd5e1',fontSize:'0.7rem'}}>▼</span>}</th>
                                        <th>Products</th>
                                        <th>Unionized</th>
                                        <th>Pain Points</th>
                                        <th>Key Contacts</th>
                                        {canViewField('notes') && <th>Notes</th>}
                                        {canViewField('nextSteps') && <th>Next Steps</th>}
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {oppFilteredOpps
                                        .sort((a, b) => {
                                            const dir = oppSortDir === 'asc' ? 1 : -1;
                                            switch (oppSortField) {
                                                case 'salesRep': return dir * (a.salesRep||'').localeCompare(b.salesRep||'');
                                                case 'account': return dir * (a.account||'').localeCompare(b.account||'');
                                                case 'stage': {
                                                    const order = ['Qualification','Discovery','Evaluation (Demo)','Proposal','Negotiation/Review','Contracts','Closed Won','Closed Lost'];
                                                    return dir * (order.indexOf(a.stage) - order.indexOf(b.stage));
                                                }
                                                case 'arr': return dir * ((a.arr||0) - (b.arr||0));
                                                case 'closeDate': return dir * (new Date(a.forecastedCloseDate||'9999') - new Date(b.forecastedCloseDate||'9999'));
                                                case 'closeQuarter': return dir * (a.closeQuarter||'').localeCompare(b.closeQuarter||'');
                                                default: return dir * (new Date(a.forecastedCloseDate||'9999') - new Date(b.forecastedCloseDate||'9999'));
                                            }
                                        })
                                        .map((opp, oppIdx) => {
                                            const health = calculateDealHealth(opp);
                                            return (
                                        <React.Fragment key={opp.id}>
                                        <tr style={{ background: selectedOpps.includes(opp.id) ? '#eff6ff' : oppIdx % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                                            <td onClick={e => e.stopPropagation()} style={{ width:'36px' }}>
                                                <input type="checkbox"
                                                    checked={selectedOpps.includes(opp.id)}
                                                    onChange={e => setSelectedOpps(prev => e.target.checked ? [...prev, opp.id] : prev.filter(id => id !== opp.id))}
                                                    style={{ width:'15px', height:'15px', cursor:'pointer', accentColor:'#2563eb' }} />
                                            </td>
                                            <td style={{ position:'relative' }}>
                                                <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', cursor:'pointer' }}
                                                    onClick={e => { e.stopPropagation(); setHealthPopover(healthPopover === opp.id ? null : opp.id); }}>
                                                    <div style={{ width:'12px', height:'12px', borderRadius:'50%', background: health.color }} />
                                                    <span style={{ fontSize:'0.8125rem', fontWeight:'600', color: health.color }}>{health.status}</span>
                                                </div>
                                                {healthPopover === opp.id && (
                                                    <div style={{ position:'absolute', top:'100%', left:0, zIndex:1000,
                                                        background:'#ffffff', border:'1px solid #e2e8f0', borderRadius:'8px',
                                                        boxShadow:'0 8px 24px rgba(0,0,0,0.12)', padding:'0.875rem 1rem',
                                                        minWidth:'280px', marginTop:'0.25rem' }}>
                                                        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'0.625rem' }}>
                                                            <div style={{ display:'flex', alignItems:'center', gap:'0.375rem' }}>
                                                                <div style={{ width:'10px', height:'10px', borderRadius:'50%', background: health.color }} />
                                                                <span style={{ fontWeight:'700', fontSize:'0.875rem', color: health.color }}>{health.status}</span>
                                                                <span style={{ fontSize:'0.75rem', color:'#94a3b8' }}>({health.score}/100)</span>
                                                            </div>
                                                            <button onClick={e => { e.stopPropagation(); setHealthPopover(null); }}
                                                                style={{ background:'none', border:'none', cursor:'pointer', color:'#94a3b8', fontSize:'1rem', padding:0, lineHeight:1 }}>×</button>
                                                        </div>
                                                        {health.reasons.map((reason, ri) => (
                                                            <div key={ri} style={{ display:'flex', alignItems:'flex-start', gap:'0.375rem', padding:'0.3rem 0', fontSize:'0.8125rem', color:'#475569', lineHeight:1.4 }}>
                                                                <span style={{ color: reason.includes('No activity in over')||reason.includes('overdue')||reason.includes('Stuck')||reason.includes('No activities logged') ? '#ef4444' : reason.includes('approaching')||reason.includes('In current stage for') ? '#f59e0b' : '#10b981', flexShrink:0 }}>
                                                                    {reason.includes('No activity in over')||reason.includes('overdue')||reason.includes('Stuck')||reason.includes('No activities logged') ? '⚠' : reason.includes('approaching')||reason.includes('In current stage for') ? '○' : '✓'}
                                                                </span>
                                                                <span>{reason}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </td>
                                            <td>{opp.id}</td>
                                            <td style={{ whiteSpace:'nowrap' }}>{opp.salesRep || '-'}</td>
                                            <td>{opp.account}</td>
                                            <td><span style={{ cursor:'pointer', color:'#2563eb', fontWeight:'600' }} onClick={e => { e.stopPropagation(); setEditingOpp(opp); setShowModal(true); }}>{opp.opportunityName || '-'}</span></td>
                                            <td onClick={e => e.stopPropagation()}>
                                                {inlineEdit && inlineEdit.oppId === opp.id && inlineEdit.field === 'stage' ? (
                                                    <select autoFocus value={inlineEdit.value}
                                                        onChange={e => {
                                                            const newStage = e.target.value;
                                                            const today = new Date().toISOString().split('T')[0];
                                                            const prevStageVal = opp.stage;
                                                            const updatedOpp = {
                                                                ...opp, stage: newStage, stageChangedDate: today,
                                                                stageHistory: [...(opp.stageHistory||[]), { stage: newStage, date: today, prevStage: opp.stage, author: currentUser||'', timestamp: new Date().toISOString() }]
                                                            };
                                                            setOpportunities(prev => prev.map(o => o.id === opp.id ? updatedOpp : o));
                                                            dbFetch('/.netlify/functions/opportunities', {
                                                                method: 'PUT',
                                                                headers: { 'Content-Type': 'application/json' },
                                                                body: JSON.stringify(updatedOpp)
                                                            }).catch(err => console.error('Failed to save stage change:', err));
                                                            addAudit('update','opportunity',opp.id,opp.opportunityName||opp.account||opp.id,`Stage: ${prevStageVal} → ${newStage}`);
                                                            setInlineEdit(null);
                                                        }}
                                                        onBlur={() => setInlineEdit(null)}
                                                        onKeyDown={e => { if (e.key==='Escape') setInlineEdit(null); }}
                                                        style={{ fontSize:'0.6875rem', fontWeight:'600', border:'1.5px solid #2563eb', borderRadius:'6px', padding:'0.1rem 0.25rem', outline:'none', background:'#fff', cursor:'pointer', color:'#1e293b' }}>
                                                        {stages.map(s => <option key={s} value={s}>{s}</option>)}
                                                    </select>
                                                ) : (
                                                    <span title="Click to change stage"
                                                        onClick={() => setInlineEdit({ oppId: opp.id, field:'stage', value: opp.stage })}
                                                        style={{ background: getStageColor(opp.stage).text+'22', color: getStageColor(opp.stage).text, padding:'0.125rem 0.5rem', borderRadius:'999px', fontSize:'0.6875rem', fontWeight:'600', whiteSpace:'nowrap', display:'inline-block', cursor:'pointer', transition:'opacity 0.1s' }}
                                                        onMouseEnter={e => e.currentTarget.style.opacity='0.75'}
                                                        onMouseLeave={e => e.currentTarget.style.opacity='1'}>
                                                        {opp.stage}
                                                    </span>
                                                )}
                                            </td>
                                            {canViewField('arr') && <td style={{ textAlign:'right' }} onClick={e => e.stopPropagation()}>
                                                {inlineEdit && inlineEdit.oppId === opp.id && inlineEdit.field === 'arr' ? (
                                                    <input autoFocus type="number" value={inlineEdit.value}
                                                        onChange={e => setInlineEdit(prev => ({...prev, value: e.target.value}))}
                                                        onBlur={() => {
                                                            const val = parseFloat(inlineEdit.value) || 0;
                                                            const updatedOpp = {...opp, arr: val};
                                                            setOpportunities(prev => prev.map(o => o.id === opp.id ? updatedOpp : o));
                                                            dbFetch('/.netlify/functions/opportunities', {
                                                                method: 'PUT',
                                                                headers: { 'Content-Type': 'application/json' },
                                                                body: JSON.stringify(updatedOpp)
                                                            }).catch(err => console.error('Failed to save ARR change:', err));
                                                            addAudit('update','opportunity',opp.id,opp.opportunityName||opp.account||opp.id,`ARR: ${opp.arr} → ${val}`);
                                                            setInlineEdit(null);
                                                        }}
                                                        onKeyDown={e => { if (e.key==='Enter') e.target.blur(); if (e.key==='Escape') setInlineEdit(null); }}
                                                        style={{ width:'80px', fontSize:'0.75rem', border:'1.5px solid #2563eb', borderRadius:'4px', padding:'0.1rem 0.25rem', textAlign:'right', outline:'none' }} />
                                                ) : (
                                                    <span title="Click to edit ARR" onClick={() => setInlineEdit({ oppId: opp.id, field:'arr', value: opp.arr||0 })}
                                                        style={{ cursor:'pointer' }} onMouseEnter={e => e.currentTarget.style.textDecoration='underline'} onMouseLeave={e => e.currentTarget.style.textDecoration='none'}>
                                                        ${(opp.arr||0).toLocaleString()}
                                                    </span>
                                                )}
                                            </td>}
                                            {canViewField('implCost') && <td style={{ textAlign:'right', color:'#64748b' }}>${(opp.implementationCost||0).toLocaleString()}</td>}
                                            {canViewField('probability') && <td style={{ textAlign:'center', color:'#64748b' }}>{opp.probability ? opp.probability+'%' : '-'}</td>}
                                            {canViewField('weightedValue') && <td style={{ textAlign:'right' }}>{opp.probability ? '$'+Math.round((opp.arr||0)*((opp.probability||0)/100)).toLocaleString() : '-'}</td>}
                                            {canViewField('dealAge') && <td style={{ textAlign:'center', color:'#64748b', fontSize:'0.8125rem' }}>{opp.createdDate ? Math.floor((new Date()-new Date(opp.createdDate))/86400000)+'d' : '-'}</td>}
                                            {canViewField('timeInStage') && <td style={{ textAlign:'center', color:'#64748b', fontSize:'0.8125rem' }}>{opp.stageChangedDate ? Math.floor((new Date()-new Date(opp.stageChangedDate))/86400000)+'d' : '-'}</td>}
                                            {canViewField('activities') && <td style={{ textAlign:'center' }}>
                                                <div style={{ display:'flex', alignItems:'center', gap:'0.375rem', justifyContent:'center' }}>
                                                    <span style={{ fontSize:'0.75rem', color: activities.filter(a => a.opportunityId===opp.id).length > 0 ? '#2563eb' : '#cbd5e1', fontWeight:'600' }}>{activities.filter(a => a.opportunityId===opp.id).length}</span>
                                                    {(opp.comments||[]).length > 0 && (
                                                        <span title="Click to view team notes"
                                                            onClick={e => { const r = e.currentTarget.getBoundingClientRect(); setNotesPopover({ opp, type:'comments', rect: r }); e.stopPropagation(); }}
                                                            style={{ display:'inline-flex', alignItems:'center', gap:'0.2rem', background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:'999px', padding:'0.1rem 0.4rem', fontSize:'0.6875rem', fontWeight:'700', color:'#166534', cursor:'pointer' }}
                                                            onMouseEnter={e => e.currentTarget.style.background='#dcfce7'} onMouseLeave={e => e.currentTarget.style.background='#f0fdf4'}>
                                                            💬 {opp.comments.length}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>}
                                            <td style={{ whiteSpace:'nowrap', color:'#64748b', fontSize:'0.8125rem' }}>
                                                {inlineEdit && inlineEdit.oppId===opp.id && inlineEdit.field==='closeDate' ? (
                                                    <input autoFocus type="date" value={inlineEdit.value}
                                                        onChange={e => setInlineEdit(prev => ({...prev, value: e.target.value}))}
                                                        onBlur={() => {
                                                            const val = inlineEdit.value;
                                                            if (val) {
                                                                const newQ = getQuarterLabel(getQuarter(val), val);
                                                                const updatedOpp = {...opp, forecastedCloseDate: val, closeQuarter: newQ};
                                                                setOpportunities(prev => prev.map(o => o.id===opp.id ? updatedOpp : o));
                                                                dbFetch('/.netlify/functions/opportunities', {
                                                                    method: 'PUT',
                                                                    headers: { 'Content-Type': 'application/json' },
                                                                    body: JSON.stringify(updatedOpp)
                                                                }).catch(err => console.error('Failed to save close date change:', err));
                                                                addAudit('update','opportunity',opp.id,opp.opportunityName||opp.account||opp.id,`Close Date: ${opp.forecastedCloseDate} → ${val}`);
                                                            }
                                                            setInlineEdit(null);
                                                        }}
                                                        onKeyDown={e => { if (e.key==='Enter') e.target.blur(); if (e.key==='Escape') setInlineEdit(null); }}
                                                        style={{ fontSize:'0.75rem', border:'1.5px solid #2563eb', borderRadius:'4px', padding:'0.1rem 0.25rem', outline:'none' }} />
                                                ) : (
                                                    <span title="Click to edit close date" onClick={() => setInlineEdit({ oppId: opp.id, field:'closeDate', value: opp.forecastedCloseDate||'' })}
                                                        style={{ cursor:'pointer' }} onMouseEnter={e => e.currentTarget.style.textDecoration='underline'} onMouseLeave={e => e.currentTarget.style.textDecoration='none'}>
                                                        {opp.forecastedCloseDate ? new Date(opp.forecastedCloseDate+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '-'}
                                                    </span>
                                                )}
                                            </td>
                                            <td style={{ whiteSpace:'nowrap', color:'#64748b', fontSize:'0.8125rem' }}>{opp.closeQuarter || '-'}</td>
                                            <td style={{ fontSize:'0.75rem', color:'#475569' }}>
                                                {(() => { const prods = Array.isArray(opp.products) ? opp.products : (opp.products ? [opp.products] : []); return prods.length > 0 ? (
                                                    <div style={{ display:'flex', flexWrap:'wrap', gap:'0.2rem' }}>
                                                        {prods.slice(0,3).map((p,i) => <span key={i} style={{ background:'#dbeafe', color:'#1e40af', padding:'0.1rem 0.4rem', borderRadius:'3px', fontSize:'0.625rem', fontWeight:'600' }}>{p}</span>)}
                                                        {prods.length > 3 && <span style={{ fontSize:'0.625rem', color:'#94a3b8' }}>+{prods.length-3}</span>}
                                                    </div>
                                                ) : '-'; })()}
                                            </td>
                                            <td style={{ textAlign:'center', fontSize:'0.75rem' }}>{opp.unionized ? <span style={{ color:'#dc2626', fontWeight:'700' }}>Yes</span> : <span style={{ color:'#94a3b8' }}>No</span>}</td>
                                            <td style={{ fontSize:'0.75rem', color:'#475569' }}>
                                                {(() => { const pts = Array.isArray(opp.painPoints) ? opp.painPoints : (opp.painPoints ? [opp.painPoints] : []); return pts.length > 0 ? (
                                                    <div style={{ display:'flex', flexWrap:'wrap', gap:'0.2rem' }}>
                                                        {pts.slice(0,2).map((p,i) => <span key={i} style={{ background:'#fef3c7', color:'#92400e', padding:'0.1rem 0.4rem', borderRadius:'3px', fontSize:'0.625rem', fontWeight:'600' }}>{p}</span>)}
                                                        {pts.length > 2 && <span style={{ fontSize:'0.625rem', color:'#94a3b8' }}>+{pts.length-2}</span>}
                                                    </div>
                                                ) : '-'; })()}
                                            </td>
                                            <td style={{ fontSize:'0.75rem', color:'#475569' }}>
                                                {(() => {
                                                    const linked = (contacts||[]).filter(c => (opp.keyContacts||[]).includes(c.id));
                                                    if (linked.length === 0) return '-';
                                                    return <div style={{ display:'flex', flexWrap:'wrap', gap:'0.2rem' }}>
                                                        {linked.slice(0,2).map(c => <span key={c.id} style={{ background:'#f0fdf4', color:'#166534', padding:'0.1rem 0.4rem', borderRadius:'3px', fontSize:'0.625rem', fontWeight:'600' }}>{c.firstName} {c.lastName}</span>)}
                                                        {linked.length > 2 && <span style={{ fontSize:'0.625rem', color:'#94a3b8' }}>+{linked.length-2}</span>}
                                                    </div>;
                                                })()}
                                            </td>
                                            {canViewField('notes') && (
                                                <td style={{ maxWidth:'200px' }}>
                                                    {opp.notes ? (
                                                        <span style={{ fontSize:'0.75rem', color:'#64748b', cursor:'pointer', display:'block', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}
                                                            title={opp.notes} onClick={e => { const r = e.currentTarget.getBoundingClientRect(); setNotesPopover({ opp, type:'notes', rect: r }); e.stopPropagation(); }}>
                                                            {opp.notes}
                                                        </span>
                                                    ) : '-'}
                                                </td>
                                            )}
                                            {canViewField('nextSteps') && (
                                                <td style={{ minWidth:'200px', maxWidth:'300px', whiteSpace:'normal', lineHeight:'1.4' }}>
                                                    <div style={{ color:'#64748b', fontSize:'0.8125rem' }}>{opp.nextSteps || '-'}</div>
                                                </td>
                                            )}
                                            <td style={{ whiteSpace:'nowrap' }}>
                                                <div className="action-buttons">
                                                    <button className="action-btn" onClick={() => {
                                                        setActivityInitialContext({ opportunityId: opp.id, opportunityName: opp.opportunityName||opp.account, companyName: opp.account });
                                                        setEditingActivity(null); setShowActivityModal(true);
                                                    }}>+ Activity</button>
                                                    <button className="action-btn" onClick={() => { setEditingTask({ relatedTo: opp.id, opportunityId: opp.id }); setShowTaskModal(true); }}>+ Task</button>
                                                    <button className="action-btn" onClick={() => handleEdit(opp)}>Edit</button>
                                                    <button className="action-btn delete" onClick={() => handleDelete(opp.id)}>Delete</button>
                                                </div>
                                            </td>
                                        </tr>
                                        {expandedOppActivities[opp.id] !== false && (() => {
                                            const oppActs = activities.filter(a => a.opportunityId === opp.id).sort((a,b) => new Date(b.date)-new Date(a.date));
                                            if (oppActs.length === 0) return null;
                                            return (
                                                <tr key={opp.id+'-acts'} style={{ background:'#f8fafc' }}>
                                                    <td colSpan={99} style={{ padding:'0.5rem 1rem 0.5rem 2.5rem', borderBottom:'2px solid #e2e8f0' }}>
                                                        <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', marginBottom:'0.375rem' }}>
                                                            <span style={{ fontSize:'0.6875rem', fontWeight:'700', color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.05em' }}>Activity Log</span>
                                                            <span style={{ fontSize:'0.625rem', background:'#dbeafe', color:'#1e40af', padding:'0.1rem 0.4rem', borderRadius:'999px', fontWeight:'700' }}>{oppActs.length}</span>
                                                        </div>
                                                        <div style={{ display:'flex', gap:'0.5rem', flexWrap:'wrap' }}>
                                                            {oppActs.slice(0,5).map(a => (
                                                                <div key={a.id} style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:'6px', padding:'0.25rem 0.625rem', fontSize:'0.75rem', color:'#475569', display:'flex', alignItems:'center', gap:'0.375rem' }}>
                                                                    <span style={{ background:'#dbeafe', color:'#1e40af', padding:'0.05rem 0.35rem', borderRadius:'3px', fontSize:'0.625rem', fontWeight:'700', flexShrink:0 }}>{a.type}</span>
                                                                    <span style={{ color:'#94a3b8', flexShrink:0 }}>{a.date ? new Date(a.date).toLocaleDateString('en-US',{month:'short',day:'numeric'}) : '—'}</span>
                                                                    {a.notes && <span style={{ color:'#64748b', maxWidth:'200px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{a.notes}</span>}
                                                                </div>
                                                            ))}
                                                            {oppActs.length > 5 && <span style={{ fontSize:'0.75rem', color:'#94a3b8', alignSelf:'center' }}>+{oppActs.length-5} more</span>}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })()}
                                        {opp.stage === 'Closed Lost' && opp.lostCategory && (
                                            <tr style={{ background:'#fff5f5' }}>
                                                <td colSpan={99} style={{ padding:'0.375rem 1rem 0.375rem 2rem', borderBottom:'1px solid #fecaca' }}>
                                                    <span style={{ fontSize:'0.6875rem', fontWeight:'700', color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.05em', marginRight:'0.5rem' }}>Loss Reason:</span>
                                                    <span style={{ fontSize:'0.75rem', fontWeight:'700', color:'#b91c1c', background:'#fee2e2', padding:'0.1rem 0.5rem', borderRadius:'4px', marginRight:'0.5rem' }}>{opp.lostCategory}</span>
                                                    {opp.lostReason && <span style={{ fontSize:'0.75rem', color:'#64748b' }}>{opp.lostReason}</span>}
                                                </td>
                                            </tr>
                                        )}
                                        </React.Fragment>
                                            );
                                        })}
                                </tbody>
                            </table>
                            {oppFilteredOpps.length === 0 && (
                                <div style={{ textAlign:'center', padding:'4rem 2rem', display:'flex', flexDirection:'column', alignItems:'center', gap:'1rem' }}>
                                    <svg width="72" height="72" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <rect x="8" y="20" width="56" height="36" rx="6" fill="#eff6ff" stroke="#93c5fd" strokeWidth="1.5"/>
                                        <rect x="16" y="28" width="14" height="20" rx="3" fill="#93c5fd"/>
                                        <rect x="34" y="32" width="14" height="16" rx="3" fill="#60a5fa"/>
                                        <rect x="52" y="36" width="8" height="12" rx="3" fill="#3b82f6"/>
                                        <circle cx="36" cy="12" r="6" fill="#dbeafe" stroke="#93c5fd" strokeWidth="1.5"/>
                                        <path d="M36 9v6M33 12h6" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round"/>
                                    </svg>
                                    <div>
                                        <div style={{ fontWeight:'700', fontSize:'1.0625rem', color:'#1e293b', marginBottom:'0.5rem' }}>No opportunities found</div>
                                        <div style={{ fontSize:'0.875rem', color:'#64748b', marginBottom:'1.25rem' }}>{oppAnyActive ? 'Try adjusting your filters' : 'Add your first opportunity to get started'}</div>
                                        {canEdit && !oppAnyActive && <button className="btn" onClick={() => { setEditingOpp(null); setShowModal(true); }}>+ New Opportunity</button>}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                );
            })()}

            {activeTab === 'tasks' && (
                <div className="tab-page">
                    <div className="tab-page-header">
                        <div className="tab-page-header-bar"></div>
                        <div>
                            <h2>Tasks &amp; Activities</h2>
                            <p>Track follow-ups, calls, and team activities</p>
                        </div>
                    </div>
                    <ViewingBar
                        allPipelines={allPipelines} activePipeline={activePipeline} setActivePipelineId={setActivePipelineId}
                        canSeeAll={canSeeAll} allRepNames={allRepNames} allTeamNames={allTeamNames} allTerritoryNames={allTerritoryNames}
                        viewingRep={viewingRep} setViewingRep={setViewingRep}
                        viewingTeam={viewingTeam} setViewingTeam={setViewingTeam}
                        viewingTerritory={viewingTerritory} setViewingTerritory={setViewingTerritory}
                        visibleCount={visibleTasks.length} totalCount={(canSeeAll ? (tasks||[]) : (tasks||[]).filter(t => !t.assignedTo || t.assignedTo === currentUser)).length} countLabel="tasks"
                        isAdmin={isAdmin}
                    />
                <div className="table-container">
                    <div className="table-header" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 0, padding: 0 }}>
                        {/* ── Row 1: sub-view tabs ── */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.625rem 1rem', borderBottom: '1px solid #e2e8f0' }}>
                            <div style={{ display: 'flex', background: '#f1f3f5', borderRadius: '6px', padding: '3px' }}>
                                <button onClick={() => setTasksSubView('tasks')}
                                    style={{ padding: '0.5rem 1.25rem', borderRadius: '4px', border: 'none', cursor: 'pointer', fontWeight: '700', fontSize: '0.8125rem', fontFamily: 'inherit', transition: 'all 0.2s',
                                        background: tasksSubView === 'tasks' ? '#ffffff' : 'transparent', color: tasksSubView === 'tasks' ? '#1e293b' : '#64748b',
                                        boxShadow: tasksSubView === 'tasks' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>TASKS</button>
                                <button onClick={() => setTasksSubView('activities')}
                                    style={{ padding: '0.5rem 1.25rem', borderRadius: '4px', border: 'none', cursor: 'pointer', fontWeight: '700', fontSize: '0.8125rem', fontFamily: 'inherit', transition: 'all 0.2s',
                                        background: tasksSubView === 'activities' ? '#ffffff' : 'transparent', color: tasksSubView === 'activities' ? '#1e293b' : '#64748b',
                                        boxShadow: tasksSubView === 'activities' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>COMPLETED</button>
                                <button onClick={() => { setTasksSubView('feed'); const now = new Date().toISOString(); setFeedLastRead(now); try { safeStorage.setItem('feedLastRead', now); } catch(e) {} }}
                                    style={{ position: 'relative', padding: '0.5rem 1.25rem', borderRadius: '4px', border: 'none', cursor: 'pointer', fontWeight: '700', fontSize: '0.8125rem', fontFamily: 'inherit', transition: 'all 0.2s',
                                        background: tasksSubView === 'feed' ? '#ffffff' : 'transparent', color: tasksSubView === 'feed' ? '#1e293b' : '#64748b',
                                        boxShadow: tasksSubView === 'feed' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>FEED</button>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                {tasksSubView === 'tasks' && canEdit && <button className="btn" onClick={handleAddTask}>+ ADD TASK</button>}
                                {tasksSubView === 'activities' && <button className="btn" onClick={() => handleAddActivity()}>+ LOG ACTIVITY</button>}
                            </div>
                        </div>

                        {/* ── Row 2: filter bar (opp-style) — only on Tasks sub-view ── */}
                        {tasksSubView === 'tasks' && (() => {
                            const TaskDD = ({ label, icon, options, selected, onToggle, onClear, renderOption }) => {
                                const [open, setOpen] = React.useState(false);
                                const ref = React.useRef(null);
                                React.useEffect(() => {
                                    if (!open) return;
                                    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
                                    document.addEventListener('mousedown', h);
                                    return () => document.removeEventListener('mousedown', h);
                                }, [open]);
                                const isActive = selected.length > 0;
                                const activeLabels = selected.map(s => options.find(o => (o.key||o) === s)).filter(Boolean).map(o => o.label||o);
                                const btnLabel = isActive ? (activeLabels.length === 1 ? `${label}: ${activeLabels[0]}` : `${label}: ${activeLabels.length}`) : label;
                                return (
                                    <div ref={ref} style={{ position:'relative', flexShrink:0 }}>
                                        <button onClick={() => setOpen(o => !o)} style={{
                                            display:'flex', alignItems:'center', gap:'0.3rem',
                                            padding:'0.25rem 0.5rem', borderRadius:'6px', cursor:'pointer',
                                            fontFamily:'inherit', fontSize:'0.6875rem', fontWeight:'700',
                                            transition:'all 0.15s', whiteSpace:'nowrap',
                                            border:'1px solid ' + (isActive ? '#2563eb' : '#e2e8f0'),
                                            background: isActive ? '#2563eb' : '#f8fafc',
                                            color: isActive ? '#fff' : '#64748b',
                                        }}>
                                            {icon && <span style={{ fontSize:'0.75rem' }}>{icon}</span>}
                                            <span>{btnLabel}</span>
                                            <span style={{ fontSize:'0.5rem', opacity:0.6 }}>{open ? '▲' : '▼'}</span>
                                        </button>
                                        {open && (
                                            <div style={{ position:'absolute', top:'calc(100% + 4px)', left:0, zIndex:400,
                                                background:'#fff', border:'1px solid #e2e8f0', borderRadius:'10px',
                                                boxShadow:'0 8px 24px rgba(0,0,0,0.12)', minWidth:'170px', overflow:'hidden' }}>
                                                <div onClick={() => { onClear(); setOpen(false); }}
                                                    style={{ display:'flex', alignItems:'center', gap:'0.5rem',
                                                        padding:'0.5rem 0.75rem', cursor:'pointer', fontSize:'0.8125rem',
                                                        color: !isActive ? '#2563eb' : '#1e293b', fontWeight: !isActive ? '700' : '400',
                                                        background: !isActive ? '#eff6ff' : 'transparent', borderBottom:'1px solid #f1f5f9' }}>
                                                    <span style={{ width:'14px', textAlign:'center', fontSize:'0.75rem' }}>{!isActive ? '✓' : ''}</span>
                                                    <span>All</span>
                                                </div>
                                                {options.map(opt => {
                                                    const key = opt.key || opt;
                                                    const checked = selected.includes(key);
                                                    return (
                                                        <div key={key} onClick={() => onToggle(key)}
                                                            style={{ display:'flex', alignItems:'center', gap:'0.5rem',
                                                                padding:'0.5rem 0.75rem', cursor:'pointer', fontSize:'0.8125rem',
                                                                color: checked ? '#2563eb' : '#1e293b', fontWeight: checked ? '700' : '400',
                                                                background: checked ? '#eff6ff' : 'transparent', transition:'background 0.1s' }}>
                                                            <span style={{ width:'14px', textAlign:'center', fontSize:'0.75rem' }}>{checked ? '✓' : ''}</span>
                                                            {renderOption ? renderOption(opt, checked) : <span>{opt.label || opt}</span>}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                );
                            };
                            const taskStatusOpts = [
                                { key: 'Overdue',    label: 'Overdue',    color: '#ef4444' },
                                { key: 'Open',       label: 'Open',       color: '#2563eb' },
                                { key: 'In-Process', label: 'In-Process', color: '#f59e0b' },
                            ];
                            const anyTaskFilter = taskStatusFilter.length > 0;
                            return (
                                <div style={{ display:'flex', alignItems:'center', gap:'0.375rem', padding:'0.625rem 1rem', borderBottom:'1px solid #e2e8f0', flexWrap:'wrap' }}>
                                    <div style={{ width:'3px', height:'18px', background:'linear-gradient(to bottom, #2563eb, #7c3aed)', borderRadius:'2px', flexShrink:0, marginRight:'0.25rem' }} />
                                    <span style={{ fontSize:'0.6875rem', fontWeight:'800', color:'#0f172a', marginRight:'0.5rem', flexShrink:0 }}>Filter:</span>

                                    <TaskDD label="Status" icon="🔖"
                                        options={taskStatusOpts}
                                        selected={taskStatusFilter}
                                        onToggle={k => setTaskStatusFilter(prev => prev.includes(k) ? prev.filter(v => v !== k) : [...prev, k])}
                                        onClear={() => setTaskStatusFilter([])}
                                        renderOption={(opt, checked) => (
                                            <span style={{ display:'flex', alignItems:'center', gap:'0.375rem' }}>
                                                <span style={{ width:'8px', height:'8px', borderRadius:'50%', background: opt.color, flexShrink:0 }}></span>
                                                <span>{opt.label}</span>
                                            </span>
                                        )} />

                                    {anyTaskFilter && (
                                        <button onClick={() => setTaskStatusFilter([])}
                                            style={{ padding:'0.2rem 0.5rem', borderRadius:'4px', border:'1px solid #e2e8f0', background:'#fff', color:'#94a3b8', fontSize:'0.625rem', fontWeight:'600', cursor:'pointer', fontFamily:'inherit' }}>
                                            ✕ Clear all
                                        </button>
                                    )}

                                    <div style={{ display:'flex', gap:'0.5rem', alignItems:'center', marginLeft:'auto', flexShrink:0 }}>
                                        <div style={{ display:'flex', background:'#f1f3f5', borderRadius:'6px', padding:'2px' }}>
                                            {['card', 'table'].map(mode => (
                                                <button key={mode} onClick={() => setTaskViewMode(mode)}
                                                    style={{ padding:'0.3rem 0.875rem', borderRadius:'4px', border:'none', cursor:'pointer', fontWeight:'700', fontSize:'0.6875rem', fontFamily:'inherit', transition:'all 0.2s', textTransform:'capitalize',
                                                        background: taskViewMode === mode ? '#ffffff' : 'transparent', color: taskViewMode === mode ? '#1e293b' : '#64748b',
                                                        boxShadow: taskViewMode === mode ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>{mode}</button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}

                        {/* ── Row 3: right-side action buttons (CSV + Import) ── */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.5rem', padding: '0.5rem 1rem', borderBottom: '1px solid #e2e8f0' }}>
                            {tasksSubView === 'tasks' && (
                                <button className="btn btn-secondary" style={{ padding: '0.3rem 0.625rem', fontSize: '0.6875rem' }} onClick={() => {
                                    const today = new Date(); today.setHours(0,0,0,0);
                                    const getStatus = (t) => t.status || (t.completed ? 'Completed' : 'Open');
                                    const isOverdue = (t) => { const s = getStatus(t); return (s === 'Open' || s === 'In-Process') && t.dueDate && new Date(t.dueDate) < today; };
                                    const rows = [...visibleTasks]
                                        .filter(t => {
                                            if (taskStatusFilter.length === 0) return true;
                                            const st = getStatus(t);
                                            if (taskStatusFilter.includes('Overdue') && isOverdue(t)) return true;
                                            if (taskStatusFilter.includes('Open') && st === 'Open' && !isOverdue(t)) return true;
                                            if (taskStatusFilter.includes('In-Process') && st === 'In-Process') return true;
                                            return false;
                                        })
                                        .sort((a, b) => new Date(a.dueDate || '9999') - new Date(b.dueDate || '9999'));
                                    exportToCSV(
                                        `tasks-${new Date().toISOString().slice(0,10)}.csv`,
                                        ['Title','Type','Status','Due Date','Priority','Assigned To','Account','Related To','Notes'],
                                        rows.map(t => {
                                            const ro = t.opportunityId ? (opportunities||[]).find(o => o.id === t.opportunityId) : null;
                                            const rc = t.contactId ? contacts.find(c => c.id === t.contactId) : null;
                                            const ra = t.accountId ? (accounts||[]).find(a => a.id === t.accountId) : null;
                                            const related = ro ? (ro.opportunityName||ro.account) : rc ? (rc.firstName+' '+rc.lastName) : ra ? ra.name : t.relatedTo||'';
                                            return [t.title||'', t.type||'', getStatus(t), t.dueDate||'', t.priority||'', t.assignedTo||'', t.account||'', related, t.notes||''];
                                        })
                                    );
                                }}>📤 Export</button>
                            )}
                            {tasksSubView === 'activities' && (
                                <button className="btn btn-secondary" style={{ padding: '0.3rem 0.625rem', fontSize: '0.6875rem' }} onClick={() => {
                                    const rows = [...(activities||[])]
                                        .sort((a,b) => new Date(b.date||'0') - new Date(a.date||'0'));
                                    exportToCSV(
                                        `activities-${new Date().toISOString().slice(0,10)}.csv`,
                                        ['Date','Type','Subject','Account','Rep','Duration (min)','Notes'],
                                        rows.map(a => [a.date||'', a.type||'', a.subject||'', a.account||'', a.rep||a.salesRep||'', a.duration||'', a.notes||''])
                                    );
                                }}>📤 Export</button>
                            )}
                            <button className="btn" style={{ background: '#10b981', color: '#fff', padding: '0.3rem 0.625rem', fontSize: '0.6875rem', fontWeight: '700' }} onClick={() => setShowOutlookImportModal(true)}>📥 Import</button>
                        </div>
                    </div>

                    {tasksSubView === 'tasks' && (
                    <div style={{ padding: '1.5rem' }}>
                        {visibleTasks.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '4rem 2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                                <svg width="72" height="72" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <rect x="14" y="10" width="44" height="52" rx="6" fill="#f0fdf4" stroke="#bbf7d0" strokeWidth="2"/>
                                    <path d="M24 26h24M24 34h24M24 42h16" stroke="#86efac" strokeWidth="2" strokeLinecap="round"/>
                                    <circle cx="52" cy="50" r="10" fill="#22c55e"/>
                                    <path d="M48 50l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                                <div>
                                    <div style={{ width:'72px', height:'72px', borderRadius:'20px', background:'linear-gradient(135deg,#f0fdf4,#dcfce7)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'2rem', margin:'0 auto 0.75rem' }}>✅</div>
                                    <div style={{ fontWeight: '700', fontSize: '1.0625rem', color: '#1e293b', marginBottom: '0.375rem' }}>No tasks yet</div>
                                    <div style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '1.25rem', maxWidth:'280px' }}>Create tasks to track follow-ups, calls, and next steps.</div>
                                    {canEdit && <button className="btn" onClick={handleAddTask}>+ Add Task</button>}
                                </div>
                            </div>
                        ) : (
                            <>
                            {(() => {
                                const getStatus = (t) => t.status || (t.completed ? 'Completed' : 'Open');
                                const todayStr = new Date().toISOString().split('T')[0];
                                const today = new Date(todayStr);
                                const weekEnd = new Date(today); weekEnd.setDate(today.getDate() + 7);
                                const isNotDone = (t) => getStatus(t) !== 'Completed';
                                const isOverdue = (t) => isNotDone(t) && t.dueDate && new Date(t.dueDate) < today;

                                // Apply status filter
                                const filterTasks = (tasks) => {
                                    if (taskStatusFilter.length === 0) return tasks;
                                    return tasks.filter(t => {
                                        const st = getStatus(t);
                                        if (taskStatusFilter.includes('Overdue') && isOverdue(t)) return true;
                                        if (taskStatusFilter.includes('Open') && st === 'Open' && !isOverdue(t)) return true;
                                        if (taskStatusFilter.includes('In-Process') && st === 'In-Process') return true;
                                        return false;
                                    });
                                };

                                const overdueTasks = filterTasks(visibleTasks.filter(t => isNotDone(t) && getStatus(t) !== 'In-Process' && t.dueDate && new Date(t.dueDate) < today));
                                const inProcessTasks = filterTasks(visibleTasks.filter(t => getStatus(t) === 'In-Process'));
                                const todayTasks = filterTasks(visibleTasks.filter(t => isNotDone(t) && getStatus(t) !== 'In-Process' && t.dueDate === todayStr));
                                const weekTasks = filterTasks(visibleTasks.filter(t => { if (!isNotDone(t) || getStatus(t) === 'In-Process') return false; const d = new Date(t.dueDate); return d > today && d <= weekEnd; }));
                                const monthTasks = filterTasks(visibleTasks.filter(t => { if (!isNotDone(t) || getStatus(t) === 'In-Process') return false; const d = new Date(t.dueDate); return d > weekEnd && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear(); }));
                                const futureTasks = filterTasks(visibleTasks.filter(t => { if (!isNotDone(t) || getStatus(t) === 'In-Process') return false; const d = new Date(t.dueDate); const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0); return d > monthEnd; }));
                                const allOpenTasks = filterTasks(visibleTasks.filter(t => isNotDone(t))).sort((a, b) => new Date(a.dueDate || '9999') - new Date(b.dueDate || '9999'));

                                const sectionColors = {
                                    overdue: '#ef4444', inProcess: '#f59e0b', today: '#2563eb', thisWeek: '#6366f1', thisMonth: '#8b5cf6', future: '#64748b', allOpen: '#334155'
                                };

                                const Section = ({ id, label, count, tasks: sectionTasks, borderColor }) => {
                                    if (sectionTasks.length === 0) return null;
                                    const isOpen = id === 'overdue' ? tasksExpandedSections[id] !== false : tasksExpandedSections[id];
                                    return (
                                        <div style={{ marginBottom: '1.25rem' }}>
                                            <div onClick={() => setTasksExpandedSections({...tasksExpandedSections, [id]: !isOpen})}
                                                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', padding: '0.5rem 0', borderBottom: '1px solid #e2e8f0', marginBottom: isOpen ? '0.5rem' : 0 }}>
                                                <div style={{ width: '4px', height: '18px', borderRadius: '2px', background: borderColor, flexShrink: 0 }} />
                                                <span style={{ fontWeight: '700', fontSize: '0.8125rem', color: '#1e293b', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{label}</span>
                                                <span style={{ background: borderColor + '18', color: borderColor, fontSize: '0.6875rem', fontWeight: '700', padding: '0.1rem 0.5rem', borderRadius: '999px' }}>{count}</span>
                                                <span style={{ marginLeft: 'auto', color: '#94a3b8', fontSize: '0.75rem' }}>{isOpen ? '▼' : '▶'}</span>
                                            </div>
                                            {isOpen && (
                                                <div>
                                                    {taskViewMode === 'card' ? (
                                                        sectionTasks.map((task, tIdx) => (
                                                            <div key={task.id} style={{ borderLeft: '3px solid ' + borderColor, marginBottom: '0.25rem', borderRadius: '0 6px 6px 0' }}>
                                                                <TaskItem task={task} opportunities={opportunities} contacts={contacts} accounts={accounts} onEdit={handleEditTask} onComplete={handleCompleteTask} onDelete={handleDeleteTask} onView={setViewingTask} rowIndex={tIdx} />
                                                            </div>
                                                        ))
                                                    ) : (
                                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                                                            <thead>
                                                                <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                                                                    <th style={{ padding: '0.5rem', textAlign: 'left', fontWeight: '700', color: '#64748b', fontSize: '0.6875rem', textTransform: 'uppercase', width: '90px' }}>Status</th>
                                                                    <th style={{ padding: '0.5rem', textAlign: 'left', fontWeight: '700', color: '#64748b', fontSize: '0.6875rem', textTransform: 'uppercase' }}>Title</th>
                                                                    <th style={{ padding: '0.5rem', textAlign: 'left', fontWeight: '700', color: '#64748b', fontSize: '0.6875rem', textTransform: 'uppercase', width: '80px' }}>Type</th>
                                                                    <th style={{ padding: '0.5rem', textAlign: 'center', fontWeight: '700', color: '#64748b', fontSize: '0.6875rem', textTransform: 'uppercase', width: '100px' }}>Due Date</th>
                                                                    <th style={{ padding: '0.5rem', textAlign: 'left', fontWeight: '700', color: '#64748b', fontSize: '0.6875rem', textTransform: 'uppercase' }}>Related To</th>
                                                                    <th style={{ padding: '0.5rem', textAlign: 'right', fontWeight: '700', color: '#64748b', fontSize: '0.6875rem', textTransform: 'uppercase', width: '100px' }}>Actions</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {sectionTasks.map((task, tIdx) => {
                                                                    const st = getStatus(task);
                                                                    const stc = { 'Open': { bg: '#dbeafe', c: '#1e40af' }, 'In-Process': { bg: '#fef3c7', c: '#92400e' }, 'Completed': { bg: '#dcfce7', c: '#166534' } }[st] || { bg: '#dbeafe', c: '#1e40af' };
                                                                    const ro = task.opportunityId ? (opportunities || []).find(o => o.id === task.opportunityId) : null;
                                                                    const rc = task.contactId ? (contacts || []).find(c => c.id === task.contactId) : null;
                                                                    const ra = task.accountId ? (accounts || []).find(a => a.id === task.accountId) : null;
                                                                    const related = ro ? (ro.opportunityName || ro.account) : rc ? (rc.firstName + ' ' + rc.lastName) : ra ? ra.name : task.relatedTo || '—';
                                                                    return (
                                                                        <tr key={task.id} style={{ borderBottom: '1px solid #f1f3f5', borderLeft: '3px solid ' + borderColor, background: tIdx % 2 === 0 ? '#ffffff' : '#f8fafc', cursor: 'pointer' }}
                                                                            onClick={() => setViewingTask(task)}>
                                                                            <td style={{ padding: '0.5rem' }}>
                                                                                <select value={st} onClick={e => e.stopPropagation()} onChange={e => { e.stopPropagation(); handleCompleteTask(task.id, e.target.value); }}
                                                                                    style={{ padding: '0.2rem 0.25rem', border: '1px solid #e2e8f0', borderRadius: '4px', fontSize: '0.6875rem', fontWeight: '700', cursor: 'pointer', background: stc.bg, color: stc.c, fontFamily: 'inherit', width: '85px' }}>
                                                                                    <option value="Open">Open</option><option value="In-Process">In-Process</option><option value="Completed">Completed</option>
                                                                                </select>
                                                                            </td>
                                                                            <td style={{ padding: '0.5rem', fontWeight: '600', color: '#1e293b' }}>{task.title}</td>
                                                                            <td style={{ padding: '0.5rem' }}>
                                                                                <span style={{ background: '#2563eb18', color: '#2563eb', padding: '0.125rem 0.4rem', borderRadius: '4px', fontSize: '0.6875rem', fontWeight: '600' }}>{task.type}</span>
                                                                            </td>
                                                                            <td style={{ padding: '0.5rem', textAlign: 'center', color: isOverdue(task) ? '#ef4444' : '#64748b', fontWeight: isOverdue(task) ? '700' : '400', fontSize: '0.8125rem' }}>
                                                                                {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : '—'}
                                                                            </td>
                                                                            <td style={{ padding: '0.5rem', color: '#64748b', fontSize: '0.8125rem' }}>{related}</td>
                                                                            <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                                                                                <div className="action-buttons">
                                                                                    <button className="action-btn" onClick={e => { e.stopPropagation(); handleEditTask(task); }}>Edit</button>
                                                                                    <button className="action-btn delete" onClick={e => { e.stopPropagation(); handleDeleteTask(task.id); }}>Delete</button>
                                                                                </div>
                                                                            </td>
                                                                        </tr>
                                                                    );
                                                                })}
                                                            </tbody>
                                                        </table>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                };

                                return (
                                    <>
                                    <Section id="overdue" label="Overdue" count={overdueTasks.length} tasks={overdueTasks} borderColor={sectionColors.overdue} />
                                    <Section id="inProcess" label="In-Process" count={inProcessTasks.length} tasks={inProcessTasks} borderColor={sectionColors.inProcess} />
                                    <Section id="today" label="Today" count={todayTasks.length} tasks={todayTasks} borderColor={sectionColors.today} />
                                    <Section id="thisWeek" label="This Week" count={weekTasks.length} tasks={weekTasks} borderColor={sectionColors.thisWeek} />
                                    <Section id="thisMonth" label="This Month" count={monthTasks.length} tasks={monthTasks} borderColor={sectionColors.thisMonth} />
                                    <Section id="all" label="Future" count={futureTasks.length} tasks={futureTasks.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))} borderColor={sectionColors.future} />
                                    <Section id="allOpen" label="All" count={allOpenTasks.length} tasks={allOpenTasks} borderColor={sectionColors.allOpen} />
                                    {taskStatusFilter.length > 0 && overdueTasks.length === 0 && inProcessTasks.length === 0 && todayTasks.length === 0 && weekTasks.length === 0 && monthTasks.length === 0 && futureTasks.length === 0 && (
                                        <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>No tasks match the selected filters.</div>
                                    )}
                                    </>
                                );
                            })()}
                            </>
                        )}
                    </div>
                    )}

                    {tasksSubView === 'activities' && (
                    <div style={{ padding: '1.5rem' }}>
                        {(() => {
                            const getStatus = (t) => t.status || (t.completed ? 'Completed' : 'Open');
                            const completedTasks = visibleTasks.filter(t => getStatus(t) === 'Completed');
                            const filteredCompleted = completedTasks.filter(t => {
                                const cd = t.completedDate || t.dueDate;
                                if (completedDateFrom && cd < completedDateFrom) return false;
                                if (completedDateTo && cd > completedDateTo) return false;
                                return true;
                            }).sort((a, b) => new Date(b.completedDate || b.dueDate) - new Date(a.completedDate || a.dueDate));

                            const todayStr2 = new Date().toISOString().split('T')[0];
                            const today2 = new Date(todayStr2);
                            const weekEnd2 = new Date(today2); weekEnd2.setDate(today2.getDate() + 7);
                            const monthEnd2 = new Date(today2.getFullYear(), today2.getMonth() + 1, 0);

                            const completedToday = filteredCompleted.filter(t => (t.completedDate || t.dueDate) === todayStr2);
                            const completedThisWeek = filteredCompleted.filter(t => { const d = new Date(t.completedDate || t.dueDate); return d >= today2 && d <= weekEnd2 && (t.completedDate || t.dueDate) !== todayStr2; });
                            const completedThisMonth = filteredCompleted.filter(t => { const d = new Date(t.completedDate || t.dueDate); const m = today2.getMonth(); const y = today2.getFullYear(); return d.getMonth() === m && d.getFullYear() === y && d > weekEnd2; });

                            const cSectionColors = { today: '#2563eb', thisWeek: '#6366f1', thisMonth: '#8b5cf6', all: '#334155' };

                            const CSection = ({ id, label, count, tasks: sTasks, borderColor }) => {
                                if (sTasks.length === 0) return null;
                                const isOpen = tasksExpandedSections['c_' + id] !== false;
                                return (
                                    <div style={{ marginBottom: '1.25rem' }}>
                                        <div onClick={() => setTasksExpandedSections({...tasksExpandedSections, ['c_' + id]: !isOpen})}
                                            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', padding: '0.5rem 0', borderBottom: '1px solid #e2e8f0', marginBottom: isOpen ? '0.5rem' : 0 }}>
                                            <div style={{ width: '4px', height: '18px', borderRadius: '2px', background: borderColor, flexShrink: 0 }} />
                                            <span style={{ fontWeight: '700', fontSize: '0.8125rem', color: '#1e293b', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{label}</span>
                                            <span style={{ background: borderColor + '18', color: borderColor, fontSize: '0.6875rem', fontWeight: '700', padding: '0.1rem 0.5rem', borderRadius: '999px' }}>{count}</span>
                                            <span style={{ marginLeft: 'auto', color: '#94a3b8', fontSize: '0.75rem' }}>{isOpen ? '▼' : '▶'}</span>
                                        </div>
                                        {isOpen && sTasks.map((task, tIdx) => (
                                            <TaskItem key={task.id} task={task} opportunities={opportunities} contacts={contacts} accounts={accounts} onEdit={handleEditTask} onComplete={handleCompleteTask} onDelete={handleDeleteTask} onView={setViewingTask} rowIndex={tIdx} />
                                        ))}
                                    </div>
                                );
                            };

                            return (
                                <>
                                <div style={{ marginBottom: '1.5rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                            <h3 style={{ fontSize: '1rem', fontWeight: '700', color: '#1e293b', margin: 0 }}>Completed Tasks ({filteredCompleted.length})</h3>
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                            <span style={{ fontSize: '0.75rem', fontWeight: '600', color: '#64748b' }}>Filter:</span>
                                            <input type="date" value={completedDateFrom} onChange={e => setCompletedDateFrom(e.target.value)}
                                                style={{ padding: '0.3rem 0.5rem', border: '1px solid #e2e8f0', borderRadius: '4px', fontSize: '0.75rem', fontFamily: 'inherit' }} />
                                            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>to</span>
                                            <input type="date" value={completedDateTo} onChange={e => setCompletedDateTo(e.target.value)}
                                                style={{ padding: '0.3rem 0.5rem', border: '1px solid #e2e8f0', borderRadius: '4px', fontSize: '0.75rem', fontFamily: 'inherit' }} />
                                            {(completedDateFrom || completedDateTo) && (
                                                <button onClick={() => { setCompletedDateFrom(''); setCompletedDateTo(''); }}
                                                    style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.75rem', fontWeight: '600', fontFamily: 'inherit' }}>Clear</button>
                                            )}
                                        </div>
                                    </div>
                                    {filteredCompleted.length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.875rem' }}>No completed tasks{(completedDateFrom || completedDateTo) ? ' in this date range' : ''}</div>
                                    ) : (
                                        <div>
                                            <CSection id="today" label="Today" count={completedToday.length} tasks={completedToday} borderColor={cSectionColors.today} />
                                            <CSection id="thisWeek" label="This Week" count={completedThisWeek.length} tasks={completedThisWeek} borderColor={cSectionColors.thisWeek} />
                                            <CSection id="thisMonth" label="This Month" count={completedThisMonth.length} tasks={completedThisMonth} borderColor={cSectionColors.thisMonth} />
                                            <CSection id="all" label="All" count={filteredCompleted.length} tasks={filteredCompleted} borderColor={cSectionColors.all} />
                                        </div>
                                    )}
                                </div>
                                </>
                            );
                        })()}
                    </div>
                    )}

                    {tasksSubView === 'feed' && (
                    <div style={{ padding: '1.5rem' }}>
                        <div style={{ display: 'flex', gap: '0.375rem', marginBottom: '1.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
                            {feedFilterButtons.map(f => (
                                <button key={f.key} onClick={() => setFeedFilter(f.key)}
                                    style={{ padding: '0.3rem 0.75rem', borderRadius: '999px', border: feedFilter === f.key ? '1.5px solid #2563eb' : '1.5px solid #e2e8f0', background: feedFilter === f.key ? '#eff6ff' : '#fff', color: feedFilter === f.key ? '#2563eb' : '#64748b', fontWeight: feedFilter === f.key ? '700' : '500', fontSize: '0.75rem', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}>
                                    {f.label}
                                </button>
                            ))}
                            <span style={{ marginLeft: 'auto', fontSize: '0.6875rem', color: '#94a3b8' }}>{feedFiltered.length} events</span>
                        </div>
                        {feedFiltered.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8', border: '1px dashed #e2e8f0', borderRadius: '10px' }}>
                                No activity yet
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                {feedFiltered.map((item, idx) => {
                                    const isNew = item.timestamp > feedLastRead && item.actor !== currentUser;
                                    const isMentioned = (item.mentions || []).includes(currentUser);
                                    const hasBorder = idx < feedFiltered.length - 1;
                                    return (
                                        <div key={item.id} style={{ display: 'flex', gap: '0.75rem', padding: '0.75rem 0', borderBottom: hasBorder ? '1px solid #f1f5f9' : 'none', alignItems: 'flex-start' }}>
                                            <div style={{ position: 'relative', flexShrink: 0 }}>
                                                <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: item.actor ? feedGetAvatarColor(item.actor) : '#e2e8f0', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6875rem', fontWeight: '800' }}>
                                                    {item.actor ? feedGetInitials(item.actor) : item.icon}
                                                </div>
                                                <span style={{ position: 'absolute', bottom: '-2px', right: '-2px', fontSize: '0.75rem', background: '#fff', borderRadius: '50%' }}>{item.icon}</span>
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.375rem', flexWrap: 'wrap', marginBottom: '0.125rem' }}>
                                                    {item.actor && <span style={{ fontWeight: '700', fontSize: '0.8125rem', color: '#1e293b' }}>{item.actor}</span>}
                                                    <span style={{ fontSize: '0.8125rem', color: '#64748b' }}>{item.label}</span>
                                                    {item.opp && (
                                                        <button type="button" onClick={() => { setEditingOpp(item.opp); setShowModal(true); }}
                                                            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.8125rem', fontWeight: '600', color: '#2563eb', textDecoration: 'underline' }}>
                                                            {item.opp.account}
                                                        </button>
                                                    )}
                                                    <span style={{ fontSize: '0.6875rem', color: '#94a3b8' }}>{feedTimeAgo(item.timestamp)}</span>
                                                    {isNew && <span style={{ background: '#2563eb', color: '#fff', borderRadius: '999px', fontSize: '0.5625rem', fontWeight: '800', padding: '0.0625rem 0.375rem' }}>NEW</span>}
                                                    {isMentioned && <span style={{ background: '#fef3c7', color: '#92400e', borderRadius: '999px', fontSize: '0.5625rem', fontWeight: '800', padding: '0.0625rem 0.375rem' }}>@ YOU</span>}
                                                </div>
                                                {item.detail && (
                                                    <div style={{ fontSize: '0.8125rem', color: '#475569', lineHeight: '1.45', marginTop: '0.2rem' }}>
                                                        {item.detail}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                    )}
                </div>
                </div>
            )}

            {activeTab === 'accounts' && (
                <div className="tab-page">
                    <div className="tab-page-header">
                        <div className="tab-page-header-bar"></div>
                        <div>
                            <h2>Accounts</h2>
                            <p>Manage your customer and prospect accounts</p>
                        </div>
                    </div>
                <div className="table-container">
                    <div className="table-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <h2>ACCOUNTS</h2>
                        </div>
                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                            {canEdit && <button className="btn" onClick={handleAddAccount}>+ Add Account</button>}
                            {selectedAccounts.length > 0 && (
    <button className="btn" style={{ background: '#ef4444', color: 'white', border: 'none', borderRadius: '6px', padding: '0.5rem 1rem', cursor: 'pointer', fontWeight: '600', fontSize: '0.8125rem', fontFamily: 'inherit' }} onClick={() => {
        showConfirm('Delete ' + selectedAccounts.length + ' selected account(s)? This cannot be undone.', () => {
            const accountIdsToDelete = [...selectedAccounts];
            const snapshot = [...accounts];
            setAccounts(prev => prev.filter(a => !accountIdsToDelete.includes(a.id)));
            setSelectedAccounts([]);
            accountIdsToDelete.forEach(id => {
                dbFetch(`/.netlify/functions/accounts?id=${id}`, { method: 'DELETE' })
                    .catch(err => console.error('Failed to delete account:', err));
            });
            softDelete(
                `${accountIdsToDelete.length} account${accountIdsToDelete.length === 1 ? '' : 's'}`,
                () => {},
                () => { setAccounts(snapshot); setUndoToast(null); }
            );
        });
    }}>Delete ({selectedAccounts.length})</button>
)}
                            <button className="btn" style={{ background: '#0ea5e9', color: '#fff', padding:'0.3rem 0.625rem', fontSize:'0.6875rem' }} onClick={() => exportToCSV(
                                'accounts-' + new Date().toISOString().slice(0,10) + '.csv',
                                ['Name','Industry','Phone','Website','Account Owner','Parent Account','Billing Address','Annual Revenue','Employees','Notes'],
                                visibleAccounts.map(a => [a.name||'',a.industry||'',a.phone||'',a.website||'',a.accountOwner||'',
                                    a.parentAccountId ? (accounts.find(p => p.id === a.parentAccountId) || {}).name || '' : '',
                                    a.billingAddress||'', a.annualRevenue||'', a.employees||'', a.notes||''])
                            )}>📤 Export</button>
                            {canEdit && (
                                <button className="btn" style={{ background:'#10b981', padding:'0.3rem 0.625rem', fontSize:'0.6875rem', fontWeight:'700' }} onClick={() => { setCsvImportType('accounts'); setShowCsvImportModal(true); }}>📥 Import</button>
                            )}
                        </div>
                    </div>
                    <div style={{ padding: '1.5rem' }}>
                        {visibleAccounts.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '4rem 2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                                <svg width="72" height="72" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <rect x="8" y="28" width="56" height="36" rx="6" fill="#faf5ff" stroke="#e9d5ff" strokeWidth="2"/>
                                    <rect x="24" y="16" width="24" height="18" rx="4" fill="#ede9fe" stroke="#c4b5fd" strokeWidth="2"/>
                                    <circle cx="36" cy="25" r="5" fill="#a78bfa"/>
                                    <path d="M20 44h32M20 52h22" stroke="#c4b5fd" strokeWidth="2" strokeLinecap="round"/>
                                </svg>
                                <div>
                                    <div style={{ width:'72px', height:'72px', borderRadius:'20px', background:'linear-gradient(135deg,#eff6ff,#dbeafe)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'2rem', margin:'0 auto 0.75rem' }}>🏢</div>
                                    <div style={{ fontWeight: '700', fontSize: '1.0625rem', color: '#1e293b', marginBottom: '0.375rem' }}>No accounts yet</div>
                                    <div style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '1.25rem', maxWidth:'280px' }}>Add your first customer or prospect to start tracking relationships.</div>
                                    {canEdit && <button className="btn" onClick={handleAddAccount}>+ Add Account</button>}
                                </div>
                            </div>
                        ) : (
                            <>
                            {/* View toggle */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                                <div style={{ display: 'flex', background: '#f1f3f5', borderRadius: '6px', padding: '2px' }}>
                                    {['compact', 'detailed'].map(mode => (
                                        <button key={mode} onClick={() => setAccountsViewMode(mode)}
                                            style={{ padding: '0.375rem 1rem', borderRadius: '4px', border: 'none', cursor: 'pointer', fontWeight: '700', fontSize: '0.75rem', fontFamily: 'inherit', transition: 'all 0.2s', textTransform: 'capitalize',
                                                background: accountsViewMode === mode ? '#ffffff' : 'transparent', color: accountsViewMode === mode ? '#1e293b' : '#64748b',
                                                boxShadow: accountsViewMode === mode ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
                                        >{mode}</button>
                                    ))}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingRight: '0.25rem' }}>
                                    <input type="checkbox"
                                        checked={visibleAccounts.length > 0 && selectedAccounts.length === visibleAccounts.length}
                                        onChange={e => setSelectedAccounts(e.target.checked ? visibleAccounts.map(a => a.id) : [])}
                                        style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#2563eb' }}
                                    />
                                    <span style={{ fontSize: '0.8125rem', color: '#64748b', fontWeight: '600' }}>Select all ({visibleAccounts.length})</span>
                                </div>
                            </div>
                            {/* Column header */}
                            <div style={{ display: 'flex', alignItems: 'center', padding: '0.3rem 0.75rem', background: '#f1f5f9', borderRadius: '4px', marginBottom: '0.25rem', border: '1px solid #e2e8f0' }}>
                                <div style={{ width: '36px', flexShrink: 0 }} />
                                <span style={{ fontWeight: '700', fontSize: '0.6875rem', textTransform: 'uppercase', color: '#475569', letterSpacing: '0.5px', width: '280px', flexShrink: 0 }}>Account</span>
                                <span style={{ fontWeight: '700', fontSize: '0.6875rem', textTransform: 'uppercase', color: '#475569', letterSpacing: '0.5px', flex: 1, textAlign: 'center' }}>Account Owner</span>
                                <div style={{ width: '140px', flexShrink: 0 }} />
                            </div>
                            {/* Letter jump bar */}
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px', padding: '0.375rem 0.5rem', background: '#f8fafc', borderRadius: '6px', marginBottom: '0.375rem', border: '1px solid #e9ecef' }}>
                                {'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(letter => {
                                    const hasMatch = visibleAccounts.some(a => ((a.name || '')[0] || '').toUpperCase() === letter);
                                    return (
                                        <div key={letter}
                                            onClick={() => {
                                                if (!hasMatch) return;
                                                const el = document.getElementById('account-letter-' + letter);
                                                if (el) el.scrollIntoView({ block: 'start' });
                                            }}
                                            style={{
                                                fontSize: '0.6875rem', fontWeight: '700', width: '22px', height: '20px',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                color: hasMatch ? '#2563eb' : '#cbd5e1',
                                                cursor: hasMatch ? 'pointer' : 'default',
                                                borderRadius: '3px', transition: 'all 0.1s', userSelect: 'none'
                                            }}
                                            onMouseEnter={e => { if (hasMatch) { e.target.style.background = '#dbeafe'; e.target.style.color = '#1e40af'; } }}
                                            onMouseLeave={e => { e.target.style.background = 'transparent'; e.target.style.color = hasMatch ? '#2563eb' : '#cbd5e1'; }}
                                        >{letter}</div>
                                    );
                                })}
                            </div>
                            <div style={{ position: 'relative' }}>
                            {accountsViewMode === 'compact' && (() => {
                                const sorted = [...visibleAccounts].sort((a, b) => {
                                    const cmp = (a.name || '').localeCompare(b.name || '');
                                    return accountsSortDir === 'asc' ? cmp : -cmp;
                                });
                                let lastLetter = '';
                                return sorted.map((account, idx) => {
                                    const firstChar = ((account.name || '')[0] || '').toUpperCase();
                                    let anchorId = null;
                                    if (firstChar !== lastLetter) { lastLetter = firstChar; anchorId = 'account-letter-' + firstChar; }
                                    return (
                                <div key={account.id} id={anchorId} style={{
                                    border: selectedAccounts.includes(account.id) ? '1px solid #93c5fd' : '1px solid #edf0f3',
                                    borderBottom: 'none', borderRadius: '0',
                                    background: selectedAccounts.includes(account.id) ? '#eff6ff' : (idx % 2 === 0 ? '#ffffff' : '#f8fafc'),
                                    transition: 'all 0.15s ease', overflow: 'hidden'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', padding: '0.25rem 0.75rem' }}>
                                        <div style={{ width: '36px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                            <input type="checkbox" checked={selectedAccounts.includes(account.id)}
                                                onChange={e => { if (e.target.checked) setSelectedAccounts([...selectedAccounts, account.id]); else setSelectedAccounts(selectedAccounts.filter(id => id !== account.id)); }}
                                                style={{ width: '13px', height: '13px', cursor: 'pointer', accentColor: '#2563eb', flexShrink: 0 }} />
                                            {getSubAccounts(account.id).length > 0 ? (
                                                <button onClick={(e) => { e.stopPropagation(); toggleAccountExpanded(account.id); }}
                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', color: '#2563eb', padding: '0', flexShrink: 0, width: '12px' }}>
                                                    {expandedAccounts[account.id] ? '▼' : '▶'}
                                                </button>
                                            ) : <span style={{ width: '12px' }} />}
                                        </div>
                                        <div style={{ width: '280px', flexShrink: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.375rem' }}
                                            onClick={() => setViewingAccount(account)}>
                                            <span style={{ fontWeight: '700', fontSize: '0.75rem', color: '#2563eb' }}>{account.name}</span>
                                            {getSubAccounts(account.id).length > 0 && (
                                                <span style={{ background: '#e0e7ff', color: '#4338ca', fontSize: '0.5rem', fontWeight: '700', padding: '0.05rem 0.3rem', borderRadius: '3px' }}>{getSubAccounts(account.id).length} sub</span>
                                            )}
                                            {getSubAccounts(account.id).length > 0 && (() => {
                                                const rollup = getAccountRollup(account);
                                                if (rollup.pipeline === 0) return null;
                                                return <span style={{ fontSize: '0.5625rem', color: '#b45309', fontWeight: '700', background: '#fef3c7', padding: '0.05rem 0.3rem', borderRadius: '3px' }}>${rollup.pipeline >= 1000 ? Math.round(rollup.pipeline/1000)+'K' : rollup.pipeline.toLocaleString()}</span>;
                                            })()}
                                        </div>
                                        <span style={{ color: '#64748b', fontSize: '0.75rem', fontWeight: '500', flex: 1, textAlign: 'center' }}>{account.accountOwner || '—'}</span>
                                        <div className="action-buttons" style={{ flexShrink: 0, textAlign: 'right', display: 'flex', gap: '0.25rem' }}>
                                            <button className="action-btn" style={{ padding: '0.15rem 0.5rem', fontSize: '0.6875rem' }} onClick={() => handleEditAccount(account)}>Edit</button>
                                            <button className="action-btn" style={{ padding: '0.15rem 0.5rem', fontSize: '0.6875rem' }} onClick={() => handleAddSubAccount(account)}>+ Sub</button>
                                            <button className="action-btn delete" style={{ padding: '0.15rem 0.5rem', fontSize: '0.6875rem' }} onClick={() => handleDeleteAccount(account.id)}>Delete</button>
                                        </div>
                                    </div>
                                    {expandedAccounts[account.id] && getSubAccounts(account.id).length > 0 && (
                                        <div style={{ borderTop: '1px solid #e2e8f0', padding: '0.25rem 0.75rem 0.375rem 3rem', background: '#f1f3f5' }}>
                                            {getSubAccounts(account.id).map(sub => (
                                                <div key={sub.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.2rem 0', fontSize: '0.75rem' }}>
                                                    <span style={{ cursor: 'pointer', color: '#1e293b', fontWeight: '500' }} onClick={() => setViewingAccount(sub)}>↳ {sub.name}</span>
                                                    <div className="action-buttons" style={{ flexShrink: 0 }}>
                                                        <button className="action-btn" onClick={() => handleEditAccount(sub, true)}>Edit</button>
                                                        <button className="action-btn delete" onClick={() => handleDeleteSubAccount(account.id, sub.id)}>Delete</button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                            });
                            })()}
                            {accountsViewMode === 'detailed' && (() => {
                                const sorted = [...visibleAccounts].sort((a, b) => {
                                    const cmp = (a.name || '').localeCompare(b.name || '');
                                    return accountsSortDir === 'asc' ? cmp : -cmp;
                                });
                                let lastLetter2 = '';
                                return sorted.map((account, idx) => {
                                const accountName = account.name.toLowerCase();
                                const accountOpps = opportunities.filter(o => o.account && o.account.toLowerCase() === accountName);
                                const pipelineValue = accountOpps.reduce((sum, o) => sum + (o.arr || 0), 0);
                                const activeOppCount = accountOpps.filter(o => o.stage !== 'Closed Won' && o.stage !== 'Closed Lost').length;
                                const wonCount = accountOpps.filter(o => o.stage === 'Closed Won').length;
                                const contactCount = contacts.filter(c => c.company && c.company.toLowerCase() === accountName).length;
                                const subCount = getSubAccounts(account.id).length;
                                const firstChar2 = ((account.name || '')[0] || '').toUpperCase();
                                let anchorId2 = null;
                                if (firstChar2 !== lastLetter2) { lastLetter2 = firstChar2; anchorId2 = 'account-letter-' + firstChar2; }

                                return (
                                <div key={account.id} id={anchorId2 || undefined} style={{ 
                                    marginBottom: '0',
                                    border: selectedAccounts.includes(account.id) ? '1px solid #93c5fd' : '1px solid #e2e8f0',
                                    borderRadius: '0',
                                    borderBottom: 'none',
                                    background: selectedAccounts.includes(account.id) ? '#eff6ff' : (idx % 2 === 0 ? '#ffffff' : '#f8fafc'),
                                    transition: 'all 0.15s ease',
                                    overflow: 'hidden'
                                }}
                                >
                                    <div style={{ padding: '1rem 1.25rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                                            <input type="checkbox"
                                                checked={selectedAccounts.includes(account.id)}
                                                onChange={e => {
                                                    if (e.target.checked) setSelectedAccounts([...selectedAccounts, account.id]);
                                                    else setSelectedAccounts(selectedAccounts.filter(id => id !== account.id));
                                                }}
                                                style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#2563eb', flexShrink: 0, marginTop: '3px' }}
                                            />

                                            {getSubAccounts(account.id).length > 0 && (
                                                <button
                                                    onClick={() => toggleAccountExpanded(account.id)}
                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', color: '#2563eb', padding: '0', marginTop: '1px', flexShrink: 0 }}
                                                    title={expandedAccounts[account.id] ? 'Collapse' : 'Expand'}
                                                >{expandedAccounts[account.id] ? '▼' : '▶'}</button>
                                            )}

                                            <div style={{ flex: 1 }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.625rem' }}>
                                                    <div>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                                                            <h3 style={{ fontSize: '1.0625rem', fontWeight: '700', color: '#2563eb', margin: 0, cursor: 'pointer' }} onClick={() => setViewingAccount(account)}>{account.name}</h3>
                                                            {subCount > 0 && (
                                                                <span style={{ background: '#e0e7ff', color: '#4338ca', fontSize: '0.625rem', fontWeight: '700', padding: '0.125rem 0.4rem', borderRadius: '4px' }}>{subCount} sub</span>
                                                            )}
                                                        </div>
                                                        {account.accountOwner && (
                                                            <div style={{ color: '#2563eb', fontSize: '0.8125rem', fontWeight: '600', marginTop: '0.125rem' }}>{account.accountOwner}</div>
                                                        )}
                                                    </div>
                                                    <div className="action-buttons" style={{ flexShrink: 0 }}>
                                                        <button className="action-btn" onClick={() => handleEditAccount(account)}>Edit</button>
                                                        <button className="action-btn" onClick={() => handleAddSubAccount(account)}>+ Sub</button>
                                                        <button className="action-btn delete" onClick={() => handleDeleteAccount(account.id)}>Delete</button>
                                                    </div>
                                                </div>

                                                <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                                                    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.25rem 0.75rem', fontSize: '0.8125rem', flex: 1, minWidth: '200px' }}>
                                                        {(account.address || account.city || account.state || account.zip) && (
                                                            <>
                                                                <span style={{ color: '#94a3b8', fontWeight: '600' }}>Address</span>
                                                                <span style={{ color: '#475569' }}>{[account.address, [account.city, account.state].filter(Boolean).join(', '), account.zip].filter(Boolean).join(', ')}</span>
                                                            </>
                                                        )}
                                                        {account.phone && (
                                                            <>
                                                                <span style={{ color: '#94a3b8', fontWeight: '600' }}>Phone</span>
                                                                <span style={{ color: '#475569' }}>{account.phone}</span>
                                                            </>
                                                        )}
                                                        {account.website && (
                                                            <>
                                                                <span style={{ color: '#94a3b8', fontWeight: '600' }}>Website</span>
                                                                <a href={account.website} target="_blank" style={{ color: '#2563eb', textDecoration: 'none', fontSize: '0.8125rem' }} onClick={e => e.stopPropagation()}>
                                                                    {account.website.replace(/^https?:/, '').replace(/^\/\//, '').replace(/^www\./, '')}
                                                                </a>
                                                            </>
                                                        )}
                                                        {account.verticalMarket && (
                                                            <>
                                                                <span style={{ color: '#94a3b8', fontWeight: '600' }}>Market</span>
                                                                <span style={{ color: '#475569' }}>{account.verticalMarket}</span>
                                                            </>
                                                        )}
                                                    </div>

                                                    <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                                                        {(() => {
                                                            const rollup = subCount > 0 ? getAccountRollup(account) : null;
                                                            const displayActive = rollup ? rollup.openOpps.length : activeOppCount;
                                                            const displayWon = rollup ? rollup.wonOpps.length : wonCount;
                                                            const displayPipeline = rollup ? rollup.pipeline : pipelineValue;
                                                            const displayContacts = rollup ? rollup.allContacts.length : contactCount;
                                                            return (<>
                                                                {displayActive > 0 && (
                                                                    <div style={{ padding: '0.375rem 0.625rem', background: '#dbeafe', borderRadius: '6px', textAlign: 'center', minWidth: '60px' }}>
                                                                        <div style={{ fontSize: '1rem', fontWeight: '800', color: '#1e40af' }}>{displayActive}</div>
                                                                        <div style={{ fontSize: '0.5625rem', fontWeight: '600', color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Active Opps</div>
                                                                        {rollup && subCount > 0 && activeOppCount !== displayActive && <div style={{ fontSize: '0.5rem', color: '#93c5fd', marginTop: '1px' }}>incl. {subCount} sub{subCount > 1 ? 's' : ''}</div>}
                                                                    </div>
                                                                )}
                                                                {displayWon > 0 && (
                                                                    <div style={{ padding: '0.375rem 0.625rem', background: '#dcfce7', borderRadius: '6px', textAlign: 'center', minWidth: '60px' }}>
                                                                        <div style={{ fontSize: '1rem', fontWeight: '800', color: '#166534' }}>{displayWon}</div>
                                                                        <div style={{ fontSize: '0.5625rem', fontWeight: '600', color: '#16a34a', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Won</div>
                                                                    </div>
                                                                )}
                                                                {displayPipeline > 0 && (
                                                                    <div style={{ padding: '0.375rem 0.625rem', background: '#fef3c7', borderRadius: '6px', textAlign: 'center', minWidth: '70px' }}>
                                                                        <div style={{ fontSize: '1rem', fontWeight: '800', color: '#92400e' }}>${displayPipeline >= 1000 ? Math.round(displayPipeline / 1000) + 'K' : displayPipeline.toLocaleString()}</div>
                                                                        <div style={{ fontSize: '0.5625rem', fontWeight: '600', color: '#b45309', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Pipeline</div>
                                                                        {rollup && subCount > 0 && pipelineValue !== displayPipeline && <div style={{ fontSize: '0.5rem', color: '#fcd34d', marginTop: '1px' }}>incl. {subCount} sub{subCount > 1 ? 's' : ''}</div>}
                                                                    </div>
                                                                )}
                                                                {displayContacts > 0 && (
                                                                    <div style={{ padding: '0.375rem 0.625rem', background: '#f3e8ff', borderRadius: '6px', textAlign: 'center', minWidth: '55px' }}>
                                                                        <div style={{ fontSize: '1rem', fontWeight: '800', color: '#6b21a8' }}>{displayContacts}</div>
                                                                        <div style={{ fontSize: '0.5625rem', fontWeight: '600', color: '#9333ea', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Contacts</div>
                                                                    </div>
                                                                )}
                                                            </>);
                                                        })()}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    {expandedAccounts[account.id] && getSubAccounts(account.id).length > 0 && (
                                        <div style={{ 
                                            borderTop: '1px solid #e2e8f0',
                                            padding: '1rem 1.5rem 1.5rem 3.5rem',
                                            background: '#f1f3f5'
                                        }}>
                                            <h4 style={{ fontSize: '0.875rem', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', marginBottom: '1rem' }}>
                                                Sub-Accounts
                                            </h4>
                                            {getSubAccounts(account.id).map(subAccount => {
                                                const subName = subAccount.name.toLowerCase();
                                                const subOpps = opportunities.filter(o => o.account && o.account.toLowerCase() === subName);
                                                const subOpen = subOpps.filter(o => o.stage !== 'Closed Won' && o.stage !== 'Closed Lost');
                                                const subWon = subOpps.filter(o => o.stage === 'Closed Won');
                                                const subPipeline = subOpen.reduce((s, o) => s + (o.arr || 0), 0);
                                                return (
                                                <div key={subAccount.id} style={{ 
                                                    marginBottom: '0.625rem', padding: '0.75rem 1rem',
                                                    background: '#ffffff', borderRadius: '6px', border: '1px solid #e2e8f0'
                                                }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <div style={{ flex: 1 }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flexWrap: 'wrap' }}>
                                                                <span style={{ fontWeight: '600', color: '#2563eb', cursor: 'pointer', fontSize: '0.875rem' }}
                                                                    onClick={() => setViewingAccount(subAccount)}
                                                                    onMouseEnter={e => e.target.style.textDecoration = 'underline'}
                                                                    onMouseLeave={e => e.target.style.textDecoration = 'none'}
                                                                >↳ {subAccount.name}</span>
                                                                {subAccount.accountOwner && <span style={{ color: '#64748b', fontSize: '0.75rem' }}>{subAccount.accountOwner}</span>}
                                                                {subOpen.length > 0 && <span style={{ background: '#dbeafe', color: '#1e40af', padding: '0.05rem 0.4rem', borderRadius: '4px', fontSize: '0.625rem', fontWeight: '700' }}>{subOpen.length} active</span>}
                                                                {subWon.length > 0 && <span style={{ background: '#dcfce7', color: '#166534', padding: '0.05rem 0.4rem', borderRadius: '4px', fontSize: '0.625rem', fontWeight: '700' }}>{subWon.length} won</span>}
                                                                {subPipeline > 0 && <span style={{ background: '#fef3c7', color: '#92400e', padding: '0.05rem 0.4rem', borderRadius: '4px', fontSize: '0.625rem', fontWeight: '700' }}>${subPipeline >= 1000 ? Math.round(subPipeline/1000)+'K' : subPipeline.toLocaleString()}</span>}
                                                            </div>
                                                            {(subAccount.city || subAccount.state) && (
                                                                <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.2rem' }}>📍 {[subAccount.city, subAccount.state].filter(Boolean).join(', ')}</div>
                                                            )}
                                                        </div>
                                                        <div className="action-buttons" style={{ flexShrink: 0 }}>
                                                            <button className="action-btn" onClick={() => handleEditAccount(subAccount, true)}>Edit</button>
                                                            <button className="action-btn delete" onClick={() => handleDeleteSubAccount(account.id, subAccount.id)}>Delete</button>
                                                        </div>
                                                    </div>
                                                </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                    {selectedAccounts.includes(account.id) && (() => {
                                        const accountName = account.name.toLowerCase();
                                        const accountOpps = opportunities.filter(o => o.account && o.account.toLowerCase() === accountName);
                                        const oppIds = accountOpps.map(o => o.id);
                                        const accountActivities = activities.filter(a => {
                                            if (a.opportunityId && oppIds.includes(a.opportunityId)) return true;
                                            if (a.company && a.company.toLowerCase() === accountName) return true;
                                            return false;
                                        });
                                        const accountTasks = tasks.filter(t => t.title && t.title.toLowerCase().includes(accountName));
                                        const allItems = [
                                            ...accountActivities.map(a => {
                                                const opp = a.opportunityId ? opportunities.find(o => o.id === a.opportunityId) : null;
                                                return { ...a, itemType: 'activity', sortDate: a.date, oppName: opp ? (opp.opportunityName || opp.site || '') : '' };
                                            }),
                                            ...accountTasks.map(t => ({ ...t, itemType: 'task', sortDate: t.dueDate || t.createdDate || '2000-01-01' }))
                                        ].sort((a, b) => new Date(b.sortDate) - new Date(a.sortDate));

                                        return (
                                            <div style={{ borderTop: '1px solid #e2e8f0', padding: '0.75rem 1.25rem 0.75rem 3.25rem', background: '#f8f9fa' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                                    <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                        Activity & Task History ({allItems.length})
                                                    </div>
                                                    {accountOpps.length > 0 && (
                                                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                                            {accountOpps.length} opportunit{accountOpps.length === 1 ? 'y' : 'ies'} linked
                                                        </div>
                                                    )}
                                                </div>
                                                {allItems.length === 0 ? (
                                                    <div style={{ fontSize: '0.8125rem', color: '#94a3b8', fontStyle: 'italic' }}>No activities or tasks found for this account.</div>
                                                ) : (
                                                    <div style={{ maxHeight: '250px', overflowY: 'auto' }}>
                                                        {allItems.map((item, idx) => (
                                                            <div key={idx} style={{ display: 'flex', gap: '0.75rem', padding: '0.5rem 0', borderBottom: idx < allItems.length - 1 ? '1px solid #e2e8f0' : 'none', fontSize: '0.8125rem', alignItems: 'center' }}>
                                                                <div style={{ width: '70px', flexShrink: 0, color: '#94a3b8', fontSize: '0.75rem' }}>
                                                                    {item.sortDate ? new Date(item.sortDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) : '-'}
                                                                </div>
                                                                <div style={{
                                                                    padding: '0.125rem 0.5rem', borderRadius: '4px', fontSize: '0.6875rem', fontWeight: '700', flexShrink: 0, textTransform: 'uppercase',
                                                                    background: item.itemType === 'task' ? '#fef3c7' : '#dbeafe',
                                                                    color: item.itemType === 'task' ? '#92400e' : '#1e40af'
                                                                }}>
                                                                    {item.itemType === 'task' ? 'Task' : item.type || 'Activity'}
                                                                </div>
                                                                {item.oppName && (
                                                                    <div style={{ fontSize: '0.75rem', color: '#6366f1', fontWeight: '600', flexShrink: 0 }}>
                                                                        {item.oppName}
                                                                    </div>
                                                                )}
                                                                <div style={{ flex: 1, color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                    {item.itemType === 'task' ? item.title : (item.notes || item.subject || 'No details')}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })()}
                                </div>
                            );
                            });
                            })()}
                            </div>
                            </>
                        )}
                    </div>
                </div>
                </div>
            )}

 
            {activeTab === 'contacts' && (
                <div className="tab-page">
                    <div className="tab-page-header">
                        <div className="tab-page-header-bar"></div>
                        <div>
                            <h2>Contacts</h2>
                            <p>Manage your contacts and relationships</p>
                        </div>
                    </div>
                <div className="table-container">
                    <div className="table-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <h2>CONTACTS</h2>
                        </div>
                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                            {canEdit && <button className="btn" onClick={handleAddContact}>+ ADD CONTACT</button>}
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.875rem', color: '#64748b', fontWeight: '600' }}>
                                    Sort by:
                                </span>
                                <select
                                    value={contactsSortBy}
                                    onChange={(e) => setContactsSortBy(e.target.value)}
                                    style={{
                                        background: '#ffffff',
                                        border: '1px solid #e2e8f0',
                                        borderRadius: '6px',
                                        padding: '0.5rem 0.75rem',
                                        color: '#1e293b',
                                        fontSize: '0.875rem',
                                        fontWeight: '600',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <option value="lastName">Last Name</option>
                                    <option value="firstName">First Name</option>
                                    <option value="company">Company</option>
                                </select>
                            </div>
                            <button className="btn btn-secondary" style={{ padding:'0.3rem 0.625rem', fontSize:'0.6875rem' }} onClick={() => {
                                const sorted = [...visibleContacts].sort((a, b) => {
                                    if (contactsSortBy === 'lastName') return (a.lastName||'').localeCompare(b.lastName||'');
                                    if (contactsSortBy === 'firstName') return (a.firstName||'').localeCompare(b.firstName||'');
                                    const cmp = (a.company||'').localeCompare(b.company||'');
                                    return cmp !== 0 ? cmp : (a.lastName||'').localeCompare(b.lastName||'');
                                });
                                exportToCSV(
                                    `contacts-${new Date().toISOString().slice(0,10)}.csv`,
                                    ['First Name','Last Name','Title','Company','Email','Phone','Mobile','LinkedIn','Territory','Notes'],
                                    sorted.map(c => [
                                        c.firstName||'', c.lastName||'', c.title||'', c.company||'',
                                        c.email||'', c.phone||'', c.mobile||'',
                                        c.linkedin||'', c.territory||'', c.notes||''
                                    ])
                                );
                            }}>📤 Export</button>
                            <button className="btn" style={{ background:'#10b981', padding:'0.3rem 0.625rem', fontSize:'0.6875rem', fontWeight:'700' }} onClick={() => { setCsvImportType('contacts'); setShowCsvImportModal(true); }}>📥 Import</button>
                        </div>
                    </div>
                    {/* Bulk action bar */}
                    {selectedContacts.length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1.5rem', background: '#eff6ff', borderBottom: '1px solid #bfdbfe' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <span style={{ fontSize: '0.875rem', fontWeight: '600', color: '#2563eb' }}>
                                    {selectedContacts.length} contact{selectedContacts.length > 1 ? 's' : ''} selected
                                </span>
                                <button onClick={() => setSelectedContacts([])}
                                    style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '0.8125rem', fontFamily: 'inherit' }}
                                >Clear selection</button>
                            </div>
                            <button onClick={() => {
                                showConfirm('Delete ' + selectedContacts.length + ' selected contact(s)? This cannot be undone.', () => {
    const contactIdsToDelete = [...selectedContacts];
    const snapshot = [...contacts];
    setContacts(contacts.filter(c => !contactIdsToDelete.includes(c.id)));
    setSelectedContacts([]);
    contactIdsToDelete.forEach(id => {
        dbFetch(`/.netlify/functions/contacts?id=${id}`, { method: 'DELETE' })
            .catch(err => console.error('Failed to delete contact:', err));
    });
    softDelete(
        `${contactIdsToDelete.length} contact${contactIdsToDelete.length === 1 ? '' : 's'}`,
        () => {},
        () => { setContacts(snapshot); setUndoToast(null); }
    );
});
                            }}
                                style={{ background: '#ef4444', color: 'white', border: 'none', borderRadius: '6px', padding: '0.5rem 1rem', cursor: 'pointer', fontWeight: '600', fontSize: '0.8125rem', fontFamily: 'inherit', transition: 'background 0.2s' }}
                                onMouseEnter={e => e.target.style.background = '#dc2626'}
                                onMouseLeave={e => e.target.style.background = '#ef4444'}
                            >Delete Selected</button>
                        </div>
                    )}
                    <div style={{ padding: '1.5rem' }}>
                        {visibleContacts.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '4rem 2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                                <svg width="72" height="72" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <circle cx="36" cy="24" r="12" fill="#fff7ed" stroke="#fed7aa" strokeWidth="2"/>
                                    <circle cx="36" cy="24" r="7" fill="#fb923c"/>
                                    <path d="M12 58c0-13.255 10.745-24 24-24s24 10.745 24 24" stroke="#fed7aa" strokeWidth="2" strokeLinecap="round" fill="#fff7ed"/>
                                    <circle cx="54" cy="18" r="8" fill="#22c55e"/>
                                    <path d="M50 18l3 3 5-5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                                <div>
                                    <div style={{ width:'72px', height:'72px', borderRadius:'20px', background:'linear-gradient(135deg,#fff7ed,#ffedd5)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'2rem', margin:'0 auto 0.75rem' }}>👤</div>
                                    <div style={{ fontWeight: '700', fontSize: '1.0625rem', color: '#1e293b', marginBottom: '0.375rem' }}>No contacts yet</div>
                                    <div style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '1.25rem', maxWidth:'280px' }}>Add contacts to track people across your accounts and deals.</div>
                                    {canEdit && <button className="btn" onClick={handleAddContact}>+ Add Contact</button>}
                                </div>
                            </div>
                        ) : (
                            <>
                            {/* Select all */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', paddingLeft: '0.25rem' }}>
                                <input type="checkbox"
                                    checked={visibleContacts.length > 0 && selectedContacts.length === visibleContacts.length}
                                    onChange={e => setSelectedContacts(e.target.checked ? visibleContacts.map(c => c.id) : [])}
                                    style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#2563eb' }}
                                />
                                <span style={{ fontSize: '0.8125rem', color: '#64748b', fontWeight: '600' }}>Select all ({visibleContacts.length})</span>
                            </div>
                            <div style={{ position: 'relative' }}>
                            {/* Letter jump bar */}
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px', padding: '0.375rem 0.5rem', background: '#f8fafc', borderRadius: '6px', marginBottom: '0.375rem', border: '1px solid #e9ecef' }}>
                                {(() => {
                                    const sortField = contactsSortBy === 'firstName' ? 'firstName' : contactsSortBy === 'company' ? 'company' : 'lastName';
                                    return 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(letter => {
                                        const hasMatch = visibleContacts.some(c => ((c[sortField] || '')[0] || '').toUpperCase() === letter);
                                        return (
                                            <div key={letter}
                                                onClick={() => {
                                                    if (!hasMatch) return;
                                                    const el = document.getElementById('contact-letter-' + letter);
                                                    if (el) el.scrollIntoView({ block: 'start' });
                                                }}
                                                style={{
                                                    fontSize: '0.6875rem', fontWeight: '700', width: '22px', height: '20px',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    color: hasMatch ? '#2563eb' : '#cbd5e1',
                                                    cursor: hasMatch ? 'pointer' : 'default',
                                                    borderRadius: '3px', transition: 'all 0.1s', userSelect: 'none'
                                                }}
                                                onMouseEnter={e => { if (hasMatch) { e.target.style.background = '#dbeafe'; e.target.style.color = '#1e40af'; } }}
                                                onMouseLeave={e => { e.target.style.background = 'transparent'; e.target.style.color = hasMatch ? '#2563eb' : '#cbd5e1'; }}
                                            >{letter}</div>
                                        );
                                    });
                                })()}
                            </div>
                            <div style={{ display: 'grid', gap: '1px' }}>
                                {(() => {
                                    const sortField = contactsSortBy === 'firstName' ? 'firstName' : contactsSortBy === 'company' ? 'company' : 'lastName';
                                    const sorted = [...visibleContacts].sort((a, b) => {
                                        if (contactsSortBy === 'lastName') return (a.lastName || '').localeCompare(b.lastName || '');
                                        else if (contactsSortBy === 'firstName') return (a.firstName || '').localeCompare(b.firstName || '');
                                        else {
                                            const cmp = (a.company || '').localeCompare(b.company || '');
                                            return cmp !== 0 ? cmp : (a.lastName || '').localeCompare(b.lastName || '');
                                        }
                                    });
                                    let lastLetter = '';
                                    let lastCompany = null;
                                    const results = [];
                                    sorted.forEach((contact, cIdx) => {
                                        const firstChar = ((contact[sortField] || '')[0] || '').toUpperCase();
                                        let anchorId = null;
                                        if (firstChar !== lastLetter) {
                                            lastLetter = firstChar;
                                            anchorId = 'contact-letter-' + firstChar;
                                        }
                                        // Company group header
                                        if (contactsSortBy === 'company') {
                                            const co = (contact.company || '').trim() || '(No Company)';
                                            if (co !== lastCompany) {
                                                lastCompany = co;
                                                results.push(
                                                    <div key={'company-hdr-' + co} id={anchorId} style={{
                                                        padding: '0.375rem 0.625rem', background: '#f1f5f9', borderBottom: '1px solid #e2e8f0',
                                                        fontSize: '0.6875rem', fontWeight: '800', color: '#334155', textTransform: 'uppercase', letterSpacing: '0.04em',
                                                        display: 'flex', alignItems: 'center', gap: '0.5rem'
                                                    }}>
                                                        <span style={{ color: '#475569' }}>{co}</span>
                                                        <span style={{ color: '#94a3b8', fontWeight: '600', fontSize: '0.625rem' }}>({sorted.filter(c => ((c.company || '').trim() || '(No Company)') === co).length})</span>
                                                    </div>
                                                );
                                                anchorId = null;
                                            }
                                        }
                                        results.push(
                                    <div key={contact.id} id={contactsSortBy !== 'company' ? anchorId : null} style={{
                                        border: selectedContacts.includes(contact.id) ? '1px solid #93c5fd' : '1px solid #edf0f3',
                                        borderRadius: '2px',
                                        background: selectedContacts.includes(contact.id) ? '#eff6ff' : (cIdx % 2 === 0 ? '#ffffff' : '#f8fafc'),
                                        transition: 'all 0.15s ease',
                                        overflow: 'hidden',
                                        marginLeft: contactsSortBy === 'company' ? '1rem' : 0
                                    }}
                                    onMouseEnter={e => { if (!selectedContacts.includes(contact.id)) e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)'; }}
                                    onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
                                    >
                                    <>
                                    <div style={{ display: 'flex', alignItems: 'center', padding: '0.25rem 0.625rem', gap: '0.375rem' }}>
                                        <input type="checkbox"
                                            checked={selectedContacts.includes(contact.id)}
                                            onChange={e => {
                                                if (e.target.checked) setSelectedContacts([...selectedContacts, contact.id]);
                                                else setSelectedContacts(selectedContacts.filter(id => id !== contact.id));
                                            }}
                                            style={{ width: '13px', height: '13px', cursor: 'pointer', accentColor: '#2563eb', flexShrink: 0 }}
                                        />
                                        <div style={{ 
                                            flex: 1,
                                            display: 'grid',
                                            gridTemplateColumns: '2fr 2fr 2fr 2fr 3fr',
                                            gap: '0.375rem',
                                            alignItems: 'center'
                                        }}>
                                            <div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                                                    <div 
                                                        style={{ fontSize: '0.75rem', fontWeight: '700', color: '#2563eb', cursor: 'pointer', lineHeight: '1.2' }}
                                                        onClick={() => setViewingContact(contact)}
                                                        onMouseEnter={e => e.target.style.textDecoration = 'underline'}
                                                        onMouseLeave={e => e.target.style.textDecoration = 'none'}
                                                    >
                                                        {contact.firstName} {contact.lastName}
                                                    </div>
                                                    {(() => {
                                                        const linkedOppCount = opportunities.filter(o =>
                                                            (o.contactIds && o.contactIds.includes(contact.id)) ||
                                                            (o.contacts && o.contacts.split(',').map(s => s.trim().toLowerCase()).some(n => n.startsWith((contact.firstName + ' ' + contact.lastName).toLowerCase())))
                                                        ).length;
                                                        if (!linkedOppCount) return null;
                                                        return (
                                                            <span title={`${linkedOppCount} linked opportunity${linkedOppCount > 1 ? 's' : ''}`}
                                                                style={{ fontSize: '0.5625rem', fontWeight: '700', background: '#dbeafe', color: '#1e40af', border: '1px solid #bfdbfe', padding: '0.05rem 0.35rem', borderRadius: '999px', lineHeight: '1.4', flexShrink: 0 }}>
                                                                {linkedOppCount} opp{linkedOppCount > 1 ? 's' : ''}
                                                            </span>
                                                        );
                                                    })()}
                                                </div>
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {contact.company || '-'}
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {contact.title || '-'}
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                                {contact.phone || '-'}
                                            </div>
                                            <div style={{ fontSize: '0.75rem' }}>
                                                {contact.email ? (
                                                    <a href={`mailto:${contact.email}`} style={{ color: '#2563eb', textDecoration: 'none' }}>
                                                        {contact.email}
                                                    </a>
                                                ) : '-'}
                                            </div>
                                        </div>
                                        <div className="action-buttons" style={{ marginLeft: '0.375rem' }}>
                                            <button className="action-btn" onClick={() => handleEditContact(contact)}>Edit</button>
                                            <button className="action-btn delete" onClick={() => handleDeleteContact(contact.id)}>Delete</button>
                                        </div>
                                    </div>
                                    {selectedContacts.includes(contact.id) && (() => {
                                        const contactActivities = activities.filter(a => a.contactId === contact.id);
                                        const contactOpps = opportunities.filter(o => o.account && contact.company && o.account.toLowerCase() === contact.company.toLowerCase());
                                        const oppIds = contactOpps.map(o => o.id);
                                        const oppActivities = activities.filter(a => a.opportunityId && oppIds.includes(a.opportunityId) && a.contactId !== contact.id);
                                        const contactTasks = tasks.filter(t => {
                                            const titleMatch = t.title && (t.title.toLowerCase().includes((contact.firstName || '').toLowerCase()) || t.title.toLowerCase().includes((contact.lastName || '').toLowerCase()));
                                            const companyMatch = t.title && contact.company && t.title.toLowerCase().includes(contact.company.toLowerCase());
                                            return titleMatch || companyMatch;
                                        });
                                        const allItems = [
                                            ...contactActivities.map(a => ({ ...a, itemType: 'activity', sortDate: a.date })),
                                            ...oppActivities.map(a => ({ ...a, itemType: 'activity-related', sortDate: a.date })),
                                            ...contactTasks.map(t => ({ ...t, itemType: 'task', sortDate: t.dueDate || t.createdDate || '2000-01-01' }))
                                        ].sort((a, b) => new Date(b.sortDate) - new Date(a.sortDate));

                                        return (
                                            <div style={{ borderTop: '1px solid #e2e8f0', padding: '0.75rem 1rem 0.75rem 3rem', background: '#f8f9fa' }}>
                                                <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                                                    Activity & Task History ({allItems.length})
                                                </div>
                                                {allItems.length === 0 ? (
                                                    <div style={{ fontSize: '0.8125rem', color: '#94a3b8', fontStyle: 'italic' }}>No activities or tasks found for this contact.</div>
                                                ) : (
                                                    <div style={{ maxHeight: '250px', overflowY: 'auto' }}>
                                                        {allItems.map((item, idx) => (
                                                            <div key={idx} style={{ display: 'flex', gap: '0.75rem', padding: '0.5rem 0', borderBottom: idx < allItems.length - 1 ? '1px solid #e2e8f0' : 'none', fontSize: '0.8125rem' }}>
                                                                <div style={{ width: '70px', flexShrink: 0, color: '#94a3b8', fontSize: '0.75rem' }}>
                                                                    {item.sortDate ? new Date(item.sortDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) : '-'}
                                                                </div>
                                                                <div style={{
                                                                    padding: '0.125rem 0.5rem', borderRadius: '4px', fontSize: '0.6875rem', fontWeight: '700', flexShrink: 0, textTransform: 'uppercase',
                                                                    background: item.itemType === 'task' ? '#fef3c7' : '#dbeafe',
                                                                    color: item.itemType === 'task' ? '#92400e' : '#1e40af'
                                                                }}>
                                                                    {item.itemType === 'task' ? 'Task' : item.type || 'Activity'}
                                                                </div>
                                                                <div style={{ flex: 1, color: '#475569' }}>
                                                                    {item.itemType === 'task' ? item.title : (item.notes || item.subject || 'No details')}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })()}
                                    </>
                                    </div>
                                        );
                                    });
                                    return results;
                                })()}
                            </div>
                            </div>
                            </>
                        )}
                    </div>
                </div>
                </div>
            )}




            {activeTab === 'leads' && (
                <LeadsTab
                    leads={leads}
                    setLeads={setLeads}
                    settings={settings}
                    currentUser={currentUser}
                    canSeeAll={canSeeAll}
                    setEditingOpp={setEditingOpp}
                    setShowModal={setShowModal}
                />
            )}


            {activeTab === 'reports' && (() => {
                const currentYear = new Date().getFullYear();
                const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];
                const quarterMonths = { Q1: [0,1,2], Q2: [3,4,5], Q3: [6,7,8], Q4: [9,10,11] };
                const stages = ['Prospecting','Qualified','Demo','Proposal','Negotiation','Closed Won','Closed Lost'];
                const stageColors = { 'Prospecting':'#6366f1','Qualified':'#8b5cf6','Demo':'#3b82f6','Proposal':'#f59e0b','Negotiation':'#f97316','Closed Won':'#10b981','Closed Lost':'#ef4444' };

                // Build slice options (only for managers/admins)
                const rAllReps = canSeeAll ? [...new Set([
                    ...(settings.users || []).filter(u => u.name).map(u => u.name),
                    ...visibleOpportunities.filter(o => o.salesRep).map(o => o.salesRep)
                ])].sort() : [];
                const rAllTeams = [...new Set((settings.users || []).filter(u => u.team).map(u => u.team))].sort();
                const rAllTerritories = [...new Set((settings.users || []).filter(u => u.territory).map(u => u.territory))].sort();
                const hasReportsSlicing = canSeeAll && (rAllReps.length > 1 || rAllTeams.length > 0 || rAllTerritories.length > 0);

                // Filter opportunities based on reports slice selectors
                const reportsOpps = (() => {
                    if (reportsRep) return visibleOpportunities.filter(o => o.salesRep === reportsRep || o.assignedTo === reportsRep);
                    if (reportsTeam) {
                        const teamUsers = new Set((settings.users || []).filter(u => u.team === reportsTeam).map(u => u.name));
                        return visibleOpportunities.filter(o => teamUsers.has(o.salesRep) || teamUsers.has(o.assignedTo));
                    }
                    if (reportsTerritory) {
                        const terrUsers = new Set((settings.users || []).filter(u => u.territory === reportsTerritory).map(u => u.name));
                        return visibleOpportunities.filter(o => terrUsers.has(o.salesRep) || terrUsers.has(o.assignedTo));
                    }
                    return visibleOpportunities;
                })();

                const wonOpps = reportsOpps.filter(o => o.stage === 'Closed Won');
                const lostOpps = reportsOpps.filter(o => o.stage === 'Closed Lost');
                const openOpps = reportsOpps.filter(o => o.stage !== 'Closed Won' && o.stage !== 'Closed Lost');

                const totalWonRevenue = wonOpps.reduce((s, o) => s + (o.arr||0) + (o.implementationCost||0), 0);
                const totalPipelineValue = openOpps.reduce((s, o) => s + (o.arr||0) + (o.implementationCost||0), 0);
                const avgDealSize = wonOpps.length > 0 ? totalWonRevenue / wonOpps.length : 0;
                const winRate = (wonOpps.length + lostOpps.length) > 0 ? (wonOpps.length / (wonOpps.length + lostOpps.length) * 100) : 0;

                // Revenue by quarter
                const revenueByQuarter = quarters.map(q => {
                    const months = quarterMonths[q];
                    const rev = wonOpps.filter(o => {
                        const dateStr = o.forecastedCloseDate || o.closeDate;
                        if (!dateStr) return false;
                        const d = new Date(dateStr);
                        return d.getFullYear() === currentYear && months.includes(d.getMonth());
                    }).reduce((s, o) => s + (o.arr||0) + (o.implementationCost||0), 0);
                    return { q, rev };
                });
                const maxQRev = Math.max(...revenueByQuarter.map(r => r.rev), 1);

                // Pipeline by stage
                const byStage = stages.map(st => ({
                    stage: st,
                    count: reportsOpps.filter(o => o.stage === st).length,
                    value: reportsOpps.filter(o => o.stage === st).reduce((s, o) => s + (o.arr||0) + (o.implementationCost||0), 0)
                })).filter(s => s.count > 0);
                const maxStageVal = Math.max(...byStage.map(s => s.value), 1);

                // Top accounts by revenue
                const accountRevMap = {};
                wonOpps.forEach(o => {
                    const key = o.account || 'Unknown';
                    accountRevMap[key] = (accountRevMap[key] || 0) + (o.arr||0) + (o.implementationCost||0);
                });
                const topAccounts = Object.entries(accountRevMap).sort((a,b) => b[1]-a[1]).slice(0, 8);

                // Monthly trend (last 6 months)
                const now = new Date();
                const monthlyData = Array.from({length: 6}, (_, i) => {
                    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
                    const monthOpps = wonOpps.filter(o => {
                        const dateStr = o.forecastedCloseDate || o.closeDate;
                        if (!dateStr) return false;
                        const od = new Date(dateStr);
                        return od.getFullYear() === d.getFullYear() && od.getMonth() === d.getMonth();
                    });
                    return {
                        label: d.toLocaleString('default', { month: 'short' }),
                        rev: monthOpps.reduce((s, o) => s + (o.arr||0) + (o.implementationCost||0), 0),
                        count: monthOpps.length
                    };
                });
                const maxMonthRev = Math.max(...monthlyData.map(m => m.rev), 1);

                const cardStyle = { background: '#fff', borderRadius: '12px', padding: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0' };
                const labelStyle = { fontSize: '0.6875rem', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' };
                const valueStyle = { fontSize: '1.625rem', fontWeight: '700', color: '#1e293b' };
                const printBtnStyle = { background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '0.25rem 0.625rem', fontSize: '0.6875rem', fontWeight: '600', color: '#475569', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', transition: 'background 0.15s', flexShrink: 0 };

                const printSection = (title, bodyHtml) => {
                    const d = new Date();
                    const meta = d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) + ' at ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                    const win = window.open('', '_blank', 'width=820,height=600');
                    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title>
<style>
  @page { margin: 0.75in; size: letter; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #1e293b; }
  .hdr { display: flex; justify-content: space-between; align-items: flex-end; padding-bottom: 12px; border-bottom: 3px solid #2563eb; margin-bottom: 20px; }
  .hdr h1 { font-size: 18px; font-weight: 800; }
  .hdr .accent { display: inline-block; width: 4px; height: 18px; background: linear-gradient(to bottom,#2563eb,#7c3aed); border-radius: 2px; margin-right: 8px; vertical-align: middle; }
  .meta { font-size: 9px; color: #94a3b8; text-align: right; line-height: 1.7; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  thead th { background: #f8fafc; color: #94a3b8; font-weight: 700; padding: 6px 8px; font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 2px solid #e2e8f0; text-align: left; white-space: nowrap; }
  tbody td { padding: 6px 8px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
  .footer { margin-top: 24px; padding-top: 8px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; font-size: 9px; color: #94a3b8; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head><body>
<div class="hdr"><div><span class="accent"></span><h1>${title}</h1></div><div class="meta">Generated ${meta}<br>Sales Pipeline Tracker &nbsp;·&nbsp; Confidential</div></div>
${bodyHtml}
<div class="footer"><span>Sales Pipeline Tracker &nbsp;·&nbsp; Confidential</span><span>Generated ${meta}</span></div>
</body></html>`);
                    win.document.close();
                    setTimeout(() => win.print(), 500);
                };

                const handlePrintReport = () => {
                    const printDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
                    const printTime = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

                    // Build bar chart using pure HTML/CSS (no canvas needed for print)
                    const buildBarChart = (data, labelKey, valueKey, colorFn) => {
                        const maxVal = Math.max(...data.map(d => d[valueKey]), 1);
                        return data.map(d => `
                            <div style="margin-bottom:10px;">
                                <div style="display:flex;justify-content:space-between;margin-bottom:3px;font-size:11px;">
                                    <span style="color:#475569;font-weight:600;">${d[labelKey]}</span>
                                    <span style="color:#1e293b;font-weight:700;">$${(d[valueKey]||0).toLocaleString()}</span>
                                </div>
                                <div style="height:10px;background:#f1f5f9;border-radius:5px;overflow:hidden;">
                                    <div style="height:100%;width:${Math.round((d[valueKey]||0)/maxVal*100)}%;background:linear-gradient(to right,#2563eb,#7c3aed);border-radius:5px;"></div>
                                </div>
                            </div>`).join('');
                    };

                    const stageRows = byStage.map((s, i) => `
                        <tr style="background:${i%2===0?'#fff':'#f8fafc'}">
                            <td>${s.stage}</td>
                            <td style="text-align:center;">${s.count}</td>
                            <td style="text-align:right;">$${s.value.toLocaleString()}</td>
                            <td style="text-align:right;">${maxStageVal > 0 ? Math.round(s.value/maxStageVal*100) : 0}%</td>
                        </tr>`).join('');

                    const accountRows = topAccounts.map(([name, rev], i) => `
                        <tr style="background:${i%2===0?'#fff':'#f8fafc'}">
                            <td style="text-align:center;font-weight:700;color:${i===0?'#f59e0b':i===1?'#94a3b8':i===2?'#d97706':'#475569'}">#${i+1}</td>
                            <td>${name}</td>
                            <td style="text-align:right;font-weight:700;color:#10b981;">$${rev.toLocaleString()}</td>
                        </tr>`).join('');

                    const oppRows = reportsOpps.map((o, i) => `
                        <tr style="background:${i%2===0?'#fff':'#f8fafc'}">
                            <td>${o.opportunityName || o.account || '—'}</td>
                            <td>${o.account || '—'}</td>
                            <td>${o.stage || '—'}</td>
                            <td style="text-align:right;">${o.arr ? '$'+o.arr.toLocaleString() : '—'}</td>
                            <td style="text-align:right;">${o.implementationCost ? '$'+o.implementationCost.toLocaleString() : '—'}</td>
                            <td style="text-align:right;font-weight:700;">$${((o.arr||0)+(o.implementationCost||0)).toLocaleString()}</td>
                            <td>${o.closeDate ? new Date(o.closeDate).toLocaleDateString() : '—'}</td>
                            <td>${o.assignedTo || o.accountOwner || '—'}</td>
                        </tr>`).join('');

                    const monthlyBars = monthlyData.map(m => {
                        const pct = Math.round((m.rev||0)/maxMonthRev*100);
                        return `
                            <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;">
                                <div style="font-size:9px;color:#475569;font-weight:700;">${m.rev > 0 ? '$'+Math.round(m.rev/1000)+'K' : ''}</div>
                                <div style="width:100%;background:#f1f5f9;border-radius:4px;height:80px;display:flex;align-items:flex-end;">
                                    <div style="width:100%;height:${Math.max(pct,m.rev>0?4:1)}%;background:linear-gradient(to top,#2563eb,#7c3aed);border-radius:4px 4px 0 0;"></div>
                                </div>
                                <div style="font-size:9px;color:#94a3b8;">${m.label}</div>
                            </div>`;
                    }).join('');

                    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Sales Pipeline Report — ${printDate}</title>
<style>
  @page { margin: 0.75in; size: letter; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #1e293b; background: #fff; }
  
  .report-header { display: flex; justify-content: space-between; align-items: flex-end; padding-bottom: 14px; border-bottom: 3px solid #2563eb; margin-bottom: 24px; }
  .report-header h1 { font-size: 22px; font-weight: 800; color: #1e293b; }
  .report-header .meta { font-size: 10px; color: #94a3b8; text-align: right; line-height: 1.6; }
  .report-header .accent { display: inline-block; width: 4px; height: 22px; background: linear-gradient(to bottom, #2563eb, #7c3aed); border-radius: 2px; margin-right: 8px; vertical-align: middle; }

  .section { margin-bottom: 28px; page-break-inside: avoid; }
  .section-title { font-size: 9px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 1px solid #e2e8f0; }

  .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 0; }
  .kpi-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 14px; }
  .kpi-label { font-size: 9px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 3px; }
  .kpi-value { font-size: 20px; font-weight: 800; color: #1e293b; line-height: 1.1; }
  .kpi-sub { font-size: 9px; color: #64748b; margin-top: 3px; }

  .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; }

  .monthly-chart { display: flex; align-items: flex-end; gap: 6px; height: 90px; margin-top: 8px; }

  table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
  thead th { background: #f8fafc; color: #94a3b8; font-weight: 700; text-align: left; padding: 6px 8px; font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 2px solid #e2e8f0; white-space: nowrap; }
  tbody td { padding: 6px 8px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
  tbody tr:last-child td { border-bottom: none; }

  .footer { margin-top: 32px; padding-top: 10px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; font-size: 9px; color: #94a3b8; }

  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .no-print { display: none !important; }
    .section { page-break-inside: avoid; }
    .opps-table { page-break-before: always; }
  }
</style>
</head>
<body>

  <div class="report-header">
    <div>
      <div style="display:flex;align-items:center;">
<span class="accent"></span>
<h1>Sales Pipeline Report</h1>
      </div>
      <div style="font-size:11px;color:#64748b;margin-top:4px;">Pipeline performance and revenue insights</div>
    </div>
    <div class="meta">
      Generated ${printDate} at ${printTime}<br>
      Sales Pipeline Tracker &nbsp;·&nbsp; Confidential
    </div>
  </div>

  <!-- KPIs -->
  <div class="section">
    <div class="section-title">Key Performance Indicators</div>
    <div class="kpi-grid">
      <div class="kpi-card">
<div class="kpi-label">Won Revenue</div>
<div class="kpi-value">$${totalWonRevenue.toLocaleString()}</div>
<div class="kpi-sub">${wonOpps.length} deals closed won</div>
      </div>
      <div class="kpi-card">
<div class="kpi-label">Pipeline Value</div>
<div class="kpi-value">$${totalPipelineValue.toLocaleString()}</div>
<div class="kpi-sub">${openOpps.length} open opportunities</div>
      </div>
      <div class="kpi-card">
<div class="kpi-label">Win Rate</div>
<div class="kpi-value">${winRate.toFixed(1)}%</div>
<div class="kpi-sub">${wonOpps.length} won / ${lostOpps.length} lost</div>
      </div>
      <div class="kpi-card">
<div class="kpi-label">Avg Deal Size</div>
<div class="kpi-value">$${Math.round(avgDealSize).toLocaleString()}</div>
<div class="kpi-sub">closed won</div>
      </div>
    </div>
  </div>

  <!-- Revenue by Quarter + Monthly Trend -->
  <div class="section two-col">
    <div class="card">
      <div class="section-title">Won Revenue by Quarter (${currentYear})</div>
      ${buildBarChart(revenueByQuarter, 'q', 'rev', () => '#2563eb')}
    </div>
    <div class="card">
      <div class="section-title">Monthly Won Revenue — Last 6 Months</div>
      <div class="monthly-chart">${monthlyBars}</div>
    </div>
  </div>

  <!-- Pipeline by Stage + Top Accounts -->
  <div class="section two-col">
    <div class="card">
      <div class="section-title">Opportunities by Stage</div>
      ${byStage.length === 0 ? '<p style="color:#94a3b8;font-size:11px;">No opportunity data.</p>' : `
      <table>
<thead><tr><th>Stage</th><th style="text-align:center;">Count</th><th style="text-align:right;">Value</th><th style="text-align:right;">Share</th></tr></thead>
<tbody>${stageRows}</tbody>
      </table>`}
    </div>
    <div class="card">
      <div class="section-title">Top Accounts by Won Revenue</div>
      ${topAccounts.length === 0 ? '<p style="color:#94a3b8;font-size:11px;">No closed won data yet.</p>' : `
      <table>
<thead><tr><th style="text-align:center;">#</th><th>Account</th><th style="text-align:right;">Won Revenue</th></tr></thead>
<tbody>${accountRows}</tbody>
      </table>`}
    </div>
  </div>

  <!-- All Opportunities -->
  <div class="section opps-table">
    <div class="section-title">All Opportunities Summary (${reportsOpps.length} total)</div>
    <table>
      <thead>
<tr>
  <th>Opportunity</th><th>Account</th><th>Stage</th>
  <th style="text-align:right;">ARR</th><th style="text-align:right;">Impl. Cost</th>
  <th style="text-align:right;">Total Value</th><th>Close Date</th><th>Owner</th>
</tr>
      </thead>
      <tbody>${oppRows || '<tr><td colspan="8" style="text-align:center;color:#94a3b8;padding:16px;">No opportunities found.</td></tr>'}</tbody>
    </table>
  </div>

  <div class="footer">
    <span>Sales Pipeline Tracker &nbsp;·&nbsp; Confidential</span>
    <span>Generated ${printDate} at ${printTime}</span>
  </div>

</body>
</html>`;

                    const win = window.open('', '_blank', 'width=900,height=700');
                    win.document.write(html);
                    win.document.close();
                    setTimeout(() => win.print(), 600);
                };

                const generateReport = (title, contentFn) => {
                    const d = new Date();
                    const meta = d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) + ' at ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                    const win2 = window.open('', '_blank', 'width=820,height=600');
                    win2.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title><style>body{font-family:system-ui,sans-serif;padding:2rem;color:#1e293b}h1{font-size:1.125rem;font-weight:800;margin-bottom:0.25rem}.meta{font-size:0.75rem;color:#94a3b8;margin-bottom:1.5rem}table{width:100%;border-collapse:collapse;font-size:0.875rem}th{background:#f8fafc;color:#94a3b8;font-weight:700;padding:6px 10px;font-size:0.75rem;text-transform:uppercase;border-bottom:2px solid #e2e8f0;text-align:left}td{padding:6px 10px;border-bottom:1px solid #f1f5f9}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body><h1>${title}</h1><div class="meta">Generated ${meta} · Sales Pipeline Tracker</div>${contentFn()}</body></html>`);
                    win2.document.close();
                    setTimeout(() => win2.print(), 500);
                };

                const ReportBtn = ({ title, contentFn }) => (
                    <button onClick={() => generateReport(title, contentFn)}
                        style={{ display:'flex', alignItems:'center', gap:'0.3rem', padding:'0.25rem 0.625rem', background:'#f1f5f9', border:'1px solid #e2e8f0', borderRadius:'6px', cursor:'pointer', fontSize:'0.6875rem', fontWeight:'600', color:'#475569', fontFamily:'inherit', whiteSpace:'nowrap', transition:'background 0.15s', flexShrink:0 }}
                        onMouseEnter={e => e.currentTarget.style.background='#e2e8f0'}
                        onMouseLeave={e => e.currentTarget.style.background='#f1f5f9'}>🖨️ Print</button>
                );

                return (
                    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

                        {/* ── Top bar: title + viewing slice ── */}
                        <div className="table-container">
                          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0.75rem 1.25rem', borderBottom:'1px solid #e2e8f0', flexWrap:'wrap', gap:'0.5rem' }}>
                            <div style={{ display:'flex', alignItems:'center', gap:'0.75rem' }}>
                              <div style={{ width:'4px', height:'24px', background:'linear-gradient(to bottom,#2563eb,#7c3aed)', borderRadius:'2px' }}/>
                              <div>
                                <h2 style={{ fontSize:'1.125rem', fontWeight:'700', color:'#1e293b', margin:0 }}>Reports</h2>
                                <p style={{ fontSize:'0.75rem', color:'#64748b', margin:0 }}>
                                  {reportSubTab === 'pipeline' ? 'Pipeline health and stage analysis' :
                                   reportSubTab === 'performance' ? 'Quota, velocity and win/loss insights' :
                                   reportSubTab === 'revenue' ? 'Closed revenue and commission tracking' :
                                   reportSubTab === 'leads' ? 'Lead funnel · sources · rep performance · trend' :
                                   'Team activity and task completion'}
                                  {(reportsRep || reportsTeam || reportsTerritory) ? ` · ${reportsRep || reportsTeam || reportsTerritory}` : ''}
                                </p>
                              </div>
                            </div>
                            {hasReportsSlicing && (
                              <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', flexWrap:'wrap' }}>
                                <span style={{ fontSize:'0.6875rem', fontWeight:'700', color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.05em' }}>Viewing:</span>
                                {rAllReps.length > 1 && <SliceDropdown label="Rep" icon="👤" options={rAllReps} selected={reportsRep} onSelect={v => { setReportsRep(v); if(v){setReportsTeam(null);setReportsTerritory(null);} }} />}
                                {rAllTeams.length > 0 && <SliceDropdown label="Team" icon="👥" options={rAllTeams} selected={reportsTeam} onSelect={v => { setReportsTeam(v); if(v){setReportsRep(null);setReportsTerritory(null);} }} />}
                                {rAllTerritories.length > 0 && <SliceDropdown label="Territory" icon="📍" options={rAllTerritories} selected={reportsTerritory} onSelect={v => { setReportsTerritory(v); if(v){setReportsRep(null);setReportsTeam(null);} }} />}
                                {(reportsRep || reportsTeam || reportsTerritory) && (
                                  <button onClick={() => { setReportsRep(null); setReportsTeam(null); setReportsTerritory(null); }}
                                    style={{ padding:'0.2rem 0.5rem', borderRadius:'4px', border:'1px solid #e2e8f0', background:'#fff', color:'#94a3b8', fontSize:'0.625rem', fontWeight:'600', cursor:'pointer', fontFamily:'inherit' }}>✕ Clear</button>
                                )}
                              </div>
                            )}
                          </div>

                          {/* ── Sub-navigation tabs ── */}
                          <div style={{ display:'flex', gap:0, borderBottom:'2px solid #e2e8f0', padding:'0 1.25rem', background:'#fafbfc', overflowX:'auto' }}>
                            {[
                              { key:'pipeline',    icon:'📊', label:'Pipeline',    desc:'Funnel · Forecast · Stage · Team' },
                              { key:'performance', icon:'🎯', label:'Performance', desc:'Quota · Velocity · Win/Loss' },
                              { key:'revenue',     icon:'💰', label:'Revenue',     desc:'Closed Won · Commissions · Forecast' },
                              { key:'activity',    icon:'📋', label:'Activity',    desc:'Tasks · Activities · Leaderboard' },
                              { key:'leads',       icon:'🎯', label:'Leads',       desc:'Funnel · Sources · Rep · Trend' },
                            ].map(t => (
                              <button key={t.key} onClick={() => setReportSubTab(t.key)}
                                style={{ display:'flex', alignItems:'center', gap:'0.5rem', padding:'0.75rem 1.25rem', border:'none', borderBottom: reportSubTab === t.key ? '2px solid #2563eb' : '2px solid transparent', marginBottom:'-2px', background:'transparent', cursor:'pointer', fontFamily:'inherit', transition:'all 0.15s', whiteSpace:'nowrap' }}>
                                <span style={{ fontSize:'0.9rem' }}>{t.icon}</span>
                                <div style={{ textAlign:'left' }}>
                                  <div style={{ fontSize:'0.8125rem', fontWeight:'700', color: reportSubTab === t.key ? '#2563eb' : '#475569' }}>{t.label}</div>
                                  <div style={{ fontSize:'0.625rem', color:'#94a3b8', fontWeight:'500' }}>{t.desc}</div>
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* ── KPI summary strip (always visible) ── */}
                        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))', gap:'0.75rem', padding:'1rem 1.25rem 0' }}>
                          {[
                            { label:'Won Revenue',    value:'$'+totalWonRevenue.toLocaleString(),         sub: wonOpps.length+' deals',                          accent:'accent-green' },
                            { label:'Pipeline Value', value:'$'+totalPipelineValue.toLocaleString(),       sub: openOpps.length+' open',                          accent:'accent-blue' },
                            { label:'Win Rate',       value: winRate.toFixed(1)+'%',                       sub: wonOpps.length+' won / '+lostOpps.length+' lost', accent:'accent-purple' },
                            { label:'Avg Deal Size',  value:'$'+Math.round(avgDealSize).toLocaleString(),  sub:'closed won',                                      accent:'accent-amber' },
                          ].map(k => (
                            <div key={k.label} className={`kpi-card ${k.accent}`} style={{ borderRadius:'10px', padding:'0.875rem 1rem 0.875rem 1.25rem' }}>
                              <div style={labelStyle}>{k.label}</div>
                              <div style={valueStyle}>{k.value}</div>
                              <div style={{ fontSize:'0.6875rem', color:'#94a3b8', marginTop:'0.125rem' }}>{k.sub}</div>
                            </div>
                          ))}
                        </div>

                        {/* ════════════════════════════════════════════
                             TAB: PIPELINE
                            ════════════════════════════════════════════ */}
                        {reportSubTab === 'pipeline' && (
                        <div style={{ padding:'1rem 1.25rem 1.5rem' }}>
                          <AnalyticsDashboard opportunities={reportsOpps} settings={settings} quotaData={settings.quotaData} accounts={accounts} users={settings.users || []} />
                        </div>
                        )}


                        {/* ════════════════════════════════════════════
                             TAB: PERFORMANCE
                            ════════════════════════════════════════════ */}
                        {reportSubTab === 'performance' && (
                        <div style={{ display:'flex', flexDirection:'column', gap:'1rem', padding:'1rem 1.25rem 1.5rem' }}>

                          {/* Quota Attainment */}
                          {(() => {
                            const qd = settings.quotaData || { type:'annual', annualQuota:0 };
                            const totalQuota = qd.type === 'annual' ? (qd.annualQuota||0) : ((qd.q1Quota||0)+(qd.q2Quota||0)+(qd.q3Quota||0)+(qd.q4Quota||0));
                            const closedWonValue = wonOpps.reduce((s,o)=>s+(o.arr||0)+(o.implementationCost||0),0);
                            const totalWeightedValue = openOpps.reduce((s,o)=>{
                              const stDef = (settings.funnelStages||[]).find(st=>st.name===o.stage);
                              const prob = (o.probability!=null?o.probability:(stDef?stDef.weight:30))/100;
                              return s + ((o.arr||0)+(o.implementationCost||0))*prob;
                            },0);
                            const attainPct = totalQuota > 0 ? (closedWonValue/totalQuota*100) : 0;
                            const estPct    = totalQuota > 0 ? ((closedWonValue+totalWeightedValue)/totalQuota*100) : 0;
                            const barColor  = attainPct>=100?'#10b981':attainPct>=75?'#f59e0b':'#ef4444';
                            return (
                            <div style={cardStyle}>
                              <div style={{ fontWeight:'700', fontSize:'0.9375rem', color:'#1e293b', marginBottom:'1rem' }}>🎯 Quota Attainment</div>
                              {totalQuota === 0 ? <div style={{ color:'#94a3b8', fontSize:'0.8125rem' }}>No quota set. Configure your quota in Settings.</div> : (
                              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:'1rem' }}>
                                {[
                                  { label:'Annual Quota',       value:'$'+totalQuota.toLocaleString(),              color:'#1e293b' },
                                  { label:'Closed Won',         value:'$'+closedWonValue.toLocaleString(),           color:'#10b981' },
                                  { label:'Attainment',         value:attainPct.toFixed(1)+'%',                      color:barColor },
                                  { label:'Est. w/ Weighted',   value:estPct.toFixed(1)+'%',                         color:'#6366f1' },
                                ].map(k=>(
                                  <div key={k.label} style={{ background:'#f8fafc', borderRadius:'8px', padding:'0.75rem 1rem', border:'1px solid #e2e8f0' }}>
                                    <div style={labelStyle}>{k.label}</div>
                                    <div style={{ fontSize:'1.5rem', fontWeight:'800', color:k.color }}>{k.value}</div>
                                  </div>
                                ))}
                              </div>
                              )}
                              {totalQuota > 0 && (
                                <div style={{ marginTop:'1rem' }}>
                                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'0.375rem' }}>
                                    <span style={{ fontSize:'0.75rem', color:'#64748b' }}>Attainment Progress</span>
                                    <span style={{ fontSize:'0.75rem', fontWeight:'700', color:barColor }}>{attainPct.toFixed(1)}%</span>
                                  </div>
                                  <div style={{ height:'12px', background:'#e2e8f0', borderRadius:'6px', overflow:'hidden', position:'relative' }}>
                                    <div style={{ height:'100%', width:Math.min(attainPct,100)+'%', background:barColor, borderRadius:'6px', transition:'width 0.5s ease' }}/>
                                    {estPct > attainPct && <div style={{ position:'absolute', top:0, left:Math.min(attainPct,100)+'%', height:'100%', width:Math.min(estPct-attainPct,100-attainPct)+'%', background:'#6366f120', borderRadius:'0 6px 6px 0' }}/>}
                                  </div>
                                  <div style={{ fontSize:'0.6875rem', color:'#94a3b8', marginTop:'0.375rem' }}>Weighted pipeline adds {(estPct-attainPct).toFixed(1)}% estimated attainment</div>
                                </div>
                              )}
                            </div>
                            );
                          })()}

                          {/* Sales Velocity */}
                          {(() => {
                            const velocityDeals = wonOpps.filter(o => o.createdDate && (o.forecastedCloseDate||o.closeDate));
                            const avgDays = velocityDeals.length > 0 ? Math.round(velocityDeals.reduce((s,o)=>{ const created=new Date(o.createdDate); const closed=new Date(o.forecastedCloseDate||o.closeDate); return s+Math.max(0,Math.floor((closed-created)/86400000)); },0)/velocityDeals.length) : null;
                            const stageVelocity = (settings.funnelStages||[]).filter(s=>s.name!=='Closed Won'&&s.name!=='Closed Lost').map(st => {
                              const sDeals = wonOpps.filter(o => (o.stageHistory||[]).some(h=>h.stage===st.name));
                              const avg = sDeals.length > 0 ? Math.round(sDeals.reduce((s,o)=>{
                                const entry = (o.stageHistory||[]).find(h=>h.stage===st.name);
                                return s + (entry ? Math.max(0,Math.floor((new Date()-new Date(entry.enteredAt))/86400000)) : 0);
                              },0)/sDeals.length) : null;
                              return { stage:st.name, avg, count:sDeals.length };
                            }).filter(s=>s.avg!==null);
                            const allRepsVel = [...new Set(wonOpps.map(o=>o.salesRep||o.assignedTo).filter(Boolean))].sort();
                            const repVelocity = allRepsVel.map(rep => {
                              const rDeals = velocityDeals.filter(o=>(o.salesRep||o.assignedTo)===rep);
                              const avg = rDeals.length > 0 ? Math.round(rDeals.reduce((s,o)=>{ const created=new Date(o.createdDate); const closed=new Date(o.forecastedCloseDate||o.closeDate); return s+Math.max(0,Math.floor((closed-created)/86400000)); },0)/rDeals.length) : 0;
                              return { rep, avg, count:rDeals.length, wonRev: rDeals.reduce((s,o)=>s+(o.arr||0)+(o.implementationCost||0),0) };
                            }).sort((a,b)=>a.avg-b.avg);
                            const maxRepAvg = Math.max(...repVelocity.map(r=>r.avg),1);
                            return (
                            <div style={cardStyle}>
                              <div style={{ fontWeight:'700', fontSize:'0.9375rem', color:'#1e293b', marginBottom:'1rem' }}>⚡ Sales Velocity</div>
                              {avgDays === null ? <div style={{ color:'#94a3b8', fontSize:'0.8125rem' }}>No closed won deals with creation dates yet.</div> : (
                              <div style={{ display:'grid', gridTemplateColumns: repVelocity.length >= 2 ? '1fr 1fr' : '1fr', gap:'1.25rem' }}>
                                <div>
                                  <div style={labelStyle}>Avg Days to Close</div>
                                  <div style={{ fontSize:'2rem', fontWeight:'800', color:'#1e293b', marginBottom:'1rem' }}>{avgDays} <span style={{ fontSize:'1rem', color:'#64748b', fontWeight:'500' }}>days</span></div>
                                  {stageVelocity.length > 0 && <>
                                    <div style={labelStyle}>Avg Days by Stage</div>
                                    {stageVelocity.map(({stage,avg})=>{
                                      const maxAvg = Math.max(...stageVelocity.map(s=>s.avg),1);
                                      return <div key={stage} style={{ marginBottom:'0.5rem' }}>
                                        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'0.2rem' }}>
                                          <span style={{ fontSize:'0.75rem', color:'#475569' }}>{stage}</span>
                                          <span style={{ fontSize:'0.75rem', fontWeight:'700', color:'#1e293b' }}>{avg}d</span>
                                        </div>
                                        <div style={{ height:'5px', background:'#f1f5f9', borderRadius:'3px', overflow:'hidden' }}>
                                          <div style={{ height:'100%', width:(avg/maxAvg*100)+'%', background:'linear-gradient(to right,#6366f1,#8b5cf6)', borderRadius:'3px' }}/>
                                        </div>
                                      </div>;
                                    })}
                                  </>}
                                </div>
                                {repVelocity.length >= 2 && (
                                <div>
                                  <div style={labelStyle}>Velocity by Rep</div>
                                  {repVelocity.map(({rep,avg,count,wonRev})=>(
                                    <div key={rep} style={{ marginBottom:'0.625rem' }}>
                                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'0.2rem' }}>
                                        <span style={{ fontSize:'0.75rem', fontWeight:'600', color:'#475569', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:'130px' }}>{rep}</span>
                                        <span style={{ fontSize:'0.75rem', color:'#94a3b8' }}>{avg}d · {count} deals</span>
                                      </div>
                                      <div style={{ height:'5px', background:'#f1f5f9', borderRadius:'3px', overflow:'hidden' }}>
                                        <div style={{ height:'100%', width:(avg/maxRepAvg*100)+'%', background:'linear-gradient(to right,#2563eb,#7c3aed)', borderRadius:'3px' }}/>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                                )}
                              </div>
                              )}
                            </div>
                            );
                          })()}

                          {/* Win / Loss Analysis */}
                          {(() => {
                            const totalClosed = wonOpps.length + lostOpps.length;
                            const wRate = totalClosed > 0 ? (wonOpps.length/totalClosed*100) : 0;
                            const lostARR = lostOpps.reduce((s,o)=>s+(o.arr||0)+(o.implementationCost||0),0);
                            const catCounts = lostOpps.reduce((acc,o)=>{
                              const cat = o.lostReason || o.closedLostReason || 'Unknown';
                              acc[cat] = (acc[cat]||0)+1; return acc;
                            },{});
                            const catRows = Object.entries(catCounts).sort((a,b)=>b[1]-a[1]);
                            const maxCat = Math.max(...catRows.map(([,c])=>c),1);
                            return (
                            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem' }}>
                              {/* Win Rate card */}
                              <div style={cardStyle}>
                                <div style={{ fontWeight:'700', fontSize:'0.9375rem', color:'#1e293b', marginBottom:'1rem' }}>🏆 Win Rate</div>
                                <div style={{ display:'flex', alignItems:'center', gap:'1.5rem', marginBottom:'1rem' }}>
                                  <div style={{ textAlign:'center' }}>
                                    <div style={{ fontSize:'2.5rem', fontWeight:'900', color: wRate>=50?'#10b981':wRate>=30?'#f59e0b':'#ef4444' }}>{wRate.toFixed(0)}%</div>
                                    <div style={{ fontSize:'0.6875rem', color:'#94a3b8' }}>win rate</div>
                                  </div>
                                  <div style={{ flex:1 }}>
                                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'0.25rem' }}>
                                      <span style={{ fontSize:'0.75rem', color:'#10b981', fontWeight:'600' }}>Won: {wonOpps.length}</span>
                                      <span style={{ fontSize:'0.75rem', color:'#ef4444', fontWeight:'600' }}>Lost: {lostOpps.length}</span>
                                    </div>
                                    <div style={{ height:'10px', background:'#fee2e2', borderRadius:'5px', overflow:'hidden' }}>
                                      <div style={{ height:'100%', width:wRate+'%', background:'#10b981', borderRadius:'5px' }}/>
                                    </div>
                                    <div style={{ fontSize:'0.6875rem', color:'#94a3b8', marginTop:'0.375rem' }}>
                                      Avg won deal: ${wonOpps.length>0?Math.round(wonOpps.reduce((s,o)=>s+(o.arr||0),0)/wonOpps.length).toLocaleString():'—'}
                                    </div>
                                  </div>
                                </div>
                              </div>
                              {/* Loss Analysis card */}
                              <div style={cardStyle}>
                                <div style={{ fontWeight:'700', fontSize:'0.9375rem', color:'#1e293b', marginBottom:'1rem' }}>📉 Loss Analysis</div>
                                {lostOpps.length === 0 ? <div style={{ color:'#94a3b8', fontSize:'0.8125rem' }}>No closed lost opportunities yet.</div> : <>
                                  <div style={{ fontSize:'0.6875rem', color:'#94a3b8', marginBottom:'0.75rem' }}>{lostOpps.length} deals lost · ${lostARR.toLocaleString()} ARR</div>
                                  {catRows.map(([cat,cnt])=>(
                                    <div key={cat} style={{ marginBottom:'0.5rem' }}>
                                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'0.2rem' }}>
                                        <span style={{ fontSize:'0.75rem', color:'#475569' }}>{cat}</span>
                                        <span style={{ fontSize:'0.75rem', fontWeight:'700', color:'#ef4444' }}>{cnt}</span>
                                      </div>
                                      <div style={{ height:'5px', background:'#f1f5f9', borderRadius:'3px', overflow:'hidden' }}>
                                        <div style={{ height:'100%', width:(cnt/maxCat*100)+'%', background:'#ef4444', borderRadius:'3px', opacity:0.7 }}/>
                                      </div>
                                    </div>
                                  ))}
                                </>}
                              </div>
                            </div>
                            );
                          })()}

                          {/* Rep Leaderboard — NEW */}
                          {(() => {
                            const repList = [...new Set(reportsOpps.map(o=>o.salesRep||o.assignedTo).filter(Boolean))].sort();
                            const repStats = repList.map(rep => {
                              const rOpps = reportsOpps.filter(o=>(o.salesRep||o.assignedTo)===rep);
                              const rWon  = rOpps.filter(o=>o.stage==='Closed Won');
                              const rLost = rOpps.filter(o=>o.stage==='Closed Lost');
                              const rOpen = rOpps.filter(o=>o.stage!=='Closed Won'&&o.stage!=='Closed Lost');
                              const wonRev = rWon.reduce((s,o)=>s+(o.arr||0)+(o.implementationCost||0),0);
                              const winPct = (rWon.length+rLost.length)>0 ? rWon.length/(rWon.length+rLost.length)*100 : 0;
                              return { rep, wonRev, wonCount:rWon.length, openCount:rOpen.length, winPct };
                            }).sort((a,b)=>b.wonRev-a.wonRev);
                            const maxRev = Math.max(...repStats.map(r=>r.wonRev),1);
                            if (repStats.length < 2) return null;
                            return (
                            <div style={cardStyle}>
                              <div style={{ fontWeight:'700', fontSize:'0.9375rem', color:'#1e293b', marginBottom:'0.875rem' }}>🏅 Rep Leaderboard</div>
                              <div style={{ overflowX:'auto' }}>
                                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.8125rem' }}>
                                  <thead><tr>
                                    {['#','Rep','Won Revenue','Deals Won','Win Rate','Open Pipeline'].map(h=>(
                                      <th key={h} style={{ padding:'0.4rem 0.75rem', textAlign: h==='Rep'||h==='#'?'left':'right', fontSize:'0.6875rem', fontWeight:'700', color:'#94a3b8', textTransform:'uppercase', borderBottom:'2px solid #e2e8f0', whiteSpace:'nowrap' }}>{h}</th>
                                    ))}
                                  </tr></thead>
                                  <tbody>
                                    {repStats.map((r,i)=>(
                                      <tr key={r.rep} style={{ background:i%2===0?'#fff':'#f8fafc' }}>
                                        <td style={{ padding:'0.5rem 0.75rem', fontWeight:'700', color: i===0?'#f59e0b':i===1?'#94a3b8':i===2?'#d97706':'#cbd5e1' }}>#{i+1}</td>
                                        <td style={{ padding:'0.5rem 0.75rem', fontWeight:'600', color:'#1e293b' }}>{r.rep}</td>
                                        <td style={{ padding:'0.5rem 0.75rem', textAlign:'right', fontWeight:'700', color:'#10b981' }}>${r.wonRev.toLocaleString()}</td>
                                        <td style={{ padding:'0.5rem 0.75rem', textAlign:'right', color:'#475569' }}>{r.wonCount}</td>
                                        <td style={{ padding:'0.5rem 0.75rem', textAlign:'right', color: r.winPct>=50?'#10b981':r.winPct>=30?'#f59e0b':'#ef4444', fontWeight:'600' }}>{r.winPct.toFixed(0)}%</td>
                                        <td style={{ padding:'0.5rem 0.75rem', textAlign:'right', color:'#2563eb' }}>{r.openCount}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                            );
                          })()}

                        </div>
                        )}

                        {/* ════════════════════════════════════════════
                             TAB: REVENUE
                            ════════════════════════════════════════════ */}
                        {reportSubTab === 'revenue' && (
                        <div style={{ display:'flex', flexDirection:'column', gap:'1rem', padding:'1rem 1.25rem 1.5rem' }}>

                          {/* Won Revenue by Quarter + Monthly Trend */}
                          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem' }}>
                            <div style={cardStyle}>
                              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.875rem' }}>
                                <div style={{ fontWeight:'700', fontSize:'0.9375rem', color:'#1e293b' }}>📆 Won Revenue by Quarter ({currentYear})</div>
                                <button onClick={() => { const rows=revenueByQuarter.map((r,i)=>`<tr style="background:${i%2===0?'#fff':'#f8fafc'}"><td>${r.q}</td><td style="text-align:right;font-weight:700;">$${r.rev.toLocaleString()}</td></tr>`).join(''); printSection('Won Revenue by Quarter',`<table><thead><tr><th>Quarter</th><th style="text-align:right;">Won Revenue</th></tr></thead><tbody>${rows}</tbody></table>`); }} style={printBtnStyle} onMouseEnter={e=>e.currentTarget.style.background='#e2e8f0'} onMouseLeave={e=>e.currentTarget.style.background='#f1f5f9'}>🖨️ Print</button>
                              </div>
                              {revenueByQuarter.map(({q,rev})=>(
                                <div key={q} style={{ marginBottom:'0.625rem' }}>
                                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'0.3rem' }}>
                                    <span style={{ fontSize:'0.8125rem', fontWeight:'600', color:'#475569' }}>{q}</span>
                                    <span style={{ fontSize:'0.8125rem', fontWeight:'700', color:'#1e293b' }}>${rev.toLocaleString()}</span>
                                  </div>
                                  <div style={{ height:'8px', background:'#f1f5f9', borderRadius:'4px', overflow:'hidden' }}>
                                    <div style={{ height:'100%', width:(rev/maxQRev*100)+'%', background:'linear-gradient(to right,#2563eb,#7c3aed)', borderRadius:'4px' }}/>
                                  </div>
                                </div>
                              ))}
                            </div>
                            <div style={cardStyle}>
                              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.875rem' }}>
                                <div style={{ fontWeight:'700', fontSize:'0.9375rem', color:'#1e293b' }}>📈 Monthly Won Revenue (Last 6 Mo.)</div>
                                <button onClick={() => { const rows=monthlyData.map((m,i)=>`<tr style="background:${i%2===0?'#fff':'#f8fafc'}"><td>${m.label}</td><td style="text-align:right;font-weight:700;">$${m.rev.toLocaleString()}</td><td style="text-align:center;">${m.count}</td></tr>`).join(''); printSection('Monthly Won Revenue — Last 6 Months',`<table><thead><tr><th>Month</th><th style="text-align:right;">Won Revenue</th><th style="text-align:center;">Deals</th></tr></thead><tbody>${rows}</tbody></table>`); }} style={printBtnStyle} onMouseEnter={e=>e.currentTarget.style.background='#e2e8f0'} onMouseLeave={e=>e.currentTarget.style.background='#f1f5f9'}>🖨️ Print</button>
                              </div>
                              <div style={{ display:'flex', alignItems:'flex-end', gap:'0.5rem', height:'120px' }}>
                                {monthlyData.map((m,i)=>(
                                  <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:'0.25rem', height:'100%', justifyContent:'flex-end' }}>
                                    <div title={'$'+m.rev.toLocaleString()+' · '+m.count+' deals'} style={{ width:'100%', background:m.rev>0?'linear-gradient(to top,#2563eb,#7c3aed)':'#e2e8f0', borderRadius:'4px 4px 0 0', height:Math.max(m.rev/maxMonthRev*100,m.rev>0?4:2)+'%', transition:'height 0.4s ease' }}/>
                                    <span style={{ fontSize:'0.625rem', color:'#94a3b8', whiteSpace:'nowrap' }}>{m.label}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>

                          {/* Closed Won Summary — NEW */}
                          {(() => {
                            const sortedWon = [...wonOpps].sort((a,b)=>new Date(b.forecastedCloseDate||b.closeDate||0)-new Date(a.forecastedCloseDate||a.closeDate||0));
                            return (
                            <div style={cardStyle}>
                              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.875rem' }}>
                                <div style={{ fontWeight:'700', fontSize:'0.9375rem', color:'#1e293b' }}>✅ Closed Won Summary</div>
                                <ReportBtn title="Closed Won Summary" contentFn={() => {
                                  let html='<table><tr><th>Opportunity</th><th>Account</th><th>Rep</th><th style="text-align:right">ARR</th><th style="text-align:right">Impl Cost</th><th>Close Date</th></tr>';
                                  sortedWon.forEach(o=>{ html+=`<tr><td>${o.opportunityName||o.account||'—'}</td><td>${o.account||'—'}</td><td>${o.salesRep||o.assignedTo||'—'}</td><td style="text-align:right">$${(o.arr||0).toLocaleString()}</td><td style="text-align:right">$${(o.implementationCost||0).toLocaleString()}</td><td>${o.forecastedCloseDate||o.closeDate||'—'}</td></tr>`; });
                                  html+='</table>'; return html;
                                }} />
                              </div>
                              {sortedWon.length === 0 ? <div style={{ color:'#94a3b8', fontSize:'0.8125rem' }}>No closed won deals yet.</div> : (
                              <div style={{ overflowX:'auto' }}>
                                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.8125rem' }}>
                                  <thead><tr>
                                    {['Opportunity','Account','Rep','ARR','Impl Cost','Close Date'].map(h=>(
                                      <th key={h} style={{ padding:'0.4rem 0.75rem', textAlign:['ARR','Impl Cost'].includes(h)?'right':'left', fontSize:'0.6875rem', fontWeight:'700', color:'#94a3b8', textTransform:'uppercase', borderBottom:'2px solid #e2e8f0', whiteSpace:'nowrap' }}>{h}</th>
                                    ))}
                                  </tr></thead>
                                  <tbody>
                                    {sortedWon.slice(0,25).map((o,i)=>(
                                      <tr key={o.id} style={{ background:i%2===0?'#fff':'#f8fafc' }}>
                                        <td style={{ padding:'0.5rem 0.75rem', fontWeight:'600', color:'#1e293b', maxWidth:'180px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{o.opportunityName||o.account||'—'}</td>
                                        <td style={{ padding:'0.5rem 0.75rem', color:'#475569', maxWidth:'140px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{o.account||'—'}</td>
                                        <td style={{ padding:'0.5rem 0.75rem', color:'#475569', whiteSpace:'nowrap' }}>{o.salesRep||o.assignedTo||'—'}</td>
                                        <td style={{ padding:'0.5rem 0.75rem', textAlign:'right', color:'#10b981', fontWeight:'600' }}>${(o.arr||0).toLocaleString()}</td>
                                        <td style={{ padding:'0.5rem 0.75rem', textAlign:'right', color:'#475569' }}>${(o.implementationCost||0).toLocaleString()}</td>
                                        <td style={{ padding:'0.5rem 0.75rem', color:'#64748b', whiteSpace:'nowrap' }}>{o.forecastedCloseDate||o.closeDate||'—'}</td>
                                      </tr>
                                    ))}
                                    {sortedWon.length > 25 && <tr><td colSpan={6} style={{ padding:'0.5rem 0.75rem', color:'#94a3b8', fontSize:'0.75rem', textAlign:'center' }}>Showing 25 of {sortedWon.length} deals</td></tr>}
                                  </tbody>
                                </table>
                              </div>
                              )}
                            </div>
                            );
                          })()}

                          {/* Revenue by Team + Territory — NEW */}
                          {(() => {
                            const users = settings.users || [];
                            const teamNames = [...new Set(users.filter(u=>u.team).map(u=>u.team))].sort();
                            const terrNames = [...new Set(users.filter(u=>u.territory).map(u=>u.territory))].sort();
                            if (teamNames.length === 0 && terrNames.length === 0) return null;
                            const buildRows = (names, getUsers) => names.map(n => {
                              const uSet = new Set(getUsers(n));
                              const gWon = wonOpps.filter(o=>uSet.has(o.salesRep||o.assignedTo));
                              return { name:n, rev: gWon.reduce((s,o)=>s+(o.arr||0)+(o.implementationCost||0),0), count:gWon.length, arr: gWon.reduce((s,o)=>s+(o.arr||0),0) };
                            }).sort((a,b)=>b.rev-a.rev);
                            const teamRows = buildRows(teamNames, n => users.filter(u=>u.team===n).map(u=>u.name));
                            const terrRows = buildRows(terrNames, n => users.filter(u=>u.territory===n).map(u=>u.name));
                            const RevTable = ({ title, icon, rows }) => {
                              const maxRev = Math.max(...rows.map(r=>r.rev),1);
                              return (
                              <div style={cardStyle}>
                                <div style={{ fontWeight:'700', fontSize:'0.9375rem', color:'#1e293b', marginBottom:'0.875rem' }}>{icon} {title}</div>
                                {rows.length === 0 ? <div style={{ color:'#94a3b8', fontSize:'0.8125rem' }}>No data.</div> :
                                  rows.map(r=>(
                                    <div key={r.name} style={{ marginBottom:'0.625rem' }}>
                                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'0.25rem' }}>
                                        <span style={{ fontSize:'0.75rem', fontWeight:'600', color:'#475569' }}>{r.name}</span>
                                        <span style={{ fontSize:'0.75rem', fontWeight:'700', color:'#10b981' }}>${r.rev.toLocaleString()} <span style={{ color:'#94a3b8', fontWeight:'400' }}>({r.count} deals)</span></span>
                                      </div>
                                      <div style={{ height:'6px', background:'#f1f5f9', borderRadius:'3px', overflow:'hidden' }}>
                                        <div style={{ height:'100%', width:(r.rev/maxRev*100)+'%', background:'linear-gradient(to right,#10b981,#059669)', borderRadius:'3px' }}/>
                                      </div>
                                    </div>
                                  ))
                                }
                              </div>
                              );
                            };
                            return (
                              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem' }}>
                                {teamNames.length > 0 && <RevTable title="Won Revenue by Team" icon="👥" rows={teamRows} />}
                                {terrNames.length > 0 && <RevTable title="Won Revenue by Territory" icon="📍" rows={terrRows} />}
                              </div>
                            );
                          })()}

                          {/* Commissions Report */}
                          {(() => {
                            const commissionReportPeriods = ['This Quarter', 'Last Quarter', 'This Year', 'Last Year', 'All Time'];
                            const getCommissionPeriodOpps = (period) => {
                              const now = new Date();
                              const yr = now.getFullYear(); const mo = now.getMonth();
                              const curQ = Math.floor(mo/3);
                              const qStart = (q,y) => new Date(y, q*3, 1);
                              const qEnd   = (q,y) => new Date(y, q*3+3, 0);
                              if (period==='This Quarter') return wonOpps.filter(o=>{ const d=new Date(o.forecastedCloseDate||o.closeDate); return d>=qStart(curQ,yr)&&d<=qEnd(curQ,yr); });
                              if (period==='Last Quarter') { const lq=curQ===0?3:curQ-1; const ly=curQ===0?yr-1:yr; return wonOpps.filter(o=>{ const d=new Date(o.forecastedCloseDate||o.closeDate); return d>=qStart(lq,ly)&&d<=qEnd(lq,ly); }); }
                              if (period==='This Year') return wonOpps.filter(o=>new Date(o.forecastedCloseDate||o.closeDate).getFullYear()===yr);
                              if (period==='Last Year') return wonOpps.filter(o=>new Date(o.forecastedCloseDate||o.closeDate).getFullYear()===yr-1);
                              return wonOpps;
                            };
                            const periodOpps = getCommissionPeriodOpps(commissionReportFilter||'This Quarter');
                            const periodLabel = commissionReportFilter||'This Quarter';
                            const calcCommission = (revenue, quota) => {
                              const plan = settings.commissionPlan || { tiers:[{threshold:0,rate:0.05}] };
                              const tiers = plan.tiers || [{threshold:0,rate:0.05}];
                              const attain = quota > 0 ? revenue/quota : 0;
                              const tier = [...tiers].reverse().find(t=>(t.threshold||0)/100<=attain) || tiers[0];
                              return revenue * ((tier?.rate||0.05));
                            };
                            const reps2 = (settings.users||[]).filter(u=>u.role==='User'||u.role==='Rep');
                            const getRepTotal = u => { const qd=settings.quotaData||{}; return qd.type==='annual'?(qd.annualQuota||0)/4:(qd.q1Quota||0); };
                            const repRows2 = reps2.map(u=>{ const rw=periodOpps.filter(o=>(o.salesRep||o.assignedTo)===u.name); const rev=rw.reduce((s,o)=>s+(o.arr||0)+(o.implementationCost||0),0); const quot=getRepTotal(u); const attain=quot>0?(rev/quot*100):null; const comm=calcCommission(rev,quot); return { name:u.name, deals:rw.length, rev, quot, attain, comm }; }).sort((a,b)=>b.rev-a.rev);
                            const totals = repRows2.reduce((s,r)=>({rev:s.rev+r.rev,commission:s.commission+r.comm}),{rev:0,commission:0});
                            const printCommissions = () => {
                              const meta = new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'});
                              const win = window.open('','_blank','width=820,height=600');
                              const rows = repRows2.map(r=>`<tr><td>${r.name}</td><td style="text-align:center">${r.deals}</td><td style="text-align:right">$${r.rev.toLocaleString()}</td><td style="text-align:right">${r.quot>0?'$'+r.quot.toLocaleString():'—'}</td><td style="text-align:right">${r.attain!=null?r.attain.toFixed(1)+'%':'—'}</td><td style="text-align:right;font-weight:700;color:#059669">$${Math.round(r.comm).toLocaleString()}</td></tr>`).join('');
                              win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Commissions — ${periodLabel}</title><style>body{font-family:system-ui,sans-serif;padding:2rem;color:#1e293b}h1{font-size:1.25rem;font-weight:800}table{width:100%;border-collapse:collapse;margin-top:1rem}th,td{padding:.5rem .75rem;border:1px solid #e2e8f0;font-size:.875rem}th{background:#f8fafc;font-weight:700}tfoot td{font-weight:700;background:#f1f5f9}</style></head><body><h1>Commissions Report — ${periodLabel}</h1><p style="color:#64748b;font-size:.875rem">Generated ${meta} · Sales Pipeline Tracker</p><table><thead><tr><th>Rep</th><th style="text-align:center">Deals Won</th><th style="text-align:right">Won Revenue</th><th style="text-align:right">Quota</th><th style="text-align:right">Attainment</th><th style="text-align:right">Commission</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td>Total</td><td></td><td style="text-align:right">$${totals.rev.toLocaleString()}</td><td></td><td></td><td style="text-align:right">$${Math.round(totals.commission).toLocaleString()}</td></tr></tfoot></table></body></html>`);
                              win.document.close(); setTimeout(()=>win.print(),500);
                            };
                            return (
                            <div style={cardStyle}>
                              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem', flexWrap:'wrap', gap:'0.5rem' }}>
                                <div style={{ fontWeight:'700', fontSize:'0.9375rem', color:'#1e293b' }}>💳 Commissions Earned</div>
                                <div style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
                                  <div style={{ display:'flex', gap:'0.25rem', flexWrap:'wrap' }}>
                                    {commissionReportPeriods.map(pill=>(
                                      <button key={pill} onClick={()=>setCommissionReportFilter(pill)} style={{ padding:'0.2rem 0.625rem', borderRadius:'999px', border:'none', cursor:'pointer', fontSize:'0.6875rem', fontWeight:'700', fontFamily:'inherit', transition:'all 0.15s', background:(commissionReportFilter||'This Quarter')===pill?'#2563eb':'#e2e8f0', color:(commissionReportFilter||'This Quarter')===pill?'#fff':'#64748b' }}>{pill}</button>
                                    ))}
                                  </div>
                                  <button onClick={printCommissions} style={printBtnStyle} onMouseEnter={e=>e.currentTarget.style.background='#e2e8f0'} onMouseLeave={e=>e.currentTarget.style.background='#f1f5f9'}>🖨️ Print</button>
                                </div>
                              </div>
                              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))', gap:'0.75rem', marginBottom:'1rem' }}>
                                {[
                                  { label:'Deals Won',         value: periodOpps.length },
                                  { label:'Won Revenue',       value: '$'+periodOpps.reduce((s,o)=>s+(o.arr||0)+(o.implementationCost||0),0).toLocaleString() },
                                  { label:'Total Commissions', value: '$'+Math.round(totals.commission).toLocaleString() },
                                ].map(k=>(
                                  <div key={k.label} style={{ background:'#f8fafc', borderRadius:'8px', padding:'0.625rem 0.875rem', border:'1px solid #e2e8f0' }}>
                                    <div style={labelStyle}>{k.label}</div>
                                    <div style={{ fontSize:'1.25rem', fontWeight:'800', color:'#1e293b' }}>{k.value}</div>
                                  </div>
                                ))}
                              </div>
                              {repRows2.length === 0 ? <div style={{ color:'#94a3b8', fontSize:'0.8125rem' }}>No rep data for this period.</div> : (
                              <div style={{ overflowX:'auto' }}>
                                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.8125rem' }}>
                                  <thead><tr>
                                    {['Rep','Deals Won','Won Revenue','Quota','Attainment','Commission'].map(h=>(
                                      <th key={h} style={{ padding:'0.4rem 0.75rem', textAlign:h==='Rep'?'left':'right', fontSize:'0.6875rem', fontWeight:'700', color:'#94a3b8', textTransform:'uppercase', borderBottom:'2px solid #e2e8f0', whiteSpace:'nowrap' }}>{h}</th>
                                    ))}
                                  </tr></thead>
                                  <tbody>
                                    {repRows2.map((r,i)=>(
                                      <tr key={r.name} style={{ background:i%2===0?'#fff':'#f8fafc' }}>
                                        <td style={{ padding:'0.5rem 0.75rem', fontWeight:'600', color:'#1e293b' }}>{r.name}</td>
                                        <td style={{ padding:'0.5rem 0.75rem', textAlign:'right', color:'#475569' }}>{r.deals}</td>
                                        <td style={{ padding:'0.5rem 0.75rem', textAlign:'right', color:'#10b981', fontWeight:'600' }}>${r.rev.toLocaleString()}</td>
                                        <td style={{ padding:'0.5rem 0.75rem', textAlign:'right', color:'#94a3b8' }}>{r.quot>0?'$'+r.quot.toLocaleString():'—'}</td>
                                        <td style={{ padding:'0.5rem 0.75rem', textAlign:'right', color: r.attain!=null?(r.attain>=100?'#10b981':r.attain>=75?'#f59e0b':'#ef4444'):'#94a3b8', fontWeight:'600' }}>{r.attain!=null?r.attain.toFixed(1)+'%':'—'}</td>
                                        <td style={{ padding:'0.5rem 0.75rem', textAlign:'right', fontWeight:'700', color:'#059669' }}>${Math.round(r.comm).toLocaleString()}</td>
                                      </tr>
                                    ))}
                                    <tr style={{ borderTop:'2px solid #1e293b', fontWeight:'800', background:'#f8fafc' }}>
                                      <td style={{ padding:'0.5rem 0.75rem', color:'#1e293b' }}>Total</td>
                                      <td/>
                                      <td style={{ padding:'0.5rem 0.75rem', textAlign:'right', color:'#10b981' }}>${totals.rev.toLocaleString()}</td>
                                      <td/><td/>
                                      <td style={{ padding:'0.5rem 0.75rem', textAlign:'right', color:'#059669' }}>${Math.round(totals.commission).toLocaleString()}</td>
                                    </tr>
                                  </tbody>
                                </table>
                              </div>
                              )}
                            </div>
                            );
                          })()}

                        </div>
                        )}

                        {/* ════════════════════════════════════════════
                             TAB: ACTIVITY
                            ════════════════════════════════════════════ */}
                        {reportSubTab === 'activity' && (
                        <div style={{ display:'flex', flexDirection:'column', gap:'1rem', padding:'1rem 1.25rem 1.5rem' }}>

                          {/* Activity Summary — NEW */}
                          {(() => {
                            const now = new Date();
                            const periods = ['Last 7 Days','Last 30 Days','Last 90 Days','All Time'];
                            const periodDays = { 'Last 7 Days':7, 'Last 30 Days':30, 'Last 90 Days':90, 'All Time': Infinity };
                            const days = periodDays[actPeriod];
                            const cutoff = days === Infinity ? new Date(0) : new Date(now - days*86400000);
                            const filtActs = (activities||[]).filter(a => new Date(a.date||a.createdAt||0) >= cutoff);
                            const byType = filtActs.reduce((acc,a)=>{ const t=a.type||'Other'; acc[t]=(acc[t]||0)+1; return acc; },{});
                            const typeRows = Object.entries(byType).sort((a,b)=>b[1]-a[1]);
                            const maxTypeCount = Math.max(...typeRows.map(([,c])=>c),1);
                            const byRep = filtActs.reduce((acc,a)=>{ const r=a.rep||a.salesRep||a.assignedTo||'Unknown'; if(!acc[r])acc[r]={count:0}; acc[r].count++; return acc; },{});
                            const repActRows = Object.entries(byRep).sort((a,b)=>b[1].count-a[1].count);
                            return (
                            <div style={cardStyle}>
                              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem', flexWrap:'wrap', gap:'0.5rem' }}>
                                <div style={{ fontWeight:'700', fontSize:'0.9375rem', color:'#1e293b' }}>📞 Activity Summary</div>
                                <div style={{ display:'flex', gap:'0.25rem' }}>
                                  {periods.map(p=>(
                                    <button key={p} onClick={()=>setActPeriod(p)} style={{ padding:'0.2rem 0.625rem', borderRadius:'999px', border:'none', cursor:'pointer', fontSize:'0.6875rem', fontWeight:'700', fontFamily:'inherit', background:actPeriod===p?'#2563eb':'#e2e8f0', color:actPeriod===p?'#fff':'#64748b' }}>{p}</button>
                                  ))}
                                </div>
                              </div>
                              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(100px,1fr))', gap:'0.75rem', marginBottom:'1.25rem' }}>
                                {[
                                  { label:'Total Activities', value: filtActs.length },
                                  { label:'Unique Types',     value: typeRows.length },
                                  { label:'Active Reps',      value: repActRows.length },
                                  { label:'Avg / Rep',        value: repActRows.length > 0 ? Math.round(filtActs.length/repActRows.length) : 0 },
                                ].map(k=>(
                                  <div key={k.label} style={{ background:'#f8fafc', borderRadius:'8px', padding:'0.625rem 0.875rem', border:'1px solid #e2e8f0' }}>
                                    <div style={labelStyle}>{k.label}</div>
                                    <div style={{ fontSize:'1.5rem', fontWeight:'800', color:'#1e293b' }}>{k.value}</div>
                                  </div>
                                ))}
                              </div>
                              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1.25rem' }}>
                                <div>
                                  <div style={labelStyle}>By Activity Type</div>
                                  {typeRows.length === 0 ? <div style={{ color:'#94a3b8', fontSize:'0.8125rem', marginTop:'0.5rem' }}>No activities logged yet.</div> :
                                    typeRows.map(([type,cnt])=>(
                                      <div key={type} style={{ marginBottom:'0.5rem' }}>
                                        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'0.2rem' }}>
                                          <span style={{ fontSize:'0.75rem', color:'#475569' }}>{type}</span>
                                          <span style={{ fontSize:'0.75rem', fontWeight:'700', color:'#1e293b' }}>{cnt}</span>
                                        </div>
                                        <div style={{ height:'5px', background:'#f1f5f9', borderRadius:'3px', overflow:'hidden' }}>
                                          <div style={{ height:'100%', width:(cnt/maxTypeCount*100)+'%', background:'linear-gradient(to right,#2563eb,#7c3aed)', borderRadius:'3px' }}/>
                                        </div>
                                      </div>
                                    ))
                                  }
                                </div>
                                <div>
                                  <div style={labelStyle}>By Rep</div>
                                  {repActRows.length === 0 ? <div style={{ color:'#94a3b8', fontSize:'0.8125rem', marginTop:'0.5rem' }}>No activities logged yet.</div> :
                                    repActRows.map(([rep,{count}])=>{
                                      const maxC = Math.max(...repActRows.map(([,{count}])=>count),1);
                                      return (
                                      <div key={rep} style={{ marginBottom:'0.5rem' }}>
                                        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'0.2rem' }}>
                                          <span style={{ fontSize:'0.75rem', fontWeight:'600', color:'#475569', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:'120px' }}>{rep}</span>
                                          <span style={{ fontSize:'0.75rem', fontWeight:'700', color:'#1e293b' }}>{count}</span>
                                        </div>
                                        <div style={{ height:'5px', background:'#f1f5f9', borderRadius:'3px', overflow:'hidden' }}>
                                          <div style={{ height:'100%', width:(count/maxC*100)+'%', background:'linear-gradient(to right,#10b981,#059669)', borderRadius:'3px' }}/>
                                        </div>
                                      </div>
                                      );
                                    })
                                  }
                                </div>
                              </div>
                            </div>
                            );
                          })()}

                          {/* Task Completion Rate — NEW */}
                          {(() => {
                            const allTasks = tasks || [];
                            const getStatus = t => t.status || (t.completed ? 'Completed' : 'Open');
                            const today = new Date(); today.setHours(0,0,0,0);
                            const completed = allTasks.filter(t => getStatus(t) === 'Completed');
                            const open      = allTasks.filter(t => getStatus(t) === 'Open' || getStatus(t) === 'In-Process');
                            const overdue   = allTasks.filter(t => (getStatus(t)==='Open'||getStatus(t)==='In-Process') && t.dueDate && new Date(t.dueDate) < today);
                            const compRate  = allTasks.length > 0 ? (completed.length/allTasks.length*100) : 0;
                            const repTaskMap = allTasks.reduce((acc,t)=>{ const r=t.assignedTo||'Unassigned'; if(!acc[r])acc[r]={total:0,done:0,overdue:0}; acc[r].total++; if(getStatus(t)==='Completed')acc[r].done++; if((getStatus(t)==='Open'||getStatus(t)==='In-Process')&&t.dueDate&&new Date(t.dueDate)<today)acc[r].overdue++; return acc; },{});
                            const repTaskRows = Object.entries(repTaskMap).sort((a,b)=>b[1].total-a[1].total);
                            return (
                            <div style={cardStyle}>
                              <div style={{ fontWeight:'700', fontSize:'0.9375rem', color:'#1e293b', marginBottom:'1rem' }}>✔️ Task Completion Rate</div>
                              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(120px,1fr))', gap:'0.75rem', marginBottom:'1.25rem' }}>
                                {[
                                  { label:'Total Tasks',    value: allTasks.length,   color:'#1e293b' },
                                  { label:'Completed',      value: completed.length,   color:'#10b981' },
                                  { label:'Open / Active',  value: open.length,        color:'#2563eb' },
                                  { label:'Overdue',        value: overdue.length,     color:'#ef4444' },
                                  { label:'Completion Rate',value: compRate.toFixed(0)+'%', color: compRate>=75?'#10b981':compRate>=50?'#f59e0b':'#ef4444' },
                                ].map(k=>(
                                  <div key={k.label} style={{ background:'#f8fafc', borderRadius:'8px', padding:'0.625rem 0.875rem', border:'1px solid #e2e8f0' }}>
                                    <div style={labelStyle}>{k.label}</div>
                                    <div style={{ fontSize:'1.375rem', fontWeight:'800', color:k.color }}>{k.value}</div>
                                  </div>
                                ))}
                              </div>
                              {repTaskRows.length >= 2 && (
                              <div style={{ overflowX:'auto' }}>
                                <div style={labelStyle}>By Rep</div>
                                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.8125rem', marginTop:'0.5rem' }}>
                                  <thead><tr>
                                    {['Rep','Total','Completed','Overdue','Completion %'].map(h=>(
                                      <th key={h} style={{ padding:'0.4rem 0.75rem', textAlign:h==='Rep'?'left':'right', fontSize:'0.6875rem', fontWeight:'700', color:'#94a3b8', textTransform:'uppercase', borderBottom:'2px solid #e2e8f0', whiteSpace:'nowrap' }}>{h}</th>
                                    ))}
                                  </tr></thead>
                                  <tbody>
                                    {repTaskRows.map(([rep,{total,done,overdue}],i)=>{
                                      const pct = total > 0 ? done/total*100 : 0;
                                      return (
                                      <tr key={rep} style={{ background:i%2===0?'#fff':'#f8fafc' }}>
                                        <td style={{ padding:'0.5rem 0.75rem', fontWeight:'600', color:'#1e293b' }}>{rep}</td>
                                        <td style={{ padding:'0.5rem 0.75rem', textAlign:'right', color:'#475569' }}>{total}</td>
                                        <td style={{ padding:'0.5rem 0.75rem', textAlign:'right', color:'#10b981', fontWeight:'600' }}>{done}</td>
                                        <td style={{ padding:'0.5rem 0.75rem', textAlign:'right', color: overdue>0?'#ef4444':'#94a3b8', fontWeight: overdue>0?'700':'400' }}>{overdue}</td>
                                        <td style={{ padding:'0.5rem 0.75rem', textAlign:'right', fontWeight:'700', color:pct>=75?'#10b981':pct>=50?'#f59e0b':'#ef4444' }}>{pct.toFixed(0)}%</td>
                                      </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                              )}
                            </div>
                            );
                          })()}

                          {/* Recent Activity Log — NEW */}
                          {(() => {
                            const recentActs = [...(activities||[])].sort((a,b)=>new Date(b.date||b.createdAt||0)-new Date(a.date||a.createdAt||0)).slice(0,30);
                            const typeIcons = { Call:'📞', Email:'📧', Meeting:'🤝', Demo:'💻', 'Follow-up':'🔔', Note:'📝' };
                            return (
                            <div style={cardStyle}>
                              <div style={{ fontWeight:'700', fontSize:'0.9375rem', color:'#1e293b', marginBottom:'0.875rem' }}>🕐 Recent Activity Log <span style={{ fontSize:'0.75rem', fontWeight:'400', color:'#94a3b8' }}>(last 30)</span></div>
                              {recentActs.length === 0 ? <div style={{ color:'#94a3b8', fontSize:'0.8125rem' }}>No activities logged yet.</div> : (
                              <div style={{ overflowX:'auto' }}>
                                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.8125rem' }}>
                                  <thead><tr>
                                    {['Date','Type','Subject','Account','Rep','Duration'].map(h=>(
                                      <th key={h} style={{ padding:'0.4rem 0.75rem', textAlign:'left', fontSize:'0.6875rem', fontWeight:'700', color:'#94a3b8', textTransform:'uppercase', borderBottom:'2px solid #e2e8f0', whiteSpace:'nowrap' }}>{h}</th>
                                    ))}
                                  </tr></thead>
                                  <tbody>
                                    {recentActs.map((a,i)=>(
                                      <tr key={a.id||i} style={{ background:i%2===0?'#fff':'#f8fafc' }}>
                                        <td style={{ padding:'0.5rem 0.75rem', color:'#64748b', whiteSpace:'nowrap' }}>{a.date ? new Date(a.date).toLocaleDateString() : '—'}</td>
                                        <td style={{ padding:'0.5rem 0.75rem', whiteSpace:'nowrap' }}><span>{typeIcons[a.type]||'📋'} {a.type||'—'}</span></td>
                                        <td style={{ padding:'0.5rem 0.75rem', color:'#1e293b', maxWidth:'200px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{a.subject||a.title||'—'}</td>
                                        <td style={{ padding:'0.5rem 0.75rem', color:'#475569', maxWidth:'150px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{a.account||'—'}</td>
                                        <td style={{ padding:'0.5rem 0.75rem', color:'#475569', whiteSpace:'nowrap' }}>{a.rep||a.salesRep||'—'}</td>
                                        <td style={{ padding:'0.5rem 0.75rem', color:'#94a3b8', whiteSpace:'nowrap' }}>{a.duration ? a.duration+'m' : '—'}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                              )}
                            </div>
                            );
                          })()}

                        </div>
                        )}

                        {/* ════════════════════════════════════════════
                             TAB: LEADS
                            ════════════════════════════════════════════ */}
                        {reportSubTab === 'leads' && (() => {
                            const stageColors = { 'New':'#94a3b8','Contacted':'#0ea5e9','Qualified':'#8b5cf6','Working':'#f59e0b','Converted':'#10b981','Dead':'#ef4444' };
                            const allLeads = leads || [];
                            const openLeads = allLeads.filter(l => l.status !== 'Converted' && l.status !== 'Dead');
                            const hotLeads = allLeads.filter(l => (l.score||0) >= 70);
                            const convertedLeads = allLeads.filter(l => l.status === 'Converted');
                            const deadLeads = allLeads.filter(l => l.status === 'Dead');
                            const totalEstARR = openLeads.reduce((s,l) => s + (parseFloat(l.estimatedARR)||0), 0);
                            const avgScore = allLeads.length > 0 ? Math.round(allLeads.reduce((s,l) => s + (l.score||50), 0) / allLeads.length) : 0;
                            const convRate = allLeads.length > 0 ? (convertedLeads.length / allLeads.length * 100) : 0;

                            // Source breakdown
                            const sourceMap = {};
                            allLeads.forEach(l => { const s = l.source || 'Unknown'; sourceMap[s] = (sourceMap[s]||0)+1; });
                            const sourceData = Object.entries(sourceMap).sort((a,b)=>b[1]-a[1]);
                            const maxSource = Math.max(...sourceData.map(([,c])=>c), 1);

                            // Rep performance
                            const repMap = {};
                            allLeads.forEach(l => {
                                const r = l.assignedTo || '__unassigned__';
                                if (!repMap[r]) repMap[r] = { assigned:0, converted:0, estARR:0 };
                                repMap[r].assigned++;
                                if (l.status === 'Converted') repMap[r].converted++;
                                repMap[r].estARR += parseFloat(l.estimatedARR)||0;
                            });
                            const repRows = Object.entries(repMap)
                                .map(([rep, d]) => ({ rep: rep === '__unassigned__' ? 'Unassigned' : rep, ...d, rate: d.assigned > 0 ? (d.converted/d.assigned*100) : 0 }))
                                .sort((a,b) => b.estARR - a.estARR);

                            // Score distribution
                            const scoreBuckets = [
                                { label:'Cold (0-39)',  min:0,  max:39,  color:'#3b82f6' },
                                { label:'Warm (40-69)', min:40, max:69,  color:'#f59e0b' },
                                { label:'Hot (70-100)', min:70, max:100, color:'#ef4444' },
                            ].map(b => ({ ...b, count: allLeads.filter(l => (l.score||0) >= b.min && (l.score||0) <= b.max).length }));

                            // Monthly trend (last 6 months)
                            const now = new Date();
                            const monthlyTrend = Array.from({length:6}, (_,i) => {
                                const d = new Date(now.getFullYear(), now.getMonth() - (5-i), 1);
                                const next = new Date(d.getFullYear(), d.getMonth()+1, 1);
                                const created = allLeads.filter(l => { const c = new Date(l.createdAt||0); return c >= d && c < next; }).length;
                                const converted = convertedLeads.filter(l => { const c = new Date(l.convertedAt||l.createdAt||0); return c >= d && c < next; }).length;
                                return { label: d.toLocaleString('default',{month:'short'}), created, converted };
                            });
                            const maxTrend = Math.max(...monthlyTrend.map(m=>m.created), 1);

                            const cardStyle = { background:'#fff', border:'1px solid #e2e8f0', borderRadius:'12px', overflow:'hidden' };
                            const labelStyle = { fontSize:'0.6rem', fontWeight:'700', color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'0.25rem' };

                            return (
                            <div style={{ display:'flex', flexDirection:'column', gap:'1rem', padding:'1rem 1.25rem 1.5rem' }}>

                                {/* KPI Strip */}
                                <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:'0.75rem' }}>
                                    {[
                                        { label:'Total Leads',    value: allLeads.length,                         sub: openLeads.length+' open',            accent:'#2563eb', vcolor:'#1e293b' },
                                        { label:'🔥 Hot Leads',   value: hotLeads.length,                         sub: 'score ≥ 70',                         accent:'#dc2626', vcolor:'#dc2626' },
                                        { label:'Converted',      value: convertedLeads.length,                   sub: convRate.toFixed(1)+'% rate',         accent:'#10b981', vcolor:'#10b981' },
                                        { label:'Est. Pipeline',  value: '$'+(totalEstARR>=1000000?((totalEstARR/1000000).toFixed(1)+'M'):(totalEstARR>=1000?(Math.round(totalEstARR/1000)+'K'):totalEstARR)), sub:'from open leads', accent:'#7c3aed', vcolor:'#7c3aed' },
                                        { label:'Avg Score',      value: avgScore,                                sub: hotLeads.length+' hot · '+allLeads.filter(l=>(l.score||0)>=40&&(l.score||0)<70).length+' warm', accent:'#f59e0b', vcolor:'#f59e0b' },
                                    ].map(k => (
                                        <div key={k.label} style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:'10px', padding:'0.875rem 1rem', borderLeft:'3px solid '+k.accent }}>
                                            <div style={labelStyle}>{k.label}</div>
                                            <div style={{ fontSize:'1.625rem', fontWeight:'800', color:k.vcolor, lineHeight:1 }}>{k.value}</div>
                                            <div style={{ fontSize:'0.6875rem', color:'#94a3b8', marginTop:'0.25rem' }}>{k.sub}</div>
                                        </div>
                                    ))}
                                </div>

                                {/* Row 2: Funnel + Source */}
                                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem' }}>

                                    {/* Lead Funnel */}
                                    <div style={cardStyle}>
                                        <div style={{ padding:'0.75rem 1rem', borderBottom:'1px solid #e2e8f0' }}>
                                            <span style={{ fontSize:'0.75rem', fontWeight:'800', color:'#0f172a', textTransform:'uppercase', letterSpacing:'0.05em' }}>🔽 Lead Funnel</span>
                                        </div>
                                        <div style={{ padding:'1rem' }}>
                                            {Object.entries(stageColors).map(([stage, color]) => {
                                                const count = allLeads.filter(l => (l.status||'New') === stage).length;
                                                const pct = allLeads.length > 0 ? Math.round(count/allLeads.length*100) : 0;
                                                return (
                                                    <div key={stage} style={{ display:'flex', alignItems:'center', gap:'0.625rem', marginBottom:'0.5rem' }}>
                                                        <span style={{ fontSize:'0.6875rem', fontWeight:'700', color:'#475569', width:'72px', flexShrink:0 }}>{stage}</span>
                                                        <div style={{ flex:1, background:'#f8fafc', borderRadius:'5px', overflow:'hidden', height:'28px' }}>
                                                            <div style={{ height:'100%', width:Math.max(pct,count>0?8:0)+'%', background:color, borderRadius:'5px', display:'flex', alignItems:'center', paddingLeft:'0.5rem', transition:'width 0.5s ease' }}>
                                                                {count > 0 && <span style={{ fontSize:'0.625rem', fontWeight:'800', color:'#fff' }}>{count}</span>}
                                                            </div>
                                                        </div>
                                                        <span style={{ fontSize:'0.6875rem', color:'#94a3b8', width:'28px', textAlign:'right', flexShrink:0 }}>{pct}%</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Source Breakdown */}
                                    <div style={cardStyle}>
                                        <div style={{ padding:'0.75rem 1rem', borderBottom:'1px solid #e2e8f0' }}>
                                            <span style={{ fontSize:'0.75rem', fontWeight:'800', color:'#0f172a', textTransform:'uppercase', letterSpacing:'0.05em' }}>📡 By Source</span>
                                        </div>
                                        <div style={{ padding:'1rem' }}>
                                            {sourceData.length === 0
                                                ? <div style={{ color:'#94a3b8', fontSize:'0.8125rem', textAlign:'center', padding:'1rem' }}>No leads yet.</div>
                                                : sourceData.map(([src, cnt], idx) => {
                                                    const colors = ['#2563eb','#7c3aed','#0ea5e9','#10b981','#f59e0b','#ef4444','#ec4899'];
                                                    return (
                                                        <div key={src} style={{ display:'flex', alignItems:'center', gap:'0.625rem', marginBottom:'0.625rem' }}>
                                                            <span style={{ fontSize:'0.75rem', color:'#475569', width:'90px', flexShrink:0, fontWeight:'600', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{src}</span>
                                                            <div style={{ flex:1, height:'6px', background:'#f1f5f9', borderRadius:'3px', overflow:'hidden' }}>
                                                                <div style={{ height:'100%', width:Math.round(cnt/maxSource*100)+'%', background:colors[idx%colors.length], borderRadius:'3px', transition:'width 0.5s ease' }}></div>
                                                            </div>
                                                            <span style={{ fontSize:'0.6875rem', fontWeight:'700', color:'#1e293b', width:'20px', textAlign:'right', flexShrink:0 }}>{cnt}</span>
                                                        </div>
                                                    );
                                                })
                                            }
                                        </div>
                                    </div>
                                </div>

                                {/* Row 3: Rep Performance + Score Distribution */}
                                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem' }}>

                                    {/* Rep Performance */}
                                    <div style={cardStyle}>
                                        <div style={{ padding:'0.75rem 1rem', borderBottom:'1px solid #e2e8f0' }}>
                                            <span style={{ fontSize:'0.75rem', fontWeight:'800', color:'#0f172a', textTransform:'uppercase', letterSpacing:'0.05em' }}>👤 Rep Lead Performance</span>
                                        </div>
                                        <div style={{ overflowX:'auto' }}>
                                            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.8125rem' }}>
                                                <thead><tr>
                                                    {['Rep','Assigned','Converted','Rate','Est. ARR'].map(h => (
                                                        <th key={h} style={{ padding:'0.5rem 0.75rem', background:'#f8fafc', borderBottom:'1px solid #e2e8f0', fontSize:'0.6rem', fontWeight:'700', color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.06em', textAlign:['Assigned','Converted','Rate','Est. ARR'].includes(h)?'right':'left', whiteSpace:'nowrap' }}>{h}</th>
                                                    ))}
                                                </tr></thead>
                                                <tbody>
                                                    {repRows.length === 0
                                                        ? <tr><td colSpan={5} style={{ textAlign:'center', padding:'1rem', color:'#94a3b8', fontSize:'0.8125rem' }}>No leads yet.</td></tr>
                                                        : repRows.map((r,i) => (
                                                            <tr key={r.rep} style={{ background: i%2===0?'#fff':'#f8fafc' }}>
                                                                <td style={{ padding:'0.5rem 0.75rem', borderBottom:'1px solid #f1f5f9', fontWeight:'600', color: r.rep==='Unassigned'?'#ef4444':'#1e293b' }}>{r.rep}</td>
                                                                <td style={{ padding:'0.5rem 0.75rem', borderBottom:'1px solid #f1f5f9', textAlign:'right', color:'#475569' }}>{r.assigned}</td>
                                                                <td style={{ padding:'0.5rem 0.75rem', borderBottom:'1px solid #f1f5f9', textAlign:'right', color:'#10b981', fontWeight:'700' }}>{r.converted}</td>
                                                                <td style={{ padding:'0.5rem 0.75rem', borderBottom:'1px solid #f1f5f9', textAlign:'right', fontWeight:'700', color: r.rate>=25?'#10b981':r.rate>=15?'#f59e0b':'#ef4444' }}>{r.rep==='Unassigned'?'—':r.rate.toFixed(0)+'%'}</td>
                                                                <td style={{ padding:'0.5rem 0.75rem', borderBottom:'1px solid #f1f5f9', textAlign:'right', fontWeight:'700', color:'#2563eb' }}>{r.estARR>0?'$'+(r.estARR>=1000000?((r.estARR/1000000).toFixed(1)+'M'):(r.estARR>=1000?(Math.round(r.estARR/1000)+'K'):r.estARR)):'—'}</td>
                                                            </tr>
                                                        ))
                                                    }
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>

                                    {/* Score Distribution */}
                                    <div style={cardStyle}>
                                        <div style={{ padding:'0.75rem 1rem', borderBottom:'1px solid #e2e8f0' }}>
                                            <span style={{ fontSize:'0.75rem', fontWeight:'800', color:'#0f172a', textTransform:'uppercase', letterSpacing:'0.05em' }}>📊 Score Distribution</span>
                                        </div>
                                        <div style={{ padding:'1.25rem' }}>
                                            {scoreBuckets.map(b => (
                                                <div key={b.label} style={{ marginBottom:'0.875rem' }}>
                                                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'0.3rem' }}>
                                                        <span style={{ fontSize:'0.75rem', fontWeight:'600', color:'#475569' }}>{b.label}</span>
                                                        <span style={{ fontSize:'0.75rem', fontWeight:'800', color:'#1e293b' }}>{b.count} leads</span>
                                                    </div>
                                                    <div style={{ height:'8px', background:'#f1f5f9', borderRadius:'4px', overflow:'hidden' }}>
                                                        <div style={{ height:'100%', width: allLeads.length>0?Math.round(b.count/allLeads.length*100)+'%':'0%', background:b.color, borderRadius:'4px', transition:'width 0.5s ease' }}></div>
                                                    </div>
                                                </div>
                                            ))}
                                            <div style={{ marginTop:'1rem', padding:'0.75rem', background:'#f8fafc', borderRadius:'8px', border:'1px solid #e2e8f0', display:'flex', justifyContent:'space-around', textAlign:'center' }}>
                                                <div>
                                                    <div style={{ fontSize:'0.6rem', fontWeight:'700', color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'0.2rem' }}>Avg Score</div>
                                                    <div style={{ fontSize:'1.25rem', fontWeight:'800', color: avgScore>=70?'#dc2626':avgScore>=40?'#f59e0b':'#3b82f6' }}>{avgScore}</div>
                                                </div>
                                                <div>
                                                    <div style={{ fontSize:'0.6rem', fontWeight:'700', color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'0.2rem' }}>Hot %</div>
                                                    <div style={{ fontSize:'1.25rem', fontWeight:'800', color:'#dc2626' }}>{allLeads.length>0?Math.round(hotLeads.length/allLeads.length*100):0}%</div>
                                                </div>
                                                <div>
                                                    <div style={{ fontSize:'0.6rem', fontWeight:'700', color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'0.2rem' }}>Unassigned</div>
                                                    <div style={{ fontSize:'1.25rem', fontWeight:'800', color:'#ef4444' }}>{allLeads.filter(l=>!l.assignedTo).length}</div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Row 4: Monthly Trend */}
                                <div style={cardStyle}>
                                    <div style={{ padding:'0.75rem 1rem', borderBottom:'1px solid #e2e8f0' }}>
                                        <span style={{ fontSize:'0.75rem', fontWeight:'800', color:'#0f172a', textTransform:'uppercase', letterSpacing:'0.05em' }}>📅 Lead Trend — Last 6 Months</span>
                                    </div>
                                    <div style={{ padding:'1.25rem' }}>
                                        {allLeads.length === 0
                                            ? <div style={{ textAlign:'center', color:'#94a3b8', fontSize:'0.8125rem', padding:'1rem' }}>No leads yet.</div>
                                            : (
                                            <div>
                                                <div style={{ display:'flex', gap:'0.75rem', alignItems:'flex-end', height:'80px', marginBottom:'0.5rem' }}>
                                                    {monthlyTrend.map((m,i) => (
                                                        <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:'3px', height:'100%', justifyContent:'flex-end' }}>
                                                            {m.created > 0 && <div style={{ fontSize:'0.5625rem', fontWeight:'700', color:'#475569' }}>{m.created}</div>}
                                                            <div style={{ width:'100%', display:'flex', alignItems:'flex-end', gap:'2px', height:Math.max(Math.round(m.created/maxTrend*70),2)+'px' }}>
                                                                <div style={{ flex:1, height:'100%', background:'linear-gradient(to top,#2563eb,#7c3aed)', borderRadius:'3px 3px 0 0', opacity:0.85 }}></div>
                                                                {m.converted > 0 && <div style={{ flex:1, height:Math.max(Math.round(m.converted/maxTrend*70),4)+'px', background:'#10b981', borderRadius:'3px 3px 0 0' }}></div>}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                                <div style={{ display:'flex', gap:'0.75rem', borderTop:'1px solid #f1f5f9', paddingTop:'0.375rem' }}>
                                                    {monthlyTrend.map((m,i) => (
                                                        <div key={i} style={{ flex:1, textAlign:'center', fontSize:'0.6rem', color:'#94a3b8', fontWeight:'600' }}>{m.label}</div>
                                                    ))}
                                                </div>
                                                <div style={{ display:'flex', gap:'1.25rem', justifyContent:'center', marginTop:'0.75rem' }}>
                                                    <span style={{ fontSize:'0.6875rem', color:'#64748b', display:'flex', alignItems:'center', gap:'0.375rem' }}><span style={{ width:'10px', height:'10px', background:'linear-gradient(#2563eb,#7c3aed)', borderRadius:'2px', display:'inline-block' }}></span>Created</span>
                                                    <span style={{ fontSize:'0.6875rem', color:'#64748b', display:'flex', alignItems:'center', gap:'0.375rem' }}><span style={{ width:'10px', height:'10px', background:'#10b981', borderRadius:'2px', display:'inline-block' }}></span>Converted</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                            </div>
                            );
                        })()}

                    </div>
                );
            })()}


            {activeTab === 'salesManager' && (isAdmin || isManager) && (
                <div className="tab-page">
                    <div className="tab-page-header">
                        <div className="tab-page-header-bar"></div>
                        <div>
                            <h2>Sales Manager</h2>
                            <p>Set rep quotas by territory — territory totals roll up automatically</p>
                        </div>
                    </div>
                    {(() => {
                        const allUsers = (settings.users || []).filter(u => u.name && u.userType !== 'ReadOnly');
                        const quarters = ['Q1','Q2','Q3','Q4'];
                        const quotaMode = allUsers.find(u => u.quotaType)?.quotaType || 'annual';

                        // ── helpers ──────────────────────────────────────────
                        const getRepTotal = (u) => {
                            if ((u.quotaType || quotaMode) === 'annual') return u.annualQuota || 0;
                            return (u.q1Quota||0)+(u.q2Quota||0)+(u.q3Quota||0)+(u.q4Quota||0);
                        };
                        const getRepQ = (u, q) => u[q.toLowerCase()+'Quota'] || 0;

                        const updateRepField = (userId, field, value) => {
                            setSettings(prev => ({
                                ...prev,
                                users: (prev.users||[]).map(u => u.id === userId ? { ...u, [field]: value } : u)
                            }));
                        };

                        const setAllQuotaMode = (mode) => {
                            setSettings(prev => ({
                                ...prev,
                                users: (prev.users||[]).map(u => u.userType !== 'ReadOnly' ? { ...u, quotaType: mode } : u)
                            }));
                        };

                        // Won revenue per rep name
                        const repWon = {};
                        opportunities.filter(o => o.stage === 'Closed Won').forEach(o => {
                            const rep = o.salesRep || o.assignedTo;
                            if (rep) repWon[rep] = (repWon[rep] || 0) + (o.arr||0) + (o.implementationCost||0);
                        });

                        const calcCommission = (revenue, quota) => {
                            if (quota <= 0 || revenue <= 0) return 0;
                            let commission = 0;
                            [...((settings.quotaData||{}).commissionTiers||[])].sort((a,b)=>a.minPercent-b.minPercent).forEach(tier => {
                                const mn = (tier.minPercent/100)*quota;
                                const mx = tier.maxPercent >= 999 ? Infinity : (tier.maxPercent/100)*quota;
                                if (revenue > mn) commission += (Math.min(revenue,mx)-mn)*(tier.rate/100);
                            });
                            return commission;
                        };

                        // ── territory grouping ────────────────────────────────
                        // Separate reps without a territory — they need to be assigned first
                        const assignedUsers  = allUsers.filter(u => u.territory && u.territory.trim());
                        const unassignedReps = allUsers.filter(u => !u.territory || !u.territory.trim());

                        // All unique territories
                        const territories = [...new Set(assignedUsers.map(u => u.territory.trim()))].sort();

                        // For each territory: reps who belong to it, and the manager(s) covering it
                        // Manager's territory field can be comma-separated list: "East, Central"
                        const getTerritoryReps = (terr) =>
                            assignedUsers.filter(u => u.territory.trim() === terr && u.userType !== 'Manager' && u.userType !== 'Admin');

                        // Rollup totals for a territory (reps only — not managers)
                        const territoryRollup = (terr) => {
                            const reps = getTerritoryReps(terr);
                            const quota = reps.reduce((s,u) => s + getRepTotal(u), 0);
                            const qByQ  = quarters.reduce((acc,q) => { acc[q] = reps.reduce((s,u)=>s+getRepQ(u,q),0); return acc; }, {});
                            const won   = reps.reduce((s,u) => s + (repWon[u.name]||0), 0);
                            const comm  = reps.reduce((s,u) => s + calcCommission(repWon[u.name]||0, getRepTotal(u)), 0);
                            return { quota, qByQ, won, comm, repCount: reps.length };
                        };

                        // Grand total across all territories
                        const grandTotal = territories.reduce((acc, terr) => {
                            const r = territoryRollup(terr);
                            acc.quota += r.quota;
                            acc.won   += r.won;
                            acc.comm  += r.comm;
                            quarters.forEach(q => { acc.qByQ[q] = (acc.qByQ[q]||0) + r.qByQ[q]; });
                            return acc;
                        }, { quota:0, won:0, comm:0, qByQ:{} });

                        // ── styles ───────────────────────────────────────────
                        const smCard   = { background:'#fff', borderRadius:'12px', boxShadow:'0 1px 3px rgba(0,0,0,0.08)', border:'1px solid #e2e8f0', marginBottom:'1.5rem', overflow:'hidden' };
                        const smHdr    = { padding:'1rem 1.5rem', borderBottom:'1px solid #f1f5f9', display:'flex', alignItems:'center', justifyContent:'space-between' };
                        const smTitle  = { fontSize:'0.6875rem', fontWeight:'800', color:'#475569', textTransform:'uppercase', letterSpacing:'0.08em' };
                        const inputSt  = { width:'100%', padding:'0.4rem 0.5rem', border:'1.5px solid #e2e8f0', borderRadius:'8px', fontSize:'0.8125rem', fontWeight:'600', fontFamily:'inherit', background:'#fafbfc', outline:'none', textAlign:'right' };
                        const thSt     = (align='right') => ({ padding:'0.75rem 0.75rem', textAlign:align, fontSize:'0.625rem', fontWeight:'700', color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.04em', whiteSpace:'nowrap' });
                        const attColor = (pct) => pct >= 100 ? '#10b981' : pct >= 75 ? '#f59e0b' : '#ef4444';

                        // Territory header row style
                        const terrHdrStyle = { background:'linear-gradient(135deg,#1e293b,#334155)', color:'#fff' };

                        return (
                            <>
                            {/* ── UNASSIGNED WARNING ──────────────────────── */}
                            {unassignedReps.length > 0 && (
                                <div style={{ background:'#fffbeb', border:'1.5px solid #fbbf24', borderRadius:'10px', padding:'0.875rem 1.25rem', marginBottom:'1.25rem', display:'flex', alignItems:'center', gap:'0.875rem' }}>
                                    <span style={{ fontSize:'1.25rem' }}>⚠️</span>
                                    <div style={{ flex:1 }}>
                                        <div style={{ fontWeight:'700', color:'#92400e', fontSize:'0.8125rem' }}>
                                            {unassignedReps.length} user{unassignedReps.length > 1 ? 's have' : ' has'} no territory assigned — their quotas are excluded from rollups:
                                            {' '}<strong>{unassignedReps.map(u=>u.name).join(', ')}</strong>
                                        </div>
                                        <div style={{ fontSize:'0.75rem', color:'#b45309', marginTop:'0.25rem' }}>
                                            Assign a territory in <strong>Settings → Manage Users</strong> to include them in territory totals.
                                        </div>
                                    </div>
                                    <button onClick={() => setActiveTab('settings')}
                                        style={{ padding:'0.4rem 0.875rem', background:'#f59e0b', color:'#fff', border:'none', borderRadius:'6px', fontWeight:'700', fontSize:'0.75rem', cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap' }}>
                                        Go to Settings
                                    </button>
                                </div>
                            )}

                            {/* ── QUOTA BOARD ─────────────────────────────── */}
                            <div style={smCard}>
                                <div style={smHdr}>
                                    <div>
                                        <div style={smTitle}>Territory Quota Board</div>
                                        <div style={{ fontSize:'0.75rem', color:'#94a3b8', marginTop:'0.125rem' }}>
                                            Set rep quotas below — territory totals roll up automatically and become each territory manager's quota
                                        </div>
                                    </div>
                                    {/* Annual / Quarterly toggle */}
                                    <div style={{ display:'flex', background:'#f1f5f9', borderRadius:'8px', padding:'2px', gap:'2px' }}>
                                        {['annual','quarterly'].map(t => (
                                            <button key={t} onClick={() => setAllQuotaMode(t)} style={{
                                                padding:'0.3rem 0.875rem', borderRadius:'6px', border:'none', cursor:'pointer',
                                                fontFamily:'inherit', fontSize:'0.6875rem', fontWeight:'700', transition:'all 0.15s',
                                                background: quotaMode === t ? '#fff' : 'transparent',
                                                color:      quotaMode === t ? '#1e293b' : '#64748b',
                                                boxShadow:  quotaMode === t ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                            }}>{t === 'annual' ? '📅 Annual' : '📊 Quarterly'}</button>
                                        ))}
                                    </div>
                                </div>

                                {allUsers.length === 0 ? (
                                    <div style={{ padding:'2rem', textAlign:'center', color:'#94a3b8' }}>
                                        No users configured yet. Add users in <strong>Settings → Manage Users</strong>.
                                    </div>
                                ) : territories.length === 0 ? (
                                    <div style={{ padding:'2rem', textAlign:'center', color:'#94a3b8' }}>
                                        No territories assigned yet. Go to <strong>Settings → Manage Users</strong> and set a territory on each user.
                                    </div>
                                ) : (
                                <div style={{ overflowX:'auto' }}>
                                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.8125rem' }}>
                                    <thead>
                                        <tr style={{ background:'#f8fafc', borderBottom:'2px solid #e2e8f0' }}>
                                            <th style={thSt('left')}>Rep / Territory</th>
                                            <th style={thSt('left')}>Role</th>
                                            <th style={thSt('left')}>Team</th>
                                            {quotaMode === 'annual' ? (
                                                <th style={thSt()}>Annual Quota</th>
                                            ) : quarters.map(q => <th key={q} style={thSt()}>{q} Quota</th>)}
                                            <th style={thSt()}>Territory Total</th>
                                            <th style={thSt()}>Won Revenue</th>
                                            <th style={thSt()}>Attainment</th>
                                            <th style={thSt()}>Commission</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {territories.map(terr => {
                                            const reps    = getTerritoryReps(terr);
                                            const rollup  = territoryRollup(terr);
                                            const terrAtt = rollup.quota > 0 ? rollup.won / rollup.quota * 100 : null;

                                            // Managers who list this territory (comma-separated support)
                                            const terrManagers = allUsers.filter(u =>
                                                (u.userType === 'Manager' || u.userType === 'Admin') &&
                                                (u.territory||'').split(',').map(t=>t.trim()).includes(terr)
                                            );

                                            return (
                                                <React.Fragment key={terr}>
                                                    {/* Territory header row */}
                                                    <tr style={terrHdrStyle}>
                                                        <td colSpan={quotaMode === 'annual' ? 5 : 8} style={{ padding:'0.625rem 1.25rem' }}>
                                                            <div style={{ display:'flex', alignItems:'center', gap:'0.75rem' }}>
                                                                <span style={{ fontSize:'0.9375rem', fontWeight:'800', letterSpacing:'0.02em' }}>📍 {terr}</span>
                                                                {terrManagers.length > 0 && (
                                                                    <span style={{ fontSize:'0.6875rem', color:'rgba(255,255,255,0.6)', fontStyle:'italic' }}>
                                                                        mgr: {terrManagers.map(u=>u.name).join(', ')}
                                                                    </span>
                                                                )}
                                                                <span style={{ marginLeft:'auto', fontSize:'0.6875rem', color:'rgba(255,255,255,0.7)' }}>
                                                                    {rollup.repCount} rep{rollup.repCount !== 1 ? 's' : ''}
                                                                </span>
                                                            </div>
                                                        </td>
                                                        {quotaMode !== 'annual' && (
                                                            <>
                                                                <td style={{ padding:'0.625rem 0.75rem', textAlign:'right', color:'rgba(255,255,255,0.9)', fontWeight:'700' }}>${rollup.won.toLocaleString()}</td>
                                                                <td style={{ padding:'0.625rem 0.75rem', textAlign:'right', fontWeight:'800', color: terrAtt===null ? 'rgba(255,255,255,0.4)' : attColor(terrAtt) }}>
                                                                    {terrAtt !== null ? terrAtt.toFixed(1)+'%' : '—'}
                                                                </td>
                                                                <td style={{ padding:'0.625rem 0.75rem', textAlign:'right', color:'#c4b5fd', fontWeight:'700' }}>${Math.round(rollup.comm).toLocaleString()}</td>
                                                            </>
                                                        )}
                                                    </tr>

                                                    {/* Individual rep rows */}
                                                    {reps.map((u, ri) => {
                                                        const repTotal = getRepTotal(u);
                                                        const won      = repWon[u.name] || 0;
                                                        const att      = repTotal > 0 ? won / repTotal * 100 : null;
                                                        const comm     = calcCommission(won, repTotal);
                                                        return (
                                                            <tr key={u.id} style={{ borderBottom:'1px solid #f1f5f9', background: ri % 2 === 0 ? '#fff' : '#fafafa' }}>
                                                                <td style={{ padding:'0.625rem 1.25rem 0.625rem 2rem', fontWeight:'600', color:'#1e293b', whiteSpace:'nowrap' }}>
                                                                    <span style={{ color:'#cbd5e1', marginRight:'0.5rem', fontSize:'0.75rem' }}>└</span>{u.name}
                                                                </td>
                                                                <td style={{ padding:'0.625rem 0.75rem' }}>
                                                                    <span style={{ background:'#f1f5f9', color:'#475569', padding:'0.125rem 0.5rem', borderRadius:'999px', fontSize:'0.625rem', fontWeight:'700' }}>Rep</span>
                                                                </td>
                                                                <td style={{ padding:'0.625rem 0.75rem', color:'#64748b', fontSize:'0.75rem' }}>{u.team || '—'}</td>

                                                                {/* Quota input(s) */}
                                                                {quotaMode === 'annual' ? (
                                                                    <td style={{ padding:'0.375rem 0.75rem', minWidth:'130px' }}>
                                                                        <input type="number" value={u.annualQuota||''} placeholder="0"
                                                                            onChange={e => updateRepField(u.id, 'annualQuota', parseFloat(e.target.value)||0)}
                                                                            style={inputSt}
                                                                            onFocus={e=>e.target.style.borderColor='#2563eb'}
                                                                            onBlur={e=>e.target.style.borderColor='#e2e8f0'} />
                                                                    </td>
                                                                ) : quarters.map(q => (
                                                                    <td key={q} style={{ padding:'0.375rem 0.75rem', minWidth:'110px' }}>
                                                                        <input type="number" value={u[q.toLowerCase()+'Quota']||''} placeholder="0"
                                                                            onChange={e => updateRepField(u.id, q.toLowerCase()+'Quota', parseFloat(e.target.value)||0)}
                                                                            style={inputSt}
                                                                            onFocus={e=>e.target.style.borderColor='#2563eb'}
                                                                            onBlur={e=>e.target.style.borderColor='#e2e8f0'} />
                                                                    </td>
                                                                ))}

                                                                {/* Territory total cell — only shown in annual mode (quarterly mode shows it in header) */}
                                                                {quotaMode === 'annual' ? (
                                                                    <td style={{ padding:'0.625rem 0.75rem', textAlign:'right', color:'#94a3b8', fontSize:'0.75rem' }}>—</td>
                                                                ) : null}

                                                                <td style={{ padding:'0.625rem 0.75rem', textAlign:'right', fontWeight:'700', color:'#10b981', whiteSpace:'nowrap' }}>${won.toLocaleString()}</td>
                                                                <td style={{ padding:'0.625rem 0.75rem', textAlign:'right', whiteSpace:'nowrap' }}>
                                                                    {att !== null
                                                                        ? <span style={{ fontWeight:'800', color:attColor(att) }}>{att.toFixed(1)}%</span>
                                                                        : <span style={{ color:'#cbd5e1' }}>—</span>}
                                                                </td>
                                                                <td style={{ padding:'0.625rem 0.75rem', textAlign:'right', fontWeight:'700', color:'#7c3aed', whiteSpace:'nowrap' }}>
                                                                    {repTotal > 0 ? '$'+Math.round(comm).toLocaleString() : <span style={{ color:'#cbd5e1' }}>—</span>}
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}

                                                    {/* Territory subtotal row */}
                                                    <tr style={{ background:'#f0fdf4', borderBottom:'2px solid #e2e8f0' }}>
                                                        <td style={{ padding:'0.625rem 1.25rem', fontWeight:'800', color:'#065f46', fontSize:'0.8125rem' }}>
                                                            {terr} Total
                                                        </td>
                                                        <td colSpan={2} style={{ padding:'0.625rem 0.75rem' }}></td>
                                                        {quotaMode === 'annual' ? (
                                                            <td style={{ padding:'0.625rem 0.75rem', textAlign:'right', fontWeight:'800', color:'#065f46', fontSize:'0.9375rem' }}>
                                                                ${rollup.quota.toLocaleString()}
                                                            </td>
                                                        ) : quarters.map(q => (
                                                            <td key={q} style={{ padding:'0.625rem 0.75rem', textAlign:'right', fontWeight:'700', color:'#065f46' }}>
                                                                ${rollup.qByQ[q].toLocaleString()}
                                                            </td>
                                                        ))}
                                                        <td style={{ padding:'0.625rem 0.75rem', textAlign:'right', fontWeight:'800', color:'#065f46', fontSize: quotaMode==='annual' ? '0.9375rem' : '0.8125rem' }}>
                                                            ${rollup.quota.toLocaleString()} <span style={{ fontSize:'0.625rem', color:'#6ee7b7', fontWeight:'600' }}>← mgr quota</span>
                                                        </td>
                                                        <td style={{ padding:'0.625rem 0.75rem', textAlign:'right', fontWeight:'800', color:'#10b981' }}>${rollup.won.toLocaleString()}</td>
                                                        <td style={{ padding:'0.625rem 0.75rem', textAlign:'right', fontWeight:'800' }}>
                                                            {terrAtt !== null
                                                                ? <span style={{ color:attColor(terrAtt) }}>{terrAtt.toFixed(1)}%</span>
                                                                : <span style={{ color:'#cbd5e1' }}>—</span>}
                                                        </td>
                                                        <td style={{ padding:'0.625rem 0.75rem', textAlign:'right', fontWeight:'700', color:'#7c3aed' }}>${Math.round(rollup.comm).toLocaleString()}</td>
                                                    </tr>
                                                </React.Fragment>
                                            );
                                        })}

                                        {/* Grand total row */}
                                        {territories.length > 1 && (() => {
                                            const grandAtt = grandTotal.quota > 0 ? grandTotal.won / grandTotal.quota * 100 : null;
                                            return (
                                                <tr style={{ background:'linear-gradient(135deg,#1e293b,#334155)', color:'#fff' }}>
                                                    <td style={{ padding:'0.875rem 1.25rem', fontWeight:'800', fontSize:'0.875rem' }}>🏢 Org Total</td>
                                                    <td colSpan={2} style={{ padding:'0.875rem 0.75rem' }}></td>
                                                    {quotaMode === 'annual' ? (
                                                        <td style={{ padding:'0.875rem 0.75rem', textAlign:'right', fontWeight:'800', fontSize:'1rem' }}>${grandTotal.quota.toLocaleString()}</td>
                                                    ) : quarters.map(q => (
                                                        <td key={q} style={{ padding:'0.875rem 0.75rem', textAlign:'right', fontWeight:'700' }}>${(grandTotal.qByQ[q]||0).toLocaleString()}</td>
                                                    ))}
                                                    <td style={{ padding:'0.875rem 0.75rem', textAlign:'right', fontWeight:'800', fontSize:'1rem' }}>${grandTotal.quota.toLocaleString()}</td>
                                                    <td style={{ padding:'0.875rem 0.75rem', textAlign:'right', fontWeight:'800', color:'#6ee7b7' }}>${grandTotal.won.toLocaleString()}</td>
                                                    <td style={{ padding:'0.875rem 0.75rem', textAlign:'right', fontWeight:'800' }}>
                                                        {grandAtt !== null
                                                            ? <span style={{ color:attColor(grandAtt) }}>{grandAtt.toFixed(1)}%</span>
                                                            : <span style={{ color:'rgba(255,255,255,0.3)' }}>—</span>}
                                                    </td>
                                                    <td style={{ padding:'0.875rem 0.75rem', textAlign:'right', fontWeight:'700', color:'#c4b5fd' }}>${Math.round(grandTotal.comm).toLocaleString()}</td>
                                                </tr>
                                            );
                                        })()}
                                    </tbody>
                                </table>
                                </div>
                                )}
                            </div>

                            {/* ── COMMISSION PLAN + PREVIEW ─────────────── */}
                            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1.5rem' }}>
                                <div style={smCard}>
                                    <div style={smHdr}>
                                        <div>
                                            <div style={smTitle}>Commission Plan</div>
                                            <div style={{ fontSize:'0.75rem', color:'#94a3b8', marginTop:'0.125rem' }}>Tiered rates applied to all reps based on quota attainment %</div>
                                        </div>
                                    </div>
                                    <div style={{ padding:'1.25rem 1.5rem' }}>
                                        {((settings.quotaData||{}).commissionTiers||[]).map((tier, idx) => (
                                            <div key={idx} style={{ display:'flex', gap:'0.5rem', marginBottom:'0.625rem', alignItems:'center', padding:'0.5rem 0.75rem', background:'#f8fafc', borderRadius:'10px', border:'1px solid #f1f3f5' }}>
                                                <input type="number" value={tier.minPercent}
                                                    onChange={e => { const t=[...(settings.quotaData||{}).commissionTiers||[]]; t[idx]={...t[idx],minPercent:parseFloat(e.target.value)||0}; setSettings(prev=>({...prev,quotaData:{...prev.quotaData,commissionTiers:t}})); }}
                                                    style={{ width:'60px', padding:'0.4rem', border:'1.5px solid #e2e8f0', borderRadius:'8px', fontSize:'0.8125rem', textAlign:'center', fontFamily:'inherit', background:'#fff', outline:'none' }}
                                                    onFocus={e=>e.target.style.borderColor='#2563eb'} onBlur={e=>e.target.style.borderColor='#e2e8f0'} />
                                                <span style={{ color:'#94a3b8', fontSize:'0.6875rem', fontWeight:'600', flexShrink:0 }}>% to</span>
                                                <input type="number" value={tier.maxPercent >= 999 ? '' : tier.maxPercent} placeholder="∞"
                                                    onChange={e => { const t=[...(settings.quotaData||{}).commissionTiers||[]]; t[idx]={...t[idx],maxPercent:parseFloat(e.target.value)||999}; setSettings(prev=>({...prev,quotaData:{...prev.quotaData,commissionTiers:t}})); }}
                                                    style={{ width:'60px', padding:'0.4rem', border:'1.5px solid #e2e8f0', borderRadius:'8px', fontSize:'0.8125rem', textAlign:'center', fontFamily:'inherit', background:'#fff', outline:'none' }}
                                                    onFocus={e=>e.target.style.borderColor='#2563eb'} onBlur={e=>e.target.style.borderColor='#e2e8f0'} />
                                                <span style={{ color:'#94a3b8', fontSize:'0.6875rem', fontWeight:'600', flexShrink:0 }}>% →</span>
                                                <input type="number" value={tier.rate}
                                                    onChange={e => { const t=[...(settings.quotaData||{}).commissionTiers||[]]; t[idx]={...t[idx],rate:parseFloat(e.target.value)||0}; setSettings(prev=>({...prev,quotaData:{...prev.quotaData,commissionTiers:t}})); }}
                                                    style={{ width:'60px', padding:'0.4rem', border:'1.5px solid #e2e8f0', borderRadius:'8px', fontSize:'0.8125rem', textAlign:'center', fontFamily:'inherit', background:'#fff', outline:'none' }}
                                                    onFocus={e=>e.target.style.borderColor='#2563eb'} onBlur={e=>e.target.style.borderColor='#e2e8f0'} />
                                                <span style={{ color:'#94a3b8', fontSize:'0.6875rem', fontWeight:'600', flexShrink:0 }}>% rate</span>
                                                {((settings.quotaData||{}).commissionTiers||[]).length > 1 && (
                                                    <button onClick={() => setSettings(prev=>({...prev,quotaData:{...prev.quotaData,commissionTiers:(prev.quotaData||{}).commissionTiers.filter((_,i)=>i!==idx)}}))}
                                                        style={{ background:'none', border:'none', color:'#ef4444', cursor:'pointer', fontSize:'1.125rem', padding:'0 0.25rem', opacity:0.6, marginLeft:'auto' }}
                                                        onMouseEnter={e=>e.target.style.opacity='1'} onMouseLeave={e=>e.target.style.opacity='0.6'}>×</button>
                                                )}
                                            </div>
                                        ))}
                                        <button onClick={() => setSettings(prev=>({...prev,quotaData:{...prev.quotaData,commissionTiers:[...((prev.quotaData||{}).commissionTiers||[]),{minPercent:0,maxPercent:999,rate:0}]}}))}
                                            style={{ marginTop:'0.375rem', background:'#f8fafc', border:'1.5px dashed #cbd5e1', borderRadius:'10px', padding:'0.5rem 1rem', cursor:'pointer', fontSize:'0.75rem', fontWeight:'700', color:'#475569', fontFamily:'inherit', width:'100%' }}
                                            onMouseEnter={e=>{e.target.style.background='#f1f5f9';e.target.style.borderColor='#94a3b8';}}
                                            onMouseLeave={e=>{e.target.style.background='#f8fafc';e.target.style.borderColor='#cbd5e1';}}>
                                            + Add Tier
                                        </button>
                                    </div>
                                </div>

                                {/* Commission Preview by rep */}
                                <div style={smCard}>
                                    <div style={smHdr}><div style={smTitle}>Commission Preview by Rep</div></div>
                                    <div style={{ padding:'1.25rem 1.5rem' }}>
                                        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.8125rem' }}>
                                            <thead>
                                                <tr style={{ borderBottom:'2px solid #e2e8f0' }}>
                                                    <th style={{ textAlign:'left', padding:'0.5rem 0', fontSize:'0.625rem', fontWeight:'700', color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.04em' }}>Rep</th>
                                                    <th style={{ textAlign:'left', padding:'0.5rem 0.375rem', fontSize:'0.625rem', fontWeight:'700', color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.04em' }}>Territory</th>
                                                    {[50,75,100,125,150].map(p => (
                                                        <th key={p} style={{ textAlign:'right', padding:'0.5rem 0.375rem', fontSize:'0.625rem', fontWeight:'700', color: p===100 ? '#2563eb' : '#94a3b8', textTransform:'uppercase', letterSpacing:'0.04em' }}>{p}%</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {assignedUsers.filter(u => u.userType !== 'Manager' && u.userType !== 'Admin' && getRepTotal(u) > 0)
                                                    .sort((a,b) => (a.territory||'').localeCompare(b.territory||''))
                                                    .map((u, i, arr) => {
                                                        const tq = getRepTotal(u);
                                                        const showTerrHeader = i === 0 || u.territory !== arr[i-1].territory;
                                                        return (
                                                            <React.Fragment key={u.id}>
                                                                {showTerrHeader && (
                                                                    <tr>
                                                                        <td colSpan={7} style={{ padding:'0.5rem 0 0.25rem', fontSize:'0.625rem', fontWeight:'800', color:'#64748b', textTransform:'uppercase', letterSpacing:'0.08em', borderTop: i > 0 ? '1px solid #e2e8f0' : 'none' }}>
                                                                            📍 {u.territory}
                                                                        </td>
                                                                    </tr>
                                                                )}
                                                                <tr style={{ borderBottom:'1px solid #f8fafc' }}>
                                                                    <td style={{ padding:'0.375rem 0 0.375rem 0.75rem', fontWeight:'600', color:'#1e293b' }}>{u.name}</td>
                                                                    <td style={{ padding:'0.375rem 0.375rem', color:'#94a3b8', fontSize:'0.75rem' }}>{u.territory}</td>
                                                                    {[50,75,100,125,150].map(p => {
                                                                        const comm = calcCommission((p/100)*tq, tq);
                                                                        return (
                                                                            <td key={p} style={{ textAlign:'right', padding:'0.375rem 0.375rem', fontWeight: p===100 ? '800' : '500', color: p===100 ? '#2563eb' : p>100 ? '#10b981' : '#475569' }}>
                                                                                ${Math.round(comm).toLocaleString()}
                                                                            </td>
                                                                        );
                                                                    })}
                                                                </tr>
                                                            </React.Fragment>
                                                        );
                                                    })}
                                                {assignedUsers.every(u => getRepTotal(u) === 0) && (
                                                    <tr><td colSpan={7} style={{ padding:'1.5rem 0', color:'#94a3b8', textAlign:'center' }}>Set quotas to see commission projections.</td></tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                            </>
                        );
                    })()}
                </div>
            )}


            {activeTab === 'settings' && isAdmin && (
                <div className="tab-page">
                    <div className="tab-page-header">
                        <div className="tab-page-header-bar"></div>
                        <div>
                            <h2>Settings</h2>
                            <p>Manage users, configuration, and system preferences</p>
                        </div>
                    </div>
                <>
                    {settingsView === 'menu' && (
                        <div className="table-container">
                            <div className="table-header">
                                <h2>SETTINGS</h2>
                            </div>
                            <div style={{ padding: '1.5rem' }}>
                                <div style={{ display: 'grid', gap: '1rem', maxWidth: '600px' }}>
                                    {[
                                        { view: 'users', icon: '👥', title: 'Manage Users', desc: 'Add, edit, and manage team members, roles, and permissions' },
                                        { view: 'pipelines', icon: '🔀', title: 'Pipelines', desc: 'Create and manage multiple sales pipelines (new business, renewals, product lines)' },
                                        { view: 'fiscal-year', icon: '📅', title: 'Fiscal Year Settings', desc: 'Configure fiscal year start month and quarter calculations' },
                                        { view: 'logo', icon: '🖼️', title: 'Company Logo', desc: 'Upload and manage your company logo' },
                                        { view: 'pain-points', icon: '⚠️', title: 'Pain Points Library', desc: 'Create and manage customer pain points for opportunities' },
                                        { view: 'vertical-markets', icon: '🏢', title: 'Vertical Markets', desc: 'Create and manage industry vertical markets for accounts' },
                                        { view: 'funnel-stages', icon: '🔻', title: 'Sales Funnel Stages', desc: 'Configure funnel stages and win probability weightings' },
                                        { view: 'kpi-settings', icon: '📊', title: 'KPI Settings', desc: 'Configure KPIs, set tolerance thresholds, and assign indicator colors' },
                                        { view: 'data-storage', icon: '🗄️', title: 'Data Storage', desc: 'Configure where your pipeline data is stored and managed' },
                                        { view: 'data-management', icon: '💾', title: 'Data Management', desc: 'Export, import, and back up all your pipeline data' },
                                        { view: 'audit-log', icon: '📋', title: 'Audit Log', desc: 'See who changed what and when across all records' },
                                        { view: 'field-visibility', icon: '🔒', title: 'Field Visibility', desc: 'Control which roles can see sensitive fields like ARR, cost, and notes' }
                                    ].map(item => (
                                        <div key={item.view}
                                            onClick={() => setSettingsView(item.view)}
                                            style={{ padding: '1.5rem', border: '1px solid #d1d5db', borderRadius: '8px', background: '#ffffff', cursor: 'pointer', transition: 'all 0.2s' }}
                                            onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)'; e.currentTarget.style.borderColor = '#2563eb'; }}
                                            onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = '#e2e8f0'; }}
                                        >
                                            <h3 style={{ fontSize: '1.125rem', fontWeight: '700', marginBottom: '0.5rem' }}>{item.icon} {item.title}</h3>
                                            <p style={{ color: '#64748b', fontSize: '0.875rem' }}>{item.desc}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}


                    {settingsView === 'field-visibility' && (() => {
                        const roles = ['Admin', 'Manager', 'User', 'ReadOnly'];
                        const roleLabels = { Admin: 'Admin', Manager: 'Manager', User: 'Sales Rep', ReadOnly: 'Read-Only' };
                        const fields = [
                            { key: 'arr',           label: 'ARR ($)',              desc: 'Revenue amount on the deal' },
                            { key: 'implCost',      label: 'Implementation Cost',  desc: 'Implementation / services cost' },
                            { key: 'probability',   label: 'Probability %',        desc: 'Close probability (stage default or rep override)' },
                            { key: 'weightedValue', label: 'Weighted Value',        desc: 'Calculated weighted pipeline value' },
                            { key: 'dealAge',       label: 'Deal Age',             desc: 'Days since opportunity was created' },
                            { key: 'timeInStage',   label: 'Time in Stage',        desc: 'Days in current stage' },
                            { key: 'activities',    label: 'Activities',           desc: 'Activity count and recency' },
                            { key: 'notes',         label: 'Notes / Description',  desc: 'Deal background and context notes' },
                            { key: 'nextSteps',     label: 'Next Steps',           desc: 'Next action items' },
                            { key: 'closeDate',     label: 'Close Date',           desc: 'Forecasted close date' },
                        ];
                        const fv = settings.fieldVisibility || {};
                        const toggle = (fieldKey, role) => {
                            const current = (fv[fieldKey] && fv[fieldKey][role] !== undefined) ? fv[fieldKey][role] : true;
                            const updated = {
                                ...fv,
                                [fieldKey]: { ...(fv[fieldKey] || { Admin: true, Manager: true, User: true, ReadOnly: true }), [role]: !current }
                            };
                            // Always keep Admin visible (Admin always sees everything)
                            if (fieldKey && updated[fieldKey]) updated[fieldKey].Admin = true;
                            setSettings(s => ({ ...s, fieldVisibility: updated }));
                        };
                        const isVisible = (fieldKey, role) => {
                            if (role === 'Admin') return true; // Admin always sees all
                            return !fv[fieldKey] || fv[fieldKey][role] !== false;
                        };
                        return (
                            <div className="table-container">
                                <div className="table-header">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <button className="btn btn-secondary" onClick={() => setSettingsView('menu')}>← Back</button>
                                        <h2>FIELD VISIBILITY</h2>
                                    </div>
                                    <span style={{ fontSize: '0.8125rem', color: '#64748b' }}>Admins always see all fields</span>
                                </div>
                                <div style={{ padding: '1.5rem' }}>
                                    <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '1.25rem', fontSize: '0.8125rem', color: '#1e40af' }}>
                                        ℹ️ Toggle a field off for a role to hide it from the pipeline table and the opportunity form for users with that role.
                                    </div>
                                    <div style={{ overflowX: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                                            <thead>
                                                <tr style={{ background: '#f8fafc' }}>
                                                    <th style={{ textAlign: 'left', padding: '0.625rem 0.875rem', fontWeight: '700', color: '#64748b', fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '2px solid #e2e8f0', width: '220px' }}>Field</th>
                                                    {roles.map(role => (
                                                        <th key={role} style={{ textAlign: 'center', padding: '0.625rem 1rem', fontWeight: '700', color: '#64748b', fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '2px solid #e2e8f0' }}>
                                                            {roleLabels[role]}
                                                            {role === 'Admin' && <div style={{ fontSize: '0.5625rem', color: '#94a3b8', fontWeight: '400', marginTop: '0.125rem', textTransform: 'none' }}>always on</div>}
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {fields.map((field, i) => (
                                                    <tr key={field.key} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                                                        <td style={{ padding: '0.75rem 0.875rem' }}>
                                                            <div style={{ fontWeight: '600', color: '#1e293b' }}>{field.label}</div>
                                                            <div style={{ fontSize: '0.6875rem', color: '#94a3b8', marginTop: '0.125rem' }}>{field.desc}</div>
                                                        </td>
                                                        {roles.map(role => {
                                                            const visible = isVisible(field.key, role);
                                                            const locked = role === 'Admin';
                                                            return (
                                                                <td key={role} style={{ textAlign: 'center', padding: '0.75rem 1rem' }}>
                                                                    <button
                                                                        type="button"
                                                                        disabled={locked}
                                                                        onClick={() => !locked && toggle(field.key, role)}
                                                                        title={locked ? 'Admins always see all fields' : (visible ? 'Click to hide from ' + roleLabels[role] : 'Click to show to ' + roleLabels[role])}
                                                                        style={{
                                                                            width: '42px', height: '24px', borderRadius: '12px', border: 'none', cursor: locked ? 'not-allowed' : 'pointer',
                                                                            background: visible ? '#2563eb' : '#e2e8f0',
                                                                            position: 'relative', transition: 'background 0.2s', outline: 'none',
                                                                            opacity: locked ? 0.5 : 1
                                                                        }}>
                                                                        <span style={{
                                                                            position: 'absolute', top: '3px', left: visible ? '21px' : '3px',
                                                                            width: '18px', height: '18px', borderRadius: '50%', background: '#fff',
                                                                            transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                                                                        }} />
                                                                    </button>
                                                                </td>
                                                            );
                                                        })}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        );
                    })()}

                    {settingsView === 'audit-log' && (() => {
                        React.useEffect(() => {
                            setAuditLoading(true);
                            fetch('/.netlify/functions/audit-log')
                                .then(r => r.json())
                                .then(data => {
                                    const normalized = (data.entries || []).map(e => ({
                                        id:     e.id,
                                        ts:     e.timestamp,
                                        user:   e.userName || 'Unknown',
                                        action: e.action,
                                        entity: e.entityType,
                                        label:  e.entityName || '',
                                        detail: e.detail || '',
                                    }));
                                    setAuditEntries(normalized);
                                })
                                .catch(err => console.error('Failed to load audit log:', err))
                                .finally(() => setAuditLoading(false));
                        }, []);
                        const actionColor = { create: '#10b981', update: '#3b82f6', delete: '#ef4444' };
                        const actionLabel = { create: '+ Created', update: '✎ Updated', delete: '🗑 Deleted' };
                        const entityIcon = { opportunity: '🤝', account: '🏢', contact: '👤', task: '✅' };
                        const auditLog = auditEntries;
                        const filtered = auditLog.filter(e => {
                            if (auditEntityFilter !== 'all' && e.entity !== auditEntityFilter) return false;
                            if (auditActionFilter !== 'all' && e.action !== auditActionFilter) return false;
                            if (auditSearch) {
                                const q = auditSearch.toLowerCase();
                                return (e.label||'').toLowerCase().includes(q) || (e.detail||'').toLowerCase().includes(q) || (e.user||'').toLowerCase().includes(q);
                            }
                            return true;
                        });
                        return (
                            <div className="table-container">
                                <div className="table-header">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <button className="btn btn-secondary" onClick={() => setSettingsView('menu')}>← Back</button>
                                        <h2>AUDIT LOG</h2>
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                        <input value={auditSearch} onChange={e => setAuditSearch(e.target.value)} placeholder="Search…"
                                            style={{ padding: '0.375rem 0.75rem', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.8125rem', width: '160px' }} />
                                        <select value={auditEntityFilter} onChange={e => setAuditEntityFilter(e.target.value)}
                                            style={{ padding: '0.375rem 0.625rem', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.8125rem', background: '#fff' }}>
                                            <option value="all">All types</option>
                                            <option value="opportunity">Opportunities</option>
                                            <option value="account">Accounts</option>
                                            <option value="contact">Contacts</option>
                                            <option value="task">Tasks</option>
                                        </select>
                                        <select value={auditActionFilter} onChange={e => setAuditActionFilter(e.target.value)}
                                            style={{ padding: '0.375rem 0.625rem', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.8125rem', background: '#fff' }}>
                                            <option value="all">All actions</option>
                                            <option value="create">Created</option>
                                            <option value="update">Updated</option>
                                            <option value="delete">Deleted</option>
                                        </select>
                                        {auditLog.length > 0 && (
                                            <button className="btn btn-secondary" onClick={() => {
                                                const rows = [['Time','User','Action','Type','Record','Detail']];
                                                auditLog.forEach(e => rows.push([new Date(e.ts).toLocaleString(), e.user, e.action, e.entity, e.label, e.detail]));
                                                exportToCSV('audit-log-' + new Date().toISOString().slice(0,10) + '.csv',
                                                    rows[0], rows.slice(1));
                                            }}>📤 Export</button>
                                        )}
                                    </div>
                                </div>
                                <div style={{ padding: '1rem 1.5rem' }}>
                                    {auditLoading ? (
                                        <div style={{ textAlign: 'center', padding: '4rem 2rem', color: '#94a3b8' }}>
                                            <div style={{ fontSize: '1rem' }}>Loading audit log…</div>
                                        </div>
                                    ) : auditLog.length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: '4rem 2rem', color: '#94a3b8' }}>
                                            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📋</div>
                                            <div style={{ fontWeight: '600', fontSize: '1rem', marginBottom: '0.375rem', color: '#64748b' }}>No activity recorded yet</div>
                                            <div style={{ fontSize: '0.875rem' }}>Changes to opportunities, accounts, contacts, and tasks will appear here</div>
                                        </div>
                                    ) : filtered.length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8', fontSize: '0.875rem' }}>No entries match your filters</div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                                            {filtered.map((entry, i) => (
                                                <div key={entry.id} style={{ display: 'grid', gridTemplateColumns: '150px 110px 90px 100px 1fr auto', gap: '0.75rem', alignItems: 'center',
                                                    padding: '0.625rem 0.75rem', background: i % 2 === 0 ? '#fff' : '#f8fafc',
                                                    borderBottom: '1px solid #f1f5f9', fontSize: '0.8125rem' }}>
                                                    <div style={{ color: '#64748b', fontSize: '0.75rem' }}>
                                                        {new Date(entry.ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}{' '}
                                                        <span style={{ color: '#94a3b8' }}>{new Date(entry.ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
                                                    </div>
                                                    <div style={{ fontWeight: '600', color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.user}</div>
                                                    <div>
                                                        <span style={{ background: (actionColor[entry.action] || '#94a3b8') + '18', color: actionColor[entry.action] || '#94a3b8',
                                                            padding: '0.125rem 0.5rem', borderRadius: '999px', fontSize: '0.6875rem', fontWeight: '700', whiteSpace: 'nowrap' }}>
                                                            {actionLabel[entry.action] || entry.action}
                                                        </span>
                                                    </div>
                                                    <div style={{ color: '#64748b', fontSize: '0.75rem' }}>
                                                        {entityIcon[entry.entity] || '•'} {entry.entity}
                                                    </div>
                                                    <div style={{ fontWeight: '600', color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={entry.label}>{entry.label}</div>
                                                    <div style={{ color: '#64748b', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>{entry.detail}</div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                {auditLog.length > 0 && (
                                    <div style={{ padding: '0.625rem 1.5rem', borderTop: '1px solid #f1f5f9', color: '#94a3b8', fontSize: '0.75rem' }}>
                                        Showing {filtered.length} of {auditLog.length} entries (last 500 saved)
                                    </div>
                                )}
                            </div>
                        );
                    })()}

                    {settingsView === 'fiscal-year' && (
                        <div className="table-container">
                            <div className="table-header">
                                <button 
                                    className="btn btn-secondary" 
                                    onClick={() => setSettingsView('menu')}
                                    style={{ marginRight: '1rem' }}
                                >
                                    ← Back
                                </button>
                                <h2>FISCAL YEAR SETTINGS</h2>
                            </div>
                            <div style={{ padding: '1.5rem' }}>
                                <div className="form-group" style={{ maxWidth: '400px' }}>
                                    <label style={{ 
                                        color: '#64748b', 
                                        fontSize: '0.875rem', 
                                        fontWeight: '600', 
                                        marginBottom: '0.5rem',
                                        display: 'block'
                                    }}>
                                        Fiscal Year Start Month
                                    </label>
                                    <select
                                        value={settings.fiscalYearStart}
                                        onChange={(e) => handleUpdateFiscalYearStart(e.target.value)}
                                        style={{
                                            background: '#f8f9fa',
                                            border: '1px solid #e2e8f0',
                                            borderRadius: '6px',
                                            padding: '0.625rem 0.75rem',
                                            color: '#1e293b',
                                            fontSize: '0.875rem',
                                            width: '100%'
                                        }}
                                    >
                                        <option value="1">January</option>
                                        <option value="2">February</option>
                                        <option value="3">March</option>
                                        <option value="4">April</option>
                                        <option value="5">May</option>
                                        <option value="6">June</option>
                                        <option value="7">July</option>
                                        <option value="8">August</option>
                                        <option value="9">September</option>
                                        <option value="10">October</option>
                                        <option value="11">November</option>
                                        <option value="12">December</option>
                                    </select>
                                    <div style={{ 
                                        marginTop: '0.75rem', 
                                        color: '#64748b', 
                                        fontSize: '0.8125rem' 
                                    }}>
                                        Current setting: Fiscal year starts in <strong>{['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][settings.fiscalYearStart]}</strong>
                                        <br />
                                        Quarters are calculated as 3-month periods starting from this month.
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {settingsView === 'logo' && (
                        <div className="table-container">
                            <div className="table-header">
                                <button 
                                    className="btn btn-secondary" 
                                    onClick={() => setSettingsView('menu')}
                                    style={{ marginRight: '1rem' }}
                                >
                                    ← Back
                                </button>
                                <h2>COMPANY LOGO</h2>
                            </div>
                            <div style={{ padding: '1.5rem' }}>
                                <div style={{ maxWidth: '600px' }}>
                                    <div className="form-group">
                                        <label style={{ 
                                            color: '#64748b', 
                                            fontSize: '0.875rem', 
                                            fontWeight: '600', 
                                            marginBottom: '0.5rem',
                                            display: 'block'
                                        }}>
                                            Upload Logo
                                        </label>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            onChange={(e) => {
                                                const file = e.target.files[0];
                                                if (file) {
                                                    const reader = new FileReader();
                                                    reader.onloadend = () => {
                                                        setSettings({
                                                            ...settings,
                                                            logoUrl: reader.result
                                                        });
                                                    };
                                                    reader.readAsDataURL(file);
                                                }
                                            }}
                                            style={{
                                                background: '#f8f9fa',
                                                border: '1px solid #e2e8f0',
                                                borderRadius: '6px',
                                                padding: '0.625rem 0.75rem',
                                                color: '#1e293b',
                                                fontSize: '0.875rem',
                                                width: '100%',
                                                cursor: 'pointer'
                                            }}
                                        />
                                        <div style={{ 
                                            marginTop: '0.75rem', 
                                            color: '#64748b', 
                                            fontSize: '0.8125rem' 
                                        }}>
                                            Select an image file from your computer. The logo will appear in the top-left corner of the application.
                                        </div>
                                    </div>
                                    {settings.logoUrl && (
                                        <div style={{ marginTop: '1.5rem' }}>
                                            <div style={{ 
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                marginBottom: '0.75rem'
                                            }}>
                                                <div style={{ 
                                                    color: '#64748b', 
                                                    fontSize: '0.875rem', 
                                                    fontWeight: '600'
                                                }}>
                                                    Logo Preview:
                                                </div>
                                                <button
                                                    onClick={() => setSettings({
                                                        ...settings,
                                                        logoUrl: ''
                                                    })}
                                                    style={{
                                                        background: '#ef4444',
                                                        color: 'white',
                                                        border: 'none',
                                                        padding: '0.4rem 0.8rem',
                                                        borderRadius: '4px',
                                                        cursor: 'pointer',
                                                        fontSize: '0.8125rem',
                                                        fontWeight: '600'
                                                    }}
                                                >
                                                    Remove Logo
                                                </button>
                                            </div>
                                            <div style={{ 
                                                padding: '1.5rem',
                                                background: '#f1f3f5',
                                                borderRadius: '8px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                minHeight: '100px'
                                            }}>
                                                <img 
                                                    src={settings.logoUrl} 
                                                    alt="Logo Preview" 
                                                    style={{ 
                                                        maxHeight: '80px',
                                                        maxWidth: '100%',
                                                        objectFit: 'contain'
                                                    }}
                                                    onError={(e) => {
                                                        e.target.style.display = 'none';
                                                        e.target.nextSibling.style.display = 'block';
                                                    }}
                                                />
                                                <div style={{ 
                                                    display: 'none',
                                                    color: '#ef4444',
                                                    fontSize: '0.875rem'
                                                }}>
                                                    Failed to load image. Please try uploading again.
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {settingsView === 'users' && (
                        <div className="table-container">
                            <div className="table-header">
                                <button 
                                    className="btn btn-secondary" 
                                    onClick={() => setSettingsView('menu')}
                                    style={{ marginRight: '1rem' }}
                                >
                                    ← Back
                                </button>
                                <h2>MANAGE USERS</h2>
                                <button className="btn" onClick={handleAddUser}>+ ADD USER</button>
                            </div>
                            <div style={{ padding: '1.5rem' }}>
                                {settings.users.length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
                                        No users yet. Click "+ ADD USER" to create one.
                                    </div>
                                ) : (
                                    <div style={{ display: 'grid', gap: '1rem' }}>
                                        {settings.users.map(user => (
                                            <div key={user.id} style={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'flex-start',
                                                padding: '1rem',
                                                border: '1px solid #e2e8f0',
                                                borderRadius: '8px',
                                                background: '#ffffff'
                                            }}>
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ 
                                                        fontWeight: '700', 
                                                        fontSize: '1rem',
                                                        color: '#1e293b',
                                                        marginBottom: '0.25rem',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '0.5rem'
                                                    }}>
                                                        {user.name}
                                                        <span style={{
                                                            fontSize: '0.6875rem',
                                                            fontWeight: '600',
                                                            padding: '0.125rem 0.5rem',
                                                            borderRadius: '10px',
                                                            background: (user.userType || 'User') === 'Admin' ? '#eff6ff' : (user.userType || 'User') === 'Manager' ? '#ecfdf5' : (user.userType || 'User') === 'ReadOnly' ? '#f1f5f9' : '#f1f3f5',
                                                            color: (user.userType || 'User') === 'Admin' ? '#2563eb' : (user.userType || 'User') === 'Manager' ? '#059669' : (user.userType || 'User') === 'ReadOnly' ? '#94a3b8' : '#64748b',
                                                            border: (user.userType || 'User') === 'Admin' ? '1px solid #bfdbfe' : (user.userType || 'User') === 'Manager' ? '1px solid #a7f3d0' : '1px solid #e2e8f0',
                                                            textTransform: 'uppercase',
                                                            letterSpacing: '0.03em'
                                                        }}>
                                                            {(user.userType || 'User') === 'User' ? 'Sales Rep' : (user.userType || 'User') === 'ReadOnly' ? 'Read-Only' : user.userType || 'Sales Rep'}
                                                        </span>
                                                    </div>
                                                    <div style={{ 
                                                        color: '#64748b',
                                                        fontSize: '0.875rem'
                                                    }}>
                                                        {user.email}
                                                        {user.role && <span> • {user.role}</span>}
                                                    </div>
                                                    {(user.territory || user.team) && (
                                                        <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap', marginTop: '0.375rem' }}>
                                                            {user.territory && (
                                                                <span style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', padding: '0.1rem 0.5rem', borderRadius: '999px', fontSize: '0.625rem', fontWeight: '700' }}>
                                                                    📍 {user.territory}
                                                                </span>
                                                            )}
                                                            {user.team && (
                                                                <span style={{ background: '#ede9fe', color: '#5b21b6', border: '1px solid #ddd6fe', padding: '0.1rem 0.5rem', borderRadius: '999px', fontSize: '0.625rem', fontWeight: '700' }}>
                                                                    👥 {user.team}
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}
                                                    {(user.workPhone || user.cellPhone) && (
                                                        <div style={{ 
                                                            color: '#64748b',
                                                            fontSize: '0.8125rem',
                                                            marginTop: '0.25rem'
                                                        }}>
                                                            {user.workPhone && <span>Work: {user.workPhone}</span>}
                                                            {user.workPhone && user.cellPhone && <span> • </span>}
                                                            {user.cellPhone && <span>Cell: {user.cellPhone}</span>}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="action-buttons">
                                                    <button className="action-btn" onClick={() => handleEditUser(user)}>Edit</button>
                                                    <button className="action-btn delete" onClick={() => handleDeleteUser(user.id)}>Delete</button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {settingsView === 'pain-points' && (
                        <div className="table-container">
                            <div className="table-header">
                                <button 
                                    className="btn btn-secondary" 
                                    onClick={() => setSettingsView('menu')}
                                    style={{ marginRight: '1rem' }}
                                >
                                    ← Back
                                </button>
                                <h2>PAIN POINTS LIBRARY</h2>
                            </div>
                            <div style={{ padding: '1.5rem' }}>
                                <div style={{ marginBottom: '2rem' }}>
                                    <h3 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '1rem' }}>
                                        Add New Pain Point
                                    </h3>
                                    <div style={{ display: 'flex', gap: '0.5rem', maxWidth: '500px' }}>
                                        <input
                                            type="text"
                                            value={newPainPointInput}
                                            onChange={(e) => setNewPainPointInput(e.target.value)}
                                            placeholder="Enter new pain point..."
                                            style={{
                                                flex: 1,
                                                background: '#f8f9fa',
                                                border: '1px solid #e2e8f0',
                                                borderRadius: '6px',
                                                padding: '0.625rem 0.75rem',
                                                color: '#1e293b',
                                                fontSize: '0.875rem'
                                            }}
                                            onKeyPress={(e) => {
                                                if (e.key === 'Enter') {
                                                    const value = newPainPointInput.trim();
                                                    if (value && !settings.painPoints.includes(value)) {
                                                        setSettings({
                                                            ...settings,
                                                            painPoints: [...settings.painPoints, value]
                                                        });
                                                        setNewPainPointInput('');
                                                    }
                                                }
                                            }}
                                        />
                                        <button
                                            className="btn"
                                            onClick={() => {
                                                const value = newPainPointInput.trim();
                                                if (value) {
                                                    const currentPainPoints = settings.painPoints || [];
                                                    if (!currentPainPoints.includes(value)) {
                                                        setSettings({
                                                            ...settings,
                                                            painPoints: [...currentPainPoints, value]
                                                        });
                                                        setNewPainPointInput('');
                                                    }
                                                }
                                            }}
                                        >
                                            + ADD
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <h3 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '1rem' }}>
                                        Existing Pain Points ({(settings.painPoints || []).length})
                                    </h3>
                                    {(settings.painPoints || []).length === 0 ? (
                                        <div style={{ 
                                            textAlign: 'center', 
                                            padding: '3rem', 
                                            color: '#64748b',
                                            background: '#f1f3f5',
                                            borderRadius: '8px'
                                        }}>
                                            No pain points yet. Add one above to get started.
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                                            {settings.painPoints.map((painPoint, idx) => (
                                                <span key={idx} style={{
                                                    background: '#ffffff',
                                                    padding: '0.75rem 1rem',
                                                    borderRadius: '6px',
                                                    fontSize: '0.875rem',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '0.75rem',
                                                    border: '2px solid #e2e8f0',
                                                    boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)'
                                                }}>
                                                    <span style={{ fontWeight: '500' }}>{painPoint}</span>
                                                    <button
                                                        onClick={() => {
                                                            showConfirm(`Remove "${painPoint}" from pain points library?`, () => {
                                                                setSettings({
                                                                    ...settings,
                                                                    painPoints: settings.painPoints.filter((_, i) => i !== idx)
                                                                });
                                                            });
                                                        }}
                                                        style={{
                                                            background: '#ef4444',
                                                            border: 'none',
                                                            color: 'white',
                                                            cursor: 'pointer',
                                                            fontSize: '1.2rem',
                                                            padding: '0.125rem 0.375rem',
                                                            lineHeight: 1,
                                                            borderRadius: '4px',
                                                            transition: 'opacity 0.2s'
                                                        }}
                                                        onMouseEnter={e => e.target.style.opacity = '0.8'}
                                                        onMouseLeave={e => e.target.style.opacity = '1'}
                                                    >
                                                        ×
                                                    </button>
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {settingsView === 'vertical-markets' && (
                        <div className="table-container">
                            <div className="table-header">
                                <button 
                                    className="btn btn-secondary" 
                                    onClick={() => setSettingsView('menu')}
                                    style={{ marginRight: '1rem' }}
                                >
                                    ← Back
                                </button>
                                <h2>VERTICAL MARKETS</h2>
                            </div>
                            <div style={{ padding: '1.5rem' }}>
                                <div style={{ marginBottom: '2rem' }}>
                                    <h3 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '1rem' }}>
                                        Add New Vertical Market
                                    </h3>
                                    <div style={{ display: 'flex', gap: '0.5rem', maxWidth: '500px' }}>
                                        <input
                                            type="text"
                                            value={newVerticalMarketInput}
                                            onChange={(e) => setNewVerticalMarketInput(e.target.value)}
                                            placeholder="Enter new vertical market..."
                                            style={{
                                                flex: 1,
                                                background: '#f8f9fa',
                                                border: '1px solid #e2e8f0',
                                                borderRadius: '6px',
                                                padding: '0.625rem 0.75rem',
                                                color: '#1e293b',
                                                fontSize: '0.875rem'
                                            }}
                                            onKeyPress={(e) => {
                                                if (e.key === 'Enter') {
                                                    const value = newVerticalMarketInput.trim();
                                                    if (value && !(settings.verticalMarkets || []).includes(value)) {
                                                        setSettings({
                                                            ...settings,
                                                            verticalMarkets: [...(settings.verticalMarkets || []), value]
                                                        });
                                                        setNewVerticalMarketInput('');
                                                    }
                                                }
                                            }}
                                        />
                                        <button
                                            className="btn"
                                            onClick={() => {
                                                const value = newVerticalMarketInput.trim();
                                                if (value) {
                                                    const current = settings.verticalMarkets || [];
                                                    if (!current.includes(value)) {
                                                        setSettings({
                                                            ...settings,
                                                            verticalMarkets: [...current, value]
                                                        });
                                                        setNewVerticalMarketInput('');
                                                    }
                                                }
                                            }}
                                        >
                                            + ADD
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <h3 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '1rem' }}>
                                        Existing Vertical Markets ({(settings.verticalMarkets || []).length})
                                    </h3>
                                    {(settings.verticalMarkets || []).length === 0 ? (
                                        <div style={{ 
                                            textAlign: 'center', 
                                            padding: '3rem', 
                                            color: '#64748b',
                                            background: '#f1f3f5',
                                            borderRadius: '8px'
                                        }}>
                                            No vertical markets yet. Add one above to get started.
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                            {[...(settings.verticalMarkets || [])].sort((a, b) => a.localeCompare(b)).map((market, idx) => (
                                                <div key={idx} style={{
                                                    background: '#ffffff',
                                                    padding: '0.625rem 1rem',
                                                    borderRadius: '6px',
                                                    fontSize: '0.875rem',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    border: '1px solid #e2e8f0'
                                                }}>
                                                    <span style={{ fontWeight: '500' }}>{market}</span>
                                                    <button
                                                        onClick={() => {
                                                            showConfirm(`Remove "${market}" from vertical markets?`, () => {
                                                                setSettings({
                                                                    ...settings,
                                                                    verticalMarkets: settings.verticalMarkets.filter((_, i) => i !== idx)
                                                                });
                                                            });
                                                        }}
                                                        style={{
                                                            background: '#ef4444',
                                                            border: 'none',
                                                            color: 'white',
                                                            cursor: 'pointer',
                                                            fontSize: '1.2rem',
                                                            padding: '0.125rem 0.375rem',
                                                            lineHeight: 1,
                                                            borderRadius: '4px',
                                                            transition: 'opacity 0.2s'
                                                        }}
                                                        onMouseEnter={e => e.target.style.opacity = '0.8'}
                                                        onMouseLeave={e => e.target.style.opacity = '1'}
                                                    >
                                                        ×
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {settingsView === 'funnel-stages' && (
                        <div className="table-container">
                            <div className="table-header">
                                <button className="btn btn-secondary" onClick={() => setSettingsView('menu')} style={{ marginRight: '1rem' }}>← Back</button>
                                <h2>SALES FUNNEL STAGES</h2>
                            </div>
                            <div style={{ padding: '1.5rem', maxWidth: '650px' }}>
                                <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
                                    Configure your sales funnel stages and their win probability weightings. These weightings are used to calculate weighted pipeline values in analytics and forecasting.
                                </p>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem', marginBottom: '1rem' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                                            <th style={{ padding: '0.625rem 0.5rem', textAlign: 'left', fontWeight: '700', color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase' }}>Stage Name</th>
                                            <th style={{ padding: '0.625rem 0.5rem', textAlign: 'center', fontWeight: '700', color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase', width: '120px' }}>Win Probability %</th>
                                            <th style={{ padding: '0.625rem 0.5rem', textAlign: 'center', fontWeight: '700', color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase', width: '60px' }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(settings.funnelStages || []).map((stage, idx) => (
                                            <tr key={idx} style={{ borderBottom: '1px solid #f1f3f5' }}>
                                                <td style={{ padding: '0.5rem' }}>
                                                    <input type="text" value={stage.name} onChange={e => {
                                                        const updated = [...(settings.funnelStages || [])];
                                                        updated[idx] = { ...updated[idx], name: e.target.value };
                                                        setSettings({ ...settings, funnelStages: updated });
                                                    }} style={{ width: '100%', padding: '0.5rem 0.625rem', border: '1px solid #e2e8f0', borderRadius: '4px', fontSize: '0.875rem', fontFamily: 'inherit' }} />
                                                </td>
                                                <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', justifyContent: 'center' }}>
                                                        <input type="number" min="0" max="100" value={stage.weight} onChange={e => {
                                                            const updated = [...(settings.funnelStages || [])];
                                                            updated[idx] = { ...updated[idx], weight: Math.min(100, Math.max(0, parseInt(e.target.value) || 0)) };
                                                            setSettings({ ...settings, funnelStages: updated });
                                                        }} style={{ width: '65px', padding: '0.5rem', border: '1px solid #e2e8f0', borderRadius: '4px', fontSize: '0.875rem', textAlign: 'center', fontFamily: 'inherit' }} />
                                                        <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>%</span>
                                                    </div>
                                                </td>
                                                <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                                                    {(settings.funnelStages || []).length > 2 && (
                                                        <button onClick={() => setSettings({ ...settings, funnelStages: (settings.funnelStages || []).filter((_, i) => i !== idx) })}
                                                            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '1.125rem', padding: '0 0.25rem' }}>×</button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                <button onClick={() => setSettings({ ...settings, funnelStages: [...(settings.funnelStages || []), { name: '', weight: 0 }] })}
                                    style={{ background: '#f1f3f5', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '0.5rem 1rem', cursor: 'pointer', fontSize: '0.8125rem', fontWeight: '600', color: '#2563eb', fontFamily: 'inherit' }}>
                                    + Add Stage
                                </button>
                                <div style={{ marginTop: '1.5rem', padding: '1rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                    <div style={{ fontSize: '0.75rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: '0.75rem' }}>Funnel Preview</div>
                                    {(settings.funnelStages || []).filter(s => s.name.trim()).map((stage, idx, arr) => {
                                        const widthPct = 100 - (idx * (60 / Math.max(arr.length - 1, 1)));
                                        const colors = ['#6366f1', '#818cf8', '#a78bfa', '#c084fc', '#3b82f6', '#2563eb', '#10b981', '#ef4444'];
                                        return (
                                            <div key={idx} style={{ display: 'flex', alignItems: 'center', marginBottom: '0.25rem' }}>
                                                <div style={{
                                                    width: widthPct + '%', margin: '0 auto', padding: '0.375rem 0.75rem',
                                                    background: colors[idx % colors.length] + '18', border: '1px solid ' + colors[idx % colors.length] + '40',
                                                    borderRadius: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                    fontSize: '0.75rem', color: '#1e293b'
                                                }}>
                                                    <span style={{ fontWeight: '600' }}>{stage.name}</span>
                                                    <span style={{ color: '#64748b' }}>{stage.weight}%</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}

                    {settingsView === 'pipelines' && (
                        <PipelinesSettingsPanel
                            settings={settings}
                            setSettings={setSettings}
                            opportunities={opportunities}
                            activePipelineId={activePipelineId}
                            setActivePipelineId={setActivePipelineId}
                            onBack={() => setSettingsView('menu')}
                        />
                    )}

                    {settingsView === 'kpi-settings' && (
                        <div className="table-container">
                            <div className="table-header">
                                <button className="btn btn-secondary" onClick={() => setSettingsView('menu')} style={{ marginRight: '1rem' }}>← Back</button>
                                <h2>KPI SETTINGS</h2>
                            </div>
                            <div style={{ padding: '1.5rem' }}>
                                <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
                                    Configure your KPI cards. Set color indicators and tolerance thresholds to visually track performance.
                                </p>

                                {(settings.kpiConfig || []).map((kpi, kIdx) => {
                                    const colorOptions = [
                                        { value: 'primary', label: 'Blue', swatch: '#2563eb' },
                                        { value: 'success', label: 'Green', swatch: '#16a34a' },
                                        { value: 'warning', label: 'Amber', swatch: '#f59e0b' },
                                        { value: 'info', label: 'Indigo', swatch: '#6366f1' },
                                        { value: 'neutral', label: 'Gray', swatch: '#475569' }
                                    ];
                                    return (
                                        <div key={kpi.id} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1.25rem', marginBottom: '1rem', background: '#ffffff' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                    <input type="text" value={kpi.name}
                                                        onChange={e => {
                                                            const updated = [...(settings.kpiConfig || [])];
                                                            updated[kIdx] = { ...updated[kIdx], name: e.target.value };
                                                            setSettings({ ...settings, kpiConfig: updated });
                                                        }}
                                                        style={{ fontWeight: '700', fontSize: '1rem', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '0.375rem 0.75rem', fontFamily: 'inherit', width: '280px' }}
                                                    />
                                                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                                                        {colorOptions.map(co => (
                                                            <div key={co.value}
                                                                onClick={() => {
                                                                    const updated = [...(settings.kpiConfig || [])];
                                                                    updated[kIdx] = { ...updated[kIdx], color: co.value };
                                                                    setSettings({ ...settings, kpiConfig: updated });
                                                                }}
                                                                title={co.label}
                                                                style={{
                                                                    width: '22px', height: '22px', borderRadius: '50%', background: co.swatch,
                                                                    cursor: 'pointer', border: kpi.color === co.value ? '3px solid #1e293b' : '2px solid #e2e8f0',
                                                                    transition: 'all 0.15s'
                                                                }}
                                                            />
                                                        ))}
                                                    </div>
                                                </div>
                                                <button onClick={() => {
                                                    const updated = (settings.kpiConfig || []).filter((_, i) => i !== kIdx);
                                                    setSettings({ ...settings, kpiConfig: updated });
                                                }}
                                                    style={{ background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca', borderRadius: '6px', padding: '0.375rem 0.75rem', cursor: 'pointer', fontSize: '0.8125rem', fontWeight: '600', fontFamily: 'inherit' }}
                                                >Delete</button>
                                            </div>

                                            {/* Tolerances */}
                                            <div style={{ background: '#f8fafc', borderRadius: '6px', padding: '0.75rem', border: '1px solid #f1f3f5' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                                    <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tolerance Thresholds</span>
                                                    <button onClick={() => {
                                                        const updated = [...(settings.kpiConfig || [])];
                                                        const tols = [...(updated[kIdx].tolerances || [])];
                                                        tols.push({ label: 'New Level', min: 0, color: '#64748b' });
                                                        updated[kIdx] = { ...updated[kIdx], tolerances: tols };
                                                        setSettings({ ...settings, kpiConfig: updated });
                                                    }}
                                                        style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: '4px', padding: '0.25rem 0.625rem', cursor: 'pointer', fontSize: '0.75rem', fontWeight: '600', fontFamily: 'inherit' }}
                                                    >+ Add</button>
                                                </div>
                                                {(!kpi.tolerances || kpi.tolerances.length === 0) ? (
                                                    <div style={{ textAlign: 'center', padding: '0.75rem', color: '#94a3b8', fontSize: '0.8125rem' }}>No tolerances set. Add thresholds to show color indicators.</div>
                                                ) : (
                                                    <div style={{ display: 'grid', gap: '0.5rem' }}>
                                                        {(kpi.tolerances || []).map((tol, tIdx) => (
                                                            <div key={tIdx} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#ffffff', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                                                <input type="color" value={tol.color || '#64748b'}
                                                                    onChange={e => {
                                                                        const updated = [...(settings.kpiConfig || [])];
                                                                        const tols = [...(updated[kIdx].tolerances || [])];
                                                                        tols[tIdx] = { ...tols[tIdx], color: e.target.value };
                                                                        updated[kIdx] = { ...updated[kIdx], tolerances: tols };
                                                                        setSettings({ ...settings, kpiConfig: updated });
                                                                    }}
                                                                    style={{ width: '32px', height: '28px', border: 'none', borderRadius: '4px', cursor: 'pointer', padding: 0 }}
                                                                />
                                                                <input type="text" value={tol.label || ''} placeholder="Label"
                                                                    onChange={e => {
                                                                        const updated = [...(settings.kpiConfig || [])];
                                                                        const tols = [...(updated[kIdx].tolerances || [])];
                                                                        tols[tIdx] = { ...tols[tIdx], label: e.target.value };
                                                                        updated[kIdx] = { ...updated[kIdx], tolerances: tols };
                                                                        setSettings({ ...settings, kpiConfig: updated });
                                                                    }}
                                                                    style={{ flex: 1, border: '1px solid #e2e8f0', borderRadius: '4px', padding: '0.3rem 0.5rem', fontSize: '0.8125rem', fontFamily: 'inherit' }}
                                                                />
                                                                <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '600', whiteSpace: 'nowrap' }}>≥</span>
                                                                <input type="number" value={tol.min} placeholder="Min value"
                                                                    onChange={e => {
                                                                        const updated = [...(settings.kpiConfig || [])];
                                                                        const tols = [...(updated[kIdx].tolerances || [])];
                                                                        tols[tIdx] = { ...tols[tIdx], min: parseFloat(e.target.value) || 0 };
                                                                        updated[kIdx] = { ...updated[kIdx], tolerances: tols };
                                                                        setSettings({ ...settings, kpiConfig: updated });
                                                                    }}
                                                                    style={{ width: '100px', border: '1px solid #e2e8f0', borderRadius: '4px', padding: '0.3rem 0.5rem', fontSize: '0.8125rem', fontFamily: 'inherit' }}
                                                                />
                                                                <button onClick={() => {
                                                                    const updated = [...(settings.kpiConfig || [])];
                                                                    const tols = [...(updated[kIdx].tolerances || [])].filter((_, i) => i !== tIdx);
                                                                    updated[kIdx] = { ...updated[kIdx], tolerances: tols };
                                                                    setSettings({ ...settings, kpiConfig: updated });
                                                                }}
                                                                    style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '1rem', fontWeight: '700', padding: '0 0.25rem' }}
                                                                >×</button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}

                                <button onClick={() => {
                                    const kpiConfig = [...(settings.kpiConfig || [])];
                                    kpiConfig.push({
                                        id: 'kpi_' + Date.now(),
                                        name: 'New KPI',
                                        color: 'primary',
                                        tolerances: [
                                            { label: 'Good', min: 100, color: '#16a34a' },
                                            { label: 'Warning', min: 50, color: '#f59e0b' },
                                            { label: 'Critical', min: 0, color: '#ef4444' }
                                        ]
                                    });
                                    setSettings({ ...settings, kpiConfig });
                                }}
                                    style={{ width: '100%', padding: '1rem', border: '2px dashed #d1d5db', borderRadius: '8px', background: '#f8fafc', cursor: 'pointer', fontSize: '0.9375rem', fontWeight: '600', color: '#64748b', fontFamily: 'inherit', transition: 'all 0.2s' }}
                                    onMouseEnter={e => { e.target.style.borderColor = '#2563eb'; e.target.style.color = '#2563eb'; }}
                                    onMouseLeave={e => { e.target.style.borderColor = '#d1d5db'; e.target.style.color = '#64748b'; }}
                                >+ Add New KPI</button>
                            </div>
                        </div>
                    )}

                    {settingsView === 'data-storage' && (
                        <div className="table-container">
                            <div className="table-header">
                                <button className="btn btn-secondary" onClick={() => setSettingsView('menu')} style={{ marginRight: '1rem' }}>← Back</button>
                                <h2>DATA STORAGE</h2>
                            </div>
                            <div style={{ padding: '1.5rem', maxWidth: '600px' }}>
                                <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
                                    Choose where your Sales Pipeline Tracker data is stored. This determines how data persists and whether it can be shared across devices.
                                </p>

                                {[
                                    {
                                        id: 'local',
                                        title: 'Browser Local Storage',
                                        desc: 'Data is saved in this browser on this device only. Fast and works offline. Data is lost if browser cache is cleared.',
                                        status: 'Active',
                                        badge: 'Current',
                                        badgeColor: '#10b981'
                                    },
                                    {
                                        id: 'json-export',
                                        title: 'JSON File Export/Import',
                                        desc: 'Manually export data to a JSON file and import on another device. Use Data Management to export/import.',
                                        status: 'Available',
                                        badge: 'Manual',
                                        badgeColor: '#f59e0b'
                                    },
                                    {
                                        id: 'cloud-api',
                                        title: 'Cloud Database (API)',
                                        desc: 'Connect to an external database via REST API for multi-user, multi-device access. Requires a backend server.',
                                        status: 'Coming Soon',
                                        badge: 'Planned',
                                        badgeColor: '#6366f1'
                                    },
                                    {
                                        id: 'google-sheets',
                                        title: 'Google Sheets',
                                        desc: 'Sync data to a Google Sheets spreadsheet for easy viewing and sharing. Requires Google API integration.',
                                        status: 'Coming Soon',
                                        badge: 'Planned',
                                        badgeColor: '#6366f1'
                                    }
                                ].map(opt => (
                                    <div key={opt.id} style={{
                                        padding: '1.25rem', border: opt.id === (settings.dataStorage || 'local') ? '2px solid #2563eb' : '1px solid #e2e8f0',
                                        borderRadius: '8px', marginBottom: '1rem', background: opt.id === (settings.dataStorage || 'local') ? '#eff6ff' : '#ffffff',
                                        cursor: opt.status === 'Active' || opt.status === 'Available' ? 'pointer' : 'default',
                                        opacity: opt.status === 'Coming Soon' ? 0.6 : 1, transition: 'all 0.2s'
                                    }}
                                        onClick={() => {
                                            if (opt.id === 'local') setSettings({ ...settings, dataStorage: 'local' });
                                            if (opt.id === 'json-export') setSettings({ ...settings, dataStorage: 'json-export' });
                                        }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                            <h4 style={{ fontSize: '1rem', fontWeight: '700' }}>{opt.title}</h4>
                                            <span style={{
                                                fontSize: '0.6875rem', fontWeight: '700', padding: '0.2rem 0.6rem',
                                                borderRadius: '10px', background: opt.badgeColor + '20', color: opt.badgeColor,
                                                textTransform: 'uppercase', letterSpacing: '0.05em'
                                            }}>{opt.badge}</span>
                                        </div>
                                        <p style={{ fontSize: '0.8125rem', color: '#64748b', lineHeight: 1.5 }}>{opt.desc}</p>
                                    </div>
                                ))}

                                {(settings.dataStorage || 'local') === 'cloud-api' && (
                                    <div style={{ padding: '1rem', background: '#f8f9fa', borderRadius: '8px', marginTop: '1rem' }}>
                                        <label style={{ fontWeight: '600', fontSize: '0.875rem', display: 'block', marginBottom: '0.5rem' }}>API Endpoint URL</label>
                                        <input type="url" placeholder="https://your-api.com/pipeline-data"
                                            value={settings.apiEndpoint || ''}
                                            onChange={e => setSettings({ ...settings, apiEndpoint: e.target.value })}
                                            style={{ width: '100%', padding: '0.75rem', border: '1px solid #e2e8f0', borderRadius: '6px' }}
                                        />
                                        <label style={{ fontWeight: '600', fontSize: '0.875rem', display: 'block', marginBottom: '0.5rem', marginTop: '1rem' }}>API Key</label>
                                        <input type="password" placeholder="Your API key..."
                                            value={settings.apiKey || ''}
                                            onChange={e => setSettings({ ...settings, apiKey: e.target.value })}
                                            style={{ width: '100%', padding: '0.75rem', border: '1px solid #e2e8f0', borderRadius: '6px' }}
                                        />
                                    </div>
                                )}

                                <div style={{ marginTop: '1.5rem', padding: '1rem', background: '#fffbeb', borderRadius: '8px', border: '1px solid #fde68a' }}>
                                    <div style={{ fontSize: '0.8125rem', color: '#92400e' }}>
                                        <strong>Note:</strong> Currently, all data is stored in your browser's local storage. Cloud and Google Sheets integrations are planned for future releases. Use Data Management to export/import data between devices in the meantime.
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {settingsView === 'data-management' && (
                        <div className="table-container">
                            <div className="table-header">
                                <button 
                                    className="btn btn-secondary" 
                                    onClick={() => setSettingsView('menu')}
                                    style={{ marginRight: '1rem' }}
                                >
                                    ← Back
                                </button>
                                <h2>DATA MANAGEMENT</h2>
                            </div>
                            <div style={{ padding: '1.5rem' }}>
                                {/* Data Summary */}
                                <div style={{ 
                                    marginBottom: '2rem', 
                                    padding: '1.25rem', 
                                    background: '#f1f3f5', 
                                    borderRadius: '8px',
                                    border: '1px solid #e2e8f0'
                                }}>
                                    <h3 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '1rem' }}>
                                        Current Data Summary
                                    </h3>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
                                        <div style={{ textAlign: 'center', padding: '0.75rem', background: '#ffffff', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                            <div style={{ fontSize: '1.5rem', fontWeight: '800', color: '#2563eb' }}>{opportunities.length}</div>
                                            <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '600' }}>Opportunities</div>
                                        </div>
                                        <div style={{ textAlign: 'center', padding: '0.75rem', background: '#ffffff', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                            <div style={{ fontSize: '1.5rem', fontWeight: '800', color: '#10b981' }}>{accounts.length}</div>
                                            <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '600' }}>Accounts</div>
                                        </div>
                                        <div style={{ textAlign: 'center', padding: '0.75rem', background: '#ffffff', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                            <div style={{ fontSize: '1.5rem', fontWeight: '800', color: '#f59e0b' }}>{contacts.length}</div>
                                            <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '600' }}>Contacts</div>
                                        </div>
                                        <div style={{ textAlign: 'center', padding: '0.75rem', background: '#ffffff', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                            <div style={{ fontSize: '1.5rem', fontWeight: '800', color: '#3b82f6' }}>{tasks.length}</div>
                                            <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '600' }}>Tasks</div>
                                        </div>
                                        <div style={{ textAlign: 'center', padding: '0.75rem', background: '#ffffff', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                            <div style={{ fontSize: '1.5rem', fontWeight: '800', color: '#1e293b' }}>{activities.length}</div>
                                            <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '600' }}>Activities</div>
                                        </div>
                                    </div>
                                </div>

                                {/* Export Section */}
                                <div style={{ 
                                    marginBottom: '2rem', 
                                    padding: '1.5rem', 
                                    border: '1px solid #e2e8f0', 
                                    borderRadius: '8px',
                                    background: '#ffffff'
                                }}>
                                    <h3 style={{ fontSize: '1.125rem', fontWeight: '700', marginBottom: '0.5rem' }}>
                                        📤 Export / Back Up Data
                                    </h3>
                                    <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
                                        Download a complete backup of all your data as a JSON file. This includes opportunities, accounts, contacts, tasks, activities, and settings.
                                    </p>
                                    <button
                                        className="btn"
                                        onClick={() => {
                                            const exportData = {
                                                exportVersion: '1.0',
                                                exportDate: new Date().toISOString(),
                                                appName: 'Sales Pipeline Tracker',
                                                data: {
                                                    opportunities,
                                                    accounts,
                                                    contacts,
                                                    tasks,
                                                                                                                activities,
                                                    settings
                                                }
                                            };
                                            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
                                            const url = URL.createObjectURL(blob);
                                            const a = document.createElement('a');
                                            a.href = url;
                                            const dateStr = new Date().toISOString().split('T')[0];
                                            a.download = `sales-pipeline-backup-${dateStr}.json`;
                                            document.body.appendChild(a);
                                            a.click();
                                            document.body.removeChild(a);
                                            URL.revokeObjectURL(url);
                                        }}
                                        style={{ padding: '0.75rem 1.5rem', fontSize: '0.9rem' }}
                                    >
                                        💾 Download Full Backup
                                    </button>
                                </div>

                                {/* Import Section */}
                                <div style={{ 
                                    marginBottom: '2rem', 
                                    padding: '1.5rem', 
                                    border: '1px solid #e2e8f0', 
                                    borderRadius: '8px',
                                    background: '#ffffff'
                                }}>
                                    <h3 style={{ fontSize: '1.125rem', fontWeight: '700', marginBottom: '0.5rem' }}>
                                        📥 Import / Restore Data
                                    </h3>
                                    <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '0.75rem' }}>
                                        Restore your data from a previously exported backup file. This will <strong>replace</strong> all current data with the backup contents.
                                    </p>
                                    <div style={{ 
                                        padding: '0.75rem 1rem', 
                                        background: '#fef3c7', 
                                        border: '1px solid #fcd34d', 
                                        borderRadius: '6px', 
                                        marginBottom: '1.25rem',
                                        fontSize: '0.8125rem',
                                        color: '#92400e'
                                    }}>
                                        ⚠️ <strong>Warning:</strong> Importing a backup will overwrite all existing data. Consider exporting a backup of your current data first.
                                    </div>
                                    <input
                                        type="file"
                                        accept=".json"
                                        id="backup-file-input"
                                        style={{ display: 'none' }}
                                        onChange={(e) => {
                                            const file = e.target.files[0];
                                            if (!file) return;
                                            
                                            const reader = new FileReader();
                                            reader.onload = (event) => {
                                                try {
                                                    const importData = JSON.parse(event.target.result);
                                                    
                                                    // Validate structure
                                                    if (!importData.data || !importData.appName) {
                                                        alert('Invalid backup file. Please select a valid Sales Pipeline Tracker backup file.');
                                                        return;
                                                    }
                                                    
                                                    const d = importData.data;
                                                    const counts = [
                                                        d.opportunities ? `${d.opportunities.length} opportunities` : null,
                                                        d.accounts ? `${d.accounts.length} accounts` : null,
                                                        d.contacts ? `${d.contacts.length} contacts` : null,
                                                        d.tasks ? `${d.tasks.length} tasks` : null,
                                                        d.activities ? `${d.activities.length} activities` : null
                                                    ].filter(Boolean).join(', ');
                                                    
                                                    const exportDate = importData.exportDate 
                                                        ? new Date(importData.exportDate).toLocaleString() 
                                                        : 'Unknown date';
                                                    
                                                    showConfirm(`Restore backup from ${exportDate}?\n\nThis file contains: ${counts}\n\nThis will REPLACE all current data.`, () => {
                                                        if (d.opportunities) setOpportunities(d.opportunities);
                                                        if (d.accounts) setAccounts(d.accounts);
                                                        if (d.contacts) setContacts(d.contacts);
                                                        if (d.tasks) setTasks(d.tasks);
                                                        if (d.taskTypes) setSettings(prev => ({ ...prev, taskTypes: d.taskTypes }));
                                                        if (d.activities) setActivities(d.activities);
                                                        if (d.settings) setSettings(d.settings);
                                                        
                                                        // Sync restored data to the database
                                                        const syncToDb = async () => {
                                                            try {
                                                                const endpoints = [
                                                                    { key: 'opportunities', url: '/.netlify/functions/opportunities' },
                                                                    { key: 'accounts', url: '/.netlify/functions/accounts' },
                                                                    { key: 'contacts', url: '/.netlify/functions/contacts' },
                                                                    { key: 'tasks', url: '/.netlify/functions/tasks' },
                                                                    { key: 'activities', url: '/.netlify/functions/activities' },
                                                                ];
                                                                for (const { key, url } of endpoints) {
                                                                    if (d[key]) {
                                                                        for (const record of d[key]) {
                                                                            await fetch(url, {
                                                                                method: 'POST',
                                                                                headers: { 'Content-Type': 'application/json' },
                                                                                body: JSON.stringify(record)
                                                                            }).catch(() => {});
                                                                        }
                                                                    }
                                                                }
                                                                if (d.settings) {
                                                                    await fetch('/.netlify/functions/settings', {
                                                                        method: 'PUT',
                                                                        headers: { 'Content-Type': 'application/json' },
                                                                        body: JSON.stringify(d.settings)
                                                                    }).catch(() => {});
                                                                }
                                                            } catch(e) { console.error('DB sync after restore failed:', e); }
                                                        };
                                                        syncToDb();
                                                        
                                                        alert('Data restored successfully!');
                                                    }, false);
                                                } catch (err) {
                                                    alert('Error reading backup file. The file may be corrupted or in an incorrect format.\n\nDetails: ' + err.message);
                                                }
                                            };
                                            reader.readAsText(file);
                                            // Reset input so same file can be selected again
                                            e.target.value = '';
                                        }}
                                    />
                                    <button
                                        className="btn btn-secondary"
                                        onClick={() => document.getElementById('backup-file-input').click()}
                                        style={{ padding: '0.75rem 1.5rem', fontSize: '0.9rem' }}
                                    >
                                        📂 Select Backup File to Restore
                                    </button>
                                </div>

                                {/* Outlook Email Import Section */}
                                <div style={{ 
                                    marginBottom: '2rem', 
                                    padding: '1.5rem', 
                                    border: '1px solid #e2e8f0', 
                                    borderRadius: '8px',
                                    background: '#ffffff'
                                }}>
                                    <h3 style={{ fontSize: '1.125rem', fontWeight: '700', marginBottom: '0.5rem' }}>
                                        📧 Import Outlook Sent Emails
                                    </h3>
                                    <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
                                        Import emails from your Outlook Sent Items folder (CSV export) and automatically link them to matching contacts as activities.
                                    </p>
                                    <button
                                        className="btn"
                                        onClick={() => { setShowOutlookImportModal(true); }}
                                        style={{ padding: '0.75rem 1.5rem', fontSize: '0.9rem' }}
                                    >
                                        📧 Import Outlook Emails
                                    </button>
                                </div>

                                {/* Clear Data Section */}
                                <div style={{ 
                                    padding: '1.5rem', 
                                    border: '1px solid #ef4444', 
                                    borderRadius: '8px',
                                    background: '#fef2f2'
                                }}>
                                    <h3 style={{ fontSize: '1.125rem', fontWeight: '700', marginBottom: '0.5rem', color: '#ef4444' }}>
                                        🗑️ Clear All Data
                                    </h3>
                                    <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
                                        Permanently delete all data and reset the application to its default state. This action cannot be undone.
                                    </p>
                                    <button
                                        className="btn"
                                        onClick={() => {
                                            showConfirm('Are you SURE you want to delete ALL data? This cannot be undone.\n\nConsider exporting a backup first.', () => {
                                                showConfirm('FINAL WARNING: This will permanently erase all opportunities, accounts, contacts, tasks, activities, and settings. Proceed?', () => {
                                                    setOpportunities([]);
                                                    setAccounts([]);
                                                    setContacts([]);
                                                    setTasks([]);
                                                    setSettings(prev => ({ ...prev, taskTypes: ['Call', 'Meeting', 'Email'] }));
                                                    setActivities([]);
                                                    setSettings({
                                                        fiscalYearStart: 10,
                                                        users: [],
                                                        logoUrl: '',
                                                        painPoints: ['High Turnover', 'Scheduling Complexity', 'Compliance Issues', 'Manual Processes', 'Poor Visibility', 'Budget Constraints', 'Integration Challenges'],
                                                        verticalMarkets: ['Manufacturing', 'Healthcare', 'Energy & Utilities', 'Oil & Gas', 'Transportation', 'Government', 'Retail', 'Hospitality', 'Construction', 'Mining']
                                                    });
                                                    try {
                                                    safeStorage.removeItem('salesOpportunities');
                                                    safeStorage.removeItem('salesAccounts');
                                                    safeStorage.removeItem('salesContacts');
                                                    safeStorage.removeItem('salesTasks');
                                                    safeStorage.removeItem('salesTaskTypes');
                                                    safeStorage.removeItem('salesActivities');
                                                    safeStorage.removeItem('salesSettings');
                                                    } catch(e) {}
                                                    alert('All data has been cleared.');
                                                    setSettingsView('menu');
                                                });
                                            });
                                        }}
                                        style={{ 
                                            background: '#ef4444', 
                                            padding: '0.75rem 1.5rem', 
                                            fontSize: '0.9rem'
                                        }}
                                    >
                                        🗑️ Clear All Data
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </>
                </div>
            )}

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
                        const newId = String(Math.max(...(activities.length ? activities.map(a => parseInt(a.id) || 0) : [0]), 0) + 1).padStart(3, '0');
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
                    onClose={() => setShowModal(false)}
                    onSave={handleSave}
                    onAddAccount={handleAddAccountFromOpportunity}
                    lastCreatedAccountName={lastCreatedAccountName}
                    lastCreatedRepName={lastCreatedRepName}
                    onSaveNewContact={(data) => {
                        const newId = String(Math.max(...(contacts.length ? contacts.map(c => parseInt(c.id) || 0) : [0]), 0) + 1).padStart(3, '0');
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
                        const newId = String(Math.max(...(accounts.length ? accounts.map(a => parseInt(a.id) || 0) : [0]), 0) + 1).padStart(3, '0');
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
                    onClose={() => setShowAccountModal(false)}
                    onSave={handleSaveAccount}
                    onAddRep={() => { setShowUserModal(true); setEditingUser(null); }}
                    existingAccounts={accounts}
                />
            )}

            {showUserModal && (
                <UserModal
                    user={editingUser}
                    onClose={() => setShowUserModal(false)}
                    onSave={handleSaveUser}
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
                    onClose={() => setShowTaskModal(false)}
                    onSave={handleSaveTask}
                    onAddTaskType={handleAddTaskType}
                    onSaveNewContact={(data) => {
                        const newId = String(Math.max(...(contacts.length ? contacts.map(c => parseInt(c.id) || 0) : [0]), 0) + 1).padStart(3, '0');
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
                        const newId = String(Math.max(...(accounts.length ? accounts.map(a => parseInt(a.id) || 0) : [0]), 0) + 1).padStart(3, '0');
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

            {viewingTask && (() => {
                const t = viewingTask;
                const relatedOpp = t.opportunityId ? opportunities.find(o => o.id === t.opportunityId) : null;
                const relatedContact = t.contactId ? contacts.find(c => c.id === t.contactId) : null;
                const relatedAccount = t.accountId ? accounts.find(a => a.id === t.accountId) : null;
                const status = t.status || (t.completed ? 'Completed' : 'Open');
                const sc = { 'Open': { bg: '#dbeafe', color: '#1e40af' }, 'In-Process': { bg: '#fef3c7', color: '#92400e' }, 'Completed': { bg: '#dcfce7', color: '#166534' } }[status] || { bg: '#dbeafe', color: '#1e40af' };
                const taskActivities = activities.filter(a => {
                    if (a.opportunityId && t.opportunityId && a.opportunityId === t.opportunityId) return true;
                    if (a.contactId && t.contactId && a.contactId === t.contactId) return true;
                    return false;
                }).sort((a, b) => new Date(b.date) - new Date(a.date));

                return (
                    <div className="modal-overlay" onClick={() => setViewingTask(null)}>
                        <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                                <div>
                                    <h2 style={{ margin: '0 0 0.5rem 0' }}>{t.title}</h2>
                                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                        <span style={{ background: sc.bg, color: sc.color, padding: '0.2rem 0.625rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: '700' }}>{status}</span>
                                        <span style={{ background: '#2563eb', color: 'white', padding: '0.2rem 0.625rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: '700' }}>{t.type}</span>
                                    </div>
                                </div>
                                <button onClick={() => setViewingTask(null)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#64748b', lineHeight: 1 }}>x</button>
                            </div>

                            {t.description && (
                                <div style={{ padding: '0.75rem 1rem', background: '#f8f9fa', borderRadius: '6px', marginBottom: '1rem', fontSize: '0.875rem', color: '#475569' }}>{t.description}</div>
                            )}

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.25rem' }}>
                                <div style={{ padding: '0.625rem 0.75rem', background: '#f8f9fa', borderRadius: '6px' }}>
                                    <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Due Date</div>
                                    <div style={{ fontSize: '0.875rem', fontWeight: '600', color: '#1e293b' }}>{t.dueDate ? new Date(t.dueDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : '-'}{t.dueTime ? ' at ' + t.dueTime : ''}</div>
                                </div>
                                {t.completedDate && (
                                    <div style={{ padding: '0.625rem 0.75rem', background: '#f0fdf4', borderRadius: '6px' }}>
                                        <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Completed</div>
                                        <div style={{ fontSize: '0.875rem', fontWeight: '600', color: '#166534' }}>{new Date(t.completedDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</div>
                                    </div>
                                )}
                                {relatedOpp && (
                                    <div style={{ padding: '0.625rem 0.75rem', background: '#f8f9fa', borderRadius: '6px' }}>
                                        <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Opportunity</div>
                                        <div style={{ fontSize: '0.875rem', fontWeight: '600', color: '#2563eb' }}>{relatedOpp.account}{relatedOpp.opportunityName ? ' - ' + relatedOpp.opportunityName : ''}</div>
                                    </div>
                                )}
                                {relatedContact && (
                                    <div style={{ padding: '0.625rem 0.75rem', background: '#f8f9fa', borderRadius: '6px' }}>
                                        <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Contact</div>
                                        <div style={{ fontSize: '0.875rem', fontWeight: '600', color: '#1e293b' }}>{relatedContact.firstName} {relatedContact.lastName}</div>
                                    </div>
                                )}
                                {relatedAccount && (
                                    <div style={{ padding: '0.625rem 0.75rem', background: '#f8f9fa', borderRadius: '6px' }}>
                                        <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Account</div>
                                        <div style={{ fontSize: '0.875rem', fontWeight: '600', color: '#1e293b' }}>{relatedAccount.name}</div>
                                    </div>
                                )}
                                {t.assignedTo && (
                                    <div style={{ padding: '0.625rem 0.75rem', background: '#f8f9fa', borderRadius: '6px' }}>
                                        <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Assigned To</div>
                                        <div style={{ fontSize: '0.875rem', fontWeight: '600', color: '#1e293b' }}>{t.assignedTo}</div>
                                    </div>
                                )}
                            </div>

                            {taskActivities.length > 0 && (
                                <div>
                                    <div style={{ fontSize: '0.75rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Related Activities ({taskActivities.length})</div>
                                    <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                                        {taskActivities.map((a, idx) => (
                                            <div key={idx} style={{ display: 'flex', gap: '0.625rem', padding: '0.5rem 0', borderBottom: idx < taskActivities.length - 1 ? '1px solid #f1f3f5' : 'none', fontSize: '0.8125rem', alignItems: 'center' }}>
                                                <span style={{ width: '65px', flexShrink: 0, color: '#94a3b8', fontSize: '0.75rem' }}>{a.date ? new Date(a.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '-'}</span>
                                                <span style={{ padding: '0.1rem 0.4rem', borderRadius: '3px', fontSize: '0.625rem', fontWeight: '700', background: '#dbeafe', color: '#1e40af' }}>{a.type}</span>
                                                <span style={{ flex: 1, color: '#475569' }}>{a.notes || a.subject || 'No details'}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
                                <button className="btn btn-secondary" onClick={() => { setViewingTask(null); handleEditTask(t); }}>Edit Task</button>
                                <button className="btn" onClick={() => setViewingTask(null)}>Close</button>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {showContactModal && (
                <ContactModal
                    contact={editingContact}
                    contacts={contacts}
                    accounts={accounts}
                    settings={settings}
                    onClose={() => setShowContactModal(false)}
                    onSave={handleSaveContact}
                    onSaveNewContact={(newContactData) => {
                        const newId = String(Math.max(...(contacts.length ? contacts.map(c => parseInt(c.id) || 0) : [0]), 0) + 1).padStart(3, '0');
                        const newContact = { ...newContactData, id: newId };
                        setContacts([...contacts, newContact]);
                        return newContact;
                    }}
                    onAddAccount={() => {
                        setShowAccountModal(true);
                        setEditingAccount(null);
                        setEditingSubAccount(null);
                        setParentAccountForSub(null);
                    }}
                />
            )}

            {viewingAccount && (() => {
                const acc = viewingAccount;
                const accName = acc.name.toLowerCase();
                const accOpps = opportunities.filter(o => o.account && o.account.toLowerCase() === accName);
                const accContacts = contacts.filter(c => c.company && c.company.toLowerCase() === accName);
                const pv = accOpps.reduce((sum, o) => sum + (o.arr || 0), 0);
                const openOpps = accOpps.filter(o => o.stage !== 'Closed Won' && o.stage !== 'Closed Lost');
                const closedOpps = accOpps.filter(o => o.stage === 'Closed Won' || o.stage === 'Closed Lost');
                const wonOpps = accOpps.filter(o => o.stage === 'Closed Won');
                const wonValue = wonOpps.reduce((sum, o) => sum + (o.arr || 0) + (o.implementationCost || 0), 0);

                // Rollup across all sub-accounts
                const subs = getSubAccounts(acc.id);
                const hasSubs = subs.length > 0;
                const rollup = hasSubs ? getAccountRollup(acc) : null;

                // Sub-account enriched data
                const subData = subs.map(sub => {
                    const sn = sub.name.toLowerCase();
                    const subOpps = opportunities.filter(o => o.account && o.account.toLowerCase() === sn);
                    const subOpen = subOpps.filter(o => o.stage !== 'Closed Won' && o.stage !== 'Closed Lost');
                    const subWon = subOpps.filter(o => o.stage === 'Closed Won');
                    const subPipeline = subOpen.reduce((s, o) => s + (o.arr || 0), 0);
                    const subWonValue = subWon.reduce((s, o) => s + (o.arr || 0) + (o.implementationCost || 0), 0);
                    const subContacts = contacts.filter(c => c.company && c.company.toLowerCase() === sn);
                    return { sub, subOpps, subOpen, subWon, subPipeline, subWonValue, subContacts };
                });

                // All opps across parent + subs (for consolidated view)
                const allOpps = hasSubs ? [...accOpps, ...subData.flatMap(d => d.subOpps)] : accOpps;
                const allOpenOpps = allOpps.filter(o => o.stage !== 'Closed Won' && o.stage !== 'Closed Lost');
                const allClosedOpps = allOpps.filter(o => o.stage === 'Closed Won' || o.stage === 'Closed Lost');
                const allWonOpps = allOpps.filter(o => o.stage === 'Closed Won');
                const totalPipeline = hasSubs ? rollup.pipeline : pv;
                const totalWonValue = hasSubs ? rollup.wonArr : wonValue;
                const totalContacts = hasSubs ? rollup.allContacts : accContacts;

                const CLOSED_LIMIT = 5;
                const CONTACT_LIMIT = 8;

                return (
                <div className="modal-overlay" onClick={() => setViewingAccount(null)} style={{ alignItems: 'flex-start', paddingTop: '0', overflowY: 'auto' }}>
                    <div onClick={e => e.stopPropagation()} style={{ 
                        width: '100%', maxWidth: '1100px', minHeight: '100vh', margin: '0 auto',
                        background: '#f8fafc', boxShadow: '0 0 40px rgba(0,0,0,0.15)'
                    }}>
                        {/* Header bar */}
                        <div style={{ background: '#ffffff', borderBottom: '1px solid #e2e8f0', padding: '1.25rem 2rem', position: 'sticky', top: 0, zIndex: 10 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                                    <button onClick={() => setViewingAccount(null)}
                                        style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '0.5rem 0.875rem', cursor: 'pointer', fontSize: '0.875rem', fontWeight: '600', color: '#475569', fontFamily: 'inherit', marginTop: '0.125rem' }}
                                    >← Back</button>
                                    <div>
                                        <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '800', color: '#0f172a' }}>{acc.name}</h1>
                                        {acc.accountOwner && <div style={{ color: '#2563eb', fontWeight: '600', fontSize: '0.875rem', marginTop: '0.125rem' }}>{acc.accountOwner}</div>}
                                        <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', marginTop: '0.375rem', fontSize: '0.8125rem', color: '#64748b' }}>
                                            {(acc.address || acc.city || acc.state || acc.zip) && (
                                                <span>📍 {[acc.address, [acc.city, acc.state].filter(Boolean).join(', '), acc.zip].filter(Boolean).join(', ')}</span>
                                            )}
                                            {acc.phone && <span>📞 {acc.phone}</span>}
                                            {acc.website && <a href={acc.website} target="_blank" style={{ color: '#2563eb', textDecoration: 'none' }}>🌐 {acc.website.replace(/^https?:/, '').replace(/^\/\//, '').replace(/^www\./, '')}</a>}
                                        </div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                                    <button className="btn" onClick={() => { setViewingAccount(null); handleEditAccount(acc); }}>Edit Account</button>
                                </div>
                            </div>
                        </div>

                        <div style={{ padding: '1.5rem 2rem' }}>

                            {/* Account metadata + sub-account breakdown */}
                            {(acc.verticalMarket || acc.country || hasSubs) && (
                            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '1.25rem 1.5rem', marginBottom: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                                {(acc.verticalMarket || acc.country) && (
                                <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', fontSize: '0.875rem', marginBottom: hasSubs ? '1rem' : 0, paddingBottom: hasSubs ? '1rem' : 0, borderBottom: hasSubs ? '1px solid #f1f3f5' : 'none' }}>
                                    {acc.verticalMarket && (
                                        <div>
                                            <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Vertical</div>
                                            <div style={{ color: '#1e293b', fontWeight: '500' }}>{acc.verticalMarket}</div>
                                        </div>
                                    )}
                                    {acc.country && (
                                        <div>
                                            <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Country</div>
                                            <div style={{ color: '#1e293b', fontWeight: '500' }}>{acc.country}</div>
                                        </div>
                                    )}
                                </div>
                                )}
                                {hasSubs && (
                                <div>
                                    <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>Sub-Accounts ({subs.length})</div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                        {subData.map(({ sub, subOpen, subWon, subPipeline, subContacts }) => (
                                            <div key={sub.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.75rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                                                    <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>↳</span>
                                                    <span style={{ fontWeight: '700', color: '#4338ca', fontSize: '0.875rem', cursor: 'pointer' }}
                                                        onClick={() => setViewingAccount(sub)}
                                                        onMouseEnter={e => e.target.style.textDecoration = 'underline'}
                                                        onMouseLeave={e => e.target.style.textDecoration = 'none'}
                                                    >{sub.name}</span>
                                                    {sub.accountOwner && <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>{sub.accountOwner}</span>}
                                                </div>
                                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                                    {subOpen.length > 0 && <span style={{ background: '#dbeafe', color: '#1e40af', padding: '0.1rem 0.5rem', borderRadius: '4px', fontSize: '0.6875rem', fontWeight: '700' }}>{subOpen.length} active</span>}
                                                    {subWon.length > 0 && <span style={{ background: '#dcfce7', color: '#166534', padding: '0.1rem 0.5rem', borderRadius: '4px', fontSize: '0.6875rem', fontWeight: '700' }}>{subWon.length} won</span>}
                                                    {subPipeline > 0 && <span style={{ background: '#fef3c7', color: '#92400e', padding: '0.1rem 0.5rem', borderRadius: '4px', fontSize: '0.6875rem', fontWeight: '700' }}>${subPipeline >= 1000 ? Math.round(subPipeline/1000)+'K' : subPipeline.toLocaleString()} pipeline</span>}
                                                    {subContacts.length > 0 && <span style={{ background: '#f3e8ff', color: '#6b21a8', padding: '0.1rem 0.5rem', borderRadius: '4px', fontSize: '0.6875rem', fontWeight: '700' }}>{subContacts.length} contacts</span>}
                                                    {subOpen.length === 0 && subWon.length === 0 && <span style={{ color: '#94a3b8', fontSize: '0.75rem', fontStyle: 'italic' }}>No opportunities</span>}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                )}
                            </div>
                            )}

                            {/* KPI Cards — rolled up when subs exist */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.25rem' }}>
                                {[
                                    { value: allOpenOpps.length, sub: hasSubs && openOpps.length !== allOpenOpps.length ? `${openOpps.length} direct` : null, label: 'Active Opps', accent: '#2563eb', textColor: '#1e40af', subColor: '#3b82f6' },
                                    { value: allWonOpps.length, sub: hasSubs && wonOpps.length !== allWonOpps.length ? `${wonOpps.length} direct` : null, label: 'Won', accent: '#16a34a', textColor: '#166534', subColor: '#16a34a' },
                                    { value: '$' + (totalPipeline >= 1000 ? Math.round(totalPipeline/1000)+'K' : totalPipeline.toLocaleString()), sub: hasSubs && pv !== totalPipeline ? `$${pv >= 1000 ? Math.round(pv/1000)+'K' : pv.toLocaleString()} direct` : null, label: hasSubs ? 'Total Pipeline' : 'Pipeline', accent: '#f59e0b', textColor: '#92400e', subColor: '#b45309' },
                                    { value: totalContacts.length, sub: hasSubs && accContacts.length !== totalContacts.length ? `${accContacts.length} direct` : null, label: 'Contacts', accent: '#8b5cf6', textColor: '#6b21a8', subColor: '#9333ea' },
                                ].map(({ value, sub, label, accent, textColor, subColor }) => (
                                    <div key={label} style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '1.25rem', textAlign: 'center', borderLeft: `4px solid ${accent}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                                        <div style={{ fontSize: '2rem', fontWeight: '800', color: textColor, lineHeight: 1.1 }}>{value}</div>
                                        <div style={{ fontSize: '0.75rem', fontWeight: '700', color: subColor, textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '0.25rem' }}>{label}</div>
                                        {sub && <div style={{ fontSize: '0.6rem', color: '#94a3b8', marginTop: '0.25rem', fontWeight: '500' }}>{sub}</div>}
                                        {hasSubs && <div style={{ fontSize: '0.6rem', color: accent, marginTop: '0.1rem', fontWeight: '600', opacity: 0.7 }}>incl. {subs.length} sub{subs.length > 1 ? 's' : ''}</div>}
                                    </div>
                                ))}
                            </div>

                            {/* Won Revenue banner when subs exist */}
                            {hasSubs && totalWonValue > 0 && (
                                <div style={{ background: 'linear-gradient(135deg, #166534, #16a34a)', borderRadius: '10px', padding: '1rem 1.5rem', marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Won Revenue (Parent + All Subs)</div>
                                        <div style={{ fontSize: '1.75rem', fontWeight: '800', color: '#ffffff', marginTop: '0.125rem' }}>${totalWonValue.toLocaleString()}</div>
                                    </div>
                                    {wonValue > 0 && wonValue !== totalWonValue && (
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: '0.6875rem', color: 'rgba(255,255,255,0.7)', fontWeight: '600' }}>This account direct</div>
                                            <div style={{ fontSize: '1.125rem', fontWeight: '800', color: 'rgba(255,255,255,0.9)' }}>${wonValue.toLocaleString()}</div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Open Opportunities — all subs included when parent */}
                            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', marginBottom: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                                <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '700', color: '#0f172a' }}>
                                        Open Opportunities ({allOpenOpps.length})
                                        {hasSubs && allOpenOpps.length !== openOpps.length && <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: '500', marginLeft: '0.5rem' }}>across all sub-accounts</span>}
                                    </h3>
                                    {totalPipeline > 0 && <span style={{ fontSize: '0.875rem', fontWeight: '700', color: '#b45309' }}>${totalPipeline >= 1000 ? Math.round(totalPipeline/1000)+'K' : totalPipeline.toLocaleString()} pipeline</span>}
                                </div>
                                {allOpenOpps.length === 0 ? (
                                    <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.875rem' }}>No open opportunities</div>
                                ) : (
                                    <div>
                                        <div style={{ display: 'grid', gridTemplateColumns: hasSubs ? '1fr 130px 140px 110px 90px' : '1fr 140px 120px 110px 100px', padding: '0.5rem 1.5rem', background: '#f8fafc', borderBottom: '1px solid #f1f3f5', fontSize: '0.6875rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                            <span>Opportunity</span>{hasSubs && <span>Account</span>}<span>Stage</span><span style={{ textAlign: 'right' }}>ARR</span><span style={{ textAlign: 'center' }}>Close Date</span>
                                        </div>
                                        {[...allOpenOpps].sort((a, b) => new Date(a.forecastedCloseDate || '9999') - new Date(b.forecastedCloseDate || '9999')).map((opp, idx) => {
                                            const sc = getStageColor(opp.stage);
                                            const isSubOpp = opp.account && opp.account.toLowerCase() !== accName;
                                            return (
                                            <div key={opp.id} style={{ display: 'grid', gridTemplateColumns: hasSubs ? '1fr 130px 140px 110px 90px' : '1fr 140px 120px 110px 100px', padding: '0.625rem 1.5rem', borderBottom: '1px solid #f1f3f5', fontSize: '0.875rem', alignItems: 'center', background: idx % 2 === 0 ? '#ffffff' : '#fafbfc', cursor: 'pointer' }}
                                                onClick={() => { setViewingAccount(null); setActiveTab('pipeline'); setTimeout(() => { setEditingOpp(opp); setShowModal(true); }, 150); }}
                                                onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                                                onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? '#ffffff' : '#fafbfc'}
                                            >
                                                <div>
                                                    <div style={{ fontWeight: '600', color: '#1e293b' }}>{opp.opportunityName || 'Unnamed'}</div>
                                                    {opp.salesRep && <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{opp.salesRep}</div>}
                                                </div>
                                                {hasSubs && <span style={{ fontSize: '0.6875rem', color: isSubOpp ? '#4338ca' : '#64748b', fontWeight: isSubOpp ? '700' : '400' }}>{isSubOpp ? '↳ ' : ''}{opp.account}</span>}
                                                <span style={{ background: sc.bg, color: sc.text, padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.6875rem', fontWeight: '700' }}>{opp.stage}</span>
                                                <span style={{ textAlign: 'right', fontWeight: '700', color: '#1e293b' }}>${(opp.arr || 0).toLocaleString()}</span>
                                                <span style={{ textAlign: 'center', color: '#64748b', fontSize: '0.8125rem' }}>{opp.forecastedCloseDate ? new Date(opp.forecastedCloseDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) : '—'}</span>
                                            </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Closed Opportunities */}
                            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', marginBottom: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                                <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '700', color: '#0f172a' }}>
                                        Closed Opportunities ({allClosedOpps.length})
                                    </h3>
                                    {totalWonValue > 0 && !hasSubs && <span style={{ fontSize: '0.875rem', fontWeight: '700', color: '#16a34a' }}>Won: ${wonValue.toLocaleString()}</span>}
                                </div>
                                {allClosedOpps.length === 0 ? (
                                    <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.875rem' }}>No closed opportunities</div>
                                ) : (
                                    <div>
                                        {[...allClosedOpps].sort((a, b) => new Date(b.forecastedCloseDate || '0') - new Date(a.forecastedCloseDate || '0')).slice(0, accShowAllClosed ? allClosedOpps.length : CLOSED_LIMIT).map((opp, idx) => {
                                            const isWon = opp.stage === 'Closed Won';
                                            const isSubOpp = opp.account && opp.account.toLowerCase() !== accName;
                                            return (
                                            <div key={opp.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.625rem 1.5rem', borderBottom: '1px solid #f1f3f5', background: idx % 2 === 0 ? '#ffffff' : '#fafbfc', cursor: 'pointer' }}
                                                onClick={() => { setViewingAccount(null); setActiveTab('pipeline'); setTimeout(() => { setEditingOpp(opp); setShowModal(true); }, 150); }}
                                                onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                                                onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? '#ffffff' : '#fafbfc'}
                                            >
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ fontWeight: '600', color: '#1e293b', fontSize: '0.875rem' }}>{opp.opportunityName || 'Unnamed'}</div>
                                                    <div style={{ fontSize: '0.75rem', color: isSubOpp ? '#4338ca' : '#94a3b8' }}>{isSubOpp ? `↳ ${opp.account}` : (opp.salesRep || '')}</div>
                                                </div>
                                                <span style={{ background: isWon ? '#dcfce7' : '#fef2f2', color: isWon ? '#166534' : '#991b1b', padding: '0.2rem 0.625rem', borderRadius: '4px', fontSize: '0.6875rem', fontWeight: '700', marginRight: '1rem' }}>{opp.stage}</span>
                                                <span style={{ fontWeight: '700', color: '#1e293b', fontSize: '0.875rem', minWidth: '80px', textAlign: 'right' }}>${(opp.arr || 0).toLocaleString()}</span>
                                            </div>
                                            );
                                        })}
                                        {allClosedOpps.length > CLOSED_LIMIT && (
                                            <div style={{ padding: '0.75rem 1.5rem', textAlign: 'center', borderTop: '1px solid #e2e8f0' }}>
                                                <button onClick={() => setAccShowAllClosed(!accShowAllClosed)}
                                                    style={{ background: 'none', border: 'none', color: '#2563eb', fontWeight: '600', fontSize: '0.875rem', cursor: 'pointer', fontFamily: 'inherit' }}
                                                >{accShowAllClosed ? 'Show Less' : `See More (${allClosedOpps.length - CLOSED_LIMIT} more)`}</button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Contacts — all subs included */}
                            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', marginBottom: '2rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                                <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '700', color: '#0f172a' }}>
                                        Contacts ({totalContacts.length})
                                        {hasSubs && totalContacts.length !== accContacts.length && <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: '500', marginLeft: '0.5rem' }}>across all sub-accounts</span>}
                                    </h3>
                                </div>
                                {totalContacts.length === 0 ? (
                                    <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.875rem' }}>No contacts linked to this account</div>
                                ) : (
                                    <div>
                                        {[...totalContacts].sort((a, b) => ((a.lastName||'')+(a.firstName||'')).localeCompare((b.lastName||'')+(b.firstName||''))).slice(0, accShowAllContacts ? totalContacts.length : CONTACT_LIMIT).map((c, idx) => {
                                            const isSubContact = c.company && c.company.toLowerCase() !== accName;
                                            return (
                                            <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.25rem 1rem', borderBottom: '1px solid #f1f3f5', cursor: 'pointer', transition: 'background 0.15s', background: idx % 2 === 0 ? '#ffffff' : '#fafbfc' }}
                                                onClick={() => { setViewingAccount(null); setActiveTab('contacts'); setTimeout(() => setViewingContact(c), 100); }}
                                                onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                                                onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? '#ffffff' : '#fafbfc'}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1, minWidth: 0 }}>
                                                    <div style={{ fontWeight: '700', color: '#2563eb', fontSize: '0.75rem', whiteSpace: 'nowrap', minWidth: '140px' }}>{c.firstName} {c.lastName}</div>
                                                    <div style={{ fontSize: '0.75rem', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{c.title || ''}</div>
                                                    {isSubContact && <span style={{ fontSize: '0.625rem', color: '#4338ca', fontWeight: '700', background: '#e0e7ff', padding: '0.05rem 0.35rem', borderRadius: '3px', flexShrink: 0 }}>↳ {c.company}</span>}
                                                </div>
                                                <div style={{ display: 'flex', gap: '1.25rem', flexShrink: 0, alignItems: 'center' }}>
                                                    {c.email && <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{c.email}</div>}
                                                    {c.phone && <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{c.phone}</div>}
                                                </div>
                                            </div>
                                            );
                                        })}
                                        {totalContacts.length > CONTACT_LIMIT && (
                                            <div style={{ padding: '0.75rem 1.5rem', textAlign: 'center', borderTop: '1px solid #e2e8f0' }}>
                                                <button onClick={() => setAccShowAllContacts(!accShowAllContacts)}
                                                    style={{ background: 'none', border: 'none', color: '#2563eb', fontWeight: '600', fontSize: '0.875rem', cursor: 'pointer', fontFamily: 'inherit' }}
                                                >{accShowAllContacts ? 'Show Less' : `See More (${totalContacts.length - CONTACT_LIMIT} more)`}</button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
                );
            })()}

            {viewingContact && (() => {
                const ct = viewingContact;
                const ctFullName = (ct.firstName + ' ' + ct.lastName).trim();
                const ctNameLower = ctFullName.toLowerCase();
                // Find opps where this contact is linked — ID-based first, name fallback for legacy data
                const involvedOpps = opportunities.filter(o => {
                    if (o.contactIds && o.contactIds.includes(ct.id)) return true;
                    // Legacy fallback: name matching
                    if (!o.contacts) return false;
                    const ctFullName = (ct.firstName + ' ' + ct.lastName).trim().toLowerCase();
                    return o.contacts.split(',').map(s => s.trim().toLowerCase()).some(n => n === ctFullName || n.startsWith(ctFullName + ' ('));
                });
                const activeDeals = involvedOpps.filter(o => o.stage !== 'Closed Won' && o.stage !== 'Closed Lost');
                const closedDeals = involvedOpps.filter(o => o.stage === 'Closed Won' || o.stage === 'Closed Lost');
                const relatedAccount = ct.company ? accounts.find(a => a.name.toLowerCase() === ct.company.toLowerCase()) : null;
                const DEAL_LIMIT = 5;

                return (
                <div className="modal-overlay" onClick={() => setViewingContact(null)} style={{ alignItems: 'flex-start', paddingTop: '0', overflowY: 'auto' }}>
                    <div onClick={e => e.stopPropagation()} style={{
                        width: '100%', maxWidth: '1100px', minHeight: '100vh', margin: '0 auto',
                        background: '#f8fafc', boxShadow: '0 0 40px rgba(0,0,0,0.15)'
                    }}>
                        {/* Header bar */}
                        <div style={{ background: '#ffffff', borderBottom: '1px solid #e2e8f0', padding: '1.25rem 2rem', position: 'sticky', top: 0, zIndex: 10 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                                    <button onClick={() => setViewingContact(null)}
                                        style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '0.5rem 0.875rem', cursor: 'pointer', fontSize: '0.875rem', fontWeight: '600', color: '#475569', fontFamily: 'inherit', marginTop: '0.125rem' }}
                                    >← Back</button>
                                    <div>
                                        <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '800', color: '#0f172a' }}>{ct.firstName} {ct.lastName}</h1>
                                        {ct.title && <div style={{ color: '#64748b', fontWeight: '600', fontSize: '0.875rem', marginTop: '0.125rem' }}>{ct.title}</div>}
                                        {ct.company && (
                                            <div style={{ color: '#2563eb', fontWeight: '600', fontSize: '0.875rem', marginTop: '0.125rem', cursor: 'pointer' }}
                                                onClick={() => { if (relatedAccount) { setViewingContact(null); setActiveTab('accounts'); setTimeout(() => setViewingAccount(relatedAccount), 100); } }}
                                                onMouseEnter={e => e.target.style.textDecoration = 'underline'}
                                                onMouseLeave={e => e.target.style.textDecoration = 'none'}
                                            >{ct.company}</div>
                                        )}
                                        <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', marginTop: '0.375rem', fontSize: '0.8125rem', color: '#64748b' }}>
                                            {ct.email && <a href={'mailto:' + ct.email} style={{ color: '#2563eb', textDecoration: 'none' }}>✉️ {ct.email}</a>}
                                            {ct.phone && <span>📞 {ct.phone}</span>}
                                            {ct.mobile && <span>📱 {ct.mobile}</span>}
                                            {(ct.address || ct.city || ct.state || ct.zip) && (
                                                <span>📍 {[ct.address, [ct.city, ct.state].filter(Boolean).join(', '), ct.zip].filter(Boolean).join(', ')}</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                                    <button className="btn" onClick={() => { setViewingContact(null); handleEditContact(ct); }}>Edit Contact</button>
                                </div>
                            </div>
                        </div>

                        <div style={{ padding: '1.5rem 2rem' }}>
                            {/* KPI Cards */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.25rem' }}>
                                <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '1.25rem', textAlign: 'center', borderLeft: '4px solid #2563eb', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                                    <div style={{ fontSize: '2rem', fontWeight: '800', color: '#1e40af' }}>{activeDeals.length}</div>
                                    <div style={{ fontSize: '0.75rem', fontWeight: '700', color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Active Deals</div>
                                </div>
                                <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '1.25rem', textAlign: 'center', borderLeft: '4px solid #16a34a', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                                    <div style={{ fontSize: '2rem', fontWeight: '800', color: '#166534' }}>{closedDeals.filter(o => o.stage === 'Closed Won').length}</div>
                                    <div style={{ fontSize: '0.75rem', fontWeight: '700', color: '#16a34a', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Won</div>
                                </div>
                                <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '1.25rem', textAlign: 'center', borderLeft: '4px solid #f59e0b', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                                    <div style={{ fontSize: '2rem', fontWeight: '800', color: '#92400e' }}>${(() => { const v = activeDeals.reduce((s, o) => s + (o.arr || 0), 0); return v >= 1000 ? Math.round(v / 1000) + 'K' : v.toLocaleString(); })()}</div>
                                    <div style={{ fontSize: '0.75rem', fontWeight: '700', color: '#b45309', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Active Pipeline</div>
                                </div>
                                <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '1.25rem', textAlign: 'center', borderLeft: '4px solid #8b5cf6', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                                    <div style={{ fontSize: '2rem', fontWeight: '800', color: '#6b21a8' }}>{involvedOpps.length}</div>
                                    <div style={{ fontSize: '0.75rem', fontWeight: '700', color: '#9333ea', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Deals</div>
                                </div>
                            </div>

                            {/* Active Deals Involved With */}
                            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', marginBottom: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                                <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '700', color: '#0f172a' }}>Active Deals Involved With ({activeDeals.length})</h3>
                                </div>
                                {activeDeals.length === 0 ? (
                                    <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.875rem' }}>No active deals</div>
                                ) : (
                                    <div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px 120px 110px 100px', padding: '0.5rem 1.5rem', background: '#f8fafc', borderBottom: '1px solid #f1f3f5', fontSize: '0.6875rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                            <span>Opportunity</span><span>Stage</span><span style={{ textAlign: 'right' }}>ARR</span><span style={{ textAlign: 'center' }}>Close Date</span><span style={{ textAlign: 'center' }}>Health</span>
                                        </div>
                                        {activeDeals.sort((a, b) => new Date(a.forecastedCloseDate || '9999') - new Date(b.forecastedCloseDate || '9999')).slice(0, contactShowAllDeals ? activeDeals.length : DEAL_LIMIT).map((opp, idx) => {
                                            const sc = getStageColor(opp.stage);
                                            return (
                                            <div key={opp.id} style={{ display: 'grid', gridTemplateColumns: '1fr 140px 120px 110px 100px', padding: '0.75rem 1.5rem', borderBottom: '1px solid #f1f3f5', fontSize: '0.875rem', alignItems: 'center', background: idx % 2 === 0 ? '#ffffff' : '#fafbfc', cursor: 'pointer' }}
                                                onClick={() => { setViewingContact(null); setActiveTab('pipeline'); setTimeout(() => { setEditingOpp(opp); setShowModal(true); }, 150); }}
                                                onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                                                onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? '#ffffff' : '#fafbfc'}
                                            >
                                                <div>
                                                    <div style={{ fontWeight: '600', color: '#1e293b' }}>{opp.opportunityName || opp.account || 'Unnamed'}</div>
                                                    <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{opp.account}</div>
                                                </div>
                                                <span style={{ background: sc.bg, color: sc.text, padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.6875rem', fontWeight: '700', textAlign: 'center' }}>{opp.stage}</span>
                                                <span style={{ textAlign: 'right', fontWeight: '700', color: '#1e293b' }}>${(opp.arr || 0).toLocaleString()}</span>
                                                <span style={{ textAlign: 'center', color: '#64748b', fontSize: '0.8125rem' }}>{opp.forecastedCloseDate ? new Date(opp.forecastedCloseDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) : '—'}</span>
                                                <span style={{ textAlign: 'center' }}>
                                                    <span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', background: opp.health === 'green' ? '#16a34a' : opp.health === 'yellow' ? '#f59e0b' : opp.health === 'red' ? '#ef4444' : '#d1d5db' }} />
                                                </span>
                                            </div>
                                            );
                                        })}
                                        {activeDeals.length > DEAL_LIMIT && (
                                            <div style={{ padding: '0.75rem 1.5rem', textAlign: 'center', borderTop: '1px solid #e2e8f0' }}>
                                                <button onClick={() => setContactShowAllDeals(!contactShowAllDeals)}
                                                    style={{ background: 'none', border: 'none', color: '#2563eb', fontWeight: '600', fontSize: '0.875rem', cursor: 'pointer', fontFamily: 'inherit' }}
                                                >{contactShowAllDeals ? 'Show Less' : `See More (${activeDeals.length - DEAL_LIMIT} more)`}</button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Closed Deals */}
                            {closedDeals.length > 0 && (
                            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', marginBottom: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                                <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '700', color: '#0f172a' }}>Closed Deals ({closedDeals.length})</h3>
                                </div>
                                <div>
                                    {closedDeals.map((opp, idx) => {
                                        const isWon = opp.stage === 'Closed Won';
                                        return (
                                        <div key={opp.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1.5rem', borderBottom: '1px solid #f1f3f5', background: idx % 2 === 0 ? '#ffffff' : '#fafbfc' }}>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontWeight: '600', color: '#1e293b', fontSize: '0.875rem' }}>{opp.opportunityName || opp.account || 'Unnamed'}</div>
                                                <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{opp.account}</div>
                                            </div>
                                            <span style={{
                                                background: isWon ? '#dcfce7' : '#fef2f2', color: isWon ? '#166534' : '#991b1b',
                                                padding: '0.2rem 0.625rem', borderRadius: '4px', fontSize: '0.6875rem', fontWeight: '700', marginRight: '1rem'
                                            }}>{opp.stage}</span>
                                            <span style={{ fontWeight: '700', color: '#1e293b', fontSize: '0.875rem', minWidth: '80px', textAlign: 'right' }}>${(opp.arr || 0).toLocaleString()}</span>
                                        </div>
                                        );
                                    })}
                                </div>
                            </div>
                            )}

                            {/* Open Tasks */}
                            {(() => {
                                const ctTasks = tasks.filter(t => {
                                    const status = t.status || (t.completed ? 'Completed' : 'Open');
                                    if (status === 'Completed') return false;
                                    if (t.assignedTo && t.assignedTo.toLowerCase() === ctNameLower) return true;
                                    if (t.contactId && ct.id && t.contactId === ct.id) return true;
                                    const ctNames = (t.title || '').toLowerCase();
                                    return ctNames.includes((ct.firstName || '').toLowerCase()) && ctNames.includes((ct.lastName || '').toLowerCase());
                                }).sort((a, b) => new Date(a.dueDate || '9999') - new Date(b.dueDate || '9999'));
                                return (
                                <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', marginBottom: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                                    <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #e2e8f0' }}>
                                        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '700', color: '#0f172a' }}>Open Tasks ({ctTasks.length})</h3>
                                    </div>
                                    {ctTasks.length === 0 ? (
                                        <div style={{ padding: '1.5rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.875rem' }}>No open tasks</div>
                                    ) : (
                                        <div>
                                            {ctTasks.map((t, idx) => {
                                                const isOD = t.dueDate && new Date(t.dueDate) < new Date(new Date().toISOString().split('T')[0]);
                                                const st = t.status || 'Open';
                                                const stc = { 'Open': { bg: '#dbeafe', c: '#1e40af' }, 'In-Process': { bg: '#fef3c7', c: '#92400e' } }[st] || { bg: '#dbeafe', c: '#1e40af' };
                                                return (
                                                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 1.5rem', borderBottom: '1px solid #f1f3f5', background: idx % 2 === 0 ? '#fff' : '#fafbfc', cursor: 'pointer' }}
                                                    onClick={() => { setViewingContact(null); setActiveTab('tasks'); setTimeout(() => setViewingTask(t), 150); }}
                                                    onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                                                    onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? '#fff' : '#fafbfc'}
                                                >
                                                    <span style={{ background: stc.bg, color: stc.c, padding: '0.15rem 0.4rem', borderRadius: '3px', fontSize: '0.625rem', fontWeight: '700', flexShrink: 0, width: '65px', textAlign: 'center' }}>{st}</span>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ fontWeight: '600', fontSize: '0.8125rem', color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</div>
                                                    </div>
                                                    <span style={{ background: '#2563eb18', color: '#2563eb', padding: '0.1rem 0.4rem', borderRadius: '3px', fontSize: '0.625rem', fontWeight: '600', flexShrink: 0 }}>{t.type}</span>
                                                    <span style={{ fontSize: '0.75rem', color: isOD ? '#ef4444' : '#64748b', fontWeight: isOD ? '700' : '400', flexShrink: 0, width: '75px', textAlign: 'right' }}>
                                                        {t.dueDate ? new Date(t.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                                                    </span>
                                                    {isOD && <span style={{ background: '#ef4444', color: '#fff', padding: '0.1rem 0.35rem', borderRadius: '3px', fontSize: '0.5625rem', fontWeight: '700' }}>OVERDUE</span>}
                                                </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                                );
                            })()}

                            {/* Activity History */}
                            {(() => {
                                const ctActivities = activities.filter(a => {
                                    if (a.contactId && ct.id && a.contactId === ct.id) return true;
                                    const involvedOppIds = involvedOpps.map(o => o.id);
                                    if (a.opportunityId && involvedOppIds.includes(a.opportunityId)) return true;
                                    return false;
                                }).sort((a, b) => new Date(b.date || '2000') - new Date(a.date || '2000'));
                                return (
                                <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', marginBottom: '2rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                                    <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #e2e8f0' }}>
                                        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '700', color: '#0f172a' }}>Activity History ({ctActivities.length})</h3>
                                    </div>
                                    {ctActivities.length === 0 ? (
                                        <div style={{ padding: '1.5rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.875rem' }}>No activity history</div>
                                    ) : (
                                        <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                                            {ctActivities.map((a, idx) => {
                                                const relOpp = a.opportunityId ? opportunities.find(o => o.id === a.opportunityId) : null;
                                                return (
                                                <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '0.5rem 1.5rem', borderBottom: '1px solid #f1f3f5', background: idx % 2 === 0 ? '#fff' : '#fafbfc' }}>
                                                    <span style={{ fontSize: '0.75rem', color: '#94a3b8', flexShrink: 0, width: '70px', paddingTop: '0.1rem' }}>{a.date ? new Date(a.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}</span>
                                                    <span style={{ background: '#dbeafe', color: '#1e40af', padding: '0.1rem 0.4rem', borderRadius: '3px', fontSize: '0.625rem', fontWeight: '700', flexShrink: 0 }}>{a.type || 'Note'}</span>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ fontSize: '0.8125rem', color: '#475569' }}>{a.notes || a.subject || 'No details'}</div>
                                                        {relOpp && <div style={{ fontSize: '0.6875rem', color: '#94a3b8', marginTop: '0.125rem' }}>Opp: {relOpp.opportunityName || relOpp.account}</div>}
                                                    </div>
                                                </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                                );
                            })()}
                        </div>
                    </div>
                </div>
                );
            })()}

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
                                { keys: ['1'], desc: 'Go to Home / Dashboard' },
                                { keys: ['2'], desc: 'Go to Pipeline' },
                                { keys: ['3'], desc: 'Go to Tasks' },
                                { keys: ['4'], desc: 'Go to Accounts' },
                                { keys: ['5'], desc: 'Go to Contacts' },
                                { keys: ['6'], desc: 'Go to Analytics' },
                                { keys: ['7'], desc: 'Go to Reports' },
                            ]},
                            { section: 'Create', icon: '✏️', shortcuts: [
                                { keys: ['N'], desc: 'New Opportunity' },
                                { keys: ['A'], desc: 'New Account' },
                                { keys: ['C'], desc: 'New Contact' },
                                { keys: ['T'], desc: 'New Task' },
                            ]},
                            { section: 'Search & UI', icon: '🔍', shortcuts: [
                                { keys: ['F'], desc: 'Focus global search' },
                                { keys: ['?'], desc: 'Show / hide this panel' },
                                { keys: ['Esc'], desc: 'Close modal, popover, or toast' },
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
                    activity={editingActivity}
                    opportunities={opportunities}
                    contacts={contacts}
                    accounts={accounts}
                    onClose={() => setShowActivityModal(false)}
                    onSave={handleSaveActivity}
                    initialContext={activityInitialContext}
                    onSaveNewContact={(data) => {
                        const newId = String(Math.max(...(contacts.length ? contacts.map(c => parseInt(c.id) || 0) : [0]), 0) + 1).padStart(3, '0');
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
                        const newId = String(Math.max(...(accounts.length ? accounts.map(a => parseInt(a.id) || 0) : [0]), 0) + 1).padStart(3, '0');
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
                    onImportContacts={(newContacts) => {
                        const startId = Math.max(...(contacts.map(c => parseInt(c.id)) || [0]), 0) + 1;
                        const contactsWithIds = newContacts.map((c, i) => ({
                            ...c,
                            id: String(startId + i).padStart(3, '0'),
                            createdAt: new Date().toISOString()
                        }));
                        setContacts([...contacts, ...contactsWithIds]);
                        // Save each imported contact to the database
                        contactsWithIds.forEach(contact => {
                            dbFetch('/.netlify/functions/contacts', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(contact)
                            }).catch(err => console.error('Failed to save imported contact:', err));
                        });
                        // Auto-add companies to accounts (Item 2)
                        const existingNames = accounts.map(a => a.name.toLowerCase());
                        const newCompanies = [...new Set(
                            newContacts.map(c => c.company).filter(c => c && !existingNames.includes(c.toLowerCase()))
                        )];
                        if (newCompanies.length > 0) {
                            const accStartId = Math.max(...(accounts.map(a => parseInt(a.id)) || [0]), 0) + 1;
                            const newAccounts = newCompanies.map((name, i) => ({
                                id: String(accStartId + i).padStart(3, '0'),
                                name,
                                verticalMarket: '', address: '', city: '', state: '', zip: '',
                                country: '', website: '', phone: '', accountOwner: '',
                            }));
                            setAccounts([...accounts, ...newAccounts]);
                            // Save auto-created accounts to the database
                            newAccounts.forEach(account => {
                                dbFetch('/.netlify/functions/accounts', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify(account)
                                }).catch(err => console.error('Failed to save auto-created account:', err));
                            });
                        }
                        setShowCsvImportModal(false);
                    }}
                    onImportAccounts={(newAccounts) => {
                        const startId = Math.max(...(accounts.map(a => parseInt(a.id)) || [0]), 0) + 1;
                        const accountsWithIds = newAccounts.map((a, i) => ({
                            ...a,
                            id: String(startId + i).padStart(3, '0')
                        }));
                        setAccounts([...accounts, ...accountsWithIds]);
                        // Save each imported account to the database
                        accountsWithIds.forEach(account => {
                            dbFetch('/.netlify/functions/accounts', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(account)
                            }).catch(err => console.error('Failed to save imported account:', err));
                        });
                        setShowCsvImportModal(false);
                    }}
                />
            )}

            {showOutlookImportModal && (
                <OutlookImportModal
                    contacts={contacts}
                    opportunities={opportunities}
                    activities={activities}
                    onClose={() => setShowOutlookImportModal(false)}
                    onImport={(newActivities) => {
                        const startId = Math.max(...(activities.map(a => parseInt(a.id)) || [0]), 0) + 1;
                        const activitiesWithIds = newActivities.map((a, i) => ({
                            ...a,
                            id: String(startId + i).padStart(3, '0'),
                            createdAt: new Date().toISOString()
                        }));
                        setActivities([...activities, ...activitiesWithIds]);
                        // Save each imported activity to the database
                        activitiesWithIds.forEach(activity => {
                            dbFetch('/.netlify/functions/activities', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(activity)
                            }).catch(err => console.error('Failed to save imported activity:', err));
                        });
                        setShowOutlookImportModal(false);
                    }}
                />
            )}

            {/* Lost Reason Modal */}
            {lostReasonModal && (
                <LostReasonModal
                    oppName={lostReasonModal.pendingFormData.opportunityName || lostReasonModal.pendingFormData.account}
                    onSave={(category, reason) => completeLostSave(lostReasonModal.pendingFormData, lostReasonModal.editingOpp, reason, category)}
                    onSkip={() => completeLostSave(lostReasonModal.pendingFormData, lostReasonModal.editingOpp, '', '')}
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
                                        <span style={{ fontSize: '0.8125rem', fontWeight: '600', color: new Date(taskReminderPopup.dueDate) < new Date() ? '#ef4444' : '#1e293b' }}>
                                            {new Date(taskReminderPopup.dueDate).toLocaleDateString()}
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
                                        {new Date(taskDuePopup.dueDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
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

        </div>
    );
}

// CSV Import Modal with Field Mapping

export default App;
// build Wed, Mar  4, 2026  2:57:23 PM
