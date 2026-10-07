// src/components/LayerBoundary.jsx
//
// A crash in a layer it wraps keeps the page (state §0.184). ModalLayer — the rails,
// modals and app dialogs it holds — and the quick log sat outside every ErrorBoundary
// (each tab has its own), so a render error there reached the root and React unmounted
// the whole app: a blank page (§0.183: a stale module's "useState is not defined" in
// the document rail's picker, with no boundary between it and the root). The layers
// App renders itself — the meeting prep panel, the leave guard, the header's panels —
// are not wrapped (state §9, §0.184's found (b)); a crash there reaches RootBoundary.
//
// On a crash this runs onCrash — ModalLayer's puts the modal state back as on an org
// switch, every layer closed; the quick log's closes its panel — so the state that
// crashed is not rendered again, and says what happened in place of the layers until
// it is dismissed; the page under it stays as it was.
import React from 'react';
import { T } from '../tokens.js';

export default class LayerBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { error: null };
    }

    static getDerivedStateFromError(error) {
        return { error };
    }

    componentDidCatch(error, info) {
        console.error('[LayerBoundary] a rail or modal crashed', error, info && info.componentStack);
        if (this.props.onCrash) this.props.onCrash();
    }

    render() {
        if (!this.state.error) return this.props.children;
        return (
            // Above every rail and modal (the layers it stands in for), under the app's
            // dialogs and toasts, which stay on top (tests/layers.test.mjs).
            <div role="alert" style={{
                position: 'fixed', bottom: '1.5rem', left: '50%', transform: 'translateX(-50%)', zIndex: 100000,
                background: T.ink, color: T.surface, borderRadius: 10, padding: '0.875rem 1.25rem',
                boxShadow: '0 8px 32px rgba(0,0,0,0.25)', width: 'min(480px, calc(100vw - 2rem))', boxSizing: 'border-box',
                fontFamily: T.sans,
            }}>
                <div style={{ fontSize: '0.875rem', fontWeight: 700 }}>⚠ That panel hit an error and was closed.</div>
                <div style={{ fontSize: '0.8125rem', marginTop: 4, color: 'rgba(245,241,235,0.75)' }}>
                    Anything not yet saved in it was lost; the rest of the page is as it was.
                </div>
                {this.state.error && this.state.error.message && (
                    <div style={{ fontSize: '0.75rem', marginTop: 8, fontFamily: 'monospace', color: 'rgba(245,241,235,0.6)', wordBreak: 'break-word' }}>
                        {this.state.error.message}
                    </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                    <button onClick={() => this.setState({ error: null })}
                        style={{ background: T.surface, color: T.ink, border: 'none', borderRadius: 6, padding: '0.35rem 0.9rem', fontSize: '0.8125rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                        Dismiss
                    </button>
                </div>
            </div>
        );
    }
}
