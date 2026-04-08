import React, { useState, useEffect, useRef } from 'react';
import { useDraggable } from '../../hooks/useDraggable';

export default function LostReasonModal({ oppName, onSave, onSkip }) {
    const lostCategories = ['Pricing / Budget', 'Competitor', 'No Decision / Stalled', 'Product Fit', 'Timing', 'Relationship / Trust', 'Internal Priority Change', 'Other'];
    const [category, setCategory] = useState('');
    const [notes, setNotes] = useState('');
    const { dragHandleProps, dragOffsetStyle, overlayStyle, containerRef } = useDraggable();
    return (
        <>
        <div style={{ ...overlayStyle }} />
        <div style={{ ...overlayStyle, background: 'transparent', pointerEvents: 'auto' }} onClick={onSkip} />
        <div ref={containerRef} style={{ ...dragOffsetStyle, background: '#fff', borderRadius: '16px', width: '480px', maxWidth: '92vw', overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.25)' }}
                onClick={e => e.stopPropagation()}>
                <div {...dragHandleProps} style={{ ...dragHandleProps.style, background: 'linear-gradient(135deg, #b91c1c, #ef4444)', padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.375rem', flexShrink: 0 }}>😞</div>
                    <div>
                        <div style={{ fontWeight: '800', fontSize: '1rem', color: '#fff' }}>Opportunity Closed Lost</div>
                        <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.8)', marginTop: '2px' }}>{oppName || 'This opportunity'}</div>
                    </div>
                </div>
                <div style={{ padding: '1.5rem' }}>
                    <p style={{ fontSize: '0.875rem', color: '#475569', marginBottom: '1.25rem', lineHeight: '1.5', margin: '0 0 1.25rem' }}>
                        Recording why deals are lost helps your team coach and improve. It only takes 30 seconds.
                    </p>
                    <div style={{ marginBottom: '1rem' }}>
                        <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.625rem' }}>Loss Category*</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.375rem' }}>
                            {lostCategories.map(cat => (
                                <button key={cat} type="button" onClick={() => setCategory(cat)} style={{
                                    padding: '0.5rem 0.75rem', borderRadius: '6px', fontFamily: 'inherit', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
                                    border: '1px solid ' + (category === cat ? '#ef4444' : '#e2e8f0'),
                                    background: category === cat ? '#fef2f2' : '#f8fafc',
                                    color: category === cat ? '#b91c1c' : '#475569',
                                    fontSize: '0.75rem', fontWeight: category === cat ? '700' : '500'
                                }}>{cat}</button>
                            ))}
                        </div>
                    </div>
                    <div style={{ marginBottom: '1.5rem' }}>
                        <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                            Additional Notes <span style={{ fontWeight: '400', textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
                        </div>
                        <textarea
                            value={notes} onChange={e => setNotes(e.target.value)}
                            placeholder="What specifically happened? What could we have done differently?"
                            rows={3}
                            style={{ width: '100%', padding: '0.625rem 0.75rem', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.875rem', fontFamily: 'inherit', resize: 'vertical', outline: 'none', boxSizing: 'border-box', lineHeight: '1.5' }}
                            onFocus={e => e.target.style.borderColor = '#ef4444'}
                            onBlur={e => e.target.style.borderColor = '#e2e8f0'}
                        />
                    </div>
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                        <button type="button" onClick={() => onSave(category, notes.trim())} disabled={!category}
                            style={{ flex: 1, padding: '0.7rem 1rem', border: 'none', borderRadius: '8px', fontWeight: '700', fontSize: '0.875rem', fontFamily: 'inherit', transition: 'all 0.15s', cursor: category ? 'pointer' : 'not-allowed',
                                background: category ? 'linear-gradient(135deg,#b91c1c,#ef4444)' : '#e2e8f0',
                                color: category ? '#fff' : '#94a3b8',
                                boxShadow: category ? '0 2px 8px rgba(239,68,68,0.3)' : 'none' }}>
                            Save Loss Reason
                        </button>
                        <button type="button" onClick={onSkip}
                            style={{ padding: '0.7rem 1rem', background: '#fff', color: '#94a3b8', border: '1px solid #e2e8f0', borderRadius: '8px', fontWeight: '600', fontSize: '0.875rem', cursor: 'pointer', fontFamily: 'inherit' }}>
                            Skip
                        </button>
                    </div>
                </div>
        </div>
        </>
    );
}

