import React from 'react';

/**
 * ResizeHandles — 4 invisible corner resize zones.
 * No visual indicator. Cursor changes on hover to show resize direction.
 * Parent container must have position:fixed or position:relative.
 */
export default function ResizeHandles({ getResizeHandleProps }) {
    const C = 20; // corner hitzone size px — generous for easy grabbing

    const s = (cursor, extra) => ({
        position:   'absolute',
        zIndex:     10,
        background: 'transparent',
        cursor,
        width:  C,
        height: C,
        ...extra,
    });

    // A zone's props: the hook's, its style kept under the zone's. The hook's style is `touchAction: 'none'`: without
    // it, a touch on a handle in a scroller (the New User window's) pans the scroller as it resizes (state §0.213).
    const zone = (dir, cursor, extra) => { const p = getResizeHandleProps(dir); return { ...p, style: { ...p.style, ...s(cursor, extra) } }; };

    return (
        <>
            <div {...zone('nw', 'nw-resize', { top: 0,    left: 0  })} />
            <div {...zone('ne', 'ne-resize', { top: 0,    right: 0 })} />
            <div {...zone('se', 'se-resize', { bottom: 0, right: 0 })} />
            <div {...zone('sw', 'sw-resize', { bottom: 0, left: 0  })} />
        </>
    );
}
