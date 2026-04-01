import { useState, useRef, useCallback } from 'react';

/**
 * useDraggable — drag-to-move hook for modals and panels.
 *
 * Usage:
 *   const { dragHandleProps, dragContainerStyle, DragHandle } = useDraggable(title);
 *
 *   // Apply dragContainerStyle to the modal container div:
 *   <div className="modal" style={{ ...dragContainerStyle, maxWidth: '860px' }}>
 *
 *   // Replace the existing h2 with the DragHandle component:
 *   <DragHandle />   ← renders a styled header bar that is the drag target
 *
 *   // OR if you need to keep your own h2 layout, spread dragHandleProps:
 *   <h2 {...dragHandleProps} style={{ ...dragHandleProps.style }}>...</h2>
 *
 * Uses position:relative + left/top on the modal container.
 * This works regardless of any CSS class transform/animation on .modal.
 */
export function useDraggable() {
    const [pos, setPos] = useState({ x: 0, y: 0 });
    const state = useRef({ dragging: false, startMouse: { x: 0, y: 0 }, startPos: { x: 0, y: 0 } });

    const onMouseDown = useCallback((e) => {
        if (e.button !== 0) return;
        // Allow clicks on interactive elements to pass through without starting drag
        if (e.target.closest('button, input, select, textarea, a, [role="button"]')) return;

        e.preventDefault();
        state.current.dragging = true;
        state.current.startMouse = { x: e.clientX, y: e.clientY };
        state.current.startPos = { x: pos.x, y: pos.y };

        const onMove = (ev) => {
            if (!state.current.dragging) return;
            setPos({
                x: state.current.startPos.x + ev.clientX - state.current.startMouse.x,
                y: state.current.startPos.y + ev.clientY - state.current.startMouse.y,
            });
        };
        const onUp = () => {
            state.current.dragging = false;
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    }, [pos.x, pos.y]);

    // Use position:relative + left/top — works regardless of .modal CSS class transforms
    const dragContainerStyle = {
        position: 'relative',
        left: pos.x,
        top: pos.y,
    };

    const dragHandleProps = {
        onMouseDown,
        style: {
            cursor: pos.x === 0 && pos.y === 0 ? 'grab' : 'grabbing',
            userSelect: 'none',
        },
    };

    // Keep dragOffsetStyle as an alias so existing modals (AccountModal etc.) 
    // that already use it continue to work — now uses left/top instead of transform
    const dragOffsetStyle = dragContainerStyle;

    return { dragHandleProps, dragOffsetStyle, dragContainerStyle };
}
