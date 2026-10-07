// src/hooks/useEscapeLayer.js
import { useEffect } from 'react';
import { takeEscape } from '../utils/escapeLayer';

// A layer's own Escape, while it is open (state §0.180): on document, in the capture
// phase — before every rail's listener (document, bubble) and App's (window) — so the
// layer on top takes the Escape and nothing under it closes too. See takeEscape.
export function useEscapeLayer(open, onEscape, blocked = false) {
    useEffect(() => {
        if (!open) return undefined;
        const onKey = (e) => { takeEscape(e, blocked, onEscape); };
        document.addEventListener('keydown', onKey, true);
        return () => document.removeEventListener('keydown', onKey, true);
    }, [open, onEscape, blocked]);
}
