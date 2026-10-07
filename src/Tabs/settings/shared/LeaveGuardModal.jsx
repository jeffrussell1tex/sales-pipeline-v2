// settings/shared/LeaveGuardModal.jsx — "Unsaved changes", asked before leaving a
// Settings panel (AdminView) or a page with unsaved edits (App: Settings, and the
// Sales Manager's incentives). One dialog for both (state §0.170): App kept its
// own, which nothing ever opened — leaving Settings by the top nav dropped an
// unsaved edit without a word.
//
// Escape is Stay, as its backdrop is (state §0.186) — never while a save is out — and
// it is the guard's alone while it is open: it takes the Escape before anything under
// it, and passes it on only to the app's dialogs above it (escapeBlocked).
//
// Module scope — a component defined inside its parent would be a new type on
// every render and remount mid-save.
import React from 'react';
import { T } from './tokens.js';
import { useApp } from '../../../AppContext';
import { useEscapeLayer } from '../../../hooks/useEscapeLayer';

export function LeaveGuardModal({ saving, canSave, failed, onStay, onSave, onDiscard,
    message = 'This panel has changes that have not been saved. Save them, or discard and continue.' }) {
    const app = useApp();
    useEscapeLayer(true, () => { if (!saving) onStay(); }, app && app.escapeBlocked ? app.escapeBlocked('leaveGuard') : false);
    return (
    <div style={{ position:'fixed', inset:0, zIndex:99999, display:'flex', alignItems:'center', justifyContent:'center',
        background:'rgba(42,38,34,0.55)' }} onClick={saving ? undefined : onStay}>
        <div onClick={e => e.stopPropagation()}
            style={{ background:T.surface, borderRadius:8, boxShadow:'0 24px 64px rgba(42,38,34,0.22)',
                width:420, maxWidth:'92vw', padding:'26px 30px', fontFamily:T.sans }}>
            <div style={{ fontSize:17, fontWeight:700, color:T.ink, marginBottom:8 }}>Unsaved changes</div>
            {failed && (
                <div style={{ fontSize:12.5, fontWeight:600, color:T.danger, marginBottom:10, fontFamily:T.sans }}>
                    The save did not go through — the page behind this dialog shows why. Your changes are still here.
                </div>
            )}
            <div style={{ fontSize:13.5, color:T.inkMid, lineHeight:1.55, marginBottom:22 }}>
                {message}
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {canSave && (
                    <button onClick={onSave} disabled={saving}
                        style={{ padding:'10px 16px', background:T.ink, color:'#fbf8f3', border:'none', borderRadius:4,
                            fontSize:13.5, fontWeight:600, cursor:saving?'default':'pointer', textAlign:'left',
                            opacity:saving?0.6:1, fontFamily:T.sans }}>
                        {saving ? 'Saving…' : 'Save changes and continue'}
                    </button>
                )}
                <button onClick={onStay} disabled={saving}
                    style={{ padding:'10px 16px', background:canSave?'transparent':T.ink,
                        color:canSave?T.inkMid:'#fbf8f3', border:canSave?`1px solid ${T.borderStrong}`:'none',
                        borderRadius:4, fontSize:13.5, fontWeight:600, cursor:saving?'default':'pointer',
                        textAlign:'left', fontFamily:T.sans }}>
                    Stay here
                </button>
                <button onClick={onDiscard} disabled={saving}
                    style={{ padding:'10px 16px', background:'transparent', color:T.danger,
                        border:`1px solid ${T.border}`, borderRadius:4, fontSize:13.5, fontWeight:500,
                        cursor:saving?'default':'pointer', textAlign:'left', fontFamily:T.sans }}>
                    Discard changes and continue
                </button>
            </div>
        </div>
    </div>
    );
}
