import React, { useState } from 'react';

export default function FunnelView({ pipelineFilteredOpps, funnelExpandedStage, setFunnelExpandedStage, handleEdit, handleDelete }) {
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


