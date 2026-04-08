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

    return (
        <>
            <div {...getResizeHandleProps('nw')} style={s('nw-resize', { top: 0,    left: 0  })} />
            <div {...getResizeHandleProps('ne')} style={s('ne-resize', { top: 0,    right: 0 })} />
            <div {...getResizeHandleProps('se')} style={s('se-resize', { bottom: 0, right: 0 })} />
            <div {...getResizeHandleProps('sw')} style={s('sw-resize', { bottom: 0, left: 0  })} />
        </>
    );
}
