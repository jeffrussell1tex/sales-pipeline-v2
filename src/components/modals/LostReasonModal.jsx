import React, { useState, useEffect } from 'react';
import { useDraggable, useResizable } from '../../hooks/useDraggable';
import ResizeHandles from '../../hooks/ResizeHandles';

// Warm stone / ink design tokens
const T = {
    sans:         '"Plus Jakarta Sans", system-ui, sans-serif',
    serif:        '"Source Serif 4", Georgia, serif',
    surface:      '#fbf8f3',
    surface2:     '#f5efe3',
    surface3:     '#f0ece4',
    border:       '#e6ddd0',
    borderStrong: '#d4c8b4',
    ink:          '#2a2622',
    inkMid:       '#5a544c',
    inkMuted:     '#8a8378',
    danger:       '#9c3a2e',
    r:            3,
};

export default function LostReasonModal({ oppName, onSave, onSkip }) {
    const lostCategories = ['Pricing / Budget', 'Competitor', 'No Decision / Stalled', 'Product Fit', 'Timing', 'Relationship / Trust', 'Internal Priority Change', 'Other'];
    const [category, setCategory] = useState('');
    const [notes, setNotes] = useState('');
    const { dragHandleProps, dragOffsetStyle, overlayStyle, clickCatcherProps, containerRef } = useDraggable();
    const { size, getResizeHandleProps } = useResizable(480, 460, 380, 340);

    // Esc closes the modal (routes to the existing safe exit — save is skipped,
    // the deal still becomes Closed Lost with no reason recorded)
    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); onSkip(); } };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onSkip]);

    return (
        <>
        <div style={{ ...overlayStyle }} />
        <div {...clickCatcherProps} />
        <div ref={containerRef}
            style={{ ...dragOffsetStyle, background: T.surface, borderRadius: T.r, width: size.w, height: size.h,
                display: 'flex', flexDirection: 'column', overflow: 'hidden',
                border: `1px solid ${T.borderStrong}`, boxShadow: '0 24px 64px rgba(42,38,34,0.28)', fontFamily: T.sans }}
            onClick={e => e.stopPropagation()}>

            {/* Header (drag handle) */}
            <div {...dragHandleProps}
                style={{ ...dragHandleProps.style, background: T.ink, padding: '14px 16px',
                    display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(255,255,255,0.12)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.125rem', flexShrink: 0 }}>😞</div>
                <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, color: '#f5f1eb' }}>Opportunity Closed Lost</div>
                    <div style={{ fontSize: 11.5, color: '#a8a196', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{oppName || 'This opportunity'}</div>
                </div>
                <button type="button" onClick={onSkip} aria-label="Close"
                    style={{ background: 'none', border: 'none', color: '#a8a196', fontSize: 20, lineHeight: 1, cursor: 'pointer', padding: '2px 4px', flexShrink: 0, fontFamily: T.sans }}>×</button>
            </div>

            {/* Scrollable body — guarantees the action row is always reachable */}
            <div style={{ padding: '16px 18px', overflowY: 'auto', flex: 1, minHeight: 0 }}>
                <p style={{ fontSize: 12.5, color: T.inkMid, lineHeight: 1.5, margin: '0 0 16px', fontFamily: T.serif }}>
                    Recording why deals are lost helps your team coach and improve. It only takes 30 seconds.
                </p>
                <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: T.inkMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Loss Category*</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                        {lostCategories.map(cat => {
                            const on = category === cat;
                            return (
                                <button key={cat} type="button" onClick={() => setCategory(cat)} style={{
                                    padding: '8px 11px', borderRadius: T.r, fontFamily: T.sans, cursor: 'pointer', textAlign: 'left', transition: 'all 0.12s',
                                    border: `1px solid ${on ? T.danger : T.border}`,
                                    background: on ? 'rgba(156,58,46,0.08)' : T.surface2,
                                    color: on ? T.danger : T.inkMid,
                                    fontSize: 12, fontWeight: on ? 700 : 500 }}>{cat}</button>
                            );
                        })}
                    </div>
                </div>
                <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: T.inkMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 7 }}>
                        Additional Notes <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
                    </div>
                    <textarea
                        value={notes} onChange={e => setNotes(e.target.value)}
                        placeholder="What specifically happened? What could we have done differently?"
                        rows={3}
                        style={{ width: '100%', padding: '9px 11px', border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 13, fontFamily: T.sans, resize: 'vertical', outline: 'none', boxSizing: 'border-box', lineHeight: 1.5, background: T.surface, color: T.ink }}
                        onFocus={e => e.target.style.borderColor = T.danger}
                        onBlur={e => e.target.style.borderColor = T.border}
                    />
                </div>
            </div>

            {/* Footer actions — pinned, never clipped */}
            <div style={{ display: 'flex', gap: 10, padding: '12px 18px', borderTop: `1px solid ${T.border}`, background: T.surface, flexShrink: 0 }}>
                <button type="button" onClick={() => onSave(category, notes.trim())} disabled={!category}
                    style={{ flex: 1, padding: '10px 16px', border: 'none', borderRadius: T.r, fontWeight: 700, fontSize: 13, fontFamily: T.sans,
                        transition: 'all 0.12s', cursor: category ? 'pointer' : 'not-allowed',
                        background: category ? T.danger : T.surface3,
                        color: category ? '#fef4e6' : T.inkMuted }}>
                    Save Loss Reason
                </button>
                <button type="button" onClick={onSkip}
                    style={{ padding: '10px 16px', background: T.surface, color: T.inkMid, border: `1px solid ${T.borderStrong}`, borderRadius: T.r, fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: T.sans }}>
                    Skip
                </button>
            </div>

            <ResizeHandles getResizeHandleProps={getResizeHandleProps} />
        </div>
        </>
    );
}
