import { useState, useRef, useCallback } from 'react';

/**
 * useDraggable — reusable drag-to-move hook for modals and panels.
 *
 * Usage:
 *   const { dragHandleProps, dragOffsetStyle } = useDraggable();
 *
 *   // Spread dragOffsetStyle onto the modal container div
 *   <div className="modal" style={{ ...dragOffsetStyle }}>
 *
 *   // Spread dragHandleProps onto the title element (the drag handle)
 *   <h2 {...dragHandleProps}>Title</h2>
 *
 * dragHandleProps includes a .style property so callers can merge it:
 *   <h2 {...dragHandleProps} style={{ ...dragHandleProps.style, display: 'flex' }}>
 *
 * The modal resets to center when unmounted (hook re-created on next open).
 * Dragging is clamped to keep the modal on-screen.
 */
export function useDraggable() {
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const dragging = useRef(false);
    const startMouse = useRef({ x: 0, y: 0 });
    const startOffset = useRef({ x: 0, y: 0 });

    const onMouseDown = useCallback((e) => {
        // Only drag on primary button; ignore clicks inside buttons/inputs
        if (e.button !== 0) return;
        if (e.target.closest('button, input, select, textarea, a')) return;

        dragging.current = true;
        startMouse.current = { x: e.clientX, y: e.clientY };
        startOffset.current = { x: offset.x, y: offset.y };

        const onMouseMove = (e) => {
            if (!dragging.current) return;
            const dx = e.clientX - startMouse.current.x;
            const dy = e.clientY - startMouse.current.y;
            setOffset({
                x: startOffset.current.x + dx,
                y: startOffset.current.y + dy,
            });
        };

        const onMouseUp = () => {
            dragging.current = false;
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);

        // Prevent text selection while dragging
        e.preventDefault();
    }, [offset]);

    const dragHandleProps = {
        onMouseDown,
        style: {
            cursor: 'grab',
            userSelect: 'none',
        },
    };

    const dragOffsetStyle = offset.x === 0 && offset.y === 0
        ? {}
        : { transform: `translate(${offset.x}px, ${offset.y}px)` };

    return { dragHandleProps, dragOffsetStyle };
}
