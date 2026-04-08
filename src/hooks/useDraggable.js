import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * useDraggable — drag-to-move hook for modals and panels.
 *
 * Cross-screen dragging on ultrawide setups:
 * - Modal is position:fixed with explicit left/top.
 * - Overlay is pointer-events:none always (visual only).
 * - Click-outside handled by a separate transparent pointer-events:auto sibling div.
 * - mousemove/mouseup on document capture phase — fires even outside browser window.
 * - userSelect:none on body during drag prevents text selection glitches.
 */

let _globalZ = 10000;
function nextZ() { return ++_globalZ; }

export function useDraggable() {
    const [pos, setPos]       = useState(null);
    const [zIndex, setZIndex] = useState(10000);
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

        const onUp = () => {
            dragging.current = false;
            document.body.style.userSelect = prevSelect;
            document.removeEventListener('mousemove', onMove, true);
            document.removeEventListener('mouseup',   onUp,   true);
        };

        document.addEventListener('mousemove', onMove, true);
        document.addEventListener('mouseup',   onUp,   true);
    }, [bringToFront]);

    const dragContainerStyle = pos === null
        ? { position: 'fixed', visibility: 'hidden', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', zIndex }
        : { position: 'fixed', left: pos.x, top: pos.y, transform: 'none', margin: 0, zIndex };

    // Purely visual — never blocks mouse events
    const overlayStyle = {
        position:      'fixed',
        inset:         0,
        background:    'rgba(0,0,0,0.35)',
        zIndex:        zIndex - 1,
        pointerEvents: 'none',
    };

    const dragHandleProps = {
        onMouseDown,
        onClick: bringToFront,
        style: { cursor: 'grab', userSelect: 'none' },
    };

    // Back-compat alias
    const dragOffsetStyle = dragContainerStyle;

    return { dragHandleProps, dragOffsetStyle, dragContainerStyle, overlayStyle, bringToFront, containerRef };
}


/**
 * useResizable — 8-direction resize (n, ne, e, se, s, sw, w, nw).
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
