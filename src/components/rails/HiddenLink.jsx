// src/components/rails/HiddenLink.jsx
// What a link field shows, in place of its picker, while it holds a record the user can't
// open — another rep's, or one since deleted (state §0.198, D16; Jeff, 11 Oct: "Say so,
// allow removing"). The name the record itself stores (a contact's company), then the muted
// words "(an account you can't open)"; with no name of its own, the words alone ("An
// account you can't open", "A deal you can't open"). The × removes the link: the field then
// holds nothing and its picker returns. Left alone, the host's Save keeps the link exactly
// as stored (utils/railLinks.js). A view passes no onRemove and draws no ×.
// Module scope, data as props.
import React from 'react';
import { T } from '../../tokens.js';
import { hiddenAside } from '../../utils/railLinks.js';

export default function HiddenLink({ name = '', hidden, onRemove = null, title = 'Remove the link' }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px 6px 10px', border: `1px solid ${T.border}`, borderRadius: T.r, background: T.surface2, fontSize: 13, color: T.ink, fontFamily: T.sans, boxSizing: 'border-box' }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {name ? <>{name} <span style={{ color: T.inkMuted }}>{hiddenAside(hidden)}</span></> : <span style={{ color: T.inkMuted }}>{hidden}</span>}
            </span>
            {onRemove && (
                <button type="button" title={title} aria-label={title} onClick={onRemove}
                    style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: T.inkMuted, fontSize: 14, lineHeight: 1, padding: '0 2px', flexShrink: 0 }}>×</button>
            )}
        </div>
    );
}
