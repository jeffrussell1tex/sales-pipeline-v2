// src/components/rails/DealPrepPicker.jsx
//
// "Prep for which deal?" (state §0.187; Jeff: "offer the list of deals"). A contact or an
// account with more than one open deal offers them under its Prep, as the contact rail's
// email templates sit under its Email ▾: each deal a row — its name, stage and amount —
// and a row opens the meeting prep panel on that deal. One open deal needs no list; Prep
// opens on it. Module scope, data as props.
import React from 'react';
import { T } from '../../tokens.js';

export default function DealPrepPicker({ deals, onPick }) {
    return (
        <div style={{ padding: '8px 16px 10px', background: T.surface2, borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: T.inkMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6, fontFamily: T.sans }}>
                Prep for which deal?
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {deals.map(d => (
                    <button key={d.id} type="button" onClick={() => onPick(d)}
                        style={{ display: 'block', width: '100%', textAlign: 'left', background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r, padding: '7px 10px', fontSize: 12, cursor: 'pointer', fontFamily: T.sans, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {d.opportunityName || d.account || 'Untitled deal'}
                        </div>
                        <div style={{ color: T.inkMuted, marginTop: 2 }}>
                            {[d.stage, d.arr ? `$${Number(d.arr).toLocaleString()}` : null].filter(Boolean).join(' · ')}
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
}
