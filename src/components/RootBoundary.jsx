// src/components/RootBoundary.jsx
//
// The last boundary (state §0.184): a render error that no other boundary catches — in
// App's own render: the frame, the banner, the TASKS badge's count — reached the root,
// and React unmounted the whole app: a blank page with nothing to say why. This keeps a
// page: what happened, and a Reload. The tabs have their own boundaries (ErrorBoundary),
// and every layer App renders its own (LayerBoundary, §0.185), which keep the rest of
// the page; this is for the rest. Outside ClerkProvider, so it holds no state of the
// app's.
import React from 'react';
import { T } from '../tokens.js';

export default class RootBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { error: null };
    }

    static getDerivedStateFromError(error) {
        return { error };
    }

    componentDidCatch(error, info) {
        console.error('[RootBoundary] the app crashed', error, info && info.componentStack);
    }

    render() {
        if (!this.state.error) return this.props.children;
        return (
            <div role="alert" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: T.bg, padding: '2rem', boxSizing: 'border-box', fontFamily: T.sans }}>
                <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: '2rem', maxWidth: 440, width: '100%', boxShadow: '0 4px 16px rgba(0,0,0,0.06)', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.0625rem', fontWeight: 700, color: T.ink }}>Something went wrong</div>
                    <p style={{ fontSize: '0.875rem', color: T.inkMid, margin: '0.5rem 0 1.25rem', lineHeight: 1.6 }}>
                        The app hit an unexpected error. Reload the page to continue; anything not yet saved may be lost.
                    </p>
                    {this.state.error && this.state.error.message && (
                        <div style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: T.inkMuted, marginBottom: '1.25rem', wordBreak: 'break-word', textAlign: 'left' }}>
                            {this.state.error.message}
                        </div>
                    )}
                    <button onClick={() => window.location.reload()}
                        style={{ padding: '0.5rem 1.5rem', background: T.ink, color: '#f5f1eb', border: 'none', borderRadius: 7, fontSize: '0.875rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                        Reload
                    </button>
                </div>
            </div>
        );
    }
}
