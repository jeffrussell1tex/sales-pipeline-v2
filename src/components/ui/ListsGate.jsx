// src/components/ui/ListsGate.jsx
// What stands in for a screen until every list it draws from was read (state §0.294; src/utils/listLoads.js, guide
// §18b139): what is loading; or which lists could not be loaded, why, and Try again — never "none", a count or a total of
// a list that was not read. ListsGate is a tab's, or a Settings panel's (PanelGate.jsx); ListsWait.jsx a window's, opened before its lists were read. A
// list read once keeps its screen whatever a later load does (the banner says that one).
import React from 'react';
import { T } from '../../tokens.js';
import { areRead, failedOf, unreadWords } from '../../utils/listLoads.js';

// Why, and Try again for the lists that failed.
export function Unread({ loads, lists, onRetry, children }) {
    const failed = failedOf(loads, lists);
    const trying = failed.every(n => loads[n].out);
    return (
        <div role={failed.length ? 'alert' : 'status'} style={{ textAlign: 'center', color: T.inkMuted, fontSize: 14, fontFamily: T.sans }}>
            <div style={{ color: failed.length ? T.ink : T.inkMuted, fontWeight: failed.length ? 600 : 400 }}>{unreadWords(loads, lists)}</div>
            {failed.length > 0 && (
                <>
                    <div style={{ marginTop: 6 }}>Nothing is missing from the server — this waits for what it reads.</div>
                    <button type="button" onClick={() => onRetry(failed)} disabled={trying}
                        style={{ marginTop: 14, padding: '8px 18px', background: T.ink, color: '#f5f1eb', border: 'none', borderRadius: T.r, fontSize: 13, fontWeight: 700, fontFamily: T.sans, cursor: trying ? 'default' : 'pointer', opacity: trying ? 0.7 : 1 }}>
                        {trying ? 'Trying…' : 'Try again'}
                    </button>
                </>
            )}
            {children}
        </div>
    );
}

export const quietBtn = { padding: '6px 14px', background: 'transparent', border: `1px solid ${T.border}`, color: T.inkMid, borderRadius: T.r, fontSize: 13, fontWeight: 600, fontFamily: T.sans, cursor: 'pointer' };

export default function ListsGate({ loads, lists, onRetry, onBack = null, children }) {
    if (areRead(loads, lists)) return children;
    return (
        <div className="tab-page" style={{ padding: '3rem 1.5rem' }}>
            <Unread loads={loads} lists={lists} onRetry={onRetry}>
                {onBack && <div style={{ marginTop: 14 }}><button type="button" onClick={onBack} style={quietBtn}>← Back</button></div>}
            </Unread>
        </div>
    );
}
