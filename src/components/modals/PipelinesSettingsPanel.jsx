import React, { useState, useEffect, useRef } from 'react';

export default function PipelinesSettingsPanel({ settings, setSettings, opportunities, activePipelineId, setActivePipelineId, onBack, onSave, onCancel }) {
    const pipelines = (settings.pipelines && settings.pipelines.length > 0)
        ? settings.pipelines
        : [{ id: 'default', name: 'New Business', color: '#2563eb' }];
    const pipelineColors = ['#2563eb','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#0891b2','#065f46','#92400e','#1e293b'];
    const [newPipelineName, setNewPipelineName] = useState('');
    const [newPipelineColor, setNewPipelineColor] = useState('#10b981');
    const [editingPipelineId, setEditingPipelineId] = useState(null);
    const [editPipelineName, setEditPipelineName] = useState('');

    const addPipeline = () => {
        if (!newPipelineName.trim()) return;
        const newId = 'pl_' + Date.now();
        setSettings(prev => ({
            ...prev,
            pipelines: [...(prev.pipelines || [{ id:'default', name:'New Business', color:'#2563eb' }]), { id: newId, name: newPipelineName.trim(), color: newPipelineColor }]
        }));
        setNewPipelineName('');
    };
    const deletePipeline = (id) => {
        if (pipelines.length === 1) { alert('You must have at least one pipeline.'); return; }
        const oppCount = (opportunities||[]).filter(o => (o.pipelineId||'default') === id).length;
        const doDelete = () => {
            setSettings(prev => ({ ...prev, pipelines: (prev.pipelines||[]).filter(p => p.id !== id) }));
            if (activePipelineId === id) setActivePipelineId((pipelines.find(p => p.id !== id) || pipelines[0]).id);
        };
        if (oppCount > 0) {
            showConfirm(`This pipeline has ${oppCount} opportunit${oppCount===1?'y':'ies'}. Deleting it will mark them unassigned. Continue?`, doDelete);
        } else {
            doDelete();
        }
    };
    const savePipelineName = (id) => {
        if (!editPipelineName.trim()) { setEditingPipelineId(null); return; }
        setSettings(prev => ({ ...prev, pipelines: (prev.pipelines||[]).map(p => p.id === id ? { ...p, name: editPipelineName.trim() } : p) }));
        setEditingPipelineId(null);
    };

    return (
        <div className="table-container">
            <div className="table-header">
                <button className="btn btn-secondary" onClick={onBack} style={{ marginRight: '1rem' }}>← Back</button>
                <h2>PIPELINES</h2>
            </div>
            <div style={{ padding: '1.5rem', maxWidth: '640px' }}>
                <p style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '1.5rem', lineHeight: '1.6' }}>
                    Create separate pipelines for different business types — for example, <strong>New Business</strong>, <strong>Renewals</strong>, or product-specific pipelines. Switch between pipelines using the bar below the navigation tabs.
                </p>

                <div style={{ display: 'grid', gap: '0.75rem', marginBottom: '2rem' }}>
                    {pipelines.map((p) => {
                        const oppCount = (opportunities||[]).filter(o => (o.pipelineId||'default') === p.id).length;
                        const wonCount = (opportunities||[]).filter(o => (o.pipelineId||'default') === p.id && o.stage === 'Closed Won').length;
                        const isEditing = editingPipelineId === p.id;
                        return (
                            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem 1.25rem', background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: '10px', borderLeft: `4px solid ${p.color}` }}>
                                <div style={{ position: 'relative', flexShrink: 0 }}>
                                    <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: p.color, cursor: 'pointer', border: '2px solid rgba(0,0,0,0.08)' }}
                                        onClick={() => document.getElementById('cp-'+p.id).click()} title="Click to change color" />
                                    <input type="color" id={'cp-'+p.id} value={p.color} style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
                                        onChange={e => setSettings(prev => ({ ...prev, pipelines: (prev.pipelines||[]).map(pl => pl.id === p.id ? { ...pl, color: e.target.value } : pl) }))} />
                                </div>
                                {isEditing ? (
                                    <input autoFocus value={editPipelineName}
                                        onChange={e => setEditPipelineName(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter') savePipelineName(p.id); if (e.key === 'Escape') setEditingPipelineId(null); }}
                                        onBlur={() => savePipelineName(p.id)}
                                        style={{ flex: 1, padding: '0.375rem 0.625rem', border: '1.5px solid #2563eb', borderRadius: '6px', fontSize: '0.9375rem', fontWeight: '700', fontFamily: 'inherit', outline: 'none' }} />
                                ) : (
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: '700', fontSize: '0.9375rem', color: '#1e293b' }}>{p.name}</div>
                                        <div style={{ fontSize: '0.6875rem', color: '#94a3b8', marginTop: '0.125rem' }}>
                                            {oppCount} opportunit{oppCount!==1?'ies':'y'} · {wonCount} won
                                            {p.id === 'default' && <span style={{ marginLeft: '0.5rem', background: '#e0e7ff', color: '#4338ca', padding: '0.0625rem 0.375rem', borderRadius: '999px', fontSize: '0.625rem', fontWeight: '700' }}>DEFAULT</span>}
                                        </div>
                                    </div>
                                )}
                                {activePipelineId === p.id && (
                                    <span style={{ fontSize: '0.625rem', fontWeight: '700', background: p.color, color: '#fff', padding: '0.125rem 0.5rem', borderRadius: '999px', flexShrink: 0 }}>ACTIVE</span>
                                )}
                                <div style={{ display: 'flex', gap: '0.375rem', flexShrink: 0 }}>
                                    <button onClick={() => setActivePipelineId(p.id)} style={{ padding: '0.3rem 0.625rem', borderRadius: '6px', border: '1px solid #e2e8f0', background: activePipelineId === p.id ? '#eff6ff' : '#fff', color: activePipelineId === p.id ? '#2563eb' : '#475569', fontFamily: 'inherit', fontSize: '0.6875rem', fontWeight: '600', cursor: 'pointer' }}>
                                        {activePipelineId === p.id ? '✓ Active' : 'Switch'}
                                    </button>
                                    <button onClick={() => { setEditingPipelineId(p.id); setEditPipelineName(p.name); }} style={{ padding: '0.3rem 0.625rem', borderRadius: '6px', border: '1px solid #e2e8f0', background: '#fff', color: '#475569', fontFamily: 'inherit', fontSize: '0.6875rem', fontWeight: '600', cursor: 'pointer' }}>Rename</button>
                                    {pipelines.length > 1 && (
                                        <button onClick={() => deletePipeline(p.id)} style={{ padding: '0.3rem 0.625rem', borderRadius: '6px', border: '1px solid #fecaca', background: '#fff', color: '#ef4444', fontFamily: 'inherit', fontSize: '0.6875rem', fontWeight: '600', cursor: 'pointer' }}>Delete</button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div style={{ background: '#f8fafc', border: '1.5px dashed #cbd5e1', borderRadius: '10px', padding: '1.25rem' }}>
                    <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.875rem' }}>Add New Pipeline</div>
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                        <input type="text" value={newPipelineName} placeholder="e.g. Renewals, Enterprise, Product Line B…"
                            onChange={e => setNewPipelineName(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && addPipeline()}
                            style={{ flex: 1, padding: '0.625rem 0.875rem', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '0.875rem', fontFamily: 'inherit', outline: 'none' }}
                            onFocus={e => e.target.style.borderColor = '#2563eb'}
                            onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
                        <div style={{ display: 'flex', gap: '0.375rem', flexShrink: 0 }}>
                            {pipelineColors.map(c => (
                                <div key={c} onClick={() => setNewPipelineColor(c)} style={{ width: '20px', height: '20px', borderRadius: '50%', background: c, cursor: 'pointer', border: newPipelineColor === c ? '3px solid #1e293b' : '2px solid transparent', transition: 'all 0.15s', boxSizing: 'border-box' }} />
                            ))}
                        </div>
                        <button onClick={addPipeline} disabled={!newPipelineName.trim()} style={{ padding: '0.625rem 1.25rem', background: newPipelineName.trim() ? '#1c1917' : '#e2e8f0', color: newPipelineName.trim() ? '#f5f1eb' : '#94a3b8', border: 'none', borderRadius: '8px', fontFamily: 'inherit', fontSize: '0.8125rem', fontWeight: '700', cursor: newPipelineName.trim() ? 'pointer' : 'not-allowed' }}>
                            + Add
                        </button>
                    </div>
                </div>

                <div style={{ marginTop: '1.5rem', padding: '1rem 1.25rem', background: '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe', fontSize: '0.8125rem', color: '#1e40af' }}>
                    💡 <strong>Tip:</strong> Each pipeline has its own view of opportunities, KPIs, analytics, and reports. Switch between them using the pipeline bar below the navigation tabs. You can also reassign any deal to a different pipeline by editing it.
                </div>
            </div>
            <div style={{ display:'flex', gap:'0.75rem', padding:'1rem 1.5rem', borderTop:'1px solid #e2e8f0', background:'#f8fafc', marginTop:'1rem' }}>
                <button onClick={onSave}
                    style={{ padding:'0.5rem 1.5rem', background:'#1c1917', color:'#f5f1eb', border:'none', borderRadius:'7px', fontSize:'0.875rem', fontWeight:'700', cursor:'pointer', fontFamily:'inherit' }}>
                    Save changes
                </button>
                <button onClick={onCancel}
                    style={{ padding:'0.5rem 1.25rem', background:'transparent', color:'#64748b', border:'1px solid #e2e8f0', borderRadius:'7px', fontSize:'0.875rem', fontWeight:'600', cursor:'pointer', fontFamily:'inherit' }}>
                    Cancel
                </button>
            </div>
        </div>
    );
}

