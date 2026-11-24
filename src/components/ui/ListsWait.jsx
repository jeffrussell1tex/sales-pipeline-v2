// src/components/ui/ListsWait.jsx
// Over the page, in place of a record's window asked for before the lists it reads were read (state §0.294; ModalLayer,
// listLoads.js RECORD_LISTS): what is loading, or what failed and Try again. The window opens by itself once they are read;
// Close — its button, the backdrop, Escape — takes it back. It has a place of its own in the
// Escape order, over every rail: it is drawn over them.
import React from 'react';
import { useApp } from '../../AppContext';
import { useEscapeLayer } from '../../hooks/useEscapeLayer';
import { T } from '../../tokens.js';
import { Unread, quietBtn } from './ListsGate.jsx';

export default function ListsWait({ lists, onClose }) {
    const { loads, retryLoads, escapeBlocked } = useApp();
    useEscapeLayer(true, onClose, escapeBlocked('recordWait'));
    return (
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 11105, background: 'rgba(28,25,23,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div role="dialog" aria-modal="true" onClick={e => e.stopPropagation()} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 5, padding: '24px 28px', maxWidth: 440, width: '100%', boxSizing: 'border-box', boxShadow: '0 12px 40px rgba(0,0,0,0.18)' }}>
                <Unread loads={loads} lists={lists} onRetry={retryLoads}>
                    <div style={{ marginTop: 14 }}><button type="button" onClick={onClose} style={quietBtn}>Close</button></div>
                </Unread>
            </div>
        </div>
    );
}
