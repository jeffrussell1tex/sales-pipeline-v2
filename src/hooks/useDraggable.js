import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * useDraggable — drag-to-move hook for modals and panels.
 *
 * Works identically on desktop (mouse) and mobile (touch).
 *
 * Desktop: mousemove/mouseup on document capture phase.
 * Mobile:  touchmove/touchend on document, using touches[0].
 *
 * Scroll vs drag conflict:
 * - Drag only fires from the drag handle element (the dark header bar).
 * - Scroll fires from the body div.
 * - They are on different elements so they never conflict.
 * - The non-passive touchmove listener on the container blocks scroll
 *   bleed-through to the page behind, but only when the touch target
 *   is NOT inside a scrollable child that still has scroll room.
 *
 * Panels start centred and can be freely moved and resized on both
 * desktop and mobile. A snap-back clamp on drag-end keeps at least
 * MARGIN px of the panel header visible on screen.
 */

let _globalZ = 10000;
function nextZ() { _globalZ = Math.min(_globalZ + 1, 10250); return _globalZ; }

function isMobileViewport() {
    return window.innerWidth <= 640;
}

export function useDraggable({ transparent = false } = {}) {
    const [pos, setPos]               = useState(null);
    const [zIndex, setZIndex]         = useState(10000);
    const [isDragging, setIsDragging] = useState(false);
    const [mobile, setMobile]         = useState(() => isMobileViewport());
    const dragging     = useRef(false);
    const dragState    = useRef({ startClient: { x: 0, y: 0 }, startPos: { x: 0, y: 0 } });
    const containerRef = useRef(null);
    const posRef       = useRef(null);

    // Track viewport resize (e.g. device rotation)
    useEffect(() => {
        const onResize = () => setMobile(isMobileViewport());
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    // Prevent background page scrolling when touching inside the panel.
    // Non-passive so preventDefault() is honoured on iOS/Android.
    // Allows scroll only when touch target is inside a scrollable child
    // that still has room to scroll in the touch direction.
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        const onTouchMove = (e) => {
            // If a drag is in progress from the handle, always block page scroll
            if (dragging.current) { e.preventDefault(); return; }

            let node = e.target;
            while (node && node !== el) {
                const style    = window.getComputedStyle(node);
                const overflow = style.overflowY;
                if (overflow === 'auto' || overflow === 'scroll') {
                    const atTop    = node.scrollTop === 0;
                    const atBottom = node.scrollTop + node.clientHeight >= node.scrollHeight - 1;
                    const delta    = e.touches[0].clientY - (node._touchStartY || e.touches[0].clientY);
                    const goingDown = delta < 0;
                    const goingUp   = delta > 0;
                    if ((goingDown && !atBottom) || (goingUp && !atTop)) return;
                }
                node = node.parentNode;
            }
            e.preventDefault();
        };

        const onTouchStart = (e) => {
            let node = e.target;
            while (node && node !== el) {
                const style = window.getComputedStyle(node);
                if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
                    node._touchStartY = e.touches[0].clientY;
                }
                node = node.parentNode;
            }
        };

        el.addEventListener('touchmove',  onTouchMove,  { passive: false });
        el.addEventListener('touchstart', onTouchStart, { passive: true  });
        return () => {
            el.removeEventListener('touchmove',  onTouchMove);
            el.removeEventListener('touchstart', onTouchStart);
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => { posRef.current = pos; }, [pos]);

    // Centre on first paint via rAF measurement.
    // On mobile, clamp initial size so panel fits within viewport.
    useEffect(() => {
        if (pos !== null) return;
        const id = requestAnimationFrame(() => {
            const el = containerRef.current;
            if (el) {
                const rect = el.getBoundingClientRect();
                const vw = window.innerWidth;
                const vh = window.innerHeight;
                const w  = Math.min(rect.width,  vw - 16);
                const h  = Math.min(rect.height, vh - 16);
                const x  = Math.round((vw - w) / 2);
                const y  = Math.round((vh - h) / 2);
                setPos({ x, y });
                posRef.current = { x, y };
            } else {
                const fallback = {
                    x: Math.max(8, Math.round(window.innerWidth  * 0.5 - 300)),
                    y: Math.max(8, Math.round(window.innerHeight * 0.5 - 240)),
                };
                setPos(fallback);
                posRef.current = fallback;
            }
        });
        return () => cancelAnimationFrame(id);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const bringToFront = useCallback(() => setZIndex(nextZ()), []);

    // ── Shared drag logic ────────────────────────────────────────────────────
    const startDrag = useCallback((clientX, clientY) => {
        bringToFront();
        const cur = posRef.current || { x: 0, y: 0 };
        dragging.current = true;
        setIsDragging(true);
        dragState.current = {
            startClient: { x: clientX, y: clientY },
            startPos:    { x: cur.x,   y: cur.y   },
        };
        document.body.style.userSelect = 'none';
    }, [bringToFront]);

    const moveDrag = useCallback((clientX, clientY) => {
        if (!dragging.current) return;
        const nx = dragState.current.startPos.x + clientX - dragState.current.startClient.x;
        const ny = dragState.current.startPos.y + clientY - dragState.current.startClient.y;
        setPos({ x: nx, y: ny });
        posRef.current = { x: nx, y: ny };
    }, []);

    const endDrag = useCallback(() => {
        if (!dragging.current) return;
        dragging.current = false;
        setIsDragging(false);
        document.body.style.userSelect = '';

        // Snap back so at least MARGIN px of the header remains on-screen
        setPos(current => {
            if (!current) return current;
            const el     = containerRef.current;
            const W      = el ? el.offsetWidth  : 400;
            const H      = el ? el.offsetHeight : 300;
            const vw     = window.innerWidth;
            const vh     = window.innerHeight;
            const MARGIN = 60;
            let { x, y } = current;
            x = Math.min(x, vw - MARGIN);
            x = Math.max(x, MARGIN - W);
            y = Math.min(y, vh - MARGIN);
            y = Math.max(y, 0);
            return { x, y };
        });
    }, []);

    // ── Mouse drag ───────────────────────────────────────────────────────────
    const onMouseDown = useCallback((e) => {
        if (e.button !== 0) return;
        if (e.target.closest('button, input, select, textarea, a, [role="button"]')) return;
        e.preventDefault();
        startDrag(e.clientX, e.clientY);

        const onMove = (ev) => moveDrag(ev.clientX, ev.clientY);
        const onUp   = () => {
            endDrag();
            document.removeEventListener('mousemove', onMove, true);
            document.removeEventListener('mouseup',   onUp,   true);
        };
        document.addEventListener('mousemove', onMove, true);
        document.addEventListener('mouseup',   onUp,   true);
    }, [startDrag, moveDrag, endDrag]);

    // ── Touch drag ───────────────────────────────────────────────────────────
    const onTouchStart = useCallback((e) => {
        if (e.target.closest('button, input, select, textarea, a, [role="button"]')) return;
        if (e.touches.length !== 1) return;
        e.preventDefault(); // Prevent page scroll while dragging handle
        startDrag(e.touches[0].clientX, e.touches[0].clientY);

        const onMove = (ev) => {
            if (ev.touches.length !== 1) return;
            moveDrag(ev.touches[0].clientX, ev.touches[0].clientY);
        };
        const onEnd = () => {
            endDrag();
            document.removeEventListener('touchmove',   onMove, true);
            document.removeEventListener('touchend',    onEnd,  true);
            document.removeEventListener('touchcancel', onEnd,  true);
        };
        document.addEventListener('touchmove',   onMove, { passive: false, capture: true });
        document.addEventListener('touchend',    onEnd,  true);
        document.addEventListener('touchcancel', onEnd,  true);
    }, [startDrag, moveDrag, endDrag]);

    // ── Style objects ────────────────────────────────────────────────────────
    const MOBILE_Z = 600; // Above bottom nav bar (z-index 500)

    const dragContainerStyle = pos === null
        ? { position: 'fixed', visibility: 'hidden', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', zIndex: mobile ? MOBILE_Z : zIndex }
        : { position: 'fixed', left: pos.x, top: pos.y, transform: 'none', margin: 0, zIndex: mobile ? MOBILE_Z : zIndex };

    const overlayStyle = {
        position:      'fixed',
        inset:         0,
        background:    transparent ? 'transparent' : 'rgba(0,0,0,0.45)',
        zIndex:        mobile ? MOBILE_Z - 1 : zIndex - 1,
        pointerEvents: 'none',
        transition:    'background 200ms',
    };

    const clickCatcherStyle = {
        position:      'fixed',
        inset:         0,
        zIndex:        mobile ? MOBILE_Z - 1 : zIndex - 1,
        background:    'transparent',
        pointerEvents: isDragging || transparent ? 'none' : 'auto',
    };

    const dragHandleProps = {
        onMouseDown,
        onTouchStart,
        onClick: bringToFront,
        style: {
            cursor:      isDragging ? 'grabbing' : 'grab',
            userSelect:  'none',
            touchAction: 'none', // Tell browser we're handling touch ourselves
        },
    };

    const dragOffsetStyle = dragContainerStyle;

    return {
        dragHandleProps,
        dragOffsetStyle,
        dragContainerStyle,
        overlayStyle,
        clickCatcherStyle,
        isDragging,
        isMobile: mobile,
        bringToFront,
        containerRef,
    };
}


/**
 * useResizable — 4-corner resize via mouse and touch.
 * Document capture-phase listeners work across screen boundaries.
 */
export function useResizable(initialW, initialH, minW = 400, minH = 320) {
    const [size, setSize] = useState({ w: initialW, h: initialH });
    const resizing    = useRef(false);
    const resizeState = useRef({});
    const sizeRef     = useRef({ w: initialW, h: initialH });

    useEffect(() => { sizeRef.current = size; }, [size]);

    // ── Shared resize logic ──────────────────────────────────────────────────
    const startResize = (direction, clientX, clientY) => {
        if (resizing.current) return;
        resizing.current = true;
        document.body.style.userSelect = 'none';
        resizeState.current = {
            direction,
            startX: clientX,
            startY: clientY,
            startW: sizeRef.current.w,
            startH: sizeRef.current.h,
        };
    };

    const doResize = (clientX, clientY) => {
        if (!resizing.current) return;
        const { direction: dir, startX, startY, startW, startH } = resizeState.current;
        const dx = clientX - startX;
        const dy = clientY - startY;
        let newW = startW;
        let newH = startH;
        if (dir.includes('e')) newW = Math.max(minW, startW + dx);
        if (dir.includes('w')) newW = Math.max(minW, startW - dx);
        if (dir.includes('s')) newH = Math.max(minH, startH + dy);
        if (dir.includes('n')) newH = Math.max(minH, startH - dy);
        // Clamp to viewport
        newW = Math.min(newW, window.innerWidth  - 8);
        newH = Math.min(newH, window.innerHeight - 8);
        const next = { w: newW, h: newH };
        setSize(next);
        sizeRef.current = next;
    };

    const endResize = () => {
        resizing.current = false;
        document.body.style.userSelect = '';
    };

    const getResizeHandleProps = useCallback((direction) => ({
        // ── Mouse ──
        onMouseDown: (e) => {
            e.preventDefault();
            e.stopPropagation();
            startResize(direction, e.clientX, e.clientY);

            const onMove = (ev) => doResize(ev.clientX, ev.clientY);
            const onUp   = () => {
                endResize();
                document.removeEventListener('mousemove', onMove, true);
                document.removeEventListener('mouseup',   onUp,   true);
            };
            document.addEventListener('mousemove', onMove, true);
            document.addEventListener('mouseup',   onUp,   true);
        },
        // ── Touch ──
        onTouchStart: (e) => {
            if (e.touches.length !== 1) return;
            e.preventDefault();
            e.stopPropagation();
            startResize(direction, e.touches[0].clientX, e.touches[0].clientY);

            const onMove = (ev) => {
                if (ev.touches.length !== 1) return;
                doResize(ev.touches[0].clientX, ev.touches[0].clientY);
            };
            const onEnd = () => {
                endResize();
                document.removeEventListener('touchmove',   onMove, true);
                document.removeEventListener('touchend',    onEnd,  true);
                document.removeEventListener('touchcancel', onEnd,  true);
            };
            document.addEventListener('touchmove',   onMove, { passive: false, capture: true });
            document.addEventListener('touchend',    onEnd,  true);
            document.addEventListener('touchcancel', onEnd,  true);
        },
        style: { touchAction: 'none' },
    }), [minW, minH]); // eslint-disable-line react-hooks/exhaustive-deps

    return { size, getResizeHandleProps };
}
