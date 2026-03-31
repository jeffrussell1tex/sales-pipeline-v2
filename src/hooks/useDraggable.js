import { useState, useRef, useCallback } from 'react';

/**
 * useDraggable — makes a modal draggable by its h2 title.
 *
 * Usage:
 *   const { dragHandleProps, dragOffsetStyle } = useDraggable();
 *
 *   Spread dragHandleProps on the <h2>:
 *     <h2 {...dragHandleProps}>Edit Opportunity</h2>
 *
 *   Spread dragOffsetStyle on the .modal div (merge with any existing style):
 *     <div className="modal" style={{ ...dragOffsetStyle, maxWidth: '860px' }}>
 *
 * Resets to center each time the modal opens (fresh hook call on mount).
 */
export function useDraggable() {
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const dragging = useRef(false);
    const origin = useRef({ mouseX: 0, mouseY: 0, offX: 0, offY: 0 });

    const onMouseDown = useCallback((e) => {
        if (e.button !== 0) return;
        // Don't steal clicks from interactive children inside the header
        if (e.target.closest('button, input, select, textarea, a, [role="button"]')) return;
        e.preventDefault();
        dragging.current = true;
        origin.current = {
            mouseX: e.clientX,
            mouseY: e.clientY,
            offX: offset.x,
            offY: offset.y,
        };

        const onMouseMove = (ev) => {
            if (!dragging.current) return;
            setOffset({
                x: origin.current.offX + (ev.clientX - origin.current.mouseX),
                y: origin.current.offY + (ev.clientY - origin.current.mouseY),
            });
        };

        const onMouseUp = () => {
            dragging.current = false;
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    }, [offset.x, offset.y]);

    // Spread onto the h2 drag handle
    const dragHandleProps = {
        onMouseDown,
        style: { cursor: 'grab', userSelect: 'none' },
    };

    // Spread onto the .modal div — nudges it within the flex-centered overlay
    const dragOffsetStyle = {
        position: 'relative',
        marginLeft: offset.x,
        marginTop: offset.y,
    };

    return { dragHandleProps, dragOffsetStyle };
}
