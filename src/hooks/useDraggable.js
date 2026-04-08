import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * useDraggable — drag-to-move hook for modals and panels.
 *
 * KEY DESIGN DECISIONS for cross-screen (ultrawide) dragging:
 *
 * 1. Modal is position:fixed with explicit left/top — never inside a flex overlay.
 * 2. The backdrop overlay is ALWAYS pointer-events:none so the mouse can leave
 *    the browser window without losing the drag. The click-outside-to-close is
 *    handled by a separate transparent capture div that is only active when NOT dragging.
 * 3. mousemove/mouseup listeners are on `document` at the capture phase so they
 *    fire even when the cursor exits the browser chrome.
 * 4. We set document.body.style.userSelect = 'none' during drag to prevent
 *    text selection across iframes and other app surfaces.
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

    // Centre on first paint
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

    // Overlay is purely visual — pointer-events:none so mouse always passes through
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

    const dragOffsetStyle = dragContainerStyle;

    return { dragHandleProps, dragOffsetStyle, dragContainerStyle, overlayStyle, bringToFront, containerRef };
}


/**
 * useResizable — 8-direction resize (n, ne, e, se, s, sw, w, nw).
 * Uses document capture-phase listeners so resize works across screen boundaries.
 */
export function useResizable(initialW, initialH, minW = 400, minH = 320) {
    const [size, setSize] = useState({ w: initialW, h: initialH });
    const resizing     = useRef(false);
    const resizeState  = useRef({});
    const sizeRef      = useRef({ w: initialW, h: initialH });

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


/**
 * ResizeHandles — 8 invisible resize zones around a fixed/relative container.
 * No visual indicator. Cursor changes on hover to show resize direction.
 */
export function ResizeHandles({ getResizeHandleProps }) {
    const E = 6;   // edge handle thickness px
    const C = 16;  // corner handle size px
    const s = (cursor, extra) => ({ position: 'absolute', zIndex: 10, background: 'transparent', cursor, ...extra });
    return (
        <>
            <div {...getResizeHandleProps('nw')} style={s('nw-resize', { top: 0,    left: 0,   width: C, height: C })} />
            <div {...getResizeHandleProps('ne')} style={s('ne-resize', { top: 0,    right: 0,  width: C, height: C })} />
            <div {...getResizeHandleProps('se')} style={s('se-resize', { bottom: 0, right: 0,  width: C, height: C })} />
            <div {...getResizeHandleProps('sw')} style={s('sw-resize', { bottom: 0, left: 0,   width: C, height: C })} />
            <div {...getResizeHandleProps('n')}  style={s('n-resize',  { top: 0,    left: C,   right: C,    height: E })} />
            <div {...getResizeHandleProps('s')}  style={s('s-resize',  { bottom: 0, left: C,   right: C,    height: E })} />
            <div {...getResizeHandleProps('w')}  style={s('w-resize',  { left: 0,   top: C,    bottom: C,   width: E  })} />
            <div {...getResizeHandleProps('e')}  style={s('e-resize',  { right: 0,  top: C,    bottom: C,   width: E  })} />
        </>
    );
}
