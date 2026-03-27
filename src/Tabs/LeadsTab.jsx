import React from 'react';
import { useApp } from '../AppContext';
import { dbFetch } from '../utils/storage';

export default function LeadsTab() {
    const {
        leads, setLeads,
        setEditingOpp, setShowModal,
        setShowLeadImportModal,
        contacts,
        settings, currentUser, canSeeAll, softDelete, showConfirm,
        addAudit,
        isMobile,
    } = useApp();
    const [leadDragging, setLeadDragging] = React.useState(null); // { leadId, fromStage }
    const [leadDragOver, setLeadDragOver] = React.useState(null); // stage name
    const stageColors = { 'New':'#94a3b8','Contacted':'#0ea5e9','Qualified':'#8b5cf6','Working':'#f59e0b','Converted':'#10b981','Dead':'#ef4444' };
    const scoreBg = s => s >= 70 ? '#fee2e2' : s >= 40 ? '#fef3c7' : '#dbeafe';
    const scoreColor = s => s >= 70 ? '#dc2626' : s >= 40 ? '#d97706' : '#2563eb';
    const statusStyle = { New:{bg:'#eff6ff',color:'#2563eb'}, Contacted:{bg:'#f0fdf4',color:'#16a34a'}, Qualified:{bg:'#fdf4ff',color:'#9333ea'}, Working:{bg:'#fff7ed',color:'#ea580c'}, Converted:{bg:'#d1fae5',color:'#047857'}, Dead:{bg:'#f1f5f9',color:'#94a3b8'} };

    const visibleLeads = canSeeAll
        ? leads
        : leads.filter(l => !l.assignedTo || l.assignedTo === currentUser);

    const reps = (settings.users || []).filter(u => u.role === 'Rep' || u.role === 'User');
    const allReps = (settings.users || []).filter(u => u.name);

    const [leadFilter, setLeadFilter] = React.useState('all');
    const [leadView, setLeadView] = React.useState('list'); // 'list' | 'kanban' | 'funnel'
    const [leadFunnelExpanded, setLeadFunnelExpanded] = React.useState(null);
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

    const totalARR = visibleLeads.reduce((s, l) => s + (parseFloat(l.estimatedARR) || 0), 0);
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

    const deleteLead = (id) => {
        const lead = leads.find(l => l.id === id);
        if (!lead) return;
        showConfirm('Are you sure you want to delete this lead?', () => {
            const snapshot = [...leads];
            setLeads(prev => prev.filter(l => l.id !== id));
            dbFetch('/.netlify/functions/leads?id=' + id, { method: 'DELETE' }).catch(console.error);
            softDelete(
                `Lead "${[lead.firstName, lead.lastName].filter(Boolean).join(' ') || lead.company || 'Unnamed'}"`,
                () => {},
                () => { setLeads(snapshot); }
            );
        });
    };

    const handleLeadDrop = (toStage) => {
        if (!leadDragging || leadDragging.fromStage === toStage) {
            setLeadDragging(null); setLeadDragOver(null); return;
        }
        const updated = leads.map(l =>
            l.id === leadDragging.leadId ? { ...l, status: toStage } : l
        );
        setLeads(updated);
        const lead = updated.find(l => l.id === leadDragging.leadId);
        if (lead) dbFetch('/.netlify/functions/leads', { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(lead) }).catch(console.error);
        setLeadDragging(null); setLeadDragOver(null);
    };

    const convertLead = (lead) => {
        const updated = { ...lead, status: 'Converted', convertedAt: new Date().toISOString() };
        saveLead(updated);
        const prefill = {
            account: lead.company || '',
            opportunityName: [lead.firstName, lead.lastName].filter(Boolean).join(' ') + (lead.company ? ' - ' + lead.company : ''),
            salesRep: lead.assignedTo || currentUser || '',
            arr: lead.estimatedARR || 0,
            stage: 'Qualification',
            contacts: [lead.firstName, lead.lastName].filter(Boolean).join(' '),
            notes: lead.notes || '',
        };
        setEditingOpp(prefill);
        setShowModal(true);
    };

    const bulkAssign = () => {
        if (!assignTarget || selectedLeads.length === 0) return;
        const updated = leads.map(l => selectedLeads.includes(l.id) ? { ...l, assignedTo: assignTarget } : l);
        setLeads(updated);
        updated.filter(l => selectedLeads.includes(l.id)).forEach(l =>
            dbFetch('/.netlify/functions/leads', { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(l) }).catch(console.error)
        );
        setSelectedLeads([]); setAssignTarget('');
    };

    const repColors = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899'];
    const repLoad = allReps.filter(u => u.name).map(u => ({
        name: u.name,
        count: visibleLeads.filter(l => l.assignedTo === u.name).length
    })).filter(r => r.count > 0 || canSeeAll).slice(0, 8);
    const maxLoad = Math.max(...repLoad.map(r => r.count), 1);

    return (
        <div className="tab-page">
            {(newLead !== null) && <LeadForm lead={newLead} onSave={saveLead} onClose={() => setNewLead(null)} canSeeAll={canSeeAll} allReps={allReps} />}
            {editingLead && <LeadForm lead={editingLead} onSave={saveLead} onClose={() => setEditingLead(null)} canSeeAll={canSeeAll} allReps={allReps} />}

            <div className="tab-page-header">
                <div className="tab-page-header-bar"></div>
                <div>
                    <h2>Leads</h2>
                </div>
            </div>
            {/* ── Sub-tabs (Sales Manager style) + action buttons ── */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'1px solid #e2e8f0', marginBottom:'0' }}>
                <div style={{ display:'flex', overflowX:'auto' }}>
                    {[
                        { key:'all',     label:'All',        count: counts.all },
                        { key:'hot',     label:'🔥 Hot',     count: counts.hot },
                        { key:'New',     label:'New',        count: counts.New },
                        { key:'Working', label:'Working',    count: counts.Working },
                        ...(canSeeAll ? [{ key:'unassigned', label:'Unassigned', count: counts.unassigned }] : []),
                    ].map(f => (
                        <button key={f.key} onClick={() => setLeadFilter(f.key)} style={{
                            padding: '0.5rem 1.25rem',
                            border: 'none',
                            borderBottom: leadFilter === f.key ? '2px solid #2563eb' : '2px solid transparent',
                            background: 'transparent',
                            color: leadFilter === f.key ? '#2563eb' : '#64748b',
                            fontWeight: leadFilter === f.key ? '700' : '500',
                            fontSize: '0.875rem',
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                            transition: 'all 0.15s',
                            whiteSpace: 'nowrap',
                        }}>
                            {f.label}
                            <span style={{ marginLeft:'0.3rem', fontSize:'0.75rem', opacity:0.6 }}>{f.count}</span>
                        </button>
                    ))}
                </div>
                {/* Action buttons — right side of sub-tab row */}
                <div style={{ display:'flex', gap:'0.5rem', alignItems:'center', flexShrink:0, paddingRight:'0.75rem' }}>
                    {canSeeAll && <button onClick={() => setShowLeadImportModal(true)} style={{ padding:'0.3rem 0.75rem', border:'none', borderRadius:'6px', background:'#1c1917', color:'#f5f1eb', fontSize:'0.6875rem', fontWeight:'700', cursor:'pointer', fontFamily:'inherit' }}>📥 Import</button>}
                    <button onClick={() => setNewLead({})} style={{ padding:'0.3rem 0.75rem', border:'none', borderRadius:'6px', background:'#1c1917', color:'#f5f1eb', fontSize:'0.6875rem', fontWeight:'700', cursor:'pointer', fontFamily:'inherit' }}>+ New Lead</button>
                </div>
            </div>

            <div className="table-container">
            {/* KPI ROW */}
            <div style={{ display:'grid', gridTemplateColumns: isMobile ? 'repeat(3,1fr)' : 'repeat(5,1fr)', gap:'0.75rem', padding:'1rem 1.25rem 0' }}>
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
            <div style={{ display:'grid', gridTemplateColumns: canSeeAll && !isMobile ? '1fr 300px' : '1fr', gap:'1rem', padding:'1rem 1.25rem' }}>

                {/* LEFT: always-visible card wrapping toolbar + view content */}
                <div>
                    <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:'12px', overflow:'hidden' }}>


                        {/* VIEW TOGGLE ROW — own row below filter pills, flush left */}
                        <div style={{ display:'flex', alignItems:'center', padding:'0.375rem 1rem', borderBottom:'1px solid #e2e8f0' }}>
                            <div style={{ display:'flex', background:'#f1f5f9', borderRadius:'6px', padding:'2px', gap:'2px' }}>
                                {[{v:'funnel',label:'🔻 Funnel'},{v:'kanban',label:'⬛ Kanban'},{v:'list',label:'☰ List'}].map(({v,label}) => (
                                    <button key={v} onClick={() => setLeadView(v)}
                                        style={{ padding:'3px 8px', borderRadius:'4px', border:'none', cursor:'pointer', fontFamily:'inherit', fontSize:'0.6875rem', fontWeight:'700', transition:'all 0.15s',
                                            background: leadView===v ? '#fff' : 'transparent',
                                            color: leadView===v ? '#1e293b' : '#64748b',
                                            boxShadow: leadView===v ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* LIST VIEW */}
                        {leadView === 'list' && (
                        <div>
                            {/* Desktop table */}
                            <div className="leads-desktop-table">
                                {/* Bulk select bar */}
                                {canSeeAll && selectedLeads.length > 0 && (
                                    <div style={{ display:'flex', alignItems:'center', gap:'0.75rem', padding:'0.5rem 1rem', background:'#eff6ff', borderBottom:'1px solid #bfdbfe' }}>
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
                                <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                                <table style={{ width:'100%', borderCollapse:'collapse', minWidth: '600px' }}>
                                    <thead>
                                        <tr style={{ background:'#f8fafc', borderBottom:'1px solid #e2e8f0' }}>
                                            {canSeeAll && <th style={{ padding:'0.5rem 0.75rem', textAlign:'left', fontSize:'0.625rem', fontWeight:'700', color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.05em', width:'32px' }}><input type="checkbox" onChange={e => setSelectedLeads(e.target.checked ? filtered.map(l => l.id) : [])} checked={selectedLeads.length === filtered.length && filtered.length > 0} /></th>}
                                            {['Score','Name / Company','Source','Status', ...(canSeeAll?['Assigned To']:[]),'Est. ARR','Actions'].map(h => (
                                                <th key={h} style={{ padding:'0.5rem 0.75rem', textAlign:'left', fontSize:'0.625rem', fontWeight:'700', color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.05em' }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filtered.length === 0 ? (
                                            <tr><td colSpan={canSeeAll ? 8 : 6} style={{ padding:'2rem', textAlign:'center', color:'#94a3b8', fontSize:'0.875rem' }}>No leads found</td></tr>
                                        ) : filtered.map((lead, li) => {
                                            const isUnassigned = canSeeAll && !lead.assignedTo;
                                            return (
                                                <tr key={lead.id}
                                                    style={{ background: isUnassigned && canSeeAll ? '#fffbeb' : li % 2 === 0 ? '#ffffff' : '#f8fafc', borderBottom:'1px solid #f1f5f9', transition:'background 0.1s' }}
                                                    onMouseEnter={e => e.currentTarget.style.background = '#eff6ff'}
                                                    onMouseLeave={e => e.currentTarget.style.background = isUnassigned && canSeeAll ? '#fffbeb' : li % 2 === 0 ? '#ffffff' : '#f8fafc'}>
                                                    {canSeeAll && (
                                                        <td style={{ padding:'0.625rem 0.75rem', borderBottom:'1px solid #f1f5f9' }}>
                                                            <input type="checkbox" checked={selectedLeads.includes(lead.id)} onChange={e => setSelectedLeads(prev => e.target.checked ? [...prev, lead.id] : prev.filter(id => id !== lead.id))} />
                                                        </td>
                                                    )}
                                                    <td style={{ padding:'0.625rem 0.75rem', borderBottom:'1px solid #f1f5f9' }}>
                                                        <div style={{ width:'32px', height:'32px', borderRadius:'50%', background:scoreBg(lead.score||0), color:scoreColor(lead.score||0), display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.6875rem', fontWeight:'800' }}>{lead.score||0}</div>
                                                    </td>
                                                    <td style={{ padding:'0.625rem 0.75rem', borderBottom:'1px solid #f1f5f9' }}>
                                                        <div style={{ fontWeight:'600', color:'#1e293b', fontSize:'0.8125rem' }}>{[lead.firstName, lead.lastName].filter(Boolean).join(' ') || '—'}</div>
                                                        <div style={{ fontSize:'0.75rem', color:'#64748b' }}>{lead.company || '—'}</div>
                                                    </td>
                                                    <td style={{ padding:'0.625rem 0.75rem', borderBottom:'1px solid #f1f5f9' }}>
                                                        <span style={{ padding:'0.1rem 0.4rem', borderRadius:'4px', fontSize:'0.6rem', fontWeight:'700', background:'#f1f5f9', color:'#64748b' }}>{lead.source || '—'}</span>
                                                    </td>
                                                    <td style={{ padding:'0.625rem 0.75rem', borderBottom:'1px solid #f1f5f9' }}>
                                                        <span style={{ padding:'0.15rem 0.5rem', borderRadius:'999px', fontSize:'0.625rem', fontWeight:'700', background:(statusStyle[lead.status||'New']||statusStyle.New).bg, color:(statusStyle[lead.status||'New']||statusStyle.New).color }}>{lead.status||'New'}</span>
                                                    </td>
                                                    {canSeeAll && (
                                                        <td style={{ padding:'0.625rem 0.75rem', borderBottom:'1px solid #f1f5f9' }}>
                                                            {lead.assignedTo ? (
                                                                <div style={{ display:'flex', alignItems:'center', gap:'0.375rem' }}>
                                                                    <div style={{ width:'22px', height:'22px', borderRadius:'50%', background:'#2563eb', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.5rem', fontWeight:'700', flexShrink:0 }}>{lead.assignedTo.slice(0,2).toUpperCase()}</div>
                                                                    <span style={{ fontSize:'0.75rem', color:'#475569' }}>{lead.assignedTo}</span>
                                                                </div>
                                                            ) : (
                                                                <button onClick={() => setEditingLead(lead)} style={{ padding:'0.15rem 0.5rem', border:'1px solid #f59e0b', borderRadius:'4px', background:'none', color:'#d97706', fontSize:'0.625rem', fontWeight:'700', cursor:'pointer', fontFamily:'inherit' }}>⚡ Assign</button>
                                                            )}
                                                        </td>
                                                    )}
                                                    <td style={{ padding:'0.625rem 0.75rem', borderBottom:'1px solid #f1f5f9', fontStyle: lead.estimatedARR ? 'normal' : 'italic', color: lead.estimatedARR ? '#1e293b' : '#94a3b8', fontSize:'0.8125rem', fontWeight: lead.estimatedARR ? '600' : '400' }}>
                                                        {lead.estimatedARR ? '$' + (parseFloat(lead.estimatedARR) >= 1000 ? Math.round(parseFloat(lead.estimatedARR)/1000)+'K' : parseFloat(lead.estimatedARR).toLocaleString()) : '—'}
                                                    </td>
                                                    <td style={{ padding:'0.625rem 0.75rem', borderBottom:'1px solid #f1f5f9', fontSize:'0.6875rem' }}>
                                                        <div style={{ display:'flex', gap:'4px' }}>
                                                            <button onClick={() => setEditingLead(lead)} style={{ padding:'4px 10px', borderRadius:'999px', border:'0.5px solid #94a3b8', background:'transparent', color:'#475569', fontWeight:'500', fontSize:'0.6875rem', cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap' }}>Edit</button>
                                                            {lead.status !== 'Converted' && (
                                                                <button onClick={() => convertLead(lead)} style={{ padding:'4px 10px', borderRadius:'999px', border:'0.5px solid #6ee7b7', background:'transparent', color:'#059669', fontWeight:'500', fontSize:'0.6875rem', cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap' }}>→ Opp</button>
                                                            )}
                                                            <button onClick={() => deleteLead(lead.id)} style={{ padding:'4px 10px', borderRadius:'999px', border:'0.5px solid #fca5a5', background:'transparent', color:'#dc2626', fontWeight:'500', fontSize:'0.6875rem', cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap' }}>Delete</button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                                </div>{/* overflow wrapper */}
                            </div>
                        </div>
                        )}

                        {/* KANBAN VIEW */}
                        {leadView === 'kanban' && (
                        <div style={{ padding:'0.75rem' }}>
                            <div style={{ display:'flex', flexWrap:'wrap', gap:'0.625rem' }}>
                                {Object.entries(stageColors).map(([stage, color]) => {
                                    const colLeads = filtered.filter(l => (l.status || 'New') === stage);
                                    return (
                                        <div key={stage}
                                            onDragOver={e => { e.preventDefault(); setLeadDragOver(stage); }}
                                            onDragLeave={() => setLeadDragOver(null)}
                                            onDrop={() => handleLeadDrop(stage)}
                                            style={{ width:'190px', flexShrink:0, flexGrow:1, minWidth:'160px', maxWidth:'220px', background: leadDragOver === stage ? '#eff6ff' : '#f8fafc', border: leadDragOver === stage ? '1px solid #93c5fd' : '1px solid #e2e8f0', borderRadius:'10px', overflow:'hidden', transition:'all 0.15s' }}>
                                            <div style={{ padding:'0.5rem 0.75rem', borderTop:'3px solid '+color, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                                                <span style={{ fontSize:'0.6875rem', fontWeight:'800', color:'#475569', textTransform:'uppercase', letterSpacing:'0.04em' }}>{stage}</span>
                                                <span style={{ fontSize:'0.6rem', fontWeight:'700', background:'#e2e8f0', color:'#64748b', borderRadius:'10px', padding:'0.1rem 0.35rem' }}>{colLeads.length}</span>
                                            </div>
                                            <div style={{ padding:'0.5rem', display:'flex', flexDirection:'column', gap:'0.375rem', minHeight:'60px' }}>
                                                {colLeads.map(lead => (
                                                    <div key={lead.id}
                                                        draggable
                                                        onDragStart={() => setLeadDragging({ leadId: lead.id, fromStage: stage })}
                                                        onDragEnd={() => { setLeadDragging(null); setLeadDragOver(null); }}
                                                        style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:'6px', padding:'0.5rem 0.625rem', transition:'all 0.1s', cursor:'grab', opacity: leadDragging?.leadId === lead.id ? 0.5 : 1 }}
                                                        onMouseEnter={e => { e.currentTarget.style.borderColor='#2563eb'; e.currentTarget.style.boxShadow='0 2px 8px rgba(37,99,235,0.1)'; }}
                                                        onMouseLeave={e => { e.currentTarget.style.borderColor='#e2e8f0'; e.currentTarget.style.boxShadow='none'; }}>
                                                        <div style={{ fontSize:'0.75rem', fontWeight:'600', color:'#1e293b', marginBottom:'0.15rem', cursor:'pointer' }} onClick={() => setEditingLead(lead)}>{[lead.firstName, lead.lastName].filter(Boolean).join(' ') || lead.company || '—'}</div>
                                                        <div style={{ fontSize:'0.625rem', color:'#64748b', marginBottom:'0.25rem' }}>{lead.company || '—'}</div>
                                                        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'0.25rem' }}>
                                                            <span style={{ fontSize:'0.6rem', background:'#f1f5f9', color:'#64748b', padding:'0.1rem 0.3rem', borderRadius:'3px', fontWeight:'600' }}>{lead.source || '—'}</span>
                                                            <div style={{ width:'20px', height:'20px', borderRadius:'50%', background:scoreBg(lead.score||0), color:scoreColor(lead.score||0), display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.5rem', fontWeight:'800' }}>{lead.score||0}</div>
                                                        </div>
                                                        {canSeeAll && lead.assignedTo && <div style={{ fontSize:'0.6rem', color:'#94a3b8', marginBottom:'0.2rem' }}>{lead.assignedTo}</div>}
                                                        <div style={{ display:'flex', gap:'0.25rem', marginTop:'0.25rem' }}>
                                                            <button className="action-btn" onClick={() => setEditingLead(lead)} style={{ flex:1, padding:'0.15rem 0', fontSize:'0.6rem', textAlign:'center' }}>Edit</button>
                                                            {lead.status !== 'Converted' && <button className="action-btn" onClick={() => convertLead(lead)} style={{ flex:1, padding:'0.15rem 0', fontSize:'0.6rem', textAlign:'center', color:'#059669', borderColor:'#6ee7b7' }}>→ Opp</button>}
                                                            <button className="action-btn delete" onClick={() => deleteLead(lead.id)} style={{ flex:1, padding:'0.15rem 0', fontSize:'0.6rem', textAlign:'center' }}>Del</button>
                                                        </div>
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

                        {/* FUNNEL VIEW */}
                        {leadView === 'funnel' && (
                        <div style={{ padding:'0.75rem 1rem' }}>
                            {Object.entries(stageColors).map(([stage, color]) => {
                                const stageLeads = filtered.filter(l => (l.status || 'New') === stage);
                                const pct = filtered.length > 0 ? Math.round((stageLeads.length / filtered.length) * 100) : 0;
                                const isExp = leadFunnelExpanded === stage;
                                return (
                                    <div key={stage} style={{ marginBottom:'0.5rem' }}>
                                        <div onClick={() => setLeadFunnelExpanded(isExp ? null : stage)}
                                            style={{ display:'flex', alignItems:'center', gap:'0.75rem', padding:'0.5rem 0.75rem', borderRadius:'8px', background:'#f8fafc', border:'1px solid #e2e8f0', cursor:'pointer', transition:'all 0.15s' }}
                                            onMouseEnter={e => e.currentTarget.style.background='#f1f5f9'}
                                            onMouseLeave={e => e.currentTarget.style.background='#f8fafc'}>
                                            <div style={{ width:'10px', height:'10px', borderRadius:'50%', background:color, flexShrink:0 }} />
                                            <span style={{ fontSize:'0.8125rem', fontWeight:'700', color:'#1e293b', width:'90px', flexShrink:0 }}>{stage}</span>
                                            <div style={{ flex:1, height:'10px', background:'#e2e8f0', borderRadius:'5px', overflow:'hidden' }}>
                                                <div style={{ height:'100%', width:pct+'%', background:color, borderRadius:'5px', transition:'width 0.4s ease' }} />
                                            </div>
                                            <span style={{ fontSize:'0.75rem', fontWeight:'700', color:'#475569', minWidth:'28px', textAlign:'right' }}>{stageLeads.length}</span>
                                            <span style={{ fontSize:'0.6875rem', color:'#94a3b8', minWidth:'32px', textAlign:'right' }}>{pct}%</span>
                                            <span style={{ fontSize:'0.75rem', color:'#94a3b8', transition:'transform 0.2s', display:'inline-block', transform: isExp ? 'rotate(180deg)' : 'none' }}>▼</span>
                                        </div>
                                        {isExp && stageLeads.length > 0 && (
                                            <div style={{ marginTop:'3px', marginLeft:'1rem', display:'flex', flexDirection:'column', gap:'3px' }}>
                                                {stageLeads.map(lead => (
                                                    <div key={lead.id}
                                                        style={{ display:'flex', alignItems:'center', gap:'0.5rem', padding:'0.375rem 0.75rem', background:'#fff', border:'1px solid #f1f5f9', borderRadius:'6px', fontSize:'0.75rem', color:'#1e293b' }}
                                                        onMouseEnter={e => e.currentTarget.style.background='#f8fafc'}
                                                        onMouseLeave={e => e.currentTarget.style.background='#fff'}>
                                                        <div style={{ width:'6px', height:'6px', borderRadius:'50%', background:color, flexShrink:0 }} />
                                                        <span style={{ fontWeight:'600', cursor:'pointer', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} onClick={() => setEditingLead(lead)}>{[lead.firstName, lead.lastName].filter(Boolean).join(' ') || lead.company || '—'}</span>
                                                        {lead.company && <span style={{ color:'#94a3b8', flexShrink:0 }}>· {lead.company}</span>}
                                                        {lead.assignedTo && <span style={{ color:'#94a3b8', fontSize:'0.6875rem', flexShrink:0 }}>{lead.assignedTo}</span>}
                                                        <div style={{ display:'flex', gap:'3px', flexShrink:0, marginLeft:'auto' }}>
                                                            <button onClick={() => setEditingLead(lead)} style={{ padding:'2px 7px', borderRadius:'999px', border:'0.5px solid #94a3b8', background:'transparent', color:'#475569', fontWeight:'500', fontSize:'0.6rem', cursor:'pointer', fontFamily:'inherit' }}>Edit</button>
                                                            {lead.status !== 'Converted' && <button onClick={() => convertLead(lead)} style={{ padding:'2px 7px', borderRadius:'999px', border:'0.5px solid #6ee7b7', background:'transparent', color:'#059669', fontWeight:'500', fontSize:'0.6rem', cursor:'pointer', fontFamily:'inherit' }}>→ Opp</button>}
                                                            <button onClick={() => deleteLead(lead.id)} style={{ padding:'2px 7px', borderRadius:'999px', border:'0.5px solid #fca5a5', background:'transparent', color:'#dc2626', fontWeight:'500', fontSize:'0.6rem', cursor:'pointer', fontFamily:'inherit' }}>Del</button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                        )}

                    </div>{/* end always-visible card */}
                </div>{/* end LEFT panel */}

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
                                }} style={{ flex:1, padding:'0.4rem 0', border:'none', borderRadius:'6px', background:'#1c1917', color:'#f5f1eb', fontSize:'0.6875rem', fontWeight:'700', cursor:'pointer', fontFamily:'inherit' }}>⚡ Auto-assign All</button>
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
            </div>{/* end table-container */}
        </div>
    );
}
