import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * useDraggable — drag-to-move hook for modals and panels.
 *
 * Supports dragging BEYOND the browser viewport — useful on ultrawide screens
 * where the app occupies one portion and you want to pull a modal over to
 * another application running alongside it.
 *
 * Implementation:
 *   - Modal renders as position:fixed using screen-absolute left/top coordinates.
 *   - Starts centered on screen (calculated from viewport dimensions).
 *   - The backing overlay becomes pointer-events:none while dragging so that
 *     mouse events outside the browser still register on the modal.
 *   - A high zIndex is applied during drag and held until the user clicks
 *     on another surface beneath it.
 *
 * Usage:
 *   const { dragHandleProps, dragContainerStyle, overlayStyle, bringToFront } = useDraggable();
 *
 *   // Modal container — replaces .modal class positioning:
 *   <div style={{ ...dragContainerStyle, maxWidth: '860px' }}>
 *
 *   // Drag handle header:
 *   <div {...dragHandleProps} style={{ ...dragHandleProps.style, background: '#1c1917', ... }}>
 *
 *   // Overlay (pass overlayStyle to the backdrop div):
 *   <div className="modal-overlay" style={overlayStyle} onClick={...}>
 *
 * NOTE: dragOffsetStyle is kept as an alias for dragContainerStyle so that any
 * existing callers that destructure dragOffsetStyle continue to work unchanged.
 */

// Global z-index counter so the most-recently-touched modal is always on top
let _globalZ = 10000;
function nextZ() { return ++_globalZ; }

export function useDraggable() {
    // null = not yet initialised (will be set on first mount measurement)
    const [pos, setPos] = useState(null);
    const [zIndex, setZIndex] = useState(10000);
    const isDragging = useRef(false);
    const dragState = useRef({ startMouse: { x: 0, y: 0 }, startPos: { x: 0, y: 0 } });
    const containerRef = useRef(null);

    // Initialise position to screen-centre on first render
    useEffect(() => {
        if (pos !== null) return;
        // Use a rAF so the modal has been painted and has a measurable size
        const raf = requestAnimationFrame(() => {
            if (containerRef.current) {
                const rect = containerRef.current.getBoundingClientRect();
                setPos({
                    x: Math.round((window.innerWidth  - rect.width)  / 2),
                    y: Math.round((window.innerHeight - rect.height) / 2),
                });
            } else {
                // Fallback: rough centre before measurement
                setPos({
                    x: Math.round(window.innerWidth  * 0.5 - 430),
                    y: Math.round(window.innerHeight * 0.5 - 300),
                });
            }
        });
        return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const bringToFront = useCallback(() => {
        setZIndex(nextZ());
    }, []);

    const onMouseDown = useCallback((e) => {
        if (e.button !== 0) return;
        if (e.target.closest('button, input, select, textarea, a, [role="button"]')) return;

        e.preventDefault();
        bringToFront();

        const currentPos = pos || { x: 0, y: 0 };
        isDragging.current = true;
        dragState.current = {
            startMouse: { x: e.clientX, y: e.clientY },
            startPos:   { x: currentPos.x, y: currentPos.y },
        };

        // Make overlay non-blocking so pointer events reach content outside the window
        const overlays = document.querySelectorAll('.modal-overlay');
        overlays.forEach(o => { o._prevPE = o.style.pointerEvents; o.style.pointerEvents = 'none'; });

        const onMove = (ev) => {
            if (!isDragging.current) return;
            setPos({
                x: dragState.current.startPos.x + ev.clientX - dragState.current.startMouse.x,
                y: dragState.current.startPos.y + ev.clientY - dragState.current.startMouse.y,
            });
        };

        const onUp = () => {
            isDragging.current = false;
            // Restore overlay pointer events
            const overlays2 = document.querySelectorAll('.modal-overlay');
            overlays2.forEach(o => { o.style.pointerEvents = o._prevPE || ''; });
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup',   onUp);
        };

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup',   onUp);
    }, [pos, bringToFront]);

    // While pos is not yet initialised render the modal invisibly so the
    // measurement rAF can get a real rect without a layout flash.
    const dragContainerStyle = pos === null
        ? {
            position: 'fixed',
            visibility: 'hidden',
            left: '50%',
            top:  '50%',
            transform: 'translate(-50%, -50%)',
            zIndex,
        }
        : {
            position: 'fixed',
            left: pos.x,
            top:  pos.y,
            transform: 'none',
            zIndex,
            // Remove any maxWidth constraints imposed by .modal CSS class
            // (callers supply their own maxWidth inline)
            margin: 0,
        };

    // The overlay must NOT be centered-flex while the modal is fixed-positioned;
    // it becomes a transparent full-screen click-capture layer only.
    const overlayStyle = {
        position: 'fixed',
        inset: 0,
        // Keep a light backdrop but don't use flexbox centering — the modal
        // positions itself with fixed left/top.
        background: 'rgba(0,0,0,0.35)',
        zIndex: zIndex - 1,
    };

    const dragHandleProps = {
        onMouseDown,
        onClick: bringToFront,
        style: {
            cursor: isDragging.current ? 'grabbing' : 'grab',
            userSelect: 'none',
        },
    };

    // Alias kept for backward compatibility with existing modals
    const dragOffsetStyle = dragContainerStyle;

    return {
        dragHandleProps,
        dragOffsetStyle,
        dragContainerStyle,
        overlayStyle,
        bringToFront,
        containerRef,
    };
}
