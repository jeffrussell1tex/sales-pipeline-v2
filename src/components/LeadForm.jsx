import React, { useState } from 'react';

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






