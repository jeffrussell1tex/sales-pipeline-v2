import React, { useState } from 'react';

export default function KanbanView({ pipelineFilteredOpps, kanbanDragging, kanbanDragOver, setKanbanDragging, setKanbanDragOver, handleEdit, handleDelete }) {
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



