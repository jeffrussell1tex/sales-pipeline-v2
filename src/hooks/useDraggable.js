import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * useDraggable — drag-to-move hook for modals and panels.
 *
 * Cross-screen dragging on ultrawide setups:
 * - Modal is position:fixed. Negative left/top values let it live off-screen.
 * - Overlay is pointer-events:none — purely visual, never intercepts mouse.
 * - Click-catcher is also pointer-events:none WHILE the mouse button is held,
 *   so dragging off the browser edge never accidentally closes the modal.
 * - Drag uses mousemove on document (capture phase) + a mouseleave fallback
 *   that freezes position when the cursor exits the browser entirely.
 */

let _globalZ = 10000;
function nextZ() { return ++_globalZ; }

// Global flag — true while ANY modal drag is in progress.
// Click-catchers read this to suppress their onClick during drag.
let _anyDragging = false;

export function useDraggable() {
    const [pos, setPos]         = useState(null);
    const [zIndex, setZIndex]   = useState(10000);
    const [isDragging, setIsDragging] = useState(false);
    const dragging     = useRef(false);
    const dragState    = useRef({ startMouse: { x: 0, y: 0 }, startPos: { x: 0, y: 0 } });
    const containerRef = useRef(null);
    const posRef       = useRef(null);

    useEffect(() => { posRef.current = pos; }, [pos]);

    // Centre on first paint via rAF measurement
    useEffect(() => {
        if (pos !== null) return;
        const id = requestAnimationFrame(() => {
            const el = containerRef.current;
            if (el) {
                const rect = el.getBoundingClientRect();
                const x = Math.round((window.innerWidth  - rect.width)  / 2);
                const y = Math.round((window.innerHeight - rect.height) / 2);
                setPos({ x, y });
                posRef.current = { x, y };
            } else {
                const fallback = { x: Math.round(window.innerWidth * 0.5 - 430), y: 80 };
                setPos(fallback);
                posRef.current = fallback;
            }
        });
        return () => cancelAnimationFrame(id);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const bringToFront = useCallback(() => setZIndex(nextZ()), []);

    const onMouseDown = useCallback((e) => {
        if (e.button !== 0) return;
        if (e.target.closest('button, input, select, textarea, a, [role="button"]')) return;
        e.preventDefault();
        bringToFront();

        const cur = posRef.current || { x: 0, y: 0 };
        dragging.current = true;
        _anyDragging = true;
        setIsDragging(true);
        dragState.current = {
            startMouse: { x: e.clientX, y: e.clientY },
            startPos:   { x: cur.x,     y: cur.y },
        };

        const prevSelect = document.body.style.userSelect;
        document.body.style.userSelect = 'none';

        const onMove = (ev) => {
            if (!dragging.current) return;
            const nx = dragState.current.startPos.x + ev.clientX - dragState.current.startMouse.x;
            const ny = dragState.current.startPos.y + ev.clientY - dragState.current.startMouse.y;
            setPos({ x: nx, y: ny });
            posRef.current = { x: nx, y: ny };
        };

        // When mouse exits the browser window, freeze position (don't snap back)
        const onLeave = () => {
            // Position is already frozen at last known coords — nothing to do.
            // The modal stays exactly where it was when the cursor left.
        };

        const onUp = () => {
            dragging.current = false;
            _anyDragging = false;
            setIsDragging(false);
            document.body.style.userSelect = prevSelect;
            document.removeEventListener('mousemove', onMove, true);
            document.removeEventListener('mouseup',   onUp,   true);
            document.documentElement.removeEventListener('mouseleave', onLeave, true);
        };

        document.addEventListener('mousemove', onMove, true);
        document.addEventListener('mouseup',   onUp,   true);
        document.documentElement.addEventListener('mouseleave', onLeave, true);
    }, [bringToFront]);

    const dragContainerStyle = pos === null
        ? { position: 'fixed', visibility: 'hidden', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', zIndex }
        : { position: 'fixed', left: pos.x, top: pos.y, transform: 'none', margin: 0, zIndex };

    // Purely visual backdrop — never intercepts mouse events
    const overlayStyle = {
        position:      'fixed',
        inset:         0,
        background:    'rgba(0,0,0,0.35)',
        zIndex:        zIndex - 1,
        pointerEvents: 'none',
    };

    // Click-catcher: enabled only when not dragging.
    // IMPORTANT: pointer-events:none during any drag so moving off-screen
    // never triggers onClose on a different modal's catcher.
    const clickCatcherStyle = {
        position:      'fixed',
        inset:         0,
        zIndex:        zIndex - 1,
        background:    'transparent',
        pointerEvents: isDragging ? 'none' : 'auto',
    };

    const dragHandleProps = {
        onMouseDown,
        onClick: bringToFront,
        style: { cursor: isDragging ? 'grabbing' : 'grab', userSelect: 'none' },
    };

    const dragOffsetStyle = dragContainerStyle;

    return {
        dragHandleProps,
        dragOffsetStyle,
        dragContainerStyle,
        overlayStyle,
        clickCatcherStyle,
        isDragging,
        bringToFront,
        containerRef,
    };
}


/**
 * useResizable — 4-corner resize.
 * Document capture-phase listeners work across screen boundaries.
 */
export function useResizable(initialW, initialH, minW = 400, minH = 320) {
    const [size, setSize] = useState({ w: initialW, h: initialH });
    const resizing    = useRef(false);
    const resizeState = useRef({});
    const sizeRef     = useRef({ w: initialW, h: initialH });

    useEffect(() => { sizeRef.current = size; }, [size]);

    const getResizeHandleProps = useCallback((direction) => ({
        onMouseDown: (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (resizing.current) return;
            resizing.current = true;

            const prevSelect = document.body.style.userSelect;
            document.body.style.userSelect = 'none';

            resizeState.current = {
                direction,
                startX: e.clientX,
                startY: e.clientY,
                startW: sizeRef.current.w,
                startH: sizeRef.current.h,
            };

            const onMove = (ev) => {
                if (!resizing.current) return;
                const { direction: dir, startX, startY, startW, startH } = resizeState.current;
                const dx = ev.clientX - startX;
                const dy = ev.clientY - startY;
                let newW = startW;
                let newH = startH;
                if (dir.includes('e')) newW = Math.max(minW, startW + dx);
                if (dir.includes('w')) newW = Math.max(minW, startW - dx);
                if (dir.includes('s')) newH = Math.max(minH, startH + dy);
                if (dir.includes('n')) newH = Math.max(minH, startH - dy);
                const next = { w: newW, h: newH };
                setSize(next);
                sizeRef.current = next;
            };

            const onUp = () => {
                resizing.current = false;
                document.body.style.userSelect = prevSelect;
                document.removeEventListener('mousemove', onMove, true);
                document.removeEventListener('mouseup',   onUp,   true);
            };

            document.addEventListener('mousemove', onMove, true);
            document.addEventListener('mouseup',   onUp,   true);
        },
    }), [minW, minH]);

    return { size, getResizeHandleProps };
}
